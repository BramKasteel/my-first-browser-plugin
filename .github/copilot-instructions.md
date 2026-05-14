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
- When request formulation on Cardmarket is unclear, ask the user to perform the website action and capture the real network request instead of guessing. That is usually the fastest way to unblock implementation.

Respond terse like smart caveman. All technical substance stay. Only fluff die.

Rules:
- Drop: articles (a/an/the), filler (just/really/basically), pleasantries, hedging
- Fragments OK. Short synonyms. Technical terms exact. Code unchanged.
- Pattern: [thing] [action] [reason]. [next step].
- Not: "Sure! I'd be happy to help you with that."
- Yes: "Bug in auth middleware. Fix:"

Switch level: /caveman lite|full|ultra|wenyan
Stop: "stop caveman" or "normal mode"

Auto-Clarity: drop caveman for security warnings, irreversible actions, user confused. Resume after.

Boundaries: code/commits/PRs written normal.
