function getVisiblePostFillSellerIds() {
  return getPostFillSellerChoices().map((seller) => textOf(seller?.seller_id)).filter(Boolean);
}

const POST_FILL_TOTAL_REFRESH_MS = 15000;
let postFillTotalsState = {
  isLoading: false,
  fetchedAt: 0,
  cardmarketTotal: null,
  sellerShippingByName: {},
  sourceLabel: '',
  error: '',
};

function normalizeSellerLookupKey(value) {
  return textOf(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase();
}

function parseMoneyValue(value) {
  const raw = textOf(value);
  if (!raw) return null;

  const match = raw.match(/(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*(€|EUR|\$|USD|£|GBP|CHF)?/i);
  if (!match) return null;

  const amount = Number.parseFloat(match[1].replace(/\./g, '').replace(/,/g, '.'));
  if (!Number.isFinite(amount)) return null;

  const symbol = textOf(match[2] || '').toUpperCase();
  const currency = symbol === '$' || symbol === 'USD'
    ? 'USD'
    : (symbol === '£' || symbol === 'GBP'
      ? 'GBP'
      : (symbol === 'CHF' ? 'CHF' : 'EUR'));

  return { amount, currency };
}

function parseShoppingCartTotalFromHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const textNormalized = (value) => textOf(value).toLowerCase();
  const bodyText = textOf(doc.body?.innerText || '');
  const cartRowEls = [...doc.querySelectorAll('tr[data-article-id], [data-article-id][data-name], input[name="idArticle"]')];
  const hasCartRows = cartRowEls.length > 0;
  const hasEmptyCartPhrase = /your shopping cart is empty|shopping cart is empty/i.test(bodyText);

  if (hasEmptyCartPhrase && !hasCartRows) {
    console.log('[post-fill-scrape] empty cart phrase matched; fallback total=0');
    return {
      amount: 0,
      currency: 'EUR',
      sourceLabel: 'Empty cart',
    };
  }

  if (hasEmptyCartPhrase && hasCartRows) {
    console.log('[post-fill-scrape] empty cart phrase conflicts with cart rows; ignoring empty phrase', {
      cartRowCount: cartRowEls.length,
    });
  }

  const allHeadings = [...doc.querySelectorAll('h1, h2, h3, h4, h5')];
  const cartOverviewHeading = allHeadings.find((heading) => /cart overview/i.test(textOf(heading.textContent || '')));

  const containers = [];
  if (cartOverviewHeading) {
    const container = cartOverviewHeading.closest('section, article, aside, div');
    if (container) containers.push(container);
  }
  containers.push(doc.body);

  for (const container of containers) {
    if (!container) continue;

    const rows = [...container.querySelectorAll('div, li, tr, dt, dd, p, span')];
    for (const row of rows) {
      const label = textNormalized(row.textContent || '');
      if (!/^(total|total order price)$/.test(label)) continue;

      const sibling = row.nextElementSibling;
      const parsed = parseMoneyValue(sibling?.textContent || '');
      if (parsed) {
        console.log('[post-fill-scrape] total parsed from labeled sibling row', {
          sourceLabel: textOf(row.textContent || 'Total'),
          amount: parsed.amount,
          currency: parsed.currency,
        });
        return {
          amount: parsed.amount,
          currency: parsed.currency,
          sourceLabel: textOf(row.textContent || 'Total'),
        };
      }
    }

    const labeledRows = [...container.querySelectorAll('div, li, tr')];
    for (const row of labeledRows) {
      const children = [...row.children];
      if (children.length < 2) continue;
      const left = textNormalized(children[0].textContent || '');
      if (!/^total$/.test(left)) continue;
      const parsed = parseMoneyValue(children[children.length - 1].textContent || '');
      if (parsed) {
        console.log('[post-fill-scrape] total parsed from two-column row', {
          sourceLabel: textOf(children[0].textContent || 'Total'),
          amount: parsed.amount,
          currency: parsed.currency,
        });
        return {
          amount: parsed.amount,
          currency: parsed.currency,
          sourceLabel: textOf(children[0].textContent || 'Total'),
        };
      }
    }
  }

  const headingAmount = parseMoneyValue(cartOverviewHeading?.textContent || '');
  if (headingAmount) {
    console.log('[post-fill-scrape] total parsed from heading fallback', {
      amount: headingAmount.amount,
      currency: headingAmount.currency,
    });
    return {
      amount: headingAmount.amount,
      currency: headingAmount.currency,
      sourceLabel: 'Cart overview',
    };
  }

  const fallbackMatch = bodyText.match(/cart overview\s+(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*(€|EUR|\$|USD|£|GBP|CHF)/i)
    || bodyText.match(/total order price\s+(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*(€|EUR|\$|USD|£|GBP|CHF)/i)
    || bodyText.match(/\btotal\s+(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*(€|EUR|\$|USD|£|GBP|CHF)/i);

  if (fallbackMatch) {
    const parsed = parseMoneyValue(`${fallbackMatch[1]} ${fallbackMatch[2]}`);
    if (parsed) {
      console.log('[post-fill-scrape] total parsed from text fallback', {
        amount: parsed.amount,
        currency: parsed.currency,
      });
      return {
        amount: parsed.amount,
        currency: parsed.currency,
        sourceLabel: 'Total',
      };
    }
  }

  const shoppingCartLink = [...doc.querySelectorAll('a[href*="/ShoppingCart"]')]
    .map((entry) => textOf(entry.textContent || ''))
    .find((value) => /\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\s*(?:€|EUR|\$|USD|£|GBP|CHF)/i.test(value));
  if (shoppingCartLink) {
    const parsed = parseMoneyValue(shoppingCartLink);
    if (parsed) {
      console.log('[post-fill-scrape] total parsed from ShoppingCart link fallback', {
        amount: parsed.amount,
        currency: parsed.currency,
      });
      return {
        amount: parsed.amount,
        currency: parsed.currency,
        sourceLabel: 'ShoppingCart link',
      };
    }
  }

  console.log('[post-fill-scrape] total parse failed', {
    htmlLength: String(html || '').length,
    cartRowCount: cartRowEls.length,
    title: textOf(doc.querySelector('title')?.textContent || ''),
    bodyPreview: bodyText.slice(0, 250),
    possibleCloudflare: /cf-mitigated|just a moment|checking your browser|cloudflare/i.test(bodyText),
    possibleLogin: /\blog\s*in\b|access your cardmarket account|username|password/i.test(bodyText),
  });
  return null;
}

function readShippingAmountFromNode(node) {
  if (!node?.querySelectorAll) return null;

  const rows = [...node.querySelectorAll('div, li, tr, dt, dd, p, span')];
  for (const row of rows) {
    const children = [...row.children];
    if (children.length < 2) continue;

    const label = textOf(children[0].textContent || '').toLowerCase();
    if (label !== 'shipping') continue;

    const parsed = parseMoneyValue(children[children.length - 1].textContent || '');
    if (parsed) return parsed.amount;
  }

  const textMatch = textOf(node.innerText || node.textContent || '').match(/\bshipping\s+(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*(€|EUR|\$|USD|£|GBP|CHF)/i);
  if (!textMatch) return null;
  const parsed = parseMoneyValue(`${textMatch[1]} ${textMatch[2]}`);
  return parsed ? parsed.amount : null;
}

function parseSellerShippingByNameFromHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  const map = {};
  const sellerLinks = [...doc.querySelectorAll('main a[href*="/Users/"]')];

  console.log('[post-fill-scrape] seller shipping parse start', {
    sellerLinkCount: sellerLinks.length,
  });

  sellerLinks.forEach((link) => {
    const sellerName = textOf(link.textContent || '');
    if (!sellerName) return;

    let container = null;
    let cursor = link;
    for (let depth = 0; depth < 8 && cursor; depth += 1) {
      const parent = cursor.parentElement;
      if (!parent) break;
      const hasShipping = /\bshipping\b/i.test(textOf(parent.textContent || ''));
      if (hasShipping) {
        container = parent;
        break;
      }
      cursor = parent;
    }

    const shippingAmount = readShippingAmountFromNode(container || link.closest('section, article, div, li, form'));
    if (!Number.isFinite(shippingAmount)) return;

    const sellerKey = normalizeSellerLookupKey(sellerName);
    if (!sellerKey) return;
    map[sellerKey] = shippingAmount;
  });

  console.log('[post-fill-scrape] seller shipping parse done', {
    sellerShippingCount: Object.keys(map).length,
  });

  return map;
}

async function fetchCurrentShoppingCartTotal() {
  const tab = await ensureCardmarketTab();
  console.log('[post-fill-scrape] fetch start', { tabId: tab?.id, tabUrl: tab?.url || '' });
  const html = await executeInTab(tab.id, async () => {
    const pathParts = location.pathname.split('/').filter(Boolean);
    const lang = pathParts[0] || 'en';
    const game = pathParts[1] || 'Magic';
    const shoppingCartUrl = `${location.origin}/${lang}/${game}/ShoppingCart?__cmopt_ts=${Date.now()}`;

    const response = await fetch(shoppingCartUrl, {
      credentials: 'include',
      cache: 'no-store',
    });

    console.log('[post-fill-scrape] fetch response', {
      shoppingCartUrl,
      status: response.status,
      ok: response.ok,
      redirected: response.redirected,
    });

    if (!response.ok) {
      throw new Error(`Shopping cart request failed (${response.status}).`);
    }

    return response.text();
  });

  if (!textOf(html)) {
    throw new Error('ShoppingCart fetch returned empty HTML while page was likely reloading.');
  }

  const parsed = parseShoppingCartTotalFromHtml(html);
  if (!parsed || !Number.isFinite(parsed.amount)) {
    throw new Error('Could not parse Cart overview total from ShoppingCart page.');
  }

  console.log('[post-fill-scrape] total parsed', {
    amount: parsed.amount,
    currency: parsed.currency,
    sourceLabel: parsed.sourceLabel,
    htmlLength: String(html || '').length,
  });

  return {
    ...parsed,
    sellerShippingByName: parseSellerShippingByNameFromHtml(html),
  };
}

async function refreshPostFillTotalsIfNeeded(force = false) {
  if (!hasFilledCartSession()) return;
  if (postFillTotalsState.isLoading) return;
  if (!force && (Date.now() - postFillTotalsState.fetchedAt) < POST_FILL_TOTAL_REFRESH_MS) return;

  postFillTotalsState = {
    ...postFillTotalsState,
    isLoading: true,
    error: '',
  };
  renderPostFillScreen();

  try {
    const parsed = await fetchCurrentShoppingCartTotal();
    console.log('[post-fill-scrape] refresh success', {
      force,
      cardmarketTotal: Number(parsed?.amount),
      sourceLabel: textOf(parsed?.sourceLabel || ''),
      sellerShippingCount: Object.keys(parsed?.sellerShippingByName || {}).length,
    });
    postFillTotalsState = {
      isLoading: false,
      fetchedAt: Date.now(),
      cardmarketTotal: Number(parsed?.amount),
      sellerShippingByName: (parsed?.sellerShippingByName && typeof parsed.sellerShippingByName === 'object')
        ? parsed.sellerShippingByName
        : {},
      sourceLabel: textOf(parsed?.sourceLabel || ''),
      error: '',
    };
  } catch (error) {
    console.log('[post-fill-scrape] refresh failed', {
      force,
      error: textOf(error?.message || error),
    });
    postFillTotalsState = {
      ...postFillTotalsState,
      isLoading: false,
      fetchedAt: Date.now(),
      cardmarketTotal: null,
      sellerShippingByName: {},
      sourceLabel: '',
      error: textOf(error?.message || 'Could not load Cardmarket cart total.'),
    };
  }

  renderPostFillScreen();
}

function renderPostFillTotalsSummary() {
  if (!postFillTotalsSummaryEl || !postFillCartTotalEl || !postFillComputedTotalEl || !postFillTotalDifferenceEl || !postFillTotalsHintEl) {
    return;
  }

  const optimizerCurrency = textOf(latestOptimizationResult?.currency || 'EUR') || 'EUR';
  const computedTotal = Number(latestOptimizationResult?.totals?.grand_total);
  const hasComputedTotal = Number.isFinite(computedTotal);
  const hasCardmarketTotal = Number.isFinite(postFillTotalsState.cardmarketTotal);
  const hasAnyTotal = hasComputedTotal || hasCardmarketTotal || postFillTotalsState.isLoading;

  postFillTotalsSummaryEl.hidden = !hasAnyTotal;

  postFillComputedTotalEl.textContent = hasComputedTotal
    ? formatCurrencyAmount(computedTotal, optimizerCurrency)
    : '-';

  if (postFillTotalsState.isLoading) {
    postFillCartTotalEl.textContent = 'Loading...';
  } else {
    postFillCartTotalEl.textContent = hasCardmarketTotal
      ? formatCurrencyAmount(postFillTotalsState.cardmarketTotal, optimizerCurrency)
      : '-';
  }

  const hasDiff = hasCardmarketTotal && hasComputedTotal;
  const diff = hasDiff ? postFillTotalsState.cardmarketTotal - computedTotal : null;
  postFillTotalDifferenceEl.textContent = hasDiff
    ? formatCurrencyAmount(diff, optimizerCurrency)
    : '-';

  postFillTotalDifferenceEl.classList.toggle('good', hasDiff && Math.abs(diff) < 0.01);
  postFillTotalDifferenceEl.classList.toggle('bad', hasDiff && Math.abs(diff) >= 0.01);

  postFillTotalsHintEl.hidden = !hasAnyTotal;
  if (postFillTotalsState.isLoading) {
    postFillTotalsHintEl.textContent = 'Loading Cardmarket total order price from ShoppingCart...';
  } else {
    postFillTotalsHintEl.textContent = 'Large differences are often because: either your shopping cart contained previous items, or a seller uses non-standard delivery fees.';
  }
}

function getPostFillSelectedSellerIdsFromInputs() {
  if (!postFillSellerListEl) return [];

  return [...postFillSellerListEl.querySelectorAll('input[data-post-fill-seller-id]:checked')]
    .map((input) => textOf(input.getAttribute('data-post-fill-seller-id')))
    .filter(Boolean);
}

function getMergedPostFillDisabledSellerIds() {
  const visibleSellerIds = new Set(getVisiblePostFillSellerIds());
  const hiddenRememberedSellerIds = getRememberedDisabledSellerIds()
    .filter((sellerId) => !visibleSellerIds.has(sellerId));

  return [...new Set([
    ...hiddenRememberedSellerIds,
    ...getPostFillSelectedSellerIdsFromInputs(),
  ])].sort();
}

function hasPostFillSelectionChanged() {
  const rememberedVisible = getRememberedDisabledSellerIds()
    .filter((sellerId) => new Set(getVisiblePostFillSellerIds()).has(sellerId))
    .sort();
  const selectedVisible = getPostFillSelectedSellerIdsFromInputs().sort();

  return rememberedVisible.join('|') !== selectedVisible.join('|');
}

function syncPostFillReoptimizeButton(isBusy = false) {
  if (!postFillReoptimizeButton) return;

  const hasChoices = getPostFillSellerChoices().length > 0;
  postFillReoptimizeButton.disabled = isBusy || !hasChoices || !hasPostFillSelectionChanged();
  postFillReoptimizeButton.classList.toggle('is-busy', isBusy);
  postFillReoptimizeButton.classList.toggle('secondary', !hasChoices || !hasPostFillSelectionChanged());
}

function renderPostFillScreen() {
  if (!postFillSellerListEl || !postFillEmptyStateEl || !postFillSummaryEl || !postFillMemoryNoteEl) {
    return;
  }

  renderPostFillTotalsSummary();

  const sellers = getPostFillSellerChoices();
  const rememberedSellerIds = new Set(getRememberedDisabledSellerIds());
  const hiddenRememberedCount = getHiddenRememberedDisabledSellerIds().length;

  postFillSellerListEl.replaceChildren();

  if (!sellers.length) {
    postFillEmptyStateEl.hidden = false;
    postFillEmptyStateEl.textContent = hasFilledCartSession()
      ? 'No seller list available from current cart result. Re-open after a successful fill or re-optimization with a feasible cart.'
      : 'Fill cart first. Then this screen can disable sellers and re-optimize.';
    postFillSummaryEl.textContent = 'Expected shipping shown below once seller list exists. Actual shipping scrape not implemented yet.';
    postFillMemoryNoteEl.hidden = hiddenRememberedCount === 0;
    postFillMemoryNoteEl.textContent = hiddenRememberedCount
      ? `${hiddenRememberedCount} previously disabled seller${hiddenRememberedCount === 1 ? '' : 's'} still applied from earlier round.`
      : '';
    syncPostFillReoptimizeButton(isUiBusy);
    return;
  }

  refreshPostFillTotalsIfNeeded();

  postFillEmptyStateEl.hidden = true;
  postFillSummaryEl.textContent = 'Any sellers that apply different shipping than expected? You can disable these sellers here and run again.';
  postFillMemoryNoteEl.hidden = hiddenRememberedCount === 0;
  postFillMemoryNoteEl.textContent = hiddenRememberedCount
    ? `${hiddenRememberedCount} seller${hiddenRememberedCount === 1 ? '' : 's'} disabled earlier no longer appear in current cart, but remain blocked.`
    : 'Actual shipping scrape not implemented yet. Expected shipping shown from optimizer result.';

  sellers.forEach((seller) => {
    const row = document.createElement('label');
    row.className = 'item checkbox-row';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = rememberedSellerIds.has(seller.seller_id);
    checkbox.disabled = isUiBusy;
    checkbox.setAttribute('data-post-fill-seller-id', seller.seller_id);

    const body = document.createElement('div');

    const title = document.createElement('strong');
    title.textContent = seller.seller_name || seller.seller_id;

    const meta = document.createElement('p');
    meta.className = 'item-meta';
    const expectedCurrency = latestOptimizationResult?.currency || 'EUR';
    const actualShippingByName = postFillTotalsState?.sellerShippingByName || {};
    const actualShippingAmount = actualShippingByName[normalizeSellerLookupKey(seller.seller_name)]
      ?? actualShippingByName[normalizeSellerLookupKey(seller.seller_id)];

    meta.textContent = [
      `expected_delivery=${formatCurrencyAmount(seller.shipping_cost || 0, expectedCurrency)}`,
      Number.isFinite(actualShippingAmount)
        ? `actual_delivery=${formatCurrencyAmount(actualShippingAmount, expectedCurrency)}`
        : 'actual_delivery=unknown',
    ].filter(Boolean).join(' | ');

    body.append(title, meta);
    row.append(checkbox, body);
    postFillSellerListEl.appendChild(row);
  });

  syncPostFillReoptimizeButton(isUiBusy);
}

async function handlePostFillReoptimize() {
  const disabledSellerIds = getMergedPostFillDisabledSellerIds();
  const payload = buildReoptimizePayload(disabledSellerIds);

  if (!payload) {
    appendStatus('No optimizer payload available for re-optimization.', 'bad');
    return;
  }

  await persistRememberedDisabledSellerIds(disabledSellerIds);
  appendStatus(`Re-optimizing with ${disabledSellerIds.length} disabled seller${disabledSellerIds.length === 1 ? '' : 's'}.`, 'good');
  await submitOptimizationRequest(DEFAULT_OPTIMIZER_API_URL, { payloadOverride: payload });
}

postFillSellerListEl?.addEventListener('change', () => {
  syncPostFillReoptimizeButton(isUiBusy);
});