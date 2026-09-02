"""
Data models for the Revenue Rescue Agent.

These are the Pydantic schemas shared across the ingestion, AI diagnosis,
policy gate, execution, and audit layers. Kept dependency-free (no ORM)
so the same models work whether the backing store is in-memory or SQLite.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field, field_validator


# --------------------------------------------------------------------------- #
# Enums
# --------------------------------------------------------------------------- #

class PaymentType(str, Enum):
    SUBSCRIPTION = "subscription"
    INVOICE = "invoice"
    CHECKOUT = "checkout"


class FailureCode(str, Enum):
    TEMPORARY_NETWORK = "temporary_network"
    CARD_DECLINED = "card_declined"
    INSUFFICIENT_FUNDS = "insufficient_funds"
    ABANDONED_CART = "abandoned_cart"


class RecommendedAction(str, Enum):
    RETRY = "RETRY"
    PAYMENT_LINK = "PAYMENT_LINK"
    WAIT = "WAIT"
    ESCALATE = "ESCALATE"
    STOP = "STOP"


class ExecutionResult(str, Enum):
    SUCCESS = "SUCCESS"
    FAILED = "FAILED"
    PENDING = "PENDING"
    ESCALATED = "ESCALATED"
    STOPPED = "STOPPED"


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


# --------------------------------------------------------------------------- #
# Core models
# --------------------------------------------------------------------------- #

class PaymentEvent(BaseModel):
    """A single failed (or at-risk) payment that needs to be recovered."""

    payment_id: str = Field(default_factory=lambda: _new_id("pay"))
    customer_id: str = Field(default_factory=lambda: _new_id("cust"))
    amount: float = Field(..., gt=0, description="Transaction amount at risk")
    payment_type: PaymentType
    failure_code: FailureCode
    retry_count: int = Field(0, ge=0, description="Retries already attempted before this event")
    created_at: datetime = Field(default_factory=_utc_now)

    @field_validator("amount")
    @classmethod
    def round_amount(cls, v: float) -> float:
        return round(v, 2)


class AIDiagnosis(BaseModel):
    """Output of the AI diagnosis step (LLM or heuristic fallback)."""

    payment_id: str
    classification: str = Field(..., description="Short human-readable label for the failure category")
    recommended_action: RecommendedAction
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    rationale: str = Field(..., description="One or two sentence justification for the recommendation")
    source: str = Field("heuristic", description="'llm' or 'heuristic' — which engine produced this diagnosis")


class PolicyResult(BaseModel):
    """Output of the deterministic policy/safety gate."""

    approved: bool
    overridden_action: Optional[RecommendedAction] = None
    policy_reason: str


class RecoveryAudit(BaseModel):
    """Immutable audit record for one payment's full recovery decision trace."""

    id: str = Field(default_factory=lambda: _new_id("audit"))
    timestamp: datetime = Field(default_factory=_utc_now)
    payment_id: str
    customer_id: str
    amount: float
    failure_reason: FailureCode
    ai_decision: RecommendedAction
    ai_confidence: float
    ai_rationale: str
    policy_decision: RecommendedAction
    policy_approved: bool
    policy_reason: str
    final_action: RecommendedAction
    execution_result: ExecutionResult
    amount_recovered: float = 0.0


# --------------------------------------------------------------------------- #
# API request / response schemas
# --------------------------------------------------------------------------- #

class SimulationRequest(BaseModel):
    batch_size: int = Field(100, gt=0, le=5000, description="Number of synthetic failed payments to generate")
    reset: bool = Field(False, description="If true, clears prior audit history before running")


class SimulationResponse(BaseModel):
    batch_size: int
    processed: int
    action_counts: dict[str, int]
    status_counts: dict[str, int]
    amount_recovered_this_run: float
    audits: list[RecoveryAudit]


class MetricsResponse(BaseModel):
    total_events: int
    total_at_risk: float
    total_recovered: float
    recovery_rate: float
    status_counts: dict[str, int]
    action_counts: dict[str, int]


class AuditTrailResponse(BaseModel):
    page: int
    page_size: int
    total: int
    total_pages: int
    results: list[RecoveryAudit]
