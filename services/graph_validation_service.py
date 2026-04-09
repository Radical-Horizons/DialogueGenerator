"""Service de validation de graphes de dialogues."""
import logging
import hashlib
from collections import defaultdict, deque
from typing import Any, Dict, List, Optional, Set, Tuple

logger = logging.getLogger(__name__)

# Nœuds structurels exclus du décompte de couverture (total_nodes, FR47)
_NON_CONTENT_NODE_TYPES: frozenset = frozenset({"endNode", "testNode", "startNode"})


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


def _node_data(node: Dict[str, Any]) -> Dict[str, Any]:
    """Retourne le dict `data` du nœud (React Flow / document), ou {}."""
    data = node.get("data")
    return data if isinstance(data, dict) else {}


def _is_dialogue_like(node_type: Optional[str]) -> bool:
    """True si le nœud est un nœud de dialogue au sens Unity / éditeur."""
    if not node_type:
        return False
    return node_type in ("dialogueNode", "dialogue")


def _resolve_graph_entry_node_id(nodes: List[Dict[str, Any]]) -> Optional[str]:
    """Résout l'identifiant du nœud d'entrée (FR40) : ``START`` si présent, sinon premier nœud hors ``END``/``testNode``.

    Args:
        nodes: Nœuds React Flow ou format document.

    Returns:
        Identifiant d'entrée ou ``None`` si aucun candidat.
    """
    for node in nodes:
        nid = _node_id(node)
        if nid == "START":
            return nid
    for node in nodes:
        nid = _node_id(node)
        ntype = _node_type(node)
        if nid and nid != "END" and ntype != "testNode":
            return nid
    return None


def _choices_have_exploitable_text(choices: Any) -> bool:
    """True si la liste contient au moins un choix avec texte non vide (UnityDialogueChoice.text).

    Partagé entre FR36 (champs requis / cohérence) et FR37 (complétude du contenu) : la même
    définition de « texte exploitable » évite des divergences tests / prod.
    """
    if not isinstance(choices, list):
        return False
    for item in choices:
        if not isinstance(item, dict):
            continue
        text = item.get("text")
        if text is not None and str(text).strip():
            return True
    return False


