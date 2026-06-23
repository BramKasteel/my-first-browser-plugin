const {
  test,
  expect,
  assertNoExtensionErrors,
  openDetachedPopupForCardmarketPage,
  openExtensionPopup,
  readPopupSnapshot,
  readPopupStorage,
} = require('./fixtures/extension');
const { dismissCookieBanner, hasCardmarketCredentials, loginToCardmarket } = require('./helpers/cardmarket');
const { readExpectedSellerFilterConfig } = require('./helpers/seller-filters');
const {
  assertWantListSizeLimitConfig,
  assertExpectedWantListConfig,
  hasWantListSizeLimitConfig,
  hasExpectedWantListConfig,
  normalizeNames,
} = require('./helpers/wantslist');

async function openWantsPopupForCardmarketWants({ page, context, extensionId }) {
  await loginToCardmarket(page);
  await page.goto('https://www.cardmarket.com/en/Magic/Wants', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/Wants(?:[/?#]|$)/i);

  const popupPage = await openDetachedPopupForCardmarketPage(context, extensionId, page);
  await popupPage.waitForFunction(() => !!window.__cmOptimizerTestApi, null, { timeout: 15_000 });

  await popupPage.waitForFunction(
    () => window.__cmOptimizerTestApi.getSnapshot().wantLists.available.length > 0,
    null,
    { timeout: 30_000 },
  );

  return popupPage;
}

async function readShoppingCartState(page) {
  await page.goto('https://www.cardmarket.com/en/Magic/ShoppingCart', { waitUntil: 'domcontentloaded' });
  await dismissCookieBanner(page);

  await page.waitForFunction(() => document.readyState === 'interactive' || document.readyState === 'complete');

  return page.evaluate(() => {
    const textOf = (value) => String(value || '').replace(/\s+/g, ' ').trim();
    const parsePositiveInteger = (value) => {
      const normalized = textOf(value).replace(/[^0-9]/g, '');
      if (!normalized) return null;
      const parsed = Number.parseInt(normalized, 10);
      return Number.isFinite(parsed) ? parsed : null;
    };
    const bodyText = textOf(document.body?.innerText || '');
    const cartLinkText = textOf(document.querySelector('#cart')?.textContent || '');
    const emptyCart = /your shopping cart is empty|shopping cart is empty/i.test(bodyText);
    const summaryPatterns = [
      /Amount of articles\s+(\d+)\s+Articles/i,
      /Contents\s+(\d+)\s+Articles/i,
      /Cart\s*\([^)]*\)\s*(\d+)$/i,
    ];

    for (const pattern of summaryPatterns) {
      const match = bodyText.match(pattern) || cartLinkText.match(pattern);
      const parsed = parsePositiveInteger(match?.[1] || '');
      if (parsed != null) {
        return {
          unitCount: parsed,
          emptyCart,
          cartLinkText,
          quantitySources: [{ source: 'summary', quantity: parsed, pattern: pattern.source }],
          bodyPreview: bodyText.slice(0, 2000),
        };
      }
    }

    const quantitySources = [];
    const quantitySelectors = [
      'input[type="number"]',
      'input[name*="amount" i]',
      'input[name*="qty" i]',
      'input[name*="quantity" i]',
      'select[name*="amount" i]',
      'select[name*="qty" i]',
      'select[name*="quantity" i]',
      '[data-amount]',
      '[data-quantity]',
      '[data-qty]',
    ];
    const seenQuantityKeys = new Set();

    document.querySelectorAll(quantitySelectors.join(',')).forEach((node) => {
      const rawValue = node instanceof HTMLInputElement || node instanceof HTMLSelectElement
        ? node.value
        : node.getAttribute('data-amount') || node.getAttribute('data-quantity') || node.getAttribute('data-qty') || '';
      const quantity = parsePositiveInteger(rawValue);
      if (!quantity) return;

      const quantityKey = [
        node.getAttribute('name') || '',
        node.getAttribute('id') || '',
        node.getAttribute('class') || '',
        textOf(node.closest('[class*="article"], [class*="seller"], li, tr, .row')?.textContent || '').slice(0, 120),
      ].join('|');
      if (seenQuantityKeys.has(quantityKey)) return;
      seenQuantityKeys.add(quantityKey);

      quantitySources.push({
        source: 'field',
        quantity,
        name: node.getAttribute('name') || '',
        id: node.getAttribute('id') || '',
        className: node.getAttribute('class') || '',
      });
    });

    if (!quantitySources.length) {
      const textPatterns = [
        /Qty\s*:?\s*(\d+)/gi,
        /Quantity\s*:?\s*(\d+)/gi,
        /Amount\s*:?\s*(\d+)/gi,
      ];
      const bodyText = textOf(document.body?.innerText || '');
      for (const pattern of textPatterns) {
        for (const match of bodyText.matchAll(pattern)) {
          const quantity = parsePositiveInteger(match[1]);
          if (!quantity) continue;
          quantitySources.push({
            source: 'text',
            quantity,
            snippet: textOf(match[0]),
          });
        }
      }
    }

    const unitCount = quantitySources.reduce((sum, entry) => sum + entry.quantity, 0);

    return {
      unitCount,
      emptyCart,
      cartLinkText,
      quantitySources: quantitySources.slice(0, 40),
      bodyPreview: bodyText.slice(0, 2000),
    };
  });
}

async function goToWorkflowStep(popupPage, stepName) {
  const snapshot = await readPopupSnapshot(popupPage);
  if (snapshot.workflow?.activeStep === stepName) return;

  const stepButton = popupPage.locator(`[data-workflow-step="${stepName}"]`);
  await expect(stepButton).toBeVisible({ timeout: 15_000 });
  await expect(stepButton).toBeEnabled({ timeout: 15_000 });
  await stepButton.click();

  await popupPage.waitForFunction(
    (expectedStepName) => window.__cmOptimizerTestApi.getSnapshot().workflow.activeStep === expectedStepName,
    stepName,
    { timeout: 15_000 },
  );
}

async function selectWantListAndWaitForLoad(popupPage, { wantListName, expectedCount = null, expectedDistinctCount = null }) {
  await goToWorkflowStep(popupPage, 'source');

  const initialSnapshot = await readPopupSnapshot(popupPage);
  const matchingWantList = initialSnapshot.wantLists.available.find(
    (entry) => entry.name.toLowerCase() === wantListName.toLowerCase(),
  );

  expect(
    matchingWantList,
    `Want list "${wantListName}" not found. Available: ${initialSnapshot.wantLists.available.map((entry) => entry.name).join(', ')}`,
  ).toBeTruthy();

  try {
    await expect(popupPage.locator('#wantListSelect')).toBeEnabled({ timeout: 15_000 });
    await popupPage.selectOption('#wantListSelect', matchingWantList.id);

    await popupPage.waitForFunction(
      (expected) => {
        const snapshot = window.__cmOptimizerTestApi.getSnapshot();
        return snapshot.wantLists.selectedWantListId === expected.wantListId
          && snapshot.frontendPayload?.kind === 'selected-want-list'
          && snapshot.frontendPayload?.wantListId === expected.wantListId
          && !snapshot.runState.active
          && !snapshot.isBusy;
      },
      {
        wantListId: matchingWantList.id,
      },
      { timeout: 60_000 },
    );
  } catch (error) {
    const snapshot = await readPopupSnapshot(popupPage);
    throw new Error(`Want list load timed out for ${wantListName}. Debug state: ${JSON.stringify({
      selectedWantListId: snapshot.wantLists?.selectedWantListId || '',
      availableWantLists: (snapshot.wantLists?.available || []).map((entry) => ({ id: entry.id, name: entry.name })),
      extractedCount: snapshot.extractedItems?.count || 0,
      distinctCount: snapshot.extractedItems?.distinctCount || 0,
      frontendPayloadKind: snapshot.frontendPayload?.kind || '',
      frontendPayloadWantListId: snapshot.frontendPayload?.wantListId || '',
      controls: snapshot.controls || null,
      runState: snapshot.runState || null,
      workflow: snapshot.workflow || null,
      statusLogTail: (snapshot.statusLog || []).slice(0, 10),
    }, null, 2)}`);
  }

  const loadedSnapshot = await readPopupSnapshot(popupPage);
  if (expectedCount != null) {
    expect(loadedSnapshot.extractedItems.count).toBe(expectedCount);
  }
  if (expectedDistinctCount != null) {
    expect(loadedSnapshot.extractedItems.distinctCount).toBe(expectedDistinctCount);
  }

  return matchingWantList;
}

async function openWantsPopupAndLoadExpectedList({ page, context, extensionId }) {
  const wantListConfig = assertExpectedWantListConfig();
  const popupPage = await openWantsPopupForCardmarketWants({ page, context, extensionId });
  const matchingWantList = await selectWantListAndWaitForLoad(popupPage, {
    wantListName: wantListConfig.wantListName,
    expectedCount: wantListConfig.expectedCount,
  });

  return {
    popupPage,
    matchingWantList,
    wantListConfig,
  };
}

async function configureSellerFilters(popupPage, sellerFilterConfig) {
  await popupPage.selectOption('#sellerReputationFilter', sellerFilterConfig.sellerReputationValue);
  await popupPage.selectOption('#sellerDeliveryTimeFilter', sellerFilterConfig.maxShippingTimeValue);

  await clearSelectedSellerCountries(popupPage);
  await waitForSelectedCountries(popupPage, []);
  await selectSellerCountry(popupPage, sellerFilterConfig.sellerCountry);
  await waitForSelectedCountries(popupPage, [sellerFilterConfig.sellerCountry]);

  await popupPage.waitForFunction(
    (expected) => {
      const snapshot = window.__cmOptimizerTestApi.getSnapshot();
      return snapshot.sellerFilters.sellerReputation === expected.sellerReputation
        && snapshot.sellerFilters.maxShippingTime === expected.maxShippingTime
        && snapshot.sellerFilters.includeBargainsFromOtherCountries === false
        && snapshot.sellerFilters.sellerCountries.length === 1
        && snapshot.sellerFilters.sellerCountries[0] === expected.sellerCountry;
    },
    sellerFilterConfig,
    { timeout: 15_000 },
  );
}

async function configureBuyerCountry(popupPage, buyerCountry) {
  await goToWorkflowStep(popupPage, 'sellers');
  await expect(popupPage.locator('#buyerCountry')).toBeVisible({ timeout: 15_000 });
  await popupPage.selectOption('#buyerCountry', buyerCountry);

  await popupPage.waitForFunction(
    (expectedBuyerCountry) => {
      const snapshot = window.__cmOptimizerTestApi.getSnapshot();
      return snapshot.sellerFilters.buyerCountry === expectedBuyerCountry;
    },
    buyerCountry,
    { timeout: 15_000 },
  );
}

async function clearSelectedSellerCountries(popupPage) {
  while (await popupPage.locator('#selectedSellerCountries button[data-country-remove]').count()) {
    const before = await popupPage.evaluate(
      () => window.__cmOptimizerTestApi.getSnapshot().sellerFilters.sellerCountries || []
    );
    const removeButton = popupPage.locator('#selectedSellerCountries button[data-country-remove]').first();
    await expect(removeButton).toBeVisible();
    await removeButton.click();
    await popupPage.waitForFunction(
      (previousLength) => {
        const selected = window.__cmOptimizerTestApi.getSnapshot().sellerFilters.sellerCountries || [];
        return selected.length < previousLength;
      },
      before.length,
      { timeout: 15_000 },
    );
  }
}

async function selectSellerCountry(popupPage, country) {
  const searchInput = popupPage.locator('#sellerCountryFilterInput');
  await expect(searchInput).toBeVisible();
  await searchInput.fill(country.slice(0, 3));
  const desiredOption = popupPage.locator(`#sellerLocationFilterList button[data-country-option="${country}"]`);
  await expect(desiredOption).toBeVisible();
  await expect(desiredOption).toBeEnabled();
  await desiredOption.click();
}

async function waitForSelectedCountries(popupPage, expectedCountries) {
  await popupPage.waitForFunction(
    (expected) => {
      const selected = window.__cmOptimizerTestApi.getSnapshot().sellerFilters.sellerCountries || [];
      return JSON.stringify(selected) === JSON.stringify(expected);
    },
    expectedCountries,
    { timeout: 15_000 },
  );
}

async function waitForScrapeStart(popupPage) {
  try {
    await popupPage.waitForFunction(
      () => {
        const snapshot = window.__cmOptimizerTestApi.getSnapshot();
        const batchDone = snapshot.frontendPayload?.kind === 'seller-scrape-batch' && !snapshot.runState.active;
        const runMessage = String(snapshot.runState?.message || '');
        const statusStarted = snapshot.statusLog.some((entry) => /starting serial seller scrape|scraping seller rows/i.test(entry.text || ''));
        return batchDone
          || snapshot.stepActivity?.kind === 'seller-scrape'
          || (snapshot.runState?.active && /scraping seller rows|seller scrape/i.test(runMessage))
          || statusStarted;
      },
      null,
      { timeout: 60_000 },
    );
  } catch (error) {
    const snapshot = await readPopupSnapshot(popupPage);
    const storage = await readPopupStorage(popupPage, ['sellerScrapeSettings', 'sellerScrapeCooldownUntil']);
    const debugState = {
      runState: snapshot.runState,
      workflow: snapshot.workflow,
      sellerFilters: snapshot.sellerFilters,
      stepActivity: snapshot.stepActivity,
      frontendPayloadKind: snapshot.frontendPayload?.kind || '',
      summary: snapshot.summary,
      statusLogTail: snapshot.statusLog.slice(0, 12),
      sellerScrapeSettings: storage.sellerScrapeSettings || null,
      sellerScrapeCooldownUntil: storage.sellerScrapeCooldownUntil || 0,
    };
    throw new Error(`Seller scrape did not start within timeout. Debug state: ${JSON.stringify(debugState, null, 2)}`);
  }
}

test.describe('Want list scraping flow', () => {
  test('accepts bracketed seller-country field names for bargain-country discovery', async ({ page, extensionId, extensionErrors }) => {
    await openExtensionPopup(page, extensionId, { e2e: 1 });
    await page.waitForFunction(() => !!window.__cmOptimizerTestApi, null, { timeout: 15_000 });

    const matchState = await page.evaluate(() => ({
      exact: isRelevantSellerFilterFieldName('sellerCountry'),
      bracketed: isRelevantSellerFilterFieldName('sellerCountry[12]'),
      multiValue: isRelevantSellerFilterFieldName('sellerCountry[]'),
      unrelated: isRelevantSellerFilterFieldName('totallyDifferentField[12]'),
    }));

    expect(matchState).toEqual({
      exact: true,
      bracketed: true,
      multiValue: true,
      unrelated: false,
    });

    assertNoExtensionErrors(extensionErrors);
  });

  test.skip(
    !hasCardmarketCredentials(),
    'Set CARDMARKET_USERNAME and CARDMARKET_PASSWORD in .env.playwright.local before running live Cardmarket tests.',
  );

  test('logs in, loads expected want list items, scrapes sellers, requests optimization, and fills shopping cart', async ({ page, context, extensionId, extensionErrors }) => {
    test.skip(
      !hasExpectedWantListConfig(),
      'Set CARDMARKET_WANTLIST_EXPECTED_COUNT and CARDMARKET_WANTLIST_EXPECTED_NAMES in .env.playwright.local before running this live test.',
    );

    test.setTimeout(300_000);

    const { popupPage, matchingWantList, wantListConfig } = await openWantsPopupAndLoadExpectedList({
      page,
      context,
      extensionId,
    });
    const cartBeforeFill = await readShoppingCartState(page);
    const sellerFilterConfig = readExpectedSellerFilterConfig();

    const extractedSnapshot = await readPopupSnapshot(popupPage);
    const loadedItems = Array.isArray(extractedSnapshot.frontendPayload?.items)
      ? extractedSnapshot.frontendPayload.items
      : [];
    const loadedNames = normalizeNames(loadedItems.map((item) => item.productName));

    expect(extractedSnapshot.wantLists.selectedWantListId).toBe(matchingWantList.id);
    expect(extractedSnapshot.extractedItems.count).toBe(wantListConfig.expectedCount);
    expect(loadedItems).toHaveLength(wantListConfig.expectedCount);
    expect(loadedNames).toEqual(wantListConfig.expectedNames);

    const storedState = await readPopupStorage(popupPage, ['sellerScrapeSettings']);
    expect(storedState.sellerScrapeSettings?.selectedWantListId).toBe(matchingWantList.id);

    await expect(popupPage.locator('#confirmWantList')).toBeVisible();
    await expect(popupPage.locator('#confirmWantList')).toBeEnabled();
    await popupPage.click('#confirmWantList');

    await popupPage.waitForFunction(
      () => window.__cmOptimizerTestApi.getSnapshot().workflow.activeStep === 'sellers',
      null,
      { timeout: 10_000 },
    );

    await expect(popupPage.locator('#includeBargainsFromOtherCountries')).not.toBeChecked();

    await configureSellerFilters(popupPage, sellerFilterConfig);

    const configuredSnapshot = await readPopupSnapshot(popupPage);
    expect(configuredSnapshot.sellerFilters.sellerReputation).toBe(sellerFilterConfig.sellerReputation);
    expect(configuredSnapshot.sellerFilters.maxShippingTime).toBe(sellerFilterConfig.maxShippingTime);
    expect(configuredSnapshot.sellerFilters.sellerCountries).toEqual([sellerFilterConfig.sellerCountry]);
    expect(configuredSnapshot.sellerFilters.includeBargainsFromOtherCountries).toBe(false);

    const configuredStorage = await readPopupStorage(popupPage, ['sellerScrapeSettings']);
    expect(configuredStorage.sellerScrapeSettings?.sellerReputationFilter).toBe(sellerFilterConfig.sellerReputation);
    expect(configuredStorage.sellerScrapeSettings?.sellerDeliveryTimeFilter).toBe(sellerFilterConfig.maxShippingTime);
    expect(configuredStorage.sellerScrapeSettings?.sellerCountries).toEqual([sellerFilterConfig.sellerCountry]);
    expect(configuredStorage.sellerScrapeSettings?.includeBargainsFromOtherCountries).toBe(false);
    expect(configuredStorage.sellerScrapeSettings).not.toHaveProperty('sellerLocationFilter');

    await configureBuyerCountry(popupPage, sellerFilterConfig.buyerCountry);

    const buyerConfiguredSnapshot = await readPopupSnapshot(popupPage);
    expect(buyerConfiguredSnapshot.sellerFilters.buyerCountry).toBe(sellerFilterConfig.buyerCountry);

    const buyerConfiguredStorage = await readPopupStorage(popupPage, ['sellerScrapeSettings']);
    expect(buyerConfiguredStorage.sellerScrapeSettings?.buyerCountry).toBe(sellerFilterConfig.buyerCountry);

    await expect(popupPage.locator('#scrapeAllItems')).toBeVisible();
    await expect(popupPage.locator('#scrapeAllItems')).toBeEnabled();
    await popupPage.click('#scrapeAllItems');

    await waitForScrapeStart(popupPage);

    await popupPage.waitForFunction(
      () => {
        const snapshot = window.__cmOptimizerTestApi.getSnapshot();
        return !!snapshot.optimizationResult && snapshot.frontendPayload?.kind === 'seller-scrape-batch' && !snapshot.runState.active;
      },
      null,
      { timeout: 120_000 },
    );

    const optimizedSnapshot = await readPopupSnapshot(popupPage);
    const batchPayload = optimizedSnapshot.frontendPayload;
    const optimizerPayload = optimizedSnapshot.optimizerPayload;
    const optimizeContext = optimizedSnapshot.optimizeContext;
    const optimizationResult = optimizedSnapshot.optimizationResult;

    expect(batchPayload?.kind).toBe('seller-scrape-batch');
    expect(batchPayload?.totals?.extractedItems).toBe(wantListConfig.expectedCount);
    expect(batchPayload?.totals?.successCount).toBe(wantListConfig.expectedCount);
    expect(batchPayload?.totals?.failedCount).toBe(0);
    expect(batchPayload?.totals?.skippedCount).toBe(0);
    expect(batchPayload?.totals?.rateLimited).toBe(false);
    expect(batchPayload?.totals?.totalSellerRows).toBeGreaterThanOrEqual(wantListConfig.expectedCount);
    expect(batchPayload?.results).toHaveLength(wantListConfig.expectedCount);

    const scrapedNames = normalizeNames(batchPayload.results.map((result) => result.item?.productName));
    expect(scrapedNames).toEqual(wantListConfig.expectedNames);
    expect(batchPayload?.requestSettings?.sellerReputation).toBe(sellerFilterConfig.sellerReputation);
    expect(batchPayload?.requestSettings?.maxShippingTime).toBe(sellerFilterConfig.maxShippingTime);
    expect(batchPayload?.requestSettings?.sellerCountries).toEqual([sellerFilterConfig.sellerCountry]);
    expect(batchPayload?.requestSettings?.includeBargainsFromOtherCountries).toBe(false);

    batchPayload.results.forEach((result) => {
      expect(result.error).toBe('');
      expect(result.rateLimited).toBe(false);
      expect(String(result.item?.productName || '')).not.toBe('');
      expect(result.totalSellers).toBeGreaterThan(0);
      expect(result.pagesFetched).toBeGreaterThan(0);
      expect(result.sellers.length).toBeGreaterThan(0);

      result.sellers.forEach((seller) => {
        expect(String(seller.sellerName || '')).not.toBe('');
        expect(String(seller.price || '')).toMatch(/\d/);
      });
    });

    expect(optimizerPayload).toBeTruthy();
    expect(optimizerPayload.items).toHaveLength(wantListConfig.expectedCount);
    expect(normalizeNames(optimizerPayload.items.map((item) => item.name))).toEqual(wantListConfig.expectedNames);
    expect(optimizerPayload.sellers.length).toBeGreaterThan(0);
    expect(optimizerPayload.offers.length).toBeGreaterThanOrEqual(wantListConfig.expectedCount);
    expect(batchPayload?.requestSettings?.buyerCountry).toBe(sellerFilterConfig.buyerCountry);
    expect(optimizerPayload?.buyer_country).toBe(sellerFilterConfig.buyerCountry);
    expect(optimizeContext?.requestSettings?.buyerCountry).toBe(sellerFilterConfig.buyerCountry);

    expect(optimizeContext).toBeTruthy();
    expect(normalizeNames(optimizeContext.itemNames)).toEqual(wantListConfig.expectedNames);
    expect(optimizeContext.requestSettings?.sellerReputation).toBe(sellerFilterConfig.sellerReputation);
    expect(optimizeContext.requestSettings?.maxShippingTime).toBe(sellerFilterConfig.maxShippingTime);
    expect(optimizeContext.requestSettings?.sellerCountries).toEqual([sellerFilterConfig.sellerCountry]);
    expect(optimizeContext.requestSettings?.includeBargainsFromOtherCountries).toBe(false);

    optimizerPayload.offers.forEach((offer) => {
      expect(offer.unit_price).toBeGreaterThan(0);
      expect(offer.available_quantity).toBeGreaterThan(0);
    });

    expect(optimizationResult).toBeTruthy();
    expect(['optimal', 'feasible']).toContain(optimizationResult.status);
    expect(Number(optimizationResult?.totals?.grand_total || 0)).toBeGreaterThan(0);
    expect(Number(optimizationResult?.cart?.total_units || 0)).toBeGreaterThan(0);

    await popupPage.waitForFunction(
      () => {
        const summary = document.querySelector('#mainCartSummary');
        const totalEl = document.querySelector('#mainCartSummaryGrandTotal');
        const itemsEl = document.querySelector('#mainCartSummaryTotalItems');
        const totalText = totalEl?.textContent?.trim() || '';
        const itemsText = itemsEl?.textContent?.trim() || '';
        return Boolean(summary)
          && !summary.hidden
          && totalText !== ''
          && totalText !== '-'
          && itemsText !== ''
          && itemsText !== '-';
      },
      null,
      { timeout: 15_000 },
    );

    await expect(popupPage.locator('#mainCartSummary')).toBeVisible();
    await expect(popupPage.locator('#mainCartSummaryGrandTotal')).not.toHaveText('-');
    await expect(popupPage.locator('#mainCartSummaryGrandTotal')).not.toHaveText('');
    await expect(popupPage.locator('#mainCartSummaryTotalItems')).not.toHaveText('-');
    await expect(popupPage.locator('#mainCartSummaryTotalItems')).not.toHaveText('');
    await expect(popupPage.locator('#mainCartSummaryTotalItems')).toContainText(/[1-9]/);

    const expectedFilledUnits = Number(optimizationResult?.cart?.total_units || 0);
    expect(expectedFilledUnits).toBeGreaterThan(0);

    await expect(popupPage.locator('#fillCart')).toBeVisible();
    await expect(popupPage.locator('#fillCart')).toBeEnabled();
    await popupPage.click('#fillCart');

    await popupPage.waitForFunction(
      () => {
        const snapshot = window.__cmOptimizerTestApi.getSnapshot();
        return !snapshot.runState.active
          && snapshot.statusLog.some((entry) => /cart updated/i.test(entry.text || ''));
      },
      null,
      { timeout: 30_000 },
    );

    await popupPage.waitForFunction(
      () => window.__cmOptimizerTestApi.getSnapshot().workflow.activeStep === 'post-fill',
      null,
      { timeout: 10_000 },
    );
    await expect(popupPage.locator('#postFillSellerList input[data-post-fill-seller-id]').first()).toBeEnabled();

    const cartAfterFill = await readShoppingCartState(page);
    const addedUnits = cartAfterFill.unitCount - cartBeforeFill.unitCount;

    expect(addedUnits, `Shopping cart unit delta mismatch. Before: ${JSON.stringify(cartBeforeFill, null, 2)} After: ${JSON.stringify(cartAfterFill, null, 2)}`).toBe(expectedFilledUnits);
    expect(cartAfterFill.emptyCart).toBe(false);

    await popupPage.close();
    assertNoExtensionErrors(extensionErrors);
  });

  test('enforces want list size limits for seller countries and blocks lists above 100 distinct items', async ({ page, context, extensionId, extensionErrors }) => {
    test.skip(
      !hasWantListSizeLimitConfig(),
      'Set CARDMARKET_WANTLIST_UNDER_30_NAME/_DISTINCT_COUNT, CARDMARKET_WANTLIST_31_TO_100_NAME/_DISTINCT_COUNT, and CARDMARKET_WANTLIST_OVER_100_NAME/_DISTINCT_COUNT in .env.playwright.local before running this live limit test.',
    );

    test.setTimeout(300_000);

    const sizeConfig = assertWantListSizeLimitConfig();
    const popupPage = await openWantsPopupForCardmarketWants({ page, context, extensionId });

    await selectSellerCountry(popupPage, 'Germany');
    await selectSellerCountry(popupPage, 'Netherlands');
    await waitForSelectedCountries(popupPage, ['Germany', 'Netherlands']);

    await selectWantListAndWaitForLoad(popupPage, {
      wantListName: sizeConfig.under30.wantListName,
      expectedDistinctCount: sizeConfig.under30.expectedDistinctCount,
    });

    let snapshot = await readPopupSnapshot(popupPage);
    expect(snapshot.extractedItems.distinctCount).toBe(sizeConfig.under30.expectedDistinctCount);
    expect(snapshot.wantListConstraints.isBlocked).toBe(false);
    expect(snapshot.wantListConstraints.distinctItemCount).toBe(sizeConfig.under30.expectedDistinctCount);
    expect(snapshot.wantListConstraints.maxSellerCountries).toBe(2);
    expect(snapshot.sellerFilters.sellerCountries).toHaveLength(2);
    await expect(popupPage.locator('label[for="includeBargainsFromOtherCountries"]')).toContainText('Include bargains from other countries');
    await expect(popupPage.locator('#confirmWantList')).toBeEnabled();
    await expect(popupPage.locator('#sellerCountryLimitHint')).toContainText('Select 1 or 2 preferred seller countries');
    await expect(popupPage.locator('#sellerCountryLimitHint')).toHaveClass(/\bgood\b/);

    await popupPage.click('#confirmWantList');
    await popupPage.waitForFunction(
      () => window.__cmOptimizerTestApi.getSnapshot().workflow.activeStep === 'sellers',
      null,
      { timeout: 10_000 },
    );

    await expect(popupPage.locator('#sellerLocationFilterList')).toBeHidden();

    await clearSelectedSellerCountries(popupPage);
  await waitForSelectedCountries(popupPage, []);
  await expect(popupPage.locator('#sellerCountryLimitHint')).toContainText('Select 1 or 2 preferred seller countries');
  await expect(popupPage.locator('#sellerCountryLimitHint')).toHaveClass(/\bbad\b/);
  await expect(popupPage.locator('#scrapeAllItems')).toBeDisabled();
    await expect(popupPage.locator('#sellerLocationFilterList')).toBeVisible();
    await selectSellerCountry(popupPage, 'Germany');
  await waitForSelectedCountries(popupPage, ['Germany']);
  await expect(popupPage.locator('#sellerCountryFilterInput')).toBeEnabled();
  await expect(popupPage.locator('#scrapeAllItems')).toBeEnabled();
    await selectSellerCountry(popupPage, 'Netherlands');
    await waitForSelectedCountries(popupPage, ['Germany', 'Netherlands']);
    await expect(popupPage.locator('#sellerCountryFilterInput')).toHaveAttribute('placeholder', "Two seller countries selected, that's the max.");
    await expect(popupPage.locator('#sellerLocationFilterList')).toBeHidden();

    await selectWantListAndWaitForLoad(popupPage, {
      wantListName: sizeConfig.between31And100.wantListName,
      expectedDistinctCount: sizeConfig.between31And100.expectedDistinctCount,
    });

    snapshot = await readPopupSnapshot(popupPage);
    expect(snapshot.extractedItems.distinctCount).toBe(sizeConfig.between31And100.expectedDistinctCount);
    expect(snapshot.wantListConstraints.isBlocked).toBe(false);
    expect(snapshot.wantListConstraints.distinctItemCount).toBe(sizeConfig.between31And100.expectedDistinctCount);
    expect(snapshot.wantListConstraints.maxSellerCountries).toBe(2);
    expect(snapshot.sellerFilters.sellerCountries).toHaveLength(2);
    await expect(popupPage.locator('#confirmWantList')).toBeEnabled();
    await expect(popupPage.locator('#sellerCountryLimitHint')).toContainText('Select 1 or 2 preferred seller countries');
    await expect(popupPage.locator('#sellerCountryLimitHint')).toHaveClass(/\bgood\b/);
    await expect(popupPage.locator('#sellerLocationFilterList')).toBeHidden();

    await popupPage.click('#confirmWantList');
    await popupPage.waitForFunction(
      () => window.__cmOptimizerTestApi.getSnapshot().workflow.activeStep === 'sellers',
      null,
      { timeout: 10_000 },
    );

    await clearSelectedSellerCountries(popupPage);
    await waitForSelectedCountries(popupPage, []);
    await expect(popupPage.locator('#sellerCountryLimitHint')).toContainText('Select 1 or 2 preferred seller countries');
    await expect(popupPage.locator('#sellerCountryLimitHint')).toHaveClass(/\bbad\b/);
    await expect(popupPage.locator('#sellerCountryFilterInput')).toBeEnabled();
    await expect(popupPage.locator('#scrapeAllItems')).toBeDisabled();
    await selectSellerCountry(popupPage, 'Germany');
    await waitForSelectedCountries(popupPage, ['Germany']);
    await expect(popupPage.locator('#sellerCountryLimitHint')).toContainText('Select 1 or 2 preferred seller countries');
    await expect(popupPage.locator('#sellerCountryLimitHint')).toHaveClass(/\bgood\b/);
    await expect(popupPage.locator('#sellerCountryFilterInput')).toBeEnabled();
    await selectSellerCountry(popupPage, 'Netherlands');
    await waitForSelectedCountries(popupPage, ['Germany', 'Netherlands']);
    await expect(popupPage.locator('#sellerCountryFilterInput')).toHaveAttribute('placeholder', "Two seller countries selected, that's the max.");
    await expect(popupPage.locator('#sellerCountryFilterInput')).toBeDisabled();

    await selectWantListAndWaitForLoad(popupPage, {
      wantListName: sizeConfig.over100.wantListName,
      expectedDistinctCount: sizeConfig.over100.expectedDistinctCount,
    });

    snapshot = await readPopupSnapshot(popupPage);
    expect(snapshot.extractedItems.distinctCount).toBe(sizeConfig.over100.expectedDistinctCount);
    expect(snapshot.wantListConstraints.isBlocked).toBe(true);
    expect(snapshot.wantListConstraints.distinctItemCount).toBe(sizeConfig.over100.expectedDistinctCount);
    expect(snapshot.controls.confirmWantListDisabled).toBe(true);
    expect(snapshot.controls.scrapeAllItemsDisabled).toBe(true);
    await expect(popupPage.locator('#sellerCountryLimitHint')).toContainText('Seller scrape disabled above 100');
    await expect(popupPage.locator('#wantListWarning')).toContainText('Seller scrape locked above 100');
    await expect(popupPage.locator('[data-workflow-step="sellers"]')).toBeDisabled();
    await expect(popupPage.locator('#confirmWantList')).toBeDisabled();
    await expect(popupPage.locator('#scrapeAllItems')).toBeDisabled();

    await popupPage.close();
    assertNoExtensionErrors(extensionErrors);
  });
});