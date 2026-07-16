"""Tests pour les endpoints de suivi LLM."""
import pytest
from datetime import date, datetime, timedelta, UTC
from fastapi.testclient import TestClient
from models.llm_usage import LLMUsageRecord
from services.llm_usage_service import LLMUsageService
from services.repositories.llm_usage_repository import FileLLMUsageRepository
from services.llm_pricing_service import LLMPricingService
from api.main import app
from api.dependencies import get_llm_usage_service


@pytest.fixture
def client():
    """Crée un client de test FastAPI."""
    return TestClient(app)


@pytest.fixture
def sample_records():
    """Crée des enregistrements d'exemple."""
    base_time = datetime.now(UTC)
    return [
        LLMUsageRecord(
            request_id=f"req_{i}",
            timestamp=base_time - timedelta(hours=i),
            model_name="gpt-5.6-terra" if i % 2 == 0 else "gpt-3.5-turbo",
            prompt_tokens=1000 + i * 100,
            completion_tokens=500 + i * 50,
            total_tokens=1500 + i * 150,
            estimated_cost=0.005 + i * 0.001,
            duration_ms=2500 + i * 100,
            success=i < 8,  # 8 réussis, 2 échecs
            endpoint="generate/variants",
            k_variants=3
        )
        for i in range(10)
    ]


def test_get_usage_history(client, sample_records, tmp_path):
    """Teste l'endpoint GET /api/v1/llm-usage/history."""
    # Créer un repository temporaire et y ajouter des enregistrements
    repository = FileLLMUsageRepository(storage_dir=str(tmp_path))
    for record in sample_records:
        repository.save(record)
    
    # Override la dépendance FastAPI
    test_service = LLMUsageService(
        repository=repository,
        pricing_service=LLMPricingService()
    )
    app.dependency_overrides[get_llm_usage_service] = lambda: test_service
    
    try:
        # Faire la requête
        response = client.get("/api/v1/llm-usage/history?page=1&page_size=5")
        
        assert response.status_code == 200
        data = response.json()
        assert "records" in data
        assert "total" in data
        assert "page" in data
        assert len(data["records"]) == 5
        assert data["total"] == 10
    finally:
        # Nettoyer l'override
        app.dependency_overrides.pop(get_llm_usage_service, None)


def test_get_usage_statistics(client, sample_records, tmp_path):
    """Teste l'endpoint GET /api/v1/llm-usage/statistics."""
    # Créer un repository temporaire et y ajouter des enregistrements
    repository = FileLLMUsageRepository(storage_dir=str(tmp_path))
    for record in sample_records:
        repository.save(record)
    
    # Override la dépendance FastAPI
    test_service = LLMUsageService(
        repository=repository,
        pricing_service=LLMPricingService()
    )
    app.dependency_overrides[get_llm_usage_service] = lambda: test_service
    
    try:
        # Faire la requête
        response = client.get("/api/v1/llm-usage/statistics")
        
        assert response.status_code == 200
        data = response.json()
        assert "total_tokens" in data
        assert "total_cost" in data
        assert "calls_count" in data
        assert "success_rate" in data
        assert data["calls_count"] == 10
    finally:
        # Nettoyer l'override
        app.dependency_overrides.pop(get_llm_usage_service, None)


def test_get_usage_history_with_filters(client, sample_records, tmp_path):
    """Teste l'endpoint avec filtres (date, modèle)."""
    repository = FileLLMUsageRepository(storage_dir=str(tmp_path))
    for record in sample_records:
        repository.save(record)
    
    # Override la dépendance FastAPI
    test_service = LLMUsageService(
        repository=repository,
        pricing_service=LLMPricingService()
    )
    app.dependency_overrides[get_llm_usage_service] = lambda: test_service
    
    try:
        # Filtrer par modèle
        response = client.get("/api/v1/llm-usage/history?model=gpt-5.6-terra&page=1&page_size=10")
        
        assert response.status_code == 200
        data = response.json()
        # Vérifier que tous les enregistrements sont pour gpt-5.6-terra
        for record in data["records"]:
            assert record["model_name"] == "gpt-5.6-terra"
    finally:
        # Nettoyer l'override
        app.dependency_overrides.pop(get_llm_usage_service, None)


# ── Tests Story 1.12 ─────────────────────────────────────────────────────────