class GraphValidationService:
    """Service pour valider des graphes de dialogues."""
    
    @staticmethod
    def validate_graph(
        nodes: List[Dict[str, Any]], 
        edges: List[Dict[str, Any]]
    ) -> ValidationResult:
        """Valide un graphe complet.
        
        Chaque étape parcourt au plus une fois la liste des nœuds ou des arêtes
        (pas de scan répété inutile) — cible NFR perf sur graphes typiques.
        
        Args:
            nodes: Liste de nœuds ReactFlow.
            edges: Liste d'edges ReactFlow.
            
        Returns:
            Résultat de validation avec erreurs et warnings.
        """
        result = ValidationResult()
        
        # Validation 1: Nœuds sans identifiant technique utilisable (stableID)
        GraphValidationService._validate_stable_ids(nodes, result)
        
        # Validation 2: Références cassées (edges vers nœuds inexistants)
        GraphValidationService._validate_broken_references(nodes, edges, result)
        
        # Validation 3: Nœuds orphelins (pas de connexion entrante sauf START)
        GraphValidationService._validate_orphan_nodes(nodes, edges, result)
        
        # Validation 4: Nœuds inatteignables depuis START
        GraphValidationService._validate_unreachable_nodes(nodes, edges, result)
        
        # Validation 5: Structure Unity FR36 (DisplayName, data.id, texte dialogue)
        GraphValidationService._validate_unity_dialogue_structure(nodes, result)
        
        # Validation 6: Nœuds de test sans attribut test
        GraphValidationService._validate_test_node_content(nodes, result)
        
        # Validation 7: Cycles (optionnel, warning seulement)
        GraphValidationService._validate_cycles(nodes, edges, result)
        
        logger.info(
            f"Validation terminée: {len(result.errors)} erreurs, "
            f"{len(result.warnings)} warnings"
        )
        
        return result
    
    @staticmethod
    def _validate_stable_ids(nodes: List[Dict[str, Any]], result: ValidationResult):
        """Valide que chaque nœud a un identifiant technique (racine ou data.id)."""
        for i, node in enumerate(nodes):
            if not _node_id(node):
                result.add_error(
                    "missing_stable_id",
                    None,
                    f"Nœud à l'index {i} : stableID manquant",
                )

    @staticmethod
    def _validate_unity_dialogue_structure(
        nodes: List[Dict[str, Any]], result: ValidationResult
    ) -> None:
        """Vérifie DisplayName, cohérence data.id et texte pour les nœuds dialogue.

        - **FR36 (structure)** : DisplayName, alignement ``data.id`` / racine, champs requis.
        - **FR37 (complétude contenu)** : absence de ``line`` et de choix au texte exploitable ;
          message et surlignage côté client distincts des seules erreurs « structure ».

        ``endNode`` / ``START`` / ``END`` : pas de règle texte dialogue (END vide exclu, AC 4.2).

        Complexité O(n) sur le nombre de nœuds (une passe, sans re-parcours).
        """
        for node in nodes:
            node_id = _node_id(node)
            node_type = _node_type(node)
            data = _node_data(node)

            if not node_id:
                continue
            if node_id in ("START", "END") or node_type in ("testNode", "endNode"):
                continue
            if not _is_dialogue_like(node_type):
                continue

            root_id = node.get("id")
            if root_id:
                data_id = data.get("id")
                if data_id is None or str(data_id).strip() == "":
                    result.add_error(
                        "missing_stable_id",
                        str(root_id),
                        f"Nœud [{root_id}] : identifiant document (data.id) manquant",
                    )
                elif str(data_id) != str(root_id):
                    result.add_error(
                        "missing_stable_id",
                        str(root_id),
                        f"Nœud [{root_id}] : data.id incohérent avec l'identifiant du nœud",
                    )

            raw_display = (
                data.get("displayName") or data.get("title") or data.get("label") or ""
            )
            display = str(raw_display).strip() if raw_display is not None else ""
            if not display:
                result.add_error(
                    "missing_display_name",
                    node_id,
                    f"Nœud [{node_id}] : DisplayName manquant",
                )

            line_val = data.get("line")
            has_line = bool(line_val and str(line_val).strip())
            choices = data.get("choices")
            has_choices = _choices_have_exploitable_text(choices)
            if not has_line and not has_choices:
                result.add_error(
                    "missing_dialogue_text",
                    node_id,
                    f"Nœud [{node_id}] : contenu vide (ni dialogue ni choix)",
                )

    @staticmethod
    def _validate_test_node_content(nodes: List[Dict[str, Any]], result: ValidationResult):
        """Valide que les nœuds de test ont un attribut ``test`` (FR37 complétude, type ``missing_test``)."""
        for node in nodes:
            node_id = _node_id(node)
            node_type = _node_type(node) or "dialogueNode"
            node_data = _node_data(node)

            if node_id == "END":
                continue

            if node_type == "testNode":
                if not node_data.get("test"):
                    result.add_error(
                        "missing_test",
                        node_id,
                        f"Nœud test [{node_id}] : test d'attribut manquant",
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
        entry_id = _resolve_graph_entry_node_id(nodes)

        node_ids = {nid for node in nodes for nid in (_node_id(node),) if nid}
        targets = {edge.get("target") for edge in edges if edge.get("target")}

        for node_id in node_ids:
            if node_id == entry_id or node_id == "END":
                continue
            if node_id not in targets:
                result.add_warning(
                    "orphan_node",
                    node_id,
                    (
                        f"Nœud « {node_id} » : aucune connexion entrante (orphelin). "
                        "À ne pas confondre avec un nœud relié mais sur une branche "
                        "inaccessible depuis l'entrée (voir « inatteignable »)."
                    ),
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
        start_node_id = _resolve_graph_entry_node_id(nodes)
        if not start_node_id:
            result.add_error(
                "missing_start",
                None,
                "Aucun nœud d'entrée résolu (START ou premier nœud dialogue hors test/END)",
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
                    (
                        f"Nœud « {node_id} » : inatteignable depuis l'entrée du dialogue "
                        "(peut toutefois avoir des connexions entrantes ; îlot séparé)."
                    ),
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
        
        # BFS — deque.popleft() O(1) vs list.pop(0) O(n)
        reachable: Set[str] = {start_id}
        queue: deque[str] = deque([start_id])

        while queue:
            current = queue.popleft()
            for neighbor in adjacency.get(current, []):
                if neighbor not in reachable:
                    reachable.add(neighbor)
                    queue.append(neighbor)

        return reachable
    
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
        
        # Tester depuis tous les nœuds non visités (id racine ou data.id)
        for node in nodes:
            node_id = _node_id(node)
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
    def simulate_flow(
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
    ) -> "ValidationResult":
        """Simule le flux pour détecter dead ends et cul-de-sacs (FR46). O(V+E) BFS.

        Args:
            nodes: Nœuds React Flow.
            edges: Arêtes React Flow.

        Returns:
            :class:`ValidationResult` avec ``errors`` (dead ends) et ``warnings`` (cul-de-sacs).
        """
        result = ValidationResult()
        start_id = _resolve_graph_entry_node_id(nodes)
        if not start_id:
            result.add_error(
                "missing_start",
                None,
                "Aucun nœud d'entrée résolu (START ou premier nœud dialogue hors test/END)",
            )
            return result

        reachable = GraphValidationService._find_reachable_nodes(start_id, edges)
        GraphValidationService._validate_dead_ends(nodes, reachable, result)
        GraphValidationService._validate_cul_de_sacs(nodes, edges, reachable, result)

        logger.info(
            "simulate_flow terminé: %d dead ends, %d cul-de-sacs",
            len(result.errors),
            len(result.warnings),
        )
        return result

    @staticmethod
    def _validate_dead_ends(
        nodes: List[Dict[str, Any]],
        reachable: Set[str],
        result: "ValidationResult",
    ) -> None:
        """Signale les nœuds inatteignables comme dead ends (``dead_end_node``, erreur).

        Args:
            nodes: Nœuds du graphe.
            reachable: Set d'IDs atteignables (pré-calculé par l'appelant).
            result: Résultat de validation à compléter.
        """
        for node in nodes:
            nid = _node_id(node)
            if not nid or nid == "END":
                continue
            if nid not in reachable:
                result.add_error(
                    "dead_end_node",
                    nid,
                    f"Nœud « {nid} » : inatteignable depuis l'entrée du dialogue (dead end).",
                )

    @staticmethod
    def _validate_cul_de_sacs(
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        reachable: Set[str],
        result: "ValidationResult",
    ) -> None:
        """Signale les cul-de-sacs parmi les nœuds atteignables (``cul_de_sac_node``, warning).

        Args:
            nodes: Nœuds du graphe.
            edges: Arêtes du graphe.
            reachable: Set d'IDs atteignables depuis l'entrée.
            result: Résultat de validation à compléter.
        """
        entry_id = _resolve_graph_entry_node_id(nodes)

        # Index arêtes sortantes par source
        outgoing: Dict[str, List[str]] = defaultdict(list)
        for edge in edges:
            src = edge.get("source")
            tgt = edge.get("target")
            if src and tgt:
                outgoing[src].append(tgt)

        for node in nodes:
            nid = _node_id(node)
            ntype = _node_type(node)
            if not nid or nid == "END" or ntype == "testNode" or nid == entry_id:
                continue
            if nid not in reachable:
                continue  # dead end — déjà couvert
            targets = outgoing.get(nid, [])
            non_end_targets = [t for t in targets if t != "END"]
            if not non_end_targets:
                result.add_warning(
                    "cul_de_sac_node",
                    nid,
                    (
                        f"Nœud « {nid} » : cul-de-sac — toutes les sorties aboutissent à END "
                        "ou aucune sortie (non-END) n'est définie."
                    ),
                )

    @staticmethod
    def _compute_coverage_stats(
        nodes: List[Dict[str, Any]],
        dead_end_ids: List[str],
        cul_de_sac_count: int,
    ) -> "FlowCoverageStats":
        """Calcule les statistiques de couverture (FR47). Exclut endNode/testNode/startNode.

        Args:
            nodes: Nœuds du graphe.
            dead_end_ids: IDs inatteignables à compter parmi les nœuds contenu.
            cul_de_sac_count: Nombre de cul-de-sacs.

        Returns:
            :class:`FlowCoverageStats` avec les métriques de couverture.
        """
        from api.schemas.graph import FlowCoverageStats

        content_ids = {
            _node_id(n) for n in nodes
            if _node_type(n) not in _NON_CONTENT_NODE_TYPES and _node_id(n) not in (None, "END")
        }
        total = len(content_ids)
        dead_end_content_count = sum(1 for nid in dead_end_ids if nid in content_ids)
        accessible = total - dead_end_content_count
        percentage = round(accessible / total * 100, 1) if total > 0 else 100.0
        return FlowCoverageStats(
            total_nodes=total,
            accessible_count=accessible,
            dead_end_count=dead_end_content_count,
            cul_de_sac_count=cul_de_sac_count,
            coverage_percentage=percentage,
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
        node_ids = {nid for node in nodes for nid in (_node_id(node),) if nid}
        targets = {edge.get("target") for edge in edges if edge.get("target")}
        entry_id = _resolve_graph_entry_node_id(nodes)

        orphans = []
        for node_id in node_ids:
            if node_id == entry_id or node_id == "END":
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
        node_ids = {nid for node in nodes for nid in (_node_id(node),) if nid}
        broken_refs: List[Dict[str, Any]] = []
        
        for node in nodes:
            node_id = _node_id(node)
            node_data = _node_data(node)
            
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
        """Trouve les nœuds inatteignables depuis un nœud de départ donné.

        Pour le même critère que ``validate_graph`` (entrée START ou premier dialogue),
        préférer l’id retourné par la fonction module ``_resolve_graph_entry_node_id(nodes)``
        puis appeler avec cet id explicite ;
        la valeur par défaut ``START`` ne couvre pas les graphes sans nœud nommé START.

        Args:
            nodes: Liste de nœuds.
            edges: Liste d'edges.
            start_id: ID du nœud de départ pour le BFS.

        Returns:
            Liste d'IDs de nœuds inatteignables.
        """
        reachable = GraphValidationService._find_reachable_nodes(start_id, edges)
        all_node_ids = {nid for node in nodes for nid in (_node_id(node),) if nid}
        
        unreachable = []
        for node_id in all_node_ids:
            if node_id == "END":
                continue
            if node_id not in reachable:
                unreachable.append(node_id)
        
        return unreachable
