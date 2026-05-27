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
    IMPROVEMENT_MAX_TIME_SECONDS,
    MISSING_ROUTE_DATA_PENALTY_CENTS,
    WARM_START_MAX_TIME_SECONDS,
    _build_route_min_shipping_warm_start,
    _prune_dominated_offers_per_seller,
    _prune_dominated_single_item_sellers,
    optimize_order,
)
from ortools.sat.python import cp_model


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


def test_warm_start_keeps_feasible_solution(monkeypatch) -> None:
    request = _request(unit_price=1.0, quantity=1)
    seller_map = {seller.seller_id: seller for seller in request.sellers}
    item_map = {item.item_id: item for item in request.items}

    original_solve = cp_model.CpSolver.Solve

    def wrapped_solve(self, model):
        original_solve(self, model)
        return cp_model.FEASIBLE

    monkeypatch.setattr(cp_model.CpSolver, "Solve", wrapped_solve)

    offer_values, seller_values, warm_start_status = (
        _build_route_min_shipping_warm_start(
            cp_model=cp_model,
            request=request,
            usable_offers=request.offers,
            item_map=item_map,
            seller_map=seller_map,
            route_book=None,
        )
    )

    assert offer_values == {"offer-1": 1}
    assert seller_values == {"seller-1": 1}
    assert warm_start_status == "feasible"


def test_optimize_uses_configured_improvement_budget(monkeypatch) -> None:
    monkeypatch.setattr("app.solver.shipping.load_shipping_route_book", lambda: None)

    original_solve = cp_model.CpSolver.Solve
    seen_time_limits: list[float] = []

    def wrapped_solve(self, model):
        seen_time_limits.append(self.parameters.max_time_in_seconds)
        return original_solve(self, model)

    monkeypatch.setattr(cp_model.CpSolver, "Solve", wrapped_solve)

    response = optimize_order(_request(unit_price=1.0, quantity=1))

    assert response.status == "optimal"
    assert len(seen_time_limits) >= 2
    assert seen_time_limits[0] == WARM_START_MAX_TIME_SECONDS
    assert seen_time_limits[1] == IMPROVEMENT_MAX_TIME_SECONDS


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


