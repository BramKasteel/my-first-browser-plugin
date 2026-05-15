const extractItemsButton = document.getElementById('extractItems');
const scrapeAllItemsButton = document.getElementById('scrapeAllItems');
const probeRateLimitsButton = document.getElementById('probeRateLimits');
const sellerDelayInput = document.getElementById('sellerDelayMs');
const probeRequestCountInput = document.getElementById('probeRequestCount');
const probePageBudgetInput = document.getElementById('probePageBudget');
const sellerReputationFilterEl = document.getElementById('sellerReputationFilter');
const sellerDeliveryTimeFilterEl = document.getElementById('sellerDeliveryTimeFilter');
const sellerTypeFilterEl = document.getElementById('sellerTypeFilter');
const sellerLocationFilterListEl = document.getElementById('sellerLocationFilterList');
const selectedSellerCountriesEl = document.getElementById('selectedSellerCountries');
const copyPayloadButton = document.getElementById('copyPayload');
const copyFrontendPayloadButton = document.getElementById('copyFrontendPayload');
const wantListPreviewEl = document.getElementById('wantListPreview');
const wantListWarningEl = document.getElementById('wantListWarning');
const summaryEl = document.getElementById('summary');
const itemsEl = document.getElementById('items');
const sellerItemsEl = document.getElementById('sellerItems');
const payloadViewEl = document.getElementById('payloadView');
const frontendPayloadViewEl = document.getElementById('frontendPayloadView');
const statusLogEl = document.getElementById('statusLog');
const runStatusEl = document.getElementById('runStatus');
const runStatusTextEl = document.getElementById('runStatusText');
const activityBadgeEl = document.getElementById('activityBadge');
const activityTabButton = document.getElementById('resultTabActivity');
const resultTabButtons = [...document.querySelectorAll('[data-result-tab]')];
const resultPanels = [...document.querySelectorAll('[data-result-panel]')];

const urlParams = new URLSearchParams(window.location.search);
const isDetached = urlParams.get('detached') === '1';
const autoStartMode = urlParams.get('autoStart') || '';
const keepPopupMode = urlParams.get('popup') === '1';
const forcedTabId = urlParams.get('tabId') ? parseInt(urlParams.get('tabId'), 10) : null;

let latestExtractPayload = null;
let latestFrontendPayload = null;
let latestExtractedItems = [];
let isRunActive = false;
let isUiBusy = false;
let selectedSellerCountries = [];

const SELLER_SETTINGS_KEY = 'sellerScrapeSettings';
const DETACHED_BATCH_STATE_KEY = 'detachedBatchState';
const SELLER_COOLDOWN_MS = 10 * 60 * 1000;
const MIN_SELLER_DELAY_MS = 250;
const REQUEST_JITTER_RATIO = 0.15;
const RATE_PROBE_DELAYS_MS = [1500, 1000, 750, 500, 350, 300, 250, 200];
const DEFAULT_SELLER_COUNTRIES = ['Germany', 'Netherlands'];
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

function syncSellerScrapeButton(isBusy = false) {
  const hasItems = hasLoadedWantItems();
  scrapeAllItemsButton.disabled = isBusy || !hasItems;
  scrapeAllItemsButton.classList.toggle('is-busy', isBusy);
  scrapeAllItemsButton.classList.toggle('secondary', !hasItems);
}

