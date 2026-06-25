"""Contrat schéma Unity — chemin réel génération IA → sauvegarde graphe.

Régression : les tests Story 5.x validaient surtout l'export (validate-schema /
save-and-write) avec des fixtures déjà conformes (node-*, choiceId, arêtes).
Le save principal (PUT /documents ← graphToDocument) passait par un validateur
sans normalisation et n'était pas couvert par un fixture post-LLM.
"""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from api.dependencies import get_config_service
from api.main import app
from api.utils.unity_schema_validator import validate_unity_json_structured
from services.graph_conversion_service import GraphConversionService
from services.unity_export_validation_service import validate_unity_export_document
from tests.fixtures.unity_post_generation import (
    RAW_POST_GENERATION_DOCUMENT,
    react_flow_graph_payload,
)

client = TestClient(app)


@pytest.mark.integration
class TestUnitySchemaSaveContract:
    """Le validateur brut doit échouer ; le pipeline export/save doit guérir."""

    def test_raw_validator_flags_missing_choice_id_and_target_node(self) -> None:
        """Sans normaliseur : choiceId et targetNode manquants → invalides."""
        is_valid, errors = validate_unity_json_structured(RAW_POST_GENERATION_DOCUMENT)
        assert is_valid is False
        blob = json.dumps(errors, ensure_ascii=False)
        assert "choiceId" in blob
        assert "targetNode" in blob

    def test_raw_validator_flags_lowercase_consequences_flag(self) -> None:
        """Sans normaliseur : flag LLM mixte → pattern schéma."""
        is_valid, errors = validate_unity_json_structured(RAW_POST_GENERATION_DOCUMENT)
        assert is_valid is False
        blob = json.dumps(errors, ensure_ascii=False)
        assert "flag" in blob.lower() or "FLAG_rencontre" in blob

    def test_export_pipeline_heals_post_generation_document(self) -> None:
        """validate-schema / export : graph → normaliseur → schéma OK."""
        nodes, edges = react_flow_graph_payload()
        document = GraphConversionService.graph_to_unity_document(nodes, edges)
        result = validate_unity_export_document(document)
        assert result.is_valid is True, result.errors
        choice = document["nodes"][0]["choices"][0]
        assert choice["choiceId"] == "choice_START_0"
        assert choice["targetNode"] == "END"
        assert choice["test"] == "Volonté+Adaptabilité:12"
        assert document["nodes"][0]["consequences"]["flag"] == "FLAG_RENCONTRE_VALKAZER_INIT"

    def test_put_document_persists_healed_post_generation_payload(
        self, tmp_path: Path
    ) -> None:
        """Save graphe (PUT /documents) : même fixture post-LLM → 200 + blob valide."""
        mock_config = MagicMock()
        mock_config.get_unity_dialogues_path.return_value = str(tmp_path)
        app.dependency_overrides[get_config_service] = lambda: mock_config
        try:
            response = client.put(
                "/api/v1/documents/contract-save-test",
                json={"document": RAW_POST_GENERATION_DOCUMENT, "revision": 1},
            )
            assert response.status_code == 200, response.text
            persisted = json.loads(
                (tmp_path / "contract-save-test.json").read_text(encoding="utf-8")
            )
            result = validate_unity_export_document(persisted)
            assert result.is_valid is True, result.errors
            choice = persisted["nodes"][0]["choices"][0]
            assert choice["choiceId"] == "choice_START_0"
            assert choice["targetNode"] == "END"
            assert persisted["nodes"][0]["consequences"]["flag"] == "FLAG_RENCONTRE_VALKAZER_INIT"
        finally:
            app.dependency_overrides.pop(get_config_service, None)
