"""Tests pour le middleware de cost governance."""
import pytest
import threading
from unittest.mock import patch
from fastapi import FastAPI
from fastapi.testclient import TestClient
from fastapi.responses import JSONResponse

from api.middleware.cost_governance import CostGovernanceMiddleware
from services.cost_governance_service import CostGovernanceService
from services.repositories.cost_budget_repository import FileCostBudgetRepository


# Note: Les apps de test sont créées dans chaque fixture pour éviter les conflits


@pytest.fixture
def temp_budget_file(tmp_path):
    """Crée un fichier de budget temporaire."""
    return tmp_path / "cost_budgets.json"


# Fixture supprimée - chaque test crée son propre client


def test_middleware_allows_under_budget(temp_budget_file):
    """Teste que le middleware autorise les requêtes sous le budget."""
    # Créer le repository et le service
    repository = FileCostBudgetRepository(storage_file=str(temp_budget_file))
    cost_service = CostGovernanceService(repository=repository)
    
    # Configurer un budget (0€ dépensés sur 100€)
    cost_service.update_quota("default_user", 100.0)
    
    # Créer l'app de test avec le middleware
    test_app = FastAPI()
    test_app.add_middleware(CostGovernanceMiddleware)
    
    @test_app.post("/api/v1/dialogues/generate/unity-dialogue")
    async def test_generate():
        return JSONResponse(content={"status": "generated"})
    
    # Mock get_cost_budget_repository pour utiliser le repository temporaire
    with patch("api.middleware.cost_governance.get_cost_budget_repository", return_value=repository):
        client = TestClient(test_app)
        
        # Budget: 0€ dépensés sur 100€ (0%)
        response = client.post(
            "/api/v1/dialogues/generate/unity-dialogue",
            json={"test": "data"}
        )
        
        # Devrait être autorisé (pas de blocage)
        assert response.status_code == 200
        assert response.json()["status"] == "generated"


def test_middleware_blocks_at_100_percent(temp_budget_file):
    """Teste que le middleware bloque à 100% du budget."""
    from datetime import datetime
    
    # Configurer le budget à 100€ dépensés sur 100€ (100%)
    repository = FileCostBudgetRepository(storage_file=str(temp_budget_file))
    current_month = datetime.now().strftime("%Y-%m")
    repository.update_budget("default_user", current_month, 100.0, 100.0)
    
    # Créer l'app de test avec le middleware
    test_app = FastAPI()
    test_app.add_middleware(CostGovernanceMiddleware)
    
    @test_app.post("/api/v1/dialogues/generate/unity-dialogue")
    async def test_generate():
        return JSONResponse(content={"status": "generated"})
    
    # Mock get_cost_budget_repository pour utiliser le repository temporaire
    with patch("api.middleware.cost_governance.get_cost_budget_repository", return_value=repository):
        client = TestClient(test_app)
        
        # Tenter une génération
        response = client.post(
            "/api/v1/dialogues/generate/unity-dialogue",
            json={"test": "data"}
        )
        
        # Devrait être bloqué avec HTTP 429
        assert response.status_code == 429
        assert "error" in response.json()
        assert response.json()["error"]["code"] == "QUOTA_EXCEEDED"


def test_middleware_warns_at_90_percent(temp_budget_file):
    """Teste que le middleware affiche un warning à 90% mais autorise."""
    from datetime import datetime
    
    # Configurer le budget à 90€ dépensés sur 100€ (90%)
    repository = FileCostBudgetRepository(storage_file=str(temp_budget_file))
    current_month = datetime.now().strftime("%Y-%m")
    repository.update_budget("default_user", current_month, 90.0, 100.0)
    
    # Créer l'app de test avec le middleware
    test_app = FastAPI()
    test_app.add_middleware(CostGovernanceMiddleware)
    
    @test_app.post("/api/v1/dialogues/generate/unity-dialogue")
    async def test_generate():
        return JSONResponse(content={"status": "generated"})
    
    # Mock get_cost_budget_repository pour utiliser le repository temporaire
    with patch("api.middleware.cost_governance.get_cost_budget_repository", return_value=repository):
        client = TestClient(test_app)
        
        # Tenter une génération
        response = client.post(
            "/api/v1/dialogues/generate/unity-dialogue",
            json={"test": "data"}
        )
        
        # Devrait être autorisé (pas de blocage) mais avec warning loggé
        assert response.status_code == 200
        assert response.json()["status"] == "generated"


def test_middleware_ignores_non_generation_endpoints():
    """Teste que le middleware ignore les endpoints non-génération."""
    test_app = FastAPI()
    test_app.add_middleware(CostGovernanceMiddleware)
    
    @test_app.get("/api/v1/other-endpoint")
    async def test_other():
        return JSONResponse(content={"status": "ok"})
    
    client = TestClient(test_app)
    
    # Requête GET vers un endpoint non-génération
    response = client.get("/api/v1/other-endpoint")
    
    # Devrait passer sans vérification budget
    assert response.status_code == 200


