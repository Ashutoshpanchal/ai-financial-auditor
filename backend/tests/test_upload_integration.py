"""Integration tests for upload and transaction endpoints.

Uses FastAPI TestClient with dependency overrides so no real Google OAuth,
real Drive, or real embeddings are needed.  Focused on catching the class of
bugs that caused the SQLAlchemy f405 error (wrong types on INSERT).
"""

from __future__ import annotations

from datetime import date
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from backend.database import get_db
from backend.middleware.auth import get_current_user
from backend.models.transaction import Transaction

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _test_user(user_id: str = "test-user-abc") -> MagicMock:
    """Minimal mock User object that satisfies the router."""
    u = MagicMock()
    u.id = user_id
    u.google_access_token = "fake-access"
    u.google_refresh_token = "fake-refresh"
    return u


def _mock_db() -> tuple[MagicMock, list]:
    """Return (db_mock, added_objects_list).

    added_objects_list accumulates every object passed to db.add() so tests
    can inspect Transaction rows without needing a real database.
    """
    added: list = []
    db = MagicMock()
    # No duplicate document found
    db.query.return_value.filter.return_value.first.return_value = None
    db.add.side_effect = lambda obj: added.append(obj)
    db.commit = MagicMock()
    db.rollback = MagicMock()
    db.refresh = MagicMock()
    return db, added


def _drive_result() -> dict:
    return {
        "drive_file_id": "drive-id-1",
        "drive_folder_id": "drive-folder-1",
        "drive_web_url": "https://drive.google.com/file/drive-id-1",
    }


# --- CSV fixtures ---

_SIMPLE_CSV = (
    b"Date,Description,Amount\n2025-01-10,Grocery,-45.00\n2025-01-15,Salary,3000.00\n"
)

_HDFC_CSV = (
    b"Date,Narration,Withdrawal (Dr),Deposit (Cr),Balance\n"
    b"01/01/2025,UPI/9834/Grocery/SBI,45.00,,49955.00\n"
    b"02/01/2025,ATM Withdrawal,500.00,,49455.00\n"
    b"03/01/2025,Salary Credit,,163176.00,212631.00\n"
)

_ZERO_ROW_CSV = (
    b"Date,Description,Amount\n2025-03-01,Fee Reversal,0.00\n2025-03-02,Rent,-1200.00\n"
)


# ---------------------------------------------------------------------------
# Fixture: TestClient with auth + db overrides
# ---------------------------------------------------------------------------


@pytest.fixture
def upload_client():
    """Yield a (TestClient, added_objects_list) tuple with all external deps mocked."""
    from backend.main import app

    user = _test_user()
    db, added = _mock_db()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_db] = lambda: db

    with (
        patch(
            "backend.routers.documents.drive_upload_file", return_value=_drive_result()
        ),
        patch("backend.routers.documents.set_rls_user"),
        patch("backend.chains.embeddings.embed_transactions"),
        patch("backend.routers.documents._run_audit_background"),
        # Prevent startup _init_db from connecting to the real database
        patch("backend.main.engine"),
    ):
        # Use TestClient without context manager to skip lifespan startup/shutdown
        client = TestClient(app, raise_server_exceptions=True)
        yield client, added

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Happy-path upload
# ---------------------------------------------------------------------------


