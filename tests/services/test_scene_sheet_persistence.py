"""Fiche de scène : compagnon ``Scenes/{id}.scene.json`` du document (Story 20.4a)."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from services.document_persistence_service import (
    DialogueRevisionConflictError,
    DocumentPersistenceService,
    scene_sheet_path,
)
from services.repositories.sqlite.connection import DatabaseConnection
from services.repositories.sqlite.dialogues_index_repository import (
    DialoguesIndexRepository,
)
from services.unity_dialogue_download_service import read_document_download_payload
from services.unity_export_normalizer import normalize_unity_export_document

SHEET: dict[str, object] = {
    "npcs": [{"entryId": "id-npc", "name": "PNJ de test"}],
    "pc": {"entryId": None, "name": "Uresaïr"},
    "place": None,
    "brief": "Ce qui doit se passer.",
    "tones": ["tension"],
    "authorProfileId": "profil-1",
    "linkedEntries": [{"category": "items", "name": "Objet", "mode": "full", "entryId": None}],
    "contextBudget": "auto",
    "champInconnu": {"conserve": True},
}

ADMIN: dict[str, object] = {
    "id": "admin-1",
    "username": "admin",
    "role": "admin",
    "is_active": True,
}


def _document(**extra: object) -> dict[str, object]:
    """Document canonique minimal, complété par ``extra``."""
    return {"schemaVersion": "1.2.0", "title": "Scène", "nodes": [], **extra}


@pytest.fixture
def dialogue_dir(tmp_path: Path) -> Path:
    """Dossier des dialogues : le compagnon vit à côté, sous ``tmp_path/Scenes``."""
    path = tmp_path / "Dialogue"
    path.mkdir()
    return path


@pytest.fixture
def service(isolated_app_database: DatabaseConnection) -> DocumentPersistenceService:
    """Service de persistance sur une base isolée."""
    return DocumentPersistenceService(DialoguesIndexRepository(isolated_app_database))


def _read_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def test_scene_is_stored_beside_the_document_and_never_inside_it(
    service: DocumentPersistenceService, dialogue_dir: Path
) -> None:
    """La fiche va dans le compagnon, revient à la lecture et ne mute pas l'appelant."""
    document = _document(scene=SHEET)

    revision = service.write_document(dialogue_dir, "scene", document, 1, ADMIN)

    assert document["scene"] == SHEET
    assert "scene" not in _read_json(dialogue_dir / "scene.json")
    companion = scene_sheet_path(dialogue_dir, "scene")
    assert companion == dialogue_dir.parent / "Scenes" / "scene.scene.json"
    assert _read_json(companion) == SHEET
    persisted = service.read_document(dialogue_dir, "scene", ADMIN)
    assert persisted.scene == SHEET
    assert "scene" not in persisted.document
    assert persisted.revision == revision == 1


def test_write_without_scene_keeps_the_sheet_and_null_removes_it(
    service: DocumentPersistenceService, dialogue_dir: Path
) -> None:
    """Sans clé : fiche inchangée ; ``None`` : fiche supprimée."""
    companion = scene_sheet_path(dialogue_dir, "keep")
    service.write_document(dialogue_dir, "keep", _document(scene=SHEET), 1, ADMIN)

    service.write_document(dialogue_dir, "keep", _document(title="Renommé"), 1, ADMIN)
    assert _read_json(companion) == SHEET

    service.write_document(dialogue_dir, "keep", _document(scene=None), 2, ADMIN)
    assert not companion.exists()
    assert service.read_document(dialogue_dir, "keep", ADMIN).scene is None


def test_write_without_scene_creates_no_companion(
    service: DocumentPersistenceService, dialogue_dir: Path
) -> None:
    """Un dialogue sans fiche ne produit aucun fichier de fiche."""
    service.write_document(dialogue_dir, "bare", _document(), 1, ADMIN)

    assert not scene_sheet_path(dialogue_dir, "bare").exists()


@pytest.mark.parametrize("create_only", [True, False])
def test_creation_does_not_inherit_an_orphan_sheet(
    service: DocumentPersistenceService, dialogue_dir: Path, create_only: bool
) -> None:
    """Un compagnon resté sur le disque est effacé quand un dialogue du même nom naît."""
    companion = scene_sheet_path(dialogue_dir, "orphan")
    companion.parent.mkdir(parents=True)
    companion.write_text(json.dumps(SHEET), encoding="utf-8")

    service.write_document(
        dialogue_dir, "orphan", _document(), 1, ADMIN, create_only=create_only
    )

    assert not companion.exists()


