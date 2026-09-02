"""
Synthetic data generator.

Produces realistic-ish failed PaymentEvent records for `/api/run-simulation`,
including edge cases (retry_count already at the cap, high-value invoices,
abandoned carts) so the policy gate's override rules actually get exercised
in a demo run rather than sitting dormant.
"""

from __future__ import annotations

import random

from models import FailureCode, PaymentEvent, PaymentType

# Weighted so common failure modes dominate but edge cases still show up.
_FAILURE_WEIGHTS: list[tuple[FailureCode, float]] = [
    (FailureCode.CARD_DECLINED, 0.35),
    (FailureCode.TEMPORARY_NETWORK, 0.25),
    (FailureCode.INSUFFICIENT_FUNDS, 0.20),
    (FailureCode.ABANDONED_CART, 0.20),
]

_PAYMENT_TYPE_BY_FAILURE = {
    FailureCode.ABANDONED_CART: [PaymentType.CHECKOUT],
    FailureCode.TEMPORARY_NETWORK: [PaymentType.SUBSCRIPTION, PaymentType.INVOICE, PaymentType.CHECKOUT],
    FailureCode.CARD_DECLINED: [PaymentType.SUBSCRIPTION, PaymentType.INVOICE, PaymentType.CHECKOUT],
    FailureCode.INSUFFICIENT_FUNDS: [PaymentType.SUBSCRIPTION, PaymentType.INVOICE],
}


def _weighted_failure_code() -> FailureCode:
    codes, weights = zip(*_FAILURE_WEIGHTS)
    return random.choices(codes, weights=weights, k=1)[0]


def _amount_for(failure_code: FailureCode) -> float:
    # Occasionally generate a high-value transaction to exercise the
    # high-value-escalation policy rule.
    if random.random() < 0.08:
        return round(random.uniform(10_001, 50_000), 2)
    if failure_code == FailureCode.ABANDONED_CART:
        return round(random.uniform(15, 400), 2)
    return round(random.uniform(20, 4_000), 2)


def _retry_count_for(failure_code: FailureCode) -> int:
    if failure_code != FailureCode.TEMPORARY_NETWORK:
        # Only retryable failure types realistically accumulate retries.
        return 0
    # Occasionally already at/over the cap to exercise the retry-limit rule.
    return random.choices([0, 1, 2, 3], weights=[0.55, 0.2, 0.15, 0.10], k=1)[0]


def generate_synthetic_event() -> PaymentEvent:
    failure_code = _weighted_failure_code()
    payment_type = random.choice(_PAYMENT_TYPE_BY_FAILURE[failure_code])
    return PaymentEvent(
        amount=_amount_for(failure_code),
        payment_type=payment_type,
        failure_code=failure_code,
        retry_count=_retry_count_for(failure_code),
    )


def generate_batch(size: int) -> list[PaymentEvent]:
    return [generate_synthetic_event() for _ in range(size)]
