"""Tests for backend.routers.categories — category management endpoints and helpers."""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.routers.categories import (
    PAYMENT_METHODS,
    _build_category_hierarchy,
    _build_llm,
    _hierarchy_to_text,
    _parse_llm_json,
    router as categories_router,
)

# ---------------------------------------------------------------------------
# Helper: _build_category_hierarchy
# ---------------------------------------------------------------------------


class TestBuildCategoryHierarchy:
    """Tests for the category hierarchy builder."""

    def _make_row(self, parent: str, sub: str) -> MagicMock:
        """Return a mock CategoryMaster row."""
        row = MagicMock()
        row.parent_category = parent
        row.sub_category = sub
        return row

    def test_single_parent_single_sub(self) -> None:
        """A single row should produce a single-key dict with one sub-category."""
        rows = [self._make_row("Food & Dining", "Swiggy")]
        result = _build_category_hierarchy(rows)
        assert result == {"Food & Dining": ["Swiggy"]}

    def test_single_parent_multiple_subs(self) -> None:
        """Multiple rows with the same parent should be grouped under one key."""
        rows = [
            self._make_row("Food & Dining", "Swiggy"),
            self._make_row("Food & Dining", "Zomato"),
            self._make_row("Food & Dining", "Blinkit"),
        ]
        result = _build_category_hierarchy(rows)
        assert result == {"Food & Dining": ["Swiggy", "Zomato", "Blinkit"]}

    def test_multiple_parents(self) -> None:
        """Rows with different parents should produce separate keys."""
        rows = [
            self._make_row("Food & Dining", "Swiggy"),
            self._make_row("Transport", "Uber"),
            self._make_row("Entertainment", "Netflix"),
        ]
        result = _build_category_hierarchy(rows)
        assert result["Food & Dining"] == ["Swiggy"]
        assert result["Transport"] == ["Uber"]
        assert result["Entertainment"] == ["Netflix"]

    def test_empty_rows_returns_empty_dict(self) -> None:
        """Empty input should return an empty dict."""
        assert _build_category_hierarchy([]) == {}

    def test_preserves_insertion_order(self) -> None:
        """Sub-categories should appear in the order they were inserted."""
        rows = [
            self._make_row("Shopping", "Amazon"),
            self._make_row("Shopping", "Flipkart"),
            self._make_row("Shopping", "Myntra"),
        ]
        result = _build_category_hierarchy(rows)
        assert result["Shopping"] == ["Amazon", "Flipkart", "Myntra"]


# ---------------------------------------------------------------------------
# Helper: _hierarchy_to_text
# ---------------------------------------------------------------------------


class TestHierarchyToText:
    """Tests for the hierarchy-to-text converter."""

    def test_single_entry(self) -> None:
        """Single parent with one sub should produce one line."""
        hierarchy = {"Food & Dining": ["Swiggy"]}
        result = _hierarchy_to_text(hierarchy)
        assert result == "Food & Dining: Swiggy"

    def test_multiple_subs_joined_by_comma(self) -> None:
        """Multiple subs should be joined with ', '."""
        hierarchy = {"Food & Dining": ["Swiggy", "Zomato", "Blinkit"]}
        result = _hierarchy_to_text(hierarchy)
        assert result == "Food & Dining: Swiggy, Zomato, Blinkit"

    def test_multiple_parents_each_on_own_line(self) -> None:
        """Each parent should appear on its own line."""
        hierarchy = {
            "Food & Dining": ["Swiggy"],
            "Transport": ["Uber"],
        }
        result = _hierarchy_to_text(hierarchy)
        lines = result.split("\n")
        assert len(lines) == 2
        assert "Food & Dining: Swiggy" in lines
        assert "Transport: Uber" in lines

    def test_empty_hierarchy_returns_empty_string(self) -> None:
        """Empty hierarchy should return an empty string."""
        assert _hierarchy_to_text({}) == ""


# ---------------------------------------------------------------------------
# Helper: _parse_llm_json
# ---------------------------------------------------------------------------


class TestParseLlmJson:
    """Tests for the LLM JSON response parser."""

    def test_plain_json_array(self) -> None:
        """Plain JSON array without fences should parse correctly."""
        raw = '[{"description": "Swiggy", "parent_category": "Food & Dining", "sub_category": "Food Delivery", "payment_method": "UPI"}]'
        result = _parse_llm_json(raw)
        assert len(result) == 1
        assert result[0]["description"] == "Swiggy"
        assert result[0]["parent_category"] == "Food & Dining"

    def test_json_with_triple_backtick_fence(self) -> None:
        """JSON wrapped in ```json ... ``` fences should be stripped before parsing."""
        raw = '```json\n[{"description": "Netflix", "parent_category": "Entertainment", "sub_category": "Streaming", "payment_method": "Credit Card"}]\n```'
        result = _parse_llm_json(raw)
        assert len(result) == 1
        assert result[0]["description"] == "Netflix"

    def test_json_with_plain_backtick_fence(self) -> None:
        """JSON wrapped in ``` ... ``` without language hint should parse."""
        raw = '```\n[{"description": "Uber", "parent_category": "Transport", "sub_category": "Cab", "payment_method": "UPI"}]\n```'
        result = _parse_llm_json(raw)
        assert len(result) == 1
        assert result[0]["description"] == "Uber"

    def test_empty_array(self) -> None:
        """Empty JSON array should return an empty list."""
        assert _parse_llm_json("[]") == []

    def test_multiple_items(self) -> None:
        """Array with multiple items should parse all of them."""
        raw = json.dumps(
            [
                {
                    "description": "A",
                    "parent_category": "X",
                    "sub_category": "Y",
                    "payment_method": "UPI",
                },
                {
                    "description": "B",
                    "parent_category": "X",
                    "sub_category": "Z",
                    "payment_method": "NEFT",
                },
            ]
        )
        result = _parse_llm_json(raw)
        assert len(result) == 2
        assert result[0]["description"] == "A"
        assert result[1]["description"] == "B"

    def test_invalid_json_raises_json_decode_error(self) -> None:
        """Malformed JSON should raise json.JSONDecodeError."""
        with pytest.raises(json.JSONDecodeError):
            _parse_llm_json("not valid json at all")

    def test_whitespace_around_json_is_handled(self) -> None:
        """Leading/trailing whitespace around a valid JSON array should be stripped."""
        raw = '   \n[{"description": "Trim", "parent_category": "P", "sub_category": "S", "payment_method": "Cash"}]\n   '
        result = _parse_llm_json(raw)
        assert result[0]["description"] == "Trim"


