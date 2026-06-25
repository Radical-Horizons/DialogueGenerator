"""Intégration : graphe éditeur (post-génération IA) → document Unity → schéma valide."""
from __future__ import annotations

from services.graph_conversion_service import GraphConversionService
from services.unity_export_validation_service import validate_unity_export_document
from tests.fixtures.unity_post_generation import react_flow_graph_payload


class TestGraphConversionGeneratedDialogueSchema:
    """validate-schema et export graphe couvrent les sorties LLM brutes."""

    def test_graph_to_unity_document_validates_after_generation_like_payload(self) -> None:
        nodes, edges = react_flow_graph_payload()
        document = GraphConversionService.graph_to_unity_document(nodes, edges)
        result = validate_unity_export_document(document)

        assert result.is_valid is True, result.errors
        start = document["nodes"][0]
        assert start["consequences"]["flag"] == "FLAG_RENCONTRE_VALKAZER_INIT"
        choice = start["choices"][0]
        assert choice["choiceId"] == "choice_START_0"
        assert choice["targetNode"] == "END"
        assert choice["test"] == "Volonté+Adaptabilité:12"