class TestUploadHappyPath:
    """Basic upload success scenarios."""

    def test_simple_csv_returns_201(self, upload_client):
        client, _ = upload_client
        resp = client.post(
            "/documents/upload",
            files={"file": ("statement.csv", _SIMPLE_CSV, "text/csv")},
            data={"bank_name": "Test Bank"},
        )
        assert resp.status_code == 201, resp.text

    def test_response_contains_document_id(self, upload_client):
        client, _ = upload_client
        resp = client.post(
            "/documents/upload",
            files={"file": ("s.csv", _SIMPLE_CSV, "text/csv")},
            data={"bank_name": "Test Bank"},
        )
        body = resp.json()
        assert "document_id" in body
        assert body["document_id"]

    def test_response_bank_name_matches_form_field(self, upload_client):
        client, _ = upload_client
        resp = client.post(
            "/documents/upload",
            files={"file": ("s.csv", _SIMPLE_CSV, "text/csv")},
            data={"bank_name": "HDFC"},
        )
        assert resp.json()["bank_name"] == "HDFC"

    def test_bank_name_none_falls_back_to_unknown_bank(self, upload_client):
        client, added = upload_client
        resp = client.post(
            "/documents/upload",
            files={"file": ("s.csv", _SIMPLE_CSV, "text/csv")},
        )
        assert resp.status_code == 201, resp.text
        from backend.models.document import Document

        doc_objects = [o for o in added if isinstance(o, Document)]
        assert doc_objects, "Expected Document to be added to session"
        assert doc_objects[0].bank_name == "Unknown Bank"


# ---------------------------------------------------------------------------
# f405 regression: date types and remarks=None
# ---------------------------------------------------------------------------


class TestTransactionTypeSafety:
    """Guard against the SQLAlchemy f405 type-mismatch regression.

    SQLAlchemy 2.0 raises f405 when:
    - A string is inserted into a Date column (transaction_date)
    - JSON serialises None to the string 'null' in batch-insert mode (remarks)
    """

    def test_transaction_dates_are_date_objects(self, upload_client):
        """transaction_date must be datetime.date, not a string."""
        client, added = upload_client
        client.post(
            "/documents/upload",
            files={"file": ("s.csv", _SIMPLE_CSV, "text/csv")},
            data={"bank_name": "TestBank"},
        )
        txns = [o for o in added if isinstance(o, Transaction)]
        assert txns, "No Transaction rows captured"
        for txn in txns:
            assert isinstance(txn.transaction_date, date), (
                f"transaction_date is {type(txn.transaction_date)!r}, expected datetime.date"
            )

    def test_remarks_never_set_to_null_string(self, upload_client):
        """remarks must be None (SQL NULL), never the string 'null'."""
        client, added = upload_client
        client.post(
            "/documents/upload",
            files={"file": ("s.csv", _SIMPLE_CSV, "text/csv")},
            data={"bank_name": "TestBank"},
        )
        txns = [o for o in added if isinstance(o, Transaction)]
        assert txns, "No Transaction rows captured"
        for txn in txns:
            assert txn.remarks != "null", (
                "remarks was set to the string 'null' — JSON null serialisation bug"
            )
            # remarks should be either None or a dict, never a bare string
            assert txn.remarks is None or isinstance(txn.remarks, dict)

    def test_debit_credit_are_floats(self, upload_client):
        """debit and credit must be float, not string."""
        client, added = upload_client
        client.post(
            "/documents/upload",
            files={"file": ("s.csv", _SIMPLE_CSV, "text/csv")},
            data={"bank_name": "TestBank"},
        )
        txns = [o for o in added if isinstance(o, Transaction)]
        for txn in txns:
            assert isinstance(txn.debit, float), f"debit is {type(txn.debit)!r}"
            assert isinstance(txn.credit, float), f"credit is {type(txn.credit)!r}"


# ---------------------------------------------------------------------------
# HDFC bank format (Withdrawal Dr / Deposit Cr columns)
# ---------------------------------------------------------------------------


