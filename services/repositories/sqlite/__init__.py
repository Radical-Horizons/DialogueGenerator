"""Repositories et primitives SQLite de l'application."""

from services.repositories.sqlite.app_settings_repository import AppSettingsRepository
from services.repositories.sqlite.audit_logs_repository import (
    AuditLogEntry,
    AuditLogListResult,
    AuditLogsRepository,
)
from services.repositories.sqlite.connection import DatabaseConnection
from services.repositories.sqlite.collections_repository import (
    CollectionEntry,
    CollectionsRepository,
)
from services.repositories.sqlite.dialogues_search_repository import (
    DialogueSearchStats,
    DialoguesSearchRepository,
)
from services.repositories.sqlite.dialogue_shares_repository import (
    DialogueShareEntry,
    DialogueSharesRepository,
)
from services.repositories.sqlite.template_suggestion_usage_repository import (
    TemplateSuggestionUsageRepository,
)
from services.repositories.sqlite.dialogues_index_repository import (
    DialogueIndexEntry,
    DialoguesIndexRepository,
)
from services.repositories.sqlite.user_repository import UserRepository
from services.repositories.sqlite.user_settings_repository import UserSettingsRepository

__all__ = [
    "AppSettingsRepository",
    "AuditLogEntry",
    "AuditLogListResult",
    "AuditLogsRepository",
    "CollectionEntry",
    "CollectionsRepository",
    "DialogueSearchStats",
    "DialoguesSearchRepository",
    "DatabaseConnection",
    "DialogueIndexEntry",
    "DialogueShareEntry",
    "DialogueSharesRepository",
    "TemplateSuggestionUsageRepository",
    "DialoguesIndexRepository",
    "UserRepository",
    "UserSettingsRepository",
]
