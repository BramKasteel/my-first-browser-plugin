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
    MAX_OFFERS_PER_ITEM,
    MISSING_ROUTE_DATA_PENALTY_CENTS,
    _format_selected_offer_rank_analysis,
    _item_offer_price_stats,
    _prune_cheapest_single_item_sellers,
    _prune_dominated_offers_per_seller,
    _prune_expensive_country_offers,
    _prune_low_value_small_basket_sellers,
    _prune_top_offers_per_item_by_price,
    optimize_order,
)


def _tiers(*, values: list[tuple[int, int, int]]) -> ShippingRouteTiers:
    return ShippingRouteTiers(
        tiers=tuple(
            ShippingTier(
                total_price_cents=total_price_cents,
                max_value_cents=max_value_cents,
                max_units=max_units,
            )
            for total_price_cents, max_value_cents, max_units in values
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
                values=[(155, 2500, 4), (200, 2500, 17)],
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


def test_selected_offer_rank_analysis_reports_cheaper_and_pricier_skips(
    monkeypatch,
) -> None:
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        tiers_by_route={
            ("germany", "netherlands"): _tiers(
                values=[(1000, 50000, 1000)],
            ),
            ("netherlands", "netherlands"): _tiers(
                values=[(250, 50000, 1000)],
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
            Seller(seller_id="seller-1", name="German Seller", country="Germany"),
            Seller(
                seller_id="seller-2",
                name="Local Seller",
                country="Netherlands",
            ),
            Seller(
                seller_id="seller-3",
                name="Backup Seller",
                country="Netherlands",
            ),
        ],
        offers=[
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
                seller_id="seller-2",
                unit_price=1.2,
                available_quantity=1,
            ),
            Offer(
                offer_id="offer-3",
                item_id="item-1",
                seller_id="seller-3",
                unit_price=1.4,
                available_quantity=1,
            ),
        ],
        preferences=OptimizationPreferences(),
    )

    response = optimize_order(request)
    analysis_lines = _format_selected_offer_rank_analysis(request, response)

    assert response.allocations[0].offer_id == "offer-2"
    assert analysis_lines == [
        "- Card: bought 1.20 EUR from Local Seller [seller-2], rank 2/3 by unit price; skipped 1 cheaper, 0 same-price, 1 pricier"
    ]


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


def test_prune_top_offers_per_item_by_price_keeps_only_cheapest_150() -> None:
    offers = [
        Offer(
            offer_id=f"offer-{index}",
            item_id="item-1",
            seller_id=f"seller-{index}",
            unit_price=float(index),
            available_quantity=1,
        )
        for index in range(MAX_OFFERS_PER_ITEM + 10)
    ]

    pruned = _prune_top_offers_per_item_by_price(offers)

    assert len(pruned) == MAX_OFFERS_PER_ITEM
    assert [offer.offer_id for offer in pruned] == [
        f"offer-{index}" for index in range(MAX_OFFERS_PER_ITEM)
    ]


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


def test_item_offer_price_stats_computes_min_and_median_per_item() -> None:
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
            seller_id="seller-2",
            unit_price=3.0,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-3",
            item_id="item-1",
            seller_id="seller-3",
            unit_price=5.0,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-4",
            item_id="item-2",
            seller_id="seller-4",
            unit_price=2.5,
            available_quantity=1,
        ),
    ]

    stats = _item_offer_price_stats(offers)

    assert stats["item-1"] == {
        "offer_count": 3,
        "min_unit_price": 1.0,
        "min_unit_price_cents": 100,
        "median_unit_price": 3.0,
    }
    assert stats["item-2"] == {
        "offer_count": 1,
        "min_unit_price": 2.5,
        "min_unit_price_cents": 250,
        "median_unit_price": 2.5,
    }


def test_prune_expensive_country_offers_drops_same_country_prices_above_threshold() -> (
    None
):
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        tiers_by_route={
            ("germany", "netherlands"): _tiers(values=[(100, 50000, 1000)]),
        },
    )
    sellers = {
        "seller-1": Seller(seller_id="seller-1", name="Seller 1", country="Germany"),
        "seller-2": Seller(seller_id="seller-2", name="Seller 2", country="Germany"),
        "seller-3": Seller(
            seller_id="seller-3", name="Seller 3", country="Netherlands"
        ),
    }
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
            seller_id="seller-2",
            unit_price=1.9,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-3",
            item_id="item-1",
            seller_id="seller-2",
            unit_price=2.05,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-4",
            item_id="item-1",
            seller_id="seller-3",
            unit_price=4.0,
            available_quantity=1,
        ),
    ]

    pruned = _prune_expensive_country_offers(
        offers=offers,
        seller_map=sellers,
        buyer_country="Netherlands",
        route_book=route_book,
    )

    assert [offer.offer_id for offer in pruned] == ["offer-1", "offer-2", "offer-4"]


