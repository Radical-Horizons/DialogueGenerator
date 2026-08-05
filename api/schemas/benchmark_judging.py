"""Schémas Pydantic du jugement de benchmark (grille de critères, verdicts rubrique).

La grille est une **donnée**, pas du code : on doit pouvoir ajouter un critère et
relancer le jugement sans toucher au générateur. Tout l'appariement interne se
fait sur `criterion_id` ; le libellé n'est qu'un affichage. C'est le piège que la
spécification fonctionnelle interdit structurellement — dans EQ-Bench, un critère
négatif reconnu par comparaison de son nom affiché cessait d'être inversé au
moindre accent de différence, et ajoutait des points au lieu d'en retirer.
"""

from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

CriterionDirection = Literal["higher_is_better", "lower_is_better"]
"""Sens d'un critère. Porté par la donnée, jamais déduit du libellé."""

RubricVerdictStatus = Literal["scored", "judge_error"]
"""Issue d'un verdict rubrique.

``judge_error`` couvre une réponse de juge non conforme à la grille (critère
manquant, identifiant inconnu) : le verdict est écarté des moyennes, jamais
transformé en score plancher.
"""

JudgePassStatus = Literal[
    "running",
    "paused",
    "completed",
    "interrupted_budget",
    "cancelled",
    "failed",
]
"""État d'une passe de jugement."""


class CriterionDefinition(BaseModel):
    """Un critère de la grille.

    Attributes:
        criterion_id: Identifiant stable, seul support de l'appariement interne.
        label: Libellé d'affichage — jamais utilisé pour retrouver un critère.
        description: Texte destiné au juge, qui définit ce qui est évalué.
        direction: `higher_is_better` ou `lower_is_better`.
        weight: Poids relatif dans les agrégats à venir.
        group: Regroupement d'affichage libre (qualité de la réplique, du branchement…).
    """

    criterion_id: str = Field(..., min_length=1, max_length=60, pattern=r"^[a-z0-9_]+$")
    label: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1, description="Consigne d'évaluation pour le juge")
    direction: CriterionDirection = "higher_is_better"
    weight: float = Field(1.0, ge=0.0, description="Poids relatif du critère")
    group: str = Field("", description="Regroupement d'affichage, libre")


class CriteriaGrid(BaseModel):
    """Grille de critères versionnée.

    Attributes:
        grid_id: Identifiant stable de la grille.
        version: Version, incrémentée à chaque écriture.
        name: Nom lisible.
        description: Description libre.
        criteria: Critères — au moins un, identifiants uniques.
        updated_at: Horodatage ISO-8601 de la dernière écriture.
    """

    grid_id: str = Field(..., min_length=1)
    version: int = Field(1, ge=1)
    name: str = ""
    description: str = ""
    criteria: List[CriterionDefinition] = Field(...)
    updated_at: Optional[str] = None

    @field_validator("criteria")
    @classmethod
    def _reject_empty_or_duplicate(
        cls, criteria: List[CriterionDefinition]
    ) -> List[CriterionDefinition]:
        """Refuse une grille vide ou aux identifiants dupliqués.

        Une grille vide produirait des scores qui ne veulent rien dire ; deux
        critères de même identifiant rendraient l'appariement ambigu.
        """
        if not criteria:
            raise ValueError("Une grille doit contenir au moins un critère")
        ids = [criterion.criterion_id for criterion in criteria]
        duplicates = sorted({cid for cid in ids if ids.count(cid) > 1})
        if duplicates:
            raise ValueError(f"criterion_id dupliqués : {', '.join(duplicates)}")
        return criteria

    def criterion_ids(self) -> List[str]:
        """Identifiants de la grille, dans l'ordre déclaré."""
        return [criterion.criterion_id for criterion in self.criteria]


class CriteriaGridSummary(BaseModel):
    """Vue de liste d'une grille, sans les critères."""

    grid_id: str
    version: int
    name: str
    description: str
    criterion_count: int
    updated_at: Optional[str] = None


