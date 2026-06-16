function getVisiblePostFillSellerIds() {
  return getPostFillSellerChoices().map((seller) => textOf(seller?.seller_id)).filter(Boolean);
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
    meta.textContent = [
      `seller=${seller.seller_id}`,
      seller.country ? `country=${seller.country}` : null,
      `units=${seller.total_units || 0}`,
      `expected_shipping=${formatCurrencyAmount(seller.shipping_cost || 0, latestOptimizationResult?.currency || 'EUR')}`,
      `expected_total=${formatCurrencyAmount(seller.grand_total || 0, latestOptimizationResult?.currency || 'EUR')}`,
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