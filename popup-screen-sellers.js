function syncSellerScrapeButton(isBusy = false) {
  const hasItems = hasLoadedWantItems();
  const wantListPolicy = getWantListSelectionPolicy();
  scrapeAllItemsButton.disabled = isBusy || !hasItems || wantListPolicy.isBlocked;
  scrapeAllItemsButton.classList.toggle('is-busy', isBusy);
  scrapeAllItemsButton.classList.toggle('secondary', !hasItems || wantListPolicy.isBlocked);
  renderSellerFilterState();
}

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
    syncOptimizeButton(isUiBusy);
    return;
  }

  latestFrontendPayload = {
    ...latestFrontendPayload,
    requestSettings: {
      ...(latestFrontendPayload.requestSettings || {}),
      buyerCountry: getSelectedBuyerCountry(),
    },
  };
  renderFrontendPayload(latestFrontendPayload);
  renderPayload(buildOptimizerPayload(latestFrontendPayload));
}

function getActiveSellerFilters(item) {
  const requestedLanguages = getItemLanguages(item);
  const allowedCountries = getSelectedSellerCountries();
  const sellerReputation = normalizeSellerReputation(sellerReputationFilterEl.value);
  const maxShippingTime = normalizeMaxShippingTime(sellerDeliveryTimeFilterEl.value);
  const sellerType = normalizeSellerType(sellerTypeFilterEl.value);
  return {
    requestedLanguages,
    allowedCountries,
    sellerReputation,
    maxShippingTime,
    sellerType,
    locationFilterText: allowedCountries.join(', '),
  };
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

function renderSellerCountryFilterList(selectedCountries = DEFAULT_SELLER_COUNTRIES) {
  const wantListPolicy = getWantListSelectionPolicy();
  const normalizedSelectedCountries = clampSellerCountriesToPolicy(selectedCountries, wantListPolicy);
  selectedSellerCountries = normalizedSelectedCountries;
  renderSellerCountryLimitHint(wantListPolicy);

  selectedSellerCountriesEl.replaceChildren();
  sellerLocationFilterListEl.replaceChildren();
  const selected = new Set(normalizedSelectedCountries);
  const maxCountriesReached = normalizedSelectedCountries.length >= wantListPolicy.maxSellerCountries;
  const otherCountriesSectionEl = sellerLocationFilterListEl.parentElement;
  const otherCountriesLabelEl = otherCountriesSectionEl?.querySelector('.country-section-label');

  sellerLocationFilterListEl.hidden = maxCountriesReached;
  if (otherCountriesLabelEl) otherCountriesLabelEl.hidden = maxCountriesReached;

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
    if (selected.has(normalizeCountryName(country))) {
      return;
    }

    const option = document.createElement('label');
    option.className = 'country-option';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = 'sellerCountryFilter';
    input.value = country;
    input.checked = false;
    input.disabled = isUiBusy || wantListPolicy.isBlocked || maxCountriesReached;

    const text = document.createElement('span');
    text.textContent = country;

    option.append(input, text);
    sellerLocationFilterListEl.appendChild(option);
  });

  renderSellerFilterState();
}

function getSelectedSellerCountries() {
  return [...selectedSellerCountries];
}

function setSelectedSellerCountries(countries) {
  renderSellerCountryFilterList(countries);
}

function getStoredSellerCountries(settings) {
  if (Array.isArray(settings.sellerLocationFilter)) {
    return settings.sellerLocationFilter.map((value) => normalizeCountryName(value)).filter(Boolean);
  }
  if (typeof settings.sellerLocationFilter === 'string') {
    return parseCountryFilterInput(settings.sellerLocationFilter);
  }
  return [];
}

