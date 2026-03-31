"""Tests pour les endpoints GET/PUT /api/v1/documents (Story 16.2)."""
import json
import pytest
from pathlib import Path
from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from api.main import app
from api.dependencies import get_config_service
from api.exceptions import NotFoundException, ValidationException


@pytest.fixture
def mock_config_service():
    """Mock du ConfigurationService."""
    from services.configuration_service import ConfigurationService
    mock = MagicMock(spec=ConfigurationService)
    return mock


@pytest.fixture
def client(mock_config_service):
    """Client de test avec config mockée."""
    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    yield TestClient(app)
    app.dependency_overrides.clear()


def _doc_v1_1_0():
    """Document canonique v1.1.0 (schemaVersion, nodes)."""
    return {
        "schemaVersion": "1.1.0",
        "nodes": [
            {"id": "START", "speaker": "NPC", "line": "Hello", "nextNode": "END"},
        ],
    }


class TestGetDocument:
    """Tests GET /api/v1/documents/{id} (AC1)."""

    def test_get_document_returns_document_schema_version_revision(
        self, client, mock_config_service, tmp_path
    ):
        """GET retourne document, schemaVersion, revision (AC1)."""
        doc_id = "my-dialogue"
        doc = _doc_v1_1_0()
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
        (tmp_path / f"{doc_id}.meta").write_text(
            json.dumps({"revision": 3, "updated_at": "2026-01-30T12:00:00Z"}),
            encoding="utf-8",
        )
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        response = client.get(f"/api/v1/documents/{doc_id}")

        assert response.status_code == 200
        data = response.json()
        assert "document" in data
        assert data["document"] == doc
        assert data["schemaVersion"] == "1.1.0"
        assert data["revision"] == 3

    def test_get_document_serves_persisted_blob_only(
        self, client, mock_config_service, tmp_path
    ):
        """Backend ne reconstruit pas le document ; sert le blob persisté (AC1)."""
        doc_id = "blob-only"
        doc = {"schemaVersion": "1.1.0", "nodes": [{"id": "A", "line": "Only node"}]}
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        response = client.get(f"/api/v1/documents/{doc_id}")

        assert response.status_code == 200
        assert response.json()["document"] == doc

    def test_get_document_no_meta_defaults_revision_one(
        self, client, mock_config_service, tmp_path
    ):
        """Sans .meta, revision vaut 1."""
        doc_id = "no-meta"
        doc = _doc_v1_1_0()
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        response = client.get(f"/api/v1/documents/{doc_id}")

        assert response.status_code == 200
        assert response.json()["revision"] == 1

    def test_get_document_not_found_404(self, client, mock_config_service, tmp_path):
        """GET document inexistant → 404."""
        tmp_path.mkdir(parents=True, exist_ok=True)
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        response = client.get("/api/v1/documents/nonexistent-id")

        assert response.status_code == 404

    def test_get_document_path_traversal_rejected(self, client, mock_config_service):
        """Id contenant '..' → 422 (validation)."""
        mock_config_service.get_unity_dialogues_path.return_value = Path("/any")
        # Encoder ".." pour que le path ne soit pas normalisé (document_id reçu = "..")
        response = client.get("/api/v1/documents/%2e%2e")
        assert response.status_code == 422

    def test_get_document_empty_id_returns_422(self, client, mock_config_service):
        """GET avec document_id vide après strip (ex. espaces) → 422 (AC1, validation)."""
        mock_config_service.get_unity_dialogues_path.return_value = Path("/any")
        # document_id = "   " → _safe_document_id retourne "" → ValidationException
        response = client.get("/api/v1/documents/%20%20%20")
        assert response.status_code == 422

    def test_get_document_v1_1_0_without_choice_id_returns_422(self, client, mock_config_service, tmp_path):
        """GET document v1.1.0 avec au moins un choice sans choiceId → 422, corps missing_choice_id (Story 16.5, AC3)."""
        doc_id = "needs-migration"
        doc = {
            "schemaVersion": "1.1.0",
            "nodes": [
                {
                    "id": "START",
                    "line": "Hello",
                    "choices": [{"text": "OK", "targetNode": "END"}],
                },
            ],
        }
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        response = client.get(f"/api/v1/documents/{doc_id}")

        assert response.status_code == 422
        data = response.json()
        assert "error" in data
        assert data["error"].get("code") == "missing_choice_id"
        assert "path" in data["error"].get("details", {})

    def test_get_document_raw_array_normalized_and_returned_200(
        self, client, mock_config_service, tmp_path
    ):
        """GET avec fichier tableau Unity brut (sans schemaVersion) → 200, document normalisé (évite 500)."""
        doc_id = "legacy-array"
        raw_array = [
            {
                "id": "START",
                "speaker": "NPC",
                "line": "Hello",
                "choices": [{"text": "OK", "targetNode": "END"}],
            }
        ]
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(raw_array), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        response = client.get(f"/api/v1/documents/{doc_id}")

        assert response.status_code == 200
        data = response.json()
        assert data["document"]["schemaVersion"] == "1.1.0"
        assert data["document"]["nodes"] == raw_array
        assert data["schemaVersion"] == "1.1.0"