function setBusy(isBusy) {
  isUiBusy = isBusy;
  extractItemsButton.disabled = isBusy;
  extractItemsButton.classList.toggle('is-busy', isBusy);
  probeRateLimitsButton.disabled = isBusy;
  probeRateLimitsButton.classList.toggle('is-busy', isBusy);
  sellerDelayInput.disabled = isBusy;
  probeRequestCountInput.disabled = isBusy;
  probePageBudgetInput.disabled = isBusy;
  sellerReputationFilterEl.disabled = isBusy;
  sellerDeliveryTimeFilterEl.disabled = isBusy;
  sellerTypeFilterEl.disabled = isBusy;
  sellerLocationFilterListEl.querySelectorAll('input').forEach((input) => {
    input.disabled = isBusy;
  });
  selectedSellerCountriesEl.querySelectorAll('button').forEach((button) => {
    button.disabled = isBusy;
  });
  copyPayloadButton.disabled = isBusy;
  copyPayloadButton.classList.toggle('is-busy', isBusy);
  copyFrontendPayloadButton.disabled = isBusy;
  copyFrontendPayloadButton.classList.toggle('is-busy', isBusy);
  syncSellerScrapeButton(isBusy);
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

function clampProbeRuns(value) {
  return Math.min(8, Math.max(1, parseInt(value, 10) || 3));
}

function clampProbePageBudget(value) {
  return Math.min(3, Math.max(1, parseInt(value, 10) || 2));
}

function roundProbeRecommendation(delayMs) {
  return Math.max(MIN_SELLER_DELAY_MS, Math.ceil((delayMs * 1.25) / 50) * 50);
}

function sanitizeSellerDelay(value) {
  return Math.max(MIN_SELLER_DELAY_MS, parseInt(value, 10) || 2000);
}

function applyJitter(baseMs, jitterRatio = REQUEST_JITTER_RATIO) {
  const safeBase = Math.max(0, parseInt(baseMs, 10) || 0);
  if (!safeBase || jitterRatio <= 0) return safeBase;
  const spread = safeBase * jitterRatio;
  const jittered = safeBase + ((Math.random() * 2) - 1) * spread;
  return Math.max(0, Math.round(jittered));
}

async function getStorageArea() {
  return chrome.storage.session || chrome.storage.local;
}

async function loadSellerSettings() {
  const storageArea = await getStorageArea();
  const stored = await storageArea.get(SELLER_SETTINGS_KEY);
  const settings = stored[SELLER_SETTINGS_KEY] || {};
  sellerDelayInput.value = String(sanitizeSellerDelay(settings.delayMs));
  probeRequestCountInput.value = String(clampProbeRuns(settings.probeRuns));
  probePageBudgetInput.value = String(clampProbePageBudget(settings.probePages));
  sellerReputationFilterEl.value = normalizeSellerReputation(settings.sellerReputationFilter);
  sellerDeliveryTimeFilterEl.value = normalizeMaxShippingTime(settings.sellerDeliveryTimeFilter);
  sellerTypeFilterEl.value = normalizeSellerType(settings.sellerTypeFilter);
  const selectedCountries = getStoredSellerCountries(settings);
  setSelectedSellerCountries(selectedCountries.length ? selectedCountries : DEFAULT_SELLER_COUNTRIES);
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
      delayMs: sanitizeSellerDelay(sellerDelayInput.value),
      probeRuns: clampProbeRuns(probeRequestCountInput.value),
      probePages: clampProbePageBudget(probePageBudgetInput.value),
      sellerReputationFilter: normalizeSellerReputation(sellerReputationFilterEl.value),
      sellerDeliveryTimeFilter: normalizeMaxShippingTime(sellerDeliveryTimeFilterEl.value),
      sellerTypeFilter: normalizeSellerType(sellerTypeFilterEl.value),
      sellerLocationFilter: getSelectedSellerCountries(),
    },
  });
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
  const normalizedSelectedCountries = [...new Set((selectedCountries || [])
    .map((value) => normalizeCountryName(value))
    .filter(Boolean))];
  selectedSellerCountries = normalizedSelectedCountries;

  selectedSellerCountriesEl.replaceChildren();
  sellerLocationFilterListEl.replaceChildren();
  const selected = new Set(normalizedSelectedCountries);

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
    input.disabled = isUiBusy;

    const text = document.createElement('span');
    text.textContent = country;

    option.append(input, text);
    sellerLocationFilterListEl.appendChild(option);
  });
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
        condition: normalizeCardCondition(sellerRow?.condition) || textOf(sellerRow?.condition) || null,
        language: textOf(sellerRow?.language) || null,
      });
    });
  });

  if (!offers.length || !itemsById.size || !sellersById.size) {
    return null;
  }

  return {
    buyer_country: inferBuyerCountry(),
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
  latestExtractPayload = payload;
  payloadViewEl.textContent = payload ? JSON.stringify(payload, null, 2) : 'No optimizer payload yet.';
  copyPayloadButton.disabled = !payload;
}