async function handleScrapeAllItems() {
  if (!isDetached) {
    try {
      if (!latestExtractedItems.length) {
        throw new Error('Extract want items first so the popup has products to scrape.');
      }

      appendStatus('Opening batch scrape workspace so run keeps going after this popup closes...', 'good');
      finishRun('Opening batch scrape workspace.', 'good');
        await saveDetachedBatchState(latestExtractedItems);
      await openDetachedPopup({ autoStart: 'scrapeAll' });
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
    void warmOptimizerApi(DEFAULT_OPTIMIZER_API_URL, { reason: 'seller scrape start' });
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
          logPartitionRetry: false,
          onScopeStart: ({ partitionLabel, sellerCountryIds }) => {
            const scopeName = partitionLabel
              || (sellerCountryIds?.length === 1 ? getCountryNameById(sellerCountryIds[0]) : '')
              || 'All countries';
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
          unfilteredTotalSellers: filteredResult.unfilteredTotalSellers || 0,
          pagesFetched: filteredResult.pagesFetched || 0,
          marketPath: filteredResult.marketPath || '',
          requestFilters: filteredResult.requestFilters || null,
          filtersApplied: filteredResult.filtersApplied || null,
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
        unfilteredTotalSellers: filteredResult.unfilteredTotalSellers || 0,
        pagesFetched: filteredResult.pagesFetched || 0,
        marketPath: filteredResult.marketPath || '',
        requestFilters: filteredResult.requestFilters || null,
        filtersApplied: filteredResult.filtersApplied || null,
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
    renderFrontendPayload(batchPayload);
    renderPayload(optimizerPayload);
    if (optimizerPayload) {
      void warmOptimizerApi(DEFAULT_OPTIMIZER_API_URL, { reason: 'seller scrape finished', force: true });
    }
    setActiveWorkflowStep(optimizerPayload ? 'optimize' : 'sellers', { force: true });
    setActiveResultTab('sellers');

    if (optimizerPayload) {
      appendStatus(
        `Optimizer payload ready: ${optimizerPayload.items.length} items, ${optimizerPayload.sellers.length} sellers, ${optimizerPayload.offers.length} offers.`,
        'good'
      );
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

function hasPowerSellerFilterOption(availableSellerFilters) {
  const sellerTypeOptions = Array.isArray(availableSellerFilters?.sellerType)
    ? availableSellerFilters.sellerType
    : [];
  return sellerTypeOptions.some((entry) => {
    const value = String(entry?.value || '').trim();
    const label = String(entry?.label || '').trim();
    return value === '2' || /power\s+seller/i.test(label);
  });
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

  if (sellerTypeId === getCardmarketSellerTypeId('Power Seller')) {
    parts.push('Power Seller subset');
  } else {
    const explicitSellerType = sellerTypeFilterEl?.value || '';
    const normalizedSellerType = normalizeSellerType(explicitSellerType);
    if (normalizedSellerType) parts.push(`${normalizedSellerType} sellers`);
  }

  return parts.join(', ');
}

async function executeSellerScopeScrape({
  item,
  delayMs,
  previewLimit,
  requestContext,
  requestLanguageId,
  sellerCountryIds,
  sellerReputationId,
  maxShippingTimeId,
  sellerTypeId,
  partitionLabel,
  logPowerSellerFallback,
  onScopeStart,
}) {
  const requestFilters = {
    languageId: requestLanguageId,
    sellerCountryIds,
    sellerReputationId,
    maxShippingTimeId,
    sellerTypeId,
  };
  onScopeStart?.({
    partitionLabel,
    sellerCountryIds,
    sellerTypeId,
  });
  appendStatus(`Querying seller scope: ${describeSellerScope({ sellerCountryIds, sellerTypeId })}.`);
  let scopeResult = await scrapeSingleWantItemSellers({
    item,
    delay: delayMs,
    previewLimit,
    requestFilters,
    requestContext,
  });
  if (!scopeResult) return null;

  const powerSellerTypeId = getCardmarketSellerTypeId('Power Seller');
  const shouldRetryWithPowerSeller = !sellerTypeId
    && hasPowerSellerFilterOption(scopeResult.availableSellerFilters)
    && isSellerScopeLikelyCapped(scopeResult, 300);

  if (shouldRetryWithPowerSeller) {
    if (logPowerSellerFallback) {
      appendStatus(`${partitionLabel} looks capped. Applying Power Seller subset.`, 'good');
    }
    appendStatus(`Querying seller scope: ${describeSellerScope({ sellerCountryIds, sellerTypeId: powerSellerTypeId })}.`);
    const powerSellerResult = await scrapeSingleWantItemSellers({
      item,
      delay: delayMs,
      previewLimit,
      requestFilters: {
        ...requestFilters,
        sellerTypeId: powerSellerTypeId,
      },
      requestContext,
    });
    if (powerSellerResult) {
      powerSellerResult.powerSellerFallbackApplied = true;
      scopeResult = powerSellerResult;
    }
  }

  return scopeResult;
}

async function scrapeWantItemSellerData({ requestContext, item, delayMs, logPartitionRetry, onScopeStart }) {
  await ensureSellerScrapeNotCoolingDown();

  const requestLanguageId = getCardmarketLanguageId(getSingleItemLanguage(item));
  const requestCountryIds = getCardmarketCountryIdsFromCountries(getSelectedSellerCountries());
  const sellerReputationId = getCardmarketSellerReputationId(sellerReputationFilterEl.value);
  const maxShippingTimeId = getCardmarketMaxShippingTimeId(sellerDeliveryTimeFilterEl.value);
  const sellerTypeId = getCardmarketSellerTypeId(sellerTypeFilterEl.value);
  const baseRequestFilters = {
    languageId: requestLanguageId,
    sellerCountryIds: requestCountryIds,
    sellerReputationId,
    maxShippingTimeId,
    sellerTypeId,
  };
  const explicitCountryScopes = buildSellerCountryScopes({
    requestCountryIds,
    availableSellerFilters: null,
  });
  let result;

  if (explicitCountryScopes.length) {
    const partitionLabels = explicitCountryScopes.map((scope) => getCountryNameById(scope.countryId) || scope.label);
    if (logPartitionRetry && explicitCountryScopes.length > 1) {
      appendStatus(`Scraping ${explicitCountryScopes.length} country partitions directly: ${partitionLabels.join(', ')}.`, 'good');
    }
    const partitionResults = [];
    for (const scope of explicitCountryScopes) {
      const scopeLabel = getCountryNameById(scope.countryId) || scope.label;
      const scopeResult = await executeSellerScopeScrape({
        item,
        delayMs,
        previewLimit: 12,
        requestContext,
        requestLanguageId,
        sellerCountryIds: [scope.countryId],
        sellerReputationId,
        maxShippingTimeId,
        sellerTypeId,
        partitionLabel: scopeLabel,
        logPowerSellerFallback: logPartitionRetry,
        onScopeStart,
      });
      if (scopeResult) {
        scopeResult.partitionLabel = scope.label;
        partitionResults.push(scopeResult);
      }
    }
    if (!partitionResults.length) {
      throw new Error('Seller scrape returned no result. Reload the Cardmarket tab and try again.');
    }
    result = mergeSellerScopeResults(null, partitionResults);
  } else {
    const baseResult = await scrapeSingleWantItemSellers({
      item,
      delay: delayMs,
      previewLimit: 12,
      requestFilters: baseRequestFilters,
      requestContext,
    });
    if (!baseResult) {
      throw new Error('Seller scrape returned no result. Reload the Cardmarket tab and try again.');
    }
    result = baseResult;

    const countryScopes = buildSellerCountryScopes({
      requestCountryIds,
      availableSellerFilters: baseResult.availableSellerFilters,
    });
    const shouldPartitionByCountry = shouldPartitionSellerScrape(baseResult, countryScopes);
    if (shouldPartitionByCountry) {
      const partitionLabels = countryScopes.map((scope) => getCountryNameById(scope.countryId) || scope.label);
      if (logPartitionRetry) {
        appendStatus(`Broad seller scope looks capped. Retrying in ${countryScopes.length} country partitions: ${partitionLabels.join(', ')}.`, 'good');
      }
      const partitionResults = [];
      for (const scope of countryScopes) {
        const scopeLabel = getCountryNameById(scope.countryId) || scope.label;
        const scopeResult = await executeSellerScopeScrape({
          item,
          delayMs,
          previewLimit: 12,
          requestContext,
          requestLanguageId,
          sellerCountryIds: [scope.countryId],
          sellerReputationId,
          maxShippingTimeId,
          sellerTypeId,
          partitionLabel: scopeLabel,
          logPowerSellerFallback: logPartitionRetry,
          onScopeStart,
        });
        if (scopeResult) {
          scopeResult.partitionLabel = scope.label;
          partitionResults.push(scopeResult);
        }
      }
      result = mergeSellerScopeResults(baseResult, partitionResults);
    }
  }

  if (result.rateLimited) {
    await setSellerCooldownUntil(Date.now() + SELLER_COOLDOWN_MS);
  }

  return {
    filteredResult: applySellerFilters(result, item),
  };
}