@pytest.fixture
def dialogue_records(tmp_path):
    """Crée un repository avec des enregistrements annotés par dialogue."""
    base_time = datetime.now(UTC)
    repository = FileLLMUsageRepository(storage_dir=str(tmp_path))
    records = [
        LLMUsageRecord(
            request_id=f"req_diag_{i}",
            timestamp=base_time,
            model_name="gpt-5.6-terra",
            prompt_tokens=500,
            completion_tokens=100,
            total_tokens=600,
            estimated_cost=0.01,  # USD
            duration_ms=800,
            success=True,
            endpoint="generate-node",
            k_variants=1,
            dialogue_id="dialogue_alpha",
            node_id=f"node_{i}",
        )
        for i in range(4)
    ]
    for r in records:
        repository.save(r)
    return repository


def test_get_dialogue_costs_endpoint(client, dialogue_records):
    """Teste l'endpoint GET /api/v1/llm-usage/dialogue/{id}/costs."""
    test_service = LLMUsageService(
        repository=dialogue_records,
        pricing_service=LLMPricingService(),
    )
    app.dependency_overrides[get_llm_usage_service] = lambda: test_service
    
    try:
        response = client.get("/api/v1/llm-usage/dialogue/dialogue_alpha/costs")
        
        assert response.status_code == 200
        data = response.json()
        assert data["dialogue_id"] == "dialogue_alpha"
        assert data["node_count"] == 4
        # 4 × 0.01 USD × 0.92 = 0.0368 EUR
        assert abs(data["total_cost_eur"] - 0.0368) < 1e-5
        assert abs(data["avg_cost_per_node_eur"] - 0.0092) < 1e-5
        assert len(data["breakdown"]) == 4
        # Vérifier la structure d'un NodeCostEntry
        entry = data["breakdown"][0]
        assert "node_id" in entry
        assert "timestamp" in entry
        assert "model_name" in entry
        assert "prompt_tokens" in entry
        assert "completion_tokens" in entry
        assert "cost_eur" in entry
        assert "success" in entry
        assert "deleted" in entry
    finally:
        app.dependency_overrides.pop(get_llm_usage_service, None)


def test_get_dialogue_costs_empty(client, tmp_path):
    """Teste l'endpoint quand aucun record n'existe pour ce dialogue."""
    repository = FileLLMUsageRepository(storage_dir=str(tmp_path))
    test_service = LLMUsageService(
        repository=repository,
        pricing_service=LLMPricingService(),
    )
    app.dependency_overrides[get_llm_usage_service] = lambda: test_service
    
    try:
        response = client.get("/api/v1/llm-usage/dialogue/unknown_dialogue/costs")
        
        assert response.status_code == 200
        data = response.json()
        assert data["dialogue_id"] == "unknown_dialogue"
        assert data["node_count"] == 0
        assert data["total_cost_eur"] == 0.0
        assert data["breakdown"] == []
    finally:
        app.dependency_overrides.pop(get_llm_usage_service, None)


# ── Tests Story 1.15 generation-logs ──────────────────────────────────────────

def test_get_generation_logs_200_returns_list(client, tmp_path):
    """Story 1.15: GET /dialogue/{id}/generation-logs retourne liste avec prompt, response, timestamp, node_id, cost, tokens, success."""
    from models.llm_usage import LLMUsageRecord
    base_time = datetime.now(UTC)
    repo = FileLLMUsageRepository(storage_dir=str(tmp_path))
    for i in range(2):
        r = LLMUsageRecord(
            request_id=f"req_gl_{i}",
            timestamp=base_time - timedelta(hours=i),
            model_name="gpt-5.6-terra",
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
            estimated_cost=0.001,
            duration_ms=200,
            success=True,
            endpoint="generate-node",
            k_variants=1,
            dialogue_id="dialogue_alpha",
            node_id=f"node_{i}",
            prompt="System: Write dialogue.",
            response='{"node": {}}',
        )
        repo.save(r)
    test_service = LLMUsageService(repository=repo, pricing_service=LLMPricingService())
    app.dependency_overrides[get_llm_usage_service] = lambda: test_service
    try:
        response = client.get("/api/v1/llm-usage/dialogue/dialogue_alpha/generation-logs")
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        logs = data["entries"]
        assert len(logs) == 2
        entry = logs[0]
        assert "timestamp" in entry
        assert "node_id" in entry
        assert "prompt" in entry
        assert "response" in entry
        assert "estimated_cost" in entry or "cost_eur" in entry
        assert "prompt_tokens" in entry
        assert "success" in entry
        assert entry["prompt"] == "System: Write dialogue."
        assert entry["response"] == '{"node": {}}'
    finally:
        app.dependency_overrides.pop(get_llm_usage_service, None)


