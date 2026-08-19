"""Tests API A/B templates (Story 6.7 — matrice I/O)."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterator
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from api.dependencies import (
    get_dialogue_tree_expansion_service,
    get_llm_quality_judge_service,
    get_template_ab_test_job_manager,
    get_template_ab_testing_service,
    get_template_service,
)
from api.main import app
from api.routers.auth import get_current_user
from api.schemas.dialogue_quality import (
    DialogueQualityCriterionDetail,
    EvaluateDialogueQualityResponse,
)
from api.services.template_ab_test_job_manager import TemplateABTestJobManager
from services.dialogue_tree_expansion_service import TreeExpansionError, TreeExpansionResult
from services.preset_service import PresetService
from services.template_ab_testing_service import TemplateABTestingService
from services.template_service import TemplateService


def _sample_create_payload(**overrides: Any) -> Dict[str, Any]:
    """Payload POST custom avec lieu + brief."""
    payload: Dict[str, Any] = {
        "name": "Template A/B",
        "description": "Desc",
        "category": "Confrontation",
        "icon": "⚔️",
        "configuration": {
            "characters": ["char-alpha"],
            "locations": ["loc-alpha"],
            "region": "loc-alpha",
            "sceneType": "Generic",
            "instructions": "Brief A/B",
        },
    }
    payload.update(overrides)
    return payload


def _user(user_id: str, role: str = "writer") -> dict[str, object]:
    """Identité active pour override ``get_current_user``."""
    return {
        "id": user_id,
        "username": user_id,
        "role": role,
        "is_active": True,
    }


def _judge_response(score: int) -> EvaluateDialogueQualityResponse:
    """Rapport juge 4.7 minimal."""
    criteria = [
        DialogueQualityCriterionDetail(
            criterion_id="narrative_coherence",
            label="Cohérence narrative",
            score=score,
        ),
        DialogueQualityCriterionDetail(
            criterion_id="characterization",
            label="Caractérisation",
            score=score,
        ),
        DialogueQualityCriterionDetail(
            criterion_id="agency",
            label="Agentivité",
            score=score,
        ),
        DialogueQualityCriterionDetail(
            criterion_id="style",
            label="Style",
            score=score,
        ),
    ]
    return EvaluateDialogueQualityResponse(
        overall_score=score,
        score_variance_note="Variance ±1",
        criteria=criteria,
        model_id="dummy",
        provider="dummy",
    )


def _tree_result() -> TreeExpansionResult:
    """Arbre Unity minimal convertible en graphe."""
    return TreeExpansionResult(
        document={
            "schemaVersion": "1.2.0",
            "nodes": [
                {
                    "id": "START",
                    "speaker": "PNJ",
                    "line": "Bonjour.",
                    "choices": [],
                }
            ],
        },
        node_count=1,
        llm_calls=1,
        levels_expanded=1,
    )


@pytest.fixture
def mock_context_builder() -> Mock:
    """ContextBuilder mocké avec IDs génériques."""
    from services.element_repository import ElementRepository
    from services.gdd_loader import GDDData

    gdd_data = GDDData(
        characters=[{"Nom": "char-alpha", "id": "char-001"}],
        locations=[{"Nom": "loc-alpha", "id": "loc-001"}],
    )
    repo = ElementRepository(gdd_data)
    builder = Mock()
    builder._gdd_data = gdd_data
    builder._element_repository = repo
    builder.get_characters_names.return_value = ["char-alpha"]
    builder.get_locations_names.return_value = ["loc-alpha"]
    builder.load_gdd_files = Mock()
    return builder


@pytest.fixture
def prebuilt_catalog(tmp_path: Path) -> Path:
    """Catalogue pré-built avec lieu + brief."""
    path = tmp_path / "prebuilt_templates.json"
    path.write_text(
        """
{
  "templates": [
    {
      "id": "salutation",
      "name": "Salutation test",
      "description": "Desc",
      "category": "Salutation",
      "icon": "👋",
      "gddSystem": "Flags",
      "sceneTypeHint": "rencontre_initiale",
      "addedAt": "2026-08-16T00:00:00Z",
      "configuration": {
        "characters": ["char-alpha"],
        "locations": ["loc-alpha"],
        "region": "loc-alpha",
        "sceneType": "Generic",
        "instructions": "Brief pré-built"
      }
    }
  ]
}
""",
        encoding="utf-8",
    )
    return path


@pytest.fixture
def template_service(
    tmp_path: Path,
    mock_context_builder: Mock,
    prebuilt_catalog: Path,
) -> TemplateService:
    """TemplateService réel sur tmp_path."""
    preset_service = PresetService(
        config_service=Mock(),
        context_builder=mock_context_builder,
        presets_dir=tmp_path / "presets",
    )
    return TemplateService(
        preset_service=preset_service,
        templates_dir=tmp_path / "templates" / "custom",
        prebuilt_path=prebuilt_catalog,
    )


@pytest.fixture
def ab_client(
    template_service: TemplateService,
    tmp_path: Path,
) -> Iterator[TestClient]:
    """Client API A/B avec expansion et juge mockés."""
    ab_service = TemplateABTestingService(
        template_service=template_service,
        storage_dir=tmp_path / "ab-tests",
    )
    job_manager = TemplateABTestJobManager()
    expansion = Mock()
    expansion.expand = AsyncMock(return_value=_tree_result())
    judge = Mock()
    scores = [8, 5, 8, 5]
    judge.evaluate_graph = AsyncMock(
        side_effect=[_judge_response(score) for score in scores]
    )
    judge.resolve_default_model_id = Mock(return_value="dummy")

    app.dependency_overrides[get_template_service] = lambda: template_service
    app.dependency_overrides[get_template_ab_testing_service] = lambda: ab_service
    app.dependency_overrides[get_template_ab_test_job_manager] = lambda: job_manager
    app.dependency_overrides[get_dialogue_tree_expansion_service] = lambda: expansion
    app.dependency_overrides[get_llm_quality_judge_service] = lambda: judge
    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_template_service, None)
        app.dependency_overrides.pop(get_template_ab_testing_service, None)
        app.dependency_overrides.pop(get_template_ab_test_job_manager, None)
        app.dependency_overrides.pop(get_dialogue_tree_expansion_service, None)
        app.dependency_overrides.pop(get_llm_quality_judge_service, None)
        app.dependency_overrides.pop(get_current_user, None)


def _create_custom(client: TestClient, **overrides: Any) -> str:
    """Crée un custom et retourne son id."""
    response = client.post("/api/v1/templates", json=_sample_create_payload(**overrides))
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


def test_ab_test_list_empty_not_uuid_collision(ab_client: TestClient) -> None:
    """GET /ab-test liste vide, pas 422 UUID."""
    response = ab_client.get("/api/v1/templates/ab-test")
    assert response.status_code == 200
    assert response.json() == []


def test_ab_test_launch_completes_with_winner(ab_client: TestClient) -> None:
    """Two templates, N=1 → 202 puis completed + gagnant + totaux."""
    id_a = _create_custom(ab_client, name="Alpha")
    id_b = _create_custom(ab_client, name="Beta")
    created = ab_client.post(
        "/api/v1/templates/ab-test",
        json={
            "templateAId": id_a,
            "templateBId": id_b,
            "generationsPerTemplate": 1,
            "maxDepth": 1,
        },
    )
    assert created.status_code == 202, created.text
    test_id = created.json()["testId"]
    detail = ab_client.get(f"/api/v1/templates/ab-test/{test_id}")
    assert detail.status_code == 200
    body = detail.json()
    assert body["status"] == "completed"
    assert body["winnerTemplateId"] == id_a
    assert len(body["generations"]) == 2
    assert body["totals"]["templateA"]["meanOverall"] == 8
    assert body["totals"]["templateB"]["meanOverall"] == 5


def test_ab_test_guest_is_refused(ab_client: TestClient) -> None:
    """Guest POST /ab-test → 403.

    Un run lance N × 2 générations. Le mode invité est une démonstration en lecture :
    il ne doit pas pouvoir engager le budget LLM du projet.
    """
    app.dependency_overrides[get_current_user] = lambda: _user("guest-1", role="guest")
    try:
        id_a = _create_custom(ab_client, name="Guest A")
        id_b = _create_custom(ab_client, name="Guest B")
        created = ab_client.post(
            "/api/v1/templates/ab-test",
            json={
                "templateAId": id_a,
                "templateBId": id_b,
                "generationsPerTemplate": 1,
                "maxDepth": 1,
            },
        )
        assert created.status_code == 403, created.text
    finally:
        app.dependency_overrides[get_current_user] = lambda: _user("writer-a")


@pytest.mark.p0
def test_ab_test_without_owner_key_is_admin_only(ab_client: TestClient) -> None:
    """Given un run sans ownerKey, when un writer GET, then 404 ; l'admin voit.

    Régression : le repli ``not stored -> True`` de ``_is_visible`` rendait tout
    run antérieur au scoping 6.7 lisible par n'importe quel compte. Le routeur
    pose toujours un ownerKey, donc seul un run orphelin est concerné.
    """
    ab_service = app.dependency_overrides[get_template_ab_testing_service]()
    id_a = _create_custom(ab_client, name="Orphan A")
    id_b = _create_custom(ab_client, name="Orphan B")
    orphan = ab_service.create_queued_test(
        template_a_id=id_a,
        template_b_id=id_b,
        generations_per_template=1,
        max_depth=1,
    )
    assert orphan.get("ownerKey") is None

    assert ab_client.get(f"/api/v1/templates/ab-test/{orphan['testId']}").status_code == 404

    app.dependency_overrides[get_current_user] = lambda: _user("admin-1", role="admin")
    try:
        seen = ab_client.get(f"/api/v1/templates/ab-test/{orphan['testId']}")
        assert seen.status_code == 200
    finally:
        app.dependency_overrides[get_current_user] = lambda: _user("writer-a")


def test_ab_test_partial_generation_error(ab_client: TestClient) -> None:
    """Une gen expand KO → entrée error, l'autre scorée, gagnant si ≥1/côté."""
    expansion = app.dependency_overrides[get_dialogue_tree_expansion_service]()
    expansion.expand = AsyncMock(
        side_effect=[_tree_result(), TreeExpansionError("boom")]
    )
    id_a = _create_custom(ab_client, name="Partiel A")
    id_b = _create_custom(ab_client, name="Partiel B")
    created = ab_client.post(
        "/api/v1/templates/ab-test",
        json={
            "templateAId": id_a,
            "templateBId": id_b,
            "generationsPerTemplate": 1,
            "maxDepth": 1,
        },
    )
    assert created.status_code == 202
    body = ab_client.get(f"/api/v1/templates/ab-test/{created.json()['testId']}").json()
    assert body["status"] == "completed"
    errors = [row["error"] for row in body["generations"]]
    assert any(errors)
    assert any(row["overallScore"] is not None for row in body["generations"])


