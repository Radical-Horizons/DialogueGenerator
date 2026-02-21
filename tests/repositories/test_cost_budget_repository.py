"""Tests pour le repository de budgets LLM."""
import pytest
import json
import tempfile
import threading
from pathlib import Path
from datetime import datetime
from services.repositories.cost_budget_repository import FileCostBudgetRepository


@pytest.fixture
def temp_storage_file(tmp_path):
    """Crée un fichier de stockage temporaire."""
    return tmp_path / "cost_budgets.json"


@pytest.fixture
def budget_repository(temp_storage_file):
    """Crée un repository avec fichier temporaire."""
    return FileCostBudgetRepository(storage_file=str(temp_storage_file))


def test_get_budget_existing(budget_repository, temp_storage_file):
    """Teste get_budget avec budget existant."""
    # Setup: créer un budget existant
    data = {
        "budgets": {
            "user_1": {
                "month": "2026-01",
                "amount": 75.0,
                "quota": 100.0,
                "updated_at": datetime.now().isoformat()
            }
        }
    }
    temp_storage_file.write_text(json.dumps(data, indent=2), encoding='utf-8')
    
    budget = budget_repository.get_budget("user_1", "2026-01")
    
    assert budget is not None
    assert budget["month"] == "2026-01"
    assert budget["amount"] == 75.0
    assert budget["quota"] == 100.0


def test_get_budget_not_existing(budget_repository):
    """Teste get_budget avec budget inexistant."""
    budget = budget_repository.get_budget("user_unknown", "2026-01")
    assert budget is None


def test_get_budget_wrong_month(budget_repository, temp_storage_file):
    """Teste get_budget avec mois différent."""
    # Setup: créer un budget pour un mois différent
    data = {
        "budgets": {
            "user_1": {
                "month": "2025-12",
                "amount": 75.0,
                "quota": 100.0,
                "updated_at": datetime.now().isoformat()
            }
        }
    }
    temp_storage_file.write_text(json.dumps(data, indent=2), encoding='utf-8')
    
    budget = budget_repository.get_budget("user_1", "2026-01")
    
    # Devrait retourner None car le mois ne correspond pas
    assert budget is None


def test_update_budget_new_user(budget_repository, temp_storage_file):
    """Teste update_budget pour un nouvel utilisateur."""
    budget_repository.update_budget("user_1", "2026-01", 50.0, 100.0)
    
    # Vérifier que le fichier a été créé
    assert temp_storage_file.exists()
    
    # Vérifier le contenu
    data = json.loads(temp_storage_file.read_text(encoding='utf-8'))
    user_budget = data["budgets"]["user_1"]
    assert user_budget["month"] == "2026-01"
    assert user_budget["amount"] == 50.0
    assert user_budget["quota"] == 100.0


def test_update_budget_existing_user(budget_repository, temp_storage_file):
    """Teste update_budget pour un utilisateur existant."""
    # Setup: créer un budget existant
    data = {
        "budgets": {
            "user_1": {
                "month": "2026-01",
                "amount": 50.0,
                "quota": 100.0,
                "updated_at": datetime.now().isoformat()
            }
        }
    }
    temp_storage_file.write_text(json.dumps(data, indent=2), encoding='utf-8')
    
    # Mettre à jour le budget
    budget_repository.update_budget("user_1", "2026-01", 75.0, 100.0)
    
    # Vérifier le contenu mis à jour
    data = json.loads(temp_storage_file.read_text(encoding='utf-8'))
    user_budget = data["budgets"]["user_1"]
    assert user_budget["amount"] == 75.0
    assert user_budget["quota"] == 100.0


def test_reset_month_new_user(budget_repository, temp_storage_file):
    """Teste reset_month pour un nouvel utilisateur."""
    budget_repository.reset_month("user_1", "2026-01")
    
    # Vérifier que le fichier a été créé
    assert temp_storage_file.exists()
    
    # Vérifier le contenu
    data = json.loads(temp_storage_file.read_text(encoding='utf-8'))
    user_budget = data["budgets"]["user_1"]
    assert user_budget["month"] == "2026-01"
    assert user_budget["amount"] == 0.0
    assert user_budget["quota"] == 0.0


