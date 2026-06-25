"""Renderer for Unity JSON dialogue format."""

import json
import logging
from pathlib import Path
from typing import List, Dict, Any, Optional, Set, Tuple

# Imports d'Interaction supprimés - système obsolète remplacé par Unity JSON direct

logger = logging.getLogger(__name__)


class UnityJsonRenderer:
    """Renderer pour le format JSON Unity normalisé.
    
    Le format Unity attend un tableau de nœuds à la racine : [{"id": "...", ...}, ...]
    """
    
    # Champs de résultats de test dans les choix (4 résultats possibles)
    TEST_RESULT_FIELDS = [
        "testCriticalFailureNode",
        "testFailureNode",
        "testSuccessNode",
        "testCriticalSuccessNode",
    ]

    # Méthodes render_interactions, render_interactions_to_string, render_interactions_to_file,
    # et _interaction_to_node supprimées - système obsolète remplacé par Unity JSON direct
    
    def _normalize_node(self, node: Dict[str, Any]) -> Dict[str, Any]:
        """Normalise un nœud en supprimant les champs vides selon les règles Unity.
        
        Règles de normalisation :
        - Supprimer les champs vides (`""`, `null`)
        - Supprimer les booléens à `false` et nombres à `0` (valeurs par défaut)
        - Supprimer les tableaux/objets vides
        - Conserver toujours `id` et `targetNode` même s'ils sont vides
        
        Args:
            node: Dictionnaire représentant un nœud (peut être modifié).
            
        Returns:
            Dictionnaire normalisé.
        """
        normalized: Dict[str, Any] = {}
        
        # Conserver toujours 'id'
        if "id" in node:
            normalized["id"] = node["id"]
        
        # Parcourir tous les autres champs
        for key, value in node.items():
            if key == "id":
                continue  # Déjà traité
            
            # Conserver targetNode même s'il est vide
            if key == "targetNode":
                normalized[key] = value
                continue
            
            # Ignorer None et chaînes vides
            if value is None or value == "":
                continue
            
            # Ignorer booléens False
            if value is False:
                continue
            
            # Ignorer nombres à 0
            if isinstance(value, (int, float)) and value == 0:
                continue
            
            # Ignorer listes/tableaux vides
            if isinstance(value, list) and len(value) == 0:
                continue
            
            # Ignorer dictionnaires/objets vides
            if isinstance(value, dict) and len(value) == 0:
                continue
            
            # Récursivement normaliser les dictionnaires imbriqués
            if isinstance(value, dict):
                normalized_value = self._normalize_node(value)
                # Ne garder que si le dict normalisé n'est pas vide (sauf pour id/targetNode)
                if normalized_value or key in ("id", "targetNode"):
                    normalized[key] = normalized_value
            # Récursivement normaliser les choix dans choices[]
            elif isinstance(value, list) and value and isinstance(value[0], dict):
                normalized_choices = [self._normalize_node(choice) for choice in value]
                # Filtrer les choix vides (mais normalement il ne devrait pas y en avoir)
                normalized_choices = [c for c in normalized_choices if c]
                if normalized_choices:
                    normalized[key] = normalized_choices
            else:
                normalized[key] = value
        
        return normalized
    
    def _validate_choice_references(
        self,
        node_id: str,
        choices: List[Dict[str, Any]],
        valid_ids: Set[str],
        errors: List[str]
    ) -> None:
        """Valide les références dans les choix d'un nœud.
        
        Args:
            node_id: ID du nœud parent.
            choices: Liste des choix à valider.
            valid_ids: Ensemble des IDs de nœuds valides.
            errors: Liste d'erreurs à laquelle ajouter les erreurs trouvées.
        """
        for i, choice in enumerate(choices):
            choice_index = i + 1
            
            # Valider targetNode
            target = choice.get("targetNode")
            if target and target not in valid_ids:
                errors.append(
                    f"Nœud '{node_id}', choix {choice_index}: Référence invalide dans 'targetNode': '{target}'"
                )
            
            # Valider les 4 résultats de test
            for test_field in self.TEST_RESULT_FIELDS:
                test_target = choice.get(test_field)
                if test_target and test_target not in valid_ids:
                    errors.append(
                        f"Nœud '{node_id}', choix {choice_index}: Référence invalide dans '{test_field}': '{test_target}'"
                    )
    
    def validate_nodes(self, nodes: List[Dict[str, Any]]) -> Tuple[bool, List[str]]:
        """Valide une liste de nœuds Unity.
        
        Args:
            nodes: Liste de nœuds à valider.
            
        Returns:
            Tuple (is_valid, errors) où errors est la liste des messages d'erreur.
        """
        errors: List[str] = []
        
        # Vérifier qu'il y a au moins un nœud
        if not nodes:
            errors.append("Au moins un nœud est requis")
            return (False, errors)
        
        # Extraire tous les IDs
        node_ids = [node.get("id") for node in nodes]
        
        # Vérifier que tous les nœuds ont un ID
        if None in node_ids or "" in node_ids:
            errors.append("Tous les nœuds doivent avoir un 'id' non vide")
        
        # Vérifier que les IDs sont uniques
        if len(node_ids) != len(set(node_ids)):
            duplicate_ids = [id for id in node_ids if node_ids.count(id) > 1]
            errors.append(f"IDs dupliqués : {set(duplicate_ids)}")
        
        # Valider les références de nœuds
        valid_ids = set(id for id in node_ids if id)
        # "END" est un nœud spécial reconnu par Unity pour terminer le dialogue
        # Il peut être omis du JSON (Unity le gère), mais on l'ajoute généralement explicitement
        valid_ids.add("END")
        reference_fields = ["nextNode", "targetNode", "successNode", "failureNode", "testSuccessNode", "testFailureNode"]
        
        for node in nodes:
            node_id = node.get("id", "?")
            for ref_field in reference_fields:
                ref_value = node.get(ref_field)
                if ref_value and ref_value not in valid_ids:
                    errors.append(
                        f"Nœud '{node_id}': Référence invalide dans '{ref_field}': '{ref_value}'"
                    )
            
            # Valider les références dans choices[]
            choices = node.get("choices")
            if choices is not None:
                self._validate_choice_references(node_id, choices, valid_ids, errors)
        
        return (len(errors) == 0, errors)
    
    def render_unity_nodes(
        self,
        nodes: List[Dict[str, Any]],
        normalize: bool = True
    ) -> str:
        """Rend une liste de nœuds Unity en JSON normalisé.
        
        Cette méthode accepte directement des nœuds enrichis (avec IDs) et les normalise
        selon les règles Unity.
        
        Args:
            nodes: Liste de dictionnaires représentant les nœuds Unity (avec IDs).
            normalize: Si True, normalise le JSON (supprime champs vides, etc.).
            
        Returns:
            Chaîne JSON formatée (indentée de 2 espaces).
            
        Raises:
            ValueError: Si la validation échoue.
        """
        # Valider les nœuds avant rendu
        is_valid, errors = self.validate_nodes(nodes)
        if not is_valid:
            error_msg = "Erreurs de validation avant rendu :\n" + "\n".join(errors)
            logger.error(error_msg)
            raise ValueError(error_msg)
        
        # Normaliser si demandé
        if normalize:
            nodes = [self._normalize_node(node) for node in nodes]
        
        # Rendre en JSON
        return json.dumps(nodes, indent=2, ensure_ascii=False)

