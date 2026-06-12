from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from statistics import median
from typing import Callable

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
MAX_TIME_SECONDS = 15
SOLVER_ABSOLUTE_GAP_LIMIT = 10
SOLVER_NUM_SEARCH_WORKERS = 8
MAX_OFFERS_PER_ITEM = 150


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


def _new_solver(
    cp_model,
    *,
    max_time_seconds: float | None,
    log_callback: Callable[[str], None] | None = None,
):
    solver = cp_model.CpSolver()
    if max_time_seconds is not None:
        solver.parameters.max_time_in_seconds = max_time_seconds
    solver.parameters.absolute_gap_limit = SOLVER_ABSOLUTE_GAP_LIMIT
    solver.parameters.num_search_workers = SOLVER_NUM_SEARCH_WORKERS
    solver.parameters.log_search_progress = True
    if log_callback is not None:
        solver.log_callback = log_callback
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


def _item_offer_price_stats(
    offers: list[Offer],
) -> dict[str, dict[str, float | int]]:
    offers_by_item: dict[str, list[Offer]] = defaultdict(list)
    for offer in offers:
        offers_by_item[offer.item_id].append(offer)

    stats_by_item: dict[str, dict[str, float | int]] = {}
    for item_id, item_offers in offers_by_item.items():
        prices = sorted(offer.unit_price for offer in item_offers)
        price_cents = sorted(offer.unit_price_cents for offer in item_offers)
        stats_by_item[item_id] = {
            "offer_count": len(item_offers),
            "min_unit_price": prices[0],
            "min_unit_price_cents": price_cents[0],
            "median_unit_price": float(median(prices)),
        }

    return stats_by_item


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
    if route_tiers.tiers:
        total_value_cents = sum(
            offer.unit_price_cents * quantity for offer, quantity in selections
        )
        total_units = sum(quantity for _, quantity in selections)

        valid_tier_costs = []
        for tier in route_tiers.tiers:
            if total_value_cents > tier.max_value_cents:
                continue
            if total_units > tier.max_units:
                continue
            valid_tier_costs.append(tier.total_price_cents)

        return min(valid_tier_costs) if valid_tier_costs else None

    return MISSING_ROUTE_DATA_PENALTY_CENTS


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
        total_item_cost_cents += offer.unit_price_cents * quantity

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
    solver_log_callback: Callable[[str], None] | None = None,
) -> tuple[str, dict[str, int]] | None:
    model = cp_model.CpModel()

    offer_vars = {}
    seller_active_vars = {}
    seller_tier_candidates = {}
    seller_value_upper_bounds = {}
    seller_unit_upper_bounds = {}

    seller_offers = defaultdict(list)
    for offer in usable_offers:
        seller_offers[offer.seller_id].append(offer)
        offer_vars[offer.offer_id] = _new_quantity_var(
            model,
            upper_bound=_capped_offer_quantity(offer, item_map),
            name=f"qty_{offer.offer_id}",
        )

    for seller_id, offers in seller_offers.items():
        seller_value_upper_bounds[seller_id] = sum(
            offer.unit_price_cents * _capped_offer_quantity(offer, item_map)
            for offer in offers
        )
        seller_unit_upper_bounds[seller_id] = sum(
            _capped_offer_quantity(offer, item_map) for offer in offers
        )

    for seller_id in seller_offers:
        route_tiers = route_book.lookup_tiers(
            seller_country=seller_map[seller_id].country,
            buyer_country=request.buyer_country,
            seller_value_upper_bound=seller_value_upper_bounds[seller_id],
            seller_unit_upper_bound=seller_unit_upper_bounds[seller_id],
        )

        seller_active_vars[seller_id] = model.NewBoolVar(f"seller_active_{seller_id}")
        tier_candidates = list(route_tiers.tiers)
        seller_tier_candidates[seller_id] = tier_candidates

    for item in request.items:
        model.Add(
            sum(
                offer_vars[offer.offer_id]
                for offer in usable_offers
                if offer.item_id == item.item_id
            )
            == item.quantity
        )
        model.Add(
            sum(
                seller_active_vars[seller_id]
                for seller_id in {
                    offer.seller_id
                    for offer in usable_offers
                    if offer.item_id == item.item_id
                }
            )
            >= 1
        )

    objective_terms = [
        offer.unit_price_cents * offer_vars[offer.offer_id] for offer in usable_offers
    ]

    seller_shipping_tier_choice_vars = {}
    seller_inactive_literals = {}

    for seller_id, offers in seller_offers.items():
        active = seller_active_vars[seller_id]
        tier_candidates = seller_tier_candidates[seller_id]

        if tier_candidates:
            total_value_expr = sum(
                offer.unit_price_cents * offer_vars[offer.offer_id] for offer in offers
            )
            total_units = sum(offer_vars[offer.offer_id] for offer in offers)

            if len(tier_candidates) == 1:
                tier = tier_candidates[0]
                seller_inactive_literals[seller_id] = [active.Not()]
                model.Add(total_value_expr <= tier.max_value_cents).OnlyEnforceIf(
                    active
                )
                model.Add(total_units <= tier.max_units).OnlyEnforceIf(active)

                objective_terms.append(tier.total_price_cents * active)
                continue

            seller_shipping_tier_choice_vars[seller_id] = []

            for tier_index, tier in enumerate(tier_candidates):
                tier_var = model.NewBoolVar(f"ship_{seller_id}_{tier_index}")
                seller_shipping_tier_choice_vars[seller_id].append((tier, tier_var))
                model.Add(total_value_expr <= tier.max_value_cents).OnlyEnforceIf(
                    tier_var
                )
                model.Add(total_units <= tier.max_units).OnlyEnforceIf(tier_var)

            active_tier_count = sum(
                tier_var for _, tier_var in seller_shipping_tier_choice_vars[seller_id]
            )
            model.AddAtMostOne(
                tier_var for _, tier_var in seller_shipping_tier_choice_vars[seller_id]
            )
            model.Add(active_tier_count == active)
            seller_inactive_literals[seller_id] = [active.Not()]

            objective_terms.append(
                sum(
                    tier.total_price_cents * tier_var
                    for tier, tier_var in seller_shipping_tier_choice_vars[seller_id]
                )
            )
            continue

        raise ValueError('No tier for seller')

    for seller_id, offers in seller_offers.items():
        active = seller_active_vars[seller_id]
        inactive_literals = seller_inactive_literals[seller_id]
        total_units = sum(offer_vars[offer.offer_id] for offer in offers)

        # When seller is inactive, every quantity for seller must be zero.
        for offer in offers:
            model.Add(offer_vars[offer.offer_id] == 0).OnlyEnforceIf(inactive_literals)

        # Any active seller choice must buy at least one unit.
        if seller_id in seller_shipping_tier_choice_vars:
            for _, tier_var in seller_shipping_tier_choice_vars[seller_id]:
                model.Add(total_units >= 1).OnlyEnforceIf(tier_var)
            continue

        model.Add(total_units >= 1).OnlyEnforceIf(active)

    # if request.preferences.max_sellers is not None:
    #     model.Add(sum(seller_active_vars.values()) <= request.preferences.max_sellers)

    model.Minimize(sum(objective_terms))
    solver = _new_solver(
        cp_model,
        max_time_seconds=MAX_TIME_SECONDS,
        log_callback=solver_log_callback,
    )
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return None

    solution_status = "optimal" if status == cp_model.OPTIMAL else "feasible"
    selected_offer_quantities = {
        offer.offer_id: solver.Value(offer_vars[offer.offer_id])
        for offer in usable_offers
        if solver.Value(offer_vars[offer.offer_id]) > 0
    }
    return solution_status, selected_offer_quantities


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
            total_cost = best_offer.unit_price_cents + shipping_cost
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


