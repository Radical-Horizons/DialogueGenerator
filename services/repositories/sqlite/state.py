"""État partagé de disponibilité de la base SQLite du processus."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from threading import Lock


@dataclass(frozen=True)
class DatabaseStatus:
    """État observable de l'initialisation SQLite."""

    ready: bool
    database_path: Path | None = None
    error: str | None = None


_status = DatabaseStatus(ready=False)
_status_lock = Lock()


def mark_database_ready(database_path: Path) -> None:
    """Marque la base comme disponible après migrations réussies."""
    global _status
    with _status_lock:
        _status = DatabaseStatus(ready=True, database_path=database_path)


def mark_database_error(database_path: Path, error: str) -> None:
    """Enregistre une erreur de boot sans exposer de secret."""
    global _status
    with _status_lock:
        _status = DatabaseStatus(
            ready=False,
            database_path=database_path,
            error=error,
        )


def get_database_status() -> DatabaseStatus:
    """Retourne une copie cohérente de l'état courant."""
    with _status_lock:
        return _status


def reset_database_status() -> None:
    """Réinitialise l'état, notamment pour l'isolation des tests."""
    global _status
    with _status_lock:
        _status = DatabaseStatus(ready=False)
