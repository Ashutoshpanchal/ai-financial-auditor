"""Resolve ``{{placeholder}}`` tokens in widget query_config before SQL execution."""

from __future__ import annotations

import copy
import re
from calendar import monthrange
from dataclasses import dataclass
from datetime import date
from typing import Any

# Filter values equal to these tokens are resolved at preview/dashboard runtime.
PLACEHOLDER_DATE_FROM = "{{date_from}}"
PLACEHOLDER_DATE_TO = "{{date_to}}"
PLACEHOLDER_BANK_NAME = "{{bank_name}}"
PLACEHOLDER_CATEGORY = "{{category}}"
PLACEHOLDER_PARENT_CATEGORY = "{{parent_category}}"
PLACEHOLDER_SUB_CATEGORY = "{{sub_category}}"

_KNOWN_PLACEHOLDERS: frozenset[str] = frozenset(
    {
        PLACEHOLDER_DATE_FROM,
        PLACEHOLDER_DATE_TO,
        PLACEHOLDER_BANK_NAME,
        PLACEHOLDER_CATEGORY,
        PLACEHOLDER_PARENT_CATEGORY,
        PLACEHOLDER_SUB_CATEGORY,
    }
)

_PLACEHOLDER_RE = re.compile(r"^\{\{[a-z_]+\}\}$")


@dataclass(frozen=True)
class ResolvedWidgetRuntime:
    """Runtime filter values after placeholder resolution."""

    date_from: date | None
    date_to: date | None
    bank_name: str | None
    category: str | None
    parent_category: str | None
    sub_category: str | None


def is_placeholder_token(value: Any) -> bool:
    """Return True if *value* is a known ``{{...}}`` placeholder string."""
    return isinstance(value, str) and value in _KNOWN_PLACEHOLDERS


def _current_month_bounds(today: date | None = None) -> tuple[date, date]:
    """Return inclusive first/last day of the current calendar month."""
    ref = today or date.today()
    last = monthrange(ref.year, ref.month)[1]
    return date(ref.year, ref.month, 1), date(ref.year, ref.month, last)


def _parse_date_str(value: str | None) -> date | None:
    """Parse YYYY-MM-DD or return None for empty input."""
    if not value or not str(value).strip():
        return None
    return date.fromisoformat(str(value).strip())


def _resolve_filter_value(
    key: str,
    raw: Any,
    *,
    runtime_date_from: date | None,
    runtime_date_to: date | None,
    runtime_bank_name: str | None,
    runtime_category: str | None,
    runtime_parent_category: str | None,
    runtime_sub_category: str | None,
    default_month_for_preview: bool,
) -> tuple[
    Any | None, date | None, date | None, str | None, str | None, str | None, str | None
]:
    """Resolve one filter entry; may promote dates out of filters dict.

    Returns:
        Tuple of (resolved_filter_value_or_none_to_omit, extra_date_from, extra_date_to,
        extra_bank, extra_category, extra_parent, extra_sub).
    """
    extra_dates: tuple[date | None, date | None] = (None, None)
    extra_bank: str | None = None
    extra_cat: str | None = None
    extra_parent: str | None = None
    extra_sub: str | None = None

    if not isinstance(raw, str):
        return raw, *extra_dates, extra_bank, extra_cat, extra_parent, extra_sub

    if raw == PLACEHOLDER_DATE_FROM:
        resolved = runtime_date_from
        if resolved is None and default_month_for_preview:
            resolved, _ = _current_month_bounds()
        return (None, resolved, None, None, None, None, None)

    if raw == PLACEHOLDER_DATE_TO:
        resolved = runtime_date_to
        if resolved is None and default_month_for_preview:
            _, resolved = _current_month_bounds()
        return (None, None, resolved, None, None, None, None)

    if raw == PLACEHOLDER_BANK_NAME:
        extra_bank = runtime_bank_name if runtime_bank_name else None
        return (None, None, None, extra_bank, None, None, None)

    if raw == PLACEHOLDER_CATEGORY:
        extra_cat = runtime_category if runtime_category else None
        return (None, None, None, None, extra_cat, None, None)

    if raw == PLACEHOLDER_PARENT_CATEGORY:
        extra_parent = runtime_parent_category if runtime_parent_category else None
        return (None, None, None, None, None, extra_parent, None)

    if raw == PLACEHOLDER_SUB_CATEGORY:
        extra_sub = runtime_sub_category if runtime_sub_category else None
        return (None, None, None, None, None, None, extra_sub)

    if _PLACEHOLDER_RE.match(raw) and raw not in _KNOWN_PLACEHOLDERS:
        raise ValueError(f"Unknown placeholder token: {raw}")

    return raw, None, None, None, None, None, None