def _prune_expensive_country_offers(
    *,
    offers: list[Offer],
    seller_map: dict[str, object],
    buyer_country: str,
    route_book: shipping.ShippingRouteBook,
) -> list[Offer]:
    _ = _item_offer_price_stats(offers)

    offers_by_bucket: dict[tuple[str, str], list[Offer]] = defaultdict(list)
    for offer in offers:
        seller = seller_map[offer.seller_id]
        offers_by_bucket[(offer.item_id, seller.country)].append(offer)

    chosen_offer_ids: set[str] = set()
    for (_, seller_country), bucket_offers in offers_by_bucket.items():
        cheapest_offer = min(bucket_offers, key=_offer_prune_rank)
        shipping_cost_cents = _selection_shipping_cost_cents(
            seller_country=seller_country,
            buyer_country=buyer_country,
            selections=[(cheapest_offer, 1)],
            route_book=route_book,
        )
        if shipping_cost_cents is None:
            chosen_offer_ids.update(offer.offer_id for offer in bucket_offers)
            continue

        threshold_cents = cheapest_offer.unit_price_cents + shipping_cost_cents
        for offer in bucket_offers:
            if offer.unit_price_cents <= threshold_cents:
                chosen_offer_ids.add(offer.offer_id)

    return [offer for offer in offers if offer.offer_id in chosen_offer_ids]


