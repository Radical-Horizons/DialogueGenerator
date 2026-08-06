"""Schémas Pydantic du mode Benchmark (suites, portes, runs).

Contrat unique partagé par le moteur de run, l'API REST et — plus tard — le
jugement de qualité, la CLI et l'UI. Les identifiants (`case_id`, `suite_id`,
`model_id`) sont stables et servent d'unique clé d'appariement : aucun libellé
d'affichage n'est jamais utilisé pour retrouver une entité.
"""

from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

from api.schemas.dialogue import GenerateUnityDialogueRequest

BenchmarkGenerationStatus = Literal["valid", "invalid", "config_error"]
"""Issue d'une génération de benchmark.

- ``valid`` : la génération a franchi toutes les portes structurelles.
- ``invalid`` : au moins une porte a échoué — exclue des moyennes, jamais notée zéro.
- ``config_error`` : le modèle n'a pas pu produire pour une raison de protocole ou
  de configuration (clé absente, paramètre refusé) — ni noté, ni classé.
"""

BenchmarkGateId = Literal[
    "parsable",
    "schema",
    "choice_ids",
    "flags",
    "language",
    "non_empty",
    "length",
    "connectivity",
]
"""Identifiant stable d'une porte structurelle."""

BenchmarkNarrationMode = Literal["avec", "sans"]
"""Présence de didascalies de narration dans le dialogue demandé.

C'est un **mode de run**, pas une propriété de cas : la question ne dépend ni du
personnage ni du lieu, et la porter par cas doublerait le coût de la suite pour
un axe qui s'observe très bien en comparant deux runs.
"""

BenchmarkRunStatus = Literal[
    "running",
    "paused",
    "completed",
    "interrupted_budget",
    "cancelled",
    "failed",
]
"""État d'un run. ``interrupted_budget`` conserve tous les résultats déjà produits."""


class BenchmarkCaseExpectations(BaseModel):
    """Attentes structurelles optionnelles d'un cas.

    Attributes:
        min_choices: Nombre minimal de choix attendu sur le nœud généré.
        max_choices: Nombre maximal de choix attendu sur le nœud généré.
        max_words: Plafond de mots du texte créatif d'un panneau.
        min_panels: Nombre minimal de panneaux attendu dans le fragment.
        expected_flag_ids: Flags dont la présence est attendue dans la génération.
    """

    min_choices: Optional[int] = Field(None, ge=0, description="Nombre minimal de choix attendu")
    max_choices: Optional[int] = Field(None, ge=0, description="Nombre maximal de choix attendu")
    max_words: Optional[int] = Field(
        None,
        gt=0,
        description=(
            "Plafond de mots de la réplique d'un panneau. Le système de dialogue du "
            "GDD vise 150 mots et plafonne à 300 : c'est une contrainte objectivement "
            "vérifiable, qui relève d'une porte et non d'un retrait de points par le juge."
        ),
    )
    min_panels: Optional[int] = Field(
        None,
        ge=1,
        description=(
            "Nombre minimal de panneaux du fragment. L'unité mesurée est un panneau, "
            "ses options et la suite de chacune : un cas qui n'en obtient qu'un seul "
            "ne mesure ni la conséquence perceptible ni la cohérence des embranchements."
        ),
    )
    expected_flag_ids: List[str] = Field(
        default_factory=list, description="Flags attendus dans la génération"
    )


class BenchmarkCase(BaseModel):
    """Un cas de benchmark : une requête de génération figée, rejouable.

    Attributes:
        case_id: Identifiant stable, unique dans la suite.
        title: Libellé lisible (jamais utilisé pour l'appariement).
        categories: Étiquettes libres axe → valeur (ton, fonction, longueur, personnage…).
        request: Requête de génération Unity figée, rejouée telle quelle.
        expectations: Attentes structurelles optionnelles, vérifiées par les portes.
    """

    case_id: str = Field(
        ...,
        min_length=1,
        max_length=80,
        description="Identifiant stable du cas (borné : il compose un nom de fichier)",
    )
    title: str = Field("", description="Libellé lisible du cas")
    categories: Dict[str, str] = Field(
        default_factory=dict,
        description="Étiquettes libres axe → valeur (ex. ton=grave, fonction=marchandage)",
    )
    request: GenerateUnityDialogueRequest = Field(
        ..., description="Requête de génération Unity figée"
    )
    expectations: Optional[BenchmarkCaseExpectations] = Field(
        None, description="Attentes structurelles optionnelles"
    )


