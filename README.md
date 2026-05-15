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
