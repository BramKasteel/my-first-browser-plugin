from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

DEFAULT_ORDER_SHIPPING_EUR = 1.0
LEGACY_ROUTE_SHIPPING_EUR = {
    ("germany", "netherlands"): 1.55,
    ("netherlands", "netherlands"): 1.70,
}
SHIPPING_DATA_PATH = Path(__file__).with_name("data") / "shipping_costs.json"
CARD_ORDER_MAX_WEIGHT_GRAMS = 1_000
LETTER_CARD_LIMITS = ((20, 4), (50, 17), (100, 40))
APPROX_GRAMS_PER_CARD = 2.5


def _is_estimation_method(name: str) -> bool:
    return "SHIPPING COST ESTIMATION" in name.upper()


def _is_card_order_excluded_method(name: str) -> bool:
    normalized = name.upper()
    return any(
        token in normalized
        for token in (
            "SHIPPING COST ESTIMATION",
            "INSURANCE",
            "INSURED",
            "WERTPAKET",
            "VERZEKER",
            "EXPRESS",
        )
    )


def _dominates_card_order_method(
    existing: "ShippingMethod", candidate: "ShippingMethod"
) -> bool:
    return _dominates_by_limits(
        existing_price_cents=existing.total_price_cents,
        candidate_price_cents=candidate.total_price_cents,
        existing_max_value_cents=existing.max_value_cents,
        candidate_max_value_cents=candidate.max_value_cents,
        existing_capacity=existing.max_weight_grams,
        candidate_capacity=candidate.max_weight_grams,
        allows_cross_class_domination=existing.is_letter == candidate.is_letter,
    )


def max_cards_based_on_weight(max_weight_grams: int) -> int:
    for weight_limit, card_limit in LETTER_CARD_LIMITS:
        if max_weight_grams <= weight_limit:
            return card_limit
    return int(max_weight_grams / APPROX_GRAMS_PER_CARD)


def _normalize_card_order_methods(
    raw_methods: list[dict[str, object]],
) -> tuple[ShippingMethod, ...]:
    methods = []
    for method in raw_methods:
        name = str(method.get("name", ""))
        if _is_card_order_excluded_method(name):
            continue

        if bool(method["isVirtual"]):
            continue

        methods.append(
            ShippingMethod(
                name=name,
                is_tracked=bool(method["isTracked"]),
                max_value_cents=parse_eur_to_cents(method["maxValue"]),
                max_weight_grams=min(
                    int(method["maxWeight"]), CARD_ORDER_MAX_WEIGHT_GRAMS
                ),
                stamp_price_cents=parse_eur_to_cents(method["stampPrice"]),
                total_price_cents=parse_eur_to_cents(method["price"]),
                is_letter=bool(method["isLetter"]),
            )
        )

    kept = _prune_dominated_candidates(
        methods,
        sort_key=lambda method: (
            method.total_price_cents,
            -method.max_value_cents,
            -method.max_weight_grams,
            method.name,
        ),
        dominates=_dominates_card_order_method,
    )

    letters = [method for method in kept if method.is_letter]
    parcels = [method for method in kept if not method.is_letter]
    cheapest_parcel = parcels[:1]

    return tuple([*letters, *cheapest_parcel])


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


@dataclass(frozen=True)
class ShippingTier:
    max_value_cents: int
    max_weight_grams: int
    total_price_cents: int


@dataclass(frozen=True)
class ShippingRouteTiers:
    letter_tiers: tuple[ShippingTier, ...]
    parcel_tiers: tuple[ShippingTier, ...]


@dataclass(frozen=True)
class ShippingRouteBook:
    country_ids: dict[str, int]
    methods_by_route: dict[tuple[str, str], tuple[ShippingMethod, ...]]
    tiers_by_route: dict[tuple[str, str], ShippingRouteTiers] = field(
        default_factory=dict
    )

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

    def lookup_tiers(
        self, *, seller_country: str, buyer_country: str
    ) -> ShippingRouteTiers:
        return self.tiers_by_route.get(
            (
                normalize_country_name(seller_country),
                normalize_country_name(buyer_country),
            ),
            ShippingRouteTiers(letter_tiers=(), parcel_tiers=()),
        )


