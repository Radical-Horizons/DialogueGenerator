"""Tests pour les endpoints de cost governance."""
import pytest
from datetime import datetime, timedelta, date, UTC
from unittest.mock import patch
from fastapi.testclient import TestClient
from models.llm_usage import LLMUsageRecord
from services.cost_governance_service import CostGovernanceService
from services.repositories.cost_budget_repository import FileCostBudgetRepository
from services.llm_usage_service import LLMUsageService
from services.repositories.llm_usage_repository import FileLLMUsageRepository
from services.llm_pricing_service import LLMPricingService
from api.main import app
from api.dependencies import get_cost_governance_service, get_llm_usage_service


@pytest.fixture
def client():
    """Crée un client de test FastAPI."""
    return TestClient(app)


@pytest.fixture
def temp_budget_file(tmp_path):
    """Crée un fichier de budget temporaire."""
    return tmp_path / "cost_budgets.json"


@pytest.fixture
def temp_usage_dir(tmp_path):
    """Crée un dossier d'usage temporaire."""
    return tmp_path / "llm_usage"


def test_get_budget(client, temp_budget_file):
    """Teste l'endpoint GET /api/v1/costs/budget."""
    # Créer un repository temporaire
    repository = FileCostBudgetRepository(storage_file=str(temp_budget_file))
    cost_service = CostGovernanceService(repository=repository)
    
    # Override la dépendance FastAPI
    app.dependency_overrides[get_cost_governance_service] = lambda: cost_service
    
    try:
        # Faire la requête
        response = client.get("/api/v1/costs/budget")
        
        assert response.status_code == 200
        data = response.json()
        assert "quota" in data
        assert "amount" in data
        assert "percentage" in data
        assert "remaining" in data
        # Budget par défaut (pas de budget configuré)
        assert data["quota"] == 0.0
        assert data["amount"] == 0.0
    finally:
        # Nettoyer l'override
        app.dependency_overrides.pop(get_cost_governance_service, None)


def test_update_budget(client, temp_budget_file):
    """Teste l'endpoint PUT /api/v1/costs/budget."""
    # Créer un repository temporaire
    repository = FileCostBudgetRepository(storage_file=str(temp_budget_file))
    cost_service = CostGovernanceService(repository=repository)
    
    # Override la dépendance FastAPI
    app.dependency_overrides[get_cost_governance_service] = lambda: cost_service
    
    try:
        # Mettre à jour le quota
        response = client.put(
            "/api/v1/costs/budget",
            json={"quota": 100.0}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["quota"] == 100.0
        assert data["amount"] == 0.0  # Pas encore de dépenses
        assert data["percentage"] == 0.0
        
        # Vérifier que le budget a été sauvegardé
        get_response = client.get("/api/v1/costs/budget")
        assert get_response.status_code == 200
        assert get_response.json()["quota"] == 100.0
    finally:
        # Nettoyer l'override
        app.dependency_overrides.pop(get_cost_governance_service, None)


def test_get_usage_with_graph(client, temp_budget_file, temp_usage_dir):
    """Teste l'endpoint GET /api/v1/costs/usage avec graphique."""
    # Créer des repositories temporaires
    budget_repository = FileCostBudgetRepository(storage_file=str(temp_budget_file))
    usage_repository = FileLLMUsageRepository(storage_dir=str(temp_usage_dir))
    
    cost_service = CostGovernanceService(repository=budget_repository)
    usage_service = LLMUsageService(
        repository=usage_repository,
        pricing_service=LLMPricingService()
    )
    
    # Configurer un budget
    cost_service.update_quota("default_user", 100.0)
    
    # Créer des enregistrements d'usage pour plusieurs jours du mois courant
    # (l'endpoint /costs/usage ne retourne que le mois en cours, de start=1 à end=today)
    now = datetime.now(UTC)
    first_of_month = now.replace(day=1, hour=12, minute=0, second=0, microsecond=0)
    base_time = first_of_month + timedelta(days=4)  # 5 du mois → 5 jours dans le mois
    for i in range(5):
        record = LLMUsageRecord(
            request_id=f"req_{i}",
            timestamp=base_time - timedelta(days=i),
            model_name="gpt-5.2",
            prompt_tokens=1000,
            completion_tokens=500,
            total_tokens=1500,
            estimated_cost=0.01 * (i + 1),  # Coûts différents par jour
            duration_ms=2500,
            success=True,
            endpoint="generate/variants",
            k_variants=3
        )
        usage_repository.save(record)
    
    # Override les dépendances FastAPI
    app.dependency_overrides[get_cost_governance_service] = lambda: cost_service
    app.dependency_overrides[get_llm_usage_service] = lambda: usage_service
    
    try:
        # Figer "today" au 5 du mois pour que l'endpoint inclue les 5 jours (1 à 5)
        fake_today = date(now.year, now.month, 5)
        real_date = date
        real_datetime = datetime

        def _date_constructor(*args: object, **kwargs: object) -> date:
            return real_date(*args, **kwargs)

        with patch("api.routers.costs.date") as mock_date_module, patch(
            "api.routers.costs.datetime"
        ) as mock_datetime_module:
            mock_date_module.today.return_value = fake_today
            mock_date_module.side_effect = _date_constructor
            mock_datetime_module.now.return_value = datetime(
                fake_today.year, fake_today.month, fake_today.day, 12, 0, 0, tzinfo=UTC
            )
            mock_datetime_module.side_effect = lambda *a, **k: real_datetime(*a, **k)
            # Faire la requête (date.today / datetime.now sont mockés au 5 du mois)
            response = client.get("/api/v1/costs/usage")
        
        assert response.status_code == 200
        data = response.json()
        assert "daily_costs" in data
        assert "total" in data
        assert "percentage" in data
        
        # Vérifier les coûts quotidiens
        assert len(data["daily_costs"]) > 0
        assert all("date" in cost for cost in data["daily_costs"])
        assert all("cost" in cost for cost in data["daily_costs"])
        
        # Vérifier le total (somme des coûts)
        total_expected = sum(0.01 * (i + 1) for i in range(5))
        assert data["total"] == pytest.approx(total_expected, rel=1e-2)
    finally:
        # Nettoyer les overrides
        app.dependency_overrides.pop(get_cost_governance_service, None)
        app.dependency_overrides.pop(get_llm_usage_service, None)
