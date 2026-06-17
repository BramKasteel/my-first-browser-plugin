"""Unit tests for seller_tier_constraints dead zone detection."""

import pytest

from app import seller_tier_constraints, shipping


def _tiers(*, values: list[tuple[int, int, int]]) -> shipping.ShippingRouteTiers:
    """Helper to create ShippingRouteTiers from (price_cents, max_value_cents, max_units) tuples."""
    return shipping.ShippingRouteTiers(
        tiers=tuple(
            shipping.ShippingTier(
                total_price_cents=total_price_cents,
                max_value_cents=max_value_cents,
                max_units=max_units,
            )
            for total_price_cents, max_value_cents, max_units in values
        ),
    )


class TestGetDeadZoneInfo:
    """Tests for get_dead_zone_info function."""

    def test_no_dead_zone_single_tier(self):
        """Single tier has no dead zone."""
        route_tiers = _tiers(values=[(170, 2500, 4)])
        info = seller_tier_constraints.get_dead_zone_info(route_tiers)
        assert not info.is_in_dead_zone
        assert info.dead_zone_start is None
        assert info.dead_zone_end is None

    def test_dead_zone_nl_to_nl(self):
        """NL→NL: tier-0 4 cards @ €1.70, tier-1 8 cards @ €3.10.
        Dead zone should be 5–7 cards.
        Cost/card: tier-0 = 0.425€, tier-1 @ qty5 = 0.62€, @ qty6 = 0.5166€, @ qty7 = 0.4428€, @ qty8 = 0.3875€
        Dead zone: 5–7 (0.62, 0.5166, 0.4428 all > 0.425)
        """
        route_tiers = _tiers(values=[(170, 2500, 4), (310, 50000, 8)])
        info = seller_tier_constraints.get_dead_zone_info(route_tiers)
        
        assert info.is_in_dead_zone
        assert info.dead_zone_start == 5
        assert info.dead_zone_end == 7
        assert info.tier_0 == route_tiers.tiers[0]
        assert info.tier_1 == route_tiers.tiers[1]

    def test_dead_zone_uses_two_cheapest_tiers_not_input_order(self):
        """Dead-zone baseline must use two cheapest tiers by price, not tuple position."""
        route_tiers = _tiers(
            values=[
                (900, 50000, 40),
                (310, 50000, 8),
                (170, 2500, 4),
            ]
        )

        info = seller_tier_constraints.get_dead_zone_info(route_tiers)

        assert info.is_in_dead_zone
        assert info.tier_0 is not None
        assert info.tier_1 is not None
        assert info.tier_0.total_price_cents == 170
        assert info.tier_1.total_price_cents == 310
        assert info.dead_zone_start == 5
        assert info.dead_zone_end == 7

    def test_dead_zone_de_to_nl_larger(self):
        """DE→NL using real shipping_costs.json data.

        Cheapest tier: Letter (20g) => 4 cards @ €1.55
        Second-cheapest tier: Small Parcel => €7.99
        Dead zone where 7.99/qty > 1.55/4:
        qty 5..20 in dead zone, qty >= 21 out.
        """
        route_book = shipping.load_shipping_route_book()
        route_tiers = route_book.lookup_tiers(
            seller_country="Germany",
            buyer_country="Netherlands",
        )
        info = seller_tier_constraints.get_dead_zone_info(route_tiers)

        assert info.is_in_dead_zone
        assert info.tier_0 is not None
        assert info.tier_1 is not None
        assert info.tier_0.total_price_cents == 155
        assert info.tier_0.max_units == 4
        assert info.tier_1.total_price_cents == 799
        assert info.dead_zone_start == 5
        assert info.dead_zone_end == 20

    def test_dead_zone_with_partial_range(self):
        """Tier-0: 5 cards @ €2.00 = 0.40€/card
        Tier-1: 15 cards @ €3.00 = 0.20€/card
        No dead zone initially (tier-1 cheaper from qty 6 onwards).
        """
        route_tiers = _tiers(values=[(200, 2500, 5), (300, 50000, 15)])
        info = seller_tier_constraints.get_dead_zone_info(route_tiers)
        
        # Tier-1 cost/card at qty 6 = 3.00/6 = 0.50€ > 0.40€ ✓ in dead zone
        # At qty 7 = 3.00/7 = 0.428€ > 0.40€ ✓ in dead zone
        # At qty 8 = 3.00/8 = 0.375€ < 0.40€ ✗ out of dead zone
        assert info.is_in_dead_zone
        assert info.dead_zone_start == 6
        assert info.dead_zone_end == 7