class TestHdfcFormat:
    """HDFC CSV with 'Withdrawal (Dr)' / 'Deposit (Cr)' column headers."""

    def test_hdfc_csv_upload_succeeds(self, upload_client):
        client, _ = upload_client
        resp = client.post(
            "/documents/upload",
            files={"file": ("hdfc.csv", _HDFC_CSV, "text/csv")},
            data={"bank_name": "HDFC"},
        )
        assert resp.status_code == 201, resp.text

    def test_hdfc_creates_correct_transaction_count(self, upload_client):
        client, added = upload_client
        client.post(
            "/documents/upload",
            files={"file": ("hdfc.csv", _HDFC_CSV, "text/csv")},
            data={"bank_name": "HDFC"},
        )
        txns = [o for o in added if isinstance(o, Transaction)]
        assert len(txns) == 3

    def test_hdfc_withdrawal_maps_to_debit(self, upload_client):
        client, added = upload_client
        client.post(
            "/documents/upload",
            files={"file": ("hdfc.csv", _HDFC_CSV, "text/csv")},
            data={"bank_name": "HDFC"},
        )
        txns = [o for o in added if isinstance(o, Transaction)]
        grocery = next(t for t in txns if "Grocery" in t.description)
        assert grocery.debit == 45.0
        assert grocery.credit == 0.0

    def test_hdfc_deposit_maps_to_credit(self, upload_client):
        client, added = upload_client
        client.post(
            "/documents/upload",
            files={"file": ("hdfc.csv", _HDFC_CSV, "text/csv")},
            data={"bank_name": "HDFC"},
        )
        txns = [o for o in added if isinstance(o, Transaction)]
        salary = next(t for t in txns if "Salary" in t.description)
        assert salary.credit == 163176.0
        assert salary.debit == 0.0

    def test_hdfc_dates_are_date_objects(self, upload_client):
        client, added = upload_client
        client.post(
            "/documents/upload",
            files={"file": ("hdfc.csv", _HDFC_CSV, "text/csv")},
            data={"bank_name": "HDFC"},
        )
        txns = [o for o in added if isinstance(o, Transaction)]
        for txn in txns:
            assert isinstance(txn.transaction_date, date)


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


class TestUploadEdgeCases:
    """Upload validation and edge cases."""

    def test_unsupported_mime_returns_422(self, upload_client):
        client, _ = upload_client
        resp = client.post(
            "/documents/upload",
            files={"file": ("img.png", b"fake", "image/png")},
            data={"bank_name": "Test"},
        )
        assert resp.status_code == 422

    def test_empty_file_returns_422(self, upload_client):
        client, _ = upload_client
        resp = client.post(
            "/documents/upload",
            files={"file": ("empty.csv", b"", "text/csv")},
            data={"bank_name": "Test"},
        )
        assert resp.status_code == 422

    def test_duplicate_file_returns_409(self, upload_client):
        """Second upload of the same file bytes should return 409 Conflict."""
        from backend.main import app
        from backend.models.document import Document

        # Override db so the second query returns an existing doc
        existing_doc = MagicMock(spec=Document)
        existing_doc.id = "existing-doc-id"
        existing_doc.filename = "s.csv"
        existing_doc.upload_date = None

        dup_db = MagicMock()
        dup_db.query.return_value.filter.return_value.first.return_value = existing_doc

        user = _test_user()
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[get_db] = lambda: dup_db

        try:
            with (
                patch("backend.routers.documents.set_rls_user"),
                TestClient(app) as c,
            ):
                resp = c.post(
                    "/documents/upload",
                    files={"file": ("s.csv", _SIMPLE_CSV, "text/csv")},
                    data={"bank_name": "Test"},
                )
            assert resp.status_code == 409
        finally:
            app.dependency_overrides.clear()

    def test_zero_amount_rows_are_dropped(self, upload_client):
        """CSV rows where debit=0 and credit=0 should be omitted from transactions."""
        client, added = upload_client
        client.post(
            "/documents/upload",
            files={"file": ("z.csv", _ZERO_ROW_CSV, "text/csv")},
            data={"bank_name": "Test"},
        )
        txns = [o for o in added if isinstance(o, Transaction)]
        # Only the Rent row (-1200) should survive; zero-row is dropped
        assert len(txns) == 1
        assert txns[0].debit == 1200.0

    def test_bank_name_whitespace_stripped(self, upload_client):
        client, added = upload_client
        client.post(
            "/documents/upload",
            files={"file": ("s.csv", _SIMPLE_CSV, "text/csv")},
            data={"bank_name": "  HDFC  "},
        )
        from backend.models.document import Document

        docs = [o for o in added if isinstance(o, Document)]
        assert docs[0].bank_name == "HDFC"
