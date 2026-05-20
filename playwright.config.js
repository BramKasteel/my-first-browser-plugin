const path = require('path');
const { defineConfig } = require('@playwright/test');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '.env.playwright.local') });
dotenv.config({ path: path.resolve(__dirname, '.env.playwright') });

module.exports = defineConfig({
  testDir: path.resolve(__dirname, 'tests/playwright'),
  timeout: 90 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-extension',
    },
  ],
});