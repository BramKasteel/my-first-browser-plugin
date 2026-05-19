from __future__ import annotations

from app.models import (
    Offer,
    OptimizationPreferences,
    OptimizationRequest,
    Seller,
    WantedItem,
)
from app.shipping import (
    ShippingMethod,
    ShippingRouteBook,
    ShippingRouteTiers,
    ShippingTier,
)
from app.solver import (
    MISSING_ROUTE_DATA_PENALTY_CENTS,
    _prune_dominated_offers,
    optimize_order,
)


def _tiers(
    *, letter: list[tuple[int, int, int]], parcel: list[tuple[int, int, int]]
) -> ShippingRouteTiers:
    return ShippingRouteTiers(
        letter_tiers=tuple(
            ShippingTier(
                total_price_cents=total_price_cents,
                max_value_cents=max_value_cents,
                max_weight_grams=max_weight_grams,
            )
            for total_price_cents, max_value_cents, max_weight_grams in letter
        ),
        parcel_tiers=tuple(
            ShippingTier(
                total_price_cents=total_price_cents,
                max_value_cents=max_value_cents,
                max_weight_grams=max_weight_grams,
            )
            for total_price_cents, max_value_cents, max_weight_grams in parcel
        ),
    )


def _request(
    *, unit_price: float, quantity: int, unit_weight_grams: int | None = None
) -> OptimizationRequest:
    return OptimizationRequest(
        buyer_country="Netherlands",
        items=[
            WantedItem(
                item_id="item-1",
                name="Card",
                quantity=quantity,
                cards_per_unit=1,
                unit_weight_grams=unit_weight_grams,
            )
        ],
        sellers=[Seller(seller_id="seller-1", name="Seller", country="Germany")],
        offers=[
            Offer(
                offer_id="offer-1",
                item_id="item-1",
                seller_id="seller-1",
                unit_price=unit_price,
                available_quantity=quantity,
            )
        ],
        preferences=OptimizationPreferences(),
    )


