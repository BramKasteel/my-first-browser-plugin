function syncSellerScrapeButton(isBusy = false) {
  const hasItems = hasLoadedWantItems();
  const wantListPolicy = getWantListSelectionPolicy();
  const hasValidCountrySelection = getSelectedSellerCountries().length >= 1;
  const hasBuyerCountry = !!getSelectedBuyerCountry();
  scrapeAllItemsButton.disabled = isBusy || !hasItems || wantListPolicy.isBlocked || !hasValidCountrySelection || !hasBuyerCountry;
  scrapeAllItemsButton.classList.toggle('is-busy', isBusy);
  scrapeAllItemsButton.classList.toggle('secondary', !hasItems || wantListPolicy.isBlocked || !hasValidCountrySelection || !hasBuyerCountry);
  renderSellerFilterState();
  renderBuyerCountryState();
}

var sellerExpansionFilterCache = new Map();
var sellerPageHtmlCache = new Map();

function renderSellerFilterState() {
  const reputationFieldEl = sellerReputationFilterEl?.closest('.seller-filter-field');
  const deliveryFieldEl = sellerDeliveryTimeFilterEl?.closest('.seller-filter-field');
  const typeFieldEl = sellerTypeFilterEl?.closest('.seller-filter-field');
  const countryFieldEl = selectedSellerCountriesEl?.closest('.seller-filter-field');

  if (reputationFieldEl) {
    reputationFieldEl.classList.toggle('is-required', !normalizeSellerReputation(sellerReputationFilterEl?.value));
  }
  if (deliveryFieldEl) {
    deliveryFieldEl.classList.toggle('is-required', !normalizeMaxShippingTime(sellerDeliveryTimeFilterEl?.value));
  }
  if (typeFieldEl) {
    typeFieldEl.classList.toggle('is-required', !normalizeSellerType(sellerTypeFilterEl?.value));
  }
  if (countryFieldEl) {
    countryFieldEl.classList.toggle('is-required', getSelectedSellerCountries().length === 0);
  }
}

function renderBuyerCountryState() {
  if (!buyerCountryFieldEl) return;

  const isMissing = !getSelectedBuyerCountry();
  buyerCountryFieldEl.classList.toggle('is-required', isMissing);
}

function renderBuyerCountryOptions(selectedCountry = '') {
  if (!buyerCountrySelectEl) return;

  const normalizedSelectedCountry = normalizeCountryName(selectedCountry);
  buyerCountrySelectEl.replaceChildren();

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Select buyer country';
  placeholder.selected = !normalizedSelectedCountry;
  buyerCountrySelectEl.appendChild(placeholder);

  SELLER_COUNTRY_OPTIONS.forEach((country) => {
    const option = document.createElement('option');
    option.value = country;
    option.textContent = country;
    option.selected = normalizedSelectedCountry === normalizeCountryName(country);
    buyerCountrySelectEl.appendChild(option);
  });

  renderBuyerCountryState();
}

function refreshOptimizerPayloadFromCurrentState() {
  if (latestFrontendPayload?.kind !== 'seller-scrape-batch') {
    syncSellerScrapeButton(isUiBusy);
    return;
  }

  latestFrontendPayload = {
    ...latestFrontendPayload,
    requestSettings: {
      ...(latestFrontendPayload.requestSettings || {}),
      buyerCountry: getSelectedBuyerCountry(),
      sellerCountries: getSelectedSellerCountries(),
      includeBargainsFromOtherCountries: getIncludeBargainsFromOtherCountries(),
    },
  };
  renderFrontendPayload(latestFrontendPayload);
  renderPayload(buildOptimizerPayload(latestFrontendPayload));
}

function getOrderedSellerCountries(selectedCountries = []) {
  const selected = new Set((selectedCountries || []).map((value) => normalizeCountryName(value)).filter(Boolean));
  return [...SELLER_COUNTRY_OPTIONS].sort((left, right) => {
    const leftSelected = selected.has(normalizeCountryName(left));
    const rightSelected = selected.has(normalizeCountryName(right));
    if (leftSelected === rightSelected) {
      return left.localeCompare(right);
    }
    return leftSelected ? -1 : 1;
  });
}

function getSellerCountryQuery() {
  return textOf(sellerCountryFilterInputEl?.value).toLowerCase();
}

function countryMatchesQuery(country, query = getSellerCountryQuery()) {
  if (!query) return true;
  const normalizedCountry = textOf(country).toLowerCase();
  return normalizedCountry.includes(query);
}

function renderSellerCountryFilterList(selectedCountries = DEFAULT_SELLER_COUNTRIES) {
  const wantListPolicy = getWantListSelectionPolicy();
  const normalizedSelectedCountries = clampSellerCountriesToPolicy(selectedCountries, wantListPolicy);
  selectedSellerCountries = normalizedSelectedCountries;
  renderSellerCountryLimitHint(wantListPolicy);

  selectedSellerCountriesEl.replaceChildren();
  sellerLocationFilterListEl.replaceChildren();
  const selected = new Set(normalizedSelectedCountries);
  const maxCountriesReached = normalizedSelectedCountries.length >= wantListPolicy.maxSellerCountries;
  const query = getSellerCountryQuery();
  const otherCountriesSectionEl = sellerCountryFilterInputEl?.closest('.country-section');
  const otherCountriesLabelEl = otherCountriesSectionEl?.querySelector('.country-section-label');
  const isPickerDisabled = isUiBusy || wantListPolicy.isBlocked;
  const hideOtherCountries = isPickerDisabled || maxCountriesReached;

  if (sellerCountryFilterInputEl) {
    sellerCountryFilterInputEl.disabled = isPickerDisabled || maxCountriesReached;
    sellerCountryFilterInputEl.placeholder = maxCountriesReached
      ? "Two seller countries is the max."
      : 'Type seller country, ex. Ger';
    sellerCountryFilterInputEl.setAttribute('aria-expanded', String(!hideOtherCountries));
  }
  sellerLocationFilterListEl.hidden = hideOtherCountries;
  if (otherCountriesLabelEl) otherCountriesLabelEl.hidden = hideOtherCountries;

  if (normalizedSelectedCountries.length) {
    normalizedSelectedCountries.forEach((country) => {
      const chip = document.createElement('div');
      chip.className = 'country-chip';

      const text = document.createElement('span');
      text.textContent = country;

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'country-chip-remove';
      removeButton.dataset.countryRemove = country;
      removeButton.disabled = isUiBusy;
      removeButton.setAttribute('aria-label', `Remove ${country} from selected seller countries`);
      removeButton.textContent = 'x';

      chip.append(text, removeButton);
      selectedSellerCountriesEl.appendChild(chip);
    });
  } else {
    const empty = document.createElement('p');
    empty.className = 'country-empty';
    empty.textContent = 'No countries selected yet.';
    selectedSellerCountriesEl.appendChild(empty);
  }

  getOrderedSellerCountries(selectedCountries).forEach((country) => {
    if (selected.has(normalizeCountryName(country)) || !countryMatchesQuery(country, query)) {
      return;
    }

    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'country-option';
    option.dataset.countryOption = country;
    option.disabled = isPickerDisabled || maxCountriesReached;

    const text = document.createElement('span');
    text.textContent = country;

    option.append(text);
    sellerLocationFilterListEl.appendChild(option);
  });

  if (!isPickerDisabled && !sellerLocationFilterListEl.childElementCount) {
    const empty = document.createElement('p');
    empty.className = 'country-dropdown-empty';
    empty.textContent = query ? 'No matching countries.' : 'Type to search seller countries.';
    sellerLocationFilterListEl.appendChild(empty);
  }

  renderSellerFilterState();
  syncSellerScrapeButton(isUiBusy);
}

function getSelectedSellerCountries() {
  return [...selectedSellerCountries];
}

function setSelectedSellerCountries(countries) {
  renderSellerCountryFilterList(countries);
}

function getStoredSellerCountries(settings) {
  if (Array.isArray(settings.sellerCountries)) {
    return settings.sellerCountries.map((value) => normalizeCountryName(value)).filter(Boolean);
  }
  if (Array.isArray(settings.sellerLocationFilter)) {
    return settings.sellerLocationFilter.map((value) => normalizeCountryName(value)).filter(Boolean);
  }
  if (typeof settings.sellerLocationFilter === 'string') {
    return parseCountryFilterInput(settings.sellerLocationFilter);
  }
  return [];
}

function getSellerPagesPerCountry(itemCount = getLoadedWantDistinctItemCount()) {
  const normalizedItemCount = Math.max(0, parseInt(itemCount, 10) || 0);
  if (normalizedItemCount < 20) return 5;
  if (normalizedItemCount < 30) return 4;
  if (normalizedItemCount <= 40) return 3;
  if (normalizedItemCount <= 60) return 2;
  return 1;
}