class TestCheckMigration:
    """Tests GET /api/v1/documents/check-migration (CI / pre-commit gate)."""

    def test_check_migration_no_path_returns_empty(self, client, mock_config_service):
        """Sans chemin Unity configuré, retourne needsMigration vide."""
        mock_config_service.get_unity_dialogues_path.return_value = None

        response = client.get("/api/v1/documents/check-migration")

        assert response.status_code == 200
        assert response.json()["needsMigration"] == []

    def test_check_migration_lists_docs_without_choice_id(
        self, client, mock_config_service, tmp_path
    ):
        """Liste les documents v1.1.0 ayant au moins un choice sans choiceId."""
        (tmp_path / "ok-doc.json").write_text(
            json.dumps(
                {
                    "schemaVersion": "1.1.0",
                    "nodes": [
                        {
                            "id": "START",
                            "line": "Hi",
                            "choices": [{"choiceId": "yes", "text": "Yes", "targetNode": "END"}],
                        },
                    ],
                }
            ),
            encoding="utf-8",
        )
        (tmp_path / "needs-migration.json").write_text(
            json.dumps(
                {
                    "schemaVersion": "1.1.0",
                    "nodes": [
                        {
                            "id": "START",
                            "line": "Hi",
                            "choices": [{"text": "OK", "targetNode": "END"}],
                        },
                    ],
                }
            ),
            encoding="utf-8",
        )
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        response = client.get("/api/v1/documents/check-migration")

        assert response.status_code == 200
        data = response.json()
        assert len(data["needsMigration"]) == 1
        assert data["needsMigration"][0]["documentId"] == "needs-migration"
        assert "nodes" in data["needsMigration"][0]["path"] and "choices" in data["needsMigration"][0]["path"]