def test_get_generation_logs_with_filters(client, dialogue_records, tmp_path):
    """Story 1.15: GET generation-logs avec start_date, end_date, model_name filtre les résultats."""
    from models.llm_usage import LLMUsageRecord
    base_time = datetime.now(UTC)
    repo = FileLLMUsageRepository(storage_dir=str(tmp_path))
    for i, model in enumerate(["gpt-5.6-terra", "mistral-small"]):
        r = LLMUsageRecord(
            request_id=f"req_f_{i}",
            timestamp=base_time - timedelta(days=i),
            model_name=model,
            prompt_tokens=100,
            completion_tokens=50,
            total_tokens=150,
            estimated_cost=0.001,
            duration_ms=200,
            success=True,
            endpoint="generate-node",
            k_variants=1,
            dialogue_id="diag_f",
            node_id=f"n_{i}",
        )
        repo.save(r)
    test_service = LLMUsageService(repository=repo, pricing_service=LLMPricingService())
    app.dependency_overrides[get_llm_usage_service] = lambda: test_service
    try:
        response = client.get(
            "/api/v1/llm-usage/dialogue/diag_f/generation-logs",
            params={"model_name": "gpt-5.6-terra"},
        )
        assert response.status_code == 200
        data = response.json()
        logs = data["entries"]
        assert len(logs) == 1
        assert logs[0]["model_name"] == "gpt-5.6-terra"
    finally:
        app.dependency_overrides.pop(get_llm_usage_service, None)


def test_get_generation_logs_empty_returns_200(client, tmp_path):
    """Story 1.15: GET generation-logs pour dialogue sans logs retourne 200 et liste vide."""
    repo = FileLLMUsageRepository(storage_dir=str(tmp_path))
    test_service = LLMUsageService(repository=repo, pricing_service=LLMPricingService())
    app.dependency_overrides[get_llm_usage_service] = lambda: test_service
    try:
        response = client.get("/api/v1/llm-usage/dialogue/empty_dialogue/generation-logs")
        assert response.status_code == 200
        data = response.json()
        assert data["entries"] == []
        assert data["total_count"] == 0
    finally:
        app.dependency_overrides.pop(get_llm_usage_service, None)


def test_llm_usage_record_has_dialogue_fields(sample_records):
    """Vérifie que LLMUsageRecord expose dialogue_id, node_id et deleted (rétrocompat)."""
    # Les records existants sans ces champs doivent avoir les valeurs par défaut
    for record in sample_records:
        assert record.dialogue_id is None
        assert record.node_id is None
        assert record.deleted is False

    # Un record annoté doit les retourner
    annotated = LLMUsageRecord(
        request_id="req_ann",
        timestamp=datetime.now(UTC),
        model_name="gpt-5.6-terra",
        prompt_tokens=400,
        completion_tokens=80,
        total_tokens=480,
        estimated_cost=0.005,
        duration_ms=600,
        success=True,
        endpoint="generate-node",
        dialogue_id="diag_123",
        node_id="node_abc",
        deleted=False,
    )
    assert annotated.dialogue_id == "diag_123"
    assert annotated.node_id == "node_abc"
    assert annotated.deleted is False


def test_mark_node_deleted_endpoint(client, dialogue_records):
    """Teste l'endpoint POST /api/v1/llm-usage/nodes/{node_id}/mark-deleted."""
    test_service = LLMUsageService(
        repository=dialogue_records,
        pricing_service=LLMPricingService(),
    )
    app.dependency_overrides[get_llm_usage_service] = lambda: test_service

    try:
        # Marquer un nœud existant
        response = client.post("/api/v1/llm-usage/nodes/node_0/mark-deleted")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["node_id"] == "node_0"
        assert data["found"] is True

        # Vérifier que le flag est bien persisté dans le breakdown
        costs_resp = client.get("/api/v1/llm-usage/dialogue/dialogue_alpha/costs")
        breakdown = costs_resp.json()["breakdown"]
        deleted_entries = [e for e in breakdown if e["node_id"] == "node_0"]
        assert len(deleted_entries) == 1
        assert deleted_entries[0]["deleted"] is True

        # Nœud inconnu → found=False, toujours 200
        response_unknown = client.post("/api/v1/llm-usage/nodes/node_ghost/mark-deleted")
        assert response_unknown.status_code == 200
        assert response_unknown.json()["found"] is False
    finally:
        app.dependency_overrides.pop(get_llm_usage_service, None)


