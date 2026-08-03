"""Tests pour les endpoints Unity Dialogues."""
import json
import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
from datetime import datetime

from api.main import app
from api.dependencies import get_config_service
from api.exceptions import ValidationException, NotFoundException, InternalServerException


@pytest.fixture
def mock_config_service():
    """Mock du ConfigurationService."""
    from services.configuration_service import ConfigurationService
    from unittest.mock import MagicMock
    
    mock_service = MagicMock(spec=ConfigurationService)
    return mock_service


@pytest.fixture
def client(mock_config_service):
    """Fixture pour créer un client de test avec mocks."""
    # Utiliser dependency_overrides comme dans les autres tests
    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    
    yield TestClient(app)
    
    # Nettoyer après le test
    app.dependency_overrides.clear()


@pytest.fixture
def sample_unity_dialogue():
    """Contenu JSON Unity de test (v1.1.0 avec choiceId)."""
    return [
        {
            "id": "START",
            "speaker": "TEST_NPC",
            "line": "Bonjour, comment allez-vous ?",
            "choices": [
                {"choiceId": "c1", "text": "Je vais bien", "targetNode": "node1"},
                {"choiceId": "c2", "text": "Pas très bien", "targetNode": "node2"},
            ],
        },
        {
            "id": "node1",
            "speaker": "TEST_NPC",
            "line": "C'est bien !",
            "nextNode": "END"
        }
    ]


class TestListUnityDialogues:
    """Tests pour l'endpoint GET /api/v1/unity-dialogues."""
    
    def test_list_unity_dialogues_success(self, client, mock_config_service, tmp_path):
        """Test de liste des dialogues Unity avec succès."""
        # Créer des fichiers de test
        dialogue1 = tmp_path / "dialogue1.json"
        dialogue2 = tmp_path / "dialogue2.json"
        
        json_content1 = [{"id": "START", "line": "Dialogue 1"}]
        json_content2 = [{"id": "START", "line": "Dialogue 2"}]
        
        dialogue1.write_text(json.dumps(json_content1), encoding="utf-8")
        dialogue2.write_text(json.dumps(json_content2), encoding="utf-8")
        
        # S'assurer que le dossier existe
        tmp_path.mkdir(parents=True, exist_ok=True)
        
        mock_config_service.get_unity_dialogues_path.return_value = str(tmp_path)
        
        response = client.get("/api/v1/unity-dialogues")
        
        assert response.status_code == 200
        data = response.json()
        assert "dialogues" in data
        assert "total" in data
        # Il peut y avoir d'autres fichiers dans tmp_path, donc >= 2
        assert data["total"] >= 2
        
        # Vérifier que nos fichiers sont présents
        filenames = [d["filename"] for d in data["dialogues"]]
        assert "dialogue1.json" in filenames
        assert "dialogue2.json" in filenames
        
        # Vérifier les métadonnées
        for dialogue in data["dialogues"]:
            assert "filename" in dialogue
            assert "file_path" in dialogue
            assert "size_bytes" in dialogue
            assert "modified_time" in dialogue
    
    def test_list_unity_dialogues_empty(self, client, mock_config_service, tmp_path):
        """Test de liste vide."""
        # Créer un dossier vide
        empty_dir = tmp_path / "empty"
        empty_dir.mkdir(parents=True, exist_ok=True)
        
        mock_config_service.get_unity_dialogues_path.return_value = str(empty_dir)
        
        response = client.get("/api/v1/unity-dialogues")
        
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["dialogues"] == []

    def test_list_unity_dialogues_ignores_sidecar_files(
        self, client, mock_config_service, tmp_path
    ):
        """Ignore les sidecars layout/document générés par l'éditeur de graphe."""
        (tmp_path / "dialogue_ok.json").write_text(
            json.dumps([{"id": "START", "line": "OK"}]),
            encoding="utf-8",
        )
        (tmp_path / "dialogue_ok.json.layout.json").write_text(
            json.dumps({"nodes": {}}),
            encoding="utf-8",
        )
        (tmp_path / "dialogue_ok.json.json").write_text(
            json.dumps({"schemaVersion": "1.1.0", "nodes": []}),
            encoding="utf-8",
        )

        mock_config_service.get_unity_dialogues_path.return_value = str(tmp_path)

        response = client.get("/api/v1/unity-dialogues")

        assert response.status_code == 200
        data = response.json()
        filenames = [d["filename"] for d in data["dialogues"]]
        assert filenames == ["dialogue_ok.json"]
        assert data["total"] == 1
    
    def test_list_unity_dialogues_path_not_configured(self, client, mock_config_service):
        """Test avec chemin Unity non configuré."""
        mock_config_service.get_unity_dialogues_path.return_value = None
        
        response = client.get("/api/v1/unity-dialogues")
        
        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "VALIDATION_ERROR"
    
    def test_list_unity_dialogues_invalid_json_ignored(self, client, mock_config_service, tmp_path):
        """Test que les fichiers JSON invalides sont ignorés lors du listing."""
        valid_file = tmp_path / "valid.json"
        invalid_file = tmp_path / "invalid.json"
        
        valid_file.write_text(json.dumps([{"id": "START"}]), encoding="utf-8")
        invalid_file.write_text("not valid json", encoding="utf-8")
        
        mock_config_service.get_unity_dialogues_path.return_value = str(tmp_path)
        
        response = client.get("/api/v1/unity-dialogues")
        
        assert response.status_code == 200
        data = response.json()
        # Le fichier invalide devrait être ignoré ou causer un warning
        assert data["total"] >= 1


