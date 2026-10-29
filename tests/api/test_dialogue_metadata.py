"""Tests API et service des métadonnées dialogue FR86."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import (
    get_config_service,
    get_dialogue_metadata_service,
    get_dialogue_sharing_service,
    get_document_persistence_service,
    get_user_repository,
)
from api.main import app
from api.routers.auth import get_current_user
from services.dialogue_metadata_service import (
    DialogueListingMetadata,
    DialogueMetadata,
    DialogueMetadataService,
)
from services.document_persistence_service import (
    DialogueAccessDeniedError,
    DialogueCapabilities,
    DialogueListingIndexFields,
)
from services.repositories.sqlite.dialogues_index_repository import DialogueIndexEntry


def _user(user_id: str, role: str = "writer") -> dict[str, object]:
    """Construit une identité active de test."""
    return {
        "id": user_id,
        "username": user_id,
        "role": role,
        "is_active": True,
    }


def _metadata(document_id: str = "scene") -> DialogueMetadata:
    """Construit une réponse métier complète."""
    return DialogueMetadata(
        document_id=document_id,
        name="Rencontre",
        storage_path=f"C:/Dialogues/{document_id}.json",
        owner_id="owner-1",
        owner_username="alice",
        last_modified_by="editor-1",
        last_modified_by_username="marc",
        created_at="2026-08-01 10:00:00",
        updated_at="2026-08-04 10:00:00",
        node_count=4,
        total_cost_eur=8.2,
        cost_per_node_eur=2.05,
    )


@pytest.fixture
def metadata_client(tmp_path: Path) -> Iterator[tuple[TestClient, MagicMock, MagicMock]]:
    """Fournit un client avec dépendances FR86 isolées."""
    dialogue_dir = tmp_path / "Dialogues"
    dialogue_dir.mkdir()
    config = MagicMock()
    config.get_unity_dialogues_path.return_value = dialogue_dir
    persistence = MagicMock()
    persistence.require_access.return_value = DialogueCapabilities(
        can_read=True,
        can_edit=True,
        can_delete=True,
        is_owner=True,
    )
    metadata_service = MagicMock()
    metadata_service.get_dialogue_metadata.return_value = _metadata()
    app.dependency_overrides[get_config_service] = lambda: config
    app.dependency_overrides[get_document_persistence_service] = lambda: persistence
    app.dependency_overrides[get_dialogue_metadata_service] = lambda: metadata_service
    app.dependency_overrides[get_current_user] = lambda: _user("owner-1")
    try:
        yield TestClient(app), persistence, metadata_service
    finally:
        app.dependency_overrides.clear()


def test_metadata_ok_returns_complete_payload(
    metadata_client: tuple[TestClient, MagicMock, MagicMock],
) -> None:
    """Un dialogue accessible retourne les champs agrégés avec un statut 200."""
    client, _, _ = metadata_client
    response = client.get("/api/v1/dialogues/scene/metadata")
    assert response.status_code == 200
    payload = response.json()
    assert payload["document_id"] == "scene"
    assert payload["name"] == "Rencontre"
    assert payload["owner_username"] == "alice"
    assert payload["last_modified_by_username"] == "marc"
    assert payload["node_count"] == 4
    assert payload["total_cost_eur"] == 8.2
    assert payload["cost_per_node_eur"] == 2.05
    assert "storage_path" not in payload


def test_metadata_zero_cost_when_no_usage(
    metadata_client: tuple[TestClient, MagicMock, MagicMock],
) -> None:
    """Sans usage LLM, le détail expose un coût total et un coût/nœud à zéro."""
    client, _, metadata_service = metadata_client
    zero = _metadata()
    metadata_service.get_dialogue_metadata.return_value = DialogueMetadata(
        document_id=zero.document_id,
        name=zero.name,
        storage_path=zero.storage_path,
        owner_id=zero.owner_id,
        owner_username=zero.owner_username,
        last_modified_by=zero.last_modified_by,
        last_modified_by_username=zero.last_modified_by_username,
        created_at=zero.created_at,
        updated_at=zero.updated_at,
        node_count=3,
        total_cost_eur=0.0,
        cost_per_node_eur=0.0,
    )
    response = client.get("/api/v1/dialogues/scene/metadata")
    assert response.status_code == 200
    assert response.json()["total_cost_eur"] == 0.0
    assert response.json()["cost_per_node_eur"] == 0.0
    assert response.json()["node_count"] == 3


def test_private_metadata_is_hidden(
    metadata_client: tuple[TestClient, MagicMock, MagicMock],
) -> None:
    """Un refus RBAC est masqué en 404 et le service d'agrégation n'est pas appelé."""
    client, persistence, metadata_service = metadata_client
    persistence.require_access.side_effect = DialogueAccessDeniedError("privé")
    response = client.get("/api/v1/dialogues/scene/metadata")
    assert response.status_code == 404
    metadata_service.get_dialogue_metadata.assert_not_called()


def test_guest_can_read_accessible_metadata(
    metadata_client: tuple[TestClient, MagicMock, MagicMock],
) -> None:
    """Un invité conserve la lecture quand l'autorité RBAC l'autorise."""
    client, _, _ = metadata_client
    app.dependency_overrides[get_current_user] = lambda: _user("guest", "guest")
    response = client.get("/api/v1/dialogues/scene/metadata")
    assert response.status_code == 200


@pytest.mark.parametrize(
    ("total_cost", "nodes", "expected_per_node"),
    [(0.0, 3, 0.0), (8.2, 4, 2.05), (3.0, 0, 0.0)],
)
def test_service_computes_cost_per_document_node(
    tmp_path: Path,
    total_cost: float,
    nodes: int,
    expected_per_node: float,
) -> None:
    """Le coût par nœud emploie les nœuds du document et gère zéro usage/nœud."""
    document_path = tmp_path / "scene.json"
    document_path.write_text(
        json.dumps({"title": "Scène", "nodes": [{"id": str(i)} for i in range(nodes)]}),
        encoding="utf-8",
    )
    index = MagicMock()
    index.find_by_document_id.return_value = DialogueIndexEntry(
        document_id="scene",
        owner_id="owner-1",
        storage_path=str(document_path),
        last_modified_by="editor-1",
        created_at="2026-08-01 10:00:00",
        updated_at="2026-08-04 10:00:00",
    )
    users = MagicMock()
    users.find_by_id.side_effect = lambda user_id: {
        "username": "alice" if user_id == "owner-1" else "marc"
    }
    usage = MagicMock()
    usage.get_dialogue_costs.return_value = {"total_cost_eur": total_cost}
    service = DialogueMetadataService(
        dialogues_index_repository=index,
        user_repository=users,
        llm_usage_service=usage,
        config_service=MagicMock(),
    )
    result = service.get_dialogue_metadata("scene")
    assert result.total_cost_eur == total_cost
    assert result.cost_per_node_eur == expected_per_node
    assert result.node_count == nodes
    assert result.created_at.endswith("Z")
    assert "T" in result.created_at


def test_listing_metadata_omits_cost_without_usage() -> None:
    """Sans enregistrement LLM, le listing expose un coût absent (None)."""
    index = MagicMock()
    index.find_by_document_id.return_value = DialogueIndexEntry(
        document_id="scene",
        owner_id="owner-1",
        storage_path="C:/Dialogues/scene.json",
        last_modified_by="editor-1",
        created_at="2026-08-01 10:00:00",
        updated_at="2026-08-04 10:00:00",
    )
    users = MagicMock()
    users.find_by_id.return_value = {"username": "marc"}
    usage = MagicMock()
    usage.get_all_dialogues_costs.return_value = []
    service = DialogueMetadataService(
        dialogues_index_repository=index,
        user_repository=users,
        llm_usage_service=usage,
        config_service=MagicMock(),
    )
    result = service.get_listing_metadata(["scene"])
    assert result["scene"].total_cost_eur is None
    assert result["scene"].last_modified_by_username == "marc"


def test_service_reads_historical_unindexed_dialogue(tmp_path: Path) -> None:
    """Un fichier historique visible reste consultable sans mutation de l'index."""
    document_path = tmp_path / "legacy.json"
    document_path.write_text(
        json.dumps({"nodes": [{"id": "START", "line": "Ancien dialogue"}]}),
        encoding="utf-8",
    )
    index = MagicMock()
    index.find_by_document_id.return_value = None
    usage = MagicMock()
    usage.get_dialogue_costs.return_value = {"total_cost_eur": 0.0}
    config = MagicMock()
    config.get_unity_dialogues_path.return_value = tmp_path
    service = DialogueMetadataService(
        dialogues_index_repository=index,
        user_repository=MagicMock(),
        llm_usage_service=usage,
        config_service=config,
    )

    result = service.get_dialogue_metadata("legacy")
    assert result.name == "Ancien dialogue"
    assert result.owner_id is None
    assert result.node_count == 1
    assert result.total_cost_eur == 0.0


