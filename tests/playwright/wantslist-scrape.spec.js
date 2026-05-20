const {
  test,
  expect,
  assertNoExtensionErrors,
  openDetachedPopupForCardmarketPage,
  readPopupSnapshot,
  readPopupStorage,
} = require('./fixtures/extension');
const { hasCardmarketCredentials, loginToCardmarket } = require('./helpers/cardmarket');
const { readExpectedSellerFilterConfig } = require('./helpers/seller-filters');
const {
  assertExpectedWantListConfig,
  hasExpectedWantListConfig,
  normalizeNames,
} = require('./helpers/wantslist');

async function openWantsPopupAndLoadExpectedList({ page, context, extensionId }) {
  const wantListConfig = assertExpectedWantListConfig();

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

  const initialSnapshot = await readPopupSnapshot(popupPage);
  const matchingWantList = initialSnapshot.wantLists.available.find(
    (entry) => entry.name.toLowerCase() === wantListConfig.wantListName.toLowerCase(),
  );

  expect(
    matchingWantList,
    `Want list "${wantListConfig.wantListName}" not found. Available: ${initialSnapshot.wantLists.available.map((entry) => entry.name).join(', ')}`,
  ).toBeTruthy();

  await popupPage.selectOption('#wantListSelect', matchingWantList.id);

  await popupPage.waitForFunction(
    () => {
      const snapshot = window.__cmOptimizerTestApi.getSnapshot();
      return snapshot.extractedItems.count > 0 && !snapshot.runState.active;
    },
    null,
    { timeout: 60_000 },
  );

  return {
    popupPage,
    matchingWantList,
    wantListConfig,
  };
}

async function configureSellerFilters(popupPage, sellerFilterConfig) {
  await popupPage.selectOption('#sellerReputationFilter', sellerFilterConfig.sellerReputation);
  await popupPage.selectOption('#sellerDeliveryTimeFilter', sellerFilterConfig.maxShippingTime);

  while (await popupPage.locator('#selectedSellerCountries button[data-country-remove]').count()) {
    await popupPage.locator('#selectedSellerCountries button[data-country-remove]').first().click();
  }

  const desiredCountry = popupPage.locator(`#sellerLocationFilterList input[name="sellerCountryFilter"][value="${sellerFilterConfig.sellerCountry}"]`);
  await expect(desiredCountry).toBeVisible();
  await desiredCountry.click();

  await popupPage.waitForFunction(
    (expected) => {
      const snapshot = window.__cmOptimizerTestApi.getSnapshot();
      return snapshot.sellerFilters.sellerReputation === expected.sellerReputation
        && snapshot.sellerFilters.maxShippingTime === expected.maxShippingTime
        && snapshot.sellerFilters.sellerCountries.length === 1
        && snapshot.sellerFilters.sellerCountries[0] === expected.sellerCountry;
    },
    sellerFilterConfig,
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
  test.skip(
    !hasCardmarketCredentials() || !hasExpectedWantListConfig(),
    'Set CARDMARKET_USERNAME, CARDMARKET_PASSWORD, CARDMARKET_WANTLIST_EXPECTED_COUNT, and CARDMARKET_WANTLIST_EXPECTED_NAMES in .env.playwright.local before running live Cardmarket tests.',
  );

  test('logs in, loads expected want list items, scrapes sellers, and requests optimization', async ({ page, context, extensionId, extensionErrors }) => {
    test.setTimeout(300_000);

    const { popupPage, matchingWantList, wantListConfig } = await openWantsPopupAndLoadExpectedList({
      page,
      context,
      extensionId,
    });
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

    await configureSellerFilters(popupPage, sellerFilterConfig);

    const configuredSnapshot = await readPopupSnapshot(popupPage);
    expect(configuredSnapshot.sellerFilters.sellerReputation).toBe(sellerFilterConfig.sellerReputation);
    expect(configuredSnapshot.sellerFilters.maxShippingTime).toBe(sellerFilterConfig.maxShippingTime);
    expect(configuredSnapshot.sellerFilters.sellerCountries).toEqual([sellerFilterConfig.sellerCountry]);

    const configuredStorage = await readPopupStorage(popupPage, ['sellerScrapeSettings']);
    expect(configuredStorage.sellerScrapeSettings?.sellerReputationFilter).toBe(sellerFilterConfig.sellerReputation);
    expect(configuredStorage.sellerScrapeSettings?.sellerDeliveryTimeFilter).toBe(sellerFilterConfig.maxShippingTime);
    expect(configuredStorage.sellerScrapeSettings?.sellerLocationFilter).toEqual([sellerFilterConfig.sellerCountry]);

    await expect(popupPage.locator('#scrapeAllItems')).toBeVisible();
    await expect(popupPage.locator('#scrapeAllItems')).toBeEnabled();
    await popupPage.click('#scrapeAllItems');

    await waitForScrapeStart(popupPage);

    await popupPage.waitForFunction(
      () => {
        const snapshot = window.__cmOptimizerTestApi.getSnapshot();
        return snapshot.frontendPayload?.kind === 'seller-scrape-batch' && !snapshot.runState.active;
      },
      null,
      { timeout: 180_000 },
    );

    const scrapeSnapshot = await readPopupSnapshot(popupPage);
    const batchPayload = scrapeSnapshot.frontendPayload;
    const optimizerPayload = scrapeSnapshot.optimizerPayload;
    const optimizeContext = scrapeSnapshot.optimizeContext;

    expect(batchPayload?.kind).toBe('seller-scrape-batch');
    expect(scrapeSnapshot.workflow.activeStep).toBe('optimize');
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

    expect(optimizeContext).toBeTruthy();
    expect(normalizeNames(optimizeContext.itemNames)).toEqual(wantListConfig.expectedNames);
    expect(optimizeContext.requestSettings?.sellerReputation).toBe(sellerFilterConfig.sellerReputation);
    expect(optimizeContext.requestSettings?.maxShippingTime).toBe(sellerFilterConfig.maxShippingTime);
    expect(optimizeContext.requestSettings?.sellerCountries).toEqual([sellerFilterConfig.sellerCountry]);

    await expect(popupPage.locator('#optimizerInputContext')).toBeVisible();
    await expect(popupPage.locator('#optimizerInputMeta')).toContainText(`${wantListConfig.expectedCount} item`);
    await expect(popupPage.locator('#optimizerInputFilters')).toContainText(sellerFilterConfig.sellerCountry);
    await expect(popupPage.locator('#optimizerInputFilters')).toContainText(sellerFilterConfig.sellerReputation);
    await expect(popupPage.locator('#optimizerInputFilters')).toContainText(sellerFilterConfig.maxShippingTime);
    await expect(popupPage.locator('#optimizerInputItems li')).toHaveText(wantListConfig.expectedNames);

    optimizerPayload.offers.forEach((offer) => {
      expect(offer.unit_price).toBeGreaterThan(0);
      expect(offer.available_quantity).toBeGreaterThan(0);
    });

    await expect(popupPage.locator('#optimizeOrder')).toBeVisible();
    await expect(popupPage.locator('#optimizeOrder')).toBeEnabled();
    await popupPage.click('#optimizeOrder');

    await popupPage.waitForFunction(
      () => {
        const snapshot = window.__cmOptimizerTestApi.getSnapshot();
        return !!snapshot.optimizationResult && !snapshot.runState.active;
      },
      null,
      { timeout: 120_000 },
    );

    const optimizedSnapshot = await readPopupSnapshot(popupPage);
    const optimizationResult = optimizedSnapshot.optimizationResult;

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

    await popupPage.close();
    assertNoExtensionErrors(extensionErrors);
  });
});