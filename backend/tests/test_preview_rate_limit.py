"""Tests for backend.services.preview_rate_limit — widget preview rate limiting."""

from __future__ import annotations

import time

import pytest

from backend.services.preview_rate_limit import (
    WidgetPreviewRateLimited,
    check_widget_preview_rate_limit,
    reset_widget_preview_rate_limits,
)


class TestWidgetPreviewRateLimitedException:
    """WidgetPreviewRateLimited exception initialization and message."""

    def test_default_message(self) -> None:
        """Raised with no args must have default message."""
        exc = WidgetPreviewRateLimited()
        assert exc.message == "Too many preview requests; try again shortly."

    def test_custom_message(self) -> None:
        """Raised with custom message must store that message."""
        custom_msg = "Custom rate limit message"
        exc = WidgetPreviewRateLimited(message=custom_msg)
        assert exc.message == custom_msg

    def test_exception_inherits_from_exception(self) -> None:
        """WidgetPreviewRateLimited must be an Exception subclass."""
        exc = WidgetPreviewRateLimited()
        assert isinstance(exc, Exception)


class TestResetWidgetPreviewRateLimits:
    """reset_widget_preview_rate_limits() clears all counters."""

    def test_reset_clears_timestamps(self) -> None:
        """After reset, no user should have any recorded timestamps."""
        # Record some attempts
        check_widget_preview_rate_limit("user-1", 100)
        check_widget_preview_rate_limit("user-2", 100)

        # Reset
        reset_widget_preview_rate_limits()

        # Verify we can record new attempts without hitting limits
        check_widget_preview_rate_limit("user-1", 1)
        check_widget_preview_rate_limit("user-2", 1)

    def test_reset_multiple_times(self) -> None:
        """Multiple resets must work correctly."""
        for _ in range(3):
            check_widget_preview_rate_limit("user-test", 100)
            reset_widget_preview_rate_limits()
            # Should be able to check again immediately after reset
            check_widget_preview_rate_limit("user-test", 1)


class TestCheckWidgetPreviewRateLimit:
    """check_widget_preview_rate_limit() enforces sliding window rate limits."""

    def setup_method(self) -> None:
        """Reset rate limits before each test."""
        reset_widget_preview_rate_limits()

    def teardown_method(self) -> None:
        """Reset rate limits after each test."""
        reset_widget_preview_rate_limits()

    def test_no_limit_when_max_is_zero(self) -> None:
        """When max_per_minute is 0, no exception should be raised."""
        # Should not raise even after "unlimited" calls
        for _ in range(100):
            check_widget_preview_rate_limit("user-1", 0)

    def test_no_limit_when_max_is_negative(self) -> None:
        """When max_per_minute is negative, no exception should be raised."""
        for _ in range(100):
            check_widget_preview_rate_limit("user-1", -1)

    def test_single_request_within_limit(self) -> None:
        """A single request when limit is 1 must succeed."""
        check_widget_preview_rate_limit("user-1", 1)

    def test_second_request_exceeds_limit_of_one(self) -> None:
        """A second request when limit is 1 must raise WidgetPreviewRateLimited."""
        check_widget_preview_rate_limit("user-1", 1)
        with pytest.raises(WidgetPreviewRateLimited):
            check_widget_preview_rate_limit("user-1", 1)

    def test_multiple_requests_within_limit(self) -> None:
        """Three requests when limit is 3 must all succeed."""
        for _ in range(3):
            check_widget_preview_rate_limit("user-1", 3)

    def test_exceeds_limit_of_three(self) -> None:
        """Fourth request when limit is 3 must raise WidgetPreviewRateLimited."""
        for _ in range(3):
            check_widget_preview_rate_limit("user-1", 3)
        with pytest.raises(WidgetPreviewRateLimited):
            check_widget_preview_rate_limit("user-1", 3)

    def test_different_users_have_independent_limits(self) -> None:
        """Two users must have independent rate limit counters."""
        # User 1 reaches limit
        for _ in range(2):
            check_widget_preview_rate_limit("user-1", 2)

        # User 1 is over limit
        with pytest.raises(WidgetPreviewRateLimited):
            check_widget_preview_rate_limit("user-1", 2)

        # User 2 must not be affected
        for _ in range(2):
            check_widget_preview_rate_limit("user-2", 2)

        # User 2 is also now over limit
        with pytest.raises(WidgetPreviewRateLimited):
            check_widget_preview_rate_limit("user-2", 2)

    def test_window_expiration_allows_new_requests(self) -> None:
        """After the 60-second window passes, old timestamps should expire and allow new requests."""
        # Record a request
        check_widget_preview_rate_limit("user-1", 1)

        # Would exceed limit
        with pytest.raises(WidgetPreviewRateLimited):
            check_widget_preview_rate_limit("user-1", 1)

        # Simulate 61 seconds passing by patching time.monotonic
        import unittest.mock as mock

        with mock.patch(
            "backend.services.preview_rate_limit.time.monotonic"
        ) as mock_time:
            # Set current time to 62 seconds ahead
            mock_time.return_value = time.monotonic() + 62

            # Now we should be able to record a new request
            check_widget_preview_rate_limit("user-1", 1)

            # And another one at the same "time" should fail
            with pytest.raises(WidgetPreviewRateLimited):
                check_widget_preview_rate_limit("user-1", 1)

    def test_large_limit_never_raises(self) -> None:
        """A very large limit (e.g., 10000) should accept many requests."""
        for _i in range(50):
            check_widget_preview_rate_limit("user-1", 10000)

    def test_limit_of_ten(self) -> None:
        """With limit of 10, exactly 10 requests should succeed, 11th should fail."""
        for _i in range(10):
            check_widget_preview_rate_limit("user-1", 10)

        # 11th request should exceed limit
        with pytest.raises(WidgetPreviewRateLimited):
            check_widget_preview_rate_limit("user-1", 10)

    def test_exception_message_in_default_case(self) -> None:
        """When WidgetPreviewRateLimited is raised, it should have a message."""
        check_widget_preview_rate_limit("user-1", 1)
        try:
            check_widget_preview_rate_limit("user-1", 1)
            pytest.fail("Expected WidgetPreviewRateLimited")
        except WidgetPreviewRateLimited as exc:
            assert exc.message == "Too many preview requests; try again shortly."

    def test_many_users_independent_counters(self) -> None:
        """Each of N users must have independent counter state."""
        users = [f"user-{i}" for i in range(10)]
        # Each user makes 2 requests, limit is 2
        for user in users:
            for _ in range(2):
                check_widget_preview_rate_limit(user, 2)

        # All should be at limit now
        for user in users:
            with pytest.raises(WidgetPreviewRateLimited):
                check_widget_preview_rate_limit(user, 2)
