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
  if (cartSellers.length) {
    setPostFillSellerChoicesFromCart(cartSellers);
  }
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
        Number.isFinite(item.price_rank) && Number.isFinite(item.price_rank_total)
          ? `rank=${item.price_rank}/${item.price_rank_total}`
          : null,
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

async function submitOptimizationRequest(endpoint, { payloadOverride = null } = {}) {
  const requestPayload = await buildOptimizationRequestPayload(payloadOverride || latestExtractPayload);

  if (!requestPayload) {
    const message = 'No optimizer payload ready yet. Scrape sellers first.';
    appendStatus(message, 'bad');
    finishRun(message, 'bad');
    return false;
  }

  if (!getSelectedBuyerCountry()) {
    const message = 'Buyer country missing. Choose buyer country before running optimizer.';
    appendStatus(message, 'bad');
    finishRun(message, 'bad');
    return false;
  }

  if (!textOf(endpoint)) {
    const message = 'Optimizer API URL missing in config.js.';
    appendStatus(message, 'bad');
    finishRun(message, 'bad');
    return false;
  }

  syncOptimizerApiUrlInput();
  await saveSellerSettings();

  startRun('Waiting for optimizer reply...');
  setBusy(true);
  try {
    setStepActivity({
      kind: 'optimizer-request',
      label: 'Warming optimizer API.',
      detail: 'Sending health check request before posting optimization payload.',
      indeterminate: true,
    });
    startRun('Warming optimizer API before optimization request...');
    await warmOptimizerApi(endpoint, { reason: 'before optimize', force: true });
    startRun('Sending payload to optimizer API...');
    const requestBody = JSON.stringify(requestPayload);
    setStepActivity({
      kind: 'optimizer-request',
      label: 'Posting payload to optimizer API.',
      detail: `Sending ${requestPayload.items.length} items, ${requestPayload.sellers.length} sellers, and ${requestPayload.offers.length} offers to optimizer.`,
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
      { label: 'Grand total', value: formatCurrencyAmount(result?.totals?.grand_total || 0, result.currency || 'EUR'), tone: isUsableCart ? 'good' : '' },
      { label: 'Item subtotal', value: formatCurrencyAmount(result?.totals?.item_subtotal || 0, result.currency || 'EUR') },
      { label: 'Shipping total', value: formatCurrencyAmount(result?.totals?.shipping_total || 0, result.currency || 'EUR') },
      { label: 'Chosen sellers', value: String(result?.cart?.total_sellers || 0) },
      { label: 'Total units', value: String(result?.cart?.total_units || 0) },
    ]);
    setActiveWorkflowStep(isUsableCart ? 'fill' : 'sellers', { force: true });
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

  return true;
}