def test_reset_month_existing_user_preserve_quota(budget_repository, temp_storage_file):
    """Teste reset_month pour un utilisateur existant (préserve quota)."""
    # Setup: créer un budget existant
    data = {
        "budgets": {
            "user_1": {
                "month": "2025-12",
                "amount": 90.0,
                "quota": 100.0,
                "updated_at": datetime.now().isoformat()
            }
        }
    }
    temp_storage_file.write_text(json.dumps(data, indent=2), encoding='utf-8')
    
    # Reset vers nouveau mois
    budget_repository.reset_month("user_1", "2026-01")
    
    # Vérifier le contenu
    data = json.loads(temp_storage_file.read_text(encoding='utf-8'))
    user_budget = data["budgets"]["user_1"]
    assert user_budget["month"] == "2026-01"
    assert user_budget["amount"] == 0.0  # Reset à 0
    assert user_budget["quota"] == 100.0  # Quota préservé


def test_update_budget_concurrent_requests(budget_repository, temp_storage_file):
    """Teste update_budget avec requêtes concurrentes (protection race condition)."""
    from datetime import datetime
    
    month = datetime.now().strftime("%Y-%m")
    
    # Setup: créer un budget initial
    budget_repository.update_budget("user_1", month, 50.0, 100.0)
    
    # Simuler 10 requêtes concurrentes qui ajoutent chacune 1€
    results = []
    errors = []
    
    def update_budget_thread(thread_id: int):
        """Thread qui met à jour le budget."""
        try:
            # Opération atomique (read-modify-write sous lock)
            budget_repository.add_cost("user_1", month, 1.0, 100.0)
            results.append(thread_id)
        except Exception as e:
            errors.append((thread_id, str(e)))
    
    # Créer et lancer 10 threads concurrents
    threads = []
    for i in range(10):
        thread = threading.Thread(target=update_budget_thread, args=(i,))
        threads.append(thread)
        thread.start()
    
    # Attendre que tous les threads se terminent
    for thread in threads:
        thread.join()
    
    # Vérifier qu'il n'y a pas eu d'erreurs
    assert len(errors) == 0, f"Erreurs lors des updates concurrents: {errors}"
    
    # Vérifier que le montant final est correct (50 + 10 = 60€)
    final_budget = budget_repository.get_budget("user_1", month)
    assert final_budget is not None
    # Le montant devrait être 50 + 10 = 60€ (toutes les updates ont été appliquées)
    # Note: Avec le lock, toutes les updates sont sérialisées, donc le résultat devrait être exact
    assert final_budget["amount"] == pytest.approx(60.0, rel=1e-2)
    assert len(results) == 10  # Tous les threads ont réussi


def test_update_budget_concurrent_users(budget_repository, temp_storage_file):
    """Teste update_budget avec plusieurs utilisateurs concurrents."""
    from datetime import datetime
    
    month = datetime.now().strftime("%Y-%m")
    
    # Créer des budgets pour 3 utilisateurs différents
    users = ["user_1", "user_2", "user_3"]
    for user_id in users:
        budget_repository.update_budget(user_id, month, 0.0, 100.0)
    
    # Simuler des updates concurrents pour chaque utilisateur
    def update_user_budget(user_id: str, amount: float):
        """Mise à jour du budget d'un utilisateur."""
        try:
            budget_repository.update_budget(user_id, month, amount, 100.0)
        except Exception as e:
            return str(e)
        return None
    
    # Lancer des updates concurrents
    threads = []
    for user_id in users:
        thread = threading.Thread(target=update_user_budget, args=(user_id, 25.0))
        threads.append(thread)
        thread.start()
    
    # Attendre que tous les threads se terminent
    for thread in threads:
        thread.join()
    
    # Vérifier que tous les budgets ont été mis à jour correctement
    for user_id in users:
        budget = budget_repository.get_budget(user_id, month)
        assert budget is not None
        assert budget["amount"] == 25.0
