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
from api.schemas.benchmark_judging import (
    CriteriaGrid,
    PairwiseCriterionOutcome,
    PairwiseVerdict,
    RubricVerdict,
)
from core.llm.llm_client import ILLMClient
from core.prompt.benchmark_judge import (
    BENCHMARK_PAIRWISE_JUDGE_SYSTEM_PROMPT,
    BENCHMARK_RUBRIC_JUDGE_SYSTEM_PROMPT,
    build_pairwise_judge_user_prompt,
    build_rubric_judge_user_prompt,
)
from models.benchmark_judge_output import (
    BenchmarkPairwiseJudgeResult,
    BenchmarkRubricJudgeResult,
)
from services.benchmark_pair_builder import PairAssignment

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
            return RubricVerdict(
                status="judge_error",
                error_message=(
                    "Réponse du juge non conforme au schéma — "
                    f"{describe_unusable_variant(first)}"
                ),
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


def _pairwise_conformity_problem(
    result: BenchmarkPairwiseJudgeResult, grid: CriteriaGrid
) -> Optional[str]:
    """Confronte une réponse de comparaison à la grille attendue.

    Args:
        result: Réponse structurée du juge.
        grid: Grille employée.

    Returns:
        Description du problème, ou ``None`` si la couverture est exacte.
    """
    expected = set(grid.criterion_ids())
    seen: List[str] = [item.criterion_id for item in result.criteria]
    unknown = sorted(set(seen) - expected)
    missing = sorted(expected - set(seen))
    duplicates = sorted({cid for cid in seen if seen.count(cid) > 1})

    problems: List[str] = []
    if missing:
        problems.append(f"critères manquants : {', '.join(missing)}")
    if unknown:
        problems.append(f"identifiants inconnus de la grille : {', '.join(unknown)}")
    if duplicates:
        problems.append(f"critères jugés deux fois : {', '.join(duplicates)}")
    return " ; ".join(problems) if problems else None


MAX_RAW_RESPONSE_IN_ERROR = 400
"""Longueur retenue de la réponse brute dans un message d'erreur de juge."""


def describe_unusable_variant(variant: Any) -> str:
    """Décrit une réponse de juge inexploitable, en conservant son contenu.

    Les clients LLM du dépôt n'échouent pas en levant : ils rangent le message
    d'erreur — y compris l'erreur Pydantic complète, qui **nomme le champ et la
    valeur fautive** — dans une chaîne à la place de l'objet attendu. Se contenter
    du nom du type jetterait précisément le diagnostic utile : « le juge a répondu
    "Proposition A" là où seules A, B ou tie sont admises ».

    Args:
        variant: Ce que le client a retourné à la place du modèle attendu.

    Returns:
        Description exploitable pour le champ d'erreur du verdict.
    """
    if isinstance(variant, str):
        text = variant.strip()
        if len(text) > MAX_RAW_RESPONSE_IN_ERROR:
            text = text[:MAX_RAW_RESPONSE_IN_ERROR] + "…"
        return f"réponse brute : {text}"
    return f"reçu {type(variant).__name__}"


def _label_to_model(label: str, first: str, second: str) -> Optional[str]:
    """Traduit une étiquette de position en identifiant de modèle.

    Args:
        label: ``A``, ``B`` ou ``tie``.
        first: Modèle occupant la position ``A`` dans ce sens de lecture.
        second: Modèle occupant la position ``B`` dans ce sens de lecture.

    Returns:
        Le modèle désigné, ou ``None`` pour une égalité.
    """
    if label == "A":
        return first
    if label == "B":
        return second
    return None


def aggregate_directions(
    forward: BenchmarkPairwiseJudgeResult,
    reverse: BenchmarkPairwiseJudgeResult,
    *,
    model_a: str,
    model_b: str,
) -> List[PairwiseCriterionOutcome]:
    """Agrège les deux sens de lecture d'un duel.

    Le sens direct présente ``model_a`` en position ``A`` ; le sens inverse les
    permute. Les deux verdicts sont ramenés à des identifiants de modèle avant
    comparaison : c'est ce qui neutralise le biais de position. Un juge qui
    désignerait systématiquement la première proposition produit alors deux
    gagnants contradictoires, donc une égalité — et le désaccord est enregistré,
    car il en dit long sur le juge.

    Args:
        forward: Verdict du sens direct (A = ``model_a``).
        reverse: Verdict du sens inverse (A = ``model_b``).
        model_a: Premier modèle du duel.
        model_b: Second modèle du duel.

    Returns:
        Un résultat agrégé par critère, dans l'ordre du sens direct.
    """
    reverse_by_id = {item.criterion_id: item for item in reverse.criteria}
    outcomes: List[PairwiseCriterionOutcome] = []

    for item in forward.criteria:
        counterpart = reverse_by_id.get(item.criterion_id)
        if counterpart is None:
            outcomes.append(
                PairwiseCriterionOutcome(criterion_id=item.criterion_id)
            )
            continue

        winner_forward = _label_to_model(item.winner, model_a, model_b)
        # Sens inverse : la position A est occupée par model_b.
        winner_reverse = _label_to_model(counterpart.winner, model_b, model_a)

        if winner_forward == winner_reverse:
            outcomes.append(
                PairwiseCriterionOutcome(
                    criterion_id=item.criterion_id,
                    winner_model_id=winner_forward,
                    margin=(
                        0.0
                        if winner_forward is None
                        else round((item.margin + counterpart.margin) / 2, 3)
                    ),
                    direction_disagreement=False,
                )
            )
            continue

        outcomes.append(
            PairwiseCriterionOutcome(
                criterion_id=item.criterion_id,
                winner_model_id=None,
                margin=0.0,
                direction_disagreement=True,
            )
        )
    return outcomes


class BenchmarkPairwiseJudgeService(BenchmarkJudgeService):
    """Compare deux générations d'un même cas, sous contrôle de biais.

    Chaque duel coûte deux appels : le sens direct et le sens inverse. C'est le
    prix du contrôle du biais de position, et il n'est pas négociable — un juge
    qui préfère systématiquement la première proposition ressort alors à égalité
    au lieu de dicter le classement.
    """

    async def _judge_one_direction(
        self,
        *,
        grid: CriteriaGrid,
        text_first: str,
        text_second: str,
        truncated: bool,
        llm_client: ILLMClient,
        judge_model: str,
    ) -> Tuple[Optional[BenchmarkPairwiseJudgeResult], float, int, int, Optional[str]]:
        """Soumet un sens de lecture au juge.

        Args:
            grid: Grille employée.
            text_first: Texte présenté en position ``A``.
            text_second: Texte présenté en position ``B``.
            truncated: ``True`` si les textes ont été coupés.
            llm_client: Client du juge.
            judge_model: Modèle juge.

        Returns:
            Quintuplet ``(résultat, coût, tokens_entrée, tokens_sortie, erreur)``.
        """
        prompt = build_pairwise_judge_user_prompt(
            grid, text_first, text_second, truncated=truncated
        )
        try:
            variants = await llm_client.generate_variants(
                prompt,
                k=1,
                response_model=BenchmarkPairwiseJudgeResult,
                user_system_prompt_override=BENCHMARK_PAIRWISE_JUDGE_SYSTEM_PROMPT,
            )
        except Exception as exc:
            prompt_tokens = int(getattr(llm_client, "last_usage_prompt_tokens", 0) or 0)
            completion_tokens = int(
                getattr(llm_client, "last_usage_completion_tokens", 0) or 0
            )
            return (
                None,
                self._resolve_cost(llm_client, judge_model, prompt_tokens, completion_tokens),
                prompt_tokens,
                completion_tokens,
                f"Appel du juge en échec : {type(exc).__name__}: {exc}",
            )

        prompt_tokens = int(getattr(llm_client, "last_usage_prompt_tokens", 0) or 0)
        completion_tokens = int(getattr(llm_client, "last_usage_completion_tokens", 0) or 0)
        cost = self._resolve_cost(llm_client, judge_model, prompt_tokens, completion_tokens)

        if not variants:
            return None, cost, prompt_tokens, completion_tokens, "Le juge n'a retourné aucune variante."
        first = variants[0]
        if not isinstance(first, BenchmarkPairwiseJudgeResult):
            return (
                None,
                cost,
                prompt_tokens,
                completion_tokens,
                "Réponse du juge non conforme au schéma — "
                f"{describe_unusable_variant(first)}",
            )
        problem = _pairwise_conformity_problem(first, grid)
        if problem is not None:
            return (
                None,
                cost,
                prompt_tokens,
                completion_tokens,
                f"Réponse non conforme à la grille : {problem}",
            )
        return first, cost, prompt_tokens, completion_tokens, None

    async def judge_pair(
        self,
        *,
        run_id: str,
        pair: PairAssignment,
        grid: CriteriaGrid,
        llm_client: ILLMClient,
        judge_model: str,
    ) -> PairwiseVerdict:
        """Juge une paire dans les deux sens et agrège les verdicts.

        Args:
            run_id: Run concerné.
            pair: Paire préparée (étiquettes attribuées, textes tronqués).
            grid: Grille de critères.
            llm_client: Client du modèle juge.
            judge_model: Identifiant du modèle juge.

        Returns:
            Le duel, ``decided`` ou ``judge_error``. Aucune exception n'est propagée.
        """
        base: Dict[str, Any] = {
            "run_id": run_id,
            "case_id": pair.case_id,
            "repetition": pair.repetition,
            "model_a": pair.model_a,
            "model_b": pair.model_b,
            "judge_model": judge_model,
            "grid_id": grid.grid_id,
            "grid_version": grid.version,
            "criteria_snapshot": list(grid.criteria),
            "length_a": pair.length_a,
            "length_b": pair.length_b,
            "truncated": pair.truncated,
            "created_at": _now_iso(),
        }

        forward, cost_f, pt_f, ct_f, error_f = await self._judge_one_direction(
            grid=grid,
            text_first=pair.text_a,
            text_second=pair.text_b,
            truncated=pair.truncated,
            llm_client=llm_client,
            judge_model=judge_model,
        )
        # Sens inverse : les positions sont permutées, les étiquettes restent A et B.
        reverse, cost_r, pt_r, ct_r, error_r = await self._judge_one_direction(
            grid=grid,
            text_first=pair.text_b,
            text_second=pair.text_a,
            truncated=pair.truncated,
            llm_client=llm_client,
            judge_model=judge_model,
        )

        base.update(
            cost_usd=round(cost_f + cost_r, 6),
            prompt_tokens=pt_f + pt_r,
            completion_tokens=ct_f + ct_r,
            reasoning_forward=forward.reasoning if forward else "",
            reasoning_reverse=reverse.reasoning if reverse else "",
        )

        if forward is None or reverse is None:
            details = " | ".join(part for part in (error_f, error_r) if part)
            return PairwiseVerdict(status="judge_error", error_message=details, **base)

        outcomes = aggregate_directions(
            forward, reverse, model_a=pair.model_a, model_b=pair.model_b
        )
        return PairwiseVerdict(status="decided", outcomes=outcomes, **base)
