"""Tests API Story 6.9 — suggestions de templates."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, Iterator
from unittest.mock import Mock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_template_marketplace_service, get_template_service
from api.main import app
from api.routers.auth import get_current_user
from services.preset_service import PresetService
from services.repositories.sqlite.connection import DatabaseConnection
from services.repositories.sqlite.shared_templates_repository import SharedTemplatesRepository
from services.template_marketplace_service import TemplateMarketplaceService
from services.template_service import TemplateService


def _sample_create_payload(**overrides: Any) -> Dict[str, Any]:
    """Payload POST générique (IDs fixtures, pas de noms GDD réels)."""
    payload: Dict[str, Any] = {
        "name": "Custom tension",
        "description": "Desc custom",
        "category": "Confrontation",
        "icon": "⚔️",
        "configuration": {
            "characters": ["char-alpha"],
            "locations": ["loc-alpha"],
            "region": "loc-alpha",
            "sceneType": "Generic",
            "instructions": "Brief custom confrontation",
            "llmModel": "gpt-5.6-terra",
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


def _suggest_body(**overrides: Any) -> Dict[str, Any]:
    """Corps POST /suggestions."""
    body: Dict[str, Any] = {
        "instructions": "",
        "sceneType": "",
        "characters": [],
        "locations": [],
        "rencontreInitialeByCharacter": {},
    }
    body.update(overrides)
    return body


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
def template_service(tmp_path: Path, mock_context_builder: Mock) -> TemplateService:
    """TemplateService réel sur tmp_path."""
    preset_service = PresetService(
        config_service=Mock(),
        context_builder=mock_context_builder,
        presets_dir=tmp_path / "presets",
    )
    return TemplateService(
        preset_service=preset_service,
        templates_dir=tmp_path / "templates" / "custom",
    )


@pytest.fixture
def suggest_client(
    template_service: TemplateService,
    isolated_app_database: DatabaseConnection,
) -> Iterator[TestClient]:
    """Client API suggestions avec writers seedés."""
    for user_id, role in (
        ("writer-a", "writer"),
        ("writer-b", "writer"),
        ("admin-a", "admin"),
    ):
        isolated_app_database.execute(
            """
            INSERT INTO users(
                id, username, role, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, 1, datetime('now'), datetime('now'))
            """,
            (user_id, user_id, role),
        )
    marketplace = TemplateMarketplaceService(
        repository=SharedTemplatesRepository(isolated_app_database),
        template_service=template_service,
    )
    app.dependency_overrides[get_template_service] = lambda: template_service
    app.dependency_overrides[get_template_marketplace_service] = lambda: marketplace
    app.dependency_overrides[get_current_user] = lambda: _user("writer-a")
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_template_service, None)
        app.dependency_overrides.pop(get_template_marketplace_service, None)
        app.dependency_overrides.pop(get_current_user, None)


def test_brief_ranks_confrontation_prebuilt(suggest_client: TestClient) -> None:
    """Brief confrontation : pré-built Confrontation en tête avec raison mots-clés."""
    response = suggest_client.post(
        "/api/v1/templates/suggestions",
        json=_suggest_body(instructions="confrontation au port"),
    )
    assert response.status_code == 200
    items = response.json()
    assert items
    assert items[0]["id"] == "confrontation"
    assert items[0]["source"] == "prebuilt"
    assert items[0]["score"] > 0
    assert "Correspond aux mots-clés du brief" in items[0]["reasons"]


def test_gdd_overlap_boosts_custom_snapshot(suggest_client: TestClient) -> None:
    """Perso/lieu du POST = snapshot custom → boost gdd."""
    created = suggest_client.post(
        "/api/v1/templates",
        json=_sample_create_payload(name="Custom overlap"),
    )
    assert created.status_code == 201
    template_id = created.json()["id"]
    response = suggest_client.post(
        "/api/v1/templates/suggestions",
        json=_suggest_body(characters=["char-alpha"], locations=["loc-alpha"]),
    )
    assert response.status_code == 200
    match = next(item for item in response.json() if item["id"] == template_id)
    assert "Même personnages ou lieux que votre contexte" in match["reasons"]
    assert match["score"] > 0


def test_rencontre_initiale_boosts_salutation(suggest_client: TestClient) -> None:
    """Section non vide → Salutation / rencontre_initiale."""
    response = suggest_client.post(
        "/api/v1/templates/suggestions",
        json=_suggest_body(
            rencontreInitialeByCharacter={"npc-alpha": "Bonjour voyageur."}
        ),
    )
    assert response.status_code == 200
    items = response.json()
    greeting = next(item for item in items if item["id"] == "salutation")
    assert "Première rencontre (fiche ou flag catalogue)" in greeting["reasons"]
    assert greeting["score"] >= 20


def test_empty_context_returns_empty_list(suggest_client: TestClient) -> None:
    """Brief vide, 0 perso/lieu, 0 section → liste vide."""
    response = suggest_client.post(
        "/api/v1/templates/suggestions",
        json=_suggest_body(),
    )
    assert response.status_code == 200
    assert response.json() == []


def test_generic_scene_type_alone_returns_empty(suggest_client: TestClient) -> None:
    """Placeholder Generic + brief vide : vide, même après usage perso."""
    used = suggest_client.post(
        "/api/v1/templates/suggestions/used",
        json={"source": "prebuilt", "id": "confrontation"},
    )
    assert used.status_code == 200
    response = suggest_client.post(
        "/api/v1/templates/suggestions",
        json=_suggest_body(sceneType="Generic"),
    )
    assert response.status_code == 200
    assert response.json() == []


def test_acl_hides_foreign_custom(suggest_client: TestClient) -> None:
    """Custom non lisible absent des suggestions."""
    created = suggest_client.post(
        "/api/v1/templates",
        json=_sample_create_payload(name="Secret A"),
    )
    assert created.status_code == 201
    secret_id = created.json()["id"]
    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    response = suggest_client.post(
        "/api/v1/templates/suggestions",
        json=_suggest_body(instructions="confrontation"),
    )
    assert response.status_code == 200
    ids = {item["id"] for item in response.json()}
    assert secret_id not in ids


def test_dedup_keeps_live_custom_over_listing(
    suggest_client: TestClient,
    isolated_app_database: DatabaseConnection,
) -> None:
    """Listing + live même source → une carte live."""
    created = suggest_client.post(
        "/api/v1/templates",
        json=_sample_create_payload(name="Live publié"),
    )
    assert created.status_code == 201
    template_id = created.json()["id"]
    published = suggest_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    )
    assert published.status_code == 201
    listing_id = published.json()["id"]
    isolated_app_database.execute(
        "UPDATE shared_templates SET usage_count = 50 WHERE id = ?",
        (listing_id,),
    )
    boosted = suggest_client.post(
        "/api/v1/templates/suggestions",
        json=_suggest_body(instructions="confrontation"),
    )
    assert boosted.status_code == 200
    live = next(item for item in boosted.json() if item["id"] == template_id)
    assert live["source"] == "custom"
    assert "Populaire sur le marketplace" in live["reasons"]
    ids = [(item["source"], item["id"]) for item in boosted.json()]
    assert ("custom", template_id) in ids
    assert ("marketplace", listing_id) not in ids


def test_marketplace_listing_visible_to_other_writer(
    suggest_client: TestClient,
    isolated_app_database: DatabaseConnection,
) -> None:
    """Listing d'un custom non lisible apparaît pour l'autre writer."""
    created = suggest_client.post(
        "/api/v1/templates",
        json=_sample_create_payload(name="Publié ailleurs"),
    )
    assert created.status_code == 201
    template_id = created.json()["id"]
    published = suggest_client.post(
        "/api/v1/templates/marketplace",
        json={"templateId": template_id},
    )
    assert published.status_code == 201
    listing_id = published.json()["id"]
    isolated_app_database.execute(
        "UPDATE shared_templates SET usage_count = 50 WHERE id = ?",
        (listing_id,),
    )
    app.dependency_overrides[get_current_user] = lambda: _user("writer-b")
    response = suggest_client.post(
        "/api/v1/templates/suggestions",
        json=_suggest_body(instructions="confrontation"),
    )
    assert response.status_code == 200
    match = next(item for item in response.json() if item["id"] == listing_id)
    assert match["source"] == "marketplace"
    assert "Populaire sur le marketplace" in match["reasons"]


def test_personal_usage_boosts_after_used(suggest_client: TestClient) -> None:
    """POST used incrémente ; un second suggest remonte via usage perso."""
    used = suggest_client.post(
        "/api/v1/templates/suggestions/used",
        json={"source": "prebuilt", "id": "confrontation"},
    )
    assert used.status_code == 200
    assert used.json()["useCount"] == 1
    for _ in range(4):
        again = suggest_client.post(
            "/api/v1/templates/suggestions/used",
            json={"source": "prebuilt", "id": "confrontation"},
        )
        assert again.status_code == 200
    response = suggest_client.post(
        "/api/v1/templates/suggestions",
        json=_suggest_body(instructions="confrontation"),
    )
    assert response.status_code == 200
    match = next(item for item in response.json() if item["id"] == "confrontation")
    assert "Souvent chargé" in match["reasons"]


def test_guest_suggestions_and_used_are_200(suggest_client: TestClient) -> None:
    """Guest : POST suggestions et used → 200, pas 403."""
    app.dependency_overrides[get_current_user] = lambda: _user("guest", "guest")
    listed = suggest_client.post(
        "/api/v1/templates/suggestions",
        json=_suggest_body(instructions="confrontation"),
    )
    assert listed.status_code == 200
    recorded = suggest_client.post(
        "/api/v1/templates/suggestions/used",
        json={"source": "prebuilt", "id": "confrontation"},
    )
    assert recorded.status_code == 200
    assert recorded.json()["useCount"] >= 1


def test_contextual_usage_boosts_similar_scenario(suggest_client: TestClient) -> None:
    """Used avec sceneType+persos → raison scénario similaire au suggest identique."""
    for _ in range(2):
        used = suggest_client.post(
            "/api/v1/templates/suggestions/used",
            json={
                "source": "prebuilt",
                "id": "confrontation",
                "sceneType": "Négociation",
                "characters": ["char-alpha"],
            },
        )
        assert used.status_code == 200
    response = suggest_client.post(
        "/api/v1/templates/suggestions",
        json=_suggest_body(
            instructions="confrontation",
            sceneType="Négociation",
            characters=["char-alpha"],
        ),
    )
    assert response.status_code == 200
    match = next(item for item in response.json() if item["id"] == "confrontation")
    assert "Déjà choisi dans un scénario similaire" in match["reasons"]


def test_used_invalid_source_400(suggest_client: TestClient) -> None:
    """Source inconnue → 422 (validation schéma)."""
    response = suggest_client.post(
        "/api/v1/templates/suggestions/used",
        json={"source": "other", "id": str(uuid4())},
    )
    assert response.status_code == 422