def test_optimize_uses_exact_shipping_objective_for_final_choice(
    monkeypatch,
) -> None:
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        methods_by_route={},
        tiers_by_route={
            ("germany", "netherlands"): _tiers(
                letter=[(100, 1000, 20)],
                parcel=[(1000, 50000, 5000)],
            ),
            ("netherlands", "netherlands"): _tiers(
                letter=[(250, 50000, 20)],
                parcel=[],
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

    pruned = _prune_dominated_offers_per_seller(offers, item_map)

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


def test_prune_single_item_sellers_drops_when_alternative_standalone_total_is_no_worse(
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.solver.shipping.load_shipping_route_book", lambda: None)

    sellers = {
        "seller-1": Seller(seller_id="seller-1", name="Seller 1", country="Germany"),
        "seller-2": Seller(seller_id="seller-2", name="Seller 2", country="Germany"),
    }
    item_map = {"item-1": WantedItem(item_id="item-1", name="Card", quantity=1)}
    offers = [
        Offer(
            offer_id="offer-1",
            item_id="item-1",
            seller_id="seller-1",
            unit_price=0.5,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-2",
            item_id="item-1",
            seller_id="seller-2",
            unit_price=0.5,
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

    pruned = _prune_dominated_single_item_sellers(
        offers=offers,
        item_map=item_map
        | {"item-2": WantedItem(item_id="item-2", name="Other", quantity=1)},
        seller_map=sellers,
        buyer_country="Netherlands",
        route_book=None,
        use_explicit_weights=False,
    )

    assert [offer.offer_id for offer in pruned] == ["offer-2", "offer-3"]


def test_prune_single_item_sellers_keeps_when_higher_shipping_would_outweigh_item_replacement(
    monkeypatch,
) -> None:
    route_book = ShippingRouteBook(
        country_ids={"germany": 7, "netherlands": 23},
        methods_by_route={},
        tiers_by_route={
            ("germany", "netherlands"): _tiers(letter=[(155, 2500, 20)], parcel=[]),
            ("netherlands", "netherlands"): _tiers(letter=[(170, 2500, 20)], parcel=[]),
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

    pruned = _prune_dominated_single_item_sellers(
        offers=offers,
        item_map=item_map
        | {"item-2": WantedItem(item_id="item-2", name="Other", quantity=1)},
        seller_map=sellers,
        buyer_country="Netherlands",
        route_book=route_book,
        use_explicit_weights=False,
    )

    assert [offer.offer_id for offer in pruned] == ["offer-1", "offer-2", "offer-3"]


def test_prune_single_item_sellers_keeps_when_no_single_alternative_covers_quantity(
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.solver.shipping.load_shipping_route_book", lambda: None)

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

    pruned = _prune_dominated_single_item_sellers(
        offers=offers,
        item_map=item_map
        | {
            "item-2": WantedItem(item_id="item-2", name="Other 2", quantity=1),
            "item-3": WantedItem(item_id="item-3", name="Other 3", quantity=1),
        },
        seller_map=sellers,
        buyer_country="Netherlands",
        route_book=None,
        use_explicit_weights=False,
    )

    assert [offer.offer_id for offer in pruned] == [
        "offer-1",
        "offer-2",
        "offer-3",
        "offer-4",
        "offer-5",
    ]


def test_prune_single_item_sellers_drops_two_item_seller_when_same_country_alternative_dominates(
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.solver.shipping.load_shipping_route_book", lambda: None)

    sellers = {
        "seller-1": Seller(seller_id="seller-1", name="Seller 1", country="Germany"),
        "seller-2": Seller(seller_id="seller-2", name="Seller 2", country="Germany"),
    }
    item_map = {
        "item-1": WantedItem(item_id="item-1", name="Card 1", quantity=2),
        "item-2": WantedItem(item_id="item-2", name="Card 2", quantity=1),
        "item-3": WantedItem(item_id="item-3", name="Extra", quantity=1),
    }
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
            item_id="item-2",
            seller_id="seller-1",
            unit_price=0.4,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-3",
            item_id="item-1",
            seller_id="seller-2",
            unit_price=0.4,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-4",
            item_id="item-1",
            seller_id="seller-2",
            unit_price=0.5,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-5",
            item_id="item-2",
            seller_id="seller-2",
            unit_price=0.4,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-6",
            item_id="item-3",
            seller_id="seller-2",
            unit_price=0.2,
            available_quantity=1,
        ),
    ]

    pruned = _prune_dominated_single_item_sellers(
        offers=offers,
        item_map=item_map,
        seller_map=sellers,
        buyer_country="Netherlands",
        route_book=None,
        use_explicit_weights=False,
    )

    assert [offer.offer_id for offer in pruned] == [
        "offer-3",
        "offer-4",
        "offer-5",
        "offer-6",
    ]


def test_prune_single_item_sellers_keeps_two_item_seller_when_alternative_frontier_turns_worse(
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.solver.shipping.load_shipping_route_book", lambda: None)

    sellers = {
        "seller-1": Seller(seller_id="seller-1", name="Seller 1", country="Germany"),
        "seller-2": Seller(seller_id="seller-2", name="Seller 2", country="Germany"),
    }
    item_map = {
        "item-1": WantedItem(item_id="item-1", name="Card 1", quantity=2),
        "item-2": WantedItem(item_id="item-2", name="Card 2", quantity=1),
    }
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
            item_id="item-2",
            seller_id="seller-1",
            unit_price=0.4,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-3",
            item_id="item-1",
            seller_id="seller-2",
            unit_price=0.4,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-4",
            item_id="item-1",
            seller_id="seller-2",
            unit_price=0.7,
            available_quantity=1,
        ),
        Offer(
            offer_id="offer-5",
            item_id="item-2",
            seller_id="seller-2",
            unit_price=0.4,
            available_quantity=1,
        ),
    ]

    pruned = _prune_dominated_single_item_sellers(
        offers=offers,
        item_map=item_map,
        seller_map=sellers,
        buyer_country="Netherlands",
        route_book=None,
        use_explicit_weights=False,
    )

    assert [offer.offer_id for offer in pruned] == [
        "offer-1",
        "offer-2",
        "offer-3",
        "offer-4",
        "offer-5",
    ]
