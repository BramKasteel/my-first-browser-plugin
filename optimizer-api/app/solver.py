from __future__ import annotations

from collections import defaultdict
from heapq import nsmallest

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
MISSING_ROUTE_DATA_PENALTY_CENTS = 10_000
WARM_START_MAX_TIME_SECONDS = 2


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


def _offer_prune_rank(offer: Offer) -> tuple[float, int, str]:
    return (
        offer.unit_price,
        -offer.available_quantity,
        offer.offer_id,
    )


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
        chosen_offer_ids.update(
            offer.offer_id
            for offer in nsmallest(keep_count, bucket_offers, key=_offer_prune_rank)
        )

    return [offer for offer in offers if offer.offer_id in chosen_offer_ids]


def _selection_shipping_cost_cents(
    *,
    seller_country: str,
    buyer_country: str,
    selections: list[tuple[Offer, int]],
    item_map: dict[str, WantedItem],
    route_book: shipping.ShippingRouteBook | None,
    use_explicit_weights: bool,
) -> int | None:
    if route_book is not None:
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
            total_weight_grams = sum(
                (item_map[offer.item_id].unit_weight_grams or 0) * quantity
                for offer, quantity in selections
            )
            total_cards = sum(
                item_map[offer.item_id].cards_per_unit * quantity
                for offer, quantity in selections
            )
            has_parcel_only_item = any(
                item_map[offer.item_id].requires_parcel and quantity > 0
                for offer, quantity in selections
            )

            valid_tier_costs = []
            for is_letter_tier, tier in tier_candidates:
                if total_value_cents > tier.max_value_cents:
                    continue
                if use_explicit_weights:
                    if total_weight_grams > tier.max_weight_grams:
                        continue
                elif total_cards > _method_card_capacity(tier.max_weight_grams):
                    continue
                if is_letter_tier and has_parcel_only_item:
                    continue
                valid_tier_costs.append(tier.total_price_cents)

            return min(valid_tier_costs) if valid_tier_costs else None

        return MISSING_ROUTE_DATA_PENALTY_CENTS

    return shipping.legacy_shipping_cost_cents(
        seller_country=seller_country,
        buyer_country=buyer_country,
    )


def _prune_dominated_single_item_sellers(
    *,
    offers: list[Offer],
    item_map: dict[str, WantedItem],
    seller_map: dict[str, object],
    buyer_country: str,
    route_book: shipping.ShippingRouteBook | None,
    use_explicit_weights: bool,
) -> list[Offer]:
    seller_offers: dict[str, list[Offer]] = defaultdict(list)
    item_offers: dict[str, list[Offer]] = defaultdict(list)
    for offer in offers:
        seller_offers[offer.seller_id].append(offer)
        item_offers[offer.item_id].append(offer)

    dropped_seller_ids: set[str] = set()
    for seller_id, seller_bucket in seller_offers.items():
        if len(seller_bucket) != 1:
            continue

        offer = seller_bucket[0]
        quantity = _capped_offer_quantity(offer, item_map)
        if quantity <= 0:
            continue

        seller = seller_map[seller_id]
        subject_shipping_cost = _selection_shipping_cost_cents(
            seller_country=seller.country,
            buyer_country=buyer_country,
            selections=[(offer, quantity)],
            item_map=item_map,
            route_book=route_book,
            use_explicit_weights=use_explicit_weights,
        )
        if subject_shipping_cost is None:
            dropped_seller_ids.add(seller_id)
            continue

        subject_total_cents = (
            _to_cents(offer.unit_price) * quantity + subject_shipping_cost
        )

        for alternative in item_offers[offer.item_id]:
            if alternative.seller_id == seller_id:
                continue
            if len(seller_offers[alternative.seller_id]) <= 1:
                continue

            alternative_quantity = _capped_offer_quantity(alternative, item_map)
            if alternative_quantity < quantity:
                continue

            alternative_seller = seller_map[alternative.seller_id]
            alternative_shipping_cost = _selection_shipping_cost_cents(
                seller_country=alternative_seller.country,
                buyer_country=buyer_country,
                selections=[(alternative, quantity)],
                item_map=item_map,
                route_book=route_book,
                use_explicit_weights=use_explicit_weights,
            )
            if alternative_shipping_cost is None:
                continue

            alternative_total_cents = (
                _to_cents(alternative.unit_price) * quantity + alternative_shipping_cost
            )
            if alternative_total_cents <= subject_total_cents:
                dropped_seller_ids.add(seller_id)
                break

    return [offer for offer in offers if offer.seller_id not in dropped_seller_ids]


