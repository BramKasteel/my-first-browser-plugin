const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const dotenv = require('dotenv');
const { chromium } = require('playwright');
const { hasCardmarketCredentials, loginToCardmarket } = require('../tests/playwright/helpers/cardmarket');

const repoRoot = process.env.REPO_ROOT || path.resolve(__dirname, '..');
const profileDir = process.env.PROFILE_DIR;
const targetUrl = process.env.OPEN_CARDMARKET_URL || 'https://www.cardmarket.com/en/Magic/Wants';

dotenv.config({ path: path.join(repoRoot, '.env.playwright.local') });
dotenv.config({ path: path.join(repoRoot, '.env.playwright') });

function resolveBrowserPath() {
  const candidates = [
    process.env.CHROMIUM_BIN,
    process.env.CHROMIUM_PATH,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/snap/bin/chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  for (const candidate of ['chromium-browser', 'chromium', 'google-chrome', 'google-chrome-stable']) {
    try {
      return execFileSync('which', [candidate], { encoding: 'utf8' }).trim();
    } catch {
    }
  }

  throw new Error(
    'Could not find system Chromium/Chrome. Set CHROMIUM_BIN or CHROMIUM_PATH to installed browser binary.',
  );
}

async function main() {
  if (!profileDir) {
    throw new Error('PROFILE_DIR is required');
  }

  const executablePath = resolveBrowserPath();
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
    console.log(`Browser: ${executablePath}`);

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
    console.log('Browser will stay open until you close it manually.');
    await context.waitForEvent('close', { timeout: 0 });
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
