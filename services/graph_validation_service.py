"""Service de validation de graphes de dialogues."""
import logging
import hashlib
from typing import List, Dict, Any, Set, Optional
from collections import defaultdict

logger = logging.getLogger(__name__)


class ValidationError:
    """Représente une erreur de validation."""
    
    def __init__(
        self, 
        error_type: str, 
        node_id: Optional[str], 
        message: str,
        severity: str = "error",
        target: Optional[str] = None,
        cycle_path: Optional[str] = None,
        cycle_nodes: Optional[List[str]] = None,
        cycle_id: Optional[str] = None
    ):
        self.type = error_type
        self.node_id = node_id
        self.message = message
        self.severity = severity  # "error" ou "warning"
        self.target = target
        self.cycle_path = cycle_path
        self.cycle_nodes = cycle_nodes
        self.cycle_id = cycle_id
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire."""
        result = {
            "type": self.type,
            "message": self.message,
            "severity": self.severity
        }
        if self.node_id:
            result["node_id"] = self.node_id
        if self.target:
            result["target"] = self.target
        if self.cycle_path:
            result["cycle_path"] = self.cycle_path
        if self.cycle_nodes:
            result["cycle_nodes"] = self.cycle_nodes
        if self.cycle_id:
            result["cycle_id"] = self.cycle_id
        return result


class ValidationResult:
    """Résultat d'une validation de graphe."""
    
    def __init__(self):
        self.errors: List[ValidationError] = []
        self.warnings: List[ValidationError] = []
    
    def add_error(
        self, 
        error_type: str, 
        node_id: Optional[str], 
        message: str,
        target: Optional[str] = None
    ):
        """Ajoute une erreur."""
        self.errors.append(
            ValidationError(error_type, node_id, message, "error", target)
        )
    
    def add_warning(
        self, 
        error_type: str, 
        node_id: Optional[str], 
        message: str,
        target: Optional[str] = None,
        cycle_path: Optional[str] = None,
        cycle_nodes: Optional[List[str]] = None,
        cycle_id: Optional[str] = None
    ):
        """Ajoute un warning."""
        self.warnings.append(
            ValidationError(
                error_type, node_id, message, "warning", target,
                cycle_path, cycle_nodes, cycle_id
            )
        )
    
    @property
    def valid(self) -> bool:
        """True si aucune erreur (warnings acceptés)."""
        return len(self.errors) == 0
    
    def to_dict(self) -> Dict[str, Any]:
        """Convertit en dictionnaire."""
        return {
            "valid": self.valid,
            "errors": [e.to_dict() for e in self.errors],
            "warnings": [w.to_dict() for w in self.warnings]
        }


def _node_id(node: Dict[str, Any]) -> Optional[str]:
    """Retourne l'id d'un nœud (niveau racine ou dans data). Compatible ReactFlow et format document."""
    nid = node.get("id")
    if nid:
        return str(nid)
    data = node.get("data")
    if isinstance(data, dict):
        data_id = data.get("id")
        if data_id is not None:
            return str(data_id)
    return None


def _node_type(node: Dict[str, Any]) -> Optional[str]:
    """Retourne le type d'un nœud (niveau racine ou dans data)."""
    t = node.get("type")
    if t:
        return str(t)
    data = node.get("data")
    if isinstance(data, dict) and data.get("type"):
        return str(data["type"])
    return None