# ---------------------------------------------------------------------------
# Helper: _build_llm
# ---------------------------------------------------------------------------


class TestBuildLlm:
    """Tests for the LLM factory helper."""

    def test_returns_chat_openai_instance(self) -> None:
        """_build_llm should return a ChatOpenAI instance configured for OpenRouter."""
        with patch("backend.routers.categories.ChatOpenAI") as mock_cls:
            mock_instance = MagicMock()
            mock_cls.return_value = mock_instance

            settings = MagicMock()
            settings.openrouter_model = "test-model"
            settings.openrouter_api_key = "test-key"
            settings.openrouter_base_url = "https://openrouter.ai/api/v1"

            result = _build_llm(settings)

            mock_cls.assert_called_once_with(
                model="test-model",
                api_key="test-key",
                base_url="https://openrouter.ai/api/v1",
                temperature=0.1,
            )
            assert result is mock_instance


# ---------------------------------------------------------------------------
# Endpoint: GET /categories/payment-methods
# ---------------------------------------------------------------------------


class TestPaymentMethodsConstant:
    """Tests for the PAYMENT_METHODS constant used by the endpoint."""

    def test_payment_methods_is_list(self) -> None:
        """PAYMENT_METHODS must be a list."""
        assert isinstance(PAYMENT_METHODS, list)

    def test_payment_methods_not_empty(self) -> None:
        """PAYMENT_METHODS must contain at least one method."""
        assert len(PAYMENT_METHODS) > 0

    def test_upi_in_payment_methods(self) -> None:
        """UPI must be in the payment methods list."""
        assert "UPI" in PAYMENT_METHODS

    def test_all_methods_are_strings(self) -> None:
        """Every payment method label must be a non-empty string."""
        for method in PAYMENT_METHODS:
            assert isinstance(method, str)
            assert len(method) > 0

    def test_known_methods_present(self) -> None:
        """Spot-check well-known methods are all present."""
        expected = {
            "UPI",
            "NEFT",
            "IMPS",
            "Net Banking",
            "Credit Card",
            "Debit Card",
            "Cheque",
            "Auto-debit",
            "Cash",
            "Salary Credit",
            "Other",
        }
        assert expected.issubset(set(PAYMENT_METHODS))


# ---------------------------------------------------------------------------
# Endpoint: GET /categories/master  (via TestClient)
# ---------------------------------------------------------------------------


def _make_mock_db_with_master_rows(rows: list) -> MagicMock:
    """Return a mock Session whose select(CategoryMaster) returns the given rows."""
    db = MagicMock()
    execute_result = MagicMock()
    execute_result.scalars.return_value.all.return_value = rows
    db.execute.return_value = execute_result
    return db


def _make_mock_category_master_row(
    row_id: str,
    parent: str,
    sub: str,
    *,
    user_id: str | None = None,
) -> MagicMock:
    """Create a minimal mock CategoryMaster row."""
    row = MagicMock()
    row.id = row_id
    row.parent_category = parent
    row.sub_category = sub
    row.user_id = user_id
    return row


class TestListCategoryMasterEndpoint:
    """Unit tests for list_category_master via direct function call."""

    def _user(self, user_id: str = "user-1") -> MagicMock:
        u = MagicMock()
        u.id = user_id
        return u

    def test_returns_grouped_by_parent(self) -> None:
        """list_category_master must group sub-categories under parent keys."""
        from backend.routers.categories import list_category_master

        rows = [
            _make_mock_category_master_row("id-1", "Food & Dining", "Swiggy"),
            _make_mock_category_master_row("id-2", "Food & Dining", "Zomato"),
            _make_mock_category_master_row("id-3", "Transport", "Uber"),
        ]
        db = _make_mock_db_with_master_rows(rows)

        result = list_category_master(db=db, current_user=self._user())

        assert "Food & Dining" in result
        assert "Transport" in result
        assert len(result["Food & Dining"]) == 2
        assert len(result["Transport"]) == 1

    def test_each_sub_entry_has_id_sub_category_and_is_global(self) -> None:
        """Each item in the result must have id, sub_category, and is_global keys."""
        from backend.routers.categories import list_category_master

        rows = [_make_mock_category_master_row("id-1", "Shopping", "Amazon")]
        db = _make_mock_db_with_master_rows(rows)

        result = list_category_master(db=db, current_user=self._user())
        entry = result["Shopping"][0]

        assert entry["id"] == "id-1"
        assert entry["sub_category"] == "Amazon"
        assert entry["is_global"] is True

    def test_user_row_overrides_global_for_same_parent_sub(self) -> None:
        """When the same (parent, sub) exists globally and for the user, the user's id is returned."""
        from backend.routers.categories import list_category_master

        rows = [
            _make_mock_category_master_row(
                "global-1", "Food & Dining", "Swiggy", user_id=None
            ),
            _make_mock_category_master_row(
                "user-1", "Food & Dining", "Swiggy", user_id="user-1"
            ),
        ]
        db = _make_mock_db_with_master_rows(rows)

        result = list_category_master(db=db, current_user=self._user("user-1"))
        subs = result["Food & Dining"]
        assert len(subs) == 1
        assert subs[0]["id"] == "user-1"
        assert subs[0]["is_global"] is False

    def test_empty_table_returns_empty_dict(self) -> None:
        """An empty category_master table should return an empty dict."""
        from backend.routers.categories import list_category_master

        db = _make_mock_db_with_master_rows([])
        result = list_category_master(db=db, current_user=self._user())
        assert result == {}


# ---------------------------------------------------------------------------
# Endpoint: GET /categories/master/split  (direct function call)
# ---------------------------------------------------------------------------


