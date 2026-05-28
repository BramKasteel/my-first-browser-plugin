from __future__ import annotations

from collections import defaultdict

from ortools.sat.python import cp_model

from . import shipping
from .models import (
    AllocationResult,
    CartItemResult,
    CartSellerResult,
    Offer,
    OptimizationCart,
    OptimizationRequest,
    OptimizationResponse,
    OptimizationTotals,
    SellerResult,
    WantedItem,
)

MISSING_ROUTE_DATA_PENALTY_CENTS = 10_000
WARM_START_MAX_TIME_SECONDS = 6
IMPROVEMENT_MAX_TIME_SECONDS = 9
SOLVER_ABSOLUTE_GAP_LIMIT = 10
SOLVER_NUM_SEARCH_WORKERS = 8
SELLER_DOMINANCE_MAX_DISTINCT_ITEMS = 2


def _to_cents(amount: float) -> int:
    return int(round(amount * 100))


def _from_cents(amount: int) -> float:
    return round(amount / 100, 2)


def _capped_offer_quantity(offer: Offer, item_map: dict[str, WantedItem]) -> int:
    return min(offer.available_quantity, item_map[offer.item_id].quantity)


def _new_quantity_var(cp_model_instance, *, upper_bound: int, name: str):
    if upper_bound == 1:
        return cp_model_instance.NewBoolVar(name)
    return cp_model_instance.NewIntVar(0, upper_bound, name)


def _new_solver(cp_model, *, max_time_seconds: float | None):
    solver = cp_model.CpSolver()
    if max_time_seconds is not None:
        solver.parameters.max_time_in_seconds = max_time_seconds
    solver.parameters.absolute_gap_limit = SOLVER_ABSOLUTE_GAP_LIMIT
    solver.parameters.num_search_workers = SOLVER_NUM_SEARCH_WORKERS
    return solver


def _cp_sat_status_name(cp_model, status: int) -> str:
    if status == cp_model.OPTIMAL:
        return "optimal"
    if status == cp_model.FEASIBLE:
        return "feasible"
    if status == cp_model.INFEASIBLE:
        return "infeasible"
    if status == cp_model.MODEL_INVALID:
        return "model_invalid"
    if status == cp_model.UNKNOWN:
        return "unknown"
    return f"status_{status}"


def _offer_prune_rank(offer: Offer) -> tuple[float, int, str]:
    return (
        offer.unit_price,
        -offer.available_quantity,
        offer.offer_id,
    )


def _selection_shipping_cost_cents(
    *,
    seller_country: str,
    buyer_country: str,
    selections: list[tuple[Offer, int]],
    route_book: shipping.ShippingRouteBook,
) -> int | None:
    route_tiers = route_book.lookup_tiers(
        seller_country=seller_country,
        buyer_country=buyer_country,
    )
    tier_candidates = [(True, tier) for tier in route_tiers.letter_tiers] + [
        (False, tier) for tier in route_tiers.parcel_tiers
    ]
    if tier_candidates:
        total_value_cents = sum(
            _to_cents(offer.unit_price) * quantity for offer, quantity in selections
        )
        total_cards = sum(quantity for _, quantity in selections)

        valid_tier_costs = []
        for is_letter, tier in tier_candidates:
            if total_value_cents > tier.max_value_cents:
                continue
            card_limit = shipping.shipping_tier_card_limit(
                is_letter=is_letter,
                tier=tier,
            )
            if card_limit is not None and total_cards > card_limit:
                continue
            valid_tier_costs.append(tier.total_price_cents)

        return min(valid_tier_costs) if valid_tier_costs else None

    return MISSING_ROUTE_DATA_PENALTY_CENTS


