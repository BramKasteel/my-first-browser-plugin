from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import OptimizationRequest, OptimizationResponse
from .request_archive import ArchiveResult, OptimizationArchiveWriter
from .solver import OptimizationRunResult, optimize_order_with_diagnostics

archive_writer = OptimizationArchiveWriter.from_env()
summary_logger = logging.getLogger("cardmarket_optimizer.summary")

app = FastAPI(
    title="Cardmarket Optimizer API",
    version="0.1.0",
    summary="Optimize scraped Cardmarket want-list seller data",
    description=(
        "Receives normalized seller offers from browser extension and returns "
        "lowest-cost valid order under current simplified shipping model."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "service": "cardmarket-optimizer-api",
        "version": app.version,
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "version": app.version}


@app.post("/optimize", response_model=OptimizationResponse)
def optimize(payload: OptimizationRequest) -> OptimizationResponse:
    started_at = datetime.now(timezone.utc)
    solver_log_lines: list[str] = []
    run_result: OptimizationRunResult | None = None
    archive_result: ArchiveResult | None = None
    error_detail: str | None = None

    def capture_solver_log(message: str) -> None:
        solver_log_lines.append(message if message.endswith("\n") else f"{message}\n")

    try:
        run_result = optimize_order_with_diagnostics(
            payload,
            solver_log_callback=(
                capture_solver_log if archive_writer.enabled else None
            ),
        )
        return run_result.response
    except RuntimeError as exc:
        error_detail = str(exc)
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        finished_at = datetime.now(timezone.utc)
        archive_result = archive_writer.write_run_artifacts(
            request=payload,
            run_result=run_result,
            solver_log_text="".join(solver_log_lines),
            started_at=started_at,
            finished_at=finished_at,
            error_detail=error_detail,
        )
        response = run_result.response if run_result is not None else None
        diagnostics = run_result.diagnostics if run_result is not None else None
        summary_logger.info(
            json.dumps(
                {
                    "event": "optimizer_run_summary",
                    "archive_enabled": archive_result.enabled
                    if archive_result
                    else archive_writer.enabled,
                    "archive_bucket": archive_result.bucket_name
                    if archive_result
                    else None,
                    "archive_prefix": archive_result.prefix if archive_result else None,
                    "archive_error": archive_result.error if archive_result else None,
                    "compatibility_mode": archive_result.compatibility_mode
                    if archive_result
                    else payload.search_metadata is None,
                    "request_item_count": len(payload.items),
                    "request_seller_count": len(payload.sellers),
                    "request_offer_count": len(payload.offers),
                    "optimizer_status": response.status
                    if response is not None
                    else "error",
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
                    "total_sellers": response.cart.total_sellers
                    if response is not None
                    else None,
                    "total_units": response.cart.total_units
                    if response is not None
                    else None,
                    "item_subtotal": response.totals.item_subtotal
                    if response is not None
                    else None,
                    "shipping_total": response.totals.shipping_total
                    if response is not None
                    else None,
                    "grand_total": response.totals.grand_total
                    if response is not None
                    else None,
                    "duration_seconds": round(
                        (finished_at - started_at).total_seconds(), 6
                    ),
                    "error": error_detail,
                },
                sort_keys=True,
            )
        )