class TestPutDocument:
    """Tests PUT /api/v1/documents/{id} (AC2)."""

    def test_put_document_success_returns_revision_and_validation_report(
        self, client, mock_config_service, tmp_path
    ):
        """PUT document valide + revision à jour → 200, revision, validationReport."""
        doc_id = "my-doc"
        doc = _doc_v1_1_0()
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
        (tmp_path / f"{doc_id}.meta").write_text(
            json.dumps({"revision": 2, "updated_at": "2026-01-30T12:00:00Z"}),
            encoding="utf-8",
        )
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        updated = {"schemaVersion": "1.1.0", "nodes": [{"id": "START", "line": "Updated", "nextNode": "END"}]}
        response = client.put(
            f"/api/v1/documents/{doc_id}",
            json={"document": updated, "revision": 2},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["revision"] == 3
        assert "validationReport" in data
        # Document persisté
        with open(tmp_path / f"{doc_id}.json", encoding="utf-8") as f:
            persisted = json.load(f)
        assert persisted == updated
        meta = json.loads((tmp_path / f"{doc_id}.meta").read_text(encoding="utf-8"))
        assert meta["revision"] == 3

    def test_put_document_conflict_409_returns_last_state(
        self, client, mock_config_service, tmp_path
    ):
        """PUT avec revision obsolète → 409 + dernier état (document, schemaVersion, revision)."""
        doc_id = "conflict-doc"
        current_doc = _doc_v1_1_0()
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(current_doc), encoding="utf-8")
        (tmp_path / f"{doc_id}.meta").write_text(
            json.dumps({"revision": 5, "updated_at": "2026-01-30T12:00:00Z"}),
            encoding="utf-8",
        )
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        response = client.put(
            f"/api/v1/documents/{doc_id}",
            json={"document": {"schemaVersion": "1.1.0", "nodes": []}, "revision": 3},
        )

        assert response.status_code == 409
        data = response.json()
        assert data["document"] == current_doc
        assert data["schemaVersion"] == "1.1.0"
        assert data["revision"] == 5
        # Document inchangé sur disque
        with open(tmp_path / f"{doc_id}.json", encoding="utf-8") as f:
            assert json.load(f) == current_doc

    def test_put_document_concurrent_two_put_same_revision_first_200_second_409(
        self, client, mock_config_service, tmp_path
    ):
        """Story 16.6 AC3: deux PUT même revision → premier 200, second 409 + dernier état (document, revision)."""
        doc_id = "concurrent-doc"
        doc_v1 = _doc_v1_1_0()
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc_v1), encoding="utf-8")
        (tmp_path / f"{doc_id}.meta").write_text(
            json.dumps({"revision": 2, "updated_at": "2026-01-30T12:00:00Z"}),
            encoding="utf-8",
        )
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        doc_a = {"schemaVersion": "1.1.0", "nodes": [{"id": "START", "line": "Client A", "nextNode": "END"}]}
        doc_b = {"schemaVersion": "1.1.0", "nodes": [{"id": "START", "line": "Client B", "nextNode": "END"}]}

        r1 = client.put(f"/api/v1/documents/{doc_id}", json={"document": doc_a, "revision": 2})
        assert r1.status_code == 200
        assert r1.json()["revision"] == 3

        r2 = client.put(f"/api/v1/documents/{doc_id}", json={"document": doc_b, "revision": 2})
        assert r2.status_code == 409
        data2 = r2.json()
        assert data2["revision"] == 3
        assert "document" in data2
        assert data2["document"]["nodes"][0]["line"] == "Client A"
        assert data2["schemaVersion"] == "1.1.0"

    def test_put_document_after_409_client_can_reload_and_retry(
        self, client, mock_config_service, tmp_path
    ):
        """Story 16.6 AC3: client en 409 peut GET document + GET layout puis PUT avec revision reçue → 200."""
        doc_id = "retry-doc"
        current = {"schemaVersion": "1.1.0", "nodes": [{"id": "START", "line": "Current", "nextNode": "END"}]}
        layout = {"nodes": {"START": {"x": 10, "y": 20}}}
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(current), encoding="utf-8")
        (tmp_path / f"{doc_id}.meta").write_text(
            json.dumps({"revision": 4, "updated_at": "2026-01-30T12:00:00Z"}),
            encoding="utf-8",
        )
        layout_dir = tmp_path / "Layouts"
        layout_dir.mkdir(parents=True, exist_ok=True)
        (layout_dir / f"{doc_id}.layout.json").write_text(json.dumps(layout), encoding="utf-8")
        (layout_dir / f"{doc_id}.layout.meta").write_text(
            json.dumps({"revision": 2, "updated_at": "2026-01-30T12:00:00Z"}),
            encoding="utf-8",
        )
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path
        mock_config_service.get_unity_layouts_path.return_value = layout_dir

        stale_put = client.put(
            f"/api/v1/documents/{doc_id}",
            json={"document": {"schemaVersion": "1.1.0", "nodes": [{"id": "START", "line": "Stale", "nextNode": "END"}]}, "revision": 2},
        )
        assert stale_put.status_code == 409
        conflict_body = stale_put.json()
        received_revision = conflict_body["revision"]
        received_doc = conflict_body["document"]

        get_doc = client.get(f"/api/v1/documents/{doc_id}")
        assert get_doc.status_code == 200
        assert get_doc.json()["revision"] == received_revision
        get_layout = client.get(f"/api/v1/documents/{doc_id}/layout")
        assert get_layout.status_code == 200

        updated = {**received_doc, "nodes": [{**received_doc["nodes"][0], "line": "Retry OK"}]}
        retry = client.put(
            f"/api/v1/documents/{doc_id}",
            json={"document": updated, "revision": received_revision},
        )
        assert retry.status_code == 200
        assert retry.json()["revision"] == 5

    def test_put_document_new_creates_with_revision_one(
        self, client, mock_config_service, tmp_path
    ):
        """PUT sur document inexistant crée avec revision 1."""
        tmp_path.mkdir(parents=True, exist_ok=True)
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path
        doc = _doc_v1_1_0()

        response = client.put(
            "/api/v1/documents/new-doc",
            json={"document": doc, "revision": 1},
        )

        assert response.status_code == 200
        assert response.json()["revision"] == 1
        assert (tmp_path / "new-doc.json").exists()
        assert (tmp_path / "new-doc.meta").exists()
        assert json.loads((tmp_path / "new-doc.json").read_text(encoding="utf-8")) == doc

    def test_put_document_new_wrong_revision_returns_409(
        self, client, mock_config_service, tmp_path
    ):
        """Création (fichier absent) : revision doit être 1, aligné sur PUT layout (409 sinon)."""
        tmp_path.mkdir(parents=True, exist_ok=True)
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path
        doc = _doc_v1_1_0()

        response = client.put(
            "/api/v1/documents/brand-new-id",
            json={"document": doc, "revision": 2},
        )

        assert response.status_code == 409
        body = response.json()
        assert body["revision"] == 1
        assert not (tmp_path / "brand-new-id.json").exists()

    def test_put_document_nodes_edges_payload_rejected_400(
        self, client, mock_config_service, tmp_path
    ):
        """PUT avec body nodes/edges (ancien contrat) → 400, erreur structurée (AC3)."""
        tmp_path.mkdir(parents=True, exist_ok=True)
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path
        graph_payload = {
            "nodes": [{"id": "n1", "data": {}}],
            "edges": [{"source": "n1", "target": "n2"}],
        }

        response = client.put(
            "/api/v1/documents/any-id",
            json={"document": graph_payload, "revision": 1},
        )

        assert response.status_code == 400
        data = response.json()
        # Réponse structurée : top-level ou sous "error"
        assert "detail" in data or "code" in data or "message" in data or "error" in data
        if "error" in data:
            assert "code" in data["error"] or "message" in data["error"]


