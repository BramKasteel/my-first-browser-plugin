const { test, expect } = require('./fixtures/extension');

const loginUrl = 'https://www.cardmarket.com/en/Magic/Login';

test.describe('Cardmarket login', () => {
  test.skip(
    !process.env.CARDMARKET_USERNAME || !process.env.CARDMARKET_PASSWORD,
    'Set CARDMARKET_USERNAME and CARDMARKET_PASSWORD in .env.playwright.local before running login smoke test.',
  );

  test('logs in with env credentials', async ({ page }) => {
    await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });
    await failIfCloudflareChallenge(page);
    await dismissCookieBanner(page);

    const usernameInput = await firstVisible(page, [
      'input[name="username"]',
      'input[name="userName"]',
      'input[autocomplete="username"]',
      'input[type="text"]',
      'input[type="email"]',
      'input[name="email"]',
    ]);
    const passwordInput = await firstVisible(page, [
      'input[type="password"]',
      'input[name="password"]',
      'input[autocomplete="current-password"]',
    ]);
    const submitButton = await firstVisible(page, [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:has-text("Log in")',
      'button:has-text("Login")',
      'button:has-text("Sign in")',
    ]);

    await usernameInput.fill(process.env.CARDMARKET_USERNAME);
    await passwordInput.fill(process.env.CARDMARKET_PASSWORD);

    await Promise.all([
      page.waitForURL((url) => !/\/Login(?:[/?#]|$)/i.test(url.toString()), { timeout: 30_000 }),
      submitButton.click(),
    ]);

    await expect(page).not.toHaveURL(/\/Login(?:[/?#]|$)/i);
    await expect(passwordInput).toBeHidden({ timeout: 10_000 });
  });
});

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      try {
        await locator.waitFor({ state: 'visible', timeout: 2_000 });
        return locator;
      } catch {
        // Try next selector.
      }
    }
  }

  throw new Error(`No visible element found for selectors: ${selectors.join(', ')}`);
}

async function dismissCookieBanner(page) {
  const selectors = [
    'button:has-text("Accept")',
    'button:has-text("Agree")',
    'button:has-text("Allow all")',
    'button:has-text("Accept all")',
  ];

  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      try {
        await locator.click({ timeout: 1_000 });
        return;
      } catch {
        // Try next selector.
      }
    }
  }
}

async function failIfCloudflareChallenge(page) {
  const title = await page.title();
  const bodyText = (await page.locator('body').textContent()) || '';
  const challengeDetected = /just a moment|checking your browser|verify you are human/i.test(`${title} ${bodyText}`);
  if (challengeDetected) {
    throw new Error('Cloudflare challenge detected before login form rendered. Re-run headed debug flow and solve challenge manually first.');
  }
}