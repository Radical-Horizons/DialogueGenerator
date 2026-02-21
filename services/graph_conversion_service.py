"""Service de conversion entre format Unity JSON et format ReactFlow."""
import json
import logging
from typing import List, Dict, Any, Tuple, Optional

logger = logging.getLogger(__name__)


class GraphConversionService:
    """Service pour convertir entre Unity JSON (tableau) et ReactFlow (nodes/edges)."""
    
    @staticmethod
    def unity_json_to_graph(json_content: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
        """Convertit un dialogue Unity JSON en format ReactFlow (nodes + edges).
        
        Args:
            json_content: Contenu JSON Unity (tableau de nœuds).
            
        Returns:
            Tuple de (nodes ReactFlow, edges ReactFlow).
            
        Raises:
            ValueError: Si le JSON est invalide ou mal formaté.
        """
        try:
            unity_nodes = json.loads(json_content)

            if not isinstance(unity_nodes, list):
                raise ValueError("Le JSON Unity doit être un tableau de nœuds")

            # Convertir les nœuds Unity en nœuds ReactFlow
            reactflow_nodes: List[Dict[str, Any]] = []
            reactflow_edges: List[Dict[str, Any]] = []
            
            # Position par défaut (sera recalculée avec auto-layout)
            x_offset = 0
            y_offset = 0
            
            # Map pour stocker les TestNodes créés par choix (pour éviter les doublons)
            test_node_map: Dict[str, str] = {}  # key: `${nodeId}-choice-${index}`, value: testNodeId
            
            for unity_node in unity_nodes:
                node_id = unity_node.get("id")
                if not node_id:
                    logger.warning(f"Nœud sans ID ignoré: {unity_node}")
                    continue
                
                # Déterminer le type de nœud
                node_type = GraphConversionService._determine_node_type(unity_node)
                
                # Créer le nœud ReactFlow
                # Préserver le champ status (métadonnée éditeur) si présent (Task 6 - Story 1.4)
                reactflow_node = {
                    "id": node_id,
                    "type": node_type,
                    "position": {"x": x_offset, "y": y_offset},
                    "data": unity_node  # Toutes les données Unity stockées dans data (inclut status si présent)
                }
                
                # Position suivante (layout basique en cascade)
                y_offset += 150
                
                reactflow_nodes.append(reactflow_node)
                
                # Vérifier si ce nœud a des choix avec test et créer les TestNodes automatiquement
                choices = unity_node.get("choices", [])
                for choice_index, choice in enumerate(choices):
                    if choice.get("test"):
                        # Le choix a un attribut test : créer un TestNode automatiquement
                        test_node_key = f"{node_id}-choice-{choice_index}"
                        test_node_id = test_node_map.get(test_node_key)
                        
                        if not test_node_id:
                            # Créer le TestNode
                            test_node_id = f"test-node-{node_id}-choice-{choice_index}"
                            test_node_map[test_node_key] = test_node_id
                            
                            # Position du TestNode (à droite du DialogueNode)
                            test_node_position = {
                                "x": x_offset + 300,
                                "y": y_offset - 150 + (choice_index * 200)
                            }
                            
                            # Créer le TestNode avec les données du test
                            test_node = {
                                "id": test_node_id,
                                "type": "testNode",
                                "position": test_node_position,
                                "data": {
                                    "id": test_node_id,
                                    "test": choice.get("test"),
                                    "line": choice.get("text", ""),
                                    "criticalFailureNode": choice.get("testCriticalFailureNode"),
                                    "failureNode": choice.get("testFailureNode"),
                                    "successNode": choice.get("testSuccessNode"),
                                    "criticalSuccessNode": choice.get("testCriticalSuccessNode"),
                                }
                            }
                            reactflow_nodes.append(test_node)
                            
                            # Créer l'edge DialogueNode → TestNode (via le handle du choix)
                            choice_text = choice.get("text", f"Choix {choice_index + 1}")
                            # Tronquer le label pour l'affichage (comme pour les autres edges)
                            truncated_label = choice_text[:30] + "..." if len(choice_text) > 30 else choice_text
                            reactflow_edges.append({
                                "id": f"{node_id}-choice-{choice_index}-to-test",
                                "source": node_id,
                                "target": test_node_id,
                                "sourceHandle": f"choice-{choice_index}",
                                "type": "smoothstep",
                                "label": truncated_label,
                                "data": {
                                    "edgeType": "choice",
                                    "choiceIndex": choice_index,
                                    "choiceText": choice_text
                                }
                            })
                            
                            # Créer les 4 edges depuis le TestNode vers les nœuds de résultat (si ils existent)
                            test_results = [
                                {
                                    "field": "testCriticalFailureNode",
                                    "node_id": choice.get("testCriticalFailureNode"),
                                    "label": "Échec critique",
                                    "color": "#C0392B",
                                    "handle_id": "critical-failure"
                                },
                                {
                                    "field": "testFailureNode",
                                    "node_id": choice.get("testFailureNode"),
                                    "label": "Échec",
                                    "color": "#E74C3C",
                                    "handle_id": "failure"
                                },
                                {
                                    "field": "testSuccessNode",
                                    "node_id": choice.get("testSuccessNode"),
                                    "label": "Réussite",
                                    "color": "#27AE60",
                                    "handle_id": "success"
                                },
                                {
                                    "field": "testCriticalSuccessNode",
                                    "node_id": choice.get("testCriticalSuccessNode"),
                                    "label": "Réussite critique",
                                    "color": "#229954",
                                    "handle_id": "critical-success"
                                }
                            ]
                            
                            for result in test_results:
                                if result["node_id"]:
                                    # Vérifier que le nœud cible existe dans le graphe
                                    target_node_exists = any(n.get("id") == result["node_id"] for n in unity_nodes)
                                    if target_node_exists:
                                        reactflow_edges.append({
                                            "id": f"{test_node_id}-{result['handle_id']}-{result['node_id']}",
                                            "source": test_node_id,
                                            "target": result["node_id"],
                                            "sourceHandle": result["handle_id"],
                                            "type": "smoothstep",
                                            "label": result["label"],
                                            "style": {"stroke": result["color"]}
                                        })
                
                # Créer les edges depuis ce nœud (sauf les choix avec test qui sont gérés ci-dessus)
                edges = GraphConversionService._extract_edges_from_node(unity_node)
                reactflow_edges.extend(edges)
            
            logger.info(f"Conversion réussie: {len(reactflow_nodes)} nœuds, {len(reactflow_edges)} edges")
            return reactflow_nodes, reactflow_edges
            
        except json.JSONDecodeError as e:
            logger.error(f"Erreur de parsing JSON: {e}")
            raise ValueError(f"JSON invalide: {e}")
        except Exception as e:
            logger.exception(f"Erreur lors de la conversion Unity → ReactFlow")
            raise ValueError(f"Erreur de conversion: {e}")
    
    @staticmethod
    def _determine_node_type(unity_node: Dict[str, Any]) -> str:
        """Détermine le type de nœud ReactFlow basé sur les propriétés Unity.

        Args:
            unity_node: Nœud Unity JSON.

        Returns:
            Type de nœud: 'dialogueNode', 'testNode', 'endNode'.
        """
        node_id = unity_node.get("id", "")
        choices = unity_node.get("choices")
        next_node = unity_node.get("nextNode")
        has_choices = bool(choices and len(choices) > 0)
        has_next = bool(next_node)

        # Nœud avec test d'attribut (success/failure branching)
        if unity_node.get("test"):
            return "testNode"

        # Nœud "END" spécial uniquement (ne pas classer en endNode les nœuds sans choix/nextNode :
        # un nœud manuel ou une cible de choix a choices=[] et pas de nextNode mais reste un dialogueNode)
        if node_id == "END":
            return "endNode"

        # Nœud de dialogue (y compris nœuds manuels et cibles sans choix/nextNode)
        return "dialogueNode"
    
    @staticmethod
    def _extract_edges_from_node(unity_node: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extrait les edges depuis un nœud Unity.
        
        Args:
            unity_node: Nœud Unity JSON.
            
        Returns:
            Liste d'edges ReactFlow.
        """
        edges: List[Dict[str, Any]] = []
        source_id = unity_node.get("id")
        
        if not source_id:
            return edges
        
        # Edge depuis nextNode (navigation linéaire)
        next_node = unity_node.get("nextNode")
        if next_node:
            edges.append({
                "id": f"{source_id}->{next_node}",
                "source": source_id,
                "target": next_node,
                "type": "default",
                "label": "Suivant"
            })
        
        # Edges depuis test success/failure
        success_node = unity_node.get("successNode")
        failure_node = unity_node.get("failureNode")
        
        if success_node:
            edges.append({
                "id": f"{source_id}-success->{success_node}",
                "source": source_id,
                "target": success_node,
                "type": "default",
                "label": "Succès",
                "data": {"edgeType": "success"}
            })
        
        if failure_node:
            edges.append({
                "id": f"{source_id}-failure->{failure_node}",
                "source": source_id,
                "target": failure_node,
                "type": "default",
                "label": "Échec",
                "data": {"edgeType": "failure"}
            })
        
        # Edges depuis choix du joueur
        # NOTE: Les choix avec test sont gérés dans unity_json_to_graph() et créent un TestNode
        # Ici, on ne crée que les edges pour les choix SANS test (targetNode direct)
        choices = unity_node.get("choices", [])
        for choice_index, choice in enumerate(choices):
            # Ignorer les choix avec test (ils passent par un TestNode, pas de targetNode direct)
            if choice.get("test"):
                continue
                
            target_node = choice.get("targetNode")
            if target_node:
                choice_text = choice.get("text", f"Choix {choice_index + 1}")
                # Tronquer le texte pour le label
                label = choice_text[:30] + "..." if len(choice_text) > 30 else choice_text
                
                edges.append({
                    "id": f"{source_id}-choice{choice_index}->{target_node}",
                    "source": source_id,
                    "target": target_node,
                    "sourceHandle": f"choice-{choice_index}",  # Correspond à l'ID du handle dans DialogueNode
                    "type": "default",
                    "label": label,
                    "data": {
                        "edgeType": "choice",
                        "choiceIndex": choice_index,
                        "choiceText": choice_text
                    }
                })
        
        return edges
    
    @staticmethod
    def graph_to_unity_json(
        nodes: List[Dict[str, Any]], 
        edges: List[Dict[str, Any]]
    ) -> str:
        """Convertit un graphe ReactFlow en Unity JSON.
        
        Args:
            nodes: Liste de nœuds ReactFlow.
            edges: Liste d'edges ReactFlow.
            
        Returns:
            JSON Unity (tableau de nœuds).
            
        Raises:
            ValueError: Si la conversion échoue.
        """
        try:
            unity_nodes: List[Dict[str, Any]] = []
            
            # Reconstruire les nœuds Unity depuis ReactFlow
            # Exclure les TestNodes (ils ne sont pas dans le JSON Unity, seulement les champs test*Node dans les choix)
            for node in nodes:
                node_id = node.get("id")
                if not node_id:
                    logger.warning(f"Nœud sans ID ignoré: {node}")
                    continue
                
                # Ignorer les TestNodes (ils ne sont pas exportés dans le JSON Unity)
                node_type = node.get("type")
                if node_type == "testNode":
                    continue
                
                # Récupérer les données Unity stockées dans data
                unity_node = node.get("data", {}).copy()
                
                # S'assurer que l'ID est présent
                unity_node["id"] = node_id
                
                # Nettoyer les références de navigation (seront recréées depuis les edges)
                unity_node.pop("nextNode", None)
                unity_node.pop("successNode", None)
                unity_node.pop("failureNode", None)
                
                # Retirer le champ status avant export Unity (métadonnée éditeur uniquement) (Task 6 - Story 1.4)
                # Le status est préservé dans le dialogue JSON de l'éditeur (via saveDialogue),
                # mais retiré lors de l'export Unity final car non supporté par Unity
                unity_node.pop("status", None)
                
                # Nettoyer les targetNode et test*Node des choix (seront recréés depuis les edges)
                if "choices" in unity_node:
                    for choice in unity_node["choices"]:
                        choice.pop("targetNode", None)
                        choice.pop("testCriticalFailureNode", None)
                        choice.pop("testFailureNode", None)
                        choice.pop("testSuccessNode", None)
                        choice.pop("testCriticalSuccessNode", None)
                
                unity_nodes.append(unity_node)
            
            # Reconstruire les connexions depuis les edges
            GraphConversionService._rebuild_connections(unity_nodes, edges)

            # Convertir en JSON
            json_content = json.dumps(unity_nodes, indent=2, ensure_ascii=False)

            logger.info(f"Conversion réussie: {len(unity_nodes)} nœuds Unity")
            return json_content
            
        except Exception as e:
            logger.exception(f"Erreur lors de la conversion ReactFlow → Unity")
            raise ValueError(f"Erreur de conversion: {e}")
    
    @staticmethod
    def _rebuild_connections(unity_nodes: List[Dict[str, Any]], edges: List[Dict[str, Any]]) -> None:
        """Reconstruit les connexions Unity (nextNode, successNode, etc.) depuis les edges.
        
        Args:
            unity_nodes: Liste de nœuds Unity (modifiée in-place).
            edges: Liste d'edges ReactFlow.
        """
        # Créer un index des nœuds par ID
        nodes_by_id = {node["id"]: node for node in unity_nodes}

        # Map pour trouver le choix correspondant à un TestNode
        # key: testNodeId, value: (dialogueNodeId, choiceIndex)
        test_node_to_choice_map: Dict[str, Tuple[str, int]] = {}
        
        # Première passe : identifier les TestNodes et leurs choix parents
        for edge in edges:
            source_id = edge.get("source")
            target_id = edge.get("target")
            edge_data = edge.get("data", {})
            edge_type = edge_data.get("edgeType")
            
            if not source_id or not target_id:
                continue
            
            # Si l'edge va d'un DialogueNode vers un TestNode (via choice handle)
            if edge_type == "choice" and target_id.startswith("test-node-"):
                choice_index = edge_data.get("choiceIndex")
                if choice_index is not None:
                    test_node_to_choice_map[target_id] = (source_id, choice_index)
        
        # Deuxième passe : reconstruire les connexions
        for edge in edges:
            source_id = edge.get("source")
            target_id = edge.get("target")
            edge_data = edge.get("data", {})
            edge_type = edge_data.get("edgeType")
            source_handle = edge.get("sourceHandle")
            
            if not source_id or not target_id:
                continue
            
            # Si l'edge part d'un TestNode vers un nœud de résultat
            if source_id.startswith("test-node-") and source_handle:
                # Trouver le choix parent
                parent_info = test_node_to_choice_map.get(source_id)
                if parent_info:
                    dialogue_node_id, choice_index = parent_info
                    dialogue_node = nodes_by_id.get(dialogue_node_id)
                    if dialogue_node and "choices" in dialogue_node:
                        choices = dialogue_node["choices"]
                        if 0 <= choice_index < len(choices):
                            choice = choices[choice_index]
                            # Mapper le sourceHandle vers le champ test*Node correspondant
                            if source_handle == "critical-failure":
                                choice["testCriticalFailureNode"] = target_id
                            elif source_handle == "failure":
                                choice["testFailureNode"] = target_id
                            elif source_handle == "success":
                                choice["testSuccessNode"] = target_id
                            elif source_handle == "critical-success":
                                choice["testCriticalSuccessNode"] = target_id
                continue
            
            source_node = nodes_by_id.get(source_id)
            if not source_node:
                continue
            
            # Reconstruire selon le type d'edge
            if edge_type == "success":
                source_node["successNode"] = target_id
            elif edge_type == "failure":
                source_node["failureNode"] = target_id
            elif edge_type == "choice":
                # Ignorer les edges "choice" qui pointent vers un TestNode
                # (les choix avec test n'ont pas de targetNode direct, seulement les 4 champs test*Node)
                if target_id.startswith("test-node-"):
                    continue
                choice_index = edge_data.get("choiceIndex")
                if choice_index is not None and "choices" in source_node:
                    choices = source_node["choices"]
                    if 0 <= choice_index < len(choices):
                        choices[choice_index]["targetNode"] = target_id
            else:
                # Edge par défaut (nextNode)
                # Ne l'ajouter que si pas de choix ni de test
                if not source_node.get("choices") and not source_node.get("test"):
                    source_node["nextNode"] = target_id
    
    @staticmethod
    def calculate_layout(
        nodes: List[Dict[str, Any]], 
        edges: List[Dict[str, Any]], 
        algorithm: str = "dagre",
        direction: str = "TB"
    ) -> List[Dict[str, Any]]:
        """Calcule les positions des nœuds avec un algorithme de layout.
        
        Note: Cette version retourne les positions calculées en Python.
        Pour Dagre, le calcul sera fait côté frontend avec dagre.js.
        
        Args:
            nodes: Liste de nœuds ReactFlow.
            edges: Liste d'edges ReactFlow.
            algorithm: Algorithme de layout ("dagre", "manual").
            direction: Direction du graphe ("TB", "LR", "BT", "RL").
            
        Returns:
            Liste de nœuds avec positions calculées.
        """
        if algorithm == "manual":
            # Layout manuel: positions déjà définies
            return nodes
        
        if algorithm == "dagre":
            # Pour Dagre, retourner un layout basique en cascade
            # Le vrai calcul sera fait côté frontend avec dagre.js
            return GraphConversionService._simple_cascade_layout(nodes, direction)
        
        # Par défaut: cascade
        return GraphConversionService._simple_cascade_layout(nodes, direction)
    
    @staticmethod
    def _simple_cascade_layout(
        nodes: List[Dict[str, Any]], 
        direction: str = "TB"
    ) -> List[Dict[str, Any]]:
        """Layout simple en cascade (fallback si Dagre pas dispo).
        
        Args:
            nodes: Liste de nœuds.
            direction: Direction ("TB", "LR").
            
        Returns:
            Nœuds avec positions en cascade.
        """
        laid_out_nodes = []
        
        for i, node in enumerate(nodes):
            if direction == "LR":
                # Left to right
                position = {"x": i * 300, "y": 0}
            else:
                # Top to bottom (défaut)
                position = {"x": 0, "y": i * 150}
            
            laid_out_nodes.append({
                **node,
                "position": position
            })
        
        return laid_out_nodes
