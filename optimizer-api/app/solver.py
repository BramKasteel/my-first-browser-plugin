from __future__ import annotations

from collections import defaultdict

from .models import (
    AllocationResult,
    OptimizationRequest,
    OptimizationResponse,
    OptimizationTotals,
    SellerResult,
)

DEFAULT_ORDER_SHIPPING_EUR = 1.0
ROUTE_SHIPPING_EUR = {
    ("germany", "netherlands"): 1.55,
    ("netherlands", "netherlands"): 1.70,
}


def _to_cents(amount: float) -> int:
    return int(round(amount * 100))


def _from_cents(amount: int) -> float:
    return round(amount / 100, 2)


def _shipping_cost_cents(*, seller_country: str, buyer_country: str) -> int:
    route_amount = ROUTE_SHIPPING_EUR.get(
        (seller_country.strip().casefold(), buyer_country.strip().casefold()),
        DEFAULT_ORDER_SHIPPING_EUR,
    )
    return _to_cents(route_amount)


def optimize_order(request: OptimizationRequest) -> OptimizationResponse:
    try:
        from ortools.sat.python import cp_model
    except ImportError as exc:
        raise RuntimeError(
            "OR-Tools not installed. Run `pip install -e .` inside optimizer-api first."
        ) from exc

    seller_map = {seller.seller_id: seller for seller in request.sellers}

    allowed_countries = set(
        country.strip().casefold()
        for country in request.preferences.allowed_countries
        if country.strip()
    )
    blocked_sellers = set(request.preferences.blocked_seller_ids)

    usable_offers = []
    filtered_sellers = set()
    for offer in request.offers:
        seller = seller_map[offer.seller_id]
        seller_country = seller.country.strip().casefold()
        if offer.seller_id in blocked_sellers:
            filtered_sellers.add(offer.seller_id)
            continue
        if allowed_countries and seller_country not in allowed_countries:
            filtered_sellers.add(offer.seller_id)
            continue
        usable_offers.append(offer)

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
        if filtered_sellers:
            notes.append(f"Filtered sellers: {', '.join(sorted(filtered_sellers))}")
        return OptimizationResponse(
            status="infeasible",
            currency=request.currency,
            totals=OptimizationTotals(item_subtotal=0, shipping_total=0, grand_total=0),
            notes=notes,
        )

    model = cp_model.CpModel()

    offer_vars = {}
    seller_active_vars = {}

    seller_offers = defaultdict(list)
    for offer in usable_offers:
        seller_offers[offer.seller_id].append(offer)
        offer_vars[offer.offer_id] = model.NewIntVar(
            0, offer.available_quantity, f"qty_{offer.offer_id}"
        )

    for seller_id in seller_offers:
        seller_active_vars[seller_id] = model.NewBoolVar(f"seller_active_{seller_id}")

    for item in request.items:
        model.Add(
            sum(
                offer_vars[offer.offer_id]
                for offer in usable_offers
                if offer.item_id == item.item_id
            )
            == item.quantity
        )

    for seller_id, offers in seller_offers.items():
        active = seller_active_vars[seller_id]
        total_units = sum(offer_vars[offer.offer_id] for offer in offers)
        max_units = sum(offer.available_quantity for offer in offers)
        model.Add(total_units <= max_units * active)
        model.Add(total_units >= active)

    if request.preferences.max_sellers is not None:
        model.Add(sum(seller_active_vars.values()) <= request.preferences.max_sellers)

    objective_terms = []
    for offer in usable_offers:
        objective_terms.append(_to_cents(offer.unit_price) * offer_vars[offer.offer_id])

    shipping_costs_by_seller = {
        seller_id: _shipping_cost_cents(
            seller_country=seller_map[seller_id].country,
            buyer_country=request.buyer_country,
        )
        for seller_id in seller_active_vars
    }

    for seller_id, active in seller_active_vars.items():
        objective_terms.append(shipping_costs_by_seller[seller_id] * active)

    model.Minimize(sum(objective_terms))

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return OptimizationResponse(
            status="infeasible",
            currency=request.currency,
            totals=OptimizationTotals(item_subtotal=0, shipping_total=0, grand_total=0),
            notes=["Solver found no feasible solution."],
        )

    allocations = []
    seller_item_subtotals = defaultdict(int)
    seller_shipping_totals = defaultdict(int)
    seller_unit_totals = defaultdict(int)

    for offer in usable_offers:
        quantity = solver.Value(offer_vars[offer.offer_id])
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
        seller_item_subtotals[offer.seller_id] += line_total
        seller_unit_totals[offer.seller_id] += quantity

    chosen_sellers = []
    for seller_id, active_var in seller_active_vars.items():
        if solver.Value(active_var) <= 0:
            continue

        shipping_total = shipping_costs_by_seller[seller_id]

        seller_shipping_totals[seller_id] = shipping_total
        chosen_sellers.append(
            SellerResult(
                seller_id=seller_id,
                item_subtotal=_from_cents(seller_item_subtotals[seller_id]),
                shipping_cost=_from_cents(shipping_total),
                total_units=seller_unit_totals[seller_id],
            )
        )

    item_subtotal = sum(seller_item_subtotals.values())
    shipping_total = sum(seller_shipping_totals.values())
    grand_total = item_subtotal + shipping_total

    notes = [
        "Shipping proxy uses seller-country to buyer-country route costs when known.",
        "Current route table: Germany -> Netherlands = 1.55 EUR, Netherlands -> Netherlands = 1.70 EUR, fallback = 1.00 EUR.",
    ]
    if filtered_sellers:
        notes.append(
            f"Filtered sellers excluded before solve: {', '.join(sorted(filtered_sellers))}"
        )

    return OptimizationResponse(
        status="optimal",
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
        notes=notes,
    )
