function hasLoadedWantItems() {
  return latestExtractedItems.length > 0;
}

function hasSelectedWantList() {
  return !!textOf(selectedWantListId);
}

function renderWantListState() {
  if (!wantListFieldEl) return;

  wantListFieldEl.classList.toggle('is-required', availableWantLists.length > 0 && !hasSelectedWantList());
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
  renderWantListState();
  if (confirmWantListButton) {
    confirmWantListButton.hidden = !hasLoadedItems;
    confirmWantListButton.disabled = isBusy || !hasLoadedItems || wantListPolicy.isBlocked;
    confirmWantListButton.classList.toggle('is-busy', false);
    confirmWantListButton.classList.toggle('secondary', !hasLoadedItems || wantListPolicy.isBlocked);
  }
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
    renderWantListState();
    return;
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select want list';
  placeholder.selected = !hasSelectedWantList();
  wantListSelectEl.appendChild(placeholder);

  availableWantLists.forEach((wantList) => {
    const option = document.createElement('option');
    option.value = wantList.id;
    option.textContent = wantList.name;
    wantListSelectEl.appendChild(option);
  });
  wantListSelectEl.value = selectedWantListId;
  renderWantListState();
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
    const expansions = Array.isArray(item?.expansions)
      ? item.expansions.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    meta.textContent = [
      `want=${item.idWant || '?'}`,
      `product=${item.idProduct || '?'}`,
      `qty=${item.quantity || '1'}`,
      languages.length ? `langs=${languages.join(', ')}` : null,
      expansions.length ? `exp=${expansions.join(', ')}` : null,
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
