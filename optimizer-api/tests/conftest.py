from __future__ import annotations


def pytest_configure(config) -> None:
    config.addinivalue_line(
        "markers",
        "fixture_case: test uses JSON payload fixture from tests/fixtures/requests",
    )
