"""Notation absolue d'une génération de benchmark par un modèle juge.

Un verdict à la fois. Trois garanties portées ici :

- les notes sont lues **uniquement** dans les champs structurés ; le raisonnement
  libre du juge est conservé pour audit et n'est jamais analysé ;
- la conformité à la grille est vérifiée après l'appel — tout identifiant manquant
  ou inventé produit un `judge_error` nommé, jamais un critère silencieusement
  ignoré ni un score par défaut ;
- le modèle juge est enregistré sur le verdict, parce que changer de juge change
  les résultats et que deux juges ne s'agrègent pas.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from pydantic import BaseModel

from api.schemas.benchmark import BenchmarkGenerationRecord
from api.schemas.benchmark_judging import CriteriaGrid, RubricVerdict
from core.llm.llm_client import ILLMClient
from core.prompt.benchmark_judge import (
    BENCHMARK_RUBRIC_JUDGE_SYSTEM_PROMPT,
    build_rubric_judge_user_prompt,
)
from models.benchmark_judge_output import BenchmarkRubricJudgeResult

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    """Horodatage ISO-8601 en UTC."""
    return datetime.now(timezone.utc).isoformat()


def measure_text_length(json_content: Optional[str]) -> int:
    """Mesure la longueur du texte créatif d'une génération.

    La longueur est une mesure objective tenue **à côté** des notes du juge : le
    rapport doit pouvoir montrer qu'un modèle écrit le double de la consigne sans
    que cela se dissolve dans une note d'appréciation.

    Args:
        json_content: Génération Unity brute.

    Returns:
        Nombre de caractères de texte de réplique et de libellés de choix.
    """
    if not json_content:
        return 0
    try:
        parsed = json.loads(json_content)
    except json.JSONDecodeError:
        return 0
    nodes = parsed.get("nodes") if isinstance(parsed, dict) else parsed
    if not isinstance(nodes, list):
        return 0
    total = 0
    for node in nodes:
        if not isinstance(node, dict):
            continue
        line = node.get("line")
        if isinstance(line, str):
            total += len(line)
        for choice in node.get("choices") or []:
            if isinstance(choice, dict):
                text = choice.get("text")
                if isinstance(text, str):
                    total += len(text)
    return total


def validate_against_grid(
    result: BenchmarkRubricJudgeResult, grid: CriteriaGrid
) -> Tuple[Dict[str, int], Dict[str, str], Optional[str]]:
    """Confronte la réponse du juge à la grille attendue.

    Args:
        result: Réponse structurée du juge.
        grid: Grille employée.

    Returns:
        Triplet ``(scores, commentaires, erreur)``. ``erreur`` est ``None`` quand la
        réponse couvre exactement la grille ; sinon elle nomme les identifiants
        manquants et inconnus, et les scores retournés sont vides — un verdict
        partiel serait pire qu'un verdict absent.
    """
    expected = set(grid.criterion_ids())
    seen: Dict[str, int] = {}
    comments: Dict[str, str] = {}
    duplicates: List[str] = []

    for item in result.criteria:
        if item.criterion_id in seen:
            duplicates.append(item.criterion_id)
            continue
        seen[item.criterion_id] = item.score
        comments[item.criterion_id] = item.comment

    unknown = sorted(set(seen) - expected)
    missing = sorted(expected - set(seen))

    problems: List[str] = []
    if missing:
        problems.append(f"critères manquants : {', '.join(missing)}")
    if unknown:
        problems.append(f"identifiants inconnus de la grille : {', '.join(unknown)}")
    if duplicates:
        problems.append(f"critères notés deux fois : {', '.join(sorted(set(duplicates)))}")

    if problems:
        return {}, {}, " ; ".join(problems)

    return seen, comments, None


class BenchmarkJudgeService:
    """Produit un verdict rubrique pour une génération donnée."""

    def __init__(self, pricing_service: Any = None) -> None:
        """Initialise le service.

        Args:
            pricing_service: ``LLMPricingService`` optionnel, employé en repli quand
                le client n'expose pas de coût — sans lui, un client sans suivi
                d'usage laisserait le plafond budgétaire de la passe inopérant.
        """
        self._pricing_service = pricing_service

    def _resolve_cost(
        self,
        llm_client: Any,
        judge_model: str,
        prompt_tokens: int,
        completion_tokens: int,
    ) -> float:
        """Détermine le coût d'un appel de juge.

        ``last_call_cost`` vaut 0.0 quand le client n'a pas de service d'usage ou
        quand le suivi a échoué : s'en contenter laisserait ``spent`` à zéro pour
        toute la passe, et le plafond ne se déclencherait jamais.

        Args:
            llm_client: Client du juge.
            judge_model: Modèle juge.
            prompt_tokens: Tokens d'entrée rapportés.
            completion_tokens: Tokens de sortie rapportés.

        Returns:
            Coût en USD, replié sur la tarification quand le client ne le donne pas.
        """
        reported = float(getattr(llm_client, "last_call_cost", 0.0) or 0.0)
        if reported > 0.0 or self._pricing_service is None:
            return reported
        if not prompt_tokens and not completion_tokens:
            return reported
        try:
            return float(
                self._pricing_service.calculate_cost(
                    judge_model, prompt_tokens, completion_tokens
                )
            )
        except Exception as exc:
            logger.warning(
                "Repli tarifaire indisponible pour le juge '%s' : %s", judge_model, exc
            )
            return reported

    async def judge_rubric(
        self,
        *,
        record: BenchmarkGenerationRecord,
        grid: CriteriaGrid,
        llm_client: ILLMClient,
        judge_model: str,
    ) -> RubricVerdict:
        """Note une génération sur la grille fournie.

        Args:
            record: Génération à noter (supposée `valid`).
            grid: Grille de critères.
            llm_client: Client du modèle juge.
            judge_model: Identifiant du modèle juge, enregistré sur le verdict.

        Returns:
            Le verdict, `scored` ou `judge_error`. Aucune exception n'est propagée :
            un juge défaillant ne doit pas interrompre la passe entière.
        """
        base: Dict[str, Any] = {
            "run_id": record.run_id,
            "case_id": record.case_id,
            "model_id": record.model_id,
            "repetition": record.repetition,
            "judge_model": judge_model,
            "grid_id": grid.grid_id,
            "grid_version": grid.version,
            "text_length_chars": measure_text_length(record.json_content),
            "criteria_snapshot": list(grid.criteria),
            "created_at": _now_iso(),
        }

        if not (record.json_content or "").strip():
            return RubricVerdict(
                status="judge_error",
                error_message="Génération sans contenu : rien à noter",
                **base,
            )

        prompt = build_rubric_judge_user_prompt(grid, record.json_content or "")
        try:
            variants = await llm_client.generate_variants(
                prompt,
                k=1,
                response_model=BenchmarkRubricJudgeResult,
                user_system_prompt_override=BENCHMARK_RUBRIC_JUDGE_SYSTEM_PROMPT,
            )
        except Exception as exc:
            logger.warning(
                "Juge injoignable (%s / %s) : %s", record.model_id, record.case_id, exc
            )
            # Un appel qui lève après consommation a bien été facturé : l'imputer,
            # sinon la dépense réelle échappe au plafond.
            failed_prompt = int(getattr(llm_client, "last_usage_prompt_tokens", 0) or 0)
            failed_completion = int(getattr(llm_client, "last_usage_completion_tokens", 0) or 0)
            return RubricVerdict(
                status="judge_error",
                cost_usd=self._resolve_cost(
                    llm_client, judge_model, failed_prompt, failed_completion
                ),
                prompt_tokens=failed_prompt,
                completion_tokens=failed_completion,
                error_message=f"Appel du juge en échec : {type(exc).__name__}: {exc}",
                **base,
            )

        prompt_tokens = int(getattr(llm_client, "last_usage_prompt_tokens", 0) or 0)
        completion_tokens = int(getattr(llm_client, "last_usage_completion_tokens", 0) or 0)
        cost = self._resolve_cost(llm_client, judge_model, prompt_tokens, completion_tokens)
        base.update(
            cost_usd=cost,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
        )

        if not variants:
            return RubricVerdict(
                status="judge_error",
                error_message="Le juge n'a retourné aucune variante.",
                **base,
            )
        first = variants[0]
        if not isinstance(first, BenchmarkRubricJudgeResult):
            kind = type(first).__name__ if isinstance(first, BaseModel) else type(first).__name__
            return RubricVerdict(
                status="judge_error",
                error_message=f"Réponse du juge non structurée (reçu {kind}).",
                **base,
            )

        scores, comments, problem = validate_against_grid(first, grid)
        # Le raisonnement est conservé quoi qu'il arrive — c'est la pièce d'audit
        # qui permet de comprendre après coup pourquoi un verdict a été écarté.
        if problem is not None:
            return RubricVerdict(
                status="judge_error",
                reasoning=first.reasoning,
                error_message=f"Réponse non conforme à la grille : {problem}",
                **base,
            )

        return RubricVerdict(
            status="scored",
            scores=scores,
            comments=comments,
            reasoning=first.reasoning,
            **base,
        )
