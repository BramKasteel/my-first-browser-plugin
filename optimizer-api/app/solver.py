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
IMPROVEMENT_MAX_TIME_SECONDS = 2
SOLVER_NUM_SEARCH_WORKERS = 8
SELLER_DOMINANCE_MAX_DISTINCT_ITEMS = 2


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


def _new_quantity_var(cp_model_instance, *, upper_bound: int, name: str):
    if upper_bound == 1:
        return cp_model_instance.NewBoolVar(name)
    return cp_model_instance.NewIntVar(0, upper_bound, name)


def _new_solver(cp_model, *, max_time_seconds: float | None):
    solver = cp_model.CpSolver()
    if max_time_seconds is not None:
        solver.parameters.max_time_in_seconds = max_time_seconds
    solver.parameters.num_search_workers = SOLVER_NUM_SEARCH_WORKERS
    return solver


def _offer_prune_rank(offer: Offer) -> tuple[float, int, str]:
    return (
        offer.unit_price,
        -offer.available_quantity,
        offer.offer_id,
    )


def _shipping_tier_capacity(
    tier: shipping.ShippingTier, *, use_explicit_weights: bool
) -> int:
    if use_explicit_weights:
        return tier.max_weight_grams
    return _method_card_capacity(tier.max_weight_grams)


def _shipping_tier_dominates(
    existing: tuple[bool, shipping.ShippingTier],
    candidate: tuple[bool, shipping.ShippingTier],
    *,
    use_explicit_weights: bool,
) -> bool:
    existing_is_letter, existing_tier = existing
    candidate_is_letter, candidate_tier = candidate

    if existing_tier.total_price_cents > candidate_tier.total_price_cents:
        return False
    if existing_tier.max_value_cents < candidate_tier.max_value_cents:
        return False
    if _shipping_tier_capacity(
        existing_tier, use_explicit_weights=use_explicit_weights
    ) < _shipping_tier_capacity(
        candidate_tier, use_explicit_weights=use_explicit_weights
    ):
        return False
    if existing_is_letter and not candidate_is_letter:
        return False

    return True


