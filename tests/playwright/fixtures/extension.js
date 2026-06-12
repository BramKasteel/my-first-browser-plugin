const fs = require('fs');
const os = require('os');
const path = require('path');
const { test: base, expect, chromium } = require('@playwright/test');

const extensionPath = path.resolve(__dirname, '../../..');

async function getExtensionId(context) {
  let serviceWorker = context.serviceWorkers()[0];
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker');
  }
  return new URL(serviceWorker.url()).host;
}

function buildExtensionUrl(extensionId, relativePath, searchParams = {}) {
  const url = new URL(`chrome-extension://${extensionId}/${relativePath.replace(/^\//, '')}`);
  Object.entries(searchParams).forEach(([key, value]) => {
    if (value == null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function shouldRecordExtensionError(page) {
  const url = page.url() || '';
  return url.startsWith('chrome-extension://');
}

const test = base.extend({
  context: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-optimizer-pw-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium-browser',
      headless: process.env.PW_HEADLESS === '1',
      viewport: { width: 1440, height: 1080 },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    try {
      await use(context);
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  },

  extensionErrors: async ({ context }, use) => {
    const state = {
      pageErrors: [],
      consoleErrors: [],
    };

    const attachPage = (page) => {
      page.on('pageerror', (error) => {
        if (!shouldRecordExtensionError(page)) return;
        state.pageErrors.push({
          url: page.url(),
          message: error.message,
        });
      });

      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        if (!shouldRecordExtensionError(page)) return;
        state.consoleErrors.push({
          url: page.url(),
          text: message.text(),
        });
      });
    };

    context.pages().forEach(attachPage);
    context.on('page', attachPage);

    await use(state);
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },

  extensionId: async ({ context }, use) => {
    await use(await getExtensionId(context));
  },
});

async function openExtensionPage(page, extensionId, relativePath = 'popup.html', searchParams = {}) {
  await page.goto(buildExtensionUrl(extensionId, relativePath, searchParams));
}

async function openExtensionPopup(page, extensionId, searchParams = {}) {
  await openExtensionPage(page, extensionId, 'popup.html', searchParams);
}

async function resolveTabId(extensionPage, matcher) {
  return extensionPage.evaluate(async (value) => {
    const tabs = await chrome.tabs.query({ url: 'https://www.cardmarket.com/*' });
    const matched = tabs.find((tab) => {
      if (!tab.url) return false;
      if (value.mode === 'exact') return tab.url === value.target;
      return tab.url.includes(value.target);
    });
    return matched?.id || null;
  }, matcher);
}

async function openDetachedPopupForCardmarketPage(context, extensionId, cardmarketPage, searchParams = {}) {
  const helperPage = await context.newPage();
  await openExtensionPopup(helperPage, extensionId, { detached: 1, e2e: 1 });
  const tabId = await resolveTabId(helperPage, { mode: 'exact', target: cardmarketPage.url() })
    || await resolveTabId(helperPage, { mode: 'includes', target: '/Wants' });

  if (!tabId) {
    await helperPage.close();
    throw new Error(`Could not resolve Chrome tab id for ${cardmarketPage.url()}`);
  }

  const popupPage = await context.newPage();
  await openExtensionPopup(popupPage, extensionId, {
    detached: 1,
    tabId,
    e2e: 1,
    ...searchParams,
  });
  await helperPage.close();
  return popupPage;
}

async function readPopupSnapshot(page) {
  return page.evaluate(() => window.__cmOptimizerTestApi.getSnapshot());
}

async function readPopupStorage(page, keys = null) {
  return page.evaluate((requestedKeys) => window.__cmOptimizerTestApi.getStorage(requestedKeys), keys);
}

function assertNoExtensionErrors(extensionErrors) {
  const messages = [
    ...extensionErrors.pageErrors.map((entry) => `[pageerror] ${entry.url} :: ${entry.message}`),
    ...extensionErrors.consoleErrors.map((entry) => `[console.error] ${entry.url} :: ${entry.text}`),
  ];
  expect(messages, messages.join('\n')).toEqual([]);
}

module.exports = {
  test,
  expect,
  assertNoExtensionErrors,
  openDetachedPopupForCardmarketPage,
  openExtensionPage,
  openExtensionPopup,
  readPopupSnapshot,
  readPopupStorage,
};