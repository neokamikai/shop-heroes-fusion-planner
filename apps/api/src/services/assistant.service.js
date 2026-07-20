const { env } = require('../config/env');
const { ApiError } = require('../errors/api-error');

const MAX_USER_FACING_QUALITY_INDEX = 6;

class AssistantService {
  async generateResponse({
    account,
    snapshot,
    prompt,
    localSessionDescriptor = null,
    localPlannerOverview = null,
    localFullSnapshot = null,
    localHeroesSnapshot = [],
    signal = null,
    analysis = null
  }) {
    if (!env.llmBaseUrl || !env.llmModel) {
      throw new ApiError(
        503,
        'LLM backend is not configured yet. Define LLM_BASE_URL and LLM_MODEL to use the assistant.',
        'llm_not_configured'
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    const detachAbortForwarder = this.forwardAbortSignal(signal, controller);
    const resolvedAnalysis = analysis || this.analyzePrompt({
      prompt,
      snapshot,
      localPlannerOverview
    });
    const assistantContext = this.buildAssistantContext({
      prompt,
      account,
      snapshot,
      localSessionDescriptor,
      localPlannerOverview,
      localFullSnapshot,
      localHeroesSnapshot,
      analysis: resolvedAnalysis
    });
    const deterministicResponse = this.buildDeterministicResponse({
      prompt,
      context: assistantContext
    });

    if (deterministicResponse) {
      clearTimeout(timeoutId);
      detachAbortForwarder();

      return {
        model: 'deterministic-planner-rules',
        content: deterministicResponse
      };
    }

    let response;
    try {
      response = await fetch(`${env.llmBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(env.llmApiKey ? { Authorization: `Bearer ${env.llmApiKey}` } : {})
        },
        body: JSON.stringify({
          model: env.llmModel,
          temperature: env.llmTemperature,
          messages: [
            {
              role: 'system',
              content: [
                'You are the Shop Heroes Planner assistant.',
                'Answer in a pragmatic and concise way.',
                'Use only the supplied planner account data and local game context.',
                'If context is missing, say what is missing instead of inventing facts.',
                'Focus on actionable planning guidance for Shop Heroes.',
                'Prefer grounded reasoning over generic advice.',
                'When the question is about a specific hero or item, stay tightly scoped to that target.',
                'Do not invent game systems, item upgrades, consumables, durability potions, enhancement systems, or mechanics that are not explicitly present in the provided context.',
                'If the provided context does not include candidate replacement items or a proven game mechanic, say that directly.',
                'Never suggest using or consuming an item unless the provided context explicitly supports that mechanic.',
                'When answering planning questions, separate verified facts from limitations or unknowns.'
              ].join(' ')
            },
            {
              role: 'user',
              content: JSON.stringify(assistantContext, null, 2)
            }
          ]
        })
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new ApiError(
          504,
          'LLM backend timed out while generating the assistant response.',
          'llm_request_timeout'
        );
      }

        throw error;
    } finally {
      clearTimeout(timeoutId);
      detachAbortForwarder();
    }

    if (!response.ok) {
      const errorBody = await this.safeReadJson(response);
      throw new ApiError(
        502,
        errorBody?.error?.message
        || errorBody?.message
        || `LLM backend returned status ${response.status}.`,
        'llm_request_failed'
      );
    }

    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;

    if (!content) {
      throw new ApiError(502, 'LLM backend returned an empty response.', 'llm_empty_response');
    }

    return {
      model: payload?.model || env.llmModel,
      content
    };
  }

  analyzePrompt({
    prompt,
    snapshot = null,
    localPlannerOverview = null
  }) {
    const normalizedPrompt = String(prompt || '').trim();
    const lowerPrompt = normalizedPrompt.toLowerCase();
    const heroName = this.inferHeroName({
      prompt: normalizedPrompt,
      snapshot,
      localPlannerOverview
    });
    const itemName = this.inferItemNameFromPrompt(normalizedPrompt);
    const needsItemUsabilityReview = /\bquem pode usar\b|\bwho can use\b|\bquais? (?:herois|heroes|personagens).*\busar\b|\bpode usar\b|\bpodem usar\b/.test(lowerPrompt);
    const needsEquipmentReview = /\bequip|\bgear|\bbreak chance|\bbroken|\bweapon|\barmor|\barmour|\bitem|\bequipamento|\bequipar|\bquebra|\barmadura|\barma/.test(lowerPrompt);
    const needsBreakChanceReview = /\bbreak chance\b|\bchance de quebra\b|\bquebra em 0\b|\bquebra 0\b|\b0%\b|\bzero\b/.test(lowerPrompt);
    const planSteps = [
      'Understand the player request and determine the target scope.',
      'Load the planner account snapshot.',
      localPlannerOverview
        ? 'Use the available local live session overview as supporting context.'
        : 'Proceed without local live session support if none is available.',
      needsItemUsabilityReview
        ? `Resolve which heroes can use ${itemName || 'the requested item'}.`
        : heroName
        ? `Inspect focused information for ${heroName}.`
        : 'Inspect the most relevant entities for the question.',
      'Cross-check the findings and draft the final answer.'
    ];

    if (heroName && needsBreakChanceReview) {
      planSteps.splice(3, 0, `Review break chance implications for ${heroName}'s current equipment.`);
    }

    return {
      heroName,
      itemName,
      needsEquipmentReview,
      needsBreakChanceReview,
      needsItemUsabilityReview,
      goalType: needsBreakChanceReview ? 'zero_break_chance' : 'general_equipment_review',
      requestType: needsItemUsabilityReview
        ? 'item_usability_review'
        : heroName && needsEquipmentReview ? 'hero_equipment_review' : 'general_planner_question',
      planSteps,
      summary: needsItemUsabilityReview
        ? `This run will identify which heroes can use ${itemName || 'the requested item'} from the live item/proficiency data.`
        : heroName
        ? `This run will focus on ${heroName}${needsBreakChanceReview ? ' and check the break chance implications of the equipped gear.' : ' and review the most relevant account and live-session context.'}`
        : 'This run will review the relevant planner and live-session context for the question before answering.'
    };
  }

  async safeReadJson(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  buildAssistantContext({
    prompt,
    account,
    snapshot,
    localSessionDescriptor,
    localPlannerOverview,
    localFullSnapshot = null,
    localHeroesSnapshot = [],
    analysis = null
  }) {
    const resolvedAnalysis = analysis || this.analyzePrompt({
      prompt,
      snapshot,
      localPlannerOverview
    });
    const unlockedCharacters = (snapshot?.characters || [])
      .filter((character) => character.isUnlocked)
      .map((character) => ({
        name: character.characterName,
        level: character.level
      }))
      .slice(0, 12);

    const plannedTargets = (snapshot?.planner?.targets || [])
      .map((target) => ({
        characterName: target.characterName,
        itemName: target.itemName,
        targetTierName: target.targetTierName,
        quantity: target.quantity,
        priority: target.priority,
        isCompleted: target.isCompleted
      }))
      .slice(0, 20);

    const activeCrafts = (snapshot?.planner?.crafts || [])
      .map((craft) => ({
        itemName: craft.itemName,
        baseTierName: craft.baseTierName,
        plannedTargetTierName: craft.plannedTargetTierName,
        source: craft.source
      }))
      .slice(0, 20);

    const activeFusions = (snapshot?.planner?.fusions || [])
      .map((fusion) => ({
        itemName: fusion.itemName,
        fromTierName: fusion.fromTierName,
        toTierName: fusion.toTierName
      }))
      .slice(0, 20);

    const inventoryHighlights = (snapshot?.inventory || [])
      .filter((entry) => entry.quantity > 0)
      .sort((left, right) => right.quantity - left.quantity)
      .slice(0, 20)
      .map((entry) => ({
        itemName: entry.itemName,
        tierName: entry.tierName,
        quantity: entry.quantity
      }));

    const localOverviewSummary = localPlannerOverview
      ? {
          timestamp: localPlannerOverview.timestamp,
          summary: localPlannerOverview.summary,
          recommendations: Array.isArray(localPlannerOverview.recommendations)
            ? localPlannerOverview.recommendations.slice(0, 8)
            : []
        }
      : null;
    const focusedHeroReview = this.buildFocusedHeroReview({
      analysis: resolvedAnalysis,
      snapshot,
      localFullSnapshot,
      localHeroesSnapshot
    });
    const itemUsabilityReview = this.buildItemUsabilityReview({
      analysis: resolvedAnalysis,
      localFullSnapshot,
      localHeroesSnapshot
    });
    const investigationPlan = this.buildInvestigationPlan({
      analysis: resolvedAnalysis,
      snapshot,
      localFullSnapshot,
      focusedHeroReview,
      itemUsabilityReview
    });

    return {
      assistantRules: {
        mustStayGroundedInProvidedContext: true,
        mustNotInventGameMechanics: true,
        ifReplacementCandidatesAreMissing: 'Say that specific replacement candidates are not available in the current context.',
        preferredAnswerShape: [
          'current verified state',
          'gaps blocking the target',
          'safe next planning step',
          'unknowns or missing data'
        ]
      },
      prompt,
      account: {
        id: account.id,
        name: account.name,
        platform: account.platform,
        notes: account.notes
      },
      plannerSummary: {
        settings: (snapshot?.settings || []).map((setting) => ({
          key: setting.key,
          value: setting.settingValue
        })),
        counts: {
          totalCharacters: snapshot?.characters?.length || 0,
          unlockedCharacters: unlockedCharacters.length,
          itemStates: snapshot?.itemStates?.length || 0,
          inventoryStacks: snapshot?.inventory?.length || 0,
          targets: snapshot?.planner?.targets?.length || 0,
          activeCrafts: snapshot?.planner?.crafts?.length || 0,
          activeFusions: snapshot?.planner?.fusions?.length || 0
        },
        unlockedCharacters,
        plannedTargets,
        activeCrafts,
        activeFusions,
        inventoryHighlights
      },
      requestAnalysis: resolvedAnalysis,
      investigationPlan,
      focusedHeroReview,
      itemUsabilityReview,
      localLiveSnapshotSummary: localFullSnapshot
        ? {
            craftableItems: Array.isArray(localFullSnapshot.craftableItems) ? localFullSnapshot.craftableItems.length : 0,
            inventoryItems: Array.isArray(localFullSnapshot.inventoryItems) ? localFullSnapshot.inventoryItems.length : 0,
            breakChanceRows: Array.isArray(localFullSnapshot.breakChanceReference?.rows) ? localFullSnapshot.breakChanceReference.rows.length : 0
          }
        : null,
      localSessionDescriptor: localSessionDescriptor
        ? {
            account: {
              displayName: localSessionDescriptor.account?.displayName,
              externalId: localSessionDescriptor.account?.externalId
            },
            installation: localSessionDescriptor.installation,
            runtime: localSessionDescriptor.runtime,
            isAuthenticated: localSessionDescriptor.isAuthenticated,
            snapshotReady: localSessionDescriptor.snapshotReady
          }
        : null,
      localPlannerOverview: localOverviewSummary
    };
  }

  buildDeterministicResponse({
    prompt,
    context
  }) {
    const analysis = context?.requestAnalysis;
    const focusedHeroReview = context?.focusedHeroReview;
    const itemUsabilityReview = context?.itemUsabilityReview;

    if (analysis?.requestType === 'item_usability_review') {
      return this.buildItemUsabilityResponse({
        analysis,
        itemUsabilityReview,
        investigationPlan: context?.investigationPlan
      });
    }

    if (!analysis?.heroName || analysis?.requestType !== 'hero_equipment_review' || !analysis?.needsBreakChanceReview) {
      return '';
    }

    if (!focusedHeroReview?.liveHero) {
      return [
        `Nao consegui confirmar o estado atual do ${analysis.heroName} no jogo porque o snapshot local do heroi nao estava disponivel.`,
        'Consigo usar o planner salvo, mas para revisar chance de quebra em 0% eu preciso do estado live com os equips atuais.'
      ].join('\n\n');
    }

    const equipmentSummary = focusedHeroReview.equipmentSummary;
    const equippedItems = Array.isArray(focusedHeroReview.equippedItems) ? focusedHeroReview.equippedItems : [];
    const orderedEquippedItems = this.sortEquippedItemsForDisplay(equippedItems);
    const nonZeroBreakChanceItems = orderedEquippedItems.filter((item) => Number(item.breakChance) > 0);
    const brokenItems = orderedEquippedItems.filter((item) => item.broken);
    const unusableItems = orderedEquippedItems.filter((item) => !item.canUse);
    const ownedInventoryCandidateRecommendations = this.buildOwnedInventoryRecommendations({
      equippedItems: orderedEquippedItems,
      focusedHeroReview
    });
    const craftableCandidateRecommendations = this.buildCraftableReplacementRecommendations({
      equippedItems: orderedEquippedItems,
      focusedHeroReview
    });
    const prioritizedIssues = [...nonZeroBreakChanceItems].sort((left, right) => {
      return Number(right.breakChance) - Number(left.breakChance);
    });
    const ownedRecommendationKeys = new Set(
      ownedInventoryCandidateRecommendations.map((candidate) => `${this.normalizeSlotKey(candidate.slot)}:${String(candidate.candidateItemName || '').trim().toLowerCase()}`)
    );
    const notAlreadyOwnedCraftableRecommendations = craftableCandidateRecommendations.filter((candidate) => {
      const key = `${this.normalizeSlotKey(candidate.slot)}:${String(candidate.candidateItemName || '').trim().toLowerCase()}`;
      return !ownedRecommendationKeys.has(key);
    });
    const zeroAchievingCraftableRecommendations = notAlreadyOwnedCraftableRecommendations.filter((candidate) => candidate.meetsConservativeZeroRule);
    const partialCraftableRecommendations = notAlreadyOwnedCraftableRecommendations.filter((candidate) => !candidate.meetsConservativeZeroRule);
    const investigationPlan = context?.investigationPlan;
    const lines = [];

    lines.push(`Estado atual verificado do ${analysis.heroName}: nivel ${focusedHeroReview.liveHero.level}, classe ${this.formatHeroClassLabel(focusedHeroReview.liveHero.heroClass)}, ${equippedItems.length} item(ns) equipado(s).`);

    if (equipmentSummary?.allBreakChanceZero) {
      lines.push('No snapshot atual, todas as pecas equipadas estao com chance de quebra em 0%.');
    } else {
      lines.push(`No snapshot atual, o alvo de chance de quebra 0% ainda nao foi atingido. ${equipmentSummary?.nonZeroBreakChanceCount || nonZeroBreakChanceItems.length} peca(s) equipada(s) ainda estao com break chance acima de 0.`);
    }

    if (nonZeroBreakChanceItems.length > 0) {
      lines.push(`Pecas que ainda bloqueiam o alvo: ${nonZeroBreakChanceItems.map((item) => `${this.formatSlotLabel(item.slot)}: ${item.name} (${this.formatBreakChancePercent(item.breakChance)})`).join('; ')}.`);
    }

    if (prioritizedIssues.length > 0) {
      lines.push(`Ordem de ataque sugerida pelo impacto atual de quebra: ${prioritizedIssues.map((item, index) => `${index + 1}. ${this.formatSlotLabel(item.slot)} com ${item.name} (${this.formatBreakChancePercent(item.breakChance)})`).join('; ')}.`);
    }

    if (orderedEquippedItems.length > 0) {
      lines.push(`Leitura no formato da tela do jogo: ${orderedEquippedItems.map((item) => `${this.formatSlotLabel(item.slot)}: ${item.name} (${this.formatBreakChancePercent(item.breakChance)})`).join('; ')}.`);
    }

    if (brokenItems.length > 0) {
      lines.push(`Tambem existem pecas quebradas: ${brokenItems.map((item) => `${this.formatSlotLabel(item.slot)}: ${item.name}`).join('; ')}.`);
    }

    if (unusableItems.length > 0) {
      lines.push(`Existem pecas equipadas que o heroi nao deveria usar: ${unusableItems.map((item) => `${this.formatSlotLabel(item.slot)}: ${item.name}`).join('; ')}.`);
    }

    if (ownedInventoryCandidateRecommendations.length > 0) {
      lines.push(`Melhores alternativas reais ja possuidas no inventario da loja: ${ownedInventoryCandidateRecommendations.map((candidate) => `${this.formatSlotLabel(candidate.slot)}: trocar ${candidate.currentItemName} (${this.formatBreakChancePercent(candidate.currentBreakChance)}) por ${candidate.candidateItemName} Lv. ${candidate.level} em ${candidate.qualityLabel}${candidate.quantity ? ` x${candidate.quantity}` : ''} (${this.formatBreakChancePercent(candidate.candidateBreakChance)} previsto); motivo: ${candidate.decisionSummary}`).join('; ')}.`);
    }

    if (zeroAchievingCraftableRecommendations.length > 0) {
      lines.push(`Melhores alternativas craftaveis na zona segura observada para 0% ou residual muito baixo: ${zeroAchievingCraftableRecommendations.map((candidate) => `${this.formatSlotLabel(candidate.slot)}: craftar ${candidate.candidateItemName} Lv. ${candidate.level} em ${candidate.qualityLabel} no lugar de ${candidate.currentItemName} (${this.formatBreakChancePercent(candidate.currentBreakChance)} atual); motivo: ${candidate.decisionSummary}`).join('; ')}.`);
      lines.push(`Cobertura atual da zona segura observada: ${zeroAchievingCraftableRecommendations.length} de ${nonZeroBreakChanceItems.length} slot(s) bloqueados ja tem candidato craftavel com adequacy estimada boa e qualidade suficiente para mirar 0% ou ficar muito perto disso.`);
      lines.push('Leitura correta desse plano: as sugestoes acima priorizam zerar a chance de quebra com a menor exigencia de qualidade confirmada no jogo; isso nao significa, por si só, melhor poder final, melhor afinidade ou melhor desempenho geral do set.');
    }

    if (zeroAchievingCraftableRecommendations.length === 0 && ownedInventoryCandidateRecommendations.length > 0) {
      lines.push('Como ja existe alternativa possuida no inventario da loja, eu priorizei essa acao antes de sugerir craft adicional para o mesmo slot.');
    }

    if (partialCraftableRecommendations.length > 0) {
      lines.push(`Candidatos craftaveis que ainda ficam fora da zona segura observada e devem ser tratados apenas como reducao de risco: ${partialCraftableRecommendations.map((candidate) => `${this.formatSlotLabel(candidate.slot)}: ${candidate.candidateItemName} Lv. ${candidate.level} em ${candidate.qualityLabel} no lugar de ${candidate.currentItemName} (${this.formatBreakChancePercent(candidate.currentBreakChance)} atual); motivo: ${candidate.decisionSummary}`).join('; ')}.`);
    }

    if (investigationPlan?.completedSteps?.length) {
      lines.push(`O que eu chequei nesta analise: ${investigationPlan.completedSteps.join('; ')}.`);
    }

    if (investigationPlan?.pendingSteps?.length) {
      lines.push(`O que ainda falta para uma recomendacao melhor: ${investigationPlan.pendingSteps.join('; ')}.`);
    }

    if (ownedInventoryCandidateRecommendations.length > 0) {
      lines.push('Proximo passo seguro: testar primeiro a alternativa ja possuida no inventario da loja para o slot indicado; se o jogo confirmar 0%, esse slot deixa de ser prioridade antes de gastar tempo em novo craft.');
    } else if (zeroAchievingCraftableRecommendations.length > 0) {
      lines.push('Proximo passo seguro: priorizar os slots na ordem de impacto e, em cada um deles, buscar primeiro candidatos em Epic ou acima que mantenham adequacy estimada em faixa branca ou amarela forte.');
    } else {
      lines.push('Proximo passo seguro: usar esse diagnostico para revisar apenas os slots que ainda estao com break chance acima de 0 e buscar alternativas reais para esses slots.');
    }

    if (ownedInventoryCandidateRecommendations.length > 0 || craftableCandidateRecommendations.length > 0) {
      lines.push(`Limite atual do assistente: eu consegui apontar alternativas reais para o ${analysis.heroName}, mas ainda nao fechei um ranking completo por custo, tempo de craft, disponibilidade de ingredientes e competicao entre slots pelo mesmo item.`);
    } else {
      lines.push(`Limite atual do assistente: eu ainda nao tenho, neste contexto, uma lista confiavel de candidatos de substituicao ja ranqueados para cada slot do ${analysis.heroName}, entao nao vou inventar upgrades, consumiveis ou mecanicas que o jogo nao confirmou aqui.`);
    }

    if (String(prompt || '').trim()) {
      lines.push('Proximo nivel desejado para o assistente: comparar candidatos reais de equipamento por slot, usando inventario, itens desbloqueados para craft e as regras de break chance por tier/qualidade antes de fechar um veredito.');
    }

    return lines.join('\n\n');
  }

  buildItemUsabilityResponse({
    analysis,
    itemUsabilityReview,
    investigationPlan
  }) {
    const requestedItemName = analysis?.itemName || 'item solicitado';

    if (!itemUsabilityReview?.item) {
      return [
        `Nao consegui localizar "${requestedItemName}" no snapshot live, inventario, itens craftaveis ou equipamentos atualmente visiveis.`,
        'Sem o item resolvido, eu nao vou inferir quem pode usar apenas pelo nome. O caminho seguro e sincronizar o jogo local e tentar novamente com o nome exibido pelo jogo.'
      ].join('\n\n');
    }

    const item = itemUsabilityReview.item;
    const availableHeroes = itemUsabilityReview.availableHeroes || [];
    const unavailableHeroes = itemUsabilityReview.unavailableHeroes || [];
    const lines = [];

    lines.push(`Item verificado: ${item.name} (${item.itemTypeCode || 'tipo desconhecido'}), Lv. ${item.level || 'desconhecido'}${item.canCraft ? ', craftavel' : ''}${item.totalQuantity ? `, ${item.totalQuantity} no inventario da loja` : ''}.`);

    if (availableHeroes.length > 0) {
      lines.push(`Podem usar agora, pelo snapshot live: ${availableHeroes.map((hero) => `${hero.name} Lv. ${hero.level} (${hero.rank})`).join('; ')}.`);
    } else {
      lines.push('Nao encontrei nenhum heroi disponivel agora com proficiencia confirmada para esse tipo de item.');
    }

    if (unavailableHeroes.length > 0) {
      lines.push(`Tambem parecem compativeis, mas nao estao disponiveis agora: ${unavailableHeroes.map((hero) => `${hero.name} Lv. ${hero.level} (${hero.rank}, ${hero.status})`).join('; ')}.`);
    }

    if (itemUsabilityReview.equippedBy.length > 0) {
      lines.push(`Ja aparece equipado em: ${itemUsabilityReview.equippedBy.map((hero) => `${hero.name} (${this.formatSlotLabel(hero.slot)})`).join('; ')}.`);
    }

    if (investigationPlan?.completedSteps?.length) {
      lines.push(`O que eu chequei nesta analise: ${investigationPlan.completedSteps.join('; ')}.`);
    }

    lines.push('Leitura importante: estou usando a proficiencia/tipo expostos pelo snapshot live como prova de compatibilidade; se o jogo tiver uma restricao especial nao exposta no snapshot, eu prefiro sinalizar isso em vez de inventar regra.');

    return lines.join('\n\n');
  }

  buildItemUsabilityReview({
    analysis,
    localFullSnapshot = null,
    localHeroesSnapshot = []
  }) {
    if (analysis?.requestType !== 'item_usability_review') {
      return null;
    }

    const requestedItemName = String(analysis?.itemName || '').trim();
    const heroes = Array.isArray(localHeroesSnapshot) && localHeroesSnapshot.length > 0
      ? localHeroesSnapshot
      : Array.isArray(localFullSnapshot?.heroes) ? localFullSnapshot.heroes : [];
    const item = this.resolveLiveItemByName({
      itemName: requestedItemName,
      localFullSnapshot,
      heroes
    });

    if (!item) {
      return {
        requestedItemName,
        item: null,
        availableHeroes: [],
        unavailableHeroes: [],
        equippedBy: []
      };
    }

    const itemTypeCode = this.normalizeTypeCode(item.itemTypeCode);
    const compatibleHeroes = heroes
      .map((hero) => {
        const proficiency = (Array.isArray(hero?.proficiencies) ? hero.proficiencies : []).find((entry) => {
          return this.normalizeTypeCode(entry?.itemTypeCode) === itemTypeCode;
        });

        if (!proficiency) {
          return null;
        }

        return {
          name: hero.name,
          level: Number(hero.level) || 0,
          rank: String(proficiency.rank || 'Unknown').trim() || 'Unknown',
          multiplier: Number(proficiency.multiplier) || 0,
          status: this.getLiveHeroAvailabilityStatus(hero),
          isAvailableNow: this.isLiveHeroAvailableNow(hero)
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        const rankDelta = this.scoreProficiencyRank(right.rank) - this.scoreProficiencyRank(left.rank);
        if (rankDelta !== 0) {
          return rankDelta;
        }

        if (Number(left.level) !== Number(right.level)) {
          return Number(right.level) - Number(left.level);
        }

        return String(left.name || '').localeCompare(String(right.name || ''));
      });
    const equippedBy = heroes
      .flatMap((hero) => (Array.isArray(hero?.equipped) ? hero.equipped : [])
        .filter((equippedItem) => this.normalizeLookupText(equippedItem?.name) === this.normalizeLookupText(item.name))
        .map((equippedItem) => ({
          name: hero.name,
          slot: equippedItem.slot
        })));

    return {
      requestedItemName,
      item,
      availableHeroes: compatibleHeroes.filter((hero) => hero.isAvailableNow),
      unavailableHeroes: compatibleHeroes.filter((hero) => !hero.isAvailableNow),
      equippedBy
    };
  }

  buildFocusedHeroReview({
    analysis,
    snapshot,
    localFullSnapshot = null,
    localHeroesSnapshot = []
  }) {
    const heroName = String(analysis?.heroName || '').trim();

    if (!heroName) {
      return null;
    }

    const plannerCharacter = (snapshot?.characters || []).find((character) => {
      return String(character?.characterName || '').trim().toLowerCase() === heroName.toLowerCase();
    }) || null;
    const liveHero = (Array.isArray(localHeroesSnapshot) ? localHeroesSnapshot : []).find((hero) => {
      return String(hero?.name || '').trim().toLowerCase() === heroName.toLowerCase();
    }) || null;

    if (!liveHero) {
      return {
        heroName,
        plannerCharacter: plannerCharacter
          ? {
              name: plannerCharacter.characterName,
              level: plannerCharacter.level,
              isUnlocked: plannerCharacter.isUnlocked
            }
          : null,
        liveHero: null,
      equipmentSummary: null,
      localCraftableItems: [],
      shopInventoryItems: [],
      breakChanceReference: null,
      summary: `No live hero snapshot was available for ${heroName}, so the answer must rely on planner-only context.`
    };
  }

    const equippedItems = (Array.isArray(liveHero.equipped) ? liveHero.equipped : []).map((item) => this.normalizeLiveItem(item));
    const inventoryItems = (Array.isArray(liveHero.inventory) ? liveHero.inventory : []).map((item) => this.normalizeLiveItem(item));
    const shopInventoryItems = (Array.isArray(localFullSnapshot?.inventoryItems) ? localFullSnapshot.inventoryItems : [])
      .map((item) => this.normalizeShopInventoryItem(item))
      .filter((item) => item.totalQuantity > 0);
    const heroProficiencies = Array.isArray(liveHero.proficiencies)
      ? liveHero.proficiencies.map((entry) => ({
          itemTypeCode: entry.itemTypeCode,
          rank: entry.rank,
          multiplier: Number(entry.multiplier) || 0
        }))
      : [];
    const breakChanceValues = equippedItems.map((item) => Number(item.breakChance) || 0);
    const highestBreakChance = breakChanceValues.length ? Math.max(...breakChanceValues) : 0;
    const brokenItems = equippedItems.filter((item) => item.broken);
    const unusableItems = equippedItems.filter((item) => !item.canUse);
    const nonZeroBreakChanceItems = equippedItems.filter((item) => Number(item.breakChance) > 0);
    const equipmentSummary = {
      equippedCount: equippedItems.length,
      brokenItemCount: brokenItems.length,
      unusableItemCount: unusableItems.length,
      zeroBreakChanceCount: equippedItems.filter((item) => Number(item.breakChance) === 0).length,
      nonZeroBreakChanceCount: nonZeroBreakChanceItems.length,
      highestBreakChance: this.roundNumber(highestBreakChance, 4),
      allBreakChanceZero: equippedItems.length > 0 && nonZeroBreakChanceItems.length === 0,
      hasBrokenItems: brokenItems.length > 0,
      hasUnusableItems: unusableItems.length > 0
    };
    const issues = [];

    if (brokenItems.length > 0) {
      issues.push(`${brokenItems.length} broken equipped item(s)`);
    }

    if (unusableItems.length > 0) {
      issues.push(`${unusableItems.length} unusable equipped item(s)`);
    }

    if (nonZeroBreakChanceItems.length > 0) {
      issues.push(`${nonZeroBreakChanceItems.length} equipped item(s) still have non-zero break chance`);
    }

    return {
      heroName,
      plannerCharacter: plannerCharacter
        ? {
            name: plannerCharacter.characterName,
            level: plannerCharacter.level,
            isUnlocked: plannerCharacter.isUnlocked
          }
        : null,
      liveHero: {
        name: liveHero.name,
        level: liveHero.level,
        heroClass: liveHero.heroClass,
        proficiencies: heroProficiencies,
        isLocked: Boolean(liveHero.isLocked),
        isRecruitable: Boolean(liveHero.isRecruitable),
        isReady: Boolean(liveHero.isReady),
        isBusy: Boolean(liveHero.isBusy),
        inQuest: Boolean(liveHero.inQuest),
        isHealing: Boolean(liveHero.isHealing),
        isInjured: Boolean(liveHero.isInjured),
        hasBrokenItems: Boolean(liveHero.hasBrokenItems)
      },
      equipmentSummary,
      equippedItems,
      inventoryItems,
      shopInventoryItems,
      localCraftableItems: this.findRelevantCraftableItemsForHero({
        liveHero,
        equippedItems,
        localFullSnapshot
      }),
      breakChanceReference: localFullSnapshot?.breakChanceReference || null,
      summary: issues.length === 0
        ? `${heroName} has ${equippedItems.length} equipped item(s) and all currently reported break chances are zero.`
        : `${heroName} has ${equippedItems.length} equipped item(s); notable issues: ${issues.join(', ')}.`
    };
  }

  buildInvestigationPlan({
    analysis,
    snapshot,
    localFullSnapshot = null,
    focusedHeroReview,
    itemUsabilityReview = null
  }) {
    const completedSteps = [];
    const pendingSteps = [];
    const inventoryEntries = Array.isArray(localFullSnapshot?.inventoryItems) ? localFullSnapshot.inventoryItems : [];
    const savedInventoryEntries = Array.isArray(snapshot?.inventory) ? snapshot.inventory : [];
    const itemStateEntries = Array.isArray(snapshot?.itemStates) ? snapshot.itemStates : [];

    if (analysis?.requestType === 'item_usability_review') {
      if (itemUsabilityReview?.item) {
        completedSteps.push(`identifiquei o item alvo como ${itemUsabilityReview.item.name}`);
        completedSteps.push(`resolvi o tipo do item como ${itemUsabilityReview.item.itemTypeCode || 'desconhecido'}`);
        completedSteps.push('comparei o tipo do item contra as proficiencias dos herois no snapshot live');
      } else {
        pendingSteps.push(`resolver o item alvo ${analysis?.itemName || 'solicitado'} no snapshot live`);
      }
    } else if (analysis?.heroName) {
      completedSteps.push(`identifiquei o heroi alvo como ${analysis.heroName}`);
    } else {
      pendingSteps.push('resolver qual heroi deve ser analisado');
    }

    if (focusedHeroReview?.liveHero) {
      completedSteps.push('li o estado live do heroi');
      completedSteps.push('li os equipamentos atualmente equipados');
    } else {
      pendingSteps.push('obter snapshot live do heroi com os equips atuais');
    }

    if (analysis?.needsBreakChanceReview && focusedHeroReview?.equipmentSummary) {
      completedSteps.push('comparei as pecas equipadas contra o objetivo de break chance 0');
    } else if (analysis?.needsBreakChanceReview) {
      pendingSteps.push('comparar os slots equipados contra o objetivo de break chance 0');
    }

    if (inventoryEntries.length > 0) {
      completedSteps.push(`considerei ${inventoryEntries.length} item(ns) com estoque real exposto pelo jogo`);
    } else if (savedInventoryEntries.length > 0) {
      completedSteps.push(`considerei que a conta possui ${savedInventoryEntries.length} stack(s) de inventario salvos no planner`);
    } else {
      pendingSteps.push('ter inventario registrado para procurar alternativas reais ja possuidas');
    }

    if (itemStateEntries.length > 0) {
      completedSteps.push(`considerei ${itemStateEntries.length} item(ns) com estado de blueprint/craft registrado`);
    } else if (!Array.isArray(localFullSnapshot?.craftableItems) || localFullSnapshot.craftableItems.length === 0) {
      pendingSteps.push('ter itens registrados com blueprint/craft unlocked para avaliar alternativas craftaveis');
    }

    if (Array.isArray(localFullSnapshot?.craftableItems) && localFullSnapshot.craftableItems.length > 0) {
      completedSteps.push(`considerei ${localFullSnapshot.craftableItems.length} item(ns) craftaveis expostos pelo jogo`);
    } else {
      pendingSteps.push('ter snapshot local com craftableItems para avaliar alternativas craftaveis reais');
    }

    if (Array.isArray(localFullSnapshot?.breakChanceReference?.rows) && localFullSnapshot.breakChanceReference.rows.length > 0) {
      completedSteps.push('considerei a matriz live de break chance exposta pelo jogo');
    } else {
      pendingSteps.push('ter matriz live de break chance para prever candidatos craftaveis com seguranca');
    }

    if (analysis?.requestType !== 'item_usability_review') {
      pendingSteps.push('ranquear candidatos reais por slot usando afinidade/proficiency e comparacao de break chance');
      pendingSteps.push('comparar tiers de qualidade das alternativas antes do veredito final');
    }

    return {
      goalType: analysis?.goalType || 'general',
      completedSteps,
      pendingSteps
    };
  }

  inferHeroName({
    prompt,
    snapshot = null,
    localPlannerOverview = null
  }) {
    const candidateMap = new Map();

    for (const character of snapshot?.characters || []) {
      const name = String(character?.characterName || '').trim();
      if (name) {
        candidateMap.set(name.toLowerCase(), name);
      }
    }

    for (const hero of localPlannerOverview?.readyHeroes || []) {
      const name = String(hero?.name || '').trim();
      if (name) {
        candidateMap.set(name.toLowerCase(), name);
      }
    }

    for (const hero of localPlannerOverview?.blockedHeroes || []) {
      const name = String(hero?.name || '').trim();
      if (name) {
        candidateMap.set(name.toLowerCase(), name);
      }
    }

    const lowerPrompt = String(prompt || '').toLowerCase();

    for (const [lowerName, originalName] of candidateMap.entries()) {
      if (lowerPrompt.includes(lowerName)) {
        return originalName;
      }
    }

    return '';
  }

  forwardAbortSignal(sourceSignal, targetController) {
    if (!sourceSignal) {
      return () => {};
    }

    if (sourceSignal.aborted) {
      targetController.abort();
      return () => {};
    }

    const handleAbort = () => {
      targetController.abort();
    };

    sourceSignal.addEventListener('abort', handleAbort, { once: true });

    return () => {
      sourceSignal.removeEventListener('abort', handleAbort);
    };
  }

  roundNumber(value, precision = 2) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    return Number(numericValue.toFixed(precision));
  }

  formatBreakChancePercent(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return '0%';
    }

    return `${(numericValue * 100).toFixed(1)}%`;
  }

  normalizeLiveItem(item) {
    return {
      slot: item?.slot,
      name: item?.name,
      level: Number(item?.level) || 0,
      tier: item?.tier,
      itemTypeCode: item?.itemTypeCode,
      quality: Number(item?.quality) || 0,
      broken: Boolean(item?.broken),
      canUse: Boolean(item?.canUse),
      proficiencyRank: item?.proficiencyRank,
      proficiencyMultiplier: Number(item?.proficiencyMultiplier) || 0,
      adequacy: this.roundNumber(item?.adequacy, 4),
      breakChance: this.roundNumber(item?.breakChance, 4)
    };
  }

  normalizeShopInventoryItem(item) {
    return {
      uid: String(item?.uid || '').trim(),
      name: String(item?.name || '').trim(),
      itemTypeCode: String(item?.itemTypeCode || '').trim(),
      itemLevel: Number(item?.itemLevel) || 0,
      unlockLevel: Number(item?.unlockLevel) || 0,
      minQuality: Number(item?.minQuality) || 0,
      canCraft: Boolean(item?.canCraft),
      totalQuantity: Number(item?.totalQuantity) || 0,
      availableByQuality: (Array.isArray(item?.availableByQuality) ? item.availableByQuality : [])
        .map((entry) => ({
          quality: Number(entry?.quality) || 0,
          quantity: Math.max(0, Math.floor(Number(entry?.quantity) || 0)),
          disabled: Boolean(entry?.disabled)
        }))
        .filter((entry) => entry.quantity > 0)
    };
  }

  resolveLiveItemByName({
    itemName,
    localFullSnapshot = null,
    heroes = []
  }) {
    const targetName = this.normalizeLookupText(itemName);

    if (!targetName) {
      return null;
    }

    const candidateItems = [
      ...(Array.isArray(localFullSnapshot?.inventoryItems) ? localFullSnapshot.inventoryItems : []),
      ...(Array.isArray(localFullSnapshot?.craftableItems) ? localFullSnapshot.craftableItems : []),
      ...(Array.isArray(heroes) ? heroes : []).flatMap((hero) => (Array.isArray(hero?.equipped) ? hero.equipped : [])),
      ...(Array.isArray(heroes) ? heroes : []).flatMap((hero) => (Array.isArray(hero?.inventory) ? hero.inventory : []))
    ]
      .filter((item) => item?.name)
      .map((item) => this.normalizeAnyLiveItemReference(item));

    const exactMatch = candidateItems.find((item) => this.normalizeLookupText(item.name) === targetName);
    if (exactMatch) {
      return exactMatch;
    }

    return candidateItems
      .filter((item) => {
        const normalizedName = this.normalizeLookupText(item.name);
        return normalizedName.includes(targetName) || targetName.includes(normalizedName);
      })
      .sort((left, right) => String(left.name || '').length - String(right.name || '').length)[0] || null;
  }

  normalizeAnyLiveItemReference(item) {
    return {
      uid: String(item?.uid || '').trim(),
      name: String(item?.name || '').trim(),
      itemTypeCode: String(item?.itemTypeCode || '').trim(),
      level: Number(item?.itemLevel) || Number(item?.level) || 0,
      unlockLevel: Number(item?.unlockLevel) || 0,
      minQuality: Number(item?.minQuality) || Number(item?.quality) || 0,
      canCraft: Boolean(item?.canCraft),
      totalQuantity: Number(item?.totalQuantity) || 0
    };
  }

  normalizeLookupText(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  isLiveHeroAvailableNow(hero) {
    return Boolean(
      hero
      && !hero.isLocked
      && !hero.isRecruitable
      && !hero.isInjured
      && !hero.inQuest
      && !hero.isHealing
      && !hero.isBusy
    );
  }

  getLiveHeroAvailabilityStatus(hero) {
    if (hero?.isLocked) {
      return 'locked';
    }

    if (hero?.isRecruitable) {
      return 'recruitable';
    }

    if (hero?.isInjured) {
      return 'injured';
    }

    if (hero?.isHealing) {
      return 'healing';
    }

    if (hero?.inQuest) {
      return 'in quest';
    }

    if (hero?.isBusy) {
      return 'busy';
    }

    return 'available';
  }

  scoreProficiencyRank(rank) {
    const rankScores = {
      S: 5,
      A: 4,
      B: 3,
      C: 2,
      D: 1
    };

    return rankScores[String(rank || '').trim().toUpperCase()] || 0;
  }

  findRelevantCraftableItemsForHero({
    liveHero,
    equippedItems = [],
    localFullSnapshot = null
  }) {
    const neededTypeCodes = new Set();

    for (const item of equippedItems) {
      const normalizedTypeCode = this.normalizeTypeCode(item?.itemTypeCode);
      if (!normalizedTypeCode) {
        continue;
      }

      neededTypeCodes.add(normalizedTypeCode);

      for (const alternateTypeCode of this.getCompatibleCandidateTypeCodes({
        currentItem: item,
        liveHero
      })) {
        neededTypeCodes.add(alternateTypeCode);
      }
    }

    return (Array.isArray(localFullSnapshot?.craftableItems) ? localFullSnapshot.craftableItems : [])
      .filter((item) => {
        return (
          item?.canCraft
          && neededTypeCodes.has(String(item?.itemTypeCode || '').trim().toLowerCase())
        );
      })
      .map((item) => ({
        uid: item.uid,
        name: item.name,
        itemTypeCode: item.itemTypeCode,
        level: Number(item.level) || 0,
        itemLevel: Number(item.itemLevel) || Number(item.level) || 0,
        minQuality: Number(item.minQuality) || 0,
        craftedCount: Number(item.craftedCount) || 0,
        resourceCosts: Array.isArray(item.resourceCosts) ? item.resourceCosts : [],
        itemRequirements: Array.isArray(item.itemRequirements) ? item.itemRequirements : [],
        craftingTime: Number(item.craftingTime) || 0,
        availableByQuality: Array.isArray(item.availableByQuality) ? item.availableByQuality : []
      }));
  }

  formatSlotLabel(slot) {
    const normalizedSlot = String(slot || '').trim().toLowerCase();
    const slotMap = {
      weapon: 'Weapon',
      helmet: 'Helmet',
      head: 'Helmet',
      body: 'Body',
      chest: 'Body',
      armor: 'Body',
      accessory: 'Accessory',
      gloves: 'Gloves',
      boots: 'Boots',
      footwear: 'Boots',
      shoes: 'Boots',
      jewel: 'Accessory',
      accessory: 'Accessory',
      usable: 'Usable',
      spell: 'Usable',
      offhand: 'Offhand'
    };

    return slotMap[normalizedSlot] || String(slot || 'Unknown');
  }

  formatHeroClassLabel(heroClass) {
    const normalizedHeroClass = String(heroClass || '').trim();

    if (!normalizedHeroClass) {
      return 'desconhecida';
    }

    if (/^(hero|customer|npc)$/i.test(normalizedHeroClass)) {
      return 'desconhecida';
    }

    const heroClassMap = {
      magic: 'Spellcaster',
      fighter: 'Fighter',
      rogue: 'Rogue'
    };

    if (heroClassMap[normalizedHeroClass.toLowerCase()]) {
      return heroClassMap[normalizedHeroClass.toLowerCase()];
    }

    return normalizedHeroClass
      .split(/[\s_-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  sortEquippedItemsForDisplay(items = []) {
    const slotOrder = {
      weapon: 0,
      helmet: 1,
      head: 1,
      body: 2,
      chest: 2,
      armor: 2,
      accessory: 3,
      gloves: 4,
      boots: 5,
      footwear: 5,
      shoes: 5,
      offhand: 6,
      usable: 7,
      spell: 7
    };

    return [...items].sort((left, right) => {
      const leftOrder = slotOrder[String(left?.slot || '').trim().toLowerCase()] ?? 999;
      const rightOrder = slotOrder[String(right?.slot || '').trim().toLowerCase()] ?? 999;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return String(left?.name || '').localeCompare(String(right?.name || ''));
    });
  }

  buildOwnedInventoryRecommendations({
    equippedItems = [],
    focusedHeroReview = null
  }) {
    const liveHero = focusedHeroReview?.liveHero || null;
    const craftableItems = Array.isArray(focusedHeroReview?.localCraftableItems) ? focusedHeroReview.localCraftableItems : [];
    const shopInventoryEntries = Array.isArray(focusedHeroReview?.shopInventoryItems) ? focusedHeroReview.shopInventoryItems : [];
    const breakChanceReference = focusedHeroReview?.breakChanceReference || null;

    if (!liveHero || !craftableItems.length || !shopInventoryEntries.length || !breakChanceReference) {
      return [];
    }

    const proficiencyByType = this.buildHeroProficiencyMap(liveHero);

    return equippedItems
      .filter((equippedItem) => Number(equippedItem.breakChance) > 0)
      .map((equippedItem) => {
        const compatibleTypeCodes = this.getCompatibleCandidateTypeCodes({
          currentItem: equippedItem,
          liveHero
        });
        const currentCraftableItem = craftableItems.find((craftableItem) => {
          return (
            this.normalizeTypeCode(craftableItem.itemTypeCode) === this.normalizeTypeCode(equippedItem.itemTypeCode)
            && String(craftableItem.name || '').trim().toLowerCase() === String(equippedItem.name || '').trim().toLowerCase()
          );
        }) || null;

        const candidate = shopInventoryEntries
          .filter((inventoryItem) => {
            return (
              Number(inventoryItem.totalQuantity) > 0
              && String(inventoryItem.name || '').trim().toLowerCase() !== String(equippedItem.name || '').trim().toLowerCase()
            );
          })
          .flatMap((inventoryItem) => {
            const craftableItem = craftableItems.find((entry) => {
              return (
                String(entry.uid || '').trim().toLowerCase() === String(inventoryItem.uid || '').trim().toLowerCase()
                || String(entry.name || '').trim().toLowerCase() === String(inventoryItem.name || '').trim().toLowerCase()
              );
            });

            if (!craftableItem || !compatibleTypeCodes.includes(this.normalizeTypeCode(craftableItem.itemTypeCode))) {
              return [];
            }

            return inventoryItem.availableByQuality
              .filter((entry) => Number(entry.quantity) > 0)
              .map((entry) => {
                const quality = this.mapInventoryTierSortOrderToQuality(entry.quality);
                const rank = proficiencyByType.get(this.normalizeTypeCode(craftableItem.itemTypeCode))?.rank || equippedItem.proficiencyRank || 'C';
                const qualityPlan = this.buildQualityPlanForCandidate({
                  craftableItem,
                  currentItem: equippedItem,
                  currentCraftableItem,
                  rank,
                  quality,
                  breakChanceReference,
                  liveHero
                });
                const conservativeZeroRule = this.evaluateConservativeZeroRule({
                  currentItem: equippedItem,
                  currentCraftableItem,
                  candidateItem: craftableItem,
                  quality,
                  liveHero
                });

                return {
                  slot: equippedItem.slot,
                  currentItemName: equippedItem.name,
                  currentBreakChance: equippedItem.breakChance,
                  candidateItemName: inventoryItem.name,
                  candidateBreakChance: qualityPlan.breakChance,
                  quality,
                  qualityLabel: this.formatTierFromQuality(quality),
                  quantity: Number(entry.quantity) || 0,
                  level: Number(craftableItem.level || inventoryItem.itemLevel) || 0,
                  meetsConservativeZeroRule: conservativeZeroRule.matches,
                  recommendationScore: this.scoreCraftableCandidate({
                    craftableItem,
                    currentItem: equippedItem,
                    qualityPlan,
                    currentCraftableItem,
                    liveHero
                  }) + 40,
                  decisionSummary: this.describeCraftableDecision({
                    craftableItem,
                    currentItem: equippedItem,
                    qualityPlan,
                    currentCraftableItem,
                    liveHero
                  }),
                  candidateTypeCode: craftableItem.itemTypeCode,
                  candidateRank: rank
                };
              });
          })
          .filter(Boolean)
          .sort((left, right) => {
            if (Boolean(left.meetsConservativeZeroRule) !== Boolean(right.meetsConservativeZeroRule)) {
              return left.meetsConservativeZeroRule ? -1 : 1;
            }

            if (Number(left.recommendationScore) !== Number(right.recommendationScore)) {
              return Number(right.recommendationScore) - Number(left.recommendationScore);
            }

            if (Number(left.quality) !== Number(right.quality)) {
              return Number(right.quality) - Number(left.quality);
            }

            return String(left.candidateItemName || '').localeCompare(String(right.candidateItemName || ''));
          })[0];

        return candidate || null;
      })
      .filter(Boolean);
  }

  buildCraftableReplacementRecommendations({
    equippedItems = [],
    focusedHeroReview = null
  }) {
    const craftableItems = Array.isArray(focusedHeroReview?.localCraftableItems) ? focusedHeroReview.localCraftableItems : [];
    const breakChanceReference = focusedHeroReview?.breakChanceReference || null;
    const liveHero = focusedHeroReview?.liveHero || null;
    const proficiencyByType = this.buildHeroProficiencyMap(liveHero);

    if (!liveHero || !craftableItems.length || !breakChanceReference) {
      return [];
    }

    return equippedItems
      .filter((equippedItem) => Number(equippedItem.breakChance) > 0)
      .map((equippedItem) => {
        const compatibleTypeCodes = this.getCompatibleCandidateTypeCodes({
          currentItem: equippedItem,
          liveHero
        });
        const currentCraftableItem = craftableItems.find((craftableItem) => {
          return (
            this.normalizeTypeCode(craftableItem.itemTypeCode) === this.normalizeTypeCode(equippedItem.itemTypeCode)
            && String(craftableItem.name || '').trim().toLowerCase() === String(equippedItem.name || '').trim().toLowerCase()
          );
        }) || null;
        const matchingCandidates = craftableItems
          .filter((craftableItem) => {
            return (
              compatibleTypeCodes.includes(this.normalizeTypeCode(craftableItem.itemTypeCode))
              && String(craftableItem.name || '').trim().toLowerCase() !== String(equippedItem.name || '').trim().toLowerCase()
            );
          })
        .map((craftableItem) => this.buildPredictedCraftableCandidate({
            craftableItem,
            currentItem: equippedItem,
            currentCraftableItem,
            proficiency: proficiencyByType.get(this.normalizeTypeCode(craftableItem.itemTypeCode)) || null,
            breakChanceReference,
            liveHero
          }))
          .filter(Boolean)
          .sort((left, right) => {
            if (Boolean(left.meetsConservativeZeroRule) !== Boolean(right.meetsConservativeZeroRule)) {
              return left.meetsConservativeZeroRule ? -1 : 1;
            }

            if (Number(left.recommendationScore) !== Number(right.recommendationScore)) {
              return Number(right.recommendationScore) - Number(left.recommendationScore);
            }

            if (Number(left.candidateBreakChance) !== Number(right.candidateBreakChance)) {
              return Number(left.candidateBreakChance) - Number(right.candidateBreakChance);
            }

            if (Number(left.quality) !== Number(right.quality)) {
              return Number(left.quality) - Number(right.quality);
            }

            if (Number(left.level) !== Number(right.level)) {
              return Number(right.level) - Number(left.level);
            }

            return String(left.candidateItemName || '').localeCompare(String(right.candidateItemName || ''));
          })[0];

        return matchingCandidates || null;
      })
      .filter(Boolean);
  }

  buildHeroProficiencyMap(liveHero) {
    return new Map(
      (Array.isArray(liveHero?.proficiencies) ? liveHero.proficiencies : [])
        .map((entry) => [
          this.normalizeTypeCode(entry?.itemTypeCode),
          {
            rank: String(entry?.rank || '').trim() || 'C',
            multiplier: Number(entry?.multiplier) || 0
          }
        ])
        .filter(([key]) => Boolean(key))
    );
  }

  buildPredictedCraftableCandidate({
    craftableItem,
    currentItem,
    currentCraftableItem,
    proficiency,
    breakChanceReference,
    liveHero
  }) {
    const rank = String(proficiency?.rank || currentItem?.proficiencyRank || '').trim() || 'C';
    const qualityPlan = this.selectCraftableQualityPlan({
      craftableItem,
      currentItem,
      currentCraftableItem,
      rank,
      breakChanceReference,
      liveHero
    });
    const conservativeZeroRule = this.evaluateConservativeZeroRule({
      currentItem,
      currentCraftableItem,
      candidateItem: craftableItem,
      quality: qualityPlan?.quality ?? 0,
      liveHero
    });

    if (!qualityPlan) {
      return null;
    }

    return {
      slot: currentItem.slot,
      currentItemName: currentItem.name,
      currentBreakChance: currentItem.breakChance,
      candidateItemName: craftableItem.name,
      candidateBreakChance: qualityPlan.breakChance,
      quality: qualityPlan.quality,
      qualityLabel: this.formatTierFromQuality(qualityPlan.quality),
      level: Number(craftableItem.level) || 0,
      achievesZero: qualityPlan.breakChance <= 0,
      meetsConservativeZeroRule: conservativeZeroRule.matches,
      estimatedAdequacy: conservativeZeroRule.estimatedAdequacy,
      craftEffort: this.estimateCraftEffort(craftableItem),
      recommendationScore: this.scoreCraftableCandidate({
        craftableItem,
        currentItem,
        qualityPlan,
        currentCraftableItem,
        liveHero
      }),
      decisionSummary: this.describeCraftableDecision({
        craftableItem,
        currentItem,
        qualityPlan,
        currentCraftableItem,
        liveHero
      })
    };
  }

  selectCraftableQualityPlan({
    craftableItem,
    currentItem,
    currentCraftableItem,
    rank,
    breakChanceReference,
    liveHero
  }) {
    const enabledQualities = this.listEnabledUserFacingQualities(craftableItem);
    if (!enabledQualities.length) {
      return null;
    }
    const epicOrHigher = enabledQualities.find((quality) => quality >= 4);
    const selectedQuality = epicOrHigher ?? enabledQualities[enabledQualities.length - 1];
    const estimatedAdequacy = this.estimateCandidateAdequacy({
      currentItem,
      currentCraftableItem,
      candidateItem: craftableItem,
      liveHero
    });
    const matrixBreakChance = breakChanceReference
      ? this.lookupBreakChanceFromReference({
          breakChanceReference,
          rank,
          levelDelta: this.calculateHeroItemLevelDelta({
            liveHero,
            candidateItem: craftableItem
          }),
          quality: selectedQuality
        })
      : null;

    return {
      quality: selectedQuality,
      breakChance: matrixBreakChance,
      estimatedAdequacy
    };
  }

  buildQualityPlanForCandidate({
    craftableItem,
    currentItem,
    currentCraftableItem,
    rank,
    quality,
    breakChanceReference,
    liveHero
  }) {
    const selectedQuality = this.mapInventoryTierSortOrderToQuality(quality);
    const estimatedAdequacy = this.estimateCandidateAdequacy({
      currentItem,
      currentCraftableItem,
      candidateItem: craftableItem,
      liveHero
    });
    const matrixBreakChance = breakChanceReference
      ? this.lookupBreakChanceFromReference({
          breakChanceReference,
          rank,
          levelDelta: this.calculateHeroItemLevelDelta({
            liveHero,
            candidateItem: craftableItem
          }),
          quality: selectedQuality
        })
      : null;

    return {
      quality: selectedQuality,
      breakChance: matrixBreakChance,
      estimatedAdequacy
    };
  }

  listEnabledUserFacingQualities(craftableItem) {
    const qualityEntries = Array.isArray(craftableItem?.availableByQuality) ? craftableItem.availableByQuality : [];
    const enabledQualities = qualityEntries
      .filter((entry) => !entry?.disabled)
      .map((entry) => Number(entry?.quality))
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= MAX_USER_FACING_QUALITY_INDEX)
      .sort((left, right) => left - right);

    if (enabledQualities.length > 0) {
      return [...new Set(enabledQualities)];
    }

    return [Math.min(Number(craftableItem?.minQuality) || 0, MAX_USER_FACING_QUALITY_INDEX)];
  }

  mapInventoryTierSortOrderToQuality(tierSortOrder) {
    const numericSortOrder = Number(tierSortOrder);

    if (!Number.isFinite(numericSortOrder)) {
      return 0;
    }

    return Math.max(0, Math.min(numericSortOrder, MAX_USER_FACING_QUALITY_INDEX));
  }

  estimateCraftEffort(craftableItem) {
    const resourceCostCount = (Array.isArray(craftableItem?.resourceCosts) ? craftableItem.resourceCosts : [])
      .reduce((total, entry) => total + (Number(entry?.quantity) || 0), 0);
    const itemRequirementCount = (Array.isArray(craftableItem?.itemRequirements) ? craftableItem.itemRequirements : [])
      .reduce((total, entry) => total + (Number(entry?.quantity) || 0), 0);
    const craftingTimeMs = Number(craftableItem?.craftingTime) || 0;

    return {
      resourceCostCount,
      itemRequirementCount,
      craftingTimeMs
    };
  }

  scoreCraftableCandidate({
    craftableItem,
    currentItem,
    qualityPlan,
    currentCraftableItem,
    liveHero
  }) {
    const effort = this.estimateCraftEffort(craftableItem);
    const conservativeZeroRule = this.evaluateConservativeZeroRule({
      currentItem,
      currentCraftableItem,
      candidateItem: craftableItem,
      quality: qualityPlan?.quality ?? 0,
      liveHero
    });
    const zeroBonus = conservativeZeroRule.matches ? 140 : 0;
    const levelBonus = (Number(craftableItem?.level) || 0) * 4;
    const qualityPenalty = Math.max(0, 4 - (Number(qualityPlan?.quality) || 0)) * 25;
    const resourcePenalty = effort.resourceCostCount * 0.2;
    const requirementPenalty = effort.itemRequirementCount * 5;
    const timePenalty = effort.craftingTimeMs / 60000;
    const adequacyPenalty = Math.max(0, 0.94 - Number(conservativeZeroRule.estimatedAdequacy || 0)) * 300;
    const breakPressureBonus = Number(currentItem?.breakChance || 0) * 500;
    const typePreferenceBonus = this.computeTypePreferenceBonus({
      currentItem,
      candidateItem: craftableItem,
      liveHero
    });

    return this.roundNumber(
      zeroBonus
      + breakPressureBonus
      + levelBonus
      + typePreferenceBonus
      - qualityPenalty
      - resourcePenalty
      - requirementPenalty
      - timePenalty
      - adequacyPenalty,
      2
    );
  }

  describeCraftableDecision({
    craftableItem,
    currentItem,
    qualityPlan,
    currentCraftableItem,
    liveHero
  }) {
    const effort = this.estimateCraftEffort(craftableItem);
    const conservativeZeroRule = this.evaluateConservativeZeroRule({
      currentItem,
      currentCraftableItem,
      candidateItem: craftableItem,
      quality: qualityPlan?.quality ?? 0,
      liveHero
    });
    const reasons = [];

    if (conservativeZeroRule.matches) {
      reasons.push('entra na zona segura observada para 0% ou residual muito baixo');
    } else {
      reasons.push(conservativeZeroRule.confidenceLabel);
    }

    reasons.push(`pede ${this.formatTierFromQuality(qualityPlan?.quality)}`);
    reasons.push(`item Lv. ${Number(craftableItem?.level) || 0}`);
    reasons.push(`adequacy estimada ${this.roundNumber(qualityPlan?.estimatedAdequacy ?? 0, 3)}`);
    reasons.push(this.describeTypePreference({
      currentItem,
      candidateItem: craftableItem,
      liveHero
    }));

    if (effort.itemRequirementCount > 0) {
      reasons.push(`${effort.itemRequirementCount} requisito(s) de item`);
    } else {
      reasons.push('sem requisito de item intermediario');
    }

    if (effort.craftingTimeMs > 0) {
      reasons.push(`${this.formatDurationMinutes(effort.craftingTimeMs)} de craft`);
    }

    return reasons.join(', ');
  }

  evaluateConservativeZeroRule({
    currentItem,
    currentCraftableItem,
    candidateItem,
    quality,
    liveHero
  }) {
    const estimatedAdequacy = this.estimateCandidateAdequacy({
      currentItem,
      currentCraftableItem,
      candidateItem,
      liveHero
    });
    const numericQuality = Number(quality || 0);
    let confidenceLabel = 'reducao de risco sem zona segura clara';

    if (estimatedAdequacy >= 0.97 && numericQuality >= 4) {
      confidenceLabel = 'alta chance de 0% ou residual muito baixo';
    } else if (estimatedAdequacy >= 0.94 && numericQuality >= 4) {
      confidenceLabel = 'boa chance de 0% ou residual muito baixo';
    } else if (estimatedAdequacy >= 0.9 && numericQuality >= 4) {
      confidenceLabel = 'chance razoavel de ficar muito perto de 0%';
    } else if (estimatedAdequacy >= 0.85 && numericQuality >= 4) {
      confidenceLabel = 'reduz forte, mas ainda sem cravar 0%';
    }

    return {
      matches: estimatedAdequacy >= 0.94 && numericQuality >= 4,
      estimatedAdequacy,
      confidenceLabel
    };
  }

  estimateCandidateAdequacy({
    currentItem,
    currentCraftableItem,
    candidateItem,
    liveHero
  }) {
    const currentAdequacy = Number(currentItem?.adequacy) || 0;
    const heroLevel = Number(liveHero?.level) || 0;
    const candidateLevel = this.getCandidateItemLevel(candidateItem);

    if (heroLevel > 0 && candidateLevel > 0) {
      const levelDelta = this.calculateHeroItemLevelDelta({
        liveHero,
        candidateItem
      });
      const estimatedAdequacy = 1 - (levelDelta * 0.03);

      return Math.max(0, Math.min(1, this.roundNumber(estimatedAdequacy, 4)));
    }

    const currentLevel = Number(currentCraftableItem?.level) || candidateLevel || 0;
    const levelStepDelta = candidateLevel - currentLevel;
    const estimatedAdequacy = currentAdequacy - (levelStepDelta * 0.03);

    return Math.max(0, Math.min(1, this.roundNumber(estimatedAdequacy, 4)));
  }

  getCandidateItemLevel(candidateItem) {
    return Number(candidateItem?.itemLevel) || Number(candidateItem?.level) || 0;
  }

  calculateHeroItemLevelDelta({
    liveHero,
    candidateItem
  }) {
    const heroLevel = Number(liveHero?.level) || 0;
    const itemLevel = this.getCandidateItemLevel(candidateItem);

    if (heroLevel <= 0 || itemLevel <= 0) {
      return 0;
    }

    return Math.max(0, heroLevel - itemLevel);
  }

  getCompatibleCandidateTypeCodes({
    currentItem,
    liveHero
  }) {
    const currentTypeCode = this.normalizeTypeCode(currentItem?.itemTypeCode);

    if (this.normalizeSlotKey(currentItem?.slot) !== 'weapon') {
      return currentTypeCode ? [currentTypeCode] : [];
    }

    const preferredRanks = new Set(['S', 'A']);
    const weaponTypes = (Array.isArray(liveHero?.proficiencies) ? liveHero.proficiencies : [])
      .filter((entry) => preferredRanks.has(String(entry?.rank || '').trim().toUpperCase()))
      .map((entry) => this.normalizeTypeCode(entry?.itemTypeCode))
      .filter((typeCode) => ['wb', 'wt', 'wd', 'ws', 'wm'].includes(typeCode));

    const ordered = [];
    if (currentTypeCode) {
      ordered.push(currentTypeCode);
    }

    for (const typeCode of weaponTypes) {
      if (!ordered.includes(typeCode)) {
        ordered.push(typeCode);
      }
    }

    return ordered;
  }

  computeTypePreferenceBonus({
    currentItem,
    candidateItem,
    liveHero
  }) {
    const currentType = this.normalizeTypeCode(currentItem?.itemTypeCode);
    const candidateType = this.normalizeTypeCode(candidateItem?.itemTypeCode);
    const proficiencies = Array.isArray(liveHero?.proficiencies) ? liveHero.proficiencies : [];
    const candidateProficiency = proficiencies.find((entry) => this.normalizeTypeCode(entry?.itemTypeCode) === candidateType);
    const rank = String(candidateProficiency?.rank || '').trim().toUpperCase();

    if (candidateType === currentType) {
      return 20;
    }

    if (rank === 'S') {
      return 16;
    }

    if (rank === 'A') {
      return 10;
    }

    if (rank === 'B') {
      return 2;
    }

    return -20;
  }

  describeTypePreference({
    currentItem,
    candidateItem,
    liveHero
  }) {
    const currentType = this.normalizeTypeCode(currentItem?.itemTypeCode);
    const candidateType = this.normalizeTypeCode(candidateItem?.itemTypeCode);
    const proficiencies = Array.isArray(liveHero?.proficiencies) ? liveHero.proficiencies : [];
    const candidateProficiency = proficiencies.find((entry) => this.normalizeTypeCode(entry?.itemTypeCode) === candidateType);
    const rank = String(candidateProficiency?.rank || '').trim().toUpperCase();

    if (candidateType === currentType) {
      return `mesmo tipo base (${candidateType})`;
    }

    return `tipo alternativo ${candidateType} com proficiencia ${rank || 'desconhecida'}`;
  }

  lookupBreakChanceByAdequacy({
    breakChanceReference,
    rank,
    adequacy,
    quality
  }) {
    const normalizedRank = String(rank || '').trim().toUpperCase();
    const clampedQuality = Math.max(0, Math.min(Number(quality) || 0, Number(breakChanceReference?.maxQuality) || 0));
    const row = (Array.isArray(breakChanceReference?.rows) ? breakChanceReference.rows : []).find((entry) => {
      return String(entry?.rank || '').trim().toUpperCase() === normalizedRank;
    });

    if (!row) {
      return null;
    }

    const candidates = (Array.isArray(row.entries) ? row.entries : [])
      .filter((entry) => Number(entry?.quality) === clampedQuality)
      .sort((left, right) => Math.abs((Number(left?.adequacy) || 0) - adequacy) - Math.abs((Number(right?.adequacy) || 0) - adequacy));

    return candidates.length > 0 ? this.roundNumber(candidates[0].breakChance, 4) : null;
  }

  formatDurationMinutes(durationMs) {
    const totalMinutes = Math.max(1, Math.round((Number(durationMs) || 0) / 60000));

    if (totalMinutes < 60) {
      return `${totalMinutes} min`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (minutes === 0) {
      return `${hours}h`;
    }

    return `${hours}h ${minutes}min`;
  }

  lookupBreakChanceFromReference({
    breakChanceReference,
    rank,
    levelDelta,
    quality
  }) {
    const normalizedRank = String(rank || '').trim().toUpperCase();
    const clampedLevelDelta = Math.max(0, Math.min(Number(levelDelta) || 0, Number(breakChanceReference?.maxLevelDelta) || 0));
    const clampedQuality = Math.max(0, Math.min(Number(quality) || 0, Number(breakChanceReference?.maxQuality) || 0));
    const row = (Array.isArray(breakChanceReference?.rows) ? breakChanceReference.rows : []).find((entry) => {
      return String(entry?.rank || '').trim().toUpperCase() === normalizedRank;
    });

    if (!row) {
      return null;
    }

    const exactEntry = (Array.isArray(row.entries) ? row.entries : []).find((entry) => {
      return Number(entry?.levelDelta) === clampedLevelDelta && Number(entry?.quality) === clampedQuality;
    });

    if (exactEntry) {
      return this.roundNumber(exactEntry.breakChance, 4);
    }

    return null;
  }

  inferItemNameFromPrompt(prompt) {
    const normalizedPrompt = String(prompt || '').trim();
    const patterns = [
      /\bquem pode usar\s+(?:o|a|os|as)?\s*(.+)$/i,
      /\bwho can use\s+(?:the\s+)?(.+)$/i,
      /\bquais? (?:herois|heroes|personagens).*?\busar\s+(?:o|a|os|as)?\s*(.+)$/i,
      /\bpode usar\s+(?:o|a|os|as)?\s*(.+)$/i,
      /\bpodem usar\s+(?:o|a|os|as)?\s*(.+)$/i
    ];

    for (const pattern of patterns) {
      const match = normalizedPrompt.match(pattern);
      if (match?.[1]) {
        return this.cleanInferredItemName(match[1]);
      }
    }

    return '';
  }

  cleanInferredItemName(value) {
    return String(value || '')
      .replace(/[?.!]+$/g, '')
      .replace(/^["'`]+|["'`]+$/g, '')
      .trim();
  }

  formatTierFromQuality(quality) {
    const qualityMap = {
      0: 'Common',
      1: 'Good',
      2: 'Great',
      3: 'Flawless',
      4: 'Epic',
      5: 'Legendary',
      6: 'Mythical'
    };

    return qualityMap[Number(quality)] || 'Unknown quality';
  }

  normalizeTypeCode(itemTypeCode) {
    return String(itemTypeCode || '').trim().toLowerCase();
  }

  normalizeSlotKey(slot) {
    return String(slot || '').trim().toLowerCase();
  }
}

module.exports = {
  AssistantService
};
