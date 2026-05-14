# Repository instructions

The existing browser extension in this repository is an example implementation located in `example/`.

Use that folder as reference code for:
- extension structure
- manifest setup
- popup UI logic
- Cardmarket request pacing and retry handling

Project context for the new plugin:
- This repository is for a Chrome extension that works on cardmarket.com.
- Cardmarket is a marketplace with many sellers across many countries and supports multiple trading card games.
- The extension will read a user want list on Cardmarket and help build the cheapest realistic order.
- Cardmarket currently offers one flow that minimizes item price and another that minimizes package count; neither produces the true total-optimal order because shipping and item price trade off against each other.
- The extension needs to scrape the want list market data, including sellers and prices for all relevant items.
- Shipping costs also need to be modeled because they vary by seller country and package characteristics.
- Price optimization will be handled by a separate Python API. The browser extension is responsible for collecting data from Cardmarket and communicating with that optimizer API.
- Cardmarket is strict about scraping and can return HTTP 429 quickly because of Cloudflare protections. Any scraping implementation should rate limit requests carefully.
- The example extension in `example/` contains useful patterns for request pacing and handling rate limits.