function parseCardmarketRequestContext(urlValue) {
  if (!urlValue) return null;

  try {
    const url = new URL(urlValue);
    if (!isCardmarketUrl(url.toString())) {
      return null;
    }

    const pathParts = url.pathname.split('/').filter(Boolean);
    return {
      origin: url.origin,
      lang: pathParts[0] || 'en',
      game: pathParts[1] || 'Magic',
    };
  } catch {
    return null;
  }
}

async function resolveSellerRequestContext(item) {
  const fromItem = parseCardmarketRequestContext(item?.productUrl);
  if (fromItem) return fromItem;

  const tab = await getTargetTab();
  const fromTab = parseCardmarketRequestContext(tab?.url || '');
  if (fromTab) return fromTab;

  throw new Error('Could not determine Cardmarket language and game for seller scrape. Re-extract want items from a Cardmarket want list first.');
}

function normalizeSellerRequestBaseUrl(urlValue, originValue = 'https://cardmarket.com') {
  const url = new URL(urlValue, originValue);
  const pathParts = url.pathname.split('/').filter(Boolean);

  if (pathParts.length >= 5 && /^products$/i.test(pathParts[2]) && /^singles$/i.test(pathParts[3])) {
    const productSlug = pathParts[pathParts.length - 1] || '';
    if (productSlug) {
      url.pathname = `/${pathParts[0] || 'en'}/${pathParts[1] || 'Magic'}/Cards/${productSlug}`;
    }
  }

  url.search = '';
  url.hash = '';
  return url;
}

function buildSellerRequestUrl(urlValue, activeFilters = {}, originValue = 'https://cardmarket.com') {
  const url = normalizeSellerRequestBaseUrl(urlValue, originValue);
  if (activeFilters.expansionIds) {
    url.searchParams.set('idExpansion', activeFilters.expansionIds);
  }
  if (activeFilters.languageId) {
    url.searchParams.set('language', activeFilters.languageId);
  }
  if (activeFilters.isFoil != null) {
    url.searchParams.set('isFoil', activeFilters.isFoil ? 'Y' : 'N');
  }
  if (activeFilters.sellerCountryIds?.length) {
    url.searchParams.set('sellerCountry', activeFilters.sellerCountryIds.join(','));
  }
  if (activeFilters.sellerReputationId) {
    url.searchParams.set('sellerReputation', activeFilters.sellerReputationId);
  }
  if (activeFilters.maxShippingTimeId) {
    url.searchParams.set('maxShippingTime', activeFilters.maxShippingTimeId);
  }
  if (activeFilters.sellerTypeId) {
    url.searchParams.set('sellerType', activeFilters.sellerTypeId);
  }
  return url.toString();
}

function getRequestedExpansionNames(item) {
  const names = Array.isArray(item?.expansions) ? item.expansions : [];
  return [...new Set(names.map((value) => textOf(value)).filter(Boolean))];
}

function normalizeExpansionFilterLabel(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function stripExpansionFilterPrefix(value) {
  return textOf(value).replace(/^(?:expansion|set)\s*[:\-]\s*/i, '').trim();
}

function stripTrailingExpansionVariantCodes(value) {
  const tokens = textOf(value).split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return textOf(value);

  while (tokens.length > 1) {
    const lastToken = tokens[tokens.length - 1];
    const previousToken = tokens[tokens.length - 2] || '';
    const lastIsMixedCode = /^[a-z]*\d[a-z0-9/-]*$/i.test(lastToken) || /^\d+\/\d+$/i.test(lastToken);
    const previousIsMixedCode = /^[a-z]*\d[a-z0-9/-]*$/i.test(previousToken) || /^\d+\/\d+$/i.test(previousToken);
    const lastIsNumericCollector = /^\d+$/.test(lastToken) && previousIsMixedCode;
    if (!lastIsMixedCode && !lastIsNumericCollector) break;
    tokens.pop();
  }

  return tokens.join(' ');
}

function buildExpansionTokenKey(value) {
  const normalized = normalizeExpansionFilterLabel(value);
  if (!normalized) return '';

  const tokens = [...new Set(normalized.split(' ').filter(Boolean))];
  if (!tokens.length) return '';
  return tokens.sort().join(' ');
}

function buildExpansionMatchKeys(value) {
  const baseValue = textOf(value);
  if (!baseValue) return [];

  const normalizedKeys = [];
  const seenKeys = new Set();
  const variants = new Set();
  const queue = [baseValue];

  while (queue.length) {
    const currentValue = textOf(queue.shift());
    if (!currentValue || variants.has(currentValue)) continue;
    variants.add(currentValue);

    const withoutPrefix = stripExpansionFilterPrefix(currentValue);
    const withoutTrailingCodes = stripTrailingExpansionVariantCodes(currentValue);
    const withoutVersionSuffix = currentValue.replace(/\s*[:\-]?\s*version\s+\d+\s*$/i, '').trim();
    const withoutCodeParens = currentValue.replace(/\s*\((?=[^)]*(?:\d|\/))[^)]*\)\s*$/i, '').trim();

    [withoutPrefix, withoutTrailingCodes, withoutVersionSuffix, withoutCodeParens].forEach((nextValue) => {
      if (nextValue && !variants.has(nextValue)) queue.push(nextValue);
    });
  }
  variants.forEach((variant) => {
    const normalizedLabel = normalizeExpansionFilterLabel(variant);
    if (normalizedLabel) {
      const labelKey = `label:${normalizedLabel}`;
      if (!seenKeys.has(labelKey)) {
        seenKeys.add(labelKey);
        normalizedKeys.push(labelKey);
      }
    }

    const tokenKey = buildExpansionTokenKey(variant);
    if (tokenKey) {
      const keyedToken = `tokens:${tokenKey}`;
      if (!seenKeys.has(keyedToken)) {
        seenKeys.add(keyedToken);
        normalizedKeys.push(keyedToken);
      }
    }
  });

  return normalizedKeys;
}

function resolveExpansionIdsForRequestedName(requestedName, entriesByKey) {
  const matchKeys = buildExpansionMatchKeys(requestedName);
  for (const matchKey of matchKeys) {
    const labelEntries = entriesByKey.get(matchKey);
    if (!labelEntries || labelEntries.size !== 1) continue;

    const [ids] = [...labelEntries.values()];
    if (ids?.size) return [...ids];
  }

  return [];
}

function doesExpansionLabelMatchRequested(rowExpansionLabel, requestedExpansionNames) {
  const normalizedRowLabel = textOf(rowExpansionLabel);
  if (!normalizedRowLabel) return false;

  const rowMatchKeys = new Set(buildExpansionMatchKeys(normalizedRowLabel));
  return requestedExpansionNames.some((name) => buildExpansionMatchKeys(name)
    .some((matchKey) => rowMatchKeys.has(matchKey)));
}

function inspectAvailableExpansionFiltersInDocument(doc) {
  const select = doc.querySelector('select[name="idExpansion"], select[name^="idExpansion"], select#idExpansion, select[name="expansion"]');
  const seen = new Set();
  const selectOptions = select
    ? [...select.options].map((option) => ({
      rawName: select.name || '',
      value: textOf(option.value),
      label: textOf(option.textContent),
      selected: option.selected,
    }))
    : [];

  const checkboxOptions = [...doc.querySelectorAll('input[type="checkbox"][name^="idExpansion["]')].map((input) => ({
    rawName: textOf(input.getAttribute('name') || ''),
    value: textOf(input.getAttribute('value') || '') || textOf(input.getAttribute('name') || '').match(/^idExpansion\[(\d+)\]$/i)?.[1] || '',
    label: textOf(
      doc.querySelector(`label[for="${CSS.escape(input.id || '')}"]`)?.querySelector('span:last-child')?.textContent
      || doc.querySelector(`label[for="${CSS.escape(input.id || '')}"]`)?.textContent
      || input.closest('.form-check')?.querySelector('label')?.textContent
      || input.getAttribute('aria-label')
      || ''
    ),
    selected: input.checked,
  }));

  return [...selectOptions, ...checkboxOptions].filter((option) => {
    if (!/^\d+$/.test(option.value) || option.value === '0' || !option.label) return false;
    const marker = `${option.rawName}|${option.value}|${option.label}`;
    if (seen.has(marker)) return false;
    seen.add(marker);
    return true;
  });
}

function buildExpansionFilterCacheKey(item, requestContext) {
  return [
    textOf(requestContext?.origin),
    textOf(requestContext?.lang),
    textOf(requestContext?.game),
    textOf(item?.idProduct),
    textOf(item?.productUrl),
  ].join('|');
}

