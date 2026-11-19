"""Tests pour le repository d'utilisation LLM."""
import pytest
from pathlib import Path
from datetime import date, datetime, timedelta, UTC
from models.llm_usage import LLMUsageRecord
from services.repositories.llm_usage_repository import FileLLMUsageRepository


@pytest.fixture
def repository(tmp_path):
    """Crée un repository temporaire."""
    return FileLLMUsageRepository(storage_dir=str(tmp_path))


@pytest.fixture
def sample_record():
    """Crée un enregistrement d'exemple."""
    return LLMUsageRecord(
        request_id="req_123",
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


def test_save_and_load(repository, sample_record):
    """Teste la sauvegarde et le chargement d'un enregistrement."""
    repository.save(sample_record)
    
    records = repository.get_all()
    assert len(records) == 1
    assert records[0].request_id == sample_record.request_id
    assert records[0].model_name == sample_record.model_name


def test_get_by_date_range(repository, sample_record):
    """Teste la récupération par plage de dates."""
    # Créer des enregistrements pour différentes dates
    today = date.today()
    yesterday = today - timedelta(days=1)
    
    record_today = sample_record.model_copy()
    record_today.timestamp = datetime.combine(today, datetime.min.time())
    
    record_yesterday = sample_record.model_copy()
    record_yesterday.request_id = "req_456"
    record_yesterday.timestamp = datetime.combine(yesterday, datetime.min.time())
    
    repository.save(record_today)
    repository.save(record_yesterday)
    
    # Récupérer seulement aujourd'hui
    records = repository.get_by_date_range(today, today)
    assert len(records) == 1
    assert records[0].request_id == "req_123"
    
    # Récupérer les deux jours
    records = repository.get_by_date_range(yesterday, today)
    assert len(records) == 2


def test_get_statistics(repository, sample_record):
    """Teste le calcul des statistiques."""
    # Créer plusieurs enregistrements
    for i in range(5):
        record = sample_record.model_copy()
        record.request_id = f"req_{i}"
        record.total_tokens = 1000 + i * 100
        record.estimated_cost = 0.001 * (i + 1)
        record.success = i < 4  # 4 réussis, 1 échec
        repository.save(record)
    
    stats = repository.get_statistics()
    assert stats["calls_count"] == 5
    assert stats["success_count"] == 4
    assert stats["error_count"] == 1
    assert stats["success_rate"] == 80.0
    assert stats["total_tokens"] > 0
    assert stats["total_cost"] > 0


def test_filter_by_model(repository, sample_record):
    """Teste le filtrage par modèle."""
    record_gpt4 = sample_record.model_copy()
    record_gpt4.model_name = "gpt-4o"
    record_gpt35 = sample_record.model_copy()
    record_gpt35.request_id = "req_456"
    record_gpt35.model_name = "gpt-3.5-turbo"
    
    repository.save(record_gpt4)
    repository.save(record_gpt35)
    
    records = repository.get_all(model_name="gpt-4o")
    assert len(records) == 1
    assert records[0].model_name == "gpt-4o"


def test_get_by_dialogue_and_node(repository, sample_record):
    """Teste get_by_dialogue_and_node (Story 1.14) : retourne le record pour dialogue_id + node_id."""
    r1 = sample_record.model_copy()
    r1.request_id = "req_1"
    r1.dialogue_id = "Dialogue_A"
    r1.node_id = "NODE_1"
    r2 = sample_record.model_copy()
    r2.request_id = "req_2"
    r2.dialogue_id = "Dialogue_A"
    r2.node_id = "NODE_2"
    r2.timestamp = sample_record.timestamp + timedelta(seconds=10)
    repository.save(r1)
    repository.save(r2)
    found = repository.get_by_dialogue_and_node("Dialogue_A", "NODE_2")
    assert found is not None
    assert found.node_id == "NODE_2"
    assert found.request_id == "req_2"
    assert repository.get_by_dialogue_and_node("Dialogue_A", "NODE_3") is None
    assert repository.get_by_dialogue_and_node("Other", "NODE_1") is None


def test_save_and_load_record_with_prompt_and_response(repository, sample_record):
    """Story 1.15: sauvegarde et rechargement d'un record avec prompt et response."""
    sample_record.prompt = "System: You are a writer."
    sample_record.response = '{"nodes": []}'
    repository.save(sample_record)
    records = repository.get_all()
    assert len(records) == 1
    assert records[0].prompt == "System: You are a writer."
    assert records[0].response == '{"nodes": []}'


def test_load_old_json_without_prompt_response(repository, tmp_path):
    """Story 1.15: chargement rétrocompatible d'un JSON sans champs prompt/response."""
    import json
    from services.repositories.llm_usage_repository import FileLLMUsageRepository
    repo = FileLLMUsageRepository(storage_dir=str(tmp_path))
    target_date = date.today()
    file_path = tmp_path / f"usage_{target_date.isoformat()}.json"
    # Ancien format sans prompt ni response
    data = {
        "date": target_date.isoformat(),
        "records": [{
            "request_id": "req_old",
            "timestamp": datetime.now(UTC).isoformat(),
            "model_name": "gpt-4o",
            "prompt_tokens": 100,
            "completion_tokens": 50,
            "total_tokens": 150,
            "estimated_cost": 0.001,
            "duration_ms": 500,
            "success": True,
            "endpoint": "generate/variants",
            "k_variants": 1,
        }]
    }
    with open(file_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, default=str)
    records = repo._load_records_for_date(target_date)
    assert len(records) == 1
    assert records[0].request_id == "req_old"
    assert getattr(records[0], "prompt", None) is None
    assert getattr(records[0], "response", None) is None



def _call_record(
    sample_record: LLMUsageRecord,
    *,
    call_id: str,
    prompt: str,
    tokens: int,
    cost: float,
    offset_seconds: int = 0,
) -> LLMUsageRecord:
    """Record d'un appel d'une requête multi-appels (même request_id que ``sample_record``)."""
    record = sample_record.model_copy()
    record.call_id = call_id
    record.prompt = prompt
    record.response = f"réponse de {call_id}"
    record.prompt_tokens = tokens
    record.total_tokens = tokens + record.completion_tokens
    record.estimated_cost = cost
    record.timestamp = sample_record.timestamp + timedelta(seconds=offset_seconds)
    return record


def test_update_targets_call_id_and_keeps_sibling_records(
    repository: FileLLMUsageRepository, sample_record: LLMUsageRecord
) -> None:
    """Deux appels sous le même request_id : annoter l'un laisse l'autre intact (pas de doublon)."""
    first = _call_record(sample_record, call_id="call-1", prompt="prompt 1", tokens=111, cost=0.011)
    second = _call_record(
        sample_record, call_id="call-2", prompt="prompt 2", tokens=222, cost=0.022, offset_seconds=1
    )
    repository.save(first)
    repository.save(second)

    annotated = repository.get_by_call_id("call-1")
    assert annotated is not None
    annotated.dialogue_id = "Dialogue_A"
    annotated.node_id = "NODE_1"
    repository.update(annotated)

    records = {r.call_id: r for r in repository.get_all()}
    assert len(repository.get_all()) == 2
    assert records["call-1"].node_id == "NODE_1"
    untouched = records["call-2"]
    assert untouched.node_id is None
    assert untouched.prompt == "prompt 2"
    assert untouched.response == "réponse de call-2"
    assert untouched.prompt_tokens == 222
    assert untouched.estimated_cost == 0.022


def test_get_by_call_id(repository: FileLLMUsageRepository, sample_record: LLMUsageRecord) -> None:
    """get_by_call_id retrouve l'appel précis ; inconnu ou vide ⇒ None."""
    repository.save(_call_record(sample_record, call_id="call-x", prompt="p", tokens=1, cost=0.0))
    found = repository.get_by_call_id("call-x")
    assert found is not None and found.prompt == "p"
    assert repository.get_by_call_id("call-unknown") is None
    assert repository.get_by_call_id("") is None


def test_update_legacy_record_by_request_id_and_timestamp(
    repository: FileLLMUsageRepository, sample_record: LLMUsageRecord
) -> None:
    """Record sans call_id : retrouvé par (request_id, timestamp) quand une seule entrée correspond."""
    other = sample_record.model_copy()
    other.timestamp = sample_record.timestamp + timedelta(seconds=5)
    other.prompt = "autre appel"
    repository.save(sample_record)
    repository.save(other)

    legacy = next(r for r in repository.get_all() if r.prompt != "autre appel")
    legacy.node_id = "NODE_LEGACY"
    repository.update(legacy)

    records = repository.get_all()
    assert len(records) == 2
    assert {r.node_id for r in records} == {"NODE_LEGACY", None}
    assert next(r for r in records if r.node_id is None).prompt == "autre appel"


def test_update_identical_legacy_copies_are_all_replaced(
    repository: FileLLMUsageRepository, sample_record: LLMUsageRecord
) -> None:
    """Copies identiques laissées par l'ancien update() : toutes remplacées, update() rend True."""
    repository.save(sample_record)
    repository.save(sample_record.model_copy())

    target = repository.get_all()[0]
    target.node_id = "NODE_COPIES"
    assert repository.update(target) is True

    records = repository.get_all()
    assert len(records) == 2
    assert all(r.node_id == "NODE_COPIES" for r in records)


def test_update_non_identical_legacy_ambiguity_is_refused(
    repository: FileLLMUsageRepository, sample_record: LLMUsageRecord
) -> None:
    """Deux records legacy de même (request_id, timestamp) mais différents : rien n'est écrit."""
    other = sample_record.model_copy()
    other.prompt = "autre prompt"
    repository.save(sample_record)
    repository.save(other)

    target = repository.get_all()[0]
    target.node_id = "NODE_AMBIGUOUS"
    assert repository.update(target) is False
    assert all(r.node_id is None for r in repository.get_all())


def test_mark_node_deleted_reports_real_write(
    repository: FileLLMUsageRepository, sample_record: LLMUsageRecord
) -> None:
    """mark_node_deleted rend True quand l'écriture a lieu, False quand la cible est ambiguë."""
    copies = sample_record.model_copy()
    copies.node_id = "NODE_COPIES"
    repository.save(copies)
    repository.save(copies.model_copy())
    assert repository.mark_node_deleted("NODE_COPIES") is True
    assert all(r.deleted for r in repository.get_all())

    ambiguous_a = sample_record.model_copy()
    ambiguous_a.request_id = "req_ambiguous"
    ambiguous_a.node_id = "NODE_AMBIGUOUS"
    ambiguous_b = ambiguous_a.model_copy()
    ambiguous_b.prompt = "différent"
    repository.save(ambiguous_a)
    repository.save(ambiguous_b)
    assert repository.mark_node_deleted("NODE_AMBIGUOUS") is False


def test_update_many_loads_and_saves_each_daily_file_once(
    repository: FileLLMUsageRepository,
    sample_record: LLMUsageRecord,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Annotation en lot : un seul chargement/écriture par fichier du jour, les deux records réécrits."""
    first = _call_record(sample_record, call_id="call-1", prompt="p1", tokens=1, cost=0.0)
    second = _call_record(sample_record, call_id="call-2", prompt="p2", tokens=2, cost=0.0)
    repository.save(first)
    repository.save(second)

    found = repository.get_by_call_ids(["call-1", "call-2", "call-unknown"])
    assert set(found) == {"call-1", "call-2"}
    for call_id, record in found.items():
        record.node_id = f"NODE_{call_id}"

    saves: list[object] = []
    original_save = repository._save_records_for_date
    monkeypatch.setattr(
        repository,
        "_save_records_for_date",
        lambda target_date, records: (saves.append(target_date), original_save(target_date, records)),
    )
    assert repository.update_many(found.values()) == 2
    assert len(saves) == 1
    assert {r.node_id for r in repository.get_all()} == {"NODE_call-1", "NODE_call-2"}
