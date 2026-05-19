import json
from collections import defaultdict
from pathlib import Path
from statistics import median
from time import perf_counter

from app import solver as solver_mod
from app.models import OptimizationRequest
from ortools.sat.python import cp_model

FIXTURE_PATH = Path("tests/fixtures/requests/big_list.json")

payload = json.loads(FIXTURE_PATH.read_text())
request = OptimizationRequest.model_validate(payload)


def prepare_request(req):
    seller_map = {seller.seller_id: seller for seller in req.sellers}
    item_map = {item.item_id: item for item in req.items}

    allowed_countries = set(
        country.strip().casefold()
        for country in req.preferences.allowed_countries
        if country.strip()
    )
    blocked_sellers = set(req.preferences.blocked_seller_ids)

    usable_offers = []
    for offer in req.offers:
        seller = seller_map[offer.seller_id]
        seller_country = seller.country.strip().casefold()
        if offer.seller_id in blocked_sellers:
            continue
        if allowed_countries and seller_country not in allowed_countries:
            continue
        usable_offers.append(offer)

    usable_offers = solver_mod._prune_dominated_offers(usable_offers, item_map)

    route_book = solver_mod.shipping.load_shipping_route_book()
    use_explicit_weights = solver_mod._has_explicit_item_weights(req)
    usable_offers = solver_mod._prune_dominated_single_item_sellers(
        offers=usable_offers,
        item_map=item_map,
        seller_map=seller_map,
        buyer_country=req.buyer_country,
        route_book=route_book,
        use_explicit_weights=use_explicit_weights,
    )

    coverage = defaultdict(int)
    for offer in usable_offers:
        coverage[offer.item_id] += offer.available_quantity

    uncovered_items = [
        item.name for item in req.items if coverage[item.item_id] < item.quantity
    ]
    if uncovered_items:
        raise RuntimeError(f"uncovered items: {uncovered_items}")

    return seller_map, item_map, usable_offers, route_book


def warm_start_once(max_time_seconds):
    seller_map, item_map, usable_offers, route_book = prepare_request(request)

    hint_model = cp_model.CpModel()
    hint_offer_vars = {}
    hint_seller_active_vars = {}
    seller_offers = defaultdict(list)

    for offer in usable_offers:
        seller_offers[offer.seller_id].append(offer)
        capped_quantity = solver_mod._capped_offer_quantity(offer, item_map)
        hint_offer_vars[offer.offer_id] = solver_mod._new_quantity_var(
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
        max_units = sum(
            solver_mod._capped_offer_quantity(offer, item_map) for offer in offers
        )
        hint_model.Add(total_units <= max_units * active)
        hint_model.Add(total_units >= active)

    if request.preferences.max_sellers is not None:
        hint_model.Add(
            sum(hint_seller_active_vars.values()) <= request.preferences.max_sellers
        )

    hint_model.Minimize(
        sum(
            solver_mod._to_cents(offer.unit_price) * hint_offer_vars[offer.offer_id]
            for offer in usable_offers
        )
        + sum(
            solver_mod.shipping.minimum_shipping_cost_cents(
                seller_country=seller_map[seller_id].country,
                buyer_country=request.buyer_country,
                route_book=route_book,
                missing_route_cost_cents=solver_mod.MISSING_ROUTE_DATA_PENALTY_CENTS,
            )
            * hint_seller_active_vars[seller_id]
            for seller_id in seller_offers
        )
    )

    solver = solver_mod._new_solver(cp_model, max_time_seconds=max_time_seconds)
    started = perf_counter()
    status = solver.Solve(hint_model)
    elapsed = perf_counter() - started
    status_name = {
        cp_model.OPTIMAL: "optimal",
        cp_model.FEASIBLE: "feasible",
        cp_model.INFEASIBLE: "infeasible",
        cp_model.MODEL_INVALID: "model_invalid",
        cp_model.UNKNOWN: "unknown",
    }.get(status, str(status))

    result = {
        "limit_seconds": max_time_seconds,
        "elapsed_seconds": round(elapsed, 3),
        "wall_time_seconds": round(solver.WallTime(), 3),
        "status": status_name,
    }
    if status in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        result["objective_value"] = round(solver.ObjectiveValue(), 2)
        result["selected_offer_count"] = sum(
            1 for var in hint_offer_vars.values() if solver.Value(var) > 0
        )
        result["selected_seller_count"] = sum(
            1 for var in hint_seller_active_vars.values() if solver.Value(var) > 0
        )
    return result


def timed_optimize(warm_limit, improve_limit, repeats=1):
    original_warm = solver_mod.WARM_START_MAX_TIME_SECONDS
    original_improve = solver_mod.IMPROVEMENT_MAX_TIME_SECONDS
    runs = []
    try:
        solver_mod.WARM_START_MAX_TIME_SECONDS = warm_limit
        solver_mod.IMPROVEMENT_MAX_TIME_SECONDS = improve_limit
        for _ in range(repeats):
            started = perf_counter()
            response = solver_mod.optimize_order(request)
            elapsed = perf_counter() - started
            runs.append(
                {
                    "elapsed_seconds": elapsed,
                    "status": response.status,
                    "totals": response.totals.model_dump(),
                    "notes": response.notes,
                    "seller_count": response.cart.total_sellers,
                    "allocation_count": len(response.allocations),
                }
            )
    finally:
        solver_mod.WARM_START_MAX_TIME_SECONDS = original_warm
        solver_mod.IMPROVEMENT_MAX_TIME_SECONDS = original_improve

    elapsed_values = [run["elapsed_seconds"] for run in runs]
    sample = runs[-1]
    return {
        "warm_limit_seconds": warm_limit,
        "improve_limit_seconds": improve_limit,
        "repeats": repeats,
        "median_elapsed_seconds": round(median(elapsed_values), 3),
        "min_elapsed_seconds": round(min(elapsed_values), 3),
        "max_elapsed_seconds": round(max(elapsed_values), 3),
        "status": sample["status"],
        "totals": sample["totals"],
        "seller_count": sample["seller_count"],
        "allocation_count": sample["allocation_count"],
        "notes": sample["notes"],
    }


result = {
    "fixture": FIXTURE_PATH.name,
    "counts": {
        "items": len(request.items),
        "sellers": len(request.sellers),
        "offers": len(request.offers),
    },
    "warm_start": {
        "current_2s_limit": warm_start_once(2),
        "uncapped": warm_start_once(None),
    },
    "full_optimize": {
        "current_2_plus_2": timed_optimize(2, 2, repeats=3),
        "uncapped": timed_optimize(None, None, repeats=1),
    },
}
print(json.dumps(result, indent=2))
