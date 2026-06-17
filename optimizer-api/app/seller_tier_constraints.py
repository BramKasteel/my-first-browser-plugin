"""Dead zone detection for seller shipping tiers.

A "dead zone" is a quantity range where the cost per card in tier-1 exceeds the
cost per card in tier-0. When a seller offers a quantity within this range, it's
suboptimal to use tier-1 shipping because:
- Tier-0 cost/card < tier-1 cost/card for those quantities
- Items in that quantity range are likely available elsewhere

This module detects dead zones and enables the solver to skip tier-1+ variables
and cap purchases to tier-0-max when a seller falls in the dead zone.

Dead zones are route-specific: (seller_country, buyer_country).
"""

from dataclasses import dataclass

from . import shipping


@dataclass(frozen=True)
class DeadZoneInfo:
    """Information about a dead zone for a given route."""

    is_in_dead_zone: bool
    dead_zone_start: int | None  # First qty in dead zone
    dead_zone_end: int | None    # Last qty in dead zone
    tier_0: shipping.ShippingTier | None
    tier_1: shipping.ShippingTier | None


def _two_cheapest_tiers(
    tiers: tuple[shipping.ShippingTier, ...],
) -> tuple[shipping.ShippingTier, shipping.ShippingTier] | None:
    if len(tiers) < 2:
        return None

    # Dead-zone comparison must use cheapest and second-cheapest shipping methods,
    # not source ordering from JSON.
    sorted_tiers = sorted(
        tiers,
        key=lambda tier: (
            tier.total_price_cents,
            tier.max_units,
            tier.max_value_cents,
        ),
    )
    return sorted_tiers[0], sorted_tiers[1]


def get_dead_zone_info(
    route_tiers: shipping.ShippingRouteTiers,
) -> DeadZoneInfo:
    """Compute dead zone bounds for a given route.

    Args:
        route_tiers: ShippingRouteTiers with tier-0 and tier-1 (if available)

    Returns:
        DeadZoneInfo with dead zone bounds and tier references
    """
    cheapest_pair = _two_cheapest_tiers(route_tiers.tiers)
    if cheapest_pair is None:
        return DeadZoneInfo(
            is_in_dead_zone=False,
            dead_zone_start=None,
            dead_zone_end=None,
            tier_0=None,
            tier_1=None,
        )

    tier_0, tier_1 = cheapest_pair

    # If second cheapest does not increase max units, no transition dead zone exists.
    if tier_1.max_units <= tier_0.max_units:
        return DeadZoneInfo(
            is_in_dead_zone=False,
            dead_zone_start=None,
            dead_zone_end=None,
            tier_0=tier_0,
            tier_1=tier_1,
        )

    # Cost per card in tier-0
    tier_0_cost_per_card = tier_0.total_price_cents / tier_0.max_units

    # Find the qty range where tier-1 cost per card > tier-0 cost per card
    dead_zone_start = None
    dead_zone_end = None

    for qty in range(tier_0.max_units + 1, tier_1.max_units + 1):
        tier_1_cost_per_card = tier_1.total_price_cents / qty
        if tier_1_cost_per_card > tier_0_cost_per_card:
            if dead_zone_start is None:
                dead_zone_start = qty
            dead_zone_end = qty
        elif dead_zone_start is not None:
            # We've exited the dead zone
            break

    is_in_dead_zone = dead_zone_start is not None and dead_zone_end is not None

    return DeadZoneInfo(
        is_in_dead_zone=is_in_dead_zone,
        dead_zone_start=dead_zone_start,
        dead_zone_end=dead_zone_end,
        tier_0=tier_0,
        tier_1=tier_1,
    )


def is_seller_in_dead_zone_for_route(
    dead_zone_info: DeadZoneInfo,
    *,
    seller_total_qty: int,
    seller_total_cost_cents: int,
) -> bool:
    if not dead_zone_info.is_in_dead_zone:
        return False

    if dead_zone_info.tier_0 is None:
        return False

    # If seller total value cannot fit cheapest tier value cap, do not constrain.
    if seller_total_cost_cents > dead_zone_info.tier_0.max_value_cents:
        return False

    assert dead_zone_info.dead_zone_start is not None
    assert dead_zone_info.dead_zone_end is not None
    return dead_zone_info.dead_zone_start <= seller_total_qty <= dead_zone_info.dead_zone_end


def is_seller_in_dead_zone(
    seller_country: str,
    buyer_country: str,
    seller_total_qty: int,
    seller_total_cost_cents: int,
    route_book: shipping.ShippingRouteBook,
) -> bool:
    """Check if a seller falls within a dead zone for their route.

    A seller is in a dead zone if:
    1. The route has at least 2 shipping tiers
    2. seller_total_qty falls within the dead zone range (where tier-1 cost/card > tier-0 cost/card)
    3. seller_total_cost_cents <= tier_0.max_value_cents (items can fit in tier-0 value limit)

    Args:
        seller_country: Seller's country
        buyer_country: Buyer's country
        seller_total_qty: Total quantity of items offered by this seller
        seller_total_cost_cents: Total cost of items offered by this seller (in cents)
        route_book: ShippingRouteBook with all routes and tiers

    Returns:
        True if seller is in a dead zone, False otherwise
    """
    route_tiers = route_book.lookup_tiers(
        seller_country=seller_country,
        buyer_country=buyer_country,
    )

    dead_zone_info = get_dead_zone_info(route_tiers)
    return is_seller_in_dead_zone_for_route(
        dead_zone_info,
        seller_total_qty=seller_total_qty,
        seller_total_cost_cents=seller_total_cost_cents,
    )