class TestListCategoryMasterSplitEndpoint:
    """Unit tests for list_category_master_split."""

    def _user(self, user_id: str = "user-1") -> MagicMock:
        u = MagicMock()
        u.id = user_id
        return u

    def test_split_returns_merged_builtin_and_user_defined_keys(self) -> None:
        """Split response must expose merged, builtin, and user_defined."""
        from backend.routers.categories import list_category_master_split

        rows = [
            _make_mock_category_master_row(
                "g-1", "Food & Dining", "Swiggy", user_id=None
            ),
            _make_mock_category_master_row(
                "u-1", "Food & Dining", "Swiggy", user_id="user-1"
            ),
        ]
        db = _make_mock_db_with_master_rows(rows)

        result = list_category_master_split(db=db, current_user=self._user("user-1"))

        assert set(result.keys()) == {"merged", "builtin", "user_defined"}

    def test_builtin_lists_only_seed_rows(self) -> None:
        """builtin must include global rows even when user overrides the same pair."""
        from backend.routers.categories import list_category_master_split

        rows = [
            _make_mock_category_master_row(
                "global-1", "Food & Dining", "Swiggy", user_id=None
            ),
            _make_mock_category_master_row(
                "user-1", "Food & Dining", "Swiggy", user_id="user-1"
            ),
        ]
        db = _make_mock_db_with_master_rows(rows)

        result = list_category_master_split(db=db, current_user=self._user("user-1"))
        builtin_subs = result["builtin"]["Food & Dining"]
        assert len(builtin_subs) == 1
        assert builtin_subs[0]["id"] == "global-1"
        assert builtin_subs[0]["is_global"] is True

    def test_user_defined_lists_only_current_user_rows(self) -> None:
        """user_defined must list only rows owned by the current user."""
        from backend.routers.categories import list_category_master_split

        rows = [
            _make_mock_category_master_row(
                "global-1", "Food & Dining", "Swiggy", user_id=None
            ),
            _make_mock_category_master_row(
                "user-1", "Food & Dining", "Swiggy", user_id="user-1"
            ),
        ]
        db = _make_mock_db_with_master_rows(rows)

        result = list_category_master_split(db=db, current_user=self._user("user-1"))
        user_subs = result["user_defined"]["Food & Dining"]
        assert len(user_subs) == 1
        assert user_subs[0]["id"] == "user-1"
        assert user_subs[0]["is_global"] is False

    def test_merged_matches_list_category_master(self) -> None:
        """merged view should match deduped GET /categories/master behavior."""
        from backend.routers.categories import (
            list_category_master,
            list_category_master_split,
        )

        rows = [
            _make_mock_category_master_row(
                "global-1", "Food & Dining", "Swiggy", user_id=None
            ),
            _make_mock_category_master_row(
                "user-1", "Food & Dining", "Swiggy", user_id="user-1"
            ),
        ]
        db = _make_mock_db_with_master_rows(rows)
        user = self._user("user-1")

        merged = list_category_master_split(db=db, current_user=user)["merged"]
        direct = list_category_master(db=db, current_user=user)
        assert merged == direct


# ---------------------------------------------------------------------------
# Endpoint: POST /categories/master  (direct function call)
# ---------------------------------------------------------------------------


class TestCreateCategoryMasterEntry:
    """Unit tests for create_category_master_entry."""

    def _make_db_no_existing(self) -> MagicMock:
        """DB mock that finds no duplicate (scalar_one_or_none returns None)."""
        db = MagicMock()
        execute_result = MagicMock()
        execute_result.scalar_one_or_none.return_value = None
        db.execute.return_value = execute_result
        db.add = MagicMock()
        db.commit = MagicMock()
        db.refresh = MagicMock()
        return db

    def _make_db_with_existing(self) -> MagicMock:
        """DB mock that finds an existing duplicate row."""
        db = MagicMock()
        execute_result = MagicMock()
        execute_result.scalar_one_or_none.return_value = MagicMock()  # exists
        db.execute.return_value = execute_result
        return db

    def _make_user(self, user_id: str = "user-abc") -> MagicMock:
        user = MagicMock()
        user.id = user_id
        return user

    def test_creates_entry_successfully(self) -> None:
        """Valid body should create and return the new entry."""
        from backend.routers.categories import create_category_master_entry

        db = self._make_db_no_existing()
        user = self._make_user()

        # Simulate db.refresh populating the entry attributes
        def fake_refresh(entry):
            entry.id = "generated-uuid"
            entry.created_at = "2024-01-01T00:00:00"

        db.refresh.side_effect = fake_refresh

        result = create_category_master_entry(
            body={"parent_category": "Food & Dining", "sub_category": "Blinkit"},
            db=db,
            current_user=user,
        )

        assert result["parent_category"] == "Food & Dining"
        assert result["sub_category"] == "Blinkit"
        assert result["updated_by"] == user.id
        db.add.assert_called_once()
        db.commit.assert_called_once()

    def test_raises_422_when_parent_category_missing(self) -> None:
        """Missing parent_category should raise HTTP 422."""
        from fastapi import HTTPException

        from backend.routers.categories import create_category_master_entry

        db = self._make_db_no_existing()
        user = self._make_user()

        with pytest.raises(HTTPException) as exc_info:
            create_category_master_entry(
                body={"sub_category": "Blinkit"},
                db=db,
                current_user=user,
            )
        assert exc_info.value.status_code == 422

    def test_raises_422_when_sub_category_missing(self) -> None:
        """Missing sub_category should raise HTTP 422."""
        from fastapi import HTTPException

        from backend.routers.categories import create_category_master_entry

        db = self._make_db_no_existing()
        user = self._make_user()

        with pytest.raises(HTTPException) as exc_info:
            create_category_master_entry(
                body={"parent_category": "Food & Dining"},
                db=db,
                current_user=user,
            )
        assert exc_info.value.status_code == 422

    def test_raises_422_when_both_fields_empty_strings(self) -> None:
        """Blank string fields should raise HTTP 422."""
        from fastapi import HTTPException

        from backend.routers.categories import create_category_master_entry

        db = self._make_db_no_existing()
        user = self._make_user()

        with pytest.raises(HTTPException) as exc_info:
            create_category_master_entry(
                body={"parent_category": "  ", "sub_category": "  "},
                db=db,
                current_user=user,
            )
        assert exc_info.value.status_code == 422

    def test_raises_409_when_entry_already_exists(self) -> None:
        """Duplicate entry should raise HTTP 409."""
        from fastapi import HTTPException

        from backend.routers.categories import create_category_master_entry

        db = self._make_db_with_existing()
        user = self._make_user()

        with pytest.raises(HTTPException) as exc_info:
            create_category_master_entry(
                body={"parent_category": "Food & Dining", "sub_category": "Swiggy"},
                db=db,
                current_user=user,
            )
        assert exc_info.value.status_code == 409

    def test_strips_whitespace_from_inputs(self) -> None:
        """Leading/trailing whitespace in body fields should be stripped."""
        from backend.routers.categories import create_category_master_entry

        db = self._make_db_no_existing()
        user = self._make_user()

        def fake_refresh(entry):
            entry.id = "generated-uuid"
            entry.created_at = "2024-01-01T00:00:00"

        db.refresh.side_effect = fake_refresh

        result = create_category_master_entry(
            body={
                "parent_category": "  Food & Dining  ",
                "sub_category": "  Blinkit  ",
            },
            db=db,
            current_user=user,
        )

        assert result["parent_category"] == "Food & Dining"
        assert result["sub_category"] == "Blinkit"


