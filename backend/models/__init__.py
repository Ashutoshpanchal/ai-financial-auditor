"""ORM models package — import all models here so Alembic autogenerate sees them."""

from backend.models.audit_report import AuditReport
from backend.models.base import Base
from backend.models.category_master import CategoryMaster
from backend.models.category_rule import CategoryRule
from backend.models.chat_session import ChatSession
from backend.models.dashboard import UserDashboard
from backend.models.document import Document, DocumentStatus
from backend.models.transaction import Transaction
from backend.models.user import User, UserRole
from backend.models.widget import UserWidget

__all__ = [
    "AuditReport",
    "Base",
    "CategoryMaster",
    "CategoryRule",
    "ChatSession",
    "Document",
    "DocumentStatus",
    "Transaction",
    "User",
    "UserDashboard",
    "UserRole",
    "UserWidget",
]
