"""Tests pour le service de tracking d'utilisation LLM."""
import pytest
from datetime import date, datetime, timedelta, UTC
from unittest.mock import Mock, MagicMock
from services.llm_usage_service import LLMUsageService
from services.llm_pricing_service import LLMPricingService
from models.llm_usage import LLMUsageRecord


@pytest.fixture
def mock_repository():
    """Crée un repository mock."""
    return Mock()


@pytest.fixture
def mock_pricing_service():
    """Crée un service de pricing mock."""
    service = Mock(spec=LLMPricingService)
    service.calculate_cost.return_value = 0.005
    return service


@pytest.fixture
def usage_service(mock_repository, mock_pricing_service):
    """Crée un service de tracking avec mocks."""
    return LLMUsageService(
        repository=mock_repository,
        pricing_service=mock_pricing_service
    )


def test_track_usage(usage_service, mock_repository, mock_pricing_service):
    """Teste l'enregistrement d'un appel LLM."""
    usage_service.track_usage(
        request_id="req_123",
        model_name="gpt-5.6-terra",
        prompt_tokens=1000,
        completion_tokens=500,
        total_tokens=1500,
        duration_ms=2500,
        success=True,
        endpoint="generate/variants",
        k_variants=3
    )
    
    # Vérifier que le pricing service a été appelé
    mock_pricing_service.calculate_cost.assert_called_once_with(
        model_name="gpt-5.6-terra",
        prompt_tokens=1000,
        completion_tokens=500
    )
    
    # Vérifier que le repository a été appelé
    assert mock_repository.save.called
    saved_record = mock_repository.save.call_args[0][0]
    assert isinstance(saved_record, LLMUsageRecord)
    assert saved_record.request_id == "req_123"
    assert saved_record.model_name == "gpt-5.6-terra"
    assert saved_record.total_tokens == 1500


def test_track_usage_with_prompt_and_response(usage_service, mock_repository):
    """Story 1.15: track_usage accepte prompt et response optionnels et les enregistre."""
    usage_service.track_usage(
        request_id="req_prompt",
        model_name="gpt-5.6-terra",
        prompt_tokens=100,
        completion_tokens=50,
        total_tokens=150,
        duration_ms=100,
        success=True,
        endpoint="generate/variants",
        k_variants=1,
        prompt="Full prompt text",
        response="LLM raw response",
    )
    saved_record = mock_repository.save.call_args[0][0]
    assert saved_record.prompt == "Full prompt text"
    assert saved_record.response == "LLM raw response"


def test_track_usage_with_fallback_from_reason(usage_service, mock_repository):
    """Story 1.16: track_usage accepte fallback_from et fallback_reason et les enregistre."""
    usage_service.track_usage(
        request_id="req_fallback",
        model_name="mistralai/mistral-medium-3-5",
        prompt_tokens=100,
        completion_tokens=50,
        total_tokens=150,
        duration_ms=100,
        success=True,
        endpoint="generate/unity-dialogue",
        k_variants=1,
        fallback_from="gpt-5.6-terra",
        fallback_reason="Timeout",
    )
    saved_record = mock_repository.save.call_args[0][0]
    assert saved_record.fallback_from == "gpt-5.6-terra"
    assert saved_record.fallback_reason == "Timeout"


def test_track_usage_without_prompt_response_backward_compat(usage_service, mock_repository):
    """Story 1.15: track_usage sans prompt/response laisse None (rétrocompat)."""
    usage_service.track_usage(
        request_id="req_no_prompt",
        model_name="gpt-5.6-terra",
        prompt_tokens=100,
        completion_tokens=50,
        total_tokens=150,
        duration_ms=100,
        success=True,
        endpoint="generate/variants",
        k_variants=1,
    )
    saved_record = mock_repository.save.call_args[0][0]
    assert getattr(saved_record, "prompt", None) is None
    assert getattr(saved_record, "response", None) is None


def test_track_usage_with_error(usage_service, mock_repository):
    """Teste l'enregistrement d'un appel en erreur."""
    usage_service.track_usage(
        request_id="req_456",
        model_name="gpt-5.6-terra",
        prompt_tokens=1000,
        completion_tokens=0,
        total_tokens=1000,
        duration_ms=1000,
        success=False,
        endpoint="generate/variants",
        k_variants=1,
        error_message="API Error"
    )
    
    saved_record = mock_repository.save.call_args[0][0]
    assert saved_record.success is False
    assert saved_record.error_message == "API Error"
    # Story 1.15 AC#5: coût 0€ pour génération échouée
    assert saved_record.estimated_cost == 0.0