# ---------------------------------------------------------------------------
# Endpoint: PATCH /categories/master/{entry_id}  (direct function call)
# ---------------------------------------------------------------------------


class TestUpdateCategoryMasterEntry:
    """Unit tests for update_category_master_entry."""

    def test_renames_user_row_and_updates_descriptions(self) -> None:
        """PATCH should update description_categories then master row and commit."""
        from backend.routers.categories import update_category_master_entry

        existing = MagicMock()
        existing.id = "entry-1"
        existing.user_id = "user-1"
        existing.parent_category = "OldParent"
        existing.sub_category = "OldSub"

        select_entry = MagicMock()
        select_entry.scalar_one_or_none.return_value = existing
        select_dup = MagicMock()
        select_dup.scalar_one_or_none.return_value = None
        update_result = MagicMock()

        db = MagicMock()
        db.execute.side_effect = [select_entry, select_dup, update_result]
        db.commit = MagicMock()
        db.refresh = MagicMock()

        user = MagicMock()
        user.id = "user-1"

        with patch("backend.routers.categories.set_rls_user"):
            result = update_category_master_entry(
                entry_id="entry-1",
                body={"parent_category": "NewParent", "sub_category": "NewSub"},
                db=db,
                current_user=user,
            )

        assert result["parent_category"] == "NewParent"
        assert result["sub_category"] == "NewSub"
        assert db.execute.call_count == 3
        db.commit.assert_called_once()

    def test_raises_403_for_global_seed_entry(self) -> None:
        """Seed rows (user_id NULL) cannot be renamed."""
        from fastapi import HTTPException

        from backend.routers.categories import update_category_master_entry

        existing = MagicMock()
        existing.user_id = None

        select_result = MagicMock()
        select_result.scalar_one_or_none.return_value = existing
        db = MagicMock()
        db.execute.return_value = select_result
        user = MagicMock()
        user.id = "user-1"

        with (
            pytest.raises(HTTPException) as exc_info,
            patch("backend.routers.categories.set_rls_user"),
        ):
            update_category_master_entry(
                entry_id="seed-id",
                body={"parent_category": "A", "sub_category": "B"},
                db=db,
                current_user=user,
            )

        assert exc_info.value.status_code == 403

    def test_raises_404_when_entry_missing(self) -> None:
        """Unknown id should return 404."""
        from fastapi import HTTPException

        from backend.routers.categories import update_category_master_entry

        select_result = MagicMock()
        select_result.scalar_one_or_none.return_value = None
        db = MagicMock()
        db.execute.return_value = select_result
        user = MagicMock()
        user.id = "user-1"

        with (
            pytest.raises(HTTPException) as exc_info,
            patch("backend.routers.categories.set_rls_user"),
        ):
            update_category_master_entry(
                entry_id="missing",
                body={"parent_category": "A", "sub_category": "B"},
                db=db,
                current_user=user,
            )

        assert exc_info.value.status_code == 404

    def test_raises_409_when_duplicate_target_pair_exists(self) -> None:
        """Renaming to an existing (parent, sub) for the same user should conflict."""
        from fastapi import HTTPException

        from backend.routers.categories import update_category_master_entry

        existing = MagicMock()
        existing.id = "entry-1"
        existing.user_id = "user-1"
        existing.parent_category = "P1"
        existing.sub_category = "S1"

        select_entry = MagicMock()
        select_entry.scalar_one_or_none.return_value = existing
        select_dup = MagicMock()
        select_dup.scalar_one_or_none.return_value = MagicMock()

        db = MagicMock()
        db.execute.side_effect = [select_entry, select_dup]
        user = MagicMock()
        user.id = "user-1"

        with (
            pytest.raises(HTTPException) as exc_info,
            patch("backend.routers.categories.set_rls_user"),
        ):
            update_category_master_entry(
                entry_id="entry-1",
                body={"parent_category": "P2", "sub_category": "S2"},
                db=db,
                current_user=user,
            )

        assert exc_info.value.status_code == 409

    def test_noop_when_names_unchanged_still_refreshes(self) -> None:
        """Same parent/sub should skip duplicate check and description update."""
        from backend.routers.categories import update_category_master_entry

        existing = MagicMock()
        existing.id = "entry-1"
        existing.user_id = "user-1"
        existing.parent_category = "P1"
        existing.sub_category = "S1"

        select_result = MagicMock()
        select_result.scalar_one_or_none.return_value = existing
        db = MagicMock()
        db.execute.return_value = select_result
        db.refresh = MagicMock()
        user = MagicMock()
        user.id = "user-1"

        with patch("backend.routers.categories.set_rls_user"):
            result = update_category_master_entry(
                entry_id="entry-1",
                body={"parent_category": "P1", "sub_category": "S1"},
                db=db,
                current_user=user,
            )

        assert result["id"] == "entry-1"
        assert db.execute.call_count == 1
        db.refresh.assert_called_once_with(existing)


