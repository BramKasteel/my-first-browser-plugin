# Repository instructions

Use `example/` as reference for extension structure, manifest setup, popup UI logic, and Cardmarket request pacing/retry handling.

For Python work in `optimizer-api/`, use `uv` commands (`uv run`, `uv sync`) instead of calling Python tools directly.

Cardmarket is strict about scraping and can return HTTP 429 quickly because of Cloudflare protections. Rate limit requests carefully.

When Cardmarket request formulation is unclear, ask user to perform website action and capture real network request instead of guessing.
