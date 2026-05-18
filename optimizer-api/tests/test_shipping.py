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


def test_load_shipping_route_book_skips_estimation_methods(tmp_path) -> None:
    fixture_path = tmp_path / "shipping_costs.json"
    fixture_path.write_text(
        json.dumps(
            {
                "countries": [
                    {"name": "Germany", "externalId": 7},
                    {"name": "Netherlands", "externalId": 23},
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
                            },
                            {
                                "name": "SHIPPING COST ESTIMATION for Courier Parcel with Full Insurance",
                                "isTracked": True,
                                "maxValue": "50.000,00 €",
                                "maxWeight": 20000,
                                "stampPrice": "1.049,00 €",
                                "price": "1.050,00 €",
                                "isLetter": False,
                                "isVirtual": False,
                            },
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    route_book = _load_shipping_route_book(fixture_path)

    methods = route_book.lookup_methods(
        seller_country="germany", buyer_country="netherlands"
    )
    assert [method.name for method in methods] == ["Letter"]


def test_load_shipping_route_book_prunes_insured_express_and_heavy_duplicates(
    tmp_path,
) -> None:
    fixture_path = tmp_path / "shipping_costs.json"
    fixture_path.write_text(
        json.dumps(
            {
                "countries": [
                    {"name": "Germany", "externalId": 7},
                    {"name": "Netherlands", "externalId": 23},
                ],
                "routes": [
                    {
                        "from_country": "Germany",
                        "to_country": "Netherlands",
                        "methods": [
                            {
                                "name": "Small Parcel",
                                "isTracked": False,
                                "maxValue": "25,00 €",
                                "maxWeight": 2000,
                                "stampPrice": "6,99 €",
                                "price": "7,99 €",
                                "isLetter": False,
                                "isVirtual": False,
                            },
                            {
                                "name": "Large Parcel",
                                "isTracked": False,
                                "maxValue": "25,00 €",
                                "maxWeight": 5000,
                                "stampPrice": "10,49 €",
                                "price": "11,49 €",
                                "isLetter": False,
                                "isVirtual": False,
                            },
                            {
                                "name": "Registered Parcel",
                                "isTracked": True,
                                "maxValue": "500,00 €",
                                "maxWeight": 2000,
                                "stampPrice": "14,49 €",
                                "price": "15,49 €",
                                "isLetter": False,
                                "isVirtual": False,
                            },
                            {
                                "name": "Registered Parcel Heavy",
                                "isTracked": True,
                                "maxValue": "500,00 €",
                                "maxWeight": 10000,
                                "stampPrice": "22,49 €",
                                "price": "23,49 €",
                                "isLetter": False,
                                "isVirtual": False,
                            },
                            {
                                "name": "DHL Express",
                                "isTracked": True,
                                "maxValue": "500,00 €",
                                "maxWeight": 500,
                                "stampPrice": "52,00 €",
                                "price": "53,00 €",
                                "isLetter": False,
                                "isVirtual": False,
                            },
                            {
                                "name": "Insured Parcel",
                                "isTracked": True,
                                "maxValue": "1.000,00 €",
                                "maxWeight": 5000,
                                "stampPrice": "31,49 €",
                                "price": "32,49 €",
                                "isLetter": False,
                                "isVirtual": False,
                            },
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    route_book = _load_shipping_route_book(fixture_path)

    methods = route_book.lookup_methods(
        seller_country="Germany", buyer_country="Netherlands"
    )
    assert [(method.name, method.max_weight_grams) for method in methods] == [
        ("Small Parcel", 1000),
    ]


def test_load_shipping_route_book_keeps_letters_and_one_cheapest_parcel(
    tmp_path,
) -> None:
    fixture_path = tmp_path / "shipping_costs.json"
    fixture_path.write_text(
        json.dumps(
            {
                "countries": [
                    {"name": "Germany", "externalId": 7},
                    {"name": "Netherlands", "externalId": 23},
                ],
                "routes": [
                    {
                        "from_country": "Germany",
                        "to_country": "Netherlands",
                        "methods": [
                            {
                                "name": "Letter 20g",
                                "isTracked": False,
                                "maxValue": "25,00 €",
                                "maxWeight": 20,
                                "stampPrice": "1,25 €",
                                "price": "1,55 €",
                                "isLetter": True,
                                "isVirtual": False,
                            },
                            {
                                "name": "Letter 50g",
                                "isTracked": False,
                                "maxValue": "25,00 €",
                                "maxWeight": 50,
                                "stampPrice": "1,70 €",
                                "price": "2,00 €",
                                "isLetter": True,
                                "isVirtual": False,
                            },
                            {
                                "name": "Parcel Cheap",
                                "isTracked": False,
                                "maxValue": "25,00 €",
                                "maxWeight": 2000,
                                "stampPrice": "6,99 €",
                                "price": "7,99 €",
                                "isLetter": False,
                                "isVirtual": False,
                            },
                            {
                                "name": "Parcel Expensive",
                                "isTracked": True,
                                "maxValue": "500,00 €",
                                "maxWeight": 2000,
                                "stampPrice": "14,49 €",
                                "price": "15,49 €",
                                "isLetter": False,
                                "isVirtual": False,
                            },
                        ],
                    }
                ],
            }
        ),
        encoding="utf-8",
    )

    route_book = _load_shipping_route_book(fixture_path)

    methods = route_book.lookup_methods(
        seller_country="Germany", buyer_country="Netherlands"
    )
    assert [(method.name, method.max_weight_grams) for method in methods] == [
        ("Letter 20g", 20),
        ("Letter 50g", 50),
        ("Parcel Cheap", 1000),
    ]