class CriteriaGridListResponse(BaseModel):
    """Réponse de listage des grilles."""

    grids: List[CriteriaGridSummary] = Field(default_factory=list)


class CriteriaGridResponse(BaseModel):
    """Réponse portant une grille complète."""

    grid: CriteriaGrid


class CriteriaGridUpsertRequest(BaseModel):
    """Création ou remplacement d'une grille (la version est gérée par le magasin)."""

    grid_id: str = Field(..., min_length=1)
    name: str = ""
    description: str = ""
    criteria: List[CriterionDefinition]

    @field_validator("criteria")
    @classmethod
    def _reject_empty(cls, criteria: List[CriterionDefinition]) -> List[CriterionDefinition]:
        """Refuse une grille sans critère."""
        if not criteria:
            raise ValueError("Une grille doit contenir au moins un critère")
        return criteria


class RubricVerdict(BaseModel):
    """Notation absolue d'une génération par un juge.

    Attributes:
        run_id: Run d'où vient la génération notée.
        case_id: Cas rejoué.
        model_id: Modèle candidat ayant produit la génération.
        repetition: Index de répétition de la génération.
        judge_model: Modèle juge — enregistré sur **chaque** verdict, car changer
            de juge change les résultats et deux juges ne s'agrègent pas.
        grid_id: Grille employée.
        grid_version: Version de la grille employée.
        status: `scored` ou `judge_error`.
        scores: Score par `criterion_id`, tel que lu dans les champs structurés.
        comments: Commentaire du juge par `criterion_id`.
        reasoning: Raisonnement libre du juge — **stocké pour audit, jamais analysé**.
        text_length_chars: Longueur du texte noté, mesure objective tenue à part.
        cost_usd: Coût de l'appel de jugement.
        error_message: Détail quand `status` vaut `judge_error`.
        created_at: Horodatage ISO-8601.
    """

    run_id: str
    case_id: str
    model_id: str
    repetition: int = Field(..., ge=0)
    judge_model: str
    grid_id: str
    grid_version: int
    status: RubricVerdictStatus
    scores: Dict[str, int] = Field(default_factory=dict)
    comments: Dict[str, str] = Field(default_factory=dict)
    criteria_snapshot: List[CriterionDefinition] = Field(
        default_factory=list,
        description=(
            "Copie des critères tels qu'ils étaient au moment de la notation. "
            "Le sens et le poids voyagent avec la note : sans cela, inverser la "
            "direction d'un critère dans la grille réinterpréterait tous les verdicts "
            "antérieurs, et un défaut serait agrégé comme une qualité."
        ),
    )
    reasoning: str = Field(
        "",
        description=(
            "Raisonnement libre du juge. Conservé pour audit ; aucun score n'en est "
            "jamais extrait — c'est le défaut d'EQ-Bench que cette structure interdit."
        ),
    )
    text_length_chars: int = 0
    cost_usd: float = 0.0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    error_message: Optional[str] = None
    created_at: Optional[str] = None


class JudgePassConfig(BaseModel):
    """Paramètres d'une passe de jugement.

    Attributes:
        grid_id: Grille à employer.
        grid_version: Version attendue ; `None` prend la version courante.
        judge_model: Modèle juge.
        budget_cap_usd: Plafond dur de la passe, en USD.
    """

    grid_id: str = Field(..., min_length=1)
    grid_version: Optional[int] = Field(None, ge=1)
    judge_model: str = Field(..., min_length=1)
    budget_cap_usd: float = Field(..., gt=0)


