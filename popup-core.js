const extractItemsButton = document.getElementById('extractItems');
const scrapeAllItemsButton = document.getElementById('scrapeAllItems');
const optimizeOrderButton = document.getElementById('optimizeOrder');
const fillCartButton = document.getElementById('fillCart');
const postFillReoptimizeButton = document.getElementById('postFillReoptimize');
const optimizerApiUrlInput = document.getElementById('optimizerApiUrl');
const buyerCountrySelectEl = document.getElementById('buyerCountry');
const sellerReputationFilterEl = document.getElementById('sellerReputationFilter');
const sellerDeliveryTimeFilterEl = document.getElementById('sellerDeliveryTimeFilter');
const sellerTypeFilterEl = document.getElementById('sellerTypeFilter');
const sellerCountryFilterInputEl = document.getElementById('sellerCountryFilterInput');
const sellerLocationFilterListEl = document.getElementById('sellerLocationFilterList');
const selectedSellerCountriesEl = document.getElementById('selectedSellerCountries');
const sellerBargainsCheckboxEl = document.getElementById('includeBargainsFromOtherCountries');
const sellerCountryLimitHintEl = document.getElementById('sellerCountryLimitHint');
const sellerSettingsBodyEl = document.getElementById('sellerSettingsBody');
const sellerScrapeProgressEl = document.getElementById('sellerScrapeProgress');
const sellerProgressLabelEl = document.getElementById('sellerProgressLabel');
const sellerProgressCurrentEl = document.getElementById('sellerProgressCurrent');
const sellerProgressPercentEl = document.getElementById('sellerProgressPercent');
const sellerProgressBarEl = document.getElementById('sellerProgressBar');
const wantListPreviewEl = document.getElementById('wantListPreview');
const wantListWarningEl = document.getElementById('wantListWarning');
const wantListSelectEl = document.getElementById('wantListSelect');
const wantListFieldEl = document.getElementById('wantListField');
const sourceTabFieldEl = document.getElementById('sourceTabField');
const sourceTabSelectEl = document.getElementById('sourceTabSelect');
const refreshSourceTabsButton = document.getElementById('refreshSourceTabs');
const sourceTabStatusEl = document.getElementById('sourceTabStatus');
const confirmWantListButton = document.getElementById('confirmWantList');
const summaryEl = document.getElementById('summary');
const itemsEl = document.getElementById('items');
const cartItemsEl = document.getElementById('cartItems');
const sellerItemsEl = document.getElementById('sellerItems');
const cartSummaryEl = document.getElementById('cartSummary');
const cartSummaryGrandTotalEl = document.getElementById('cartSummaryGrandTotal');
const cartSummaryTotalItemsEl = document.getElementById('cartSummaryTotalItems');
const statusLogEl = document.getElementById('statusLog');
const runStatusEl = document.getElementById('runStatus');
const runStatusTextEl = document.getElementById('runStatusText');
const resultPanelEl = document.getElementById('resultPanel');
const resultPanelToggleButton = document.getElementById('resultPanelToggle');
const resultTabsEl = document.getElementById('resultTabs');
const activityBadgeEl = document.getElementById('activityBadge');
const activityTabButton = document.getElementById('resultTabActivity');
const resultTabButtons = [...document.querySelectorAll('[data-result-tab]')];
const resultPanels = [...document.querySelectorAll('[data-result-panel]')];
const workflowStepButtons = [...document.querySelectorAll('[data-workflow-step]')];
const workflowStepPanels = [...document.querySelectorAll('[data-step-panel]')];
const sourceStepBadgeEl = document.getElementById('sourceStepBadge');
const sellerStepBadgeEl = document.getElementById('sellerStepBadge');
const optimizeStepBadgeEl = document.getElementById('optimizeStepBadge');
const fillStepBadgeEl = document.getElementById('fillStepBadge');
const postFillStepBadgeEl = document.getElementById('postFillStepBadge');
const optimizerSettingsBodyEl = document.getElementById('optimizerSettingsBody');
const optimizerInputContextEl = document.getElementById('optimizerInputContext');
const optimizerInputMetaEl = document.getElementById('optimizerInputMeta');
const optimizerInputFiltersEl = document.getElementById('optimizerInputFilters');
const buyerCountryFieldEl = document.getElementById('buyerCountryField');
const mainCartSummaryEl = document.getElementById('mainCartSummary');
const mainCartSummaryGrandTotalEl = document.getElementById('mainCartSummaryGrandTotal');
const mainCartSummaryTotalItemsEl = document.getElementById('mainCartSummaryTotalItems');
const optimizerWaitingEl = document.getElementById('optimizerWaiting');
const optimizerWaitingTextEl = document.getElementById('optimizerWaitingText');
const optimizerWaitingDetailEl = document.getElementById('optimizerWaitingDetail');
const refillWarningEl = document.getElementById('refillWarning');
const postFillSummaryEl = document.getElementById('postFillSummary');
const postFillSellerListEl = document.getElementById('postFillSellerList');
const postFillEmptyStateEl = document.getElementById('postFillEmptyState');
const postFillMemoryNoteEl = document.getElementById('postFillMemoryNote');
const heroFeedbackButton = document.getElementById('heroFeedbackButton');
const heroFeedbackRevealEl = document.getElementById('heroFeedbackReveal');
const heroDonateButton = document.getElementById('heroDonateButton');

const urlParams = new URLSearchParams(window.location.search);
const isWorkspace = urlParams.get('workspace') === '1' || urlParams.get('detached') === '1';
const isDetached = isWorkspace;
const autoStartMode = urlParams.get('autoStart') || '';
const forcedTabId = Number.isInteger(parseInt(urlParams.get('tabId'), 10)) ? parseInt(urlParams.get('tabId'), 10) : null;
const isE2e = urlParams.get('e2e') === '1';
const isPersistentWorkspace = isWorkspace;

if (isPersistentWorkspace) {
  document.body.classList.add('detached');
}

let latestExtractPayload = null;
let latestFrontendPayload = null;
let latestOptimizationResult = null;
let latestExtractedItems = [];
let latestFillResult = null;
let isRunActive = false;
let isUiBusy = false;
let selectedSellerCountries = [];
let includeBargainsFromOtherCountries = false;
let availableWantLists = [];
let selectedWantListId = '';
let restoredWantListId = '';
let activeWorkflowStep = 'source';
let activeResultTab = 'overview';
let workflowHistory = [];
let isResultPanelExpanded = false;
let activeStepActivity = null;
let lastOptimizerWarmupAt = 0;
let wantListRetryTimer = null;
let sellerRequestDelayMs = 250;
let currentPayloadLineageKey = '';
let rememberedDisabledSellerIds = [];
let postFillSellerChoices = [];
let refillWarningActive = false;
let boundSourceTabId = Number.isInteger(forcedTabId) ? forcedTabId : null;
let availableSourceTabs = [];
const sellerExpansionFilterCache = new Map();
const sellerPageHtmlCache = new Map();

const SELLER_SETTINGS_KEY = 'sellerScrapeSettings';
const DETACHED_BATCH_STATE_KEY = 'detachedBatchState';
const POST_FILL_STATE_KEY = 'postFillDisabledSellerState';
const SOURCE_TAB_BINDING_KEY = 'workspaceSourceTabBinding';
const SELLER_COOLDOWN_MS = 10 * 60 * 1000;
const DEFAULT_SELLER_DELAY_MS = 250;
const MIN_SELLER_DELAY_MS = 250;
const OPTIMIZER_WARMUP_THROTTLE_MS = 90 * 1000;
const WANT_LIST_RETRY_DELAY_MS = 2000;
const DEFAULT_SELLER_COUNTRIES = [];
const MAX_WANT_LIST_ITEMS = 100;
const MAX_SELLER_COUNTRIES = 2;
const DEFAULT_OPTIMIZER_API_URL = textOf(window.APP_CONFIG?.optimizerApiUrl);
const WORKFLOW_STEPS = ['source', 'sellers', 'optimize', 'fill', 'post-fill'];
const WORKFLOW_META = {
  source: {
    title: 'Select Cards',
    hint: 'Load selected want list from active Cardmarket tab.',
  },
  sellers: {
    title: 'Get Seller Data',
    hint: 'Scrape seller rows after want items are loaded.',
  },
  optimize: {
    title: 'Optimize Order',
    hint: 'Send normalized payload to optimizer API and review total cost breakdown.',
  },
  fill: {
    title: 'Fill Cart',
    hint: 'Push chosen Cardmarket offers into your cart after reviewing optimized result.',
  },
  'post-fill': {
    title: 'Disable Sellers',
    hint: 'Disable sellers with non-standard delivery fees, then re-optimize.',
  },
};
const SELLER_COUNTRY_OPTIONS = [
  'Austria',
  'Belgium',
  'Bulgaria',
  // 'Canada', // No shipping routes in optimizer dataset.
  'Croatia',
  'Cyprus',
  // 'Czechia', // No shipping routes in optimizer dataset.
  'Denmark',
  'Estonia',
  'Finland',
  'France',
  'Germany',
  'Greece',
  'Hungary',
  'Iceland',
  'Ireland',
  'Italy',
  'Japan',
  'Latvia',
  'Liechtenstein',
  'Lithuania',
  'Luxembourg',
  'Malta',
  'Netherlands',
  'Norway',
  'Poland',
  'Portugal',
  'Romania',
  'Singapore',
  'Slovakia',
  'Slovenia',
  'Spain',
  'Sweden',
  'Switzerland',
  'United Kingdom',
];

selectedSellerCountries = [...DEFAULT_SELLER_COUNTRIES];

function appendStatus(message, tone = '') {
  const entry = document.createElement('li');
  if (tone) entry.className = tone;
  entry.textContent = message;
  statusLogEl.prepend(entry);
  if (isRunActive) {
    setRunState({ active: true, message, tone });
  }
}

function setBusy(isBusy) {
  isUiBusy = isBusy;
  optimizeOrderButton.disabled = isBusy;
  optimizeOrderButton.classList.toggle('is-busy', isBusy);
  fillCartButton.disabled = isBusy;
  fillCartButton.classList.toggle('is-busy', isBusy);
  buyerCountrySelectEl.disabled = isBusy;
  sellerReputationFilterEl.disabled = isBusy;
  sellerDeliveryTimeFilterEl.disabled = isBusy;
  sellerTypeFilterEl.disabled = isBusy;
  if (sellerCountryFilterInputEl) sellerCountryFilterInputEl.disabled = isBusy;
  if (sellerBargainsCheckboxEl) sellerBargainsCheckboxEl.disabled = isBusy;
  sellerLocationFilterListEl.querySelectorAll('button').forEach((button) => {
    button.disabled = isBusy;
  });
  selectedSellerCountriesEl.querySelectorAll('button').forEach((button) => {
    button.disabled = isBusy;
  });
  syncExtractButton(isBusy);
  syncSellerScrapeButton(isBusy);
  syncOptimizeButton(isBusy);
  syncFillCartButton(isBusy);
  if (typeof syncPostFillReoptimizeButton === 'function') {
    syncPostFillReoptimizeButton(isBusy);
  }
  if (typeof renderPostFillScreen === 'function') {
    renderPostFillScreen();
  }
  renderWorkflow();
}

function setRunState({ active, message, tone = '' }) {
  isRunActive = active;
  runStatusEl.classList.toggle('is-active', active);
  runStatusEl.classList.toggle('good', !active && tone === 'good');
  runStatusEl.classList.toggle('bad', !active && tone === 'bad');
  runStatusTextEl.textContent = message;
  const showBadge = active && !activityTabButton.classList.contains('active');
  activityBadgeEl.classList.toggle('visible', showBadge);
  activityTabButton.classList.toggle('has-live', active);
  resultPanelEl?.classList.toggle('has-live', active);
}

function startRun(message) {
  setRunState({ active: true, message });
}

function finishRun(message, tone = '') {
  setRunState({ active: false, message, tone });
}

function getRunStatusTone() {
  if (runStatusEl.classList.contains('bad')) return 'bad';
  if (runStatusEl.classList.contains('good')) return 'good';
  return '';
}

