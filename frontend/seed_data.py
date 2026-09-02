#!/usr/bin/env python3
"""
seed_data.py

Generate a synthetic dataset of failed payment records that mirrors real
Indian e-commerce and SaaS payment-failure profiles.

Usage:
    python seed_data.py                 # 500 records -> data/synthetic_payments.json
    python seed_data.py --count 1000    # custom volume
    python seed_data.py --seed 42       # reproducible output

The distributions below are hand-tuned rather than uniform so the dataset
"feels" like production traffic:

* Subscriptions dominate SaaS recovery queues, one-time checkouts dominate
  e-commerce, invoices are the long tail (B2B).
* `insufficient_balance` and `abandoned_checkout` are the most common Indian
  failure modes (thin balances on UPI/debit, high cart-abandon rates),
  while `fraud_suspected` is rare.
* Amounts cluster at low ticket sizes (₹499–₹1,999) with a heavier tail for
  invoices and annual SaaS plans.
* Retry counts skew toward 0–1: most failures are caught on the first pass.
"""

from __future__ import annotations

import argparse
import json
import os
import random
from typing import Any


# --------------------------------------------------------------------------- #
# Weighted vocabularies (weights are relative, they do not need to sum to 1)   #
# --------------------------------------------------------------------------- #

PAYMENT_TYPES: list[tuple[str, float]] = [
    ("subscription", 0.42),        # SaaS recurring mandates (UPI Autopay / cards)
    ("one_time_checkout", 0.45),   # e-commerce carts
    ("invoice", 0.13),             # B2B / longer-tail billing
]

# Failure codes weighted per payment type — Indian failure realities differ
# a lot depending on whether it's a checkout, a mandate, or an invoice.
FAILURE_PROFILES: dict[str, list[tuple[str, float]]] = {
    "one_time_checkout": [
        ("abandoned_checkout", 0.40),
        ("insufficient_balance", 0.22),
        ("temporary_bank_down", 0.18),
        ("card_expired", 0.10),
        ("fraud_suspected", 0.10),
    ],
    "subscription": [
        ("insufficient_balance", 0.38),
        ("temporary_bank_down", 0.24),
        ("card_expired", 0.26),
        ("abandoned_checkout", 0.04),
        ("fraud_suspected", 0.08),
    ],
    "invoice": [
        ("insufficient_balance", 0.34),
        ("temporary_bank_down", 0.30),
        ("card_expired", 0.16),
        ("abandoned_checkout", 0.08),
        ("fraud_suspected", 0.12),
    ],
}

# Amount tiers (rupees). Each tier is (low, high, weight).
# Tuned by payment type so annual SaaS plans and invoices carry the fat tail.
AMOUNT_TIERS: dict[str, list[tuple[int, int, float]]] = {
    "one_time_checkout": [
        (499, 999, 0.34),
        (1000, 2499, 0.34),
        (2500, 4999, 0.20),
        (5000, 9999, 0.09),
        (10000, 15999, 0.03),
    ],
    "subscription": [
        (499, 999, 0.40),
        (1000, 2999, 0.30),
        (3000, 5999, 0.18),
        (6000, 11999, 0.09),
        (12000, 15999, 0.03),
    ],
    "invoice": [
        (2500, 4999, 0.20),
        (5000, 9999, 0.34),
        (10000, 13999, 0.30),
        (14000, 15999, 0.16),
    ],
}

# Retry-count distribution: most failures sit at 0-1 attempts.
RETRY_COUNTS: list[tuple[int, float]] = [
    (0, 0.46),
    (1, 0.31),
    (2, 0.16),
    (3, 0.07),
]


# --------------------------------------------------------------------------- #
# Helpers                                                                      #
# --------------------------------------------------------------------------- #

def weighted_choice(rng: random.Random, choices: list[tuple[Any, float]]) -> Any:
    """Pick one value from a list of (value, weight) pairs."""
    values = [c[0] for c in choices]
    weights = [c[1] for c in choices]
    return rng.choices(values, weights=weights, k=1)[0]


def pick_amount(rng: random.Random, payment_type: str) -> int:
    """Choose a realistic amount (in whole rupees) for a payment type."""
    tiers = AMOUNT_TIERS[payment_type]
    low, high, _ = weighted_choice(rng, [(t, t[2]) for t in tiers])
    raw = rng.randint(low, high)
    # Snap to psychologically realistic price points ending in 9.
    snapped = (raw // 10) * 10 + 9
    return min(max(snapped, 499), 15999)


def build_record(rng: random.Random, index: int) -> dict[str, Any]:
    payment_type = weighted_choice(rng, PAYMENT_TYPES)
    failure_code = weighted_choice(rng, FAILURE_PROFILES[payment_type])
    amount = pick_amount(rng, payment_type)

    # Abandoned checkouts almost never get retried automatically.
    if failure_code == "abandoned_checkout":
        retry_count = weighted_choice(rng, [(0, 0.82), (1, 0.15), (2, 0.03)])
    # Expired cards can't succeed on retry, so retries stay low.
    elif failure_code == "card_expired":
        retry_count = weighted_choice(rng, [(0, 0.6), (1, 0.3), (2, 0.1)])
    else:
        retry_count = weighted_choice(rng, RETRY_COUNTS)

    return {
        "payment_id": f"pay_rec_{1001 + index}",
        "customer_id": f"cust_{rng.randint(1000, 9999)}",
        "amount": amount,
        "payment_type": payment_type,
        "failure_code": failure_code,
        "retry_count": retry_count,
    }


def generate(count: int, seed: int | None) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    return [build_record(rng, i) for i in range(count)]


# --------------------------------------------------------------------------- #
# Entry point                                                                  #
# --------------------------------------------------------------------------- #

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate synthetic Indian failed-payment records."
    )
    parser.add_argument("--count", type=int, default=500, help="records to generate")
    parser.add_argument("--seed", type=int, default=None, help="RNG seed (reproducible)")
    parser.add_argument(
        "--out",
        type=str,
        default=os.path.join("data", "synthetic_payments.json"),
        help="output path",
    )
    args = parser.parse_args()

    records = generate(args.count, args.seed)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(records, fh, ensure_ascii=False, indent=2)

    # Quick distribution summary so you can eyeball realism.
    total = len(records)
    by_type: dict[str, int] = {}
    by_code: dict[str, int] = {}
    total_amount = 0
    for r in records:
        by_type[r["payment_type"]] = by_type.get(r["payment_type"], 0) + 1
        by_code[r["failure_code"]] = by_code.get(r["failure_code"], 0) + 1
        total_amount += r["amount"]

    print(f"Wrote {total} records to {args.out}")
    print(f"Total at-risk value: Rs {total_amount:,}")
    print("\nBy payment type:")
    for k, v in sorted(by_type.items(), key=lambda x: -x[1]):
        print(f"  {k:<20} {v:>4}  ({v / total:.0%})")
    print("\nBy failure code:")
    for k, v in sorted(by_code.items(), key=lambda x: -x[1]):
        print(f"  {k:<22} {v:>4}  ({v / total:.0%})")


if __name__ == "__main__":
    main()
