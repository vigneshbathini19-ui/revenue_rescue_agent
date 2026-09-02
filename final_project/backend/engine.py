"""
Pipeline orchestrator.

Wires the four stages together for a single payment event:

    PaymentEvent -> AI Diagnosis -> Policy Gate -> Execution -> RecoveryAudit

Every stage's output is captured in the audit record, so the full decision
trace (what the AI wanted, what policy allowed, what actually happened) is
always reconstructable — this is the core auditability requirement for a
system that is allowed to move money autonomously.
"""

from __future__ import annotations

from ai_diagnosis import diagnose_payment
from models import PaymentEvent, RecoveryAudit
from policy import PolicyGate
from simulator import PaymentSimulator
from storage import audit_store


def process_event(event: PaymentEvent) -> RecoveryAudit:
    """Run one payment event through the full recovery pipeline and persist the audit."""

    diagnosis = diagnose_payment(event)
    policy_result = PolicyGate.evaluate(event, diagnosis)
    final_action = PolicyGate.final_action(diagnosis, policy_result)
    execution_result, amount_recovered = PaymentSimulator.execute(event, final_action)

    audit = RecoveryAudit(
        payment_id=event.payment_id,
        customer_id=event.customer_id,
        amount=event.amount,
        failure_reason=event.failure_code,
        ai_decision=diagnosis.recommended_action,
        ai_confidence=diagnosis.confidence_score,
        ai_rationale=diagnosis.rationale,
        policy_decision=final_action,
        policy_approved=policy_result.approved,
        policy_reason=policy_result.policy_reason,
        final_action=final_action,
        execution_result=execution_result,
        amount_recovered=amount_recovered,
    )

    audit_store.add(audit)
    return audit


def process_batch(events: list[PaymentEvent]) -> list[RecoveryAudit]:
    return [process_event(event) for event in events]
