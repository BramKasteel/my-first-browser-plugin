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

Run:
- `npm run test:e2e -- --grep login`
- `npm run test:e2e:debug -- tests/playwright/login.spec.js`

VS Code:
- Install Playwright VS Code extension if not present
- Use Testing panel or launch configs in `.vscode/launch.json`

Note: Cardmarket may show Cloudflare challenge for browser automation. Headed debug flow usually easiest place to inspect and adapt selectors or wait strategy.
