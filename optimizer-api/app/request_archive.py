from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import boto3

from .models import OptimizationRequest, SearchWantedItemMetadata
from .solver import OptimizationRunResult

DEFAULT_ARCHIVE_USERNAME = "anonymous"


@dataclass(frozen=True)
class ArchiveResult:
    enabled: bool
    compatibility_mode: bool
    bucket_name: str | None = None
    prefix: str | None = None
    search_key: str | None = None
    optimizer_log_key: str | None = None
    error: str | None = None


class OptimizationArchiveWriter:
    def __init__(self, bucket_name: str | None) -> None:
        self.bucket_name = (bucket_name or "").strip() or None
        self._client = None

    @classmethod
    def from_env(cls) -> "OptimizationArchiveWriter":
        return cls(os.getenv("OPTIMIZER_ARCHIVE_BUCKET"))

    @property
    def enabled(self) -> bool:
        return self.bucket_name is not None

    def write_run_artifacts(
        self,
        *,
        request: OptimizationRequest,
        run_result: OptimizationRunResult | None,
        solver_log_text: str,
        started_at: datetime,
        finished_at: datetime,
        error_detail: str | None = None,
    ) -> ArchiveResult:
        search_document, archive_username, compatibility_mode = build_search_document(
            request=request,
            run_result=run_result,
            started_at=started_at,
            finished_at=finished_at,
            error_detail=error_detail,
        )
        prefix = f"{started_at.strftime('%Y%m%dT%H%M%SZ')}_{archive_username}"
        search_key = f"{prefix}/search.json"
        optimizer_log_key = f"{prefix}/optimizer_log.txt"

        if not self.enabled:
            return ArchiveResult(
                enabled=False,
                compatibility_mode=compatibility_mode,
                prefix=prefix,
                search_key=search_key,
                optimizer_log_key=optimizer_log_key,
            )

        log_body = solver_log_text.strip()
        if not log_body:
            log_body = "No solver progress logs captured.\n"
        elif not log_body.endswith("\n"):
            log_body = f"{log_body}\n"

        try:
            self._put_json(key=search_key, payload=search_document)
            self._put_text(key=optimizer_log_key, payload=log_body)
        except Exception as exc:
            return ArchiveResult(
                enabled=True,
                compatibility_mode=compatibility_mode,
                bucket_name=self.bucket_name,
                prefix=prefix,
                search_key=search_key,
                optimizer_log_key=optimizer_log_key,
                error=str(exc),
            )

        return ArchiveResult(
            enabled=True,
            compatibility_mode=compatibility_mode,
            bucket_name=self.bucket_name,
            prefix=prefix,
            search_key=search_key,
            optimizer_log_key=optimizer_log_key,
        )

    def _put_json(self, *, key: str, payload: dict[str, Any]) -> None:
        self._client_or_create().put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=json.dumps(payload, indent=2, sort_keys=True).encode("utf-8"),
            ContentType="application/json",
        )

    def _put_text(self, *, key: str, payload: str) -> None:
        self._client_or_create().put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=payload.encode("utf-8"),
            ContentType="text/plain; charset=utf-8",
        )

    def _client_or_create(self):
        if self._client is None:
            self._client = boto3.client("s3")
        return self._client