class TestPutDocumentDraftVsExport:
    """Tests PUT modes draft vs export (AC4)."""

    def _doc_with_missing_choice_id(self):
        """Document v1.1.0 avec un choice sans choiceId → validation échoue en export."""
        return {
            "schemaVersion": "1.1.0",
            "nodes": [
                {
                    "id": "START",
                    "line": "Hello",
                    "choices": [
                        {"text": "OK", "targetNode": "END"},
                    ],
                },
            ],
        }

    def test_put_draft_mode_rejects_v1_1_0_without_choice_id_400(
        self, client, mock_config_service, tmp_path
    ):
        """Mode draft : document v1.1.0 sans choiceId refusé (Story 16.5 AC3, non contournable en draft)."""
        tmp_path.mkdir(parents=True, exist_ok=True)
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path
        doc = self._doc_with_missing_choice_id()

        response = client.put(
            "/api/v1/documents/draft-doc",
            json={"document": doc, "revision": 1, "validationMode": "draft"},
        )

        assert response.status_code == 400
        data = response.json()
        assert "validationReport" in data
        assert len(data["validationReport"]) > 0
        assert not (tmp_path / "draft-doc.json").exists()

    def test_put_export_mode_rejects_on_validation_failure_400(
        self, client, mock_config_service, tmp_path
    ):
        """Mode export : validation échoue → 400 + validationReport, pas de persistance."""
        tmp_path.mkdir(parents=True, exist_ok=True)
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path
        doc = self._doc_with_missing_choice_id()

        response = client.put(
            "/api/v1/documents/export-doc",
            json={"document": doc, "revision": 1, "validationMode": "export"},
        )

        assert response.status_code == 400
        data = response.json()
        assert "validationReport" in data
        assert len(data["validationReport"]) > 0
        assert not (tmp_path / "export-doc.json").exists()

    def test_put_export_mode_header_overrides_body(
        self, client, mock_config_service, tmp_path
    ):
        """Header X-Validation-Mode: export override body validationMode."""
        tmp_path.mkdir(parents=True, exist_ok=True)
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path
        doc = self._doc_with_missing_choice_id()

        response = client.put(
            "/api/v1/documents/header-doc",
            json={"document": doc, "revision": 1, "validationMode": "draft"},
            headers={"X-Validation-Mode": "export"},
        )

        assert response.status_code == 400
        assert "validationReport" in response.json()
        assert not (tmp_path / "header-doc.json").exists()


