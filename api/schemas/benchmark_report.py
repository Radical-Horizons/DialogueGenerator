"""Schémas d'aperçu et de rapport du mode Benchmark.

Deux contrats que l'UI consomme sans rien recalculer :

- l'**aperçu** chiffre un run *avant* de le lancer, condition pour qu'un humain
  consente à la dépense — ``POST /runs`` estime et démarre dans le même appel ;
- le **rapport** agrège un run terminé en appliquant les règles du protocole
  (`.claude/rules/benchmark.md`) : les recalculer en TypeScript en produirait une
  seconde implémentation, hors de portée de pytest, qui divergerait.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

from api.schemas.benchmark import (
    BenchmarkCostEstimate,
    BenchmarkModelDiagnostic,
    BenchmarkNarrationMode,
    BenchmarkRunConfig,
    BenchmarkRunStatus,
    reject_duplicate_models,
)

from core.prompt.benchmark_judge import SCORE_MAX

__all_score_max__ = SCORE_MAX
"""Borne haute de l'échelle, réexportée depuis la source qui l'annonce au juge."""


class BenchmarkRunPreview(BaseModel):
    """Chiffrage d'un run avant tout appel LLM facturé.

    Attributes:
        suite_id: Suite visée.
        suite_version: Version de la suite au moment de l'aperçu.
        cases: Nombre de cas de la suite.
        estimate: Fourchette de coût et nombre de générations.
        model_diagnostics: Utilisabilité réelle de chaque modèle demandé.
        launchable: ``False`` si le run serait refusé en l'état.
        blocking_reasons: Motifs de refus, lisibles tels quels.
    """

    suite_id: str
    suite_version: int
    cases: int
    estimate: BenchmarkCostEstimate
    model_diagnostics: List[BenchmarkModelDiagnostic] = Field(default_factory=list)
    launchable: bool = True
    blocking_reasons: List[str] = Field(default_factory=list)
    judging_max_usd: float = Field(
        0.0,
        description=(
            "Borne haute de la notation enchaînée, 0 si aucune n'est demandée. "
            "Calculée sur l'hypothèse pessimiste où toutes les générations sont "
            "valides — c'est ce que le plafond doit couvrir."
        ),
    )
    duels_max_usd: float = Field(0.0, description="Part des duels dans la borne ci-dessus.")
    judging_unpriced: bool = Field(
        False, description="Le juge n'a pas de tarif connu : son plafond ne pourrait pas agir."
    )


class BenchmarkModelValidity(BaseModel):
    """Validité et coût d'un modèle sur un run — mesure de premier ordre.

    Une génération recalée est comptée ici, jamais notée zéro ailleurs.

    Attributes:
        model_id: Modèle candidat.
        generations: Générations produites, tous statuts confondus.
        valid: Générations ayant franchi les portes.
        invalid: Générations recalées par une porte.
        config_error: Générations impossibles (modèle inutilisable, budget épuisé).
            Panne d'environnement, pas propriété du modèle : hors du taux.
        attempted: ``valid + invalid`` — générations réellement tentées.
        validity_rate: ``valid / attempted``, 0.0 si rien n'a été tenté.
        cost_usd: Coût cumulé des générations du modèle.
        gate_failures: Nombre de recalages par identifiant de porte.
    """

    model_id: str
    generations: int = 0
    valid: int = 0
    invalid: int = 0
    config_error: int = 0
    attempted: int = 0
    validity_rate: float = 0.0
    cost_usd: float = 0.0
    gate_failures: Dict[str, int] = Field(default_factory=dict)


class BenchmarkCriterionScore(BaseModel):
    """Moyenne d'un critère pour un modèle, dans le sens du critère.

    ``mean_score`` reste exprimé dans le sens d'origine : sur un critère
    ``lower_is_better``, une valeur basse est bonne. C'est ce qu'un humain lit.
    La normalisation ne sert qu'à la moyenne pondérée.

    Attributes:
        criterion_id: Identifiant stable, apparié depuis ``criteria_snapshot``.
        label: Libellé figé au moment du jugement.
        direction: Sens du critère.
        weight: Poids figé au moment du jugement.
        mean_score: Moyenne des notes, dans le sens du critère.
        scored_count: Verdicts ayant réellement noté ce critère.
    """

    criterion_id: str
    label: str
    direction: str
    weight: float
    mean_score: float
    scored_count: int


class BenchmarkModelRubricSummary(BaseModel):
    """Notes d'un modèle pour **un** juge donné.

    Attributes:
        model_id: Modèle noté.
        scored_count: Verdicts exploitables.
        judge_errors: Verdicts perdus par défaillance du juge.
        weighted_mean: Moyenne pondérée sur 10, critères normalisés dans le sens
            « plus haut vaut mieux ». ``None`` si aucun verdict exploitable —
            l'absence de note n'est pas une note de zéro.
        criteria: Détail par critère.
    """

    model_id: str
    scored_count: int = 0
    judge_errors: int = 0
    weighted_mean: Optional[float] = None
    criteria: List[BenchmarkCriterionScore] = Field(default_factory=list)


class BenchmarkPairwiseSummary(BaseModel):
    """Bilan des duels d'un modèle, pour un juge donné.

    Attributes:
        model_id: Modèle concerné.
        wins: Critères remportés, tous duels confondus.
        losses: Critères perdus.
        ties: Critères nuls, désaccord de position inclus.
        win_rate: ``wins / (wins + losses + ties)``, 0.0 si aucun duel.
    """

    model_id: str
    wins: int = 0
    losses: int = 0
    ties: int = 0
    win_rate: float = 0.0


class BenchmarkJudgeReport(BaseModel):
    """Tout ce qu'un juge a produit sur un run.

    Le rapport est groupé par juge parce que deux juges ne s'agrègent pas :
    changer de juge change les résultats.

    Attributes:
        judge_model: Juge ayant produit ces notes.
        grid_id: Grille employée.
        grid_version: Version de la grille employée.
        models: Résumé rubrique par modèle.
        pairwise: Bilan des duels par modèle.
        pairwise_decided: Duels tranchés.
        pairwise_judge_errors: Duels perdus par défaillance du juge.
        position_disagreement_rate: Part des critères où les deux sens de lecture
            ont désigné des gagnants différents. Signale un juge sensible à la
            position — information à lire, pas bruit à moyenner.
    """

    judge_model: str
    grid_id: str = ""
    grid_version: int = 0
    models: List[BenchmarkModelRubricSummary] = Field(default_factory=list)
    pairwise: List[BenchmarkPairwiseSummary] = Field(default_factory=list)
    pairwise_decided: int = 0
    pairwise_judge_errors: int = 0
    position_disagreement_rate: float = 0.0


class BenchmarkRunReport(BaseModel):
    """Rapport agrégé d'un run.

    Attributes:
        run_id: Run rapporté.
        suite_id: Suite rejouée.
        narration_mode: Mode de narration — fait partie de l'identité du run,
            deux modes ne se comparent pas.
        repetitions: Générations par cas et par modèle.
        status: État du run.
        spent_usd: Dépense réelle des générations.
        models: Validité et coût par modèle, indépendants de tout juge.
        judges: Un bloc par juge et par version de grille ; vide tant que rien
            n'a été noté.
        verdicts_unreadable: Vrai si un lot de verdicts existe mais n'a pas pu
            être lu. Sans ce drapeau, des mesures payées disparaîtraient derrière
            « pas encore noté ».
    """

    run_id: str
    suite_id: str
    narration_mode: BenchmarkNarrationMode
    repetitions: int
    status: BenchmarkRunStatus
    spent_usd: float = 0.0
    models: List[BenchmarkModelValidity] = Field(default_factory=list)
    judges: List[BenchmarkJudgeReport] = Field(default_factory=list)
    verdicts_unreadable: bool = False


class BenchmarkRunPreviewRequest(BaseModel):
    """Corps de l'aperçu.

    Volontairement **sans** ``budget_cap_usd`` : on demande un aperçu précisément
    pour savoir quel plafond poser. L'exiger ici inverserait l'ordre des choses.

    Attributes:
        suite_id: Suite visée.
        suite_version: Version attendue ; ``None`` prend la version courante.
        models: Modèles candidats (au moins un).
        repetitions: Générations par cas et par modèle.
        narration_mode: Mode de narration du run envisagé.
        judge_model: Juge de la notation enchaînée ; ``None`` ne chiffre que la génération.
        with_duels: Inclure les duels dans le chiffrage.
    """

    suite_id: str = Field(..., min_length=1)
    suite_version: Optional[int] = Field(None, ge=1)
    models: List[str] = Field(..., min_length=1)
    repetitions: int = Field(3, ge=1, le=20)
    narration_mode: BenchmarkNarrationMode = "sans"
    judge_model: Optional[str] = Field(
        None,
        description=(
            "Juge de la notation enchaînée. Chiffrer la génération seule "
            "sous-estimerait ce que coûte réellement « lancer un benchmark »."
        ),
    )
    with_duels: bool = True

    _validate_models = field_validator("models")(reject_duplicate_models)

    def to_run_config(self, budget_cap_usd: float) -> BenchmarkRunConfig:
        """Compose la configuration de run équivalente pour l'estimateur.

        Args:
            budget_cap_usd: Plafond fictif, requis par ``BenchmarkRunConfig`` mais
                sans effet sur l'estimation.

        Returns:
            La configuration à passer à ``estimate_cost``.
        """
        return BenchmarkRunConfig(
            suite_id=self.suite_id,
            suite_version=self.suite_version,
            models=list(self.models),
            repetitions=self.repetitions,
            budget_cap_usd=budget_cap_usd,
            narration_mode=self.narration_mode,
        )
