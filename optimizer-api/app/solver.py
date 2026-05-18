from __future__ import annotations

from collections import defaultdict

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

LETTER_CARD_LIMITS = ((20, 4), (50, 17), (100, 40))
APPROX_GRAMS_PER_CARD = 2.5


def _to_cents(amount: float) -> int:
    return int(round(amount * 100))


def _from_cents(amount: int) -> float:
    return round(amount / 100, 2)


def _method_card_capacity(max_weight_grams: int) -> int:
    for weight_limit, card_limit in LETTER_CARD_LIMITS:
        if max_weight_grams <= weight_limit:
            return card_limit
    return int(max_weight_grams / APPROX_GRAMS_PER_CARD)


def _has_explicit_item_weights(request: OptimizationRequest) -> bool:
    return all(item.unit_weight_grams is not None for item in request.items)


def _capped_offer_quantity(offer: Offer, item_map: dict[str, WantedItem]) -> int:
    return min(offer.available_quantity, item_map[offer.item_id].quantity)


def _prune_dominated_offers(
    offers: list[Offer], item_map: dict[str, WantedItem]
) -> list[Offer]:
    offers_by_bucket: dict[tuple[str, str], list[Offer]] = defaultdict(list)
    for offer in offers:
        offers_by_bucket[(offer.seller_id, offer.item_id)].append(offer)

    chosen_offer_ids: set[str] = set()
    for (seller_id, item_id), bucket_offers in offers_by_bucket.items():
        del seller_id
        keep_count = item_map[item_id].quantity
        ranked_offers = sorted(
            bucket_offers,
            key=lambda offer: (
                offer.unit_price,
                -offer.available_quantity,
                offer.offer_id,
            ),
        )
        chosen_offer_ids.update(offer.offer_id for offer in ranked_offers[:keep_count])

    return [offer for offer in offers if offer.offer_id in chosen_offer_ids]