class GraphValidationService:
    """Service pour valider des graphes de dialogues."""
    
    @staticmethod
    def validate_graph(
        nodes: List[Dict[str, Any]], 
        edges: List[Dict[str, Any]]
    ) -> ValidationResult:
        """Valide un graphe complet.
        
        Args:
            nodes: Liste de nœuds ReactFlow.
            edges: Liste d'edges ReactFlow.
            
        Returns:
            Résultat de validation avec erreurs et warnings.
        """
        result = ValidationResult()
        
        # Validation 1: Nœuds sans ID
        GraphValidationService._validate_node_ids(nodes, result)
        
        # Validation 2: Références cassées (edges vers nœuds inexistants)
        GraphValidationService._validate_broken_references(nodes, edges, result)
        
        # Validation 3: Nœuds orphelins (pas de connexion entrante sauf START)
        GraphValidationService._validate_orphan_nodes(nodes, edges, result)
        
        # Validation 4: Nœuds inatteignables depuis START
        GraphValidationService._validate_unreachable_nodes(nodes, edges, result)
        
        # Validation 5: Nœuds de dialogue sans contenu
        GraphValidationService._validate_node_content(nodes, result)
        
        # Validation 6: Cycles (optionnel, warning seulement)
        GraphValidationService._validate_cycles(nodes, edges, result)
        
        logger.info(
            f"Validation terminée: {len(result.errors)} erreurs, "
            f"{len(result.warnings)} warnings"
        )
        
        return result
    
    @staticmethod
    def _validate_node_ids(nodes: List[Dict[str, Any]], result: ValidationResult):
        """Valide que tous les nœuds ont un ID (racine ou data.id)."""
        for i, node in enumerate(nodes):
            if not _node_id(node):
                result.add_error(
                    "missing_id",
                    None,
                    f"Nœud à l'index {i} n'a pas d'ID"
                )
    
    @staticmethod
    def _validate_broken_references(
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        result: ValidationResult
    ):
        """Valide que tous les edges pointent vers des nœuds existants."""
        node_ids = {nid for node in nodes for nid in (_node_id(node),) if nid}
        
        for edge in edges:
            source_id = edge.get("source")
            target_id = edge.get("target")
            
            if source_id and source_id not in node_ids:
                result.add_error(
                    "broken_reference",
                    source_id,
                    f"Edge source '{source_id}' n'existe pas",
                    target=target_id
                )
            
            if target_id and target_id not in node_ids:
                # "END" est un nœud spécial accepté
                if target_id == "END":
                    continue
                
                result.add_error(
                    "broken_reference",
                    source_id,
                    f"Edge target '{target_id}' n'existe pas",
                    target=target_id
                )
    
    @staticmethod
    def _validate_orphan_nodes(
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        result: ValidationResult
    ):
        """Détecte les nœuds orphelins (pas de connexion entrante).
        Le nœud d'entrée (START ou premier nœud dialogue) est exclu.
        """
        entry_id = None
        for node in nodes:
            nid = _node_id(node)
            if nid == "START":
                entry_id = nid
                break
        if not entry_id:
            for node in nodes:
                nid = _node_id(node)
                ntype = _node_type(node)
                if nid and nid != "END" and ntype != "testNode":
                    entry_id = nid
                    break

        node_ids = {nid for node in nodes for nid in (_node_id(node),) if nid}
        targets = {edge.get("target") for edge in edges if edge.get("target")}

        for node_id in node_ids:
            if node_id == entry_id or node_id == "END":
                continue
            if node_id not in targets:
                result.add_warning(
                    "orphan_node",
                    node_id,
                    f"Nœud '{node_id}' n'a pas de connexion entrante (orphelin)"
                )
    
    @staticmethod
    def _validate_unreachable_nodes(
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        result: ValidationResult
    ):
        """Détecte les nœuds inatteignables depuis le nœud d'entrée (START ou premier nœud dialogue).
        L'id est résolu via _node_id (racine ou data.id) pour accepter ReactFlow et format document.
        """
        start_node_id = None
        for node in nodes:
            nid = _node_id(node)
            if nid == "START":
                start_node_id = nid
                break
        if not start_node_id:
            for node in nodes:
                nid = _node_id(node)
                ntype = _node_type(node)
                if nid and nid != "END" and ntype != "testNode":
                    start_node_id = nid
                    break
        if not start_node_id:
            result.add_error(
                "missing_start",
                None,
                "Aucun nœud START trouvé"
            )
            return

        # BFS pour trouver tous les nœuds atteignables
        reachable = GraphValidationService._find_reachable_nodes(start_node_id, edges)

        # Comparer avec tous les nœuds (id racine ou data.id)
        all_node_ids = {nid for node in nodes for nid in (_node_id(node),) if nid}
        
        for node_id in all_node_ids:
            # END n'est pas un vrai nœud
            if node_id == "END":
                continue
            
            if node_id not in reachable:
                result.add_warning(
                    "unreachable_node",
                    node_id,
                    f"Nœud '{node_id}' est inatteignable depuis le nœud d'entrée"
                )
    
    @staticmethod
    def _find_reachable_nodes(start_id: str, edges: List[Dict[str, Any]]) -> Set[str]:
        """Trouve tous les nœuds atteignables depuis un nœud de départ (BFS).
        
        Args:
            start_id: ID du nœud de départ.
            edges: Liste d'edges.
            
        Returns:
            Set d'IDs de nœuds atteignables.
        """
        # Créer un graphe d'adjacence
        adjacency: Dict[str, List[str]] = defaultdict(list)
        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")
            if source and target:
                adjacency[source].append(target)
        
        # BFS
        reachable: Set[str] = {start_id}
        queue: List[str] = [start_id]
        
        while queue:
            current = queue.pop(0)
            neighbors = adjacency.get(current, [])
            
            for neighbor in neighbors:
                if neighbor not in reachable:
                    reachable.add(neighbor)
                    queue.append(neighbor)
        
        return reachable
    
    @staticmethod
    def _validate_node_content(nodes: List[Dict[str, Any]], result: ValidationResult):
        """Valide que les nœuds de dialogue ont du contenu (id/type via _node_id/_node_type)."""
        for node in nodes:
            node_id = _node_id(node)
            node_data = node.get("data") if isinstance(node.get("data"), dict) else {}
            node_type = _node_type(node) or "dialogueNode"

            # Skip validation pour END
            if node_id == "END":
                continue

            # Nœuds de dialogue doivent avoir line ou choices
            if node_type == "dialogueNode":
                has_line = bool(node_data.get("line"))
                has_choices = bool(node_data.get("choices"))
                
                if not has_line and not has_choices:
                    result.add_error(
                        "empty_node",
                        node_id,
                        f"Nœud '{node_id}' n'a ni dialogue ni choix"
                    )
            
            # Nœuds de test doivent avoir un test
            if node_type == "testNode":
                if not node_data.get("test"):
                    result.add_error(
                        "missing_test",
                        node_id,
                        f"Nœud de test '{node_id}' n'a pas de test d'attribut défini"
                    )
    
    @staticmethod
    def _validate_cycles(
        nodes: List[Dict[str, Any]], 
        edges: List[Dict[str, Any]], 
        result: ValidationResult
    ):
        """Détecte les cycles dans le graphe avec chemin complet (warning seulement).
        
        Note: Les cycles peuvent être intentionnels (ex: boucle de dialogue).
        """
        # Créer un graphe d'adjacence
        adjacency: Dict[str, List[str]] = defaultdict(list)
        for edge in edges:
            source = edge.get("source")
            target = edge.get("target")
            if source and target:
                adjacency[source].append(target)
        
        # Détecter tous les cycles avec leurs chemins complets
        detected_cycles: List[Dict[str, Any]] = []
        visited: Set[str] = set()
        rec_stack: Set[str] = set()
        path_stack: List[str] = []
        
        def dfs_cycle_detection(node_id: str) -> None:
            """DFS pour détecter les cycles avec stockage du chemin."""
            visited.add(node_id)
            rec_stack.add(node_id)
            path_stack.append(node_id)
            
            for neighbor in adjacency.get(node_id, []):
                if neighbor not in visited:
                    dfs_cycle_detection(neighbor)
                elif neighbor in rec_stack:
                    # Cycle détecté: extraire le chemin du cycle
                    cycle_start_idx = path_stack.index(neighbor)
                    cycle_path = path_stack[cycle_start_idx:] + [neighbor]
                    
                    # Extraire les nœuds uniques du cycle (sans le dernier doublon)
                    cycle_nodes = list(dict.fromkeys(cycle_path[:-1]))  # Garde l'ordre
                    
                    # Générer cycle_id stable basé sur les nœuds triés
                    # Utiliser SHA256 au lieu de MD5 (déprécié) et prendre 16 caractères pour réduire risque de collision
                    sorted_nodes = sorted(cycle_nodes)
                    node_str = ",".join(sorted_nodes)
                    cycle_id = f"cycle_{hashlib.sha256(node_str.encode()).hexdigest()[:16]}"
                    
                    # Formater le chemin pour affichage
                    path_str = " → ".join(cycle_path[:-1]) + f" → {cycle_path[0]}"
                    
                    # Vérifier si ce cycle n'a pas déjà été détecté (même cycle_id)
                    if not any(c.get("cycle_id") == cycle_id for c in detected_cycles):
                        detected_cycles.append({
                            "cycle_id": cycle_id,
                            "nodes": cycle_nodes,
                            "path": path_str
                        })
            
            rec_stack.remove(node_id)
            path_stack.pop()
        
        # Tester depuis tous les nœuds non visités
        for node in nodes:
            node_id = node.get("id")
            if node_id and node_id not in visited:
                dfs_cycle_detection(node_id)
        
        # Ajouter les warnings pour chaque cycle détecté
        for cycle in detected_cycles:
            # Utiliser le premier nœud du cycle comme node_id pour le warning
            first_node = cycle["nodes"][0] if cycle["nodes"] else None
            result.add_warning(
                "cycle_detected",
                first_node,
                f"Cycle détecté : {cycle['path']}",
                cycle_path=cycle["path"],
                cycle_nodes=cycle["nodes"],
                cycle_id=cycle["cycle_id"]
            )
    
    @staticmethod
    def find_orphan_nodes(
        nodes: List[Dict[str, Any]], 
        edges: List[Dict[str, Any]]
    ) -> List[str]:
        """Trouve les nœuds orphelins (pas de connexion entrante sauf START).
        
        Args:
            nodes: Liste de nœuds.
            edges: Liste d'edges.
            
        Returns:
            Liste d'IDs de nœuds orphelins.
        """
        node_ids = {node.get("id") for node in nodes if node.get("id")}
        targets = {edge.get("target") for edge in edges if edge.get("target")}
        
        orphans = []
        for node_id in node_ids:
            if node_id == "START" or node_id == "END":
                continue
            if node_id not in targets:
                orphans.append(node_id)
        
        return orphans
    
    @staticmethod
    def find_broken_references(nodes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Trouve les références cassées dans les nœuds Unity.
        
        Args:
            nodes: Liste de nœuds ReactFlow.
            
        Returns:
            Liste de dictionnaires avec les références cassées.
        """
        node_ids = {node.get("id") for node in nodes if node.get("id")}
        broken_refs: List[Dict[str, Any]] = []
        
        for node in nodes:
            node_id = node.get("id")
            node_data = node.get("data", {})
            
            # Vérifier nextNode
            next_node = node_data.get("nextNode")
            if next_node and next_node not in node_ids and next_node != "END":
                broken_refs.append({
                    "node_id": node_id,
                    "reference_type": "nextNode",
                    "target": next_node
                })
            
            # Vérifier successNode/failureNode
            success_node = node_data.get("successNode")
            if success_node and success_node not in node_ids and success_node != "END":
                broken_refs.append({
                    "node_id": node_id,
                    "reference_type": "successNode",
                    "target": success_node
                })
            
            failure_node = node_data.get("failureNode")
            if failure_node and failure_node not in node_ids and failure_node != "END":
                broken_refs.append({
                    "node_id": node_id,
                    "reference_type": "failureNode",
                    "target": failure_node
                })
            
            # Vérifier targetNode des choix
            choices = node_data.get("choices", [])
            for i, choice in enumerate(choices):
                target_node = choice.get("targetNode")
                if target_node and target_node not in node_ids and target_node != "END":
                    broken_refs.append({
                        "node_id": node_id,
                        "reference_type": f"choice[{i}].targetNode",
                        "target": target_node
                    })
        
        return broken_refs
    
    @staticmethod
    def find_unreachable_nodes(
        nodes: List[Dict[str, Any]], 
        edges: List[Dict[str, Any]], 
        start_id: str = "START"
    ) -> List[str]:
        """Trouve les nœuds inatteignables depuis START.
        
        Args:
            nodes: Liste de nœuds.
            edges: Liste d'edges.
            start_id: ID du nœud de départ.
            
        Returns:
            Liste d'IDs de nœuds inatteignables.
        """
        reachable = GraphValidationService._find_reachable_nodes(start_id, edges)
        all_node_ids = {node.get("id") for node in nodes if node.get("id")}
        
        unreachable = []
        for node_id in all_node_ids:
            if node_id == "END":
                continue
            if node_id not in reachable:
                unreachable.append(node_id)
        
        return unreachable