# ---------------------------------------------------------------------------
# Endpoint: DELETE /categories/master/{entry_id}  (direct function call)
# ---------------------------------------------------------------------------


class TestDeleteCategoryMasterEntry:
    """Unit tests for delete_category_master_entry."""

    def test_deletes_user_owned_entry_after_clearing_descriptions(self) -> None:
        """Deleting a user-owned entry should UPDATE descriptions then delete and commit."""
        from backend.routers.categories import delete_category_master_entry

        existing = MagicMock()
        existing.id = "entry-1"
        existing.user_id = "user-1"
        existing.parent_category = "Food & Dining"
        existing.sub_category = "Custom"

        select_result = MagicMock()
        select_result.scalar_one_or_none.return_value = existing
        update_result = MagicMock()

        db = MagicMock()
        db.execute.side_effect = [select_result, update_result]
        db.delete = MagicMock()
        db.commit = MagicMock()

        user = MagicMock()
        user.id = "user-1"

        with patch("backend.routers.categories.set_rls_user"):
            delete_category_master_entry(entry_id="entry-1", db=db, current_user=user)

        assert db.execute.call_count == 2
        db.delete.assert_called_once_with(existing)
        db.commit.assert_called_once()

    def test_raises_403_for_global_seed_entry(self) -> None:
        """Seed rows (user_id NULL) cannot be deleted."""
        from fastapi import HTTPException

        from backend.routers.categories import delete_category_master_entry

        existing = MagicMock()
        existing.user_id = None

        select_result = MagicMock()
        select_result.scalar_one_or_none.return_value = existing
        db = MagicMock()
        db.execute.return_value = select_result

        user = MagicMock()
        user.id = "user-1"

        with (
            pytest.raises(HTTPException) as exc_info,
            patch("backend.routers.categories.set_rls_user"),
        ):
            delete_category_master_entry(entry_id="seed-id", db=db, current_user=user)

        assert exc_info.value.status_code == 403

    def test_raises_403_when_entry_owned_by_another_user(self) -> None:
        """Users may not delete another user's category_master rows."""
        from fastapi import HTTPException

        from backend.routers.categories import delete_category_master_entry

        existing = MagicMock()
        existing.user_id = "other-user"

        select_result = MagicMock()
        select_result.scalar_one_or_none.return_value = existing
        db = MagicMock()
        db.execute.return_value = select_result

        user = MagicMock()
        user.id = "user-1"

        with (
            pytest.raises(HTTPException) as exc_info,
            patch("backend.routers.categories.set_rls_user"),
        ):
            delete_category_master_entry(entry_id="entry-1", db=db, current_user=user)

        assert exc_info.value.status_code == 403

    def test_raises_404_when_entry_not_found(self) -> None:
        """Deleting a non-existent entry should raise HTTP 404."""
        from fastapi import HTTPException

        from backend.routers.categories import delete_category_master_entry

        select_result = MagicMock()
        select_result.scalar_one_or_none.return_value = None
        db = MagicMock()
        db.execute.return_value = select_result

        user = MagicMock()
        user.id = "user-1"

        with (
            pytest.raises(HTTPException) as exc_info,
            patch("backend.routers.categories.set_rls_user"),
        ):
            delete_category_master_entry(entry_id="ghost-id", db=db, current_user=user)

        assert exc_info.value.status_code == 404
        assert "ghost-id" in exc_info.value.detail


# ---------------------------------------------------------------------------
# Endpoint: GET /categories/descriptions  (direct function call)
# ---------------------------------------------------------------------------


class TestListDescriptionCategories:
    """Unit tests for list_description_categories."""

    def _make_db_with_rows(self, rows: list) -> MagicMock:
        db = MagicMock()
        execute_result = MagicMock()
        execute_result.scalars.return_value.all.return_value = rows
        db.execute.return_value = execute_result
        return db

    def _make_desc_row(
        self,
        row_id: str = "dc-1",
        user_id: str = "user-1",
        description: str = "Swiggy",
        parent_category: str | None = "Food & Dining",
        sub_category: str | None = "Food Delivery",
        payment_method: str | None = "UPI",
        created_at: str = "2024-01-01",
        updated_at: str | None = None,
        updated_by: str | None = None,
    ) -> MagicMock:
        row = MagicMock()
        row.id = row_id
        row.user_id = user_id
        row.description = description
        row.pattern = description
        row.match_type = "exact"
        row.priority = 0
        row.enabled = True
        row.parent_category = parent_category
        row.sub_category = sub_category
        row.payment_method = payment_method
        row.created_at = created_at
        row.updated_at = updated_at
        row.updated_by = updated_by
        return row

    def test_returns_list_of_dicts(self) -> None:
        """list_description_categories must return a list of dicts."""
        from backend.routers.categories import list_description_categories

        user = MagicMock()
        user.id = "user-1"
        row = self._make_desc_row()
        db = self._make_db_with_rows([row])

        with patch("backend.routers.categories.set_rls_user"):
            result = list_description_categories(db=db, current_user=user)

        assert isinstance(result, list)
        assert len(result) == 1

    def test_result_contains_expected_fields(self) -> None:
        """Each result dict must contain all required fields."""
        from backend.routers.categories import list_description_categories

        user = MagicMock()
        user.id = "user-1"
        row = self._make_desc_row(
            row_id="dc-1",
            user_id="user-1",
            description="Netflix",
            parent_category="Entertainment",
            sub_category="Streaming",
            payment_method="Credit Card",
        )
        db = self._make_db_with_rows([row])

        with patch("backend.routers.categories.set_rls_user"):
            result = list_description_categories(db=db, current_user=user)

        entry = result[0]
        assert entry["id"] == "dc-1"
        assert entry["user_id"] == "user-1"
        assert entry["description"] == "Netflix"
        assert entry["parent_category"] == "Entertainment"
        assert entry["sub_category"] == "Streaming"
        assert entry["payment_method"] == "Credit Card"

    def test_returns_empty_list_when_no_rows(self) -> None:
        """Empty query result should return an empty list."""
        from backend.routers.categories import list_description_categories

        user = MagicMock()
        user.id = "user-1"
        db = self._make_db_with_rows([])

        with patch("backend.routers.categories.set_rls_user"):
            result = list_description_categories(db=db, current_user=user)

        assert result == []

    def test_calls_set_rls_user(self) -> None:
        """RLS must be applied before querying descriptions."""
        from backend.routers.categories import list_description_categories

        user = MagicMock()
        user.id = "user-rls"
        db = self._make_db_with_rows([])

        with patch("backend.routers.categories.set_rls_user") as mock_rls:
            list_description_categories(db=db, current_user=user)
            mock_rls.assert_called_once_with(db, "user-rls")