def _build_route_min_shipping_warm_start(
    *,
    cp_model,
    request: OptimizationRequest,
    usable_offers: list[Offer],
    item_map: dict[str, WantedItem],
    seller_map: dict[str, object],
    route_book: shipping.ShippingRouteBook,
) -> tuple[dict[str, int], dict[str, int], str]:
    if not usable_offers:
        return {}, {}, "skipped"

    hint_model = cp_model.CpModel()
    hint_offer_vars = {}
    hint_seller_active_vars = {}
    seller_offers: dict[str, list[Offer]] = defaultdict(list)

    for offer in usable_offers:
        seller_offers[offer.seller_id].append(offer)
        capped_quantity = _capped_offer_quantity(offer, item_map)
        hint_offer_vars[offer.offer_id] = _new_quantity_var(
            hint_model,
            upper_bound=capped_quantity,
            name=f"warm_qty_{offer.offer_id}",
        )

    for seller_id in seller_offers:
        hint_seller_active_vars[seller_id] = hint_model.NewBoolVar(
            f"warm_seller_active_{seller_id}"
        )

    for item in request.items:
        hint_model.Add(
            sum(
                hint_offer_vars[offer.offer_id]
                for offer in usable_offers
                if offer.item_id == item.item_id
            )
            == item.quantity
        )

    for seller_id, offers in seller_offers.items():
        active = hint_seller_active_vars[seller_id]
        total_units = sum(hint_offer_vars[offer.offer_id] for offer in offers)
        max_units = sum(_capped_offer_quantity(offer, item_map) for offer in offers)
        hint_model.Add(total_units <= max_units * active)
        hint_model.Add(total_units >= active)

    if request.preferences.max_sellers is not None:
        hint_model.Add(
            sum(hint_seller_active_vars.values()) <= request.preferences.max_sellers
        )

    hint_model.Minimize(
        sum(
            _to_cents(offer.unit_price) * hint_offer_vars[offer.offer_id]
            for offer in usable_offers
        )
        + sum(
            shipping.minimum_shipping_cost_cents(
                seller_country=seller_map[seller_id].country,
                buyer_country=request.buyer_country,
                route_book=route_book,
                missing_route_cost_cents=MISSING_ROUTE_DATA_PENALTY_CENTS,
            )
            * hint_seller_active_vars[seller_id]
            for seller_id in seller_offers
        )
    )

    hint_solver = _new_solver(cp_model, max_time_seconds=WARM_START_MAX_TIME_SECONDS)
    status = hint_solver.Solve(hint_model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {}, {}, _cp_sat_status_name(cp_model, status)

    return (
        {
            offer_id: hint_solver.Value(var)
            for offer_id, var in hint_offer_vars.items()
            if hint_solver.Value(var) > 0
        },
        {
            seller_id: hint_solver.Value(var)
            for seller_id, var in hint_seller_active_vars.items()
        },
        _cp_sat_status_name(cp_model, status),
    )


def _assignment_total_cost_cents(
    *,
    offer_quantities: dict[str, int],
    offer_by_id: dict[str, Offer],
    seller_map: dict[str, object],
    buyer_country: str,
    route_book: shipping.ShippingRouteBook,
) -> int | None:
    seller_shipping_costs = _selected_seller_shipping_costs_cents(
        offer_quantities=offer_quantities,
        offer_by_id=offer_by_id,
        seller_map=seller_map,
        buyer_country=buyer_country,
        route_book=route_book,
    )
    if seller_shipping_costs is None:
        return None

    total_item_cost_cents = 0
    for offer_id, quantity in offer_quantities.items():
        if quantity <= 0:
            continue
        offer = offer_by_id[offer_id]
        total_item_cost_cents += _to_cents(offer.unit_price) * quantity

    return total_item_cost_cents + sum(seller_shipping_costs.values())


def _selected_seller_shipping_costs_cents(
    *,
    offer_quantities: dict[str, int],
    offer_by_id: dict[str, Offer],
    seller_map: dict[str, object],
    buyer_country: str,
    route_book: shipping.ShippingRouteBook,
) -> dict[str, int] | None:
    selections_by_seller: dict[str, list[tuple[Offer, int]]] = defaultdict(list)
    for offer_id, quantity in offer_quantities.items():
        if quantity <= 0:
            continue
        offer = offer_by_id[offer_id]
        selections_by_seller[offer.seller_id].append((offer, quantity))

    seller_shipping_costs: dict[str, int] = {}
    for seller_id, selections in selections_by_seller.items():
        shipping_cost_cents = _selection_shipping_cost_cents(
            seller_country=seller_map[seller_id].country,
            buyer_country=buyer_country,
            selections=selections,
            route_book=route_book,
        )
        if shipping_cost_cents is None:
            return None
        seller_shipping_costs[seller_id] = shipping_cost_cents

    return seller_shipping_costs


def _solve_exact_shipping_order(
    *,
    cp_model,
    request: OptimizationRequest,
    usable_offers: list[Offer],
    item_map: dict[str, WantedItem],
    seller_map: dict[str, object],
    route_book: shipping.ShippingRouteBook,
) -> tuple[str, dict[str, int]] | None:
    model = cp_model.CpModel()

    offer_vars = {}
    seller_active_vars = {}
    seller_active_exprs = {}
    seller_tier_candidates = {}
    seller_value_upper_bounds = {}
    seller_card_upper_bounds = {}

    seller_offers = defaultdict(list)
    for offer in usable_offers:
        seller_offers[offer.seller_id].append(offer)
        offer_vars[offer.offer_id] = _new_quantity_var(
            model,
            upper_bound=offer.available_quantity,
            name=f"qty_{offer.offer_id}",
        )

    for seller_id, offers in seller_offers.items():
        seller_value_upper_bounds[seller_id] = sum(
            _to_cents(offer.unit_price) * _capped_offer_quantity(offer, item_map)
            for offer in offers
        )
        seller_card_upper_bounds[seller_id] = sum(
            _capped_offer_quantity(offer, item_map) for offer in offers
        )

    for seller_id in seller_offers:
        route_tiers = route_book.lookup_tiers(
            seller_country=seller_map[seller_id].country,
            buyer_country=request.buyer_country,
            seller_value_upper_bound=seller_value_upper_bounds[seller_id],
            seller_card_upper_bound=seller_card_upper_bounds[seller_id],
        )

        tier_candidates = [(True, tier) for tier in route_tiers.letter_tiers] + [
            (False, tier) for tier in route_tiers.parcel_tiers
        ]
        seller_tier_candidates[seller_id] = tier_candidates

        if len(tier_candidates) <= 1:
            seller_active_vars[seller_id] = model.NewBoolVar(
                f"seller_active_{seller_id}"
            )
            seller_active_exprs[seller_id] = seller_active_vars[seller_id]

    for item in request.items:
        model.Add(
            sum(
                offer_vars[offer.offer_id]
                for offer in usable_offers
                if offer.item_id == item.item_id
            )
            == item.quantity
        )

    objective_terms = [
        _to_cents(offer.unit_price) * offer_vars[offer.offer_id]
        for offer in usable_offers
    ]

    seller_shipping_tier_choice_vars = {}

    for seller_id, offers in seller_offers.items():
        active = seller_active_exprs.get(seller_id)
        tier_candidates = seller_tier_candidates[seller_id]

        if tier_candidates:
            total_value_expr = sum(
                _to_cents(offer.unit_price) * offer_vars[offer.offer_id]
                for offer in offers
            )
            total_card_expr = sum(offer_vars[offer.offer_id] for offer in offers)

            if len(tier_candidates) == 1:
                is_letter, tier = tier_candidates[0]
                model.Add(
                    total_value_expr
                    <= tier.max_value_cents
                    + seller_value_upper_bounds[seller_id] * (1 - active)
                )
                card_limit = shipping.shipping_tier_card_limit(
                    is_letter=is_letter,
                    tier=tier,
                )
                if card_limit is not None:
                    model.Add(
                        total_card_expr
                        <= card_limit
                        + seller_card_upper_bounds[seller_id] * (1 - active)
                    )

                objective_terms.append(tier.total_price_cents * active)
                continue

            seller_shipping_tier_choice_vars[seller_id] = []

            for tier_index, (is_letter, tier) in enumerate(tier_candidates):
                tier_var = model.NewBoolVar(f"ship_{seller_id}_{tier_index}")
                seller_shipping_tier_choice_vars[seller_id].append((tier, tier_var))
                model.Add(
                    total_value_expr
                    <= tier.max_value_cents
                    + seller_value_upper_bounds[seller_id] * (1 - tier_var)
                )
                card_limit = shipping.shipping_tier_card_limit(
                    is_letter=is_letter,
                    tier=tier,
                )
                if card_limit is not None:
                    model.Add(
                        total_card_expr
                        <= card_limit
                        + seller_card_upper_bounds[seller_id] * (1 - tier_var)
                    )

            active = sum(
                tier_var for _, tier_var in seller_shipping_tier_choice_vars[seller_id]
            )
            seller_active_exprs[seller_id] = active
            objective_terms.append(
                sum(
                    tier.total_price_cents * tier_var
                    for tier, tier_var in seller_shipping_tier_choice_vars[seller_id]
                )
            )
            continue

        objective_terms.append(
            MISSING_ROUTE_DATA_PENALTY_CENTS * active
        )  # If no tier candidates

    for seller_id, offers in seller_offers.items():
        active = seller_active_exprs[seller_id]
        total_units = sum(offer_vars[offer.offer_id] for offer in offers)
        max_units = sum(_capped_offer_quantity(offer, item_map) for offer in offers)
        model.Add(total_units <= max_units * active)
        model.Add(total_units >= active)

    if request.preferences.max_sellers is not None:
        model.Add(sum(seller_active_exprs.values()) <= request.preferences.max_sellers)

    warm_start_offer_values, _, warm_start_status = (
        _build_route_min_shipping_warm_start(
            cp_model=cp_model,
            request=request,
            usable_offers=usable_offers,
            item_map=item_map,
            seller_map=seller_map,
            route_book=route_book,
        )
    )
    warm_start_seller_values = {
        seller_id: int(
            any(
                offer.seller_id == seller_id
                and warm_start_offer_values.get(offer.offer_id, 0) > 0
                for offer in usable_offers
            )
        )
        for seller_id in seller_active_vars
    }
    for offer_id, value in warm_start_offer_values.items():
        model.AddHint(offer_vars[offer_id], value)
    for seller_id, value in warm_start_seller_values.items():
        model.AddHint(seller_active_vars[seller_id], value)
    for seller_id, tier_choices in seller_shipping_tier_choice_vars.items():
        warm_selected_offer_quantities = {
            offer.offer_id: warm_start_offer_values.get(offer.offer_id, 0)
            for offer in seller_offers[seller_id]
            if warm_start_offer_values.get(offer.offer_id, 0) > 0
        }
        if not warm_selected_offer_quantities:
            for _, tier_var in tier_choices:
                model.AddHint(tier_var, 0)
            continue

        warm_total_cost_cents = _assignment_total_cost_cents(
            offer_quantities=warm_selected_offer_quantities,
            offer_by_id={offer.offer_id: offer for offer in seller_offers[seller_id]},
            seller_map=seller_map,
            buyer_country=request.buyer_country,
            route_book=route_book,
        )
        warm_item_cost_cents = sum(
            _to_cents(offer.unit_price) * quantity
            for offer in seller_offers[seller_id]
            if (quantity := warm_selected_offer_quantities.get(offer.offer_id, 0)) > 0
        )
        warm_shipping_cost_cents = None
        if warm_total_cost_cents is not None:
            warm_shipping_cost_cents = warm_total_cost_cents - warm_item_cost_cents

        matched_tier = False
        for tier, tier_var in tier_choices:
            tier_selected = int(warm_shipping_cost_cents == tier.total_price_cents)
            model.AddHint(tier_var, tier_selected)
            matched_tier = matched_tier or bool(tier_selected)

        if not matched_tier:
            for _, tier_var in tier_choices:
                model.AddHint(tier_var, 0)

    model.Minimize(sum(objective_terms))

    solver = _new_solver(cp_model, max_time_seconds=IMPROVEMENT_MAX_TIME_SECONDS)
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None

    solution_status = "optimal" if status == cp_model.OPTIMAL else "feasible"
    selected_offer_quantities = {
        offer.offer_id: solver.Value(offer_vars[offer.offer_id])
        for offer in usable_offers
        if solver.Value(offer_vars[offer.offer_id]) > 0
    }
    return solution_status, selected_offer_quantities, warm_start_status


def _prune_dominated_offers_per_seller(
    offers: list[Offer], item_map: dict[str, WantedItem]
) -> list[Offer]:
    offers_by_bucket: dict[tuple[str, str], list[Offer]] = defaultdict(list)
    for offer in offers:
        offers_by_bucket[(offer.seller_id, offer.item_id)].append(offer)

    chosen_offer_ids: set[str] = set()
    for (seller_id, item_id), bucket_offers in offers_by_bucket.items():
        keep_count = item_map[item_id].quantity
        sorted_offers = sorted(bucket_offers, key=_offer_prune_rank)
        total = 0
        for offer in sorted_offers:
            chosen_offer_ids.add(offer.offer_id)
            total += offer.available_quantity
            if total >= keep_count:
                offer.available_quantity = offer.available_quantity - total + keep_count
                break

    return [offer for offer in offers if offer.offer_id in chosen_offer_ids]


def _prune_cheapest_single_item_sellers(
    *,
    offers: list[Offer],
    item_map: dict[str, WantedItem],
    seller_map: dict[str, object],
    buyer_country: str,
    route_book: shipping.ShippingRouteBook,
) -> list[Offer]:
    # Map seller_id to their offers
    seller_offers: dict[str, list[Offer]] = defaultdict(list)
    for offer in offers:
        seller_offers[offer.seller_id].append(offer)

    # Find all single-item sellers: sellers who only offer one item_id
    single_item_sellers: dict[str, str] = {}  # seller_id -> item_id
    for seller_id, offer_list in seller_offers.items():
        item_ids = {offer.item_id for offer in offer_list}
        if len(item_ids) == 1:
            single_item_sellers[seller_id] = next(iter(item_ids))

    # For each item_id, collect single-item sellers
    item_to_single_sellers: dict[str, list[str]] = defaultdict(list)
    for seller_id, item_id in single_item_sellers.items():
        item_to_single_sellers[item_id].append(seller_id)

    # Sellers to drop
    drop_seller_ids: set[str] = set()

    for item_id, sellers in item_to_single_sellers.items():
        if item_map[item_id].quantity != 1:
            continue

        # For each seller, compute total cost (item + shipping) for quantity 1
        seller_costs = []
        for seller_id in sellers:
            offer_list = seller_offers[seller_id]

            best_offer = None
            for offer in offer_list:
                if offer.item_id == item_id and offer.available_quantity >= 1:
                    if best_offer is None or offer.unit_price < best_offer.unit_price:
                        best_offer = offer
            assert best_offer is not None

            seller = seller_map[seller_id]
            shipping_cost = _selection_shipping_cost_cents(
                seller_country=seller.country,
                buyer_country=buyer_country,
                selections=[(best_offer, 1)],
                route_book=route_book,
            )
            if shipping_cost is None:
                continue
            total_cost = _to_cents(best_offer.unit_price) + shipping_cost
            seller_costs.append((total_cost, seller_id))
        if not seller_costs:
            continue

        min_cost = min(sc[0] for sc in seller_costs)

        min_cost_sellers = [
            seller_id for cost, seller_id in seller_costs if cost == min_cost
        ]

        chosen_seller = min_cost_sellers[0]

        for _, seller_id in seller_costs:
            if seller_id != chosen_seller:
                drop_seller_ids.add(seller_id)

    # Return offers, dropping those from dropped sellers
    return [offer for offer in offers if offer.seller_id not in drop_seller_ids]


def prune_all(request: OptimizationRequest):
    seller_map = request.seller_map()
    item_map = request.item_map()

    usable_offers = _prune_dominated_offers_per_seller(request.offers, item_map)

    route_book = shipping.load_shipping_route_book()
    usable_offers = _prune_cheapest_single_item_sellers(
        offers=usable_offers,
        item_map=item_map,
        seller_map=seller_map,
        buyer_country=request.buyer_country,
        route_book=route_book,
    )
    return usable_offers


def optimize_order(request: OptimizationRequest) -> OptimizationResponse:
    usable_offers = prune_all(request)
    item_map = request.item_map()
    seller_map = request.seller_map()

    coverage = defaultdict(int)
    for offer in usable_offers:
        coverage[offer.item_id] += offer.available_quantity

    uncovered_items = sorted(
        item.name for item in request.items if coverage[item.item_id] < item.quantity
    )
    if uncovered_items:
        notes = [
            "No feasible solution under current seller filters.",
            f"Uncovered items: {', '.join(uncovered_items)}",
        ]
        return OptimizationResponse(
            status="infeasible",
            currency=request.currency,
            totals=OptimizationTotals(item_subtotal=0, shipping_total=0, grand_total=0),
            cart=OptimizationCart(),
            notes=notes,
        )

    route_book = shipping.load_shipping_route_book()

    solution = _solve_exact_shipping_order(
        cp_model=cp_model,
        request=request,
        usable_offers=usable_offers,
        item_map=item_map,
        seller_map=seller_map,
        route_book=route_book,
    )
    if solution is None:
        return OptimizationResponse(
            status="infeasible",
            currency=request.currency,
            totals=OptimizationTotals(item_subtotal=0, shipping_total=0, grand_total=0),
            cart=OptimizationCart(),
            notes=["Solver found no feasible solution."],
        )

    solution_status, selected_offer_quantities, warm_start_status = solution

    allocations = []
    cart_items_by_seller = defaultdict(list)
    seller_item_subtotals = defaultdict(int)
    seller_unit_totals = defaultdict(int)
    seller_offers = defaultdict(list)
    for offer in usable_offers:
        seller_offers[offer.seller_id].append(offer)

    seller_shipping_totals = _selected_seller_shipping_costs_cents(
        offer_quantities=selected_offer_quantities,
        offer_by_id={offer.offer_id: offer for offer in usable_offers},
        seller_map=seller_map,
        buyer_country=request.buyer_country,
        route_book=route_book,
    )
    if seller_shipping_totals is None:
        raise RuntimeError(
            "Exact shipping solve returned allocation without priced shipping route."
        )

    for offer in usable_offers:
        quantity = selected_offer_quantities.get(offer.offer_id, 0)
        if quantity <= 0:
            continue
        line_total = _to_cents(offer.unit_price) * quantity
        allocations.append(
            AllocationResult(
                offer_id=offer.offer_id,
                item_id=offer.item_id,
                seller_id=offer.seller_id,
                quantity=quantity,
                unit_price=offer.unit_price,
                line_total=_from_cents(line_total),
            )
        )
        cart_items_by_seller[offer.seller_id].append(
            CartItemResult(
                offer_id=offer.offer_id,
                item_id=offer.item_id,
                item_name=item_map[offer.item_id].name,
                quantity=quantity,
                unit_price=offer.unit_price,
                line_total=_from_cents(line_total),
                condition=offer.condition,
                language=offer.language,
            )
        )
        seller_item_subtotals[offer.seller_id] += line_total
        seller_unit_totals[offer.seller_id] += quantity

    chosen_sellers = []
    cart_sellers = []
    for seller_id in seller_offers:
        is_active = seller_unit_totals[seller_id] > 0

        if not is_active:
            continue

        shipping_total = seller_shipping_totals[seller_id]
        chosen_sellers.append(
            SellerResult(
                seller_id=seller_id,
                item_subtotal=_from_cents(seller_item_subtotals[seller_id]),
                shipping_cost=_from_cents(shipping_total),
                total_units=seller_unit_totals[seller_id],
            )
        )
        seller = seller_map[seller_id]
        cart_sellers.append(
            CartSellerResult(
                seller_id=seller_id,
                seller_name=seller.name,
                country=seller.country,
                item_subtotal=_from_cents(seller_item_subtotals[seller_id]),
                shipping_cost=_from_cents(shipping_total),
                grand_total=_from_cents(
                    seller_item_subtotals[seller_id] + shipping_total
                ),
                total_units=seller_unit_totals[seller_id],
                items=sorted(
                    cart_items_by_seller[seller_id],
                    key=lambda item: (item.item_name.casefold(), item.offer_id),
                ),
            )
        )

    item_subtotal = sum(seller_item_subtotals.values())
    shipping_total = sum(seller_shipping_totals.values())
    grand_total = item_subtotal + shipping_total
    total_units = sum(seller_unit_totals.values())

    notes = []
    notes.append(
        "Solve uses two phases: warm start with cheapest per-seller route floor, then main solve with exact imported shipping tiers."
    )
    if warm_start_status == "optimal":
        notes.append(
            "Warm-start floor solve proved optimal and seeded hints for exact solve."
        )
    elif warm_start_status == "feasible":
        notes.append(
            "Warm-start floor solve found feasible solution before proof of optimality and seeded hints for exact solve."
        )
    else:
        notes.append(
            f"Warm-start floor solve status: {warm_start_status}. Exact solve ran without warm-start hints."
        )
    notes.append(
        "Exact shipping costs use selected item value and card-count letter thresholds (4/17/40 cards)."
    )
    if any(
        not route_book.lookup_tiers(
            seller_country=seller_map[seller.seller_id].country,
            buyer_country=request.buyer_country,
        ).letter_tiers
        and not route_book.lookup_tiers(
            seller_country=seller_map[seller.seller_id].country,
            buyer_country=request.buyer_country,
        ).parcel_tiers
        for seller in chosen_sellers
    ):
        notes.append(
            f"Missing imported route data gets penalty shipping cost of {_from_cents(MISSING_ROUTE_DATA_PENALTY_CENTS):.2f} {request.currency} per seller."
        )

    if solution_status == "feasible":
        notes.append(
            "Solver hit time limit before proving optimality. Returning best known feasible order."
        )

    return OptimizationResponse(
        status=solution_status,
        warm_start_status=warm_start_status,
        currency=request.currency,
        totals=OptimizationTotals(
            item_subtotal=_from_cents(item_subtotal),
            shipping_total=_from_cents(shipping_total),
            grand_total=_from_cents(grand_total),
        ),
        chosen_sellers=sorted(chosen_sellers, key=lambda seller: seller.seller_id),
        allocations=sorted(
            allocations,
            key=lambda allocation: (
                allocation.item_id,
                allocation.seller_id,
                allocation.offer_id,
            ),
        ),
        cart=OptimizationCart(
            sellers=sorted(cart_sellers, key=lambda seller: seller.seller_id),
            total_sellers=len(cart_sellers),
            total_units=total_units,
        ),
        notes=notes,
    )
