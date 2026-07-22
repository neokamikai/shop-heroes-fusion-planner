const crypto = require('crypto');

const { createAccountsService } = require('../containers/accounts.container');
const { createAssistantService } = require('../containers/assistant.container');
const { createAuthService } = require('../containers/auth.container');

const ASSISTANT_SOCKET_PATH_SUFFIX = '/assistant/ws';

function createAssistantWebSocketRuntime({ httpServer, WebSocketServer }) {
  const authService = createAuthService();
  const accountsService = createAccountsService();
  const assistantService = createAssistantService();
  const webSocketServer = new WebSocketServer({
    noServer: true
  });

  httpServer.on('upgrade', (request, socket, head) => {
    const requestUrl = safeCreateRequestUrl(request.url, request.headers.host);

    if (!requestUrl || !requestUrl.pathname.endsWith(ASSISTANT_SOCKET_PATH_SUFFIX)) {
      return;
    }

    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit('connection', webSocket, request);
    });
  });

  webSocketServer.on('connection', (webSocket) => {
    const connectionState = {
      accessToken: '',
      user: null,
      activeRuns: new Map(),
      isClosed: false
    };

    sendEvent(webSocket, {
      type: 'assistant.session.connected',
      message: 'Assistant socket connected. Authenticate this session to start runs.'
    });

    webSocket.on('message', async (rawMessage, isBinary) => {
      if (isBinary) {
        return;
      }

      try {
        const payload = JSON.parse(rawMessage.toString());
        await handleMessage({
          accountsService,
          assistantService,
          authService,
          connectionState,
          payload,
          webSocket
        });
      } catch (error) {
        sendEvent(webSocket, {
          type: 'assistant.session.failed',
          code: error?.code || 'assistant_socket_invalid_message',
          message: error?.message || 'Assistant socket received an invalid message.'
        });
      }
    });

    webSocket.on('close', () => {
      connectionState.isClosed = true;

      for (const controller of connectionState.activeRuns.values()) {
        controller.abort();
      }

      connectionState.activeRuns.clear();
    });
  });

  async function shutdown() {
    for (const client of webSocketServer.clients) {
      client.close(1001, 'Server shutting down');
    }

    await new Promise((resolve) => {
      webSocketServer.close(() => resolve());
    });
  }

  return {
    shutdown
  };
}

async function handleMessage({
  accountsService,
  assistantService,
  authService,
  connectionState,
  payload,
  webSocket
}) {
  const messageType = String(payload?.type || '').trim();

  switch (messageType) {
    case 'assistant.session.authenticate':
      await handleAuthenticateMessage({
        authService,
        connectionState,
        payload,
        webSocket
      });
      return;
    case 'assistant.run.create':
      await handleCreateRunMessage({
        accountsService,
        assistantService,
        connectionState,
        payload,
        webSocket
      });
      return;
    case 'assistant.run.cancel':
      handleCancelRunMessage({
        connectionState,
        payload,
        webSocket
      });
      return;
    default:
      throw createSocketError(
        'assistant_socket_unknown_message_type',
        `Unsupported assistant socket message type: ${messageType || 'unknown'}.`
      );
  }
}

async function handleAuthenticateMessage({
  authService,
  connectionState,
  payload,
  webSocket
}) {
  const accessToken = readRequiredString(payload?.payload?.accessToken, 'accessToken');
  const authContext = await authService.authenticateToken(accessToken);

  if (!authContext?.user) {
    throw createSocketError('assistant_socket_authentication_failed', 'Assistant socket authentication failed.');
  }

  connectionState.accessToken = accessToken;
  connectionState.user = authContext.user;

  sendEvent(webSocket, {
    type: 'assistant.session.authenticated',
    message: 'Assistant socket authenticated.',
    user: {
      id: authContext.user.id,
      displayName: authContext.user.displayName
    }
  });
}

