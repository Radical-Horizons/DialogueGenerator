"""Tests PUT document avec champ dialogueFlags (Story 9.1)."""
import json
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service, get_dialogue_flags_service
from api.main import app
from services.configuration_service import ConfigurationService
from services.dialogue_flags_service import DialogueFlagsService
from services.flag_catalog_service import FlagCatalogService


@pytest.fixture
def mock_config_service():
    mock = MagicMock(spec=ConfigurationService)
    return mock


@pytest.fixture
def client(mock_config_service, tmp_path):
    csv_path = tmp_path / "FlagCatalog.csv"
    csv_path.write_text(
        (
            "Id,Type,Category,Label,Description,DefaultValue,Tags,IsFavorite,"
            "Scope,MinValue,MaxValue,EnumValues\n"
            "TF_BOOL,bool,Event,T,,false,,,,,,,\n"
            "TF_INT,int,Stat,T,,5,,,,0,10,,\n"
            "TF_ENUM,string,Choice,T,,a,,,,,,,a;b\n"
        ),
        encoding="utf-8",
    )

    def _dfs():
        return DialogueFlagsService(FlagCatalogService(csv_path=csv_path))

    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    app.dependency_overrides[get_dialogue_flags_service] = _dfs
    yield TestClient(app)
    app.dependency_overrides.clear()


def _minimal_doc():
    return {
        "schemaVersion": "1.1.0",
        "nodes": [{"id": "START", "line": "Hello", "nextNode": "END"}],
    }


class TestDocumentsDialogueFlags:
    """Persistance dialogueFlags via PUT document."""

    def test_put_without_dialogue_flags_stable(self, client, mock_config_service, tmp_path):
        doc_id = "flags-none"
        doc = _minimal_doc()
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
        (tmp_path / f"{doc_id}.meta").write_text(
            json.dumps({"revision": 2}),
            encoding="utf-8",
        )
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        updated = _minimal_doc()
        r = client.put(
            f"/api/v1/documents/{doc_id}",
            json={"document": updated, "revision": 2},
        )
        assert r.status_code == 200
        assert r.json().get("flagThresholdWarnings") == []

    def test_put_normalizes_dialogue_flags(self, client, mock_config_service, tmp_path):
        doc_id = "flags-ok"
        doc = _minimal_doc()
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
        (tmp_path / f"{doc_id}.meta").write_text(json.dumps({"revision": 2}), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        payload_doc = {
            **_minimal_doc(),
            "dialogueFlags": [{"flagId": "TF_BOOL", "type": "bool", "initialValue": True}],
        }
        r = client.put(
            f"/api/v1/documents/{doc_id}",
            json={"document": payload_doc, "revision": 2},
        )
        assert r.status_code == 200
        persisted = json.loads((tmp_path / f"{doc_id}.json").read_text(encoding="utf-8"))
        assert persisted["dialogueFlags"] == [
            {"flagId": "TF_BOOL", "type": "bool", "initialValue": True}
        ]

        get_r = client.get(f"/api/v1/documents/{doc_id}")
        assert get_r.status_code == 200
        assert get_r.json()["document"]["dialogueFlags"] == persisted["dialogueFlags"]

    def test_put_invalid_flag_value_422(self, client, mock_config_service, tmp_path):
        doc_id = "flags-bad"
        doc = _minimal_doc()
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(doc), encoding="utf-8")
        (tmp_path / f"{doc_id}.meta").write_text(json.dumps({"revision": 2}), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        payload_doc = {
            **_minimal_doc(),
            "dialogueFlags": [{"flagId": "TF_INT", "type": "compteur", "initialValue": 999}],
        }
        r = client.put(
            f"/api/v1/documents/{doc_id}",
            json={"document": payload_doc, "revision": 2},
        )
        assert r.status_code == 422
