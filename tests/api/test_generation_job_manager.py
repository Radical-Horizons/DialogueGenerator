"""Tests unitaires pour GenerationJobManager."""
import pytest
import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock
from api.services.generation_job_manager import GenerationJobManager


@pytest.fixture
def job_manager():
    """Fixture pour créer un GenerationJobManager."""
    return GenerationJobManager(ttl_seconds=3600)


@pytest.fixture
def job_id(job_manager):
    """Fixture pour créer un job de test."""
    params = {"user_instructions": "Test dialogue"}
    return job_manager.create_job(params, owner_username="test_owner")


def test_cancel_job_annules_asyncio_task(job_manager, job_id):
    """Test que cancel_job() annule la tâche asyncio si elle existe."""
    # Créer une tâche asyncio mock
    mock_task = MagicMock()
    mock_task.done.return_value = False
    
    # Enregistrer la tâche
    job_manager.register_task(job_id, mock_task)
    
    # Annuler le job
    result = job_manager.cancel_job(job_id)
    
    # Vérifier que la tâche a été annulée
    assert result is True
    assert mock_task.cancel.called
    assert job_manager.is_cancelled(job_id) is True


def test_cancel_job_logs_detailed_metadata(job_manager, job_id, caplog):
    """Test que cancel_job() log des métadonnées détaillées (timestamp, durée)."""
    import logging
    
    # Attendre un peu pour avoir une durée > 0
    import time
    time.sleep(0.1)
    
    # Annuler le job
    job_manager.cancel_job(job_id)
    
    # Vérifier que les logs contiennent les métadonnées
    log_records = [r for r in caplog.records if 'Génération annulée par utilisateur' in r.message]
    assert len(log_records) > 0
    
    log_message = log_records[0].message
    assert f"job_id: {job_id}" in log_message
    assert "durée:" in log_message
    assert "timestamp:" in log_message
    
    # Vérifier que les extra contiennent les métadonnées
    assert 'job_id' in log_records[0].__dict__
    assert 'duration_seconds' in log_records[0].__dict__
    assert 'timestamp' in log_records[0].__dict__


@pytest.mark.asyncio
async def test_wait_for_completion_timeout_works(job_manager, job_id):
    """Test que wait_for_completion() respecte le timeout de 10s."""
    # Créer un job qui ne se terminera jamais (pas de done_event.set())
    # Le timeout devrait être atteint
    
    start_time = datetime.now(timezone.utc)
    result = await job_manager.wait_for_completion(job_id, timeout_seconds=0.1)  # Timeout court pour test rapide
    end_time = datetime.now(timezone.utc)
    
    # Vérifier que le timeout a été atteint (retourne False)
    assert result is False
    
    # Vérifier que le timeout a été respecté (environ 0.1s)
    duration = (end_time - start_time).total_seconds()
    assert 0.05 <= duration <= 0.2  # Tolérance pour les variations de timing


@pytest.mark.asyncio
async def test_wait_for_completion_returns_true_when_completed(job_manager, job_id):
    """Test que wait_for_completion() retourne True quand le job est complété."""
    # Marquer le job comme complété dans un autre thread
    async def complete_job():
        await asyncio.sleep(0.05)
        job_manager.update_status(job_id, "completed")
    
    # Démarrer la tâche de complétion
    asyncio.create_task(complete_job())
    
    # Attendre la complétion avec timeout
    result = await job_manager.wait_for_completion(job_id, timeout_seconds=1.0)
    
    # Vérifier que le résultat est True
    assert result is True


def test_unregister_task_removes_task_reference(job_manager, job_id):
    """Test que unregister_task() supprime la référence à la tâche."""
    # Enregistrer une tâche
    mock_task = MagicMock()
    job_manager.register_task(job_id, mock_task)
    
    # Vérifier que la tâche est enregistrée
    assert job_id in job_manager._tasks
    
    # Désenregistrer la tâche
    job_manager.unregister_task(job_id)
    
    # Vérifier que la tâche n'est plus enregistrée
    assert job_id not in job_manager._tasks


def test_cancel_job_returns_false_for_nonexistent_job(job_manager):
    """Test que cancel_job() retourne False pour un job inexistant."""
    result = job_manager.cancel_job("nonexistent-job-id")
    assert result is False


def test_cancel_job_returns_false_for_already_finished_job(job_manager, job_id):
    """Test que cancel_job() retourne False pour un job déjà terminé."""
    # Marquer le job comme complété
    job_manager.update_status(job_id, "completed")
    
    # Essayer d'annuler
    result = job_manager.cancel_job(job_id)
    
    # Vérifier que l'annulation a échoué
    assert result is False