function renderFrontendPayload(payload) {
  latestFrontendPayload = payload;
  frontendPayloadViewEl.textContent = payload ? JSON.stringify(payload, null, 2) : 'No frontend dump yet.';
  copyFrontendPayloadButton.disabled = !payload;
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
  if (isDetached || keepPopupMode) return;

  try {
    appendStatus('Opening dedicated plugin window by default so long scrapes keep running.', 'good');
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

async function refreshWantListWarning() {
  try {
    const tab = await getTargetTab();
    if (!tab?.url) {
      renderWantListWarning('Open Cardmarket want-list detail page like https://www.cardmarket.com/en/Magic/Wants/1234567 first.');
      return;
    }

    if (!/https:\/\/www\.cardmarket\.com\//.test(tab.url)) {
      renderWantListWarning('Current tab not Cardmarket. Open want-list detail page like https://www.cardmarket.com/en/Magic/Wants/1234567 first.');
      return;
    }

    const pageKind = wantsPageKind(new URL(tab.url).pathname || '');
    if (pageKind !== 'wants-detail') {
      renderWantListWarning('This extension works on a specific Cardmarket want list page. Please open a URL like https://www.cardmarket.com/en/Magic/Wants/1234567 and then try again.');
      return;
    }

    renderWantListWarning('');
  } catch {
    renderWantListWarning('Could not inspect current tab. Open Cardmarket want-list detail page and retry.');
  }
}

async function handleExtractItems() {
  startRun('Extracting visible want items from current Cardmarket page...');
  setBusy(true);
  try {
    const tab = await ensureCardmarketTab();
    const page = await executeInTab(tab.id, detectCurrentPage);
    if (!page.supported) {
      throw new Error('Open a Cardmarket want-list detail page before extracting items.');
    }

    const result = await executeInTab(tab.id, extractVisibleWantItems, [{ previewLimit: 8 }]);
    renderSummary([
      { label: 'Active page', value: page.pageKind, tone: 'good' },
      { label: 'Want list id', value: result.wantListId || page.wantListId || '-' },
      { label: 'Visible items', value: String(result.totalVisible), tone: result.totalVisible ? 'good' : 'bad' },
      { label: 'Preview returned', value: String(Math.min(result.items.length, 8)) },
      { label: 'Extractor source', value: result.debug.source || '-' },
      { label: 'Desktop rows seen', value: String(result.debug.desktopRows || 0) },
    ]);
    latestExtractedItems = result.items;
    syncSellerScrapeButton();
    renderItems(result.items.slice(0, 8), result.totalVisible);
    renderSellers([], 0, result.items[0]?.productName || 'the first item');
    renderFrontendPayload(result);
    renderPayload(null);
    setActiveResultTab('overview');
    appendStatus(`Extracted ${result.totalVisible} visible want items from the current page.`, result.totalVisible ? 'good' : 'bad');
    finishRun(`Extracted ${result.totalVisible} visible want items.`, result.totalVisible ? 'good' : 'bad');
  } catch (error) {
    latestExtractedItems = [];
    syncSellerScrapeButton();
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
    appendStatus('Starting serial seller scrape for all extracted want items...', 'good');
    if (!latestExtractedItems.length) {
      throw new Error('Extract want items first so the popup has products to scrape.');
    }

    const tab = await ensureCardmarketTab();
    const delayMs = sanitizeSellerDelay(sellerDelayInput.value);
    await ensureSellerScrapeNotCoolingDown();

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
        skippedCount += 1;
        aggregateResults.push({
          item,
          skipped: true,
          error: 'Missing idProduct on extracted want item.',
        });
        appendStatus(`Skipping item ${index + 1}/${latestExtractedItems.length}: ${itemLabel} has no idProduct.`, 'bad');
        continue;
      }

      appendStatus(`Scraping item ${index + 1}/${latestExtractedItems.length}: ${itemLabel}.`);

      let scrapeOutcome = null;
      try {
        scrapeOutcome = await scrapeWantItemSellerData({
          tab,
          item,
          delayMs,
          logPartitionRetry: false,
        });
      } catch (error) {
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
      const completionMessage = `Batch scrape completed for ${successCount} extracted item${successCount === 1 ? '' : 's'}.`;
      appendStatus(completionMessage, successCount ? 'good' : 'bad');
      finishRun(completionMessage, successCount ? 'good' : 'bad');
    }
  } catch (error) {
    appendStatus(error.message, 'bad');
    finishRun(error.message, 'bad');
  } finally {
    setBusy(false);
  }
}

async function handleProbeRateLimits() {
  startRun('Running safe rate probe for first extracted want item...');
  setBusy(true);
  try {
    appendStatus('Starting safe rate probe for the first extracted item. Serial requests only; the probe will stop on the first warning.', 'good');
    if (!latestExtractedItems.length) {
      throw new Error('Extract want items first so the popup has a product to probe.');
    }

    const firstItem = latestExtractedItems[0];
    if (!firstItem.idProduct) {
      throw new Error('The first extracted item has no idProduct, so probing cannot start yet.');
    }

    const tab = await ensureCardmarketTab();
    const cooldownUntil = await getSellerCooldownUntil();
    if (cooldownUntil > Date.now()) {
      throw new Error(`Seller scraping is paused after rate limiting. Try again in ${formatRemaining(cooldownUntil - Date.now())}.`);
    }

    const probeRuns = clampProbeRuns(probeRequestCountInput.value);
    const probePages = clampProbePageBudget(probePageBudgetInput.value);
    const requestLanguageId = getCardmarketLanguageId(getSingleItemLanguage(firstItem));
    const requestCountryIds = getCardmarketCountryIdsFromCountries(getSelectedSellerCountries());
    const requestFilters = {
      languageId: requestLanguageId,
      sellerCountryIds: requestCountryIds,
      sellerReputationId: getCardmarketSellerReputationId(sellerReputationFilterEl.value),
      maxShippingTimeId: getCardmarketMaxShippingTimeId(sellerDeliveryTimeFilterEl.value),
      sellerTypeId: getCardmarketSellerTypeId(sellerTypeFilterEl.value),
    };

    const stageResults = [];
    let lastSafeDelay = null;
    let firstWarning = null;

    for (const delayMs of RATE_PROBE_DELAYS_MS) {
      appendStatus(`Probe stage ${delayMs} ms: running ${probeRuns} sample${probeRuns === 1 ? '' : 's'} with page budget ${probePages} and ${Math.round(REQUEST_JITTER_RATIO * 100)}% jitter.`);
      const stage = {
        delayMs,
        runsRequested: probeRuns,
        runsCompleted: 0,
        pagesFetched: 0,
        totalSellers: 0,
        warnings: [],
        statuses: [],
      };

      for (let runIndex = 0; runIndex < probeRuns; runIndex += 1) {
        const result = await executeInTab(tab.id, scrapeSingleWantItemSellers, [{
          item: firstItem,
          delay: delayMs,
          previewLimit: 0,
          requestFilters,
          maxSellerPages: probePages,
          maxFetchAttempts: 1,
          jitterRatio: REQUEST_JITTER_RATIO,
        }]);

        if (!result) {
          stage.warnings.push('No result returned from the Cardmarket tab.');
          stage.statuses.push('no-result');
          break;
        }

        stage.runsCompleted += 1;
        stage.pagesFetched += result.pagesFetched || 0;
        stage.totalSellers += result.totalSellers || 0;

        if (result.error) {
          stage.warnings.push(result.error);
          stage.statuses.push(result.rateLimited ? 'rate-limited' : 'error');
        } else if (result.rateLimited) {
          stage.warnings.push('Cardmarket signalled rate limiting during the probe.');
          stage.statuses.push('rate-limited');
        } else if ((result.pagesFetched || 0) === 0 || (result.totalSellers || 0) === 0) {
          stage.warnings.push('Probe returned no seller rows. Treating that as a warning signal.');
          stage.statuses.push('empty');
        } else {
          stage.statuses.push('ok');
        }

        if (stage.warnings.length) {
          if (result.rateLimited) {
            await setSellerCooldownUntil(Date.now() + SELLER_COOLDOWN_MS);
          }
          break;
        }

        if (runIndex < probeRuns - 1) {
          await sleep(applyJitter(delayMs));
        }
      }

      stageResults.push(stage);
      if (stage.warnings.length) {
        firstWarning = { delayMs, message: stage.warnings[0] };
        appendStatus(`Probe stopped at ${delayMs} ms: ${stage.warnings[0]}`, 'bad');
        break;
      }

      lastSafeDelay = delayMs;
      appendStatus(`Probe stage ${delayMs} ms completed without warnings across ${stage.runsCompleted} runs.`, 'good');
      await sleep(2000);
    }

    const recommendedDelay = roundProbeRecommendation(lastSafeDelay || RATE_PROBE_DELAYS_MS[0]);
    sellerDelayInput.value = String(recommendedDelay);
    await saveSellerSettings();

    renderSummary([
      { label: 'Probe item', value: firstItem.productName || firstItem.idProduct, tone: 'good' },
      { label: 'Stages tested', value: stageResults.map((stage) => `${stage.delayMs}ms`).join(' -> ') || '-' },
      { label: 'Safe floor', value: lastSafeDelay ? `${lastSafeDelay} ms` : 'none confirmed', tone: lastSafeDelay ? 'good' : 'bad' },
      { label: 'First warning', value: firstWarning ? `${firstWarning.delayMs} ms | ${firstWarning.message}` : 'none observed' },
      { label: 'Recommended delay', value: `${recommendedDelay} ms`, tone: 'good' },
      { label: 'Jitter', value: `${Math.round(REQUEST_JITTER_RATIO * 100)}% per request` },
      { label: 'Probe budget', value: `${probeRuns} runs x ${probePages} page${probePages === 1 ? '' : 's'}` },
    ]);

    renderFrontendPayload({
      kind: 'seller-rate-probe',
      item: {
        idProduct: firstItem.idProduct,
        productName: firstItem.productName || '',
      },
      requestFilters,
      probeRuns,
      probePages,
      stages: stageResults,
      safeFloorDelayMs: lastSafeDelay,
      firstWarning,
      recommendedDelayMs: recommendedDelay,
      jitterRatio: REQUEST_JITTER_RATIO,
      testedAt: new Date().toISOString(),
    });
    renderPayload(null);
    setActiveResultTab('overview');

    if (lastSafeDelay) {
      appendStatus(`Seller delay updated to ${recommendedDelay} ms based on the last clean probe stage.`, 'good');
      finishRun(`Rate probe finished. Recommended seller delay: ${recommendedDelay} ms.`, 'good');
    } else {
      appendStatus(`No clean probe stage completed. Seller delay was reset to ${recommendedDelay} ms as a conservative fallback.`, 'bad');
      finishRun(`Rate probe finished with warnings. Fallback delay: ${recommendedDelay} ms.`, 'bad');
    }
  } catch (error) {
    appendStatus(error.message, 'bad');
    finishRun(error.message, 'bad');
  } finally {
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
  tabId,
  item,
  delayMs,
  previewLimit,
  requestLanguageId,
  sellerCountryIds,
  sellerReputationId,
  maxShippingTimeId,
  sellerTypeId,
  partitionLabel,
  logPowerSellerFallback,
}) {
  const requestFilters = {
    languageId: requestLanguageId,
    sellerCountryIds,
    sellerReputationId,
    maxShippingTimeId,
    sellerTypeId,
  };
  appendStatus(`Querying seller scope: ${describeSellerScope({ sellerCountryIds, sellerTypeId })}.`);
  let scopeResult = await executeInTab(tabId, scrapeSingleWantItemSellers, [{
    item,
    delay: delayMs,
    previewLimit,
    requestFilters,
  }]);
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
    const powerSellerResult = await executeInTab(tabId, scrapeSingleWantItemSellers, [{
      item,
      delay: delayMs,
      previewLimit,
      requestFilters: {
        ...requestFilters,
        sellerTypeId: powerSellerTypeId,
      },
    }]);
    if (powerSellerResult) {
      powerSellerResult.powerSellerFallbackApplied = true;
      scopeResult = powerSellerResult;
    }
  }

  return scopeResult;
}

