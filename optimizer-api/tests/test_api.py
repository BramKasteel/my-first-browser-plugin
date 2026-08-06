from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from unittest.mock import patch

import pytest
from app.main import app
from app.models import OptimizationRequest
from app.request_archive import ArchiveResult
from app.solver import SOLVER_ABSOLUTE_GAP_LIMIT, optimize_order, prune_all
from fastapi.testclient import TestClient
from ortools.sat.python import cp_model

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_REQUESTS_DIR = ROOT / "tests" / "fixtures" / "requests"

EXPECTED_FIXTURE_RESULTS = {
    "igor_peasant": {
        "allowed_statuses": {"optimal", "feasible"},
    },
    "ob_nixilis_improvements": {
        "allowed_statuses": {"optimal", "feasible"},
        "grand_total": 15.17,
        "allocation_count": 17,
    },
    "small_wantslist": {
        "allowed_statuses": {"optimal", "feasible"},
        "grand_total": 5.38,
        "allocation_count": 2,
    },
}

EXPECTED_FIXTURE_MODEL_SIZES = {
    "big_list": {
        "exact": {"variables": 20685, "constraints": 25000},
    },
    "ob_nixilis_improvements": {
        "exact": {"variables": 5001, "constraints": 7400},
    },
    "small_wantslist": {
        "exact": {"variables": 943, "constraints": 2500},
    },
}

MONEY_TOLERANCE = SOLVER_ABSOLUTE_GAP_LIMIT / 100


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def real_request_fixture_paths() -> list[Path]:
    return sorted(FIXTURE_REQUESTS_DIR.glob("*.json"))


def model_sizes_for_request(request: OptimizationRequest) -> dict[str, dict[str, int]]:
    captures: list[dict[str, int]] = []
    original_solve = cp_model.CpSolver.Solve

    def wrapped_solve(self, model, *args, **kwargs):
        proto = model.Proto()
        captures.append(
            {
                "variables": len(proto.variables),
                "constraints": len(proto.constraints),
            }
        )
        return original_solve(self, model, *args, **kwargs)

    with patch.object(cp_model.CpSolver, "Solve", wrapped_solve):
        optimize_order(request)

    return {"exact": captures[0]}


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def minimal_payload() -> dict:
    return {
        "buyer_country": "Netherlands",
        "currency": "EUR",
        "items": [
            {
                "item_id": "want-1",
                "name": "Card A",
                "quantity": 1,
                "min_condition": "NM",
                "preferred_languages": ["English"],
            }
        ],
        "sellers": [
            {"seller_id": "seller-1", "name": "Seller 1", "country": "Germany"},
        ],
        "offers": [
            {
                "offer_id": "offer-1",
                "item_id": "want-1",
                "seller_id": "seller-1",
                "unit_price": 1.0,
                "available_quantity": 1,
            },
        ],
    }


def test_health(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_optimize_accepts_optional_search_metadata(client: TestClient) -> None:
    payload = minimal_payload()
    payload["search_metadata"] = {
        "username": "bram",
        "want_list_id": "1234",
        "wanted_items": [
            {
                "item_id": "want-1",
                "name": "Card A",
                "quantity": 1,
                "language": "English",
                "min_condition": "NM",
                "expansion": "Foundations",
                "is_foil": False,
            }
        ],
        "filters": {
            "buyer_country": "Netherlands",
            "seller_countries": ["Germany"],
            "seller_type": "professional",
            "delivery_type": "7_days",
            "seller_reputation": "outstanding",
            "include_bargain_countries": True,
            "additional_filters": ["include_bargain_countries"],
        },
    }

    response = client.post("/optimize", json=payload)

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] in {"optimal", "feasible"}
    assert set(body.keys()) == {
        "status",
        "currency",
        "totals",
        "chosen_sellers",
        "allocations",
        "cart",
        "notes",
    }


def test_optimize_logs_summary_and_archives_old_payload(client: TestClient) -> None:
    payload = minimal_payload()

    with (
        patch("app.main.archive_writer.write_run_artifacts") as archive_mock,
        patch("app.main.summary_logger.info") as log_mock,
    ):
        archive_mock.return_value = ArchiveResult(
            enabled=False,
            compatibility_mode=True,
            prefix="20260806T120000Z_anonymous",
            search_key="20260806T120000Z_anonymous/search.json",
            optimizer_log_key="20260806T120000Z_anonymous/optimizer_log.txt",
        )

        response = client.post("/optimize", json=payload)

    assert response.status_code == 200, response.text
    archive_mock.assert_called_once()
    log_mock.assert_called_once()

    summary_payload = json.loads(log_mock.call_args.args[0])
    assert summary_payload["event"] == "optimizer_run_summary"
    assert summary_payload["compatibility_mode"] is True
    assert summary_payload["archive_prefix"] == "20260806T120000Z_anonymous"
    assert summary_payload["optimizer_status"] in {"optimal", "feasible"}


