from __future__ import annotations

from fastapi import FastAPI, HTTPException

from .models import OptimizationRequest, OptimizationResponse
from .solver import optimize_order

app = FastAPI(
    title="Cardmarket Optimizer API",
    version="0.1.0",
    summary="Optimize scraped Cardmarket want-list seller data",
    description=(
        "Receives normalized seller offers from browser extension and returns "
        "lowest-cost valid order under current simplified shipping model."
    ),
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
    try:
        return optimize_order(payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
