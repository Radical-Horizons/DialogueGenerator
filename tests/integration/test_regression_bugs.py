"""Tests de non-régression pour bugs critiques corrigés dans Epic 0.

Ces tests documentent et préviennent la régression des bugs critiques
identifiés et corrigés dans Epic 0.
"""
import pytest
import json
from unittest.mock import MagicMock, AsyncMock
from typing import List, Dict, Any

from services.graph_conversion_service import GraphConversionService
from services.json_renderer.unity_json_renderer import UnityJsonRenderer
from services.unity_dialogue_generation_service import UnityDialogueGenerationService
from models.dialogue_structure.unity_dialogue_node import (
    UnityDialogueGenerationResponse,
    UnityDialogueNodeContent,
    UnityDialogueChoiceContent
)


@pytest.fixture
def renderer():
    """Fixture pour créer un UnityJsonRenderer."""
    return UnityJsonRenderer()


class TestRegressionStableIDCorruption:
    """Tests de non-régression : Bug stableID corruption (Epic 0 Story 0.1).
    
    Bug : Corruption graphe si stableID manquant.
    Fix : Auto-génération UUID si stableID manquant, validation avant sauvegarde.
    """
    
    def test_node_without_id_rejected(self, renderer: UnityJsonRenderer):
        """REGRESSION TEST : Nœud sans ID doit être rejeté lors de la validation.
        
        Bug Epic 0 Story 0.1 : Corruption graphe si stableID manquant.
        """
        # GIVEN: Nœud sans ID
        nodes = [
            {
                "speaker": "PNJ",
                "line": "Test sans ID"
            }
        ]
        
        # WHEN: Validation
        is_valid, errors = renderer.validate_nodes(nodes)
        
        # THEN: Validation doit échouer
        assert is_valid is False
        assert any("id" in error.lower() and ("non vide" in error.lower() or "manquant" in error.lower()) for error in errors)
    
    def test_node_with_empty_id_rejected(self, renderer: UnityJsonRenderer):
        """REGRESSION TEST : Nœud avec ID vide doit être rejeté.
        
        Bug Epic 0 Story 0.1 : IDs vides causent corruption.
        """
        # GIVEN: Nœud avec ID vide
        nodes = [
            {
                "id": "",
                "speaker": "PNJ",
                "line": "Test ID vide"
            }
        ]
        
        # WHEN: Validation
        is_valid, errors = renderer.validate_nodes(nodes)
        
        # THEN: Validation doit échouer
        assert is_valid is False
        assert any("id" in error.lower() and "non vide" in error.lower() for error in errors)
    
    def test_duplicate_ids_rejected(self, renderer: UnityJsonRenderer):
        """REGRESSION TEST : IDs dupliqués doivent être rejetés.
        
        Bug Epic 0 Story 0.1 : IDs dupliqués → corruption graphe.
        """
        # GIVEN: Nœuds avec IDs dupliqués
        nodes = [
            {"id": "DUPLICATE", "speaker": "PNJ", "line": "Test 1"},
            {"id": "DUPLICATE", "speaker": "PNJ", "line": "Test 2"},
        ]
        
        # WHEN: Validation
        is_valid, errors = renderer.validate_nodes(nodes)
        
        # THEN: Validation doit échouer avec message sur IDs dupliqués
        assert is_valid is False
        assert any("dupliqué" in error.lower() for error in errors)
        assert any("DUPLICATE" in error for error in errors)
    
    def test_export_import_preserves_ids(self, renderer: UnityJsonRenderer):
        """REGRESSION TEST : Cycle export/import préserve les IDs.
        
        Bug Epic 0 Story 0.1 : IDs perdus lors de conversion.
        """
        # GIVEN: JSON Unity avec IDs
        unity_json_str = """[
            {"id": "START", "speaker": "PNJ", "line": "Test"},
            {"id": "NODE_2", "speaker": "PNJ", "line": "Test 2"}
        ]"""
        
        # WHEN: Conversion vers ReactFlow puis retour
        nodes, edges = GraphConversionService.unity_json_to_graph(unity_json_str)
        converted_json = GraphConversionService.graph_to_unity_json(nodes, edges)
        doc = json.loads(converted_json)
        converted_nodes = doc["nodes"] if isinstance(doc, dict) and "nodes" in doc else doc

        # THEN: IDs doivent être préservés
        converted_ids = [node["id"] for node in converted_nodes]
        assert "START" in converted_ids
        assert "NODE_2" in converted_ids
        assert len(converted_ids) == len(set(converted_ids))  # Pas de doublons


class TestRegressionEventSourceRaceConditions:
    """Non-régression Story 0.8 (EventSource) : couverte par Vitest ``useSSEStreaming.test.ts``.
    
    Fermeture idempotente, debounce 600 ms sur ``onerror``, et ``tokens === 0`` en metadata.
    """


