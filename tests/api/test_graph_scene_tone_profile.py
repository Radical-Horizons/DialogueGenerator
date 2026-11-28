"""Tons et profil d'auteur de la fiche de scène (story 20.4 lot B).

Les cinq voies du graphe (suite, test, lot et job, régénération, estimation) doivent
porter ``narrative_tags`` et ``author_profile`` jusqu'au prompt : on lit le prompt
réellement passé au client LLM (ou compté par l'estimation), avec le vrai
``PromptEngine``. Aucun appel LLM réel.
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, Iterator, List
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from api.dependencies import (
    get_batch_node_generation_job_manager,
    get_batch_node_generation_service,
    get_config_service,
    get_context_builder,
    get_cost_governance_service,
    get_graph_node_orchestrator,
    get_graph_prompt_context_factory,
    get_llm_pricing_service,
    get_llm_usage_service,
    get_token_estimation_service,
)
from api.main import app
from api.routers.auth import get_current_user
from api.routers.graph_cost import _estimate_cost_cache
from api.services.batch_node_generation_job_manager import BatchNodeGenerationJobManager
from core.context.context_builder import ContextBuilder
from core.prompt.prompt_engine import PromptEngine
from models.dialogue_structure.unity_dialogue_node import (
    UnityDialogueGenerationResponse,
    UnityDialogueNodeContent,
)
from services.batch_node_generation_service import BatchNodeGenerationService
from services.graph_node_orchestrator import GraphNodeOrchestrator
from services.graph_prompt_context import GraphPromptContextFactory
from services.prompt_builder import PromptBuilder
from services.skill_catalog_service import SkillCatalogService
from services.trait_catalog_service import TraitCatalogService
from services.unity_dialogue_generation_service import UnityDialogueGenerationService

NPC = "Témoin Gris"
PLAYER = "Voyageuse Test"
BASE = "/api/v1/unity-dialogues/graph"
PROFILE = "Répliques mesurées, jamais plus de trois phrases."
TONES = ["tension", "murmuré"]
TEST_VALUE = "Sociabilité+Rhétorique:8"

SELECTIONS: Dict[str, Any] = {
    "characters_full": [NPC],
    "characters_excerpt": [PLAYER],
    "scene_protagonists": {"personnage_a": PLAYER, "personnage_b": NPC},
}
PARENT: Dict[str, Any] = {"id": "P", "speaker": NPC, "line": "Que veux-tu savoir ?"}
PARENT_WITH_CHOICES: Dict[str, Any] = {
    **PARENT,
    "choices": [{"text": "Convaincre.", "test": TEST_VALUE}, {"text": "Partir."}],
}
SCENE = {"narrative_tags": TONES, "author_profile": PROFILE}


@pytest.fixture
def context_builder(tmp_path: Path) -> ContextBuilder:
    """GDD factice à deux fiches."""
    categories = tmp_path / "categories"
    categories.mkdir()
    import_dir = tmp_path / "import"
    import_dir.mkdir()
    characters = [{"Nom": NPC, "Introduction": "Archiviste."}, {"Nom": PLAYER}]
    (categories / "personnages.json").write_text(
        json.dumps({"personnages": characters}, ensure_ascii=False), encoding="utf-8"
    )
    (import_dir / "Vision.json").write_text("{}", encoding="utf-8")
    builder = ContextBuilder(gdd_categories_path=categories, gdd_import_path=import_dir)
    builder.load_gdd_files()
    return builder


@pytest.fixture
def factory(context_builder: ContextBuilder) -> GraphPromptContextFactory:
    """Vraie fabrique de prompts du graphe."""
    engine = PromptEngine(
        context_builder=context_builder,
        prompt_builder=PromptBuilder(context_builder=context_builder),
    )
    return GraphPromptContextFactory(
        context_builder, engine, SkillCatalogService(), TraitCatalogService()
    )


@pytest.fixture
def llm_client() -> MagicMock:
    """Client LLM factice qui enregistre les prompts."""
    client = MagicMock()
    client.generate_variants = AsyncMock(
        return_value=[
            UnityDialogueGenerationResponse(
                title="Suite",
                node=UnityDialogueNodeContent(speaker=NPC, line="« Soit. »"),
            )
        ]
    )
    return client


@pytest.fixture
def orchestrator(factory: GraphPromptContextFactory) -> GraphNodeOrchestrator:
    """Vrai orchestrateur du graphe."""
    return GraphNodeOrchestrator(
        generation_service=UnityDialogueGenerationService(),
        prompt_context_factory=factory,
    )


@pytest.fixture
def client(
    orchestrator: GraphNodeOrchestrator,
    factory: GraphPromptContextFactory,
    context_builder: ContextBuilder,
    llm_client: MagicMock,
) -> Iterator[TestClient]:
    """API avec les vraies briques de prompt et un LLM factice."""
    config = MagicMock()
    config.get_available_llm_models.return_value = []
    app.dependency_overrides[get_config_service] = lambda: config
    app.dependency_overrides[get_llm_usage_service] = lambda: MagicMock()
    app.dependency_overrides[get_context_builder] = lambda: context_builder
    app.dependency_overrides[get_graph_node_orchestrator] = lambda: orchestrator
    app.dependency_overrides[get_graph_prompt_context_factory] = lambda: factory
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "writer-1",
        "username": "writer-1",
        "role": "writer",
        "is_active": True,
    }
    targets = (
        "api.routers.graph_generation.create_llm_client_for_router",
        "api.routers.graph_node_history.create_llm_client_for_router",
    )
    _estimate_cost_cache.clear()
    try:
        with patch(targets[0], return_value=llm_client), patch(
            targets[1], return_value=llm_client
        ), patch("api.routers.graph_node_history._validate_dialogue_exists"):
            yield TestClient(app)
    finally:
        app.dependency_overrides.clear()
        _estimate_cost_cache.clear()


def _sent(llm_client: MagicMock) -> List[str]:
    return [call.kwargs["prompt"] for call in llm_client.generate_variants.call_args_list]


def _assert_scene_in(prompt: str) -> None:
    assert "<narrative_tone>" in prompt
    assert "#tension, #murmuré" in prompt
    assert "<author_directives>" in prompt
    assert PROFILE in prompt


def _assert_scene_absent(prompt: str) -> None:
    assert "<narrative_tone>" not in prompt
    assert "<author_directives>" not in prompt


GENERATE_BODIES: Dict[str, Dict[str, Any]] = {
    "suite": {"parent_node_id": "P", "parent_node_content": PARENT},
    "test": {
        "parent_node_id": "test-node-P-choice-0",
        "parent_node_content": {"type": "testNode", "test": TEST_VALUE, "line": ""},
        "dialogue_nodes": [PARENT_WITH_CHOICES],
    },
    "lot-de-choix": {
        "parent_node_id": "P",
        "parent_node_content": PARENT_WITH_CHOICES,
        "generate_all_choices": True,
    },
}


@pytest.mark.parametrize("mode", list(GENERATE_BODIES))
@pytest.mark.parametrize("scene", [SCENE, {}], ids=["avec", "sans"])
def test_generate_node_prompt_carries_scene_tone_and_profile(
    mode: str, scene: Dict[str, Any], client: TestClient, llm_client: MagicMock
) -> None:
    response = client.post(
        f"{BASE}/generate-node",
        json={
            "user_instructions": "Continue.",
            "context_selections": SELECTIONS,
            "player_character_id": PLAYER,
            "npc_speaker_id": NPC,
            **GENERATE_BODIES[mode],
            **scene,
        },
    )

    assert response.status_code == 200, response.text
    prompts = _sent(llm_client)
    assert prompts
    for prompt in prompts:
        (_assert_scene_in if scene else _assert_scene_absent)(prompt)


@pytest.mark.parametrize("scene", [SCENE, {}], ids=["avec", "sans"])
def test_regenerate_prompt_carries_scene_tone_and_profile(
    scene: Dict[str, Any], client: TestClient, llm_client: MagicMock
) -> None:
    response = client.post(
        f"{BASE}/nodes/node-1/regenerate",
        json={
            "dialogue_id": "current",
            "new_instructions": "Plus court",
            "parent_node_id": "P",
            "parent_node_content": PARENT,
            "context_selections": SELECTIONS,
            "player_character_id": PLAYER,
            **scene,
        },
    )

    assert response.status_code == 200, response.text
    (_assert_scene_in if scene else _assert_scene_absent)(_sent(llm_client)[0])


@pytest.mark.parametrize("scene", [SCENE, {}], ids=["avec", "sans"])
def test_estimate_counts_scene_tone_and_profile(
    scene: Dict[str, Any], client: TestClient
) -> None:
    counted: List[str] = []
    tokens = MagicMock()

    def estimate(prompt: str, _model: str) -> tuple[int, int]:
        counted.append(prompt)
        return (100, 50)

    tokens.estimate_tokens.side_effect = estimate
    pricing = MagicMock()
    pricing.calculate_cost.return_value = 0.01
    pricing.get_model_pricing.return_value = None
    app.dependency_overrides[get_token_estimation_service] = lambda: tokens
    app.dependency_overrides[get_llm_pricing_service] = lambda: pricing

    response = client.post(
        f"{BASE}/estimate-cost",
        json={
            "parent_node_id": "P",
            "parent_node_content": PARENT,
            "user_instructions": "Continue.",
            "context_selections": SELECTIONS,
            "player_character_id": PLAYER,
            "npc_speaker_id": NPC,
            "llm_model_identifier": "gpt-4o",
            **scene,
        },
    )

    assert response.status_code == 200, response.text
    (_assert_scene_in if scene else _assert_scene_absent)(counted[0])


def test_batch_job_passes_scene_tone_and_profile_to_every_parent(
    client: TestClient,
    orchestrator: GraphNodeOrchestrator,
    llm_client: MagicMock,
) -> None:
    """Le job (N >= 10) : la route transmet au service, le service au prompt."""
    batch_service = BatchNodeGenerationService(orchestrator=orchestrator)
    seen: Dict[str, Any] = {}
    real_generate = batch_service.generate_batch

    async def spy(parents: Any, **kwargs: Any) -> Any:
        seen.update(kwargs)
        return await real_generate(parents, **kwargs)

    batch_service.generate_batch = spy  # type: ignore[method-assign]
    jobs = BatchNodeGenerationJobManager()
    pricing = MagicMock()
    pricing.calculate_cost.return_value = 0.01
    cost = MagicMock()
    cost.check_budget.return_value = {"allowed": True, "percentage": 0.0, "warning": None}
    app.dependency_overrides[get_batch_node_generation_service] = lambda: batch_service
    app.dependency_overrides[get_batch_node_generation_job_manager] = lambda: jobs
    app.dependency_overrides[get_llm_pricing_service] = lambda: pricing
    app.dependency_overrides[get_cost_governance_service] = lambda: cost

    parents = [
        {
            "parent_node_id": f"n{i}",
            "parent_node_content": PARENT_WITH_CHOICES,
            "context_selections": SELECTIONS,
            "player_character_id": PLAYER,
            "npc_speaker_id": NPC,
        }
        for i in range(10)
    ]
    with client:
        response = client.post(
            f"{BASE}/batch-generate-from-nodes/jobs",
            json={"parents": parents, **SCENE},
        )
        assert response.status_code == 202, response.text
        job_url = f"{BASE}/batch-generate-from-nodes/jobs/{response.json()['job_id']}"
        for _ in range(200):
            job = client.get(job_url).json()
            if job["status"] not in ("queued", "running"):
                break
            time.sleep(0.05)

    assert job["status"] == "completed", job
    assert [item["status"] for item in job["report"]["items"]] == ["ok"] * len(parents)

    assert seen["narrative_tags"] == TONES
    assert seen["author_profile"] == PROFILE
    prompts = _sent(llm_client)
    assert len(prompts) >= len(parents)
    for prompt in prompts:
        _assert_scene_in(prompt)