class JudgePassState(BaseModel):
    """État persisté d'une passe de jugement (`judge_pass.json`).

    Attributes:
        run_id: Run jugé.
        judge_model: Juge de la passe.
        grid_id: Grille employée.
        grid_version: Version de la grille.
        status: État courant.
        verdicts_total: Nombre de générations valides à noter.
        verdicts_completed: Verdicts persistés.
        judge_errors: Verdicts non conformes à la grille.
        spent_usd: Coût réel cumulé.
        message: Message d'état lisible.
    """

    run_id: str
    judge_model: str
    grid_id: str
    grid_version: int
    status: JudgePassStatus
    verdicts_total: int = 0
    verdicts_completed: int = 0
    judge_errors: int = 0
    spent_usd: float = 0.0
    budget_cap_usd: float = 0.0
    message: str = ""
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class JudgePassProgress(BaseModel):
    """Progression in-memory d'une passe de jugement."""

    active: bool = False
    run_id: Optional[str] = None
    judge_model: Optional[str] = None
    status: Optional[JudgePassStatus] = None
    verdicts_total: int = 0
    verdicts_completed: int = 0
    current_model: Optional[str] = None
    current_case: Optional[str] = None
    spent_usd: float = 0.0
    budget_cap_usd: float = 0.0
    paused: bool = False
    message: str = ""


class JudgePassLaunchResponse(BaseModel):
    """Réponse de lancement d'une passe de jugement."""

    run_id: str
    judge_model: str
    status: JudgePassStatus
    verdicts_total: int
    estimated_max_usd: float


class RubricVerdictListResponse(BaseModel):
    """Réponse de listage des verdicts rubrique d'un run."""

    run_id: str
    total: int = Field(0, description="Nombre de verdicts après filtre, avant pagination")
    judge_models: List[str] = Field(
        default_factory=list,
        description="Juges présents dans le lot — plus d'un signifie qu'aucune agrégation directe n'est licite",
    )
    verdicts: List[RubricVerdict] = Field(default_factory=list)


class JudgePassControlResponse(BaseModel):
    """Réponse d'une commande de contrôle de passe."""

    run_id: str
    applied: bool
    message: str


PairwiseVerdictStatus = Literal["decided", "judge_error"]
"""Issue d'un duel. ``judge_error`` couvre une réponse non conforme à la grille."""


class PairwiseCriterionOutcome(BaseModel):
    """Résultat agrégé d'un critère, après lecture des deux sens.

    Attributes:
        criterion_id: Critère concerné, apparié par identifiant stable.
        winner_model_id: Modèle gagnant, ou ``None`` en cas d'égalité.
        margin: Ampleur moyenne de l'écart quand les deux sens concordent, 0 sinon.
        direction_disagreement: ``True`` si les deux sens ont désigné des gagnants
            différents. Le duel est alors compté nul : c'est la trace d'un juge
            sensible à la position, et cette information doit survivre au calcul.
    """

    criterion_id: str
    winner_model_id: Optional[str] = None
    margin: float = 0.0
    direction_disagreement: bool = False


class PairwiseVerdict(BaseModel):
    """Comparaison de deux générations d'un même cas, jugée dans les deux sens.

    Attributes:
        run_id: Run d'où viennent les deux générations.
        case_id: Cas commun.
        repetition: Index de répétition commun — donc même prompt.
        model_a: Modèle présenté sous l'étiquette ``A`` au premier passage.
        model_b: Modèle présenté sous l'étiquette ``B`` au premier passage.
        judge_model: Juge — enregistré sur chaque verdict, deux juges ne s'agrègent pas.
        grid_id: Grille employée.
        grid_version: Version de la grille employée.
        criteria_snapshot: Critères tels qu'ils étaient au moment du duel.
        status: ``decided`` ou ``judge_error``.
        outcomes: Résultat agrégé par critère.
        reasoning_forward: Raisonnement du sens direct — audit seul, jamais analysé.
        reasoning_reverse: Raisonnement du sens inverse — audit seul.
        length_a: Longueur réelle du texte de ``A``, avant troncature.
        length_b: Longueur réelle du texte de ``B``, avant troncature.
        truncated: ``True`` si les textes ont été coupés à la limite commune.
        cost_usd: Coût cumulé des deux appels de juge.
        error_message: Détail quand ``status`` vaut ``judge_error``.
        created_at: Horodatage ISO-8601.
    """

    run_id: str
    case_id: str
    repetition: int = Field(..., ge=0)
    model_a: str
    model_b: str
    judge_model: str
    grid_id: str
    grid_version: int
    criteria_snapshot: List[CriterionDefinition] = Field(default_factory=list)
    status: PairwiseVerdictStatus
    outcomes: List[PairwiseCriterionOutcome] = Field(default_factory=list)
    reasoning_forward: str = ""
    reasoning_reverse: str = ""
    length_a: int = 0
    length_b: int = 0
    truncated: bool = False
    cost_usd: float = 0.0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    error_message: Optional[str] = None
    created_at: Optional[str] = None