async function scrapeWantItemSellerData({ tab, item, delayMs, logPartitionRetry }) {
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
        tabId: tab.id,
        item,
        delayMs,
        previewLimit: 12,
        requestLanguageId,
        sellerCountryIds: [scope.countryId],
        sellerReputationId,
        maxShippingTimeId,
        sellerTypeId,
        partitionLabel: scopeLabel,
        logPowerSellerFallback: logPartitionRetry,
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
    const baseResult = await executeInTab(tab.id, scrapeSingleWantItemSellers, [{
      item,
      delay: delayMs,
      previewLimit: 12,
      requestFilters: baseRequestFilters,
    }]);
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
          tabId: tab.id,
          item,
          delayMs,
          previewLimit: 12,
          requestLanguageId,
          sellerCountryIds: [scope.countryId],
          sellerReputationId,
          maxShippingTimeId,
          sellerTypeId,
          partitionLabel: scopeLabel,
          logPowerSellerFallback: logPartitionRetry,
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

async function handleCopyPayload() {
  if (!latestExtractPayload) {
    appendStatus('No optimizer payload available to copy yet.', 'bad');
    return;
  }

  try {
    await navigator.clipboard.writeText(JSON.stringify(latestExtractPayload, null, 2));
    appendStatus('Copied optimizer payload JSON to clipboard.', 'good');
  } catch (error) {
    appendStatus(`Clipboard copy failed: ${error.message}`, 'bad');
  }
}

async function handleCopyFrontendPayload() {
  if (!latestFrontendPayload) {
    appendStatus('No frontend dump available to copy yet.', 'bad');
    return;
  }

  try {
    await navigator.clipboard.writeText(JSON.stringify(latestFrontendPayload, null, 2));
    appendStatus('Copied frontend dump JSON to clipboard.', 'good');
  } catch (error) {
    appendStatus(`Clipboard copy failed: ${error.message}`, 'bad');
  }
}

extractItemsButton.addEventListener('click', handleExtractItems);
scrapeAllItemsButton.addEventListener('click', handleScrapeAllItems);
probeRateLimitsButton.addEventListener('click', handleProbeRateLimits);
copyPayloadButton.addEventListener('click', handleCopyPayload);
copyFrontendPayloadButton.addEventListener('click', handleCopyFrontendPayload);
resultTabButtons.forEach((button) => {
  button.addEventListener('click', () => {
    setActiveResultTab(button.dataset.resultTab || 'overview');
  });
});
sellerDelayInput.addEventListener('change', saveSellerSettings);
probeRequestCountInput.addEventListener('change', saveSellerSettings);
probePageBudgetInput.addEventListener('change', saveSellerSettings);
sellerReputationFilterEl.addEventListener('change', saveSellerSettings);
sellerDeliveryTimeFilterEl.addEventListener('change', saveSellerSettings);
sellerTypeFilterEl.addEventListener('change', saveSellerSettings);
sellerLocationFilterListEl.addEventListener('change', (event) => {
  if (event.target instanceof HTMLInputElement && event.target.name === 'sellerCountryFilter') {
    const country = normalizeCountryName(event.target.value);
    if (event.target.checked && country && !selectedSellerCountries.includes(country)) {
      setSelectedSellerCountries([...selectedSellerCountries, country]);
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
  refreshWantListWarning().catch(() => {
    renderWantListWarning('Could not inspect current tab. Open Cardmarket want-list detail page and retry.');
  });
});

renderSummary([
  { label: 'Status', value: 'Ready for page detection' },
  { label: 'Current scope', value: 'Want-list detail page only' },
]);
finishRun('Idle. Start extract, scrape, or probe.');
renderItems([], 0);
renderSellers([], 0);
renderPayload(null);
renderFrontendPayload(null);
renderSellerCountryFilterList();
syncSellerScrapeButton();
scrapeAllItemsButton.textContent = 'Scrape sellers';
appendStatus(isDetached
  ? 'Batch scrape workspace loaded. It stays open while you click back into Cardmarket.'
  : 'Popup loaded. Extension opens batch scrape workspace by default for long runs.');

Promise.allSettled([
  loadSellerSettings(),
  refreshWantListWarning(),
]).then((results) => {
  if (results[0].status === 'rejected') {
    appendStatus('Could not load saved seller scrape settings. Using safe defaults.', 'bad');
  }

  if (isDetached && autoStartMode === 'scrapeAll') {
    loadDetachedBatchState().then((items) => {
      latestExtractedItems = items;
      syncSellerScrapeButton();
      if (!latestExtractedItems.length) {
        appendStatus('Batch scrape workspace could not auto-start because no extracted items were passed from popup.', 'bad');
        return;
      }

      renderItems(latestExtractedItems.slice(0, 8), latestExtractedItems.length);
      renderSellers([], 0, latestExtractedItems[0]?.productName || 'the first item');
      handleScrapeAllItems().catch((error) => {
        appendStatus(error.message, 'bad');
      });
    }).catch(() => {
      appendStatus('Batch scrape workspace could not load extracted items for auto-start.', 'bad');
    });
  }

  if (!isDetached && !keepPopupMode) {
    autoDetachDefaultPopup();
  }
});

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

function extractVisibleWantItems({ previewLimit }) {
  const textOf = (value) => String(value || '').trim().replace(/\s+/g, ' ');
  const wantListId = extractWantListId(location.href);
  const languagePattern = /^(Deutsch|Englisch|Französisch|Italienisch|Spanisch|Portugiesisch|Japanisch|Koreanisch|Chinesisch|Russisch|S-Chinesisch|T-Chinesisch|English|German|French|Italian|Spanish|Portuguese|Japanese|Korean|Chinese|Russian)$/;
  const desktopRows = [...document.querySelectorAll('#WantsListTable table.d-lg-table tbody tr')];
  const mobileRows = [...document.querySelectorAll('#MobileWantsList .accordion-item')];
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
    const href = nameLink?.getAttribute('href') || '';
    const productUrl = normalizeProductUrl(href);

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
    const checkbox = row.querySelector('input[name="mobileCheckWant"][data-id-want]');
    const nameNode = row.querySelector('.want-name');
    const nameLink = row.querySelector('.item-body-wrapper a[href*="/Cards/"]');
    const preview = row.querySelector('[data-bs-title], [data-bs-original-title], [title]');
    const previewTitle = preview?.getAttribute('data-bs-title') || preview?.getAttribute('data-bs-original-title') || preview?.getAttribute('title') || '';
    const conditionBadge = row.querySelector('.article-condition .badge, .badge');
    const href = nameLink?.getAttribute('href') || '';
    const productUrl = normalizeProductUrl(href);
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

  function normalizeProductUrl(href) {
    if (!href) return '';
    const absolute = href.startsWith('http') ? href : `https://www.cardmarket.com${href}`;
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
    const labelText = textOf(container.textContent);
    const iconLabel = textOf(container.querySelector('[aria-label], [data-bs-original-title], [data-original-title], [title]')?.getAttribute('aria-label')
      || container.querySelector('[aria-label], [data-bs-original-title], [data-original-title], [title]')?.getAttribute('data-bs-original-title')
      || container.querySelector('[aria-label], [data-bs-original-title], [data-original-title], [title]')?.getAttribute('data-original-title')
      || container.querySelector('[aria-label], [data-bs-original-title], [data-original-title], [title]')?.getAttribute('title'));
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
    const el = document.createElement('textarea');
    el.innerHTML = value;
    return textOf(el.value);
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

async function scrapeSingleWantItemSellers({ item, delay, previewLimit, requestFilters = {}, maxSellerPages = 20, maxFetchAttempts = 4, jitterRatio }) {
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
  const pathParts = location.pathname.split('/').filter(Boolean);
  const lang = pathParts[0] || 'en';
  const game = pathParts[1] || 'Magic';
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
    const url = new URL(currentUrl, location.origin);
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
    const url = new URL(urlValue, location.origin);
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
      const url = new URL(urlValue, location.origin);
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