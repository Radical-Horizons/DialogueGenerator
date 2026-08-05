"""Sortie structurée du juge de benchmark.

Le schéma est **générique** : `criterion_id` est une chaîne libre, pas un `Literal`.
La grille étant une donnée éditable, la figer dans un type rendrait impossible
d'ajouter un critère sans toucher au code — ce que la spécification interdit.

La conformité à la grille est donc vérifiée **après** l'appel, par le service :
tous les identifiants attendus présents, aucun identifiant inconnu. Une réponse
non conforme devient un verdict `judge_error` explicite, jamais un ensemble de
critères silencieusement ignorés.

Le champ `reasoning` est isolé du reste par construction : c'est le seul endroit
où le juge écrit en texte libre, et rien de ce qu'il y met n'est jamais lu comme
un score.
"""

from __future__ import annotations

from typing import List, Literal

from pydantic import BaseModel, Field


class BenchmarkCriterionScore(BaseModel):
    """Note d'un critère, telle que produite par le juge.

    Attributes:
        criterion_id: Identifiant du critère, repris **à l'identique** de la grille.
        score: Note de 0 à 10 sur ce critère.
        comment: Justification brève, propre à ce critère.
    """

    criterion_id: str = Field(
        ...,
        description="Identifiant du critère, copié exactement depuis la grille fournie",
    )
    score: int = Field(..., ge=0, le=10, description="Note 0–10 pour ce critère")
    comment: str = Field(default="", description="Justification brève de la note")


class BenchmarkRubricJudgeResult(BaseModel):
    """Réponse attendue du juge pour une notation absolue.

    Attributes:
        criteria: Une entrée par critère de la grille, dans un ordre libre.
        reasoning: Raisonnement libre — conservé pour audit, jamais interprété.
    """

    criteria: List[BenchmarkCriterionScore] = Field(
        ...,
        min_length=1,
        description="Une entrée par critère de la grille fournie",
    )
    reasoning: str = Field(
        default="",
        description=(
            "Raisonnement libre menant aux notes. Champ d'audit : aucune note n'en "
            "est extraite, elles sont lues uniquement dans criteria[]."
        ),
    )


PairwiseLabel = Literal["A", "B", "tie"]
"""Verdict d'un critère en comparaison : une **étiquette**, jamais un nom de modèle.

Le juge ignore quel modèle porte quelle étiquette ; la remontée vers les
identifiants réels se fait côté service, après lecture.
"""


class BenchmarkPairwiseCriterionVerdict(BaseModel):
    """Verdict du juge sur un critère, pour une paire.

    Attributes:
        criterion_id: Identifiant du critère, repris à l'identique de la grille.
        winner: Étiquette gagnante, ou ``tie`` si les deux se valent.
        margin: Écart perçu — 0 négligeable, 3 franc. Vaut 0 quand ``winner`` est ``tie``.
        comment: Justification brève.
    """

    criterion_id: str = Field(
        ...,
        description="Identifiant du critère, copié exactement depuis la grille fournie",
    )
    winner: PairwiseLabel = Field(
        ...,
        description="Proposition gagnante sur ce critère : A, B, ou tie si équivalentes",
    )
    margin: int = Field(
        0,
        ge=0,
        le=3,
        description="Ampleur de l'écart : 0 négligeable, 1 léger, 2 net, 3 franc",
    )
    comment: str = Field(default="", description="Justification brève du verdict")


class BenchmarkPairwiseJudgeResult(BaseModel):
    """Réponse attendue du juge pour une comparaison.

    Attributes:
        criteria: Une entrée par critère de la grille, dans un ordre libre.
        reasoning: Raisonnement libre — conservé pour audit, jamais interprété.
    """

    criteria: List[BenchmarkPairwiseCriterionVerdict] = Field(
        ...,
        min_length=1,
        description="Une entrée par critère de la grille fournie",
    )
    reasoning: str = Field(
        default="",
        description=(
            "Raisonnement libre menant aux verdicts. Champ d'audit : aucun gagnant "
            "n'en est extrait, ils sont lus uniquement dans criteria[]."
        ),
    )
