"""Configuration globale des tests pytest."""
import json
import os
from pathlib import Path
from typing import Iterator
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from services.repositories.cost_budget_repository import FileCostBudgetRepository
from services.repositories.sqlite.bootstrap import initialize_database
from services.repositories.sqlite.connection import DatabaseConnection
from services.repositories.sqlite.state import reset_database_status

# IMPORTANT: certains singletons (SecurityConfig / rate limiter) sont initialisés à l'import de `api.main`.
# On fixe donc l'env AVANT l'import pour éviter des 429 en tests.
os.environ.setdefault("AUTH_RATE_LIMIT_ENABLED", "false")
# JWT requis sur les routeurs métier ; mock user si DISABLE_AUTH=true (défaut aligné .env.example dev).
os.environ.setdefault("DISABLE_AUTH", "true")
# Prometheus middleware + FastAPI récent (_IncludedRouter) → AttributeError sur TestClient en CI.
os.environ.setdefault("PROMETHEUS_ENABLED", "false")

from api.main import app


@pytest.fixture(scope="session", autouse=True)
def disable_rate_limiting():
    """Désactive le rate limiting pour tous les tests.
    
    Cette fixture s'exécute automatiquement avant tous les tests pour s'assurer
    que le rate limiting est désactivé, ce qui évite les erreurs 429 pendant les tests.
    """
    # Désactiver le rate limiting via variable d'environnement
    os.environ["AUTH_RATE_LIMIT_ENABLED"] = "false"
    
    yield
    
    # Nettoyer après les tests (optionnel, car les tests ne modifient pas l'environnement global)
    if "AUTH_RATE_LIMIT_ENABLED" in os.environ:
        del os.environ["AUTH_RATE_LIMIT_ENABLED"]


@pytest.fixture(scope="function", autouse=True)
def unlimited_llm_cost_budget(tmp_path):
    """Isole les tests du fichier ``data/cost_budgets.json`` machine (quotas bas → 429)."""
    # Sous-dossier dédié : beaucoup de tests réutilisent ``tmp_path`` comme racine Unity
    # (listing JSON) — ne pas y placer ``*.json`` de budget.
    budget_dir = tmp_path / ".pytest-cost-governance"
    budget_dir.mkdir(parents=True, exist_ok=True)
    budget_file = budget_dir / "cost_budgets.json"
    month = "2099-12"
    payload = {
        "budgets": {
            "admin": {
                "month": month,
                "amount": 0.0,
                "quota": 1_000_000.0,
                "updated_at": "1970-01-01T00:00:00",
            },
            "default_user": {
                "month": month,
                "amount": 0.0,
                "quota": 1_000_000.0,
                "updated_at": "1970-01-01T00:00:00",
            },
        }
    }
    budget_file.write_text(json.dumps(payload), encoding="utf-8")
    repository = FileCostBudgetRepository(storage_file=str(budget_file))
    with patch(
        "api.middleware.cost_governance.get_cost_budget_repository",
        return_value=repository,
    ):
        yield


@pytest.fixture(scope="function", autouse=True)
def isolated_app_database(tmp_path: Path) -> Iterator[DatabaseConnection]:
    """Isole chaque test dans une base SQLite temporaire migrée."""
    previous_database = os.environ.get("APP_DATABASE")
    database_path = tmp_path / ".pytest-app-database" / "app.db"
    os.environ["APP_DATABASE"] = str(database_path)
    reset_database_status()
    database: DatabaseConnection | None = None
    try:
        database = initialize_database(database_path)
        if database is None:
            raise RuntimeError(f"Impossible d'initialiser la base de test: {database_path}")
        yield database
    finally:
        if database is not None:
            database.close()
        reset_database_status()
        if previous_database is None:
            os.environ.pop("APP_DATABASE", None)
        else:
            os.environ["APP_DATABASE"] = previous_database


@pytest.fixture(scope="function", autouse=True)
def setup_service_container(isolated_app_database: DatabaseConnection) -> Iterator[None]:
    """Initialise le ServiceContainer dans app.state pour chaque test.
    
    Cette fixture s'exécute automatiquement avant chaque test pour s'assurer
    que le ServiceContainer est initialisé, ce qui est requis par les fonctions
    get_* dans api/dependencies.py.
    """
    from api.container import ServiceContainer
    
    # Initialiser le container dans app.state
    app.state.container = ServiceContainer(
        database_connection=isolated_app_database,
    )
    
    yield
    
    app.state.container = None


@pytest.fixture
def client():
    """Fixture pour créer un client de test FastAPI.
    
    Returns:
        TestClient: Client de test FastAPI.
    """
    return TestClient(app)



