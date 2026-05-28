from __future__ import annotations

import json

from app.shipping import (
    ShippingTier,
    _load_shipping_route_book,
    method_card_capacity,
    parse_eur_to_cents,
    prune_dominated_shipping_tiers,
)


def test_parse_eur_to_cents_handles_cardmarket_format() -> None:
    assert parse_eur_to_cents("1,55 €") == 155
    assert parse_eur_to_cents("1.000,00 €") == 100000
    assert parse_eur_to_cents("4.10лв") == 410
    assert parse_eur_to_cents("46,00 kr") == 4600


def test_method_card_capacity_uses_letter_breakpoints() -> None:
    assert method_card_capacity(20) == 4
    assert method_card_capacity(50) == 17
    assert method_card_capacity(100) == 40
    assert method_card_capacity(250) == 100


def test_prune_dominated_shipping_tiers_uses_card_capacity_for_letters() -> None:
    kept = prune_dominated_shipping_tiers(
        [
            (
                True,
                ShippingTier(
                    total_price_cents=155, max_value_cents=2500, max_weight_grams=20
                ),
            ),
            (
                True,
                ShippingTier(
                    total_price_cents=155, max_value_cents=2500, max_weight_grams=17
                ),
            ),
            (
                False,
                ShippingTier(
                    total_price_cents=155, max_value_cents=2500, max_weight_grams=20
                ),
            ),
        ],
    )

    assert kept == [
        (
            False,
            ShippingTier(
                total_price_cents=155, max_value_cents=2500, max_weight_grams=20
            ),
        ),
    ]


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

    tiers = route_book.lookup_tiers(
        seller_country="Germany", buyer_country="Netherlands"
    )
    assert [
        (tier.total_price_cents, tier.max_value_cents, tier.max_weight_grams)
        for tier in tiers.letter_tiers
    ] == [
        (155, 2500, 20),
        (200, 2500, 50),
    ]
    assert [
        (tier.total_price_cents, tier.max_value_cents, tier.max_weight_grams)
        for tier in tiers.parcel_tiers
    ] == [
        (799, 2500, 1000),
    ]


def test_load_shipping_route_book_prunes_tracked_letter_duplicate_when_no_better(
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
                                "name": "Letter Untracked",
                                "isTracked": False,
                                "maxValue": "25,00 €",
                                "maxWeight": 50,
                                "stampPrice": "1,95 €",
                                "price": "2,25 €",
                                "isLetter": True,
                                "isVirtual": False,
                            },
                            {
                                "name": "Letter Tracked Cheaper",
                                "isTracked": True,
                                "maxValue": "25,00 €",
                                "maxWeight": 50,
                                "stampPrice": "1,70 €",
                                "price": "2,00 €",
                                "isLetter": True,
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
    assert [method.name for method in methods] == ["Letter Tracked Cheaper"]


def test_load_shipping_route_book_builds_tiers_for_mixed_letter_and_parcel_route(
    tmp_path,
) -> None:
    fixture_path = tmp_path / "shipping_costs.json"
    fixture_path.write_text(
        json.dumps(
            {
                "countries": [
                    {"name": "Netherlands", "externalId": 23},
                ],
                "routes": [
                    {
                        "from_country": "Netherlands",
                        "to_country": "Netherlands",
                        "methods": [
                            {
                                "name": "Brief 20g",
                                "isTracked": False,
                                "maxValue": "25,00 €",
                                "maxWeight": 20,
                                "stampPrice": "1,40 €",
                                "price": "1,70 €",
                                "isLetter": True,
                                "isVirtual": False,
                            },
                            {
                                "name": "Brief 50g",
                                "isTracked": False,
                                "maxValue": "25,00 €",
                                "maxWeight": 50,
                                "stampPrice": "2,80 €",
                                "price": "3,10 €",
                                "isLetter": True,
                                "isVirtual": False,
                            },
                            {
                                "name": "Parcel",
                                "isTracked": False,
                                "maxValue": "100,00 €",
                                "maxWeight": 1000,
                                "stampPrice": "9,45 €",
                                "price": "9,75 €",
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

    tiers = route_book.lookup_tiers(
        seller_country="Netherlands", buyer_country="Netherlands"
    )
    assert [
        (tier.total_price_cents, tier.max_value_cents, tier.max_weight_grams)
        for tier in tiers.letter_tiers
    ] == [
        (170, 2500, 20),
        (310, 2500, 50),
    ]
    assert [
        (tier.total_price_cents, tier.max_value_cents, tier.max_weight_grams)
        for tier in tiers.parcel_tiers
    ] == [
        (975, 10000, 1000),
    ]