class TestListUnityDialoguesPagination:
    """Tests pagination + enrichissement du listing (Story 8.1 / FR80)."""

    @staticmethod
    def _make_dialogues(directory: Path, count: int) -> None:
        """Crée ``count`` dialogues legacy (liste de nœuds) dans ``directory``."""
        directory.mkdir(parents=True, exist_ok=True)
        for index in range(count):
            payload = [{"id": "START", "line": f"Dialogue {index}"}]
            (directory / f"dialogue_{index:03d}.json").write_text(
                json.dumps(payload), encoding="utf-8"
            )

    def test_list_backward_compat_without_page(
        self, client, mock_config_service, tmp_path
    ):
        """Sans `page`, la réponse reste complète et non paginée (rétrocompat)."""
        target = tmp_path / "no_pagination"
        self._make_dialogues(target, 3)
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        response = client.get("/api/v1/unity-dialogues")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        assert len(data["dialogues"]) == 3
        assert data["page"] is None
        assert data["page_size"] is None
        assert data["total_pages"] is None

    def test_list_paginated_page_two(
        self, client, mock_config_service, tmp_path
    ):
        """Avec `page`, la réponse est découpée et expose les métadonnées."""
        target = tmp_path / "paginated"
        self._make_dialogues(target, 3)
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        response = client.get("/api/v1/unity-dialogues?page=2&page_size=2")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        assert data["page"] == 2
        assert data["page_size"] == 2
        assert data["total_pages"] == 2
        assert len(data["dialogues"]) == 1

    def test_pagination_uses_default_page_size_of_50(
        self, client, mock_config_service, tmp_path
    ):
        """Sans `page_size`, la pagination active applique 50 par défaut."""
        target = tmp_path / "default_size"
        self._make_dialogues(target, 3)
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        response = client.get("/api/v1/unity-dialogues?page=1")

        assert response.status_code == 200
        data = response.json()
        assert data["page"] == 1
        assert data["page_size"] == 50
        assert data["total_pages"] == 1
        assert len(data["dialogues"]) == 3

    def test_pagination_preserves_global_order_across_pages(
        self, client, mock_config_service, tmp_path
    ):
        """Les pages découpent l'ordre global trié (pagination APRÈS tri)."""
        target = tmp_path / "ordered"
        self._make_dialogues(target, 5)
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        full = client.get("/api/v1/unity-dialogues").json()["dialogues"]
        expected_order = [d["filename"] for d in full]

        page1 = client.get("/api/v1/unity-dialogues?page=1&page_size=2").json()
        page2 = client.get("/api/v1/unity-dialogues?page=2&page_size=2").json()
        page3 = client.get("/api/v1/unity-dialogues?page=3&page_size=2").json()

        names1 = [d["filename"] for d in page1["dialogues"]]
        names2 = [d["filename"] for d in page2["dialogues"]]
        names3 = [d["filename"] for d in page3["dialogues"]]

        # Pages disjointes, réunion == ordre global, dans le même ordre.
        assert names1 + names2 + names3 == expected_order
        assert len(set(names1) | set(names2) | set(names3)) == 5

    def test_pagination_empty_set_reports_one_page(
        self, client, mock_config_service, tmp_path
    ):
        """Sur un ensemble vide paginé, `total_pages` vaut 1 (pas 0)."""
        target = tmp_path / "empty_paginated"
        target.mkdir(parents=True, exist_ok=True)
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        response = client.get("/api/v1/unity-dialogues?page=1&page_size=50")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert data["total_pages"] == 1
        assert data["dialogues"] == []

    def test_list_page_out_of_bounds_returns_empty(
        self, client, mock_config_service, tmp_path
    ):
        """Une page au-delà des bornes renvoie une liste vide sans erreur."""
        target = tmp_path / "out_of_bounds"
        self._make_dialogues(target, 3)
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        response = client.get("/api/v1/unity-dialogues?page=99&page_size=2")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 3
        assert data["total_pages"] == 2
        assert data["page"] == 99
        assert data["dialogues"] == []

    def test_list_item_enriched_with_node_count_and_created_at(
        self, client, mock_config_service, tmp_path
    ):
        """Chaque item expose node_count (parse JSON) et created_at (repli fichier)."""
        target = tmp_path / "enriched"
        target.mkdir(parents=True, exist_ok=True)
        payload = [
            {"id": "START", "line": "A"},
            {"id": "n1", "line": "B"},
            {"id": "n2", "line": "C"},
        ]
        (target / "enriched.json").write_text(
            json.dumps(payload), encoding="utf-8"
        )
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        response = client.get("/api/v1/unity-dialogues")

        assert response.status_code == 200
        item = next(
            d for d in response.json()["dialogues"] if d["filename"] == "enriched.json"
        )
        assert item["node_count"] == 3
        assert item["created_at"] is not None

    def test_list_node_count_supports_document_format(
        self, client, mock_config_service, tmp_path
    ):
        """node_count gère le format document canonique ``{schemaVersion, nodes}``."""
        target = tmp_path / "doc_format"
        target.mkdir(parents=True, exist_ok=True)
        document = {
            "schemaVersion": "1.2.0",
            "nodes": [{"id": "START"}, {"id": "n1"}],
        }
        (target / "doc.json").write_text(json.dumps(document), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        response = client.get("/api/v1/unity-dialogues")

        item = next(
            d for d in response.json()["dialogues"] if d["filename"] == "doc.json"
        )
        assert item["node_count"] == 2

    def test_list_corrupt_json_listed_with_null_node_count(
        self, client, mock_config_service, tmp_path
    ):
        """Un JSON illisible reste listé avec node_count=None (liste non cassée)."""
        target = tmp_path / "corrupt"
        target.mkdir(parents=True, exist_ok=True)
        (target / "valid.json").write_text(
            json.dumps([{"id": "START"}]), encoding="utf-8"
        )
        (target / "broken.json").write_text("not valid json", encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        response = client.get("/api/v1/unity-dialogues")

        assert response.status_code == 200
        by_name = {d["filename"]: d for d in response.json()["dialogues"]}
        assert "broken.json" in by_name
        assert by_name["broken.json"]["node_count"] is None
        assert by_name["valid.json"]["node_count"] == 1


class TestListUnityDialoguesSearchFields:
    """Enrichissement recherche : speakers + search_text (Story 8.2 / FR81)."""

    @staticmethod
    def _write(directory: Path, name: str, payload: object) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        (directory / name).write_text(json.dumps(payload), encoding="utf-8")

    def _item(self, client, name: str) -> dict:
        response = client.get("/api/v1/unity-dialogues")
        assert response.status_code == 200
        return next(
            d for d in response.json()["dialogues"] if d["filename"] == name
        )

    def test_speakers_unique_in_order_legacy(
        self, client, mock_config_service, tmp_path
    ):
        """speakers = valeurs `speaker` distinctes, dans l'ordre d'apparition."""
        target = tmp_path / "speakers_legacy"
        self._write(
            target,
            "s.json",
            [
                {"id": "START", "speaker": "Uresaïr", "line": "A"},
                {"id": "n1", "speaker": "Uresaïr", "line": "B"},
                {"id": "n2", "speaker": "Voknir", "line": "C"},
            ],
        )
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        item = self._item(client, "s.json")
        assert item["speakers"] == ["Uresaïr", "Voknir"]

    def test_speakers_supports_document_format(
        self, client, mock_config_service, tmp_path
    ):
        """speakers gère le format document ``{schemaVersion, nodes}``."""
        target = tmp_path / "speakers_doc"
        self._write(
            target,
            "d.json",
            {
                "schemaVersion": "1.2.0",
                "nodes": [
                    {"id": "START", "speaker": "Luna", "line": "Salut"},
                    {"id": "n1", "speaker": "Sol", "line": "Bonjour"},
                ],
            },
        )
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        item = self._item(client, "d.json")
        assert item["speakers"] == ["Luna", "Sol"]

    def test_search_text_lowercased_from_lines(
        self, client, mock_config_service, tmp_path
    ):
        """search_text concatène les répliques en minuscules."""
        target = tmp_path / "text"
        self._write(
            target,
            "t.json",
            [{"id": "START", "speaker": "X", "line": "Les FISSURES du mur"}],
        )
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        item = self._item(client, "t.json")
        assert item["search_text"] is not None
        assert "fissures" in item["search_text"]
        assert item["search_text"] == item["search_text"].lower()

    def test_search_text_bounded_to_max_chars(
        self, client, mock_config_service, tmp_path
    ):
        """search_text est borné à SEARCH_TEXT_MAX_CHARS (2000)."""
        from api.routers.unity_dialogues import SEARCH_TEXT_MAX_CHARS

        target = tmp_path / "long"
        long_line = "mot " * 1000  # ~4000 caractères
        self._write(
            target,
            "l.json",
            [{"id": "START", "speaker": "X", "line": long_line}],
        )
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        item = self._item(client, "l.json")
        assert item["search_text"] is not None
        assert len(item["search_text"]) <= SEARCH_TEXT_MAX_CHARS

    def test_no_speaker_yields_empty_list_and_text_present(
        self, client, mock_config_service, tmp_path
    ):
        """Sans `speaker`, speakers=[] mais search_text reste alimenté."""
        target = tmp_path / "nospeaker"
        self._write(
            target,
            "n.json",
            [{"id": "START", "line": "Une réplique sans personnage"}],
        )
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        item = self._item(client, "n.json")
        assert item["speakers"] == []
        assert item["search_text"] is not None
        assert "réplique" in item["search_text"]

    def test_corrupt_json_yields_null_search_fields(
        self, client, mock_config_service, tmp_path
    ):
        """Un JSON illisible → speakers/search_text None, item conservé."""
        target = tmp_path / "corrupt_search"
        target.mkdir(parents=True, exist_ok=True)
        (target / "broken.json").write_text("not valid json", encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        item = self._item(client, "broken.json")
        assert item["speakers"] is None
        assert item["search_text"] is None


class TestListUnityDialoguesOwnerFields:
    """Enrichissement auteur pour filtre FR82 (Story 8.3)."""

    def test_list_item_enriched_with_owner(
        self, client, mock_config_service, tmp_path
    ):
        """owner_id + owner_username exposés quand l'index et users résolvent."""
        from api.dependencies import (
            get_document_persistence_service,
            get_user_repository,
        )
        from services.document_persistence_service import (
            DialogueCapabilities,
            DialogueListingIndexFields,
        )

        target = tmp_path / "owned_listing"
        target.mkdir(parents=True, exist_ok=True)
        (target / "scene.json").write_text(
            json.dumps([{"id": "START", "line": "Hi"}]), encoding="utf-8"
        )
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        persistence = MagicMock()
        persistence.can_list.return_value = True
        persistence.get_listing_index_fields.return_value = DialogueListingIndexFields(
            created_at="2026-06-01 10:00:00",
            owner_id="owner-1",
        )
        persistence.capabilities.return_value = DialogueCapabilities(
            can_read=True,
            can_edit=True,
            can_delete=True,
            is_owner=True,
        )
        users = MagicMock()
        users.find_by_id.return_value = {
            "id": "owner-1",
            "username": "marc",
            "email": "marc@example.com",
            "hashed_password": "x",
            "role": "writer",
            "is_active": True,
            "created_at": "2026-01-01",
            "updated_at": "2026-01-01",
        }
        app.dependency_overrides[get_document_persistence_service] = (
            lambda: persistence
        )
        app.dependency_overrides[get_user_repository] = lambda: users
        try:
            response = client.get("/api/v1/unity-dialogues")
            assert response.status_code == 200
            item = next(
                d
                for d in response.json()["dialogues"]
                if d["filename"] == "scene.json"
            )
            assert item["owner_id"] == "owner-1"
            assert item["owner_username"] == "marc"
            assert item["created_at"] == "2026-06-01T10:00:00Z"
        finally:
            app.dependency_overrides.pop(get_document_persistence_service, None)
            app.dependency_overrides.pop(get_user_repository, None)

    def test_unindexed_dialogue_has_null_owner(
        self, client, mock_config_service, tmp_path
    ):
        """Sans entrée index, owner_id/username restent None (date via fichier)."""
        target = tmp_path / "unindexed"
        target.mkdir(parents=True, exist_ok=True)
        (target / "orphan.json").write_text(
            json.dumps([{"id": "START", "line": "X"}]), encoding="utf-8"
        )
        mock_config_service.get_unity_dialogues_path.return_value = str(target)

        response = client.get("/api/v1/unity-dialogues")
        item = next(
            d
            for d in response.json()["dialogues"]
            if d["filename"] == "orphan.json"
        )
        assert item["owner_id"] is None
        assert item["owner_username"] is None
        assert item["created_at"] is not None


class TestReadUnityDialogue:
    """Tests pour l'endpoint GET /api/v1/unity-dialogues/{filename}."""
    
    def test_read_unity_dialogue_success(self, client, mock_config_service, tmp_path, sample_unity_dialogue):
        """Test de lecture d'un dialogue Unity."""
        # Créer un dossier dédié pour éviter les conflits
        test_dir = tmp_path / "test_dialogues"
        test_dir.mkdir(parents=True, exist_ok=True)
        
        dialogue_file = test_dir / "test_dialogue.json"
        dialogue_file.write_text(json.dumps(sample_unity_dialogue), encoding="utf-8")
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.get("/api/v1/unity-dialogues/test_dialogue.json")
        
        assert response.status_code == 200
        data = response.json()
        assert "filename" in data
        assert "json_content" in data
        assert "title" in data
        assert "size_bytes" in data
        assert "modified_time" in data
        assert data["filename"] == "test_dialogue.json"
        
        # Vérifier que le contenu JSON est correct
        content = json.loads(data["json_content"])
        assert isinstance(content, list)
        assert len(content) == 2
    
    def test_read_unity_dialogue_without_extension(self, client, mock_config_service, tmp_path, sample_unity_dialogue):
        """Test de lecture avec nom de fichier sans extension."""
        test_dir = tmp_path / "test_dialogues2"
        test_dir.mkdir(parents=True, exist_ok=True)
        
        dialogue_file = test_dir / "test_dialogue.json"
        dialogue_file.write_text(json.dumps(sample_unity_dialogue), encoding="utf-8")
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.get("/api/v1/unity-dialogues/test_dialogue")
        
        assert response.status_code == 200
        data = response.json()
        assert data["filename"] == "test_dialogue.json"
    
    def test_read_unity_dialogue_not_found(self, client, mock_config_service, tmp_path):
        """Test de lecture d'un dialogue inexistant."""
        test_dir = tmp_path / "test_dialogues3"
        test_dir.mkdir(parents=True, exist_ok=True)
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.get("/api/v1/unity-dialogues/nonexistent.json")
        
        assert response.status_code == 404
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "NOT_FOUND"
    
    def test_read_unity_dialogue_path_traversal(self, client, mock_config_service):
        """Test de sécurité contre path traversal."""
        test_dir = Path("/tmp") if Path("/tmp").exists() else Path("C:/tmp")
        test_dir.mkdir(exist_ok=True)
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.get("/api/v1/unity-dialogues/../../../etc/passwd")
        
        # Le path traversal devrait être détecté et retourner 422
        # Mais FastAPI peut aussi retourner 404 si la route n'existe pas
        assert response.status_code in [404, 422]
        data = response.json()
        if response.status_code == 404:
            assert "detail" in data
        else:
            assert "error" in data
            assert data["error"]["code"] == "VALIDATION_ERROR"
    
    def test_read_unity_dialogue_invalid_json(self, client, mock_config_service, tmp_path):
        """Test de lecture d'un fichier JSON invalide."""
        test_dir = tmp_path / "test_dialogues4"
        test_dir.mkdir(parents=True, exist_ok=True)
        
        invalid_file = test_dir / "invalid.json"
        invalid_file.write_text("not valid json", encoding="utf-8")
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.get("/api/v1/unity-dialogues/invalid.json")
        
        # Le fichier existe mais JSON invalide devrait retourner 422
        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "VALIDATION_ERROR"
    
    def test_read_unity_dialogue_not_array(self, client, mock_config_service, tmp_path):
        """Test de lecture d'un JSON qui n'est pas un tableau."""
        test_dir = tmp_path / "test_dialogues5"
        test_dir.mkdir(parents=True, exist_ok=True)
        
        invalid_file = test_dir / "not_array.json"
        invalid_file.write_text(json.dumps({"not": "an array"}), encoding="utf-8")
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.get("/api/v1/unity-dialogues/not_array.json")
        
        # JSON valide mais pas un tableau devrait retourner 422
        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "VALIDATION_ERROR"

    def test_read_unity_dialogue_document_format(self, client, mock_config_service, tmp_path, sample_unity_dialogue):
        """GET accepte le format document (schemaVersion + nodes) et renvoie la liste des nœuds (ADR-008)."""
        test_dir = tmp_path / "test_dialogues_doc_format"
        test_dir.mkdir(parents=True, exist_ok=True)
        doc_file = test_dir / "document_format.json"
        document = {"schemaVersion": "1.1.0", "nodes": sample_unity_dialogue}
        doc_file.write_text(json.dumps(document), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        response = client.get("/api/v1/unity-dialogues/document_format.json")
        assert response.status_code == 200
        data = response.json()
        assert "json_content" in data
        content = json.loads(data["json_content"])
        assert isinstance(content, list)
        assert len(content) == len(sample_unity_dialogue)
        assert content[0].get("id") == "START"

    def test_read_unity_dialogue_path_not_configured(self, client, mock_config_service):
        """Test avec chemin Unity non configuré."""
        mock_config_service.get_unity_dialogues_path.return_value = None
        
        response = client.get("/api/v1/unity-dialogues/test.json")
        
        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "VALIDATION_ERROR"


class TestDeleteUnityDialogue:
    """Tests pour l'endpoint DELETE /api/v1/unity-dialogues/{filename}."""
    
    def test_delete_unity_dialogue_success(self, client, mock_config_service, tmp_path, sample_unity_dialogue):
        """Test de suppression d'un dialogue Unity."""
        test_dir = tmp_path / "test_delete"
        test_dir.mkdir(parents=True, exist_ok=True)
        
        dialogue_file = test_dir / "to_delete.json"
        dialogue_file.write_text(json.dumps(sample_unity_dialogue), encoding="utf-8")
        
        assert dialogue_file.exists()
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.delete("/api/v1/unity-dialogues/to_delete.json")
        
        assert response.status_code == 204
        assert not dialogue_file.exists()
    
    def test_delete_unity_dialogue_without_extension(self, client, mock_config_service, tmp_path, sample_unity_dialogue):
        """Test de suppression avec nom de fichier sans extension."""
        test_dir = tmp_path / "test_delete2"
        test_dir.mkdir(parents=True, exist_ok=True)
        
        dialogue_file = test_dir / "to_delete.json"
        dialogue_file.write_text(json.dumps(sample_unity_dialogue), encoding="utf-8")
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.delete("/api/v1/unity-dialogues/to_delete")
        
        assert response.status_code == 204
        assert not dialogue_file.exists()
    
    def test_delete_unity_dialogue_not_found(self, client, mock_config_service, tmp_path):
        """Test de suppression d'un dialogue inexistant."""
        test_dir = tmp_path / "test_delete3"
        test_dir.mkdir(parents=True, exist_ok=True)
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.delete("/api/v1/unity-dialogues/nonexistent.json")
        
        assert response.status_code == 404
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "NOT_FOUND"
    
    def test_delete_unity_dialogue_path_traversal(self, client, mock_config_service):
        """Test de sécurité contre path traversal."""
        test_dir = Path("/tmp") if Path("/tmp").exists() else Path("C:/tmp")
        test_dir.mkdir(exist_ok=True)
        
        mock_config_service.get_unity_dialogues_path.return_value = str(test_dir)
        
        response = client.delete("/api/v1/unity-dialogues/../../../etc/passwd")
        
        # Le path traversal devrait être détecté et retourner 422
        # Certaines plateformes peuvent normaliser vers /etc/passwd (405 sur méthode)
        assert response.status_code in [404, 405, 422]
        data = response.json()
        if response.status_code in [404, 405]:
            assert "detail" in data
        else:
            assert "error" in data
            assert data["error"]["code"] == "VALIDATION_ERROR"
        if response.status_code == 422:
            data = response.json()
            assert "detail" in data
    
    def test_delete_unity_dialogue_path_not_configured(self, client, mock_config_service):
        """Test avec chemin Unity non configuré."""
        mock_config_service.get_unity_dialogues_path.return_value = None
        
        response = client.delete("/api/v1/unity-dialogues/test.json")
        
        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "VALIDATION_ERROR"

    def test_delete_unity_dialogue_also_deletes_layout_and_seq(
        self, client, mock_config_service, tmp_path, sample_unity_dialogue
    ):
        """Suppression d'un dialogue supprime aussi son layout (Assets/Layouts) et le fichier .seq."""
        dialogue_dir = tmp_path / "Dialogue"
        dialogue_dir.mkdir(parents=True, exist_ok=True)
        layouts_dir = tmp_path / "Layouts"
        layouts_dir.mkdir(parents=True, exist_ok=True)

        doc_id = "to_delete"
        dialogue_file = dialogue_dir / f"{doc_id}.json"
        dialogue_file.write_text(json.dumps(sample_unity_dialogue), encoding="utf-8")
        layout_file = layouts_dir / f"{doc_id}.layout.json"
        layout_file.write_text(json.dumps({"nodes": {"START": {"x": 0, "y": 0}}}), encoding="utf-8")
        layout_meta = layouts_dir / f"{doc_id}.layout.meta"
        layout_meta.write_text(json.dumps({"revision": 1}), encoding="utf-8")
        seq_file = dialogue_dir / f"{doc_id}.seq"
        seq_file.write_text("1", encoding="utf-8")

        mock_config_service.get_unity_dialogues_path.return_value = dialogue_dir
        mock_config_service.get_unity_layouts_path.return_value = layouts_dir

        response = client.delete(f"/api/v1/unity-dialogues/{doc_id}.json")

        assert response.status_code == 204
        assert not dialogue_file.exists()
        assert not layout_file.exists()
        assert not layout_meta.exists()
        assert not seq_file.exists()


class TestPreviewUnityDialogue:
    """Tests pour l'endpoint POST /api/v1/unity-dialogues/preview."""
    
    def test_preview_unity_dialogue_success(self, client, sample_unity_dialogue):
        """Test de preview d'un dialogue Unity."""
        response = client.post(
            "/api/v1/unity-dialogues/preview",
            json={"json_content": json.dumps(sample_unity_dialogue)}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "preview_text" in data
        assert "node_count" in data
        assert data["node_count"] == 2
        assert "TEST_NPC" in data["preview_text"]
        assert "Bonjour" in data["preview_text"]
        assert "Je vais bien" in data["preview_text"]
    
    def test_preview_unity_dialogue_invalid_json(self, client):
        """Test de preview avec JSON invalide."""
        response = client.post(
            "/api/v1/unity-dialogues/preview",
            json={"json_content": "not valid json"}
        )
        
        # Le JSON invalide devrait retourner 422
        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "VALIDATION_ERROR"
    
    def test_preview_unity_dialogue_not_array(self, client):
        """Test de preview avec JSON qui n'est pas un tableau."""
        response = client.post(
            "/api/v1/unity-dialogues/preview",
            json={"json_content": json.dumps({"not": "an array"})}
        )
        
        # JSON valide mais pas un tableau devrait retourner 422
        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert data["error"]["code"] == "VALIDATION_ERROR"
    
    def test_preview_unity_dialogue_empty_array(self, client):
        """Test de preview avec tableau vide."""
        response = client.post(
            "/api/v1/unity-dialogues/preview",
            json={"json_content": json.dumps([])}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["node_count"] == 0
        assert "preview_text" in data
    
    def test_preview_unity_dialogue_with_choices(self, client):
        """Test de preview avec choix."""
        dialogue_with_choices = [
            {
                "id": "START",
                "speaker": "NPC",
                "line": "Choose your path",
                "choices": [
                    {"text": "Path A", "targetNode": "nodeA"},
                    {"text": "Path B", "targetNode": "nodeB"}
                ]
            }
        ]
        
        response = client.post(
            "/api/v1/unity-dialogues/preview",
            json={"json_content": json.dumps(dialogue_with_choices)}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "Path A" in data["preview_text"]
        assert "Path B" in data["preview_text"]
        assert "nodeA" in data["preview_text"] or "nodeB" in data["preview_text"]
    
    def test_preview_unity_dialogue_with_next_node(self, client):
        """Test de preview avec nextNode."""
        dialogue_with_next = [
            {
                "id": "START",
                "speaker": "NPC",
                "line": "Continue",
                "nextNode": "node1"
            }
        ]
        
        response = client.post(
            "/api/v1/unity-dialogues/preview",
            json={"json_content": json.dumps(dialogue_with_next)}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "node1" in data["preview_text"]
        assert "Suivant" in data["preview_text"] or "nextNode" in data["preview_text"].lower()