function readSummaryRows() {
  return [...summaryEl.querySelectorAll('.summary-line')].map((row) => ({
    label: textOf(row.querySelector('.summary-label')?.textContent),
    value: textOf(row.querySelector('.summary-value')?.textContent),
    tone: [...(row.querySelector('.summary-value')?.classList || [])]
      .filter((value) => value !== 'summary-value')
      .join(' '),
  }));
}

function readStatusLogEntries(limit = 25) {
  return [...statusLogEl.querySelectorAll('li')]
    .slice(0, limit)
    .map((entry) => ({
      text: textOf(entry.textContent),
      tone: textOf(entry.className),
    }));
}

function getCurrentSellerFilterState() {
  return {
    buyerCountry: getSelectedBuyerCountry(),
    sellerReputation: normalizeSellerReputation(sellerReputationFilterEl?.value),
    maxShippingTime: normalizeMaxShippingTime(sellerDeliveryTimeFilterEl?.value),
    sellerType: normalizeSellerType(sellerTypeFilterEl?.value),
    sellerCountries: getSelectedSellerCountries(),
    includeBargainsFromOtherCountries: getIncludeBargainsFromOtherCountries(),
  };
}

function buildPayloadLineageKey(payload) {
  if (!payload || !Array.isArray(payload.items) || !Array.isArray(payload.offers)) {
    return '';
  }

  const itemSignature = payload.items
    .map((item) => `${textOf(item?.item_id)}:${textOf(item?.quantity)}`)
    .sort()
    .join('|');
  const offerSignature = payload.offers
    .map((offer) => `${textOf(offer?.offer_id)}:${textOf(offer?.seller_id)}:${textOf(offer?.item_id)}`)
    .sort()
    .join('|');

  return [
    textOf(payload?.buyer_country),
    itemSignature,
    offerSignature,
  ].join('::');
}

function getCurrentPayloadLineageKey() {
  return currentPayloadLineageKey;
}

function getRememberedDisabledSellerIds() {
  return [...rememberedDisabledSellerIds];
}

function getPostFillSellerChoices() {
  return [...postFillSellerChoices];
}

function getHiddenRememberedDisabledSellerIds() {
  const visibleSellerIds = new Set(postFillSellerChoices.map((seller) => textOf(seller?.seller_id)));
  return rememberedDisabledSellerIds.filter((sellerId) => !visibleSellerIds.has(sellerId));
}

function setRememberedDisabledSellerIds(sellerIds) {
  rememberedDisabledSellerIds = [...new Set((sellerIds || []).map((sellerId) => textOf(sellerId)).filter(Boolean))].sort();
}

function setPostFillSellerChoicesFromCart(cartSellers) {
  if (!Array.isArray(cartSellers) || !cartSellers.length) {
    return;
  }

  postFillSellerChoices = cartSellers.map((seller) => ({
    seller_id: textOf(seller?.seller_id),
    seller_name: textOf(seller?.seller_name || seller?.seller_id),
    country: textOf(seller?.country),
    shipping_cost: Number(seller?.shipping_cost || 0),
    grand_total: Number(seller?.grand_total || 0),
    total_units: Number(seller?.total_units || 0),
  })).filter((seller) => seller.seller_id);

  if (typeof renderPostFillScreen === 'function') {
    renderPostFillScreen();
  }
}

function clearPostFillSessionState() {
  latestFillResult = null;
  postFillSellerChoices = [];
  refillWarningActive = false;
  if (typeof renderPostFillScreen === 'function') {
    renderPostFillScreen();
  }
}

function markCartAsFilled(fillResult, cartSellers) {
  latestFillResult = fillResult || {};
  refillWarningActive = true;
  setPostFillSellerChoicesFromCart(cartSellers || []);
  syncRefillWarning();
}

function hasFilledCartSession() {
  return !!latestFillResult;
}

function shouldShowRefillWarning() {
  return refillWarningActive;
}

function syncRefillWarning() {
  if (!refillWarningEl) return;
  refillWarningEl.hidden = !shouldShowRefillWarning();
}

async function syncDisabledSellerStateForPayload(payload) {
  currentPayloadLineageKey = buildPayloadLineageKey(payload);
  if (!currentPayloadLineageKey) {
    setRememberedDisabledSellerIds([]);
    if (typeof renderPostFillScreen === 'function') renderPostFillScreen();
    return;
  }

  const storedSellerIds = await loadRememberedDisabledSellerIds(currentPayloadLineageKey);
  setRememberedDisabledSellerIds(storedSellerIds);
  if (typeof renderPostFillScreen === 'function') renderPostFillScreen();
}

async function persistRememberedDisabledSellerIds(sellerIds) {
  setRememberedDisabledSellerIds(sellerIds);
  if (currentPayloadLineageKey) {
    await saveRememberedDisabledSellerIds(currentPayloadLineageKey, rememberedDisabledSellerIds);
  }
  if (typeof renderPostFillScreen === 'function') renderPostFillScreen();
}

function buildPreviousAllocationsPayload(result) {
  const allocations = Array.isArray(result?.allocations) ? result.allocations : [];
  return allocations.map((allocation) => ({
    offer_id: textOf(allocation?.offer_id),
    item_id: textOf(allocation?.item_id),
    seller_id: textOf(allocation?.seller_id),
    quantity: parseIntegerOrFallback(allocation?.quantity, 0),
  })).filter((allocation) => allocation.offer_id && allocation.item_id && allocation.seller_id && allocation.quantity > 0);
}

function buildReoptimizePayload(disabledSellerIds) {
  if (!latestExtractPayload) return null;

  return {
    ...latestExtractPayload,
    previous_allocations: buildPreviousAllocationsPayload(latestOptimizationResult),
    preferences: {
      ...(latestExtractPayload.preferences || {}),
      blocked_seller_ids: [...new Set((disabledSellerIds || []).map((sellerId) => textOf(sellerId)).filter(Boolean))],
    },
  };
}

function getLoadedWantItemCount() {
  return Array.isArray(latestExtractedItems) ? latestExtractedItems.length : 0;
}

function getSellerPagesPerCountry(itemCount = getLoadedWantDistinctItemCount()) {
  const normalizedItemCount = Math.max(0, parseInt(itemCount, 10) || 0);
  if (normalizedItemCount < 20) return 5;
  if (normalizedItemCount < 30) return 4;
  if (normalizedItemCount <= 40) return 3;
  if (normalizedItemCount <= 60) return 2;
  return 1;
}

function buildDistinctWantItemKey(item) {
  if (textOf(item?.idWant)) return `want-${textOf(item.idWant)}`;
  if (textOf(item?.idProduct)) return `product-${textOf(item.idProduct)}`;
  return `name-${textOf(item?.productName)}`;
}

function getLoadedWantDistinctItemCount(items = latestExtractedItems) {
  if (!Array.isArray(items) || !items.length) return 0;
  return new Set(items.map((item) => buildDistinctWantItemKey(item)).filter(Boolean)).size;
}

function getWantListSelectionPolicy(distinctItemCount = getLoadedWantDistinctItemCount()) {
  const normalizedDistinctItemCount = Math.max(0, parseInt(distinctItemCount, 10) || 0);
  const isBlocked = normalizedDistinctItemCount > MAX_WANT_LIST_ITEMS;
  return {
    distinctItemCount: normalizedDistinctItemCount,
    isBlocked,
    maxSellerCountries: MAX_SELLER_COUNTRIES,
    warningMessage: isBlocked
      ? `Want list has ${normalizedDistinctItemCount} distinct items. Seller scrape locked above ${MAX_WANT_LIST_ITEMS}. Choose smaller want list.`
      : '',
  };
}

function getWantListSelectionHint(policy = getWantListSelectionPolicy()) {
  if (!policy.distinctItemCount) return '';
  if (policy.isBlocked) return policy.warningMessage;
  return `Want list has ${policy.distinctItemCount} distinct items. Select 1 or 2 preferred seller countries.`;
}

function getSellerCountryLimitHint(policy = getWantListSelectionPolicy()) {
  if (!policy.distinctItemCount) return '';
  if (policy.isBlocked) {
    return `Want list has ${policy.distinctItemCount} distinct items. Seller scrape disabled above ${MAX_WANT_LIST_ITEMS}.`;
  }
  return `Want list has ${policy.distinctItemCount} distinct items. Select 1 or 2 preferred seller countries for scrape.`;
}

function renderSellerCountryLimitHint(policy = getWantListSelectionPolicy()) {
  if (!sellerCountryLimitHintEl) return;
  const message = getSellerCountryLimitHint(policy);
  const selectedCount = selectedSellerCountries.length;
  const hasValidSelection = !policy.isBlocked && selectedCount >= 1 && selectedCount <= policy.maxSellerCountries;
  sellerCountryLimitHintEl.textContent = message;
  sellerCountryLimitHintEl.hidden = !message;
  sellerCountryLimitHintEl.classList.toggle('good', !!message && hasValidSelection);
  sellerCountryLimitHintEl.classList.toggle('bad', !!message && (policy.isBlocked || !hasValidSelection));
}

function areSameCountries(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function clampSellerCountriesToPolicy(countries, policy = getWantListSelectionPolicy()) {
  const supportedCountries = new Set(SELLER_COUNTRY_OPTIONS.map((value) => normalizeCountryName(value)));
  const normalizedCountries = [...new Set((countries || [])
    .map((value) => normalizeCountryName(value))
    .filter((value) => value && supportedCountries.has(value)))];
  return normalizedCountries.slice(0, Math.min(MAX_SELLER_COUNTRIES, policy.maxSellerCountries));
}

function getSellerCountriesForCurrentPolicy(countries, policy = getWantListSelectionPolicy()) {
  return clampSellerCountriesToPolicy(countries, policy);
}

function getIncludeBargainsFromOtherCountries() {
  return !!includeBargainsFromOtherCountries;
}

function setIncludeBargainsFromOtherCountries(nextValue) {
  includeBargainsFromOtherCountries = !!nextValue;
  if (sellerBargainsCheckboxEl) {
    sellerBargainsCheckboxEl.checked = includeBargainsFromOtherCountries;
  }
}

function enforceWantListSelectionPolicy({ persist = false, announce = false } = {}) {
  const policy = getWantListSelectionPolicy();
  const constrainedCountries = getSellerCountriesForCurrentPolicy(selectedSellerCountries, policy);
  const changed = !areSameCountries(constrainedCountries, selectedSellerCountries);

  renderSellerCountryLimitHint(policy);

  if (changed) {
    renderSellerCountryFilterList(constrainedCountries);
    if (announce && policy.distinctItemCount) {
      appendStatus(
        `Preferred country filter trimmed to ${policy.maxSellerCountries} countries.`,
        'bad'
      );
    }
    if (persist) {
      void saveSellerSettings();
    }
  }

  return policy;
}

function getOptimizeContextSnapshot() {
  if (latestFrontendPayload?.kind !== 'seller-scrape-batch') return null;

  const uniqueSellerIds = new Set();
  (latestFrontendPayload.results || []).forEach((result) => {
    const sellerRows = Array.isArray(result?.sellers) ? result.sellers : [];
    sellerRows.forEach((sellerRow) => {
      uniqueSellerIds.add(buildOptimizerSellerId(sellerRow));
    });
  });

  return {
    wantListId: textOf(latestFrontendPayload.wantListId),
    requestSettings: latestFrontendPayload.requestSettings
      ? {
          ...latestFrontendPayload.requestSettings,
          buyerCountry: normalizeCountryName(latestFrontendPayload.requestSettings.buyerCountry),
          sellerCountries: [...(latestFrontendPayload.requestSettings.sellerCountries || [])],
        }
      : null,
    totals: latestFrontendPayload.totals ? { ...latestFrontendPayload.totals } : null,
    totalSellers: uniqueSellerIds.size,
    itemNames: (latestFrontendPayload.results || [])
      .map((result) => textOf(result?.item?.productName))
      .filter(Boolean),
  };
}

function setStepActivity(activity = null) {
  activeStepActivity = activity ? {
    kind: activity.kind || '',
    label: activity.label || '',
    detail: activity.detail || '',
    current: Number.isFinite(activity.current) ? activity.current : 0,
    total: Number.isFinite(activity.total) ? activity.total : 0,
    indeterminate: !!activity.indeterminate,
  } : null;
  renderStepActivity();
}

function renderStepActivity() {
  const isSellerScrape = activeStepActivity?.kind === 'seller-scrape';
  sellerSettingsBodyEl.hidden = isSellerScrape;
  sellerScrapeProgressEl.hidden = !isSellerScrape;

  if (isSellerScrape) {
    const total = Math.max(0, activeStepActivity.total || 0);
    const current = Math.min(total, Math.max(0, activeStepActivity.current || 0));
    const isIndeterminate = !!activeStepActivity.indeterminate || total === 0;
    const percent = total > 0 ? Math.round((current / total) * 100) : 0;
    sellerProgressLabelEl.textContent = activeStepActivity.label || 'Preparing seller scrape.';
    sellerProgressCurrentEl.textContent = total > 0 ? `Card ${current} of ${total}` : 'Preparing cards';
    sellerProgressPercentEl.textContent = isIndeterminate ? 'Working...' : `${percent}%`;
    sellerProgressBarEl.classList.toggle('indeterminate', isIndeterminate);
    sellerProgressBarEl.style.width = isIndeterminate ? '35%' : `${percent}%`;
  } else {
    sellerProgressBarEl.classList.remove('indeterminate');
    sellerProgressBarEl.style.width = '0%';
  }

  const isOptimizerRequest = activeStepActivity?.kind === 'optimizer-request';
  optimizerSettingsBodyEl.hidden = isOptimizerRequest;
  optimizerWaitingEl.hidden = !isOptimizerRequest;

  if (isOptimizerRequest) {
    optimizerWaitingTextEl.textContent = activeStepActivity.label || 'Request sent. Waiting for reply.';
    optimizerWaitingDetailEl.textContent = activeStepActivity.detail || 'Optimizer can take moment while it balances price against shipping.';
  }
}

function setResultPanelExpanded(expanded) {
  isResultPanelExpanded = !!expanded;
  resultPanelEl?.setAttribute('data-panel-expanded', isResultPanelExpanded ? 'true' : 'false');
  resultPanelToggleButton?.setAttribute('aria-expanded', isResultPanelExpanded ? 'true' : 'false');
  resultPanelToggleButton?.setAttribute('aria-label', isResultPanelExpanded ? 'Hide results and activity' : 'Show results and activity');
}

function setActiveResultTab(tabName) {
  activeResultTab = tabName;

  resultTabButtons.forEach((button) => {
    const isActive = button.dataset.resultTab === tabName;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  resultPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.resultPanel === tabName);
  });

  if (tabName === 'activity') {
    activityBadgeEl.classList.remove('visible');
  } else if (isRunActive) {
    activityBadgeEl.classList.add('visible');
  }
}

