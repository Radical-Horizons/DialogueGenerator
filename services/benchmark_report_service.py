"""Agrégation d'un run de benchmark, et chiffrage d'un run avant lancement.

Ce service est le **seul** endroit où les règles d'agrégation du protocole
s'appliquent (`.claude/rules/benchmark.md`) :

- une génération recalée est ``invalid``, jamais notée zéro : elle compte dans le
  taux de validité et sort des moyennes ;
- deux juges ne s'agrègent jamais — le rapport est groupé par ``judge_model`` ;
- les critères sont appariés par identifiant stable, jamais par libellé, et leurs
  sens et poids sont lus dans le ``criteria_snapshot`` figé au moment du jugement ;
- un critère ``lower_is_better`` est **normalisé** avant d'entrer dans la moyenne
  pondérée : sans cela, la moyenne additionnerait des notes où « haut » veut dire
  « bon » à des notes où « haut » veut dire « mauvais ».

Le porter ici plutôt que dans l'UI garde ces règles sous pytest, en un seul
exemplaire.
"""

from __future__ import annotations

import logging
from typing import Any, Callable, Dict, Iterable, List, Optional, Tuple

from api.schemas.benchmark import BenchmarkGenerationRecord
from api.schemas.benchmark_judging import (
    CriterionDefinition,
    PairwiseVerdict,
    RubricVerdict,
)
from api.schemas.benchmark_report import (
    SCORE_MAX,
    BenchmarkCriterionScore,
    BenchmarkJudgeReport,
    BenchmarkModelRubricSummary,
    BenchmarkModelValidity,
    BenchmarkPairwiseSummary,
    BenchmarkRunPreview,
    BenchmarkRunPreviewRequest,
    BenchmarkRunReport,
)
from services.benchmark_judge_pass_service import (
    BenchmarkJudgePassService,
    BenchmarkPairwisePassService,
)
from services.benchmark_run_service import (
    BenchmarkRunConflictError,
    BenchmarkRunService,
)
from services.benchmark_suite_store import BenchmarkSuiteStore

logger = logging.getLogger(__name__)

_PREVIEW_MIN_CAP_USD = 0.01
"""Plafond fictif de l'aperçu : ``BenchmarkRunConfig`` en exige un strictement positif."""