# ---------------------------------------------------------------------------
# Endpoint: PATCH /categories/descriptions/{entry_id}  (direct function call)
# ---------------------------------------------------------------------------


class TestUpdateDescriptionCategory:
    """Unit tests for update_description_category."""

    def _make_db_with_entry(self, entry: MagicMock | None) -> MagicMock:
        db = MagicMock()
        result = MagicMock()
        result.scalar_one_or_none.return_value = entry
        db.execute.return_value = result
        db.commit = MagicMock()
        db.refresh = MagicMock()
        return db

    def _make_entry(self) -> MagicMock:
        entry = MagicMock()
        entry.id = "dc-1"
        entry.user_id = "user-1"
        entry.pattern = "Swiggy"
        entry.description = "Swiggy"
        entry.match_type = "exact"
        entry.priority = 0
        entry.enabled = True
        entry.parent_category = "Food & Dining"
        entry.sub_category = "Food Delivery"
        entry.payment_method = "UPI"
        entry.created_at = "2024-01-01"
        entry.updated_at = None
        entry.updated_by = None
        return entry

    def test_updates_parent_category(self) -> None:
        """PATCH with parent_category should update that field."""
        from backend.routers.categories import update_description_category

        entry = self._make_entry()
        db = self._make_db_with_entry(entry)
        user = MagicMock()
        user.id = "user-1"

        with patch("backend.routers.categories.set_rls_user"):
            update_description_category(
                entry_id="dc-1",
                body={"parent_category": "Transport"},
                db=db,
                current_user=user,
            )

        assert entry.parent_category == "Transport"

    def test_updates_sub_category(self) -> None:
        """PATCH with sub_category should update that field."""
        from backend.routers.categories import update_description_category

        entry = self._make_entry()
        db = self._make_db_with_entry(entry)
        user = MagicMock()
        user.id = "user-1"

        with patch("backend.routers.categories.set_rls_user"):
            update_description_category(
                entry_id="dc-1",
                body={"sub_category": "Cab"},
                db=db,
                current_user=user,
            )

        assert entry.sub_category == "Cab"

    def test_updates_payment_method(self) -> None:
        """PATCH with payment_method should update that field."""
        from backend.routers.categories import update_description_category

        entry = self._make_entry()
        db = self._make_db_with_entry(entry)
        user = MagicMock()
        user.id = "user-1"

        with patch("backend.routers.categories.set_rls_user"):
            update_description_category(
                entry_id="dc-1",
                body={"payment_method": "NEFT"},
                db=db,
                current_user=user,
            )

        assert entry.payment_method == "NEFT"

    def test_sets_updated_by_to_current_user(self) -> None:
        """updated_by must be set to the current user's ID."""
        from backend.routers.categories import update_description_category

        entry = self._make_entry()
        db = self._make_db_with_entry(entry)
        user = MagicMock()
        user.id = "user-updater"

        with patch("backend.routers.categories.set_rls_user"):
            update_description_category(
                entry_id="dc-1",
                body={"payment_method": "Cash"},
                db=db,
                current_user=user,
            )

        assert entry.updated_by == "user-updater"

    def test_raises_404_when_entry_not_found(self) -> None:
        """PATCH on non-existent entry should raise HTTP 404."""
        from fastapi import HTTPException

        from backend.routers.categories import update_description_category

        db = self._make_db_with_entry(None)
        user = MagicMock()
        user.id = "user-1"

        with (
            patch("backend.routers.categories.set_rls_user"),
            pytest.raises(HTTPException) as exc_info,
        ):
            update_description_category(
                entry_id="ghost-id",
                body={"payment_method": "Cash"},
                db=db,
                current_user=user,
            )

        assert exc_info.value.status_code == 404

    def test_ignores_unknown_fields_in_body(self) -> None:
        """Unknown fields in the body should be silently ignored."""
        from backend.routers.categories import update_description_category

        entry = self._make_entry()
        db = self._make_db_with_entry(entry)
        user = MagicMock()
        user.id = "user-1"

        # 'unknown_field' is not in updatable_fields and must not raise
        with patch("backend.routers.categories.set_rls_user"):
            update_description_category(
                entry_id="dc-1",
                body={"payment_method": "Cash", "unknown_field": "should-be-ignored"},
                db=db,
                current_user=user,
            )

        assert entry.payment_method == "Cash"

    def test_commits_and_refreshes_entry(self) -> None:
        """db.commit and db.refresh must be called after the update."""
        from backend.routers.categories import update_description_category

        entry = self._make_entry()
        db = self._make_db_with_entry(entry)
        user = MagicMock()
        user.id = "user-1"

        with patch("backend.routers.categories.set_rls_user"):
            update_description_category(
                entry_id="dc-1",
                body={"sub_category": "Blinkit"},
                db=db,
                current_user=user,
            )

        db.commit.assert_called_once()
        db.refresh.assert_called_once_with(entry)


# ---------------------------------------------------------------------------
# Endpoint: POST /categories/analyze  (async, LLM mocked)
# ---------------------------------------------------------------------------