function matchExpansionIds(requestedExpansionNames, availableExpansionFilters) {
  const expansionIds = [];
  const matchedExpansionNames = [];
  const unmatchedExpansionNames = [];
  const entriesByKey = new Map();

  availableExpansionFilters.forEach((entry) => {
    const normalizedLabel = normalizeExpansionFilterLabel(entry?.label);
    const value = textOf(entry?.value);
    if (!normalizedLabel || !/^\d+$/.test(value) || value === '0') return;

    buildExpansionMatchKeys(entry?.label).forEach((matchKey) => {
      if (!entriesByKey.has(matchKey)) entriesByKey.set(matchKey, new Map());
      const labelsByKey = entriesByKey.get(matchKey);
      if (!labelsByKey.has(normalizedLabel)) labelsByKey.set(normalizedLabel, new Set());
      labelsByKey.get(normalizedLabel).add(value);
    });
  });

  requestedExpansionNames.forEach((name) => {
    const matchedIds = resolveExpansionIdsForRequestedName(name, entriesByKey);
    if (!matchedIds.length) {
      unmatchedExpansionNames.push(name);
      return;
    }
    matchedExpansionNames.push(name);
    matchedIds.forEach((value) => {
      if (!expansionIds.includes(value)) expansionIds.push(value);
    });
  });

  return {
    expansionIds: expansionIds.join(','),
    matchedExpansionNames,
    unmatchedExpansionNames,
  };
}

async function fetchAvailableExpansionFiltersForItem({ item, requestContext, requestFilters = {} }) {
  const runtimeContext = requestContext || parseCardmarketRequestContext(item?.productUrl);
  if (!runtimeContext) return { options: [], rateLimited: false };
  if (!item?.productUrl) return { options: [], rateLimited: false };

  const sanitizedFilters = { ...requestFilters };
  delete sanitizedFilters.expansionIds;

  const candidateUrls = [buildSellerRequestUrl(item.productUrl, sanitizedFilters, runtimeContext.origin)];
  const seenUrls = new Set();
  for (const candidateUrl of candidateUrls) {
    if (!candidateUrl || seenUrls.has(candidateUrl)) continue;
    seenUrls.add(candidateUrl);
    try {
      const response = await fetch(candidateUrl, { credentials: 'include' });
      if (response.status === 429) {
        return { options: [], rateLimited: true };
      }
      if (!response.ok) continue;
      const html = await response.text();
      if (!/cf-mitigated|cf-chl-bypass|Just a moment|Checking your browser|cf-browser-verification|Cloudflare Ray ID/i.test(html)) {
        sellerPageHtmlCache.set(candidateUrl, html);
      }
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const options = inspectAvailableExpansionFiltersInDocument(doc);
      if (options.length) {
        return { options, rateLimited: false };
      }
    } catch {
    }
  }

  return { options: [], rateLimited: false };
}

async function resolveItemExpansionRequestFilter({ item, requestContext, requestFilters = {} }) {
  const requestedExpansionNames = getRequestedExpansionNames(item);
  if (!requestedExpansionNames.length) {
    return {
      expansionIds: '',
      matchedExpansionNames: [],
      unmatchedExpansionNames: [],
      rateLimited: false,
    };
  }

  const cacheKey = buildExpansionFilterCacheKey(item, requestContext);
  let availableExpansionFilters = sellerExpansionFilterCache.get(cacheKey) || [];
  let rateLimited = false;

  if (!availableExpansionFilters.length) {
    const discovery = await fetchAvailableExpansionFiltersForItem({ item, requestContext, requestFilters });
    availableExpansionFilters = discovery.options || [];
    rateLimited = discovery.rateLimited === true;
    if (availableExpansionFilters.length) {
      sellerExpansionFilterCache.set(cacheKey, availableExpansionFilters);
    }
  }

  return {
    ...matchExpansionIds(requestedExpansionNames, availableExpansionFilters),
    rateLimited,
  };
}

function getBargainSellerCountryIds({ preferredCountryIds, availableSellerFilters }) {
  const excludedIds = new Set((preferredCountryIds || []).filter(Boolean));
  const supportedIds = new Set(getShippingRouteSupportedCountryIds());
  const sellerCountryOptions = Array.isArray(availableSellerFilters?.sellerCountry)
    ? availableSellerFilters.sellerCountry
    : [];

  return [...new Set(sellerCountryOptions
    .map((entry) => String(entry?.value || '').trim())
    .filter((value) => /^\d+$/.test(value) && supportedIds.has(value) && !excludedIds.has(value)))];
}

const BARGAIN_MIN_PREFERRED_PRICE_EUR = 5;

function isRelevantSellerFilterFieldName(name) {
  return /^(sellerCountry(?:\[[^\]]*\])?|sellerType(?:\[[^\]]*\])?|sellerReputation(?:\[[^\]]*\])?|maxShippingTime(?:\[[^\]]*\])?|idExpansion(?:\[[^\]]*\])?|language(?:\[[^\]]*\])?|minCondition(?:\[[^\]]*\])?|extra\[[^\]]+\]|apply)$/i.test(name || '');
}

async function executeSellerScopeScrape({
  item,
  delayMs,
  maxSellerPages,
  previewLimit,
  requestContext,
  requestLanguageId,
  expansionIds,
  sellerCountryIds,
  sellerReputationId,
  maxShippingTimeId,
  sellerTypeId,
  partitionLabel,
  onScopeStart,
}) {
  const requestIsFoil = typeof item?.isFoil === 'boolean' ? item.isFoil : null;
  const requestFilters = {
    languageId: requestLanguageId,
    isFoil: requestIsFoil,
    expansionIds,
    sellerCountryIds,
    sellerReputationId,
    maxShippingTimeId,
    sellerTypeId,
  };
  onScopeStart?.({ partitionLabel, sellerCountryIds, sellerTypeId });
  appendStatus(`Querying seller scope: ${describeSellerScope({ sellerCountryIds, sellerTypeId })}.`);
  const scopeResult = await scrapeSingleWantItemSellers({
    item,
    delay: delayMs,
    maxSellerPages,
    previewLimit,
    requestFilters,
    requestContext,
  });
  return scopeResult || null;
}

async function scrapeWantItemSellerData({ requestContext, item, delayMs, onScopeStart }) {
  await ensureSellerScrapeNotCoolingDown();

  const requestLanguageId = getCardmarketLanguageId(getSingleItemLanguage(item));
  const requestIsFoil = typeof item?.isFoil === 'boolean' ? item.isFoil : null;
  const requestCountryIds = getCardmarketCountryIdsFromCountries(getSelectedSellerCountries());
  const sellerReputationId = getCardmarketSellerReputationId(sellerReputationFilterEl.value);
  const maxShippingTimeId = getCardmarketMaxShippingTimeId(sellerDeliveryTimeFilterEl.value);
  const sellerTypeId = getCardmarketSellerTypeId(sellerTypeFilterEl.value);
  const maxSellerPages = getSellerPagesPerCountry();
  const baseRequestFilters = {
    languageId: requestLanguageId,
    isFoil: requestIsFoil,
    sellerCountryIds: requestCountryIds,
    sellerReputationId,
    maxShippingTimeId,
    sellerTypeId,
  };
  const expansionFilter = await resolveItemExpansionRequestFilter({ item, requestContext, requestFilters: baseRequestFilters });
  if (expansionFilter.expansionIds) {
    baseRequestFilters.expansionIds = expansionFilter.expansionIds;
  }
  if (expansionFilter.unmatchedExpansionNames.length) {
    const itemLabel = textOf(item?.productName) || textOf(item?.idProduct) || 'wanted item';
    if (expansionFilter.rateLimited) {
      appendStatus(`Expansion lookup rate-limited for ${itemLabel}. Scraping without expansion filter.`, 'bad');
    } else if (expansionFilter.matchedExpansionNames.length) {
      appendStatus(`Expansion partial match for ${itemLabel}. Skipped: ${expansionFilter.unmatchedExpansionNames.join(', ')}.`, 'bad');
    } else {
      appendStatus(`Could not match expansions for ${itemLabel}: ${expansionFilter.unmatchedExpansionNames.join(', ')}. Scraping without expansion filter.`, 'bad');
    }
  }
  const preferredResult = await executeSellerScopeScrape({
    item,
    delayMs,
    maxSellerPages,
    previewLimit: 12,
    requestContext,
    requestLanguageId,
    expansionIds: baseRequestFilters.expansionIds,
    sellerCountryIds: requestCountryIds,
    sellerReputationId,
    maxShippingTimeId,
    sellerTypeId,
    partitionLabel: 'preferred-countries',
    onScopeStart,
  });
  if (!preferredResult) {
    throw new Error('Seller scrape returned no result. Reload the Cardmarket tab and try again.');
  }

  let result = preferredResult;
  if (getIncludeBargainsFromOtherCountries()) {
    const cheapestPreferredOfferPrice = getCheapestSellerOfferPrice(preferredResult.sellers);
    if (cheapestPreferredOfferPrice !== null && cheapestPreferredOfferPrice >= BARGAIN_MIN_PREFERRED_PRICE_EUR) {
      const bargainCountryIds = getBargainSellerCountryIds({
        preferredCountryIds: requestCountryIds,
        availableSellerFilters: preferredResult.availableSellerFilters,
      });
      if (bargainCountryIds.length) {
        const bargainResult = await executeSellerScopeScrape({
          item,
          delayMs,
          maxSellerPages,
          previewLimit: 12,
          requestContext,
          requestLanguageId,
          expansionIds: baseRequestFilters.expansionIds,
          sellerCountryIds: bargainCountryIds,
          sellerReputationId,
          maxShippingTimeId,
          sellerTypeId,
          partitionLabel: 'bargain-countries',
          onScopeStart,
        });
        if (bargainResult) {
          bargainResult.partitionLabel = 'bargains';
          result = mergeSellerScopeResults(preferredResult, [bargainResult]);
        }
      }
    } else if (cheapestPreferredOfferPrice !== null) {
      const itemLabel = textOf(item?.productName) || textOf(item?.idProduct) || 'wanted item';
      appendStatus(`Skipping bargain-country scrape for ${itemLabel}. Cheapest preferred-country offer is ${formatCurrencyAmount(cheapestPreferredOfferPrice)}.`, 'good');
    }
  }

  if (result.rateLimited) {
    await setSellerCooldownUntil(Date.now() + SELLER_COOLDOWN_MS);
  }

  return { filteredResult: result };
}

