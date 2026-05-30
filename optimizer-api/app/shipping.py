from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

SHIPPING_DATA_PATH = Path(__file__).with_name("data") / "shipping_costs.json"
LETTER_CARD_LIMITS = ((20, 4), (50, 17), (100, 40))
APPROX_GRAMS_PER_CARD = 2.5
PARCEL_CARD_ORDER_MAX_WEIGHT_GRAMS = 1000


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


def max_cards_based_on_weight(max_weight_grams: int) -> int:
    for weight_limit, card_limit in LETTER_CARD_LIMITS:
        if max_weight_grams <= weight_limit:
            return card_limit
    return int(max_weight_grams / APPROX_GRAMS_PER_CARD)


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
class ShippingTier:
    max_value_cents: int
    max_weight_grams: int
    total_price_cents: int


@dataclass(frozen=True)
class ShippingRouteTiers:
    tiers: tuple[ShippingTier, ...]


@dataclass(frozen=True)
class ShippingRouteBook:
    country_ids: dict[str, int]
    tiers_by_route: dict[tuple[str, str], ShippingRouteTiers] = field(
        default_factory=dict
    )

    def lookup_country_id(self, country: str) -> int | None:
        return self.country_ids.get(normalize_country_name(country))

    def lookup_tiers(
        self,
        *,
        seller_country: str,
        buyer_country: str,
        seller_value_upper_bound: int | None = None,
        seller_weight_upper_bound: int | None = None,
    ) -> ShippingRouteTiers:
        route_tiers = self.tiers_by_route.get(
            (
                normalize_country_name(seller_country),
                normalize_country_name(buyer_country),
            ),
            ShippingRouteTiers(tiers=()),
        )
        if seller_value_upper_bound is None or seller_weight_upper_bound is None:
            return route_tiers
        return prune_route_tiers_for_order_bounds(
            route_tiers=route_tiers,
            seller_value_upper_bound=seller_value_upper_bound,
            seller_weight_upper_bound=seller_weight_upper_bound,
        )


@lru_cache(maxsize=64)
def card_weight_grams_for_quantity(quantity: int) -> int:
    return (quantity * 5 + 1) // 2


def _normalized_tier_max_weight_grams(*, is_letter: bool, max_weight_grams: int) -> int:
    if not is_letter:
        return PARCEL_CARD_ORDER_MAX_WEIGHT_GRAMS
    # This uses the estimates provided by cardmarket -> 20gr: 4 cards, etc
    # even though a card weighs 2.5 grams only
    return card_weight_grams_for_quantity(max_cards_based_on_weight(max_weight_grams))


def prune_route_tiers_for_order_bounds(
    *,
    route_tiers: ShippingRouteTiers,
    seller_value_upper_bound: int,
    seller_weight_upper_bound: int,
) -> ShippingRouteTiers:
    pruned = _prune_dominated_candidates(
        list(route_tiers.tiers),
        sort_key=lambda tier: (
            tier.total_price_cents,
            -min(tier.max_value_cents, seller_value_upper_bound),
            -min(tier.max_weight_grams, seller_weight_upper_bound),
        ),
        dominates=lambda existing, candidate: _shipping_tier_dominates_for_order_bounds(
            existing=existing,
            candidate=candidate,
            seller_value_upper_bound=seller_value_upper_bound,
            seller_weight_upper_bound=seller_weight_upper_bound,
        ),
    )

    return ShippingRouteTiers(tiers=tuple(pruned))


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


def _normalize_route_tiers(
    raw_methods: list[dict[str, object]],
) -> "ShippingRouteTiers":
    tier_candidates: list[ShippingTier] = []
    for method in raw_methods:
        name = str(method.get("name", ""))
        if _is_card_order_excluded_method(name):
            continue

        if bool(method["isVirtual"]):
            continue

        tier_candidates.append(
            ShippingTier(
                max_value_cents=parse_eur_to_cents(method["maxValue"]),
                max_weight_grams=_normalized_tier_max_weight_grams(
                    is_letter=bool(method["isLetter"]),
                    max_weight_grams=int(method["maxWeight"]),
                ),
                total_price_cents=parse_eur_to_cents(method["price"]),
            )
        )

    pruned_candidates = _prune_dominated_candidates(
        tier_candidates,
        sort_key=lambda tier: (
            tier.total_price_cents,
            -tier.max_value_cents,
            -tier.max_weight_grams,
        ),
        dominates=_shipping_tier_dominates,
    )
    return ShippingRouteTiers(tiers=tuple(pruned_candidates))


def _shipping_tier_dominates(existing: ShippingTier, candidate: ShippingTier) -> bool:
    return (
        existing.total_price_cents <= candidate.total_price_cents
        and existing.max_value_cents >= candidate.max_value_cents
        and existing.max_weight_grams >= candidate.max_weight_grams
    )


def _shipping_tier_dominates_for_order_bounds(
    *,
    existing: ShippingTier,
    candidate: ShippingTier,
    seller_value_upper_bound: int,
    seller_weight_upper_bound: int,
) -> bool:
    if existing.total_price_cents > candidate.total_price_cents:
        return False

    if min(existing.max_value_cents, seller_value_upper_bound) < min(
        candidate.max_value_cents,
        seller_value_upper_bound,
    ):
        return False

    return min(existing.max_weight_grams, seller_weight_upper_bound) >= min(
        candidate.max_weight_grams,
        seller_weight_upper_bound,
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

    tiers_by_route: dict[tuple[str, str], ShippingRouteTiers] = {}
    for route in payload.get("routes", []):
        from_country = route["from_country"]
        to_country = route["to_country"]
        route_key = _route_key(from_country, to_country)
        tiers_by_route[route_key] = _normalize_route_tiers(route.get("methods", []))

    return ShippingRouteBook(
        country_ids=country_ids,
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
    tier_costs = [tier.total_price_cents for tier in route_tiers.tiers]
    return min(tier_costs) if tier_costs else missing_route_cost_cents
