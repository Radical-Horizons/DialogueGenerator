"""Provenance nœud → appel LLM sur les chemins de génération du graphe.

Un faux client LLM répond des nœuds structurés et trace son usage dans le vrai
``LLMUsageService`` (dépôt fichier temporaire), comme un client réel : chaque nœud renvoyé
doit être annoté sur **son** record, y compris quand plusieurs appels partagent un
``request_id`` et se terminent dans le désordre.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import (
    get_config_service,
    get_context_builder,
    get_dialogue_tree_expansion_service,
    get_graph_node_orchestrator,
    get_graph_prompt_context_factory,
    get_llm_pricing_service,
    get_llm_usage_service,
    get_token_estimation_service,
    get_unity_dialogue_orchestrator,
)
from api.main import app
from api.routers.auth import get_current_user
from api.schemas.dialogue import ContextSelection, GenerateUnityDialogueResponse
from core.llm.llm_client import DummyLLMClient
from models.dialogue_structure.unity_dialogue_node import UnityDialogueGenerationResponse
from services.configuration_service import ConfigurationService
from services.dialogue_tree_expansion_service import DialogueTreeExpansionService
from services.graph_node_orchestrator import GraphNodeOrchestrator
from services.llm_call_provenance import collect_node_provenance
from services.llm_pricing_service import LLMPricingService
from services.llm_usage_service import LLMUsageService
from services.repositories.llm_usage_repository import FileLLMUsageRepository
from services.repositories.sqlite.connection import DatabaseConnection
from services.unity_dialogue_generation_service import UnityDialogueGenerationService

GRAPH = "/api/v1/unity-dialogues/graph"


class TrackingNodeClient:
    """Faux client : un nœud par appel, usage tracké au format OpenAI Responses.

    Les premiers appels attendent plus longtemps que les suivants : les appels concurrents
    se terminent dans l'ordre inverse de leur lancement.
    """

    def __init__(self, usage: LLMUsageService, request_id: str, *, delays: Optional[List[float]] = None) -> None:
        self.usage = usage
        self.request_id = request_id
        self.delays = list(delays or [])
        self.started = 0
        self.last_call_cost = 0.0

    async def generate_variants(
        self,
        prompt: str,
        k: int = 1,
        response_model: Any = None,
        previous_dialogue_context: Optional[List[Dict[str, Any]]] = None,
        user_system_prompt_override: Optional[str] = None,
    ) -> List[Any]:
        """Rend un nœud unique (réplique numérotée) et trace l'appel."""
        self.started += 1
        number = self.started
        delay = self.delays[number - 1] if number <= len(self.delays) else 0.0
        await asyncio.sleep(delay)
        content = UnityDialogueGenerationResponse.model_validate(
            {"title": f"Titre {number}", "node": {"displayName": f"Nœud {number}", "line": f"Réplique {number}"}}
        )
        tracked_prompt = (
            f"{user_system_prompt_override or 'Système'}\n\n--- Input ---\n"
            + json.dumps([{"role": "user", "content": prompt}], ensure_ascii=False)
        )
        self.usage.track_usage(
            request_id=self.request_id,
            model_name="gpt-6.2-sol",
            prompt_tokens=1000 + number,
            completion_tokens=50,
            total_tokens=1050 + number,
            duration_ms=1,
            success=True,
            endpoint="graph/generate-node",
            prompt=tracked_prompt,
            response=json.dumps(
                {
                    "output": [
                        {
                            "type": "function_call",
                            "name": "generate_interaction",
                            "arguments": content.model_dump_json(),
                        }
                    ]
                }
            ),
        )
        return [content]

    def get_max_tokens(self) -> int:
        """Plafond factice."""
        return 1000


def _line_of_record(entry: Dict[str, Any]) -> str:
    """Réplique produite par l'appel tracké (arguments de l'appel de fonction)."""
    arguments = json.loads(entry["response"])["output"][0]["arguments"]
    return json.loads(arguments)["node"]["line"]


def _assert_each_node_on_its_record(nodes: List[Dict[str, Any]], entries: List[Dict[str, Any]]) -> None:
    """Un record par nœud, chacun portant la réplique du nœud et un prompt propre."""
    by_node = {entry["node_id"]: entry for entry in entries}
    assert len(entries) == len(nodes)
    assert set(by_node) == {node["id"] for node in nodes}
    for node in nodes:
        assert _line_of_record(by_node[node["id"]]) == node["line"]
    assert len({entry["prompt"] for entry in entries}) == len(entries)


