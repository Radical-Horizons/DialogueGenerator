"""Tests d'intégration pour vérifier que LLMUsageService met à jour le budget."""
import pytest
from services.llm_usage_service import LLMUsageService
from services.repositories.llm_usage_repository import FileLLMUsageRepository
from services.cost_governance_service import CostGovernanceService
from services.repositories.cost_budget_repository import FileCostBudgetRepository
from services.llm_pricing_service import LLMPricingService


@pytest.fixture
def temp_budget_file(tmp_path):
    """Crée un fichier de budget temporaire."""
    return tmp_path / "cost_budgets.json"


@pytest.fixture
def temp_usage_dir(tmp_path):
    """Crée un dossier d'usage temporaire."""
    return tmp_path / "llm_usage"


def test_track_usage_updates_budget(temp_budget_file, temp_usage_dir):
    """Teste que track_usage met à jour le budget automatiquement."""
    # Créer les repositories
    usage_repository = FileLLMUsageRepository(storage_dir=str(temp_usage_dir))
    budget_repository = FileCostBudgetRepository(storage_file=str(temp_budget_file))
    
    # Créer les services
    cost_service = CostGovernanceService(repository=budget_repository)
    usage_service = LLMUsageService(
        repository=usage_repository,
        cost_governance_service=cost_service
    )
    
    # Configurer un budget initial (0€ dépensés sur 100€)
    cost_service.update_quota("default_user", 100.0)
    
    # Vérifier le budget initial
    initial_status = cost_service.get_budget_status("default_user")
    assert initial_status["amount"] == 0.0
    assert initial_status["quota"] == 100.0
    
    # Enregistrer un usage LLM
    usage_service.track_usage(
        request_id="req_test_1",
        model_name="gpt-5.6-luna",
        prompt_tokens=1000,
        completion_tokens=500,
        total_tokens=1500,
        duration_ms=2500,
        success=True,
        endpoint="test/endpoint",
        k_variants=1
    )
    
    # Vérifier que le budget a été mis à jour
    updated_status = cost_service.get_budget_status("default_user")
    assert updated_status["amount"] > 0.0  # Le montant devrait être > 0
    assert updated_status["quota"] == 100.0  # Le quota ne change pas
    assert updated_status["percentage"] > 0.0  # Le pourcentage devrait être > 0


def test_track_usage_does_not_update_budget_on_failure(temp_budget_file, temp_usage_dir):
    """Teste que track_usage ne met pas à jour le budget si success=False."""
    # Créer les repositories
    usage_repository = FileLLMUsageRepository(storage_dir=str(temp_usage_dir))
    budget_repository = FileCostBudgetRepository(storage_file=str(temp_budget_file))
    
    # Créer les services
    cost_service = CostGovernanceService(repository=budget_repository)
    usage_service = LLMUsageService(
        repository=usage_repository,
        cost_governance_service=cost_service
    )
    
    # Configurer un budget initial
    cost_service.update_quota("default_user", 100.0)
    
    # Vérifier le budget initial
    initial_status = cost_service.get_budget_status("default_user")
    initial_amount = initial_status["amount"]
    
    # Enregistrer un usage LLM en échec
    usage_service.track_usage(
        request_id="req_test_fail",
        model_name="gpt-5.6-luna",
        prompt_tokens=1000,
        completion_tokens=0,
        total_tokens=1000,
        duration_ms=1000,
        success=False,  # Échec
        endpoint="test/endpoint",
        k_variants=1,
        error_message="API Error"
    )
    
    # Vérifier que le budget n'a PAS été mis à jour (success=False)
    updated_status = cost_service.get_budget_status("default_user")
    assert updated_status["amount"] == initial_amount  # Le montant ne devrait pas changer


def test_track_usage_with_prompt_response_then_get_by_dialogue_node(temp_usage_dir):
    """Story 1.15: après track_usage avec prompt/response/dialogue_id/node_id, get_by_dialogue_and_node retourne le record avec prompt et response."""
    usage_repository = FileLLMUsageRepository(storage_dir=str(temp_usage_dir))
    usage_service = LLMUsageService(repository=usage_repository)
    usage_service.track_usage(
        request_id="req_int_1",
        model_name="gpt-5.6-luna",
        prompt_tokens=100,
        completion_tokens=50,
        total_tokens=150,
        duration_ms=200,
        success=True,
        endpoint="generate-node",
        k_variants=1,
        dialogue_id="Dialogue_Test",
        node_id="NODE_CHOICE_0",
        prompt="System: You are a writer.\n\nUser: Continue the dialogue.",
        response='{"node": {"id": "NODE_CHOICE_0", "line": "Hello."}}',
    )
    found = usage_repository.get_by_dialogue_and_node("Dialogue_Test", "NODE_CHOICE_0")
    assert found is not None
    assert found.prompt == "System: You are a writer.\n\nUser: Continue the dialogue."
    assert found.response == '{"node": {"id": "NODE_CHOICE_0", "line": "Hello."}}'
