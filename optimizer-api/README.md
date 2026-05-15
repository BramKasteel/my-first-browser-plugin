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
- fixed 1 EUR shipping cost per active seller

Supported constraints:
- fulfill requested quantity for each wanted item
- optional seller-country allow list
- optional seller block list
- optional max seller count

Seller reputation intentionally stays out of optimizer payload. Filter by reputation during scrape stage, then treat remaining sellers as equal on that dimension.

This is deliberate first cut. Real Cardmarket shipping should later be internal optimizer logic based on buyer country, seller country, and package characteristics, not frontend-provided shipping data.

## Layout

- `app/main.py` FastAPI app and endpoints
- `app/models.py` request/response schema
- `app/solver.py` OR-Tools optimization model
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
python -m venv .venv
. .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for Swagger UI.

Run tests:

```bash
cd optimizer-api
pip install -e .[dev]
pytest -q
```

## API

### `GET /health`

Basic health and version check.

### `POST /optimize`

Accepts optimization payload from plugin fixture dumps in `tests/fixtures/requests/` and returns cheapest valid order under current model.

## Extension boundary

Recommended boundary stays same:
- extension scrapes and normalizes Cardmarket data
- extension posts payload to optimizer API
- API optimizes only

Keep raw scrape fragments out of optimization endpoint. Send normalized IDs and scalar facts only.