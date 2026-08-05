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

from typing import List

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
