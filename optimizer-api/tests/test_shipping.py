from __future__ import annotations

import json
from pathlib import Path

from app.shipping import (
    ShippingTier,
    _load_shipping_route_book,
    _normalize_route_tiers,
    approximate_shipping_cost_cents,
    minimum_shipping_cost_cents,
    parse_eur_to_cents,
)


def test_parse_eur_to_cents_handles_cardmarket_format() -> None:
    assert parse_eur_to_cents("1,55 €") == 155
    assert parse_eur_to_cents("1.000,00 €") == 100000
    assert parse_eur_to_cents("4.10лв") == 410
    assert parse_eur_to_cents("46,00 kr") == 4600


def test_normalize_route_tiers_keeps_real_method_limits() -> None:
    tiers = _normalize_route_tiers(
        [
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
                "name": "Letter 17g",
                "isTracked": False,
                "maxValue": "25,00 €",
                "maxWeight": 17,
                "stampPrice": "1,25 €",
                "price": "1,55 €",
                "isLetter": True,
                "isVirtual": False,
            },
            {
                "name": "Parcel 20g",
                "isTracked": False,
                "maxValue": "25,00 €",
                "maxWeight": 20,
                "stampPrice": "1,25 €",
                "price": "1,55 €",
                "isLetter": False,
                "isVirtual": False,
            },
        ],
    )

    assert tiers.tiers == (
        ShippingTier(
            total_price_cents=155,
            max_value_cents=10_000_000,
            max_weight_grams=1_000_000,
        ),
    )


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
    tiers = route_book.lookup_tiers(
        seller_country="GERMANY", buyer_country="netherlands"
    )
    assert len(tiers.tiers) == 1
    assert tiers.tiers[0].total_price_cents == 155
    assert tiers.tiers[0].max_value_cents == 10_000_000
    assert tiers.tiers[0].max_weight_grams == 1_000_000