def test_middleware_concurrent_requests_under_budget(temp_budget_file):
    """Teste le middleware avec requêtes concurrentes sous le budget."""
    from datetime import datetime
    
    # Configurer un budget (0€ dépensés sur 1000€ pour permettre plusieurs requêtes)
    repository = FileCostBudgetRepository(storage_file=str(temp_budget_file))
    cost_service = CostGovernanceService(repository=repository)
    cost_service.update_quota("default_user", 1000.0)
    
    # Créer l'app de test avec le middleware
    test_app = FastAPI()
    test_app.add_middleware(CostGovernanceMiddleware)
    
    @test_app.post("/api/v1/dialogues/generate/unity-dialogue")
    async def test_generate():
        return JSONResponse(content={"status": "generated"})
    
    # Mock get_cost_budget_repository pour utiliser le repository temporaire
    with patch("api.middleware.cost_governance.get_cost_budget_repository", return_value=repository):
        client = TestClient(test_app)
        
        responses = []
        errors = []
        
        def make_request(thread_id: int):
            """Faire une requête POST."""
            try:
                response = client.post(
                    "/api/v1/dialogues/generate/unity-dialogue",
                    json={"test": f"data_{thread_id}"}
                )
                responses.append((thread_id, response.status_code))
            except Exception as e:
                errors.append((thread_id, str(e)))
        
        # Lancer 5 requêtes concurrentes
        threads = []
        for i in range(5):
            thread = threading.Thread(target=make_request, args=(i,))
            threads.append(thread)
            thread.start()
        
        # Attendre que tous les threads se terminent
        for thread in threads:
            thread.join()
        
        # Vérifier qu'il n'y a pas eu d'erreurs
        assert len(errors) == 0, f"Erreurs lors des requêtes concurrentes: {errors}"
        
        # Vérifier que toutes les requêtes ont été autorisées (200)
        assert len(responses) == 5
        for thread_id, status_code in responses:
            assert status_code == 200, f"Thread {thread_id} a reçu un status code inattendu: {status_code}"


def test_middleware_concurrent_requests_at_90_percent(temp_budget_file):
    """Teste le middleware avec requêtes concurrentes à 90% (warnings mais autorisées)."""
    from datetime import datetime
    
    # Configurer le budget à 90€ dépensés sur 100€ (90%)
    repository = FileCostBudgetRepository(storage_file=str(temp_budget_file))
    current_month = datetime.now().strftime("%Y-%m")
    repository.update_budget("default_user", current_month, 90.0, 100.0)
    
    # Créer l'app de test avec le middleware
    test_app = FastAPI()
    test_app.add_middleware(CostGovernanceMiddleware)
    
    @test_app.post("/api/v1/dialogues/generate/unity-dialogue")
    async def test_generate():
        return JSONResponse(content={"status": "generated"})
    
    # Mock get_cost_budget_repository pour utiliser le repository temporaire
    with patch("api.middleware.cost_governance.get_cost_budget_repository", return_value=repository):
        client = TestClient(test_app)
        
        responses = []
        
        def make_request(thread_id: int):
            """Faire une requête POST."""
            response = client.post(
                "/api/v1/dialogues/generate/unity-dialogue",
                json={"test": f"data_{thread_id}"}
            )
            responses.append((thread_id, response.status_code))
        
        # Lancer 3 requêtes concurrentes
        threads = []
        for i in range(3):
            thread = threading.Thread(target=make_request, args=(i,))
            threads.append(thread)
            thread.start()
        
        # Attendre que tous les threads se terminent
        for thread in threads:
            thread.join()
        
        # Vérifier que toutes les requêtes ont été autorisées (200) malgré le warning
        assert len(responses) == 3
        for thread_id, status_code in responses:
            assert status_code == 200, f"Thread {thread_id} devrait être autorisé avec warning"


def test_middleware_resolve_model_uses_x_llm_model_header_when_known() -> None:
    """L'en-tête X-LLM-Model (si présent dans llm_pricing.json) prime sur le défaut."""
    from starlette.requests import Request

    test_app = FastAPI()
    mw = CostGovernanceMiddleware(test_app)
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "method": "POST",
        "path": "/api/v1/dialogues/generate/jobs",
        "raw_path": b"/",
        "root_path": "",
        "scheme": "http",
        "query_string": b"",
        "headers": [(b"x-llm-model", b"gpt-5-nano")],
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 80),
    }
    req = Request(scope)
    assert mw._resolve_model_for_cost_estimate(req) == "gpt-5-nano"


def test_middleware_resolve_model_ignores_unknown_x_llm_model_header() -> None:
    """Un modèle inconnu dans l'en-tête est ignoré ; retour au défaut sans query."""
    from starlette.requests import Request
    from constants import Defaults

    test_app = FastAPI()
    mw = CostGovernanceMiddleware(test_app)
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "method": "POST",
        "path": "/api/v1/dialogues/generate/jobs",
        "raw_path": b"/",
        "root_path": "",
        "scheme": "http",
        "query_string": b"",
        "headers": [(b"x-llm-model", b"totally-unknown-model-xyz")],
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 80),
    }
    req = Request(scope)
    assert mw._resolve_model_for_cost_estimate(req) == Defaults.MODEL_ID