class TestIsSellerInDeadZone:
    """Tests for is_seller_in_dead_zone function."""

    def test_seller_qty_in_dead_zone_nl_to_nl(self):
        """Seller offers 7 items, cost €15, NL→NL dead zone 5–7."""
        route_book = shipping.ShippingRouteBook(
            country_ids={"netherlands": 23, "germany": 7},
            tiers_by_route={
                ("netherlands", "netherlands"): _tiers(
                    values=[(170, 2500, 4), (310, 50000, 8)]
                )
            },
        )
        
        result = seller_tier_constraints.is_seller_in_dead_zone(
            seller_country="Netherlands",
            buyer_country="Netherlands",
            seller_total_qty=7,
            seller_total_cost_cents=1500,  # €15
            route_book=route_book,
        )
        assert result is True

    def test_seller_dead_zone_check_ignores_unsorted_route_tier_order(self):
        route_book = shipping.ShippingRouteBook(
            country_ids={"netherlands": 23},
            tiers_by_route={
                ("netherlands", "netherlands"): _tiers(
                    values=[
                        (900, 50000, 40),
                        (310, 50000, 8),
                        (170, 2500, 4),
                    ]
                )
            },
        )

        result = seller_tier_constraints.is_seller_in_dead_zone(
            seller_country="Netherlands",
            buyer_country="Netherlands",
            seller_total_qty=6,
            seller_total_cost_cents=1200,
            route_book=route_book,
        )
        assert result is True

    def test_seller_qty_at_dead_zone_start(self):
        """Seller qty = 5 (first qty in dead zone)."""
        route_book = shipping.ShippingRouteBook(
            country_ids={"netherlands": 23},
            tiers_by_route={
                ("netherlands", "netherlands"): _tiers(
                    values=[(170, 2500, 4), (310, 50000, 8)]
                )
            },
        )
        
        result = seller_tier_constraints.is_seller_in_dead_zone(
            seller_country="Netherlands",
            buyer_country="Netherlands",
            seller_total_qty=5,
            seller_total_cost_cents=1200,
            route_book=route_book,
        )
        assert result is True

    def test_seller_qty_at_dead_zone_end(self):
        """Seller qty = 7 (last qty in dead zone)."""
        route_book = shipping.ShippingRouteBook(
            country_ids={"netherlands": 23},
            tiers_by_route={
                ("netherlands", "netherlands"): _tiers(
                    values=[(170, 2500, 4), (310, 50000, 8)]
                )
            },
        )
        
        result = seller_tier_constraints.is_seller_in_dead_zone(
            seller_country="Netherlands",
            buyer_country="Netherlands",
            seller_total_qty=7,
            seller_total_cost_cents=1500,
            route_book=route_book,
        )
        assert result is True

    def test_seller_qty_below_dead_zone(self):
        """Seller qty = 4 (≤ tier-0-max, below dead zone)."""
        route_book = shipping.ShippingRouteBook(
            country_ids={"netherlands": 23},
            tiers_by_route={
                ("netherlands", "netherlands"): _tiers(
                    values=[(170, 2500, 4), (310, 50000, 8)]
                )
            },
        )
        
        result = seller_tier_constraints.is_seller_in_dead_zone(
            seller_country="Netherlands",
            buyer_country="Netherlands",
            seller_total_qty=4,
            seller_total_cost_cents=1200,
            route_book=route_book,
        )
        assert result is False

    def test_seller_qty_above_dead_zone(self):
        """Seller qty = 8 (tier-1-max, out of dead zone as cost/card drops)."""
        route_book = shipping.ShippingRouteBook(
            country_ids={"netherlands": 23},
            tiers_by_route={
                ("netherlands", "netherlands"): _tiers(
                    values=[(170, 2500, 4), (310, 50000, 8)]
                )
            },
        )
        
        result = seller_tier_constraints.is_seller_in_dead_zone(
            seller_country="Netherlands",
            buyer_country="Netherlands",
            seller_total_qty=8,
            seller_total_cost_cents=1500,
            route_book=route_book,
        )
        assert result is False

    def test_seller_cost_exceeds_tier_0_value_limit(self):
        """Seller cost €30, but tier-0 max value €25 → can't fit tier-0 → False."""
        route_book = shipping.ShippingRouteBook(
            country_ids={"netherlands": 23},
            tiers_by_route={
                ("netherlands", "netherlands"): _tiers(
                    values=[(170, 2500, 4), (310, 50000, 8)]
                )
            },
        )
        
        result = seller_tier_constraints.is_seller_in_dead_zone(
            seller_country="Netherlands",
            buyer_country="Netherlands",
            seller_total_qty=7,
            seller_total_cost_cents=3000,  # €30 > €25 tier-0 max
            route_book=route_book,
        )
        assert result is False

    def test_seller_single_tier_no_dead_zone(self):
        """Single tier available → no dead zone."""
        route_book = shipping.ShippingRouteBook(
            country_ids={"netherlands": 23},
            tiers_by_route={
                ("netherlands", "netherlands"): _tiers(
                    values=[(170, 2500, 4)]
                )
            },
        )
        
        result = seller_tier_constraints.is_seller_in_dead_zone(
            seller_country="Netherlands",
            buyer_country="Netherlands",
            seller_total_qty=7,
            seller_total_cost_cents=1500,
            route_book=route_book,
        )
        assert result is False

    def test_seller_no_route_tiers(self):
        """Route not in route_book → no tiers → no dead zone."""
        route_book = shipping.ShippingRouteBook(
            country_ids={"netherlands": 23},
            tiers_by_route={},
        )
        
        result = seller_tier_constraints.is_seller_in_dead_zone(
            seller_country="Netherlands",
            buyer_country="Netherlands",
            seller_total_qty=7,
            seller_total_cost_cents=1500,
            route_book=route_book,
        )
        assert result is False

    def test_seller_de_to_nl_dead_zone(self):
        """DE→NL dead-zone checks with real shipping_costs.json route data."""
        route_book = shipping.load_shipping_route_book()

        # qty 11, cost €20 -> in dead zone (5..20)
        result = seller_tier_constraints.is_seller_in_dead_zone(
            seller_country="Germany",
            buyer_country="Netherlands",
            seller_total_qty=11,
            seller_total_cost_cents=2000,
            route_book=route_book,
        )
        assert result is True
        
        # qty 21, cost €20 -> out of dead zone
        result = seller_tier_constraints.is_seller_in_dead_zone(
            seller_country="Germany",
            buyer_country="Netherlands",
            seller_total_qty=21,
            seller_total_cost_cents=2000,
            route_book=route_book,
        )
        assert result is False

    def test_seller_cost_at_tier_0_value_limit(self):
        """Seller cost = €25 (at tier-0 max value limit, not exceeding)."""
        route_book = shipping.ShippingRouteBook(
            country_ids={"netherlands": 23},
            tiers_by_route={
                ("netherlands", "netherlands"): _tiers(
                    values=[(170, 2500, 4), (310, 50000, 8)]
                )
            },
        )
        
        result = seller_tier_constraints.is_seller_in_dead_zone(
            seller_country="Netherlands",
            buyer_country="Netherlands",
            seller_total_qty=7,
            seller_total_cost_cents=2500,  # €25 = tier-0 max (allowed)
            route_book=route_book,
        )
        assert result is True