def _prune_top_offers_per_item_by_price(offers: list[Offer]) -> list[Offer]:
    offers_by_item: dict[str, list[Offer]] = defaultdict(list)
    for offer in offers:
        offers_by_item[offer.item_id].append(offer)

    chosen_offer_ids: set[str] = set()
    for item_offers in offers_by_item.values():
        for offer in sorted(item_offers, key=_offer_prune_rank)[:MAX_OFFERS_PER_ITEM]:
            chosen_offer_ids.add(offer.offer_id)

    return [offer for offer in offers if offer.offer_id in chosen_offer_ids]


def prune_all(request: OptimizationRequest):
    seller_map = request.seller_map()
    item_map = request.item_map()

    usable_offers = _prune_dominated_offers_per_seller(request.offers, item_map)
    usable_offers = _prune_top_offers_per_item_by_price(usable_offers)

    route_book = shipping.load_shipping_route_book()
    usable_offers = _prune_expensive_country_offers(
        offers=usable_offers,
        seller_map=seller_map,
        buyer_country=request.buyer_country,
        route_book=route_book,
    )
    usable_offers = _prune_cheapest_single_item_sellers(
        offers=usable_offers,
        item_map=item_map,
        seller_map=seller_map,
        buyer_country=request.buyer_country,
        route_book=route_book,
    )
    return usable_offers