def test_lookup_tiers_prunes_to_cheapest_feasible_method_for_order_bounds(
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
                                "name": "Parcel",
                                "isTracked": False,
                                "maxValue": "500,00 €",
                                "maxWeight": 5000,
                                "stampPrice": "6,99 €",
                                "price": "7,99 €",
                                "isLetter": False,
                                "isVirtual": False,
                            },
                            {
                                "name": "Registered Parcel",
                                "isTracked": True,
                                "maxValue": "500,00 €",
                                "maxWeight": 5000,
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

    tiers = route_book.lookup_tiers(
        seller_country="Germany",
        buyer_country="Netherlands",
        seller_value_upper_bound=2500,
        seller_weight_upper_bound=10,
    )

    assert tiers.tiers == (
        ShippingTier(
            total_price_cents=155,
            max_value_cents=10_000_000,
            max_weight_grams=1_000_000,
        ),
    )


def test_minimum_shipping_cost_returns_flat_route_price(tmp_path) -> None:
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
                                "name": "Parcel",
                                "isTracked": False,
                                "maxValue": "500,00 €",
                                "maxWeight": 5000,
                                "stampPrice": "6,99 €",
                                "price": "7,99 €",
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

    assert (
        minimum_shipping_cost_cents(
            seller_country="Germany",
            buyer_country="Netherlands",
            route_book=route_book,
            missing_route_cost_cents=9_999,
        )
        == 155
    )


def test_approximate_shipping_cost_uses_de_to_nl_weight_and_value_breakpoints() -> None:
    route_book = _load_shipping_route_book(
        Path(__file__).resolve().parents[1] / "app" / "data" / "shipping_costs.json"
    )

    assert (
        approximate_shipping_cost_cents(
            seller_country="Germany",
            buyer_country="Netherlands",
            total_value_cents=2_400,
            total_weight_grams=10,
            route_book=route_book,
            missing_route_cost_cents=9_999,
        )
        == 155
    )
    assert (
        approximate_shipping_cost_cents(
            seller_country="Germany",
            buyer_country="Netherlands",
            total_value_cents=2_400,
            total_weight_grams=11,
            route_book=route_book,
            missing_route_cost_cents=9_999,
        )
        == 799
    )
    assert (
        approximate_shipping_cost_cents(
            seller_country="Germany",
            buyer_country="Netherlands",
            total_value_cents=2_600,
            total_weight_grams=10,
            route_book=route_book,
            missing_route_cost_cents=9_999,
        )
        == 1549
    )


def test_approximate_shipping_cost_uses_nl_to_nl_letter_steps_and_brievenbuspakje() -> (
    None
):
    route_book = _load_shipping_route_book(
        Path(__file__).resolve().parents[1] / "app" / "data" / "shipping_costs.json"
    )

    assert (
        approximate_shipping_cost_cents(
            seller_country="Netherlands",
            buyer_country="Netherlands",
            total_value_cents=2_400,
            total_weight_grams=10,
            route_book=route_book,
            missing_route_cost_cents=9_999,
        )
        == 170
    )
    assert (
        approximate_shipping_cost_cents(
            seller_country="Netherlands",
            buyer_country="Netherlands",
            total_value_cents=2_400,
            total_weight_grams=11,
            route_book=route_book,
            missing_route_cost_cents=9_999,
        )
        == 310
    )
    assert (
        approximate_shipping_cost_cents(
            seller_country="Netherlands",
            buyer_country="Netherlands",
            total_value_cents=2_400,
            total_weight_grams=44,
            route_book=route_book,
            missing_route_cost_cents=9_999,
        )
        == 485
    )
    assert (
        approximate_shipping_cost_cents(
            seller_country="Netherlands",
            buyer_country="Netherlands",
            total_value_cents=2_400,
            total_weight_grams=351,
            route_book=route_book,
            missing_route_cost_cents=9_999,
        )
        == 620
    )
    assert (
        approximate_shipping_cost_cents(
            seller_country="Netherlands",
            buyer_country="Netherlands",
            total_value_cents=2_600,
            total_weight_grams=10,
            route_book=route_book,
            missing_route_cost_cents=9_999,
        )
        == 620
    )


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

    tiers = route_book.lookup_tiers(
        seller_country="germany", buyer_country="netherlands"
    )
    assert [tier.total_price_cents for tier in tiers.tiers] == [155]


def test_load_shipping_route_book_keeps_cheapest_method_after_filtering(
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

    tiers = route_book.lookup_tiers(
        seller_country="Germany", buyer_country="Netherlands"
    )
    assert [
        (tier.total_price_cents, tier.max_value_cents, tier.max_weight_grams)
        for tier in tiers.tiers
    ] == [
        (799, 10_000_000, 1_000_000),
    ]


def test_load_shipping_route_book_uses_cheapest_letter_when_letters_exist(
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
                                "name": "Parcel Dominated",
                                "isTracked": False,
                                "maxValue": "25,00 €",
                                "maxWeight": 1000,
                                "stampPrice": "8,49 €",
                                "price": "8,99 €",
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

    tiers = route_book.lookup_tiers(
        seller_country="Germany", buyer_country="Netherlands"
    )
    assert [
        (tier.total_price_cents, tier.max_value_cents, tier.max_weight_grams)
        for tier in tiers.tiers
    ] == [
        (155, 10_000_000, 1_000_000),
    ]


def test_normalize_route_tiers_keeps_cheapest_parcel_when_only_parcels_exist() -> None:
    tiers = _normalize_route_tiers(
        [
            {
                "name": "Parcel Small",
                "isTracked": False,
                "maxValue": "25,00 €",
                "maxWeight": 2000,
                "stampPrice": "6,99 €",
                "price": "7,99 €",
                "isLetter": False,
                "isVirtual": False,
            },
            {
                "name": "Parcel Heavy Duplicate",
                "isTracked": False,
                "maxValue": "25,00 €",
                "maxWeight": 5000,
                "stampPrice": "8,99 €",
                "price": "7,99 €",
                "isLetter": False,
                "isVirtual": False,
            },
        ],
    )

    assert tiers.tiers == (
        ShippingTier(
            total_price_cents=799,
            max_value_cents=10_000_000,
            max_weight_grams=1_000_000,
        ),
    )


def test_load_shipping_route_book_prefers_cheapest_letter_duplicate(
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

    tiers = route_book.lookup_tiers(
        seller_country="Germany", buyer_country="Netherlands"
    )
    assert [(tier.total_price_cents,) for tier in tiers.tiers] == [(200,)]


def test_load_shipping_route_book_builds_flat_fee_for_mixed_letter_and_parcel_route(
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
        for tier in tiers.tiers
    ] == [
        (170, 10_000_000, 1_000_000),
    ]
