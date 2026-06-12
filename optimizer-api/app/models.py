from __future__ import annotations

from typing import Annotated, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    PrivateAttr,
    StringConstraints,
    model_validator,
)

BoundedId = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)
]
BoundedName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=256)
]
BoundedCountry = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)
]
BoundedDescriptor = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=64)
]
CurrencyCode = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        to_upper=True,
        min_length=3,
        max_length=3,
        pattern=r"^[A-Z]{3}$",
    ),
]

MAX_ITEMS = 500
MAX_SELLERS = 5_000
MAX_OFFERS = 50_000
MAX_LANGUAGE_PREFERENCES = 20
MAX_ALLOWED_COUNTRIES = 100
MAX_BLOCKED_SELLERS = 5_000


def _find_duplicates(values: list[str]) -> list[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()

    for value in values:
        if value in seen:
            duplicates.add(value)
            continue
        seen.add(value)

    return sorted(duplicates)


class WantedItem(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    item_id: BoundedId
    name: BoundedName
    quantity: int = Field(ge=1, le=1_000)
    min_condition: BoundedDescriptor | None = None
    preferred_languages: list[BoundedDescriptor] = Field(
        default_factory=list, max_length=MAX_LANGUAGE_PREFERENCES
    )


class Seller(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    seller_id: BoundedId
    name: BoundedName
    country: BoundedCountry


class Offer(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    offer_id: BoundedId
    item_id: BoundedId
    seller_id: BoundedId
    unit_price: float = Field(ge=0)
    available_quantity: int = Field(ge=1, le=10_000)
    condition: BoundedDescriptor | None = None
    language: BoundedDescriptor | None = None
    _unit_price_cents: int = PrivateAttr()

    def model_post_init(self, __context) -> None:
        self._unit_price_cents = int(round(self.unit_price * 100))

    @property
    def unit_price_cents(self) -> int:
        return self._unit_price_cents


class OptimizationPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    max_sellers: int | None = Field(default=None, ge=1)
    allowed_countries: list[BoundedCountry] = Field(
        default_factory=list, max_length=MAX_ALLOWED_COUNTRIES
    )
    blocked_seller_ids: list[BoundedId] = Field(
        default_factory=list, max_length=MAX_BLOCKED_SELLERS
    )
    return_alternatives: int = Field(default=0, ge=0, le=0)


class OptimizationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    buyer_country: BoundedCountry
    currency: CurrencyCode = "EUR"
    items: list[WantedItem] = Field(min_length=1, max_length=MAX_ITEMS)
    sellers: list[Seller] = Field(min_length=1, max_length=MAX_SELLERS)
    offers: list[Offer] = Field(min_length=1, max_length=MAX_OFFERS)
    preferences: OptimizationPreferences = Field(
        default_factory=OptimizationPreferences
    )

    def seller_map(self) -> dict[BoundedId, Seller]:
        return {seller.seller_id: seller for seller in self.sellers}

    def item_map(self) -> dict[BoundedId, WantedItem]:
        return {item.item_id: item for item in self.items}

    @model_validator(mode="after")
    def validate_references(self) -> "OptimizationRequest":
        duplicate_item_ids = _find_duplicates([item.item_id for item in self.items])
        if duplicate_item_ids:
            raise ValueError(f"Duplicate item IDs: {', '.join(duplicate_item_ids)}")

        duplicate_seller_ids = _find_duplicates(
            [seller.seller_id for seller in self.sellers]
        )
        if duplicate_seller_ids:
            raise ValueError(f"Duplicate seller IDs: {', '.join(duplicate_seller_ids)}")

        duplicate_offer_ids = _find_duplicates(
            [offer.offer_id for offer in self.offers]
        )
        if duplicate_offer_ids:
            raise ValueError(f"Duplicate offer IDs: {', '.join(duplicate_offer_ids)}")

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
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    offer_id: BoundedId
    item_id: BoundedId
    seller_id: BoundedId
    quantity: int = Field(ge=1)
    unit_price: float = Field(ge=0)
    line_total: float = Field(ge=0)


class SellerResult(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    seller_id: BoundedId
    item_subtotal: float = Field(ge=0)
    shipping_cost: float = Field(ge=0)
    total_units: int = Field(ge=0)


class OptimizationTotals(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    item_subtotal: float = Field(ge=0)
    shipping_total: float = Field(ge=0)
    grand_total: float = Field(ge=0)


class CartItemResult(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    offer_id: BoundedId
    item_id: BoundedId
    item_name: BoundedName
    quantity: int = Field(ge=1)
    unit_price: float = Field(ge=0)
    line_total: float = Field(ge=0)
    price_rank: int | None = Field(default=None, ge=1)
    price_rank_total: int | None = Field(default=None, ge=1)
    condition: BoundedDescriptor | None = None
    language: BoundedDescriptor | None = None


class CartSellerResult(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    seller_id: BoundedId
    seller_name: BoundedName
    country: BoundedCountry
    item_subtotal: float = Field(ge=0)
    shipping_cost: float = Field(ge=0)
    grand_total: float = Field(ge=0)
    total_units: int = Field(ge=0)
    items: list[CartItemResult] = Field(default_factory=list)


class OptimizationCart(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    sellers: list[CartSellerResult] = Field(default_factory=list)
    total_sellers: int = Field(default=0, ge=0)
    total_units: int = Field(default=0, ge=0)


class OptimizationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    status: Literal["optimal", "feasible", "infeasible"]
    warm_start_status: str = "unknown"
    currency: CurrencyCode
    totals: OptimizationTotals
    chosen_sellers: list[SellerResult] = Field(default_factory=list)
    allocations: list[AllocationResult] = Field(default_factory=list)
    cart: OptimizationCart = Field(default_factory=OptimizationCart)
    notes: list[str] = Field(default_factory=list)
