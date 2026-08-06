from __future__ import annotations

from unittest.mock import patch

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
    _item_offer_price_stats,
    _prune_dominated_offers_per_seller,
    _prune_expensive_country_offers,
    _prune_top_offers_per_item_by_price,
    optimize_order,
)
from ortools.sat.python import cp_model


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


def test_optimize_uses_missing_route_penalty_when_shipping_route_is_absent(
    monkeypatch,
) -> None:
    route_book = ShippingRouteBook(
        country_ids={"spain": 14, "netherlands": 23},
        tiers_by_route={},
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    request = OptimizationRequest(
        buyer_country="Netherlands",
        items=[WantedItem(item_id="item-1", name="Card", quantity=1)],
        sellers=[Seller(seller_id="seller-1", name="Seller", country="Spain")],
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


def test_optimize_excludes_blocked_seller_from_solution(monkeypatch) -> None:
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        tiers_by_route={
            ("germany", "netherlands"): _tiers(values=[(100, 50000, 1000)]),
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    request = OptimizationRequest(
        buyer_country="Netherlands",
        items=[WantedItem(item_id="item-1", name="Card", quantity=1)],
        sellers=[
            Seller(seller_id="seller-1", name="Blocked Seller", country="Germany"),
            Seller(seller_id="seller-2", name="Allowed Seller", country="Germany"),
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
                unit_price=2.0,
                available_quantity=1,
            ),
        ],
        preferences=OptimizationPreferences(blocked_seller_ids=["seller-1"]),
    )

    response = optimize_order(request)

    assert response.status == "optimal"
    assert [seller.seller_id for seller in response.cart.sellers] == ["seller-2"]
    assert [allocation.offer_id for allocation in response.allocations] == ["offer-2"]


def test_optimize_adds_hints_only_for_unblocked_previous_allocations(
    monkeypatch,
) -> None:
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        tiers_by_route={
            ("germany", "netherlands"): _tiers(values=[(100, 50000, 1000)]),
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    request = OptimizationRequest(
        buyer_country="Netherlands",
        items=[
            WantedItem(item_id="item-1", name="Card 1", quantity=1),
            WantedItem(item_id="item-2", name="Card 2", quantity=1),
        ],
        sellers=[
            Seller(seller_id="seller-1", name="Blocked Seller", country="Germany"),
            Seller(seller_id="seller-2", name="Allowed Seller", country="Germany"),
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
                unit_price=2.0,
                available_quantity=1,
            ),
            Offer(
                offer_id="offer-3",
                item_id="item-2",
                seller_id="seller-2",
                unit_price=1.5,
                available_quantity=1,
            ),
        ],
        previous_allocations=[
            {
                "offer_id": "offer-1",
                "item_id": "item-1",
                "seller_id": "seller-1",
                "quantity": 1,
            },
            {
                "offer_id": "offer-3",
                "item_id": "item-2",
                "seller_id": "seller-2",
                "quantity": 1,
            },
        ],
        preferences=OptimizationPreferences(blocked_seller_ids=["seller-1"]),
    )

    captures: list[tuple[list[int], list[int]]] = []
    original_solve = cp_model.CpSolver.Solve

    def wrapped_solve(self, model, *args, **kwargs):
        proto = model.Proto()
        captures.append(
            (
                list(proto.solution_hint.vars),
                list(proto.solution_hint.values),
            )
        )
        return original_solve(self, model, *args, **kwargs)

    with patch.object(cp_model.CpSolver, "Solve", wrapped_solve):
        response = optimize_order(request)

    assert response.status == "optimal"
    assert len(captures) == 1
    assert captures[0][1] == [1]


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
    selected_item = response.cart.sellers[0].items[0]

    assert response.allocations[0].offer_id == "offer-2"
    assert selected_item.price_rank == 2
    assert selected_item.price_rank_total == 3


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
        item_map={"item-1": WantedItem(item_id="item-1", name="Card 1", quantity=1)},
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
        item_map={"item-1": WantedItem(item_id="item-1", name="Card 1", quantity=1)},
        seller_map=sellers,
        buyer_country="Netherlands",
        route_book=route_book,
    )

    assert [offer.offer_id for offer in pruned] == ["offer-1", "offer-2"]


def test_prune_expensive_country_offers_keeps_enough_quantity_for_requested_item() -> (
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
        "seller-3": Seller(seller_id="seller-3", name="Seller 3", country="Germany"),
        "seller-4": Seller(seller_id="seller-4", name="Seller 4", country="Germany"),
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
            seller_id="seller-3",
            unit_price=2.05,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-4",
            item_id="item-1",
            seller_id="seller-4",
            unit_price=2.3,
            available_quantity=1,
        ),
    ]

    pruned = _prune_expensive_country_offers(
        offers=offers,
        item_map={"item-1": WantedItem(item_id="item-1", name="Card 1", quantity=4)},
        seller_map=sellers,
        buyer_country="Netherlands",
        route_book=route_book,
    )

    assert [offer.offer_id for offer in pruned] == [
        "offer-1",
        "offer-2",
        "offer-3",
        "offer-4",
    ]


