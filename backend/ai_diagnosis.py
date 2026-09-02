"""
AI diagnosis layer.

Given a failed PaymentEvent, produce an AIDiagnosis: a classification,
a recommended action, a confidence score, and a rationale.

Two code paths:
  1. LLM path (used when ANTHROPIC_API_KEY is set): calls Claude with a
     forced tool-use schema so the response is guaranteed structured JSON,
     not free text that needs fragile parsing.
  2. Heuristic fallback (always available, zero dependencies, zero cost):
     a deterministic rule-of-thumb classifier so the whole system runs
     standalone in demos, CI, or offline environments without any API key.

The policy gate downstream treats both sources identically — it never
trusts either one blindly, which is what makes the fallback safe to use
in production if the LLM provider is down.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

from models import AIDiagnosis, FailureCode, PaymentEvent, RecommendedAction

logger = logging.getLogger("revenue_rescue.ai_diagnosis")

ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")

_VALID_ACTIONS = {a.value for a in RecommendedAction}

SYSTEM_PROMPT = """You are a payments recovery analyst for a company trying to recover \
revenue from failed transactions. Given the details of one failed payment, classify the \
failure and recommend exactly one recovery action.

Allowed recommended_action values (choose exactly one):
- RETRY: attempt the same charge again automatically. Only sensible for failures that are \
likely transient (e.g. network blips), and never when a payment has already been retried \
many times.
- PAYMENT_LINK: send the customer a hosted payment link to complete or retry manually. Good \
for declined cards or abandoned checkouts where customer action is needed.
- WAIT: do nothing yet and re-check later (e.g. insufficient funds might resolve on payday).
- ESCALATE: hand off to a human recovery specialist. Use for high-value, ambiguous, or \
repeatedly-failing payments.
- STOP: abandon recovery entirely (e.g. clear fraud signal, customer explicitly churned, \
or the amount is not worth pursuing).