async function handleCreateRunMessage({
  accountsService,
  assistantService,
  connectionState,
  payload,
  webSocket
}) {
  if (!connectionState.user) {
    throw createSocketError('assistant_socket_authentication_required', 'Authenticate the assistant socket before creating runs.');
  }

  if (connectionState.activeRuns.size > 0) {
    throw createSocketError('assistant_run_already_active', 'Only one assistant run is supported per socket for now.');
  }

  const requestId = String(payload?.requestId || crypto.randomUUID()).trim();
  const accountId = readRequiredString(payload?.accountId, 'accountId');
  const prompt = readRequiredString(payload?.payload?.prompt, 'prompt');
  const localSessionDescriptor = payload?.payload?.localSessionDescriptor || null;
  const localPlannerOverview = payload?.payload?.localPlannerOverview || null;
  const localFullSnapshot = payload?.payload?.localFullSnapshot || null;
  const localHeroesSnapshot = Array.isArray(payload?.payload?.localHeroesSnapshot)
    ? payload.payload.localHeroesSnapshot
    : [];
  const abortController = new AbortController();

  connectionState.activeRuns.set(requestId, abortController);

  sendEvent(webSocket, {
    type: 'assistant.run.accepted',
    requestId,
    accountId,
    status: 'running',
    message: 'Assistant run accepted and starting.'
  });

  void executeAssistantRun({
    abortController,
    accountsService,
    accountId,
    assistantService,
    connectionState,
    localHeroesSnapshot,
    localFullSnapshot,
    localPlannerOverview,
    localSessionDescriptor,
    prompt,
    requestId,
    webSocket
  });
}

function handleCancelRunMessage({
  connectionState,
  payload,
  webSocket: _webSocket
}) {
  const requestId = readRequiredString(payload?.requestId, 'requestId');
  const controller = connectionState.activeRuns.get(requestId);

  if (!controller) {
    throw createSocketError('assistant_run_not_found', 'Assistant run could not be found for cancellation.');
  }

  controller.abort();
}

