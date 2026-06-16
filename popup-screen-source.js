function hasLoadedWantItems() {
  return latestExtractedItems.length > 0;
}

function hasSelectedWantList() {
  return !!textOf(selectedWantListId);
}

function formatSourceTabLabel(tab) {
  const title = textOf(tab?.title) || 'Cardmarket tab';
  const url = textOf(tab?.url);

  try {
    const parsed = new URL(url);
    return `${title} (${parsed.pathname || '/'})`;
  } catch {
    return title;
  }
}

function renderSourceTabOptions() {
  if (!sourceTabSelectEl) return;

  const selectedTabId = Number.isInteger(boundSourceTabId)
    ? String(boundSourceTabId)
    : '';

  sourceTabSelectEl.replaceChildren();
  if (!availableSourceTabs.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No open Cardmarket tabs found';
    sourceTabSelectEl.appendChild(option);
    sourceTabSelectEl.value = '';
    return;
  }

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose Cardmarket tab';
  placeholder.selected = !selectedTabId;
  sourceTabSelectEl.appendChild(placeholder);

  availableSourceTabs.forEach((tab) => {
    const option = document.createElement('option');
    option.value = String(tab.id);
    option.textContent = formatSourceTabLabel(tab);
    option.selected = String(tab.id) === selectedTabId;
    sourceTabSelectEl.appendChild(option);
  });

  sourceTabSelectEl.value = selectedTabId;
}

function renderSourceTabStatus(message = '', tone = '') {
  if (!sourceTabStatusEl) return;

  sourceTabStatusEl.textContent = message;
  sourceTabStatusEl.hidden = !message;
  sourceTabStatusEl.classList.toggle('good', tone === 'good');
  sourceTabStatusEl.classList.toggle('bad', tone === 'bad');

  if (refreshSourceTabsButton) {
    refreshSourceTabsButton.hidden = tone === 'good';
  }
}

async function refreshSourceTabOptions({ announce = false } = {}) {
  const tabs = await queryOpenCardmarketTabs();
  availableSourceTabs = tabs.map((tab) => ({
    id: tab.id,
    title: textOf(tab.title),
    url: textOf(tab.url),
    active: tab.active === true,
  }));

  renderSourceTabOptions();

  if (!availableSourceTabs.length) {
    boundSourceTabId = null;
    await saveSourceTabBinding(null);
    renderSourceTabStatus('No Cardmarket tabs found. Please log in to Cardmarket first.', 'bad');
    return [];
  }

  if (Number.isInteger(boundSourceTabId) && availableSourceTabs.some((tab) => tab.id === boundSourceTabId)) {
    const boundTab = availableSourceTabs.find((tab) => tab.id === boundSourceTabId) || null;
    renderSourceTabStatus(boundTab ? `Connected to ${formatSourceTabLabel(boundTab)}.` : '', 'good');
    return availableSourceTabs;
  }

  await bindSourceTabById(availableSourceTabs[0].id, { announce });
  return availableSourceTabs;
}

async function loadSourceTabBindingIntoState() {
  const stored = await loadSourceTabBinding();
  boundSourceTabId = Number.isInteger(stored?.tabId) ? stored.tabId : null;
}

async function bindSourceTabById(tabId, { announce = true } = {}) {
  const numericTabId = parseInt(tabId, 10);
  if (!Number.isInteger(numericTabId)) {
    throw new Error('Choose a Cardmarket tab first.');
  }

  const tab = await chrome.tabs.get(numericTabId);
  if (!isCardmarketUrl(tab?.url || '')) {
    throw new Error('Selected tab is no longer a Cardmarket page. Refresh tab list and choose again.');
  }

  boundSourceTabId = tab.id;
  await saveSourceTabBinding({
    tabId: tab.id,
    title: tab.title,
    url: tab.url,
  });
  await refreshSourceTabOptions();

  if (announce) {
    appendStatus(`Bound Cardmarket source tab: ${formatSourceTabLabel(tab)}.`, 'good');
  }
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

function renderWantListWarning(message = '') {
  if (!wantListWarningEl) return;
  wantListWarningEl.textContent = message;
  wantListWarningEl.hidden = !message;
}

async function refreshWantListWarning() {
  try {
    const tab = await getTargetTab();
    if (!tab?.url) {
      renderWantListWarning('Choose an open Cardmarket tab in the source selector first.');
      return;
    }

    if (!isCardmarketUrl(tab.url)) {
      renderWantListWarning('Bound source tab is no longer a Cardmarket page. Rebind it.');
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

async function handleBindSourceTab() {
  try {
    await bindSourceTabById(sourceTabSelectEl?.value || '', { announce: true });
    await refreshWantLists({ quiet: true });
    await refreshWantListWarning();
  } catch (error) {
    renderSourceTabStatus(error.message, 'bad');
    appendStatus(error.message, 'bad');
  }
}

async function handleExtractItems() {
  startRun('Preparing selected Cardmarket want list extraction...');
  setBusy(true);
  try {
    const tab = await ensureCardmarketTab();
    if (!hasSelectedWantList()) {
      throw new Error('Pick want list in dropdown before loading cards.');
    }

    const selectedWantList = availableWantLists.find((entry) => entry.id === selectedWantListId) || null;
    const extractionLabel = selectedWantList?.name || `want list ${selectedWantListId}`;
    renderWantListWarning(`Loading items from ${extractionLabel}. Keep Cardmarket tab open.`);
    startRun(`Extracting want items from ${extractionLabel}...`);

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