class BenchmarkReportService:
    """Chiffre un run avant lancement, et agrège un run terminé."""

    def __init__(
        self,
        run_service: BenchmarkRunService,
        judge_pass_service: BenchmarkJudgePassService,
        pairwise_pass_service: BenchmarkPairwisePassService,
        suite_store: BenchmarkSuiteStore,
    ) -> None:
        """Initialise le service.

        Args:
            run_service: Moteur de run (générations, estimation, diagnostics).
            judge_pass_service: Passe de notation rubrique (verdicts absolus).
            pairwise_pass_service: Passe de comparaison (duels).
            suite_store: Magasin des suites, pour résoudre la suite d'un aperçu.
        """
        self._run_service = run_service
        self._judge_pass_service = judge_pass_service
        self._pairwise_pass_service = pairwise_pass_service
        self._suite_store = suite_store

    # ------------------------------------------------------------------
    # Aperçu
    # ------------------------------------------------------------------

    def preview(self, request: BenchmarkRunPreviewRequest) -> BenchmarkRunPreview:
        """Chiffre un run sans en créer aucun ni dépenser quoi que ce soit.

        Le verdict de lançabilité est obtenu en appelant la **même** garde que le
        lancement réel : la dupliquer ici la laisserait diverger, et l'aperçu
        annoncerait un run que ``POST /runs`` refuserait.

        Args:
            request: Paramètres du run envisagé.

        Returns:
            Fourchette de coût, diagnostic par modèle et motifs de refus éventuels.

        Raises:
            BenchmarkSuiteNotFoundError: Si la suite n'existe pas.
            BenchmarkSuiteInvalidError: Si la version demandée n'existe pas.
        """
        suite = self._suite_store.get_suite(request.suite_id, version=request.suite_version)
        config = request.to_run_config(_PREVIEW_MIN_CAP_USD)
        estimate = self._run_service.estimate_cost(suite, config)
        diagnostics = self._run_service.diagnose_models(list(request.models))

        # Le plafond réel n'est pas encore connu — c'est ce que l'aperçu sert à
        # décider. On soumet donc un plafond au-dessus de l'estimation haute pour
        # que seule l'utilisabilité et les tarifs manquants puissent bloquer.
        probe = request.to_run_config(max(estimate.estimated_max_usd * 2, _PREVIEW_MIN_CAP_USD))
        blocking: List[str] = []
        try:
            self._run_service.assert_measurable(estimate, diagnostics, probe)
        except BenchmarkRunConflictError as exc:
            blocking.append(str(exc))

        return BenchmarkRunPreview(
            suite_id=suite.suite_id,
            suite_version=suite.version,
            cases=len(suite.cases),
            estimate=estimate,
            model_diagnostics=diagnostics,
            launchable=not blocking,
            blocking_reasons=blocking,
        )

    # ------------------------------------------------------------------
    # Rapport
    # ------------------------------------------------------------------

    def build_report(self, run_id: str) -> BenchmarkRunReport:
        """Agrège un run : validité par modèle, puis notes et duels par juge.

        Args:
            run_id: Run à rapporter.

        Returns:
            Le rapport agrégé.

        Raises:
            BenchmarkRunNotFoundError: Si le run n'existe pas.
        """
        run = self._run_service.get_run(run_id)
        generations = self._run_service.list_generations(run_id)
        rubric, rubric_unreadable = self._safe_verdicts(
            lambda: self._judge_pass_service.list_verdicts(run_id), "rubrique"
        )
        pairwise, pairwise_unreadable = self._safe_verdicts(
            lambda: self._pairwise_pass_service.list_verdicts(run_id), "duels"
        )

        return BenchmarkRunReport(
            run_id=run.run_id,
            suite_id=run.identity.suite_id,
            narration_mode=run.identity.narration_mode,
            repetitions=run.identity.repetitions,
            status=run.status,
            spent_usd=round(run.spent_usd, 6),
            models=self._model_validity(run.identity.models, generations),
            judges=self._judge_reports(rubric, pairwise),
            verdicts_unreadable=rubric_unreadable or pairwise_unreadable,
        )

    @staticmethod
    def _safe_verdicts(
        loader: Callable[[], Iterable[Any]], label: str
    ) -> Tuple[List[Any], bool]:
        """Charge un lot de verdicts en distinguant « absent » de « illisible ».

        Un run jamais jugé n'a pas de fichier de verdicts : état normal, le
        rapport montre alors la validité seule. Tout autre échec — fichier
        tronqué, droits refusés — doit **remonter**, sinon des mesures payées
        disparaissent derrière la phrase « pas encore noté ».

        Args:
            loader: Accès au lot de verdicts.
            label: Nom du lot, pour la trace.

        Returns:
            Les verdicts, et un drapeau vrai si le lot est illisible.
        """
        try:
            return list(loader()), False
        except FileNotFoundError:
            logger.debug("Aucun verdict %s pour ce run (jamais jugé)", label)
            return [], False
        except (OSError, ValueError) as exc:
            logger.error("Verdicts %s illisibles : %s", label, exc)
            return [], True

    # ------------------------------------------------------------------
    # Validité
    # ------------------------------------------------------------------

    @staticmethod
    def _model_validity(
        models: Iterable[str], generations: Iterable[BenchmarkGenerationRecord]
    ) -> List[BenchmarkModelValidity]:
        """Compte les générations par statut et par modèle.

        Les modèles déclarés dans l'identité du run apparaissent même sans aucune
        génération : leur absence est un résultat, pas une ligne à masquer.

        Args:
            models: Modèles candidats du run.
            generations: Générations persistées.

        Returns:
            Une entrée par modèle, dans l'ordre de l'identité du run.
        """
        buckets: Dict[str, BenchmarkModelValidity] = {
            model_id: BenchmarkModelValidity(model_id=model_id) for model_id in models
        }
        for record in generations:
            entry = buckets.setdefault(
                record.model_id, BenchmarkModelValidity(model_id=record.model_id)
            )
            entry.generations += 1
            entry.cost_usd += record.cost_usd
            if record.status == "valid":
                entry.valid += 1
            elif record.status == "invalid":
                entry.invalid += 1
            else:
                entry.config_error += 1
            for failure in record.gate_failures:
                entry.gate_failures[failure.gate] = entry.gate_failures.get(failure.gate, 0) + 1

        for entry in buckets.values():
            entry.cost_usd = round(entry.cost_usd, 6)
            # `config_error` est une panne d'environnement (clé absente, budget
            # épuisé), pas une propriété du modèle : le compter au dénominateur
            # ferait lire « ce modèle écrit mal » là où il n'a rien écrit.
            attempted = entry.valid + entry.invalid
            entry.attempted = attempted
            entry.validity_rate = round(entry.valid / attempted, 4) if attempted else 0.0
        return list(buckets.values())

    # ------------------------------------------------------------------
    # Juges
    # ------------------------------------------------------------------

    def _judge_reports(
        self, rubric: List[RubricVerdict], pairwise: List[PairwiseVerdict]
    ) -> List[BenchmarkJudgeReport]:
        """Construit un bloc par juge, sans jamais fusionner deux juges.

        Args:
            rubric: Verdicts rubrique du run.
            pairwise: Duels du run.

        Returns:
            Un rapport par juge présent dans l'un ou l'autre lot.
        """
        # La clé inclut la grille et sa version : une grille rééditée entre deux
        # passes change le sens ou le poids d'un critère, et fondre les deux
        # appliquerait les anciens poids aux nouvelles notes.
        keys = sorted(
            {(v.judge_model, v.grid_id, v.grid_version) for v in rubric}
            | {(v.judge_model, v.grid_id, v.grid_version) for v in pairwise}
        )
        reports: List[BenchmarkJudgeReport] = []
        for judge_model, grid_id, grid_version in keys:

            def _same(verdict: Any) -> bool:
                """Vrai si le verdict appartient au bloc courant."""
                return (
                    verdict.judge_model == judge_model
                    and verdict.grid_id == grid_id
                    and verdict.grid_version == grid_version
                )

            judge_rubric = [v for v in rubric if _same(v)]
            judge_pairwise = [v for v in pairwise if _same(v)]
            decided = [v for v in judge_pairwise if v.status == "decided"]
            reports.append(
                BenchmarkJudgeReport(
                    judge_model=judge_model,
                    grid_id=grid_id,
                    grid_version=grid_version,
                    models=self._rubric_summaries(judge_rubric),
                    pairwise=self._pairwise_summaries(decided),
                    pairwise_decided=len(decided),
                    pairwise_judge_errors=len(judge_pairwise) - len(decided),
                    position_disagreement_rate=self._disagreement_rate(decided),
                )
            )
        return reports

    def _rubric_summaries(
        self, verdicts: List[RubricVerdict]
    ) -> List[BenchmarkModelRubricSummary]:
        """Résume les notes d'un juge, modèle par modèle.

        Args:
            verdicts: Verdicts rubrique d'un seul juge.

        Returns:
            Une entrée par modèle noté, triée par identifiant de modèle.
        """
        by_model: Dict[str, List[RubricVerdict]] = {}
        for verdict in verdicts:
            by_model.setdefault(verdict.model_id, []).append(verdict)

        summaries: List[BenchmarkModelRubricSummary] = []
        for model_id in sorted(by_model):
            model_verdicts = by_model[model_id]
            scored = [v for v in model_verdicts if v.status == "scored"]
            criteria = self._criterion_scores(scored)
            summaries.append(
                BenchmarkModelRubricSummary(
                    model_id=model_id,
                    scored_count=len(scored),
                    judge_errors=len(model_verdicts) - len(scored),
                    weighted_mean=self._weighted_mean(criteria),
                    criteria=criteria,
                )
            )
        return summaries

    @staticmethod
    def _criterion_scores(verdicts: List[RubricVerdict]) -> List[BenchmarkCriterionScore]:
        """Moyenne chaque critère, dans son propre sens.

        Sens, poids et libellé viennent du ``criteria_snapshot`` du verdict :
        la grille courante a pu changer depuis, et rétro-appliquer ses poids
        réécrirait le passé.

        Args:
            verdicts: Verdicts exploitables d'un modèle pour un juge.

        Returns:
            Une entrée par critère effectivement noté, triée par identifiant.
        """
        totals: Dict[str, float] = {}
        counts: Dict[str, int] = {}
        definitions: Dict[str, CriterionDefinition] = {}
        for verdict in verdicts:
            snapshot = {item.criterion_id: item for item in verdict.criteria_snapshot}
            for criterion_id, score in verdict.scores.items():
                definition = snapshot.get(criterion_id)
                if definition is None:
                    # Critère noté hors grille figée : non apparié, donc non agrégé.
                    logger.warning(
                        "Critère '%s' absent du criteria_snapshot du verdict %s/%s — ignoré",
                        criterion_id,
                        verdict.model_id,
                        verdict.case_id,
                    )
                    continue
                definitions.setdefault(criterion_id, definition)
                bounded = min(max(float(score), 0.0), float(SCORE_MAX))
                if bounded != float(score):
                    # Une note hors échelle rendrait la moyenne pondérée négative
                    # ou supérieure au maximum, sous un en-tête « /10 ».
                    logger.warning(
                        "Note %s hors échelle 0–%s pour '%s' (%s/%s) — bornée",
                        score,
                        SCORE_MAX,
                        criterion_id,
                        verdict.model_id,
                        verdict.case_id,
                    )
                totals[criterion_id] = totals.get(criterion_id, 0.0) + bounded
                counts[criterion_id] = counts.get(criterion_id, 0) + 1

        return [
            BenchmarkCriterionScore(
                criterion_id=criterion_id,
                label=definitions[criterion_id].label,
                direction=definitions[criterion_id].direction,
                weight=definitions[criterion_id].weight,
                mean_score=round(totals[criterion_id] / counts[criterion_id], 3),
                scored_count=counts[criterion_id],
            )
            for criterion_id in sorted(totals)
        ]

    @staticmethod
    def _weighted_mean(criteria: List[BenchmarkCriterionScore]) -> Optional[float]:
        """Moyenne pondérée sur 10, critères ramenés au sens « plus haut vaut mieux ».

        ``None`` quand rien n'a été noté : l'absence de note n'est pas un zéro.

        Args:
            criteria: Moyennes par critère, chacune dans son sens d'origine.

        Returns:
            La moyenne pondérée, ou ``None``.
        """
        if not criteria:
            return None

        def _oriented(item: BenchmarkCriterionScore) -> float:
            """Ramène une moyenne au sens « plus haut vaut mieux »."""
            return (
                SCORE_MAX - item.mean_score
                if item.direction == "lower_is_better"
                else item.mean_score
            )

        weight_total = sum(item.weight for item in criteria)
        if weight_total <= 0:
            # Grille entièrement à poids nul : renvoyer `None` ferait afficher
            # « non noté » à côté de verdicts bien réels. Moyenne simple, tracée.
            logger.warning("Poids total nul sur %d critère(s) — moyenne non pondérée", len(criteria))
            return round(sum(_oriented(item) for item in criteria) / len(criteria), 3)
        return round(sum(_oriented(item) * item.weight for item in criteria) / weight_total, 3)

    # ------------------------------------------------------------------
    # Duels
    # ------------------------------------------------------------------

    @staticmethod
    def _pairwise_summaries(verdicts: List[PairwiseVerdict]) -> List[BenchmarkPairwiseSummary]:
        """Compte victoires, défaites et nuls par modèle, critère par critère.

        Un désaccord de position compte pour un nul des deux côtés : c'est le
        traitement déjà retenu à la construction du verdict, et l'information
        subsiste dans ``position_disagreement_rate``.

        Args:
            verdicts: Duels tranchés d'un seul juge.

        Returns:
            Une entrée par modèle ayant participé, triée par identifiant.
        """
        buckets: Dict[str, BenchmarkPairwiseSummary] = {}

        def bucket(model_id: str) -> BenchmarkPairwiseSummary:
            return buckets.setdefault(model_id, BenchmarkPairwiseSummary(model_id=model_id))

        for verdict in verdicts:
            for outcome in verdict.outcomes:
                side_a = bucket(verdict.model_a)
                side_b = bucket(verdict.model_b)
                winner = outcome.winner_model_id
                if winner is not None and winner not in (verdict.model_a, verdict.model_b):
                    # Un gagnant étranger au duel créerait une ligne fantôme
                    # créditée de victoires jamais jouées.
                    logger.warning(
                        "Gagnant '%s' hors du duel %s vs %s (%s) — compté nul",
                        winner,
                        verdict.model_a,
                        verdict.model_b,
                        verdict.case_id,
                    )
                    winner = None
                if outcome.direction_disagreement or winner is None:
                    side_a.ties += 1
                    side_b.ties += 1
                    continue
                if winner == verdict.model_a:
                    side_a.wins += 1
                    side_b.losses += 1
                else:
                    side_b.wins += 1
                    side_a.losses += 1

        for entry in buckets.values():
            played = entry.wins + entry.losses + entry.ties
            entry.win_rate = round(entry.wins / played, 4) if played else 0.0
        return [buckets[model_id] for model_id in sorted(buckets)]

    @staticmethod
    def _disagreement_rate(verdicts: List[PairwiseVerdict]) -> float:
        """Part des critères où les deux sens de lecture se contredisent.

        Args:
            verdicts: Duels tranchés d'un seul juge.

        Returns:
            Le taux, 0.0 si aucun critère n'a été comparé.
        """
        outcomes = [outcome for verdict in verdicts for outcome in verdict.outcomes]
        if not outcomes:
            return 0.0
        disagreements = sum(1 for outcome in outcomes if outcome.direction_disagreement)
        return round(disagreements / len(outcomes), 4)