def build_search_document(
    *,
    request: OptimizationRequest,
    run_result: OptimizationRunResult | None,
    started_at: datetime,
    finished_at: datetime,
    error_detail: str | None = None,
) -> tuple[dict[str, Any], str, bool]:
    compatibility_mode = request.search_metadata is None
    username = _metadata_username(request)
    wanted_items = _wanted_items(request)
    filters = _filters(request)
    response = run_result.response if run_result is not None else None
    diagnostics = run_result.diagnostics if run_result is not None else None

    document = {
        "generated_at": finished_at.isoformat(),
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "compatibility_mode": compatibility_mode,
        "username": username,
        "want_list_id": request.search_metadata.want_list_id
        if request.search_metadata
        else None,
        "filters": filters,
        "wanted_cards": wanted_items,
        "optimizer_request": {
            "buyer_country": request.buyer_country,
            "currency": request.currency,
            "item_count": len(request.items),
            "seller_count": len(request.sellers),
            "offer_count": len(request.offers),
            "allowed_countries": list(request.preferences.allowed_countries),
            "blocked_seller_count": len(request.preferences.blocked_seller_ids),
        },
        "optimizer_result": {
            "status": response.status if response is not None else None,
            "totals": response.totals.model_dump(mode="json")
            if response is not None
            else None,
            "total_sellers": response.cart.total_sellers
            if response is not None
            else None,
            "total_units": response.cart.total_units if response is not None else None,
            "notes": list(response.notes) if response is not None else [],
        },
        "solver_summary": {
            "solver_status": diagnostics.solver_status
            if diagnostics is not None
            else None,
            "wall_time_seconds": diagnostics.wall_time_seconds
            if diagnostics is not None
            else None,
            "objective_value": diagnostics.objective_value
            if diagnostics is not None
            else None,
            "best_objective_bound": diagnostics.best_objective_bound
            if diagnostics is not None
            else None,
            "num_conflicts": diagnostics.num_conflicts
            if diagnostics is not None
            else None,
            "num_branches": diagnostics.num_branches
            if diagnostics is not None
            else None,
        },
        "error": error_detail,
    }

    return document, _archive_slug(username), compatibility_mode


def _metadata_username(request: OptimizationRequest) -> str:
    username = None
    if request.search_metadata is not None:
        username = request.search_metadata.username
    return username or DEFAULT_ARCHIVE_USERNAME


def _archive_slug(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9._-]+", "-", value.strip().lower())
    normalized = normalized.strip("-._")
    return normalized or DEFAULT_ARCHIVE_USERNAME


def _wanted_items(request: OptimizationRequest) -> list[dict[str, Any]]:
    if request.search_metadata and request.search_metadata.wanted_items:
        return [
            {
                "item_id": item.item_id,
                "name": item.name,
                "quantity": item.quantity,
                "language": item.language,
                "min_condition": item.min_condition,
                "expansion": item.expansion,
                "is_foil": item.is_foil,
            }
            for item in request.search_metadata.wanted_items
        ]

    synthesized: list[SearchWantedItemMetadata] = []
    for item in request.items:
        synthesized.append(
            SearchWantedItemMetadata(
                item_id=item.item_id,
                name=item.name,
                quantity=item.quantity,
                language=(
                    item.preferred_languages[0] if item.preferred_languages else None
                ),
                min_condition=item.min_condition,
                expansion=None,
                is_foil=None,
            )
        )

    return [
        {
            "item_id": item.item_id,
            "name": item.name,
            "quantity": item.quantity,
            "language": item.language,
            "min_condition": item.min_condition,
            "expansion": item.expansion,
            "is_foil": item.is_foil,
        }
        for item in synthesized
    ]


def _filters(request: OptimizationRequest) -> dict[str, Any]:
    metadata_filters = (
        request.search_metadata.filters if request.search_metadata else None
    )
    buyer_country = (
        metadata_filters.buyer_country
        if metadata_filters and metadata_filters.buyer_country
        else request.buyer_country
    )
    seller_countries = (
        list(metadata_filters.seller_countries)
        if metadata_filters and metadata_filters.seller_countries
        else list(request.preferences.allowed_countries)
    )
    return {
        "buyer_country": buyer_country,
        "seller_countries": seller_countries,
        "seller_type": metadata_filters.seller_type if metadata_filters else None,
        "delivery_type": metadata_filters.delivery_type if metadata_filters else None,
        "seller_reputation": metadata_filters.seller_reputation
        if metadata_filters
        else None,
        "include_bargain_countries": (
            metadata_filters.include_bargain_countries if metadata_filters else None
        ),
        "additional_filters": list(metadata_filters.additional_filters)
        if metadata_filters
        else [],
    }