def test_get_all_dialogues_costs_endpoint(client, dialogue_records):
    """Teste l'endpoint GET /api/v1/llm-usage/dialogues/costs."""
    test_service = LLMUsageService(
        repository=dialogue_records,
        pricing_service=LLMPricingService(),
    )
    app.dependency_overrides[get_llm_usage_service] = lambda: test_service

    try:
        response = client.get("/api/v1/llm-usage/dialogues/costs")
        assert response.status_code == 200
        data = response.json()
        assert "dialogues" in data
        assert "total_dialogues" in data
        assert data["total_dialogues"] == 1
        dialogue_entry = data["dialogues"][0]
        assert dialogue_entry["dialogue_id"] == "dialogue_alpha"
        assert dialogue_entry["node_count"] == 4
        assert "total_cost_eur" in dialogue_entry
        assert "avg_cost_per_node_eur" in dialogue_entry
    finally:
        app.dependency_overrides.pop(get_llm_usage_service, None)


def test_usage_history_exposes_dialogue_fields(client, tmp_path):
    """Vérifie que l'endpoint history renvoie dialogue_id et node_id (fix M2)."""
    from datetime import UTC
    repository = FileLLMUsageRepository(storage_dir=str(tmp_path))
    record = LLMUsageRecord(
        request_id="req_m2",
        timestamp=datetime.now(UTC),
        model_name="gpt-5.6-terra",
        prompt_tokens=100,
        completion_tokens=20,
        total_tokens=120,
        estimated_cost=0.001,
        duration_ms=300,
        success=True,
        endpoint="generate-node",
        dialogue_id="diag_m2",
        node_id="node_m2",
    )
    repository.save(record)
    test_service = LLMUsageService(repository=repository, pricing_service=LLMPricingService())
    app.dependency_overrides[get_llm_usage_service] = lambda: test_service

    try:
        response = client.get("/api/v1/llm-usage/history?page=1&page_size=10")
        assert response.status_code == 200
        records = response.json()["records"]
        assert len(records) == 1
        assert records[0]["dialogue_id"] == "diag_m2"
        assert records[0]["node_id"] == "node_m2"
    finally:
        app.dependency_overrides.pop(get_llm_usage_service, None)


def test_get_context_relevance_missing_200(client, tmp_path):
    """GET pertinence : 200 + record_present=false si aucun enregistrement (évite 404 bruyants)."""
    repository = FileLLMUsageRepository(storage_dir=str(tmp_path))
    test_service = LLMUsageService(
        repository=repository, pricing_service=LLMPricingService()
    )
    app.dependency_overrides[get_llm_usage_service] = lambda: test_service
    try:
        response = client.get(
            "/api/v1/llm-usage/dialogue/missing.json/nodes/NODE_X/context-relevance"
        )
        assert response.status_code == 200
        body = response.json()
        assert body["record_present"] is False
        assert body["node_id"] == "NODE_X"
    finally:
        app.dependency_overrides.pop(get_llm_usage_service, None)