def test_ab_test_same_id_and_invalid_n(ab_client: TestClient) -> None:
    """Même ID → 400 (règle métier) ; N hors 1–5 → 422 (borne Pydantic)."""
    template_id = _create_custom(ab_client, name="Solo")
    same = ab_client.post(
        "/api/v1/templates/ab-test",
        json={
            "templateAId": template_id,
            "templateBId": template_id,
            "generationsPerTemplate": 1,
        },
    )
    assert same.status_code == 400
    bad_n = ab_client.post(
        "/api/v1/templates/ab-test",
        json={
            "templateAId": template_id,
            "templateBId": str(uuid4()),
            "generationsPerTemplate": 9,
        },
    )
    assert bad_n.status_code == 422


def test_ab_test_missing_location_or_brief(ab_client: TestClient) -> None:
    """Lieu ou brief manquant → 400 avant le job."""
    id_ok = _create_custom(ab_client, name="OK")
    id_no_loc = _create_custom(
        ab_client,
        name="Sans lieu",
        configuration={
            "characters": ["char-alpha"],
            "locations": [],
            "region": "",
            "sceneType": "Generic",
            "instructions": "Brief sans lieu",
        },
    )
    no_loc = ab_client.post(
        "/api/v1/templates/ab-test",
        json={"templateAId": id_ok, "templateBId": id_no_loc, "generationsPerTemplate": 1},
    )
    assert no_loc.status_code == 400
    id_no_brief = _create_custom(
        ab_client,
        name="Sans brief",
        configuration={
            "characters": ["char-alpha"],
            "locations": ["loc-alpha"],
            "region": "loc-alpha",
            "sceneType": "Generic",
            "instructions": "   ",
        },
    )
    no_brief = ab_client.post(
        "/api/v1/templates/ab-test",
        json={"templateAId": id_ok, "templateBId": id_no_brief, "generationsPerTemplate": 1},
    )
    assert no_brief.status_code == 400