@pytest.fixture
def usage(tmp_path: Path) -> LLMUsageService:
    """Suivi d'usage réel sur dépôt fichier temporaire."""
    return LLMUsageService(
        repository=FileLLMUsageRepository(storage_dir=str(tmp_path / "usage")),
        pricing_service=LLMPricingService(),
    )


def _user(user_id: str, role: str = "writer") -> Dict[str, object]:
    """Identité active pour ``get_current_user``."""
    return {"id": user_id, "username": user_id, "role": role, "is_active": True}


def _start_orchestrator(usage: LLMUsageService, request_id: str) -> MagicMock:
    """Faux orchestrateur « Générer » : trace l'appel du START et rend un START à 2 choix."""

    async def generate_start(_request: Any) -> GenerateUnityDialogueResponse:
        usage.track_usage(
            request_id=request_id,
            model_name="gpt-6.2-sol",
            prompt_tokens=10,
            completion_tokens=5,
            total_tokens=15,
            duration_ms=1,
            success=True,
            endpoint="generate/unity-dialogue",
            prompt="prompt START",
            response=json.dumps(
                {"output": [{"type": "function_call", "arguments": json.dumps({"node": {"line": START_LINE}})}]}
            ),
        )
        return GenerateUnityDialogueResponse(
            json_content=json.dumps(
                [
                    {
                        "id": "START",
                        "line": START_LINE,
                        "choices": [{"text": "A", "targetNode": "END"}, {"text": "B", "targetNode": "END"}],
                    }
                ]
            ),
            title="Test",
            raw_prompt="prompt",
            prompt_hash="hash",
            estimated_tokens=10,
        )

    orchestrator = MagicMock()
    orchestrator.generate = AsyncMock(side_effect=generate_start)
    orchestrator.dialogue_service.context_builder.get_characters_names.return_value = ["PNJ Test"]
    return orchestrator


START_LINE = "Réplique d'ouverture"


@pytest.fixture
def graph_client(
    usage: LLMUsageService,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    isolated_app_database: DatabaseConnection,
) -> Iterator[Dict[str, Any]]:
    """API graphe : vrai orchestrateur, faux client traçant, contexte GDD factice.

    writer-a et writer-b existent ; sans surcharge, l'utilisateur courant est l'admin
    factice de pytest (droit d'édition partout).
    """
    dialogue_dir = tmp_path / "Dialogues"
    layout_dir = tmp_path / "Layouts"
    dialogue_dir.mkdir()
    layout_dir.mkdir()
    config = MagicMock(spec=ConfigurationService)
    config.get_llm_config.return_value = {}
    config.get_available_llm_models.return_value = []
    config.get_llm_fallback_chain.return_value = []
    config.get_unity_dialogues_path.return_value = dialogue_dir
    config.get_unity_layouts_path.return_value = layout_dir
    for user_id in ("writer-a", "writer-b"):
        isolated_app_database.execute(
            "INSERT INTO users(id, username, role, is_active, created_at, updated_at) "
            "VALUES (?, ?, 'writer', 1, datetime('now'), datetime('now'))",
            (user_id, user_id),
        )
    context_builder = MagicMock()
    context_builder.get_characters_names.return_value = []
    state: Dict[str, Any] = {"delays": [], "clients": [], "dummy": False}

    def create_client(model_id: Any, config_service: Any, usage_service: Any, request_id: Any, endpoint: Any = None) -> Any:
        if state["dummy"]:
            return DummyLLMClient(delay_seconds=0)
        client = TrackingNodeClient(usage_service, request_id, delays=state["delays"])
        state["clients"].append(client)
        return client

    monkeypatch.setattr("api.routers.graph_generation.create_llm_client_for_router", create_client)
    monkeypatch.setattr("api.routers.graph_node_history.create_llm_client_for_router", create_client)
    monkeypatch.setattr("api.routers.graph_expansion.create_llm_client_for_router", create_client)
    app.dependency_overrides[get_config_service] = lambda: config
    app.dependency_overrides[get_context_builder] = lambda: context_builder
    app.dependency_overrides[get_llm_usage_service] = lambda: usage
    app.dependency_overrides[get_graph_node_orchestrator] = lambda: GraphNodeOrchestrator(
        generation_service=UnityDialogueGenerationService()
    )
    app.dependency_overrides[get_dialogue_tree_expansion_service] = lambda: DialogueTreeExpansionService(
        graph_orchestrator=GraphNodeOrchestrator(generation_service=UnityDialogueGenerationService())
    )
    app.dependency_overrides[get_unity_dialogue_orchestrator] = lambda: _start_orchestrator(
        usage, "req-expand"
    )
    app.dependency_overrides[get_graph_prompt_context_factory] = lambda: MagicMock()
    app.dependency_overrides[get_token_estimation_service] = lambda: MagicMock()
    app.dependency_overrides[get_llm_pricing_service] = lambda: MagicMock()
    try:
        yield {
            "client": TestClient(app),
            "state": state,
            "config": config,
            "context_builder": context_builder,
            "dialogue_dir": dialogue_dir,
        }
    finally:
        app.dependency_overrides.clear()