class TestDeadZoneEdgeCases:
    """Edge case tests for dead zone detection."""

    def test_empty_tiers(self):
        """Empty tier list."""
        route_tiers = shipping.ShippingRouteTiers(tiers=())
        info = seller_tier_constraints.get_dead_zone_info(route_tiers)
        assert not info.is_in_dead_zone

    def test_tier_0_cost_equals_tier_1_cost(self):
        """Same shipping cost for both tiers but different qty limits.
        Tier-0: 4 cards @ €3.00 = 0.75€/card
        Tier-1: 8 cards @ €3.00 = 0.375€/card
        Dead zone: qty 5–7 where cost/card > 0.75€... but tier-1 is cheaper!
        No dead zone because tier-1 cost/card < tier-0 cost/card for all quantities.
        """
        route_tiers = _tiers(values=[(300, 2500, 4), (300, 50000, 8)])
        info = seller_tier_constraints.get_dead_zone_info(route_tiers)
        assert not info.is_in_dead_zone

    def test_very_small_dead_zone_single_qty(self):
        """Tier-0: 5 cards @ €1.00 = 0.20€/card
        Tier-1: 10 cards @ €1.50 = 0.15€/card
        At qty 6: 1.50/6 = 0.25€ > 0.20€ ✓
        At qty 7: 1.50/7 = 0.214€ > 0.20€ ✓
        At qty 8: 1.50/8 = 0.1875€ < 0.20€ ✗
        Dead zone: 6–7
        """
        route_tiers = _tiers(values=[(100, 2500, 5), (150, 50000, 10)])
        info = seller_tier_constraints.get_dead_zone_info(route_tiers)
        assert info.is_in_dead_zone
        assert info.dead_zone_start == 6
        assert info.dead_zone_end == 7
