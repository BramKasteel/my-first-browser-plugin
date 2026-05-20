# My First Browser Plugin

This repository is set up for building a new Chrome extension for cardmarket.com.

The existing extension from this repository has been preserved as a reference implementation in `example/`.

If you want to inspect or load the example extension in Chrome developer mode, use the `example/` folder as the unpacked extension root.

## Optimizer API

Repository now also contains `optimizer-api/`, a standalone Python FastAPI service for order optimization after scrape phase.

Use it for:
- normalized scrape payload intake
- solver experimentation with OR-Tools
- stable API contract between extension and backend

Do not use it for Cardmarket scraping itself. Keep scraping in extension where session and pacing logic already live.

## AWS Infra

Repository now also contains `infra/`, a standalone AWS CDK app for optimizer deployment.

Use it for:
- ECR repository creation
- GitHub Actions OIDC deploy role
- Lambda + API Gateway deployment from pushed optimizer image

See `infra/README.md` for one-time bootstrap and CI setup steps.

## Playwright Tests

Playwright setup lives at repo root and targets Chromium with unpacked extension loaded.

Setup:
- `npm install`
- `npm run playwright:install`
- Copy `.env.playwright.example` to `.env.playwright.local`
- Fill `CARDMARKET_USERNAME` and `CARDMARKET_PASSWORD`
- Fill `CARDMARKET_WANTLIST_NAME`, `CARDMARKET_WANTLIST_EXPECTED_COUNT`, and `CARDMARKET_WANTLIST_EXPECTED_NAMES`
- Optional: set `CARDMARKET_SELLER_COUNTRY`, `CARDMARKET_SELLER_REPUTATION`, and `CARDMARKET_MAX_SHIPPING_TIME` for scrape-test filter assertions

Run:
- `npm run test:e2e -- tests/playwright/wantslist-scrape.spec.js`
- `npm run test:e2e:debug -- tests/playwright/wantslist-scrape.spec.js`

VS Code:
- Install Playwright VS Code extension if not present
- Use Testing panel or launch configs in `.vscode/launch.json`

Note: Cardmarket may show Cloudflare challenge for browser automation. Headed Playwright run usually easiest place to inspect and adapt selectors or wait strategy.

Live want-list tests use your own Cardmarket data. Keep `CARDMARKET_WANTLIST_EXPECTED_NAMES` in same order as list should load in popup, separated by `|`.
Single live end-to-end test logs in, loads want list, sets seller filters, starts scrape, and checks intermediate state plus final payload and optimize-step summary.

Extension loading in Playwright:
- `tests/playwright/fixtures/extension.js` launches persistent Chromium with `--disable-extensions-except` and `--load-extension`
- tests then open `chrome-extension://<id>/popup.html?detached=1&tabId=<cardmarket-tab-id>&e2e=1`

Validation strategy without debug UI:
- popup exposes hidden test API only when `e2e=1`
- Playwright reads structured snapshot of run state, selected want list, extracted items, payloads, and storage
- fixture records `pageerror` and `console.error` from extension pages, so tests can fail even after debug panels are removed
