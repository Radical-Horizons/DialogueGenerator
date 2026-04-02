"""Configuration globale des tests pytest."""
import os
import pytest
from fastapi.testclient import TestClient

# IMPORTANT: certains singletons (SecurityConfig / rate limiter) sont initialisés à l'import de `api.main`.
# On fixe donc l'env AVANT l'import pour éviter des 429 en tests.
os.environ.setdefault("AUTH_RATE_LIMIT_ENABLED", "false")
# JWT requis sur les routeurs métier ; mock user si DISABLE_AUTH=true (défaut aligné .env.example dev).
os.environ.setdefault("DISABLE_AUTH", "true")

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
def setup_service_container():
    """Initialise le ServiceContainer dans app.state pour chaque test.
    
    Cette fixture s'exécute automatiquement avant chaque test pour s'assurer
    que le ServiceContainer est initialisé, ce qui est requis par les fonctions
    get_* dans api/dependencies.py.
    """
    from api.container import ServiceContainer
    
    # Initialiser le container dans app.state
    if not hasattr(app.state, "container") or app.state.container is None:
        app.state.container = ServiceContainer()
    
    yield
    
    # Nettoyer après le test (optionnel, mais bon pour l'isolation)
    # On peut laisser le container en place pour les tests suivants


@pytest.fixture
def client():
    """Fixture pour créer un client de test FastAPI.
    
    Returns:
        TestClient: Client de test FastAPI.
    """
    return TestClient(app)