def test_unity_listing_contains_cost_and_last_editor(
    metadata_client: tuple[TestClient, MagicMock, MagicMock],
    tmp_path: Path,
) -> None:
    """Le listing expose coût et dernier éditeur issus de l'enrichissement batch."""
    client, persistence, metadata_service = metadata_client
    dialogue_dir = tmp_path / "listing"
    dialogue_dir.mkdir()
    (dialogue_dir / "scene.json").write_text(
        json.dumps({"nodes": [{"id": "START", "line": "Bonjour"}]}),
        encoding="utf-8",
    )
    config = app.dependency_overrides[get_config_service]()
    config.get_unity_dialogues_path.return_value = dialogue_dir
    persistence.can_list.return_value = True
    persistence.get_listing_index_fields.return_value = DialogueListingIndexFields(
        created_at="2026-08-01 10:00:00",
        owner_id="owner-1",
    )
    persistence.capabilities.return_value = DialogueCapabilities(
        can_read=True,
        can_edit=True,
        can_delete=True,
        is_owner=True,
    )
    metadata_service.get_listing_metadata.return_value = {
        "scene": DialogueListingMetadata(
            total_cost_eur=8.2,
            last_modified_by="editor-1",
            last_modified_by_username="marc",
        )
    }
    sharing = MagicMock()
    sharing.count_shares_by_document_ids.return_value = {"scene": 0}
    users = MagicMock()
    users.find_by_id.return_value = {"username": "alice"}
    app.dependency_overrides[get_dialogue_sharing_service] = lambda: sharing
    app.dependency_overrides[get_user_repository] = lambda: users

    response = client.get("/api/v1/unity-dialogues")
    assert response.status_code == 200
    item = response.json()["dialogues"][0]
    assert item["total_cost_eur"] == 8.2
    assert item["last_modified_by"] == "editor-1"
    assert item["last_modified_by_username"] == "marc"
    metadata_service.get_listing_metadata.assert_called_once_with(["scene"])
