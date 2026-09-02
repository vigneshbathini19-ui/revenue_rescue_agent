"""
Deterministic safety / policy gate.

This is intentionally NOT AI-driven: it is a set of hard business rules that
validate (and, if necessary, override) whatever the AI diagnosis layer
recommends. The AI can suggest; the policy gate decides what is actually
allowed to execute. This separation is the core safety guarantee of the
system — a bad or hallucinated AI recommendation can never bypass these
rules.

Rule precedence (evaluated in order, first match wins):
    1. STOP is always approved as-is.
    2. Abandoned-cart failures may only resolve to PAYMENT_LINK or STOP.
    3. Retries are capped at MAX_RETRIES; beyond that, force ESCALATE.
    4. High-value (> HIGH_VALUE_LIMIT) transactions with a non-temporary
       failure must be escalated, never auto-retried or auto-linked.
    5. Otherwise, the AI's recommendation is approved unchanged.
"""

from __future__ import annotations

from models import AIDiagnosis, FailureCode, PaymentEvent, PolicyResult, RecommendedAction


class PolicyGate:
    """Stateless evaluator applying hard-coded business rules."""

    MAX_RETRIES: int = 2
    HIGH_VALUE_LIMIT: float = 10_000.0

    @classmethod
    def evaluate(cls, event: PaymentEvent, diagnosis: AIDiagnosis) -> PolicyResult:
        action = diagnosis.recommended_action

        # Rule 1: STOP is always honored — it is the safest possible action.
        if action == RecommendedAction.STOP:
            return PolicyResult(
                approved=True,
                overridden_action=None,
                policy_reason="STOP is always approved by policy.",
            )

        # Rule 2: Abandoned carts may only be nudged (PAYMENT_LINK) or dropped (STOP).
        if event.failure_code == FailureCode.ABANDONED_CART:
            if action not in (RecommendedAction.PAYMENT_LINK, RecommendedAction.STOP):
                return PolicyResult(
                    approved=False,
                    overridden_action=RecommendedAction.PAYMENT_LINK,
                    policy_reason=(
                        f"AI recommended {action.value} for an abandoned_cart failure, but policy "
                        "restricts abandoned carts to PAYMENT_LINK or STOP. Overriding to PAYMENT_LINK."
                    ),
                )

        # Rule 3: Retry ceiling. Never retry indefinitely.
        if action == RecommendedAction.RETRY and event.retry_count >= cls.MAX_RETRIES:
            return PolicyResult(
                approved=False,
                overridden_action=RecommendedAction.ESCALATE,
                policy_reason=(
                    f"Retry limit of {cls.MAX_RETRIES} already reached (retry_count="
                    f"{event.retry_count}). Escalating to a human instead of retrying again."
                ),
            )

        # Rule 4: High-value + non-temporary failure must go to a human.
        if event.amount > cls.HIGH_VALUE_LIMIT and event.failure_code != FailureCode.TEMPORARY_NETWORK:
            if action != RecommendedAction.ESCALATE:
                return PolicyResult(
                    approved=False,
                    overridden_action=RecommendedAction.ESCALATE,
                    policy_reason=(
                        f"Amount {event.amount:,.2f} exceeds the high-value threshold of "
                        f"{cls.HIGH_VALUE_LIMIT:,.2f} with a non-temporary failure "
                        f"({event.failure_code.value}). Forcing ESCALATE regardless of AI recommendation."
                    ),
                )

        # Default: AI recommendation satisfies every hard rule.
        return PolicyResult(
            approved=True,
            overridden_action=None,
            policy_reason="AI recommendation satisfies all policy constraints; approved as-is.",
        )

    @classmethod
    def final_action(cls, diagnosis: AIDiagnosis, result: PolicyResult) -> RecommendedAction:
        """Resolve the action that should actually be executed."""
        return result.overridden_action if not result.approved else diagnosis.recommended_action
