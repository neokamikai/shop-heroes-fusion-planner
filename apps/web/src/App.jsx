import { useEffect, useRef, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  || (import.meta.env.DEV ? 'http://127.0.0.1:3001' : '/shop-heroes-planner/api');
const ITEM_PAGE_SIZE = 12;
const ACCESS_TOKEN_STORAGE_KEY = 'shop_heroes_planner_access_token';
const LOCAL_MCP_BASE_URL_STORAGE_KEY = 'shop_heroes_planner_local_mcp_base_url';
const LOCAL_MCP_DEFAULT_BASE_URL = 'http://127.0.0.1:8787';
const MCP_PROTOCOL_VERSION = '2025-11-25';
const ACCOUNT_FORM_INITIAL_STATE = {
  accountName: '',
  platform: 'steam',
  notes: ''
};
const AUTH_FORM_INITIAL_STATE = {
  displayName: '',
  email: '',
  password: ''
};
const EMAIL_VERIFICATION_CODE_LENGTH = 6;
const EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS = 30;
const WORKSPACE_ITEM_PAGE_SIZE = 24;
const CATALOG_SYNC_PAGE_SIZE = 200;

function createEmptyVerificationCodeDigits() {
  return Array.from({ length: EMAIL_VERIFICATION_CODE_LENGTH }, () => '');
}

const landingHighlights = [
  {
    title: 'Multi-account planning',
    description: 'Separate Steam, mobile, and standalone game progress without mixing inventory, roster, or planning state.'
  },
  {
    title: 'Game-aware setup',
    description: 'The intended flow is to detect a running modded session and pre-link the planner to the correct Shop Heroes account.'
  },
  {
    title: 'Planner evolution',
    description: 'Targets, craft slots, inventory, blueprint readiness, and account-specific progression will converge here over time.'
  }
];

const latestUpdates = [
  'Platform auth now uses JWT issued by the API and stored only for the browser session.',
  'Cloud environment is live with HTTPS, PostgreSQL, and a protected planner workspace.',
  'Seed pipeline loads the ripped catalog with 1038 catalog items and character state foundations.'
];

const roadmapItems = [
  'Post-login account bootstrap that can detect the running game session exposed by the mod.',
  'Workspace modules for targets, inventory, craft slots, and account sync flows.',
  'Public download and installation guidance pages once the full loop is stable enough to expose.'
];

function readAccessToken() {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.sessionStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) || '';
}

function writeAccessToken(token) {
  if (typeof window === 'undefined') {
    return;
  }

  if (!token) {
    window.sessionStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
}

function readLocalMcpBaseUrl() {
  if (typeof window === 'undefined') {
    return LOCAL_MCP_DEFAULT_BASE_URL;
  }

  return window.localStorage.getItem(LOCAL_MCP_BASE_URL_STORAGE_KEY) || LOCAL_MCP_DEFAULT_BASE_URL;
}

function writeLocalMcpBaseUrl(value) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(LOCAL_MCP_BASE_URL_STORAGE_KEY, value);
}

function normalizeLocalMcpBaseUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  return normalized || LOCAL_MCP_DEFAULT_BASE_URL;
}

function normalizeLookupKey(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function buildTierCodeByQualityIndex(tiers) {
  return new Map(
    [...tiers]
      .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
      .map((tier, index) => [index, tier])
  );
}

function buildLocalAvailabilityByQuality(localItem) {
  const map = new Map();

  for (const entry of Array.isArray(localItem?.availableByQuality) ? localItem.availableByQuality : []) {
    map.set(Number(entry.quality), Math.max(0, Math.floor(Number(entry.quantity) || 0)));
  }

  return map;
}

function resolveCatalogItemFromLocalItem(localItem, catalogItemByExternalSlug, catalogItemByName) {
  const slugMatch = catalogItemByExternalSlug.get(String(localItem?.uid || '').trim().toLowerCase());

  if (slugMatch) {
    return slugMatch;
  }

  return catalogItemByName.get(normalizeLookupKey(localItem?.name)) || null;
}

function formatOperationCategoryLabel(category) {
  switch (category) {
    case 'craft':
      return 'Craft';
    case 'fusion':
      return 'Fusion';
    case 'quest':
      return 'Quest';
    case 'trade':
      return 'Trade';
    case 'city_trade':
      return 'City trade';
    default:
      return String(category || 'Operation');
  }
}

function isLocalHeroOperationallyReady(hero) {
  return Boolean(
    hero?.isReady
    && !hero?.isLocked
    && !hero?.isRecruitable
    && !hero?.isInjured
    && !hero?.inQuest
    && !hero?.isHealing
    && !hero?.isBusy
  );
}

function getLocalHeroStatus(hero) {
  if (hero?.isLocked) {
    return 'Locked';
  }

  if (hero?.isRecruitable) {
    return 'Recruitable';
  }

  if (hero?.isInjured) {
    return 'Injured';
  }

  if (hero?.isHealing) {
    return 'Healing';
  }

  if (hero?.inQuest) {
    return 'In quest';
  }

  if (hero?.isBusy) {
    return 'Busy';
  }

  if (hero?.hasBrokenItems) {
    return 'Broken gear';
  }

  if (isLocalHeroOperationallyReady(hero)) {
    return 'Ready';
  }

  return 'Unavailable';
}

function mapInstallationTypeToPlatform(installationType) {
  if (installationType === 'steam') {
    return 'steam';
  }

  if (installationType === 'mobile') {
    return 'mobile';
  }

  return 'desktop';
}

function buildAccountFormFromDescriptor(descriptor) {
  return {
    accountName: descriptor?.account?.displayName || descriptor?.installation?.installationLabel || '',
    platform: mapInstallationTypeToPlatform(descriptor?.installation?.installationType),
    notes: descriptor?.installation?.installationLabel
      ? `Bound from local MCP session on ${descriptor.installation.installationLabel}`
      : ''
  };
}

function buildBindingPayloadFromDescriptor(descriptor) {
  return {
    bindingMode: descriptor?.account?.externalId ? 'account_external_id' : 'manual',
    accountExternalId: descriptor?.account?.externalId || null,
    accountDisplayName: descriptor?.account?.displayName || null,
    installationId: descriptor?.installation?.installationId || null,
    installationType: descriptor?.installation?.installationType || null,
    installationLabel: descriptor?.installation?.installationLabel || null,
    sessionId: descriptor?.runtime?.sessionId || null,
    sessionStartedAt: descriptor?.runtime?.startedAt || null,
    sessionSeenAt: new Date().toISOString()
  };
}

function extractJsonFromMcpToolResponse(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Local MCP returned an empty response.');
  }

  if (payload.result?.structuredContent) {
    return payload.result.structuredContent;
  }

  if (payload.result?.content && Array.isArray(payload.result.content)) {
    const textEntry = payload.result.content.find((entry) => entry?.type === 'text' && typeof entry.text === 'string');

    if (textEntry?.text) {
      try {
        return JSON.parse(textEntry.text);
      } catch {
        throw new Error('Local MCP returned text that could not be parsed as JSON.');
      }
    }
  }

  if (payload.result?.account || payload.result?.installation || payload.result?.runtime) {
    return payload.result;
  }

  throw new Error('Local MCP response format is not supported yet.');
}

async function requestLocalMcpTool(baseUrl, toolName, args = {}) {
  const endpointUrl = `${normalizeLocalMcpBaseUrl(baseUrl)}/mcp`;
  const response = await fetch(endpointUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `planner-${Date.now()}`,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    })
  });

  if (!response.ok) {
    let errorPayload = null;

    try {
      errorPayload = await response.json();
    } catch {
      errorPayload = null;
    }

    const error = new Error(
      errorPayload?.error?.message
      || errorPayload?.message
      || `Local MCP request failed with status ${response.status}.`
    );
    error.statusCode = response.status;
    throw error;
  }

  const payload = await response.json();
  return extractJsonFromMcpToolResponse(payload);
}

async function requestLocalBrowserJson(baseUrl, routePath, query = {}) {
  const endpointUrl = new URL(`${normalizeLocalMcpBaseUrl(baseUrl)}${routePath}`);

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      endpointUrl.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(endpointUrl.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    let errorPayload = null;

    try {
      errorPayload = await response.json();
    } catch {
      errorPayload = null;
    }

    const error = new Error(errorPayload?.message || `Local browser endpoint failed with status ${response.status}.`);
    error.statusCode = response.status;
    throw error;
  }

  return response.json();
}

