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
    const needsEquipmentReview = /\bequip|\bgear|\bbreak chance|\bbroken|\bweapon|\barmor|\barmour|\bitem|\bequipamento|\bequipar|\bquebra|\barmadura|\barma/.test(lowerPrompt);
    const needsBreakChanceReview = /\bbreak chance\b|\bchance de quebra\b|\bquebra em 0\b|\bquebra 0\b|\b0%\b|\bzero\b/.test(lowerPrompt);
    const planSteps = [
      'Understand the player request and determine the target scope.',
      'Load the planner account snapshot.',
      localPlannerOverview
        ? 'Use the available local live session overview as supporting context.'
        : 'Proceed without local live session support if none is available.',
      heroName
        ? `Inspect focused information for ${heroName}.`
        : 'Inspect the most relevant entities for the question.',
      'Cross-check the findings and draft the final answer.'
    ];

    if (heroName && needsBreakChanceReview) {
      planSteps.splice(3, 0, `Review break chance implications for ${heroName}'s current equipment.`);
    }

    return {
      heroName,
      needsEquipmentReview,
      needsBreakChanceReview,
      goalType: needsBreakChanceReview ? 'zero_break_chance' : 'general_equipment_review',
      requestType: heroName && needsEquipmentReview ? 'hero_equipment_review' : 'general_planner_question',
      planSteps,
      summary: heroName
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
    const investigationPlan = this.buildInvestigationPlan({
      analysis: resolvedAnalysis,
      snapshot,
      localFullSnapshot,
      focusedHeroReview
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
      localLiveSnapshotSummary: localFullSnapshot
        ? {
            craftableItems: Array.isArray(localFullSnapshot.craftableItems) ? localFullSnapshot.craftableItems.length : 0,
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
    const liveInventoryItems = Array.isArray(focusedHeroReview.inventoryItems) ? focusedHeroReview.inventoryItems : [];
    const inventoryCandidateRecommendations = this.buildImmediateReplacementRecommendations({
      equippedItems: orderedEquippedItems,
      inventoryItems: liveInventoryItems
    });
    const craftableCandidateRecommendations = this.buildCraftableReplacementRecommendations({
      equippedItems: orderedEquippedItems,
      focusedHeroReview
    });
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

    if (orderedEquippedItems.length > 0) {
      lines.push(`Leitura no formato da tela do jogo: ${orderedEquippedItems.map((item) => `${this.formatSlotLabel(item.slot)}: ${item.name} (${this.formatBreakChancePercent(item.breakChance)})`).join('; ')}.`);
    }

    if (brokenItems.length > 0) {
      lines.push(`Tambem existem pecas quebradas: ${brokenItems.map((item) => `${this.formatSlotLabel(item.slot)}: ${item.name}`).join('; ')}.`);
    }

    if (unusableItems.length > 0) {
      lines.push(`Existem pecas equipadas que o heroi nao deveria usar: ${unusableItems.map((item) => `${this.formatSlotLabel(item.slot)}: ${item.name}`).join('; ')}.`);
    }

    if (inventoryCandidateRecommendations.length > 0) {
      lines.push(`Melhores alternativas reais ja visiveis no inventario do heroi: ${inventoryCandidateRecommendations.map((candidate) => `${this.formatSlotLabel(candidate.slot)}: trocar ${candidate.currentItemName} (${this.formatBreakChancePercent(candidate.currentBreakChance)}) por ${candidate.candidateItemName} (${this.formatBreakChancePercent(candidate.candidateBreakChance)})`).join('; ')}.`);
    }

    if (craftableCandidateRecommendations.length > 0) {
      lines.push(`Melhores alternativas craftaveis ja confirmadas no jogo: ${craftableCandidateRecommendations.map((candidate) => `${this.formatSlotLabel(candidate.slot)}: craftar ${candidate.candidateItemName} em ${candidate.qualityLabel} (${this.formatBreakChancePercent(candidate.candidateBreakChance)} previsto) no lugar de ${candidate.currentItemName} (${this.formatBreakChancePercent(candidate.currentBreakChance)})`).join('; ')}.`);
    }

    if (investigationPlan?.completedSteps?.length) {
      lines.push(`O que eu chequei nesta analise: ${investigationPlan.completedSteps.join('; ')}.`);
    }

    if (investigationPlan?.pendingSteps?.length) {
      lines.push(`O que ainda falta para uma recomendacao melhor: ${investigationPlan.pendingSteps.join('; ')}.`);
    }

    lines.push('Proximo passo seguro: usar esse diagnostico para revisar apenas os slots que ainda estao com break chance acima de 0 e buscar alternativas reais para esses slots.');
    if (inventoryCandidateRecommendations.length > 0 || craftableCandidateRecommendations.length > 0) {
      lines.push(`Limite atual do assistente: eu consegui apontar alternativas reais para o ${analysis.heroName}, mas ainda nao fechei um ranking completo por todos os slots possiveis nem esgotei comparacoes mais profundas entre inventario, craft e outras qualidades candidatas.`);
    } else {
      lines.push(`Limite atual do assistente: eu ainda nao tenho, neste contexto, uma lista confiavel de candidatos de substituicao ja ranqueados para cada slot do ${analysis.heroName}, entao nao vou inventar upgrades, consumiveis ou mecanicas que o jogo nao confirmou aqui.`);
    }

    if (String(prompt || '').trim()) {
      lines.push('Proximo nivel desejado para o assistente: comparar candidatos reais de equipamento por slot, usando inventario, itens desbloqueados para craft e as regras de break chance por tier/qualidade antes de fechar um veredito.');
    }

    return lines.join('\n\n');
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
      breakChanceReference: null,
      summary: `No live hero snapshot was available for ${heroName}, so the answer must rely on planner-only context.`
    };
  }

    const equippedItems = (Array.isArray(liveHero.equipped) ? liveHero.equipped : []).map((item) => this.normalizeLiveItem(item));
    const inventoryItems = (Array.isArray(liveHero.inventory) ? liveHero.inventory : []).map((item) => this.normalizeLiveItem(item));
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
    focusedHeroReview
  }) {
    const completedSteps = [];
    const pendingSteps = [];
    const inventoryEntries = Array.isArray(snapshot?.inventory) ? snapshot.inventory : [];
    const itemStateEntries = Array.isArray(snapshot?.itemStates) ? snapshot.itemStates : [];

    if (analysis?.heroName) {
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
      completedSteps.push(`considerei que a conta possui ${inventoryEntries.length} stack(s) de inventario registrados`);
    } else {
      pendingSteps.push('ter inventario registrado para procurar alternativas reais ja possuidas');
    }

    if (itemStateEntries.length > 0) {
      completedSteps.push(`considerei ${itemStateEntries.length} item(ns) com estado de blueprint/craft registrado`);
    } else {
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

    pendingSteps.push('ranquear candidatos reais por slot usando afinidade/proficiency e comparacao de break chance');
    pendingSteps.push('comparar tiers de qualidade das alternativas antes do veredito final');

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

  findRelevantCraftableItemsForHero({
    liveHero,
    equippedItems = [],
    localFullSnapshot = null
  }) {
    const neededTypeCodes = new Set(
      equippedItems
        .map((item) => String(item?.itemTypeCode || '').trim().toLowerCase())
        .filter(Boolean)
    );

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
        minQuality: Number(item.minQuality) || 0,
        craftedCount: Number(item.craftedCount) || 0,
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

  buildImmediateReplacementRecommendations({
    equippedItems = [],
    inventoryItems = []
  }) {
    return equippedItems
      .filter((equippedItem) => Number(equippedItem.breakChance) > 0)
      .map((equippedItem) => {
        const candidate = inventoryItems
          .filter((inventoryItem) => {
            return (
              this.normalizeSlotKey(inventoryItem.slot) === this.normalizeSlotKey(equippedItem.slot)
              && inventoryItem.canUse
              && !inventoryItem.broken
              && String(inventoryItem.name || '').trim().toLowerCase() !== String(equippedItem.name || '').trim().toLowerCase()
              && Number(inventoryItem.breakChance) < Number(equippedItem.breakChance)
            );
          })
          .sort((left, right) => {
            if (Number(left.breakChance) !== Number(right.breakChance)) {
              return Number(left.breakChance) - Number(right.breakChance);
            }

            if (Number(left.adequacy) !== Number(right.adequacy)) {
              return Number(right.adequacy) - Number(left.adequacy);
            }

            if (Number(left.quality) !== Number(right.quality)) {
              return Number(right.quality) - Number(left.quality);
            }

            return String(left.name || '').localeCompare(String(right.name || ''));
          })[0];

        if (!candidate) {
          return null;
        }

        return {
          slot: equippedItem.slot,
          currentItemName: equippedItem.name,
          currentBreakChance: equippedItem.breakChance,
          candidateItemName: candidate.name,
          candidateBreakChance: candidate.breakChance
        };
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
        const matchingCandidates = craftableItems
          .filter((craftableItem) => {
            return (
              this.normalizeTypeCode(craftableItem.itemTypeCode) === this.normalizeTypeCode(equippedItem.itemTypeCode)
              && String(craftableItem.name || '').trim().toLowerCase() !== String(equippedItem.name || '').trim().toLowerCase()
            );
          })
          .map((craftableItem) => this.buildPredictedCraftableCandidate({
            craftableItem,
            currentItem: equippedItem,
            heroLevel: liveHero.level,
            proficiency: proficiencyByType.get(this.normalizeTypeCode(craftableItem.itemTypeCode)) || null,
            breakChanceReference
          }))
          .filter((candidate) => candidate && Number(candidate.candidateBreakChance) < Number(equippedItem.breakChance))
          .sort((left, right) => {
            if (Number(left.candidateBreakChance) !== Number(right.candidateBreakChance)) {
              return Number(left.candidateBreakChance) - Number(right.candidateBreakChance);
            }

            if (Number(left.quality) !== Number(right.quality)) {
              return Number(right.quality) - Number(left.quality);
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
    heroLevel,
    proficiency,
    breakChanceReference
  }) {
    const targetQuality = this.selectBestCraftableQuality(craftableItem);
    const rank = String(proficiency?.rank || currentItem?.proficiencyRank || '').trim() || 'C';
    const levelDelta = Math.max(0, Number(craftableItem?.level || 0) - Number(heroLevel || 0));
    const candidateBreakChance = this.lookupBreakChanceFromReference({
      breakChanceReference,
      rank,
      levelDelta,
      quality: targetQuality
    });

    if (candidateBreakChance === null) {
      return null;
    }

    return {
      slot: currentItem.slot,
      currentItemName: currentItem.name,
      currentBreakChance: currentItem.breakChance,
      candidateItemName: craftableItem.name,
      candidateBreakChance,
      quality: targetQuality,
      qualityLabel: this.formatTierFromQuality(targetQuality),
      level: Number(craftableItem.level) || 0
    };
  }

  selectBestCraftableQuality(craftableItem) {
    const qualityEntries = Array.isArray(craftableItem?.availableByQuality) ? craftableItem.availableByQuality : [];
    const enabledQualities = qualityEntries
      .filter((entry) => !entry?.disabled)
      .map((entry) => Number(entry?.quality))
      .filter((value) => Number.isFinite(value));
    const userFacingQualities = enabledQualities.filter((value) => value >= 0 && value <= MAX_USER_FACING_QUALITY_INDEX);

    if (userFacingQualities.length > 0) {
      return Math.max(...userFacingQualities);
    }

    if (enabledQualities.length > 0) {
      return Math.min(Math.max(...enabledQualities), MAX_USER_FACING_QUALITY_INDEX);
    }

    return Math.min(Number(craftableItem?.minQuality) || 0, MAX_USER_FACING_QUALITY_INDEX);
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
