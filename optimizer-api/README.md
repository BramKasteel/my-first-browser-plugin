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
- per-seller flat shipping cost
- per-seller per-item shipping cost

Supported constraints:
- fulfill requested quantity for each wanted item
- optional seller-country allow list
- optional seller block list
- optional max seller count
- optional free-shipping threshold per seller
- optional minimum order value per seller

Seller reputation intentionally stays out of optimizer payload. Filter by reputation during scrape stage, then treat remaining sellers as equal on that dimension.

This is deliberate first cut. Real Cardmarket shipping rules can be layered in later by extending `ShippingProfile` and solver constraints.

## Layout

- `app/main.py` FastAPI app and endpoints
- `app/models.py` request/response schema
- `app/solver.py` OR-Tools optimization model
- `examples/sample-request.json` example payload from extension side
- `examples/sample-response.json` example optimized response

## Local run

```bash
cd optimizer-api
python -m venv .venv
. .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for Swagger UI.

## API

### `GET /health`

Basic health and version check.

### `POST /optimize`

Accepts optimization payload, returns cheapest valid order under current model.

Example request:

```json
{
  "buyer_country": "Netherlands",
  "currency": "EUR",
  "items": [
    {
      "item_id": "item-1",
      "name": "Lightning Bolt",
      "quantity": 2
    }
  ],
  "sellers": [
    {
      "seller_id": "seller-a",
      "name": "Trader One",
      "country": "Germany"
    }
  ],
  "offers": [
    {
      "offer_id": "offer-1",
      "item_id": "item-1",
      "seller_id": "seller-a",
      "unit_price": 1.45,
      "available_quantity": 2
    }
  ],
  "shipping_profiles": [
    {
      "seller_id": "seller-a",
      "base_cost": 3.5,
      "per_item_cost": 0.1
    }
  ]
}
```

## Extension boundary

Recommended boundary stays same:
- extension scrapes and normalizes Cardmarket data
- extension posts payload to optimizer API
- API optimizes only

Keep raw scrape fragments out of optimization endpoint. Send normalized IDs and scalar facts only.