def _generation_logs(client: TestClient, dialogue_id: str) -> List[Dict[str, Any]]:
    response = client.get(f"/api/v1/llm-usage/dialogue/{dialogue_id}/generation-logs")
    assert response.status_code == 200
    return response.json()["entries"]


def _parent(choices: List[Dict[str, Any]]) -> Dict[str, Any]:
    return {"id": "P", "speaker": "PNJ", "line": "Que voulez-vous ?", "choices": choices}


def test_generate_all_choices_annotates_each_node_on_its_call(
    graph_client: Dict[str, Any], usage: LLMUsageService
) -> None:
    """« Tous les choix » sur 2 choix : 2 entrées, node_id distincts = nœuds renvoyés, prompt propre."""
    graph_client["state"]["delays"] = [0.05, 0.0]
    client: TestClient = graph_client["client"]
    response = client.post(
        f"{GRAPH}/generate-node",
        json={
            "parent_node_id": "P",
            "parent_node_content": _parent([{"text": "Je cherche du travail"}, {"text": "Rien, merci"}]),
            "user_instructions": "Suite",
            "context_selections": {},
            "max_choices": 0,
            "generate_all_choices": True,
            "dialogue_id": "D",
        },
    )
    assert response.status_code == 200, response.text
    nodes = response.json()["nodes"]
    assert len(nodes) == 2

    entries = _generation_logs(client, "D")
    _assert_each_node_on_its_record(nodes, entries)
    assert {entry["request_id"] for entry in entries} == {graph_client["state"]["clients"][0].request_id}
    annotated = usage.repository.get_by_dialogue_id("D")
    assert len(annotated) == 2
    assert all(record.context_relevance is not None for record in annotated)


def test_choice_with_test_annotates_four_outcomes(graph_client: Dict[str, Any]) -> None:
    """Choix avec test : 4 appels concurrents, chaque issue sur son record."""
    graph_client["state"]["delays"] = [0.04, 0.03, 0.02, 0.0]
    client: TestClient = graph_client["client"]
    response = client.post(
        f"{GRAPH}/generate-node",
        json={
            "parent_node_id": "P",
            "parent_node_content": _parent([{"text": "Je force la porte", "test": "Force+Athletisme:8"}]),
            "user_instructions": "Suite",
            "context_selections": {},
            "target_choice_index": 0,
            "dialogue_id": "D",
        },
    )
    assert response.status_code == 200, response.text
    nodes = response.json()["nodes"]
    assert len(nodes) == 4
    _assert_each_node_on_its_record(nodes, _generation_logs(client, "D"))


def test_single_node_generation_is_annotated(graph_client: Dict[str, Any]) -> None:
    """Chemin orchestrateur simple : 1 nœud, 1 entrée, template conservé."""
    client: TestClient = graph_client["client"]
    response = client.post(
        f"{GRAPH}/generate-node",
        json={
            "parent_node_id": "P",
            "parent_node_content": _parent([{"text": "Bonjour"}]),
            "user_instructions": "Suite",
            "context_selections": {},
            "target_choice_index": 0,
            "max_choices": 0,
            "dialogue_id": "D",
            "template_id": "confrontation",
            "template_name": "Confrontation",
        },
    )
    assert response.status_code == 200, response.text
    node = response.json()["node"]
    entries = _generation_logs(client, "D")
    _assert_each_node_on_its_record([node], entries)
    assert entries[0]["template_id"] == "confrontation"


def test_untracked_client_generates_without_annotation(graph_client: Dict[str, Any]) -> None:
    """Client sans suivi d'usage (Dummy) : génération OK, aucune annotation, aucune erreur."""
    graph_client["state"]["dummy"] = True
    client: TestClient = graph_client["client"]
    response = client.post(
        f"{GRAPH}/generate-node",
        json={
            "parent_node_id": "P",
            "parent_node_content": _parent([{"text": "A"}, {"text": "B"}]),
            "user_instructions": "Suite",
            "context_selections": {},
            "max_choices": 0,
            "generate_all_choices": True,
            "dialogue_id": "D",
        },
    )
    assert response.status_code == 200, response.text
    assert _generation_logs(client, "D") == []