class TestAnalyzeAndCategorize:
    """Tests for the analyze_and_categorize endpoint."""

    @pytest.fixture(autouse=True)
    def _patch_apply_zero(self) -> None:
        """Avoid ORM/query traffic on the mocked DB after upserts."""
        with patch(
            "backend.routers.categories.apply_category_rules_to_transactions",
            return_value=0,
        ):
            yield

    def _make_db(
        self,
        desc_rows: list[str],
        master_rows: list,
    ) -> MagicMock:
        """Return a mock DB whose execute handles description query, master query, then ORM/upserts."""
        db = MagicMock()
        counter = {"n": 0}

        def execute_side_effect(*_args, **_kwargs) -> MagicMock:
            counter["n"] += 1
            i = counter["n"]
            r = MagicMock()
            if i == 1:
                r.scalars.return_value.all.return_value = desc_rows
            elif i == 2:
                r.scalars.return_value.all.return_value = master_rows
            else:
                r.scalar_one_or_none.return_value = None
            return r

        db.execute.side_effect = execute_side_effect
        db.add = MagicMock()
        db.flush = MagicMock()
        db.commit = MagicMock()
        return db

    def _make_master_row(self, parent: str, sub: str) -> MagicMock:
        row = MagicMock()
        row.parent_category = parent
        row.sub_category = sub
        row.user_id = None
        return row

    @pytest.mark.asyncio
    async def test_returns_no_transactions_message_when_empty(self) -> None:
        """Should return early with mapped=0 when no transactions exist."""
        from backend.routers.categories import analyze_and_categorize

        db = MagicMock()
        # First execute returns empty list
        result1 = MagicMock()
        result1.scalars.return_value.all.return_value = []
        db.execute.return_value = result1

        user = MagicMock()
        user.id = "user-1"

        with patch("backend.routers.categories.set_rls_user"):
            result = await analyze_and_categorize(db=db, current_user=user)

        assert result["mapped"] == 0
        assert "description" in result["message"].lower()
        assert result.get("transactions_updated") == 0

    @pytest.mark.asyncio
    async def test_invokes_llm_chain_with_correct_inputs(self) -> None:
        """The LLM chain should receive category_hierarchy and descriptions_text."""
        from backend.routers.categories import analyze_and_categorize

        master_rows = [self._make_master_row("Food & Dining", "Swiggy")]
        db = self._make_db(
            desc_rows=["Swiggy", "Netflix"],
            master_rows=master_rows,
        )

        llm_response = MagicMock()
        llm_response.content = json.dumps(
            [
                {
                    "description": "Swiggy",
                    "parent_category": "Food & Dining",
                    "sub_category": "Food Delivery",
                    "payment_method": "UPI",
                },
                {
                    "description": "Netflix",
                    "parent_category": "Entertainment",
                    "sub_category": "Streaming",
                    "payment_method": "Credit Card",
                },
            ]
        )

        user = MagicMock()
        user.id = "user-1"
        settings = MagicMock()
        settings.openrouter_model = "test-model"
        settings.openrouter_api_key = "test-key"
        settings.openrouter_base_url = "https://test.url"

        mock_chain = MagicMock()
        mock_chain.ainvoke = AsyncMock(return_value=llm_response)

        mock_prompt = MagicMock()
        mock_prompt.__or__ = MagicMock(return_value=mock_chain)

        with (
            patch("backend.routers.categories.set_rls_user"),
            patch("backend.routers.categories.get_settings", return_value=settings),
            patch("backend.routers.categories._build_llm", return_value=MagicMock()),
            patch("backend.routers.categories.category_prompt", mock_prompt),
        ):
            result = await analyze_and_categorize(db=db, current_user=user)

        assert result["mapped"] == 2
        assert result["message"] == "Categorization complete"
        assert result.get("transactions_updated") == 0

    @pytest.mark.asyncio
    async def test_accepts_list_shaped_message_content_from_llm(self) -> None:
        """LangChain may return ``AIMessage.content`` as text blocks; normalize then parse JSON."""
        from backend.routers.categories import analyze_and_categorize

        master_rows = [self._make_master_row("Food & Dining", "Swiggy")]
        db = self._make_db(
            desc_rows=["Swiggy"],
            master_rows=master_rows,
        )

        payload = [
            {
                "description": "Swiggy",
                "parent_category": "Food & Dining",
                "sub_category": "Swiggy",
                "payment_method": "UPI",
            }
        ]
        llm_response = MagicMock()
        llm_response.content = [{"type": "text", "text": json.dumps(payload)}]

        user = MagicMock()
        user.id = "user-1"
        settings = MagicMock()
        settings.openrouter_model = "test-model"
        settings.openrouter_api_key = "test-key"
        settings.openrouter_base_url = "https://test.url"

        mock_chain = MagicMock()
        mock_chain.ainvoke = AsyncMock(return_value=llm_response)

        mock_prompt = MagicMock()
        mock_prompt.__or__ = MagicMock(return_value=mock_chain)

        with (
            patch("backend.routers.categories.set_rls_user"),
            patch("backend.routers.categories.get_settings", return_value=settings),
            patch("backend.routers.categories._build_llm", return_value=MagicMock()),
            patch("backend.routers.categories.category_prompt", mock_prompt),
        ):
            result = await analyze_and_categorize(db=db, current_user=user)

        assert result["mapped"] == 1
        assert result["message"] == "Categorization complete"

    @pytest.mark.asyncio
    async def test_raises_500_when_llm_fails(self) -> None:
        """LLM failure should raise HTTP 500 with a descriptive message."""
        from fastapi import HTTPException

        from backend.routers.categories import analyze_and_categorize

        master_rows = [self._make_master_row("Food & Dining", "Swiggy")]
        db = self._make_db(
            desc_rows=["Swiggy"],
            master_rows=master_rows,
        )

        user = MagicMock()
        user.id = "user-1"
        settings = MagicMock()

        mock_chain = MagicMock()
        mock_chain.ainvoke = AsyncMock(side_effect=RuntimeError("LLM timeout"))

        mock_prompt = MagicMock()
        mock_prompt.__or__ = MagicMock(return_value=mock_chain)

        with (
            pytest.raises(HTTPException) as exc_info,
            patch("backend.routers.categories.set_rls_user"),
            patch("backend.routers.categories.get_settings", return_value=settings),
            patch("backend.routers.categories._build_llm", return_value=MagicMock()),
            patch("backend.routers.categories.category_prompt", mock_prompt),
        ):
            await analyze_and_categorize(db=db, current_user=user)

        assert exc_info.value.status_code == 500
        assert "failed" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_raises_500_when_llm_returns_invalid_json(self) -> None:
        """Unparseable LLM output should raise HTTP 500."""
        from fastapi import HTTPException

        from backend.routers.categories import analyze_and_categorize

        master_rows = [self._make_master_row("Food & Dining", "Swiggy")]
        db = self._make_db(
            desc_rows=["Swiggy"],
            master_rows=master_rows,
        )

        llm_response = MagicMock()
        llm_response.content = "this is not valid JSON at all"

        user = MagicMock()
        user.id = "user-1"
        settings = MagicMock()

        mock_chain = MagicMock()
        mock_chain.ainvoke = AsyncMock(return_value=llm_response)

        mock_prompt = MagicMock()
        mock_prompt.__or__ = MagicMock(return_value=mock_chain)

        with (
            pytest.raises(HTTPException) as exc_info,
            patch("backend.routers.categories.set_rls_user"),
            patch("backend.routers.categories.get_settings", return_value=settings),
            patch("backend.routers.categories._build_llm", return_value=MagicMock()),
            patch("backend.routers.categories.category_prompt", mock_prompt),
        ):
            await analyze_and_categorize(db=db, current_user=user)

        assert exc_info.value.status_code == 500
        assert "failed" in exc_info.value.detail.lower()

    @pytest.mark.asyncio
    async def test_skips_items_with_empty_description(self) -> None:
        """Items with an empty or whitespace description must not be upserted."""
        from backend.routers.categories import analyze_and_categorize

        master_rows = [self._make_master_row("Food & Dining", "Swiggy")]
        db = self._make_db(
            desc_rows=["Swiggy"],
            master_rows=master_rows,
        )

        llm_response = MagicMock()
        # One valid item, one with blank description
        llm_response.content = json.dumps(
            [
                {
                    "description": "Swiggy",
                    "parent_category": "Food & Dining",
                    "sub_category": "Food Delivery",
                    "payment_method": "UPI",
                },
                {
                    "description": "  ",
                    "parent_category": "Other",
                    "sub_category": "Other",
                    "payment_method": "Other",
                },
            ]
        )

        user = MagicMock()
        user.id = "user-1"
        settings = MagicMock()

        mock_chain = MagicMock()
        mock_chain.ainvoke = AsyncMock(return_value=llm_response)

        mock_prompt = MagicMock()
        mock_prompt.__or__ = MagicMock(return_value=mock_chain)

        with (
            patch("backend.routers.categories.set_rls_user"),
            patch("backend.routers.categories.get_settings", return_value=settings),
            patch("backend.routers.categories._build_llm", return_value=MagicMock()),
            patch("backend.routers.categories.category_prompt", mock_prompt),
        ):
            result = await analyze_and_categorize(db=db, current_user=user)

        # Only 1 valid item should be counted (blank description skipped)
        assert result["mapped"] == 1
        assert result.get("transactions_updated") == 0


