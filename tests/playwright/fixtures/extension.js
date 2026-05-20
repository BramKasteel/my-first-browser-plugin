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

const test = base.extend({
  context: async ({}, use) => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cm-optimizer-pw-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
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

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
  },

  extensionId: async ({ context }, use) => {
    await use(await getExtensionId(context));
  },
});

async function openExtensionPopup(page, extensionId) {
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
}

module.exports = {
  test,
  expect,
  openExtensionPopup,
};