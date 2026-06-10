"""Tests PUT document avec visibilityConditions (Story 9.2)."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import (
    get_config_service,
    get_dialogue_flags_service,
    get_visibility_condition_validation_service,
)
from api.main import app
from services.configuration_service import ConfigurationService
from services.dialogue_flags_service import DialogueFlagsService
from services.flag_catalog_service import FlagCatalogService
from services.visibility_condition_validation import VisibilityConditionValidationService


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
        ),
        encoding="utf-8",
    )

    def _dfs():
        return DialogueFlagsService(FlagCatalogService(csv_path=csv_path))

    def _vis():
        return VisibilityConditionValidationService(FlagCatalogService(csv_path=csv_path))

    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    app.dependency_overrides[get_dialogue_flags_service] = _dfs
    app.dependency_overrides[get_visibility_condition_validation_service] = _vis
    yield TestClient(app)
    app.dependency_overrides.clear()


def _doc_with_visibility():
    return {
        "schemaVersion": "1.2.0",
        "nodes": [
            {
                "id": "START",
                "line": "Hello",
                "nextNode": "END",
                "visibilityConditions": {
                    "combinator": "AND",
                    "items": [
                        {"kind": "flag_bool", "flagId": "TF_BOOL", "equals": True}
                    ],
                },
            }
        ],
    }


class TestDocumentsVisibilityConditions:
    """Persistance et refus catalogue."""

    def test_put_persists_visibility_conditions(self, client, mock_config_service, tmp_path):
        doc_id = "vis-ok"
        base = {"schemaVersion": "1.2.0", "nodes": [{"id": "START", "line": "Hello", "nextNode": "END"}]}
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(base), encoding="utf-8")
        (tmp_path / f"{doc_id}.meta").write_text(json.dumps({"revision": 2}), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        payload = _doc_with_visibility()
        r = client.put(f"/api/v1/documents/{doc_id}", json={"document": payload, "revision": 2})
        assert r.status_code == 200
        persisted = json.loads((tmp_path / f"{doc_id}.json").read_text(encoding="utf-8"))
        assert persisted["nodes"][0]["visibilityConditions"]["combinator"] == "AND"

        get_r = client.get(f"/api/v1/documents/{doc_id}")
        assert get_r.status_code == 200
        assert (
            get_r.json()["document"]["nodes"][0]["visibilityConditions"]
            == persisted["nodes"][0]["visibilityConditions"]
        )

    def test_put_rejects_unknown_flag(self, client, mock_config_service, tmp_path):
        doc_id = "vis-bad"
        base = {"schemaVersion": "1.2.0", "nodes": [{"id": "START", "line": "Hello", "nextNode": "END"}]}
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(base), encoding="utf-8")
        (tmp_path / f"{doc_id}.meta").write_text(json.dumps({"revision": 2}), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        bad = _doc_with_visibility()
        bad["nodes"][0]["visibilityConditions"]["items"][0]["flagId"] = "NOPE"
        r = client.put(f"/api/v1/documents/{doc_id}", json={"document": bad, "revision": 2})
        assert r.status_code == 422