class BenchmarkSuite(BaseModel):
    """Jeu de cas nommé et versionné, stocké en donnée.

    Attributes:
        suite_id: Identifiant stable de la suite.
        version: Version entière, incrémentée à chaque écriture.
        name: Nom lisible.
        description: Description libre.
        cases: Cas de la suite — au moins un.
        updated_at: Horodatage ISO-8601 de la dernière écriture.
    """

    suite_id: str = Field(..., min_length=1, description="Identifiant stable de la suite")
    version: int = Field(1, ge=1, description="Version de la suite")
    name: str = Field("", description="Nom lisible")
    description: str = Field("", description="Description libre")
    cases: List[BenchmarkCase] = Field(..., description="Cas de la suite")
    updated_at: Optional[str] = Field(None, description="Horodatage ISO-8601 de mise à jour")

    @field_validator("cases")
    @classmethod
    def _reject_empty_or_duplicate_cases(cls, cases: List[BenchmarkCase]) -> List[BenchmarkCase]:
        """Refuse une suite vide ou aux ``case_id`` dupliqués.

        Une suite vide produirait un run sans mesure : échec explicite plutôt que
        silencieux (§11.1 de la spécification fonctionnelle).
        """
        if not cases:
            raise ValueError("Une suite doit contenir au moins un cas")
        seen = [case.case_id for case in cases]
        duplicates = sorted({cid for cid in seen if seen.count(cid) > 1})
        if duplicates:
            raise ValueError(f"case_id dupliqués dans la suite : {', '.join(duplicates)}")
        return cases


class BenchmarkSuiteSummary(BaseModel):
    """Vue de liste d'une suite, sans les cas."""

    suite_id: str
    version: int
    name: str
    description: str
    case_count: int
    updated_at: Optional[str] = None


class BenchmarkSuiteListResponse(BaseModel):
    """Réponse de listage des suites."""

    suites: List[BenchmarkSuiteSummary] = Field(default_factory=list)


class BenchmarkSuiteResponse(BaseModel):
    """Réponse portant une suite complète."""

    suite: BenchmarkSuite


class BenchmarkSuiteUpsertRequest(BaseModel):
    """Création ou remplacement d'une suite (la version est gérée par le store)."""

    suite_id: str = Field(..., min_length=1)
    name: str = ""
    description: str = ""
    cases: List[BenchmarkCase]

    @field_validator("cases")
    @classmethod
    def _reject_empty(cls, cases: List[BenchmarkCase]) -> List[BenchmarkCase]:
        """Refuse une suite sans cas."""
        if not cases:
            raise ValueError("Une suite doit contenir au moins un cas")
        return cases


class BenchmarkRunConfig(BaseModel):
    """Paramètres d'un run.

    Attributes:
        suite_id: Suite à rejouer.
        suite_version: Version attendue ; ``None`` prend la version courante.
        models: Modèles candidats (au moins un).
        repetitions: Nombre de générations par cas et par modèle.
        budget_cap_usd: Plafond dur du run, en USD.
        narration_mode: Didascalies de narration demandées ou non, pour tout le run.
    """

    suite_id: str = Field(..., min_length=1, description="Suite à rejouer")
    suite_version: Optional[int] = Field(None, ge=1, description="Version attendue de la suite")
    models: List[str] = Field(..., min_length=1, description="Modèles candidats")
    repetitions: int = Field(3, ge=1, le=20, description="Générations par cas et par modèle")
    budget_cap_usd: float = Field(..., gt=0, description="Plafond dur du run en USD")
    narration_mode: BenchmarkNarrationMode = Field(
        "sans",
        description=(
            "Didascalies de narration : appliqué uniformément à tous les cas du run. "
            "Pour trancher la question produit, lancer deux runs et comparer."
        ),
    )

    @field_validator("models")
    @classmethod
    def _reject_duplicate_models(cls, models: List[str]) -> List[str]:
        """Refuse un modèle listé deux fois (fausserait le nombre de générations)."""
        if len(set(models)) != len(models):
            raise ValueError("Un modèle ne peut être listé qu'une fois")
        return models


class BenchmarkGateFailure(BaseModel):
    """Échec d'une porte structurelle.

    Attributes:
        gate: Identifiant stable de la porte.
        message: Raison lisible de l'échec.
    """

    gate: BenchmarkGateId
    message: str


class BenchmarkGenerationRecord(BaseModel):
    """Une génération produite par un run, avec son verdict de portes et son coût.

    Attributes:
        run_id: Run auquel appartient la génération.
        case_id: Cas rejoué.
        model_id: Modèle candidat.
        repetition: Index de répétition, à partir de 0.
        status: Issue (``valid`` / ``invalid`` / ``config_error``).
        gate_failures: Portes échouées quand ``status`` vaut ``invalid``.
        json_content: Sortie Unity brute, conservée pour audit et jugement ultérieur.
        title: Titre proposé par le modèle.
        raw_prompt: Prompt réellement envoyé.
        prompt_hash: Empreinte SHA-256 du prompt.
        cost_usd: Coût réel de l'appel.
        prompt_tokens: Tokens d'entrée consommés.
        completion_tokens: Tokens de sortie consommés.
        duration_ms: Durée de l'appel.
        language_detector: Détecteur ayant tranché la porte de langue.
        error_message: Message d'erreur quand ``status`` vaut ``config_error``.
        created_at: Horodatage ISO-8601.
    """

    run_id: str
    case_id: str
    model_id: str
    repetition: int = Field(..., ge=0)
    status: BenchmarkGenerationStatus
    gate_failures: List[BenchmarkGateFailure] = Field(default_factory=list)
    json_content: Optional[str] = None
    title: Optional[str] = None
    raw_prompt: Optional[str] = None
    prompt_hash: Optional[str] = None
    cost_usd: float = 0.0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    duration_ms: int = 0
    language_detector: Optional[str] = Field(
        None,
        description=(
            "Détecteur de langue ayant tranché (langdetect / lexical / too_short). "
            "Deux machines qui n'ont pas la même dépendance installée ne produisent "
            "pas des taux de validité comparables : l'information doit voyager avec la note."
        ),
    )
    error_message: Optional[str] = None
    created_at: Optional[str] = None


