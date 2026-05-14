const extractItemsButton = document.getElementById('extractItems');
const scrapeFirstItemButton = document.getElementById('scrapeFirstItem');
const inspectFiltersButton = document.getElementById('inspectFilters');
const sellerDelayInput = document.getElementById('sellerDelayMs');
const useSellerCacheInput = document.getElementById('useSellerCache');
const matchWantLanguageInput = document.getElementById('matchWantLanguage');
const sellerLocationFilterInput = document.getElementById('sellerLocationFilter');
const clearSellerCacheButton = document.getElementById('clearSellerCache');
const copyPayloadButton = document.getElementById('copyPayload');
const summaryEl = document.getElementById('summary');
const itemsEl = document.getElementById('items');
const sellerItemsEl = document.getElementById('sellerItems');
const payloadViewEl = document.getElementById('payloadView');
const statusLogEl = document.getElementById('statusLog');

let latestExtractPayload = null;
let latestExtractedItems = [];

const SELLER_SETTINGS_KEY = 'sellerScrapeSettings';
const LAST_EXTRACTED_ITEMS_KEY = 'lastExtractedItems';
const SELLER_CACHE_PREFIX = 'sellerCache:';
const SELLER_CACHE_VERSION = 'v5';
const SELLER_CACHE_TTL_MS = 30 * 60 * 1000;
const SELLER_COOLDOWN_MS = 10 * 60 * 1000;

function appendStatus(message, tone = '') {
  const entry = document.createElement('li');
  if (tone) entry.className = tone;
  entry.textContent = message;
  statusLogEl.prepend(entry);
}