def _dominates_by_limits(
    *,
    existing_price_cents: int,
    candidate_price_cents: int,
    existing_max_value_cents: int,
    candidate_max_value_cents: int,
    existing_capacity: int,
    candidate_capacity: int,
    allows_cross_class_domination: bool,
) -> bool:
    return (
        allows_cross_class_domination
        and existing_price_cents <= candidate_price_cents
        and existing_max_value_cents >= candidate_max_value_cents
        and existing_capacity >= candidate_capacity
    )


def _shipping_tier_capacity(tier: ShippingTier) -> int:
    return max_cards_based_on_weight(tier.max_weight_grams)


def _prune_dominated_candidates(
    candidates: list[object],
    *,
    sort_key,
    dominates,
) -> list[object]:
    sorted_candidates = sorted(candidates, key=sort_key)

    kept: list[object] = []
    for candidate in sorted_candidates:
        if any(dominates(existing, candidate) for existing in kept):
            continue
        kept.append(candidate)

    return kept


def _shipping_tier_dominates(
    existing: tuple[bool, ShippingTier],
    candidate: tuple[bool, ShippingTier],
) -> bool:
    existing_is_letter, existing_tier = existing
    candidate_is_letter, candidate_tier = candidate

    return _dominates_by_limits(
        existing_price_cents=existing_tier.total_price_cents,
        candidate_price_cents=candidate_tier.total_price_cents,
        existing_max_value_cents=existing_tier.max_value_cents,
        candidate_max_value_cents=candidate_tier.max_value_cents,
        existing_capacity=_shipping_tier_capacity(existing_tier),
        candidate_capacity=_shipping_tier_capacity(candidate_tier),
        allows_cross_class_domination=not (
            existing_is_letter and not candidate_is_letter
        ),
    )


def prune_dominated_shipping_tiers(
    tier_candidates: list[tuple[bool, ShippingTier]],
) -> list[tuple[bool, ShippingTier]]:
    return _prune_dominated_candidates(
        tier_candidates,
        sort_key=lambda candidate: (
            candidate[1].total_price_cents,
            -candidate[1].max_value_cents,
            -_shipping_tier_capacity(candidate[1]),
            candidate[0],
        ),
        dominates=_shipping_tier_dominates,
    )


def _canonicalize_route_tiers(
    methods: tuple[ShippingMethod, ...],
) -> ShippingRouteTiers:
    tier_candidates = prune_dominated_shipping_tiers(
        [
            (
                method.is_letter,
                ShippingTier(
                    max_value_cents=method.max_value_cents,
                    max_weight_grams=method.max_weight_grams,
                    total_price_cents=method.total_price_cents,
                ),
            )
            for method in methods
        ]
    )
    return ShippingRouteTiers(
        letter_tiers=tuple(tier for is_letter, tier in tier_candidates if is_letter),
        parcel_tiers=tuple(
            tier for is_letter, tier in tier_candidates if not is_letter
        ),
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
    tiers_by_route: dict[tuple[str, str], ShippingRouteTiers] = {}
    for route in payload.get("routes", []):
        from_country = route["from_country"]
        to_country = route["to_country"]
        methods = _normalize_card_order_methods(route.get("methods", []))
        route_key = _route_key(from_country, to_country)
        methods_by_route[route_key] = methods
        tiers_by_route[route_key] = _canonicalize_route_tiers(methods)

    return ShippingRouteBook(
        country_ids=country_ids,
        methods_by_route=methods_by_route,
        tiers_by_route=tiers_by_route,
    )


@lru_cache(maxsize=1)
def load_shipping_route_book() -> ShippingRouteBook:
    return _load_shipping_route_book(SHIPPING_DATA_PATH)


def minimum_shipping_cost_cents(
    *,
    seller_country: str,
    buyer_country: str,
    route_book: ShippingRouteBook,
    missing_route_cost_cents: int,
) -> int:
    route_tiers = route_book.lookup_tiers(
        seller_country=seller_country,
        buyer_country=buyer_country,
    )
    tier_costs = [
        *(tier.total_price_cents for tier in route_tiers.letter_tiers),
        *(tier.total_price_cents for tier in route_tiers.parcel_tiers),
    ]
    return min(tier_costs) if tier_costs else missing_route_cost_cents
