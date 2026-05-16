# Optimizer API

Standalone Python service for order optimization after extension finishes scraping seller data from Cardmarket.

Current scope:
- accept normalized scrape payload
- solve simplified MILP/CP-SAT order selection problem
- return chosen offers, chosen sellers, and cost breakdown

Out of scope for first scaffold:
- live Cardmarket scraping
- exact checkout shipping reproduction
- auth, persistence, queueing

## Model

Solver currently minimizes:
- item price
- imported Cardmarket shipping method cost when route data and item weights exist
- legacy flat route proxy otherwise

Supported constraints:
- fulfill requested quantity for each wanted item
- optional seller-country allow list
- optional seller block list
- optional max seller count

Seller reputation intentionally stays out of optimizer payload. Filter by reputation during scrape stage, then treat remaining sellers as equal on that dimension.

Current richer shipping path stays approximate:
- import country-pair shipping methods from Cardmarket help API
- choose valid method per seller based on selected item value and either card-count thresholds or explicit item weight overrides
- block letter methods for items flagged `requires_parcel`

Default card-count approximation uses Cardmarket help thresholds:
- up to 4 cards => 20g letter
- up to 17 cards => 50g letter
- up to 40 cards => 100g letter

Above 40 cards, solver treats parcel capacity with a simple card-count approximation unless explicit `unit_weight_grams` values are supplied.

If imported route data is missing, solver falls back to legacy per-route proxy.

## Layout

- `app/main.py` FastAPI app and endpoints
- `app/models.py` request/response schema
- `app/solver.py` OR-Tools optimization model
- `app/shipping.py` shipping dataset loader and legacy fallback model
- `app/import_shipping_costs.py` importer for Cardmarket help shipping API
- `tests/fixtures/requests/` real optimizer payload dumps copied from plugin popup
- `tests/test_api.py` fixture-driven API tests

## Real data fixtures

Put real plugin dumps in `tests/fixtures/requests/`.

Recommended flow:
- run plugin scrape
- open `Optimizer` tab in popup
- copy JSON
- save as `tests/fixtures/requests/<short-case-name>.json`

Good fixture names:
- `single-seller-cheap.json`
- `two-seller-tradeoff.json`
- `country-filter-edge.json`
- `large-want-list-01.json`

Keep fixtures sanitized if seller names or other details should not leave local machine.

Tests will automatically pick up every `*.json` file in that directory.

## Local run

```bash
cd optimizer-api
uv sync --extra dev
uv run uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for Swagger UI.

Run tests:

```bash
cd optimizer-api
uv run pytest -q
```

Import shipping data:

```bash
cd optimizer-api
uv run cm-import-shipping --delay-seconds 1.5
```

For smaller syncs while iterating:

```bash
cd optimizer-api
uv run cm-import-shipping --from-country Germany --to-country Netherlands
```

If Cardmarket blocks direct requests from CLI, collect data from extension/browser context instead and write same JSON shape to `app/data/shipping_costs.json`.

## API

### `GET /health`

Basic health and version check.

### `POST /optimize`

Accepts optimization payload from plugin fixture dumps in `tests/fixtures/requests/` and returns cheapest valid order under current model.

Optional wanted-item shipping fields:
- `cards_per_unit`: default `1`; use higher values if one wanted unit represents multiple cards
- `unit_weight_grams`: optional override when you want explicit weight-based routing instead of card-count approximation
- `requires_parcel`: blocks letter methods for that item

## Extension boundary

Recommended boundary stays same:
- extension scrapes and normalizes Cardmarket data
- extension posts payload to optimizer API
- API optimizes only

Keep raw scrape fragments out of optimization endpoint. Send normalized IDs and scalar facts only.