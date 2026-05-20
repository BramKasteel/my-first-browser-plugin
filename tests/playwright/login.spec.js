const { test, expect } = require('./fixtures/extension');
const { hasCardmarketCredentials, loginToCardmarket } = require('./helpers/cardmarket');

test.describe('Cardmarket login', () => {
  test.skip(
    !hasCardmarketCredentials(),
    'Set CARDMARKET_USERNAME and CARDMARKET_PASSWORD in .env.playwright.local before running login smoke test.',
  );

  test('logs in with env credentials', async ({ page }) => {
    await loginToCardmarket(page);
    await expect(page).not.toHaveURL(/\/Login(?:[/?#]|$)/i);
    await expect(page.locator('input[type="password"]').first()).toBeHidden({ timeout: 10_000 });
  });
});