from __future__ import annotations

import json

from app.shipping import _load_shipping_route_book, parse_eur_to_cents


def test_parse_eur_to_cents_handles_cardmarket_format() -> None:
    assert parse_eur_to_cents("1,55 €") == 155
    assert parse_eur_to_cents("1.000,00 €") == 100000
    assert parse_eur_to_cents("4.10лв") == 410
    assert parse_eur_to_cents("46,00 kr") == 4600


def test_load_shipping_route_book_normalizes_countries(tmp_path) -> None:
    fixture_path = tmp_path / "shipping_costs.json"
    fixture_path.write_text(
        json.dumps(
            {
                "countries": [
                    {"name": "Germany", "externalId": 7},
                    {"name": "Netherlands", "externalId": 23},
                    {"name": "INVALID_ID", "externalId": 0},
                ],
                "routes": [
                    {
                        "from_country": "Germany",
                        "to_country": "Netherlands",
                        "methods": [
                            {
                                "name": "Letter",
                                "isTracked": False,
                                "maxValue": "25,00 €",
                                "maxWeight": 20,
                                "stampPrice": "1,25 €",
                                "price": "1,55 €",
                                "isLetter": True,
                                "isVirtual": False,
                            }
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    route_book = _load_shipping_route_book(fixture_path)

    assert route_book.lookup_country_id("Germany") == 7
    assert route_book.lookup_country_id("Netherlands") == 23
    methods = route_book.lookup_methods(
        seller_country="GERMANY", buyer_country="netherlands"
    )
    assert len(methods) == 1
    assert methods[0].total_price_cents == 155
    assert methods[0].max_value_cents == 2500
