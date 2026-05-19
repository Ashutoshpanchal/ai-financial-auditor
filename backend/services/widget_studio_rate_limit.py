"""Rate limiting for Widget Studio message endpoint (per user, 60s window)."""

from __future__ import annotations

import time
from collections import defaultdict, deque

_WINDOW_SEC = 60.0
_timestamps: defaultdict[str, deque[float]] = defaultdict(deque)


class WidgetStudioRateLimited(Exception):
    """Raised when a user exceeds Widget Studio messages per minute."""

    def __init__(
        self, message: str = "Too many Widget Studio requests; try again shortly."
    ) -> None:
        super().__init__(message)
        self.message = message


def reset_widget_studio_rate_limits() -> None:
    """Clear counters (tests only)."""
    _timestamps.clear()


def check_widget_studio_message_rate_limit(user_id: str, max_per_minute: int) -> None:
    """Record one message or raise if over the limit.

    Args:
        user_id:        Authenticated user id.
        max_per_minute: Max messages per 60s; <= 0 disables limiting.
    """
    if max_per_minute <= 0:
        return
    now = time.monotonic()
    dq = _timestamps[user_id]
    while dq and now - dq[0] > _WINDOW_SEC:
        dq.popleft()
    if len(dq) >= max_per_minute:
        raise WidgetStudioRateLimited()
    dq.append(now)