@pytest.mark.parametrize(
    "fixture_path", real_request_fixture_paths(), ids=lambda path: path.stem
)
@pytest.mark.fixture_case
def test_pruning_sellers_with_single_item(fixture_path: Path) -> None:
    payload = load_json(fixture_path)
    request = OptimizationRequest.model_validate(payload)

    usable_offers = prune_all(request=request)
    inspect = defaultdict(int)
    for offer in usable_offers:
        inspect[offer.item_id] += offer.available_quantity

    for wanted_item in request.items:
        assert inspect[wanted_item.item_id] >= wanted_item.quantity


@pytest.mark.parametrize(
    "fixture_path", real_request_fixture_paths(), ids=lambda path: path.stem
)
@pytest.mark.fixture_case
def test_pruning_offers_by_quantity(fixture_path: Path) -> None:
    payload = load_json(fixture_path)
    request = OptimizationRequest.model_validate(payload)

    usable_offers = prune_all(request=request)
    inspect = defaultdict(lambda: defaultdict(list))
    for offer in usable_offers:
        inspect[offer.seller_id][offer.item_id].append(offer)

    for seller, items in inspect.items():
        for item, offers in items.items():
            available_quantity = sum(offer.available_quantity for offer in offers)
            if available_quantity > request.item_map()[item].quantity:
                raise ValueError(
                    "Per seller we only need to keep at most the wanted amount of items"
                )


@pytest.mark.parametrize(
    "fixture_path", real_request_fixture_paths(), ids=lambda path: path.stem
)
@pytest.mark.fixture_case
def test_real_request_fixtures_acceptance(
    client: TestClient, fixture_path: Path
) -> None:
    payload = load_json(fixture_path)

    response = client.post("/optimize", json=payload)

    assert response.status_code == 200, response.text

    body = response.json()
    assert body["status"] in {"optimal", "feasible", "infeasible"}
    assert set(body.keys()) == {
        "status",
        "currency",
        "totals",
        "chosen_sellers",
        "allocations",
        "cart",
        "notes",
    }
    assert body["currency"] == payload.get("currency", "EUR")
    assert set(body["cart"].keys()) == {"sellers", "total_sellers", "total_units"}
    assert body["cart"]["total_sellers"] == len(body["cart"]["sellers"])
    assert body["cart"]["total_units"] == sum(
        allocation["quantity"] for allocation in body["allocations"]
    )

    expected = EXPECTED_FIXTURE_RESULTS.get(fixture_path.stem)
    if expected:
        if "allowed_statuses" in expected:
            assert body["status"] in expected["allowed_statuses"]
        if "grand_total" in expected:
            assert body["totals"]["grand_total"] == pytest.approx(
                expected["grand_total"], abs=MONEY_TOLERANCE
            )
        if "allocation_count" in expected:
            assert len(body["allocations"]) == expected["allocation_count"]


@pytest.mark.parametrize(
    "fixture_path", real_request_fixture_paths(), ids=lambda path: path.stem
)
@pytest.mark.fixture_case
def test_real_request_fixture_exact_model_size_ceiling(fixture_path: Path) -> None:
    if fixture_path.stem not in EXPECTED_FIXTURE_MODEL_SIZES:
        pytest.skip(f"No expected model sizes for {fixture_path.stem}")

    payload = load_json(fixture_path)
    request = OptimizationRequest.model_validate(payload)

    actual = model_sizes_for_request(request)["exact"]
    expected = EXPECTED_FIXTURE_MODEL_SIZES[fixture_path.stem]["exact"]

    assert actual["variables"] <= expected["variables"], (
        f"Exact variables grew for {fixture_path.stem}: "
        f"{actual['variables']} > {expected['variables']}"
    )
    assert actual["constraints"] <= expected["constraints"], (
        f"Exact constraints grew for {fixture_path.stem}: "
        f"{actual['constraints']} > {expected['constraints']}"
    )


def test_optimize_rejects_duplicate_ids(client: TestClient) -> None:
    payload = {
        "buyer_country": "Netherlands",
        "currency": "EUR",
        "items": [
            {"item_id": "want-1", "name": "Card A", "quantity": 1},
            {"item_id": "want-1", "name": "Card B", "quantity": 1},
        ],
        "sellers": [
            {"seller_id": "seller-1", "name": "Seller 1", "country": "Germany"},
        ],
        "offers": [
            {
                "offer_id": "offer-1",
                "item_id": "want-1",
                "seller_id": "seller-1",
                "unit_price": 1.0,
                "available_quantity": 1,
            },
        ],
    }

    response = client.post("/optimize", json=payload)

    assert response.status_code == 422
    assert "Duplicate item IDs" in response.text


def test_optimize_rejects_too_many_items(client: TestClient) -> None:
    items = [
        {"item_id": f"want-{index}", "name": f"Card {index}", "quantity": 1}
        for index in range(501)
    ]
    payload = {
        "buyer_country": "Netherlands",
        "currency": "EUR",
        "items": items,
        "sellers": [
            {"seller_id": "seller-1", "name": "Seller 1", "country": "Germany"},
        ],
        "offers": [
            {
                "offer_id": "offer-1",
                "item_id": "want-0",
                "seller_id": "seller-1",
                "unit_price": 1.0,
                "available_quantity": 1,
            },
        ],
    }

    response = client.post("/optimize", json=payload)

    assert response.status_code == 422
    assert "items" in response.text