def test_optimize_constrains_nl_seller_in_dead_zone_to_tier_0_max(
    monkeypatch,
) -> None:
    """Test that a required NL→NL seller is not over-pruned into infeasibility.

    Tier-0: 4 cards @ €1.70 = €0.425/card
    Tier-1: 8 cards @ €3.10 = €0.3875/card
    Dead zone: 5–7 cards (cost/card > €0.425)

    Seller offers 7 items, cost €15 (< €25 limit), but seller is the only source for
    all requested units. Exact-demand solve must keep tier-1 available and buy all 7.
    """
    route_book = ShippingRouteBook(
        country_ids={"netherlands": 23},
        tiers_by_route={
            ("netherlands", "netherlands"): _tiers(
                values=[(170, 2500, 4), (310, 50000, 8)]
            )
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    request = OptimizationRequest(
        buyer_country="Netherlands",
        items=[WantedItem(item_id="item-1", name="Card", quantity=7)],
        sellers=[Seller(seller_id="seller-1", name="NL Seller", country="Netherlands")],
        offers=[
            Offer(
                offer_id=f"offer-{i}",
                item_id="item-1",
                seller_id="seller-1",
                unit_price=2.0,
                available_quantity=1,
            )
            for i in range(1, 8)
        ],
        preferences=OptimizationPreferences(),
    )

    response = optimize_order(request)

    assert response.status == "optimal"
    assert response.cart.total_units == 7
    assert response.totals.shipping_total == 3.10


def test_optimize_prunes_nl_seller_dead_zone_when_alternative_supply_exists(
    monkeypatch,
) -> None:
    """A dead-zone seller should be capped at tier-0 when other sellers can cover the rest.

    Seller 1 is cheaper but offers 7 units on an NL→NL route with a 5–7 dead zone.
    Seller 2 can supply the remaining 3 units, so the optimizer should prune seller 1
    down to tier-0 max instead of paying seller 1's tier-1 shipping.
    """
    route_book = ShippingRouteBook(
        country_ids={"netherlands": 23},
        tiers_by_route={
            ("netherlands", "netherlands"): _tiers(
                values=[(170, 2500, 4), (310, 50000, 8)]
            )
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    request = OptimizationRequest(
        buyer_country="Netherlands",
        items=[WantedItem(item_id="item-1", name="Card", quantity=7)],
        sellers=[
            Seller(
                seller_id="seller-1", name="Dead Zone Seller", country="Netherlands"
            ),
            Seller(seller_id="seller-2", name="Backup Seller", country="Netherlands"),
        ],
        offers=[
            Offer(
                offer_id=f"offer-1-{i}",
                item_id="item-1",
                seller_id="seller-1",
                unit_price=2.0,
                available_quantity=1,
            )
            for i in range(1, 8)
        ]
        + [
            Offer(
                offer_id=f"offer-2-{i}",
                item_id="item-1",
                seller_id="seller-2",
                unit_price=2.05,
                available_quantity=1,
            )
            for i in range(1, 4)
        ],
        preferences=OptimizationPreferences(),
    )

    response = optimize_order(request)

    assert response.status == "optimal"
    assert response.cart.total_units == 7
    assert response.cart.total_sellers == 2
    assert response.totals.shipping_total == 3.40

    seller_unit_totals = {
        seller.seller_id: sum(item.quantity for item in seller.items)
        for seller in response.cart.sellers
    }
    assert seller_unit_totals == {"seller-1": 4, "seller-2": 3}


def test_optimize_constrains_de_to_nl_seller_in_dead_zone(monkeypatch) -> None:
    """Test DE→NL required seller is not over-pruned into infeasibility.

    Tier-0: 10 cards @ €2.50 = €0.25/card
    Tier-1: 20 cards @ €3.50 = €0.175/card
    Dead zone: 11–13 cards (cost/card > €0.25 at qty 11–13)

    Seller offers 12 items, cost €20, but seller is the only source for all 12.
    Exact-demand solve must keep tier-1 available and buy all 12.
    """
    route_book = ShippingRouteBook(
        country_ids={"netherlands": 23, "germany": 7},
        tiers_by_route={
            ("germany", "netherlands"): _tiers(
                values=[(250, 5000, 10), (350, 50000, 20)]
            )
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    request = OptimizationRequest(
        buyer_country="Netherlands",
        items=[WantedItem(item_id="item-1", name="Card", quantity=12)],
        sellers=[Seller(seller_id="seller-1", name="DE Seller", country="Germany")],
        offers=[
            Offer(
                offer_id=f"offer-{i}",
                item_id="item-1",
                seller_id="seller-1",
                unit_price=1.66,  # Cost per card: 12 items * 1.66 = ~€20
                available_quantity=1,
            )
            for i in range(1, 13)
        ],
        preferences=OptimizationPreferences(),
    )

    response = optimize_order(request)

    assert response.status == "optimal"
    assert response.cart.total_units == 12
    assert response.totals.shipping_total == 3.50


def test_optimize_prunes_de_to_nl_dead_zone_when_alternative_supply_exists(
    monkeypatch,
) -> None:
    """A DE→NL dead-zone seller should be capped when another seller covers remaining demand."""
    route_book = ShippingRouteBook(
        country_ids={"netherlands": 23, "germany": 7},
        tiers_by_route={
            ("germany", "netherlands"): _tiers(
                values=[(250, 5000, 10), (350, 50000, 20)]
            )
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    request = OptimizationRequest(
        buyer_country="Netherlands",
        items=[WantedItem(item_id="item-1", name="Card", quantity=12)],
        sellers=[
            Seller(seller_id="seller-1", name="Dead Zone Seller", country="Germany"),
            Seller(seller_id="seller-2", name="Backup Seller", country="Germany"),
        ],
        offers=[
            Offer(
                offer_id=f"offer-1-{i}",
                item_id="item-1",
                seller_id="seller-1",
                unit_price=1.66,
                available_quantity=1,
            )
            for i in range(1, 13)
        ]
        + [
            Offer(
                offer_id=f"offer-2-{i}",
                item_id="item-1",
                seller_id="seller-2",
                unit_price=1.70,
                available_quantity=1,
            )
            for i in range(1, 3)
        ],
        preferences=OptimizationPreferences(),
    )

    response = optimize_order(request)

    assert response.status == "optimal"
    assert response.cart.total_units == 12
    assert response.cart.total_sellers == 2
    assert response.totals.shipping_total == 5.0

    seller_unit_totals = {
        seller.seller_id: sum(item.quantity for item in seller.items)
        for seller in response.cart.sellers
    }
    assert seller_unit_totals == {"seller-1": 10, "seller-2": 2}


def test_optimize_mixes_constrained_and_unconstrained_sellers(monkeypatch) -> None:
    """Test that only sellers in dead zones are constrained, others use all tiers.

    Two sellers on NL→NL:
    - Seller 1 (in dead zone): offers 6 items → constrained to 4
    - Seller 2 (not in dead zone): offers 2 items → no constraint, all tiers available

    Buyer needs 8 cards total. Should buy 4 from seller-1, 4 from seller-2.
    """
    route_book = ShippingRouteBook(
        country_ids={"netherlands": 23},
        tiers_by_route={
            ("netherlands", "netherlands"): _tiers(
                values=[(170, 2500, 4), (310, 50000, 8)]
            )
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    request = OptimizationRequest(
        buyer_country="Netherlands",
        items=[WantedItem(item_id="item-1", name="Card", quantity=8)],
        sellers=[
            Seller(
                seller_id="seller-1", name="Dead Zone Seller", country="Netherlands"
            ),
            Seller(seller_id="seller-2", name="Normal Seller", country="Netherlands"),
        ],
        offers=[
            # Seller 1: offers 6 items (in dead zone), cheaper
            Offer(
                offer_id=f"offer-1-{i}",
                item_id="item-1",
                seller_id="seller-1",
                unit_price=1.5,
                available_quantity=1,
            )
            for i in range(1, 7)
        ]
        + [
            # Seller 2: offers 4 items (not in dead zone), slightly more expensive
            Offer(
                offer_id=f"offer-2-{i}",
                item_id="item-1",
                seller_id="seller-2",
                unit_price=1.6,
                available_quantity=1,
            )
            for i in range(1, 5)
        ],
        preferences=OptimizationPreferences(),
    )

    response = optimize_order(request)

    assert response.status == "optimal"
    assert response.cart.total_units == 8
    # Seller 1 should contribute at most 4 cards (dead zone constraint)
    seller_1_units = sum(
        item.quantity
        for seller in response.cart.sellers
        if seller.seller_id == "seller-1"
        for item in seller.items
    )
    assert seller_1_units <= 4
    # Seller 2 should contribute the rest
    seller_2_units = sum(
        item.quantity
        for seller in response.cart.sellers
        if seller.seller_id == "seller-2"
        for item in seller.items
    )
    assert seller_1_units + seller_2_units == 8


def test_optimize_dead_zone_uses_cheapest_tier_when_route_tiers_unsorted(
    monkeypatch,
) -> None:
    """Unsorted route tiers should not accidentally trigger infeasible dead-zone pruning.

    With a single required seller and demand above tier-0 capacity, exact-demand solve must
    keep the cheaper valid higher tier available even when the source ordering is unsorted.
    """
    route_book = ShippingRouteBook(
        country_ids={"netherlands": 23},
        tiers_by_route={
            ("netherlands", "netherlands"): _tiers(
                values=[
                    (900, 50000, 40),
                    (310, 50000, 8),
                    (170, 2500, 4),
                ]
            )
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    request = OptimizationRequest(
        buyer_country="Netherlands",
        items=[WantedItem(item_id="item-1", name="Card", quantity=6)],
        sellers=[Seller(seller_id="seller-1", name="NL Seller", country="Netherlands")],
        offers=[
            Offer(
                offer_id=f"offer-{i}",
                item_id="item-1",
                seller_id="seller-1",
                unit_price=2.0,
                available_quantity=1,
            )
            for i in range(1, 7)
        ],
        preferences=OptimizationPreferences(),
    )

    response = optimize_order(request)

    assert response.status == "optimal"
    assert response.cart.total_units == 6
    assert response.totals.shipping_total == 3.10


def test_optimize_dead_zone_pruning_keeps_feasibility_when_seller_is_required(
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

    # One seller only, demand 5 cards. Tier-0 max is 4.
    # Dead-zone pruning must not force tier-0, otherwise model becomes infeasible.
    response = optimize_order(_request(unit_price=1.0, quantity=5))

    assert response.status == "optimal"
    assert response.totals.shipping_total == 2.0


def test_optimize_no_constraint_when_seller_cost_exceeds_tier_0_value_limit(
    monkeypatch,
) -> None:
    """Test that no dead zone constraint is applied when seller cost exceeds tier-0 value limit.

    Even though qty is in dead zone, if items cost more than tier-0 max value,
    tier-0 can't be used anyway, so no constraint applies.
    """
    route_book = ShippingRouteBook(
        country_ids={"netherlands": 23},
        tiers_by_route={
            ("netherlands", "netherlands"): _tiers(
                values=[(170, 2500, 4), (310, 50000, 8)]
            )
        },
    )
    monkeypatch.setattr(
        "app.solver.shipping.load_shipping_route_book", lambda: route_book
    )

    request = OptimizationRequest(
        buyer_country="Netherlands",
        items=[WantedItem(item_id="item-1", name="Card", quantity=7)],
        sellers=[Seller(seller_id="seller-1", name="NL Seller", country="Netherlands")],
        offers=[
            Offer(
                offer_id=f"offer-{i}",
                item_id="item-1",
                seller_id="seller-1",
                unit_price=5.0,  # 7 items * €5 = €35 > €25 tier-0 limit
                available_quantity=1,
            )
            for i in range(1, 8)
        ],
        preferences=OptimizationPreferences(),
    )

    response = optimize_order(request)

    assert response.status == "optimal"
    # No constraint applies, optimizer can use all tiers, but here picks tier-1 as tier-0 doesn't fit value
    # Optimizer should buy all 7 if profitable with tier-1 shipping
    assert response.cart.total_units == 7
    assert response.totals.shipping_total == 3.10