function parseSellerRow(el) {
  const row = {};
  const idMatch = (el.id || '').match(/articleRow(\d+)/);
  row.articleId = idMatch ? idMatch[1] : '';
  const actionButton = el.querySelector('.btn.btn-grey, .btn[title], .btn[aria-label], button[title], button[aria-label]');
  const actionTitle = textOf(actionButton?.getAttribute('title') || actionButton?.getAttribute('aria-label') || '');
  row.buyBlockedReason = actionTitle;
  row.buyBlocked = /you cannot buy the offered item|does not ship to your country|blacklist/i.test(actionTitle)
    || actionButton?.classList?.contains('btn-grey')
    || false;

  const sellerColumn = el.querySelector('.col-seller') || el;
  const sellerLink = sellerColumn.querySelector('a[href*="/Users/"]') || el.querySelector('a[href*="/Users/"]');
  row.sellerName = textOf(sellerLink?.textContent);
  row.sellerUrl = sellerLink?.getAttribute('href')
    ? (sellerLink.getAttribute('href').startsWith('http') ? sellerLink.getAttribute('href') : `https://www.cardmarket.com${sellerLink.getAttribute('href')}`)
    : '';
  row.location = extractSellerLocation(sellerColumn, row.sellerName);
  row.condition = textOf(el.querySelector('.article-condition .badge, .article-condition')?.textContent);

  const expansionLink = el.querySelector('a[href*="/Expansions/"]');
  row.expansionName = textOf(
    expansionLink?.getAttribute('aria-label')
    || expansionLink?.getAttribute('title')
    || expansionLink?.textContent
    || ''
  );

  const languageNode = [...el.querySelectorAll('span[aria-label], span[data-bs-original-title], span[data-original-title], span[title]')]
    .find((node) => /^(Deutsch|Englisch|Französisch|Italienisch|Spanisch|Portugiesisch|Japanisch|Koreanisch|Chinesisch|Russisch|S-Chinesisch|T-Chinesisch|English|German|French|Italian|Spanish|Portuguese|Japanese|Korean|Chinese|Russian)$/
      .test(node.getAttribute('aria-label') || node.getAttribute('data-bs-original-title') || node.getAttribute('data-original-title') || node.getAttribute('title') || ''));
  row.language = textOf(
    languageNode?.getAttribute('aria-label')
    || languageNode?.getAttribute('data-bs-original-title')
    || languageNode?.getAttribute('data-original-title')
    || languageNode?.getAttribute('title')
  );

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
  row.amount = el.querySelector('input.amount-input, input[name^="groupCountAmount"]')?.getAttribute('max') || displayCount || '';
  row.reverse = /Reverse\s*Holo/i.test(el.textContent || '');
  return row;
}

function extractSellerLocation(sellerColumn, sellerName) {
  const explicitLocationNode = sellerColumn.querySelector('[aria-label^="Item location:" i], [data-bs-original-title^="Item location:" i], [data-original-title^="Item location:" i], [title^="Item location:" i]');
  if (explicitLocationNode) {
    const explicitLabel = textOf(
      explicitLocationNode.getAttribute('aria-label')
      || explicitLocationNode.getAttribute('data-bs-original-title')
      || explicitLocationNode.getAttribute('data-original-title')
      || explicitLocationNode.getAttribute('title')
      || ''
    );
    const explicitCountry = extractCountryFromLabel(explicitLabel, { allowShortCodes: true });
    if (explicitCountry) return explicitCountry;
  }

  const candidateNodes = [...sellerColumn.querySelectorAll('[class*="flag" i], [class*="country" i], img[alt], [aria-label], [data-bs-original-title], [data-original-title], [title]')];
  for (const node of candidateNodes) {
    const label = textOf(
      node.getAttribute('aria-label')
      || node.getAttribute('data-bs-original-title')
      || node.getAttribute('data-original-title')
      || node.getAttribute('title')
      || node.getAttribute('alt')
      || ''
    );
    if (!label) continue;
    if (sellerName && label === sellerName) continue;
    if (/seller|user|account|profile|outstanding|very good|good|professional|private|powerseller/i.test(label)) continue;

    const country = extractCountryFromLabel(label, {
      allowShortCodes: /item\s+location|ships?\s+from|country/i.test(label) || isLikelyCountryIndicatorNode(node),
    });
    if (country) return country;
  }

  return '';
}

function isLikelyCountryIndicatorNode(node) {
  if (!node || typeof node.matches !== 'function') return false;
  if (node.matches('[class*="flag" i], [class*="country" i], img[alt], [data-country], [data-country-name]')) return true;
  return !!node.closest?.('[class*="flag" i], [class*="country" i], [data-country], [data-country-name]');
}

function extractCountryFromLabel(label, { allowShortCodes = false } = {}) {
  const itemLocationMatch = textOf(label).match(/item\s+location\s*:\s*(.+)$/i);
  if (itemLocationMatch) {
    const explicitMatch = normalizeCountryNameLocal(itemLocationMatch[1], { allowShortCodes: true });
    if (explicitMatch) return explicitMatch;
  }

  const directMatch = normalizeCountryNameLocal(label, { allowShortCodes });
  if (directMatch) return directMatch;

  const stripped = textOf(label)
    .replace(/<[^>]+>/g, ' ')
    .replace(/[():|]/g, ' ')
    .replace(/ships?\s+from/gi, ' ')
    .replace(/item\s+location/gi, ' ')
    .replace(/country/gi, ' ');
  const words = stripped.split(/\s+/).filter(Boolean);
  for (let size = Math.min(3, words.length); size >= 1; size -= 1) {
    for (let index = 0; index <= words.length - size; index += 1) {
      const chunk = words.slice(index, index + size).join(' ');
      const country = normalizeCountryNameLocal(chunk, { allowShortCodes });
      if (country) return country;
    }
  }

  return '';
}

function normalizeCountryNameLocal(value, { allowShortCodes = false } = {}) {
  const normalized = textOf(value).toLowerCase();
  if (!normalized) return '';
  if (!allowShortCodes && /^[a-z]{2}$/i.test(normalized)) return '';
  return normalizeCountryName(normalized);
}