def test_regenerate_annotates_with_path_node_id(
    graph_client: Dict[str, Any], usage: LLMUsageService
) -> None:
    """Régénération : le record porte l'id du chemin, pas l'id généré."""
    client: TestClient = graph_client["client"]
    response = client.post(
        f"{GRAPH}/nodes/NODE_KEPT/regenerate",
        json={
            "dialogue_id": "current",
            "new_instructions": "Plus sec",
            "parent_node_id": "P",
            "parent_node_content": _parent([{"text": "Bonjour"}]),
            "via_choice_index": 0,
        },
    )
    assert response.status_code == 200, response.text
    node = response.json()["node"]
    assert node["id"] == "NODE_KEPT"
    entries = _generation_logs(client, "current")
    assert [entry["node_id"] for entry in entries] == ["NODE_KEPT"]
    assert _line_of_record(entries[0]) == node["line"]
    assert usage.repository.get_by_dialogue_id("current")[0].context_relevance is not None


def test_sibling_record_survives_annotation_via_api(graph_client: Dict[str, Any], usage: LLMUsageService) -> None:
    """Deux records sous le même request_id annotés tour à tour : chacun garde tokens, coût, prompt, réponse."""
    client: TestClient = graph_client["client"]
    call_ids = []
    for number in (1, 2):
        call_id = usage.track_usage(
            request_id="req-shared",
            model_name="gpt-6.2-sol",
            prompt_tokens=100 * number,
            completion_tokens=10 * number,
            total_tokens=110 * number,
            duration_ms=1,
            success=True,
            endpoint="graph/generate-node",
            prompt=f"prompt {number}",
            response=f"réponse {number}",
        )
        call_ids.append(call_id)
    usage.annotate_call(call_ids[0], "D", "NODE_1")
    usage.annotate_call(call_ids[1], "D", "NODE_2")

    entries = {entry["node_id"]: entry for entry in _generation_logs(client, "D")}
    assert len(entries) == 2
    for number in (1, 2):
        entry = entries[f"NODE_{number}"]
        assert entry["prompt"] == f"prompt {number}"
        assert entry["response"] == f"réponse {number}"
        assert entry["prompt_tokens"] == 100 * number
        assert entry["estimated_cost"] > 0
    assert entries["NODE_1"]["estimated_cost"] < entries["NODE_2"]["estimated_cost"]


