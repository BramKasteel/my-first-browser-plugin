const extractItemsButton = document.getElementById('extractItems');
const scrapeAllItemsButton = document.getElementById('scrapeAllItems');
const fillCartReoptimizeButton = document.getElementById('fillCartReoptimize');
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
const sellerCountryLargeListWarningEl = document.getElementById('sellerCountryLargeListWarning');
const sellerCountryLimitHintEl = document.getElementById('sellerCountryLimitHint');
const sellerSettingsBodyEl = document.getElementById('sellerSettingsBody');
const sellerScrapeProgressEl = document.getElementById('sellerScrapeProgress');
const sellerProgressLabelEl = document.getElementById('sellerProgressLabel');
const sellerProgressCurrentEl = document.getElementById('sellerProgressCurrent');
const sellerProgressPercentEl = document.getElementById('sellerProgressPercent');
const sellerProgressBarEl = document.getElementById('sellerProgressBar');
const wantListWarningEl = document.getElementById('wantListWarning');
const wantListSelectEl = document.getElementById('wantListSelect');
const wantListFieldEl = document.getElementById('wantListField');
const sourceTabFieldEl = document.getElementById('sourceTabField');
const sourceTabSelectEl = document.getElementById('sourceTabSelect');
const refreshSourceTabsButton = document.getElementById('refreshSourceTabs');
const sourceTabStatusEl = document.getElementById('sourceTabStatus');
const confirmWantListButton = document.getElementById('confirmWantList');
const summaryEl = document.getElementById('summary');
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
const fillStepBadgeEl = document.getElementById('fillStepBadge');
const postFillStepBadgeEl = document.getElementById('postFillStepBadge');
const optimizerSettingsBodyEl = sellerSettingsBodyEl;
const buyerCountryFieldEl = document.getElementById('buyerCountryField');
const mainCartSummaryEl = document.getElementById('mainCartSummary');
const mainCartSummaryGrandTotalEl = document.getElementById('mainCartSummaryGrandTotal');
const mainCartSummaryTotalItemsEl = document.getElementById('mainCartSummaryTotalItems');
const optimizerWaitingEl = document.getElementById('optimizerWaiting');
const optimizerWaitingTextEl = document.getElementById('optimizerWaitingText');
const optimizerWaitingDetailEl = document.getElementById('optimizerWaitingDetail');
const missingSellerDecisionEl = document.getElementById('missingSellerDecision');
const missingSellerDecisionTitleEl = document.getElementById('missingSellerDecisionTitle');
const missingSellerDecisionDetailEl = document.getElementById('missingSellerDecisionDetail');
const missingSellerDecisionListEl = document.getElementById('missingSellerDecisionList');
const missingSellerAbortButton = document.getElementById('missingSellerAbortButton');
const missingSellerContinueButton = document.getElementById('missingSellerContinueButton');
const refillWarningEl = document.getElementById('refillWarning');
const optimizationResultPillEl = document.getElementById('optimizationResultPill');
const fillCartPostingPillEl = document.getElementById('fillCartPostingPill');
const fillCartSuccessCardEl = document.getElementById('fillCartSuccessCard');
const fillCartDebugButtonEl = document.getElementById('fillCartDebugButton');
const fillCartRefillButtonEl = document.getElementById('fillCartRefillButton');
const postFillSummaryEl = document.getElementById('postFillSummary');
const postFillSellerListEl = document.getElementById('postFillSellerList');
const postFillEmptyStateEl = document.getElementById('postFillEmptyState');
const postFillMemoryNoteEl = document.getElementById('postFillMemoryNote');
const postFillTotalsSummaryEl = document.getElementById('postFillTotalsSummary');
const postFillCartTotalEl = document.getElementById('postFillCartTotal');
const postFillComputedTotalEl = document.getElementById('postFillComputedTotal');
const postFillTotalDifferenceEl = document.getElementById('postFillTotalDifference');
const postFillTotalsHintEl = document.getElementById('postFillTotalsHint');
const heroFeedbackButton = document.getElementById('heroFeedbackButton');
const heroFeedbackRevealEl = document.getElementById('heroFeedbackReveal');
const heroFeedbackRevealRowEl = document.getElementById('heroFeedbackRevealRow');
const heroFeedbackCopyButton = document.getElementById('heroFeedbackCopyButton');
const heroDonateButton = document.getElementById('heroDonateButton');
const heroBankDonateButton = document.getElementById('heroBankDonateButton');
const heroBankDonateRevealRowEl = document.getElementById('heroBankDonateRevealRow');

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
let pendingMissingSellerDecision = null;
let lastOptimizerWarmupAt = 0;
let wantListRetryTimer = null;
let sellerRequestDelayMs = 250;
let currentPayloadLineageKey = '';
let rememberedDisabledSellerIds = [];
let postFillSellerChoices = [];
let boundSourceTabId = Number.isInteger(forcedTabId) ? forcedTabId : null;
let availableSourceTabs = [];

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
const WORKFLOW_STEPS = ['source', 'sellers', 'fill', 'post-fill'];
const WORKFLOW_META = {
  source: {
    title: 'Select Cards',
    hint: 'Load selected want list from active Cardmarket tab.',
  },
  sellers: {
    title: 'Optimizer Settings',
    hint: 'Choose seller filters and buyer country, then run scrape and optimize together.',
  },
  fill: {
    title: 'Fill Cart',
    hint: 'Push chosen Cardmarket offers into your cart after reviewing optimized result.',
  },
  'post-fill': {
    title: 'Debug',
    hint: 'Debug your shopping cart, then re-optimize if needed.',
  },
};
const SELLER_COUNTRY_OPTIONS = [
  'Austria',
  'Belgium',
  'Bulgaria',
  // 'Canada', // No shipping routes in optimizer dataset.
  'Croatia',
  'Cyprus',
  'Czechia',
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
  if (typeof renderSellerCountryFilterList === 'function') {
    renderSellerCountryFilterList(getSelectedSellerCountries());
  }
  syncExtractButton(isBusy);
  syncSellerScrapeButton(isBusy);
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

function hasPendingMissingSellerDecision() {
  return !!pendingMissingSellerDecision;
}

function renderMissingSellerDecision() {
  if (!missingSellerDecisionEl || !missingSellerDecisionListEl) return;

  const decision = pendingMissingSellerDecision;
  missingSellerDecisionEl.hidden = !decision;
  missingSellerDecisionListEl.replaceChildren();

  if (!decision) return;

  if (missingSellerDecisionTitleEl) {
    missingSellerDecisionTitleEl.textContent = 'Missing seller data';
  }
  if (missingSellerDecisionDetailEl) {
    missingSellerDecisionDetailEl.textContent = `${decision.items.length} wanted card${decision.items.length === 1 ? '' : 's'} did not have any sellers under current filters.`;
  }

  const intro = document.createElement('p');
  intro.className = 'panel-note';
  intro.textContent = 'Abort to return to card selection, or continue and optimize without these cards.';
  missingSellerDecisionListEl.appendChild(intro);

  const list = document.createElement('ul');
  decision.items.forEach((entry) => {
    const item = document.createElement('li');
    item.textContent = entry.name;
    list.appendChild(item);
  });
  missingSellerDecisionListEl.appendChild(list);
}

function resolvePendingMissingSellerDecision(choice) {
  if (!pendingMissingSellerDecision) return;

  const { resolve } = pendingMissingSellerDecision;
  pendingMissingSellerDecision = null;
  renderWorkflow();
  resolve(choice);
}

function cancelPendingMissingSellerDecision() {
  resolvePendingMissingSellerDecision('abort');
}

function promptForMissingSellerDecision(missingItems) {
  cancelPendingMissingSellerDecision();

  return new Promise((resolve) => {
    pendingMissingSellerDecision = {
      items: missingItems,
      resolve,
    };
    setActiveWorkflowStep('sellers', { force: true });
    setActiveResultTab('activity');
    renderWorkflow();
    missingSellerDecisionEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
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
  syncRefillWarning();
  if (typeof renderPostFillScreen === 'function') {
    renderPostFillScreen();
  }
}

function markCartAsFilled(fillResult, cartSellers) {
  latestFillResult = fillResult || {};
  setPostFillSellerChoicesFromCart(cartSellers || []);
  syncRefillWarning();
}

function hasFilledCartSession() {
  return !!latestFillResult;
}

function syncRefillWarning() {
  if (typeof renderFillCartGuardState === 'function') {
    renderFillCartGuardState();
    return;
  }
  if (!refillWarningEl) return;
  refillWarningEl.hidden = true;
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

function normalizeBlockedSellerIds(sellerIds) {
  return [...new Set((sellerIds || []).map((sellerId) => textOf(sellerId)).filter(Boolean))];
}

async function buildOptimizationRequestPayload(payload) {
  if (!payload) return null;

  const existingBlockedSellerIds = normalizeBlockedSellerIds(payload?.preferences?.blocked_seller_ids);
  const blockedSellerIds = existingBlockedSellerIds.length
    ? existingBlockedSellerIds
    : await loadRememberedDisabledSellerIds(buildPayloadLineageKey(payload));

  return {
    ...payload,
    preferences: {
      ...(payload.preferences || {}),
      blocked_seller_ids: normalizeBlockedSellerIds(blockedSellerIds),
    },
  };
}

function buildReoptimizePayload(disabledSellerIds) {
  if (!latestExtractPayload) return null;

  return {
    ...latestExtractPayload,
    previous_allocations: buildPreviousAllocationsPayload(latestOptimizationResult),
    preferences: {
      ...(latestExtractPayload.preferences || {}),
      blocked_seller_ids: normalizeBlockedSellerIds(disabledSellerIds),
    },
  };
}

function getLoadedWantItemCount() {
  return Array.isArray(latestExtractedItems) ? latestExtractedItems.length : 0;
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

  return {
    selectionMessage: 'Select 1 or 2 preferred seller countries for scrape.',
    warningMessage: policy.distinctItemCount > 30
    ? `Warning: Want list has ${policy.distinctItemCount} distinct items. For lists larger than 30 distinct items we cannot guarantee optimal results. Please donate for bigger servers!`
    : '',
  };
}

function renderSellerCountryLimitHint(policy = getWantListSelectionPolicy()) {
  if (!sellerCountryLimitHintEl && !sellerCountryLargeListWarningEl) return;
  const messages = getSellerCountryLimitHint(policy);
  if (!messages) {
    if (sellerCountryLimitHintEl) {
      sellerCountryLimitHintEl.textContent = '';
      sellerCountryLimitHintEl.hidden = true;
      sellerCountryLimitHintEl.classList.remove('good', 'bad');
    }
    if (sellerCountryLargeListWarningEl) {
      sellerCountryLargeListWarningEl.textContent = '';
      sellerCountryLargeListWarningEl.hidden = true;
      sellerCountryLargeListWarningEl.classList.remove('bad');
    }
    return;
  }

  const { selectionMessage, warningMessage } = messages;
  const selectedCount = selectedSellerCountries.length;
  const hasValidSelection = selectedCount >= 1 && selectedCount <= policy.maxSellerCountries;

  if (sellerCountryLargeListWarningEl) {
    sellerCountryLargeListWarningEl.textContent = warningMessage;
    sellerCountryLargeListWarningEl.hidden = !warningMessage;
    sellerCountryLargeListWarningEl.classList.toggle('bad', !!warningMessage);
  }

  if (sellerCountryLimitHintEl) {
    sellerCountryLimitHintEl.textContent = selectionMessage;
    sellerCountryLimitHintEl.hidden = !selectionMessage;
    sellerCountryLimitHintEl.classList.toggle('good', hasValidSelection);
    sellerCountryLimitHintEl.classList.toggle('bad', !hasValidSelection);
  }
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

  const results = Array.isArray(latestFrontendPayload.results) ? latestFrontendPayload.results : [];
  const uniqueSellerIds = new Set();
  const itemNames = [];

  results.forEach((result) => {
    const itemName = textOf(result?.item?.productName || result?.item?.idProduct);
    if (itemName) itemNames.push(itemName);

    (result?.sellers || []).forEach((seller) => {
      const sellerId = textOf(seller?.sellerId || seller?.seller?.id || seller?.sellerName);
      if (sellerId) uniqueSellerIds.add(sellerId);
    });
  });

  const totals = (latestFrontendPayload.totals && typeof latestFrontendPayload.totals === 'object')
    ? latestFrontendPayload.totals
    : {};
  const requestSettings = (latestFrontendPayload.requestSettings && typeof latestFrontendPayload.requestSettings === 'object')
    ? latestFrontendPayload.requestSettings
    : {};
  const totalSellers = Number.isFinite(totals.totalSellerRows)
    ? totals.totalSellerRows
    : uniqueSellerIds.size;

  return {
    itemCount: results.length,
    sellerCount: uniqueSellerIds.size,
    totalSellers,
    itemNames,
    totals,
    requestSettings,
  };
}

function setActiveResultTab(tabName, { isRunActive = false } = {}) {
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
  if (stepName === 'fill') return state.hasOptimalCart;
  if (stepName === 'post-fill') return state.hasFilledCart;
  return false;
}

function getSuggestedWorkflowStep(state = getWorkflowState()) {
  if (state.hasFilledCart) return 'post-fill';
  if (state.hasOptimalCart) return 'fill';
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
      return state.hasOptimizationResult
        ? 'Optimization already ran. Adjust filters or buyer country here to run a new result.'
        : 'Seller batch ready. Run optimize order when settings look right.';
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
  const isOptimizerRequest = activeStepActivity?.kind === 'optimizer-request';
  const isMissingSellerDecision = hasPendingMissingSellerDecision();
  const shouldHideSellerSettings = isMissingSellerDecision
    || isSellerScrape
    || isOptimizerRequest
    || (isUiBusy && isRunActive && activeWorkflowStep === 'sellers');

  sellerSettingsBodyEl.hidden = shouldHideSellerSettings;
  sellerScrapeProgressEl.hidden = !isSellerScrape;
  renderMissingSellerDecision();

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

  optimizerWaitingEl.hidden = isMissingSellerDecision || !isOptimizerRequest;

  if (isOptimizerRequest) {
    optimizerWaitingTextEl.textContent = activeStepActivity.label || 'Request sent. Waiting for reply.';
    optimizerWaitingDetailEl.textContent = activeStepActivity.detail || 'Optimizer can take a moment while it balances price against shipping.';
  }
}

function setResultPanelExpanded(expanded) {
  isResultPanelExpanded = !!expanded;
  resultPanelEl?.setAttribute('data-panel-expanded', isResultPanelExpanded ? 'true' : 'false');
  resultPanelToggleButton?.setAttribute('aria-expanded', isResultPanelExpanded ? 'true' : 'false');
  resultPanelToggleButton?.setAttribute('aria-label', isResultPanelExpanded ? 'Hide results and activity' : 'Show results and activity');
}

function focusLiveActivityPanel() {
  const scrollTarget = !missingSellerDecisionEl?.hidden
    ? missingSellerDecisionEl
    : !sellerScrapeProgressEl?.hidden
    ? sellerScrapeProgressEl
    : !optimizerWaitingEl?.hidden
      ? optimizerWaitingEl
      : sellerSettingsBodyEl?.closest('.step-panel');
  scrollTarget?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function revealOptimizationActivityUi() {
  setActiveWorkflowStep('sellers', { force: true });
  focusLiveActivityPanel();
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

    button.dataset.state = stepState;
    button.classList.toggle('active', isActive);
    button.disabled = isUiBusy || hasPendingMissingSellerDecision() || !isAccessible;
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
    setStepBadge(sellerStepBadgeEl, state.hasOptimizationResult ? 'Optimized' : 'Seller data ready', 'good');
  } else if (state.hasExtractedWants) {
    setStepBadge(sellerStepBadgeEl, 'Ready');
  } else {
    setStepBadge(sellerStepBadgeEl, 'Locked');
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
  if (/^mint$|^mt$/.test(normalized)) return 'MT';
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

function getShippingRouteSupportedCountryIds() {
  return getCardmarketCountryIdsFromCountries(SELLER_COUNTRY_OPTIONS);
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

function getWantItemDisplayName(item, fallbackIndex = 0) {
  return textOf(item?.productName)
    || textOf(item?.name)
    || textOf(item?.item_id)
    || `Item ${fallbackIndex + 1}`;
}

function collectMissingSellerItems(batchResult) {
  if (!batchResult || batchResult.kind !== 'seller-scrape-batch') return [];

  return (batchResult.results || [])
    .map((result, index) => {
      const sellerRows = Array.isArray(result?.sellers) ? result.sellers : [];
      if (sellerRows.length) return null;

      return {
        index,
        item: result?.item || null,
        name: getWantItemDisplayName(result?.item, index),
      };
    })
    .filter(Boolean);
}

function buildFilteredBatchResultWithoutMissingSellerItems(batchResult) {
  if (!batchResult || batchResult.kind !== 'seller-scrape-batch') return batchResult;

  const filteredResults = (batchResult.results || []).filter((result) => {
    const sellerRows = Array.isArray(result?.sellers) ? result.sellers : [];
    return sellerRows.length > 0;
  });

  const totalSellerRows = filteredResults.reduce((sum, result) => {
    const sellerRows = Array.isArray(result?.sellers) ? result.sellers.length : 0;
    return sum + sellerRows;
  }, 0);

  const previousTotals = batchResult.totals || {};
  const previousResultCount = Array.isArray(batchResult.results) ? batchResult.results.length : 0;
  const missingCount = Math.max(0, previousResultCount - filteredResults.length);

  return {
    ...batchResult,
    totals: {
      ...previousTotals,
      successCount: Math.max(0, parseIntegerOrFallback(previousTotals.successCount, filteredResults.length) - missingCount),
      skippedCount: parseIntegerOrFallback(previousTotals.skippedCount, 0) + missingCount,
      totalSellerRows,
    },
    results: filteredResults,
  };
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

