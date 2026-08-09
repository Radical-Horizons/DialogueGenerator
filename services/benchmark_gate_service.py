"""Portes structurelles du mode benchmark, appliquées avant toute notation.

Une génération qui échoue à une porte n'est pas une génération médiocre : c'est
une génération inutilisable. Elle est marquée ``invalid`` et exclue des moyennes
plutôt que notée zéro, qui écraserait la moyenne d'un modèle par ailleurs bon.
Le taux de validité par modèle, calculé à partir de ces verdicts, est une mesure
de premier ordre pour un usage en production.

Les portes composent les validateurs déjà présents dans le dépôt ; aucune règle
de validation n'est réécrite ici.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List, Optional

from api.schemas.benchmark import BenchmarkCaseExpectations, BenchmarkGateFailure
from api.utils.unity_schema_validator import validate_unity_json_structured
from services.benchmark_language_gate import detect_language
from services.dialogue_flag_reference_validation_service import (
    DialogueFlagReferenceValidationService,
)

logger = logging.getLogger(__name__)

MAX_SCHEMA_FAILURES_REPORTED = 5
"""Au-delà, le détail schéma est tronqué — le verdict, lui, reste complet."""


def _collect_text(nodes: List[Dict[str, Any]]) -> str:
    """Concatène le texte créatif des nœuds (répliques et libellés de choix).

    Args:
        nodes: Nœuds Unity de la génération.

    Returns:
        Texte concaténé, utilisé par les portes « langue » et « non vide ».
    """
    parts: List[str] = []
    for node in nodes:
        if not isinstance(node, dict):
            continue
        line = node.get("line")
        if isinstance(line, str):
            parts.append(line)
        for choice in node.get("choices") or []:
            if not isinstance(choice, dict):
                continue
            for key in ("text", "line"):
                value = choice.get(key)
                if isinstance(value, str):
                    parts.append(value)
    return "\n".join(part for part in parts if part.strip())


def _longest_line_word_count(nodes: List[Dict[str, Any]]) -> int:
    """Compte les mots de la réplique la plus longue.

    Le plafond du GDD porte sur **un panneau**, pas sur la génération entière :
    une arborescence de six nœuds courts ne doit pas être recalée parce que la
    somme dépasse, et un seul nœud-fleuve doit l'être même si les autres sont brefs.

    Args:
        nodes: Nœuds Unity de la génération.

    Returns:
        Nombre de mots de la réplique la plus longue ; 0 si aucune réplique.
    """
    counts = [
        len(node["line"].split())
        for node in nodes
        if isinstance(node, dict) and isinstance(node.get("line"), str)
    ]
    return max(counts) if counts else 0


def _duplicate_choice_ids(nodes: List[Dict[str, Any]]) -> List[str]:
    """Relève les ``choiceId`` dupliqués au sein d'un même nœud.

    Args:
        nodes: Nœuds Unity de la génération.

    Returns:
        Identifiants dupliqués, triés.
    """
    duplicates: set[str] = set()
    for node in nodes:
        if not isinstance(node, dict):
            continue
        seen: set[str] = set()
        for choice in node.get("choices") or []:
            if not isinstance(choice, dict):
                continue
            choice_id = choice.get("choiceId")
            if not isinstance(choice_id, str) or not choice_id.strip():
                continue
            if choice_id in seen:
                duplicates.add(choice_id)
            seen.add(choice_id)
    return sorted(duplicates)


class BenchmarkGateService:
    """Applique les portes structurelles à une génération brute."""

    def __init__(
        self,
        flag_validation_service: Optional[DialogueFlagReferenceValidationService] = None,
    ) -> None:
        """Initialise le service.

        Args:
            flag_validation_service: Validateur de références de flags. Optionnel :
                sans catalogue de flags disponible, la porte « flags » est neutre
                plutôt que faussement bloquante.
        """
        self._flag_validation_service = flag_validation_service

    def evaluate(
        self,
        json_content: Optional[str],
        *,
        expectations: Optional[BenchmarkCaseExpectations] = None,
    ) -> List[BenchmarkGateFailure]:
        """Évalue toutes les portes applicables sur une génération.

        Args:
            json_content: Sortie Unity brute renvoyée par l'orchestrateur.
            expectations: Attentes structurelles du cas, le cas échéant.

        Returns:
            Liste des portes échouées. Vide si la génération est valide.
            L'échec de la porte ``parsable`` court-circuite les suivantes : sans
            document exploitable, les autres verdicts n'auraient pas de sens.
        """
        if not json_content or not json_content.strip():
            return [
                BenchmarkGateFailure(gate="non_empty", message="Génération vide", severity="blocking")
            ]

        try:
            parsed = json.loads(json_content)
        except json.JSONDecodeError as exc:
            return [
                BenchmarkGateFailure(
                    gate="parsable",
                    message=f"JSON non parsable : {exc}",
                    severity="blocking",
                )
            ]

        nodes = self._extract_nodes(parsed)
        if nodes is None:
            return [
                BenchmarkGateFailure(
                    gate="parsable",
                    message="Structure inattendue : ni document Unity ni liste de nœuds",
                    severity="blocking",
                )
            ]

        failures: List[BenchmarkGateFailure] = []
        if not nodes:
            failures.append(
                BenchmarkGateFailure(gate="non_empty", message="Aucun nœud généré", severity="blocking")
            )

        failures.extend(self._connectivity_failures(nodes))
        failures.extend(self._schema_failures(parsed))
        failures.extend(self._choice_id_failures(nodes))
        failures.extend(self._flag_failures(parsed, nodes))
        failures.extend(self._expectation_failures(nodes, expectations))

        text = _collect_text(nodes)
        if nodes and not text.strip():
            failures.append(
                BenchmarkGateFailure(
                    gate="non_empty",
                    message="Nœuds sans texte de réplique ni libellé de choix",
                    severity="blocking",
                )
            )
        else:
            verdict = detect_language(text)
            if not verdict.is_french:
                failures.append(
                    BenchmarkGateFailure(
                        gate="language",
                        message=f"Sortie non française ({verdict.detector}) : {verdict.reason}",
                        # Seule exception au principe « une valeur technique ne
                        # disqualifie pas » : la langue n'est pas une borne, c'est
                        # ce qui rend la grille applicable. « Justesse de la voix »
                        # et « tenue du français » ne se notent pas sur un texte
                        # anglais — la note existerait sans rien mesurer. Défaut
                        # très corrigeable au prompt, donc à relire si le besoin
                        # produit change.
                        severity="blocking",
                    )
                )

        return failures

    def detect_language_of(self, json_content: Optional[str]) -> Optional[str]:
        """Retourne le détecteur qui trancherait la langue de cette génération.

        Permet au moteur de run d'enregistrer le détecteur dans chaque record sans
        dépendre d'un état résiduel du service (partagé entre les runs).

        Args:
            json_content: Sortie Unity brute.

        Returns:
            Nom du détecteur, ou ``None`` si la génération n'est pas exploitable.
        """
        if not json_content or not json_content.strip():
            return None
        try:
            parsed = json.loads(json_content)
        except json.JSONDecodeError:
            return None
        nodes = self._extract_nodes(parsed)
        if not nodes:
            return None
        return detect_language(_collect_text(nodes)).detector

    @staticmethod
    def _extract_nodes(parsed: Any) -> Optional[List[Dict[str, Any]]]:
        """Extrait la liste de nœuds d'un document Unity ou d'une liste brute.

        Args:
            parsed: Structure décodée depuis le JSON.

        Returns:
            La liste de nœuds, ou ``None`` si la structure est inattendue.
        """
        if isinstance(parsed, list):
            return [node for node in parsed if isinstance(node, dict)]
        if isinstance(parsed, dict):
            nodes = parsed.get("nodes")
            if isinstance(nodes, list):
                return [node for node in nodes if isinstance(node, dict)]
        return None

    @staticmethod
    def _schema_failures(parsed: Any) -> List[BenchmarkGateFailure]:
        """Valide la génération contre le schéma Unity.

        Args:
            parsed: Document ou liste de nœuds décodés.

        Returns:
            Une entrée de porte ``schema`` si le document est non conforme.
        """
        try:
            is_valid, errors = validate_unity_json_structured(parsed)
        except Exception as exc:  # le validateur touche au disque (schéma) et à jsonschema
            logger.warning("Validation de schéma Unity indisponible : %s", exc)
            return [
                BenchmarkGateFailure(
                    gate="schema",
                    message=f"Validation de schéma impossible : {exc}",
                )
            ]
        if is_valid:
            return []
        details = "; ".join(
            str(error.get("message", "")) for error in errors[:MAX_SCHEMA_FAILURES_REPORTED]
        )
        suffix = "" if len(errors) <= MAX_SCHEMA_FAILURES_REPORTED else f" (+{len(errors) - MAX_SCHEMA_FAILURES_REPORTED} autres)"
        return [
            BenchmarkGateFailure(
                gate="schema",
                message=f"Document Unity non conforme : {details}{suffix}",
            )
        ]

    @staticmethod
    def _expectation_failures(
        nodes: List[Dict[str, Any]],
        expectations: Optional[BenchmarkCaseExpectations],
    ) -> List[BenchmarkGateFailure]:
        """Confronte la génération aux attentes structurelles du cas.

        Un cas qui déclare attendre au moins trois branches pose une contrainte :
        la laisser sans effet rendrait `valid` un nœud à une seule option et
        laisserait croire à l'auteur qu'il a contraint la mesure.

        Args:
            nodes: Nœuds Unity de la génération.
            expectations: Attentes déclarées, ou ``None``.

        Returns:
            Les portes ``schema`` en échec pour non-respect des attentes.
        """
        if expectations is None or not nodes:
            return []
        failures: List[BenchmarkGateFailure] = []
        choice_counts = [len(node.get("choices") or []) for node in nodes]
        observed = max(choice_counts) if choice_counts else 0
        if expectations.min_choices is not None and observed < expectations.min_choices:
            failures.append(
                BenchmarkGateFailure(
                    gate="schema",
                    message=(
                        f"{observed} choix générés, {expectations.min_choices} attendus au minimum"
                    ),
                )
            )
        if expectations.max_choices is not None and observed > expectations.max_choices:
            failures.append(
                BenchmarkGateFailure(
                    gate="schema",
                    message=(
                        f"{observed} choix générés, {expectations.max_choices} attendus au maximum"
                    ),
                )
            )
        if expectations.min_panels is not None and len(nodes) < expectations.min_panels:
            failures.append(
                BenchmarkGateFailure(
                    gate="panel_count",
                    message=(
                        f"{len(nodes)} panneau(x) généré(s), {expectations.min_panels} "
                        f"attendus au minimum"
                    ),
                )
            )
        if expectations.max_words is not None:
            longest = _longest_line_word_count(nodes)
            if longest > expectations.max_words:
                failures.append(
                    BenchmarkGateFailure(
                        gate="length",
                        message=(
                            f"Panneau de {longest} mots, plafond du cas à "
                            f"{expectations.max_words}"
                        ),
                    )
                )
        if expectations.expected_flag_ids:
            blob = json.dumps(nodes, ensure_ascii=False)
            missing = [flag for flag in expectations.expected_flag_ids if flag not in blob]
            if missing:
                failures.append(
                    BenchmarkGateFailure(
                        gate="flags",
                        message=f"Flags attendus absents de la génération : {', '.join(missing)}",
                    )
                )
        return failures

    @staticmethod
    def _connectivity_failures(nodes: List[Dict[str, Any]]) -> List[BenchmarkGateFailure]:
        """Vérifie que le fragment se tient comme un graphe.

        Un fragment n'est pas une collection de panneaux : c'est une ouverture et
        des suites qu'on atteint. Un choix qui mène nulle part, un panneau que rien
        ne désigne ou deux panneaux au même identifiant produisent un dialogue
        injouable — que le juge, lui, noterait comme une œuvre.

        Args:
            nodes: Nœuds Unity de la génération.

        Returns:
            Les portes ``connectivity`` en échec.
        """
        if not nodes:
            return []
        failures: List[BenchmarkGateFailure] = []
        ids = [node.get("id") for node in nodes if isinstance(node.get("id"), str)]
        duplicates = sorted({node_id for node_id in ids if ids.count(node_id) > 1})
        if duplicates:
            failures.append(
                BenchmarkGateFailure(
                    gate="connectivity",
                    message=f"Panneaux au même identifiant : {', '.join(duplicates)}",
                )
            )

        known = set(ids)
        targeted: set[str] = set()
        dangling: List[str] = []
        for node in nodes:
            for choice in node.get("choices") or []:
                if not isinstance(choice, dict):
                    continue
                target = choice.get("targetNode")
                if not isinstance(target, str) or not target:
                    continue
                # `END` est un marqueur de fin de branche reconnu par Unity, pas un nœud.
                if target == "END":
                    continue
                targeted.add(target)
                if target not in known:
                    dangling.append(target)
        if dangling:
            failures.append(
                BenchmarkGateFailure(
                    gate="connectivity",
                    message=(
                        "Choix menant vers un panneau inexistant : "
                        f"{', '.join(sorted(set(dangling)))}"
                    ),
                )
            )

        # Le premier nœud est l'ouverture : rien n'a à le désigner.
        unreachable = [
            node_id for node_id in ids[1:] if node_id not in targeted
        ]
        if unreachable:
            failures.append(
                BenchmarkGateFailure(
                    gate="connectivity",
                    message=(
                        "Panneaux inatteignables, aucun choix n'y mène : "
                        f"{', '.join(sorted(set(unreachable)))}"
                    ),
                )
            )
        return failures

    @staticmethod
    def _choice_id_failures(nodes: List[Dict[str, Any]]) -> List[BenchmarkGateFailure]:
        """Détecte les identifiants de choix dupliqués.

        Args:
            nodes: Nœuds Unity de la génération.

        Returns:
            Une entrée de porte ``choice_ids`` en cas de doublon.
        """
        duplicates = _duplicate_choice_ids(nodes)
        if not duplicates:
            return []
        return [
            BenchmarkGateFailure(
                gate="choice_ids",
                message=f"choiceId dupliqués : {', '.join(duplicates)}",
            )
        ]

    def _flag_failures(
        self,
        parsed: Any,
        nodes: List[Dict[str, Any]],
    ) -> List[BenchmarkGateFailure]:
        """Vérifie l'intégrité des références de flags.

        Args:
            parsed: Document ou liste de nœuds décodés.
            nodes: Nœuds extraits.

        Returns:
            Une entrée de porte ``flags`` si une référence pointe vers un flag
            non déclaré. Les avertissements (flags déclarés non utilisés) ne sont
            pas bloquants : ils ne rendent pas la génération inutilisable.
        """
        if self._flag_validation_service is None:
            return []
        document = parsed if isinstance(parsed, dict) and "nodes" in parsed else {"nodes": nodes}
        try:
            result = self._flag_validation_service.analyze_document(document)
        except Exception as exc:  # catalogue de flags absent ou illisible
            logger.warning("Analyse des références de flags indisponible : %s", exc)
            return []
        if not result.errors:
            return []
        details = "; ".join(error.message for error in result.errors[:MAX_SCHEMA_FAILURES_REPORTED])
        return [
            BenchmarkGateFailure(
                gate="flags",
                message=f"Références de flags invalides : {details}",
            )
        ]