def test_get_context_relevance_and_history(client, tmp_path):
    """GET pertinence nœud + historique dialogue (Story 3.6)."""
    import json

    repository = FileLLMUsageRepository(storage_dir=str(tmp_path))
    prompt = "### Personnages\nTokenHistOne lore.\n\n--- Input ---\n[]"
    response_json = json.dumps({"line": "TokenHistOne says hi", "choices": []})
    t0 = datetime.now(UTC)
    t1 = t0 + timedelta(seconds=2)
    r1 = LLMUsageRecord(
        request_id="hr1",
        timestamp=t0,
        model_name="m",
        prompt_tokens=1,
        completion_tokens=1,
        total_tokens=2,
        estimated_cost=0.0,
        duration_ms=1,
        success=True,
        endpoint="e",
        k_variants=1,
        dialogue_id="hist_dialogue.json",
        node_id="NODE_A",
        prompt=prompt,
        response=response_json,
    )
    r2 = LLMUsageRecord(
        request_id="hr2",
        timestamp=t1,
        model_name="m",
        prompt_tokens=1,
        completion_tokens=1,
        total_tokens=2,
        estimated_cost=0.0,
        duration_ms=1,
        success=True,
        endpoint="e",
        k_variants=1,
        dialogue_id="hist_dialogue.json",
        node_id="NODE_B",
        prompt=prompt,
        response=response_json,
    )
    repository.save(r1)
    repository.save(r2)
    usage = LLMUsageService(repository=repository, pricing_service=LLMPricingService())
    usage.compute_and_persist_context_relevance("hr1")
    usage.compute_and_persist_context_relevance("hr2")
    app.dependency_overrides[get_llm_usage_service] = lambda: usage
    try:
        detail = client.get(
            "/api/v1/llm-usage/dialogue/hist_dialogue.json/nodes/NODE_A/context-relevance"
        )
        assert detail.status_code == 200
        body = detail.json()
        assert body.get("record_present", True) is True
        assert body["dialogue_id"] == "hist_dialogue.json"
        assert body["node_id"] == "NODE_A"
        assert "score_percent" in body
        assert body["request_id"] == "hr1"
        hist = client.get(
            "/api/v1/llm-usage/dialogue/hist_dialogue.json/context-relevance-history"
        )
        assert hist.status_code == 200
        hbody = hist.json()
        assert hbody["total_count"] == 2
        assert len(hbody["entries"]) == 2
        assert hbody["entries"][0]["request_id"] == "hr1"
        assert hbody["entries"][1]["request_id"] == "hr2"
    finally:
        app.dependency_overrides.pop(get_llm_usage_service, None)


def test_get_context_section_usage_missing_200(client, tmp_path):
    """GET usage sections : 200 + record_present=false si aucun enregistrement."""
    repository = FileLLMUsageRepository(storage_dir=str(tmp_path))
    test_service = LLMUsageService(
        repository=repository, pricing_service=LLMPricingService()
    )
    app.dependency_overrides[get_llm_usage_service] = lambda: test_service
    try:
        response = client.get(
            "/api/v1/llm-usage/dialogue/missing.json/nodes/NODE_X/context-usage"
        )
        assert response.status_code == 200
        body = response.json()
        assert body["record_present"] is False
        assert body["weak_section_count"] == 0
    finally:
        app.dependency_overrides.pop(get_llm_usage_service, None)


def test_get_context_section_usage_200(client, tmp_path):
    """GET usage sections : schéma stable + aperçu généré (Story 3.7)."""
    import json

    repository = FileLLMUsageRepository(storage_dir=str(tmp_path))
    prompt = "### Personnages\nTokenUsageAPI lore.\n\n--- Input ---\n[]"
    response_json = json.dumps({"line": "TokenUsageAPI speaks", "choices": []})
    record = LLMUsageRecord(
        request_id="req_cu1",
        timestamp=datetime.now(UTC),
        model_name="m",
        prompt_tokens=1,
        completion_tokens=1,
        total_tokens=2,
        estimated_cost=0.0,
        duration_ms=1,
        success=True,
        endpoint="e",
        k_variants=1,
        dialogue_id="dlg_cu.json",
        node_id="NODE_CU",
        prompt=prompt,
        response=response_json,
    )
    repository.save(record)
    usage = LLMUsageService(repository=repository, pricing_service=LLMPricingService())
    usage.compute_and_persist_context_relevance("req_cu1")
    updated = repository.get_by_request_id("req_cu1")
    assert updated is not None
    assert updated.context_section_usage is not None

    app.dependency_overrides[get_llm_usage_service] = lambda: usage
    try:
        res = client.get(
            "/api/v1/llm-usage/dialogue/dlg_cu.json/nodes/NODE_CU/context-usage"
        )
        assert res.status_code == 200
        body = res.json()
        assert body["dialogue_id"] == "dlg_cu.json"
        assert body["node_id"] == "NODE_CU"
        assert body["request_id"] == "req_cu1"
        assert len(body["entity_groups"]) >= 1
        assert "generated_plain_preview" in body
        assert "TokenUsageAPI" in body["generated_plain_preview"]
        assert body["weak_section_count"] >= 0
    finally:
        app.dependency_overrides.pop(get_llm_usage_service, None)

