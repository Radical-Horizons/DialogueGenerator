"""Contrat HTTP de la fiche de scène : GET / PUT /api/v1/documents/{id} (Story 20.4a)."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Iterator
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service
from api.main import app
from services.configuration_service import ConfigurationService

SHEET = {
    "npcs": [{"entryId": "id-npc", "name": "PNJ de test"}],
    "pc": {"entryId": None, "name": "Uresaïr"},
    "place": {"entryId": None, "name": "Un atelier"},
    "brief": "Ce qui doit se passer.",
    "tones": [],
    "linkedEntries": [],
    "contextBudget": "auto",
}


@pytest.fixture
def dialogue_dir(tmp_path: Path) -> Path:
    """Dossier des dialogues ; les fiches vont dans ``tmp_path/Scenes``."""
    path = tmp_path / "Dialogue"
    path.mkdir()
    return path


@pytest.fixture
def client(dialogue_dir: Path) -> Iterator[TestClient]:
    """Client de test dont le dossier Unity est temporaire."""
    config = MagicMock(spec=ConfigurationService)
    config.get_unity_dialogues_path.return_value = dialogue_dir
    config.get_unity_layouts_path.return_value = dialogue_dir.parent / "Layouts"
    app.dependency_overrides[get_config_service] = lambda: config
    yield TestClient(app)
    app.dependency_overrides.pop(get_config_service, None)


def _document(**extra: object) -> dict[str, object]:
    return {
        "schemaVersion": "1.1.0",
        "nodes": [{"id": "START", "speaker": "NPC", "line": "Bonjour", "nextNode": "END"}],
        **extra,
    }


def _put(client: TestClient, document: dict, revision: int = 1, **body: object):
    return client.put(
        "/api/v1/documents/scene-api",
        json={"document": document, "revision": revision, **body},
    )


def _companion(dialogue_dir: Path) -> Path:
    return dialogue_dir.parent / "Scenes" / "scene-api.scene.json"


def test_put_then_get_returns_the_same_sheet_and_the_file_has_none(
    client: TestClient, dialogue_dir: Path
) -> None:
    """Aller-retour : fiche identique, révision +1, fichier du dialogue sans ``scene``."""
    assert _put(client, _document()).json()["revision"] == 1

    response = _put(client, _document(scene=SHEET), revision=1)

    assert response.status_code == 200
    assert response.json()["revision"] == 2
    read = client.get("/api/v1/documents/scene-api").json()
    assert read["document"]["scene"] == SHEET
    assert read["revision"] == 2
    stored = json.loads((dialogue_dir / "scene-api.json").read_text(encoding="utf-8"))
    assert "scene" not in stored


def test_put_without_scene_and_without_companion_creates_no_file(
    client: TestClient, dialogue_dir: Path
) -> None:
    """Sans fiche : document valide, aucun fichier créé, ``scene`` absente du GET."""
    assert _put(client, _document()).status_code == 200

    assert not _companion(dialogue_dir).exists()
    assert "scene" not in client.get("/api/v1/documents/scene-api").json()["document"]


def test_export_mode_put_keeps_the_sheet(client: TestClient, dialogue_dir: Path) -> None:
    """La validation d'export (onglet Éditer) normalise sans perdre la fiche envoyée."""
    response = _put(client, _document(scene=SHEET), validationMode="export")

    assert response.status_code == 200
    assert json.loads(_companion(dialogue_dir).read_text(encoding="utf-8")) == SHEET


@pytest.mark.parametrize("scene", [["x"], "fiche", 4])
def test_malformed_sheet_is_a_400_that_writes_nothing(
    client: TestClient, dialogue_dir: Path, scene: object
) -> None:
    """``scene`` non objet : 400, document et fiche intacts."""
    _put(client, _document(scene=SHEET))
    before = (dialogue_dir / "scene-api.json").read_bytes()

    response = _put(client, _document(title="Après", scene=scene), revision=1)

    assert response.status_code == 400
    assert (dialogue_dir / "scene-api.json").read_bytes() == before
    assert json.loads(_companion(dialogue_dir).read_text(encoding="utf-8")) == SHEET
    assert client.get("/api/v1/documents/scene-api").json()["revision"] == 1


def test_conflict_payload_carries_the_server_sheet(client: TestClient) -> None:
    """Le 409 rend la fiche du serveur dans le document."""
    _put(client, _document(scene=SHEET))

    response = _put(client, _document(), revision=9)

    assert response.status_code == 409
    assert response.json()["document"]["scene"] == SHEET


def test_put_with_null_scene_removes_the_companion(
    client: TestClient, dialogue_dir: Path
) -> None:
    """``scene: null`` supprime la fiche, que le GET ne rend plus."""
    _put(client, _document(scene=SHEET))

    response = _put(client, _document(scene=None), revision=1)

    assert response.status_code == 200
    assert not _companion(dialogue_dir).exists()
    assert "scene" not in client.get("/api/v1/documents/scene-api").json()["document"]


def test_delete_removes_the_companion(client: TestClient, dialogue_dir: Path) -> None:
    """DELETE emporte la fiche."""
    _put(client, _document(scene=SHEET))

    assert client.delete("/api/v1/documents/scene-api").status_code == 204

    assert not _companion(dialogue_dir).exists()


def test_save_and_write_output_has_no_scene(
    client: TestClient, dialogue_dir: Path
) -> None:
    """Même avec ``scene`` dans le corps, la route d'export du graphe ne la rend pas."""
    response = client.post(
        "/api/v1/unity-dialogues/graph/save-and-write",
        json={
            "nodes": [
                {
                    "id": "START",
                    "type": "dialogueNode",
                    "position": {"x": 0, "y": 0},
                    "data": {"id": "START", "speaker": "NPC", "line": "Bonjour"},
                }
            ],
            "edges": [],
            "metadata": {"title": "Export", "node_count": 1, "edge_count": 0},
            "document_id": "scene-export",
            "scene": SHEET,
        },
    )

    assert response.status_code == 200, response.text
    assert "scene" not in json.loads(response.json()["json_content"])
    stored = json.loads((dialogue_dir / "scene-export.json").read_text(encoding="utf-8"))
    assert "scene" not in stored
    assert not (dialogue_dir.parent / "Scenes" / "scene-export.scene.json").exists()
