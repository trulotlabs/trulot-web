#!/usr/bin/env python3
"""Pure deterministic helpers for RS Rule Profile V0."""

from __future__ import annotations

import hashlib
import json
from datetime import date
from decimal import Decimal
from typing import Any

CONTRACT_VERSION = "rs-rule-profile-v0-2026-10-02-p58"


def canonical_bytes(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def sha256(value: Any) -> str:
    return hashlib.sha256(canonical_bytes(value)).hexdigest()


def select_version(profiles: list[dict[str, Any]], on_date: str, coastal_context: str) -> dict[str, Any]:
    when = date.fromisoformat(on_date)
    matches = []
    for profile in profiles:
        if profile["coastal_context"] != coastal_context:
            continue
        start = date.fromisoformat(profile["effective_from"])
        end = date.fromisoformat(profile["effective_through"]) if profile["effective_through"] else None
        if start <= when and (end is None or when <= end):
            matches.append(profile)
    if len(matches) != 1:
        raise ValueError(f"expected exactly one version, found {len(matches)}")
    return matches[0]


def predicate_state(required: list[str], facts: dict[str, bool | None]) -> str:
    values = [facts.get(name) for name in required]
    if any(value is False for value in values):
        return "false"
    if all(value is True for value in values):
        return "true"
    return "unknown"


def select_far_band(lot_area_sq_ft: str) -> str:
    area = Decimal(lot_area_sq_ft)
    limits = [3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000, 13000, 14000, 15000, 16000, 17000, 18000, 19000]
    values = ["0.70", "0.65", "0.60", "0.59", "0.58", "0.57", "0.56", "0.55", "0.54", "0.53", "0.52", "0.51", "0.50", "0.49", "0.48", "0.47", "0.46"]
    for limit, value in zip(limits, values):
        if area <= limit:
            return value
    return "0.45"


def rear_base(table_ft: str, lot_depth_ft: str) -> str:
    table = Decimal(table_ft)
    depth = Decimal(lot_depth_ft)
    if depth < 100:
        return str(max(Decimal("5"), depth * Decimal("0.10")))
    if depth > 150:
        return str(max(table, depth * Decimal("0.10")))
    return str(table)
