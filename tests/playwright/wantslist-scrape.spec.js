const {
  test,
  expect,
  assertNoExtensionErrors,
  openDetachedPopupForCardmarketPage,
  readPopupSnapshot,
  readPopupStorage,
} = require('./fixtures/extension');
const { hasCardmarketCredentials, loginToCardmarket } = require('./helpers/cardmarket');

const wantListName = process.env.CARDMARKET_WANTLIST_NAME || 'last';

test.describe('Want list scraping flow', () => {
  test.skip(
    !hasCardmarketCredentials(),
    'Set CARDMARKET_USERNAME and CARDMARKET_PASSWORD in .env.playwright.local before running live Cardmarket tests.',
  );

  test('loads want list and starts seller scrape', async ({ page, context, extensionId, extensionErrors }) => {
    test.setTimeout(180_000);

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
    const matchingWantList = initialSnapshot.wantLists.available.find((entry) => entry.name.toLowerCase() === wantListName.toLowerCase());
    expect(matchingWantList, `Want list \"${wantListName}\" not found. Available: ${initialSnapshot.wantLists.available.map((entry) => entry.name).join(', ')}`).toBeTruthy();

    await popupPage.selectOption('#wantListSelect', matchingWantList.id);

    await popupPage.waitForFunction(
      () => {
        const snapshot = window.__cmOptimizerTestApi.getSnapshot();
        return snapshot.extractedItems.count > 0 && !snapshot.runState.active;
      },
      null,
      { timeout: 60_000 },
    );

    const extractedSnapshot = await readPopupSnapshot(popupPage);
    expect(extractedSnapshot.wantLists.selectedWantListId).toBe(matchingWantList.id);
    expect(extractedSnapshot.extractedItems.count).toBeGreaterThan(0);
    expect(extractedSnapshot.frontendPayload?.wantListName?.toLowerCase()).toContain(wantListName.toLowerCase());
    expect(extractedSnapshot.workflow.activeStep).toBe('source');

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

    await expect(popupPage.locator('#scrapeAllItems')).toBeVisible();
    await expect(popupPage.locator('#scrapeAllItems')).toBeEnabled();
    await popupPage.click('#scrapeAllItems');

    await popupPage.waitForFunction(
      () => {
        const snapshot = window.__cmOptimizerTestApi.getSnapshot();
        return snapshot.stepActivity?.kind === 'seller-scrape'
          || snapshot.frontendPayload?.kind === 'seller-scrape-batch'
          || snapshot.statusLog.some((entry) => /Scraping item \d+\//.test(entry.text));
      },
      null,
      { timeout: 30_000 },
    );

    const scrapeStartedSnapshot = await readPopupSnapshot(popupPage);
    const startedOrCompleted = scrapeStartedSnapshot.stepActivity?.kind === 'seller-scrape'
      || scrapeStartedSnapshot.frontendPayload?.kind === 'seller-scrape-batch';

    expect(startedOrCompleted || scrapeStartedSnapshot.statusLog.some((entry) => /Scraping item \d+\//.test(entry.text))).toBeTruthy();

    await popupPage.close();
    assertNoExtensionErrors(extensionErrors);
  });
});