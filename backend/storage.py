"""
In-memory audit store.

A small repository layer sits between the engine and whatever storage
backs it, so this in-memory implementation can be swapped for SQLite (or
Postgres) later without touching engine.py or main.py — just implement
the same three methods (`add`, `query`, `get_by_payment_id`) against a
real table with the RecoveryAudit schema.
"""

from __future__ import annotations

import threading
from collections import defaultdict
from typing import Optional

from models import ExecutionResult, MetricsResponse, RecommendedAction, RecoveryAudit


class AuditStore:
    """Thread-safe, in-process store for RecoveryAudit records."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._audits: list[RecoveryAudit] = []
        self._by_payment_id: dict[str, list[RecoveryAudit]] = defaultdict(list)

    def add(self, audit: RecoveryAudit) -> None:
        with self._lock:
            self._audits.append(audit)
            self._by_payment_id[audit.payment_id].append(audit)

    def clear(self) -> None:
        with self._lock:
            self._audits.clear()
            self._by_payment_id.clear()

    def get_by_payment_id(self, payment_id: str) -> list[RecoveryAudit]:
        with self._lock:
            return list(self._by_payment_id.get(payment_id, []))

    def query(
        self,
        status: Optional[ExecutionResult] = None,
        action: Optional[RecommendedAction] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[RecoveryAudit], int]:
        with self._lock:
            records = list(self._audits)

        if status is not None:
            records = [r for r in records if r.execution_result == status]
        if action is not None:
            records = [r for r in records if r.final_action == action]

        # Most recent first.
        records.sort(key=lambda r: r.timestamp, reverse=True)

        total = len(records)
        start = max(page - 1, 0) * page_size
        end = start + page_size
        return records[start:end], total

    def metrics(self) -> MetricsResponse:
        with self._lock:
            records = list(self._audits)

        total_at_risk = sum(r.amount for r in records)
        total_recovered = sum(r.amount_recovered for r in records)
        recovery_rate = (total_recovered / total_at_risk) if total_at_risk > 0 else 0.0

        status_counts: dict[str, int] = defaultdict(int)
        action_counts: dict[str, int] = defaultdict(int)
        for r in records:
            status_counts[r.execution_result.value] += 1
            action_counts[r.final_action.value] += 1

        return MetricsResponse(
            total_events=len(records),
            total_at_risk=round(total_at_risk, 2),
            total_recovered=round(total_recovered, 2),
            recovery_rate=round(recovery_rate, 4),
            status_counts=dict(status_counts),
            action_counts=dict(action_counts),
        )


# Single process-wide store instance. In a multi-worker deployment this
# would live behind a real database instead.
audit_store = AuditStore()
