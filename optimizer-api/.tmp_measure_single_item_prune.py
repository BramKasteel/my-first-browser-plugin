import json
import time
from pathlib import Path

from app import shipping
from app.models import OptimizationRequest
from app.solver import (
    _has_explicit_item_weights,
    _prune_dominated_offers,
    _prune_dominated_single_item_sellers,
    optimize_order,
)
from ortools.sat.python import cp_model

FIXTURE_PATH = Path("tests/fixtures/requests/big_list.json")
STATUS_MAP = {
    cp_model.OPTIMAL: "OPTIMAL",
    cp_model.FEASIBLE: "FEASIBLE",
    cp_model.INFEASIBLE: "INFEASIBLE",
    cp_model.MODEL_INVALID: "MODEL_INVALID",
    cp_model.UNKNOWN: "UNKNOWN",
}


def run_case(request: OptimizationRequest, time_limit_seconds: float) -> dict:
    original_solve = cp_model.CpSolver.Solve
    stats: dict[str, object] = {}

    def wrapped_solve(self, model, *args, **kwargs):
        self.parameters.max_time_in_seconds = time_limit_seconds
        proto = model.Proto()
        stats["total_vars"] = len(proto.variables)
        stats["constraints"] = len(proto.constraints)
        start = time.perf_counter()
        result = original_solve(self, model, *args, **kwargs)
        stats["solve_seconds"] = time.perf_counter() - start
        stats["wall_time_seconds"] = self.WallTime()
        stats["cp_sat_status"] = STATUS_MAP.get(result, str(result))
        stats["best_objective_bound"] = self.BestObjectiveBound()
        return result

    cp_model.CpSolver.Solve = wrapped_solve
    try:
        start = time.perf_counter()
        response = optimize_order(request)
        stats["end_to_end_seconds"] = time.perf_counter() - start
        stats["response_status"] = response.status
        stats["grand_total"] = response.totals.grand_total
        stats["chosen_sellers"] = len(response.chosen_sellers)
    finally:
        cp_model.CpSolver.Solve = original_solve

    return stats


def main() -> None:
    payload = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    request = OptimizationRequest.model_validate(payload)
    item_map = {item.item_id: item for item in request.items}
    seller_map = {seller.seller_id: seller for seller in request.sellers}

    filtered_offers = list(request.offers)
    pruned_offers = _prune_dominated_offers(filtered_offers, item_map)
    route_book = shipping.load_shipping_route_book()
    single_item_pruned_offers = _prune_dominated_single_item_sellers(
        offers=pruned_offers,
        item_map=item_map,
        seller_map=seller_map,
        buyer_country=request.buyer_country,
        route_book=route_book,
        use_explicit_weights=_has_explicit_item_weights(request),
    )

    sellers_after_offer_prune = len({offer.seller_id for offer in pruned_offers})
    sellers_after_single_item_prune = len(
        {offer.seller_id for offer in single_item_pruned_offers}
    )
    offers_after_offer_prune = len(pruned_offers)
    offers_after_single_item_prune = len(single_item_pruned_offers)

    baseline = run_case(request, 10)
    longer = run_case(request, 60)

    print(f"fixture={FIXTURE_PATH.name}")
    print(f"offers_after_offer_prune={offers_after_offer_prune}")
    print(f"offers_after_single_item_prune={offers_after_single_item_prune}")
    print(f"sellers_after_offer_prune={sellers_after_offer_prune}")
    print(f"sellers_after_single_item_prune={sellers_after_single_item_prune}")
    print(
        f"dropped_sellers={sellers_after_offer_prune - sellers_after_single_item_prune}"
    )
    print("baseline_time_limit_seconds=10")
    for key in (
        "response_status",
        "cp_sat_status",
        "total_vars",
        "constraints",
        "solve_seconds",
        "wall_time_seconds",
        "end_to_end_seconds",
        "grand_total",
        "best_objective_bound",
        "chosen_sellers",
    ):
        print(f"baseline_{key}={baseline.get(key)}")
    print("longer_time_limit_seconds=60")
    for key in (
        "response_status",
        "cp_sat_status",
        "total_vars",
        "constraints",
        "solve_seconds",
        "wall_time_seconds",
        "end_to_end_seconds",
        "grand_total",
        "best_objective_bound",
        "chosen_sellers",
    ):
        print(f"longer_{key}={longer.get(key)}")


if __name__ == "__main__":
    main()