def test_ab_test_history_and_feedback_and_rerun(ab_client: TestClient) -> None:
    """Historique, pouce (gagnant inchangé), relance parent_test_id."""
    id_a = _create_custom(ab_client, name="Hist A")
    id_b = _create_custom(ab_client, name="Hist B")
    created = ab_client.post(
        "/api/v1/templates/ab-test",
        json={
            "templateAId": id_a,
            "templateBId": id_b,
            "generationsPerTemplate": 1,
            "maxDepth": 1,
        },
    )
    test_id = created.json()["testId"]
    listed = ab_client.get("/api/v1/templates/ab-test")
    assert listed.status_code == 200
    assert any(item["testId"] == test_id for item in listed.json())

    detail = ab_client.get(f"/api/v1/templates/ab-test/{test_id}").json()
    winner = detail["winnerTemplateId"]
    gen_id = detail["generations"][0]["id"]
    patched = ab_client.patch(
        f"/api/v1/templates/ab-test/{test_id}/feedback",
        json={"generationId": gen_id, "thumb": "up"},
    )
    assert patched.status_code == 200
    assert patched.json()["winnerTemplateId"] == winner
    assert patched.json()["generations"][0]["thumb"] == "up"

    missing_gen = ab_client.patch(
        f"/api/v1/templates/ab-test/{test_id}/feedback",
        json={"generationId": str(uuid4()), "thumb": "down"},
    )
    assert missing_gen.status_code == 404

    rerun = ab_client.post(f"/api/v1/templates/ab-test/{test_id}/rerun")
    assert rerun.status_code == 202
    child = ab_client.get(f"/api/v1/templates/ab-test/{rerun.json()['testId']}").json()
    assert child["parentTestId"] == test_id
    assert child["status"] == "completed"

    missing_parent = ab_client.post(f"/api/v1/templates/ab-test/{uuid4()}/rerun")
    assert missing_parent.status_code == 404


