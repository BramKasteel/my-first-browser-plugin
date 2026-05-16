from __future__ import annotations

import logging

from app.import_shipping_costs import build_shipping_snapshot


def test_build_shipping_snapshot_logs_route_progress(monkeypatch, caplog) -> None:
    monkeypatch.setattr(
        "app.import_shipping_costs._fetch_countries",
        lambda locale: [
            {"name": "Germany", "externalId": 7},
            {"name": "Netherlands", "externalId": 23},
        ],
    )
    monkeypatch.setattr(
        "app.import_shipping_costs._fetch_route_methods",
        lambda **kwargs: [{"name": "Letter"}],
    )
    monkeypatch.setattr("app.import_shipping_costs.sleep", lambda seconds: None)

    with caplog.at_level(logging.INFO):
        snapshot = build_shipping_snapshot(
            locale="en",
            delay_seconds=0,
            from_country_filters={"germany"},
            to_country_filters={"netherlands"},
        )

    assert len(snapshot["routes"]) == 1
    assert (
        "Import starting: 1 sender countries x 1 receiver countries = 1 routes"
        in caplog.text
    )
    assert "Route 1/1: Germany -> Netherlands" in caplog.text
    assert "Route 1/1 done: Germany -> Netherlands (1 methods)" in caplog.text
