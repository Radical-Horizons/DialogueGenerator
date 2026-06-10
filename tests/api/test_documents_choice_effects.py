"""Tests PUT document avec choiceEffects (Story 9.3)."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import (
    get_choice_effect_validation_service,
    get_config_service,
    get_dialogue_flags_service,
    get_visibility_condition_validation_service,
)
from api.main import app
from services.configuration_service import ConfigurationService
from services.dialogue_flags_service import DialogueFlagsService
from services.flag_catalog_service import FlagCatalogService
from services.visibility_condition_validation import VisibilityConditionValidationService
from services.choice_effect_validation import ChoiceEffectValidationService


@pytest.fixture
def mock_config_service():
    return MagicMock(spec=ConfigurationService)


@pytest.fixture
def client(mock_config_service, tmp_path):
    csv_path = tmp_path / "FlagCatalog.csv"
    csv_path.write_text(
        (
            "Id,Type,Category,Label,Description,DefaultValue,Tags,IsFavorite,"
            "Scope,MinValue,MaxValue,EnumValues\n"
            "EF_BOOL,bool,Event,B,,false,,,,,,,\n"
            "EF_CNT,int,Stat,C,,5,,,,0,10,,\n"
            "EF_ENUM,string,Choice,T,,a,,,,,,a;b;c\n"
        ),
        encoding="utf-8",
    )

    def _dfs():
        return DialogueFlagsService(FlagCatalogService(csv_path=csv_path))

    def _vis():
        return VisibilityConditionValidationService(FlagCatalogService(csv_path=csv_path))

    def _fx():
        return ChoiceEffectValidationService(FlagCatalogService(csv_path=csv_path))

    app.dependency_overrides[get_config_service] = lambda: mock_config_service
    app.dependency_overrides[get_dialogue_flags_service] = _dfs
    app.dependency_overrides[get_visibility_condition_validation_service] = _vis
    app.dependency_overrides[get_choice_effect_validation_service] = _fx
    yield TestClient(app)
    app.dependency_overrides.clear()


def _doc_valid_effects() -> dict:
    return {
        "schemaVersion": "1.2.0",
        "dialogueFlags": [
            {"flagId": "EF_BOOL", "type": "bool", "initialValue": False},
            {"flagId": "EF_CNT", "type": "compteur", "initialValue": 5},
            {"flagId": "EF_ENUM", "type": "enum", "initialValue": "a"},
        ],
        "nodes": [
            {
                "id": "START",
                "line": "Hello",
                "choices": [
                    {
                        "choiceId": "c1",
                        "text": "Ok",
                        "targetNode": "END",
                        "choiceEffects": [
                            {"kind": "set_bool", "flagId": "EF_BOOL", "value": True},
                            {
                                "kind": "adjust_counter",
                                "flagId": "EF_CNT",
                                "operator": "+=",
                                "value": 2,
                            },
                            {"kind": "set_enum", "flagId": "EF_ENUM", "value": "b"},
                            {
                                "kind": "reputation_delta",
                                "axisId": "Prestige",
                                "factionId": "F1",
                                "delta": -5,
                            },
                        ],
                    }
                ],
            },
            {"id": "END", "line": "Bye"},
        ],
    }


class TestDocumentsChoiceEffects:
    """Persistance et refus catalogue."""

    def test_put_persists_choice_effects_round_trip(self, client, mock_config_service, tmp_path):
        doc_id = "fx-ok"
        base = {"schemaVersion": "1.2.0", "nodes": [{"id": "START", "line": "Hello", "nextNode": "END"}]}
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(base), encoding="utf-8")
        (tmp_path / f"{doc_id}.meta").write_text(json.dumps({"revision": 2}), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        payload = _doc_valid_effects()
        r = client.put(f"/api/v1/documents/{doc_id}", json={"document": payload, "revision": 2})
        assert r.status_code == 200
        persisted = json.loads((tmp_path / f"{doc_id}.json").read_text(encoding="utf-8"))
        effects = persisted["nodes"][0]["choices"][0]["choiceEffects"]
        assert len(effects) == 4
        assert effects[0]["kind"] == "set_bool"

        get_r = client.get(f"/api/v1/documents/{doc_id}")
        assert get_r.status_code == 200
        assert (
            get_r.json()["document"]["nodes"][0]["choices"][0]["choiceEffects"]
            == effects
        )

    def test_put_rejects_set_bool_on_counter_flag(self, client, mock_config_service, tmp_path):
        doc_id = "fx-bool-on-int"
        base = {"schemaVersion": "1.2.0", "nodes": [{"id": "START", "line": "Hello", "nextNode": "END"}]}
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(base), encoding="utf-8")
        (tmp_path / f"{doc_id}.meta").write_text(json.dumps({"revision": 2}), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        bad = _doc_valid_effects()
        bad["nodes"][0]["choices"][0]["choiceEffects"] = [
            {"kind": "set_bool", "flagId": "EF_CNT", "value": True}
        ]
        r = client.put(f"/api/v1/documents/{doc_id}", json={"document": bad, "revision": 2})
        assert r.status_code == 422

    def test_put_rejects_counter_overflow_after_apply(self, client, mock_config_service, tmp_path):
        doc_id = "fx-cnt-clamp"
        base = {"schemaVersion": "1.2.0", "nodes": [{"id": "START", "line": "Hello", "nextNode": "END"}]}
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(base), encoding="utf-8")
        (tmp_path / f"{doc_id}.meta").write_text(json.dumps({"revision": 2}), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        bad = _doc_valid_effects()
        bad["nodes"][0]["choices"][0]["choiceEffects"] = [
            {"kind": "adjust_counter", "flagId": "EF_CNT", "operator": "+=", "value": 100}
        ]
        r = client.put(f"/api/v1/documents/{doc_id}", json={"document": bad, "revision": 2})
        assert r.status_code == 422

    def test_put_rejects_enum_value_not_in_catalog(self, client, mock_config_service, tmp_path):
        doc_id = "fx-enum"
        base = {"schemaVersion": "1.2.0", "nodes": [{"id": "START", "line": "Hello", "nextNode": "END"}]}
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(base), encoding="utf-8")
        (tmp_path / f"{doc_id}.meta").write_text(json.dumps({"revision": 2}), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        bad = _doc_valid_effects()
        bad["nodes"][0]["choices"][0]["choiceEffects"] = [
            {"kind": "set_enum", "flagId": "EF_ENUM", "value": "zorg"}
        ]
        r = client.put(f"/api/v1/documents/{doc_id}", json={"document": bad, "revision": 2})
        assert r.status_code == 422

    def test_put_rejects_reputation_delta_out_of_gdd_bounds(self, client, mock_config_service, tmp_path):
        doc_id = "fx-rep"
        base = {"schemaVersion": "1.2.0", "nodes": [{"id": "START", "line": "Hello", "nextNode": "END"}]}
        (tmp_path / f"{doc_id}.json").write_text(json.dumps(base), encoding="utf-8")
        (tmp_path / f"{doc_id}.meta").write_text(json.dumps({"revision": 2}), encoding="utf-8")
        mock_config_service.get_unity_dialogues_path.return_value = tmp_path

        bad = _doc_valid_effects()
        bad["nodes"][0]["choices"][0]["choiceEffects"] = [
            {
                "kind": "reputation_delta",
                "axisId": "Prestige",
                "factionId": "F1",
                "delta": 99,
            }
        ]
        r = client.put(f"/api/v1/documents/{doc_id}", json={"document": bad, "revision": 2})
        assert r.status_code == 422