class TestGetLayout:
    """Tests GET /api/v1/documents/{id}/layout (Story 16.3, AC1)."""

    def test_get_layout_returns_layout_and_revision_200(
        self, client, mock_config_service, tmp_path
    ):
        """GET layout existant → 200, layout + revision."""
        doc_id = "my-dialogue"
        doc = _doc_v1_1_0()
        layout = {"viewport": {"x": 0, "y": 0, "zoom": 1}, "nodes": []}
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
        layout_dir = tmp_path / "Layouts"
        layout_dir.mkdir(parents=True, exist_ok=True)
        (layout_dir / f"{doc_id}.layout.json").write_text(
            json.dumps(layout), encoding="utf-8"
        )
        (layout_dir / f"{doc_id}.layout.meta").write_text(
            json.dumps({"revision": 2, "updated_at": "2026-01-30T12:00:00Z"}),
            encoding="utf-8",
        )
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path
        mock_config_service.get_unity_layouts_path.return_value = layout_dir

        response = client.get(f"/api/v1/documents/{doc_id}/layout")

        assert response.status_code == 200
        data = response.json()
        assert data["layout"] == layout
        assert data["revision"] == 2

    def test_get_layout_document_absent_404(
        self, client, mock_config_service, tmp_path
    ):
        """GET layout pour document inexistant → 404."""
        tmp_path.mkdir(parents=True, exist_ok=True)
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        response = client.get("/api/v1/documents/nonexistent-id/layout")

        assert response.status_code == 404

    def test_get_layout_layout_absent_404(
        self, client, mock_config_service, tmp_path
    ):
        """GET layout pour document existant mais layout inexistant → 404."""
        doc_id = "doc-no-layout"
        doc = _doc_v1_1_0()
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
        layout_dir = tmp_path / "Layouts"
        layout_dir.mkdir(parents=True, exist_ok=True)
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path
        mock_config_service.get_unity_layouts_path.return_value = layout_dir

        response = client.get(f"/api/v1/documents/{doc_id}/layout")

        assert response.status_code == 404

    def test_get_layout_no_meta_defaults_revision_one(
        self, client, mock_config_service, tmp_path
    ):
        """Layout sans .layout.meta → revision 1."""
        doc_id = "layout-no-meta"
        doc = _doc_v1_1_0()
        layout = {}
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
        layout_dir = tmp_path / "Layouts"
        layout_dir.mkdir(parents=True, exist_ok=True)
        (layout_dir / f"{doc_id}.layout.json").write_text(
            json.dumps(layout), encoding="utf-8"
        )
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path
        mock_config_service.get_unity_layouts_path.return_value = layout_dir

        response = client.get(f"/api/v1/documents/{doc_id}/layout")

        assert response.status_code == 200
        assert response.json()["revision"] == 1
        assert response.json()["layout"] == layout