function setBusy(isBusy) {
  extractItemsButton.disabled = isBusy;
  scrapeFirstItemButton.disabled = isBusy;
  inspectFiltersButton.disabled = isBusy;
  sellerDelayInput.disabled = isBusy;
  useSellerCacheInput.disabled = isBusy;
  matchWantLanguageInput.disabled = isBusy;
  sellerLocationFilterInput.disabled = isBusy;
  clearSellerCacheButton.disabled = isBusy;
  copyPayloadButton.disabled = isBusy;
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

async function getStorageArea() {
  return chrome.storage.session || chrome.storage.local;
}

async function loadSellerSettings() {
  const storageArea = await getStorageArea();
  const stored = await storageArea.get(SELLER_SETTINGS_KEY);
  const settings = stored[SELLER_SETTINGS_KEY] || {};
  sellerDelayInput.value = String(Math.max(1000, parseInt(settings.delayMs, 10) || 2000));
  useSellerCacheInput.checked = settings.useCache !== false;
  matchWantLanguageInput.checked = settings.matchWantLanguage !== false;
  sellerLocationFilterInput.value = typeof settings.sellerLocationFilter === 'string' ? settings.sellerLocationFilter : '';
}

async function loadLastExtractedItems() {
  const storageArea = await getStorageArea();
  const stored = await storageArea.get(LAST_EXTRACTED_ITEMS_KEY);
  latestExtractedItems = Array.isArray(stored[LAST_EXTRACTED_ITEMS_KEY]) ? stored[LAST_EXTRACTED_ITEMS_KEY] : [];
  if (latestExtractedItems.length) {
    renderItems(latestExtractedItems.slice(0, 8), latestExtractedItems.length);
    renderSellers([], 0, latestExtractedItems[0]?.productName || 'the first item');
    appendStatus(`Restored ${latestExtractedItems.length} extracted want items from the previous popup session.`, 'good');
  }
}

async function saveLastExtractedItems(items) {
  const storageArea = await getStorageArea();
  await storageArea.set({ [LAST_EXTRACTED_ITEMS_KEY]: items });
}

async function saveSellerSettings() {
  const storageArea = await getStorageArea();
  await storageArea.set({
    [SELLER_SETTINGS_KEY]: {
      delayMs: Math.max(1000, parseInt(sellerDelayInput.value, 10) || 2000),
      useCache: useSellerCacheInput.checked,
      matchWantLanguage: matchWantLanguageInput.checked,
      sellerLocationFilter: sellerLocationFilterInput.value.trim(),
    },
  });
}

function getActiveSellerFilters(item) {
  const requestedLanguages = matchWantLanguageInput.checked ? getItemLanguages(item) : [];
  const allowedCountries = parseCountryFilterInput(sellerLocationFilterInput.value);
  return {
    requestedLanguages,
    allowedCountries,
    locationFilterText: sellerLocationFilterInput.value.trim(),
  };
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
      matchWantLanguage: filters.requestedLanguages.length > 0,
      requestedLanguages: filters.requestedLanguages,
      sellerCountries: filters.allowedCountries,
      sellerCountryFilterText: filters.locationFilterText,
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

async function getSellerCacheEntry(cacheKey) {
  const storageArea = await getStorageArea();
  const stored = await storageArea.get(cacheKey);
  const entry = stored[cacheKey];
  if (!entry) return null;
  if ((Date.now() - entry.savedAt) > SELLER_CACHE_TTL_MS) {
    await storageArea.remove(cacheKey);
    return null;
  }
  return entry;
}

async function setSellerCacheEntry(cacheKey, value) {
  const storageArea = await getStorageArea();
  await storageArea.set({
    [cacheKey]: {
      savedAt: Date.now(),
      value,
    },
  });
}

async function clearSellerCache() {
  const storageArea = await getStorageArea();
  const allItems = await storageArea.get(null);
  const sellerKeys = Object.keys(allItems).filter((key) => key.startsWith(SELLER_CACHE_PREFIX) || key === 'sellerScrapeCooldownUntil');
  if (sellerKeys.length) await storageArea.remove(sellerKeys);
}

async function clearLastExtractedItems() {
  const storageArea = await getStorageArea();
  await storageArea.remove(LAST_EXTRACTED_ITEMS_KEY);
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

function renderPayload(payload) {
  latestExtractPayload = payload;
  payloadViewEl.textContent = payload ? JSON.stringify(payload, null, 2) : 'No extracted payload yet.';
  copyPayloadButton.disabled = !payload;
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
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

async function executeInTab(tabId, func, args = []) {
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args,
  });
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

async function handleExtractItems() {
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
    await saveLastExtractedItems(result.items);
    renderItems(result.items.slice(0, 8), result.totalVisible);
    renderSellers([], 0, result.items[0]?.productName || 'the first item');
    renderPayload(result);
    appendStatus(`Extracted ${result.totalVisible} visible want items from the current page.`, result.totalVisible ? 'good' : 'bad');
  } catch (error) {
    appendStatus(error.message, 'bad');
  } finally {
    setBusy(false);
  }
}

async function handleScrapeFirstItem() {
  setBusy(true);
  try {
    appendStatus('Starting seller scrape for the first extracted item...', 'good');
    if (!latestExtractedItems.length) {
      throw new Error('Extract want items first so the popup has a product to scrape.');
    }

    const firstItem = latestExtractedItems[0];
    if (!firstItem.idProduct) {
      throw new Error('The first extracted item has no idProduct, so seller scraping cannot start yet.');
    }

    const tab = await ensureCardmarketTab();
    const delayMs = Math.max(1000, parseInt(sellerDelayInput.value, 10) || 2000);
    const cooldownUntil = await getSellerCooldownUntil();
    if (cooldownUntil > Date.now()) {
      throw new Error(`Seller scraping is paused after rate limiting. Try again in ${formatRemaining(cooldownUntil - Date.now())}.`);
    }

    const tabUrl = tab.url || '';
    const requestLanguageId = matchWantLanguageInput.checked ? getCardmarketLanguageId(getSingleItemLanguage(firstItem)) : '';
  const requestCountryIds = getCardmarketCountryIds(sellerLocationFilterInput.value);
  const cacheKey = `${SELLER_CACHE_PREFIX}${SELLER_CACHE_VERSION}:${tabUrl.split('?')[0]}:${firstItem.idProduct}:lang=${requestLanguageId || 'all'}:country=${requestCountryIds.join(',') || 'all'}`;
    let result = null;
    let fromCache = false;

    if (useSellerCacheInput.checked) {
      const cached = await getSellerCacheEntry(cacheKey);
      if (cached) {
        result = cached.value;
        fromCache = true;
      }
    }

    if (!result) {
      result = await executeInTab(tab.id, scrapeSingleWantItemSellers, [{
        item: firstItem,
        delay: delayMs,
        previewLimit: 12,
        requestFilters: {
          languageId: requestLanguageId,
          sellerCountryIds: requestCountryIds,
        },
      }]);
      if (!result) {
        throw new Error('Seller scrape returned no result. Reload the Cardmarket tab and try again.');
      }
      if (result.rateLimited) {
        await setSellerCooldownUntil(Date.now() + SELLER_COOLDOWN_MS);
      }
      if (!result.error && result.totalSellers > 0 && useSellerCacheInput.checked) {
        await setSellerCacheEntry(cacheKey, result);
      }
    }

    const filteredResult = applySellerFilters(result, firstItem);
    const sellerCountLabel = filteredResult.unfilteredTotalSellers && filteredResult.unfilteredTotalSellers !== filteredResult.totalSellers
      ? `${filteredResult.totalSellers} / ${filteredResult.unfilteredTotalSellers}`
      : String(filteredResult.totalSellers);
    const filterSummary = [];
    if (filteredResult.filtersApplied?.requestedLanguages?.length) {
      filterSummary.push(`langs=${filteredResult.filtersApplied.requestedLanguages.join(', ')}`);
    }
    if (filteredResult.filtersApplied?.sellerCountries?.length) {
      filterSummary.push(`country=${filteredResult.filtersApplied.sellerCountries.join(', ')}`);
    }

    renderSummary([
      { label: 'Selected item', value: firstItem.productName || firstItem.idProduct, tone: 'good' },
      { label: 'Product id', value: firstItem.idProduct },
      { label: 'Seller rows', value: sellerCountLabel, tone: filteredResult.totalSellers ? 'good' : 'bad' },
      { label: 'Pages fetched', value: String(filteredResult.pagesFetched || 0) },
      { label: 'Market path', value: filteredResult.marketPath || '-' },
      { label: 'Filters', value: filterSummary.join(' | ') || 'none' },
      { label: 'Used cache', value: fromCache ? 'yes' : 'no', tone: fromCache ? 'good' : '' },
      { label: 'Rate limited', value: filteredResult.rateLimited ? 'yes' : 'no', tone: filteredResult.rateLimited ? 'bad' : '' },
    ]);
    renderSellers(filteredResult.sellers.slice(0, 12), filteredResult.totalSellers, firstItem.productName || firstItem.idProduct);
    renderPayload(filteredResult);
    if (filteredResult.error) {
      appendStatus(filteredResult.error, 'bad');
    } else if (fromCache) {
      appendStatus(`Loaded cached seller rows for ${firstItem.productName || firstItem.idProduct}.`, 'good');
    } else {
      appendStatus(`Scraped ${filteredResult.totalSellers}${filteredResult.unfilteredTotalSellers !== filteredResult.totalSellers ? ` of ${filteredResult.unfilteredTotalSellers}` : ''} seller rows for ${firstItem.productName || firstItem.idProduct}.`, filteredResult.totalSellers ? 'good' : 'bad');
    }
  } catch (error) {
    appendStatus(error.message, 'bad');
  } finally {
    setBusy(false);
  }
}

async function handleCopyPayload() {
  if (!latestExtractPayload) {
    appendStatus('No payload available to copy yet.', 'bad');
    return;
  }

  try {
    await navigator.clipboard.writeText(JSON.stringify(latestExtractPayload, null, 2));
    appendStatus('Copied latest payload JSON to clipboard.', 'good');
  } catch (error) {
    appendStatus(`Clipboard copy failed: ${error.message}`, 'bad');
  }
}

async function handleInspectFilters() {
  setBusy(true);
  try {
    const tab = await ensureCardmarketTab();
    const result = await executeInTab(tab.id, inspectAvailableSellerFilters);
    if (!result) {
      throw new Error('Filter inspection returned no result.');
    }

    renderSummary([
      { label: 'Page title', value: result.title || '-' },
      { label: 'Filter form found', value: result.filterFormAction ? 'yes' : 'no', tone: result.filterFormAction ? 'good' : 'bad' },
      { label: 'Filter action', value: result.filterFormAction || '-' },
      { label: 'Filter groups', value: String(Object.keys(result.filters || {}).length) },
    ]);
    renderPayload(result);
    appendStatus(`Inspected ${Object.keys(result.filters || {}).length} filter groups from the current Cardmarket page.`, Object.keys(result.filters || {}).length ? 'good' : 'bad');
  } catch (error) {
    appendStatus(error.message, 'bad');
  } finally {
    setBusy(false);
  }
}

extractItemsButton.addEventListener('click', handleExtractItems);
scrapeFirstItemButton.addEventListener('click', handleScrapeFirstItem);
inspectFiltersButton.addEventListener('click', handleInspectFilters);
copyPayloadButton.addEventListener('click', handleCopyPayload);
sellerDelayInput.addEventListener('change', saveSellerSettings);
useSellerCacheInput.addEventListener('change', saveSellerSettings);
matchWantLanguageInput.addEventListener('change', saveSellerSettings);
sellerLocationFilterInput.addEventListener('change', saveSellerSettings);
clearSellerCacheButton.addEventListener('click', async () => {
  setBusy(true);
  try {
    await clearSellerCache();
    appendStatus('Cleared cached seller results and cooldown state.', 'good');
  } catch (error) {
    appendStatus(`Failed to clear seller cache: ${error.message}`, 'bad');
  } finally {
    setBusy(false);
  }
});

renderSummary([
  { label: 'Status', value: 'Ready for page detection' },
  { label: 'Current scope', value: 'Want-list detail page only' },
]);
renderItems([], 0);
renderSellers([], 0);
renderPayload(null);
appendStatus('Popup loaded. Start with "Extract Visible Want Items".');
loadSellerSettings().catch(() => {
  appendStatus('Could not load saved seller scrape settings. Using safe defaults.', 'bad');
});
loadLastExtractedItems().catch(() => {
  appendStatus('Could not restore previously extracted want items.', 'bad');
});

function inspectAvailableSellerFilters() {
  const textOf = (value) => String(value || '').trim().replace(/\s+/g, ' ');
  const relevantFieldPattern = /^(sellerCountry|sellerType|sellerReputation|maxShippingTime|idExpansion|language|minCondition|extra\[.+\]|apply)$/i;
  const nodes = [...document.querySelectorAll('input[name], select[name], textarea[name]')]
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
        label: textOf(option.textContent),
        selected: option.selected,
      })).filter((option) => option.value || option.label);
      filters[fieldKey].push(...options);
      continue;
    }

    const label = extractInputLabel(node);
    const entry = {
      rawName,
      value: node.value || '',
      label,
      checked: node.checked === true,
      type: node.type || node.tagName.toLowerCase(),
    };
    filters[fieldKey].push(entry);
  }

  Object.keys(filters).forEach((key) => {
    const seen = new Set();
    filters[key] = filters[key].filter((entry) => {
      const marker = `${entry.rawName}|${entry.value}|${entry.label}`;
      if (seen.has(marker)) return false;
      seen.add(marker);
      return true;
    });
  });

  const filterForm = document.querySelector('form[action*="Product_Filter_FilterMetacard"], form[action*="FilterMetacard"]');
  const activeQuery = collectActiveQuery();
  const submittedFormData = collectFormData(filterForm);
  mergeActiveValues(filters, activeQuery, 'url');
  mergeActiveValues(filters, submittedFormData, 'form');

  return {
    title: document.title,
    href: location.href,
    filterFormAction: filterForm?.getAttribute('action') || '',
    activeQuery,
    submittedFormData,
    filters,
  };

  function collectActiveQuery() {
    const query = {};
    const params = new URLSearchParams(location.search);
    params.forEach((value, key) => {
      if (!relevantFieldPattern.test(key)) return;
      query[key] = value.split(',').map((part) => textOf(part)).filter(Boolean);
    });
    return query;
  }

  function collectFormData(form) {
    if (!form) return {};
    const data = {};
    const formData = new FormData(form);
    for (const [key, value] of formData.entries()) {
      if (!relevantFieldPattern.test(key)) continue;
      if (!data[key]) data[key] = [];
      data[key].push(textOf(value));
    }
    return data;
  }

  function mergeActiveValues(targetFilters, activeValues, source) {
    Object.entries(activeValues).forEach(([rawName, values]) => {
      const fieldKey = rawName.replace(/\[.*\]$/, '');
      if (!targetFilters[fieldKey]) targetFilters[fieldKey] = [];
      const seen = new Set(targetFilters[fieldKey].map((entry) => `${entry.rawName}|${entry.value}`));
      values.forEach((value) => {
        const marker = `${rawName}|${value}`;
        if (seen.has(marker)) return;
        seen.add(marker);
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
    if (directLabel) return textOf(directLabel.textContent);

    const id = node.getAttribute('id');
    if (id) {
      const forLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (forLabel) return textOf(forLabel.textContent);
    }

    const wrapper = node.closest('.form-check, .checkbox, .radio, .filter-row, li, .list-group-item, .form-group');
    if (wrapper) return textOf(wrapper.textContent);

    const siblingText = [node.nextSibling, node.previousSibling]
      .map((sibling) => textOf(sibling?.textContent || ''))
      .find(Boolean);
    return siblingText || '';
  }
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

async function scrapeSingleWantItemSellers({ item, delay, previewLimit, requestFilters = {} }) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const SELLER_PAGE_SIZE_HINT = 50;
  const MAX_SELLER_PAGES = 3;
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
      if (delay && page < 999) await sleep(delay);
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
    return url.toString();
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
    for (let attempt = 0; attempt < 4; attempt += 1) {
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