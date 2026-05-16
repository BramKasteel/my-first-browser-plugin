from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

DEFAULT_ORDER_SHIPPING_EUR = 1.0
LEGACY_ROUTE_SHIPPING_EUR = {
    ("germany", "netherlands"): 1.55,
    ("netherlands", "netherlands"): 1.70,
}
SHIPPING_DATA_PATH = Path(__file__).with_name("data") / "shipping_costs.json"


def normalize_country_name(country: str) -> str:
    return country.strip().casefold()


def parse_eur_to_cents(amount: str) -> int:
    numeric_match = re.search(r"\d[\d.,\s]*", amount)
    if numeric_match is None:
        raise ValueError("Empty EUR amount")

    normalized = numeric_match.group(0).replace(" ", "").strip()
    if not normalized:
        raise ValueError("Empty EUR amount")

    last_dot = normalized.rfind(".")
    last_comma = normalized.rfind(",")
    if last_dot != -1 and last_comma != -1:
        decimal_separator = "." if last_dot > last_comma else ","
    elif last_dot != -1:
        decimal_separator = "." if len(normalized) - last_dot - 1 == 2 else None
    elif last_comma != -1:
        decimal_separator = "," if len(normalized) - last_comma - 1 == 2 else None
    else:
        decimal_separator = None

    if decimal_separator == ".":
        normalized = normalized.replace(",", "")
    elif decimal_separator == ",":
        normalized = normalized.replace(".", "")
        normalized = normalized.replace(",", ".")
    else:
        normalized = normalized.replace(".", "").replace(",", "")

    return int(round(float(normalized) * 100))


def cents_to_eur(amount: int) -> float:
    return round(amount / 100, 2)


@dataclass(frozen=True)
class ShippingMethod:
    name: str
    is_tracked: bool
    max_value_cents: int
    max_weight_grams: int
    stamp_price_cents: int
    total_price_cents: int
    is_letter: bool
    is_virtual: bool


@dataclass(frozen=True)
class ShippingRouteBook:
    country_ids: dict[str, int]
    methods_by_route: dict[tuple[str, str], tuple[ShippingMethod, ...]]

    def lookup_country_id(self, country: str) -> int | None:
        return self.country_ids.get(normalize_country_name(country))

    def lookup_methods(
        self, *, seller_country: str, buyer_country: str
    ) -> tuple[ShippingMethod, ...]:
        return self.methods_by_route.get(
            (
                normalize_country_name(seller_country),
                normalize_country_name(buyer_country),
            ),
            (),
        )


def _route_key(from_country: str, to_country: str) -> tuple[str, str]:
    return normalize_country_name(from_country), normalize_country_name(to_country)


def _load_shipping_route_book(path: Path) -> ShippingRouteBook:
    payload = json.loads(path.read_text(encoding="utf-8"))

    country_ids = {
        normalize_country_name(country["name"]): int(country["externalId"])
        for country in payload.get("countries", [])
        if country.get("externalId") not in (None, 0) and country.get("name")
    }

    methods_by_route: dict[tuple[str, str], tuple[ShippingMethod, ...]] = {}
    for route in payload.get("routes", []):
        from_country = route["from_country"]
        to_country = route["to_country"]
        methods = tuple(
            ShippingMethod(
                name=method["name"],
                is_tracked=bool(method["isTracked"]),
                max_value_cents=parse_eur_to_cents(method["maxValue"]),
                max_weight_grams=int(method["maxWeight"]),
                stamp_price_cents=parse_eur_to_cents(method["stampPrice"]),
                total_price_cents=parse_eur_to_cents(method["price"]),
                is_letter=bool(method["isLetter"]),
                is_virtual=bool(method["isVirtual"]),
            )
            for method in route.get("methods", [])
        )
        methods_by_route[_route_key(from_country, to_country)] = methods

    return ShippingRouteBook(country_ids=country_ids, methods_by_route=methods_by_route)


@lru_cache(maxsize=1)
def load_shipping_route_book() -> ShippingRouteBook | None:
    if not SHIPPING_DATA_PATH.is_file():
        return None
    return _load_shipping_route_book(SHIPPING_DATA_PATH)


def legacy_shipping_cost_cents(*, seller_country: str, buyer_country: str) -> int:
    route_amount = LEGACY_ROUTE_SHIPPING_EUR.get(
        _route_key(seller_country, buyer_country),
        DEFAULT_ORDER_SHIPPING_EUR,
    )
    return int(round(route_amount * 100))
