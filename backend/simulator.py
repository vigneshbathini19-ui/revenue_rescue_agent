"""
Execution engine / mock payment processor.

Given a *final* action (already cleared by the policy gate), this module
simulates what would happen if we actually attempted that recovery action
against a real payment processor (Stripe, Adyen, etc.). No real network
calls are made — outcomes are drawn from probability distributions that
approximate real-world recovery rates.
"""

from __future__ import annotations

import random
from typing import Tuple

from models import ExecutionResult, FailureCode, PaymentEvent, RecommendedAction


class PaymentSimulator:
    """Stateless simulator mapping (action, failure context) -> outcome."""

    # Recovery probabilities, tuned to the spec:
    RETRY_TEMPORARY_SUCCESS_RATE = 0.70
    RETRY_OTHER_SUCCESS_RATE = 0.20  # lower odds when retrying a non-transient failure
    PAYMENT_LINK_DECLINED_OR_ABANDONED_RATE = 0.45
    PAYMENT_LINK_OTHER_RATE = 0.30

    @classmethod
    def execute(
        cls, event: PaymentEvent, final_action: RecommendedAction
    ) -> Tuple[ExecutionResult, float]:
        """Execute `final_action` against `event`; returns (result, amount_recovered)."""

        if final_action == RecommendedAction.RETRY:
            return cls._execute_retry(event)

        if final_action == RecommendedAction.PAYMENT_LINK:
            return cls._execute_payment_link(event)

        if final_action == RecommendedAction.WAIT:
            # No money moves yet; outcome is deferred.
            return ExecutionResult.PENDING, 0.0

        if final_action == RecommendedAction.ESCALATE:
            # Handed to a human agent; no immediate revenue.
            return ExecutionResult.ESCALATED, 0.0

        if final_action == RecommendedAction.STOP:
            # Deliberately abandoned — e.g. fraud risk or customer opted out.
            return ExecutionResult.STOPPED, 0.0

        raise ValueError(f"Unsupported action for execution: {final_action!r}")

    @classmethod
    def _execute_retry(cls, event: PaymentEvent) -> Tuple[ExecutionResult, float]:
        success_rate = (
            cls.RETRY_TEMPORARY_SUCCESS_RATE
            if event.failure_code == FailureCode.TEMPORARY_NETWORK
            else cls.RETRY_OTHER_SUCCESS_RATE
        )
        if random.random() < success_rate:
            return ExecutionResult.SUCCESS, event.amount
        return ExecutionResult.FAILED, 0.0

    @classmethod
    def _execute_payment_link(cls, event: PaymentEvent) -> Tuple[ExecutionResult, float]:
        success_rate = (
            cls.PAYMENT_LINK_DECLINED_OR_ABANDONED_RATE
            if event.failure_code in (FailureCode.CARD_DECLINED, FailureCode.ABANDONED_CART)
            else cls.PAYMENT_LINK_OTHER_RATE
        )
        if random.random() < success_rate:
            return ExecutionResult.SUCCESS, event.amount
        return ExecutionResult.FAILED, 0.0
