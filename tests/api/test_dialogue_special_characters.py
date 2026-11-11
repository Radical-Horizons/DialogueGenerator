"""Parcours complet d'un dialogue aux caractères typographiques (recette 2026-11).

Un identifiant de dialogue est le nom de fichier sans ``.json``, casse et accents
intacts, partout : documents, liste, collections, graphe, export. Le contenu
(titre, répliques) ressort au caractère près.
"""

from __future__ import annotations

import io
import json
import unicodedata
import zipfile
from pathlib import Path
from typing import Any, Iterator
from unittest.mock import MagicMock
from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service
from api.main import app
from api.routers.auth import get_current_user
from services.configuration_service import ConfigurationService
from services.repositories.sqlite.connection import DatabaseConnection

TITLE = "L’Épée « brisée » — Élan 🐉"
LINE = "« Écoute-moi — c’est l’heure, Éloïse. » 🗡️"
CHOICE = "Répondre : « Jamais ! » — d’accord 😤"


def _writer() -> dict[str, object]:
    """Identité writer active."""
    return {"id": "writer-a", "username": "writer-a", "role": "writer", "is_active": True}


@pytest.fixture
def special_client(
    tmp_path: Path,
    isolated_app_database: DatabaseConnection,
) -> Iterator[tuple[TestClient, Path]]:
    """Client API writer avec stockage dialogues temporaire."""
    dialogue_dir = tmp_path / "Dialogues"
    layout_dir = tmp_path / "Layouts"
    dialogue_dir.mkdir()
    layout_dir.mkdir()
    config = MagicMock(spec=ConfigurationService)
    config.get_unity_dialogues_path.return_value = dialogue_dir
    config.get_unity_layouts_path.return_value = layout_dir
    isolated_app_database.execute(
        """
        INSERT INTO users(id, username, role, is_active, created_at, updated_at)
        VALUES ('writer-a', 'writer-a', 'writer', 1, datetime('now'), datetime('now'))
        """
    )
    app.dependency_overrides[get_config_service] = lambda: config
    app.dependency_overrides[get_current_user] = _writer
    try:
        yield TestClient(app), dialogue_dir
    finally:
        app.dependency_overrides.clear()


def _document() -> dict[str, Any]:
    """Document Unity minimal porteur des caractères à préserver."""
    return {
        "schemaVersion": "1.2.0",
        "title": TITLE,
        "nodes": [
            {
                "id": "START",
                "speaker": "Éloïse",
                "line": LINE,
                "choices": [{"text": CHOICE, "targetNode": "END"}],
            },
            {"id": "END", "speaker": "Éloïse", "line": "Fin — « vraiment » ’"},
        ],
    }


def _url_id(document_id: str) -> str:
    """Encode l'identifiant comme `encodeURIComponent` côté front."""
    return quote(document_id, safe="")


def _listed_stem(client: TestClient, document_id: str) -> str:
    """Retourne le stem tel que la liste bibliothèque l'expose."""
    listed = client.get("/api/v1/unity-dialogues")
    assert listed.status_code == 200, listed.text
    stems = [Path(item["filename"]).stem for item in listed.json()["dialogues"]]
    assert document_id in stems, stems
    return document_id