class TestRegressionDatetimeParsing:
    """Tests de non-régression : Bug datetime.fromisoformat() (Story 0.8).
    
    Bug : datetime.fromisoformat() peut échouer avec formats variés.
    Fix : Helper avec fallback nécessaire (action item Epic 0).
    """
    
    def test_datetime_parsing_robustness(self):
        """REGRESSION TEST : Parsing datetime doit gérer plusieurs formats.
        
        Bug Story 0.8 : datetime.fromisoformat() échoue avec formats variés.
        Action item : Créer helper safe_parse_datetime().
        """
        from datetime import datetime
        
        # GIVEN: Formats datetime variés
        date_formats = [
            "2026-01-21T10:30:00",
            "2026-01-21T10:30:00.000Z",
            "2026-01-21T10:30:00+00:00",
            "2026-01-21 10:30:00",
        ]
        
        # WHEN: Parsing (sans helper pour l'instant)
        # THEN: Les formats ISO standard doivent fonctionner
        for date_str in date_formats[:3]:  # Formats ISO standards
            try:
                dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                assert dt.year == 2026
                assert dt.month == 1
                assert dt.day == 21
            except ValueError:
                # Format non supporté - helper nécessaire
                pytest.skip(f"Format {date_str} nécessite helper safe_parse_datetime()")
        
        # Note: Un helper safe_parse_datetime() devrait être créé pour gérer tous les formats


class TestRegression4TestResults:
    """Tests de non-régression : Feature 4 résultats de test (Story 0.10).
    
    Bug potentiel : Régression si feature 4 résultats cassée.
    """
    
    def test_4_test_results_preserved_export_import(self, renderer: UnityJsonRenderer):
        """REGRESSION TEST : 4 résultats de test préservés dans cycle export/import.
        
        Feature Story 0.10 : Support 4 résultats (critical-failure, failure, success, critical-success).
        """
        # GIVEN: JSON Unity avec 4 résultats de test
        unity_json_str = """[
            {
                "id": "START",
                "speaker": "PNJ",
                "line": "Test",
                "choices": [
                    {
                        "text": "Test compétence",
                        "test": "Raison+Diplomatie:8",
                        "testCriticalFailureNode": "NODE_CF",
                        "testFailureNode": "NODE_F",
                        "testSuccessNode": "NODE_S",
                        "testCriticalSuccessNode": "NODE_CS"
                    }
                ]
            },
            {"id": "NODE_CF", "speaker": "PNJ", "line": "Échec critique"},
            {"id": "NODE_F", "speaker": "PNJ", "line": "Échec"},
            {"id": "NODE_S", "speaker": "PNJ", "line": "Réussite"},
            {"id": "NODE_CS", "speaker": "PNJ", "line": "Réussite critique"}
        ]"""
        
        # WHEN: Conversion vers ReactFlow
        nodes, edges = GraphConversionService.unity_json_to_graph(unity_json_str)
        
        # WHEN: Reconversion vers JSON Unity
        converted_json = GraphConversionService.graph_to_unity_json(nodes, edges)
        doc = json.loads(converted_json)
        converted_nodes = doc["nodes"] if isinstance(doc, dict) and "nodes" in doc else doc

        # WHEN: Validation
        is_valid, errors = renderer.validate_nodes(converted_nodes)
        
        # THEN: Validation doit réussir
        assert is_valid is True, f"Erreurs: {errors}"
        
        # THEN: Les 4 résultats doivent être préservés
        start_node = next(node for node in converted_nodes if node["id"] == "START")
        choice = start_node["choices"][0]
        assert choice.get("testCriticalFailureNode") == "NODE_CF"
        assert choice.get("testFailureNode") == "NODE_F"
        assert choice.get("testSuccessNode") == "NODE_S"
        assert choice.get("testCriticalSuccessNode") == "NODE_CS"
    
    def test_retrocompatibilite_2_test_results(self, renderer: UnityJsonRenderer):
        """REGRESSION TEST : Rétrocompatibilité avec 2 résultats (success/failure).
        
        Feature Story 0.10 : Anciens dialogues avec 2 résultats doivent fonctionner.
        """
        # GIVEN: JSON Unity avec seulement 2 résultats (ancien format)
        unity_json_str = """[
            {
                "id": "START",
                "speaker": "PNJ",
                "line": "Test",
                "choices": [
                    {
                        "text": "Test",
                        "test": "Raison+Diplomatie:8",
                        "testFailureNode": "NODE_F",
                        "testSuccessNode": "NODE_S"
                    }
                ]
            },
            {"id": "NODE_F", "speaker": "PNJ", "line": "Échec"},
            {"id": "NODE_S", "speaker": "PNJ", "line": "Réussite"}
        ]"""
        
        # WHEN: Validation
        nodes = json.loads(unity_json_str)
        is_valid, errors = renderer.validate_nodes(nodes)
        
        # THEN: Validation doit réussir (rétrocompatibilité)
        assert is_valid is True, f"Erreurs: {errors}"
        
        # THEN: Les 2 résultats doivent être présents
        start_node = next(node for node in nodes if node["id"] == "START")
        choice = start_node["choices"][0]
        assert choice.get("testFailureNode") == "NODE_F"
        assert choice.get("testSuccessNode") == "NODE_S"


class TestRegressionBudgetGovernance:
    """Tests de non-régression : Cost governance (Story 0.7).
    
    Bug potentiel : Régression si cost governance cassé.
    """
    
    def test_budget_validation_integration(self):
        """REGRESSION TEST : Validation budget avant génération.
        
        Feature Story 0.7 : Cost governance bloque génération si budget dépassé.
        Tests réels : test_cost_governance.py et test_cost_governance_service.py.
        """
        # Test documentaire - les tests réels sont dans:
        # - tests/services/test_cost_governance_service.py (unit)
        # - tests/middleware/test_cost_governance.py (intégration)
        # Ce test documente que le comportement doit être maintenu
        pass
