"""User-safe error messages — never expose SQL, schema, or stack details."""

from __future__ import annotations

import re

_SENSITIVE = re.compile(
    r"(sqlalchemy|psycopg2|syntax error|programmingerror|operationalerror|"
    r"from\s+transactions|transactions\.|raw_metric_sql|line\s+\d+:|"
    r"\[sql:|integrityerror|undefinedcolumn|relation\s+\")",
    re.IGNORECASE,
)

_GENERIC_CHAT = "Unable to process your message. Please try again."
_GENERIC_VALIDATION = (
    "We could not process that request. Please rephrase or adjust your filters."
)


def is_sensitive_error_message(message: str) -> bool:
    """Return True if *message* looks like an internal/database error."""
    return bool(_SENSITIVE.search(message))


def user_safe_detail(exc: Exception, *, generic: str = _GENERIC_CHAT) -> str:
    """Map an exception to a string safe to return in API ``detail`` or chat UI."""
    if isinstance(exc, ValueError):
        msg = str(exc).strip()
        if not msg or is_sensitive_error_message(msg):
            return _GENERIC_VALIDATION
        return msg
    if isinstance(exc, RuntimeError):
        msg = str(exc).strip()
        if is_sensitive_error_message(msg):
            return generic
        return generic
    return generic
