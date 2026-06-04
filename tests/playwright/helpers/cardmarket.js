function hasCardmarketCredentials() {
  const username = String(process.env.CARDMARKET_USERNAME || '').trim();
  const password = String(process.env.CARDMARKET_PASSWORD || '').trim();
  if (!username || !password) return false;
  if (/^your-username$/i.test(username)) return false;
  if (/^your-email@example\.com$/i.test(username)) return false;
  if (/^replace-me$/i.test(password)) return false;
  return true;
}

async function firstVisible(page, selectors) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.count()) {
      try {
        await locator.waitFor({ state: 'visible', timeout: 2_000 });
        return locator;
      } catch {
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
        try {
          await locator.dispatchEvent('click');
          return;
        } catch {
        }
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

async function loginToCardmarket(page) {
  if (!hasCardmarketCredentials()) {
    throw new Error('Set CARDMARKET_USERNAME and CARDMARKET_PASSWORD in .env.playwright.local before running live Cardmarket tests.');
  }

  await page.goto('https://www.cardmarket.com/en/Magic/Login', { waitUntil: 'domcontentloaded' });
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

  const form = page.locator('form').first();
  await Promise.all([
    page.waitForURL((url) => !/\/Login(?:[/?#]|$)/i.test(url.toString()), {
      timeout: 60_000,
      waitUntil: 'commit',
    }).catch(() => null),
    form.evaluate((node) => node.requestSubmit()).catch(async () => {
      await submitButton.click();
    }),
  ]);

  if (/\/Login(?:[/?#]|$)/i.test(page.url())) {
    const bodyText = ((await page.locator('body').textContent()) || '').replace(/\s+/g, ' ').trim();
    throw new Error(`Login did not leave login page. Visible text: ${bodyText.slice(0, 240)}`);
  }
}

module.exports = {
  dismissCookieBanner,
  failIfCloudflareChallenge,
  firstVisible,
  hasCardmarketCredentials,
  loginToCardmarket,
};