def test_prune_expensive_country_offers_keeps_bucket_when_shipping_selection_has_no_valid_tier() -> (
    None
):
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        tiers_by_route={
            ("germany", "netherlands"): _tiers(values=[(100, 50, 1)]),
        },
    )
    sellers = {
        "seller-1": Seller(seller_id="seller-1", name="Seller 1", country="Germany"),
        "seller-2": Seller(seller_id="seller-2", name="Seller 2", country="Germany"),
    }
    offers = [
        Offer(
            offer_id="offer-1",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=2.0,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-2",
            item_id="item-1",
            seller_id="seller-2",
            unit_price=9.0,
            available_quantity=1,
        ),
    ]

    pruned = _prune_expensive_country_offers(
        offers=offers,
        seller_map=sellers,
        buyer_country="Netherlands",
        route_book=route_book,
    )

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


def test_prune_low_value_small_basket_sellers_drops_replaceable_seller() -> None:
    offers = [
        Offer(
            offer_id="offer-a-1",
            item_id="item-1",
            seller_id="seller-a",
            unit_price=1.10,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-a-2",
            item_id="item-2",
            seller_id="seller-a",
            unit_price=1.20,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-b-1",
            item_id="item-1",
            seller_id="seller-b",
            unit_price=1.00,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-b-2",
            item_id="item-2",
            seller_id="seller-b",
            unit_price=1.10,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-c-1",
            item_id="item-1",
            seller_id="seller-c",
            unit_price=1.15,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-c-2",
            item_id="item-2",
            seller_id="seller-c",
            unit_price=1.25,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-d-1",
            item_id="item-1",
            seller_id="seller-d",
            unit_price=1.18,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-d-2",
            item_id="item-2",
            seller_id="seller-d",
            unit_price=1.28,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-e-1",
            item_id="item-1",
            seller_id="seller-e",
            unit_price=1.16,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-e-2",
            item_id="item-2",
            seller_id="seller-e",
            unit_price=1.24,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-f-1",
            item_id="item-1",
            seller_id="seller-f",
            unit_price=1.19,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-f-2",
            item_id="item-2",
            seller_id="seller-f",
            unit_price=1.27,
            available_quantity=1,
        ),
    ]

    pruned = _prune_low_value_small_basket_sellers(offers)

    remaining_sellers = {offer.seller_id for offer in pruned}
    dropped_sellers = {offer.seller_id for offer in offers} - remaining_sellers

    assert len(remaining_sellers) == 5
    assert dropped_sellers <= {"seller-a", "seller-c", "seller-d", "seller-e", "seller-f"}
    assert "seller-b" in remaining_sellers
    assert sum(1 for offer in pruned if offer.item_id == "item-1") == 5
    assert sum(1 for offer in pruned if offer.item_id == "item-2") == 5


def test_prune_low_value_small_basket_sellers_keeps_cheapest_item_seller() -> None:
    offers = [
        Offer(
            offer_id="offer-a-1",
            item_id="item-1",
            seller_id="seller-a",
            unit_price=1.00,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-a-2",
            item_id="item-2",
            seller_id="seller-a",
            unit_price=1.20,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-b-1",
            item_id="item-1",
            seller_id="seller-b",
            unit_price=1.05,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-b-2",
            item_id="item-2",
            seller_id="seller-b",
            unit_price=1.10,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-c-1",
            item_id="item-1",
            seller_id="seller-c",
            unit_price=1.08,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-c-2",
            item_id="item-2",
            seller_id="seller-c",
            unit_price=1.12,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-d-1",
            item_id="item-1",
            seller_id="seller-d",
            unit_price=1.09,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-d-2",
            item_id="item-2",
            seller_id="seller-d",
            unit_price=1.13,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-e-1",
            item_id="item-1",
            seller_id="seller-e",
            unit_price=1.07,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-e-2",
            item_id="item-2",
            seller_id="seller-e",
            unit_price=1.14,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-f-1",
            item_id="item-1",
            seller_id="seller-f",
            unit_price=1.06,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-f-2",
            item_id="item-2",
            seller_id="seller-f",
            unit_price=1.15,
            available_quantity=1,
        ),
    ]

    pruned = _prune_low_value_small_basket_sellers(offers)

    assert "seller-a" in {offer.seller_id for offer in pruned}


