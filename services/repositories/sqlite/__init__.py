"""Repositories et primitives SQLite de l'application."""

from services.repositories.sqlite.app_settings_repository import AppSettingsRepository
from services.repositories.sqlite.audit_logs_repository import (
    AuditLogEntry,
    AuditLogListResult,
    AuditLogsRepository,
)
from services.repositories.sqlite.connection import DatabaseConnection
from services.repositories.sqlite.dialogue_shares_repository import (
    DialogueShareEntry,
    DialogueSharesRepository,
)
from services.repositories.sqlite.dialogues_index_repository import (
    DialogueIndexEntry,
    DialoguesIndexRepository,
)
from services.repositories.sqlite.user_repository import UserRepository

__all__ = [
    "AppSettingsRepository",
    "AuditLogEntry",
    "AuditLogListResult",
    "AuditLogsRepository",
    "DatabaseConnection",
    "DialogueIndexEntry",
    "DialogueShareEntry",
    "DialogueSharesRepository",
    "DialoguesIndexRepository",
    "UserRepository",
]