def test_ab_test_prebuilt_id(ab_client: TestClient) -> None:
    """prebuilt:salutation vs UUID → résolu ; slug inconnu → 404."""
    custom_id = _create_custom(ab_client, name="Custom vs prebuilt")
    created = ab_client.post(
        "/api/v1/templates/ab-test",
        json={
            "templateAId": "prebuilt:salutation",
            "templateBId": custom_id,
            "generationsPerTemplate": 1,
            "maxDepth": 1,
        },
    )
    assert created.status_code == 202, created.text
    body = ab_client.get(f"/api/v1/templates/ab-test/{created.json()['testId']}").json()
    assert body["templateAId"] == "prebuilt:salutation"
    unknown = ab_client.post(
        "/api/v1/templates/ab-test",
        json={
            "templateAId": "prebuilt:inconnu",
            "templateBId": custom_id,
            "generationsPerTemplate": 1,
        },
    )
    assert unknown.status_code == 404


def test_ab_test_equality_has_no_winner(ab_client: TestClient) -> None:
    """Moyennes égales → winnerTemplateId null."""
    judge = app.dependency_overrides[get_llm_quality_judge_service]()
    judge.evaluate_graph = AsyncMock(side_effect=[_judge_response(7), _judge_response(7)])
    id_a = _create_custom(ab_client, name="Eq A")
    id_b = _create_custom(ab_client, name="Eq B")
    created = ab_client.post(
        "/api/v1/templates/ab-test",
        json={
            "templateAId": id_a,
            "templateBId": id_b,
            "generationsPerTemplate": 1,
            "maxDepth": 1,
        },
    )
    assert created.status_code == 202, created.text
    body = ab_client.get(f"/api/v1/templates/ab-test/{created.json()['testId']}").json()
    assert body["winnerTemplateId"] is None


@pytest.mark.parametrize("max_depth", [0, 9])
def test_ab_test_invalid_max_depth(ab_client: TestClient, max_depth: int) -> None:
    """maxDepth hors 1–4 → 422 (borne Pydantic, avant toute dépense LLM)."""
    id_a = _create_custom(ab_client, name="Depth A")
    id_b = _create_custom(ab_client, name="Depth B")
    response = ab_client.post(
        "/api/v1/templates/ab-test",
        json={
            "templateAId": id_a,
            "templateBId": id_b,
            "generationsPerTemplate": 1,
            "maxDepth": max_depth,
        },
    )
    assert response.status_code == 422


