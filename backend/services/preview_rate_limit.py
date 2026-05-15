"""In-process rate limiting for dashboard widget preview (per user).

Uses a 60-second sliding window. ``0`` max in settings disables checks.
Not shared across multiple API workers; enable a non-zero limit in production
single-worker or accept approximate enforcement per process.
"""

from __future__ import annotations

import time
from collections import defaultdict, deque

_PREVIEW_WINDOW_SEC = 60.0

_timestamps: defaultdict[str, deque[float]] = defaultdict(deque)


class WidgetPreviewRateLimited(Exception):
    """Raised when a user exceeds the configured preview requests per minute."""

    def __init__(
        self, message: str = "Too many preview requests; try again shortly."
    ) -> None:
        super().__init__(message)
        self.message = message


def reset_widget_preview_rate_limits() -> None:
    """Clear all in-memory counters (for tests only)."""
    _timestamps.clear()


def check_widget_preview_rate_limit(user_id: str, max_per_minute: int) -> None:
    """Record one preview attempt for *user_id* or raise if over the limit.

    Args:
        user_id:          Authenticated user id.
        max_per_minute:   Max allowed previews in the last 60 seconds. If <= 0, no-op.

    Raises:
        WidgetPreviewRateLimited: When the limit is exceeded.
    """
    if max_per_minute <= 0:
        return

    now = time.monotonic()
    dq = _timestamps[user_id]
    while dq and now - dq[0] > _PREVIEW_WINDOW_SEC:
        dq.popleft()

    if len(dq) >= max_per_minute:
        raise WidgetPreviewRateLimited()

    dq.append(now)