def test_get_usage_history(usage_service, mock_repository):
    """Teste la récupération de l'historique."""
    # Mock des enregistrements
    mock_records = [
        LLMUsageRecord(
            request_id=f"req_{i}",
            timestamp=datetime.now(UTC),
            model_name="gpt-5.6-terra",
            prompt_tokens=1000,
            completion_tokens=500,
            total_tokens=1500,
            estimated_cost=0.005,
            duration_ms=2500,
            success=True,
            endpoint="generate/variants",
            k_variants=3
        )
        for i in range(10)
    ]
    mock_repository.get_by_date_range.return_value = mock_records
    
    start_date = date.today() - timedelta(days=7)
    end_date = date.today()
    
    records = usage_service.get_usage_history(
        start_date=start_date,
        end_date=end_date
    )
    
    assert len(records) == 10
    mock_repository.get_by_date_range.assert_called_once_with(
        start_date=start_date,
        end_date=end_date,
        model_name=None
    )


def test_get_statistics(usage_service, mock_repository):
    """Teste le calcul des statistiques."""
    mock_stats = {
        "total_tokens": 15000,
        "total_prompt_tokens": 10000,
        "total_completion_tokens": 5000,
        "total_cost": 0.05,
        "calls_count": 10,
        "success_count": 9,
        "error_count": 1,
        "success_rate": 90.0,
        "avg_duration_ms": 2500.0
    }
    mock_repository.get_statistics.return_value = mock_stats
    
    stats = usage_service.get_statistics()
    
    assert stats["total_tokens"] == 15000
    assert stats["calls_count"] == 10
    assert stats["success_rate"] == 90.0


# ── Tests Story 1.12 ─────────────────────────────────────────────────────────

def test_track_usage_with_dialogue_context(usage_service, mock_repository):
    """Teste que track_usage accepte dialogue_id et node_id optionnels."""
    usage_service.track_usage(
        request_id="req_diag_1",
        model_name="gpt-5.6-terra",
        prompt_tokens=800,
        completion_tokens=200,
        total_tokens=1000,
        duration_ms=1200,
        success=True,
        endpoint="generate-node",
        dialogue_id="dialogue_abc",
        node_id="node_xyz",
    )
    
    saved_record = mock_repository.save.call_args[0][0]
    assert saved_record.dialogue_id == "dialogue_abc"
    assert saved_record.node_id == "node_xyz"


def test_track_usage_backwards_compatible_no_dialogue_context(usage_service, mock_repository):
    """Teste que track_usage reste compatible sans dialogue_id/node_id."""
    usage_service.track_usage(
        request_id="req_legacy",
        model_name="gpt-5.6-terra",
        prompt_tokens=500,
        completion_tokens=100,
        total_tokens=600,
        duration_ms=800,
        success=True,
        endpoint="generate/variants",
    )
    
    saved_record = mock_repository.save.call_args[0][0]
    assert saved_record.dialogue_id is None
    assert saved_record.node_id is None


def test_annotate_usage_updates_record(usage_service, mock_repository):
    """Teste que annotate_usage met à jour un enregistrement existant par request_id."""
    existing_record = LLMUsageRecord(
        request_id="req_to_annotate",
        timestamp=datetime.now(UTC),
        model_name="gpt-5.6-terra",
        prompt_tokens=500,
        completion_tokens=100,
        total_tokens=600,
        estimated_cost=0.003,
        duration_ms=900,
        success=True,
        endpoint="generate-node",
    )
    mock_repository.get_by_request_id.return_value = existing_record
    
    usage_service.annotate_usage("req_to_annotate", "dialogue_123", "node_456")
    
    mock_repository.get_by_request_id.assert_called_once_with("req_to_annotate")
    updated = mock_repository.update.call_args[0][0]
    assert updated.dialogue_id == "dialogue_123"
    assert updated.node_id == "node_456"


def test_annotate_usage_not_found_logs_warning(usage_service, mock_repository):
    """Teste que annotate_usage gère silencieusement l'absence du record."""
    mock_repository.get_by_request_id.return_value = None
    
    # Ne doit pas lever d'exception
    usage_service.annotate_usage("req_unknown", "dialogue_123", "node_456")
    
    mock_repository.update.assert_not_called()


def test_get_dialogue_costs_aggregation(usage_service, mock_repository):
    """Teste l'agrégation des coûts par dialogue."""
    base_time = datetime.now(UTC)
    records = [
        LLMUsageRecord(
            request_id=f"req_{i}",
            timestamp=base_time,
            model_name="gpt-5.6-terra",
            prompt_tokens=400,
            completion_tokens=100,
            total_tokens=500,
            estimated_cost=0.01,  # USD
            duration_ms=500,
            success=True,
            endpoint="generate-node",
            dialogue_id="dialogue_test",
            node_id=f"node_{i}",
        )
        for i in range(3)
    ]
    mock_repository.get_by_dialogue_id.return_value = records
    
    result = usage_service.get_dialogue_costs("dialogue_test")
    
    assert result["dialogue_id"] == "dialogue_test"
    assert result["node_count"] == 3
    # 3 × 0.01 USD × 0.92 = 0.0276 EUR
    assert abs(result["total_cost_eur"] - 0.0276) < 1e-6
    assert abs(result["avg_cost_per_node_eur"] - 0.0092) < 1e-6
    assert len(result["breakdown"]) == 3


