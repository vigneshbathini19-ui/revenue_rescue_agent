"""
Revenue Rescue Agent — FastAPI entry point.

Endpoints:
    POST /api/run-simulation        Generate synthetic failed payments and run
                                     them through AI diagnosis -> policy gate ->
                                     execution -> audit trail.
    GET  /api/metrics               Aggregated recovery stats.
    GET  /api/audit-trail           Paginated audit log, filterable by
                                     status and action.
    GET  /api/audit-trail/{id}      Full decision trace for one payment.

Run with:
    uvicorn main:app --reload
"""

from __future__ import annotations

import logging
import os
from collections import defaultdict
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from engine import process_batch
from generator import generate_batch
from models import (
    AuditTrailResponse,
    ExecutionResult,
    MetricsResponse,
    RecommendedAction,
    RecoveryAudit,
    SimulationRequest,
    SimulationResponse,
)
from storage import audit_store

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("revenue_rescue.main")

app = FastAPI(
    title="Revenue Rescue Agent",
    description=(
        "AI-assisted, policy-governed engine for autonomously recovering "
        "failed payments. Track 3 - AI Revenue Recovery."
    ),
    version="1.0.0",
)

# Render supplies FRONTEND_URL for the deployed Next.js service. Keep the
# wildcard fallback so local development continues to work without extra config.
frontend_url = os.environ.get("FRONTEND_URL", "*").strip()
allowed_origins = [origin.strip() for origin in frontend_url.split(",") if origin.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,  # Must be False if allow_origins is ["*"]
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.get("/", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "revenue-rescue-agent"}


@app.post("/api/run-simulation", response_model=SimulationResponse, tags=["simulation"])
def run_simulation(request: SimulationRequest) -> SimulationResponse:
    """Generate a batch of synthetic failed payments and run the full recovery pipeline."""
    if request.reset:
        audit_store.clear()

    events = generate_batch(request.batch_size)
    audits: list[RecoveryAudit] = process_batch(events)

    action_counts: dict[str, int] = defaultdict(int)
    status_counts: dict[str, int] = defaultdict(int)
    amount_recovered_this_run = 0.0

    for audit in audits:
        action_counts[audit.final_action.value] += 1
        status_counts[audit.execution_result.value] += 1
        amount_recovered_this_run += audit.amount_recovered

    logger.info(
        "Simulation complete: batch_size=%d recovered=%.2f",
        request.batch_size,
        amount_recovered_this_run,
    )

    return SimulationResponse(
        batch_size=request.batch_size,
        processed=len(audits),
        action_counts=dict(action_counts),
        status_counts=dict(status_counts),
        amount_recovered_this_run=round(amount_recovered_this_run, 2),
        audits=audits,
    )


@app.get("/api/metrics", response_model=MetricsResponse, tags=["metrics"])
def get_metrics() -> MetricsResponse:
    """Aggregated recovery statistics across all audit history."""
    return audit_store.metrics()


@app.get("/api/audit-trail", response_model=AuditTrailResponse, tags=["audit"])
def get_audit_trail(
    status: Optional[ExecutionResult] = Query(None, description="Filter by execution_result"),
    action: Optional[RecommendedAction] = Query(None, description="Filter by final_action"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
) -> AuditTrailResponse:
    """Paginated audit log, most recent first, optionally filtered."""
    results, total = audit_store.query(status=status, action=action, page=page, page_size=page_size)
    total_pages = (total + page_size - 1) // page_size if total else 0

    return AuditTrailResponse(
        page=page,
        page_size=page_size,
        total=total,
        total_pages=total_pages,
        results=results,
    )


@app.get("/api/audit-trail/{payment_id}", response_model=list[RecoveryAudit], tags=["audit"])
def get_payment_trace(payment_id: str) -> list[RecoveryAudit]:
    """Complete decision trace (AI -> policy -> execution) for a single payment."""
    records = audit_store.get_by_payment_id(payment_id)
    if not records:
        raise HTTPException(status_code=404, detail=f"No audit records found for payment_id={payment_id!r}")
    return records


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
