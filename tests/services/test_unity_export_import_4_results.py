"""Tests d'intégration pour l'export/import cycle avec 4 résultats de test."""
import pytest
import json
from services.graph_conversion_service import GraphConversionService
from services.json_renderer import UnityJsonRenderer


def test_export_import_cycle_with_4_test_results():
    """Test que l'export/import cycle préserve les 4 résultats de test.
    
    AC: #4 - Export/import cycle avec 4 résultats fonctionne.
    """
    # GIVEN: Un graphe ReactFlow avec un DialogueNode, un TestNode, et 4 nœuds de résultat
    nodes = [
        {
            "id": "START",
            "type": "dialogueNode",
            "data": {
                "id": "START",
                "speaker": "PNJ",
                "line": "Bonjour",
                "choices": [
                    {
                        "text": "Tenter de convaincre",
                        "test": "Raison+Diplomatie:8",
                    }
                ]
            }
        },
        {
            "id": "test-node-START-choice-0",
            "type": "testNode",
            "data": {
                "test": "Raison+Diplomatie:8",
                "line": "Tenter de convaincre",
            }
        },
        {
            "id": "NODE_CRITICAL_FAILURE",
            "type": "dialogueNode",
            "data": {
                "id": "NODE_CRITICAL_FAILURE",
                "speaker": "PNJ",
                "line": "Réponse échec critique",
            }
        },
        {
            "id": "NODE_FAILURE",
            "type": "dialogueNode",
            "data": {
                "id": "NODE_FAILURE",
                "speaker": "PNJ",
                "line": "Réponse échec",
            }
        },
        {
            "id": "NODE_SUCCESS",
            "type": "dialogueNode",
            "data": {
                "id": "NODE_SUCCESS",
                "speaker": "PNJ",
                "line": "Réponse réussite",
            }
        },
        {
            "id": "NODE_CRITICAL_SUCCESS",
            "type": "dialogueNode",
            "data": {
                "id": "NODE_CRITICAL_SUCCESS",
                "speaker": "PNJ",
                "line": "Réponse réussite critique",
            }
        },
    ]
    
    edges = [
        # Edge depuis DialogueNode vers TestNode (visualisation graphique uniquement)
        {
            "id": "START-choice-0-to-test",
            "source": "START",
            "target": "test-node-START-choice-0",
            "sourceHandle": "choice-0",
            "data": {"edgeType": "choice", "choiceIndex": 0}
        },
        # 4 edges depuis TestNode vers les nœuds de résultat
        {
            "id": "test-critical-failure",
            "source": "test-node-START-choice-0",
            "target": "NODE_CRITICAL_FAILURE",
            "sourceHandle": "critical-failure",
            "data": {"edgeType": "test-result", "resultType": "critical-failure"}
        },
        {
            "id": "test-failure",
            "source": "test-node-START-choice-0",
            "target": "NODE_FAILURE",
            "sourceHandle": "failure",
            "data": {"edgeType": "test-result", "resultType": "failure"}
        },
        {
            "id": "test-success",
            "source": "test-node-START-choice-0",
            "target": "NODE_SUCCESS",
            "sourceHandle": "success",
            "data": {"edgeType": "test-result", "resultType": "success"}
        },
        {
            "id": "test-critical-success",
            "source": "test-node-START-choice-0",
            "target": "NODE_CRITICAL_SUCCESS",
            "sourceHandle": "critical-success",
            "data": {"edgeType": "test-result", "resultType": "critical-success"}
        },
    ]
    
    # WHEN: Export vers Unity JSON
    unity_json = GraphConversionService.graph_to_unity_json(nodes, edges)
    doc = json.loads(unity_json)
    unity_nodes = doc["nodes"] if isinstance(doc, dict) and "nodes" in doc else doc

    # THEN: Le JSON Unity doit contenir les 4 champs test*Node dans le choix
    start_node = next((n for n in unity_nodes if n["id"] == "START"), None)
    assert start_node is not None
    choice = start_node["choices"][0]
    assert choice["test"] == "Raison+Diplomatie:8"
    assert choice["testCriticalFailureNode"] == "NODE_CRITICAL_FAILURE"
    assert choice["testFailureNode"] == "NODE_FAILURE"
    assert choice["testSuccessNode"] == "NODE_SUCCESS"
    assert choice["testCriticalSuccessNode"] == "NODE_CRITICAL_SUCCESS"
    
    # WHEN: Validation du JSON Unity
    renderer = UnityJsonRenderer()
    is_valid, errors = renderer.validate_nodes(unity_nodes)
    
    # THEN: Validation doit réussir
    assert is_valid is True, f"Erreurs de validation: {errors}"
    
    # WHEN: Re-import du JSON Unity vers ReactFlow (simulation)
    # (On utilise unity_json_to_graph pour simuler l'import)
    reactflow_nodes, reactflow_edges = GraphConversionService.unity_json_to_graph(unity_json)
    
    # THEN: Les 4 résultats doivent être préservés
    # Trouver le DialogueNode START
    start_reactflow_node = next((n for n in reactflow_nodes if n["id"] == "START"), None)
    assert start_reactflow_node is not None
    
    # Vérifier que le choix contient toujours les 4 champs
    start_data = start_reactflow_node["data"]
    choice_data = start_data["choices"][0]
    assert choice_data["test"] == "Raison+Diplomatie:8"
    assert choice_data.get("testCriticalFailureNode") == "NODE_CRITICAL_FAILURE"
    assert choice_data.get("testFailureNode") == "NODE_FAILURE"
    assert choice_data.get("testSuccessNode") == "NODE_SUCCESS"
    assert choice_data.get("testCriticalSuccessNode") == "NODE_CRITICAL_SUCCESS"