class BenchmarkModelDiagnostic(BaseModel):
    """Diagnostic de configuration d'un modèle candidat.

    Attributes:
        model_id: Modèle concerné.
        usable: ``False`` si le modèle ne peut pas produire de mesure valable.
        reason: Raison lisible quand ``usable`` est ``False``.
    """

    model_id: str
    usable: bool
    reason: Optional[str] = None


class BenchmarkCostEstimate(BaseModel):
    """Fourchette de coût d'un run, calculée avant lancement.

    Attributes:
        generations: Nombre d'appels de génération prévus.
        estimated_min_usd: Borne basse.
        estimated_max_usd: Borne haute.
        unpriced_models: Modèles sans tarif connu — la fourchette les sous-estime.
    """

    generations: int
    estimated_min_usd: float
    estimated_max_usd: float
    unpriced_models: List[str] = Field(default_factory=list)


class BenchmarkRunIdentity(BaseModel):
    """Identité comparable d'un run.

    Deux runs dont l'identité diffère ne sont pas comparables ; le jugement et le
    rapport (specs suivantes) s'appuient sur ce bloc pour le refuser.
    """

    suite_id: str
    suite_version: int
    suite_fingerprint: str = Field(..., description="Empreinte du contenu de la suite")
    models: List[str]
    repetitions: int
    narration_mode: BenchmarkNarrationMode = Field(
        "sans",
        description=(
            "Mode de narration du run. Deux runs de modes différents ne demandent pas "
            "la même chose au modèle : les agréger mélangerait deux mesures."
        ),
    )


class BenchmarkRun(BaseModel):
    """État persisté d'un run (``run.json``).

    Attributes:
        run_id: Identifiant du run.
        config: Configuration demandée.
        identity: Identité comparable.
        status: État courant.
        generations_total: Nombre de générations prévues.
        generations_completed: Nombre de générations persistées.
        cases_total: Cas de la suite.
        cases_covered: Cas ayant au moins une génération persistée.
        spent_usd: Coût réel cumulé.
        model_diagnostics: Diagnostics de configuration par modèle.
        message: Message d'état lisible.
        created_at: Horodatage de création.
        updated_at: Horodatage de dernière écriture.
    """

    run_id: str
    config: BenchmarkRunConfig
    identity: BenchmarkRunIdentity
    status: BenchmarkRunStatus
    generations_total: int = 0
    generations_completed: int = 0
    cases_total: int = 0
    cases_covered: int = 0
    spent_usd: float = 0.0
    model_diagnostics: List[BenchmarkModelDiagnostic] = Field(default_factory=list)
    message: str = ""
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class BenchmarkRunProgress(BaseModel):
    """Progression in-memory d'un run en cours.

    Attributes:
        active: ``True`` tant qu'un run tourne dans ce processus.
        paused: ``True`` si la pause coopérative est demandée.
    """

    active: bool = False
    run_id: Optional[str] = None
    status: Optional[BenchmarkRunStatus] = None
    generations_total: int = 0
    generations_completed: int = 0
    current_model: Optional[str] = None
    current_case: Optional[str] = None
    current_repetition: Optional[int] = None
    spent_usd: float = 0.0
    budget_cap_usd: float = 0.0
    paused: bool = False
    message: str = ""


class BenchmarkRunLaunchResponse(BaseModel):
    """Réponse de lancement ou de reprise d'un run."""

    run_id: str
    status: BenchmarkRunStatus
    estimate: BenchmarkCostEstimate
    model_diagnostics: List[BenchmarkModelDiagnostic] = Field(default_factory=list)


class BenchmarkRunListResponse(BaseModel):
    """Réponse de listage des runs."""

    runs: List[BenchmarkRun] = Field(default_factory=list)


class BenchmarkRunControlResponse(BaseModel):
    """Réponse d'une commande de contrôle (pause / unpause / cancel)."""

    run_id: str
    applied: bool
    message: str


class BenchmarkGenerationListResponse(BaseModel):
    """Réponse de listage des générations d'un run."""

    run_id: str
    generations: List[BenchmarkGenerationRecord] = Field(default_factory=list)