class TestPutLayout:
    """Tests PUT /api/v1/documents/{id}/layout (Story 16.3, AC1)."""

    def test_put_layout_success_returns_revision_200(
        self, client, mock_config_service, tmp_path
    ):
        """PUT layout valide + revision à jour → 200, revision."""
        doc_id = "my-dialogue"
        doc = _doc_v1_1_0()
        layout = {"viewport": {"x": 0, "y": 0, "zoom": 1}}
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
        layout_dir = tmp_path / "Layouts"
        layout_dir.mkdir(parents=True, exist_ok=True)
        (layout_dir / f"{doc_id}.layout.json").write_text(
            json.dumps(layout), encoding="utf-8"
        )
        (layout_dir / f"{doc_id}.layout.meta").write_text(
            json.dumps({"revision": 2, "updated_at": "2026-01-30T12:00:00Z"}),
            encoding="utf-8",
        )
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path
        mock_config_service.get_unity_layouts_path.return_value = layout_dir

        updated_layout = {"viewport": {"x": 10, "y": 10, "zoom": 1.2}}
        response = client.put(
            f"/api/v1/documents/{doc_id}/layout",
            json={"layout": updated_layout, "revision": 2},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["revision"] == 3
        persisted = json.loads(
            (layout_dir / f"{doc_id}.layout.json").read_text(encoding="utf-8")
        )
        assert persisted == updated_layout
        meta = json.loads(
            (layout_dir / f"{doc_id}.layout.meta").read_text(encoding="utf-8")
        )
        assert meta["revision"] == 3

    def test_put_layout_conflict_409_returns_last_state(
        self, client, mock_config_service, tmp_path
    ):
        """PUT layout avec revision obsolète → 409 + dernier état (layout, revision)."""
        doc_id = "conflict-layout"
        doc = _doc_v1_1_0()
        current_layout = {"viewport": {"x": 0, "y": 0, "zoom": 1}}
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
        layout_dir = tmp_path / "Layouts"
        layout_dir.mkdir(parents=True, exist_ok=True)
        (layout_dir / f"{doc_id}.layout.json").write_text(
            json.dumps(current_layout), encoding="utf-8"
        )
        (layout_dir / f"{doc_id}.layout.meta").write_text(
            json.dumps({"revision": 5, "updated_at": "2026-01-30T12:00:00Z"}),
            encoding="utf-8",
        )
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path
        mock_config_service.get_unity_layouts_path.return_value = layout_dir

        response = client.put(
            f"/api/v1/documents/{doc_id}/layout",
            json={"layout": {"viewport": {"x": 99, "y": 99}}, "revision": 3},
        )

        assert response.status_code == 409
        data = response.json()
        assert data["layout"] == current_layout
        assert data["revision"] == 5
        persisted = json.loads(
            (layout_dir / f"{doc_id}.layout.json").read_text(encoding="utf-8")
        )
        assert persisted == current_layout

    def test_put_layout_document_absent_404(
        self, client, mock_config_service, tmp_path
    ):
        """PUT layout pour document inexistant → 404."""
        tmp_path.mkdir(parents=True, exist_ok=True)
        layout_dir = tmp_path / "Layouts"
        layout_dir.mkdir(parents=True, exist_ok=True)
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path
        mock_config_service.get_unity_layouts_path.return_value = layout_dir

        response = client.put(
            "/api/v1/documents/nonexistent-id/layout",
            json={"layout": {}, "revision": 1},
        )

        assert response.status_code == 404

    def test_put_layout_new_creates_with_revision_one(
        self, client, mock_config_service, tmp_path
    ):
        """PUT layout sur document existant sans layout crée avec revision 1."""
        doc_id = "doc-no-layout"
        doc = _doc_v1_1_0()
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
        layout_dir = tmp_path / "Layouts"
        layout_dir.mkdir(parents=True, exist_ok=True)
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path
        mock_config_service.get_unity_layouts_path.return_value = layout_dir
        layout = {"viewport": {"x": 0, "y": 0, "zoom": 1}}

        response = client.put(
            f"/api/v1/documents/{doc_id}/layout",
            json={"layout": layout, "revision": 1},
        )

        assert response.status_code == 200
        assert response.json()["revision"] == 1
        assert (layout_dir / f"{doc_id}.layout.json").exists()
        assert (layout_dir / f"{doc_id}.layout.meta").exists()
        persisted = json.loads(
            (layout_dir / f"{doc_id}.layout.json").read_text(encoding="utf-8")
        )
        assert persisted == layout

    def test_put_layout_new_with_wrong_revision_returns_409(
        self, client, mock_config_service, tmp_path
    ):
        """PUT layout pour document existant sans layout, revision != 1 → 409 + {layout: {}, revision: 1}."""
        doc_id = "doc-no-layout-yet"
        doc = _doc_v1_1_0()
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
        layout_dir = tmp_path / "Layouts"
        layout_dir.mkdir(parents=True, exist_ok=True)
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path
        mock_config_service.get_unity_layouts_path.return_value = layout_dir

        response = client.put(
            f"/api/v1/documents/{doc_id}/layout",
            json={"layout": {"viewport": {"x": 0, "y": 0}}, "revision": 2},
        )

        assert response.status_code == 409
        data = response.json()
        assert data["layout"] == {}
        assert data["revision"] == 1
        assert not (layout_dir / f"{doc_id}.layout.json").exists()