Respond by calling the `submit_diagnosis` tool exactly once. Do not include any other text."""

_DIAGNOSIS_TOOL = {
    "name": "submit_diagnosis",
    "description": "Submit the structured diagnosis for a failed payment.",
    "input_schema": {
        "type": "object",
        "properties": {
            "classification": {
                "type": "string",
                "description": "Short label for the failure category, e.g. 'transient network issue'.",
            },
            "recommended_action": {
                "type": "string",
                "enum": sorted(_VALID_ACTIONS),
            },
            "confidence_score": {
                "type": "number",
                "minimum": 0.0,
                "maximum": 1.0,
            },
            "rationale": {
                "type": "string",
                "description": "One or two sentences explaining the recommendation.",
            },
        },
        "required": ["classification", "recommended_action", "confidence_score", "rationale"],
    },
}


def _event_to_prompt(event: PaymentEvent) -> str:
    return json.dumps(
        {
            "payment_id": event.payment_id,
            "customer_id": event.customer_id,
            "amount": event.amount,
            "payment_type": event.payment_type.value,
            "failure_code": event.failure_code.value,
            "retry_count": event.retry_count,
        },
        indent=2,
    )


def diagnose_payment(event: PaymentEvent) -> AIDiagnosis:
    """Entry point: diagnose a single payment event, preferring the LLM if configured."""
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if api_key:
        try:
            return _diagnose_with_llm(event, api_key)
        except Exception as exc:  # noqa: BLE001 — any LLM/SDK failure falls back gracefully
            logger.warning(
                "LLM diagnosis failed for payment_id=%s (%s); falling back to heuristic.",
                event.payment_id,
                exc,
            )
    return _diagnose_with_heuristic(event)


def _diagnose_with_llm(event: PaymentEvent, api_key: str) -> AIDiagnosis:
    # Imported lazily so the `anthropic` package is only required when an API key is present.
    import anthropic  # type: ignore

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=ANTHROPIC_MODEL,
        max_tokens=512,
        system=SYSTEM_PROMPT,
        tools=[_DIAGNOSIS_TOOL],
        tool_choice={"type": "tool", "name": "submit_diagnosis"},
        messages=[{"role": "user", "content": _event_to_prompt(event)}],
    )

    tool_input: Optional[dict[str, Any]] = None
    for block in response.content:
        if getattr(block, "type", None) == "tool_use" and block.name == "submit_diagnosis":
            tool_input = block.input
            break

    if tool_input is None:
        raise ValueError("Model did not return a submit_diagnosis tool call.")

    action_str = str(tool_input["recommended_action"]).upper()
    if action_str not in _VALID_ACTIONS:
        raise ValueError(f"Model returned an invalid recommended_action: {action_str!r}")

    return AIDiagnosis(
        payment_id=event.payment_id,
        classification=str(tool_input["classification"]),
        recommended_action=RecommendedAction(action_str),
        confidence_score=float(tool_input["confidence_score"]),
        rationale=str(tool_input["rationale"]),
        source="llm",
    )


def _diagnose_with_heuristic(event: PaymentEvent) -> AIDiagnosis:
    """
    Deterministic, dependency-free stand-in for the LLM.

    Mirrors the kind of reasoning we'd expect from the model so demos and
    tests behave sensibly even with zero API access. This intentionally
    sometimes recommends things the policy gate will later reject (e.g.
    RETRY past the retry cap) — that disagreement is exactly what the
    policy gate exists to catch, and is useful to see in the audit trail.
    """

    if event.failure_code == FailureCode.TEMPORARY_NETWORK:
        if event.retry_count < 2:
            return AIDiagnosis(
                payment_id=event.payment_id,
                classification="transient network issue",
                recommended_action=RecommendedAction.RETRY,
                confidence_score=0.9,
                rationale="Temporary network failures usually clear up on their own; retrying is low-risk.",
                source="heuristic",
            )
        return AIDiagnosis(
            payment_id=event.payment_id,
            classification="persistent network issue",
            recommended_action=RecommendedAction.ESCALATE,
            confidence_score=0.6,
            rationale="Network failure has persisted across multiple retries; needs human attention.",
            source="heuristic",
        )

    if event.failure_code == FailureCode.CARD_DECLINED:
        if event.amount > 10_000:
            return AIDiagnosis(
                payment_id=event.payment_id,
                classification="high-value card decline",
                recommended_action=RecommendedAction.ESCALATE,
                confidence_score=0.7,
                rationale="Large declined charge — worth a human review before contacting the customer.",
                source="heuristic",
            )
        return AIDiagnosis(
            payment_id=event.payment_id,
            classification="card declined",
            recommended_action=RecommendedAction.PAYMENT_LINK,
            confidence_score=0.8,
            rationale="A hosted payment link lets the customer supply a different card.",
            source="heuristic",
        )

    if event.failure_code == FailureCode.INSUFFICIENT_FUNDS:
        return AIDiagnosis(
            payment_id=event.payment_id,
            classification="insufficient funds",
            recommended_action=RecommendedAction.WAIT,
            confidence_score=0.65,
            rationale="Funds often become available within days; waiting avoids extra decline fees.",
            source="heuristic",
        )

    if event.failure_code == FailureCode.ABANDONED_CART:
        return AIDiagnosis(
            payment_id=event.payment_id,
            classification="abandoned checkout",
            recommended_action=RecommendedAction.PAYMENT_LINK,
            confidence_score=0.55,
            rationale="A reminder payment link is the standard, low-friction nudge for abandoned carts.",
            source="heuristic",
        )

    # Should be unreachable given the FailureCode enum, but fail safe.
    return AIDiagnosis(
        payment_id=event.payment_id,
        classification="unknown failure",
        recommended_action=RecommendedAction.ESCALATE,
        confidence_score=0.3,
        rationale="Unrecognized failure code; defaulting to human escalation for safety.",
        source="heuristic",
    )