function getWorkflowState() {
  const frontendKind = textOf(latestFrontendPayload?.kind);
  const wantListPolicy = getWantListSelectionPolicy();
  return {
    hasExtractedWants: latestExtractedItems.length > 0,
    wantListBlocked: wantListPolicy.isBlocked,
    hasSellerBatch: frontendKind === 'seller-scrape-batch',
    hasOptimizerPayload: !!latestExtractPayload,
    hasOptimizationResult: !!latestOptimizationResult,
    hasOptimalCart: hasOptimizedCart(),
    hasFilledCart: hasFilledCartSession(),
    hasPostFillChoices: postFillSellerChoices.length > 0,
  };
}

function canAccessWorkflowStep(stepName, state = getWorkflowState()) {
  if (stepName === 'source') return true;
  if (stepName === 'sellers') return state.hasExtractedWants && !state.wantListBlocked;
  if (stepName === 'optimize') return state.hasOptimizerPayload;
  if (stepName === 'fill') return state.hasOptimalCart;
  if (stepName === 'post-fill') return state.hasFilledCart;
  return false;
}

function getSuggestedWorkflowStep(state = getWorkflowState()) {
  if (state.hasFilledCart) return 'post-fill';
  if (state.hasOptimalCart) return 'fill';
  if (state.hasOptimizerPayload) return 'optimize';
  if (state.hasExtractedWants) return 'sellers';
  return 'source';
}

function getAccessibleWorkflowSteps(state = getWorkflowState()) {
  return WORKFLOW_STEPS.filter((stepName) => canAccessWorkflowStep(stepName, state));
}

function getPreviousWorkflowStepFromHistory(state = getWorkflowState()) {
  while (workflowHistory.length) {
    const previousStep = workflowHistory[workflowHistory.length - 1];
    if (canAccessWorkflowStep(previousStep, state)) {
      return previousStep;
    }
    workflowHistory.pop();
  }
  return null;
}

function getWorkflowStepHint(stepName, state = getWorkflowState()) {
  if (stepName === 'source') {
    if (state.hasExtractedWants && state.wantListBlocked) {
      return getWantListSelectionHint();
    }
    if (state.hasExtractedWants) {
      return getWantListSelectionHint();
    }
    if (!availableWantLists.length) {
      return 'Open any Cardmarket page. Popup auto-detects want lists from your logged-in session.';
    }
    if (!hasSelectedWantList()) {
      return 'Choose want list in dropdown, then load cards into popup.';
    }
  }

  if (stepName === 'sellers') {
    if (!state.hasExtractedWants) {
      return 'Seller scrape locked until want items are extracted from Cardmarket page.';
    }
    if (state.wantListBlocked) {
      return getWantListSelectionHint();
    }
    if (state.hasSellerBatch) {
      return 'Seller batch ready. Review preview rows or continue to optimization.';
    }
  }

  if (stepName === 'optimize') {
    if (!state.hasOptimizerPayload) {
      return 'Optimization locked until seller payload exists.';
    }
    if (state.hasOptimizationResult && !state.hasOptimalCart) {
      return 'Optimizer ran. Review infeasible or partial result before trying again.';
    }
    if (state.hasOptimalCart) {
      return 'Optimal cart ready. Review totals and chosen sellers, then fill cart if result looks right.';
    }
  }

  if (stepName === 'fill' && !state.hasOptimalCart) {
    return 'Fill cart unlocks only after optimizer returns an optimal cart.';
  }

  if (stepName === 'post-fill') {
    if (!state.hasFilledCart) {
      return 'Disable-seller step unlocks only after cart fill succeeds.';
    }
    if (!state.hasPostFillChoices) {
      return 'No filled-cart sellers available yet for disable-seller review.';
    }
  }

  return WORKFLOW_META[stepName]?.hint || '';
}

function setStepBadge(element, text, tone = '') {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle('good', tone === 'good');
}

function renderWorkflow() {
  const state = getWorkflowState();
  if (!canAccessWorkflowStep(activeWorkflowStep, state)) {
    activeWorkflowStep = getSuggestedWorkflowStep(state);
  }

  renderStepActivity();

  workflowStepButtons.forEach((button) => {
    const stepName = button.dataset.workflowStep || 'source';
    const isActive = stepName === activeWorkflowStep;
    const isAccessible = canAccessWorkflowStep(stepName, state);
    let stepState = 'locked';
    if (isAccessible) {
      stepState = isActive ? 'active' : 'done';
    }
    if (stepName === 'source' && !state.hasExtractedWants) {
      stepState = isActive ? 'active' : 'done';
    }
    if (stepName === 'sellers' && isAccessible && !state.hasSellerBatch && !isActive) {
      stepState = 'done';
    }
    if (stepName === 'optimize' && isAccessible && !state.hasOptimizationResult && !isActive) {
      stepState = 'done';
    }

    button.dataset.state = stepState;
    button.classList.toggle('active', isActive);
    button.disabled = isUiBusy || !isAccessible;
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  workflowStepPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.stepPanel === activeWorkflowStep);
  });

  if (state.hasExtractedWants) {
    setStepBadge(sourceStepBadgeEl, `${latestExtractedItems.length} items ready`, 'good');
  } else if (hasSelectedWantList()) {
    setStepBadge(sourceStepBadgeEl, 'List selected', 'good');
  } else {
    setStepBadge(sourceStepBadgeEl, 'Waiting');
  }

  if (state.hasSellerBatch) {
    setStepBadge(sellerStepBadgeEl, 'Seller data ready', 'good');
  } else if (state.hasExtractedWants) {
    setStepBadge(sellerStepBadgeEl, 'Ready');
  } else {
    setStepBadge(sellerStepBadgeEl, 'Locked');
  }

  if (state.hasOptimizationResult) {
    setStepBadge(optimizeStepBadgeEl, state.hasOptimalCart ? 'Optimal result' : 'Result ready', 'good');
  } else if (state.hasOptimizerPayload) {
    setStepBadge(optimizeStepBadgeEl, 'Ready', 'good');
  } else {
    setStepBadge(optimizeStepBadgeEl, 'Locked');
  }

  if (state.hasOptimalCart) {
    setStepBadge(fillStepBadgeEl, 'Ready', 'good');
  } else {
    setStepBadge(fillStepBadgeEl, 'Locked');
  }

  if (postFillStepBadgeEl) {
    if (state.hasFilledCart) {
      const disabledCount = rememberedDisabledSellerIds.length;
      const badgeText = disabledCount
        ? `${disabledCount} disabled`
        : (state.hasPostFillChoices ? 'Ready' : 'Waiting');
      setStepBadge(postFillStepBadgeEl, badgeText, 'good');
    } else {
      setStepBadge(postFillStepBadgeEl, 'Locked');
    }
  }

  syncRefillWarning();
}

function setActiveWorkflowStep(stepName, { force = false, recordHistory = true } = {}) {
  const state = getWorkflowState();
  const nextStep = !force && !canAccessWorkflowStep(stepName, state)
    ? getSuggestedWorkflowStep(state)
    : stepName;

  if (recordHistory && nextStep !== activeWorkflowStep) {
    workflowHistory.push(activeWorkflowStep);
  }

  if (!force && !canAccessWorkflowStep(stepName, state)) {
    activeWorkflowStep = getSuggestedWorkflowStep(state);
  } else {
    activeWorkflowStep = nextStep;
  }
  renderWorkflow();
}