async function executeAssistantRun({
  abortController,
  accountsService,
  accountId,
  assistantService,
  connectionState,
  localHeroesSnapshot,
  localFullSnapshot,
  localPlannerOverview,
  localSessionDescriptor,
  prompt,
  requestId,
  webSocket
}) {
  const emitRunEvent = (event) => {
    sendEvent(webSocket, {
      ...event,
      requestId,
      accountId
    });
  };
  let answerHeartbeatInterval = null;

  try {
    ensureNotAborted(abortController.signal);

    emitRunEvent({
      type: 'assistant.run.progress',
      phase: 'understanding_request',
      stepIndex: 1,
      stepCount: 5,
      message: 'Understanding your request and identifying the relevant entities.'
    });

    const analysis = assistantService.analyzePrompt({
      prompt,
      localPlannerOverview,
      localFullSnapshot,
      localHeroesSnapshot
    });

    emitRunEvent({
      type: 'assistant.run.progress',
      phase: 'planning_steps',
      stepIndex: 2,
      stepCount: 5,
      message: analysis.summary
    });

    emitRunEvent({
      type: 'assistant.run.tool_started',
      toolName: 'planner_snapshot',
      message: 'Loading the planner snapshot for the selected account.',
      inputSummary: {
        accountId
      }
    });

    const snapshot = await accountsService.getPlannerSnapshot(accountId, connectionState.user.id);

    emitRunEvent({
      type: 'assistant.run.tool_finished',
      toolName: 'planner_snapshot',
      message: 'Planner snapshot loaded.',
      resultSummary: {
        targets: snapshot?.planner?.targets?.length || 0,
        activeCrafts: snapshot?.planner?.crafts?.length || 0,
        activeFusions: snapshot?.planner?.fusions?.length || 0
      }
    });

    ensureNotAborted(abortController.signal);

    if (localSessionDescriptor || localPlannerOverview) {
      emitRunEvent({
        type: 'assistant.run.progress',
        phase: 'querying_live_session',
        stepIndex: 3,
        stepCount: 5,
        message: 'Reviewing the available local game session context.'
      });
    } else {
      emitRunEvent({
        type: 'assistant.run.progress',
        phase: 'querying_planner_data',
        stepIndex: 3,
        stepCount: 5,
        message: 'No local live session context was provided, so this run will rely on planner state only.'
      });
    }

    if (analysis.requestType === 'item_usability_review') {
      const itemUsabilityReview = assistantService.buildItemUsabilityReview({
        analysis,
        localFullSnapshot,
        localHeroesSnapshot
      });

      emitRunEvent({
        type: 'assistant.run.tool_started',
        toolName: 'item_usability_evidence',
        message: `Resolving item usability evidence for ${analysis.itemName || 'the requested item'}.`,
        inputSummary: {
          itemName: analysis.itemName || '',
          liveHeroesAvailable: localHeroesSnapshot.length
        }
      });

      emitRunEvent({
        type: 'assistant.run.tool_finished',
        toolName: 'item_usability_evidence',
        message: itemUsabilityReview?.item
          ? `${itemUsabilityReview.item.name} matched to ${itemUsabilityReview.availableHeroes.length} currently available compatible hero(es).`
          : 'The requested item could not be matched in the live snapshot.',
        resultSummary: {
          itemFound: Boolean(itemUsabilityReview?.item),
          itemTypeCode: itemUsabilityReview?.item?.itemTypeCode || '',
          availableHeroes: itemUsabilityReview?.availableHeroes?.length || 0,
          unavailableHeroes: itemUsabilityReview?.unavailableHeroes?.length || 0
        }
      });

      emitRunEvent({
        type: 'assistant.run.progress',
        phase: 'querying_equipment',
        stepIndex: 4,
        stepCount: 5,
        message: `Checking which heroes expose proficiency for ${analysis.itemName || 'the requested item'}.`
      });
    } else if (analysis.requestType === 'hero_slot_recommendation') {
      const heroSlotRecommendationReview = assistantService.buildHeroSlotRecommendationReview({
        analysis,
        snapshot,
        localFullSnapshot,
        localHeroesSnapshot
      });

      emitRunEvent({
        type: 'assistant.run.tool_started',
        toolName: 'hero_slot_candidates',
        message: `Ranking ${analysis.requestedSlot?.label || 'equipment'} candidates for ${analysis.heroName}.`,
        inputSummary: {
          heroName: analysis.heroName,
          requestedSlot: analysis.requestedSlot?.label || '',
          liveHeroesAvailable: localHeroesSnapshot.length
        }
      });

      emitRunEvent({
        type: 'assistant.run.tool_finished',
        toolName: 'hero_slot_candidates',
        message: heroSlotRecommendationReview?.liveHero
          ? `${heroSlotRecommendationReview.liveHero.name} matched with ${heroSlotRecommendationReview.ownedCandidates.length} owned and ${heroSlotRecommendationReview.craftableCandidates.length} craftable candidate(s).`
          : `No live hero snapshot was available for ${analysis.heroName}.`,
        resultSummary: {
          heroFound: Boolean(heroSlotRecommendationReview?.liveHero),
          requestedTypeCodes: heroSlotRecommendationReview?.requestedTypeCodes?.join('/') || '',
          ownedCandidates: heroSlotRecommendationReview?.ownedCandidates?.length || 0,
          craftableCandidates: heroSlotRecommendationReview?.craftableCandidates?.length || 0,
          bestCandidate: heroSlotRecommendationReview?.bestOverallCandidate?.name || ''
        }
      });

      emitRunEvent({
        type: 'assistant.run.progress',
        phase: 'ranking_candidates',
        stepIndex: 4,
        stepCount: 5,
        message: `Comparing ${analysis.requestedSlot?.label || 'equipment'} candidates against live hero level, proficiency and break chance data.`
      });
    } else if (analysis.heroName) {
      const focusedHeroReview = assistantService.buildFocusedHeroReview({
        analysis,
        snapshot,
        localFullSnapshot,
        localHeroesSnapshot
      });

      emitRunEvent({
        type: 'assistant.run.tool_started',
        toolName: 'focused_hero_evidence',
        message: `Resolving focused live evidence for ${analysis.heroName}.`,
        inputSummary: {
          heroName: analysis.heroName,
          liveHeroesAvailable: localHeroesSnapshot.length
        }
      });

      emitRunEvent({
        type: 'assistant.run.tool_finished',
        toolName: 'focused_hero_evidence',
        message: focusedHeroReview?.summary || `Focused evidence assembled for ${analysis.heroName}.`,
        resultSummary: {
          heroFound: Boolean(focusedHeroReview?.liveHero),
          equippedItems: focusedHeroReview?.equipmentSummary?.equippedCount || 0,
          allBreakChanceZero: Boolean(focusedHeroReview?.equipmentSummary?.allBreakChanceZero),
          highestBreakChance: focusedHeroReview?.equipmentSummary?.highestBreakChance || 0,
          craftableCandidatesAvailable: focusedHeroReview?.localCraftableItems?.length || 0,
          shopInventoryItemsAvailable: focusedHeroReview?.shopInventoryItems?.length || 0
        }
      });

      emitRunEvent({
        type: 'assistant.run.progress',
        phase: 'querying_hero_data',
        stepIndex: 4,
        stepCount: analysis.needsBreakChanceReview ? 6 : 5,
        message: `Reviewing focused hero information for ${analysis.heroName}.`
      });

      if (analysis.needsBreakChanceReview) {
        emitRunEvent({
          type: 'assistant.run.progress',
          phase: 'querying_break_chance_rules',
          stepIndex: 5,
          stepCount: 6,
          message: `Checking break chance implications across ${analysis.heroName}'s equipped gear.`
        });
      }
    } else if (analysis.needsEquipmentReview) {
      emitRunEvent({
        type: 'assistant.run.progress',
        phase: 'querying_equipment',
        stepIndex: 4,
        stepCount: 5,
        message: 'Reviewing the relevant equipment context for this request.'
      });
    } else {
      emitRunEvent({
        type: 'assistant.run.progress',
        phase: 'cross_checking_findings',
        stepIndex: 4,
        stepCount: 5,
        message: 'Cross-checking the gathered facts before answering.'
      });
    }

    ensureNotAborted(abortController.signal);

    emitRunEvent({
      type: 'assistant.run.progress',
      phase: 'forming_answer',
      stepIndex: analysis.needsBreakChanceReview ? 6 : 5,
      stepCount: analysis.needsBreakChanceReview ? 6 : 5,
      message: 'Forming the final answer with the collected evidence.'
    });

    answerHeartbeatInterval = setInterval(() => {
      emitRunEvent({
        type: 'assistant.run.progress',
        phase: 'forming_answer',
        stepIndex: analysis.needsBreakChanceReview ? 6 : 5,
        stepCount: analysis.needsBreakChanceReview ? 6 : 5,
        message: 'Still drafting the answer from the collected evidence.'
      });
    }, 15000);

    const assistantResponse = await assistantService.generateResponse({
      account: snapshot.account,
      snapshot,
      localFullSnapshot,
      prompt,
      localSessionDescriptor,
      localPlannerOverview,
      localHeroesSnapshot,
      signal: abortController.signal,
      analysis
    });

    ensureNotAborted(abortController.signal);

    clearInterval(answerHeartbeatInterval);
    answerHeartbeatInterval = null;

    emitRunEvent({
      type: 'assistant.run.completed',
      model: assistantResponse.model,
      content: assistantResponse.content,
      summary: analysis.summary
    });
  } catch (error) {
    clearInterval(answerHeartbeatInterval);
    answerHeartbeatInterval = null;

    if (abortController.signal.aborted || error?.name === 'AbortError') {
      emitRunEvent({
        type: 'assistant.run.cancelled',
        message: 'Assistant run cancelled.'
      });
      return;
    }

    emitRunEvent({
      type: 'assistant.run.failed',
      code: error?.code || 'assistant_run_failed',
      message: error?.message || 'Assistant run failed unexpectedly.',
      retryable: true
    });
  } finally {
    clearInterval(answerHeartbeatInterval);
    connectionState.activeRuns.delete(requestId);
  }
}

function sendEvent(webSocket, event) {
  if (!webSocket || webSocket.readyState !== 1) {
    return;
  }

  webSocket.send(JSON.stringify({
    timestamp: new Date().toISOString(),
    ...event
  }));
}

function safeCreateRequestUrl(requestUrl, host) {
  try {
    return new URL(requestUrl, `http://${host || 'localhost'}`);
  } catch {
    return null;
  }
}

function ensureNotAborted(signal) {
  if (signal?.aborted) {
    const error = new Error('Assistant run aborted.');
    error.name = 'AbortError';
    throw error;
  }
}

function readRequiredString(value, fieldName) {
  const normalized = String(value || '').trim();

  if (!normalized) {
    throw createSocketError('assistant_socket_validation_error', `${fieldName} is required.`);
  }

  return normalized;
}

function createSocketError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

module.exports = {
  createAssistantWebSocketRuntime
};