def test_ab_test_judge_failure_is_partial(ab_client: TestClient) -> None:
    """Juge KO sur une gen → error, l'autre scorée, completed."""
    judge = app.dependency_overrides[get_llm_quality_judge_service]()
    judge.evaluate_graph = AsyncMock(
        side_effect=[RuntimeError("juge"), _judge_response(8)]
    )
    id_a = _create_custom(ab_client, name="Juge A")
    id_b = _create_custom(ab_client, name="Juge B")
    created = ab_client.post(
        "/api/v1/templates/ab-test",
        json={
            "templateAId": id_a,
            "templateBId": id_b,
            "generationsPerTemplate": 1,
            "maxDepth": 1,
        },
    )
    assert created.status_code == 202, created.text
    body = ab_client.get(f"/api/v1/templates/ab-test/{created.json()['testId']}").json()
    assert body["status"] == "completed"
    assert any(row["error"] for row in body["generations"])
    assert any(row["overallScore"] is not None for row in body["generations"])


def test_ab_test_thumb_does_not_elect_winner(ab_client: TestClient) -> None:
    """Pouce sur un match nul ne désigne pas de gagnant."""
    judge = app.dependency_overrides[get_llm_quality_judge_service]()
    judge.evaluate_graph = AsyncMock(side_effect=[_judge_response(6), _judge_response(6)])
    id_a = _create_custom(ab_client, name="Thumb A")
    id_b = _create_custom(ab_client, name="Thumb B")
    created = ab_client.post(
        "/api/v1/templates/ab-test",
        json={
            "templateAId": id_a,
            "templateBId": id_b,
            "generationsPerTemplate": 1,
            "maxDepth": 1,
        },
    )
    assert created.status_code == 202, created.text
    test_id = created.json()["testId"]
    detail = ab_client.get(f"/api/v1/templates/ab-test/{test_id}").json()
    assert detail["winnerTemplateId"] is None
    gen_id = detail["generations"][0]["id"]
    patched = ab_client.patch(
        f"/api/v1/templates/ab-test/{test_id}/feedback",
        json={"generationId": gen_id, "thumb": "up"},
    )
    assert patched.json()["winnerTemplateId"] is None
    assert patched.json()["generations"][0]["thumb"] == "up"


def test_ab_test_path_traversal_rejected(ab_client: TestClient) -> None:
    """test_id hors UUID → 404."""
    response = ab_client.get("/api/v1/templates/ab-test/not-a-uuid")
    assert response.status_code == 404
    missing = ab_client.get(f"/api/v1/templates/ab-test/{uuid4()}")
    assert missing.status_code == 404


def test_ab_test_feedback_while_running_rejected(ab_client: TestClient) -> None:
    """Pouce pendant queued → 400."""
    ab_service = app.dependency_overrides[get_template_ab_testing_service]()
    id_a = _create_custom(ab_client, name="Run A")
    id_b = _create_custom(ab_client, name="Run B")
    queued = ab_service.create_queued_test(
        template_a_id=id_a,
        template_b_id=id_b,
        generations_per_template=1,
        max_depth=1,
        owner_key="writer-a",
    )
    response = ab_client.patch(
        f"/api/v1/templates/ab-test/{queued['testId']}/feedback",
        json={"generationId": str(uuid4()), "thumb": "up"},
    )
    assert response.status_code == 400


def test_ab_test_expand_uses_luna(ab_client: TestClient) -> None:
    """expand est appelé avec gpt-5.6-luna."""
    expansion = app.dependency_overrides[get_dialogue_tree_expansion_service]()
    id_a = _create_custom(ab_client, name="Luna A")
    id_b = _create_custom(ab_client, name="Luna B")
    created = ab_client.post(
        "/api/v1/templates/ab-test",
        json={
            "templateAId": id_a,
            "templateBId": id_b,
            "generationsPerTemplate": 1,
            "maxDepth": 1,
        },
    )
    assert created.status_code == 202, created.text
    assert expansion.expand.await_count >= 1
    kwargs = expansion.expand.await_args.kwargs
    assert kwargs["llm_model_identifier"] == "gpt-5.6-luna"
    assert kwargs["allow_partial"] is False