def optimize_order(
    request: OptimizationRequest,
    *,
    solver_log_callback: Callable[[str], None] | None = None,
) -> OptimizationResponse:
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
        solver_log_callback=solver_log_callback,
    )
    if solution is None:
        return OptimizationResponse(
            status="infeasible",
            currency=request.currency,
            totals=OptimizationTotals(item_subtotal=0, shipping_total=0, grand_total=0),
            cart=OptimizationCart(),
            notes=["Solver found no feasible solution."],
        )

    solution_status, selected_offer_quantities = solution

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
        line_total = offer.unit_price_cents * quantity
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

    if solution_status == "feasible":
        notes.append(
            "Solver hit time limit before proving optimality. Returning best known order."
        )

    return OptimizationResponse(
        status=solution_status,
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


def _make_file_log_callback(log_file) -> Callable[[str], None]:
    def write_log(message: str) -> None:
        log_file.write(message)
        if not message.endswith("\n"):
            log_file.write("\n")
        log_file.flush()

    return write_log


def _format_selected_offer_rank_analysis(
    request: OptimizationRequest,
    response: OptimizationResponse,
) -> list[str]:
    if not response.allocations:
        return []

    item_map = request.item_map()
    seller_map = request.seller_map()
    offer_by_id = {offer.offer_id: offer for offer in request.offers}
    offers_by_item: dict[str, list[Offer]] = defaultdict(list)
    for offer in request.offers:
        offers_by_item[offer.item_id].append(offer)

    selected_offer_ids = {allocation.offer_id for allocation in response.allocations}
    lines = []
    for allocation in response.allocations:
        selected_offer = offer_by_id[allocation.offer_id]
        item_offers = offers_by_item[selected_offer.item_id]
        cheaper_count = sum(
            1
            for offer in item_offers
            if offer.unit_price_cents < selected_offer.unit_price_cents
        )
        same_price_count = sum(
            1
            for offer in item_offers
            if offer.offer_id != selected_offer.offer_id
            and offer.unit_price_cents == selected_offer.unit_price_cents
        )
        pricier_count = sum(
            1
            for offer in item_offers
            if offer.unit_price_cents > selected_offer.unit_price_cents
        )

        cheaper_unbought = sum(
            1
            for offer in item_offers
            if offer.offer_id not in selected_offer_ids
            and offer.unit_price_cents < selected_offer.unit_price_cents
        )
        same_price_unbought = sum(
            1
            for offer in item_offers
            if offer.offer_id not in selected_offer_ids
            and offer.unit_price_cents == selected_offer.unit_price_cents
        )
        pricier_unbought = sum(
            1
            for offer in item_offers
            if offer.offer_id not in selected_offer_ids
            and offer.unit_price_cents > selected_offer.unit_price_cents
        )

        rank = cheaper_count + 1
        seller = seller_map[selected_offer.seller_id]
        item = item_map[selected_offer.item_id]
        line = (
            f"- {item.name}: bought {selected_offer.unit_price:.2f} {request.currency} "
            f"from {seller.name} [{selected_offer.seller_id}], rank {rank}/{len(item_offers)} "
            f"by unit price; skipped {cheaper_unbought} cheaper, "
            f"{same_price_unbought} same-price, {pricier_unbought} pricier"
        )
        if same_price_count > 0:
            line += f" (ties at same price: {same_price_count})"
        if allocation.quantity > 1:
            line += f"; bought qty {allocation.quantity}"
        lines.append(line)

    return lines


def _run_big_list_debug_solve() -> Path:
    project_root = Path(__file__).resolve().parents[1]
    fixture_path = project_root / "tests" / "fixtures" / "requests" / "big_list.json"
    data_dir = project_root / "data"
    data_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d-%H%M")
    log_path = data_dir / f"solver-big-list-{timestamp}.log"

    payload = json.loads(fixture_path.read_text(encoding="utf-8"))
    request = OptimizationRequest.model_validate(payload)
    analysis_lines: list[str] = []

    with log_path.open("w", encoding="utf-8") as log_file:
        log_file.write(f"fixture: {fixture_path}\n")
        log_file.write(f"timestamp: {datetime.now().isoformat(timespec='seconds')}\n\n")

        response = optimize_order(
            request,
            solver_log_callback=_make_file_log_callback(log_file),
        )

        log_file.write("\n=== Optimization summary ===\n")
        log_file.write(response.model_dump_json(indent=2))
        log_file.write("\n")

        analysis_lines = _format_selected_offer_rank_analysis(request, response)
        log_file.write("\n=== Bought item price ranks ===\n")
        if analysis_lines:
            log_file.write("\n".join(analysis_lines))
            log_file.write("\n")
        else:
            log_file.write("No bought-item rank analysis available.\n")

    print(f"Solver log written to {log_path}")
    print(
        "Result:",
        response.status,
        f"grand_total={response.totals.grand_total:.2f} {response.currency}",
        f"sellers={response.cart.total_sellers}",
        f"units={response.cart.total_units}",
    )
    if analysis_lines:
        print("Bought item price ranks:")
        for line in analysis_lines:
            print(line)
    return log_path


if __name__ == "__main__":
    _run_big_list_debug_solve()