@pytest.mark.parametrize(
    "document_id",
    ["La_carte_refusée", "L’Épée_«_brisée_»_—_Élan_🐉"],
)
def test_dialogue_round_trip_preserves_identifier_and_text(
    special_client: tuple[TestClient, Path],
    document_id: str,
) -> None:
    """Sauver, relire, lister, ranger, rouvrir en graphe, exporter : rien ne bouge."""
    client, dialogue_dir = special_client

    saved = client.put(
        f"/api/v1/documents/{_url_id(document_id)}",
        json={"document": _document(), "revision": 1, "createOnly": True},
    )
    assert saved.status_code == 200, saved.text
    assert (dialogue_dir / f"{document_id}.json").is_file()

    read = client.get(f"/api/v1/documents/{_url_id(document_id)}")
    assert read.status_code == 200, read.text
    persisted = read.json()["document"]
    assert persisted["title"] == TITLE
    assert persisted["nodes"][0]["line"] == LINE
    assert persisted["nodes"][0]["choices"][0]["text"] == CHOICE

    listed = client.get("/api/v1/unity-dialogues").json()["dialogues"]
    item = next(d for d in listed if Path(d["filename"]).stem == document_id)
    assert item["title"] == TITLE

    stem = _listed_stem(client, document_id)
    collection_id = client.post(
        "/api/v1/collections", json={"name": "Typographie — « test »", "icon": "⚔️"}
    ).json()["id"]
    ranged = client.post(
        f"/api/v1/collections/{collection_id}/dialogues",
        json={"document_ids": [stem]},
    )
    assert ranged.status_code == 200, ranged.text
    assert ranged.json()["dialogue_ids"] == [document_id]
    collection = client.get(f"/api/v1/collections/{collection_id}").json()
    assert collection["name"] == "Typographie — « test »"
    assert collection["icon"] == "⚔️"

    loaded = client.post(
        "/api/v1/unity-dialogues/graph/load",
        json={"json_content": json.dumps(persisted, ensure_ascii=False)},
    )
    assert loaded.status_code == 200, loaded.text
    start = next(n for n in loaded.json()["nodes"] if n["id"] == "START")
    assert start["data"]["line"] == LINE
    assert start["data"]["choices"][0]["text"] == CHOICE

    downloaded = client.get(f"/api/v1/dialogues/{_url_id(document_id)}/download")
    assert downloaded.status_code == 200, downloaded.text
    exported = json.loads(downloaded.content.decode("utf-8"))
    assert exported["title"] == TITLE
    assert exported["nodes"][0]["line"] == LINE
    assert exported["nodes"][0]["choices"][0]["text"] == CHOICE
    disposition = downloaded.headers["content-disposition"]
    disposition.encode("latin-1")
    assert f"filename*=UTF-8''{quote(f'{document_id}.json', safe='')}" in disposition

    preview = client.post(
        "/api/v1/dialogues/batch-preview-export",
        json={"document_ids": [stem]},
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["items"][0]["document_id"] == document_id
    assert LINE in preview.json()["items"][0]["json_preview"]

    archive = client.post(
        "/api/v1/dialogues/batch-download",
        json={"filenames": [f"{document_id}.json"]},
    )
    assert archive.status_code == 200, archive.text
    with zipfile.ZipFile(io.BytesIO(archive.content)) as bundle:
        assert bundle.namelist() == [f"{document_id}.json"]
        zipped = json.loads(bundle.read(f"{document_id}.json").decode("utf-8"))
    assert zipped["nodes"][0]["line"] == LINE

    validated = client.post(f"/api/v1/dialogues/{_url_id(document_id)}/validate-schema")
    assert validated.status_code == 200, validated.text

    found = client.get("/api/v1/unity-dialogues/search", params={"q": "Éloïse"})
    assert found.status_code == 200, found.text
    assert found.json()["document_ids"] == [document_id]

    updated_document = _document()
    updated_document["nodes"][0]["line"] = LINE + " É"
    updated = client.put(
        f"/api/v1/documents/{_url_id(document_id)}",
        json={"document": updated_document, "revision": 1},
    )
    assert updated.status_code == 200, updated.text
    reread = client.get(f"/api/v1/documents/{_url_id(document_id)}").json()
    assert reread["document"]["nodes"][0]["line"] == LINE + " É"
    assert reread["revision"] == 2


def test_collection_rejects_identifier_with_lost_case(
    special_client: tuple[TestClient, Path],
) -> None:
    """Régression « Dialogue introuvable: la_carte_refusée » : l'id est exact."""
    client, _ = special_client
    assert client.put(
        f"/api/v1/documents/{_url_id('La_carte_refusée')}",
        json={"document": _document(), "revision": 1, "createOnly": True},
    ).status_code == 200
    collection_id = client.post("/api/v1/collections", json={"name": "C"}).json()["id"]

    exact = client.post(
        f"/api/v1/collections/{collection_id}/dialogues",
        json={"document_ids": ["La_carte_refusée"]},
    )
    assert exact.status_code == 200, exact.text

    lowered = client.post(
        f"/api/v1/collections/{collection_id}/dialogues",
        json={"document_ids": ["la_carte_refusée"]},
    )
    assert lowered.status_code == 404


@pytest.mark.parametrize("form", ["NFC", "NFD"])
def test_graph_save_derives_one_identifier_from_typographic_title(
    special_client: tuple[TestClient, Path],
    form: str,
) -> None:
    """Graphe → fichier : l'id dérivé du titre garde ses accents, quelle que soit la forme Unicode."""
    client, _ = special_client
    title = unicodedata.normalize(form, TITLE)
    nodes = [
        {
            "id": "START",
            "type": "dialogueNode",
            "position": {"x": 0, "y": 0},
            "data": {"id": "START", "speaker": "Éloïse", "line": LINE},
        }
    ]
    saved = client.post(
        "/api/v1/unity-dialogues/graph/save-and-write",
        json={
            "nodes": nodes,
            "edges": [],
            "metadata": {"title": title, "node_count": 1, "edge_count": 0},
        },
    )
    assert saved.status_code == 200, saved.text
    document_id = Path(saved.json()["filename"]).stem
    assert document_id == "LÉpée_brisée_Élan_"

    persisted = client.get(f"/api/v1/documents/{_url_id(document_id)}").json()["document"]
    assert persisted["title"] == title
    assert persisted["nodes"][0]["line"] == LINE
    assert _listed_stem(client, document_id) == document_id
    collection_id = client.post("/api/v1/collections", json={"name": "G"}).json()["id"]
    ranged = client.post(
        f"/api/v1/collections/{collection_id}/dialogues",
        json={"document_ids": [document_id]},
    )
    assert ranged.status_code == 200, ranged.text