def test_prune_low_value_small_basket_sellers_keeps_item_depth_floor() -> None:
    offers = [
        Offer(
            offer_id="offer-a-1",
            item_id="item-1",
            seller_id="seller-a",
            unit_price=1.10,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-a-2",
            item_id="item-2",
            seller_id="seller-a",
            unit_price=1.20,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-b-1",
            item_id="item-1",
            seller_id="seller-b",
            unit_price=1.00,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-b-2",
            item_id="item-2",
            seller_id="seller-b",
            unit_price=1.10,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-c-1",
            item_id="item-1",
            seller_id="seller-c",
            unit_price=1.15,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-c-2",
            item_id="item-2",
            seller_id="seller-c",
            unit_price=1.25,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-d-1",
            item_id="item-1",
            seller_id="seller-d",
            unit_price=1.18,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-d-2",
            item_id="item-2",
            seller_id="seller-d",
            unit_price=1.28,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-e-1",
            item_id="item-1",
            seller_id="seller-e",
            unit_price=1.16,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-e-2",
            item_id="item-2",
            seller_id="seller-e",
            unit_price=1.24,
            available_quantity=1,
        ),
    ]

    pruned = _prune_low_value_small_basket_sellers(offers)

    assert {offer.seller_id for offer in pruned} == {
        "seller-a",
        "seller-b",
        "seller-c",
        "seller-d",
        "seller-e",
    }


def test_prune_low_value_small_basket_sellers_ignores_large_seller() -> None:
    offers = [
        Offer(
            offer_id="offer-a-1",
            item_id="item-1",
            seller_id="seller-a",
            unit_price=1.10,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-a-2",
            item_id="item-2",
            seller_id="seller-a",
            unit_price=1.20,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-a-3",
            item_id="item-3",
            seller_id="seller-a",
            unit_price=1.30,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-a-4",
            item_id="item-4",
            seller_id="seller-a",
            unit_price=1.40,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-b-1",
            item_id="item-1",
            seller_id="seller-b",
            unit_price=1.00,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-b-2",
            item_id="item-2",
            seller_id="seller-b",
            unit_price=1.10,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-b-3",
            item_id="item-3",
            seller_id="seller-b",
            unit_price=1.20,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-b-4",
            item_id="item-4",
            seller_id="seller-b",
            unit_price=1.30,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-c-1",
            item_id="item-1",
            seller_id="seller-c",
            unit_price=1.05,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-c-2",
            item_id="item-2",
            seller_id="seller-c",
            unit_price=1.15,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-c-3",
            item_id="item-3",
            seller_id="seller-c",
            unit_price=1.25,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-c-4",
            item_id="item-4",
            seller_id="seller-c",
            unit_price=1.35,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-d-1",
            item_id="item-1",
            seller_id="seller-d",
            unit_price=1.06,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-d-2",
            item_id="item-2",
            seller_id="seller-d",
            unit_price=1.16,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-d-3",
            item_id="item-3",
            seller_id="seller-d",
            unit_price=1.26,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-d-4",
            item_id="item-4",
            seller_id="seller-d",
            unit_price=1.36,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-e-1",
            item_id="item-1",
            seller_id="seller-e",
            unit_price=1.07,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-e-2",
            item_id="item-2",
            seller_id="seller-e",
            unit_price=1.17,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-e-3",
            item_id="item-3",
            seller_id="seller-e",
            unit_price=1.27,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-e-4",
            item_id="item-4",
            seller_id="seller-e",
            unit_price=1.37,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-f-1",
            item_id="item-1",
            seller_id="seller-f",
            unit_price=1.08,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-f-2",
            item_id="item-2",
            seller_id="seller-f",
            unit_price=1.18,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-f-3",
            item_id="item-3",
            seller_id="seller-f",
            unit_price=1.28,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-f-4",
            item_id="item-4",
            seller_id="seller-f",
            unit_price=1.38,
            available_quantity=1,
        ),
    ]

    pruned = _prune_low_value_small_basket_sellers(offers)

    assert "seller-a" in {offer.seller_id for offer in pruned}