def test_get_dialogue_costs_empty(usage_service, mock_repository):
    """Teste l'agrégation quand aucun record n'existe."""
    mock_repository.get_by_dialogue_id.return_value = []
    
    result = usage_service.get_dialogue_costs("dialogue_empty")
    
    assert result["dialogue_id"] == "dialogue_empty"
    assert result["total_cost_eur"] == 0.0
    assert result["node_count"] == 0
    assert result["avg_cost_per_node_eur"] == 0.0
    assert result["breakdown"] == []


def test_get_dialogue_costs_reflects_deleted_field(usage_service, mock_repository):
    """Teste que get_dialogue_costs retourne le champ deleted depuis le record."""
    base_time = datetime.now(UTC)
    records = [
        LLMUsageRecord(
            request_id="req_del_0",
            timestamp=base_time,
            model_name="gpt-5.6-terra",
            prompt_tokens=400,
            completion_tokens=100,
            total_tokens=500,
            estimated_cost=0.01,
            duration_ms=500,
            success=True,
            endpoint="generate-node",
            dialogue_id="diag_del",
            node_id="node_alive",
            deleted=False,
        ),
        LLMUsageRecord(
            request_id="req_del_1",
            timestamp=base_time,
            model_name="gpt-5.6-terra",
            prompt_tokens=400,
            completion_tokens=100,
            total_tokens=500,
            estimated_cost=0.01,
            duration_ms=500,
            success=True,
            endpoint="generate-node",
            dialogue_id="diag_del",
            node_id="node_dead",
            deleted=True,
        ),
    ]
    mock_repository.get_by_dialogue_id.return_value = records

    result = usage_service.get_dialogue_costs("diag_del")

    assert result["breakdown"][0]["deleted"] is False
    assert result["breakdown"][1]["deleted"] is True


def test_mark_node_deleted_found(usage_service, mock_repository):
    """Teste que mark_node_deleted met à jour le record quand le nœud existe."""
    mock_repository.mark_node_deleted.return_value = True

    found = usage_service.mark_node_deleted("node_xyz")

    mock_repository.mark_node_deleted.assert_called_once_with("node_xyz")
    assert found is True


def test_mark_node_deleted_not_found(usage_service, mock_repository):
    """Teste que mark_node_deleted retourne False et ne lève pas d'exception."""
    mock_repository.mark_node_deleted.return_value = False

    found = usage_service.mark_node_deleted("node_unknown")

    assert found is False
    mock_repository.update.assert_not_called()


def test_get_all_dialogues_costs_sorted(usage_service, mock_repository):
    """Teste que get_all_dialogues_costs retourne les dialogues triés par coût décroissant."""
    base_time = datetime.now(UTC)
    grouped = {
        "diag_cheap": [
            LLMUsageRecord(
                request_id="req_c1",
                timestamp=base_time,
                model_name="gpt-5.6-terra",
                prompt_tokens=100,
                completion_tokens=20,
                total_tokens=120,
                estimated_cost=0.001,  # USD
                duration_ms=300,
                success=True,
                endpoint="generate-node",
                dialogue_id="diag_cheap",
                node_id="node_c1",
            )
        ],
        "diag_expensive": [
            LLMUsageRecord(
                request_id="req_e1",
                timestamp=base_time,
                model_name="gpt-5.6-terra",
                prompt_tokens=5000,
                completion_tokens=1000,
                total_tokens=6000,
                estimated_cost=0.1,  # USD
                duration_ms=2000,
                success=True,
                endpoint="generate-node",
                dialogue_id="diag_expensive",
                node_id="node_e1",
            )
        ],
    }
    mock_repository.get_all_by_dialogue_ids.return_value = grouped

    results = usage_service.get_all_dialogues_costs()

    # Doit être trié par coût décroissant
    assert len(results) == 2
    assert results[0]["dialogue_id"] == "diag_expensive"
    assert results[1]["dialogue_id"] == "diag_cheap"
    assert results[0]["total_cost_eur"] > results[1]["total_cost_eur"]
    # Vérifier la conversion USD→EUR
    assert abs(results[0]["total_cost_eur"] - 0.092) < 1e-6  # 0.1 * 0.92

