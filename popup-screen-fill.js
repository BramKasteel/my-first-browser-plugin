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
    markCartAsFilled(result, latestOptimizationResult?.cart?.sellers || []);
    appendStatus(`Cardmarket cart updated: ${result.articleCount} articles, ${result.unitCount} units.`, 'good');
    finishRun('Optimized cart pushed to Cardmarket.', 'good');
    setActiveWorkflowStep('post-fill', { force: true });
  } catch (error) {
    appendStatus(error.message, 'bad');
    finishRun(error.message, 'bad');
  } finally {
    setBusy(false);
  }
}
