function sanitizeSellerDelay(value) {
  return Math.max(MIN_SELLER_DELAY_MS, parseInt(value, 10) || DEFAULT_SELLER_DELAY_MS);
}

async function getStorageArea() {
  return chrome.storage.session || chrome.storage.local;
}

async function loadSellerSettings() {
  const storageArea = await getStorageArea();
  const stored = await storageArea.get(SELLER_SETTINGS_KEY);
  const settings = stored[SELLER_SETTINGS_KEY] || {};
  sellerRequestDelayMs = sanitizeSellerDelay(settings.delayMs);
  syncOptimizerApiUrlInput();
  sellerReputationFilterEl.value = normalizeSellerReputation(settings.sellerReputationFilter);
  sellerDeliveryTimeFilterEl.value = normalizeMaxShippingTime(settings.sellerDeliveryTimeFilter);
  sellerTypeFilterEl.value = normalizeSellerType(settings.sellerTypeFilter);
  renderBuyerCountryOptions(settings.buyerCountry || inferBuyerCountry());
  selectedWantListId = textOf(settings.selectedWantListId);
  restoredWantListId = textOf(settings.selectedWantListId);
  setSelectedSellerCountries(getStoredSellerCountries(settings));
  setIncludeBargainsFromOtherCountries(settings.includeBargainsFromOtherCountries === true);
}

async function loadDetachedBatchState() {
  const storageArea = await getStorageArea();
  const stored = await storageArea.get(DETACHED_BATCH_STATE_KEY);
  const state = stored[DETACHED_BATCH_STATE_KEY];
  if (!state || !Array.isArray(state.items) || !state.items.length) {
    return [];
  }

  await storageArea.remove(DETACHED_BATCH_STATE_KEY);
  return state.items;
}

async function saveDetachedBatchState(items) {
  const storageArea = await getStorageArea();
  await storageArea.set({
    [DETACHED_BATCH_STATE_KEY]: {
      createdAt: new Date().toISOString(),
      items,
    },
  });
}

async function loadSourceTabBinding() {
  const storageArea = chrome.storage.local;
  const stored = await storageArea.get(SOURCE_TAB_BINDING_KEY);
  return stored[SOURCE_TAB_BINDING_KEY] || null;
}

async function saveSourceTabBinding(binding) {
  const storageArea = chrome.storage.local;
  if (!binding?.tabId) {
    await storageArea.remove(SOURCE_TAB_BINDING_KEY);
    return;
  }

  await storageArea.set({
    [SOURCE_TAB_BINDING_KEY]: {
      tabId: binding.tabId,
      title: textOf(binding.title),
      url: textOf(binding.url),
      updatedAt: binding.updatedAt || new Date().toISOString(),
    },
  });
}

async function loadRememberedDisabledSellerIds(lineageKey) {
  if (!textOf(lineageKey)) return [];

  const storageArea = await getStorageArea();
  const stored = await storageArea.get(POST_FILL_STATE_KEY);
  const state = stored[POST_FILL_STATE_KEY] || {};
  const entry = state[textOf(lineageKey)] || {};

  return Array.isArray(entry.sellerIds)
    ? entry.sellerIds.map((sellerId) => textOf(sellerId)).filter(Boolean)
    : [];
}

async function saveRememberedDisabledSellerIds(lineageKey, sellerIds) {
  if (!textOf(lineageKey)) return;

  const storageArea = await getStorageArea();
  const stored = await storageArea.get(POST_FILL_STATE_KEY);
  const state = stored[POST_FILL_STATE_KEY] || {};
  state[textOf(lineageKey)] = {
    sellerIds: [...new Set((sellerIds || []).map((sellerId) => textOf(sellerId)).filter(Boolean))],
    updatedAt: new Date().toISOString(),
  };

  await storageArea.set({
    [POST_FILL_STATE_KEY]: state,
  });
}

async function saveSellerSettings() {
  const storageArea = await getStorageArea();
  await storageArea.set({
    [SELLER_SETTINGS_KEY]: {
      delayMs: sellerRequestDelayMs,
      sellerReputationFilter: normalizeSellerReputation(sellerReputationFilterEl.value),
      sellerDeliveryTimeFilter: normalizeMaxShippingTime(sellerDeliveryTimeFilterEl.value),
      sellerTypeFilter: normalizeSellerType(sellerTypeFilterEl.value),
      sellerCountries: getSelectedSellerCountries(),
      includeBargainsFromOtherCountries: getIncludeBargainsFromOtherCountries(),
      buyerCountry: getSelectedBuyerCountry(),
      selectedWantListId: textOf(selectedWantListId),
    },
  });
}
