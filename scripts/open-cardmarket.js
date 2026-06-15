const path = require('path');
const dotenv = require('dotenv');
const { chromium } = require('playwright');
const { hasCardmarketCredentials, loginToCardmarket } = require('../tests/playwright/helpers/cardmarket');

const repoRoot = process.env.REPO_ROOT || path.resolve(__dirname, '..');
const profileDir = process.env.PROFILE_DIR;
const targetUrl = process.env.OPEN_CARDMARKET_URL || 'https://www.cardmarket.com/en/Magic/Wants';

dotenv.config({ path: path.join(repoRoot, '.env.playwright.local') });
dotenv.config({ path: path.join(repoRoot, '.env.playwright') });

async function main() {
  if (!profileDir) {
    throw new Error('PROFILE_DIR is required');
  }

  const executablePath = process.env.CHROMIUM_BIN || process.env.CHROMIUM_PATH || undefined;
  const context = await chromium.launchPersistentContext(profileDir, {
    executablePath,
    headless: false,
    viewport: { width: 1440, height: 1080 },
    args: [
      '--no-first-run',
      '--no-default-browser-check',
      `--disable-extensions-except=${repoRoot}`,
      `--load-extension=${repoRoot}`,
    ],
  });

  try {
    const page = context.pages()[0] || await context.newPage();
    console.log(`Browser: ${executablePath || chromium.executablePath()}`);

    if (hasCardmarketCredentials()) {
      console.log('Logging into Cardmarket with .env.playwright.local credentials');
      try {
        await loginToCardmarket(page);
      } catch (error) {
        console.error(`Auto-login failed: ${error.message}`);
        console.error('Browser staying open for manual login or challenge handling.');
      }
    } else {
      console.log('CARDMARKET_USERNAME/CARDMARKET_PASSWORD not set. Opening browser without auto-login.');
    }

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    console.log(`Opened ${targetUrl}`);
    await context.waitForEvent('close');
  } catch (error) {
    console.error(error);
    await context.close().catch(() => {});
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