function formatRemaining(ms) {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function textOf(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function isCardmarketUrl(url = '') {
  return /^https:\/\/(?:www\.)?cardmarket\.com\//.test(url);
}

async function queryOpenCardmarketTabs() {
  const allTabs = await chrome.tabs.query({});
  return allTabs.filter((tab) => isCardmarketUrl(tab?.url || ''));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function syncOptimizerApiUrlInput() {
  if (!optimizerApiUrlInput) return;
  optimizerApiUrlInput.value = DEFAULT_OPTIMIZER_API_URL;
}

function clearWantListRetry() {
  if (wantListRetryTimer !== null) {
    window.clearTimeout(wantListRetryTimer);
    wantListRetryTimer = null;
  }
}

function scheduleWantListRetry() {
  if (wantListRetryTimer !== null || !isPersistentWorkspace) return;
  wantListRetryTimer = window.setTimeout(() => {
    wantListRetryTimer = null;
    refreshWantLists({ quiet: true }).catch(() => {});
  }, WANT_LIST_RETRY_DELAY_MS);
}

function getSelectedBuyerCountry() {
  return normalizeCountryName(buyerCountrySelectEl?.value);
}

function setAvailableWantLists(wantLists, preferredWantListId = '') {
  availableWantLists = Array.isArray(wantLists)
    ? wantLists
      .map((entry) => ({
        id: textOf(entry?.id),
        name: textOf(entry?.name) || `Want list ${textOf(entry?.id)}`,
        path: textOf(entry?.path),
      }))
      .filter((entry) => entry.id)
    : [];

  const validIds = new Set(availableWantLists.map((entry) => entry.id));
  const desiredId = textOf(selectedWantListId);
  if (desiredId && validIds.has(desiredId)) {
    selectedWantListId = desiredId;
  } else {
    selectedWantListId = '';
  }

  renderWantListOptions();
  syncExtractButton(isUiBusy);
  renderWorkflow();
}

function normalizeLanguageName(value) {
  const normalized = textOf(value).toLowerCase();
  const aliases = {
    deutsch: 'German',
    german: 'German',
    englisch: 'English',
    english: 'English',
    französisch: 'French',
    french: 'French',
    italienisch: 'Italian',
    italian: 'Italian',
    spanisch: 'Spanish',
    spanish: 'Spanish',
    portugiesisch: 'Portuguese',
    portuguese: 'Portuguese',
    japanisch: 'Japanese',
    japanese: 'Japanese',
    koreanisch: 'Korean',
    korean: 'Korean',
    chinesisch: 'Chinese',
    chinese: 'Chinese',
    's-chinesisch': 'Chinese',
    't-chinesisch': 'Chinese',
    russisch: 'Russian',
    russian: 'Russian',
  };
  return aliases[normalized] || textOf(value);
}

const {
  normalizeSellerReputation,
  normalizeSellerType,
  normalizeMaxShippingTime,
  getCardmarketSellerReputationId,
  getCardmarketMaxShippingTimeId,
  getCardmarketSellerTypeId,
} = window.SellerFilterUtils;

function normalizeCountryName(value) {
  const normalized = textOf(value).toLowerCase();
  if (!normalized) return '';
  const aliases = {
    at: 'Austria',
    austria: 'Austria',
    be: 'Belgium',
    belgium: 'Belgium',
    bg: 'Bulgaria',
    bulgaria: 'Bulgaria',
    ca: 'Canada',
    canada: 'Canada',
    ch: 'Switzerland',
    switzerland: 'Switzerland',
    schweiz: 'Switzerland',
    cy: 'Cyprus',
    cyprus: 'Cyprus',
    cz: 'Czechia',
    czechia: 'Czechia',
    'czech republic': 'Czechia',
    de: 'Germany',
    germany: 'Germany',
    deutschland: 'Germany',
    dk: 'Denmark',
    denmark: 'Denmark',
    ee: 'Estonia',
    estonia: 'Estonia',
    es: 'Spain',
    spain: 'Spain',
    fi: 'Finland',
    finland: 'Finland',
    fr: 'France',
    france: 'France',
    gb: 'United Kingdom',
    uk: 'United Kingdom',
    'united kingdom': 'United Kingdom',
    'great britain': 'United Kingdom',
    gr: 'Greece',
    greece: 'Greece',
    hr: 'Croatia',
    croatia: 'Croatia',
    hu: 'Hungary',
    hungary: 'Hungary',
    ie: 'Ireland',
    ireland: 'Ireland',
    is: 'Iceland',
    iceland: 'Iceland',
    it: 'Italy',
    italy: 'Italy',
    jp: 'Japan',
    japan: 'Japan',
    li: 'Liechtenstein',
    liechtenstein: 'Liechtenstein',
    lt: 'Lithuania',
    lithuania: 'Lithuania',
    lu: 'Luxembourg',
    luxembourg: 'Luxembourg',
    lv: 'Latvia',
    latvia: 'Latvia',
    mt: 'Malta',
    malta: 'Malta',
    nl: 'Netherlands',
    netherlands: 'Netherlands',
    nederland: 'Netherlands',
    no: 'Norway',
    norway: 'Norway',
    pl: 'Poland',
    poland: 'Poland',
    pt: 'Portugal',
    portugal: 'Portugal',
    ro: 'Romania',
    romania: 'Romania',
    se: 'Sweden',
    sweden: 'Sweden',
    sg: 'Singapore',
    singapore: 'Singapore',
    si: 'Slovenia',
    slovenia: 'Slovenia',
    sk: 'Slovakia',
    slovakia: 'Slovakia',
  };
  return aliases[normalized] || '';
}

function normalizeCardCondition(value) {
  const normalized = textOf(value).toLowerCase();
  if (!normalized) return '';
  if (/near mint|nm/.test(normalized)) return 'NM';
  if (/excellent|ex/.test(normalized)) return 'EX';
  if (/good|gd/.test(normalized)) return 'GD';
  if (/light played|lp/.test(normalized)) return 'LP';
  if (/played|pl/.test(normalized)) return 'PL';
  if (/poor/.test(normalized)) return 'PO';
  return textOf(value);
}

function parseCountryFilterInput(value) {
  return textOf(value)
    .split(',')
    .map((entry) => normalizeCountryName(entry))
    .filter(Boolean);
}

function getItemLanguages(item) {
  const languages = Array.isArray(item?.languages)
    ? item.languages.map((value) => textOf(value)).filter(Boolean)
    : [];
  if (languages.length) {
    return [...new Set(languages.map((value) => normalizeLanguageName(value)).filter(Boolean))];
  }

  const singleLanguage = normalizeLanguageName(item?.language);
  return singleLanguage ? [singleLanguage] : [];
}

function getSingleItemLanguage(item) {
  const languages = getItemLanguages(item);
  return languages[0] || '';
}

function getCardmarketLanguageId(value) {
  const normalized = normalizeLanguageName(value);
  const ids = {
    English: '1',
    French: '2',
    German: '3',
    Spanish: '4',
    Italian: '5',
    Portuguese: '6',
    Japanese: '7',
    Korean: '8',
    Russian: '9',
    Chinese: '10',
  };
  return ids[normalized] || '';
}

function getCardmarketCountryId(value) {
  const normalized = normalizeCountryName(value);
  const ids = {
    Austria: '1',
    Belgium: '2',
    Bulgaria: '3',
    Switzerland: '4',
    Cyprus: '5',
    Czechia: '6',
    Germany: '7',
    Denmark: '8',
    Estonia: '9',
    Spain: '10',
    Finland: '11',
    France: '12',
    'United Kingdom': '13',
    Greece: '14',
    Hungary: '15',
    Ireland: '16',
    Italy: '17',
    Liechtenstein: '18',
    Lithuania: '19',
    Luxembourg: '20',
    Latvia: '21',
    Malta: '22',
    Netherlands: '23',
    Norway: '24',
    Poland: '25',
    Portugal: '26',
    Romania: '27',
    Sweden: '28',
    Singapore: '29',
    Slovenia: '30',
    Slovakia: '31',
    Canada: '33',
    Croatia: '35',
    Japan: '36',
    Iceland: '37',
  };
  return ids[normalized] || '';
}

function getCardmarketCountryIdsFromCountries(values) {
  return [...new Set((values || []).map((value) => getCardmarketCountryId(value)).filter(Boolean))];
}

function getCountryNameById(countryId) {
  return SELLER_COUNTRY_OPTIONS.find((country) => getCardmarketCountryId(country) === String(countryId)) || '';
}

async function getSellerCooldownUntil() {
  const storageArea = await getStorageArea();
  const stored = await storageArea.get('sellerScrapeCooldownUntil');
  return stored.sellerScrapeCooldownUntil || 0;
}

async function setSellerCooldownUntil(timestamp) {
  const storageArea = await getStorageArea();
  await storageArea.set({ sellerScrapeCooldownUntil: timestamp });
}

function slugifyValue(value, fallback = 'unknown') {
  const normalized = textOf(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function parseIntegerOrFallback(value, fallback = 1) {
  const parsed = parseInt(String(value || '').replace(/[^\d-]+/g, ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseEuroAmount(value) {
  const normalized = textOf(value)
    .replace(/\s*€\s*$/i, '')
    .replace(/\./g, '')
    .replace(/,/g, '.');
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrencyAmount(amount, currency = 'EUR') {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return `${amount}`;
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numericAmount);
}

function inferBuyerCountry() {
  const regionToCountry = {
    AT: 'Austria',
    BE: 'Belgium',
    BG: 'Bulgaria',
    CA: 'Canada',
    CH: 'Switzerland',
    CY: 'Cyprus',
    CZ: 'Czechia',
    DE: 'Germany',
    DK: 'Denmark',
    EE: 'Estonia',
    ES: 'Spain',
    FI: 'Finland',
    FR: 'France',
    GB: 'United Kingdom',
    GR: 'Greece',
    HR: 'Croatia',
    HU: 'Hungary',
    IE: 'Ireland',
    IS: 'Iceland',
    IT: 'Italy',
    JP: 'Japan',
    LI: 'Liechtenstein',
    LT: 'Lithuania',
    LU: 'Luxembourg',
    LV: 'Latvia',
    MT: 'Malta',
    NL: 'Netherlands',
    NO: 'Norway',
    PL: 'Poland',
    PT: 'Portugal',
    RO: 'Romania',
    SE: 'Sweden',
    SG: 'Singapore',
    SI: 'Slovenia',
    SK: 'Slovakia',
    UK: 'United Kingdom',
  };
  const locales = [...new Set([
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ].filter(Boolean))];
  for (const locale of locales) {
    const regionMatch = String(locale).match(/-([A-Za-z]{2})\b/);
    if (!regionMatch) continue;
    const country = regionToCountry[regionMatch[1].toUpperCase()];
    if (country) return country;
  }
  return 'Unknown';
}

function buildOptimizerItemId(item, index) {
  if (textOf(item?.idWant)) return `want-${textOf(item.idWant)}`;
  if (textOf(item?.idProduct)) return `product-${textOf(item.idProduct)}`;
  return `item-${index + 1}-${slugifyValue(item?.productName, 'card')}`;
}

function buildOptimizerSellerId(seller) {
  const sellerUrl = textOf(seller?.sellerUrl);
  if (sellerUrl) {
    try {
      const pathname = new URL(sellerUrl).pathname;
      const match = pathname.match(/\/Users\/([^/?#]+)/i);
      if (match?.[1]) return decodeURIComponent(match[1]);
    } catch {
      // Ignore bad seller URLs and fall back to name/location-based IDs.
    }
  }

  const namePart = slugifyValue(seller?.sellerName, 'seller');
  const countryPart = slugifyValue(normalizeCountryName(seller?.location) || seller?.location, 'unknown');
  return `${namePart}-${countryPart}`;
}

function buildOptimizerPayload(batchResult) {
  if (!batchResult || batchResult.kind !== 'seller-scrape-batch') return null;

  const sellersById = new Map();
  const itemsById = new Map();
  const offers = [];

  batchResult.results.forEach((result, resultIndex) => {
    const sellerRows = Array.isArray(result?.sellers) ? result.sellers : [];
    if (!sellerRows.length) return;

    const item = result.item || {};
    const itemId = buildOptimizerItemId(item, resultIndex);

    sellerRows.forEach((sellerRow, sellerIndex) => {
      const unitPrice = parseEuroAmount(sellerRow?.price);
      if (unitPrice === null) return;

      const sellerId = buildOptimizerSellerId(sellerRow);
      const sellerName = textOf(sellerRow?.sellerName) || sellerId;
      const country = normalizeCountryName(sellerRow?.location) || 'Unknown';
      if (!sellersById.has(sellerId)) {
        sellersById.set(sellerId, {
          seller_id: sellerId,
          name: sellerName,
          country,
        });
      }

      itemsById.set(itemId, {
        item_id: itemId,
        name: textOf(item?.productName) || itemId,
        quantity: parseIntegerOrFallback(item?.quantity, 1),
        min_condition: normalizeCardCondition(item?.minCondition) || null,
        preferred_languages: getItemLanguages(item),
      });

      const articleId = textOf(sellerRow?.articleId);
      offers.push({
        offer_id: articleId || `${itemId}-${sellerId}-${sellerIndex + 1}`,
        item_id: itemId,
        seller_id: sellerId,
        unit_price: unitPrice,
        available_quantity: parseIntegerOrFallback(sellerRow?.amount, 1),
      });
    });
  });

  if (!offers.length || !itemsById.size || !sellersById.size) {
    return null;
  }

  return {
    buyer_country: getSelectedBuyerCountry() || 'Unknown',
    currency: 'EUR',
    items: [...itemsById.values()],
    sellers: [...sellersById.values()],
    offers,
    preferences: {
      max_sellers: null,
      allowed_countries: getSelectedSellerCountries(),
      blocked_seller_ids: [],
      return_alternatives: 0,
    },
  };
}

async function getTargetTab() {
  if (Number.isInteger(forcedTabId)) {
    try {
      const forcedTab = await chrome.tabs.get(forcedTabId);
      if (isCardmarketUrl(forcedTab?.url || '')) {
        return forcedTab;
      }
    } catch {
    }
  }

  if (Number.isInteger(boundSourceTabId)) {
    try {
      const boundTab = await chrome.tabs.get(boundSourceTabId);
      if (isCardmarketUrl(boundTab?.url || '')) {
        return boundTab;
      }
    } catch {
    }
  }

  const openTabs = await queryOpenCardmarketTabs();
  const [activeTabInFocusedWindow] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeTabInFocusedWindow?.id && isCardmarketUrl(activeTabInFocusedWindow.url || '')) {
    return activeTabInFocusedWindow;
  }

  if (openTabs.length === 1) {
    return openTabs[0] || null;
  }

  if (openTabs.length > 1) {
    const activeKnownTab = openTabs.find((tab) => tab.active);
    if (activeKnownTab) {
      return activeKnownTab;
    }
    return openTabs[0] || null;
  }

  return null;
}

async function openWorkspaceWindow({ autoStart = '' } = {}) {
  const sourceTab = await getTargetTab().catch(() => null);
  const response = await chrome.runtime.sendMessage({
    type: 'workspace/open',
    autoStart,
    sourceTabId: sourceTab?.id || null,
    sourceTabUrl: sourceTab?.url || '',
    sourceTabTitle: sourceTab?.title || '',
  });
  if (!response?.ok) {
    throw new Error(response?.error || 'Could not open optimizer workspace window.');
  }
}

async function executeInTab(tabId, func, args = []) {
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });
  if (execution?.exceptionDetails?.text) {
    throw new Error(execution.exceptionDetails.text);
  }
  return execution?.result;
}

function wantsPageKind(pathname) {
  if (/\/Wants\/(?:EditWantsList\/|Show\/)?\d+(?:[/?#]|$)/i.test(pathname)) return 'wants-detail';
  if (/\/Wants(?:[/?#]|$)/i.test(pathname)) return 'wants-overview';
  return 'other-cardmarket';
}

async function ensureCardmarketTab() {
  const tab = await getTargetTab();
  if (!tab?.id) throw new Error('No active browser tab available.');
  if (!isCardmarketUrl(tab.url || '')) {
    throw new Error('Open a Cardmarket page in the active tab first.');
  }
  return tab;
}

function parseCardmarketRequestContext(urlValue) {
  if (!urlValue) return null;

  try {
    const url = new URL(urlValue);
    if (!isCardmarketUrl(url.toString())) {
      return null;
    }

    const pathParts = url.pathname.split('/').filter(Boolean);
    return {
      origin: url.origin,
      lang: pathParts[0] || 'en',
      game: pathParts[1] || 'Magic',
    };
  } catch {
    return null;
  }
}

async function resolveSellerRequestContext(item) {
  const fromItem = parseCardmarketRequestContext(item?.productUrl);
  if (fromItem) return fromItem;

  const tab = await getTargetTab();
  const fromTab = parseCardmarketRequestContext(tab?.url || '');
  if (fromTab) return fromTab;

  throw new Error('Could not determine Cardmarket language and game for seller scrape. Re-extract want items from a Cardmarket want list first.');
}

function buildSellerRequestUrl(urlValue, activeFilters = {}, originValue = 'https://cardmarket.com') {
  const url = new URL(urlValue, originValue);
  if (activeFilters.expansionIds) {
    url.searchParams.set('idExpansion', activeFilters.expansionIds);
  }
  if (activeFilters.languageId) {
    url.searchParams.set('language', activeFilters.languageId);
  }
  if (activeFilters.isFoil != null) {
    url.searchParams.set('isFoil', activeFilters.isFoil ? 'Y' : 'N');
  }
  if (activeFilters.sellerCountryIds?.length) {
    url.searchParams.set('sellerCountry', activeFilters.sellerCountryIds.join(','));
  }
  if (activeFilters.sellerReputationId) {
    url.searchParams.set('sellerReputation', activeFilters.sellerReputationId);
  }
  if (activeFilters.maxShippingTimeId) {
    url.searchParams.set('maxShippingTime', activeFilters.maxShippingTimeId);
  }
  if (activeFilters.sellerTypeId) {
    url.searchParams.set('sellerType', activeFilters.sellerTypeId);
  }
  return url.toString();
}

function getRequestedExpansionNames(item) {
  const names = Array.isArray(item?.expansions) ? item.expansions : [];
  return [...new Set(names.map((value) => textOf(value)).filter(Boolean))];
}

function normalizeExpansionFilterLabel(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function inspectAvailableExpansionFiltersInDocument(doc) {
  const select = doc.querySelector('select[name="idExpansion"], select[name^="idExpansion"], select#idExpansion, select[name="expansion"]');
  if (!select) return [];

  const seen = new Set();
  return [...select.options]
    .map((option) => ({
      rawName: select.name || '',
      value: textOf(option.value),
      label: textOf(option.textContent),
      selected: option.selected,
    }))
    .filter((option) => {
      if (!/^\d+$/.test(option.value) || option.value === '0' || !option.label) return false;
      const marker = `${option.rawName}|${option.value}|${option.label}`;
      if (seen.has(marker)) return false;
      seen.add(marker);
      return true;
    });
}

function buildExpansionFilterCacheKey(item, requestContext) {
  return [
    textOf(requestContext?.origin),
    textOf(requestContext?.lang),
    textOf(requestContext?.game),
    textOf(item?.idProduct),
    textOf(item?.productUrl),
  ].join('|');
}

function matchExpansionIds(requestedExpansionNames, availableExpansionFilters) {
  const expansionIds = [];
  const matchedExpansionNames = [];
  const unmatchedExpansionNames = [];
  const idsByLabel = new Map();

  availableExpansionFilters.forEach((entry) => {
    const normalizedLabel = normalizeExpansionFilterLabel(entry?.label);
    const value = textOf(entry?.value);
    if (!normalizedLabel || !/^\d+$/.test(value) || value === '0') return;
    if (!idsByLabel.has(normalizedLabel)) idsByLabel.set(normalizedLabel, []);
    idsByLabel.get(normalizedLabel).push(value);
  });

  requestedExpansionNames.forEach((name) => {
    const normalizedName = normalizeExpansionFilterLabel(name);
    const matchedIds = normalizedName ? idsByLabel.get(normalizedName) || [] : [];
    if (!matchedIds.length) {
      unmatchedExpansionNames.push(name);
      return;
    }
    matchedExpansionNames.push(name);
    matchedIds.forEach((value) => {
      if (!expansionIds.includes(value)) expansionIds.push(value);
    });
  });

  return {
    expansionIds: expansionIds.join(','),
    matchedExpansionNames,
    unmatchedExpansionNames,
  };
}

async function fetchAvailableExpansionFiltersForItem({ item, requestContext, requestFilters = {} }) {
  const runtimeContext = requestContext || parseCardmarketRequestContext(item?.productUrl);
  if (!runtimeContext) return { options: [], rateLimited: false };
  if (!item?.productUrl) return { options: [], rateLimited: false };

  const sanitizedFilters = { ...requestFilters };
  delete sanitizedFilters.expansionIds;

  const candidateUrls = [buildSellerRequestUrl(item.productUrl, sanitizedFilters, runtimeContext.origin)];

  const seenUrls = new Set();
  for (const candidateUrl of candidateUrls) {
    if (!candidateUrl || seenUrls.has(candidateUrl)) continue;
    seenUrls.add(candidateUrl);
    try {
      const response = await fetch(candidateUrl, { credentials: 'include' });
      if (response.status === 429) {
        return { options: [], rateLimited: true };
      }
      if (!response.ok) continue;
      const html = await response.text();
      if (!/cf-mitigated|cf-chl-bypass|Just a moment|Checking your browser|cf-browser-verification|Cloudflare Ray ID/i.test(html)) {
        sellerPageHtmlCache.set(candidateUrl, html);
      }
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const options = inspectAvailableExpansionFiltersInDocument(doc);
      if (options.length) {
        return { options, rateLimited: false };
      }
    } catch {
    }
  }

  return { options: [], rateLimited: false };
}

async function resolveItemExpansionRequestFilter({ item, requestContext, requestFilters = {} }) {
  const requestedExpansionNames = getRequestedExpansionNames(item);
  if (!requestedExpansionNames.length) {
    return {
      expansionIds: '',
      matchedExpansionNames: [],
      unmatchedExpansionNames: [],
      rateLimited: false,
    };
  }

  const cacheKey = buildExpansionFilterCacheKey(item, requestContext);
  let availableExpansionFilters = sellerExpansionFilterCache.get(cacheKey) || [];
  let rateLimited = false;

  if (!availableExpansionFilters.length) {
    const discovery = await fetchAvailableExpansionFiltersForItem({ item, requestContext, requestFilters });
    availableExpansionFilters = discovery.options || [];
    rateLimited = discovery.rateLimited === true;
    if (availableExpansionFilters.length) {
      sellerExpansionFilterCache.set(cacheKey, availableExpansionFilters);
    }
  }

  return {
    ...matchExpansionIds(requestedExpansionNames, availableExpansionFilters),
    rateLimited,
  };
}

function shouldPartitionSellerScrape(baseResult, countryScopes) {
  if (!baseResult || baseResult.error) return false;
  if (!countryScopes.length) return false;
  if (countryScopes.length === 1 && (baseResult.requestFilters?.sellerCountryIds || []).length === 1) return false;
  if ((baseResult.requestFilters?.sellerCountryIds || []).length > 1) return true;
  return isSellerScopeLikelyCapped(baseResult, 250);
}

function buildSellerCountryScopes({ requestCountryIds, availableSellerFilters }) {
  const explicitIds = [...new Set((requestCountryIds || []).filter(Boolean))];
  if (explicitIds.length > 1) {
    return explicitIds.map((countryId) => ({ countryId, label: `country:${countryId}` }));
  }
  if (explicitIds.length === 1) return [{ countryId: explicitIds[0], label: `country:${explicitIds[0]}` }];

  const sellerCountryOptions = Array.isArray(availableSellerFilters?.sellerCountry)
    ? availableSellerFilters.sellerCountry
    : [];
  const discoveredIds = [...new Set(sellerCountryOptions
    .map((entry) => String(entry?.value || '').trim())
    .filter((value) => /^\d+$/.test(value)))];

  return discoveredIds.map((countryId) => ({ countryId, label: `country:${countryId}` }));
}

function isSellerScopeLikelyCapped(result, minimumSellerCount = 300) {
  if (!result || result.error) return false;
  if (result.ajaxDebug?.maxPaginatedResultsReached) return true;
  return (result.totalSellers || 0) >= minimumSellerCount;
}

function mergeSellerScopeResults(baseResult, partitionResults) {
  const allResults = [baseResult, ...(partitionResults || [])].filter(Boolean);
  const seedResult = baseResult || partitionResults?.[0] || {};
  const hasBaseResult = !!baseResult;
  const mergedSellers = [];
  const seenArticleIds = new Set();
  const attemptedUrls = [];
  const seenAttempts = new Set();
  let pagesFetched = 0;
  let rateLimited = false;
  let firstError = '';

  allResults.forEach((result, index) => {
    pagesFetched += result.pagesFetched || 0;
    rateLimited = rateLimited || !!result.rateLimited;
    if (!firstError && result.error) firstError = result.error;
    (result.attemptedUrls || []).forEach((attempt) => {
      const scopedAttempt = index === 0 ? attempt : `${result.partitionLabel || 'partition'} -> ${attempt}`;
      if (seenAttempts.has(scopedAttempt)) return;
      seenAttempts.add(scopedAttempt);
      attemptedUrls.push(scopedAttempt);
    });
    (result.sellers || []).forEach((seller) => {
      if (!seller?.articleId || seenArticleIds.has(seller.articleId)) return;
      seenArticleIds.add(seller.articleId);
      mergedSellers.push(seller);
    });
  });

  return {
    ...seedResult,
    error: firstError,
    sellers: mergedSellers,
    sellerPreview: mergedSellers.slice(0, 12),
    totalSellers: mergedSellers.length,
    pagesFetched,
    attemptedUrls,
    partitionCount: allResults.length,
    partitions: allResults.map((result, index) => ({
      label: result.partitionLabel || (hasBaseResult && index === 0 ? 'base' : `partition-${index + 1}`),
      sellerCount: result.totalSellers || 0,
      pagesFetched: result.pagesFetched || 0,
      rateLimited: !!result.rateLimited,
      error: result.error || '',
      requestFilters: result.requestFilters || null,
    })),
  };
}

async function ensureSellerScrapeNotCoolingDown() {
  const cooldownUntil = await getSellerCooldownUntil();
  if (cooldownUntil > Date.now()) {
    throw new Error(`Seller scraping is paused after rate limiting. Try again in ${formatRemaining(cooldownUntil - Date.now())}.`);
  }
}

function describeSellerScope({ sellerCountryIds, sellerTypeId }) {
  const countries = [...new Set((sellerCountryIds || []).filter(Boolean))]
    .map((countryId) => getCountryNameById(countryId) || `country:${countryId}`);
  const parts = [];
  if (countries.length === 1) {
    parts.push(`country ${countries[0]}`);
  } else if (countries.length > 1) {
    parts.push(`countries ${countries.join(', ')}`);
  } else {
    parts.push('all seller countries');
  }

  const explicitSellerType = sellerTypeFilterEl?.value || '';
  const normalizedSellerType = normalizeSellerType(explicitSellerType);
  if (normalizedSellerType) parts.push(`${normalizedSellerType} sellers`);

  return parts.join(', ');
}

async function executeSellerScopeScrape({
  item,
  delayMs,
  maxSellerPages,
  previewLimit,
  requestContext,
  requestLanguageId,
  sellerCountryIds,
  sellerReputationId,
  maxShippingTimeId,
  sellerTypeId,
  partitionLabel,
  logPowerSellerFallback,
  onScopeStart,
}) {
  const requestIsFoil = typeof item?.isFoil === 'boolean' ? item.isFoil : null;
  const requestFilters = {
    languageId: requestLanguageId,
    isFoil: requestIsFoil,
    sellerCountryIds,
    sellerReputationId,
    maxShippingTimeId,
    sellerTypeId,
  };
  onScopeStart?.({
    partitionLabel,
    sellerCountryIds,
    sellerTypeId,
  });
  appendStatus(`Querying seller scope: ${describeSellerScope({ sellerCountryIds, sellerTypeId })}.`);
  let scopeResult = await scrapeSingleWantItemSellers({
    item,
    delay: delayMs,
    maxSellerPages,
    previewLimit,
    requestFilters,
    requestContext,
  });
  return scopeResult || null;
}

async function scrapeWantItemSellerData({ requestContext, item, delayMs, logPartitionRetry, onScopeStart }) {
  await ensureSellerScrapeNotCoolingDown();

  const requestLanguageId = getCardmarketLanguageId(getSingleItemLanguage(item));
  const requestIsFoil = typeof item?.isFoil === 'boolean' ? item.isFoil : null;
  const requestCountryIds = getCardmarketCountryIdsFromCountries(getSelectedSellerCountries());
  const sellerReputationId = getCardmarketSellerReputationId(sellerReputationFilterEl.value);
  const maxShippingTimeId = getCardmarketMaxShippingTimeId(sellerDeliveryTimeFilterEl.value);
  const sellerTypeId = getCardmarketSellerTypeId(sellerTypeFilterEl.value);
  const maxSellerPages = getSellerPagesPerCountry();
  const baseRequestFilters = {
    languageId: requestLanguageId,
    isFoil: requestIsFoil,
    sellerCountryIds: requestCountryIds,
    sellerReputationId,
    maxShippingTimeId,
    sellerTypeId,
  };
  const expansionFilter = await resolveItemExpansionRequestFilter({
    item,
    requestContext,
    requestFilters: baseRequestFilters,
  });
  if (expansionFilter.expansionIds) {
    baseRequestFilters.expansionIds = expansionFilter.expansionIds;
  }
  if (expansionFilter.unmatchedExpansionNames.length) {
    const itemLabel = textOf(item?.productName) || textOf(item?.idProduct) || 'wanted item';
    if (expansionFilter.rateLimited) {
      appendStatus(`Expansion lookup rate-limited for ${itemLabel}. Scraping without expansion filter.`, 'bad');
    } else if (expansionFilter.matchedExpansionNames.length) {
      appendStatus(`Expansion partial match for ${itemLabel}. Skipped: ${expansionFilter.unmatchedExpansionNames.join(', ')}.`, 'bad');
    } else {
      appendStatus(`Could not match expansions for ${itemLabel}: ${expansionFilter.unmatchedExpansionNames.join(', ')}. Scraping without expansion filter.`, 'bad');
    }
  }
  const explicitCountryScopes = buildSellerCountryScopes({
    requestCountryIds,
    availableSellerFilters: null,
  });
  let result;

  if (explicitCountryScopes.length) {
    const partitionLabels = explicitCountryScopes.map((scope) => getCountryNameById(scope.countryId) || scope.label);
    if (logPartitionRetry && explicitCountryScopes.length > 1) {
      appendStatus(`Scraping ${explicitCountryScopes.length} country partitions directly: ${partitionLabels.join(', ')}.`, 'good');
    }
    const partitionResults = [];
    for (const scope of explicitCountryScopes) {
      const scopeLabel = getCountryNameById(scope.countryId) || scope.label;
      const scopeResult = await executeSellerScopeScrape({
        item,
        delayMs,
        maxSellerPages,
        previewLimit: 12,
        requestContext,
        requestLanguageId,
        sellerCountryIds: [scope.countryId],
        sellerReputationId,
        maxShippingTimeId,
        sellerTypeId,
        partitionLabel: scopeLabel,
        logPowerSellerFallback: logPartitionRetry,
        onScopeStart,
      });
      if (scopeResult) {
        scopeResult.partitionLabel = scope.label;
        partitionResults.push(scopeResult);
      }
    }
    if (!partitionResults.length) {
      throw new Error('Seller scrape returned no result. Reload the Cardmarket tab and try again.');
    }
    result = mergeSellerScopeResults(null, partitionResults);
  } else {
    const baseResult = await scrapeSingleWantItemSellers({
      item,
      delay: delayMs,
      maxSellerPages,
      previewLimit: 12,
      requestFilters: baseRequestFilters,
      requestContext,
    });
    if (!baseResult) {
      throw new Error('Seller scrape returned no result. Reload the Cardmarket tab and try again.');
    }
    result = baseResult;

    const countryScopes = buildSellerCountryScopes({
      requestCountryIds,
      availableSellerFilters: baseResult.availableSellerFilters,
    });
    const shouldPartitionByCountry = shouldPartitionSellerScrape(baseResult, countryScopes);
    if (shouldPartitionByCountry) {
      const partitionLabels = countryScopes.map((scope) => getCountryNameById(scope.countryId) || scope.label);
      if (logPartitionRetry) {
        appendStatus(`Broad seller scope looks capped. Retrying in ${countryScopes.length} country partitions: ${partitionLabels.join(', ')}.`, 'good');
      }
      const partitionResults = [];
      for (const scope of countryScopes) {
        const scopeLabel = getCountryNameById(scope.countryId) || scope.label;
        const scopeResult = await executeSellerScopeScrape({
          item,
          delayMs,
          maxSellerPages,
          previewLimit: 12,
          requestContext,
          requestLanguageId,
          sellerCountryIds: [scope.countryId],
          sellerReputationId,
          maxShippingTimeId,
          sellerTypeId,
          partitionLabel: scopeLabel,
          logPowerSellerFallback: logPartitionRetry,
          onScopeStart,
        });
        if (scopeResult) {
          scopeResult.partitionLabel = scope.label;
          partitionResults.push(scopeResult);
        }
      }
      result = mergeSellerScopeResults(baseResult, partitionResults);
    }
  }

  if (result.rateLimited) {
    await setSellerCooldownUntil(Date.now() + SELLER_COOLDOWN_MS);
  }

  return {
    filteredResult: result,
  };
}

async function scrapeSingleWantItemSellers({ item, delay, previewLimit, requestFilters = {}, maxSellerPages = 4, maxFetchAttempts = 4, jitterRatio, requestContext }) {
  if (!item?.productUrl) {
    return {
      error: 'Missing Cardmarket product URL for seller scrape. Re-extract want items from the Cardmarket want list and try again.',
      item,
      sellers: [],
      totalSellers: 0,
      pagesFetched: 0,
      marketPath: '',
      attemptedUrls: [],
      debugSnippet: '',
      rateLimited: false,
    };
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const effectiveJitterRatio = Number.isFinite(Number(jitterRatio)) ? Number(jitterRatio) : 0.15;
  const applyLocalJitter = (baseMs) => {
    const safeBase = Math.max(0, parseInt(baseMs, 10) || 0);
    if (!safeBase || effectiveJitterRatio <= 0) return safeBase;
    const spread = safeBase * effectiveJitterRatio;
    const jittered = safeBase + ((Math.random() * 2) - 1) * spread;
    return Math.max(0, Math.round(jittered));
  };
  const SELLER_PAGE_SIZE_HINT = 50;
  const MAX_SELLER_PAGES = Math.max(1, Math.min(6, parseInt(maxSellerPages, 10) || 4));
  const MAX_SELLER_ROWS = Math.max(SELLER_PAGE_SIZE_HINT, MAX_SELLER_PAGES * SELLER_PAGE_SIZE_HINT);
  const runtimeContext = requestContext || parseCardmarketRequestContext(item?.productUrl) || {
    origin: 'https://cardmarket.com',
    lang: 'en',
    game: 'Magic',
  };
  const { origin, lang, game } = runtimeContext;
  const sellers = [];
  const seen = new Set();
  let page = 1;
  let pagesFetched = 0;
  let rateLimited = false;
  let totalPagesSeen = 0;
  const marketPath = `/${lang}/${game}/Stock/Offers/Singles`;
  const attemptedUrls = [];
  let debugSnippet = '';
  let selectedBase = null;
  let baseCandidates = buildInitialBaseCandidates();
  let availableSellerFilters = null;

  while (page <= MAX_SELLER_PAGES) {
    const candidatesForPage = selectedBase ? [selectedBase] : [...baseCandidates];
    let pageResolved = false;

    for (const candidate of candidatesForPage) {
      const request = candidate.currentRequest || { url: candidate.url, method: 'GET' };
      attemptedUrls.push(request.method === 'POST' ? `POST ${request.url}` : request.url);
      const fetchResult = await fetchWithRetry(request);
      if (fetchResult.error) {
        return { error: fetchResult.error, item, sellers, totalSellers: sellers.length, pagesFetched, marketPath, attemptedUrls, debugSnippet, rateLimited };
      }

      const { html, doc, ajaxMeta } = fetchResult;
      if (ajaxMeta) {
        candidate.ajaxDebug = {
          decodeMode: ajaxMeta.decodeMode,
          newPage: ajaxMeta.newPage,
          maxPaginatedResultsReached: ajaxMeta.maxPaginatedResultsReached,
          rowsPreview: (ajaxMeta.rowsHtml || '').slice(0, 300),
        };
      }
      if (!debugSnippet) debugSnippet = (doc.querySelector('main, #main, .main-content, body')?.innerHTML || html).slice(0, 2500);

      if (page === 1 && !selectedBase && isCardOverviewWithoutRows(doc)) {
        const discoveredCandidates = discoverProductDetailCandidates(doc);
        if (discoveredCandidates.length) baseCandidates = mergeCandidates(baseCandidates, discoveredCandidates);
      }

      const rowEls = [...doc.querySelectorAll('[id^="articleRow"].article-row, .article-row')];
      if (!rowEls.length) continue;

      if (!selectedBase) selectedBase = candidate;

      if (page === 1) {
        totalPagesSeen = detectTotalPages(doc) || 1;
        availableSellerFilters = inspectAvailableSellerFiltersInDocument(doc, request.url);
      }

      const nextLoadMorePage = ajaxMeta?.newPage || ((request.method || 'GET').toUpperCase() === 'POST' ? page + 1 : page);
      const nextRequest = (!ajaxMeta?.maxPaginatedResultsReached)
        ? (detectLoadMoreRequest(doc, request.url, nextLoadMorePage, candidate)
        || detectNextPageRequest(doc, request.url)
        || buildFallbackPagedRequest(request.url, page + 1))
        : null;

      let addedThisPage = 0;
      for (const el of rowEls) {
        if (sellers.length >= MAX_SELLER_ROWS) break;
        const seller = parseSellerRow(el);
        if (seller.buyBlocked) continue;
        if (!seller.articleId || seen.has(seller.articleId)) continue;
        seen.add(seller.articleId);
        sellers.push(seller);
        addedThisPage += 1;
      }

      pagesFetched += 1;
      pageResolved = true;
      if (sellers.length >= MAX_SELLER_ROWS) {
        page = 999;
      } else if (!addedThisPage) {
        page = 999;
      } else {
        page += 1;
        const pageLooksFull = rowEls.length >= SELLER_PAGE_SIZE_HINT;
        const hasNextPage = hasNextPageHint(doc);
        if (totalPagesSeen > 1) {
          if (page > totalPagesSeen) page = 999;
        } else if (!pageLooksFull && !hasNextPage && !nextRequest) {
          page = 999;
        }
        candidate.currentRequest = page < 999 ? nextRequest : null;
        if (!candidate.currentRequest && page < 999) page = 999;
      }
      if (delay && page < 999) await sleep(applyLocalJitter(delay));
      break;
    }

    if (!pageResolved || page >= 999) break;
  }

  return {
    item,
    sellers,
    sellerPreview: sellers.slice(0, previewLimit || 12),
    totalSellers: sellers.length,
    pagesFetched,
    requestFilters,
    availableSellerFilters,
    marketPath: selectedBase?.url || marketPath,
    attemptedUrls,
    debugSnippet,
    ajaxDebug: selectedBase?.ajaxDebug || null,
    rateLimited,
  };

  function buildInitialBaseCandidates() {
    const productUrl = buildSellerRequestUrl(item.productUrl, requestFilters, origin);
    return [{ url: productUrl, currentRequest: { url: productUrl, method: 'GET' }, label: 'productUrl' }];
  }

  function mergeCandidates(existing, discovered) {
    const merged = [...existing];
    const seenUrls = new Set(existing.map((entry) => entry.url));
    discovered.forEach((entry) => {
      if (seenUrls.has(entry.url)) return;
      seenUrls.add(entry.url);
      merged.push(entry);
    });
    return merged;
  }

  function detectTotalPages(doc) {
    let maxPage = 0;
    doc.querySelectorAll('a[href*="site="], a[href*="page="]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      const match = href.match(/[?&](?:site|page)=(\d+)/);
      if (match) maxPage = Math.max(maxPage, parseInt(match[1], 10));
    });
    const numberedLinks = [...doc.querySelectorAll('.pagination a, nav[aria-label*="pagination" i] a, .page-link')]
      .map((link) => parseInt(textOf(link.textContent), 10))
      .filter((value) => Number.isFinite(value));
    if (numberedLinks.length) {
      maxPage = Math.max(maxPage, ...numberedLinks);
    }
    return maxPage;
  }

  function hasNextPageHint(doc) {
    if (doc.querySelector('a[rel="next"], link[rel="next"]')) return true;
    const nextLink = [...doc.querySelectorAll('.pagination a, nav[aria-label*="pagination" i] a, .page-link')]
      .find((link) => /next|weiter|suivant|successivo|siguiente|›|»/i.test(textOf(link.textContent) || link.getAttribute('aria-label') || ''));
    return !!nextLink;
  }

  function detectNextPageRequest(doc, currentUrl) {
    const relNext = doc.querySelector('a[rel="next"], link[rel="next"]');
    const relHref = relNext?.getAttribute('href');
    if (relHref) return { url: new URL(relHref, currentUrl).toString(), method: 'GET' };

    const paginationLinks = [...doc.querySelectorAll('.pagination a[href], nav[aria-label*="pagination" i] a[href], .page-link[href]')];
    const nextLink = paginationLinks.find((link) => {
      const label = `${textOf(link.textContent)} ${textOf(link.getAttribute('aria-label'))}`;
      return /next|weiter|suivant|successivo|siguiente|›|»/i.test(label);
    });
    const nextHref = nextLink?.getAttribute('href');
    if (nextHref) return { url: new URL(nextHref, currentUrl).toString(), method: 'GET' };

    return null;
  }

  function buildFallbackPagedRequest(currentUrl, pageNumber) {
    if (!pageNumber || pageNumber < 2) return null;
    const url = new URL(currentUrl, origin);
    if (url.searchParams.has('site')) {
      url.searchParams.set('site', String(pageNumber));
      return { url: url.toString(), method: 'GET' };
    }
    if (url.searchParams.has('page')) {
      url.searchParams.set('page', String(pageNumber));
      return { url: url.toString(), method: 'GET' };
    }
    url.searchParams.set('site', String(pageNumber));
    return { url: url.toString(), method: 'GET' };
  }

  function detectLoadMoreRequest(doc, currentUrl, currentPage, candidate) {
    const button = doc.querySelector('#loadMoreButton');
    if (button) {
      const form = button.closest('form');
      candidate.loadMoreMeta = extractLoadMoreMeta(doc, form, button, currentUrl);
    }
    return buildLoadMoreRequest(candidate.loadMoreMeta, currentPage);
  }

  function buildLoadMoreRequest(meta, currentPage) {
    if (!meta?.actionUrl) return null;
    const formData = new FormData();
    if (meta.cmtkn) formData.set('__cmtkn', meta.cmtkn);
    formData.set('page', String(currentPage));
    formData.set('filterSettings', meta.filterSettings || '[]');
    if (meta.idMetacard) formData.set('idMetacard', meta.idMetacard);
    for (const field of (meta.extraFields || [])) {
      formData.append(field.name, field.value);
    }
    if (meta.buttonName) formData.append(meta.buttonName, meta.buttonValue || '');
    return { url: meta.actionUrl, method: meta.method || 'POST', body: formData };
  }

  function inspectAvailableSellerFiltersInDocument(doc, currentUrl) {
    const textValue = (value) => String(value || '').trim().replace(/\s+/g, ' ');
    const relevantFieldPattern = /^(sellerCountry|sellerType|sellerReputation|maxShippingTime|idExpansion|language|minCondition|extra\[.+\]|apply)$/i;
    const filterForm = doc.querySelector('form[action*="Product_Filter_FilterMetacard"], form[action*="FilterMetacard"]');
    const nodes = [...doc.querySelectorAll('input[name], select[name], textarea[name]')]
      .filter((node) => relevantFieldPattern.test(node.name || ''));
    const filters = {};

    for (const node of nodes) {
      const rawName = node.name || '';
      const fieldKey = rawName.replace(/\[.*\]$/, '');
      if (!filters[fieldKey]) filters[fieldKey] = [];

      if (node.tagName === 'SELECT') {
        const options = [...node.options].map((option) => ({
          rawName,
          value: option.value,
          label: textValue(option.textContent),
          selected: option.selected,
        })).filter((option) => option.value || option.label);
        filters[fieldKey].push(...options);
        continue;
      }

      filters[fieldKey].push({
        rawName,
        value: node.value || '',
        label: extractInputLabel(node),
        checked: node.checked === true,
        type: node.type || node.tagName.toLowerCase(),
      });
    }

    Object.keys(filters).forEach((key) => {
      const seenMarkers = new Set();
      filters[key] = filters[key].filter((entry) => {
        const marker = `${entry.rawName}|${entry.value}|${entry.label || ''}`;
        if (seenMarkers.has(marker)) return false;
        seenMarkers.add(marker);
        return true;
      });
    });

    mergeActiveValues(filters, collectActiveQuery(currentUrl), 'url');
    mergeActiveValues(filters, collectFormData(filterForm), 'form');
    return filters;

    function collectActiveQuery(urlValue) {
      const url = new URL(urlValue, origin);
      const values = {};
      url.searchParams.forEach((value, key) => {
        if (!relevantFieldPattern.test(key)) return;
        if (!values[key]) values[key] = [];
        values[key].push(value);
      });
      return values;
    }

    function collectFormData(form) {
      const values = {};
      if (!form) return values;
      for (const field of form.querySelectorAll('input[name], select[name], textarea[name]')) {
        const rawName = field.name || '';
        if (!relevantFieldPattern.test(rawName) || field.disabled) continue;
        if ((field.type === 'checkbox' || field.type === 'radio') && !field.checked) continue;
        if (!values[rawName]) values[rawName] = [];
        values[rawName].push(field.value || '');
      }
      return values;
    }

    function mergeActiveValues(targetFilters, activeValues, source) {
      Object.entries(activeValues).forEach(([rawName, values]) => {
        const fieldKey = rawName.replace(/\[.*\]$/, '');
        if (!targetFilters[fieldKey]) targetFilters[fieldKey] = [];
        const seenMarkers = new Set(targetFilters[fieldKey].map((entry) => `${entry.rawName}|${entry.value}`));
        values.forEach((value) => {
          const marker = `${rawName}|${value}`;
          if (seenMarkers.has(marker)) return;
          seenMarkers.add(marker);
          targetFilters[fieldKey].push({
            rawName,
            value,
            label: '',
            active: true,
            source,
          });
        });
      });
    }

    function extractInputLabel(node) {
      const directLabel = node.closest('label');
      if (directLabel) return textValue(directLabel.textContent);

      const id = node.getAttribute('id');
      if (id) {
        const forLabel = doc.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (forLabel) return textValue(forLabel.textContent);
      }

      const wrapper = node.closest('.form-check, .checkbox, .radio, .filter-row, li, .list-group-item, .form-group');
      if (wrapper) return textValue(wrapper.textContent);

      const siblingText = [node.nextSibling, node.previousSibling]
        .map((sibling) => textValue(sibling?.textContent || ''))
        .find(Boolean);
      return siblingText || '';
    }
  }

  function extractLoadMoreMeta(doc, form, button, currentUrl) {
    const getValue = (selector) => form?.querySelector(selector)?.value || doc.querySelector(selector)?.value || '';
    const getAttr = (selector, attr) => form?.querySelector(selector)?.getAttribute(attr) || doc.querySelector(selector)?.getAttribute(attr) || '';
    let idMetacard = getValue('input[name="idMetacard"]');
    if (!idMetacard) {
      idMetacard = getAttr('[data-id-metacard]', 'data-id-metacard')
        || getAttr('[data-metacard-id]', 'data-metacard-id')
        || '';
    }
    const action = form?.getAttribute('action') || `/${lang}/${game}/AjaxAction/Metacard_LoadMoreArticles`;
    const method = (form?.getAttribute('method') || 'POST').toUpperCase();
    const actionUrl = action.startsWith('http') ? action : new URL(action, currentUrl).toString();
    const extraFields = [];
    for (const field of (form?.querySelectorAll('input, textarea, select') || [])) {
      const name = field.getAttribute('name');
      if (!name || field.disabled) continue;
      if (name === '__cmtkn' || name === 'page' || name === 'filterSettings' || name === 'idMetacard' || name === 'idLanguage' || name === 'idLanguage[]') continue;
      if ((field.type === 'checkbox' || field.type === 'radio') && !field.checked) continue;
      extraFields.push({ name, value: field.value || '' });
    }
    return {
      actionUrl,
      method,
      cmtkn: getValue('input[name="__cmtkn"]'),
      filterSettings: getValue('input[name="filterSettings"]') || '[]',
      idMetacard,
      extraFields,
      buttonName: button?.getAttribute('name') || '',
      buttonValue: button?.value || '',
    };
  }

  async function fetchWithRetry(request) {
    if ((request.method || 'GET').toUpperCase() === 'GET' && sellerPageHtmlCache.has(request.url)) {
      const html = sellerPageHtmlCache.get(request.url) || '';
      sellerPageHtmlCache.delete(request.url);
      if (/cf-mitigated|cf-chl-bypass|Just a moment|Checking your browser|cf-browser-verification|Cloudflare Ray ID/i.test(html)) {
        rateLimited = true;
        return { error: 'Cardmarket returned a Cloudflare challenge page.' };
      }
      const ajaxMeta = parseAjaxResponseMeta(html);
      if (ajaxMeta) {
        const rowsHtml = ajaxMeta.rowsHtml || '<div></div>';
        return { html: rowsHtml, doc: new DOMParser().parseFromString(rowsHtml, 'text/html'), ajaxMeta };
      }
      return { html, doc: new DOMParser().parseFromString(html, 'text/html'), ajaxMeta: null };
    }

    let res = null;
    for (let attempt = 0; attempt < Math.max(1, parseInt(maxFetchAttempts, 10) || 1); attempt += 1) {
      try {
        const options = {
          method: request.method || 'GET',
          credentials: 'include',
          headers: {},
        };
        if ((request.method || 'GET').toUpperCase() !== 'GET') {
          options.body = request.body;
          options.headers['X-Requested-With'] = 'XMLHttpRequest';
        }
        res = await fetch(request.url, options);
      } catch {
        res = null;
      }

      if (!res) {
        await sleep(1500 * (attempt + 1));
        continue;
      }

      if (res.status === 429) {
        rateLimited = true;
        await sleep(5000 * (attempt + 1));
        continue;
      }

      break;
    }

    if (!res) return { error: 'Failed to fetch the Cardmarket market page.' };
    if (!res.ok) return { error: `HTTP ${res.status} while fetching seller rows.` };
    const html = await res.text();
    if (/cf-mitigated|cf-chl-bypass|Just a moment|Checking your browser|cf-browser-verification|Cloudflare Ray ID/i.test(html)) {
      rateLimited = true;
      return { error: 'Cardmarket returned a Cloudflare challenge page.' };
    }
    const ajaxMeta = parseAjaxResponseMeta(html);
    if (ajaxMeta) {
      const rowsHtml = ajaxMeta.rowsHtml || '<div></div>';
      return { html: rowsHtml, doc: new DOMParser().parseFromString(rowsHtml, 'text/html'), ajaxMeta };
    }
    return { html, doc: new DOMParser().parseFromString(html, 'text/html'), ajaxMeta: null };
  }

  function parseAjaxResponseMeta(html) {
    if (!/<ajaxResponse[\s>]/i.test(html)) return null;
    const xml = new DOMParser().parseFromString(html, 'text/xml');
    const rowsNode = xml.querySelector('rows');
    const newPageNode = xml.querySelector('newPage');
    const maxReachedNode = xml.querySelector('maxPaginatedResultsReached');
    const decodedRows = decodeAjaxRowsHtml(rowsNode?.textContent || '');
    const newPage = parseInt(textOf(newPageNode?.textContent), 10);
    const maxPaginatedResultsReached = textOf(maxReachedNode?.textContent) === '1';
    return {
      rowsHtml: decodedRows.html,
      decodeMode: decodedRows.mode,
      newPage: Number.isFinite(newPage) ? newPage : null,
      maxPaginatedResultsReached,
    };
  }

  function decodeAjaxRowsHtml(value) {
    if (!value) return { html: '', mode: 'empty' };
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    const entityDecoded = (textarea.value || value).trim();
    if (looksLikeHtml(entityDecoded)) {
      return { html: entityDecoded, mode: 'html-entity' };
    }

    if (looksLikeBase64(entityDecoded)) {
      const base64Decoded = decodeBase64Utf8(entityDecoded);
      if (base64Decoded) {
        textarea.innerHTML = base64Decoded;
        const htmlDecoded = (textarea.value || base64Decoded).trim();
        if (looksLikeHtml(htmlDecoded)) {
          return { html: htmlDecoded, mode: 'base64' };
        }
      }
    }

    return { html: entityDecoded, mode: 'raw' };
  }

  function looksLikeHtml(value) {
    return /^\s*</.test(value) || /articleRow\d+|class=("|')article-row\1/i.test(value);
  }

  function looksLikeBase64(value) {
    return value.length >= 32
      && value.length % 4 === 0
      && /^[A-Za-z0-9+/=\s]+$/.test(value)
      && /={0,2}$/.test(value);
  }

  function decodeBase64Utf8(value) {
    try {
      const binary = atob(value.replace(/\s+/g, ''));
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    } catch {
      return '';
    }
  }

  function isCardOverviewWithoutRows(doc) {
    return !!doc.querySelector('a[href*="/Products/Singles/"]') && !doc.querySelector('[id^="articleRow"].article-row, .article-row');
  }

  function discoverProductDetailCandidates(doc) {
    const urls = [];
    const seenUrls = new Set();
    [...doc.querySelectorAll('a[href*="/Products/Singles/"]')].forEach((link) => {
      if (urls.length >= 3) return;
      const href = link.getAttribute('href') || '';
      if (!href) return;
      const absolute = href.startsWith('http') ? href : `${location.origin}${href}`;
      if (seenUrls.has(absolute)) return;
      seenUrls.add(absolute);
      urls.push({ url: absolute, label: 'discoveredProductDetail' });
    });
    return urls;
  }

  function parseSellerRow(el) {
    const row = {};
    const idMatch = (el.id || '').match(/articleRow(\d+)/);
    row.articleId = idMatch ? idMatch[1] : '';
    const actionButton = el.querySelector('.btn.btn-grey, .btn[title], .btn[aria-label], button[title], button[aria-label]');
    const actionTitle = textOf(
      actionButton?.getAttribute('title')
      || actionButton?.getAttribute('aria-label')
      || ''
    );
    row.buyBlockedReason = actionTitle;
    row.buyBlocked = /you cannot buy the offered item|does not ship to your country|blacklist/i.test(actionTitle)
      || actionButton?.classList?.contains('btn-grey')
      || false;

    const sellerColumn = el.querySelector('.col-seller') || el;
    const sellerLink = sellerColumn.querySelector('a[href*="/Users/"]') || el.querySelector('a[href*="/Users/"]');
    row.sellerName = textOf(sellerLink?.textContent);
    row.sellerUrl = sellerLink?.getAttribute('href')
      ? (sellerLink.getAttribute('href').startsWith('http') ? sellerLink.getAttribute('href') : `https://www.cardmarket.com${sellerLink.getAttribute('href')}`)
      : '';
    row.location = extractSellerLocation(sellerColumn, row.sellerName);
    const conditionNode = el.querySelector('.article-condition .badge, .article-condition');
    row.condition = textOf(conditionNode?.textContent);
    const languageNode = [...el.querySelectorAll('span[aria-label], span[data-bs-original-title], span[data-original-title], span[title]')]
      .find((node) => /^(Deutsch|Englisch|Französisch|Italienisch|Spanisch|Portugiesisch|Japanisch|Koreanisch|Chinesisch|Russisch|S-Chinesisch|T-Chinesisch|English|German|French|Italian|Spanish|Portuguese|Japanese|Korean|Chinese|Russian)$/
        .test(node.getAttribute('aria-label') || node.getAttribute('data-bs-original-title') || node.getAttribute('data-original-title') || node.getAttribute('title') || ''));
    row.language = textOf(languageNode?.getAttribute('aria-label') || languageNode?.getAttribute('data-bs-original-title') || languageNode?.getAttribute('data-original-title') || languageNode?.getAttribute('title'));
    const priceNode = el.querySelector('.col-offer .price-container .color-primary, .col-offer .color-primary, .mobile-offer-container .color-primary');
    let price = textOf(priceNode?.textContent).replace(/\s*€\s*$/, '');
    if (!price) {
      el.querySelectorAll('.color-primary').forEach((node) => {
        if (price || node.children.length > 0) return;
        const match = textOf(node.textContent).match(/^(\d{1,3}(?:\.\d{3})*,\d{2})\s*€?$/);
        if (match) price = match[1];
      });
    }
    row.price = price;
    let displayCount = '';
    el.querySelectorAll('.item-count').forEach((node) => {
      if (displayCount) return;
      const countText = textOf(node.textContent);
      if (/^\d+$/.test(countText)) displayCount = countText;
    });
    const amountInput = el.querySelector('input.amount-input, input[name^="groupCountAmount"]');
    row.amount = amountInput?.getAttribute('max') || displayCount || '';
    row.reverse = /Reverse\s*Holo/i.test(el.textContent || '');
    return row;
  }

  function extractSellerLocation(sellerColumn, sellerName) {
    const explicitLocationNode = sellerColumn.querySelector('[aria-label^="Item location:" i], [data-bs-original-title^="Item location:" i], [data-original-title^="Item location:" i], [title^="Item location:" i]');
    if (explicitLocationNode) {
      const explicitLabel = textOf(
        explicitLocationNode.getAttribute('aria-label')
        || explicitLocationNode.getAttribute('data-bs-original-title')
        || explicitLocationNode.getAttribute('data-original-title')
        || explicitLocationNode.getAttribute('title')
        || ''
      );
      const explicitCountry = extractCountryFromLabel(explicitLabel);
      if (explicitCountry) return explicitCountry;
    }

    const candidateNodes = [
      ...sellerColumn.querySelectorAll('[class*="flag" i], [class*="country" i], img[alt], [aria-label], [data-bs-original-title], [data-original-title], [title]'),
    ];
    for (const node of candidateNodes) {
      const raw = node.getAttribute('aria-label')
        || node.getAttribute('data-bs-original-title')
        || node.getAttribute('data-original-title')
        || node.getAttribute('title')
        || node.getAttribute('alt')
        || '';
      const label = textOf(raw);
      if (!label) continue;
      if (sellerName && label === sellerName) continue;
      if (/seller|user|account|profile|outstanding|very good|good|professional|private|powerseller/i.test(label)) continue;
      const country = extractCountryFromLabel(label);
      if (country) return country;
    }
    return '';
  }

  function extractCountryFromLabel(label) {
    const itemLocationMatch = textOf(label).match(/item\s+location\s*:\s*(.+)$/i);
    if (itemLocationMatch) {
      const explicitMatch = normalizeCountryNameLocal(itemLocationMatch[1]);
      if (explicitMatch) return explicitMatch;
    }

    const directMatch = normalizeCountryNameLocal(label);
    if (directMatch) return directMatch;

    const stripped = textOf(label)
      .replace(/<[^>]+>/g, ' ')
      .replace(/[():|]/g, ' ')
      .replace(/ships?\s+from/gi, ' ')
      .replace(/item\s+location/gi, ' ')
      .replace(/country/gi, ' ');
    const words = stripped.split(/\s+/).filter(Boolean);
    for (let size = Math.min(3, words.length); size >= 1; size -= 1) {
      for (let index = 0; index <= words.length - size; index += 1) {
        const chunk = words.slice(index, index + size).join(' ');
        const country = normalizeCountryNameLocal(chunk);
        if (country) return country;
      }
    }
    return '';
  }

  function normalizeCountryNameLocal(value) {
    const normalized = textOf(value).toLowerCase();
    if (!normalized) return '';
    const aliases = {
      at: 'Austria',
      austria: 'Austria',
      be: 'Belgium',
      belgium: 'Belgium',
      bg: 'Bulgaria',
      bulgaria: 'Bulgaria',
      ch: 'Switzerland',
      switzerland: 'Switzerland',
      schweiz: 'Switzerland',
      cy: 'Cyprus',
      cyprus: 'Cyprus',
      cz: 'Czechia',
      czechia: 'Czechia',
      'czech republic': 'Czechia',
      de: 'Germany',
      germany: 'Germany',
      deutschland: 'Germany',
      dk: 'Denmark',
      denmark: 'Denmark',
      ee: 'Estonia',
      estonia: 'Estonia',
      es: 'Spain',
      spain: 'Spain',
      fi: 'Finland',
      finland: 'Finland',
      fr: 'France',
      france: 'France',
      gb: 'United Kingdom',
      uk: 'United Kingdom',
      'united kingdom': 'United Kingdom',
      'great britain': 'United Kingdom',
      hu: 'Hungary',
      hungary: 'Hungary',
      hr: 'Croatia',
      croatia: 'Croatia',
      ie: 'Ireland',
      ireland: 'Ireland',
      it: 'Italy',
      italy: 'Italy',
      lt: 'Lithuania',
      lithuania: 'Lithuania',
      lu: 'Luxembourg',
      luxembourg: 'Luxembourg',
      lv: 'Latvia',
      latvia: 'Latvia',
      mt: 'Malta',
      malta: 'Malta',
      nl: 'Netherlands',
      netherlands: 'Netherlands',
      nederland: 'Netherlands',
      no: 'Norway',
      norway: 'Norway',
      pl: 'Poland',
      poland: 'Poland',
      pt: 'Portugal',
      portugal: 'Portugal',
      ro: 'Romania',
      romania: 'Romania',
      se: 'Sweden',
      sweden: 'Sweden',
      si: 'Slovenia',
      slovenia: 'Slovenia',
      sk: 'Slovakia',
      slovakia: 'Slovakia',
    };
    return aliases[normalized] || '';
  }

  function textOf(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }
}