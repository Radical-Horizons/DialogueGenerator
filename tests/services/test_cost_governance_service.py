"""Tests pour le service de cost governance."""
import pytest
from datetime import datetime
from unittest.mock import Mock, MagicMock
from services.cost_governance_service import CostGovernanceService
from services.repositories.cost_budget_repository import ICostBudgetRepository


@pytest.fixture
def mock_budget_repository():
    """Crée un repository mock pour les budgets."""
    return Mock(spec=ICostBudgetRepository)


@pytest.fixture
def cost_governance_service(mock_budget_repository):
    """Crée un service de cost governance avec mock repository."""
    return CostGovernanceService(repository=mock_budget_repository)


def test_check_budget_allowed_under_90_percent(cost_governance_service, mock_budget_repository):
    """Teste check_budget quand budget < 90% (pas de warning)."""
    # Setup: budget actuel = 50€ sur 100€ (50%)
    current_month = datetime.now().strftime("%Y-%m")
    mock_budget_repository.get_budget.return_value = {
        "month": current_month,
        "amount": 50.0,
        "quota": 100.0,
        "updated_at": datetime.now().isoformat()
    }
    
    result = cost_governance_service.check_budget(user_id="user_1", estimated_cost=10.0)
    
    assert result["allowed"] is True
    assert result["percentage"] == pytest.approx(60.0, rel=1e-2)  # (50+10)/100 = 60%
    assert result["warning"] is None


def test_check_budget_soft_warning_at_90_percent(cost_governance_service, mock_budget_repository):
    """Teste check_budget avec soft warning à 90%."""
    # Setup: budget actuel = 80€ sur 100€, coût estimé = 10€ → 90€ total (90%)
    current_month = datetime.now().strftime("%Y-%m")
    mock_budget_repository.get_budget.return_value = {
        "month": current_month,
        "amount": 80.0,
        "quota": 100.0,
        "updated_at": datetime.now().isoformat()
    }
    
    result = cost_governance_service.check_budget(user_id="user_1", estimated_cost=10.0)
    
    assert result["allowed"] is True
    assert result["percentage"] == pytest.approx(90.0, rel=1e-2)  # (80+10)/100 = 90%
    assert result["warning"] is not None
    assert "Budget atteint" in result["warning"]
    assert "90" in result["warning"]  # Vérifie que le pourcentage est dans le message


def test_check_budget_hard_block_at_100_percent(cost_governance_service, mock_budget_repository):
    """Teste check_budget avec hard block à 100%."""
    # Setup: budget actuel = 90€ sur 100€, coût estimé = 10€ → 100€ total (100%)
    current_month = datetime.now().strftime("%Y-%m")
    mock_budget_repository.get_budget.return_value = {
        "month": current_month,
        "amount": 90.0,
        "quota": 100.0,
        "updated_at": datetime.now().isoformat()
    }
    
    result = cost_governance_service.check_budget(user_id="user_1", estimated_cost=10.0)
    
    assert result["allowed"] is False
    assert result["percentage"] == pytest.approx(100.0, rel=1e-2)  # (90+10)/100 = 100%
    assert result["warning"] is not None


def test_check_budget_hard_block_over_100_percent(cost_governance_service, mock_budget_repository):
    """Teste check_budget avec hard block > 100%."""
    # Setup: budget actuel = 95€ sur 100€, coût estimé = 10€ → 105€ total (105%)
    current_month = datetime.now().strftime("%Y-%m")
    mock_budget_repository.get_budget.return_value = {
        "month": current_month,
        "amount": 95.0,
        "quota": 100.0,
        "updated_at": datetime.now().isoformat()
    }
    
    result = cost_governance_service.check_budget(user_id="user_1", estimated_cost=10.0)
    
    assert result["allowed"] is False
    assert result["percentage"] == pytest.approx(105.0, rel=1e-2)  # (95+10)/100 = 105%


def test_check_budget_reset_monthly(cost_governance_service, mock_budget_repository):
    """Teste reset mensuel automatique."""
    from datetime import datetime
    current_month = datetime.now().strftime("%Y-%m")
    previous_month = "2025-12"  # Mois précédent
    
    # Setup: budget du mois précédent
    mock_budget_repository.get_budget.return_value = {
        "month": previous_month,
        "amount": 90.0,
        "quota": 100.0,
        "updated_at": datetime.now().isoformat()
    }
    
    # Mock reset_month pour vérifier qu'il est appelé
    mock_budget_repository.reset_month = Mock()
    
    result = cost_governance_service.check_budget(user_id="user_1", estimated_cost=10.0)
    
    # Vérifier que reset_month a été appelé avec le nouveau mois
    mock_budget_repository.reset_month.assert_called_once_with("user_1", current_month)
    
    # Après reset, amount = 0.0, donc (0+10)/100 = 10%
    assert result["allowed"] is True
    assert result["percentage"] == pytest.approx(10.0, rel=1e-2)


def test_get_budget_status(cost_governance_service, mock_budget_repository):
    """Teste get_budget_status."""
    current_month = datetime.now().strftime("%Y-%m")
    mock_budget_repository.get_budget.return_value = {
        "month": current_month,
        "amount": 75.0,
        "quota": 100.0,
        "updated_at": datetime.now().isoformat()
    }
    
    status = cost_governance_service.get_budget_status(user_id="user_1")
    
    assert status["quota"] == 100.0
    assert status["amount"] == 75.0
    assert status["percentage"] == pytest.approx(75.0, rel=1e-2)
    assert status["remaining"] == pytest.approx(25.0, rel=1e-2)


def test_update_budget(cost_governance_service, mock_budget_repository):
    """Teste update_budget."""
    current_month = datetime.now().strftime("%Y-%m")
    
    # Setup: budget existant avec 50€ dépensés sur 100€
    mock_budget_repository.get_budget.return_value = {
        "month": current_month,
        "amount": 50.0,
        "quota": 100.0,
        "updated_at": datetime.now().isoformat()
    }
    
    cost_governance_service.update_budget(
        user_id="user_1",
        cost=15.0
    )
    
    # Vérifier que update_budget a été appelé avec les bons paramètres
    mock_budget_repository.update_budget.assert_called_once()
    call_args = mock_budget_repository.update_budget.call_args
    assert call_args[0][0] == "user_1"  # user_id
    assert call_args[0][1] == current_month  # month
    assert call_args[0][2] == 65.0  # amount (50 + 15 = 65)
    assert call_args[0][3] == 100.0  # quota (préservé)


def test_check_budget_quota_zero_means_unlimited(cost_governance_service, mock_budget_repository):
    """Quota 0 (ou absent) = pas de plafond : générations autorisées."""
    current_month = datetime.now().strftime("%Y-%m")
    mock_budget_repository.get_budget.return_value = {
        "month": current_month,
        "amount": 0.0,
        "quota": 0.0,
        "updated_at": datetime.now().isoformat(),
    }

    result = cost_governance_service.check_budget(user_id="user_1", estimated_cost=50.0)

    assert result["allowed"] is True
    assert result["percentage"] == 0.0
    assert result["warning"] is None
