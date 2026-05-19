from __future__ import annotations

import json
from pathlib import Path

import pytest
from app.main import app
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_REQUESTS_DIR = ROOT / "tests" / "fixtures" / "requests"

EXPECTED_FIXTURE_RESULTS = {
    "ob_nixilis_improvements": {
        "allowed_statuses": {"optimal", "feasible"},
        "max_totals": {
            "item_subtotal": 8.87,
            "shipping_total": 9.3,
            "grand_total": 18.17,
        },
        "allocation_count": 17,
    },
    "small_wantslist": {
        "status": "optimal",
        "totals": {
            "item_subtotal": 2.28,
            "shipping_total": 3.1,
            "grand_total": 5.38,
        },
        "chosen_seller_profiles": [
            {
                "item_subtotal": 1.98,
                "shipping_cost": 1.55,
                "total_units": 2,
            },
            {
                "item_subtotal": 0.3,
                "shipping_cost": 1.55,
                "total_units": 3,
            },
        ],
        "allocation_count": 2,
    },
}


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def real_request_fixture_paths() -> list[Path]:
    return sorted(FIXTURE_REQUESTS_DIR.glob("*.json"))


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_health(client: TestClient) -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


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
        if "status" in expected:
            assert body["status"] == expected["status"]
        if "allowed_statuses" in expected:
            assert body["status"] in expected["allowed_statuses"]
        if "totals" in expected:
            assert body["totals"] == expected["totals"]
        if "max_totals" in expected:
            for key, max_value in expected["max_totals"].items():
                assert body["totals"][key] <= max_value
        if "chosen_sellers" in expected:
            assert body["chosen_sellers"] == expected["chosen_sellers"]
        if "chosen_seller_profiles" in expected:
            actual_profiles = [
                {
                    "item_subtotal": seller["item_subtotal"],
                    "shipping_cost": seller["shipping_cost"],
                    "total_units": seller["total_units"],
                }
                for seller in body["chosen_sellers"]
            ]
            assert sorted(actual_profiles, key=lambda seller: seller["item_subtotal"]) == sorted(
                expected["chosen_seller_profiles"],
                key=lambda seller: seller["item_subtotal"],
            )
        assert len(body["allocations"]) == expected["allocation_count"]
        expected_seller_count = len(
            expected.get(
                "chosen_sellers",
                expected.get("chosen_seller_profiles", body["chosen_sellers"]),
            )
        )
        assert body["cart"]["total_sellers"] == expected_seller_count


def test_real_request_fixture_directory_exists() -> None:
    assert FIXTURE_REQUESTS_DIR.is_dir()


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