def test_optimize_uses_imported_letter_shipping_when_weight_and_value_fit(
    monkeypatch,
) -> None:
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        methods_by_route={
            ("germany", "netherlands"): (
                ShippingMethod(
                    name="Letter",
                    is_tracked=False,
                    max_value_cents=2500,
                    max_weight_grams=20,
                    stamp_price_cents=125,
                    total_price_cents=155,
                    is_letter=True,
                    is_virtual=False,
                ),
                ShippingMethod(
                    name="Registered Parcel",
                    is_tracked=True,
                    max_value_cents=50000,
                    max_weight_grams=5000,
                    stamp_price_cents=749,
                    total_price_cents=799,
                    is_letter=False,
                    is_virtual=False,
                ),
            )
        },
        tiers_by_route={
            ("germany", "netherlands"): _tiers(
                letter=[(155, 2500, 20)],
                parcel=[(799, 50000, 5000)],
            )
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    response = optimize_order(_request(unit_price=1.0, quantity=2))

    assert response.status == "optimal"
    assert response.totals.shipping_total == 1.55


def test_optimize_uses_more_expensive_method_when_value_exceeds_letter_limit(
    monkeypatch,
) -> None:
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        methods_by_route={
            ("germany", "netherlands"): (
                ShippingMethod(
                    name="Letter",
                    is_tracked=False,
                    max_value_cents=2500,
                    max_weight_grams=20,
                    stamp_price_cents=125,
                    total_price_cents=155,
                    is_letter=True,
                    is_virtual=False,
                ),
                ShippingMethod(
                    name="Registered Parcel",
                    is_tracked=True,
                    max_value_cents=50000,
                    max_weight_grams=5000,
                    stamp_price_cents=749,
                    total_price_cents=799,
                    is_letter=False,
                    is_virtual=False,
                ),
            )
        },
        tiers_by_route={
            ("germany", "netherlands"): _tiers(
                letter=[(155, 2500, 20)],
                parcel=[(799, 50000, 5000)],
            )
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    response = optimize_order(_request(unit_price=30.0, quantity=1))

    assert response.status == "optimal"
    assert response.totals.shipping_total == 7.99


def test_optimize_uses_penalty_shipping_for_missing_imported_route(monkeypatch) -> None:
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        methods_by_route={},
        tiers_by_route={},
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    request = OptimizationRequest(
        buyer_country="Netherlands",
        items=[WantedItem(item_id="item-1", name="Card", quantity=1)],
        sellers=[Seller(seller_id="seller-1", name="Seller", country="Germany")],
        offers=[
            Offer(
                offer_id="offer-1",
                item_id="item-1",
                seller_id="seller-1",
                unit_price=1.0,
                available_quantity=1,
            )
        ],
        preferences=OptimizationPreferences(),
    )

    response = optimize_order(request)

    assert response.status == "optimal"
    assert response.totals.shipping_total == MISSING_ROUTE_DATA_PENALTY_CENTS / 100


def test_optimize_uses_legacy_shipping_when_imported_data_unavailable(
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.solver.shipping.load_shipping_route_book", lambda: None)

    response = optimize_order(_request(unit_price=1.0, quantity=1))

    assert response.status == "optimal"
    assert response.totals.shipping_total == 1.55


def test_optimize_uses_card_count_thresholds_for_letter_breakpoints(
    monkeypatch,
) -> None:
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        methods_by_route={
            ("germany", "netherlands"): (
                ShippingMethod(
                    name="Letter 20g",
                    is_tracked=False,
                    max_value_cents=2500,
                    max_weight_grams=20,
                    stamp_price_cents=125,
                    total_price_cents=155,
                    is_letter=True,
                    is_virtual=False,
                ),
                ShippingMethod(
                    name="Letter 50g",
                    is_tracked=False,
                    max_value_cents=2500,
                    max_weight_grams=50,
                    stamp_price_cents=170,
                    total_price_cents=200,
                    is_letter=True,
                    is_virtual=False,
                ),
            )
        },
        tiers_by_route={
            ("germany", "netherlands"): _tiers(
                letter=[(155, 2500, 20), (200, 2500, 50)],
                parcel=[],
            )
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    response = optimize_order(_request(unit_price=1.0, quantity=5))

    assert response.status == "optimal"
    assert response.totals.shipping_total == 2.0


def test_optimize_uses_parcel_tier_for_parcel_only_items(monkeypatch) -> None:
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        methods_by_route={},
        tiers_by_route={
            ("germany", "netherlands"): _tiers(
                letter=[(155, 2500, 20)],
                parcel=[(799, 50000, 5000)],
            )
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    request = OptimizationRequest(
        buyer_country="Netherlands",
        items=[
            WantedItem(
                item_id="item-1",
                name="Binder",
                quantity=1,
                cards_per_unit=0,
                requires_parcel=True,
            )
        ],
        sellers=[Seller(seller_id="seller-1", name="Seller", country="Germany")],
        offers=[
            Offer(
                offer_id="offer-1",
                item_id="item-1",
                seller_id="seller-1",
                unit_price=1.0,
                available_quantity=1,
            )
        ],
        preferences=OptimizationPreferences(),
    )

    response = optimize_order(request)

    assert response.status == "optimal"
    assert response.totals.shipping_total == 7.99


def test_optimize_returns_empty_cart_summary_for_infeasible_request() -> None:
    request = OptimizationRequest(
        buyer_country="Netherlands",
        items=[WantedItem(item_id="item-1", name="Card", quantity=2)],
        sellers=[Seller(seller_id="seller-1", name="Seller", country="Germany")],
        offers=[
            Offer(
                offer_id="offer-1",
                item_id="item-1",
                seller_id="seller-1",
                unit_price=1.0,
                available_quantity=1,
            )
        ],
        preferences=OptimizationPreferences(),
    )

    response = optimize_order(request)

    assert response.status == "infeasible"
    assert response.cart.sellers == []
    assert response.cart.total_sellers == 0
    assert response.cart.total_units == 0


def test_prune_dominated_offers_drops_more_expensive_duplicate() -> None:
    offers = [
        Offer(
            offer_id="offer-1",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=1.0,
            available_quantity=2,
            condition="Near Mint",
            language="English",
        ),
        Offer(
            offer_id="offer-2",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=1.5,
            available_quantity=1,
            condition="Near Mint",
            language="English",
        ),
    ]

    item_map = {"item-1": WantedItem(item_id="item-1", name="Card", quantity=1)}

    pruned = _prune_dominated_offers(offers, item_map)

    assert [offer.offer_id for offer in pruned] == ["offer-1"]


def test_prune_dominated_offers_keeps_cheapest_n_per_seller_item() -> None:
    offers = [
        Offer(
            offer_id="offer-1",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=1.0,
            available_quantity=2,
            condition="Near Mint",
            language="English",
        ),
        Offer(
            offer_id="offer-2",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=0.9,
            available_quantity=2,
            condition="Excellent",
            language="English",
        ),
        Offer(
            offer_id="offer-3",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=0.8,
            available_quantity=2,
            condition="Near Mint",
            language="German",
        ),
    ]

    item_map = {"item-1": WantedItem(item_id="item-1", name="Card", quantity=2)}

    pruned = _prune_dominated_offers(offers, item_map)

    assert [offer.offer_id for offer in pruned] == ["offer-2", "offer-3"]


def test_prune_dominated_offers_keeps_n_cheapest_even_when_input_order_is_scrambled() -> (
    None
):
    offers = [
        Offer(
            offer_id="offer-4",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=1.4,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-2",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=1.1,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-1",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=0.9,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-3",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=1.2,
            available_quantity=1,
        ),
    ]

    item_map = {"item-1": WantedItem(item_id="item-1", name="Card", quantity=2)}

    pruned = _prune_dominated_offers(offers, item_map)

    assert sorted(offer.offer_id for offer in pruned) == ["offer-1", "offer-2"]


def test_prune_dominated_offers_prefers_higher_quantity_on_price_tie() -> None:
    offers = [
        Offer(
            offer_id="offer-1",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=1.0,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-2",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=1.0,
            available_quantity=3,
        ),
    ]

    item_map = {"item-1": WantedItem(item_id="item-1", name="Card", quantity=1)}

    pruned = _prune_dominated_offers(offers, item_map)

    assert [offer.offer_id for offer in pruned] == ["offer-2"]


def test_prune_dominated_offers_keeps_all_options_when_wanted_quantity_exceeds_bucket() -> (
    None
):
    offers = [
        Offer(
            offer_id="offer-1",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=1.0,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-2",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=1.2,
            available_quantity=1,
        ),
    ]

    item_map = {"item-1": WantedItem(item_id="item-1", name="Card", quantity=3)}

    pruned = _prune_dominated_offers(offers, item_map)

    assert [offer.offer_id for offer in pruned] == ["offer-1", "offer-2"]
