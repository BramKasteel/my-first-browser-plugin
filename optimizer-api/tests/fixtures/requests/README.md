# Real optimizer request fixtures

Put real JSON dumps from plugin popup here.

Source:
- plugin popup
- `Optimizer` tab
- `Copy JSON`

Rules:
- one request payload per file
- use `.json` extension
- keep payload shape exactly as sent to API
- sanitize if needed before commit

Examples:
- `single-seller-cheap.json`
- `two-seller-tradeoff.json`
- `country-filter-edge.json`

These fixtures are loaded automatically by `tests/test_api.py`.