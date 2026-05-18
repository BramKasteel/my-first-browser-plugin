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
        "status": "optimal",
        "totals": {
            "item_subtotal": 7.12,
            "shipping_total": 8.05,
            "grand_total": 15.17,
        },
        "chosen_sellers": [
            {
                "seller_id": "Command-Signet",
                "item_subtotal": 2.84,
                "shipping_cost": 1.55,
                "total_units": 4,
            },
            {
                "seller_id": "Quelharoka",
                "item_subtotal": 1.75,
                "shipping_cost": 1.55,
                "total_units": 3,
            },
            {
                "seller_id": "The-Archivist",
                "item_subtotal": 0.4,
                "shipping_cost": 1.7,
                "total_units": 4,
            },
            {
                "seller_id": "Zarthor",
                "item_subtotal": 2.05,
                "shipping_cost": 1.7,
                "total_units": 3,
            },
            {
                "seller_id": "amdfrk",
                "item_subtotal": 0.08,
                "shipping_cost": 1.55,
                "total_units": 3,
            },
        ],
        "allocation_count": 17,
    },
    "small_wantslist": {
        "status": "optimal",
        "totals": {
            "item_subtotal": 2.28,
            "shipping_total": 3.1,
            "grand_total": 5.38,
        },
        "chosen_sellers": [
            {
                "seller_id": "Devotion2Cards",
                "item_subtotal": 0.3,
                "shipping_cost": 1.55,
                "total_units": 3,
            },
            {
                "seller_id": "HallofGames",
                "item_subtotal": 1.98,
                "shipping_cost": 1.55,
                "total_units": 2,
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
        assert body["status"] == expected["status"]
        assert body["totals"] == expected["totals"]
        assert body["chosen_sellers"] == expected["chosen_sellers"]
        assert len(body["allocations"]) == expected["allocation_count"]
        assert body["cart"]["total_sellers"] == len(expected["chosen_sellers"])


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
