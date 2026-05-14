const checkPageButton = document.getElementById('checkPage');
const extractItemsButton = document.getElementById('extractItems');
const copyPayloadButton = document.getElementById('copyPayload');
const summaryEl = document.getElementById('summary');
const itemsEl = document.getElementById('items');
const payloadViewEl = document.getElementById('payloadView');
const statusLogEl = document.getElementById('statusLog');

let latestExtractPayload = null;

function appendStatus(message, tone = '') {
  const entry = document.createElement('li');
  if (tone) entry.className = tone;
  entry.textContent = message;
  statusLogEl.prepend(entry);
}

function setBusy(isBusy) {
  checkPageButton.disabled = isBusy;
  extractItemsButton.disabled = isBusy;
  copyPayloadButton.disabled = isBusy;
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
      { label: 'Preview returned', value: String(result.items.length) },
      { label: 'Extractor source', value: result.debug.source || '-' },
      { label: 'Desktop rows seen', value: String(result.debug.desktopRows || 0) },
    ]);
    renderItems(result.items, result.totalVisible);
    renderPayload(result);
    appendStatus(`Extracted ${result.totalVisible} visible want items from the current page.`, result.totalVisible ? 'good' : 'bad');
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
copyPayloadButton.addEventListener('click', handleCopyPayload);

renderSummary([
  { label: 'Status', value: 'Ready for page detection' },
  { label: 'Current scope', value: 'Want-list detail page only' },
]);
renderItems([], 0);
renderPayload(null);
appendStatus('Popup loaded. Start with "Check Current Page".');

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
    items: parsedItems.slice(0, previewLimit || 8),
    debug: {
      source,
      desktopRows: desktopRows.length,
      mobileRows: mobileRows.length,
      parsedItems: parsedItems.length,
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