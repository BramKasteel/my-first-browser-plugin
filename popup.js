const extractItemsButton = document.getElementById('extractItems');
const scrapeAllItemsButton = document.getElementById('scrapeAllItems');
const optimizeOrderButton = document.getElementById('optimizeOrder');
const fillCartButton = document.getElementById('fillCart');
const optimizerApiUrlInput = document.getElementById('optimizerApiUrl');
const buyerCountrySelectEl = document.getElementById('buyerCountry');
const sellerReputationFilterEl = document.getElementById('sellerReputationFilter');
const sellerDeliveryTimeFilterEl = document.getElementById('sellerDeliveryTimeFilter');
const sellerTypeFilterEl = document.getElementById('sellerTypeFilter');
const sellerLocationFilterListEl = document.getElementById('sellerLocationFilterList');
const selectedSellerCountriesEl = document.getElementById('selectedSellerCountries');
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
const optimizerSettingsBodyEl = document.getElementById('optimizerSettingsBody');
const optimizerInputContextEl = document.getElementById('optimizerInputContext');
const optimizerInputMetaEl = document.getElementById('optimizerInputMeta');
const buyerCountryFieldEl = document.getElementById('buyerCountryField');
const mainCartSummaryEl = document.getElementById('mainCartSummary');
const mainCartSummaryGrandTotalEl = document.getElementById('mainCartSummaryGrandTotal');
const mainCartSummaryTotalItemsEl = document.getElementById('mainCartSummaryTotalItems');
const optimizerWaitingEl = document.getElementById('optimizerWaiting');
const optimizerWaitingTextEl = document.getElementById('optimizerWaitingText');
const optimizerWaitingDetailEl = document.getElementById('optimizerWaitingDetail');

const urlParams = new URLSearchParams(window.location.search);
const isDetached = urlParams.get('detached') === '1';
const autoStartMode = urlParams.get('autoStart') || '';
const forcedTabId = urlParams.get('tabId') ? parseInt(urlParams.get('tabId'), 10) : null;
const isE2e = urlParams.get('e2e') === '1';

if (isDetached) {
  document.body.classList.add('detached');
}

let latestExtractPayload = null;
let latestFrontendPayload = null;
let latestOptimizationResult = null;
let latestExtractedItems = [];
let isRunActive = false;
let isUiBusy = false;
let selectedSellerCountries = [];
let availableWantLists = [];
let selectedWantListId = '';
let restoredWantListId = '';
let activeWorkflowStep = 'source';
let workflowHistory = [];
let activeStepActivity = null;
let lastOptimizerWarmupAt = 0;
let wantListRetryTimer = null;
let sellerRequestDelayMs = 250;

