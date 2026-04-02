"""Service de gestion des règles de sélection de contexte GDD (Story 3.4)."""
from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from api.schemas.context_rules import ContextRule, CreateRuleRequest, RuleCondition, UpdateRuleRequest

logger = logging.getLogger(__name__)


class ContextRuleService:
    """Gère le cycle de vie des règles de sélection de contexte GDD.

    Les règles sont persistées dans un fichier JSON (data/context-rules/rules.json).
    Toutes les opérations d'écriture sont thread-safe via un verrou par fichier.
    """

    def __init__(self, storage_file: Path) -> None:
        """Initialise le service avec le chemin du fichier de stockage.

        Args:
            storage_file: Chemin vers le fichier JSON de persistance.
        """
        self._storage_file = storage_file
        self._lock = threading.Lock()
        storage_file.parent.mkdir(parents=True, exist_ok=True)
        logger.debug("ContextRuleService initialisé avec %s", storage_file)

    @staticmethod
    def _normalize_dialogue_type(dialogue_type: str) -> str:
        """Normalise un type de dialogue pour l'utiliser comme clé stable."""
        return dialogue_type.strip().lower()

    # -------------------------------------------------------------------------
    # API publique
    # -------------------------------------------------------------------------

    def list_rules(self) -> list[ContextRule]:
        """Retourne toutes les règles triées par priorité croissante.

        Returns:
            Liste des règles triées par ``priority`` (plus petit = premier).
        """
        return sorted(self._load_rules(), key=lambda r: r.priority)

    def get_rule(self, rule_id: str) -> Optional[ContextRule]:
        """Retourne une règle par son identifiant.

        Args:
            rule_id: Identifiant UUID de la règle.

        Returns:
            La règle trouvée, ou None si elle n'existe pas.
        """
        return next((r for r in self._load_rules() if r.id == rule_id), None)

    def create_rule(self, data: CreateRuleRequest) -> ContextRule:
        """Crée et persiste une nouvelle règle.

        Args:
            data: Corps de la requête de création.

        Returns:
            La règle créée avec son identifiant généré.
        """
        with self._lock:
            rules = self._load_rules_unlocked()
            now = datetime.now(timezone.utc).isoformat()
            priority = (
                data.priority
                if data.priority is not None
                else (max((r.priority for r in rules), default=0) + 1)
            )
            rule = ContextRule(
                id=str(uuid.uuid4()),
                name=data.name,
                enabled=data.enabled,
                priority=priority,
                condition_operator=data.condition_operator,
                conditions=data.conditions,
                suggested_types=data.suggested_types,
                dialogue_type=(
                    self._normalize_dialogue_type(data.dialogue_type)
                    if data.dialogue_type
                    else None
                ),
                created_at=now,
                updated_at=now,
            )
            rules.append(rule)
            self._save_rules_unlocked(rules)
            logger.info("Règle créée : %s (id=%s)", rule.name, rule.id)
            return rule

    def update_rule(self, rule_id: str, data: UpdateRuleRequest) -> Optional[ContextRule]:
        """Met à jour une règle existante.

        Args:
            rule_id: Identifiant de la règle à modifier.
            data: Champs à modifier (seuls les champs non-None sont appliqués).

        Returns:
            La règle mise à jour, ou None si l'identifiant est inconnu.
        """
        with self._lock:
            rules = self._load_rules_unlocked()
            idx = next((i for i, r in enumerate(rules) if r.id == rule_id), None)
            if idx is None:
                return None
            existing = rules[idx]
            updated = ContextRule(
                id=existing.id,
                name=data.name if data.name is not None else existing.name,
                enabled=data.enabled if data.enabled is not None else existing.enabled,
                priority=data.priority if data.priority is not None else existing.priority,
                condition_operator=(
                    data.condition_operator
                    if data.condition_operator is not None
                    else existing.condition_operator
                ),
                conditions=data.conditions if data.conditions is not None else existing.conditions,
                suggested_types=(
                    data.suggested_types
                    if data.suggested_types is not None
                    else existing.suggested_types
                ),
                dialogue_type=(
                    self._normalize_dialogue_type(data.dialogue_type)
                    if data.dialogue_type is not None and data.dialogue_type != ""
                    else (None if data.dialogue_type == "" else existing.dialogue_type)
                ),
                created_at=existing.created_at,
                updated_at=datetime.now(timezone.utc).isoformat(),
            )
            rules[idx] = updated
            self._save_rules_unlocked(rules)
            logger.info("Règle modifiée : %s (id=%s)", updated.name, updated.id)
            return updated

    def delete_rule(self, rule_id: str) -> bool:
        """Supprime une règle.

        Args:
            rule_id: Identifiant de la règle à supprimer.

        Returns:
            True si la règle existait et a été supprimée, False sinon.
        """
        with self._lock:
            rules = self._load_rules_unlocked()
            new_rules = [r for r in rules if r.id != rule_id]
            if len(new_rules) == len(rules):
                return False
            self._save_rules_unlocked(new_rules)
            logger.info("Règle supprimée : id=%s", rule_id)
            return True

    def evaluate_rules(
        self,
        trigger_type: str,
        trigger_name: str,
        already_selected: dict[str, set[str]],
        dialogue_type: Optional[str] = None,
    ) -> Optional[set[str]]:
        """Évalue les règles actives contre le trigger et la sélection courante.

        Logique de filtrage :
        - Si aucune règle active : retourne None → le caller applique le
          comportement par défaut Story 3.3 (toutes entités GDD liées).
        - Si des règles sont actives mais aucune ne matche : retourne set()
          → aucune suggestion (filtrage maximal).
        - Si des règles matchent : retourne l'union des ``suggested_types``.

        Args:
            trigger_type: Type de l'entité qui vient d'être sélectionnée.
            trigger_name: Nom de l'entité qui vient d'être sélectionnée.
            already_selected: Mapping type → ensemble de noms déjà sélectionnés.

        Returns:
            Ensemble des types suggérés, ou None si aucune règle active (fallback).
        """
        enabled_rules = [
            r for r in self.list_rules_for_dialogue_type(dialogue_type) if r.enabled
        ]
        if not enabled_rules:
            return None

        all_selected: dict[str, set[str]] = {k: set(v) for k, v in already_selected.items()}
        all_selected.setdefault(trigger_type, set()).add(trigger_name)

        matched_types: set[str] = set()
        for rule in enabled_rules:
            if self._rule_conditions_met(rule, all_selected):
                matched_types.update(rule.suggested_types)
        return matched_types

    def list_rules_for_dialogue_type(self, dialogue_type: Optional[str]) -> list[ContextRule]:
        """Retourne les règles spécifiques d'un type, sinon fallback global."""
        rules = self._load_rules()
        if not dialogue_type:
            global_rules = [rule for rule in rules if rule.dialogue_type is None]
            return sorted(global_rules, key=lambda r: r.priority)

        normalized = self._normalize_dialogue_type(dialogue_type)
        specific = [rule for rule in rules if rule.dialogue_type == normalized]
        if specific:
            return sorted(specific, key=lambda r: r.priority)
        global_rules = [rule for rule in rules if rule.dialogue_type is None]
        return sorted(global_rules, key=lambda r: r.priority)

    def get_rules_for_dialogue_type(self, dialogue_type: str) -> tuple[str, list[ContextRule]]:
        """Retourne (source, règles) avec fallback global si aucune règle spécifique."""
        rules = self._load_rules()
        normalized = self._normalize_dialogue_type(dialogue_type)
        specific = [rule for rule in rules if rule.dialogue_type == normalized]
        if specific:
            return "specific", sorted(specific, key=lambda r: r.priority)
        global_rules = [rule for rule in rules if rule.dialogue_type is None]
        return "fallback_global", sorted(global_rules, key=lambda r: r.priority)

    # -------------------------------------------------------------------------
    # Logique interne
    # -------------------------------------------------------------------------

    def _rule_conditions_met(
        self, rule: ContextRule, all_selected: dict[str, set[str]]
    ) -> bool:
        """Vérifie si les conditions d'une règle sont satisfaites.

        Args:
            rule: Règle à évaluer.
            all_selected: Sélection totale (trigger inclus).

        Returns:
            True si les conditions sont remplies selon l'opérateur de la règle.
        """
        results = [self._condition_met(cond, all_selected) for cond in rule.conditions]
        if rule.condition_operator == "AND":
            return all(results)
        return any(results)

    def _condition_met(
        self, condition: RuleCondition, all_selected: dict[str, set[str]]
    ) -> bool:
        """Vérifie si une condition individuelle est satisfaite.

        Args:
            condition: Condition à évaluer (RuleCondition).
            all_selected: Sélection totale.

        Returns:
            True si la condition est vérifiée.
        """
        selected_names = all_selected.get(condition.entity_type, set())
        if condition.entity_name is None:
            return len(selected_names) > 0
        return condition.entity_name in selected_names

    def _load_rules(self) -> list[ContextRule]:
        """Charge les règles avec verrou."""
        with self._lock:
            return self._load_rules_unlocked()

    def _load_rules_unlocked(self) -> list[ContextRule]:
        """Charge les règles depuis le fichier JSON (sans verrou).

        Doit être appelée depuis un contexte déjà verrouillé.

        Returns:
            Liste des règles, ou liste vide si le fichier est absent/invalide.
        """
        if not self._storage_file.exists():
            return []
        try:
            with open(self._storage_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return [ContextRule(**r) for r in data.get("rules", [])]
        except Exception as exc:
            logger.error(
                "Erreur lors du chargement des règles depuis %s: %s",
                self._storage_file,
                exc,
            )
            raise RuntimeError(
                f"Fichier de règles contexte invalide ou illisible: {self._storage_file}"
            ) from exc

    def _save_rules_unlocked(self, rules: list[ContextRule]) -> None:
        """Sauvegarde les règles dans le fichier JSON (sans verrou).

        Utilise une écriture atomique (fichier temporaire + renommage) pour
        garantir qu'une interruption en cours d'écriture ne corrompt pas les données.

        Doit être appelée depuis un contexte déjà verrouillé.

        Args:
            rules: Liste des règles à persister.

        Raises:
            IOError: En cas d'erreur d'écriture.
        """
        try:
            tmp_fd, tmp_path = tempfile.mkstemp(
                dir=self._storage_file.parent,
                prefix=".rules_tmp_",
                suffix=".json",
            )
            try:
                with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
                    json.dump(
                        {
                            "rules": [
                                r.model_dump(mode="json", by_alias=False) for r in rules
                            ]
                        },
                        f,
                        indent=2,
                        ensure_ascii=False,
                    )
                os.replace(tmp_path, self._storage_file)
            except Exception:
                os.unlink(tmp_path)
                raise
        except IOError as exc:
            logger.error(
                "Erreur lors de la sauvegarde des règles dans %s: %s",
                self._storage_file,
                exc,
            )
            raise
