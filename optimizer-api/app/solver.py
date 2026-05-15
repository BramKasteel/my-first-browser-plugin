from __future__ import annotations

from collections import defaultdict

from .models import (
    AllocationResult,
    OptimizationRequest,
    OptimizationResponse,
    OptimizationTotals,
    SellerResult,
)


def _to_cents(amount: float) -> int:
    return int(round(amount * 100))


def _from_cents(amount: int) -> float:
    return round(amount / 100, 2)


def optimize_order(request: OptimizationRequest) -> OptimizationResponse:
    try:
        from ortools.sat.python import cp_model
    except ImportError as exc:
        raise RuntimeError(
            "OR-Tools not installed. Run `pip install -e .` inside optimizer-api first."
        ) from exc

    item_map = {item.item_id: item for item in request.items}
    seller_map = {seller.seller_id: seller for seller in request.sellers}
    shipping_map = {profile.seller_id: profile for profile in request.shipping_profiles}

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
    seller_free_shipping_vars = {}

    seller_offers = defaultdict(list)
    for offer in usable_offers:
        seller_offers[offer.seller_id].append(offer)
        offer_vars[offer.offer_id] = model.NewIntVar(
            0, offer.available_quantity, f"qty_{offer.offer_id}"
        )

    for seller_id in seller_offers:
        seller_active_vars[seller_id] = model.NewBoolVar(f"seller_active_{seller_id}")
        profile = shipping_map.get(seller_id)
        if profile and profile.free_shipping_threshold is not None:
            seller_free_shipping_vars[seller_id] = model.NewBoolVar(
                f"free_shipping_{seller_id}"
            )

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

        profile = shipping_map.get(seller_id)
        if profile and profile.min_order_value_for_shipping > 0:
            seller_spend = sum(
                _to_cents(offer.unit_price) * offer_vars[offer.offer_id]
                for offer in offers
            )
            model.Add(
                seller_spend >= _to_cents(profile.min_order_value_for_shipping) * active
            )

        free_shipping = seller_free_shipping_vars.get(seller_id)
        if profile and free_shipping is not None:
            seller_spend = sum(
                _to_cents(offer.unit_price) * offer_vars[offer.offer_id]
                for offer in offers
            )
            model.Add(free_shipping <= active)
            model.Add(
                seller_spend
                >= _to_cents(profile.free_shipping_threshold) * free_shipping
            )

    if request.preferences.max_sellers is not None:
        model.Add(sum(seller_active_vars.values()) <= request.preferences.max_sellers)

    objective_terms = []
    for offer in usable_offers:
        objective_terms.append(_to_cents(offer.unit_price) * offer_vars[offer.offer_id])

    for seller_id, offers in seller_offers.items():
        active = seller_active_vars[seller_id]
        total_units = sum(offer_vars[offer.offer_id] for offer in offers)
        profile = shipping_map.get(seller_id)
        if not profile:
            continue

        if profile.base_cost > 0:
            free_shipping = seller_free_shipping_vars.get(seller_id)
            if free_shipping is None:
                objective_terms.append(_to_cents(profile.base_cost) * active)
            else:
                objective_terms.append(
                    _to_cents(profile.base_cost) * (active - free_shipping)
                )

        if profile.per_item_cost > 0:
            objective_terms.append(_to_cents(profile.per_item_cost) * total_units)

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

        profile = shipping_map.get(seller_id)
        shipping_total = 0
        if profile:
            shipping_total += (
                _to_cents(profile.per_item_cost) * seller_unit_totals[seller_id]
            )
            free_shipping = seller_free_shipping_vars.get(seller_id)
            free_shipping_hit = (
                free_shipping is not None and solver.Value(free_shipping) > 0
            )
            if not free_shipping_hit:
                shipping_total += _to_cents(profile.base_cost)

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
        "Shipping model uses flat plus per-item costs per seller.",
        "Real Cardmarket checkout shipping tiers still need richer constraints.",
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