def _build_route_min_shipping_warm_start(
    *,
    cp_model,
    request: OptimizationRequest,
    usable_offers: list[Offer],
    item_map: dict[str, WantedItem],
    seller_map: dict[str, object],
    route_book: shipping.ShippingRouteBook | None,
) -> tuple[dict[str, int], dict[str, int]]:
    if not usable_offers:
        return {}, {}

    hint_model = cp_model.CpModel()
    hint_offer_vars = {}
    hint_seller_active_vars = {}
    seller_offers: dict[str, list[Offer]] = defaultdict(list)

    for offer in usable_offers:
        seller_offers[offer.seller_id].append(offer)
        capped_quantity = _capped_offer_quantity(offer, item_map)
        hint_offer_vars[offer.offer_id] = hint_model.NewIntVar(
            0,
            capped_quantity,
            f"warm_qty_{offer.offer_id}",
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

    hint_solver = cp_model.CpSolver()
    hint_solver.parameters.max_time_in_seconds = WARM_START_MAX_TIME_SECONDS
    hint_solver.parameters.num_search_workers = 8
    status = hint_solver.Solve(hint_model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {}, {}

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
    )


def _assignment_total_cost_cents(
    *,
    offer_quantities: dict[str, int],
    offer_by_id: dict[str, Offer],
    item_map: dict[str, WantedItem],
    seller_map: dict[str, object],
    buyer_country: str,
    route_book: shipping.ShippingRouteBook | None,
    use_explicit_weights: bool,
) -> int | None:
    selections_by_seller: dict[str, list[tuple[Offer, int]]] = defaultdict(list)
    total_item_cost_cents = 0
    for offer_id, quantity in offer_quantities.items():
        if quantity <= 0:
            continue
        offer = offer_by_id[offer_id]
        selections_by_seller[offer.seller_id].append((offer, quantity))
        total_item_cost_cents += _to_cents(offer.unit_price) * quantity

    total_shipping_cost_cents = 0
    for seller_id, selections in selections_by_seller.items():
        shipping_cost_cents = _selection_shipping_cost_cents(
            seller_country=seller_map[seller_id].country,
            buyer_country=buyer_country,
            selections=selections,
            item_map=item_map,
            route_book=route_book,
            use_explicit_weights=use_explicit_weights,
        )
        if shipping_cost_cents is None:
            return None
        total_shipping_cost_cents += shipping_cost_cents

    return total_item_cost_cents + total_shipping_cost_cents


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

    route_book = shipping.load_shipping_route_book()
    use_explicit_weights = _has_explicit_item_weights(request)
    usable_offers = _prune_dominated_single_item_sellers(
        offers=usable_offers,
        item_map=item_map,
        seller_map=seller_map,
        buyer_country=request.buyer_country,
        route_book=route_book,
        use_explicit_weights=use_explicit_weights,
    )

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
        model.Add(total_units <= max_units * active)  # todo: what does this do
        model.Add(total_units >= active)  # todo: what does this do

    if request.preferences.max_sellers is not None:
        model.Add(sum(seller_active_vars.values()) <= request.preferences.max_sellers)

    objective_terms = []
    for offer in usable_offers:
        objective_terms.append(_to_cents(offer.unit_price) * offer_vars[offer.offer_id])

    use_rich_shipping = route_book is not None
    seller_shipping_tier_choice_vars = {}
    seller_forced_shipping_tier_costs = {}
    seller_shipping_fallback_costs = {}
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
        route_tiers = shipping.ShippingRouteTiers(letter_tiers=(), parcel_tiers=())
        if use_rich_shipping and route_book is not None:
            route_tiers = route_book.lookup_tiers(
                seller_country=seller_map[seller_id].country,
                buyer_country=request.buyer_country,
            )

        tier_candidates = [(True, tier) for tier in route_tiers.letter_tiers] + [
            (False, tier) for tier in route_tiers.parcel_tiers
        ]

        if tier_candidates:
            total_value_expr = sum(
                _to_cents(offer.unit_price) * offer_vars[offer.offer_id]
                for offer in seller_offers[seller_id]
            )
            total_weight_expr = sum(
                (
                    item_map[offer.item_id].unit_weight_grams or 0
                )  # TODO: is this not always zero for our wants list?
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

            if len(tier_candidates) == 1:
                is_letter_tier, tier = tier_candidates[0]
                model.Add(
                    total_value_expr
                    <= tier.max_value_cents
                    + seller_value_upper_bounds[seller_id] * (1 - active)
                )
                if use_explicit_weights:
                    model.Add(
                        total_weight_expr
                        <= tier.max_weight_grams
                        + seller_weight_upper_bounds[seller_id] * (1 - active)
                    )
                else:
                    model.Add(
                        total_card_expr
                        <= _method_card_capacity(tier.max_weight_grams)
                        + seller_card_upper_bounds[seller_id] * (1 - active)
                    )
                if is_letter_tier:
                    model.Add(
                        parcel_only_units_expr
                        <= seller_unit_upper_bounds[seller_id] * (1 - active)
                    )

                seller_forced_shipping_tier_costs[seller_id] = tier.total_price_cents
                objective_terms.append(tier.total_price_cents * active)
                continue

            seller_shipping_tier_choice_vars[seller_id] = []

            for tier_index, (is_letter_tier, tier) in enumerate(tier_candidates):
                tier_var = model.NewBoolVar(f"ship_{seller_id}_{tier_index}")
                seller_shipping_tier_choice_vars[seller_id].append((tier, tier_var))
                model.Add(
                    total_value_expr
                    <= tier.max_value_cents
                    + seller_value_upper_bounds[seller_id] * (1 - tier_var)
                )
                if use_explicit_weights:
                    model.Add(
                        total_weight_expr
                        <= tier.max_weight_grams
                        + seller_weight_upper_bounds[seller_id] * (1 - tier_var)
                    )
                else:
                    model.Add(
                        total_card_expr
                        <= _method_card_capacity(tier.max_weight_grams)
                        + seller_card_upper_bounds[seller_id] * (1 - tier_var)
                    )
                if is_letter_tier:
                    model.Add(
                        parcel_only_units_expr
                        <= seller_unit_upper_bounds[seller_id] * (1 - tier_var)
                    )

            model.Add(
                sum(
                    tier_var
                    for _, tier_var in seller_shipping_tier_choice_vars[seller_id]
                )
                == active
            )
            objective_terms.append(
                sum(
                    tier.total_price_cents * tier_var
                    for tier, tier_var in seller_shipping_tier_choice_vars[seller_id]
                )
            )
            continue

        if use_rich_shipping:
            seller_shipping_fallback_costs[seller_id] = MISSING_ROUTE_DATA_PENALTY_CENTS
        else:
            seller_shipping_fallback_costs[seller_id] = (
                shipping.legacy_shipping_cost_cents(
                    seller_country=seller_map[seller_id].country,
                    buyer_country=request.buyer_country,
                )
            )
        objective_terms.append(seller_shipping_fallback_costs[seller_id] * active)

    warm_start_offer_values, warm_start_seller_values = (
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

        shipping_total = seller_shipping_fallback_costs.get(seller_id)
        if shipping_total is None:
            shipping_total = seller_forced_shipping_tier_costs.get(seller_id)
        if shipping_total is None:
            shipping_total = next(
                tier.total_price_cents
                for tier, tier_var in seller_shipping_tier_choice_vars[seller_id]
                if solver.Value(tier_var) > 0
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
        if seller_shipping_fallback_costs:
            notes.append(
                f"Missing imported route data gets penalty shipping cost of {_from_cents(MISSING_ROUTE_DATA_PENALTY_CENTS):.2f} {request.currency} per seller."
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