@pytest.mark.asyncio
async def test_batch_job_annotates_every_node_on_its_call(
    usage: LLMUsageService, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Job batch (≥ 10 parents) : provenance posée dans la tâche du job, chaque nœud sur son appel."""
    from api.routers.graph_generation import start_batch_generate_from_nodes_job
    from api.schemas.batch_node_generation import BatchGenerateFromNodesJobRequest
    from api.services.batch_node_generation_job_manager import BatchNodeGenerationJobManager
    from services.batch_node_generation_service import BatchNodeGenerationService

    def create_client(model_id: Any, config_service: Any, usage_service: Any, request_id: Any, endpoint: Any = None) -> Any:
        return TrackingNodeClient(usage_service, request_id)

    monkeypatch.setattr("api.routers.graph_generation.create_llm_client_for_router", create_client)
    context_builder = MagicMock()
    context_builder.get_characters_names.return_value = []
    pricing = MagicMock()
    pricing.calculate_cost.return_value = 0.0
    cost = MagicMock()
    cost.check_budget.return_value = {"allowed": True, "percentage": 0.0, "warning": None}
    job_manager = BatchNodeGenerationJobManager()
    user = _user("admin-1", role="admin")
    request = BatchGenerateFromNodesJobRequest.model_validate(
        {
            "document_id": "D",
            "max_choices": 0,
            "parents": [
                {
                    "parent_node_id": f"P{index}",
                    "parent_node_content": {"speaker": "PNJ", "line": f"Ligne {index}", "choices": [{"text": f"Choix {index}"}]},
                    "context_selections": {},
                    "user_instructions": "",
                }
                for index in range(10)
            ],
        }
    )

    created = await start_batch_generate_from_nodes_job(
        _current_user=user,
        request_data=request,
        config_service=MagicMock(spec=ConfigurationService),
        batch_service=BatchNodeGenerationService(
            GraphNodeOrchestrator(generation_service=UnityDialogueGenerationService())
        ),
        job_manager=job_manager,
        usage_service=usage,
        context_builder=context_builder,
        pricing_service=pricing,
        cost_service=cost,
        current_user=user,
        persistence_service=app.state.container.get_document_persistence_service(),
        request_id="req-batch",
    )
    await asyncio.wait_for(job_manager._tasks[created.job_id], timeout=10)

    job = job_manager.get_job(created.job_id)
    assert job is not None and job["status"] == "completed", job
    nodes = [node for item in job["report"]["items"] for node in item["nodes"]]
    assert len(nodes) == 10
    entries = usage.get_generation_logs("D")["entries"]
    _assert_each_node_on_its_record(nodes, entries)


@pytest.mark.asyncio
async def test_expand_tree_links_start_and_children_to_their_calls(usage: LLMUsageService) -> None:
    """expand-tree : le START et chaque enfant sont reliés à leur propre appel."""
    start_line = "Réplique d'ouverture"

    async def generate_start(_request: Any) -> GenerateUnityDialogueResponse:
        usage.track_usage(
            request_id="req-expand",
            model_name="gpt-6.2-sol",
            prompt_tokens=10,
            completion_tokens=5,
            total_tokens=15,
            duration_ms=1,
            success=True,
            endpoint="generate/unity-dialogue",
            prompt="prompt START",
            response=json.dumps({"output": [{"type": "function_call", "arguments": json.dumps({"node": {"line": start_line}})}]}),
        )
        return GenerateUnityDialogueResponse(
            json_content=json.dumps(
                [
                    {
                        "id": "START",
                        "speaker": "PNJ",
                        "line": start_line,
                        "choices": [{"text": "A", "targetNode": "END"}, {"text": "B", "targetNode": "END"}],
                    }
                ]
            ),
            title="Test",
            raw_prompt="prompt",
            prompt_hash="hash",
            estimated_tokens=10,
        )

    unity_orchestrator = MagicMock()
    unity_orchestrator.generate = AsyncMock(side_effect=generate_start)
    unity_orchestrator.dialogue_service.context_builder.get_characters_names.return_value = ["PNJ Test"]
    service = DialogueTreeExpansionService(
        graph_orchestrator=GraphNodeOrchestrator(generation_service=UnityDialogueGenerationService())
    )

    with collect_node_provenance() as provenance:
        result = await service.expand(
            unity_orchestrator=unity_orchestrator,
            llm_client=TrackingNodeClient(usage, "req-expand", delays=[0.03, 0.0]),
            user_instructions="Scène de test",
            context_selections=ContextSelection(characters_full=["PNJ Test"]),
            max_depth=1,
            max_choices=2,
            llm_model_identifier="gpt-6.2-sol",
        )

    nodes = {node["id"]: node for node in result.document["nodes"]}
    assert set(provenance) == set(nodes)
    assert usage.get_record_by_call_id(provenance["START"]).prompt == "prompt START"
    for node_id, node in nodes.items():
        if node_id == "START":
            continue
        record = usage.get_record_by_call_id(provenance[node_id])
        arguments = json.loads(record.response)["output"][0]["arguments"]
        assert json.loads(arguments)["node"]["line"] == node["line"]


def _generate_all_choices_body(dialogue_id: str) -> Dict[str, Any]:
    return {
        "parent_node_id": "P",
        "parent_node_content": _parent([{"text": "A"}, {"text": "B"}]),
        "user_instructions": "Suite",
        "context_selections": {},
        "max_choices": 0,
        "generate_all_choices": True,
        "dialogue_id": dialogue_id,
    }


def test_annotation_requires_edit_right_on_target_dialogue(
    graph_client: Dict[str, Any], usage: LLMUsageService
) -> None:
    """writer-b génère avec le dialogue_id de writer-a : génération servie, rien n'est annoté sur D."""
    client: TestClient = graph_client["client"]
    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")
    assert client.put(
        "/api/v1/documents/D",
        json={"document": {"schemaVersion": "1.2.0", "nodes": []}, "revision": 1},
    ).status_code == 200

    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    intruder = client.post(f"{GRAPH}/generate-node", json=_generate_all_choices_body("D"))
    assert intruder.status_code == 200, intruder.text
    assert _generation_logs(client, "D") == []
    assert all(record.dialogue_id is None for record in usage.repository.get_all())

    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")
    owner = client.post(f"{GRAPH}/generate-node", json=_generate_all_choices_body("D.json"))
    assert owner.status_code == 200, owner.text
    entries = _generation_logs(client, "D.json")
    assert len(entries) == 2


@pytest.mark.asyncio
async def test_batch_job_annotates_parents_delivered_before_a_crash(
    usage: LLMUsageService, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Job interrompu après le premier parent : les nœuds déjà livrés restent annotés."""
    from api.routers.graph_generation import start_batch_generate_from_nodes_job
    from api.schemas.batch_node_generation import BatchGenerateFromNodesJobRequest
    from api.services.batch_node_generation_job_manager import BatchNodeGenerationJobManager
    from services.batch_node_generation_service import BatchNodeGenerationService

    class CrashingBatchService(BatchNodeGenerationService):
        """Traite le premier parent puis tombe, comme un worker coupé en plein lot."""

        async def generate_batch(self, parents: Any, **kwargs: Any) -> Any:
            await super().generate_batch(parents[:1], **kwargs)
            raise RuntimeError("redémarrage simulé")

    def create_client(model_id: Any, config_service: Any, usage_service: Any, request_id: Any, endpoint: Any = None) -> Any:
        return TrackingNodeClient(usage_service, request_id)

    monkeypatch.setattr("api.routers.graph_generation.create_llm_client_for_router", create_client)
    context_builder = MagicMock()
    context_builder.get_characters_names.return_value = []
    cost = MagicMock()
    cost.check_budget.return_value = {"allowed": True, "percentage": 0.0, "warning": None}
    pricing = MagicMock()
    pricing.calculate_cost.return_value = 0.0
    job_manager = BatchNodeGenerationJobManager()
    user = _user("admin-1", role="admin")
    request = BatchGenerateFromNodesJobRequest.model_validate(
        {
            "document_id": "D",
            "max_choices": 0,
            "parents": [
                {
                    "parent_node_id": f"P{index}",
                    "parent_node_content": {"speaker": "PNJ", "line": f"Ligne {index}", "choices": [{"text": f"Choix {index}"}]},
                    "context_selections": {},
                    "user_instructions": "",
                }
                for index in range(10)
            ],
        }
    )

    created = await start_batch_generate_from_nodes_job(
        _current_user=user,
        request_data=request,
        config_service=MagicMock(spec=ConfigurationService),
        batch_service=CrashingBatchService(
            GraphNodeOrchestrator(generation_service=UnityDialogueGenerationService())
        ),
        job_manager=job_manager,
        usage_service=usage,
        context_builder=context_builder,
        pricing_service=pricing,
        cost_service=cost,
        current_user=user,
        persistence_service=app.state.container.get_document_persistence_service(),
        request_id="req-batch-crash",
    )
    await asyncio.wait_for(job_manager._tasks[created.job_id], timeout=10)

    job = job_manager.get_job(created.job_id)
    assert job is not None and job["status"] == "error", job
    delivered = job["items"]["P0"]["nodes"]
    assert len(delivered) == 1
    _assert_each_node_on_its_record(delivered, usage.get_generation_logs("D")["entries"])


@pytest.mark.parametrize("persist", [False, True])
def test_expand_tree_route_annotates_every_node(
    graph_client: Dict[str, Any], persist: bool
) -> None:
    """expand-tree via l'API : START et enfants annotés sur leur appel, persisté ou non."""
    client: TestClient = graph_client["client"]
    graph_client["state"]["delays"] = [0.03, 0.0]
    response = client.post(
        f"{GRAPH}/expand-tree",
        json={
            "user_instructions": "Une rencontre courte.",
            "context_selections": {
                "characters_full": ["PNJ Test"],
                "locations_full": ["Lieu Test"],
            },
            "max_depth": 1,
            "max_choices": 2,
            "title": "Arbre",
            "document_id": "arbre_test",
            "persist": persist,
        },
    )
    assert response.status_code == 200, response.text
    nodes = response.json()["document"]["nodes"]
    assert len(nodes) == 3

    entries = _generation_logs(client, "arbre_test")
    assert {entry["node_id"] for entry in entries} == {node["id"] for node in nodes}
    by_node = {entry["node_id"]: entry for entry in entries}
    assert by_node["START"]["prompt"] == "prompt START"
    for node in nodes:
        if node["id"] != "START":
            assert _line_of_record(by_node[node["id"]]) == node["line"]
    assert (graph_client["dialogue_dir"] / "arbre_test.json").exists() is persist