def resolve_query_config_placeholders(
    config: dict[str, Any],
    *,
    date_from: date | None = None,
    date_to: date | None = None,
    bank_name: str | None = None,
    category: str | None = None,
    parent_category: str | None = None,
    sub_category: str | None = None,
    default_month_for_preview: bool = False,
) -> tuple[dict[str, Any], ResolvedWidgetRuntime]:
    """Return a copy of *config* with placeholders resolved and runtime bounds merged.

    Global runtime parameters win over config-level filter literals. Placeholder
    filter entries promote into runtime bounds when the caller did not already set them.

    Args:
        config:                  Widget ``query_config`` (may contain placeholders).
        date_from:               FilterBar / query-param lower date bound.
        date_to:                 FilterBar / query-param upper date bound.
        bank_name:               Optional bank filter from UI.
        category:                Optional legacy category filter from UI.
        parent_category:         Optional parent category filter from UI.
        sub_category:            Optional sub-category filter from UI.
        default_month_for_preview: When True, unresolved ``{{date_from}}`` / ``{{date_to}}``
                                   default to the current calendar month (preview only).

    Returns:
        Tuple of resolved config dict and merged runtime filters.

    Raises:
        ValueError: If an unknown placeholder token appears in filters.
    """
    resolved = copy.deepcopy(config)
    eff_from = date_from
    eff_to = date_to
    eff_bank = bank_name.strip() if bank_name and bank_name.strip() else None
    eff_cat = category.strip() if category and category.strip() else None
    eff_parent = (
        parent_category.strip() if parent_category and parent_category.strip() else None
    )
    eff_sub = sub_category.strip() if sub_category and sub_category.strip() else None

    cfg_filters: dict[str, Any] = dict(resolved.get("filters") or {})
    new_filters: dict[str, Any] = {}

    for key, raw in cfg_filters.items():
        if key in ("date_from", "date_to"):
            val, d_from, d_to, b, c, p, s = _resolve_filter_value(
                key,
                raw,
                runtime_date_from=eff_from,
                runtime_date_to=eff_to,
                runtime_bank_name=eff_bank,
                runtime_category=eff_cat,
                runtime_parent_category=eff_parent,
                runtime_sub_category=eff_sub,
                default_month_for_preview=default_month_for_preview,
            )
            if d_from is not None and eff_from is None:
                eff_from = d_from
            if d_to is not None and eff_to is None:
                eff_to = d_to
            if val is not None:
                new_filters[key] = val
            continue

        val, d_from, d_to, b, c, p, s = _resolve_filter_value(
            key,
            raw,
            runtime_date_from=eff_from,
            runtime_date_to=eff_to,
            runtime_bank_name=eff_bank,
            runtime_category=eff_cat,
            runtime_parent_category=eff_parent,
            runtime_sub_category=eff_sub,
            default_month_for_preview=default_month_for_preview,
        )
        if d_from is not None and eff_from is None:
            eff_from = d_from
        if d_to is not None and eff_to is None:
            eff_to = d_to
        if b is not None and eff_bank is None:
            eff_bank = b
        if c is not None and eff_cat is None:
            eff_cat = c
        if p is not None and eff_parent is None:
            eff_parent = p
        if s is not None and eff_sub is None:
            eff_sub = s
        if val is not None and val != "":
            new_filters[key] = val

    if new_filters:
        resolved["filters"] = new_filters
    elif "filters" in resolved:
        resolved["filters"] = {}

    runtime = ResolvedWidgetRuntime(
        date_from=eff_from,
        date_to=eff_to,
        bank_name=eff_bank,
        category=eff_cat,
        parent_category=eff_parent,
        sub_category=eff_sub,
    )
    return resolved, runtime


def validate_placeholder_filter_values(config: dict[str, Any]) -> None:
    """Ensure filter string values are literals, known placeholders, or credit/debit.

    Args:
        config: Widget query_config dict.

    Raises:
        ValueError: If a filter value is an invalid placeholder.
    """
    cfg_filters: dict[str, Any] = config.get("filters") or {}
    for key, raw in cfg_filters.items():
        if raw is None:
            continue
        if not isinstance(raw, str):
            raise ValueError(f"filters.{key} must be a string or null.")
        if raw in _KNOWN_PLACEHOLDERS:
            continue
        if key == "transaction_type" and raw in ("credit", "debit"):
            continue
        if _PLACEHOLDER_RE.match(raw):
            raise ValueError(f"Unknown placeholder in filters.{key}: {raw}")
