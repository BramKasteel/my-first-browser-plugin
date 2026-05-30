from __future__ import annotations

from app.models import (
    Offer,
    OptimizationPreferences,
    OptimizationRequest,
    Seller,
    WantedItem,
)
from app.shipping import (
    ShippingRouteBook,
    ShippingRouteTiers,
    ShippingTier,
)
from app.solver import (
    MISSING_ROUTE_DATA_PENALTY_CENTS,
    _prune_cheapest_single_item_sellers,
    _prune_dominated_offers_per_seller,
    optimize_order,
)


def _tiers(*, values: list[tuple[int, int, int]]) -> ShippingRouteTiers:
    return ShippingRouteTiers(
        tiers=tuple(
            ShippingTier(
                total_price_cents=total_price_cents,
                max_value_cents=max_value_cents,
                max_weight_grams=max_weight_grams,
            )
            for total_price_cents, max_value_cents, max_weight_grams in values
        ),
    )


def _request(*, unit_price: float, quantity: int) -> OptimizationRequest:
    return OptimizationRequest(
        buyer_country="Netherlands",
        items=[
            WantedItem(
                item_id="item-1",
                name="Card",
                quantity=quantity,
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
        tiers_by_route={
            ("germany", "netherlands"): _tiers(
                values=[(155, 2500, 10), (799, 50000, 1000)],
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
        tiers_by_route={
            ("germany", "netherlands"): _tiers(
                values=[(155, 2500, 10), (799, 50000, 1000)],
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


def test_optimize_uses_card_count_thresholds_for_letter_breakpoints(
    monkeypatch,
) -> None:
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        tiers_by_route={
            ("germany", "netherlands"): _tiers(
                values=[(155, 2500, 10), (200, 2500, 43)],
            )
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    response = optimize_order(_request(unit_price=1.0, quantity=5))

    assert response.status == "optimal"
    assert response.totals.shipping_total == 2.0


def test_optimize_ignores_parcel_weight_limit_for_simple_card_orders(
    monkeypatch,
) -> None:
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        tiers_by_route={
            ("germany", "netherlands"): _tiers(
                values=[(799, 50000, 1000)],
            )
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    response = optimize_order(_request(unit_price=1.0, quantity=10))

    assert response.status == "optimal"
    assert response.totals.shipping_total == 7.99


def test_optimize_uses_exact_shipping_objective_for_final_choice(
    monkeypatch,
) -> None:
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        tiers_by_route={
            ("germany", "netherlands"): _tiers(
                values=[(100, 1000, 10), (1000, 50000, 1000)],
            ),
            ("netherlands", "netherlands"): _tiers(
                values=[(250, 50000, 10)],
            ),
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    request = OptimizationRequest(
        buyer_country="Netherlands",
        items=[WantedItem(item_id="item-1", name="Card", quantity=1)],
        sellers=[
            Seller(seller_id="seller-1", name="Seller 1", country="Germany"),
            Seller(
                seller_id="seller-2",
                name="Seller 2",
                country="Netherlands",
            ),
        ],
        offers=[
            Offer(
                offer_id="offer-1",
                item_id="item-1",
                seller_id="seller-1",
                unit_price=11.0,
                available_quantity=1,
            ),
            Offer(
                offer_id="offer-2",
                item_id="item-1",
                seller_id="seller-2",
                unit_price=12.0,
                available_quantity=1,
            ),
        ],
        preferences=OptimizationPreferences(),
    )

    response = optimize_order(request)

    assert response.status == "optimal"
    assert [seller.seller_id for seller in response.cart.sellers] == ["seller-2"]
    assert response.totals.item_subtotal == 12.0
    assert response.totals.shipping_total == 2.5
    assert response.totals.grand_total == 14.5


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

    pruned = _prune_dominated_offers_per_seller(offers, item_map)

    assert [offer.offer_id for offer in pruned] == ["offer-1"]


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

    pruned = _prune_dominated_offers_per_seller(offers, item_map)

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

    pruned = _prune_dominated_offers_per_seller(offers, item_map)

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

    pruned = _prune_dominated_offers_per_seller(offers, item_map)

    assert [offer.offer_id for offer in pruned] == ["offer-1", "offer-2"]


def test_prune_single_item_sellers_keeps_when_higher_shipping_would_outweigh_item_replacement(
    monkeypatch,
) -> None:
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        tiers_by_route={
            ("germany", "netherlands"): _tiers(values=[(155, 2500, 10)]),
            ("netherlands", "netherlands"): _tiers(values=[(170, 2500, 10)]),
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    sellers = {
        "seller-1": Seller(seller_id="seller-1", name="Seller 1", country="Germany"),
        "seller-2": Seller(
            seller_id="seller-2", name="Seller 2", country="Netherlands"
        ),
    }
    item_map = {"item-1": WantedItem(item_id="item-1", name="Card", quantity=1)}
    offers = [
        Offer(
            offer_id="offer-1",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=0.1,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-2",
            item_id="item-1",
            seller_id="seller-2",
            unit_price=0.0,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-3",
            item_id="item-2",
            seller_id="seller-2",
            unit_price=0.2,
            available_quantity=1,
        ),
    ]

    pruned = _prune_cheapest_single_item_sellers(
        offers=offers,
        item_map=item_map
        | {"item-2": WantedItem(item_id="item-2", name="Other", quantity=1)},
        seller_map=sellers,
        buyer_country="Netherlands",
        route_book=route_book,
    )

    assert [offer.offer_id for offer in pruned] == ["offer-1", "offer-2", "offer-3"]


def test_prune_single_item_sellers_keeps_when_no_single_alternative_covers_quantity(
    monkeypatch,
) -> None:
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        tiers_by_route={},
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    sellers = {
        "seller-1": Seller(seller_id="seller-1", name="Seller 1", country="Germany"),
        "seller-2": Seller(seller_id="seller-2", name="Seller 2", country="Germany"),
        "seller-3": Seller(seller_id="seller-3", name="Seller 3", country="Germany"),
    }
    item_map = {"item-1": WantedItem(item_id="item-1", name="Card", quantity=2)}
    offers = [
        Offer(
            offer_id="offer-1",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=0.5,
            available_quantity=2,
        ),
        Offer(
            offer_id="offer-2",
            item_id="item-1",
            seller_id="seller-2",
            unit_price=0.4,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-3",
            item_id="item-2",
            seller_id="seller-2",
            unit_price=0.2,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-4",
            item_id="item-1",
            seller_id="seller-3",
            unit_price=0.4,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-5",
            item_id="item-3",
            seller_id="seller-3",
            unit_price=0.2,
            available_quantity=1,
        ),
    ]

    pruned = _prune_cheapest_single_item_sellers(
        offers=offers,
        item_map=item_map
        | {
            "item-2": WantedItem(item_id="item-2", name="Other 2", quantity=1),
            "item-3": WantedItem(item_id="item-3", name="Other 3", quantity=1),
        },
        seller_map=sellers,
        buyer_country="Netherlands",
        route_book=route_book,
    )

    assert [offer.offer_id for offer in pruned] == [
        "offer-1",
        "offer-2",
        "offer-3",
        "offer-4",
        "offer-5",
    ]