def optimize_order(request: OptimizationRequest) -> OptimizationResponse:
    try:
        from ortools.sat.python import cp_model
    except ImportError as exc:
        raise RuntimeError(
            "OR-Tools not installed. Run `pip install -e .` inside optimizer-api first."
        ) from exc

    seller_map = {seller.seller_id: seller for seller in request.sellers}
    item_map = {item.item_id: item for item in request.items}

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

    usable_offers = _prune_dominated_offers(usable_offers, item_map)

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
            cart=OptimizationCart(),
            notes=notes,
        )

    model = cp_model.CpModel()

    offer_vars = {}
    seller_active_vars = {}

    seller_offers = defaultdict(list)
    for offer in usable_offers:
        seller_offers[offer.seller_id].append(offer)
        capped_quantity = _capped_offer_quantity(offer, item_map)
        offer_vars[offer.offer_id] = model.NewIntVar(
            0, capped_quantity, f"qty_{offer.offer_id}"
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
        max_units = sum(_capped_offer_quantity(offer, item_map) for offer in offers)
        model.Add(total_units <= max_units * active)
        model.Add(total_units >= active)

    if request.preferences.max_sellers is not None:
        model.Add(sum(seller_active_vars.values()) <= request.preferences.max_sellers)

    objective_terms = []
    for offer in usable_offers:
        objective_terms.append(_to_cents(offer.unit_price) * offer_vars[offer.offer_id])

    route_book = shipping.load_shipping_route_book()
    use_rich_shipping = route_book is not None
    use_explicit_weights = _has_explicit_item_weights(request)
    seller_shipping_method_vars = {}
    fallback_shipping_costs = {}
    seller_value_upper_bounds = {}
    seller_weight_upper_bounds = {}
    seller_card_upper_bounds = {}
    seller_unit_upper_bounds = {}

    for seller_id, offers in seller_offers.items():
        seller_value_upper_bounds[seller_id] = sum(
            _to_cents(offer.unit_price) * _capped_offer_quantity(offer, item_map)
            for offer in offers
        )
        seller_weight_upper_bounds[seller_id] = sum(
            (item_map[offer.item_id].unit_weight_grams or 0)
            * _capped_offer_quantity(offer, item_map)
            for offer in offers
        )
        seller_card_upper_bounds[seller_id] = sum(
            item_map[offer.item_id].cards_per_unit
            * _capped_offer_quantity(offer, item_map)
            for offer in offers
        )
        seller_unit_upper_bounds[seller_id] = sum(
            _capped_offer_quantity(offer, item_map) for offer in offers
        )

    for seller_id, active in seller_active_vars.items():
        route_methods = ()
        if use_rich_shipping and route_book is not None:
            route_methods = tuple(
                method
                for method in route_book.lookup_methods(
                    seller_country=seller_map[seller_id].country,
                    buyer_country=request.buyer_country,
                )
                if not method.is_virtual
            )

        if route_methods:
            total_value_expr = sum(
                _to_cents(offer.unit_price) * offer_vars[offer.offer_id]
                for offer in seller_offers[seller_id]
            )
            total_weight_expr = sum(
                (item_map[offer.item_id].unit_weight_grams or 0)
                * offer_vars[offer.offer_id]
                for offer in seller_offers[seller_id]
            )
            total_card_expr = sum(
                item_map[offer.item_id].cards_per_unit * offer_vars[offer.offer_id]
                for offer in seller_offers[seller_id]
            )
            parcel_only_units_expr = sum(
                offer_vars[offer.offer_id]
                for offer in seller_offers[seller_id]
                if item_map[offer.item_id].requires_parcel
            )

            seller_shipping_method_vars[seller_id] = []
            for method_index, method in enumerate(route_methods):
                method_var = model.NewBoolVar(f"ship_{seller_id}_{method_index}")
                seller_shipping_method_vars[seller_id].append((method, method_var))
                model.Add(
                    total_value_expr
                    <= method.max_value_cents
                    + seller_value_upper_bounds[seller_id] * (1 - method_var)
                )
                if use_explicit_weights:
                    model.Add(
                        total_weight_expr
                        <= method.max_weight_grams
                        + seller_weight_upper_bounds[seller_id] * (1 - method_var)
                    )
                else:
                    model.Add(
                        total_card_expr
                        <= _method_card_capacity(method.max_weight_grams)
                        + seller_card_upper_bounds[seller_id] * (1 - method_var)
                    )
                if method.is_letter:
                    model.Add(
                        parcel_only_units_expr
                        <= seller_unit_upper_bounds[seller_id] * (1 - method_var)
                    )

            model.Add(
                sum(
                    method_var
                    for _, method_var in seller_shipping_method_vars[seller_id]
                )
                == active
            )
            objective_terms.append(
                sum(
                    method.total_price_cents * method_var
                    for method, method_var in seller_shipping_method_vars[seller_id]
                )
            )
            continue

        fallback_shipping_costs[seller_id] = shipping.legacy_shipping_cost_cents(
            seller_country=seller_map[seller_id].country,
            buyer_country=request.buyer_country,
        )
        objective_terms.append(fallback_shipping_costs[seller_id] * active)

    objective_expr = sum(objective_terms)
    model.Minimize(objective_expr)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = 10
    solver.parameters.num_search_workers = 8
    status = solver.Solve(model)

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return OptimizationResponse(
            status="infeasible",
            currency=request.currency,
            totals=OptimizationTotals(item_subtotal=0, shipping_total=0, grand_total=0),
            cart=OptimizationCart(),
            notes=["Solver found no feasible solution."],
        )

    solution_status = "optimal" if status == cp_model.OPTIMAL else "feasible"

    allocations = []
    cart_items_by_seller = defaultdict(list)
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
    for seller_id, active_var in seller_active_vars.items():
        if solver.Value(active_var) <= 0:
            continue

        shipping_total = fallback_shipping_costs.get(seller_id)
        if shipping_total is None:
            shipping_total = next(
                method.total_price_cents
                for method, method_var in seller_shipping_method_vars[seller_id]
                if solver.Value(method_var) > 0
            )

        seller_shipping_totals[seller_id] = shipping_total
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
    if use_rich_shipping:
        notes.append(
            "Shipping uses imported Cardmarket route tables when route data exists for a seller-country to buyer-country pair."
        )
        if use_explicit_weights:
            notes.append(
                "Shipment constraints use selected item value, summed item weight, and parcel-only item flags."
            )
        else:
            notes.append(
                "Shipment constraints use selected item value, card-count letter thresholds (4/17/40 cards), and parcel-only item flags."
            )
        if fallback_shipping_costs:
            notes.append(
                "Missing imported route data falls back to legacy route proxy per seller."
            )
    else:
        notes.extend(
            [
                "Shipping proxy uses seller-country to buyer-country route costs when known.",
                "Current route table: Germany -> Netherlands = 1.55 EUR, Netherlands -> Netherlands = 1.70 EUR, fallback = 1.00 EUR.",
            ]
        )
        if route_book is None:
            notes.append(
                "Imported shipping data unavailable. Run `uv run cm-import-shipping` to enable route-method pricing."
            )
    if filtered_sellers:
        notes.append(
            f"Filtered sellers excluded before solve: {', '.join(sorted(filtered_sellers))}"
        )
    if solution_status == "feasible":
        notes.append(
            "Solver hit time limit before proving optimality. Returning best known feasible order."
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