class PairwisePassConfig(BaseModel):
    """Paramètres d'une passe de comparaison par paires."""

    grid_id: str = Field(..., min_length=1)
    grid_version: Optional[int] = Field(None, ge=1)
    judge_model: str = Field(..., min_length=1)
    budget_cap_usd: float = Field(..., gt=0)


class PairwisePassState(BaseModel):
    """État persisté d'une passe de comparaison.

    Attributes:
        duels_total: Duels à produire.
        duels_completed: Duels persistés.
        judge_errors: Duels dont la réponse du juge était non conforme.
        unpairable_slots: Couples (cas, répétition) à un seul modèle valide —
            comptés pour que le rapport ne présente pas un classement fondé sur
            trois duels comme s'il en avait couvert cent.
    """

    run_id: str
    judge_model: str
    grid_id: str
    grid_version: int
    status: JudgePassStatus
    duels_total: int = 0
    duels_completed: int = 0
    judge_errors: int = 0
    unpairable_slots: int = 0
    judge_is_candidate: bool = Field(
        False,
        description=(
            "Le juge figure parmi les modèles comparés. Autorisé, mais le biais "
            "d'auto-préférence est cohérent dans les deux sens de lecture : il échappe "
            "donc au contrôle de position et doit être signalé en évidence dans le rapport."
        ),
    )
    estimated_max_usd: float = Field(
        0.0,
        description="Coût estimé des duels restants au lancement, calculé avant de dépenser",
    )
    spent_usd: float = 0.0
    budget_cap_usd: float = 0.0
    message: str = ""
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PairwisePassProgress(BaseModel):
    """Progression in-memory d'une passe de comparaison."""

    active: bool = False
    run_id: Optional[str] = None
    judge_model: Optional[str] = None
    status: Optional[JudgePassStatus] = None
    duels_total: int = 0
    duels_completed: int = 0
    current_case: Optional[str] = None
    spent_usd: float = 0.0
    budget_cap_usd: float = 0.0
    paused: bool = False
    message: str = ""


class PairwisePassLaunchResponse(BaseModel):
    """Réponse de lancement d'une passe de comparaison."""

    run_id: str
    judge_model: str
    status: JudgePassStatus
    duels_total: int
    unpairable_slots: int
    estimated_max_usd: float
    judge_is_candidate: bool = Field(
        False,
        description=(
            "Le juge figure parmi les modèles comparés. Autorisé, mais le biais "
            "d'auto-préférence est cohérent dans les deux sens de lecture : il échappe "
            "donc au contrôle de position et doit être signalé en évidence dans le rapport."
        ),
    )


class PairwiseVerdictListResponse(BaseModel):
    """Réponse de listage des duels d'un run."""

    run_id: str
    judge_models: List[str] = Field(default_factory=list)
    total: int = Field(
        0,
        description=(
            "Nombre de duels après filtre, avant pagination : sans lui, un client "
            "pourrait publier un classement sur la première page en la croyant complète."
        ),
    )
    verdicts: List[PairwiseVerdict] = Field(default_factory=list)