def _prune_dominated_shipping_tiers(
    tier_candidates: list[tuple[bool, shipping.ShippingTier]],
    *,
    use_explicit_weights: bool,
) -> list[tuple[bool, shipping.ShippingTier]]:
    sorted_candidates = sorted(
        tier_candidates,
        key=lambda candidate: (
            candidate[1].total_price_cents,
            -candidate[1].max_value_cents,
            -_shipping_tier_capacity(
                candidate[1], use_explicit_weights=use_explicit_weights
            ),
            candidate[0],
        ),
    )

    kept: list[tuple[bool, shipping.ShippingTier]] = []
    for candidate in sorted_candidates:
        if any(
            _shipping_tier_dominates(
                existing,
                candidate,
                use_explicit_weights=use_explicit_weights,
            )
            for existing in kept
        ):
            continue
        kept.append(candidate)

    return kept


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
        tier_candidates = _prune_dominated_shipping_tiers(
            tier_candidates,
            use_explicit_weights=use_explicit_weights,
        )
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
    seller_item_offers: dict[str, dict[str, list[Offer]]] = defaultdict(
        lambda: defaultdict(list)
    )
    for offer in offers:
        seller_offers[offer.seller_id].append(offer)
        item_offers[offer.item_id].append(offer)
        seller_item_offers[offer.seller_id][offer.item_id].append(offer)

    item_sellers = {
        item_id: {offer.seller_id for offer in bucket_offers}
        for item_id, bucket_offers in item_offers.items()
    }

    seller_country_keys = {
        seller_id: seller.country.strip().casefold()
        for seller_id, seller in seller_map.items()
    }

    prefix_cost_cache: dict[tuple[str, str], list[int]] = {}

    def prefix_costs(seller_id: str, item_id: str) -> list[int]:
        cache_key = (seller_id, item_id)
        if cache_key in prefix_cost_cache:
            return prefix_cost_cache[cache_key]

        running_cost_cents = 0
        prefixes: list[int] = []
        sorted_offers = sorted(
            seller_item_offers[seller_id][item_id],
            key=_offer_prune_rank,
        )
        for item_offer in sorted_offers:
            capped_quantity = _capped_offer_quantity(item_offer, item_map)
            unit_price_cents = _to_cents(item_offer.unit_price)
            for _ in range(capped_quantity):
                running_cost_cents += unit_price_cents
                prefixes.append(running_cost_cents)

        prefix_cost_cache[cache_key] = prefixes
        return prefixes

    def alternative_dominates_subject_items(
        *,
        subject_seller_id: str,
        alternative_seller_id: str,
        item_ids: tuple[str, ...],
    ) -> bool:
        strictly_better = False
        for item_id in item_ids:
            subject_prefixes = prefix_costs(subject_seller_id, item_id)
            alternative_prefixes = prefix_costs(alternative_seller_id, item_id)
            if len(alternative_prefixes) < len(subject_prefixes):
                return False
            for prefix_index, subject_cost_cents in enumerate(subject_prefixes):
                alternative_cost_cents = alternative_prefixes[prefix_index]
                if alternative_cost_cents > subject_cost_cents:
                    return False
                if alternative_cost_cents < subject_cost_cents:
                    strictly_better = True

        return strictly_better or alternative_seller_id < subject_seller_id

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

    for seller_id, item_offer_buckets in seller_item_offers.items():
        if seller_id in dropped_seller_ids:
            continue

        seller_item_ids = tuple(
            sorted(
                item_id
                for item_id, bucket_offers in item_offer_buckets.items()
                if sum(
                    _capped_offer_quantity(offer, item_map) for offer in bucket_offers
                )
                > 0
            )
        )
        if len(seller_item_ids) < 2:
            continue
        if len(seller_item_ids) > SELLER_DOMINANCE_MAX_DISTINCT_ITEMS:
            continue

        candidate_seller_ids: set[str] | None = None
        for item_id in seller_item_ids:
            candidate_bucket = item_sellers.get(item_id, set())
            candidate_seller_ids = (
                set(candidate_bucket)
                if candidate_seller_ids is None
                else candidate_seller_ids & candidate_bucket
            )

        if not candidate_seller_ids:
            continue

        subject_country_key = seller_country_keys[seller_id]
        for alternative_seller_id in sorted(candidate_seller_ids):
            if alternative_seller_id == seller_id:
                continue
            if alternative_seller_id in dropped_seller_ids:
                continue
            if seller_country_keys[alternative_seller_id] != subject_country_key:
                continue
            if not alternative_dominates_subject_items(
                subject_seller_id=seller_id,
                alternative_seller_id=alternative_seller_id,
                item_ids=seller_item_ids,
            ):
                continue

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

    hint_solver = _new_solver(cp_model, max_time_seconds=None)
    status = hint_solver.Solve(hint_model)
    if status != cp_model.OPTIMAL:
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
    seller_shipping_costs = _selected_seller_shipping_costs_cents(
        offer_quantities=offer_quantities,
        offer_by_id=offer_by_id,
        item_map=item_map,
        seller_map=seller_map,
        buyer_country=buyer_country,
        route_book=route_book,
        use_explicit_weights=use_explicit_weights,
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
    item_map: dict[str, WantedItem],
    seller_map: dict[str, object],
    buyer_country: str,
    route_book: shipping.ShippingRouteBook | None,
    use_explicit_weights: bool,
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
            item_map=item_map,
            route_book=route_book,
            use_explicit_weights=use_explicit_weights,
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
    route_book: shipping.ShippingRouteBook | None,
    use_explicit_weights: bool,
) -> tuple[str, dict[str, int]] | None:
    model = cp_model.CpModel()

    offer_vars = {}
    seller_active_vars = {}
    seller_active_exprs = {}
    seller_tier_candidates = {}

    seller_offers = defaultdict(list)
    for offer in usable_offers:
        seller_offers[offer.seller_id].append(offer)
        capped_quantity = _capped_offer_quantity(offer, item_map)
        offer_vars[offer.offer_id] = _new_quantity_var(
            model,
            upper_bound=capped_quantity,
            name=f"qty_{offer.offer_id}",
        )

    use_rich_shipping = route_book is not None
    for seller_id in seller_offers:
        route_tiers = shipping.ShippingRouteTiers(letter_tiers=(), parcel_tiers=())
        if use_rich_shipping and route_book is not None:
            route_tiers = route_book.lookup_tiers(
                seller_country=seller_map[seller_id].country,
                buyer_country=request.buyer_country,
            )

        tier_candidates = [(True, tier) for tier in route_tiers.letter_tiers] + [
            (False, tier) for tier in route_tiers.parcel_tiers
        ]
        tier_candidates = _prune_dominated_shipping_tiers(
            tier_candidates,
            use_explicit_weights=use_explicit_weights,
        )
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

    for seller_id, offers in seller_offers.items():
        active = seller_active_exprs.get(seller_id)
        tier_candidates = seller_tier_candidates[seller_id]

        if tier_candidates:
            total_value_expr = sum(
                _to_cents(offer.unit_price) * offer_vars[offer.offer_id]
                for offer in offers
            )
            total_weight_expr = sum(
                (item_map[offer.item_id].unit_weight_grams or 0)
                * offer_vars[offer.offer_id]
                for offer in offers
            )
            total_card_expr = sum(
                item_map[offer.item_id].cards_per_unit * offer_vars[offer.offer_id]
                for offer in offers
            )
            parcel_only_units_expr = sum(
                offer_vars[offer.offer_id]
                for offer in offers
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

        fallback_cost = MISSING_ROUTE_DATA_PENALTY_CENTS
        if not use_rich_shipping:
            fallback_cost = shipping.legacy_shipping_cost_cents(
                seller_country=seller_map[seller_id].country,
                buyer_country=request.buyer_country,
            )
        objective_terms.append(fallback_cost * active)

    for seller_id, offers in seller_offers.items():
        active = seller_active_exprs[seller_id]
        total_units = sum(offer_vars[offer.offer_id] for offer in offers)
        max_units = sum(_capped_offer_quantity(offer, item_map) for offer in offers)
        model.Add(total_units <= max_units * active)
        model.Add(total_units >= active)

    if request.preferences.max_sellers is not None:
        model.Add(sum(seller_active_exprs.values()) <= request.preferences.max_sellers)

    warm_start_offer_values, _ = _build_route_min_shipping_warm_start(
        cp_model=cp_model,
        request=request,
        usable_offers=usable_offers,
        item_map=item_map,
        seller_map=seller_map,
        route_book=route_book,
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
            item_map=item_map,
            seller_map=seller_map,
            buyer_country=request.buyer_country,
            route_book=route_book,
            use_explicit_weights=use_explicit_weights,
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
    return solution_status, selected_offer_quantities


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
        offer_vars[offer.offer_id] = _new_quantity_var(
            model,
            upper_bound=capped_quantity,
            name=f"qty_{offer.offer_id}",
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

    objective_terms = []
    for offer in usable_offers:
        objective_terms.append(_to_cents(offer.unit_price) * offer_vars[offer.offer_id])

    use_rich_shipping = route_book is not None
    for seller_id in seller_offers:
        objective_terms.append(
            shipping.minimum_shipping_cost_cents(
                seller_country=seller_map[seller_id].country,
                buyer_country=request.buyer_country,
                route_book=route_book,
                missing_route_cost_cents=MISSING_ROUTE_DATA_PENALTY_CENTS,
            )
            * seller_active_vars[seller_id]
        )

    for seller_id, offers in seller_offers.items():
        active = seller_active_vars[seller_id]
        total_units = sum(offer_vars[offer.offer_id] for offer in offers)
        max_units = sum(_capped_offer_quantity(offer, item_map) for offer in offers)
        model.Add(total_units <= max_units * active)
        model.Add(total_units >= active)

    if request.preferences.max_sellers is not None:
        model.Add(sum(seller_active_vars.values()) <= request.preferences.max_sellers)

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

    solver = _new_solver(cp_model, max_time_seconds=IMPROVEMENT_MAX_TIME_SECONDS)
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
    used_exact_fallback = False

    allocations = []
    cart_items_by_seller = defaultdict(list)
    seller_item_subtotals = defaultdict(int)
    seller_unit_totals = defaultdict(int)
    selected_offer_quantities = {
        offer.offer_id: solver.Value(offer_vars[offer.offer_id])
        for offer in usable_offers
        if solver.Value(offer_vars[offer.offer_id]) > 0
    }

    seller_shipping_totals = _selected_seller_shipping_costs_cents(
        offer_quantities=selected_offer_quantities,
        offer_by_id={offer.offer_id: offer for offer in usable_offers},
        item_map=item_map,
        seller_map=seller_map,
        buyer_country=request.buyer_country,
        route_book=route_book,
        use_explicit_weights=use_explicit_weights,
    )
    if seller_shipping_totals is None:
        fallback_solution = _solve_exact_shipping_order(
            cp_model=cp_model,
            request=request,
            usable_offers=usable_offers,
            item_map=item_map,
            seller_map=seller_map,
            route_book=route_book,
            use_explicit_weights=use_explicit_weights,
        )
        if fallback_solution is None:
            return OptimizationResponse(
                status="infeasible",
                currency=request.currency,
                totals=OptimizationTotals(
                    item_subtotal=0, shipping_total=0, grand_total=0
                ),
                cart=OptimizationCart(),
                notes=[
                    "Approximate solver selected an allocation without any valid exact shipping tier.",
                    "Exact-shipping fallback also found no feasible solution.",
                ],
            )

        solution_status, selected_offer_quantities = fallback_solution
        seller_shipping_totals = _selected_seller_shipping_costs_cents(
            offer_quantities=selected_offer_quantities,
            offer_by_id={offer.offer_id: offer for offer in usable_offers},
            item_map=item_map,
            seller_map=seller_map,
            buyer_country=request.buyer_country,
            route_book=route_book,
            use_explicit_weights=use_explicit_weights,
        )
        used_exact_fallback = True

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
    if use_rich_shipping:
        if used_exact_fallback:
            notes.append(
                "Approximate shipping solve produced invalid exact route fit; solver reran with exact shipping constraints for final allocation."
            )
        else:
            notes.append(
                "Solve objective uses cheapest per-route shipping lower bound; returned totals recompute exact imported shipping tiers for chosen allocations."
            )
        if use_explicit_weights:
            notes.append(
                "Exact returned shipping costs use selected item value, summed item weight, and parcel-only item flags."
            )
        else:
            notes.append(
                "Exact returned shipping costs use selected item value, card-count letter thresholds (4/17/40 cards), and parcel-only item flags."
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