async function requestJson(path, options = {}) {
  const token = options.accessToken ?? readAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers,
    ...options
  });

  if (!response.ok) {
    let errorPayload = null;

    try {
      errorPayload = await response.json();
    } catch {
      errorPayload = null;
    }

    const error = new Error(errorPayload?.message || `Request failed with status ${response.status}.`);
    error.statusCode = response.status;
    error.code = errorPayload?.code;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function fetchLocalFullSnapshot(baseUrl) {
  try {
    return await requestLocalBrowserJson(baseUrl, '/browser/full-snapshot', {
      forceRefresh: true
    });
  } catch {
    return requestLocalMcpTool(baseUrl, 'get_full_snapshot', {
      forceRefresh: true
    });
  }
}

function buildAssistantWebSocketUrl(apiBaseUrl) {
  const baseUrl = new URL(apiBaseUrl, window.location.origin);
  const protocol = baseUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  const normalizedPath = baseUrl.pathname.replace(/\/+$/, '');

  return `${protocol}//${baseUrl.host}${normalizedPath}/assistant/ws`;
}

function createAssistantTimelineEntry(event) {
  return {
    id: `${event.type}-${event.requestId || 'session'}-${event.timestamp || Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: event.type,
    phase: event.phase || '',
    message: event.message || '',
    toolName: event.toolName || '',
    timestamp: event.timestamp || new Date().toISOString(),
    inputSummary: event.inputSummary || null,
    resultSummary: event.resultSummary || null
  };
}

function formatAssistantSummary(summary) {
  if (!summary || typeof summary !== 'object') {
    return '';
  }

  return Object.entries(summary)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' • ');
}

function formatAssistantPhaseLabel(phase) {
  switch (phase) {
    case 'understanding_request':
      return 'Understanding';
    case 'planning_steps':
      return 'Planning';
    case 'querying_planner_data':
      return 'Planner data';
    case 'querying_live_session':
      return 'Live session';
    case 'querying_hero_data':
      return 'Hero review';
    case 'querying_equipment':
      return 'Equipment review';
    case 'querying_break_chance_rules':
      return 'Break chance';
    case 'cross_checking_findings':
      return 'Cross-check';
    case 'forming_answer':
      return 'Final answer';
    default:
      return 'Assistant';
  }
}

function formatDate(value) {
  if (!value) {
    return 'Not available';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function App() {
  const [accessToken, setAccessToken] = useState(() => readAccessToken());
  const [session, setSession] = useState(null);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);
  const [verificationCodeDigits, setVerificationCodeDigits] = useState(() => createEmptyVerificationCodeDigits());
  const [isSubmittingVerificationCode, setIsSubmittingVerificationCode] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [verificationResendCooldownSeconds, setVerificationResendCooldownSeconds] = useState(0);
  const [authMode, setAuthMode] = useState('signin');
  const [authForm, setAuthForm] = useState(AUTH_FORM_INITIAL_STATE);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [publicStats, setPublicStats] = useState({
    tiers: 0,
    categories: 0,
    catalogItems: 0
  });
  const [accounts, setAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [categories, setCategories] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [catalogItems, setCatalogItems] = useState([]);
  const [catalogPagination, setCatalogPagination] = useState({
    total: 0,
    limit: ITEM_PAGE_SIZE,
    offset: 0
  });
  const [catalogFilters, setCatalogFilters] = useState({
    search: '',
    category: ''
  });
  const [localMcpBaseUrl, setLocalMcpBaseUrl] = useState(() => readLocalMcpBaseUrl());
  const [localSessionDescriptor, setLocalSessionDescriptor] = useState(null);
  const [localPlannerOverview, setLocalPlannerOverview] = useState(null);
  const [localHeroesSnapshot, setLocalHeroesSnapshot] = useState([]);
  const [localFullSnapshot, setLocalFullSnapshot] = useState(null);
  const [isDetectingLocalSession, setIsDetectingLocalSession] = useState(false);
  const [isLoadingLocalPlannerOverview, setIsLoadingLocalPlannerOverview] = useState(false);
  const [isBindingLocalSession, setIsBindingLocalSession] = useState(false);
  const [isSyncingLocalCharacters, setIsSyncingLocalCharacters] = useState(false);
  const [isSyncingLocalPlannerData, setIsSyncingLocalPlannerData] = useState(false);
  const [localSessionMessage, setLocalSessionMessage] = useState('');
  const [assistantPrompt, setAssistantPrompt] = useState('');
  const [assistantResponse, setAssistantResponse] = useState('');
  const [assistantModel, setAssistantModel] = useState('');
  const [assistantTimeline, setAssistantTimeline] = useState([]);
  const [assistantRunId, setAssistantRunId] = useState('');
  const [assistantRunStatus, setAssistantRunStatus] = useState('idle');
  const [assistantConnectionState, setAssistantConnectionState] = useState('disconnected');
  const [isAssistantLoading, setIsAssistantLoading] = useState(false);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState('overview');
  const [characterDrafts, setCharacterDrafts] = useState({});
  const [savingCharacterId, setSavingCharacterId] = useState('');
  const [workspaceItemFilters, setWorkspaceItemFilters] = useState({
    search: '',
    category: ''
  });
  const [workspaceItems, setWorkspaceItems] = useState([]);
  const [workspaceItemsPagination, setWorkspaceItemsPagination] = useState({
    total: 0,
    limit: WORKSPACE_ITEM_PAGE_SIZE,
    offset: 0
  });
  const [isLoadingWorkspaceItems, setIsLoadingWorkspaceItems] = useState(false);
  const [selectedWorkspaceItemId, setSelectedWorkspaceItemId] = useState(null);
  const [itemEditorDraft, setItemEditorDraft] = useState(null);
  const [isSavingItemEditor, setIsSavingItemEditor] = useState(false);
  const [accountForm, setAccountForm] = useState(ACCOUNT_FORM_INITIAL_STATE);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const verificationCodeInputRefs = useRef([]);
  const catalogSyncItemsRef = useRef(null);
  const assistantSocketRef = useRef(null);
  const assistantSocketConnectPromiseRef = useRef(null);
  const assistantRunStatusRef = useRef('idle');
  const assistantRunIdRef = useRef('');

  useEffect(() => {
    writeAccessToken(accessToken);
  }, [accessToken]);

  useEffect(() => {
    writeLocalMcpBaseUrl(normalizeLocalMcpBaseUrl(localMcpBaseUrl));
  }, [localMcpBaseUrl]);

  useEffect(() => {
    if (verificationResendCooldownSeconds <= 0) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setVerificationResendCooldownSeconds((currentValue) => Math.max(0, currentValue - 1));
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [verificationResendCooldownSeconds]);

  useEffect(() => {
    void initializeSurface();
  }, []);

  useEffect(() => {
    assistantRunStatusRef.current = assistantRunStatus;
  }, [assistantRunStatus]);

  useEffect(() => {
    assistantRunIdRef.current = assistantRunId;
  }, [assistantRunId]);

  useEffect(() => () => {
    closeAssistantSocket();
  }, []);

  useEffect(() => {
    if (session && accessToken) {
      return;
    }

    closeAssistantSocket();
  }, [session, accessToken]);

  useEffect(() => {
    if (!session || !accessToken) {
      return;
    }

    void loadWorkspaceData();
  }, [session, accessToken]);

  useEffect(() => {
    if (!session || !accessToken) {
      return;
    }

    void loadCatalogItems();
  }, [catalogFilters, session, accessToken]);

  useEffect(() => {
    if (!session || !accessToken) {
      return;
    }

    if (!selectedAccountId) {
      setSelectedSnapshot(null);
      return;
    }

    void loadPlannerSnapshot(selectedAccountId);
  }, [selectedAccountId, session, accessToken]);

  useEffect(() => {
    if (!selectedSnapshot) {
      setCharacterDrafts({});
      return;
    }

    setCharacterDrafts(
      Object.fromEntries(
        selectedSnapshot.characters.map((character) => [
          character.characterId,
          {
            isUnlocked: character.isUnlocked,
            level: String(character.level)
          }
        ])
      )
    );
  }, [selectedSnapshot]);

  useEffect(() => {
    if (!session || !accessToken || activeWorkspaceTab !== 'items') {
      return;
    }

    void loadWorkspaceItems();
  }, [workspaceItemFilters, activeWorkspaceTab, session, accessToken]);

  useEffect(() => {
    const boundAccount = accounts.find((account) => account.id === selectedAccountId) || null;

    if (!session || !accessToken || !boundAccount || !boundAccount.mcpBindingMode) {
      return undefined;
    }

    let isCancelled = false;

    const pollLocalState = async () => {
      try {
        let descriptor;
        let overview;

        try {
          [descriptor, overview] = await Promise.all([
            requestLocalBrowserJson(localMcpBaseUrl, '/browser/session-descriptor', {
              forceRefresh: true
            }),
            requestLocalBrowserJson(localMcpBaseUrl, '/browser/planner-overview', {
              forceRefresh: true
            })
          ]);
        } catch {
          return;
        }

        if (isCancelled) {
          return;
        }

        setLocalSessionDescriptor(descriptor);
        setLocalPlannerOverview(overview);

        const isMatchingBoundSession = boundAccount.mcpAccountExternalId
          ? boundAccount.mcpAccountExternalId === descriptor.account?.externalId
          : (
              boundAccount.mcpInstallationId
              && boundAccount.mcpInstallationId === descriptor.installation?.installationId
            );

        if (isMatchingBoundSession) {
          setLocalSessionMessage('Local session detected and linked. Automatic background sync is limited to lightweight overview refreshes for now.');
        }
      } catch {
        return;
      }
    };

    void pollLocalState();
    const intervalId = window.setInterval(() => {
      void pollLocalState();
    }, 45000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [session, accessToken, accounts, selectedAccountId, localMcpBaseUrl, selectedSnapshot, tiers]);

  useEffect(() => {
    if (!workspaceItems.length) {
      setSelectedWorkspaceItemId(null);
      return;
    }

    setSelectedWorkspaceItemId((currentValue) => (
      workspaceItems.some((item) => item.id === currentValue)
        ? currentValue
        : workspaceItems[0].id
    ));
  }, [workspaceItems]);

  useEffect(() => {
    if (!selectedWorkspaceItemId || !selectedSnapshot) {
      setItemEditorDraft(null);
      return;
    }

    const inventoryRows = selectedSnapshot.inventory.filter((entry) => entry.itemId === selectedWorkspaceItemId);
    const itemState = selectedSnapshot.itemStates.find((entry) => entry.itemId === selectedWorkspaceItemId);

    setItemEditorDraft({
      itemId: selectedWorkspaceItemId,
      ownedBlueprint: Boolean(itemState?.ownedBlueprint),
      craftUnlocked: Boolean(itemState?.craftUnlocked),
      quantitiesByTierId: Object.fromEntries(
        tiers.map((tier) => {
          const inventoryRow = inventoryRows.find((entry) => entry.tierId === tier.id);

          return [tier.id, String(inventoryRow?.quantity ?? 0)];
        })
      )
    });
  }, [selectedWorkspaceItemId, selectedSnapshot, tiers]);

  useEffect(() => {
    if (session?.emailVerified) {
      setVerificationCodeDigits(createEmptyVerificationCodeDigits());
      setVerificationResendCooldownSeconds(0);
      return;
    }

    if (session && !session.emailVerified) {
      window.setTimeout(() => {
        focusVerificationCodeInput(0);
      }, 0);
    }
  }, [session]);

  async function initializeSurface() {
    await Promise.all([loadPublicStats(), loadCurrentSession()]);
    await consumeEmailVerificationTokenFromUrl();
  }

  async function consumeEmailVerificationTokenFromUrl() {
    if (typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);
    const token = url.searchParams.get('verifyEmailToken');

    if (!token) {
      return;
    }

    setIsVerifyingEmail(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      const response = await requestJson('/auth/verify-email', {
        method: 'POST',
        accessToken: '',
        body: JSON.stringify({ token })
      });

      setSession((currentValue) => (
        currentValue?.id === response.user.id
          ? response.user
          : currentValue
      ));
      setVerificationCodeDigits(createEmptyVerificationCodeDigits());
      setSuccessMessage('Your email has been confirmed successfully.');
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      url.searchParams.delete('verifyEmailToken');
      window.history.replaceState({}, '', url.toString());
      setIsVerifyingEmail(false);
    }
  }

  async function loadPublicStats() {
    try {
      const [categoriesResponse, tiersResponse, catalogResponse] = await Promise.all([
        requestJson('/catalog/categories', { accessToken: '' }),
        requestJson('/catalog/tiers', { accessToken: '' }),
        requestJson(`/catalog/items?${new URLSearchParams({ limit: String(ITEM_PAGE_SIZE) }).toString()}`, { accessToken: '' })
      ]);

      setPublicStats({
        tiers: tiersResponse.length,
        categories: categoriesResponse.length,
        catalogItems: catalogResponse.pagination.total
      });
    } catch {
      setPublicStats({
        tiers: 0,
        categories: 0,
        catalogItems: 0
      });
    }
  }

  async function loadCurrentSession() {
    setIsCheckingSession(true);

    if (!accessToken) {
      setSession(null);
      setIsCheckingSession(false);
      return;
    }

    try {
      const response = await requestJson('/auth/me', {
        accessToken
      });
      setSession(response.user);
    } catch (error) {
      if (error.statusCode === 401) {
        clearAuthentication();
        return;
      }

      setErrorMessage(error.message);
      clearAuthentication();
    } finally {
      setIsCheckingSession(false);
    }
  }

  async function loadWorkspaceData() {
    setErrorMessage('');
    setIsLoadingAccounts(true);

    try {
      const [accountsResponse, categoriesResponse, tiersResponse] = await Promise.all([
        requestJson('/accounts', { accessToken }),
        requestJson('/catalog/categories', { accessToken: '' }),
        requestJson('/catalog/tiers', { accessToken: '' })
      ]);

      setAccounts(accountsResponse);
      setCategories(categoriesResponse);
      setTiers(tiersResponse);
      setSelectedAccountId((currentValue) => (
        accountsResponse.some((account) => account.id === currentValue)
          ? currentValue
          : (accountsResponse[0]?.id || null)
      ));
    } catch (error) {
      if (error.statusCode === 401) {
        handleSessionExpired();
        return;
      }

      setErrorMessage(error.message);
    } finally {
      setIsLoadingAccounts(false);
    }
  }

  async function loadCatalogItems() {
    setErrorMessage('');
    setIsLoadingCatalog(true);

    try {
      const query = new URLSearchParams({
        limit: String(ITEM_PAGE_SIZE)
      });

      if (catalogFilters.search.trim()) {
        query.set('search', catalogFilters.search.trim());
      }

      if (catalogFilters.category) {
        query.set('category', catalogFilters.category);
      }

      const response = await requestJson(`/catalog/items?${query.toString()}`, {
        accessToken: ''
      });
      setCatalogItems(response.data);
      setCatalogPagination(response.pagination);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoadingCatalog(false);
    }
  }

  async function loadPlannerSnapshot(accountId) {
    setErrorMessage('');
    setIsLoadingSnapshot(true);

    try {
      const response = await requestJson(`/accounts/${accountId}/planner`, {
        accessToken
      });
      setSelectedSnapshot(response);
    } catch (error) {
      if (error.statusCode === 401) {
        handleSessionExpired();
        return;
      }

      setErrorMessage(error.message);
      setSelectedSnapshot(null);
    } finally {
      setIsLoadingSnapshot(false);
    }
  }

  async function refreshSelectedAccountSnapshot(accountId = selectedAccountId) {
    if (!accountId) {
      return;
    }

    await loadPlannerSnapshot(accountId);
  }

  async function loadWorkspaceItems() {
    setErrorMessage('');
    setIsLoadingWorkspaceItems(true);

    try {
      const query = new URLSearchParams({
        limit: String(WORKSPACE_ITEM_PAGE_SIZE)
      });

      if (workspaceItemFilters.search.trim()) {
        query.set('search', workspaceItemFilters.search.trim());
      }

      if (workspaceItemFilters.category) {
        query.set('category', workspaceItemFilters.category);
      }

      const response = await requestJson(`/catalog/items?${query.toString()}`, {
        accessToken: ''
      });

      setWorkspaceItems(response.data);
      setWorkspaceItemsPagination(response.pagination);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsLoadingWorkspaceItems(false);
    }
  }

  async function fetchAllCatalogItemsForSync() {
    if (Array.isArray(catalogSyncItemsRef.current) && catalogSyncItemsRef.current.length) {
      return catalogSyncItemsRef.current;
    }

    const allItems = [];
    let offset = 0;
    let total = 0;

    do {
      const query = new URLSearchParams({
        limit: String(CATALOG_SYNC_PAGE_SIZE),
        offset: String(offset)
      });

      const response = await requestJson(`/catalog/items?${query.toString()}`, {
        accessToken: ''
      });

      allItems.push(...(Array.isArray(response.data) ? response.data : []));
      total = Number(response.pagination?.total || allItems.length);
      offset += Number(response.pagination?.limit || CATALOG_SYNC_PAGE_SIZE);
    } while (allItems.length < total);

    catalogSyncItemsRef.current = allItems;
    return allItems;
  }

  async function handleDetectLocalSession() {
    setErrorMessage('');
    setSuccessMessage('');
    setLocalSessionMessage('');
    setIsDetectingLocalSession(true);

    try {
      let descriptor;

      try {
        descriptor = await requestLocalBrowserJson(localMcpBaseUrl, '/browser/session-descriptor', {
          forceRefresh: true
        });
      } catch {
        descriptor = await requestLocalMcpTool(localMcpBaseUrl, 'get_session_descriptor', {
          forceRefresh: true
        });
      }

      setLocalSessionDescriptor(descriptor);
      setAccountForm((currentValue) => ({
        ...currentValue,
        ...buildAccountFormFromDescriptor(descriptor)
      }));
      setLocalSessionMessage('Local Shop Heroes session detected. The bootstrap form was pre-filled from the running game.');
    } catch (error) {
      setLocalSessionDescriptor(null);
      setLocalSessionMessage(
        `${error.message} If the local MCP is running but this still fails in the browser, the local HTTP bridge likely still needs browser-access headers enabled.`
      );
    } finally {
      setIsDetectingLocalSession(false);
    }
  }

  function handleApplyDetectedSessionToForm() {
    if (!localSessionDescriptor) {
      return;
    }

    setAccountForm((currentValue) => ({
      ...currentValue,
      ...buildAccountFormFromDescriptor(localSessionDescriptor)
    }));
    setLocalSessionMessage('Detected session applied to the bootstrap form.');
  }

  async function handleBindDetectedSessionToAccount(accountId) {
    if (!accountId || !localSessionDescriptor) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsBindingLocalSession(true);

    try {
      await requestJson(`/accounts/${accountId}/mcp-binding`, {
        method: 'PUT',
        accessToken,
        body: JSON.stringify(buildBindingPayloadFromDescriptor(localSessionDescriptor))
      });

      const refreshedAccounts = await requestJson('/accounts', {
        accessToken
      });

      setAccounts(refreshedAccounts);
      await refreshSelectedAccountSnapshot(accountId);
      setSuccessMessage('Local MCP session is now bound to this planner account.');
    } catch (error) {
      if (error.statusCode === 401) {
        handleSessionExpired();
        return;
      }

      setErrorMessage(error.message);
    } finally {
      setIsBindingLocalSession(false);
    }
  }

  async function handleLoadLocalPlannerOverview() {
    setErrorMessage('');
    setSuccessMessage('');
    setLocalSessionMessage('');
    setIsLoadingLocalPlannerOverview(true);

    try {
      let overview;
      let fullSnapshot = null;

      try {
        overview = await requestLocalBrowserJson(localMcpBaseUrl, '/browser/planner-overview', {
          forceRefresh: true
        });
      } catch {
        overview = await requestLocalMcpTool(localMcpBaseUrl, 'get_planner_overview', {
          forceRefresh: true
        });
      }

      try {
        fullSnapshot = await fetchLocalFullSnapshot(localMcpBaseUrl);
      } catch {
        fullSnapshot = null;
      }

      setLocalPlannerOverview(overview);
      if (fullSnapshot) {
        const normalizedSnapshot = fullSnapshot?.snapshot || fullSnapshot;
        const localHeroes = Array.isArray(normalizedSnapshot?.heroes) ? normalizedSnapshot.heroes : [];
        setLocalFullSnapshot(normalizedSnapshot);
        setLocalHeroesSnapshot(localHeroes);
      }
      setLocalSessionMessage('Local planner overview refreshed from the running game session.');
    } catch (error) {
      setLocalPlannerOverview(null);
      setLocalSessionMessage(
        `${error.message} If this is happening from the remote planner URL, the local MCP HTTP server probably still needs browser-access support.`
      );
    } finally {
      setIsLoadingLocalPlannerOverview(false);
    }
  }

  async function handleSyncCharactersFromLocal(options = {}) {
    if (!selectedAccountId || !selectedSnapshot) {
      return;
    }

    const { silent = false, suppressLoading = false } = options;

    if (!silent) {
      setErrorMessage('');
      setSuccessMessage('');
    }

    if (!suppressLoading) {
      setIsSyncingLocalCharacters(true);
    }

    try {
      let fullSnapshot;

      try {
        fullSnapshot = await requestLocalBrowserJson(localMcpBaseUrl, '/browser/full-snapshot', {
          forceRefresh: true
        });
      } catch {
        fullSnapshot = await requestLocalMcpTool(localMcpBaseUrl, 'get_full_snapshot', {
          forceRefresh: true
        });
      }
      const normalizedSnapshot = fullSnapshot?.snapshot || fullSnapshot;
      const localHeroes = Array.isArray(normalizedSnapshot?.heroes) ? normalizedSnapshot.heroes : [];
      setLocalFullSnapshot(normalizedSnapshot);
      setLocalHeroesSnapshot(localHeroes);
      const accountCharacters = Array.isArray(selectedSnapshot.characters) ? selectedSnapshot.characters : [];
      const characterByKey = new Map();

      accountCharacters.forEach((character) => {
        characterByKey.set(normalizeLookupKey(character.characterName), character);
        characterByKey.set(normalizeLookupKey(character.characterCode), character);
      });

      const updates = localHeroes
        .map((hero) => {
          const matchingCharacter = characterByKey.get(normalizeLookupKey(hero.name));

          if (!matchingCharacter) {
            return null;
          }

          const nextUnlocked = !hero.isLocked;
          const nextLevel = Number(hero.level || 1);

          if (
            matchingCharacter.isUnlocked === nextUnlocked
            && Number(matchingCharacter.level) === nextLevel
          ) {
            return null;
          }

          return {
            characterId: matchingCharacter.characterId,
            isUnlocked: nextUnlocked,
            level: Number.isInteger(nextLevel) && nextLevel > 0 ? nextLevel : 1
          };
        })
        .filter(Boolean);

      for (const update of updates) {
        await requestJson(`/accounts/${selectedAccountId}/characters`, {
          method: 'PUT',
          accessToken,
          body: JSON.stringify(update)
        });
      }

      await refreshSelectedAccountSnapshot(selectedAccountId);
      if (!silent) {
        setSuccessMessage(
          updates.length
            ? `${updates.length} character states were synchronized from the running game session.`
            : 'Character roster was already aligned with the running game session.'
        );
      }
    } catch (error) {
      if (error.statusCode === 401) {
        handleSessionExpired();
        return;
      }

      if (!silent) {
        setErrorMessage(error.message);
      }
    } finally {
      if (!suppressLoading) {
        setIsSyncingLocalCharacters(false);
      }
    }
  }

  async function handleSyncPlannerStateFromLocal(options = {}) {
    if (!selectedAccountId || !selectedSnapshot) {
      return;
    }

    const { silent = false, suppressLoading = false } = options;

    if (!silent) {
      setErrorMessage('');
      setSuccessMessage('');
    }

    if (!suppressLoading) {
      setIsSyncingLocalPlannerData(true);
    }

    try {
      let fullSnapshot;

      try {
        fullSnapshot = await requestLocalBrowserJson(localMcpBaseUrl, '/browser/full-snapshot', {
          forceRefresh: true
        });
      } catch {
        fullSnapshot = await requestLocalMcpTool(localMcpBaseUrl, 'get_full_snapshot', {
          forceRefresh: true
        });
      }

      const normalizedSnapshot = fullSnapshot?.snapshot || fullSnapshot;
      const localHeroes = Array.isArray(normalizedSnapshot?.heroes) ? normalizedSnapshot.heroes : [];
      const localCraftableItems = Array.isArray(normalizedSnapshot?.craftableItems) ? normalizedSnapshot.craftableItems : [];
      setLocalHeroesSnapshot(localHeroes);

      const accountCharacters = Array.isArray(selectedSnapshot.characters) ? selectedSnapshot.characters : [];
      const characterByKey = new Map();

      accountCharacters.forEach((character) => {
        characterByKey.set(normalizeLookupKey(character.characterName), character);
        characterByKey.set(normalizeLookupKey(character.characterCode), character);
      });

      const characterUpdates = localHeroes
        .map((hero) => {
          const matchingCharacter = characterByKey.get(normalizeLookupKey(hero.name));

          if (!matchingCharacter) {
            return null;
          }

          const nextUnlocked = !hero.isLocked;
          const nextLevel = Number(hero.level || 1);

          if (
            matchingCharacter.isUnlocked === nextUnlocked
            && Number(matchingCharacter.level) === nextLevel
          ) {
            return null;
          }

          return {
            characterId: matchingCharacter.characterId,
            isUnlocked: nextUnlocked,
            level: Number.isInteger(nextLevel) && nextLevel > 0 ? nextLevel : 1
          };
        })
        .filter(Boolean);

      if (characterUpdates.length) {
        await Promise.all(
          characterUpdates.map((update) => requestJson(`/accounts/${selectedAccountId}/characters`, {
            method: 'PUT',
            accessToken,
            body: JSON.stringify(update)
          }))
        );
      }

      const catalogItems = await fetchAllCatalogItemsForSync();
      const catalogItemByExternalSlug = new Map(
        catalogItems.map((item) => [String(item.externalSlug || '').trim().toLowerCase(), item])
      );
      const catalogItemByName = new Map(
        catalogItems.map((item) => [normalizeLookupKey(item.name), item])
      );
      const itemStateByItemId = new Map(
        (Array.isArray(selectedSnapshot.itemStates) ? selectedSnapshot.itemStates : [])
          .map((itemState) => [itemState.itemId, itemState])
      );
      const inventoryByItemTier = new Map(
        (Array.isArray(selectedSnapshot.inventory) ? selectedSnapshot.inventory : [])
          .map((entry) => [`${entry.itemId}:${entry.tierId}`, Number(entry.quantity || 0)])
      );
      const tierByQualityIndex = buildTierCodeByQualityIndex(tiers);
      const itemStateUpdates = [];
      const inventoryUpdates = [];

      localCraftableItems.forEach((localItem) => {
        const catalogItem = resolveCatalogItemFromLocalItem(localItem, catalogItemByExternalSlug, catalogItemByName);

        if (!catalogItem) {
          return;
        }

        const existingItemState = itemStateByItemId.get(catalogItem.id);
        const nextCraftUnlocked = Boolean(
          existingItemState?.craftUnlocked
          || localItem.canCraft
          || Number(localItem.craftedCount || 0) > 0
        );
        const nextOwnedBlueprint = Boolean(existingItemState?.ownedBlueprint);

        const shouldPersistItemState = Boolean(existingItemState) || nextOwnedBlueprint || nextCraftUnlocked;

        if (
          shouldPersistItemState
          && (
            !existingItemState
            || Boolean(existingItemState.ownedBlueprint) !== nextOwnedBlueprint
            || Boolean(existingItemState.craftUnlocked) !== nextCraftUnlocked
          )
        ) {
          itemStateUpdates.push({
            itemId: catalogItem.id,
            ownedBlueprint: nextOwnedBlueprint,
            craftUnlocked: nextCraftUnlocked
          });
        }

        const availabilityByQuality = buildLocalAvailabilityByQuality(localItem);

        for (const [qualityIndex, tier] of tierByQualityIndex.entries()) {
          const quantity = availabilityByQuality.get(Number(qualityIndex)) ?? 0;
          const inventoryKey = `${catalogItem.id}:${tier.id}`;
          const currentQuantity = inventoryByItemTier.get(inventoryKey) ?? 0;

          if (currentQuantity === quantity) {
            continue;
          }

          inventoryUpdates.push({
            itemId: catalogItem.id,
            tierId: tier.id,
            quantity
          });
        }
      });

      if (itemStateUpdates.length) {
        await requestJson(`/accounts/${selectedAccountId}/item-states-bulk`, {
          method: 'PUT',
          accessToken,
          body: JSON.stringify({
            entries: itemStateUpdates
          })
        });
      }

      if (inventoryUpdates.length) {
        await requestJson(`/accounts/${selectedAccountId}/inventory-bulk`, {
          method: 'PUT',
          accessToken,
          body: JSON.stringify({
            entries: inventoryUpdates
          })
        });
      }

      await refreshSelectedAccountSnapshot(selectedAccountId);

      if (!silent) {
        const summaryParts = [];

        summaryParts.push(
          characterUpdates.length
            ? `${characterUpdates.length} roster updates`
            : 'roster already aligned'
        );
        summaryParts.push(
          itemStateUpdates.length
            ? `${itemStateUpdates.length} item progression updates`
            : 'item progression already aligned'
        );
        summaryParts.push(
          inventoryUpdates.length
            ? `${inventoryUpdates.length} inventory stack updates`
            : 'inventory already aligned'
        );

        setSuccessMessage(`Local game sync completed: ${summaryParts.join(', ')}.`);
      }
    } catch (error) {
      if (error.statusCode === 401) {
        handleSessionExpired();
        return;
      }

      if (!silent) {
        setErrorMessage(error.message);
      }
    } finally {
      if (!suppressLoading) {
        setIsSyncingLocalPlannerData(false);
      }
    }
  }

  async function handleAssistantSubmit(event) {
    event.preventDefault();

    if (!selectedAccountId) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setAssistantResponse('');
    setAssistantModel('');
    setAssistantTimeline([]);
    setAssistantRunStatus('queued');
    setIsAssistantLoading(true);

    try {
      let nextLocalHeroesSnapshot = localHeroesSnapshot;
      let nextLocalFullSnapshot = localFullSnapshot;

      if (
        !Array.isArray(nextLocalHeroesSnapshot)
        || nextLocalHeroesSnapshot.length === 0
        || !nextLocalFullSnapshot
      ) {
        const fullSnapshot = await fetchLocalFullSnapshot(localMcpBaseUrl);
        const normalizedSnapshot = fullSnapshot?.snapshot || fullSnapshot;
        nextLocalFullSnapshot = normalizedSnapshot;
        nextLocalHeroesSnapshot = Array.isArray(normalizedSnapshot?.heroes) ? normalizedSnapshot.heroes : [];
        setLocalFullSnapshot(nextLocalFullSnapshot);
        setLocalHeroesSnapshot(nextLocalHeroesSnapshot);
      }

      const webSocket = await ensureAssistantSocketConnected();
      const requestId = crypto.randomUUID();

      setAssistantRunId(requestId);

      webSocket.send(JSON.stringify({
        type: 'assistant.run.create',
        requestId,
        accountId: selectedAccountId,
        timestamp: new Date().toISOString(),
        payload: {
          prompt: assistantPrompt,
          localSessionDescriptor,
          localPlannerOverview,
          localFullSnapshot: nextLocalFullSnapshot,
          localHeroesSnapshot: nextLocalHeroesSnapshot,
          clientContext: {
            activeTab: activeWorkspaceTab
          }
        }
      }));
    } catch (error) {
      if (error.statusCode === 401) {
        handleSessionExpired();
        return;
      }

      setErrorMessage(error.message);
      setIsAssistantLoading(false);
    }
  }

  function handleAssistantSocketEvent(message) {
    switch (message.type) {
      case 'assistant.session.connected':
        setAssistantConnectionState('connected');
        return;
      case 'assistant.session.authenticated':
        setAssistantConnectionState('connected');
        return;
      case 'assistant.session.failed':
        setAssistantConnectionState('disconnected');
        setIsAssistantLoading(false);
        setErrorMessage(message.message || 'Assistant socket authentication failed.');
        if (message.code === 'assistant_socket_authentication_failed') {
          handleSessionExpired();
        }
        return;
      case 'assistant.run.accepted':
        setAssistantRunId(message.requestId || '');
        setAssistantRunStatus(message.status || 'running');
        setAssistantTimeline((currentValue) => [...currentValue, createAssistantTimelineEntry(message)]);
        return;
      case 'assistant.run.progress':
      case 'assistant.run.tool_started':
      case 'assistant.run.tool_finished':
        setAssistantRunStatus('running');
        setAssistantTimeline((currentValue) => [...currentValue, createAssistantTimelineEntry(message)]);
        return;
      case 'assistant.run.completed':
        setAssistantRunStatus('completed');
        setAssistantResponse(message.content || '');
        setAssistantModel(message.model || '');
        setAssistantTimeline((currentValue) => [...currentValue, createAssistantTimelineEntry(message)]);
        setIsAssistantLoading(false);
        return;
      case 'assistant.run.failed':
        setAssistantRunStatus('failed');
        setAssistantTimeline((currentValue) => [...currentValue, createAssistantTimelineEntry(message)]);
        setIsAssistantLoading(false);
        setErrorMessage(message.message || 'Assistant run failed.');
        return;
      case 'assistant.run.cancelled':
        setAssistantRunStatus('cancelled');
        setAssistantTimeline((currentValue) => [...currentValue, createAssistantTimelineEntry(message)]);
        setIsAssistantLoading(false);
        return;
      default:
        return;
    }
  }

  async function ensureAssistantSocketConnected() {
    if (assistantSocketRef.current?.readyState === window.WebSocket.OPEN && assistantSocketRef.current.__assistantAuthenticated) {
      return assistantSocketRef.current;
    }

    if (assistantSocketConnectPromiseRef.current) {
      return assistantSocketConnectPromiseRef.current;
    }

    const socketUrl = buildAssistantWebSocketUrl(API_BASE_URL);

    setAssistantConnectionState('connecting');

    assistantSocketConnectPromiseRef.current = new Promise((resolve, reject) => {
      const webSocket = new window.WebSocket(socketUrl);

      assistantSocketRef.current = webSocket;
      webSocket.__assistantAuthenticated = false;
      webSocket.__assistantManualClose = false;

      const cleanup = () => {
        assistantSocketConnectPromiseRef.current = null;
      };

      webSocket.addEventListener('open', () => {
        setAssistantConnectionState('authenticating');
        webSocket.send(JSON.stringify({
          type: 'assistant.session.authenticate',
          timestamp: new Date().toISOString(),
          payload: {
            accessToken
          }
        }));
      });

      webSocket.addEventListener('message', (event) => {
        let message;

        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }

        if (message.type === 'assistant.session.authenticated') {
          webSocket.__assistantAuthenticated = true;
          setAssistantConnectionState('connected');
          cleanup();
          resolve(webSocket);
        }

        if (message.type === 'assistant.session.failed' && !webSocket.__assistantAuthenticated) {
          cleanup();
          reject(new Error(message.message || 'Assistant socket authentication failed.'));
        }

        handleAssistantSocketEvent(message);
      });

      webSocket.addEventListener('close', () => {
        assistantSocketRef.current = null;
        cleanup();
        setAssistantConnectionState('disconnected');
        setIsAssistantLoading(false);

        if (!webSocket.__assistantManualClose && assistantRunStatusRef.current === 'running') {
          setAssistantRunStatus('failed');
          setAssistantTimeline((currentValue) => [
            ...currentValue,
            createAssistantTimelineEntry({
              type: 'assistant.run.failed',
              requestId: assistantRunIdRef.current,
              timestamp: new Date().toISOString(),
              message: 'Assistant socket closed before the run finished.'
            })
          ]);
        }
      });

      webSocket.addEventListener('error', () => {
        cleanup();
        setAssistantConnectionState('disconnected');
        reject(new Error('Assistant socket could not be opened.'));
      });
    });

    return assistantSocketConnectPromiseRef.current;
  }

  function closeAssistantSocket() {
    if (assistantSocketRef.current) {
      assistantSocketRef.current.__assistantManualClose = true;
      assistantSocketRef.current.close();
      assistantSocketRef.current = null;
    }

    assistantSocketConnectPromiseRef.current = null;
    setAssistantConnectionState('disconnected');
  }

  function handleCancelAssistantRun() {
    if (!assistantRunId || !assistantSocketRef.current || assistantSocketRef.current.readyState !== window.WebSocket.OPEN) {
      return;
    }

    assistantSocketRef.current.send(JSON.stringify({
      type: 'assistant.run.cancel',
      requestId: assistantRunId,
      accountId: selectedAccountId,
      timestamp: new Date().toISOString()
    }));
  }

  async function handleClearAccountBinding(accountId) {
    if (!accountId) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsBindingLocalSession(true);

    try {
      await requestJson(`/accounts/${accountId}/mcp-binding`, {
        method: 'PUT',
        accessToken,
        body: JSON.stringify({ clearBinding: true })
      });

      const refreshedAccounts = await requestJson('/accounts', {
        accessToken
      });

      setAccounts(refreshedAccounts);
      await refreshSelectedAccountSnapshot(accountId);
      setSuccessMessage('Local MCP binding cleared for this planner account.');
    } catch (error) {
      if (error.statusCode === 401) {
        handleSessionExpired();
        return;
      }

      setErrorMessage(error.message);
    } finally {
      setIsBindingLocalSession(false);
    }
  }

  function focusVerificationCodeInput(index) {
    verificationCodeInputRefs.current[index]?.focus();
    verificationCodeInputRefs.current[index]?.select?.();
  }

  function applyVerificationCodeDigits(rawValue, startIndex = 0) {
    const digits = rawValue.replace(/\D/g, '').slice(0, EMAIL_VERIFICATION_CODE_LENGTH - startIndex).split('');

    if (digits.length === 0) {
      return false;
    }

    setVerificationCodeDigits((currentValue) => {
      const nextValue = [...currentValue];

      digits.forEach((digit, offset) => {
        nextValue[startIndex + offset] = digit;
      });

      return nextValue;
    });

    const nextFocusIndex = Math.min(
      EMAIL_VERIFICATION_CODE_LENGTH - 1,
      startIndex + digits.length
    );
    window.setTimeout(() => {
      focusVerificationCodeInput(nextFocusIndex);
    }, 0);

    return true;
  }

  function handleVerificationCodeInputChange(index, value) {
    const digits = value.replace(/\D/g, '');

    if (!digits) {
      setVerificationCodeDigits((currentValue) => {
        const nextValue = [...currentValue];
        nextValue[index] = '';
        return nextValue;
      });
      return;
    }

    if (digits.length > 1) {
      applyVerificationCodeDigits(digits, index);
      return;
    }

    setVerificationCodeDigits((currentValue) => {
      const nextValue = [...currentValue];
      nextValue[index] = digits;
      return nextValue;
    });

    if (index < EMAIL_VERIFICATION_CODE_LENGTH - 1) {
      window.setTimeout(() => {
        focusVerificationCodeInput(index + 1);
      }, 0);
    }
  }

  function handleVerificationCodeKeyDown(index, event) {
    if (event.key === 'Backspace' && !verificationCodeDigits[index] && index > 0) {
      event.preventDefault();
      setVerificationCodeDigits((currentValue) => {
        const nextValue = [...currentValue];
        nextValue[index - 1] = '';
        return nextValue;
      });
      focusVerificationCodeInput(index - 1);
      return;
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusVerificationCodeInput(index - 1);
      return;
    }

    if (event.key === 'ArrowRight' && index < EMAIL_VERIFICATION_CODE_LENGTH - 1) {
      event.preventDefault();
      focusVerificationCodeInput(index + 1);
    }
  }

  function handleVerificationCodePaste(index, event) {
    const pastedValue = event.clipboardData?.getData('text') || '';

    if (!pastedValue) {
      return;
    }

    event.preventDefault();
    applyVerificationCodeDigits(pastedValue, index);
  }

  async function handleBootstrapSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsBootstrapping(true);

    try {
      let response = await requestJson('/accounts/bootstrap', {
        method: 'POST',
        accessToken,
        body: JSON.stringify({
          accountName: accountForm.accountName,
          platform: accountForm.platform,
          notes: accountForm.notes || null
        })
      });

      if (localSessionDescriptor) {
        await requestJson(`/accounts/${response.account.id}/mcp-binding`, {
          method: 'PUT',
          accessToken,
          body: JSON.stringify(buildBindingPayloadFromDescriptor(localSessionDescriptor))
        });

        response = await requestJson(`/accounts/${response.account.id}/planner`, {
          accessToken
        });
      }

      const refreshedAccounts = await requestJson('/accounts', {
        accessToken
      });

      setAccounts(refreshedAccounts);
      setSelectedAccountId(response.account.id);
      setSelectedSnapshot(response);
      setAccountForm(ACCOUNT_FORM_INITIAL_STATE);
      setSuccessMessage(
        localSessionDescriptor
          ? `Game account "${response.account.name}" was created and already bound to the detected local session.`
          : `Game account "${response.account.name}" is now linked to your planner workspace.`
      );
    } catch (error) {
      if (error.statusCode === 401) {
        handleSessionExpired();
        return;
      }

      setErrorMessage(error.message);
    } finally {
      setIsBootstrapping(false);
    }
  }

  async function handleCharacterSave(characterId) {
    if (!selectedAccountId) {
      return;
    }

    const draft = characterDrafts[characterId];
    const nextLevel = Number(draft?.level || 1);

    if (!Number.isInteger(nextLevel) || nextLevel < 1) {
      setErrorMessage('Character level must be at least 1.');
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setSavingCharacterId(characterId);

    try {
      await requestJson(`/accounts/${selectedAccountId}/characters`, {
        method: 'PUT',
        accessToken,
        body: JSON.stringify({
          characterId,
          isUnlocked: Boolean(draft?.isUnlocked),
          level: nextLevel
        })
      });

      await refreshSelectedAccountSnapshot(selectedAccountId);
      setSuccessMessage('Character state updated successfully.');
    } catch (error) {
      if (error.statusCode === 401) {
        handleSessionExpired();
        return;
      }

      setErrorMessage(error.message);
    } finally {
      setSavingCharacterId('');
    }
  }

  async function handleItemEditorSave() {
    if (!selectedAccountId || !itemEditorDraft) {
      return;
    }

    setErrorMessage('');
    setSuccessMessage('');
    setIsSavingItemEditor(true);

    try {
      await requestJson(`/accounts/${selectedAccountId}/item-states`, {
        method: 'PUT',
        accessToken,
        body: JSON.stringify({
          itemId: itemEditorDraft.itemId,
          ownedBlueprint: itemEditorDraft.ownedBlueprint,
          craftUnlocked: itemEditorDraft.craftUnlocked
        })
      });

      const inventoryEntries = tiers.map((tier) => {
        const quantity = Number(itemEditorDraft.quantitiesByTierId[tier.id] || 0);

        if (!Number.isInteger(quantity) || quantity < 0) {
          throw new Error(`Inventory quantity for ${tier.name} must be 0 or greater.`);
        }

        return {
          itemId: itemEditorDraft.itemId,
          tierId: tier.id,
          quantity
        };
      });

      await requestJson(`/accounts/${selectedAccountId}/inventory-bulk`, {
        method: 'PUT',
        accessToken,
        body: JSON.stringify({
          entries: inventoryEntries
        })
      });

      await refreshSelectedAccountSnapshot(selectedAccountId);
      setSuccessMessage('Item state and inventory updated successfully.');
    } catch (error) {
      if (error.statusCode === 401) {
        handleSessionExpired();
        return;
      }

      setErrorMessage(error.message);
    } finally {
      setIsSavingItemEditor(false);
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');
    setIsAuthenticating(true);

    try {
      const path = authMode === 'signup' ? '/auth/sign-up' : '/auth/sign-in';
      const payload = authMode === 'signup'
        ? authForm
        : {
            email: authForm.email,
            password: authForm.password
          };
      const response = await requestJson(path, {
        method: 'POST',
        accessToken: '',
        body: JSON.stringify(payload)
      });

      setAccessToken(response.accessToken);
      setSession(response.user);
      setAuthForm(AUTH_FORM_INITIAL_STATE);
      setAccountForm(ACCOUNT_FORM_INITIAL_STATE);
      setVerificationCodeDigits(createEmptyVerificationCodeDigits());
      setSuccessMessage(
        authMode === 'signup'
          ? 'Platform account created successfully. Enter the 6-digit code we sent to confirm your email.'
          : (
              response.user.emailVerified
                ? 'Signed in successfully.'
                : 'Signed in successfully. Enter the 6-digit code we sent to confirm your email.'
            )
      );
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setIsAuthenticating(false);
    }
  }

  async function handleSignOut() {
    setErrorMessage('');
    setSuccessMessage('');

    try {
      await requestJson('/auth/sign-out', {
        method: 'POST',
        accessToken
      });
    } catch (error) {
      if (error.statusCode !== 401) {
        setErrorMessage(error.message);
        return;
      }
    }

    clearAuthentication();
    setSuccessMessage('Signed out successfully.');
  }

  async function handleVerificationCodeSubmit(event) {
    event.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    const verificationCode = verificationCodeDigits.join('');

    if (verificationCode.length !== EMAIL_VERIFICATION_CODE_LENGTH) {
      setErrorMessage('Enter the full 6-digit verification code.');
      return;
    }

    setIsSubmittingVerificationCode(true);

    try {
      const response = await requestJson('/auth/verify-email-code', {
        method: 'POST',
        accessToken,
        body: JSON.stringify({ code: verificationCode })
      });

      setSession(response.user);
      setVerificationCodeDigits(createEmptyVerificationCodeDigits());
      setVerificationResendCooldownSeconds(0);
      setSuccessMessage('Your email has been confirmed successfully.');
    } catch (error) {
      if (error.statusCode === 401) {
        handleSessionExpired();
        return;
      }

      setErrorMessage(error.message);
    } finally {
      setIsSubmittingVerificationCode(false);
    }
  }

  async function handleResendVerification() {
    setErrorMessage('');
    setSuccessMessage('');
    setIsResendingVerification(true);

    try {
      const response = await requestJson('/auth/resend-verification', {
        method: 'POST',
        accessToken
      });

      setSuccessMessage(
        response.alreadyVerified
          ? 'Your email is already confirmed.'
          : 'A new verification code has been sent.'
      );

      if (response.alreadyVerified) {
        await loadCurrentSession();
      } else {
        setVerificationCodeDigits(createEmptyVerificationCodeDigits());
        setVerificationResendCooldownSeconds(EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS);
        window.setTimeout(() => {
          focusVerificationCodeInput(0);
        }, 0);
      }
    } catch (error) {
      if (error.statusCode === 401) {
        handleSessionExpired();
        return;
      }

      setErrorMessage(error.message);
    } finally {
      setIsResendingVerification(false);
    }
  }

  function clearAuthentication() {
    setAccessToken('');
    setSession(null);
    clearWorkspaceState();
  }

  function handleSessionExpired() {
    clearAuthentication();
    setErrorMessage('Your session expired. Please sign in again.');
  }

  function clearWorkspaceState() {
    closeAssistantSocket();
    setAccounts([]);
    setSelectedAccountId(null);
    setSelectedSnapshot(null);
    setLocalSessionDescriptor(null);
    setLocalPlannerOverview(null);
    setLocalHeroesSnapshot([]);
    setAssistantPrompt('');
    setAssistantResponse('');
    setAssistantModel('');
    setAssistantTimeline([]);
    setAssistantRunId('');
    setAssistantRunStatus('idle');
    setCatalogItems([]);
    setCatalogPagination({
      total: 0,
      limit: ITEM_PAGE_SIZE,
      offset: 0
    });
  }

  const selectedAccount = accounts.find((account) => account.id === selectedAccountId) || null;
  const selectedWorkspaceItem = workspaceItems.find((item) => item.id === selectedWorkspaceItemId) || null;
  const isDetectedSessionAlignedWithSelectedAccount = Boolean(
    selectedAccount
    && localSessionDescriptor
    && (
      (
        selectedAccount.mcpAccountExternalId
        && selectedAccount.mcpAccountExternalId === localSessionDescriptor.account?.externalId
      )
      || (
        selectedAccount.mcpInstallationId
        && selectedAccount.mcpInstallationId === localSessionDescriptor.installation?.installationId
      )
      )
  );
  const shouldPreferLocalRosterInOverview = isDetectedSessionAlignedWithSelectedAccount && localHeroesSnapshot.length > 0;
  const overviewRosterEntries = shouldPreferLocalRosterInOverview
    ? localHeroesSnapshot
      .slice()
      .sort((left, right) => String(left.name || '').localeCompare(String(right.name || '')))
      .slice(0, 10)
      .map((hero) => ({
        id: `local-${hero.name}`,
        name: hero.name,
        code: hero.heroClass,
        level: hero.level,
        statusLabel: getLocalHeroStatus(hero),
        isUnlocked: !hero.isLocked && !hero.isRecruitable,
        isLocal: true
      }))
    : (selectedSnapshot?.characters || []).slice(0, 10).map((character) => ({
        id: character.id,
        name: character.characterName,
        code: character.characterCode,
        level: character.level,
        statusLabel: character.isUnlocked ? 'Unlocked' : 'Locked',
        isUnlocked: character.isUnlocked,
        isLocal: false
      }));
  const overviewRosterMetaLabel = shouldPreferLocalRosterInOverview
    ? `${localHeroesSnapshot.length} detected in game`
    : `${selectedSnapshot?.characters.length || 0} seeded`;
  const selectedAccountBindingLabel = selectedAccount?.mcpBindingMode
    ? `${selectedAccount.mcpBindingMode === 'account_external_id' ? 'External ID' : 'Manual'} binding`
    : 'Not bound';
  const accountSummary = selectedSnapshot
    ? [
        {
          label: 'Inventory stacks',
          value: selectedSnapshot.inventory.length
        },
        {
          label: 'Blueprint states',
          value: selectedSnapshot.itemStates.length
        },
        {
          label: 'Targets',
          value: selectedSnapshot.planner.targets.length
        },
        {
          label: 'Craft slots tracked',
          value: selectedSnapshot.planner.crafts.length
        },
        {
          label: 'Fusions tracked',
          value: selectedSnapshot.planner.fusions.length
        },
        {
          label: 'Characters tracked',
          value: selectedSnapshot.characters.length
        },
        {
          label: 'Characters unlocked',
          value: selectedSnapshot.characters.filter((character) => character.isUnlocked).length
        }
      ]
    : [];

  const catalogCategoryOptions = categories.map((category) => ({
    value: category.code,
    label: `${category.name} (${category.subcategories.length})`
  }));
  const unlockedCharactersCount = selectedSnapshot?.characters.filter((character) => character.isUnlocked).length || 0;
  const itemStatesCount = selectedSnapshot?.itemStates.length || 0;
  const inventoryStacksCount = selectedSnapshot?.inventory.length || 0;
  const completedTargetsCount = selectedSnapshot?.planner.targets.filter((target) => target.isCompleted).length || 0;
  const verificationCodeValue = verificationCodeDigits.join('');
  const resendButtonLabel = isResendingVerification
    ? 'Sending...'
    : (
        verificationResendCooldownSeconds > 0
          ? `Resend in ${verificationResendCooldownSeconds}s`
          : 'Resend code'
      );

  return (
    <main className="app-shell">
      {isCheckingSession && (
        <section className="feedback-banner">
          Restoring platform session...
        </section>
      )}

      {isVerifyingEmail && (
        <section className="feedback-banner">
          Confirming your email...
        </section>
      )}

      {!session ? (
        <>
          <section className="hero-card landing-hero">
            <div className="landing-copy-block">
              <p className="eyebrow">Shop Heroes Planner</p>
              <h1>Plan every account before you touch the forge.</h1>
              <p className="hero-copy landing-copy">
                This platform is becoming the shared control room for equipment goals,
                account-specific progression, craft flow, and future sync with the running game session.
              </p>

              <div className="landing-cta-row">
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => setAuthMode('signup')}
                >
                  Create account
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setAuthMode('signin')}
                >
                  Sign in
                </button>
              </div>
            </div>

            <div className="landing-side-column">
              <article className="landing-auth-card">
                <div className="auth-card-header">
                  <div>
                    <p className="section-kicker">Access</p>
                    <h2>{authMode === 'signin' ? 'Sign in to the platform' : 'Create your platform access'}</h2>
                  </div>
                  <span>{authMode === 'signin' ? 'Sign in' : 'Sign up'}</span>
                </div>

                <div className="auth-mode-row">
                  <button
                    type="button"
                    className={`auth-mode-button ${authMode === 'signin' ? 'auth-mode-button-active' : ''}`}
                    onClick={() => setAuthMode('signin')}
                  >
                    Sign in
                  </button>
                  <button
                    type="button"
                    className={`auth-mode-button ${authMode === 'signup' ? 'auth-mode-button-active' : ''}`}
                    onClick={() => setAuthMode('signup')}
                  >
                    Sign up
                  </button>
                </div>

                <form className="stack-form" onSubmit={handleAuthSubmit}>
                  {authMode === 'signup' && (
                    <label className="field">
                      <span>Display name</span>
                      <input
                        type="text"
                        value={authForm.displayName}
                        onChange={(event) => setAuthForm((currentValue) => ({
                          ...currentValue,
                          displayName: event.target.value
                        }))}
                        placeholder="Douglas"
                        required
                      />
                    </label>
                  )}

                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={authForm.email}
                      onChange={(event) => setAuthForm((currentValue) => ({
                        ...currentValue,
                        email: event.target.value
                      }))}
                      placeholder="you@example.com"
                      required
                    />
                  </label>

                  <label className="field">
                    <span>Password</span>
                    <input
                      type="password"
                      value={authForm.password}
                      onChange={(event) => setAuthForm((currentValue) => ({
                        ...currentValue,
                        password: event.target.value
                      }))}
                      placeholder="********"
                      required
                    />
                  </label>

                  <button type="submit" className="primary-button" disabled={isAuthenticating}>
                    {isAuthenticating
                      ? (authMode === 'signin' ? 'Signing in...' : 'Creating access...')
                      : (authMode === 'signin' ? 'Enter platform' : 'Create access')}
                  </button>
                </form>

                <p className="auth-footnote">
                  This is now a real platform login backed by JWT issued by the API, kept only for the current browser session, and tied to a 6-digit email confirmation flow with fallback link support.
                </p>
              </article>

              <div className="hero-status-grid landing-status-grid">
                <article className="status-tile">
                  <span className="status-label">Catalog items</span>
                  <strong>{publicStats.catalogItems}</strong>
                </article>
                <article className="status-tile">
                  <span className="status-label">Tier definitions</span>
                  <strong>{publicStats.tiers}</strong>
                </article>
                <article className="status-tile">
                  <span className="status-label">Root categories</span>
                  <strong>{publicStats.categories}</strong>
                </article>
                <article className="status-tile">
                  <span className="status-label">API base</span>
                  <strong>{API_BASE_URL}</strong>
                </article>
              </div>
            </div>
          </section>

          {(errorMessage || successMessage) && (
            <section className={`feedback-banner ${errorMessage ? 'feedback-error' : 'feedback-success'}`}>
              {errorMessage || successMessage}
            </section>
          )}

          <section className="landing-grid">
            <article className="panel-card">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Why it exists</p>
                  <h2>A planner, not just a counter</h2>
                </div>
              </div>

              <div className="landing-feature-grid">
                {landingHighlights.map((entry) => (
                  <article key={entry.title} className="inner-card">
                    <h3>{entry.title}</h3>
                    <p>{entry.description}</p>
                  </article>
                ))}
              </div>
            </article>

            <article className="panel-card">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Latest updates</p>
                  <h2>What changed recently</h2>
                </div>
              </div>

              <ul className="timeline-list">
                {latestUpdates.map((entry) => (
                  <li key={entry}>
                    <strong>Recent step</strong>
                    <p>{entry}</p>
                  </li>
                ))}
              </ul>
            </article>

            <article className="panel-card">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Roadmap</p>
                  <h2>Next platform milestones</h2>
                </div>
              </div>

              <ul className="timeline-list">
                {roadmapItems.map((entry) => (
                  <li key={entry}>
                    <strong>Next milestone</strong>
                    <p>{entry}</p>
                  </li>
                ))}
              </ul>
            </article>
          </section>
        </>
      ) : (
        <>
          <section className="hero-card workspace-hero">
            <div className="hero-copy-block">
              <p className="eyebrow">Authenticated workspace</p>
              <h1>Now we can bootstrap your real game accounts.</h1>
              <p className="hero-copy">
                You are inside the platform shell now. The next step is binding or creating
                a Shop Heroes game account entry, and later we will detect the running modded session automatically.
              </p>
            </div>

            <div className="workspace-session-column">
              <div className="session-chip-row">
                <span className="session-chip">{session.displayName}</span>
              </div>

              <div className="hero-status-grid">
                <article className="status-tile">
                  <span className="status-label">Accounts loaded</span>
                  <strong>{accounts.length}</strong>
                </article>
                <article className="status-tile">
                  <span className="status-label">Catalog items</span>
                  <strong>{catalogPagination.total}</strong>
                </article>
                <article className="status-tile">
                  <span className="status-label">Tiers seeded</span>
                  <strong>{tiers.length}</strong>
                </article>
                <article className="status-tile">
                  <span className="status-label">Platform user</span>
                  <strong>{session.displayName}</strong>
                </article>
              </div>

              <div className="workspace-hero-actions">
                <button type="button" className="secondary-button" onClick={() => void handleSignOut()}>
                  Sign out
                </button>
              </div>
            </div>
          </section>

          {(errorMessage || successMessage) && (
            <section className={`feedback-banner ${errorMessage ? 'feedback-error' : 'feedback-success'}`}>
              {errorMessage || successMessage}
            </section>
          )}

          {!session.emailVerified && (
            <section className="panel-card verification-card">
              <div className="panel-header verification-card-header">
                <div>
                  <p className="section-kicker">Email confirmation</p>
                  <h2>Enter your 6-digit code</h2>
                </div>
                <span>Pending</span>
              </div>

              <p className="verification-copy">
                We sent a 6-digit confirmation code to <strong>{session.email}</strong>.
                Enter it below to fully activate this platform account.
              </p>

              <form className="verification-code-form" onSubmit={handleVerificationCodeSubmit}>
                <div className="verification-code-row">
                  {verificationCodeDigits.map((digit, index) => (
                    <input
                      key={`verification-digit-${index}`}
                      ref={(element) => {
                        verificationCodeInputRefs.current[index] = element;
                      }}
                      type="text"
                      inputMode="numeric"
                      autoComplete={index === 0 ? 'one-time-code' : 'off'}
                      pattern="[0-9]*"
                      maxLength={1}
                      className="verification-code-input"
                      value={digit}
                      onChange={(event) => handleVerificationCodeInputChange(index, event.target.value)}
                      onKeyDown={(event) => handleVerificationCodeKeyDown(index, event)}
                      onPaste={(event) => handleVerificationCodePaste(index, event)}
                      aria-label={`Verification digit ${index + 1}`}
                    />
                  ))}
                </div>

                <div className="verification-actions">
                  <button
                    type="submit"
                    className="primary-button"
                    disabled={isSubmittingVerificationCode || verificationCodeValue.length !== EMAIL_VERIFICATION_CODE_LENGTH}
                  >
                    {isSubmittingVerificationCode ? 'Confirming...' : 'Confirm email'}
                  </button>

                  <button
                    type="button"
                    className="secondary-button"
                    disabled={isResendingVerification || verificationResendCooldownSeconds > 0}
                    onClick={() => void handleResendVerification()}
                  >
                    {resendButtonLabel}
                  </button>
                </div>
              </form>

              <p className="verification-helper-text">
                Prefer not to type it? The email also includes a fallback confirmation link.
              </p>
            </section>
          )}

          <section className="workspace-grid">
            <aside className="panel-card sidebar-card">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Game accounts</p>
                  <h2>Planner accounts</h2>
                </div>
                <span>{isLoadingAccounts ? 'Loading' : `${accounts.length} total`}</span>
              </div>

              <div className="note-card setup-note-card">
                <strong>Local session bootstrap</strong>
                <p>
                  If the local Shop Heroes MCP is available on your machine, we can detect the running session here and pre-fill the game account before you create or bind it.
                </p>
              </div>

              <div className="panel-card local-session-card">
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">Local MCP</p>
                    <h3>Detect running game session</h3>
                  </div>
                  <span>{localSessionDescriptor ? 'Detected' : 'Idle'}</span>
                </div>

                <label className="field">
                  <span>Local MCP base URL</span>
                  <input
                    type="text"
                    value={localMcpBaseUrl}
                    onChange={(event) => setLocalMcpBaseUrl(event.target.value)}
                    placeholder={LOCAL_MCP_DEFAULT_BASE_URL}
                  />
                </label>

                <div className="inline-action-row">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={isDetectingLocalSession}
                    onClick={() => void handleDetectLocalSession()}
                  >
                    {isDetectingLocalSession ? 'Detecting...' : 'Detect local session'}
                  </button>

                  <button
                    type="button"
                    className="ghost-button"
                    disabled={!localSessionDescriptor}
                    onClick={handleApplyDetectedSessionToForm}
                  >
                    Use detected values
                  </button>

                  <button
                    type="button"
                    className="ghost-button"
                    disabled={isLoadingLocalPlannerOverview}
                    onClick={() => void handleLoadLocalPlannerOverview()}
                  >
                    {isLoadingLocalPlannerOverview ? 'Refreshing overview...' : 'Refresh local overview'}
                  </button>
                </div>

                {localSessionMessage && (
                  <p className="helper-copy">{localSessionMessage}</p>
                )}

                {localSessionDescriptor && (
                  <div className="local-session-preview">
                    <p><strong>Account:</strong> {localSessionDescriptor.account?.displayName || 'Unknown'}</p>
                    <p><strong>External ID:</strong> {localSessionDescriptor.account?.externalId || 'Not exposed'}</p>
                    <p><strong>Installation:</strong> {localSessionDescriptor.installation?.installationLabel || 'Unknown'}</p>
                    <p><strong>Session:</strong> {formatDate(localSessionDescriptor.runtime?.startedAt)}</p>
                  </div>
                )}

                {localPlannerOverview && (
                  <div className="local-session-preview">
                    <p><strong>Ready heroes:</strong> {localPlannerOverview.summary?.readyHeroes ?? 0}</p>
                    <p><strong>Ready crafts:</strong> {localPlannerOverview.summary?.readyCrafts ?? 0}</p>
                    <p><strong>Ready fusions:</strong> {localPlannerOverview.summary?.readyFusions ?? 0}</p>
                    <p><strong>Recommendations:</strong> {localPlannerOverview.recommendations?.length ?? 0}</p>
                    <p><strong>Ready local operations:</strong> {localPlannerOverview.readyOperations?.length ?? 0}</p>
                    <p><strong>Active local operations:</strong> {localPlannerOverview.activeOperations?.length ?? 0}</p>

                    {Array.isArray(localPlannerOverview.readyOperations) && localPlannerOverview.readyOperations.length > 0 && (
                      <div>
                        <p><strong>Next ready operations:</strong></p>
                        {localPlannerOverview.readyOperations.slice(0, 3).map((operation) => (
                          <p key={`ready-${operation.category}-${operation.index}`}>
                            {operation.category} slot {operation.index}: {operation.name}
                          </p>
                        ))}
                      </div>
                    )}

                    {Array.isArray(localPlannerOverview.activeOperations) && localPlannerOverview.activeOperations.length > 0 && (
                      <div>
                        <p><strong>Active slots:</strong></p>
                        {localPlannerOverview.activeOperations.slice(0, 3).map((operation) => (
                          <p key={`active-${operation.category}-${operation.index}`}>
                            {operation.category} slot {operation.index}: {operation.name}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <form className="stack-form" onSubmit={handleBootstrapSubmit}>
                <label className="field">
                  <span>Game account name</span>
                  <input
                    type="text"
                    value={accountForm.accountName}
                    onChange={(event) => setAccountForm((currentValue) => ({
                      ...currentValue,
                      accountName: event.target.value
                    }))}
                    placeholder="Steam Main"
                    required
                  />
                </label>

                <div className="field-grid compact-grid">
                  <label className="field">
                    <span>Platform</span>
                    <select
                      value={accountForm.platform}
                      onChange={(event) => setAccountForm((currentValue) => ({
                        ...currentValue,
                        platform: event.target.value
                      }))}
                    >
                      <option value="steam">Steam</option>
                      <option value="mobile">Mobile</option>
                      <option value="desktop">Desktop</option>
                    </select>
                  </label>

                  <label className="field">
                    <span>Notes</span>
                    <input
                      type="text"
                      value={accountForm.notes}
                      onChange={(event) => setAccountForm((currentValue) => ({
                        ...currentValue,
                        notes: event.target.value
                      }))}
                      placeholder="Optional context"
                    />
                  </label>
                </div>

                <button type="submit" className="primary-button" disabled={isBootstrapping}>
                  {isBootstrapping ? 'Bootstrapping...' : 'Create or bind game account'}
                </button>
              </form>

              <div className="account-list">
                {accounts.map((account) => (
                  <button
                    key={account.id}
                    type="button"
                    className={`account-row ${account.id === selectedAccountId ? 'account-row-active' : ''}`}
                    onClick={() => setSelectedAccountId(account.id)}
                  >
                    <div>
                      <strong>{account.name}</strong>
                      <p>{account.userDisplayName}</p>
                    </div>
                    <div className="account-meta">
                      <span className={`platform-pill platform-${account.platform}`}>{account.platform}</span>
                      <small>{account.isActive ? 'Active' : 'Inactive'}</small>
                    </div>
                  </button>
                ))}
              </div>
            </aside>

            <section className="content-column">
              <section className="panel-card">
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">Selected account</p>
                    <h2>{selectedAccount ? selectedAccount.name : 'No account selected'}</h2>
                  </div>
                  <span>{selectedAccount ? selectedAccount.platform : 'Waiting'}</span>
                </div>

                {selectedAccount && (
                  <div className="account-overview">
                    <div className="account-details">
                      <p><strong>User:</strong> {selectedAccount.userDisplayName}</p>
                      <p><strong>Created:</strong> {formatDate(selectedAccount.createdAt)}</p>
                      <p><strong>Last updated:</strong> {formatDate(selectedAccount.updatedAt)}</p>
                      <p><strong>MCP binding:</strong> {selectedAccountBindingLabel}</p>
                      <p><strong>Bound account:</strong> {selectedAccount.mcpAccountDisplayName || selectedAccount.mcpAccountExternalId || 'Not bound yet'}</p>
                      <p><strong>Installation:</strong> {selectedAccount.mcpInstallationLabel || selectedAccount.mcpInstallationType || 'Not bound yet'}</p>
                      <p><strong>Last local session:</strong> {formatDate(selectedAccount.mcpLastSessionSeenAt)}</p>
                    </div>

                    <div className="workspace-hero-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => void loadPlannerSnapshot(selectedAccount.id)}
                        disabled={isLoadingSnapshot}
                      >
                        {isLoadingSnapshot ? 'Refreshing...' : 'Refresh snapshot'}
                      </button>

                      <button
                        type="button"
                        className="secondary-button"
                        disabled={!localSessionDescriptor || isBindingLocalSession}
                        onClick={() => void handleBindDetectedSessionToAccount(selectedAccount.id)}
                      >
                        {isBindingLocalSession ? 'Binding...' : 'Bind detected session'}
                      </button>

                      <button
                        type="button"
                        className="ghost-button"
                        disabled={isBindingLocalSession || !selectedAccount.mcpBindingMode}
                        onClick={() => void handleClearAccountBinding(selectedAccount.id)}
                      >
                        Clear binding
                      </button>

                      <button
                        type="button"
                        className="ghost-button"
                        disabled={isSyncingLocalCharacters}
                        onClick={() => void handleSyncCharactersFromLocal()}
                      >
                        {isSyncingLocalCharacters ? 'Syncing roster...' : 'Sync roster from local game'}
                      </button>

                      <button
                        type="button"
                        className="ghost-button"
                        disabled={isSyncingLocalPlannerData}
                        onClick={() => void handleSyncPlannerStateFromLocal()}
                      >
                        {isSyncingLocalPlannerData ? 'Syncing local state...' : 'Sync full local state'}
                      </button>
                    </div>
                  </div>
                )}

                {selectedSnapshot ? (
                  <>
                    <div className="workspace-tab-row">
                      {[
                        { id: 'overview', label: 'Overview' },
                        { id: 'characters', label: 'Characters' },
                        { id: 'items', label: 'Items' },
                        { id: 'assistant', label: 'Assistant' }
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          className={`workspace-tab-button ${activeWorkspaceTab === tab.id ? 'workspace-tab-button-active' : ''}`}
                          onClick={() => setActiveWorkspaceTab(tab.id)}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {activeWorkspaceTab === 'overview' && (
                      <>
                        <section className="overview-section">
                          <div className="overview-section-header">
                            <div>
                              <p className="section-kicker">Planner State</p>
                              <h3>Workspace snapshot</h3>
                            </div>
                            <span>Persisted data</span>
                          </div>

                          <div className="summary-grid overview-summary-grid">
                            {accountSummary.map((entry) => (
                              <article key={entry.label} className="summary-card">
                                <span>{entry.label}</span>
                                <strong>{entry.value}</strong>
                              </article>
                            ))}
                          </div>

                          <div className="two-column-grid">
                            <article className="inner-card">
                              <div className="inner-card-header">
                                <h3>Account settings</h3>
                                <span>{selectedSnapshot.settings.length}</span>
                              </div>
                              <ul className="detail-list">
                                {selectedSnapshot.settings.map((setting) => (
                                  <li key={setting.id}>
                                    <div>
                                      <strong>{setting.key}</strong>
                                      <p>{setting.description}</p>
                                    </div>
                                    <span>{setting.settingValue}</span>
                                  </li>
                                ))}
                              </ul>
                            </article>

                            <article className="inner-card">
                              <div className="inner-card-header">
                                <h3>Progress snapshot</h3>
                                <span>Live DB state</span>
                              </div>
                              <ul className="detail-list compact-list">
                                <li>
                                  <div>
                                    <strong>Unlocked characters</strong>
                                    <p>Heroes already available in this account.</p>
                                  </div>
                                  <span>{unlockedCharactersCount}</span>
                                </li>
                                <li>
                                  <div>
                                    <strong>Blueprint states</strong>
                                    <p>Items already enriched with ownership/craft state.</p>
                                  </div>
                                  <span>{itemStatesCount}</span>
                                </li>
                                <li>
                                  <div>
                                    <strong>Completed targets</strong>
                                    <p>Planner entries already marked as completed.</p>
                                  </div>
                                  <span>{completedTargetsCount}</span>
                                </li>
                              </ul>
                            </article>
                          </div>
                        </section>

                        <section className="overview-section">
                          <div className="overview-section-header">
                            <div>
                              <p className="section-kicker">Connected Game</p>
                              <h3>Local runtime link</h3>
                            </div>
                            <span>{isDetectedSessionAlignedWithSelectedAccount ? 'Live linked' : 'Planner only'}</span>
                          </div>

                          <div className="two-column-grid">
                            <article className="inner-card">
                              <div className="inner-card-header">
                                <h3>Connection state</h3>
                                <span>{localSessionDescriptor ? 'Detected' : 'Idle'}</span>
                              </div>
                              <ul className="detail-list compact-list">
                                <li>
                                  <div>
                                    <strong>Detected account</strong>
                                    <p>Local session currently exposed by the plugin/mod.</p>
                                  </div>
                                  <span>{localSessionDescriptor?.account?.displayName || 'Not detected'}</span>
                                </li>
                                <li>
                                  <div>
                                    <strong>Installation</strong>
                                    <p>Game instance currently linked or detected.</p>
                                  </div>
                                  <span>{localSessionDescriptor?.installation?.installationLabel || selectedAccount?.mcpInstallationLabel || 'Not linked'}</span>
                                </li>
                                <li>
                                  <div>
                                    <strong>Auto-sync status</strong>
                                    <p>Polling refreshes local context every 45 seconds for bound accounts.</p>
                                  </div>
                                  <span>{isDetectedSessionAlignedWithSelectedAccount ? 'Active' : 'Waiting'}</span>
                                </li>
                                <li>
                                  <div>
                                    <strong>Last local overview</strong>
                                    <p>Most recent browser-side planner overview pulled from the running game.</p>
                                  </div>
                                  <span>{formatDate(localPlannerOverview?.timestamp)}</span>
                                </li>
                              </ul>
                            </article>

                            <article className="inner-card">
                              <div className="inner-card-header">
                                <h3>Runtime totals</h3>
                                <span>{localPlannerOverview ? 'Runtime state' : 'Not loaded'}</span>
                              </div>
                              {localPlannerOverview ? (
                                <div className="live-operations-stack">
                                  <div className="summary-grid local-runtime-summary-grid">
                                    {[
                                      {
                                        label: 'Ready heroes',
                                        value: localPlannerOverview.summary?.readyHeroes ?? 0
                                      },
                                      {
                                        label: 'Ready crafts',
                                        value: localPlannerOverview.summary?.readyCrafts ?? 0
                                      },
                                      {
                                        label: 'Ready fusions',
                                        value: localPlannerOverview.summary?.readyFusions ?? 0
                                      },
                                      {
                                        label: 'Ready ops',
                                        value: localPlannerOverview.readyOperations?.length ?? 0
                                      }
                                    ].map((entry) => (
                                      <article key={entry.label} className="summary-card">
                                        <span>{entry.label}</span>
                                        <strong>{entry.value}</strong>
                                      </article>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="empty-runtime-panel">
                                  <strong>Local runtime snapshot not loaded yet</strong>
                                  <p>Detect the local session or refresh the local overview to bring live game operations into this workspace.</p>
                                </div>
                              )}
                            </article>
                          </div>

                          <article className="inner-card overview-runtime-card">
                            <div className="inner-card-header">
                              <h3>Live game operations</h3>
                              <span>{localPlannerOverview ? 'Runtime flow' : 'Waiting for data'}</span>
                            </div>
                            {localPlannerOverview ? (
                              <div className="runtime-columns-grid">
                                <div className="runtime-list-card">
                                  <div className="inner-card-header runtime-list-header">
                                    <h4>Ready operations</h4>
                                    <span>{localPlannerOverview.readyOperations?.length ?? 0}</span>
                                  </div>
                                  <ul className="detail-list compact-list">
                                    {(localPlannerOverview.readyOperations || []).slice(0, 5).map((operation) => (
                                      <li key={`overview-ready-${operation.category}-${operation.index}`}>
                                        <div>
                                          <strong>{formatOperationCategoryLabel(operation.category)} slot {operation.index}</strong>
                                          <p>{operation.name}</p>
                                        </div>
                                        <span>Ready</span>
                                      </li>
                                    ))}
                                    {(!Array.isArray(localPlannerOverview.readyOperations) || localPlannerOverview.readyOperations.length === 0) && (
                                      <li className="empty-runtime-state">
                                        <div>
                                          <strong>No ready operations</strong>
                                          <p>Nothing is waiting for collection right now.</p>
                                        </div>
                                      </li>
                                    )}
                                  </ul>
                                </div>

                                <div className="runtime-list-card">
                                  <div className="inner-card-header runtime-list-header">
                                    <h4>Active operations</h4>
                                    <span>{localPlannerOverview.activeOperations?.length ?? 0}</span>
                                  </div>
                                  <ul className="detail-list compact-list">
                                    {(localPlannerOverview.activeOperations || []).slice(0, 5).map((operation) => (
                                      <li key={`overview-active-${operation.category}-${operation.index}`}>
                                        <div>
                                          <strong>{formatOperationCategoryLabel(operation.category)} slot {operation.index}</strong>
                                          <p>{operation.name}</p>
                                        </div>
                                        <span>Running</span>
                                      </li>
                                    ))}
                                    {(!Array.isArray(localPlannerOverview.activeOperations) || localPlannerOverview.activeOperations.length === 0) && (
                                      <li className="empty-runtime-state">
                                        <div>
                                          <strong>No active operations</strong>
                                          <p>No tracked slot is currently running.</p>
                                        </div>
                                      </li>
                                    )}
                                  </ul>
                                </div>

                                <div className="runtime-list-card">
                                  <div className="inner-card-header runtime-list-header">
                                    <h4>Recommendations</h4>
                                    <span>{localPlannerOverview.recommendations?.length ?? 0}</span>
                                  </div>
                                  <ul className="detail-list compact-list">
                                    {(localPlannerOverview.recommendations || []).slice(0, 5).map((recommendation, index) => (
                                      <li key={`overview-recommendation-${index}`} className="empty-runtime-state">
                                        <div>
                                          <strong>Suggestion {index + 1}</strong>
                                          <p>{recommendation}</p>
                                        </div>
                                      </li>
                                    ))}
                                    {(!Array.isArray(localPlannerOverview.recommendations) || localPlannerOverview.recommendations.length === 0) && (
                                      <li className="empty-runtime-state">
                                        <div>
                                          <strong>No recommendations yet</strong>
                                          <p>Refresh the local overview after the game is running and authenticated.</p>
                                        </div>
                                      </li>
                                    )}
                                  </ul>
                                </div>
                              </div>
                            ) : (
                              <div className="empty-runtime-panel">
                                <strong>Live operations will appear here</strong>
                                <p>When the plugin is detected and authenticated, this area will separate ready actions, active slots and recommendations.</p>
                              </div>
                            )}
                          </article>
                        </section>

                        <section className="overview-section">
                          <div className="overview-section-header">
                            <div>
                              <p className="section-kicker">Roster Preview</p>
                              <h3>Character roster snapshot</h3>
                            </div>
                            <span>{overviewRosterMetaLabel}</span>
                          </div>

                          <article className="inner-card roster-card">
                            {shouldPreferLocalRosterInOverview && (
                              <p className="roster-footnote">
                                Showing the live roster detected from the running game session for this bound account.
                              </p>
                            )}
                            <div className="roster-grid">
                              {overviewRosterEntries.map((character) => (
                                <div key={character.id} className="roster-entry">
                                  <div>
                                    <strong>{character.name}</strong>
                                    <p>{character.code}</p>
                                  </div>
                                  <div className="roster-meta">
                                    <span className={character.isUnlocked ? 'roster-pill roster-pill-on' : 'roster-pill'}>
                                      {character.statusLabel}
                                    </span>
                                    <small>Lv. {character.level}</small>
                                  </div>
                                </div>
                              ))}
                            </div>
                            {!shouldPreferLocalRosterInOverview && selectedSnapshot.characters.length > 10 && (
                              <p className="roster-footnote">
                                Showing the first 10 characters. Open the Characters tab to edit the full roster.
                              </p>
                            )}
                            {shouldPreferLocalRosterInOverview && localHeroesSnapshot.length > 10 && (
                              <p className="roster-footnote">
                                Showing the first 10 heroes from the live game snapshot. Open the Characters tab to edit the persisted planner roster.
                              </p>
                            )}
                          </article>
                        </section>
                      </>
                    )}

                    {activeWorkspaceTab === 'characters' && (
                      <article className="inner-card workspace-module-card">
                        <div className="inner-card-header">
                          <h3>Character progression</h3>
                          <span>{unlockedCharactersCount} unlocked</span>
                        </div>

                        <div className="character-editor-list">
                          {selectedSnapshot.characters.map((character) => {
                            const draft = characterDrafts[character.characterId] || {
                              isUnlocked: character.isUnlocked,
                              level: String(character.level)
                            };
                            const isDirty = draft.isUnlocked !== character.isUnlocked || Number(draft.level) !== character.level;

                            return (
                              <article key={character.id} className="character-editor-card">
                                <div className="character-editor-main">
                                  <div>
                                    <strong>{character.characterName}</strong>
                                    <p>{character.characterCode}</p>
                                  </div>

                                  <label className="toggle-field">
                                    <input
                                      type="checkbox"
                                      checked={Boolean(draft.isUnlocked)}
                                      onChange={(event) => setCharacterDrafts((currentValue) => ({
                                        ...currentValue,
                                        [character.characterId]: {
                                          ...draft,
                                          isUnlocked: event.target.checked
                                        }
                                      }))}
                                    />
                                    <span>{draft.isUnlocked ? 'Unlocked' : 'Locked'}</span>
                                  </label>
                                </div>

                                <div className="character-editor-actions">
                                  <label className="field compact-field">
                                    <span>Level</span>
                                    <input
                                      type="number"
                                      min="1"
                                      value={draft.level}
                                      onChange={(event) => setCharacterDrafts((currentValue) => ({
                                        ...currentValue,
                                        [character.characterId]: {
                                          ...draft,
                                          level: event.target.value
                                        }
                                      }))}
                                    />
                                  </label>

                                  <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={!isDirty || savingCharacterId === character.characterId}
                                    onClick={() => void handleCharacterSave(character.characterId)}
                                  >
                                    {savingCharacterId === character.characterId ? 'Saving...' : 'Save'}
                                  </button>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      </article>
                    )}

                    {activeWorkspaceTab === 'items' && (
                      <article className="inner-card workspace-module-card">
                        <div className="inner-card-header">
                          <h3>Item progression</h3>
                          <span>{inventoryStacksCount} inventory stacks</span>
                        </div>

                        <div className="field-grid compact-grid catalog-toolbar">
                          <label className="field">
                            <span>Search item</span>
                            <input
                              type="search"
                              value={workspaceItemFilters.search}
                              onChange={(event) => setWorkspaceItemFilters((currentValue) => ({
                                ...currentValue,
                                search: event.target.value
                              }))}
                              placeholder="Search item name..."
                            />
                          </label>

                          <label className="field">
                            <span>Category</span>
                            <select
                              value={workspaceItemFilters.category}
                              onChange={(event) => setWorkspaceItemFilters((currentValue) => ({
                                ...currentValue,
                                category: event.target.value
                              }))}
                            >
                              <option value="">All categories</option>
                              {catalogCategoryOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>

                        <div className="catalog-summary-bar workspace-module-summary">
                          <p>Showing {workspaceItems.length} of {workspaceItemsPagination.total} catalog items for account enrichment.</p>
                          <p>{isLoadingWorkspaceItems ? 'Refreshing items...' : 'Select an item to edit blueprint, craft unlock and inventory.'}</p>
                        </div>

                        <div className="workspace-items-layout">
                          <div className="workspace-item-results">
                            {workspaceItems.map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                className={`workspace-item-row ${item.id === selectedWorkspaceItemId ? 'workspace-item-row-active' : ''}`}
                                onClick={() => setSelectedWorkspaceItemId(item.id)}
                              >
                                <div className="catalog-card-media workspace-item-row-media">
                                  {item.iconUrl ? (
                                    <img src={item.iconUrl} alt={item.name} loading="lazy" />
                                  ) : (
                                    <div className="catalog-image-fallback">{item.name.slice(0, 2).toUpperCase()}</div>
                                  )}
                                </div>

                                <div className="workspace-item-row-body">
                                  <strong>{item.name}</strong>
                                  <p>Lv. {item.level} | {item.categoryName} / {item.subcategoryName}</p>
                                </div>
                              </button>
                            ))}
                          </div>

                          <div className="workspace-item-editor">
                            {selectedWorkspaceItem && itemEditorDraft ? (
                              <div className="workspace-item-editor-card">
                                <div className="workspace-item-editor-header">
                                  <div className="catalog-card-media workspace-item-editor-media">
                                    {selectedWorkspaceItem.iconUrl ? (
                                      <img src={selectedWorkspaceItem.iconUrl} alt={selectedWorkspaceItem.name} loading="lazy" />
                                    ) : (
                                      <div className="catalog-image-fallback">{selectedWorkspaceItem.name.slice(0, 2).toUpperCase()}</div>
                                    )}
                                  </div>

                                  <div>
                                    <h3>{selectedWorkspaceItem.name}</h3>
                                    <p>Lv. {selectedWorkspaceItem.level} | {selectedWorkspaceItem.categoryName} / {selectedWorkspaceItem.subcategoryName}</p>
                                  </div>
                                </div>

                                <div className="workspace-item-state-grid">
                                  <label className="toggle-field">
                                    <input
                                      type="checkbox"
                                      checked={itemEditorDraft.ownedBlueprint}
                                      onChange={(event) => setItemEditorDraft((currentValue) => ({
                                        ...currentValue,
                                        ownedBlueprint: event.target.checked
                                      }))}
                                    />
                                    <span>Owned blueprint</span>
                                  </label>

                                  <label className="toggle-field">
                                    <input
                                      type="checkbox"
                                      checked={itemEditorDraft.craftUnlocked}
                                      onChange={(event) => setItemEditorDraft((currentValue) => ({
                                        ...currentValue,
                                        craftUnlocked: event.target.checked
                                      }))}
                                    />
                                    <span>Craft unlocked</span>
                                  </label>
                                </div>

                                <div className="workspace-item-inventory-grid">
                                  {tiers.map((tier) => (
                                    <label key={tier.id} className="field compact-field">
                                      <span>{tier.name}</span>
                                      <input
                                        type="number"
                                        min="0"
                                        value={itemEditorDraft.quantitiesByTierId[tier.id] ?? '0'}
                                        onChange={(event) => setItemEditorDraft((currentValue) => ({
                                          ...currentValue,
                                          quantitiesByTierId: {
                                            ...currentValue.quantitiesByTierId,
                                            [tier.id]: event.target.value
                                          }
                                        }))}
                                      />
                                    </label>
                                  ))}
                                </div>

                                <div className="workspace-item-editor-actions">
                                  <button
                                    type="button"
                                    className="primary-button"
                                    disabled={isSavingItemEditor}
                                    onClick={() => void handleItemEditorSave()}
                                  >
                                    {isSavingItemEditor ? 'Saving item...' : 'Save item progression'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="empty-state workspace-item-empty">
                                <h3>No item selected</h3>
                                <p>Pick an item from the left side to edit blueprint ownership, craft unlock and tier quantities.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </article>
                    )}

                    {activeWorkspaceTab === 'assistant' && (
                      <article className="inner-card workspace-module-card">
                        <div className="inner-card-header">
                          <h3>Planner assistant</h3>
                          <span>{assistantModel || 'Ollama scaffold'}</span>
                        </div>

                        <div className="assistant-layout">
                          <div className="assistant-conversation-column">
                            <article className="workspace-item-editor-card assistant-response-card assistant-run-card">
                              <div className="inner-card-header">
                                <h3>Assistant run</h3>
                                <span>{assistantConnectionState}</span>
                              </div>

                              <div className="assistant-run-summary">
                                <div className="assistant-run-chip-group">
                                  <span className="assistant-run-chip">{assistantRunStatus}</span>
                                  <span className="assistant-run-chip">{assistantModel || 'Ollama-compatible model'}</span>
                                </div>
                                {assistantRunId && (
                                  <p className="assistant-run-id">Run: {assistantRunId}</p>
                                )}
                              </div>

                              {assistantTimeline.length > 0 ? (
                                <div className="assistant-timeline">
                                  {assistantTimeline.map((entry) => (
                                    <article key={entry.id} className="assistant-timeline-entry">
                                      <div className="assistant-timeline-entry-header">
                                        <strong>{entry.phase ? formatAssistantPhaseLabel(entry.phase) : entry.toolName || 'Assistant event'}</strong>
                                        <span>{formatDate(entry.timestamp)}</span>
                                      </div>
                                      <p>{entry.message}</p>
                                      {entry.inputSummary && (
                                        <p className="assistant-timeline-meta">{formatAssistantSummary(entry.inputSummary)}</p>
                                      )}
                                      {entry.resultSummary && (
                                        <p className="assistant-timeline-meta">{formatAssistantSummary(entry.resultSummary)}</p>
                                      )}
                                    </article>
                                  ))}
                                </div>
                              ) : (
                                <div className="empty-state workspace-item-empty assistant-empty-state">
                                  <h3>No assistant run yet</h3>
                                  <p>Send a prompt to start a websocket-driven run with visible progress updates.</p>
                                </div>
                              )}

                              {assistantResponse && (
                                <article className="assistant-answer-bubble">
                                  <div className="assistant-answer-meta">
                                    <div className="assistant-answer-identity">
                                      <span className="assistant-answer-avatar">C</span>
                                      <div>
                                        <strong>Clara</strong>
                                        <p>Planner assistant</p>
                                      </div>
                                    </div>
                                    <span className="assistant-answer-model">{assistantModel || 'LLM'}</span>
                                  </div>
                                  <pre className="assistant-response-text">{assistantResponse}</pre>
                                </article>
                              )}
                            </article>

                            <form className="workspace-item-editor-card assistant-composer-card" onSubmit={handleAssistantSubmit}>
                              <label className="field assistant-composer-field">
                                <span>Ask the planner assistant</span>
                                <textarea
                                  className="assistant-textarea"
                                  value={assistantPrompt}
                                  onChange={(event) => setAssistantPrompt(event.target.value)}
                                  placeholder="Example: Based on this account and the live game overview, what should I collect or prioritize next?"
                                  required
                                />
                              </label>

                              <div className="workspace-item-editor-actions assistant-composer-actions">
                                <button
                                  type="submit"
                                  className="primary-button"
                                  disabled={isAssistantLoading || !assistantPrompt.trim()}
                                >
                                  {isAssistantLoading ? 'Run in progress...' : 'Ask assistant'}
                                </button>
                                {isAssistantLoading && (
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    onClick={handleCancelAssistantRun}
                                  >
                                    Cancel run
                                  </button>
                                )}
                              </div>
                            </form>
                          </div>

                          <aside className="assistant-side-column">
                            <div className="note-card assistant-runtime-note">
                              <strong>Assistant runtime</strong>
                              <p>
                                The assistant now runs through an authenticated websocket session, emits visible progress while it investigates the request, and only then delivers the final answer.
                              </p>
                            </div>
                          </aside>
                        </div>
                      </article>
                    )}

                    <div className="note-card">
                      <strong>Next product step</strong>
                      <p>
                        This workspace already reflects account state, local MCP binding, a first local roster sync, and an Ollama-ready assistant scaffold. The next useful layer after this is wiring targets, crafts and fusions into equally editable modules.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <h3>No planner snapshot loaded yet</h3>
                    <p>Select an account on the left or bootstrap a new one to populate this panel.</p>
                  </div>
                )}
              </section>

              <section className="panel-card">
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">Catalog</p>
                    <h2>Seeded item browser</h2>
                  </div>
                  <span>{catalogPagination.total} seeded items</span>
                </div>

                <div className="field-grid compact-grid catalog-toolbar">
                  <label className="field">
                    <span>Search</span>
                    <input
                      type="search"
                      value={catalogFilters.search}
                      onChange={(event) => setCatalogFilters((currentValue) => ({
                        ...currentValue,
                        search: event.target.value
                      }))}
                      placeholder="Search item name..."
                    />
                  </label>

                  <label className="field">
                    <span>Category</span>
                    <select
                      value={catalogFilters.category}
                      onChange={(event) => setCatalogFilters((currentValue) => ({
                        ...currentValue,
                        category: event.target.value
                      }))}
                    >
                      <option value="">All categories</option>
                      {catalogCategoryOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="catalog-summary-bar">
                  <p>
                    Showing {catalogItems.length} of {catalogPagination.total} items in the current filter window.
                  </p>
                  <p>{isLoadingCatalog ? 'Refreshing catalog...' : 'Live from Postgres seed data'}</p>
                </div>

                <div className="catalog-grid">
                  {catalogItems.map((item) => (
                    <article key={item.id} className="catalog-card">
                      <div className="catalog-card-media">
                        {item.iconUrl ? (
                          <img src={item.iconUrl} alt={item.name} loading="lazy" />
                        ) : (
                          <div className="catalog-image-fallback">{item.name.slice(0, 2).toUpperCase()}</div>
                        )}
                      </div>
                      <div className="catalog-card-body">
                        <div className="catalog-card-header">
                          <strong>{item.name}</strong>
                          <span>Lv. {item.level}</span>
                        </div>
                        <p>{item.summary || 'No summary available.'}</p>
                        <div className="catalog-tag-row">
                          <span>{item.categoryName}</span>
                          <span>{item.subcategoryName}</span>
                          <span>{item.minTierName}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </section>
          </section>
        </>
      )}
    </main>
  );
}

export default App;