# ---------------------------------------------------------------------------
# POST /categories/apply-mappings
# ---------------------------------------------------------------------------


_apply_app = FastAPI()
_apply_app.include_router(categories_router)


def _apply_client(db: MagicMock, user: MagicMock) -> TestClient:
    """TestClient with DB and user overrides for apply-mappings tests."""
    from backend.database import get_db
    from backend.middleware.auth import get_current_user

    _apply_app.dependency_overrides[get_db] = lambda: db
    _apply_app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(_apply_app, raise_server_exceptions=True)


def _reset_apply_overrides() -> None:
    """Clear dependency overrides on the apply-mappings test app."""
    _apply_app.dependency_overrides.clear()


class TestApplyMappingsEndpoint:
    """POST /categories/apply-mappings — applies category_rules via resolver."""

    def teardown_method(self) -> None:
        """Ensure overrides do not leak between tests."""
        _reset_apply_overrides()

    def test_document_not_found_returns_404(self) -> None:
        """Unknown document_id should yield 404 before any UPDATE."""
        db = MagicMock()
        doc_result = MagicMock()
        doc_result.scalar_one_or_none.return_value = None
        db.execute.return_value = doc_result
        user = MagicMock()
        user.id = "user-1"

        with patch("backend.routers.categories.set_rls_user"):
            client = _apply_client(db, user)
            try:
                r = client.post(
                    "/categories/apply-mappings",
                    json={"document_id": "missing-doc"},
                )
            finally:
                _reset_apply_overrides()

        assert r.status_code == 404
        assert r.json()["detail"] == "Document not found."
        assert db.execute.call_count == 1

    def test_scoped_update_returns_rowcount(self) -> None:
        """Happy path with document_id validates document then applies rules."""
        db = MagicMock()
        doc_result = MagicMock()
        doc_result.scalar_one_or_none.return_value = "doc-1"
        db.execute.side_effect = [doc_result]
        user = MagicMock()
        user.id = "user-1"

        with (
            patch("backend.routers.categories.set_rls_user"),
            patch(
                "backend.routers.categories.apply_category_rules_to_transactions",
                return_value=4,
            ) as mock_apply,
        ):
            client = _apply_client(db, user)
            try:
                r = client.post(
                    "/categories/apply-mappings",
                    json={"document_id": "doc-1"},
                )
            finally:
                _reset_apply_overrides()

        assert r.status_code == 200
        assert r.json() == {"message": "Mappings applied", "updated": 4}
        assert db.execute.call_count == 1
        mock_apply.assert_called_once_with(db, "user-1", document_id="doc-1")
        db.commit.assert_called_once()

    def test_global_update_single_execute(self) -> None:
        """Without document_id only resolver apply runs (no document lookup)."""
        db = MagicMock()
        user = MagicMock()
        user.id = "user-2"

        with (
            patch("backend.routers.categories.set_rls_user"),
            patch(
                "backend.routers.categories.apply_category_rules_to_transactions",
                return_value=12,
            ) as mock_apply,
        ):
            client = _apply_client(db, user)
            try:
                r = client.post("/categories/apply-mappings", json={})
            finally:
                _reset_apply_overrides()

        assert r.status_code == 200
        assert r.json()["updated"] == 12
        assert db.execute.call_count == 0
        mock_apply.assert_called_once_with(db, "user-2", document_id=None)
        db.commit.assert_called_once()