async function scrapeSingleWantItemSellers({ item, delay, previewLimit, requestFilters = {}, maxSellerPages = 4, maxFetchAttempts = 4, jitterRatio, requestContext }) {
  if (!item?.productUrl) {
    return {
      error: 'Missing Cardmarket product URL for seller scrape. Re-extract want items from the Cardmarket want list and try again.',
      item,
      sellers: [],
      totalSellers: 0,
      pagesFetched: 0,
      marketPath: '',
      attemptedUrls: [],
      debugSnippet: '',
      rateLimited: false,
    };
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const effectiveJitterRatio = Number.isFinite(Number(jitterRatio)) ? Number(jitterRatio) : 0.15;
  const applyLocalJitter = (baseMs) => {
    const safeBase = Math.max(0, parseInt(baseMs, 10) || 0);
    if (!safeBase || effectiveJitterRatio <= 0) return safeBase;
    const spread = safeBase * effectiveJitterRatio;
    const jittered = safeBase + ((Math.random() * 2) - 1) * spread;
    return Math.max(0, Math.round(jittered));
  };
  const SELLER_PAGE_SIZE_HINT = 50;
  const MAX_SELLER_PAGES = Math.max(1, Math.min(6, parseInt(maxSellerPages, 10) || 4));
  const MAX_SELLER_ROWS = Math.max(SELLER_PAGE_SIZE_HINT, MAX_SELLER_PAGES * SELLER_PAGE_SIZE_HINT);
  const runtimeContext = requestContext || parseCardmarketRequestContext(item?.productUrl) || {
    origin: 'https://cardmarket.com',
    lang: 'en',
    game: 'Magic',
  };
  const { origin, lang, game } = runtimeContext;
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
  let availableSellerFilters = null;

  while (page <= MAX_SELLER_PAGES) {
    const candidatesForPage = selectedBase ? [selectedBase] : [...baseCandidates];
    let pageResolved = false;

    for (const candidate of candidatesForPage) {
      const request = candidate.currentRequest || { url: candidate.url, method: 'GET' };
      attemptedUrls.push(request.method === 'POST' ? `POST ${request.url}` : request.url);
      const fetchResult = await fetchWithRetry(request);
      if (fetchResult.error) {
        return { error: fetchResult.error, item, sellers, totalSellers: sellers.length, pagesFetched, marketPath, attemptedUrls, debugSnippet, rateLimited };
      }

      const { html, doc, ajaxMeta } = fetchResult;
      if (ajaxMeta) {
        candidate.ajaxDebug = {
          decodeMode: ajaxMeta.decodeMode,
          newPage: ajaxMeta.newPage,
          maxPaginatedResultsReached: ajaxMeta.maxPaginatedResultsReached,
          rowsPreview: (ajaxMeta.rowsHtml || '').slice(0, 300),
        };
      }
      if (!debugSnippet) debugSnippet = (doc.querySelector('main, #main, .main-content, body')?.innerHTML || html).slice(0, 2500);

      if (page === 1 && !selectedBase && isCardOverviewWithoutRows(doc)) {
        const discoveredCandidates = discoverProductDetailCandidates(doc);
        if (discoveredCandidates.length) baseCandidates = mergeCandidates(baseCandidates, discoveredCandidates);
      }

      const rowEls = [...doc.querySelectorAll('[id^="articleRow"].article-row, .article-row')];
      if (!rowEls.length) continue;

      if (!selectedBase) selectedBase = candidate;

      if (page === 1) {
        totalPagesSeen = detectTotalPages(doc) || 1;
        availableSellerFilters = inspectAvailableSellerFiltersInDocument(doc, request.url);
      }

      const nextLoadMorePage = ajaxMeta?.newPage || ((request.method || 'GET').toUpperCase() === 'POST' ? page + 1 : page);
      const nextRequest = (!ajaxMeta?.maxPaginatedResultsReached)
        ? (detectLoadMoreRequest(doc, request.url, nextLoadMorePage, candidate)
        || detectNextPageRequest(doc, request.url)
        || buildFallbackPagedRequest(request.url, page + 1))
        : null;

      const requestedExpansionNames = getRequestedExpansionNames(item);
      let addedThisPage = 0;
      for (const el of rowEls) {
        if (sellers.length >= MAX_SELLER_ROWS) break;
        const seller = parseSellerRow(el);
        if (seller.buyBlocked) continue;
        if (requestedExpansionNames.length && !doesExpansionLabelMatchRequested(seller.expansionName, requestedExpansionNames)) continue;
        if (!seller.articleId || seen.has(seller.articleId)) continue;
        seen.add(seller.articleId);
        sellers.push(seller);
        addedThisPage += 1;
      }

      pagesFetched += 1;
      pageResolved = true;
      if (sellers.length >= MAX_SELLER_ROWS) {
        page = 999;
      } else if (!addedThisPage) {
        page = 999;
      } else {
        page += 1;
        const pageLooksFull = rowEls.length >= SELLER_PAGE_SIZE_HINT;
        const hasNextPage = hasNextPageHint(doc);
        if (totalPagesSeen > 1) {
          if (page > totalPagesSeen) page = 999;
        } else if (!pageLooksFull && !hasNextPage && !nextRequest) {
          page = 999;
        }
        candidate.currentRequest = page < 999 ? nextRequest : null;
        if (!candidate.currentRequest && page < 999) page = 999;
      }
      if (delay && page < 999) await sleep(applyLocalJitter(delay));
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
    requestFilters,
    availableSellerFilters,
    marketPath: selectedBase?.url || marketPath,
    attemptedUrls,
    debugSnippet,
    ajaxDebug: selectedBase?.ajaxDebug || null,
    rateLimited,
  };

  function buildInitialBaseCandidates() {
    const productUrl = buildSellerRequestUrl(item.productUrl, requestFilters, origin);
    return [{ url: productUrl, currentRequest: { url: productUrl, method: 'GET' }, label: 'productUrl' }];
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

  function detectTotalPages(doc) {
    let maxPage = 0;
    doc.querySelectorAll('a[href*="site="], a[href*="page="]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      const match = href.match(/[?&](?:site|page)=(\d+)/);
      if (match) maxPage = Math.max(maxPage, parseInt(match[1], 10));
    });
    const numberedLinks = [...doc.querySelectorAll('.pagination a, nav[aria-label*="pagination" i] a, .page-link')]
      .map((link) => parseInt(textOf(link.textContent), 10))
      .filter((value) => Number.isFinite(value));
    if (numberedLinks.length) {
      maxPage = Math.max(maxPage, ...numberedLinks);
    }
    return maxPage;
  }

  function hasNextPageHint(doc) {
    if (doc.querySelector('a[rel="next"], link[rel="next"]')) return true;
    const nextLink = [...doc.querySelectorAll('.pagination a, nav[aria-label*="pagination" i] a, .page-link')]
      .find((link) => /next|weiter|suivant|successivo|siguiente|›|»/i.test(textOf(link.textContent) || link.getAttribute('aria-label') || ''));
    return !!nextLink;
  }

  function detectNextPageRequest(doc, currentUrl) {
    const relNext = doc.querySelector('a[rel="next"], link[rel="next"]');
    const relHref = relNext?.getAttribute('href');
    if (relHref) return { url: new URL(relHref, currentUrl).toString(), method: 'GET' };

    const paginationLinks = [...doc.querySelectorAll('.pagination a[href], nav[aria-label*="pagination" i] a[href], .page-link[href]')];
    const nextLink = paginationLinks.find((link) => {
      const label = `${textOf(link.textContent)} ${textOf(link.getAttribute('aria-label'))}`;
      return /next|weiter|suivant|successivo|siguiente|›|»/i.test(label);
    });
    const nextHref = nextLink?.getAttribute('href');
    if (nextHref) return { url: new URL(nextHref, currentUrl).toString(), method: 'GET' };

    return null;
  }

  function buildFallbackPagedRequest(currentUrl, pageNumber) {
    if (!pageNumber || pageNumber < 2) return null;
    const url = new URL(currentUrl, origin);
    if (url.searchParams.has('site')) {
      url.searchParams.set('site', String(pageNumber));
      return { url: url.toString(), method: 'GET' };
    }
    if (url.searchParams.has('page')) {
      url.searchParams.set('page', String(pageNumber));
      return { url: url.toString(), method: 'GET' };
    }
    url.searchParams.set('site', String(pageNumber));
    return { url: url.toString(), method: 'GET' };
  }

  function detectLoadMoreRequest(doc, currentUrl, currentPage, candidate) {
    const button = doc.querySelector('#loadMoreButton');
    if (button) {
      const form = button.closest('form');
      candidate.loadMoreMeta = extractLoadMoreMeta(doc, form, button, currentUrl);
    }
    return buildLoadMoreRequest(candidate.loadMoreMeta, currentPage);
  }

  function buildLoadMoreRequest(meta, currentPage) {
    if (!meta?.actionUrl) return null;
    const formData = new FormData();
    if (meta.cmtkn) formData.set('__cmtkn', meta.cmtkn);
    formData.set('page', String(currentPage));
    formData.set('filterSettings', meta.filterSettings || '[]');
    if (meta.idMetacard) formData.set('idMetacard', meta.idMetacard);
    for (const field of (meta.extraFields || [])) {
      formData.append(field.name, field.value);
    }
    if (meta.buttonName) formData.append(meta.buttonName, meta.buttonValue || '');
    return { url: meta.actionUrl, method: meta.method || 'POST', body: formData };
  }

  function inspectAvailableSellerFiltersInDocument(doc, currentUrl) {
    const textValue = (value) => String(value || '').trim().replace(/\s+/g, ' ');
    const filterForm = doc.querySelector('form[action*="Product_Filter_FilterMetacard"], form[action*="FilterMetacard"]');
    const nodes = [...doc.querySelectorAll('input[name], select[name], textarea[name]')]
      .filter((node) => isRelevantSellerFilterFieldName(node.name || ''));
    const filters = {};

    for (const node of nodes) {
      const rawName = node.name || '';
      const fieldKey = rawName.replace(/\[.*\]$/, '');
      if (!filters[fieldKey]) filters[fieldKey] = [];

      if (node.tagName === 'SELECT') {
        const options = [...node.options].map((option) => ({
          rawName,
          value: option.value,
          label: textValue(option.textContent),
          selected: option.selected,
        })).filter((option) => option.value || option.label);
        filters[fieldKey].push(...options);
        continue;
      }

      filters[fieldKey].push({
        rawName,
        value: node.value || '',
        label: extractInputLabel(node),
        checked: node.checked === true,
        type: node.type || node.tagName.toLowerCase(),
      });
    }

    Object.keys(filters).forEach((key) => {
      const seenMarkers = new Set();
      filters[key] = filters[key].filter((entry) => {
        const marker = `${entry.rawName}|${entry.value}|${entry.label || ''}`;
        if (seenMarkers.has(marker)) return false;
        seenMarkers.add(marker);
        return true;
      });
    });

    mergeActiveValues(filters, collectActiveQuery(currentUrl), 'url');
    mergeActiveValues(filters, collectFormData(filterForm), 'form');
    return filters;

    function collectActiveQuery(urlValue) {
      const url = new URL(urlValue, origin);
      const values = {};
      url.searchParams.forEach((value, key) => {
        if (!isRelevantSellerFilterFieldName(key)) return;
        if (!values[key]) values[key] = [];
        values[key].push(value);
      });
      return values;
    }

    function collectFormData(form) {
      const values = {};
      if (!form) return values;
      for (const field of form.querySelectorAll('input[name], select[name], textarea[name]')) {
        const rawName = field.name || '';
        if (!isRelevantSellerFilterFieldName(rawName) || field.disabled) continue;
        if ((field.type === 'checkbox' || field.type === 'radio') && !field.checked) continue;
        if (!values[rawName]) values[rawName] = [];
        values[rawName].push(field.value || '');
      }
      return values;
    }

    function mergeActiveValues(targetFilters, activeValues, source) {
      Object.entries(activeValues).forEach(([rawName, values]) => {
        const fieldKey = rawName.replace(/\[.*\]$/, '');
        if (!targetFilters[fieldKey]) targetFilters[fieldKey] = [];
        const seenMarkers = new Set(targetFilters[fieldKey].map((entry) => `${entry.rawName}|${entry.value}`));
        values.forEach((value) => {
          const marker = `${rawName}|${value}`;
          if (seenMarkers.has(marker)) return;
          seenMarkers.add(marker);
          targetFilters[fieldKey].push({
            rawName,
            value,
            label: '',
            active: true,
            source,
          });
        });
      });
    }

    function extractInputLabel(node) {
      const directLabel = node.closest('label');
      if (directLabel) return textValue(directLabel.textContent);
      const id = node.getAttribute('id');
      if (id) {
        const forLabel = doc.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (forLabel) return textValue(forLabel.textContent);
      }
      const wrapper = node.closest('.form-check, .checkbox, .radio, .filter-row, li, .list-group-item, .form-group');
      if (wrapper) return textValue(wrapper.textContent);
      const siblingText = [node.nextSibling, node.previousSibling]
        .map((sibling) => textValue(sibling?.textContent || ''))
        .find(Boolean);
      return siblingText || '';
    }
  }

  function extractLoadMoreMeta(doc, form, button, currentUrl) {
    const getValue = (selector) => form?.querySelector(selector)?.value || doc.querySelector(selector)?.value || '';
    const getAttr = (selector, attr) => form?.querySelector(selector)?.getAttribute(attr) || doc.querySelector(selector)?.getAttribute(attr) || '';
    let idMetacard = getValue('input[name="idMetacard"]');
    if (!idMetacard) {
      idMetacard = getAttr('[data-id-metacard]', 'data-id-metacard') || getAttr('[data-metacard-id]', 'data-metacard-id') || '';
    }
    const action = form?.getAttribute('action') || `/${lang}/${game}/AjaxAction/Metacard_LoadMoreArticles`;
    const method = (form?.getAttribute('method') || 'POST').toUpperCase();
    const actionUrl = action.startsWith('http') ? action : new URL(action, currentUrl).toString();
    const extraFields = [];
    for (const field of (form?.querySelectorAll('input, textarea, select') || [])) {
      const name = field.getAttribute('name');
      if (!name || field.disabled) continue;
      if (name === '__cmtkn' || name === 'page' || name === 'filterSettings' || name === 'idMetacard' || name === 'idLanguage' || name === 'idLanguage[]') continue;
      if ((field.type === 'checkbox' || field.type === 'radio') && !field.checked) continue;
      extraFields.push({ name, value: field.value || '' });
    }
    return {
      actionUrl,
      method,
      cmtkn: getValue('input[name="__cmtkn"]'),
      filterSettings: getValue('input[name="filterSettings"]') || '[]',
      idMetacard,
      extraFields,
      buttonName: button?.getAttribute('name') || '',
      buttonValue: button?.value || '',
    };
  }

  async function fetchWithRetry(request) {
    if ((request.method || 'GET').toUpperCase() === 'GET' && sellerPageHtmlCache.has(request.url)) {
      const html = sellerPageHtmlCache.get(request.url) || '';
      sellerPageHtmlCache.delete(request.url);
      if (/cf-mitigated|cf-chl-bypass|Just a moment|Checking your browser|cf-browser-verification|Cloudflare Ray ID/i.test(html)) {
        rateLimited = true;
        return { error: 'Cardmarket returned a Cloudflare challenge page.' };
      }
      const ajaxMeta = parseAjaxResponseMeta(html);
      if (ajaxMeta) {
        const rowsHtml = ajaxMeta.rowsHtml || '<div></div>';
        return { html: rowsHtml, doc: new DOMParser().parseFromString(rowsHtml, 'text/html'), ajaxMeta };
      }
      return { html, doc: new DOMParser().parseFromString(html, 'text/html'), ajaxMeta: null };
    }

    let res = null;
    for (let attempt = 0; attempt < Math.max(1, parseInt(maxFetchAttempts, 10) || 1); attempt += 1) {
      try {
        const options = { method: request.method || 'GET', credentials: 'include', headers: {} };
        if ((request.method || 'GET').toUpperCase() !== 'GET') {
          options.body = request.body;
          options.headers['X-Requested-With'] = 'XMLHttpRequest';
        }
        res = await fetch(request.url, options);
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
    const ajaxMeta = parseAjaxResponseMeta(html);
    if (ajaxMeta) {
      const rowsHtml = ajaxMeta.rowsHtml || '<div></div>';
      return { html: rowsHtml, doc: new DOMParser().parseFromString(rowsHtml, 'text/html'), ajaxMeta };
    }
    return { html, doc: new DOMParser().parseFromString(html, 'text/html'), ajaxMeta: null };
  }

  function parseAjaxResponseMeta(html) {
    if (!/<ajaxResponse[\s>]/i.test(html)) return null;
    const xml = new DOMParser().parseFromString(html, 'text/xml');
    const rowsNode = xml.querySelector('rows');
    const newPageNode = xml.querySelector('newPage');
    const maxReachedNode = xml.querySelector('maxPaginatedResultsReached');
    const decodedRows = decodeAjaxRowsHtml(rowsNode?.textContent || '');
    const newPage = parseInt(textOf(newPageNode?.textContent), 10);
    const maxPaginatedResultsReached = textOf(maxReachedNode?.textContent) === '1';
    return {
      rowsHtml: decodedRows.html,
      decodeMode: decodedRows.mode,
      newPage: Number.isFinite(newPage) ? newPage : null,
      maxPaginatedResultsReached,
    };
  }

  function decodeAjaxRowsHtml(value) {
    if (!value) return { html: '', mode: 'empty' };
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    const entityDecoded = (textarea.value || value).trim();
    if (/^\s*</.test(entityDecoded) || /articleRow\d+|class=("|')article-row\1/i.test(entityDecoded)) {
      return { html: entityDecoded, mode: 'html-entity' };
    }
    if (entityDecoded.length >= 32 && entityDecoded.length % 4 === 0 && /^[A-Za-z0-9+/=\s]+$/.test(entityDecoded) && /={0,2}$/.test(entityDecoded)) {
      try {
        const binary = atob(entityDecoded.replace(/\s+/g, ''));
        const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
        const base64Decoded = new TextDecoder('utf-8').decode(bytes);
        textarea.innerHTML = base64Decoded;
        const htmlDecoded = (textarea.value || base64Decoded).trim();
        if (/^\s*</.test(htmlDecoded) || /articleRow\d+|class=("|')article-row\1/i.test(htmlDecoded)) {
          return { html: htmlDecoded, mode: 'base64' };
        }
      } catch {
      }
    }
    return { html: entityDecoded, mode: 'raw' };
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

}

async function handleScrapeAllItems() {
  if (!isPersistentWorkspace) {
    try {
      if (!latestExtractedItems.length) {
        throw new Error('Extract want items first so the popup has products to scrape.');
      }

      appendStatus('Opening optimizer workspace tab so run keeps going while you browse elsewhere...', 'good');
      finishRun('Opening batch scrape workspace.', 'good');
      await saveDetachedBatchState(latestExtractedItems);
      await openWorkspaceWindow({ autoStart: 'scrapeAll' });
      window.close();
      return;
    } catch (error) {
      appendStatus(error.message, 'bad');
      finishRun(error.message, 'bad');
      return;
    }
  }

  startRun('Scraping seller rows for all extracted want items...');
  setBusy(true);
  try {
    appendStatus('Starting serial seller scrape for all extracted want items...', 'good');
    if (!latestExtractedItems.length) {
      throw new Error('Extract want items first so the popup has products to scrape.');
    }

    setStepActivity({
      kind: 'seller-scrape',
      label: 'Preparing seller scrape...',
      detail: 'Validating extracted items and seller filters for this run.',
      current: 0,
      total: latestExtractedItems.length,
    });
    if (typeof focusLiveActivityPanel === 'function') {
      focusLiveActivityPanel();
    }

    const requestContext = await resolveSellerRequestContext(latestExtractedItems.find((item) => item?.productUrl) || latestExtractedItems[0]);
    const delayMs = sellerRequestDelayMs;
    await ensureSellerScrapeNotCoolingDown();

    setStepActivity({
      kind: 'seller-scrape',
      label: 'Seller scrape running.',
      detail: `Using ${delayMs} ms pacing between seller requests.`,
      current: 0,
      total: latestExtractedItems.length,
    });

    const startedAt = new Date().toISOString();
    const aggregateResults = [];
    const previewSellers = [];
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    let totalSellerRows = 0;
    let rateLimited = false;
    let stopReason = '';

    for (let index = 0; index < latestExtractedItems.length; index += 1) {
      const item = latestExtractedItems[index];
      const itemLabel = item.productName || item.idProduct || `item ${index + 1}`;

      if (!item.idProduct) {
        setStepActivity({
          kind: 'seller-scrape',
          label: `Skipping item ${index + 1} of ${latestExtractedItems.length}.`,
          detail: `${itemLabel} has no idProduct, so no seller request can be made.`,
          current: index + 1,
          total: latestExtractedItems.length,
        });
        skippedCount += 1;
        aggregateResults.push({
          item,
          skipped: true,
          error: 'Missing idProduct on extracted want item.',
        });
        appendStatus(`Skipping item ${index + 1}/${latestExtractedItems.length}: ${itemLabel} has no idProduct.`, 'bad');
        continue;
      }

      setStepActivity({
        kind: 'seller-scrape',
        label: `Scraping item ${index + 1} of ${latestExtractedItems.length}.`,
        detail: itemLabel,
        current: index,
        total: latestExtractedItems.length,
      });
      appendStatus(`Scraping item ${index + 1}/${latestExtractedItems.length}: ${itemLabel}.`);

      let scrapeOutcome = null;
      try {
        scrapeOutcome = await scrapeWantItemSellerData({
          requestContext,
          item,
          delayMs,
          onScopeStart: ({ partitionLabel, sellerCountryIds }) => {
            const scopeName = describeSellerScopeLabel({ partitionLabel, sellerCountryIds });
            setStepActivity({
              kind: 'seller-scrape',
              label: `${itemLabel} (${scopeName})`,
              current: index + 1,
              total: latestExtractedItems.length,
            });
          },
        });
      } catch (error) {
        setStepActivity({
          kind: 'seller-scrape',
          label: `Seller scrape stopped on item ${index + 1} of ${latestExtractedItems.length}.`,
          detail: error.message,
          current: index + 1,
          total: latestExtractedItems.length,
        });
        failedCount += 1;
        stopReason = error.message;
        aggregateResults.push({
          item,
          error: error.message,
          stopped: true,
        });
        appendStatus(`Stopped on item ${index + 1}/${latestExtractedItems.length}: ${error.message}`, 'bad');
        break;
      }

      const { filteredResult } = scrapeOutcome;
      if (filteredResult.error) {
        setStepActivity({
          kind: 'seller-scrape',
          label: `Item ${index + 1} finished with warning.`,
          detail: filteredResult.error,
          current: index + 1,
          total: latestExtractedItems.length,
        });
        failedCount += 1;
        aggregateResults.push({
          item,
          error: filteredResult.error,
          rateLimited: !!filteredResult.rateLimited,
          totalSellers: filteredResult.totalSellers || 0,
          pagesFetched: filteredResult.pagesFetched || 0,
          marketPath: filteredResult.marketPath || '',
          requestFilters: filteredResult.requestFilters || null,
          attemptedUrls: filteredResult.attemptedUrls || [],
          partitionCount: filteredResult.partitionCount || 1,
          sellers: filteredResult.sellers || [],
        });
        appendStatus(`Item ${index + 1}/${latestExtractedItems.length} failed: ${filteredResult.error}`, 'bad');
        if (filteredResult.rateLimited) {
          rateLimited = true;
          stopReason = filteredResult.error;
          break;
        }
        continue;
      }

      successCount += 1;
      totalSellerRows += filteredResult.totalSellers || 0;
      aggregateResults.push({
        item,
        error: '',
        rateLimited: !!filteredResult.rateLimited,
        totalSellers: filteredResult.totalSellers || 0,
        pagesFetched: filteredResult.pagesFetched || 0,
        marketPath: filteredResult.marketPath || '',
        requestFilters: filteredResult.requestFilters || null,
        attemptedUrls: filteredResult.attemptedUrls || [],
        partitionCount: filteredResult.partitionCount || 1,
        sellers: filteredResult.sellers || [],
      });

      filteredResult.sellers.forEach((seller) => {
        if (previewSellers.length >= 12) return;
        previewSellers.push({
          ...seller,
          wantItemName: item.productName || item.idProduct || '',
        });
      });

      setStepActivity({
        kind: 'seller-scrape',
        label: `Finished item ${index + 1} of ${latestExtractedItems.length}.`,
        detail: `${itemLabel}: ${filteredResult.totalSellers} seller rows kept.`,
        current: index + 1,
        total: latestExtractedItems.length,
      });

      appendStatus(
        `Item ${index + 1}/${latestExtractedItems.length}: ${filteredResult.totalSellers} seller rows for ${itemLabel}.`,
        filteredResult.totalSellers ? 'good' : 'bad'
      );

      if (filteredResult.rateLimited) {
        rateLimited = true;
        stopReason = 'Seller scraping paused after rate limiting.';
        break;
      }
    }

    renderSummary([
      { label: 'Scrape scope', value: 'All extracted items from the current page', tone: 'good' },
      { label: 'Items extracted', value: String(latestExtractedItems.length) },
      { label: 'Items scraped', value: String(successCount), tone: successCount ? 'good' : '' },
      { label: 'Items failed', value: String(failedCount), tone: failedCount ? 'bad' : '' },
      { label: 'Items skipped', value: String(skippedCount), tone: skippedCount ? 'bad' : '' },
      { label: 'Seller rows kept', value: String(totalSellerRows), tone: totalSellerRows ? 'good' : '' },
      { label: 'Rate limited', value: rateLimited ? 'yes' : 'no', tone: rateLimited ? 'bad' : '' },
      { label: 'Stopped reason', value: stopReason || 'completed' },
    ]);
    renderSellers(previewSellers, totalSellerRows, 'the extracted want list');
    const batchPayload = {
      kind: 'seller-scrape-batch',
      wantListId: latestExtractedItems[0]?.wantListId || '',
      startedAt,
      finishedAt: new Date().toISOString(),
      requestSettings: {
        delayMs,
        buyerCountry: getSelectedBuyerCountry(),
        sellerReputation: normalizeSellerReputation(sellerReputationFilterEl.value),
        maxShippingTime: normalizeMaxShippingTime(sellerDeliveryTimeFilterEl.value),
        sellerType: normalizeSellerType(sellerTypeFilterEl.value),
        sellerCountries: getSelectedSellerCountries(),
        includeBargainsFromOtherCountries: getIncludeBargainsFromOtherCountries(),
      },
      totals: {
        extractedItems: latestExtractedItems.length,
        successCount,
        failedCount,
        skippedCount,
        totalSellerRows,
        rateLimited,
        stopReason,
      },
      results: aggregateResults,
    };
    const optimizerPayload = buildOptimizerPayload(batchPayload);
    const scrapeCompleteForOptimization = !!optimizerPayload && !stopReason && failedCount === 0 && skippedCount === 0;
    renderFrontendPayload(batchPayload);
    renderPayload(optimizerPayload);
    setActiveWorkflowStep('sellers', { force: true });
    setActiveResultTab('sellers');

    if (scrapeCompleteForOptimization) {
      appendStatus(
        `Optimizer payload ready: ${optimizerPayload.items.length} items, ${optimizerPayload.sellers.length} sellers, ${optimizerPayload.offers.length} offers.`,
        'good'
      );
      await submitOptimizationRequest(DEFAULT_OPTIMIZER_API_URL, {
        payloadOverride: optimizerPayload,
        kickoffMessage: 'Seller scrape complete. Sending payload to optimizer.',
      });
      return;
    } else if (optimizerPayload) {
      appendStatus('Seller scrape produced partial data. Optimization skipped until all items scrape cleanly.', 'bad');
    } else {
      appendStatus('No optimizer payload built. Seller rows missing valid price data.', 'bad');
    }

    if (stopReason) {
      appendStatus(`Batch scrape stopped: ${stopReason}`, rateLimited ? 'bad' : '');
      finishRun(`Batch scrape stopped: ${stopReason}`, rateLimited ? 'bad' : '');
    } else {
      setStepActivity({
        kind: 'seller-scrape',
        label: 'Seller scrape complete.',
        detail: `Processed ${successCount + failedCount + skippedCount} of ${latestExtractedItems.length} items.`,
        current: latestExtractedItems.length,
        total: latestExtractedItems.length,
      });
      const completionMessage = `Batch scrape completed for ${successCount} extracted item${successCount === 1 ? '' : 's'}.`;
      appendStatus(completionMessage, successCount ? 'good' : 'bad');
      finishRun(completionMessage, successCount ? 'good' : 'bad');
    }
  } catch (error) {
    appendStatus(error.message, 'bad');
    finishRun(error.message, 'bad');
  } finally {
    setStepActivity(null);
    setBusy(false);
  }

  syncSellerScrapeButton();
}

function shouldPartitionSellerScrape(baseResult, countryScopes) {
  if (!baseResult || baseResult.error) return false;
  if (!countryScopes.length) return false;
  if (countryScopes.length === 1 && (baseResult.requestFilters?.sellerCountryIds || []).length === 1) return false;
  if ((baseResult.requestFilters?.sellerCountryIds || []).length > 1) return true;
  return isSellerScopeLikelyCapped(baseResult, 250);
}

function buildSellerCountryScopes({ requestCountryIds, availableSellerFilters }) {
  const explicitIds = [...new Set((requestCountryIds || []).filter(Boolean))];
  if (explicitIds.length > 1) {
    return explicitIds.map((countryId) => ({ countryId, label: `country:${countryId}` }));
  }
  if (explicitIds.length === 1) return [{ countryId: explicitIds[0], label: `country:${explicitIds[0]}` }];

  const sellerCountryOptions = Array.isArray(availableSellerFilters?.sellerCountry)
    ? availableSellerFilters.sellerCountry
    : [];
  const discoveredIds = [...new Set(sellerCountryOptions
    .map((entry) => String(entry?.value || '').trim())
    .filter((value) => /^\d+$/.test(value)))];

  return discoveredIds.map((countryId) => ({ countryId, label: `country:${countryId}` }));
}

function isSellerScopeLikelyCapped(result, minimumSellerCount = 300) {
  if (!result || result.error) return false;
  if (result.ajaxDebug?.maxPaginatedResultsReached) return true;
  return (result.totalSellers || 0) >= minimumSellerCount;
}

function mergeSellerScopeResults(baseResult, partitionResults) {
  const allResults = [baseResult, ...(partitionResults || [])].filter(Boolean);
  const seedResult = baseResult || partitionResults?.[0] || {};
  const hasBaseResult = !!baseResult;
  const mergedSellers = [];
  const seenArticleIds = new Set();
  const attemptedUrls = [];
  const seenAttempts = new Set();
  let pagesFetched = 0;
  let rateLimited = false;
  let firstError = '';

  allResults.forEach((result, index) => {
    pagesFetched += result.pagesFetched || 0;
    rateLimited = rateLimited || !!result.rateLimited;
    if (!firstError && result.error) firstError = result.error;
    (result.attemptedUrls || []).forEach((attempt) => {
      const scopedAttempt = index === 0 ? attempt : `${result.partitionLabel || 'partition'} -> ${attempt}`;
      if (seenAttempts.has(scopedAttempt)) return;
      seenAttempts.add(scopedAttempt);
      attemptedUrls.push(scopedAttempt);
    });
    (result.sellers || []).forEach((seller) => {
      if (!seller?.articleId || seenArticleIds.has(seller.articleId)) return;
      seenArticleIds.add(seller.articleId);
      mergedSellers.push(seller);
    });
  });

  return {
    ...seedResult,
    error: firstError,
    sellers: mergedSellers,
    sellerPreview: mergedSellers.slice(0, 12),
    totalSellers: mergedSellers.length,
    pagesFetched,
    attemptedUrls,
    partitionCount: allResults.length,
    partitions: allResults.map((result, index) => ({
      label: result.partitionLabel || (hasBaseResult && index === 0 ? 'base' : `partition-${index + 1}`),
      sellerCount: result.totalSellers || 0,
      pagesFetched: result.pagesFetched || 0,
      rateLimited: !!result.rateLimited,
      error: result.error || '',
      requestFilters: result.requestFilters || null,
    })),
  };
}

function getAllNonPreferredSellerCountryIds(preferredCountryIds = []) {
  const preferred = new Set((preferredCountryIds || []).map(String));
  return getCardmarketCountryIdsFromCountries(SELLER_COUNTRY_OPTIONS)
    .filter((countryId) => !preferred.has(String(countryId)));
}

function getCheapestSellerOfferPrice(sellers = []) {
  let cheapestPrice = null;
  (sellers || []).forEach((seller) => {
    const parsedPrice = parseEuroAmount(seller?.price);
    if (parsedPrice === null) return;
    if (cheapestPrice === null || parsedPrice < cheapestPrice) {
      cheapestPrice = parsedPrice;
    }
  });
  return cheapestPrice;
}

async function ensureSellerScrapeNotCoolingDown() {
  const cooldownUntil = await getSellerCooldownUntil();
  if (cooldownUntil > Date.now()) {
    throw new Error(`Seller scraping is paused after rate limiting. Try again in ${formatRemaining(cooldownUntil - Date.now())}.`);
  }
}

function describeSellerScope({ sellerCountryIds, sellerTypeId }) {
  const countries = [...new Set((sellerCountryIds || []).filter(Boolean))]
    .map((countryId) => getCountryNameById(countryId) || `country:${countryId}`);
  const parts = [];
  if (countries.length === 1) {
    parts.push(`country ${countries[0]}`);
  } else if (countries.length > 1) {
    parts.push(`countries ${countries.join(', ')}`);
  } else {
    parts.push('all seller countries');
  }

  const explicitSellerType = sellerTypeFilterEl?.value || '';
  const normalizedSellerType = normalizeSellerType(explicitSellerType);
  if (normalizedSellerType) parts.push(`${normalizedSellerType} sellers`);

  return parts.join(', ');
}

function describeSellerScopeLabel({ partitionLabel, sellerCountryIds }) {
  if (partitionLabel) return partitionLabel;

  const countries = [...new Set((sellerCountryIds || []).filter(Boolean))]
    .map((countryId) => getCountryNameById(countryId) || `country:${countryId}`);

  if (!countries.length) return 'All countries';
  if (countries.length === 1) return countries[0];
  return countries.join(', ');
}