@pytest.mark.parametrize("scene", [[], "fiche", 3])
def test_malformed_scene_writes_nothing(
    service: DocumentPersistenceService, dialogue_dir: Path, scene: object
) -> None:
    """Une fiche qui n'est pas un objet est refusée avant toute écriture."""
    with pytest.raises(ValueError):
        service.write_document(dialogue_dir, "bad", _document(scene=scene), 1, ADMIN)

    assert not (dialogue_dir / "bad.json").exists()
    assert not scene_sheet_path(dialogue_dir, "bad").exists()


def test_failure_after_the_companion_restores_document_meta_and_sheet(
    service: DocumentPersistenceService,
    dialogue_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Une erreur après l'écriture de la fiche rend les trois fichiers à leur état."""
    service.write_document(dialogue_dir, "fail", _document(scene=SHEET), 1, ADMIN)
    paths = [
        dialogue_dir / "fail.json",
        dialogue_dir / "fail.meta",
        scene_sheet_path(dialogue_dir, "fail"),
    ]
    before = [path.read_bytes() for path in paths]
    original_replace = service._replace_file
    failures: list[Path] = []

    def failing_replace(path: Path, content: bytes) -> None:
        if path.name == "fail.meta" and not failures:
            failures.append(path)
            raise OSError("disque plein")
        original_replace(path, content)

    monkeypatch.setattr(service, "_replace_file", failing_replace)

    with pytest.raises(OSError):
        service.write_document(
            dialogue_dir,
            "fail",
            _document(title="Après", scene={"brief": "autre"}),
            1,
            ADMIN,
        )

    assert failures
    assert [path.read_bytes() for path in paths] == before


def test_conflict_carries_the_server_sheet(
    service: DocumentPersistenceService, dialogue_dir: Path
) -> None:
    """Le conflit de révision porte la fiche du serveur, que le client adopte."""
    service.write_document(dialogue_dir, "conflict", _document(scene=SHEET), 1, ADMIN)

    with pytest.raises(DialogueRevisionConflictError) as caught:
        service.write_document(dialogue_dir, "conflict", _document(), 7, ADMIN)

    assert caught.value.scene == SHEET
    assert "scene" not in caught.value.payload


@pytest.mark.parametrize("content", [b"\xff\xfe\x00illisible", b"{tronque", b"[1]"])
def test_unreadable_companion_does_not_fail_the_read(
    service: DocumentPersistenceService, dialogue_dir: Path, content: bytes
) -> None:
    """Un compagnon illisible (encodage, JSON, forme) n'empêche pas de lire le dialogue."""
    service.write_document(dialogue_dir, "broken", _document(scene=SHEET), 1, ADMIN)
    scene_sheet_path(dialogue_dir, "broken").write_bytes(content)

    persisted = service.read_document(dialogue_dir, "broken", ADMIN)

    assert persisted.scene is None
    assert persisted.document["title"] == "Scène"


def test_delete_removes_the_sheet(
    service: DocumentPersistenceService, dialogue_dir: Path
) -> None:
    """Supprimer le dialogue supprime sa fiche."""
    service.write_document(dialogue_dir, "gone", _document(scene=SHEET), 1, ADMIN)

    service.delete_document(dialogue_dir, None, "gone", ADMIN)

    assert not scene_sheet_path(dialogue_dir, "gone").exists()
    assert not (dialogue_dir / "gone.json").exists()


def test_search_index_receives_the_document_without_the_sheet(
    isolated_app_database: DatabaseConnection, dialogue_dir: Path
) -> None:
    """Le texte de la fiche n'entre pas dans l'index de recherche."""
    index = MagicMock()
    service = DocumentPersistenceService(
        DialoguesIndexRepository(isolated_app_database),
        dialogue_index_service=index,
    )

    service.write_document(dialogue_dir, "indexed", _document(scene=SHEET), 1, ADMIN)

    indexed_document = index.index_document.call_args[0][1]
    assert "scene" not in indexed_document


def test_export_normalizer_drops_the_sheet_without_touching_the_source() -> None:
    """La normalisation d'export retire la fiche d'une copie."""
    source = _document(scene=SHEET)

    normalized = normalize_unity_export_document(source)

    assert "scene" not in normalized
    assert source["scene"] == SHEET


def test_download_never_serves_a_sheet(dialogue_dir: Path) -> None:
    """Même un fichier posé à la main avec ``scene`` est téléchargé sans elle."""
    (dialogue_dir / "hand.json").write_text(
        json.dumps(_document(scene=SHEET)), encoding="utf-8"
    )
    config = MagicMock()
    config.get_unity_dialogues_path.return_value = str(dialogue_dir)

    content, _filename = read_document_download_payload(config, "hand")

    assert "scene" not in json.loads(content)
