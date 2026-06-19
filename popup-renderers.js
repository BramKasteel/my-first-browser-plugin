function renderPayload(payload) {
  const payloadChanged = latestExtractPayload !== payload;
  latestExtractPayload = payload;
  if (payloadChanged) {
    clearPostFillSessionState();
    syncDisabledSellerStateForPayload(payload).catch(() => {
      appendStatus('Could not restore remembered disabled sellers for this scrape.', 'bad');
    });
    renderOptimizationResult(null);
  }
  syncSellerScrapeButton(isUiBusy);
  renderWorkflow();
}

function renderFrontendPayload(payload) {
  latestFrontendPayload = payload;
  renderWorkflow();
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