const SELLER_SETTINGS_KEY = 'sellerScrapeSettings';
const DETACHED_BATCH_STATE_KEY = 'detachedBatchState';
const SELLER_COOLDOWN_MS = 10 * 60 * 1000;
const DEFAULT_SELLER_DELAY_MS = 250;
const MIN_SELLER_DELAY_MS = 250;
const OPTIMIZER_WARMUP_THROTTLE_MS = 90 * 1000;
const WANT_LIST_RETRY_DELAY_MS = 2000;
const DEFAULT_SELLER_COUNTRIES = [];
const MAX_WANT_LIST_ITEMS = 70;
const SINGLE_COUNTRY_WANT_LIST_THRESHOLD = 30;
const MAX_SELLER_COUNTRIES = 2;
const DEFAULT_OPTIMIZER_API_URL = textOf(window.APP_CONFIG?.optimizerApiUrl);
const WORKFLOW_STEPS = ['source', 'sellers', 'optimize', 'fill'];
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
};
const SELLER_COUNTRY_OPTIONS = [
  'Austria',
  'Belgium',
  'Bulgaria',
  'Canada',
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

function hasLoadedWantItems() {
  return latestExtractedItems.length > 0;
}

function hasSelectedWantList() {
  return !!textOf(selectedWantListId);
}

function syncExtractButton(isBusy = false) {
  const hasWantLists = availableWantLists.length > 0;
  const hasSelection = hasSelectedWantList();
  const hasLoadedItems = hasLoadedWantItems();
  const wantListPolicy = getWantListSelectionPolicy();
  if (extractItemsButton) {
    extractItemsButton.disabled = isBusy || !hasWantLists || !hasSelection;
    extractItemsButton.classList.toggle('is-busy', isBusy);
    extractItemsButton.classList.toggle('secondary', !hasWantLists || !hasSelection);
  }
  if (wantListSelectEl) {
    wantListSelectEl.disabled = isBusy || !hasWantLists;
  }
  if (confirmWantListButton) {
    confirmWantListButton.hidden = !hasLoadedItems;
    confirmWantListButton.disabled = isBusy || !hasLoadedItems || wantListPolicy.isBlocked;
    confirmWantListButton.classList.toggle('is-busy', false);
    confirmWantListButton.classList.toggle('secondary', !hasLoadedItems || wantListPolicy.isBlocked);
  }
}

function syncSellerScrapeButton(isBusy = false) {
  const hasItems = hasLoadedWantItems();
  const wantListPolicy = getWantListSelectionPolicy();
  scrapeAllItemsButton.disabled = isBusy || !hasItems || wantListPolicy.isBlocked;
  scrapeAllItemsButton.classList.toggle('is-busy', isBusy);
  scrapeAllItemsButton.classList.toggle('secondary', !hasItems || wantListPolicy.isBlocked);
  renderSellerFilterState();
}

function syncOptimizeButton(isBusy = false) {
  const hasPayload = !!latestExtractPayload;
  const hasBuyerCountry = !!getSelectedBuyerCountry();
  optimizeOrderButton.disabled = isBusy || !hasPayload || !hasBuyerCountry;
  optimizeOrderButton.classList.toggle('is-busy', isBusy);
  optimizeOrderButton.classList.toggle('secondary', !hasPayload || !hasBuyerCountry);
  renderBuyerCountryState();
}

function hasOptimizedCart() {
  return ['optimal', 'feasible'].includes(latestOptimizationResult?.status)
    && Array.isArray(latestOptimizationResult?.cart?.sellers)
    && latestOptimizationResult.cart.sellers.length > 0;
}

function syncFillCartButton(isBusy = false) {
  const hasCart = hasOptimizedCart();
  fillCartButton.disabled = isBusy || !hasCart;
  fillCartButton.classList.toggle('is-busy', isBusy);
  fillCartButton.classList.toggle('secondary', !hasCart);
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
  sellerLocationFilterListEl.querySelectorAll('input').forEach((input) => {
    input.disabled = isBusy;
  });
  selectedSellerCountriesEl.querySelectorAll('button').forEach((button) => {
    button.disabled = isBusy;
  });
  syncExtractButton(isBusy);
  syncSellerScrapeButton(isBusy);
  syncOptimizeButton(isBusy);
  syncFillCartButton(isBusy);
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

function getPopupSnapshot() {
  return {
    isDetached,
    isBusy: isUiBusy,
    runState: {
      active: isRunActive,
      message: textOf(runStatusTextEl.textContent),
      tone: getRunStatusTone(),
    },
    workflow: {
      activeStep: activeWorkflowStep,
      history: [...workflowHistory],
    },
    wantLists: {
      selectedWantListId,
      available: availableWantLists.map((entry) => ({ ...entry })),
    },
    wantListConstraints: getWantListSelectionPolicy(),
    extractedItems: {
      count: latestExtractedItems.length,
      distinctCount: getLoadedWantDistinctItemCount(),
      sample: latestExtractedItems.slice(0, 3),
    },
    sellerFilters: getCurrentSellerFilterState(),
    controls: {
      confirmWantListDisabled: !!confirmWantListButton?.disabled,
      scrapeAllItemsDisabled: !!scrapeAllItemsButton?.disabled,
    },
    frontendPayload: latestFrontendPayload,
    optimizerPayload: latestExtractPayload,
    optimizeContext: getOptimizeContextSnapshot(),
    optimizationResult: latestOptimizationResult,
    stepActivity: activeStepActivity ? { ...activeStepActivity } : null,
    summary: readSummaryRows(),
    statusLog: readStatusLogEntries(),
  };
}

function getCurrentSellerFilterState() {
  return {
    buyerCountry: getSelectedBuyerCountry(),
    sellerReputation: normalizeSellerReputation(sellerReputationFilterEl?.value),
    maxShippingTime: normalizeMaxShippingTime(sellerDeliveryTimeFilterEl?.value),
    sellerType: normalizeSellerType(sellerTypeFilterEl?.value),
    sellerCountries: getSelectedSellerCountries(),
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
    maxSellerCountries: normalizedDistinctItemCount > SINGLE_COUNTRY_WANT_LIST_THRESHOLD ? 1 : MAX_SELLER_COUNTRIES,
    warningMessage: isBlocked
      ? `Want list has ${normalizedDistinctItemCount} distinct items. Seller scrape locked above ${MAX_WANT_LIST_ITEMS}. Choose smaller want list.`
      : '',
  };
}

function getWantListSelectionHint(policy = getWantListSelectionPolicy()) {
  if (!policy.distinctItemCount) return '';
  if (policy.isBlocked) return policy.warningMessage;
  if (policy.maxSellerCountries === 1) {
    return `Want list has ${policy.distinctItemCount} distinct items. Only 1 seller country allowed above ${SINGLE_COUNTRY_WANT_LIST_THRESHOLD}.`;
  }
  return `Want list has ${policy.distinctItemCount} distinct items. Up to ${MAX_SELLER_COUNTRIES} seller countries allowed.`;
}

function getSellerCountryLimitHint(policy = getWantListSelectionPolicy()) {
  if (!policy.distinctItemCount) return '';
  if (policy.isBlocked) {
    return `Want list has ${policy.distinctItemCount} distinct items. Seller scrape disabled above ${MAX_WANT_LIST_ITEMS}.`;
  }
  if (policy.maxSellerCountries === 1) {
    return `Want list has more than ${SINGLE_COUNTRY_WANT_LIST_THRESHOLD} distinct items. Select exactly 1 seller country for scrape.`;
  }
  return `Want list has ${policy.distinctItemCount} distinct items. You can choose up to ${policy.maxSellerCountries} seller countries for scrape.`;
}

function renderSellerCountryLimitHint(policy = getWantListSelectionPolicy()) {
  if (!sellerCountryLimitHintEl) return;
  const message = getSellerCountryLimitHint(policy);
  const isSingleCountryPolicy = !policy.isBlocked && policy.maxSellerCountries === 1;
  const hasValidSelection = !policy.isBlocked && selectedSellerCountries.length <= policy.maxSellerCountries;
  const hasExactRequiredSelection = selectedSellerCountries.length === 1;
  sellerCountryLimitHintEl.textContent = message;
  sellerCountryLimitHintEl.hidden = !message;
  sellerCountryLimitHintEl.classList.toggle(
    'good',
    !!message && (isSingleCountryPolicy ? hasExactRequiredSelection : hasValidSelection)
  );
  sellerCountryLimitHintEl.classList.toggle('bad', !!message && (policy.isBlocked || (isSingleCountryPolicy && !hasExactRequiredSelection)));
}

function areSameCountries(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function clampSellerCountriesToPolicy(countries, policy = getWantListSelectionPolicy()) {
  const normalizedCountries = [...new Set((countries || [])
    .map((value) => normalizeCountryName(value))
    .filter(Boolean))];
  return normalizedCountries.slice(0, Math.min(MAX_SELLER_COUNTRIES, policy.maxSellerCountries));
}

function enforceWantListSelectionPolicy({ persist = false, announce = false } = {}) {
  const policy = getWantListSelectionPolicy();
  const constrainedCountries = clampSellerCountriesToPolicy(selectedSellerCountries, policy);
  const changed = !areSameCountries(constrainedCountries, selectedSellerCountries);

  renderSellerCountryLimitHint(policy);

  if (changed) {
    renderSellerCountryFilterList(constrainedCountries);
    if (announce && policy.distinctItemCount) {
      appendStatus(
        policy.maxSellerCountries === 1
          ? `Want list has more than ${SINGLE_COUNTRY_WANT_LIST_THRESHOLD} distinct items. Seller country filter trimmed to 1 country.`
          : `Seller country filter trimmed to ${policy.maxSellerCountries} countries.`,
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
          buyerCountry: normalizeCountryName(
            latestFrontendPayload.requestSettings.buyerCountry
          ),
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

function installE2eTestApi() {
  if (!isE2e) return;

  window.__cmOptimizerTestApi = {
    getSnapshot: () => getPopupSnapshot(),
    getStorage: async (keys = null) => {
      const storageArea = await getStorageArea();
      if (keys == null) return storageArea.get(null);
      return storageArea.get(keys);
    },
    setStorage: async (values) => {
      const storageArea = await getStorageArea();
      await storageArea.set(values || {});
      return storageArea.get(null);
    },
    clearStorage: async () => {
      const storageArea = await getStorageArea();
      await storageArea.clear();
      return true;
    },
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

function setActiveResultTab(tabName) {
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
  };
}

function canAccessWorkflowStep(stepName, state = getWorkflowState()) {
  if (stepName === 'source') return true;
  if (stepName === 'sellers') return state.hasExtractedWants && !state.wantListBlocked;
  if (stepName === 'optimize') return state.hasOptimizerPayload;
  if (stepName === 'fill') return state.hasOptimalCart;
  return false;
}

function getSuggestedWorkflowStep(state = getWorkflowState()) {
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
  if (wantListRetryTimer !== null || !isDetached) return;
  wantListRetryTimer = window.setTimeout(() => {
    wantListRetryTimer = null;
    refreshWantLists({ quiet: true }).catch(() => {});
  }, WANT_LIST_RETRY_DELAY_MS);
}

function getSelectedBuyerCountry() {
  return normalizeCountryName(buyerCountrySelectEl?.value);
}

function renderSellerFilterState() {
  const reputationFieldEl = sellerReputationFilterEl?.closest('.seller-filter-field');
  const deliveryFieldEl = sellerDeliveryTimeFilterEl?.closest('.seller-filter-field');
  const typeFieldEl = sellerTypeFilterEl?.closest('.seller-filter-field');
  const countryFieldEl = selectedSellerCountriesEl?.closest('.seller-filter-field');

  if (reputationFieldEl) {
    reputationFieldEl.classList.toggle('is-required', !normalizeSellerReputation(sellerReputationFilterEl?.value));
  }
  if (deliveryFieldEl) {
    deliveryFieldEl.classList.toggle('is-required', !normalizeMaxShippingTime(sellerDeliveryTimeFilterEl?.value));
  }
  if (typeFieldEl) {
    typeFieldEl.classList.toggle('is-required', !normalizeSellerType(sellerTypeFilterEl?.value));
  }
  if (countryFieldEl) {
    countryFieldEl.classList.toggle('is-required', getSelectedSellerCountries().length === 0);
  }
}

function renderBuyerCountryState() {
  if (!buyerCountryFieldEl) return;

  const isMissing = !getSelectedBuyerCountry();
  buyerCountryFieldEl.classList.toggle('is-required', isMissing);
}

function renderBuyerCountryOptions(selectedCountry = '') {
  if (!buyerCountrySelectEl) return;

  const normalizedSelectedCountry = normalizeCountryName(selectedCountry);
  buyerCountrySelectEl.replaceChildren();

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select buyer country';
  placeholder.selected = !normalizedSelectedCountry;
  buyerCountrySelectEl.appendChild(placeholder);

  SELLER_COUNTRY_OPTIONS.forEach((country) => {
    const option = document.createElement('option');
    option.value = country;
    option.textContent = country;
    option.selected = normalizedSelectedCountry === normalizeCountryName(country);
    buyerCountrySelectEl.appendChild(option);
  });

  renderBuyerCountryState();
}

function refreshOptimizerPayloadFromCurrentState() {
  if (latestFrontendPayload?.kind !== 'seller-scrape-batch') {
    syncOptimizeButton(isUiBusy);
    return;
  }

  latestFrontendPayload = {
    ...latestFrontendPayload,
    requestSettings: {
      ...(latestFrontendPayload.requestSettings || {}),
      buyerCountry: getSelectedBuyerCountry(),
    },
  };
  renderFrontendPayload(latestFrontendPayload);
  renderPayload(buildOptimizerPayload(latestFrontendPayload));
}

function sanitizeSellerDelay(value) {
  return Math.max(MIN_SELLER_DELAY_MS, parseInt(value, 10) || DEFAULT_SELLER_DELAY_MS);
}

async function getStorageArea() {
  return chrome.storage.session || chrome.storage.local;
}

async function loadSellerSettings() {
  const storageArea = await getStorageArea();
  const stored = await storageArea.get(SELLER_SETTINGS_KEY);
  const settings = stored[SELLER_SETTINGS_KEY] || {};
  sellerRequestDelayMs = sanitizeSellerDelay(settings.delayMs);
  syncOptimizerApiUrlInput();
  sellerReputationFilterEl.value = '';
  sellerDeliveryTimeFilterEl.value = '';
  sellerTypeFilterEl.value = '';
  renderBuyerCountryOptions(settings.buyerCountry || inferBuyerCountry());
  selectedWantListId = textOf(settings.selectedWantListId);
  restoredWantListId = selectedWantListId;
  setSelectedSellerCountries(DEFAULT_SELLER_COUNTRIES);
}

async function loadDetachedBatchState() {
  const storageArea = await getStorageArea();
  const stored = await storageArea.get(DETACHED_BATCH_STATE_KEY);
  const state = stored[DETACHED_BATCH_STATE_KEY];
  if (!state || !Array.isArray(state.items) || !state.items.length) {
    return [];
  }

  await storageArea.remove(DETACHED_BATCH_STATE_KEY);
  return state.items;
}

async function saveDetachedBatchState(items) {
  const storageArea = await getStorageArea();
  await storageArea.set({
    [DETACHED_BATCH_STATE_KEY]: {
      createdAt: new Date().toISOString(),
      items,
    },
  });
}

async function saveSellerSettings() {
  const storageArea = await getStorageArea();
  await storageArea.set({
    [SELLER_SETTINGS_KEY]: {
      delayMs: sellerRequestDelayMs,
      sellerReputationFilter: normalizeSellerReputation(sellerReputationFilterEl.value),
      sellerDeliveryTimeFilter: normalizeMaxShippingTime(sellerDeliveryTimeFilterEl.value),
      sellerTypeFilter: normalizeSellerType(sellerTypeFilterEl.value),
      buyerCountry: getSelectedBuyerCountry(),
      selectedWantListId: textOf(selectedWantListId),
      sellerLocationFilter: getSelectedSellerCountries(),
    },
  });
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
  const desiredId = textOf(preferredWantListId) || textOf(selectedWantListId);
  if (desiredId && validIds.has(desiredId)) {
    selectedWantListId = desiredId;
  } else if (availableWantLists.length) {
    selectedWantListId = availableWantLists[0].id;
  } else {
    selectedWantListId = '';
  }

  renderWantListOptions();
  syncExtractButton(isUiBusy);
  renderWorkflow();
}

function renderWantListOptions() {
  if (!wantListSelectEl) return;

  wantListSelectEl.replaceChildren();
  if (!availableWantLists.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No want lists found';
    wantListSelectEl.appendChild(option);
    wantListSelectEl.value = '';
    return;
  }

  availableWantLists.forEach((wantList) => {
    const option = document.createElement('option');
    option.value = wantList.id;
    option.textContent = wantList.name;
    wantListSelectEl.appendChild(option);
  });
  wantListSelectEl.value = selectedWantListId;
}

async function refreshWantLists({ quiet = false } = {}) {
  try {
    const tab = await ensureCardmarketTab();
    const result = await executeInTab(tab.id, injectedFetchAvailableWantListsFromCardmarket);
    setAvailableWantLists(result?.wantLists || [], textOf(result?.pageWantListId));
    await saveSellerSettings();

    if (!availableWantLists.length) {
      scheduleWantListRetry();
      renderWantListWarning('No Cardmarket want lists detected yet. Check login status and keep Cardmarket tab open.');
      if (!quiet) appendStatus('No want lists found on Cardmarket account.', 'bad');
      return;
    }

    clearWantListRetry();
    renderWantListWarning('');
    if (!quiet) appendStatus(`Loaded ${availableWantLists.length} want lists from Cardmarket.`, 'good');
  } catch (error) {
    scheduleWantListRetry();
    setAvailableWantLists([], '');
    renderWantListWarning(error.message);
    if (!quiet) appendStatus(error.message, 'bad');
  }
}

function getActiveSellerFilters(item) {
  const requestedLanguages = getItemLanguages(item);
  const allowedCountries = getSelectedSellerCountries();
  const sellerReputation = normalizeSellerReputation(sellerReputationFilterEl.value);
  const maxShippingTime = normalizeMaxShippingTime(sellerDeliveryTimeFilterEl.value);
  const sellerType = normalizeSellerType(sellerTypeFilterEl.value);
  return {
    requestedLanguages,
    allowedCountries,
    sellerReputation,
    maxShippingTime,
    sellerType,
    locationFilterText: allowedCountries.join(', '),
  };
}

function getOrderedSellerCountries(selectedCountries = []) {
  const selected = new Set((selectedCountries || []).map((value) => normalizeCountryName(value)).filter(Boolean));
  return [...SELLER_COUNTRY_OPTIONS].sort((left, right) => {
    const leftSelected = selected.has(normalizeCountryName(left));
    const rightSelected = selected.has(normalizeCountryName(right));
    if (leftSelected === rightSelected) {
      return left.localeCompare(right);
    }
    return leftSelected ? -1 : 1;
  });
}

function renderSellerCountryFilterList(selectedCountries = DEFAULT_SELLER_COUNTRIES) {
  const wantListPolicy = getWantListSelectionPolicy();
  const normalizedSelectedCountries = clampSellerCountriesToPolicy(selectedCountries, wantListPolicy);
  selectedSellerCountries = normalizedSelectedCountries;
  renderSellerCountryLimitHint(wantListPolicy);

  selectedSellerCountriesEl.replaceChildren();
  sellerLocationFilterListEl.replaceChildren();
  const selected = new Set(normalizedSelectedCountries);
  const maxCountriesReached = normalizedSelectedCountries.length >= wantListPolicy.maxSellerCountries;
  const otherCountriesSectionEl = sellerLocationFilterListEl.parentElement;
  const otherCountriesLabelEl = otherCountriesSectionEl?.querySelector('.country-section-label');

  sellerLocationFilterListEl.hidden = maxCountriesReached;
  if (otherCountriesLabelEl) otherCountriesLabelEl.hidden = maxCountriesReached;

  if (normalizedSelectedCountries.length) {
    normalizedSelectedCountries.forEach((country) => {
      const chip = document.createElement('div');
      chip.className = 'country-chip';

      const text = document.createElement('span');
      text.textContent = country;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'country-chip-remove';
      removeButton.dataset.countryRemove = country;
      removeButton.disabled = isUiBusy;
      removeButton.setAttribute('aria-label', `Remove ${country} from selected seller countries`);
      removeButton.textContent = 'x';

      chip.append(text, removeButton);
      selectedSellerCountriesEl.appendChild(chip);
    });
  } else {
    const empty = document.createElement('p');
    empty.className = 'country-empty';
    empty.textContent = 'No countries selected yet.';
    selectedSellerCountriesEl.appendChild(empty);
  }

  getOrderedSellerCountries(selectedCountries).forEach((country) => {
    if (selected.has(normalizeCountryName(country))) {
      return;
    }

    const option = document.createElement('label');
    option.className = 'country-option';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'sellerCountryFilter';
    input.value = country;
    input.checked = false;
    input.disabled = isUiBusy || wantListPolicy.isBlocked || maxCountriesReached;

    const text = document.createElement('span');
    text.textContent = country;

    option.append(input, text);
    sellerLocationFilterListEl.appendChild(option);
  });

  renderSellerFilterState();
}

function getSelectedSellerCountries() {
  return [...selectedSellerCountries];
}

function setSelectedSellerCountries(countries) {
  renderSellerCountryFilterList(countries);
}

function getStoredSellerCountries(settings) {
  if (Array.isArray(settings.sellerLocationFilter)) {
    return settings.sellerLocationFilter.map((value) => normalizeCountryName(value)).filter(Boolean);
  }
  if (typeof settings.sellerLocationFilter === 'string') {
    return parseCountryFilterInput(settings.sellerLocationFilter);
  }
  return [];
}

function applySellerFilters(result, item) {
  const filters = getActiveSellerFilters(item);
  const rawSellers = Array.isArray(result?.sellers) ? result.sellers : [];
  const filteredSellers = rawSellers.filter((seller) => {
    if (filters.requestedLanguages.length) {
      const sellerLanguage = normalizeLanguageName(seller.language);
      if (!filters.requestedLanguages.some((language) => sellerLanguage === normalizeLanguageName(language))) {
        return false;
      }
    }
    if (filters.allowedCountries.length) {
      const sellerCountry = normalizeCountryName(seller.location);
      if (!sellerCountry) return false;
      if (!filters.allowedCountries.includes(sellerCountry)) return false;
    }
    return true;
  });

  return {
    ...result,
    sellers: filteredSellers,
    sellerPreview: filteredSellers.slice(0, 12),
    totalSellers: filteredSellers.length,
    unfilteredTotalSellers: rawSellers.length,
    filtersApplied: {
      requestedLanguages: filters.requestedLanguages,
      sellerCountries: filters.allowedCountries,
      sellerCountryFilterText: filters.locationFilterText,
      sellerReputation: filters.sellerReputation,
      maxShippingTime: filters.maxShippingTime,
      sellerType: filters.sellerType,
    },
  };
}

function getItemLanguages(item) {
  const languages = Array.isArray(item?.languages)
    ? item.languages.map((value) => textOf(value)).filter(Boolean)
    : [];
  if (languages.length) return [...new Set(languages)];
  const singleLanguage = textOf(item?.language);
  return singleLanguage ? [singleLanguage] : [];
}

function getSingleItemLanguage(item) {
  const languages = getItemLanguages(item);
  return languages.length === 1 ? languages[0] : '';
}

function parseCountryFilterInput(value) {
  return value
    .split(',')
    .map((part) => normalizeCountryName(part))
    .filter(Boolean);
}

function getCardmarketCountryIds(value) {
  return value
    .split(',')
    .map((part) => getCardmarketCountryId(part))
    .filter(Boolean);
}

function getCardmarketCountryIdsFromCountries(countries) {
  return [...new Set((countries || [])
    .map((country) => getCardmarketCountryId(country))
    .filter(Boolean))];
}

function normalizeLanguageName(value) {
  const normalized = textOf(value).toLowerCase();
  const aliases = {
    deutsch: 'german',
    englisch: 'english',
    franzoesisch: 'french',
    französisch: 'french',
    italienisch: 'italian',
    spanisch: 'spanish',
    portugiesisch: 'portuguese',
    japanisch: 'japanese',
    koreanisch: 'korean',
    chinesisch: 'chinese',
    russisch: 'russian',
    's-chinesisch': 'simplified chinese',
    't-chinesisch': 'traditional chinese',
  };
  return aliases[normalized] || normalized;
}

function getCardmarketLanguageId(value) {
  const normalized = normalizeLanguageName(value);
  const ids = {
    english: '1',
    french: '2',
    german: '3',
    spanish: '4',
    italian: '5',
    'simplified chinese': '6',
    chinese: '6',
    japanese: '7',
    portuguese: '8',
    russian: '9',
    korean: '10',
    'traditional chinese': '11',
  };
  return ids[normalized] || '';
}

function normalizeSellerReputation(value) {
  const normalized = textOf(value).toLowerCase();
  const aliases = {
    outstanding: 'Outstanding',
    'very good': 'Very good',
    good: 'Good',
    average: 'Average',
    bad: 'Bad',
  };
  return aliases[normalized] || '';
}

function getCardmarketSellerReputationId(value) {
  const normalized = normalizeSellerReputation(value);
  const ids = {
    Outstanding: '1',
    'Very good': '2',
    Good: '3',
    Average: '4',
    Bad: '5',
  };
  return ids[normalized] || '';
}

function normalizeSellerType(value) {
  const normalized = textOf(value).toLowerCase();
  const aliases = {
    private: 'Private',
    professional: 'Professional',
    pro: 'Professional',
    'power seller': 'Power Seller',
    powerseller: 'Power Seller',
  };
  return aliases[normalized] || '';
}

function getCardmarketSellerTypeId(value) {
  const normalized = normalizeSellerType(value);
  const ids = {
    Private: '0',
    Professional: '1',
    'Power Seller': '2',
  };
  return ids[normalized] || '';
}

function normalizeMaxShippingTime(value) {
  const normalized = textOf(value).toLowerCase();
  const aliases = {
    '2': '2',
    '2 days': '2',
    '3': '3',
    '3 days': '3',
    '4': '4',
    '4 days': '4',
    '5': '5',
    '5 days': '5',
    '6': '6',
    '6 days': '6',
    '7': '7',
    '7+': '7',
    '7+ days': '7',
  };
  return aliases[normalized] || '';
}

function getCardmarketMaxShippingTimeId(value) {
  return normalizeMaxShippingTime(value);
}

function normalizeCardCondition(value) {
  const normalized = textOf(value).toLowerCase();
  const aliases = {
    mt: 'Mint',
    mint: 'Mint',
    nm: 'Near Mint',
    'near mint': 'Near Mint',
    ex: 'Excellent',
    excellent: 'Excellent',
    gd: 'Good',
    good: 'Good',
    lp: 'Light Played',
    'light played': 'Light Played',
    pl: 'Played',
    played: 'Played',
    po: 'Poor',
    poor: 'Poor',
  };
  return aliases[normalized] || '';
}

function getCardmarketConditionId(value) {
  const normalized = normalizeCardCondition(value);
  const ids = {
    Mint: '1',
    'Near Mint': '2',
    Excellent: '3',
    Good: '4',
    'Light Played': '5',
    Played: '6',
    Poor: '7',
  };
  return ids[normalized] || '';
}

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
    gr: 'Greece',
    greece: 'Greece',
    gb: 'United Kingdom',
    uk: 'United Kingdom',
    'united kingdom': 'United Kingdom',
    'great britain': 'United Kingdom',
    hu: 'Hungary',
    hungary: 'Hungary',
    is: 'Iceland',
    iceland: 'Iceland',
    hr: 'Croatia',
    croatia: 'Croatia',
    ie: 'Ireland',
    ireland: 'Ireland',
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
    sg: 'Singapore',
    singapore: 'Singapore',
    se: 'Sweden',
    sweden: 'Sweden',
    si: 'Slovenia',
    slovenia: 'Slovenia',
    sk: 'Slovakia',
    slovakia: 'Slovakia',
  };
  return aliases[normalized] || '';
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

function renderPayload(payload) {
  const payloadChanged = latestExtractPayload !== payload;
  latestExtractPayload = payload;
  if (payloadChanged) {
    renderOptimizationResult(null);
  }
  syncOptimizeButton(isUiBusy);
  renderWorkflow();
}

function renderFrontendPayload(payload) {
  latestFrontendPayload = payload;
  renderOptimizerInputContext();
  renderWorkflow();
}

function renderOptimizerInputContext() {
  if (!optimizerInputContextEl || !optimizerInputMetaEl) {
    return;
  }

  const context = getOptimizeContextSnapshot();
  if (!context) {
    optimizerInputContextEl.hidden = true;
    optimizerInputMetaEl.textContent = 'No seller scrape summary yet.';
    return;
  }

  optimizerInputContextEl.hidden = false;

  const totals = context.totals || {};
  const itemCount = Number.isFinite(totals.extractedItems) ? totals.extractedItems : context.itemNames.length;
  const sellerCount = Number.isFinite(context.totalSellers) ? context.totalSellers : 0;
  optimizerInputMetaEl.textContent = `${itemCount} item${itemCount === 1 ? '' : 's'} scraped, ${sellerCount} seller${sellerCount === 1 ? '' : 's'} found.`;
}

function renderSummary(rows) {
  summaryEl.replaceChildren();
  for (const row of rows) {
    const wrapper = document.createElement('div');
    wrapper.className = 'summary-line';

    const label = document.createElement('span');
    label.className = 'summary-label';
    label.textContent = row.label;

    const value = document.createElement('span');
    value.className = `summary-value${row.tone ? ` ${row.tone}` : ''}`;
    value.textContent = row.value;

    wrapper.append(label, value);
    summaryEl.appendChild(wrapper);
  }
}

function renderItems(items, totalVisible) {
  if (wantListPreviewEl) {
    const hasItems = items.length > 0 && totalVisible > 0;
    wantListPreviewEl.classList.toggle('is-empty', !hasItems);
    wantListPreviewEl.classList.toggle('is-ready', hasItems);
    wantListPreviewEl.open = hasItems;
  }

  itemsEl.replaceChildren();

  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'subtle';
    empty.textContent = 'No visible want items extracted yet.';
    itemsEl.appendChild(empty);
    return;
  }

  for (const item of items) {
    const card = document.createElement('article');
    card.className = 'item';

    const title = document.createElement('h2');
    title.className = 'item-title';
    title.textContent = item.productName || 'Unnamed item';

    const meta = document.createElement('p');
    meta.className = 'item-meta';
    const languages = getItemLanguages(item);
    meta.textContent = [
      `want=${item.idWant || '?'}`,
      `product=${item.idProduct || '?'}`,
      `qty=${item.quantity || '1'}`,
      languages.length ? `langs=${languages.join(', ')}` : null,
      item.minCondition ? `cond=${item.minCondition}` : null,
      item.maxPrice ? `max=${item.maxPrice}` : null,
    ].filter(Boolean).join(' | ');

    card.append(title, meta);
    itemsEl.appendChild(card);
  }

  if (totalVisible > items.length) {
    const more = document.createElement('p');
    more.className = 'subtle';
    more.textContent = `Showing ${items.length} of ${totalVisible} visible items.`;
    itemsEl.appendChild(more);
  }
}

function renderWantListWarning(message = '') {
  if (!wantListWarningEl) return;
  wantListWarningEl.textContent = message;
  wantListWarningEl.hidden = !message;
}

function renderSellers(sellers, totalVisible, itemLabel = '') {
  sellerItemsEl.replaceChildren();

  if (!sellers.length) {
    const empty = document.createElement('p');
    empty.className = 'subtle';
    empty.textContent = itemLabel
      ? `No seller rows parsed yet for ${itemLabel}.`
      : 'No seller rows scraped yet.';
    sellerItemsEl.appendChild(empty);
    return;
  }

  for (const seller of sellers) {
    const card = document.createElement('article');
    card.className = 'item';

    const title = document.createElement('h2');
    title.className = 'item-title';
    title.textContent = seller.sellerName || 'Unknown seller';

    const meta = document.createElement('p');
    meta.className = 'item-meta';
    meta.textContent = [
      seller.wantItemName ? `want=${seller.wantItemName}` : null,
      `article=${seller.articleId || '?'}`,
      seller.price ? `price=${seller.price}` : null,
      seller.amount ? `qty=${seller.amount}` : null,
      seller.location ? `loc=${seller.location}` : null,
      seller.language ? `lang=${seller.language}` : null,
      seller.condition ? `cond=${seller.condition}` : null,
    ].filter(Boolean).join(' | ');

    card.append(title, meta);
    sellerItemsEl.appendChild(card);
  }

  if (totalVisible > sellers.length) {
    const more = document.createElement('p');
    more.className = 'subtle';
    more.textContent = `Showing ${sellers.length} of ${totalVisible} seller rows.`;
    sellerItemsEl.appendChild(more);
  }
}

function renderOptimizationResult(result) {
  latestOptimizationResult = result;
  cartItemsEl.replaceChildren();
  syncFillCartButton(isUiBusy);
  renderCartSummary(result);

  if (!result) {
    const empty = document.createElement('p');
    empty.className = 'subtle';
    empty.textContent = 'No optimized cart yet.';
    cartItemsEl.appendChild(empty);
    return;
  }

  const cartSellers = Array.isArray(result?.cart?.sellers) ? result.cart.sellers : [];
  if (!cartSellers.length) {
    const empty = document.createElement('p');
    empty.className = 'subtle';
    empty.textContent = result.status === 'infeasible'
      ? (result.notes?.[0] || 'Optimizer returned no feasible cart.')
      : 'Optimizer returned no cart rows.';
    cartItemsEl.appendChild(empty);
    return;
  }

  for (const seller of cartSellers) {
    const card = document.createElement('article');
    card.className = 'item';

    const title = document.createElement('h2');
    title.className = 'item-title';
    title.textContent = seller.seller_name || seller.seller_id || 'Unknown seller';

    const meta = document.createElement('p');
    meta.className = 'item-meta';
    meta.textContent = [
      seller.seller_id ? `seller=${seller.seller_id}` : null,
      seller.country ? `country=${seller.country}` : null,
      `units=${seller.total_units || 0}`,
      `subtotal=${formatCurrencyAmount(seller.item_subtotal, result.currency)}`,
      `shipping=${formatCurrencyAmount(seller.shipping_cost, result.currency)}`,
      `total=${formatCurrencyAmount(seller.grand_total, result.currency)}`,
    ].filter(Boolean).join(' | ');

    card.append(title, meta);

    for (const item of seller.items || []) {
      const line = document.createElement('p');
      line.className = 'item-meta';
      line.textContent = [
        `${item.quantity}x ${item.item_name || item.item_id}`,
        `offer=${item.offer_id}`,
        `unit=${formatCurrencyAmount(item.unit_price, result.currency)}`,
        `line=${formatCurrencyAmount(item.line_total, result.currency)}`,
        item.language ? `lang=${item.language}` : null,
        item.condition ? `cond=${item.condition}` : null,
      ].filter(Boolean).join(' | ');
      card.appendChild(line);
    }

    cartItemsEl.appendChild(card);
  }

  renderWorkflow();
}

function renderCartSummary(result) {
  const summaryTargets = [
    {
      container: cartSummaryEl,
      totalEl: cartSummaryGrandTotalEl,
      itemsEl: cartSummaryTotalItemsEl,
    },
    {
      container: mainCartSummaryEl,
      totalEl: mainCartSummaryGrandTotalEl,
      itemsEl: mainCartSummaryTotalItemsEl,
    },
  ].filter((entry) => entry.container && entry.totalEl && entry.itemsEl);

  if (!summaryTargets.length) return;

  if (!result) {
    summaryTargets.forEach(({ container, totalEl, itemsEl }) => {
      container.hidden = true;
      totalEl.textContent = '-';
      itemsEl.textContent = '-';
    });
    return;
  }

  const grandTotalText = formatCurrencyAmount(result?.totals?.grand_total || 0, result?.currency || 'EUR');
  const totalItemsText = String(result?.cart?.total_units || 0);

  summaryTargets.forEach(({ container, totalEl, itemsEl }) => {
    container.hidden = false;
    totalEl.textContent = grandTotalText;
    itemsEl.textContent = totalItemsText;
  });
}

function buildCartFillPayload(result) {
  const cartSellers = Array.isArray(result?.cart?.sellers) ? result.cart.sellers : [];
  const groupedArticles = new Map();
  const detailsByArticle = {};

  for (const seller of cartSellers) {
    const sellerItems = Array.isArray(seller?.items) ? seller.items : [];
    for (const item of sellerItems) {
      const articleId = textOf(item?.offer_id);
      const quantity = parseIntegerOrFallback(item?.quantity, 0);
      if (!articleId || quantity < 1) {
        throw new Error('Optimizer cart contains row without valid Cardmarket article id and quantity.');
      }
      groupedArticles.set(articleId, (groupedArticles.get(articleId) || 0) + quantity);

      if (!detailsByArticle[articleId]) {
        detailsByArticle[articleId] = {
          sellerId: textOf(seller?.seller_id),
          sellerName: textOf(seller?.seller_name || seller?.seller_id),
          items: [],
        };
      }

      detailsByArticle[articleId].items.push({
        itemId: textOf(item?.item_id),
        itemName: textOf(item?.item_name || item?.item_id),
        quantity,
      });
    }
  }

  if (!groupedArticles.size) {
    throw new Error('No optimized cart rows available to add.');
  }

  const idArticle = {};
  const amount = {};
  for (const [articleId, quantity] of groupedArticles.entries()) {
    idArticle[articleId] = articleId;
    amount[articleId] = String(quantity);
  }

  return {
    articleCount: groupedArticles.size,
    unitCount: [...groupedArticles.values()].reduce((sum, value) => sum + value, 0),
    idArticle,
    amount,
    detailsByArticle,
  };
}

async function submitOptimizedCartInTab(payload) {
  const tab = await ensureCardmarketTab();
  const result = await executeInTab(tab.id, async (cartPayload) => {
    const pathParts = location.pathname.split('/').filter(Boolean);
    const lang = pathParts[0] || 'en';
    const game = pathParts[1] || 'Magic';

    function extractCmtknFromDocument(doc) {
      if (!doc?.querySelector) return '';

      const directValue = doc.querySelector('input[name="__cmtkn"]')?.value
        || doc.querySelector('meta[name="__cmtkn"]')?.getAttribute('content')
        || doc.querySelector('[data-cmtkn]')?.getAttribute('data-cmtkn')
        || doc.querySelector('[data-csrf-token]')?.getAttribute('data-csrf-token')
        || '';
      if (directValue) return directValue;

      const html = doc.documentElement?.outerHTML || '';
      const tokenMatch = html.match(/name=["']__cmtkn["'][^>]*value=["']([^"']+)["']/i)
        || html.match(/value=["']([^"']+)["'][^>]*name=["']__cmtkn["']/i)
        || html.match(/["']__cmtkn["']\s*[:=]\s*["']([^"']+)["']/i);
      return tokenMatch?.[1] || '';
    }

    async function resolveCmtkn() {
      const triedPaths = [];
      const currentToken = extractCmtknFromDocument(document);
      if (currentToken) {
        return { token: currentToken, source: location.pathname || '/' };
      }

      const candidatePaths = [
        `${location.pathname || '/'}${location.search || ''}`,
        `/${lang}/${game}/Wants`,
        `/${lang}/${game}/ShoppingCart`,
        `/${lang}/${game}`,
      ].filter((value, index, allValues) => value && allValues.indexOf(value) === index);

      for (const candidatePath of candidatePaths) {
        triedPaths.push(candidatePath);
        try {
          const response = await fetch(new URL(candidatePath, location.origin).toString(), {
            credentials: 'include',
            cache: 'no-store',
          });
          if (!response.ok) continue;

          const html = await response.text();
          const token = extractCmtknFromDocument(new DOMParser().parseFromString(html, 'text/html'));
          if (token) {
            return { token, source: candidatePath };
          }
        } catch {
          // Ignore token refresh failures and keep trying fallback pages.
        }
      }

      return {
        token: '',
        source: triedPaths.join(', '),
      };
    }

    function textOfLocal(value) {
      return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function looksLikeBase64Local(value) {
      const normalized = textOfLocal(value);
      return normalized.length >= 8
        && normalized.length % 4 === 0
        && /^[A-Za-z0-9+/=]+$/.test(normalized);
    }

    function decodeBase64Utf8Local(value) {
      try {
        const binary = atob(textOfLocal(value));
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        return new TextDecoder('utf-8').decode(bytes);
      } catch {
        return '';
      }
    }

    function decodeAjaxNodeText(node) {
      const raw = textOfLocal(node?.textContent || '');
      if (!raw) return '';
      return looksLikeBase64Local(raw) ? decodeBase64Utf8Local(raw) : raw;
    }

    function parsePositiveIntegerLocal(value) {
      const normalized = textOfLocal(value).replace(/[^0-9]/g, '');
      if (!normalized) return 0;
      const parsed = Number.parseInt(normalized, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    function parseCartState(html) {
      if (!html) return null;

      const doc = new DOMParser().parseFromString(html, 'text/html');
      const articleMap = {};
      const rowEls = [...doc.querySelectorAll('tr[data-article-id], [data-article-id][data-name], input[name="idArticle"]')];

      rowEls.forEach((row) => {
        let articleId = '';
        let quantityCandidates = [];

        if (row instanceof HTMLInputElement) {
          articleId = textOfLocal(row.value);
          const form = row.closest('form');
          quantityCandidates = [
            form?.querySelector(`select[name="amount-${articleId}"]`)?.value,
            form?.querySelector(`input[name="amount-${articleId}"]`)?.value,
            form?.querySelector('[data-amount]')?.getAttribute('data-amount'),
          ];
        } else {
          articleId = textOfLocal(row.getAttribute('data-article-id') || row.querySelector('input[name="idArticle"]')?.value);
          quantityCandidates = [
            row.getAttribute('data-amount'),
            row.querySelector(`select[name="amount-${articleId}"]`)?.value,
            row.querySelector(`input[name="amount-${articleId}"]`)?.value,
            row.querySelector('input[name*="amount" i]')?.value,
            row.querySelector('input[name*="qty" i]')?.value,
            row.querySelector('input[name*="quantity" i]')?.value,
            row.querySelector('select[name*="amount" i]')?.value,
            row.querySelector('select[name*="qty" i]')?.value,
            row.querySelector('select[name*="quantity" i]')?.value,
            row.querySelector('[data-amount]')?.getAttribute('data-amount'),
            row.querySelector('[data-quantity]')?.getAttribute('data-quantity'),
            row.querySelector('[data-qty]')?.getAttribute('data-qty'),
            row.querySelector('td.amount')?.getAttribute('data-amount'),
            row.querySelector('td.amount')?.textContent,
          ];
        }

        if (!articleId) return;

        const quantity = quantityCandidates
          .map((value) => parsePositiveIntegerLocal(value))
          .find((value) => value > 0) || 1;

        articleMap[articleId] = Math.max(articleMap[articleId] || 0, quantity);
      });

      const bodyText = textOfLocal(doc.body?.innerText || '');
      const summaryMatch = bodyText.match(/Amount of articles\s+(\d+)\s+Articles/i)
        || bodyText.match(/Contents\s+(\d+)\s+Articles/i)
        || bodyText.match(/Cart\s*\([^)]*\)\s*(\d+)$/i);
      const summaryUnitCount = parsePositiveIntegerLocal(summaryMatch?.[1] || '');
      const unitCount = Object.values(articleMap).reduce((sum, value) => sum + value, 0);
      const detailedCoverage = summaryUnitCount > 0
        ? Math.min(1, unitCount / summaryUnitCount)
        : (unitCount > 0 ? 1 : 0);
      return {
        articleMap,
        articleCount: Object.keys(articleMap).length,
        unitCount,
        rowCount: rowEls.length,
        summaryUnitCount,
        detailedCoverage,
        isDetailed: Object.keys(articleMap).length > 0 && (summaryUnitCount === 0 || unitCount === summaryUnitCount),
        bodyPreview: bodyText.slice(0, 1000),
      };
    }

    async function fetchCartState() {
      try {
        const response = await fetch(`${location.origin}/${lang}/${game}/ShoppingCart`, {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!response.ok) return null;
        return parseCartState(await response.text());
      } catch {
        return null;
      }
    }

    const tokenResult = await resolveCmtkn();
    if (!tokenResult.token) {
      throw new Error(`Missing __cmtkn on active Cardmarket session. Tried: ${tokenResult.source || location.pathname || '/'}. Open Cardmarket page with active session and retry.`);
    }

    const beforeCartState = await fetchCartState();

    const formData = new FormData();
    formData.append('__cmtkn', tokenResult.token);
    formData.append('idArticle', JSON.stringify(cartPayload.idArticle));
    formData.append('amount', JSON.stringify(cartPayload.amount));

    const response = await fetch(`${location.origin}/${lang}/${game}/AjaxAction/ShoppingCart_Add_AddArticlesFromUserOffers`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
      headers: {
        Accept: '*/*',
        'X-Requested-With': 'XMLHttpRequest',
      },
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`Cardmarket cart add failed (${response.status}).`);
    }

    const xml = new DOMParser().parseFromString(responseText, 'application/xml');
    const root = xml.querySelector('ajaxResponse');
    if (!root) {
      throw new Error('Cardmarket cart add returned non-AJAX response.');
    }

    const parserError = xml.querySelector('parsererror');
    if (parserError) {
      throw new Error('Cardmarket cart add returned invalid XML.');
    }

    const resultType = textOfLocal(decodeAjaxNodeText(root.querySelector('resultType'))).toLowerCase();
    const serverMessageHtml = decodeAjaxNodeText(root.querySelector('systemMessage'));
    const serverMessage = textOfLocal(
      serverMessageHtml
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
    );

    const afterCartState = await fetchCartState();
    const shortages = [];
    if (afterCartState?.isDetailed) {
      Object.entries(cartPayload.amount || {}).forEach(([articleId, quantityValue]) => {
        const requestedQuantity = Number(quantityValue || 0);
        if (!Number.isFinite(requestedQuantity) || requestedQuantity < 1) return;

        const afterQuantity = Number(afterCartState.articleMap?.[articleId] || 0);
        if (afterQuantity >= requestedQuantity) return;

        shortages.push({
          articleId,
          requestedQuantity,
          afterQuantity,
          missingQuantity: requestedQuantity - afterQuantity,
          details: cartPayload.detailsByArticle?.[articleId] || null,
        });
      });
    }

    const beforeSummaryUnits = Number(beforeCartState?.summaryUnitCount || beforeCartState?.unitCount || 0);
    const afterSummaryUnits = Number(afterCartState?.summaryUnitCount || afterCartState?.unitCount || 0);
    const addedSummaryUnits = Math.max(0, afterSummaryUnits - beforeSummaryUnits);
    const missingSummaryUnits = Math.max(0, cartPayload.unitCount - addedSummaryUnits);

    return {
      ok: true,
      articleCount: Object.keys(cartPayload.idArticle).length,
      unitCount: Object.values(cartPayload.amount).reduce((sum, value) => sum + Number(value || 0), 0),
      tokenSource: tokenResult.source,
      hasMenuMarkup: Boolean(root.querySelector('scMenuHubResponsive')),
      responsePreview: responseText.slice(0, 240),
      serverResultType: resultType,
      serverMessage,
      cartVerified: Boolean(afterCartState?.isDetailed),
      shortages,
      beforeCartState: beforeCartState
        ? {
            articleCount: beforeCartState.articleCount,
            unitCount: beforeCartState.unitCount,
            rowCount: beforeCartState.rowCount,
            summaryUnitCount: beforeCartState.summaryUnitCount,
            detailedCoverage: beforeCartState.detailedCoverage,
          }
        : null,
      afterCartState: afterCartState
        ? {
            articleCount: afterCartState.articleCount,
            unitCount: afterCartState.unitCount,
            rowCount: afterCartState.rowCount,
            summaryUnitCount: afterCartState.summaryUnitCount,
            detailedCoverage: afterCartState.detailedCoverage,
            bodyPreview: afterCartState.bodyPreview,
          }
        : null,
      addedSummaryUnits,
      missingSummaryUnits,
    };
  }, [payload]);

  if (!result || typeof result !== 'object') {
    throw new Error('Cardmarket cart add returned no result. Keep Cardmarket tab open on Cardmarket and retry.');
  }

  if (!Number.isFinite(result.articleCount) || !Number.isFinite(result.unitCount)) {
    throw new Error('Cardmarket cart add returned invalid cart summary.');
  }

  return result;
}

function formatCartShortageMessage(result) {
  const shortages = Array.isArray(result?.shortages) ? result.shortages : [];
  if (!shortages.length) {
    const missingUnits = Number(result?.missingSummaryUnits || 0);
    const addedUnits = Number(result?.addedSummaryUnits || 0);
    const requestedUnits = Number(result?.unitCount || 0);
    if (missingUnits > 0) {
      return `Cardmarket cart summary shows ${addedUnits} of ${requestedUnits} requested unit(s) added. Exact missing offers could not be identified reliably.`;
    }
    return '';
  }

  const missingUnits = shortages.reduce((sum, entry) => sum + Number(entry?.missingQuantity || 0), 0);

  const preview = shortages.slice(0, 6).map((entry) => {
    const sellerName = textOf(entry?.details?.sellerName || entry?.details?.sellerId || 'unknown-seller');
    const itemSummary = Array.isArray(entry?.details?.items) && entry.details.items.length
      ? entry.details.items.map((item) => `${item.quantity}x ${item.itemName || item.itemId}`).join(', ')
      : `article ${entry.articleId}`;
    return `${sellerName}: ${itemSummary} (missing ${entry.missingQuantity})`;
  }).join(' | ');

  const suffix = shortages.length > 6 ? ` | +${shortages.length - 6} more` : '';
  return `Cardmarket still missing ${shortages.length} offer row(s), ${missingUnits} unit(s). ${preview}${suffix}`;
}

function buildCartFillFailureMessage(result) {
  const parts = [];
  const serverMessage = textOf(result?.serverMessage);
  const shortageMessage = formatCartShortageMessage(result);

  if (serverMessage) parts.push(serverMessage);
  if (shortageMessage) parts.push(shortageMessage);
  return parts.filter(Boolean).join(' | ');
}

async function handleFillCart() {
  if (!hasOptimizedCart()) {
    appendStatus('No optimal cart ready yet. Run optimizer first.', 'bad');
    return;
  }

  startRun('Posting optimized cart to Cardmarket...');
  setBusy(true);
  try {
    const payload = buildCartFillPayload(latestOptimizationResult);
    appendStatus(`Posting ${payload.articleCount} articles and ${payload.unitCount} units to Cardmarket cart.`);
    const result = await submitOptimizedCartInTab(payload);
    if (textOf(result?.serverResultType) === 'error'
      || (Array.isArray(result?.shortages) && result.shortages.length)
      || Number(result?.missingSummaryUnits || 0) > 0) {
      throw new Error(buildCartFillFailureMessage(result) || 'Cardmarket rejected one or more cart rows.');
    }
    if (!result?.cartVerified) {
      appendStatus('Cardmarket cart posted, but extension could not verify final cart contents.', 'warn');
    }
    appendStatus(`Cardmarket cart updated: ${result.articleCount} articles, ${result.unitCount} units.`, 'good');
    finishRun('Optimized cart pushed to Cardmarket.', 'good');
  } catch (error) {
    appendStatus(error.message, 'bad');
    finishRun(error.message, 'bad');
  } finally {
    setBusy(false);
  }
}

function parseOptimizerErrorBody(body) {
  if (typeof body === 'string') return textOf(body);
  if (!body || typeof body !== 'object') return '';
  if (typeof body.detail === 'string') return body.detail;
  if (typeof body.message === 'string') return body.message;
  if (typeof body.error === 'string') return body.error;
  if (Array.isArray(body.detail)) {
    return body.detail
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        if (entry && typeof entry === 'object') {
          const path = Array.isArray(entry.loc) ? entry.loc.join('.') : '';
          return [path, entry.msg].filter(Boolean).join(': ');
        }
        return '';
      })
      .filter(Boolean)
      .join('; ');
  }
  return '';
}

function getSummaryToneForStatus(status) {
  return ['optimal', 'feasible'].includes(status) ? 'good' : 'bad';
}

function deriveOptimizerHealthUrl(endpoint) {
  const rawEndpoint = textOf(endpoint);
  if (!rawEndpoint) return '';

  try {
    const url = new URL(rawEndpoint);
    url.pathname = url.pathname.replace(/\/optimize\/?$/, '/health');
    return url.toString();
  } catch {
    return '';
  }
}

async function warmOptimizerApi(endpoint, { reason = '', force = false } = {}) {
  const healthUrl = deriveOptimizerHealthUrl(endpoint);
  if (!healthUrl) return;

  const now = Date.now();
  if (!force && now - lastOptimizerWarmupAt < OPTIMIZER_WARMUP_THROTTLE_MS) {
    return;
  }
  lastOptimizerWarmupAt = now;

  const reasonSuffix = reason ? ` (${reason})` : '';
  appendStatus(`Warming optimizer API${reasonSuffix}.`);

  try {
    const response = await fetch(healthUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      appendStatus(`Optimizer warmup returned ${response.status}.`, 'bad');
      return;
    }

    appendStatus('Optimizer warmup request finished.', 'good');
  } catch (error) {
    appendStatus(`Optimizer warmup failed: ${error.message}`, 'bad');
  }
}

async function submitOptimizationRequest(endpoint) {
  if (!latestExtractPayload) {
    appendStatus('No optimizer payload ready yet. Scrape sellers first.', 'bad');
    return;
  }

  if (!getSelectedBuyerCountry()) {
    appendStatus('Buyer country missing. Choose buyer country before running optimizer.', 'bad');
    return;
  }

  if (!textOf(endpoint)) {
    appendStatus('Optimizer API URL missing in config.js.', 'bad');
    return;
  }

  syncOptimizerApiUrlInput();
  await saveSellerSettings();

  startRun('Waiting for optimizer reply...');
  setBusy(true);
  try {
    await warmOptimizerApi(endpoint, { reason: 'before optimize', force: true });
    const requestBody = JSON.stringify(latestExtractPayload);
    setStepActivity({
      kind: 'optimizer-request',
      label: 'Posting payload to optimizer API.',
      detail: `Sending ${latestExtractPayload.items.length} items, ${latestExtractPayload.sellers.length} sellers, and ${latestExtractPayload.offers.length} offers to optimizer.`,
      indeterminate: true,
    });
    appendStatus('Posting optimizer payload to optimizer.');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: requestBody,
    });

    setStepActivity({
      kind: 'optimizer-request',
      label: 'Optimizer request sent. Waiting for reply.',
      detail: 'Solver is evaluating item price and shipping tradeoffs.',
      indeterminate: true,
    });

    let responseText = '';
    let responseBody = null;
    try {
      responseText = await response.text();
      responseBody = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseBody = null;
    }

    if (!response.ok) {
      const detail = parseOptimizerErrorBody(responseBody)
        || textOf(responseText)
        || response.statusText
        || 'Unknown optimizer error.';
      throw new Error(`Optimizer API failed (${response.status}): ${detail}`);
    }

    const result = responseBody || {};
    if (!['optimal', 'feasible', 'infeasible'].includes(result.status)) {
      throw new Error('Optimizer API returned invalid response payload. Missing result status.');
    }

    renderOptimizationResult(result);
    const isUsableCart = result.status === 'optimal' || result.status === 'feasible';
    renderSummary([
      { label: 'Solution', value: result.status || 'unknown', tone: getSummaryToneForStatus(result.status || 'unknown') },
      { label: 'Warm start', value: result.warm_start_status || 'unknown', tone: getSummaryToneForStatus(result.warm_start_status || 'unknown') },
      { label: 'Grand total', value: formatCurrencyAmount(result?.totals?.grand_total || 0, result.currency || 'EUR'), tone: isUsableCart ? 'good' : '' },
      { label: 'Item subtotal', value: formatCurrencyAmount(result?.totals?.item_subtotal || 0, result.currency || 'EUR') },
      { label: 'Shipping total', value: formatCurrencyAmount(result?.totals?.shipping_total || 0, result.currency || 'EUR') },
      { label: 'Chosen sellers', value: String(result?.cart?.total_sellers || 0) },
      { label: 'Total units', value: String(result?.cart?.total_units || 0) },
    ]);
    setActiveWorkflowStep(isUsableCart ? 'fill' : 'optimize', { force: true });
    setActiveResultTab('cart');

    if (result.status === 'optimal') {
      appendStatus(`Optimizer returned cart with ${result.cart?.total_sellers || 0} sellers and ${result.cart?.total_units || 0} units.`, 'good');
      finishRun(`Optimizer finished. Total ${formatCurrencyAmount(result?.totals?.grand_total || 0, result.currency || 'EUR')}.`, 'good');
    } else if (result.status === 'feasible') {
      appendStatus(`Optimizer returned best known cart with ${result.cart?.total_sellers || 0} sellers and ${result.cart?.total_units || 0} units.`, 'good');
      finishRun(`Optimizer hit time limit. Best known total ${formatCurrencyAmount(result?.totals?.grand_total || 0, result.currency || 'EUR')}.`, 'good');
    } else {
      appendStatus(`Optimizer returned infeasible result. ${Array.isArray(result.notes) && result.notes.length ? result.notes[0] : ''}`.trim(), 'bad');
      finishRun('Optimizer finished with no feasible order.', 'bad');
    }
  } catch (error) {
    appendStatus(error.message, 'bad');
    finishRun(error.message, 'bad');
  } finally {
    setStepActivity(null);
    setBusy(false);
  }
}

async function handleOptimizeOrder() {
  return submitOptimizationRequest(DEFAULT_OPTIMIZER_API_URL);
}

async function getTargetTab() {
  if (Number.isInteger(forcedTabId)) {
    try {
      return await chrome.tabs.get(forcedTabId);
    } catch {
      return null;
    }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function getDetachedPopupUrl({ autoStart = '', tabId = null } = {}) {
  const params = new URLSearchParams({ detached: '1' });
  if (autoStart) params.set('autoStart', autoStart);
  if (Number.isInteger(tabId)) params.set('tabId', String(tabId));
  return `${chrome.runtime.getURL('popup.html')}?${params.toString()}`;
}

function parseDetachedPopupUrl(url) {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const popupUrl = new URL(chrome.runtime.getURL('popup.html'));
    if (parsed.origin !== popupUrl.origin || parsed.pathname !== popupUrl.pathname) {
      return null;
    }
    if (parsed.searchParams.get('detached') !== '1') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function findDetachedPopupWindows() {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['popup'] });
  return windows
    .map((popupWindow) => {
      const popupTab = popupWindow.tabs?.find((tab) => parseDetachedPopupUrl(tab.url));
      if (!popupTab) return null;
      return { popupWindow, popupTab };
    })
    .filter(Boolean);
}

async function focusDetachedPopup(entry, nextUrl) {
  const currentUrl = entry.popupTab.url || '';
  if (currentUrl !== nextUrl && entry.popupTab.id) {
    await chrome.tabs.update(entry.popupTab.id, { url: nextUrl });
  }

  await chrome.windows.update(entry.popupWindow.id, { focused: true });
  if (entry.popupTab.id) {
    await chrome.tabs.update(entry.popupTab.id, { active: true });
  }
}

async function openDetachedPopup({ autoStart = '' } = {}) {
  const tab = await getTargetTab();
  const targetTabId = tab?.id && /https:\/\/www\.cardmarket\.com\//.test(tab.url || '')
    ? tab.id
    : null;
  const detachedPopupUrl = getDetachedPopupUrl({ autoStart, tabId: targetTabId });

  await saveSellerSettings();

  const detachedWindows = await findDetachedPopupWindows();
  if (detachedWindows.length) {
    const [primaryWindow, ...duplicateWindows] = detachedWindows;

    await Promise.all(duplicateWindows.map(({ popupWindow }) => chrome.windows.remove(popupWindow.id)));
    await focusDetachedPopup(primaryWindow, detachedPopupUrl);
    return;
  }

  await chrome.windows.create({
    url: detachedPopupUrl,
    type: 'popup',
    width: 460,
    height: 920,
  });
}

async function autoDetachDefaultPopup() {
  if (isDetached) return;

  try {
    await openDetachedPopup();
    window.close();
  } catch (error) {
    appendStatus(`Could not open dedicated plugin window: ${error.message}`, 'bad');
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
  if (!/https:\/\/www\.cardmarket\.com\//.test(tab.url || '')) {
    throw new Error('Open a Cardmarket page in the active tab first.');
  }
  return tab;
}

function parseCardmarketRequestContext(urlValue) {
  if (!urlValue) return null;

  try {
    const url = new URL(urlValue);
    if (!/^https:\/\/www\.cardmarket\.com\//.test(url.toString())) {
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

async function refreshWantListWarning() {
  try {
    const tab = await getTargetTab();
    if (!tab?.url) {
      renderWantListWarning('Open any Cardmarket page first so plugin can load your want lists.');
      return;
    }

    if (!/https:\/\/www\.cardmarket\.com\//.test(tab.url)) {
      renderWantListWarning('Current tab not Cardmarket. Open any Cardmarket page first.');
      return;
    }

    if (!availableWantLists.length) {
      renderWantListWarning('Could not detect want lists yet. Keep Cardmarket tab open; popup retries automatically.');
      return;
    }

    if (!hasSelectedWantList() && !hasLoadedWantItems()) {
      renderWantListWarning('Choose want list in dropdown, then load cards.');
      return;
    }

    const wantListPolicy = getWantListSelectionPolicy();
    if (wantListPolicy.warningMessage) {
      renderWantListWarning(wantListPolicy.warningMessage);
      return;
    }

    renderWantListWarning('');
  } catch {
    renderWantListWarning('Could not inspect current tab. Open Cardmarket page and retry.');
  }
}

async function handleExtractItems() {
  startRun('Loading selected Cardmarket want list...');
  setBusy(true);
  try {
    const tab = await ensureCardmarketTab();
    if (!hasSelectedWantList()) {
      throw new Error('Pick want list in dropdown before loading cards.');
    }

    const selectedWantList = availableWantLists.find((entry) => entry.id === selectedWantListId) || null;

    const result = await executeInTab(tab.id, injectedLoadWantListItemsById, [{
      wantListId: selectedWantListId,
      wantListName: selectedWantList?.name || '',
      wantListPath: selectedWantList?.path || '',
      previewLimit: 8,
    }]);
    renderSummary([
      { label: 'Source', value: result.wantListName || 'Selected want list', tone: 'good' },
      { label: 'Want list id', value: result.wantListId || '-' },
      { label: 'Items loaded', value: String(result.totalVisible), tone: result.totalVisible ? 'good' : 'bad' },
      { label: 'Pages loaded', value: String(result.pagesScanned || 0), tone: result.pagesScanned ? 'good' : 'bad' },
      { label: 'Preview returned', value: String(Math.min(result.items.length, 8)) },
      { label: 'Extractor source', value: result.debug.source || '-' },
      { label: 'Rows parsed', value: String(result.debug.parsedItems || 0) },
    ]);
    latestExtractedItems = result.items;
    const wantListPolicy = enforceWantListSelectionPolicy({ persist: true, announce: true });
    syncExtractButton();
    syncSellerScrapeButton();
    renderItems(result.items.slice(0, 8), result.totalVisible);
    renderSellers([], 0, result.items[0]?.productName || 'the first item');
    renderFrontendPayload(result);
    renderPayload(null);
    renderOptimizationResult(null);
    setActiveWorkflowStep('source', { force: true, recordHistory: false });
    setActiveResultTab('overview');
    await refreshWantListWarning();
    if (wantListPolicy.isBlocked) {
      appendStatus(wantListPolicy.warningMessage, 'bad');
      finishRun(`Loaded ${result.totalVisible} want items. Seller scrape locked.`, 'bad');
    } else {
      appendStatus(`Loaded ${result.totalVisible} want items from ${result.wantListName || `want list ${result.wantListId}`}.`, result.totalVisible ? 'good' : 'bad');
      finishRun(`Loaded ${result.totalVisible} want items.`, result.totalVisible ? 'good' : 'bad');
    }
    confirmWantListButton?.focus();
  } catch (error) {
    latestExtractedItems = [];
    syncExtractButton();
    syncSellerScrapeButton();
    renderPayload(null);
    renderOptimizationResult(null);
    renderWorkflow();
    appendStatus(error.message, 'bad');
    finishRun(error.message, 'bad');
  } finally {
    setBusy(false);
  }
}

async function handleScrapeAllItems() {
  if (!isDetached) {
    try {
      if (!latestExtractedItems.length) {
        throw new Error('Extract want items first so the popup has products to scrape.');
      }

      appendStatus('Opening batch scrape workspace so run keeps going after this popup closes...', 'good');
      finishRun('Opening batch scrape workspace.', 'good');
        await saveDetachedBatchState(latestExtractedItems);
      await openDetachedPopup({ autoStart: 'scrapeAll' });
      window.close();
      return;
    } catch (error) {
      appendStatus(error.message, 'bad');
      finishRun(error.message, 'bad');
      return;
    }
  }

  startRun('Scraping seller rows for all extracted want items...');
  setBusy(true);
  try {
    void warmOptimizerApi(DEFAULT_OPTIMIZER_API_URL, { reason: 'seller scrape start' });
    appendStatus('Starting serial seller scrape for all extracted want items...', 'good');
    if (!latestExtractedItems.length) {
      throw new Error('Extract want items first so the popup has products to scrape.');
    }

    setStepActivity({
      kind: 'seller-scrape',
      label: 'Preparing seller scrape...',
      detail: 'Validating extracted items and seller filters for this run.',
      current: 0,
      total: latestExtractedItems.length,
    });

    const requestContext = await resolveSellerRequestContext(latestExtractedItems.find((item) => item?.productUrl) || latestExtractedItems[0]);
    const delayMs = sellerRequestDelayMs;
    await ensureSellerScrapeNotCoolingDown();

    setStepActivity({
      kind: 'seller-scrape',
      label: 'Seller scrape running.',
      detail: `Using ${delayMs} ms pacing between seller requests.`,
      current: 0,
      total: latestExtractedItems.length,
    });

    const startedAt = new Date().toISOString();
    const aggregateResults = [];
    const previewSellers = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let totalSellerRows = 0;
    let rateLimited = false;
    let stopReason = '';

    for (let index = 0; index < latestExtractedItems.length; index += 1) {
      const item = latestExtractedItems[index];
      const itemLabel = item.productName || item.idProduct || `item ${index + 1}`;

      if (!item.idProduct) {
        setStepActivity({
          kind: 'seller-scrape',
          label: `Skipping item ${index + 1} of ${latestExtractedItems.length}.`,
          detail: `${itemLabel} has no idProduct, so no seller request can be made.`,
          current: index + 1,
          total: latestExtractedItems.length,
        });
        skippedCount += 1;
        aggregateResults.push({
          item,
          skipped: true,
          error: 'Missing idProduct on extracted want item.',
        });
        appendStatus(`Skipping item ${index + 1}/${latestExtractedItems.length}: ${itemLabel} has no idProduct.`, 'bad');
        continue;
      }

      setStepActivity({
        kind: 'seller-scrape',
        label: `Scraping item ${index + 1} of ${latestExtractedItems.length}.`,
        detail: itemLabel,
        current: index,
        total: latestExtractedItems.length,
      });
      appendStatus(`Scraping item ${index + 1}/${latestExtractedItems.length}: ${itemLabel}.`);

      let scrapeOutcome = null;
      try {
        scrapeOutcome = await scrapeWantItemSellerData({
          requestContext,
          item,
          delayMs,
          logPartitionRetry: false,
          onScopeStart: ({ partitionLabel, sellerCountryIds }) => {
            const scopeName = partitionLabel
              || (sellerCountryIds?.length === 1 ? getCountryNameById(sellerCountryIds[0]) : '')
              || 'All countries';
            setStepActivity({
              kind: 'seller-scrape',
              label: `${itemLabel} (${scopeName})`,
              current: index + 1,
              total: latestExtractedItems.length,
            });
          },
        });
      } catch (error) {
        setStepActivity({
          kind: 'seller-scrape',
          label: `Seller scrape stopped on item ${index + 1} of ${latestExtractedItems.length}.`,
          detail: error.message,
          current: index + 1,
          total: latestExtractedItems.length,
        });
        failedCount += 1;
        stopReason = error.message;
        aggregateResults.push({
          item,
          error: error.message,
          stopped: true,
        });
        appendStatus(`Stopped on item ${index + 1}/${latestExtractedItems.length}: ${error.message}`, 'bad');
        break;
      }

      const { filteredResult } = scrapeOutcome;
      if (filteredResult.error) {
        setStepActivity({
          kind: 'seller-scrape',
          label: `Item ${index + 1} finished with warning.`,
          detail: filteredResult.error,
          current: index + 1,
          total: latestExtractedItems.length,
        });
        failedCount += 1;
        aggregateResults.push({
          item,
          error: filteredResult.error,
          rateLimited: !!filteredResult.rateLimited,
          totalSellers: filteredResult.totalSellers || 0,
          unfilteredTotalSellers: filteredResult.unfilteredTotalSellers || 0,
          pagesFetched: filteredResult.pagesFetched || 0,
          marketPath: filteredResult.marketPath || '',
          requestFilters: filteredResult.requestFilters || null,
          filtersApplied: filteredResult.filtersApplied || null,
          attemptedUrls: filteredResult.attemptedUrls || [],
          partitionCount: filteredResult.partitionCount || 1,
          sellers: filteredResult.sellers || [],
        });
        appendStatus(`Item ${index + 1}/${latestExtractedItems.length} failed: ${filteredResult.error}`, 'bad');
        if (filteredResult.rateLimited) {
          rateLimited = true;
          stopReason = filteredResult.error;
          break;
        }
        continue;
      }

      successCount += 1;
      totalSellerRows += filteredResult.totalSellers || 0;
      aggregateResults.push({
        item,
        error: '',
        rateLimited: !!filteredResult.rateLimited,
        totalSellers: filteredResult.totalSellers || 0,
        unfilteredTotalSellers: filteredResult.unfilteredTotalSellers || 0,
        pagesFetched: filteredResult.pagesFetched || 0,
        marketPath: filteredResult.marketPath || '',
        requestFilters: filteredResult.requestFilters || null,
        filtersApplied: filteredResult.filtersApplied || null,
        attemptedUrls: filteredResult.attemptedUrls || [],
        partitionCount: filteredResult.partitionCount || 1,
        sellers: filteredResult.sellers || [],
      });

      filteredResult.sellers.forEach((seller) => {
        if (previewSellers.length >= 12) return;
        previewSellers.push({
          ...seller,
          wantItemName: item.productName || item.idProduct || '',
        });
      });

      setStepActivity({
        kind: 'seller-scrape',
        label: `Finished item ${index + 1} of ${latestExtractedItems.length}.`,
        detail: `${itemLabel}: ${filteredResult.totalSellers} seller rows kept.`,
        current: index + 1,
        total: latestExtractedItems.length,
      });

      appendStatus(
        `Item ${index + 1}/${latestExtractedItems.length}: ${filteredResult.totalSellers} seller rows for ${itemLabel}.`,
        filteredResult.totalSellers ? 'good' : 'bad'
      );

      if (filteredResult.rateLimited) {
        rateLimited = true;
        stopReason = 'Seller scraping paused after rate limiting.';
        break;
      }
    }

    renderSummary([
      { label: 'Scrape scope', value: 'All extracted items from the current page', tone: 'good' },
      { label: 'Items extracted', value: String(latestExtractedItems.length) },
      { label: 'Items scraped', value: String(successCount), tone: successCount ? 'good' : '' },
      { label: 'Items failed', value: String(failedCount), tone: failedCount ? 'bad' : '' },
      { label: 'Items skipped', value: String(skippedCount), tone: skippedCount ? 'bad' : '' },
      { label: 'Seller rows kept', value: String(totalSellerRows), tone: totalSellerRows ? 'good' : '' },
      { label: 'Rate limited', value: rateLimited ? 'yes' : 'no', tone: rateLimited ? 'bad' : '' },
      { label: 'Stopped reason', value: stopReason || 'completed' },
    ]);
    renderSellers(previewSellers, totalSellerRows, 'the extracted want list');
    const batchPayload = {
      kind: 'seller-scrape-batch',
      wantListId: latestExtractedItems[0]?.wantListId || '',
      startedAt,
      finishedAt: new Date().toISOString(),
      requestSettings: {
        delayMs,
        buyerCountry: getSelectedBuyerCountry(),
        sellerReputation: normalizeSellerReputation(sellerReputationFilterEl.value),
        maxShippingTime: normalizeMaxShippingTime(sellerDeliveryTimeFilterEl.value),
        sellerType: normalizeSellerType(sellerTypeFilterEl.value),
        sellerCountries: getSelectedSellerCountries(),
      },
      totals: {
        extractedItems: latestExtractedItems.length,
        successCount,
        failedCount,
        skippedCount,
        totalSellerRows,
        rateLimited,
        stopReason,
      },
      results: aggregateResults,
    };
    const optimizerPayload = buildOptimizerPayload(batchPayload);
    renderFrontendPayload(batchPayload);
    renderPayload(optimizerPayload);
    if (optimizerPayload) {
      void warmOptimizerApi(DEFAULT_OPTIMIZER_API_URL, { reason: 'seller scrape finished', force: true });
    }
    setActiveWorkflowStep(optimizerPayload ? 'optimize' : 'sellers', { force: true });
    setActiveResultTab('sellers');

    if (optimizerPayload) {
      appendStatus(
        `Optimizer payload ready: ${optimizerPayload.items.length} items, ${optimizerPayload.sellers.length} sellers, ${optimizerPayload.offers.length} offers.`,
        'good'
      );
    } else {
      appendStatus('No optimizer payload built. Seller rows missing valid price data.', 'bad');
    }

    if (stopReason) {
      appendStatus(`Batch scrape stopped: ${stopReason}`, rateLimited ? 'bad' : '');
      finishRun(`Batch scrape stopped: ${stopReason}`, rateLimited ? 'bad' : '');
    } else {
      setStepActivity({
        kind: 'seller-scrape',
        label: 'Seller scrape complete.',
        detail: `Processed ${successCount + failedCount + skippedCount} of ${latestExtractedItems.length} items.`,
        current: latestExtractedItems.length,
        total: latestExtractedItems.length,
      });
      const completionMessage = `Batch scrape completed for ${successCount} extracted item${successCount === 1 ? '' : 's'}.`;
      appendStatus(completionMessage, successCount ? 'good' : 'bad');
      finishRun(completionMessage, successCount ? 'good' : 'bad');
    }
  } catch (error) {
    appendStatus(error.message, 'bad');
    finishRun(error.message, 'bad');
  } finally {
    setStepActivity(null);
    setBusy(false);
  }
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

function hasPowerSellerFilterOption(availableSellerFilters) {
  const sellerTypeOptions = Array.isArray(availableSellerFilters?.sellerType)
    ? availableSellerFilters.sellerType
    : [];
  return sellerTypeOptions.some((entry) => {
    const value = String(entry?.value || '').trim();
    const label = String(entry?.label || '').trim();
    return value === '2' || /power\s+seller/i.test(label);
  });
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

  if (sellerTypeId === getCardmarketSellerTypeId('Power Seller')) {
    parts.push('Power Seller subset');
  } else {
    const explicitSellerType = sellerTypeFilterEl?.value || '';
    const normalizedSellerType = normalizeSellerType(explicitSellerType);
    if (normalizedSellerType) parts.push(`${normalizedSellerType} sellers`);
  }

  return parts.join(', ');
}

async function executeSellerScopeScrape({
  item,
  delayMs,
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
  const requestFilters = {
    languageId: requestLanguageId,
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
    previewLimit,
    requestFilters,
    requestContext,
  });
  if (!scopeResult) return null;

  const powerSellerTypeId = getCardmarketSellerTypeId('Power Seller');
  const shouldRetryWithPowerSeller = !sellerTypeId
    && hasPowerSellerFilterOption(scopeResult.availableSellerFilters)
    && isSellerScopeLikelyCapped(scopeResult, 300);

  if (shouldRetryWithPowerSeller) {
    if (logPowerSellerFallback) {
      appendStatus(`${partitionLabel} looks capped. Applying Power Seller subset.`, 'good');
    }
    appendStatus(`Querying seller scope: ${describeSellerScope({ sellerCountryIds, sellerTypeId: powerSellerTypeId })}.`);
    const powerSellerResult = await scrapeSingleWantItemSellers({
      item,
      delay: delayMs,
      previewLimit,
      requestFilters: {
        ...requestFilters,
        sellerTypeId: powerSellerTypeId,
      },
      requestContext,
    });
    if (powerSellerResult) {
      powerSellerResult.powerSellerFallbackApplied = true;
      scopeResult = powerSellerResult;
    }
  }

  return scopeResult;
}

async function scrapeWantItemSellerData({ requestContext, item, delayMs, logPartitionRetry, onScopeStart }) {
  await ensureSellerScrapeNotCoolingDown();

  const requestLanguageId = getCardmarketLanguageId(getSingleItemLanguage(item));
  const requestCountryIds = getCardmarketCountryIdsFromCountries(getSelectedSellerCountries());
  const sellerReputationId = getCardmarketSellerReputationId(sellerReputationFilterEl.value);
  const maxShippingTimeId = getCardmarketMaxShippingTimeId(sellerDeliveryTimeFilterEl.value);
  const sellerTypeId = getCardmarketSellerTypeId(sellerTypeFilterEl.value);
  const baseRequestFilters = {
    languageId: requestLanguageId,
    sellerCountryIds: requestCountryIds,
    sellerReputationId,
    maxShippingTimeId,
    sellerTypeId,
  };
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
    filteredResult: applySellerFilters(result, item),
  };
}

extractItemsButton.addEventListener('click', handleExtractItems);
confirmWantListButton?.addEventListener('click', () => {
  if (!hasLoadedWantItems() || getWantListSelectionPolicy().isBlocked) return;
  setActiveWorkflowStep('sellers', { force: true });
});
scrapeAllItemsButton.addEventListener('click', handleScrapeAllItems);
optimizeOrderButton.addEventListener('click', handleOptimizeOrder);
fillCartButton.addEventListener('click', handleFillCart);
workflowStepButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const stepName = button.dataset.workflowStep || 'source';
    setActiveWorkflowStep(stepName);
  });
});
resultTabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveResultTab(button.dataset.resultTab || 'overview');
  });
});
wantListSelectEl?.addEventListener('change', () => {
  selectedWantListId = textOf(wantListSelectEl.value);
  saveSellerSettings();
  syncExtractButton();
  renderWorkflow();
  refreshWantListWarning().catch(() => {
    renderWantListWarning('Could not inspect current tab. Open Cardmarket page and retry.');
  });
  if (selectedWantListId) {
    handleExtractItems().catch((error) => {
      appendStatus(error.message, 'bad');
    });
  }
});
sellerReputationFilterEl.addEventListener('change', () => {
  renderSellerFilterState();
  saveSellerSettings();
});
sellerDeliveryTimeFilterEl.addEventListener('change', () => {
  renderSellerFilterState();
  saveSellerSettings();
});
sellerTypeFilterEl.addEventListener('change', () => {
  renderSellerFilterState();
  saveSellerSettings();
});
buyerCountrySelectEl.addEventListener('change', () => {
  saveSellerSettings();
  refreshOptimizerPayloadFromCurrentState();
});
sellerLocationFilterListEl.addEventListener('change', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.name === 'sellerCountryFilter') {
    const country = normalizeCountryName(event.target.value);
    if (event.target.checked && country && !selectedSellerCountries.includes(country)) {
      setSelectedSellerCountries(clampSellerCountriesToPolicy([...selectedSellerCountries, country]));
    }
    saveSellerSettings();
  }
});
selectedSellerCountriesEl.addEventListener('click', (event) => {
  const removeButton = event.target instanceof HTMLElement
    ? event.target.closest('button[data-country-remove]')
    : null;
  if (!(removeButton instanceof HTMLButtonElement)) return;

  const country = normalizeCountryName(removeButton.dataset.countryRemove || '');
  if (!country) return;

  setSelectedSellerCountries(selectedSellerCountries.filter((value) => value !== country));
  saveSellerSettings();
});
window.addEventListener('focus', () => {
  refreshWantLists({ quiet: true }).catch(() => {});
  refreshWantListWarning().catch(() => {
    renderWantListWarning('Could not inspect current tab. Open Cardmarket page and retry.');
  });
});

renderSummary([
  { label: 'Status', value: 'Ready for want-list loading' },
  { label: 'Current scope', value: 'Select a wants list to continue.' },
]);
finishRun('Idle. Start extract, scrape, or probe.');
renderItems([], 0);
renderOptimizationResult(null);
renderSellers([], 0);
renderPayload(null);
renderFrontendPayload(null);
renderOptimizerInputContext();
renderBuyerCountryOptions();
installE2eTestApi();
renderSellerCountryFilterList();
renderWantListOptions();
syncExtractButton();
syncSellerScrapeButton();
syncOptimizeButton();
syncFillCartButton();
renderStepActivity();
renderWorkflow();
scrapeAllItemsButton.textContent = 'Scrape sellers';
appendStatus(isDetached
  ? 'Batch scrape workspace loaded. It stays open while you click back into Cardmarket.'
  : 'Popup loaded. Opening dedicated plugin window so long scrapes keep running.');

if (!isDetached) {
  autoDetachDefaultPopup();
} else {
  loadSellerSettings()
    .then(() => refreshWantLists({ quiet: true }))
    .then(() => {
      if (!restoredWantListId || selectedWantListId !== restoredWantListId || !hasSelectedWantList() || hasLoadedWantItems()) {
        return null;
      }

      return handleExtractItems();
    })
    .then(() => refreshWantListWarning())
    .catch((error) => {
      const message = error?.message || '';
      if (/want list|wants overview|cardmarket/i.test(message)) {
        appendStatus('Could not load Cardmarket want lists. Open Cardmarket tab; popup retries automatically.', 'bad');
        return;
      }
      appendStatus('Could not load saved seller scrape settings. Using safe defaults.', 'bad');
    })
    .finally(() => {
      if (isDetached && autoStartMode === 'scrapeAll') {
        loadDetachedBatchState().then((items) => {
          latestExtractedItems = items;
          syncSellerScrapeButton();
          renderWorkflow();
          if (!latestExtractedItems.length) {
            appendStatus('Batch scrape workspace could not auto-start because no extracted items were passed from popup.', 'bad');
            return;
          }

          renderItems(latestExtractedItems.slice(0, 8), latestExtractedItems.length);
          renderSellers([], 0, latestExtractedItems[0]?.productName || 'the first item');
          setActiveWorkflowStep('sellers', { force: true });
          handleScrapeAllItems().catch((error) => {
            appendStatus(error.message, 'bad');
          });
        }).catch(() => {
          appendStatus('Batch scrape workspace could not load extracted items for auto-start.', 'bad');
        });
      }
    });
}

function detectCurrentPage() {
  const pathname = location.pathname || '';
  const pageKind = wantsPageKind(pathname);
  const wantListId = extractWantListId(location.href);
  const rowCandidates = document.querySelectorAll('input[data-id-want], input[name="checkWantsRow[]"][data-id-want]').length;

  return {
    title: document.title,
    href: location.href,
    pathname,
    pageKind,
    supported: pageKind === 'wants-detail',
    wantListId,
    visibleRowCandidates: rowCandidates,
  };

  function wantsPageKind(currentPath) {
    if (/\/Wants\/(?:EditWantsList\/|Show\/)?\d+(?:[/?#]|$)/i.test(currentPath)) return 'wants-detail';
    if (/\/Wants(?:[/?#]|$)/i.test(currentPath)) return 'wants-overview';
    return 'other-cardmarket';
  }

  function extractWantListId(href) {
    const patterns = [
      /\/Wants\/(?:EditWantsList\/|Show\/)?(\d+)(?:[/?#]|$)/i,
      /[?&]idWantsList=(\d+)/i,
    ];
    for (const pattern of patterns) {
      const match = href.match(pattern);
      if (match) return match[1];
    }
    return '';
  }
}

function fetchAvailableWantListsFromCardmarket() {
  return fetchAvailableWantListsDocument();
}

function injectedFetchAvailableWantListsFromCardmarket() {
  const textOf = (value) => String(value || '').trim().replace(/\s+/g, ' ');
  const extractWantListId = (href) => {
    const patterns = [
      /\/Wants\/(?:EditWantsList\/|Show\/)?(\d+)(?:[/?#]|$)/i,
      /[?&]idWantsList=(\d+)/i,
    ];
    for (const pattern of patterns) {
      const match = String(href || '').match(pattern);
      if (match) return match[1];
    }
    return '';
  };

  const pathParts = location.pathname.split('/').filter(Boolean);
  const lang = pathParts[0] || 'en';
  const game = pathParts[1] || 'Magic';
  const pageWantListId = extractWantListId(location.href);

  return fetch(`/${lang}/${game}/Wants`, { credentials: 'include' })
    .then(async (overviewResponse) => {
      if (!overviewResponse.ok) {
        throw new Error(`Could not load Cardmarket wants overview. HTTP ${overviewResponse.status}.`);
      }

      const overviewHtml = await overviewResponse.text();
      const overviewDoc = new DOMParser().parseFromString(overviewHtml, 'text/html');
      const results = [];
      const seenIds = new Set();

      overviewDoc.querySelectorAll('a[href], button[onclick], [data-url], [data-href], option[value], [data-id-wants-list], [data-wants-list-id]').forEach((node) => {
        const candidates = [
          node.getAttribute('href') || '',
          node.getAttribute('onclick') || '',
          node.getAttribute('data-url') || '',
          node.getAttribute('data-href') || '',
          node.getAttribute('value') || '',
          node.getAttribute('data-id-wants-list') || '',
          node.getAttribute('data-wants-list-id') || '',
        ];
        const id = candidates.map((value) => extractWantListId(value)).find(Boolean);
        if (!id || seenIds.has(id)) return;

        seenIds.add(id);
        const rawPath = candidates.find((value) => extractWantListId(value) === id) || '';
        results.push({
          id,
          name: extractWantListName(node, id),
          path: normalizeWantListPath(rawPath),
        });
      });

      if (!results.length) {
        const regex = /(?:\/Wants\/(?:EditWantsList\/|Show\/)?|[?&]idWantsList=)(\d+)/gi;
        let match;
        while ((match = regex.exec(overviewHtml)) !== null) {
          const id = match[1];
          if (!id || seenIds.has(id)) continue;
          seenIds.add(id);
          results.push({
            id,
            name: `Want list ${id}`,
            path: `/${lang}/${game}/Wants/${id}`,
          });
        }
      }

      if (pageWantListId && !seenIds.has(pageWantListId)) {
        results.unshift({
          id: pageWantListId,
          name: extractCurrentWantListName() || `Want list ${pageWantListId}`,
          path: normalizeWantListPath(location.href) || `/${lang}/${game}/Wants/${pageWantListId}`,
        });
      }

      if (!results.length) {
        console.warn('[Cardmarket Wants Optimizer] No want lists found in overview HTML sample:', overviewHtml.slice(0, 2000));
      }

      return {
        pageWantListId,
        wantLists: results,
      };
    });

  function extractWantListName(node, id) {
    const ownText = sanitizeWantListName(node.textContent, id);
    if (ownText && !new RegExp(`^${id}$`).test(ownText)) return ownText;

    const heading = node.closest('tr, li, article, .row, .item, .accordion-item, .panel, .card, .list-group-item')
      ?.querySelector('.card-title, h1, h2, h3, h4, strong, .fw-bold, .font-weight-bold');
    const headingText = sanitizeWantListName(heading?.textContent || '', id);
    if (headingText) return headingText;

    const container = node.closest('tr, li, article, .row, .item, .accordion-item, .panel, .card, .list-group-item');
    const containerText = sanitizeWantListName(container?.textContent || '', id);
    if (containerText) {
      const cleaned = containerText.split(id).join(' ').replace(/\s+/g, ' ').trim();
      if (cleaned) return cleaned.slice(0, 120);
    }

    const labelled = sanitizeWantListName(
      node.getAttribute('aria-label')
      || node.getAttribute('title')
      || node.getAttribute('data-bs-title')
      || node.getAttribute('data-original-title'),
      id
    );
    return labelled || `Want list ${id}`;
  }

  function sanitizeWantListName(value, id) {
    const normalizedId = String(id || '').trim();
    let cleaned = textOf(value);
    if (!cleaned) return '';
    cleaned = cleaned
      .replace(/\bView\s*\/??\s*Edit\s*List\b.*$/i, '')
      .replace(/\bView\b.*$/i, '')
      .replace(/\bEdit\s*List\b.*$/i, '')
      .replace(/\s+Wants\s*\(\d+\s*cards?\)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (normalizedId) {
      cleaned = cleaned.replace(new RegExp(`\\b${normalizedId}\\b`, 'g'), '').replace(/\s+/g, ' ').trim();
    }
    return cleaned;
  }

  function extractCurrentWantListName() {
    const candidates = [
      document.querySelector('h1'),
      document.querySelector('.page-title'),
      document.querySelector('.title-container h1, .title-container h2'),
      document.querySelector('[data-wants-list-name]'),
    ];
    const name = candidates.map((node) => textOf(node?.textContent || node?.getAttribute?.('data-wants-list-name') || '')).find(Boolean);
    return name || '';
  }

  function normalizeWantListPath(value) {
    if (!value) return '';

    try {
      const parsed = new URL(value, location.origin);
      if (parsed.origin !== location.origin) return '';
      if (!extractWantListId(parsed.href)) return '';
      parsed.hash = '';
      parsed.searchParams.delete('site');
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return '';
    }
  }
}

function extractVisibleWantItems({ previewLimit }) {
  return parseWantItemsFromDocument(document, location.href, { previewLimit });
}

async function injectedLoadWantListItemsById({ wantListId, wantListName, wantListPath, previewLimit }) {
  const textOf = (value) => String(value || '').trim().replace(/\s+/g, ' ');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const extractWantListId = (href) => {
    const patterns = [
      /\/Wants\/(?:EditWantsList\/|Show\/)?(\d+)(?:[/?#]|$)/i,
      /[?&]idWantsList=(\d+)/i,
    ];
    for (const pattern of patterns) {
      const match = String(href || '').match(pattern);
      if (match) return match[1];
    }
    return '';
  };
  const parseContext = (urlValue) => {
    const parsed = new URL(urlValue, location.origin);
    const pathParts = parsed.pathname.split('/').filter(Boolean);
    return {
      lang: pathParts[0] || 'en',
      game: pathParts[1] || 'Magic',
    };
  };
  const { lang, game } = parseContext(location.href);
  const normalizedWantListId = textOf(wantListId);
  if (!normalizedWantListId) {
    throw new Error('Missing want list id. Wait for auto-detection, then choose one again.');
  }

  const aggregatedItems = [];
  const seenKeys = new Set();
  let pagesScanned = 0;
  let parserSource = 'fetched-pages';
  let previousPageSignature = '';
  const normalizedWantListPath = normalizeWantListPathLocal(wantListPath);

  for (let page = 1; page <= 100; page += 1) {
    const urlCandidates = buildWantListPageCandidatesLocal({
      lang,
      game,
      normalizedWantListId,
      wantListPath: normalizedWantListPath,
      page,
    });

    let html = '';
    let responseUrl = '';
    for (const candidate of urlCandidates) {
      const response = await fetch(candidate, { credentials: 'include' });
      if (response.status === 429) {
        await sleep(10000);
        continue;
      }
      if (!response.ok) continue;

      const candidateHtml = await response.text();
      if (!/checkWantsRow|data-id-want|MobileWantsList|WantsListTable|want-name|item-body-wrapper|article-row|productInfo/i.test(candidateHtml)) continue;
      html = candidateHtml;
      responseUrl = candidate;
      break;
    }

    if (!html) break;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const parsed = parseWantItemsFromDocumentLocal(doc, `${location.origin}${responseUrl}`);
    const pageSignature = parsed.items.map((item) => buildWantListItemKeyLocal(item)).join('|');
    parserSource = parsed.debug.source || parserSource;
    if (!parsed.items.length || (page > 1 && pageSignature && pageSignature === previousPageSignature)) {
      break;
    }
    previousPageSignature = pageSignature;
    pagesScanned += 1;

    parsed.items.forEach((item) => {
      const key = buildWantListItemKeyLocal(item);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      aggregatedItems.push(item);
    });

    const hasNextPage = !!doc.querySelector(`a[href*="site=${page + 1}"], a[href$="/${page + 1}"], .pagination a[rel="next"]`);
    if (!hasNextPage) break;
  }

  return {
    kind: 'selected-want-list',
    wantListId: normalizedWantListId,
    wantListName: textOf(wantListName) || `Want list ${normalizedWantListId}`,
    totalVisible: aggregatedItems.length,
    pagesScanned,
    items: aggregatedItems,
    debug: {
      source: parserSource,
      parsedItems: aggregatedItems.length,
      previewLimit: previewLimit || 8,
    },
  };

  function buildWantListItemKeyLocal(item) {
    if (textOf(item?.idWant)) return `want-${textOf(item.idWant)}`;
    if (textOf(item?.idProduct)) return `product-${textOf(item.idProduct)}-${textOf(item?.quantity)}`;
    return `name-${textOf(item?.productName)}-${textOf(item?.quantity)}`;
  }

  function normalizeWantListPathLocal(value) {
    if (!value) return '';

    try {
      const parsed = new URL(value, location.origin);
      if (parsed.origin !== location.origin) return '';
      if (extractWantListId(parsed.href) !== normalizedWantListId) return '';
      parsed.hash = '';
      parsed.searchParams.delete('site');
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return '';
    }
  }

  function buildWantListPageCandidatesLocal({ lang, game, normalizedWantListId, wantListPath, page }) {
    const candidates = [];
    const seen = new Set();

    const addCandidate = (value) => {
      const normalized = textOf(value);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      candidates.push(normalized);
    };

    if (wantListPath) {
      try {
        const parsed = new URL(wantListPath, location.origin);
        parsed.hash = '';
        if (page <= 1) {
          parsed.searchParams.delete('site');
        } else {
          parsed.searchParams.set('site', String(page));
        }
        addCandidate(`${parsed.pathname}${parsed.search}`);
      } catch {
        addCandidate(wantListPath);
      }
    }

    addCandidate(`/${lang}/${game}/Wants/${normalizedWantListId}${page > 1 ? `?site=${page}` : ''}`);
    addCandidate(`/${lang}/${game}/Wants/${normalizedWantListId}/${page}`);
    addCandidate(`/${lang}/${game}/Wants/EditWantsList/${normalizedWantListId}${page > 1 ? `?site=${page}` : ''}`);
    addCandidate(`/${lang}/${game}/Wants/Show/${normalizedWantListId}${page > 1 ? `?site=${page}` : ''}`);
    addCandidate(`/${lang}/${game}/Wants?idWantsList=${normalizedWantListId}${page > 1 ? `&site=${page}` : ''}`);

    return candidates;
  }

  function parseWantItemsFromDocumentLocal(doc, href) {
    const wantListIdFromHref = extractWantListId(href);
    const languagePattern = /^(Deutsch|Englisch|Französisch|Italienisch|Spanisch|Portugiesisch|Japanisch|Koreanisch|Chinesisch|Russisch|S-Chinesisch|T-Chinesisch|English|German|French|Italian|Spanish|Portuguese|Japanese|Korean|Chinese|Russian)$/;
    const desktopRows = [...doc.querySelectorAll('#WantsListTable table.d-lg-table tbody tr')];
    const mobileRows = [...doc.querySelectorAll('#MobileWantsList .accordion-item')];
    const fallbackRows = collectCheckboxRows();
    const source = desktopRows.length
      ? 'desktop-table'
      : mobileRows.length
        ? 'mobile-accordion'
        : 'checkbox-walkup';
    const parsedItems = (
      desktopRows.length
        ? desktopRows.map(parseDesktopRow)
        : mobileRows.length
          ? mobileRows.map(parseMobileRow)
          : fallbackRows.map(parseGenericRow)
    )
      .filter((item) => item && (item.idWant || item.productName));

    return {
      wantListId: wantListIdFromHref,
      items: parsedItems,
      debug: {
        source,
        desktopRows: desktopRows.length,
        mobileRows: mobileRows.length,
        fallbackRows: fallbackRows.length,
        parsedItems: parsedItems.length,
      },
    };

    function collectCheckboxRows() {
      const checkboxes = [...doc.querySelectorAll('input[name="checkWantsRow[]"][data-id-want], input[name="mobileCheckWant"][data-id-want], input[data-id-want]')];
      const rowSet = new Set();
      const rows = [];

      checkboxes.forEach((checkbox) => {
        let container = checkbox.parentElement;
        let depth = 0;
        while (container && depth < 8) {
          const productLink = container.querySelector('a[href*="/Products/Singles/"], a[href*="/Products/"]');
          if (productLink) break;
          container = container.parentElement;
          depth += 1;
        }
        if (!container || rowSet.has(container)) return;
        rowSet.add(container);
        rows.push(container);
      });

      return rows;
    }

    function parseDesktopRow(row) {
      const checkbox = row.querySelector('input[name="checkWantsRow[]"][data-id-want], input[data-id-want]');
      const nameLink = row.querySelector('td.name a[href], a[href*="/Products/"]');
      const preview = row.querySelector('td.preview [data-bs-title], td.preview [data-bs-original-title], td.preview [title], [data-bs-title], [title]');
      const conditionBadge = row.querySelector('td.condition .article-condition .badge, td.condition .badge');
      const priceCell = row.querySelector('td.buyPrice');
      const quantityCell = row.querySelector('td.amount');
      const previewTitle = preview?.getAttribute('data-bs-title') || preview?.getAttribute('data-bs-original-title') || preview?.getAttribute('title') || '';
      const rowText = row.textContent || '';
      const rawHref = nameLink?.getAttribute('href') || '';
      const productUrl = normalizeProductUrl(rawHref);
      const productName = textOf(nameLink?.textContent)
        || decodeHtmlAttribute(previewTitle.match(/alt=&quot;([^&]+(?:&[^;]+;)*)&quot;/i)?.[1] || '')
        || textOf(row.querySelector('td.name')?.textContent);
      const productIdMatch = previewTitle.match(/product-images\.s3\.cardmarket\.com\/\d+\/[^/]+\/(\d+)\//i)
        || rawHref.match(/\/(\d+)(?:[/?#]|$)/);
      const priceMatch = textOf(priceCell?.textContent).match(/(\d{1,3}(?:[.,]\d{3})*[,.]\d{2})/);

      return {
        wantListId: wantListIdFromHref,
        idWant: checkbox?.getAttribute('data-id-want') || '',
        idProduct: productIdMatch?.[1] || '',
        productName,
        productUrl,
        quantity: textOf(quantityCell?.getAttribute('data-amount')) || textOf(quantityCell?.textContent) || '1',
        languages: extractSelectedLanguages(row),
        minCondition: extractSelectedCondition(row) || textOf(conditionBadge?.textContent),
        expansions: extractSelectedExpansions(row.querySelector('td.expansion')),
        maxPrice: priceMatch?.[1] || '',
        isFoil: extractDesktopTernaryPreference(row, 7, 'foil') ?? extractBooleanPreference(row, 'foil', /\bFoil\b/i, rowText),
        isReverseHolo: extractBooleanPreference(row, 'reverse', /Reverse\s*Holo/i, rowText),
      };
    }

    function parseMobileRow(row) {
      const checkbox = row.querySelector('input[name="mobileCheckWant"][data-id-want], input[data-id-want]');
      const nameNode = row.querySelector('.want-name');
      const nameLink = row.querySelector('.item-body-wrapper a[href*="/Cards/"], a[href*="/Products/"]');
      const preview = row.querySelector('[data-bs-title], [data-bs-original-title], [title]');
      const previewTitle = preview?.getAttribute('data-bs-title') || preview?.getAttribute('data-bs-original-title') || preview?.getAttribute('title') || '';
      const conditionBadge = row.querySelector('.article-condition .badge, .badge');
      const rawHref = nameLink?.getAttribute('href') || '';
      const productUrl = normalizeProductUrl(rawHref);
      const productIdMatch = previewTitle.match(/product-images\.s3\.cardmarket\.com\/\d+\/[^/]+\/(\d+)\//i)
        || rawHref.match(/\/(\d+)(?:[/?#]|$)/);
      const rowText = row.textContent || '';

      return {
        wantListId: wantListIdFromHref,
        idWant: checkbox?.getAttribute('data-id-want') || '',
        idProduct: productIdMatch?.[1] || '',
        productName: textOf(nameNode?.textContent) || textOf(nameLink?.textContent),
        productUrl,
        quantity: textOf(row.querySelector('.want-amount')?.textContent).replace(/\s+/g, '') || '1',
        languages: extractSelectedLanguages(row),
        minCondition: extractSelectedCondition(row) || textOf(conditionBadge?.textContent) || textOf(getMobileFieldValueNode(row, 'Min. Condition')?.textContent),
        expansions: extractSelectedExpansions(getMobileFieldValueNode(row, 'Expansion')),
        maxPrice: '',
        isFoil: extractMobileTernaryPreference(row, 'Foil?') ?? extractBooleanPreference(row, 'foil', /\bFoil\b/i, rowText),
        isReverseHolo: extractBooleanPreference(row, 'reverse', /Reverse\s*Holo/i, rowText),
      };
    }

    function parseGenericRow(row) {
      const checkbox = row.querySelector('input[data-id-want]');
      const nameLink = row.querySelector('a[href*="/Products/Singles/"], a[href*="/Products/"]');
      const preview = row.querySelector('[data-bs-title], [data-bs-original-title], [title]');
      const previewTitle = preview?.getAttribute('data-bs-title') || preview?.getAttribute('data-bs-original-title') || preview?.getAttribute('title') || '';
      const conditionBadge = row.querySelector('.article-condition .badge, .badge, [class*="condition"] .badge');
      const rawHref = nameLink?.getAttribute('href') || '';
      const productUrl = normalizeProductUrl(rawHref);
      const productIdMatch = previewTitle.match(/product-images\.s3\.cardmarket\.com\/\d+\/[^/]+\/(\d+)\//i)
        || rawHref.match(/\/(\d+)(?:[/?#]|$)/);
      const rowText = row.textContent || '';
      const productName = textOf(nameLink?.textContent)
        || decodeHtmlAttribute(previewTitle.match(/alt=&quot;([^&]+(?:&[^;]+;)*)&quot;/i)?.[1] || '')
        || textOf(row.querySelector('.want-name, .product-name, .name')?.textContent);
      const priceInput = row.querySelector('input[name*="rice"], input[name*="Price"]');
      const quantityInput = row.querySelector('input[name*="mount"], input[name*="uantity"], input[type="number"]');
      const priceMatch = textOf(priceInput?.value || rowText).match(/(\d{1,3}(?:[.,]\d{3})*[,.]\d{2})/);

      return {
        wantListId: wantListIdFromHref,
        idWant: checkbox?.getAttribute('data-id-want') || '',
        idProduct: productIdMatch?.[1] || '',
        productName,
        productUrl,
        quantity: textOf(quantityInput?.value || row.querySelector('.want-amount')?.textContent).replace(/\s+/g, '') || '1',
        languages: extractSelectedLanguages(row),
        minCondition: extractSelectedCondition(row) || textOf(conditionBadge?.textContent),
        expansions: extractSelectedExpansions(row),
        maxPrice: priceMatch?.[1] || '',
        isFoil: extractBooleanPreference(row, 'foil', /\bFoil\b/i, rowText),
        isReverseHolo: extractBooleanPreference(row, 'reverse', /Reverse\s*Holo/i, rowText),
      };
    }

    function normalizeProductUrl(rawHref) {
      if (!rawHref) return '';
      const absolute = rawHref.startsWith('http') ? rawHref : `https://www.cardmarket.com${rawHref}`;
      const url = new URL(absolute);
      url.search = '';
      url.hash = '';
      return url.toString();
    }

    function extractSelectedLanguages(container) {
      if (!container) return [];
      const optionLabels = extractSelectedOptionLabels(container, /language/i);
      const iconLabels = [...container.querySelectorAll('[aria-label], [data-bs-original-title], [data-original-title], [title]')]
        .map((node) => textOf(node.getAttribute('aria-label') || node.getAttribute('data-bs-original-title') || node.getAttribute('data-original-title') || node.getAttribute('title') || ''))
        .filter((label) => languagePattern.test(label));
      const hiddenLabels = [...container.querySelectorAll('.visually-hidden')]
        .map((node) => textOf(node.textContent))
        .filter((label) => languagePattern.test(label));
      return [...new Set([...optionLabels, ...iconLabels, ...hiddenLabels].filter(Boolean))];
    }

    function extractSelectedExpansions(container) {
      if (!container) return [];
      const labels = extractSelectedOptionLabels(container, /expansion|set/i);
      const tooltipLabels = [...container.querySelectorAll('[aria-label], [data-bs-original-title], [data-original-title], [title]')]
        .map((node) => textOf(node.getAttribute('aria-label') || node.getAttribute('data-bs-original-title') || node.getAttribute('data-original-title') || node.getAttribute('title') || ''));
      const hiddenLabels = [...container.querySelectorAll('.visually-hidden')]
        .map((node) => textOf(node.textContent));
      return [...new Set([...labels, ...tooltipLabels, ...hiddenLabels].filter((label) => label && !/^any$/i.test(label)))];
    }

    function extractSelectedCondition(container) {
      return extractSelectedOptionLabels(container, /condition/i)[0] || '';
    }

    function extractDesktopTernaryPreference(row, cellIndex, nameHint) {
      const cell = row.children?.[cellIndex];
      return extractRenderedTernaryPreference(cell, nameHint);
    }

    function extractMobileTernaryPreference(row, labelText) {
      const cell = getMobileFieldValueNode(row, labelText);
      return extractRenderedTernaryPreference(cell, labelText);
    }

    function extractRenderedTernaryPreference(container, nameHint) {
      if (!container) return null;
      const labeledNode = container.querySelector('[aria-label], [data-bs-original-title], [data-original-title], [title]');
      const value = [
        textOf(container.textContent),
        textOf(labeledNode?.getAttribute('aria-label') || labeledNode?.getAttribute('data-bs-original-title') || labeledNode?.getAttribute('data-original-title') || labeledNode?.getAttribute('title')),
      ].find((entry) => entry && !new RegExp(nameHint, 'i').test(entry)) || '';
      if (/^(y|yes|true)$/i.test(value)) return true;
      if (/^(n|no|false)$/i.test(value)) return false;
      if (/^any$/i.test(value) || value === '') return false;
      return null;
    }

    function getMobileFieldValueNode(row, labelText) {
      const term = [...row.querySelectorAll('dt')].find((node) => textOf(node.textContent) === labelText);
      return term?.nextElementSibling || null;
    }

    function extractSelectedOptionLabels(container, namePattern) {
      const labels = [];
      container.querySelectorAll('select').forEach((select) => {
        const name = select.getAttribute('name') || select.getAttribute('id') || '';
        if (!namePattern.test(name)) return;
        [...select.selectedOptions].forEach((option) => {
          const label = textOf(option.textContent);
          if (label) labels.push(label);
        });
      });
      container.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach((input) => {
        const name = input.getAttribute('name') || '';
        if (!namePattern.test(name) || !input.checked) return;
        const label = findInputLabel(container, input);
        if (label) labels.push(label);
      });
      return [...new Set(labels.filter(Boolean))];
    }

    function extractBooleanPreference(container, nameHint, textPattern, sourceText) {
      const inputs = [...container.querySelectorAll('input[type="checkbox"], input[type="radio"]')]
        .filter((input) => new RegExp(nameHint, 'i').test(input.getAttribute('name') || input.getAttribute('id') || ''));
      if (inputs.length) {
        const checked = inputs.find((input) => input.checked);
        if (checked) {
          const checkedValue = textOf(checked.value);
          if (/^(1|y|yes|true|foil)$/i.test(checkedValue)) return true;
          if (/^(0|n|no|false|any)$/i.test(checkedValue)) return false;
        }
      }
      return textPattern.test(sourceText);
    }

    function findInputLabel(container, input) {
      const id = input.getAttribute('id');
      if (id) {
        const label = container.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (label) return textOf(label.textContent);
      }
      return textOf(input.closest('label')?.textContent || input.parentElement?.querySelector('label')?.textContent);
    }

    function decodeHtmlAttribute(value) {
      if (!value) return '';
      const el = doc.createElement('textarea');
      el.innerHTML = value;
      return textOf(el.value);
    }
  }
}

async function loadWantListItemsById({ wantListId, previewLimit }) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const runtimeContext = parseCardmarketRequestContext(location.href) || {
    origin: 'https://www.cardmarket.com',
    lang: 'en',
    game: 'Magic',
  };
  const { lang, game } = runtimeContext;
  const available = await fetchAvailableWantListsDocument();
  const normalizedWantListId = textOf(wantListId);
  if (!normalizedWantListId) {
    throw new Error('Missing want list id. Wait for auto-detection, then choose one again.');
  }

  const selectedWantList = (available.wantLists || []).find((entry) => entry.id === normalizedWantListId);
  if (!selectedWantList) {
    throw new Error(`Want list ${normalizedWantListId} not found on Cardmarket overview. Wait for auto-detection and retry.`);
  }

  const aggregatedItems = [];
  const seenKeys = new Set();
  let pagesScanned = 0;
  let parserSource = 'fetched-pages';
  let previousPageSignature = '';
  const normalizedWantListPath = textOf(selectedWantList.path);

  for (let page = 1; page <= 100; page += 1) {
    const urlCandidates = buildWantListPageCandidates({
      lang,
      game,
      normalizedWantListId,
      wantListPath: normalizedWantListPath,
      page,
    });

    let html = '';
    let responseUrl = '';

    for (const candidate of urlCandidates) {
      const response = await fetch(candidate, { credentials: 'include' });
      if (response.status === 429) {
        await sleep(10000);
        continue;
      }
      if (!response.ok) continue;

      const text = await response.text();
      if (!/Wants|wantRow|checkWantsRow|MobileWantsList|WantsListTable/i.test(text)) {
        continue;
      }

      html = text;
      responseUrl = candidate;
      break;
    }

    if (!html) break;

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const parsed = parseWantItemsFromDocument(doc, `${location.origin}${responseUrl}`, { previewLimit });
    const pageSignature = parsed.items.map((item) => buildWantListItemKey(item)).join('|');
    parserSource = parsed.debug.source || parserSource;
    if (!parsed.items.length || (page > 1 && pageSignature && pageSignature === previousPageSignature)) {
      break;
    }
    previousPageSignature = pageSignature;
    pagesScanned += 1;

    parsed.items.forEach((item) => {
      const key = buildWantListItemKey(item);
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      aggregatedItems.push(item);
    });

    const hasNextPage = !!doc.querySelector(`a[href*="site=${page + 1}"], a[href$="/${page + 1}"], .pagination a[rel="next"]`);
    if (!hasNextPage) break;
  }

  return {
    kind: 'selected-want-list',
    wantListId: normalizedWantListId,
    wantListName: selectedWantList.name,
    totalVisible: aggregatedItems.length,
    pagesScanned,
    items: aggregatedItems,
    debug: {
      source: parserSource,
      parsedItems: aggregatedItems.length,
      previewLimit: previewLimit || 8,
    },
  };

  function buildWantListPageCandidates({ lang, game, normalizedWantListId, wantListPath, page }) {
    const candidates = [];
    const seen = new Set();

    const addCandidate = (value) => {
      const normalized = textOf(value);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      candidates.push(normalized);
    };

    if (wantListPath) {
      try {
        const parsed = new URL(wantListPath, location.origin);
        parsed.hash = '';
        if (page <= 1) {
          parsed.searchParams.delete('site');
        } else {
          parsed.searchParams.set('site', String(page));
        }
        addCandidate(`${parsed.pathname}${parsed.search}`);
      } catch {
        addCandidate(wantListPath);
      }
    }

    addCandidate(`/${lang}/${game}/Wants/${normalizedWantListId}${page > 1 ? `?site=${page}` : ''}`);
    addCandidate(`/${lang}/${game}/Wants/${normalizedWantListId}/${page}`);
    addCandidate(`/${lang}/${game}/Wants/EditWantsList/${normalizedWantListId}${page > 1 ? `?site=${page}` : ''}`);
    addCandidate(`/${lang}/${game}/Wants/Show/${normalizedWantListId}${page > 1 ? `?site=${page}` : ''}`);
    addCandidate(`/${lang}/${game}/Wants?idWantsList=${normalizedWantListId}${page > 1 ? `&site=${page}` : ''}`);

    return candidates;
  }
}

async function fetchAvailableWantListsDocument() {
  const runtimeContext = parseCardmarketRequestContext(location.href) || {
    origin: 'https://www.cardmarket.com',
    lang: 'en',
    game: 'Magic',
  };
  const { lang, game } = runtimeContext;
  const overviewResponse = await fetch(`/${lang}/${game}/Wants`, { credentials: 'include' });
  if (!overviewResponse.ok) {
    throw new Error(`Could not load Cardmarket wants overview. HTTP ${overviewResponse.status}.`);
  }

  const overviewHtml = await overviewResponse.text();
  const overviewDoc = new DOMParser().parseFromString(overviewHtml, 'text/html');
  const wantLists = [];
  const seenIds = new Set();
  const pageWantListId = extractWantListIdFromHref(location.href);

  overviewDoc.querySelectorAll('a[href], button[onclick], [data-url], [data-href], option[value], [data-id-wants-list], [data-wants-list-id]').forEach((node) => {
    const candidates = [
      node.getAttribute('href') || '',
      node.getAttribute('onclick') || '',
      node.getAttribute('data-url') || '',
      node.getAttribute('data-href') || '',
      node.getAttribute('value') || '',
      node.getAttribute('data-id-wants-list') || '',
      node.getAttribute('data-wants-list-id') || '',
    ];
    const id = candidates.map((value) => extractWantListIdFromHref(value)).find(Boolean);
    if (!id || seenIds.has(id)) return;
    seenIds.add(id);
    const rawPath = candidates.find((value) => extractWantListIdFromHref(value) === id) || '';
    wantLists.push({
      id,
      name: extractWantListName(node, id),
      path: normalizeWantListPath(rawPath),
    });
  });

  if (!wantLists.length) {
    const regex = /(?:\/Wants\/(?:EditWantsList\/|Show\/)?|[?&]idWantsList=)(\d+)/gi;
    let match;
    while ((match = regex.exec(overviewHtml)) !== null) {
      const id = match[1];
      if (!id || seenIds.has(id)) continue;
      seenIds.add(id);
      wantLists.push({
        id,
        name: `Want list ${id}`,
        path: `/${lang}/${game}/Wants/${id}`,
      });
    }
  }

  if (pageWantListId && !seenIds.has(pageWantListId)) {
    seenIds.add(pageWantListId);
    wantLists.unshift({
      id: pageWantListId,
      name: extractCurrentWantListName() || `Want list ${pageWantListId}`,
      path: normalizeWantListPath(location.href) || `/${lang}/${game}/Wants/${pageWantListId}`,
    });
  }

  return {
    pageWantListId,
    wantLists,
  };

  function extractWantListName(node, id) {
    const ownText = sanitizeWantListName(node.textContent, id);
    if (ownText && !new RegExp(`^${id}$`).test(ownText)) return ownText;

    const heading = node.closest('tr, li, article, .row, .item, .accordion-item, .panel, .card, .list-group-item')
      ?.querySelector('.card-title, h1, h2, h3, h4, strong, .fw-bold, .font-weight-bold');
    const headingText = sanitizeWantListName(heading?.textContent || '', id);
    if (headingText) return headingText;

    const container = node.closest('tr, li, article, .row, .item, .accordion-item, .panel, .card, .list-group-item');
    const containerText = sanitizeWantListName(container?.textContent || '', id);
    if (containerText) {
      const cleaned = containerText.split(id).join(' ').replace(/\s+/g, ' ').trim();
      if (cleaned) return cleaned.slice(0, 120);
    }

    const labelled = sanitizeWantListName(
      node.getAttribute('aria-label')
      || node.getAttribute('title')
      || node.getAttribute('data-bs-title')
      || node.getAttribute('data-original-title'),
      id
    );
    return labelled || `Want list ${id}`;
  }

  function sanitizeWantListName(value, id) {
    const normalizedId = String(id || '').trim();
    let cleaned = textOf(value);
    if (!cleaned) return '';
    cleaned = cleaned
      .replace(/\bView\s*\/??\s*Edit\s*List\b.*$/i, '')
      .replace(/\bView\b.*$/i, '')
      .replace(/\bEdit\s*List\b.*$/i, '')
      .replace(/\s+Wants\s*\(\d+\s*cards?\)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (normalizedId) {
      cleaned = cleaned.replace(new RegExp(`\\b${normalizedId}\\b`, 'g'), '').replace(/\s+/g, ' ').trim();
    }
    return cleaned;
  }

  function extractCurrentWantListName() {
    const heading = document.querySelector('h1, h2, .page-title, .headline');
    const text = textOf(heading?.textContent || '');
    return text && !/^wants$/i.test(text) ? text : '';
  }

  function extractWantListIdFromHref(href) {
    const patterns = [
      /\/Wants\/(?:EditWantsList\/|Show\/)?(\d+)(?:[/?#]|$)/i,
      /[?&]idWantsList=(\d+)/i,
      /(?:data-id-wants-list|data-wants-list-id)[^\d]*(\d+)/i,
    ];
    for (const pattern of patterns) {
      const match = String(href || '').match(pattern);
      if (match) return match[1];
    }
    return '';
  }

  function normalizeWantListPath(value) {
    if (!value) return '';

    try {
      const parsed = new URL(value, location.origin);
      if (parsed.origin !== location.origin) return '';
      if (!extractWantListIdFromHref(parsed.href)) return '';
      parsed.hash = '';
      parsed.searchParams.delete('site');
      return `${parsed.pathname}${parsed.search}`;
    } catch {
      return '';
    }
  }
}

function parseWantItemsFromDocument(doc, href, { previewLimit } = {}) {
  const wantListId = extractWantListId(href);
  const desktopRows = [...doc.querySelectorAll('#WantsListTable table.d-lg-table tbody tr')];
  const mobileRows = [...doc.querySelectorAll('#MobileWantsList .accordion-item')];
  const source = desktopRows.length ? 'desktop-table' : 'mobile-accordion';
  const parsedItems = (desktopRows.length ? desktopRows.map(parseDesktopRow) : mobileRows.map(parseMobileRow))
    .filter((item) => item && (item.idWant || item.productName));

  return {
    wantListId,
    totalVisible: parsedItems.length,
    items: parsedItems,
    debug: {
      source,
      desktopRows: desktopRows.length,
      mobileRows: mobileRows.length,
      parsedItems: parsedItems.length,
      previewLimit: previewLimit || 8,
    },
  };

  function parseDesktopRow(row) {
    const checkbox = row.querySelector('input[name="checkWantsRow[]"][data-id-want]');
    const nameLink = row.querySelector('td.name a[href]');
    const preview = row.querySelector('td.preview [data-bs-title], td.preview [data-bs-original-title], td.preview [title]');
    const conditionBadge = row.querySelector('td.condition .article-condition .badge, td.condition .badge');
    const priceCell = row.querySelector('td.buyPrice');
    const quantityCell = row.querySelector('td.amount');
    const previewTitle = preview?.getAttribute('data-bs-title') || preview?.getAttribute('data-bs-original-title') || preview?.getAttribute('title') || '';
    const text = row.textContent || '';
    const rawHref = nameLink?.getAttribute('href') || '';
    const productUrl = normalizeProductUrl(rawHref);
    const productName = textOf(nameLink?.textContent)
      || decodeHtmlAttribute(previewTitle.match(/alt=&quot;([^&]+(?:&[^;]+;)*)&quot;/i)?.[1] || '')
      || textOf(row.querySelector('td.name')?.textContent);
    const productIdMatch = previewTitle.match(/product-images\.s3\.cardmarket\.com\/\d+\/[^/]+\/(\d+)\//i);
    const priceMatch = textOf(priceCell?.textContent).match(/(\d{1,3}(?:[.,]\d{3})*[,.]\d{2})/);
    const selectedLanguages = extractSelectedLanguages(row);
    const selectedExpansions = extractSelectedExpansions(row.querySelector('td.expansion'));
    const selectedCondition = extractSelectedCondition(row) || textOf(conditionBadge?.textContent);
    const foilPreference = extractDesktopTernaryPreference(row, 7, 'foil') ?? extractBooleanPreference(row, 'foil', /\bFoil\b/i, text);
    const reverseHoloPreference = extractBooleanPreference(row, 'reverse', /Reverse\s*Holo/i, text);

    return {
      wantListId,
      idWant: checkbox?.getAttribute('data-id-want') || '',
      idProduct: productIdMatch?.[1] || '',
      productName,
      productUrl,
      quantity: textOf(quantityCell?.getAttribute('data-amount')) || textOf(quantityCell?.textContent) || '1',
      languages: selectedLanguages,
      minCondition: selectedCondition,
      expansions: selectedExpansions,
      maxPrice: priceMatch?.[1] || '',
      isFoil: foilPreference,
      isReverseHolo: reverseHoloPreference,
    };
  }

  function parseMobileRow(row) {
    const checkbox = row.querySelector('input[name="mobileCheckWant"][data-id-want], input[data-id-want]');
    const nameNode = row.querySelector('.want-name');
    const nameLink = row.querySelector('.item-body-wrapper a[href*="/Cards/"], a[href*="/Products/"]');
    const preview = row.querySelector('[data-bs-title], [data-bs-original-title], [title]');
    const previewTitle = preview?.getAttribute('data-bs-title') || preview?.getAttribute('data-bs-original-title') || preview?.getAttribute('title') || '';
    const conditionBadge = row.querySelector('.article-condition .badge, .badge');
    const rawHref = nameLink?.getAttribute('href') || '';
    const productUrl = normalizeProductUrl(rawHref);
    const productIdMatch = previewTitle.match(/product-images\.s3\.cardmarket\.com\/\d+\/[^/]+\/(\d+)\//i);
    const text = row.textContent || '';
    const selectedLanguages = extractSelectedLanguages(row);
    const selectedExpansions = extractSelectedExpansions(getMobileFieldValueNode(row, 'Expansion'));
    const selectedCondition = extractSelectedCondition(row) || textOf(conditionBadge?.textContent) || textOf(getMobileFieldValueNode(row, 'Min. Condition')?.textContent);
    const foilPreference = extractMobileTernaryPreference(row, 'Foil?') ?? extractBooleanPreference(row, 'foil', /\bFoil\b/i, text);
    const reverseHoloPreference = extractBooleanPreference(row, 'reverse', /Reverse\s*Holo/i, text);

    return {
      wantListId,
      idWant: checkbox?.getAttribute('data-id-want') || '',
      idProduct: productIdMatch?.[1] || '',
      productName: textOf(nameNode?.textContent) || textOf(nameLink?.textContent),
      productUrl,
      quantity: textOf(row.querySelector('.want-amount')?.textContent).replace(/\s+/g, '') || '1',
      languages: selectedLanguages,
      minCondition: selectedCondition,
      expansions: selectedExpansions,
      maxPrice: '',
      isFoil: foilPreference,
      isReverseHolo: reverseHoloPreference,
    };
  }

  function normalizeProductUrl(rawHref) {
    if (!rawHref) return '';
    const absolute = rawHref.startsWith('http') ? rawHref : `https://www.cardmarket.com${rawHref}`;
    const url = new URL(absolute);
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  function extractSelectedLanguages(container) {
    if (!container) return [];
    const optionLabels = extractSelectedOptionLabels(container, /language/i);
    const iconLabels = [...container.querySelectorAll('[aria-label], [data-bs-original-title], [data-original-title], [title]')]
      .map((node) => textOf(node.getAttribute('aria-label') || node.getAttribute('data-bs-original-title') || node.getAttribute('data-original-title') || node.getAttribute('title') || ''))
      .filter((label) => languagePattern.test(label));
    const hiddenLabels = [...container.querySelectorAll('.visually-hidden')]
      .map((node) => textOf(node.textContent))
      .filter((label) => languagePattern.test(label));
    return uniqueValues([...optionLabels, ...iconLabels, ...hiddenLabels]);
  }

  function extractSelectedExpansions(container) {
    if (!container) return [];
    const labels = extractSelectedOptionLabels(container, /expansion|set/i);
    const tooltipLabels = [...container.querySelectorAll('[aria-label], [data-bs-original-title], [data-original-title], [title]')]
      .map((node) => textOf(node.getAttribute('aria-label') || node.getAttribute('data-bs-original-title') || node.getAttribute('data-original-title') || node.getAttribute('title') || ''));
    const hiddenLabels = [...container.querySelectorAll('.visually-hidden')]
      .map((node) => textOf(node.textContent));
    return uniqueValues([...labels, ...tooltipLabels, ...hiddenLabels].filter((label) => label && !/^any$/i.test(label)));
  }

  function extractSelectedCondition(container) {
    return extractSelectedOptionLabels(container, /condition/i)[0] || '';
  }

  function extractDesktopTernaryPreference(row, cellIndex, nameHint) {
    const cell = row.children?.[cellIndex];
    return extractRenderedTernaryPreference(cell, nameHint);
  }

  function extractMobileTernaryPreference(row, labelText) {
    const cell = getMobileFieldValueNode(row, labelText);
    return extractRenderedTernaryPreference(cell, labelText);
  }

  function extractRenderedTernaryPreference(container, nameHint) {
    if (!container) return null;
    const labeledNode = container.querySelector('[aria-label], [data-bs-original-title], [data-original-title], [title]');
    const labelText = textOf(container.textContent);
    const iconLabel = textOf(labeledNode?.getAttribute('aria-label')
      || labeledNode?.getAttribute('data-bs-original-title')
      || labeledNode?.getAttribute('data-original-title')
      || labeledNode?.getAttribute('title'));
    const value = [labelText, iconLabel]
      .find((entry) => entry && !new RegExp(nameHint, 'i').test(entry)) || '';
    if (/^(y|yes|true)$/i.test(value)) return true;
    if (/^(n|no|false)$/i.test(value)) return false;
    if (/^any$/i.test(value) || value === '') return false;
    return null;
  }

  function getMobileFieldValueNode(row, labelText) {
    const terms = [...row.querySelectorAll('dt')];
    const term = terms.find((node) => textOf(node.textContent) === labelText);
    return term?.nextElementSibling || null;
  }

  function extractSelectedOptionLabels(container, namePattern) {
    const labels = [];
    container.querySelectorAll('select').forEach((select) => {
      const name = select.getAttribute('name') || select.getAttribute('id') || '';
      if (!namePattern.test(name)) return;
      [...select.selectedOptions].forEach((option) => {
        const label = textOf(option.textContent);
        if (label) labels.push(label);
      });
    });
    container.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach((input) => {
      const name = input.getAttribute('name') || '';
      if (!namePattern.test(name) || !input.checked) return;
      const label = findInputLabel(container, input);
      if (label) labels.push(label);
    });
    return uniqueValues(labels);
  }

  function extractBooleanPreference(container, nameHint, textPattern, text) {
    const inputs = [...container.querySelectorAll('input[type="checkbox"], input[type="radio"]')]
      .filter((input) => new RegExp(nameHint, 'i').test(input.getAttribute('name') || input.getAttribute('id') || ''));
    if (inputs.length) {
      const checked = inputs.find((input) => input.checked);
      if (checked) {
        const checkedValue = textOf(checked.value);
        if (/^(1|y|yes|true|foil)$/i.test(checkedValue)) return true;
        if (/^(0|n|no|false|any)$/i.test(checkedValue)) return false;
      }
    }
    return textPattern.test(text);
  }

  function findInputLabel(container, input) {
    const id = input.getAttribute('id');
    if (id) {
      const label = container.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label) return textOf(label.textContent);
    }
    const wrappedLabel = input.closest('label');
    if (wrappedLabel) return textOf(wrappedLabel.textContent);
    const siblingLabel = input.parentElement?.querySelector('label');
    return textOf(siblingLabel?.textContent);
  }

  function uniqueValues(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function decodeHtmlAttribute(value) {
    if (!value) return '';
    const el = doc.createElement('textarea');
    el.innerHTML = value;
    return textOf(el.value);
  }

  function extractWantListId(rawHref) {
    const patterns = [
      /\/Wants\/(?:EditWantsList\/|Show\/)?(\d+)(?:[/?#]|$)/i,
      /[?&]idWantsList=(\d+)/i,
    ];
    for (const pattern of patterns) {
      const match = String(rawHref || '').match(pattern);
      if (match) return match[1];
    }
    return '';
  }
}

function buildWantListItemKey(item) {
  if (textOf(item?.idWant)) return `want-${textOf(item.idWant)}`;
  if (textOf(item?.idProduct)) return `product-${textOf(item.idProduct)}-${textOf(item?.quantity)}`;
  return `name-${textOf(item?.productName)}-${textOf(item?.quantity)}`;
}

async function scrapeSingleWantItemSellers({ item, delay, previewLimit, requestFilters = {}, maxSellerPages = 20, maxFetchAttempts = 4, jitterRatio, requestContext }) {
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
  const MAX_SELLER_PAGES = Math.max(1, Math.min(20, parseInt(maxSellerPages, 10) || 20));
  const runtimeContext = requestContext || parseCardmarketRequestContext(item?.productUrl) || {
    origin: 'https://www.cardmarket.com',
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
      rowEls.forEach((el) => {
        const seller = parseSellerRow(el);
        if (seller.buyBlocked) return;
        if (!seller.articleId || seen.has(seller.articleId)) return;
        seen.add(seller.articleId);
        sellers.push(seller);
        addedThisPage += 1;
      });

      pagesFetched += 1;
      pageResolved = true;
      if (!addedThisPage) {
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
    const candidates = [];
    if (item.productUrl) {
      const productUrl = appendSellerRequestFilters(item.productUrl, requestFilters);
      candidates.push({ url: productUrl, currentRequest: { url: productUrl, method: 'GET' }, label: 'productUrl' });
    }
    candidates.push({
      url: appendSellerRequestFilters(`${marketPath}?${new URLSearchParams({ idProduct: String(item.idProduct), sortBy: 'name_asc' }).toString()}`, requestFilters),
      currentRequest: { url: appendSellerRequestFilters(`${marketPath}?${new URLSearchParams({ idProduct: String(item.idProduct), sortBy: 'name_asc' }).toString()}`, requestFilters), method: 'GET' },
      label: 'stockOffersByProductId',
    });
    return candidates;
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

  function appendSellerRequestFilters(urlValue, activeFilters) {
    const url = new URL(urlValue, origin);
    if (activeFilters.languageId) {
      url.searchParams.set('language', activeFilters.languageId);
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