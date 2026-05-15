from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class WantedItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    quantity: int = Field(ge=1)
    min_condition: str | None = None
    preferred_languages: list[str] = Field(default_factory=list)


class Seller(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seller_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    country: str = Field(min_length=1)


class Offer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    offer_id: str = Field(min_length=1)
    item_id: str = Field(min_length=1)
    seller_id: str = Field(min_length=1)
    unit_price: float = Field(ge=0)
    available_quantity: int = Field(ge=1)
    condition: str | None = None
    language: str | None = None


class OptimizationPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    max_sellers: int | None = Field(default=None, ge=1)
    allowed_countries: list[str] = Field(default_factory=list)
    blocked_seller_ids: list[str] = Field(default_factory=list)
    return_alternatives: int = Field(default=0, ge=0, le=0)


class OptimizationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    buyer_country: str = Field(min_length=1)
    currency: str = Field(default="EUR", min_length=3, max_length=3)
    items: list[WantedItem] = Field(min_length=1)
    sellers: list[Seller] = Field(min_length=1)
    offers: list[Offer] = Field(min_length=1)
    preferences: OptimizationPreferences = Field(
        default_factory=OptimizationPreferences
    )

    @model_validator(mode="after")
    def validate_references(self) -> "OptimizationRequest":
        item_ids = {item.item_id for item in self.items}
        seller_ids = {seller.seller_id for seller in self.sellers}

        unknown_offer_items = sorted(
            {offer.item_id for offer in self.offers if offer.item_id not in item_ids}
        )
        if unknown_offer_items:
            raise ValueError(
                f"Offers reference unknown item IDs: {', '.join(unknown_offer_items)}"
            )

        unknown_offer_sellers = sorted(
            {
                offer.seller_id
                for offer in self.offers
                if offer.seller_id not in seller_ids
            }
        )
        if unknown_offer_sellers:
            raise ValueError(
                f"Offers reference unknown seller IDs: {', '.join(unknown_offer_sellers)}"
            )

        blocked_unknown = sorted(
            seller_id
            for seller_id in self.preferences.blocked_seller_ids
            if seller_id not in seller_ids
        )
        if blocked_unknown:
            raise ValueError(
                f"Preferences block unknown seller IDs: {', '.join(blocked_unknown)}"
            )

        return self


class AllocationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    offer_id: str
    item_id: str
    seller_id: str
    quantity: int = Field(ge=1)
    unit_price: float = Field(ge=0)
    line_total: float = Field(ge=0)


class SellerResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seller_id: str
    item_subtotal: float = Field(ge=0)
    shipping_cost: float = Field(ge=0)
    total_units: int = Field(ge=0)


class OptimizationTotals(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_subtotal: float = Field(ge=0)
    shipping_total: float = Field(ge=0)
    grand_total: float = Field(ge=0)


class OptimizationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["optimal", "infeasible"]
    currency: str = Field(min_length=3, max_length=3)
    totals: OptimizationTotals
    chosen_sellers: list[SellerResult] = Field(default_factory=list)
    allocations: list[AllocationResult] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
