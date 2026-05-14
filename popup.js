const checkPageButton = document.getElementById('checkPage');
const extractItemsButton = document.getElementById('extractItems');
const scrapeFirstItemButton = document.getElementById('scrapeFirstItem');
const sellerDelayInput = document.getElementById('sellerDelayMs');
const useSellerCacheInput = document.getElementById('useSellerCache');
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
const SELLER_CACHE_VERSION = 'v2';
const SELLER_CACHE_TTL_MS = 30 * 60 * 1000;
const SELLER_COOLDOWN_MS = 10 * 60 * 1000;

function appendStatus(message, tone = '') {
  const entry = document.createElement('li');
  if (tone) entry.className = tone;
  entry.textContent = message;
  statusLogEl.prepend(entry);
}

function setBusy(isBusy) {
  checkPageButton.disabled = isBusy;
  extractItemsButton.disabled = isBusy;
  scrapeFirstItemButton.disabled = isBusy;
  sellerDelayInput.disabled = isBusy;
  useSellerCacheInput.disabled = isBusy;
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

async function getStorageArea() {
  return chrome.storage.session || chrome.storage.local;
}

async function loadSellerSettings() {
  const storageArea = await getStorageArea();
  const stored = await storageArea.get(SELLER_SETTINGS_KEY);
  const settings = stored[SELLER_SETTINGS_KEY] || {};
  sellerDelayInput.value = String(Math.max(1000, parseInt(settings.delayMs, 10) || 2000));
  useSellerCacheInput.checked = settings.useCache !== false;
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
    },
  });
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
    meta.textContent = [
      `want=${item.idWant || '?'}`,
      `product=${item.idProduct || '?'}`,
      `qty=${item.quantity || '1'}`,
      item.language ? `lang=${item.language}` : null,
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
      seller.language ? `lang=${seller.language}` : null,
      seller.condition ? `cond=${seller.condition}` : null,
      seller.comments ? `notes=${seller.comments}` : null,
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

async function handleCheckPage() {
  setBusy(true);
  try {
    const tab = await ensureCardmarketTab();
    const page = await executeInTab(tab.id, detectCurrentPage);
    renderSummary([
      { label: 'Active page', value: page.pageKind, tone: page.supported ? 'good' : 'bad' },
      { label: 'Supported now', value: page.supported ? 'yes' : 'no', tone: page.supported ? 'good' : 'bad' },
      { label: 'Want list id', value: page.wantListId || '-' },
      { label: 'Visible row candidates', value: String(page.visibleRowCandidates) },
      { label: 'Path', value: page.pathname },
    ]);
    renderItems([], 0);
    renderSellers([], 0);
    latestExtractedItems = [];
    await clearLastExtractedItems();
    renderPayload({ page });

    const message = page.supported
      ? `Detected ${page.pageKind} on Cardmarket.`
      : `Page is not a supported want-list detail page yet (${page.pageKind}).`;
    appendStatus(message, page.supported ? 'good' : 'bad');
  } catch (error) {
    appendStatus(error.message, 'bad');
  } finally {
    setBusy(false);
  }
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
    const cacheKey = `${SELLER_CACHE_PREFIX}${SELLER_CACHE_VERSION}:${tabUrl.split('?')[0]}:${firstItem.idProduct}`;
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
      result = await executeInTab(tab.id, scrapeSingleWantItemSellers, [{ item: firstItem, delay: delayMs, previewLimit: 12 }]);
      if (result.rateLimited) {
        await setSellerCooldownUntil(Date.now() + SELLER_COOLDOWN_MS);
      }
      if (!result.error && result.totalSellers > 0 && useSellerCacheInput.checked) {
        await setSellerCacheEntry(cacheKey, result);
      }
    }

    renderSummary([
      { label: 'Selected item', value: firstItem.productName || firstItem.idProduct, tone: 'good' },
      { label: 'Product id', value: firstItem.idProduct },
      { label: 'Seller rows', value: String(result.totalSellers), tone: result.totalSellers ? 'good' : 'bad' },
      { label: 'Pages fetched', value: String(result.pagesFetched || 0) },
      { label: 'Market path', value: result.marketPath || '-' },
      { label: 'Used cache', value: fromCache ? 'yes' : 'no', tone: fromCache ? 'good' : '' },
      { label: 'Rate limited', value: result.rateLimited ? 'yes' : 'no', tone: result.rateLimited ? 'bad' : '' },
    ]);
    renderSellers(result.sellers.slice(0, 12), result.totalSellers, firstItem.productName || firstItem.idProduct);
    renderPayload(result);
    if (result.error) {
      appendStatus(result.error, 'bad');
    } else if (fromCache) {
      appendStatus(`Loaded cached seller rows for ${firstItem.productName || firstItem.idProduct}.`, 'good');
    } else {
      appendStatus(`Scraped ${result.totalSellers} seller rows for ${firstItem.productName || firstItem.idProduct}.`, result.totalSellers ? 'good' : 'bad');
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

checkPageButton.addEventListener('click', handleCheckPage);
extractItemsButton.addEventListener('click', handleExtractItems);
scrapeFirstItemButton.addEventListener('click', handleScrapeFirstItem);
copyPayloadButton.addEventListener('click', handleCopyPayload);
sellerDelayInput.addEventListener('change', saveSellerSettings);
useSellerCacheInput.addEventListener('change', saveSellerSettings);
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
appendStatus('Popup loaded. Start with "Check Current Page".');
loadSellerSettings().catch(() => {
  appendStatus('Could not load saved seller scrape settings. Using safe defaults.', 'bad');
});
loadLastExtractedItems().catch(() => {
  appendStatus('Could not restore previously extracted want items.', 'bad');
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
    const languageNode = [...row.querySelectorAll('td.languages [aria-label], td.languages [data-bs-original-title], td.languages [data-original-title], td.languages [title]')]
      .find((node) => languagePattern.test(node.getAttribute('aria-label') || node.getAttribute('data-bs-original-title') || node.getAttribute('data-original-title') || node.getAttribute('title') || ''));
    const conditionBadge = row.querySelector('td.condition .article-condition .badge, td.condition .badge');
    const priceCell = row.querySelector('td.buyPrice');
    const quantityCell = row.querySelector('td.amount');
    const previewTitle = preview?.getAttribute('data-bs-title') || preview?.getAttribute('data-bs-original-title') || preview?.getAttribute('title') || '';
    const text = row.textContent || '';
    const href = nameLink?.getAttribute('href') || '';
    const productUrl = href ? (href.startsWith('http') ? href : `https://www.cardmarket.com${href}`) : '';

    const productName = textOf(nameLink?.textContent)
      || decodeHtmlAttribute(previewTitle.match(/alt=&quot;([^&]+(?:&[^;]+;)*)&quot;/i)?.[1] || '')
      || textOf(row.querySelector('td.name')?.textContent);

    const productIdMatch = previewTitle.match(/product-images\.s3\.cardmarket\.com\/\d+\/[^/]+\/(\d+)\//i);
    const priceMatch = textOf(priceCell?.textContent).match(/(\d{1,3}(?:[.,]\d{3})*[,.]\d{2})/);

    return {
      wantListId,
      idWant: checkbox?.getAttribute('data-id-want') || '',
      idProduct: productIdMatch?.[1] || '',
      productName,
      productUrl,
      quantity: textOf(quantityCell?.getAttribute('data-amount')) || textOf(quantityCell?.textContent) || '1',
      language: textOf(languageNode?.getAttribute('aria-label') || languageNode?.getAttribute('data-bs-original-title') || languageNode?.getAttribute('data-original-title') || languageNode?.getAttribute('title')),
      minCondition: textOf(conditionBadge?.textContent),
      maxPrice: priceMatch?.[1] || '',
      isFoil: /Foil\?/i.test(text) && !/Any/i.test(textOf(row.children[7]?.textContent)),
      isReverseHolo: /Reverse\s*Holo/i.test(text),
    };
  }

  function parseMobileRow(row) {
    const checkbox = row.querySelector('input[name="mobileCheckWant"][data-id-want]');
    const nameNode = row.querySelector('.want-name');
    const nameLink = row.querySelector('.item-body-wrapper a[href*="/Cards/"]');
    const preview = row.querySelector('[data-bs-title], [data-bs-original-title], [title]');
    const previewTitle = preview?.getAttribute('data-bs-title') || preview?.getAttribute('data-bs-original-title') || preview?.getAttribute('title') || '';
    const conditionBadge = row.querySelector('.article-condition .badge, .badge');
    const languageNode = [...row.querySelectorAll('[aria-label], [data-bs-original-title], [data-original-title], [title]')]
      .find((node) => languagePattern.test(node.getAttribute('aria-label') || node.getAttribute('data-bs-original-title') || node.getAttribute('data-original-title') || node.getAttribute('title') || ''));
    const href = nameLink?.getAttribute('href') || '';
    const productUrl = href ? (href.startsWith('http') ? href : `https://www.cardmarket.com${href}`) : '';
    const productIdMatch = previewTitle.match(/product-images\.s3\.cardmarket\.com\/\d+\/[^/]+\/(\d+)\//i);

    return {
      wantListId,
      idWant: checkbox?.getAttribute('data-id-want') || '',
      idProduct: productIdMatch?.[1] || '',
      productName: textOf(nameNode?.textContent) || textOf(nameLink?.textContent),
      productUrl,
      quantity: textOf(row.querySelector('.want-amount')?.textContent).replace(/\s+/g, '') || '1',
      language: textOf(languageNode?.getAttribute('aria-label') || languageNode?.getAttribute('data-bs-original-title') || languageNode?.getAttribute('data-original-title') || languageNode?.getAttribute('title')),
      minCondition: textOf(conditionBadge?.textContent),
      maxPrice: '',
      isFoil: false,
      isReverseHolo: false,
    };
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

async function scrapeSingleWantItemSellers({ item, delay, previewLimit }) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
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

  while (page <= 20) {
    const candidatesForPage = selectedBase ? [selectedBase] : [...baseCandidates];
    let pageResolved = false;

    for (const candidate of candidatesForPage) {
      const url = buildPagedUrl(candidate.url, page);
      attemptedUrls.push(url);
      const fetchResult = await fetchWithRetry(url);
      if (fetchResult.error) {
        return { error: fetchResult.error, item, sellers, totalSellers: sellers.length, pagesFetched, marketPath, attemptedUrls, debugSnippet, rateLimited };
      }

      const { html, doc } = fetchResult;
      if (!debugSnippet) debugSnippet = (doc.querySelector('main, #main, .main-content, body')?.innerHTML || html).slice(0, 2500);

      if (page === 1 && !selectedBase && isCardOverviewWithoutRows(doc)) {
        const discoveredCandidates = discoverProductDetailCandidates(doc);
        if (discoveredCandidates.length) baseCandidates = mergeCandidates(baseCandidates, discoveredCandidates);
      }

      const rowEls = [...doc.querySelectorAll('[id^="articleRow"].article-row, .article-row')];
      if (!rowEls.length) continue;

      if (!selectedBase) selectedBase = candidate;

      if (page === 1) {
        const pageLinks = doc.querySelectorAll('a[href*="site="]');
        pageLinks.forEach((link) => {
          const match = (link.getAttribute('href') || '').match(/[?&]site=(\d+)/);
          if (match) totalPagesSeen = Math.max(totalPagesSeen, parseInt(match[1], 10));
        });
        if (!totalPagesSeen) totalPagesSeen = 1;
      }

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
        if (totalPagesSeen && page > totalPagesSeen) page = 999;
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
    rateLimited,
  };

  function buildInitialBaseCandidates() {
    const candidates = [];
    if (item.productUrl) candidates.push({ url: item.productUrl, label: 'productUrl' });
    candidates.push({
      url: `${marketPath}?${new URLSearchParams({ idProduct: String(item.idProduct), sortBy: 'name_asc' }).toString()}`,
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

  function buildPagedUrl(baseUrl, pageNumber) {
    const url = new URL(baseUrl, location.origin);
    if (pageNumber > 1) url.searchParams.set('site', String(pageNumber));
    return url.toString();
  }

  async function fetchWithRetry(url) {
    let res = null;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        res = await fetch(url, { credentials: 'include' });
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
    return { html, doc: new DOMParser().parseFromString(html, 'text/html') };
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
    const sellerLink = el.querySelector('.col-seller a, a[href*="/User/"]');
    row.sellerName = textOf(sellerLink?.textContent);
    row.sellerUrl = sellerLink?.getAttribute('href')
      ? (sellerLink.getAttribute('href').startsWith('http') ? sellerLink.getAttribute('href') : `https://www.cardmarket.com${sellerLink.getAttribute('href')}`)
      : '';
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
    const commentNode = el.querySelector('.product-comments [data-bs-original-title], .product-comments [title], .product-comments .text-truncate, .product-comments span.fst-italic');
    row.comments = textOf(commentNode?.getAttribute('data-bs-original-title') || commentNode?.getAttribute('title') || commentNode?.textContent);
    row.reverse = /Reverse\s*Holo/i.test(`${row.comments} ${el.textContent || ''}`);
    return row;
  }

  function textOf(value) {
    return String(value || '').trim().replace(/\s+/g, ' ');
  }
}