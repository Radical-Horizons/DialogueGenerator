"""Tests pour GraphConversionService avec 4 résultats de test."""
import pytest
import json
from services.graph_conversion_service import GraphConversionService


def test_graph_to_unity_json_exports_4_test_results():
    """Test que graph_to_unity_json exporte les 4 résultats de test dans les choix.
    
    AC: #4 - Export des 4 champs test*Node dans le JSON Unity.
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
        # Edge depuis DialogueNode vers TestNode
        {
            "id": "START-choice-0-to-test",
            "source": "START",
            "target": "test-node-START-choice-0",
            "sourceHandle": "choice-0",
            "type": "smoothstep",
            "label": "Tenter de convaincre",
            "data": {
                "edgeType": "choice",
                "choiceIndex": 0,
            }
        },
        # 4 edges depuis TestNode vers les nœuds de résultat
        {
            "id": "test-node-START-choice-0-critical-failure-NODE_CRITICAL_FAILURE",
            "source": "test-node-START-choice-0",
            "target": "NODE_CRITICAL_FAILURE",
            "sourceHandle": "critical-failure",
            "type": "smoothstep",
            "label": "Échec critique",
            "data": {
                "edgeType": "test-result",
                "resultType": "critical-failure",
            }
        },
        {
            "id": "test-node-START-choice-0-failure-NODE_FAILURE",
            "source": "test-node-START-choice-0",
            "target": "NODE_FAILURE",
            "sourceHandle": "failure",
            "type": "smoothstep",
            "label": "Échec",
            "data": {
                "edgeType": "test-result",
                "resultType": "failure",
            }
        },
        {
            "id": "test-node-START-choice-0-success-NODE_SUCCESS",
            "source": "test-node-START-choice-0",
            "target": "NODE_SUCCESS",
            "sourceHandle": "success",
            "type": "smoothstep",
            "label": "Réussite",
            "data": {
                "edgeType": "test-result",
                "resultType": "success",
            }
        },
        {
            "id": "test-node-START-choice-0-critical-success-NODE_CRITICAL_SUCCESS",
            "source": "test-node-START-choice-0",
            "target": "NODE_CRITICAL_SUCCESS",
            "sourceHandle": "critical-success",
            "type": "smoothstep",
            "label": "Réussite critique",
            "data": {
                "edgeType": "test-result",
                "resultType": "critical-success",
            }
        },
    ]
    
    # WHEN: Conversion en Unity JSON
    unity_json = GraphConversionService.graph_to_unity_json(nodes, edges)
    doc = json.loads(unity_json)
    unity_nodes = doc["nodes"] if isinstance(doc, dict) and "nodes" in doc else doc

    # THEN: Le JSON Unity doit contenir les 4 champs test*Node dans le choix (pas de TestNode)
    start_node = next((n for n in unity_nodes if n["id"] == "START"), None)
    assert start_node is not None
    assert "choices" in start_node
    assert len(start_node["choices"]) == 1
    
    choice = start_node["choices"][0]
    assert choice["test"] == "Raison+Diplomatie:8"
    assert choice["testCriticalFailureNode"] == "NODE_CRITICAL_FAILURE"
    assert choice["testFailureNode"] == "NODE_FAILURE"
    assert choice["testSuccessNode"] == "NODE_SUCCESS"
    assert choice["testCriticalSuccessNode"] == "NODE_CRITICAL_SUCCESS"
    
    # Vérifier que le TestNode n'est PAS dans le JSON Unity
    test_nodes = [n for n in unity_nodes if n["id"].startswith("test-node-")]
    assert len(test_nodes) == 0, "Le TestNode ne doit pas être exporté dans le JSON Unity"


def test_graph_to_unity_json_4_results_without_choice_index_on_choice_to_test_edge():
    """Sans data.choiceIndex sur l'arête Dialogue→TestNode, l'export reste correct (E2E / sérialisation)."""
    nodes = [
        {
            "id": "START",
            "type": "dialogueNode",
            "data": {
                "id": "START",
                "speaker": "E2E",
                "line": "Fixture",
                "choices": [
                    {
                        "text": "Tenter",
                        "choiceId": "c0",
                        "test": "Raison+Diplomatie:8",
                    }
                ],
            },
        },
        {
            "id": "test-node-START-choice-0",
            "type": "testNode",
            "data": {"test": "Raison+Diplomatie:8", "line": "Tenter"},
        },
        {"id": "NODE_CF", "type": "dialogueNode", "data": {"id": "NODE_CF", "line": "CF"}},
        {"id": "NODE_F", "type": "dialogueNode", "data": {"id": "NODE_F", "line": "F"}},
        {"id": "NODE_S", "type": "dialogueNode", "data": {"id": "NODE_S", "line": "S"}},
        {"id": "NODE_CS", "type": "dialogueNode", "data": {"id": "NODE_CS", "line": "CS"}},
    ]
    edges = [
        {
            "id": "e:START:choice:c0:test",
            "source": "START",
            "target": "test-node-START-choice-0",
            "sourceHandle": "choice:c0",
            "type": "smoothstep",
            "data": {"edgeType": "choice"},
        },
        {
            "id": "tn-cf",
            "source": "test-node-START-choice-0",
            "target": "NODE_CF",
            "sourceHandle": "critical-failure",
            "type": "smoothstep",
            "data": {},
        },
        {
            "id": "tn-f",
            "source": "test-node-START-choice-0",
            "target": "NODE_F",
            "sourceHandle": "failure",
            "type": "smoothstep",
            "data": {},
        },
        {
            "id": "tn-s",
            "source": "test-node-START-choice-0",
            "target": "NODE_S",
            "sourceHandle": "success",
            "type": "smoothstep",
            "data": {},
        },
        {
            "id": "tn-cs",
            "source": "test-node-START-choice-0",
            "target": "NODE_CS",
            "sourceHandle": "critical-success",
            "type": "smoothstep",
            "data": {},
        },
    ]
    unity_json = GraphConversionService.graph_to_unity_json(nodes, edges)
    doc = json.loads(unity_json)
    unity_nodes = doc["nodes"]
    start_node = next((n for n in unity_nodes if n["id"] == "START"), None)
    choice = start_node["choices"][0]
    assert choice["testCriticalFailureNode"] == "NODE_CF"
    assert choice["testFailureNode"] == "NODE_F"
    assert choice["testSuccessNode"] == "NODE_S"
    assert choice["testCriticalSuccessNode"] == "NODE_CS"


def test_graph_to_unity_json_exports_2_test_results_retrocompatibilite():
    """Test rétrocompatibilité : graph_to_unity_json avec seulement 2 résultats (success/failure)."""
    # GIVEN: Un graphe avec seulement successNode et failureNode
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
            }
        },
        {
            "id": "NODE_FAILURE",
            "type": "dialogueNode",
            "data": {"id": "NODE_FAILURE", "speaker": "PNJ", "line": "Échec"}
        },
        {
            "id": "NODE_SUCCESS",
            "type": "dialogueNode",
            "data": {"id": "NODE_SUCCESS", "speaker": "PNJ", "line": "Réussite"}
        },
    ]
    
    edges = [
        {
            "id": "START-choice-0-to-test",
            "source": "START",
            "target": "test-node-START-choice-0",
            "sourceHandle": "choice-0",
            "data": {"edgeType": "choice", "choiceIndex": 0}
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
    ]
    
    # WHEN: Conversion en Unity JSON
    unity_json = GraphConversionService.graph_to_unity_json(nodes, edges)
    doc = json.loads(unity_json)
    unity_nodes = doc["nodes"] if isinstance(doc, dict) and "nodes" in doc else doc

    # THEN: Le choix doit avoir testFailureNode et testSuccessNode (rétrocompatibilité)
    start_node = next((n for n in unity_nodes if n["id"] == "START"), None)
    assert start_node is not None
    choice = start_node["choices"][0]
    assert choice["testFailureNode"] == "NODE_FAILURE"
    assert choice["testSuccessNode"] == "NODE_SUCCESS"
    # Les champs critiques peuvent être absents (rétrocompatibilité)
    assert choice.get("testCriticalFailureNode") is None or choice.get("testCriticalFailureNode") == ""
    assert choice.get("testCriticalSuccessNode") is None or choice.get("testCriticalSuccessNode") == ""
