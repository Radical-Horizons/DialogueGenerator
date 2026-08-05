"""Moteur de run du mode benchmark.

Rejoue l'orchestrateur de génération existant sur suite × modèles × répétitions,
en tâche de fond, avec progression consultable, pause et annulation coopératives,
sauvegarde incrémentale après chaque génération, reprise sans refaire ce qui est
déjà produit, et plafond budgétaire dur.

Le patron d'exécution est celui de la sync GDD complète
(``services/gdd_notion_sync_service.py``) : verrou asyncio, dict de progression
mono-thread, point de contrôle coopératif, état persisté distinct de la
progression en mémoire.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, List, Optional, Tuple

from pydantic import ValidationError

from api.middleware.billable_user_context import (
    push_billable_user_id,
    reset_billable_user_id,
)
from api.schemas.benchmark import (
    BenchmarkCase,
    BenchmarkCostEstimate,
    BenchmarkGateFailure,
    BenchmarkGenerationRecord,
    BenchmarkModelDiagnostic,
    BenchmarkRun,
    BenchmarkRunConfig,
    BenchmarkRunIdentity,
    BenchmarkRunProgress,
    BenchmarkSuite,
)
from api.schemas.dialogue import GenerateUnityDialogueRequest
from constants import ModelNames
from core.llm.llm_client import DummyLLMClient
from core.llm.unity_allowed_models import get_unity_structured_output_allowed_models
from factories.llm_factory import LLMClientFactory
from services.benchmark_gate_service import BenchmarkGateService
from services.benchmark_suite_store import BenchmarkSuiteStore, suite_fingerprint
from services.gdd_notion_atomic_io import read_json_file, write_json_atomic

logger = logging.getLogger(__name__)

BENCHMARK_BILLABLE_USER_ID = "benchmark"
"""Identité de facturation dédiée : le coût des runs n'entame jamais le quota d'un humain."""

DEFAULT_PROMPT_TOKENS_ESTIMATE = 5000
"""Estimation d'entrée quand le cas ne déclare pas de budget de contexte."""

DEFAULT_COMPLETION_TOKENS_ESTIMATE = 1000
"""Estimation de sortie quand le cas ne déclare pas de plafond de complétion."""

COST_ESTIMATE_LOW_RATIO = 0.4
"""Borne basse de la fourchette : les plafonds déclarés sont rarement atteints."""

_SLUG_RE = re.compile(r"[^A-Za-z0-9._-]+")

_RUN_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9-]*$")
"""Alphabet des ``run_id`` : pas de point, donc aucune traversée par ``..``."""


class BenchmarkRunCancelled(Exception):
    """Annulation coopérative demandée pendant un run."""


class _BudgetExhausted(Exception):
    """Signal interne : plafond budgétaire atteint, arrêt propre du run."""


class BenchmarkRunConflictError(RuntimeError):
    """Un run est déjà en cours, ou la reprise demandée n'est pas valide."""


class BenchmarkRunNotFoundError(LookupError):
    """Le run demandé n'existe pas sur disque."""


def _slug(value: str) -> str:
    """Rend un identifiant sûr comme composant de nom de fichier.

    Les identifiants de modèle contiennent des séparateurs de chemin
    (``aion-labs/aion-2.0``) : les écrire tels quels créerait des
    sous-répertoires fantômes.

    Args:
        value: Identifiant brut.

    Returns:
        Identifiant assaini.
    """
    return _SLUG_RE.sub("-", value).strip("-") or "unknown"


def _now_iso() -> str:
    """Horodatage ISO-8601 en UTC."""
    return datetime.now(timezone.utc).isoformat()


class _NoFallbackConfigService:
    """Vue du service de configuration qui neutralise la chaîne de repli LLM.

    Sans cela, un modèle en tête de ``fallback_chain`` serait généré via un client
    à repli : en cas d'échec, le benchmark mesurerait silencieusement un autre
    modèle et lui attribuerait la note du modèle demandé.
    """

    def __init__(self, inner: Any) -> None:
        """Initialise le proxy.

        Args:
            inner: Service de configuration réel.
        """
        self._inner = inner

    def get_llm_fallback_chain(self) -> List[str]:
        """Retourne une chaîne vide : aucun repli pendant un benchmark."""
        return []

    def __getattr__(self, name: str) -> Any:
        """Délègue tout le reste au service réel."""
        return getattr(self._inner, name)


class BenchmarkRunService:
    """Orchestre les runs de benchmark et persiste leurs résultats."""

    def __init__(
        self,
        *,
        suite_store: BenchmarkSuiteStore,
        gate_service: BenchmarkGateService,
        pricing_service: Any,
        config_service: Any,
        orchestrator_factory: Callable[[str], Any],
        runs_dir: Path,
    ) -> None:
        """Initialise le moteur.

        Args:
            suite_store: Magasin des suites.
            gate_service: Portes structurelles.
            pricing_service: ``LLMPricingService`` pour l'estimation de coût.
            config_service: ``ConfigurationService`` (modèles disponibles, config LLM).
            orchestrator_factory: Fabrique d'orchestrateur, indexée par ``request_id``.
            runs_dir: Répertoire des runs (résolu depuis ``FilePaths``).
        """
        self._suite_store = suite_store
        self._gate_service = gate_service
        self._pricing_service = pricing_service
        self._config_service = config_service
        self._orchestrator_factory = orchestrator_factory
        self._runs_dir = Path(runs_dir)

        self._run_lock = asyncio.Lock()
        self._unpaused = asyncio.Event()
        self._unpaused.set()
        self._cancel_requested = False
        self._active_run_id: Optional[str] = None
        self._task: Optional[asyncio.Task] = None
        self._progress = BenchmarkRunProgress()

    # ------------------------------------------------------------------
    # Lecture
    # ------------------------------------------------------------------

    def read_progress(self) -> BenchmarkRunProgress:
        """Retourne une copie de la progression en mémoire."""
        return self._progress.model_copy(deep=True)

    def _run_dir(self, run_id: str) -> Path:
        """Répertoire d'un run, après validation de son identifiant.

        ``_slug`` conserve le point : il ne suffit pas à empêcher ``..``. Le
        ``run_id`` vient de l'URL, il est donc validé comme un ``suite_id``.

        Args:
            run_id: Identifiant du run.

        Returns:
            Chemin du répertoire du run.

        Raises:
            BenchmarkRunNotFoundError: Si l'identifiant sort de l'alphabet autorisé.
        """
        if not _RUN_ID_RE.match(run_id or ""):
            raise BenchmarkRunNotFoundError(f"Identifiant de run invalide : {run_id!r}")
        return self._runs_dir / run_id

    def get_run(self, run_id: str) -> BenchmarkRun:
        """Charge l'état persisté d'un run.

        Args:
            run_id: Identifiant du run.

        Returns:
            L'état du run.

        Raises:
            BenchmarkRunNotFoundError: Si ``run.json`` est absent ou illisible.
        """
        raw = read_json_file(self._run_dir(run_id) / "run.json", None)
        if raw is None:
            raise BenchmarkRunNotFoundError(f"Run de benchmark introuvable : {run_id}")
        try:
            return BenchmarkRun.model_validate(raw)
        except ValidationError as exc:
            raise BenchmarkRunNotFoundError(f"Run '{run_id}' illisible : {exc}") from exc

    def list_runs(self) -> List[BenchmarkRun]:
        """Liste les runs persistés, du plus récent au plus ancien."""
        if not self._runs_dir.exists():
            return []
        runs: List[BenchmarkRun] = []
        for path in self._runs_dir.glob("*/run.json"):
            raw = read_json_file(path, None)
            if raw is None:
                continue
            try:
                runs.append(BenchmarkRun.model_validate(raw))
            except ValidationError as exc:
                logger.warning("Run de benchmark invalide ignoré (%s) : %s", path.parent.name, exc)
        runs.sort(key=lambda run: run.created_at or "", reverse=True)
        return runs

    def list_generations(self, run_id: str) -> List[BenchmarkGenerationRecord]:
        """Liste les générations persistées d'un run.

        Args:
            run_id: Identifiant du run.

        Returns:
            Générations triées par cas, modèle puis répétition.
        """
        directory = self._run_dir(run_id) / "generations"
        if not directory.exists():
            return []
        records: List[BenchmarkGenerationRecord] = []
        for path in sorted(directory.glob("*.json")):
            raw = read_json_file(path, None)
            if raw is None:
                continue
            try:
                records.append(BenchmarkGenerationRecord.model_validate(raw))
            except ValidationError as exc:
                logger.warning("Génération de benchmark invalide ignorée (%s) : %s", path.name, exc)
        records.sort(key=lambda rec: (rec.case_id, rec.model_id, rec.repetition))
        return records

    # ------------------------------------------------------------------
    # Estimation et vérification préalable
    # ------------------------------------------------------------------

    def estimate_cost(
        self, suite: BenchmarkSuite, config: BenchmarkRunConfig
    ) -> BenchmarkCostEstimate:
        """Estime la fourchette de coût d'un run avant lancement.

        L'estimation repose sur les plafonds déclarés par chaque cas ; la borne
        basse applique un ratio car ces plafonds sont rarement atteints. Les
        modèles sans tarif connu sont listés explicitement plutôt que comptés à
        zéro, ce qui laisserait croire à un run gratuit.

        Args:
            suite: Suite à rejouer.
            config: Paramètres du run.

        Returns:
            La fourchette estimée.
        """
        generations = len(suite.cases) * len(config.models) * config.repetitions
        unpriced: List[str] = []
        low = 0.0
        high = 0.0
        for model_id in config.models:
            pricing = None
            try:
                pricing = self._pricing_service.get_model_pricing(model_id)
            except Exception as exc:  # tarifs illisibles : signalé, jamais silencieux
                logger.warning("Tarif indisponible pour '%s' : %s", model_id, exc)
            if not pricing:
                unpriced.append(model_id)
                continue
            for case in suite.cases:
                prompt_tokens = case.request.max_context_tokens or DEFAULT_PROMPT_TOKENS_ESTIMATE
                completion_tokens = (
                    case.request.max_completion_tokens or DEFAULT_COMPLETION_TOKENS_ESTIMATE
                )
                unit = self._pricing_service.calculate_cost(
                    model_id, prompt_tokens, completion_tokens
                )
                high += unit * config.repetitions
                low += unit * COST_ESTIMATE_LOW_RATIO * config.repetitions
        return BenchmarkCostEstimate(
            generations=generations,
            estimated_min_usd=round(low, 6),
            estimated_max_usd=round(high, 6),
            unpriced_models=unpriced,
        )

    def diagnose_models(self, models: List[str]) -> List[BenchmarkModelDiagnostic]:
        """Vérifie que chaque modèle peut réellement produire une mesure.

        Deux pièges sont couverts : un modèle hors whitelist de génération Unity,
        et une clé API absente ou factice — cas où la fabrique retombe
        silencieusement sur ``DummyLLMClient``, ce qui produirait des générations
        parfaitement notables mais sans rapport avec le modèle testé.

        Args:
            models: Modèles candidats.

        Returns:
            Un diagnostic par modèle, dans l'ordre fourni.
        """
        allowed = get_unity_structured_output_allowed_models()
        try:
            llm_config = self._config_service.get_llm_config()
            available_models = self._config_service.get_available_llm_models()
        except Exception as exc:
            logger.error("Configuration LLM illisible : %s", exc)
            return [
                BenchmarkModelDiagnostic(
                    model_id=model_id,
                    usable=False,
                    reason=f"Configuration LLM illisible : {exc}",
                )
                for model_id in models
            ]

        diagnostics: List[BenchmarkModelDiagnostic] = []
        for model_id in models:
            if model_id != "dummy" and model_id not in allowed:
                diagnostics.append(
                    BenchmarkModelDiagnostic(
                        model_id=model_id,
                        usable=False,
                        reason=(
                            "Modèle hors whitelist de génération Unity "
                            "(structured output requis)"
                        ),
                    )
                )
                continue
            try:
                client = LLMClientFactory.create_client(
                    model_id=model_id,
                    config=llm_config,
                    available_models=available_models,
                )
            except Exception as exc:
                diagnostics.append(
                    BenchmarkModelDiagnostic(
                        model_id=model_id,
                        usable=False,
                        reason=f"Client LLM indisponible : {exc}",
                    )
                )
                continue
            if model_id != "dummy" and isinstance(client, DummyLLMClient):
                diagnostics.append(
                    BenchmarkModelDiagnostic(
                        model_id=model_id,
                        usable=False,
                        reason=(
                            "Clé API absente ou factice — la fabrique retombe sur "
                            "DummyLLMClient, les générations ne mesureraient pas ce modèle"
                        ),
                    )
                )
                continue
            diagnostics.append(BenchmarkModelDiagnostic(model_id=model_id, usable=True))
        return diagnostics

    # ------------------------------------------------------------------
    # Lancement, reprise, contrôle
    # ------------------------------------------------------------------

    async def start_run(
        self, config: BenchmarkRunConfig
    ) -> Tuple[BenchmarkRun, BenchmarkCostEstimate]:
        """Crée un run et le lance en tâche de fond.

        Args:
            config: Paramètres du run.

        Returns:
            Le run créé et l'estimation de coût.

        Raises:
            BenchmarkRunConflictError: Si un run est déjà en cours dans ce processus.
            BenchmarkSuiteNotFoundError: Si la suite n'existe pas.
            BenchmarkSuiteInvalidError: Si la suite est invalide ou d'une autre version.
        """
        # `_run_lock` n'est pris que dans la tâche de fond : le tester ici laisserait
        # passer deux lancements concurrents, donc deux fois le plafond budgétaire.
        # `_active_run_id` est posé synchroniquement par `_spawn`.
        if self._active_run_id is not None:
            raise BenchmarkRunConflictError(
                f"Un run de benchmark est déjà en cours ({self._active_run_id})"
            )

        suite = self._suite_store.get_suite(config.suite_id, version=config.suite_version)
        estimate = self.estimate_cost(suite, config)
        diagnostics = self.diagnose_models(config.models)
        self._reject_unmeasurable_run(estimate, diagnostics, config)

        run_id = f"{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}-{uuid.uuid4().hex[:8]}"
        run = BenchmarkRun(
            run_id=run_id,
            config=config,
            identity=BenchmarkRunIdentity(
                suite_id=suite.suite_id,
                suite_version=suite.version,
                suite_fingerprint=suite_fingerprint(suite),
                models=list(config.models),
                repetitions=config.repetitions,
            ),
            status="running",
            generations_total=len(suite.cases) * len(config.models) * config.repetitions,
            cases_total=len(suite.cases),
            model_diagnostics=diagnostics,
            message="Run démarré",
            created_at=_now_iso(),
            updated_at=_now_iso(),
        )
        self._persist_run(run)
        self._spawn(run, suite)
        return run, estimate

    async def resume_run(self, run_id: str) -> Tuple[BenchmarkRun, BenchmarkCostEstimate]:
        """Reprend un run interrompu sans refaire ce qui est déjà produit.

        Args:
            run_id: Identifiant du run à reprendre.

        Returns:
            Le run repris et l'estimation résiduelle.

        Raises:
            BenchmarkRunConflictError: Si un run tourne déjà, si le run visé est
                terminé, ou si la suite a changé depuis (empreinte différente).
            BenchmarkRunNotFoundError: Si le run n'existe pas.
        """
        if self._active_run_id is not None:
            raise BenchmarkRunConflictError(
                f"Un run de benchmark est déjà en cours ({self._active_run_id})"
            )
        run = self.get_run(run_id)
        if run.status == "completed":
            raise BenchmarkRunConflictError(f"Run '{run_id}' déjà terminé")

        suite = self._suite_store.get_suite(
            run.identity.suite_id, version=run.identity.suite_version
        )
        current_fingerprint = suite_fingerprint(suite)
        if current_fingerprint != run.identity.suite_fingerprint:
            raise BenchmarkRunConflictError(
                f"La suite '{run.identity.suite_id}' a changé depuis le run "
                f"(empreinte {current_fingerprint[:12]}… ≠ {run.identity.suite_fingerprint[:12]}…) : "
                "reprise refusée, les mesures ne seraient pas comparables"
            )

        # Le diagnostic est refait : la cause la plus fréquente d'un `config_error`
        # est une clé API absente, que l'admin corrige précisément avant de reprendre.
        diagnostics = self.diagnose_models(run.config.models)
        estimate = self.estimate_cost(suite, run.config)
        self._reject_unmeasurable_run(estimate, diagnostics, run.config)
        self._discard_config_error_records(run.run_id)

        run = run.model_copy(
            update={
                "status": "running",
                "message": "Run repris",
                "model_diagnostics": diagnostics,
            }
        )
        self._persist_run(run)
        self._spawn(run, suite)
        return run, estimate

    def _reject_unmeasurable_run(
        self,
        estimate: BenchmarkCostEstimate,
        diagnostics: List[BenchmarkModelDiagnostic],
        config: BenchmarkRunConfig,
    ) -> None:
        """Refuse un run qui ne pourrait produire aucune mesure exploitable.

        Trois cas, tous signalés avant le moindre appel LLM plutôt que découverts
        dans un rapport vide :

        - aucun modèle utilisable — le run se terminerait ``completed`` sans mesure ;
        - un modèle sans tarif connu — ``calculate_cost`` renvoie 0 hors production,
          donc le plafond ne pourrait jamais se déclencher et la dépense serait non bornée ;
        - une estimation basse déjà supérieure au plafond — le run s'arrêterait
          quasi immédiatement après avoir dépensé.

        Args:
            estimate: Fourchette de coût estimée.
            diagnostics: Diagnostics par modèle.
            config: Paramètres du run.

        Raises:
            BenchmarkRunConflictError: Si le run ne peut pas produire de mesure valable.
        """
        if not any(diagnostic.usable for diagnostic in diagnostics):
            reasons = "; ".join(
                f"{d.model_id}: {d.reason}" for d in diagnostics if d.reason
            )
            raise BenchmarkRunConflictError(
                f"Aucun modèle utilisable pour ce run ({reasons or 'aucun diagnostic'})"
            )
        if estimate.unpriced_models:
            raise BenchmarkRunConflictError(
                "Tarif inconnu pour "
                f"{', '.join(estimate.unpriced_models)} : le plafond budgétaire ne "
                "pourrait pas se déclencher. Renseigner config/llm_pricing.json avant de lancer."
            )
        if estimate.estimated_min_usd > config.budget_cap_usd:
            raise BenchmarkRunConflictError(
                f"Plafond ({config.budget_cap_usd:.4f} USD) inférieur à l'estimation basse "
                f"({estimate.estimated_min_usd:.4f} USD) : le run s'arrêterait aussitôt."
            )

    def _discard_config_error_records(self, run_id: str) -> None:
        """Supprime les records ``config_error`` avant une reprise.

        Un ``config_error`` traduit un problème d'environnement (clé absente,
        paramètre refusé, coupure), pas une propriété du modèle. Les conserver
        ferait sauter ces cellules à la reprise et laisserait le modèle sans
        aucune mesure alors que la cause a justement été corrigée.

        Args:
            run_id: Run à nettoyer.
        """
        directory = self._run_dir(run_id) / "generations"
        if not directory.exists():
            return
        for path in directory.glob("*.json"):
            raw = read_json_file(path, None)
            if isinstance(raw, dict) and raw.get("status") == "config_error":
                try:
                    path.unlink()
                except OSError as exc:
                    logger.warning("Record config_error non supprimé (%s) : %s", path.name, exc)

    def _spawn(self, run: BenchmarkRun, suite: BenchmarkSuite) -> None:
        """Lance l'exécution en tâche de fond et retourne immédiatement."""
        self._cancel_requested = False
        self._unpaused.set()
        self._active_run_id = run.run_id
        self._task = asyncio.create_task(self._execute(run, suite))

    def _is_active(self, run_id: Optional[str]) -> bool:
        """Indique si ``run_id`` désigne le run actif de ce processus.

        Les commandes de contrôle portent un ``run_id`` : l'ignorer permettrait
        d'annuler le run en cours depuis l'onglet d'un run terminé, en répondant
        « appliqué » sur le mauvais identifiant.

        Args:
            run_id: Identifiant visé, ou ``None`` pour « le run actif, quel qu'il soit ».

        Returns:
            ``True`` si la commande peut s'appliquer.
        """
        if self._active_run_id is None:
            return False
        return run_id is None or run_id == self._active_run_id

    def _persist_status(self, run_id: str, status: str, message: str) -> None:
        """Reflète un changement d'état dans ``run.json``.

        Sans cela, une pause resterait invisible depuis ``GET /runs/{id}``, où le
        run continuerait d'apparaître ``running``.

        Args:
            run_id: Run concerné.
            status: Nouvel état.
            message: Message d'état lisible.
        """
        try:
            run = self.get_run(run_id)
        except BenchmarkRunNotFoundError:
            return
        self._persist_run(run.model_copy(update={"status": status, "message": message}))

    def request_pause(self, run_id: Optional[str] = None) -> bool:
        """Demande une pause coopérative.

        Args:
            run_id: Run visé ; ``None`` cible le run actif.

        Returns:
            ``True`` si le run actif a reçu la demande.
        """
        if not self._is_active(run_id):
            return False
        self._unpaused.clear()
        self._progress = self._progress.model_copy(
            update={"paused": True, "status": "paused", "message": "Pause demandée"}
        )
        self._persist_status(str(self._active_run_id), "paused", "Run en pause")
        return True

    def request_unpause(self, run_id: Optional[str] = None) -> bool:
        """Relance un run mis en pause.

        Args:
            run_id: Run visé ; ``None`` cible le run actif.

        Returns:
            ``True`` si le run actif a reçu la demande.
        """
        if not self._is_active(run_id):
            return False
        self._unpaused.set()
        self._progress = self._progress.model_copy(
            update={"paused": False, "status": "running", "message": "Reprise"}
        )
        self._persist_status(str(self._active_run_id), "running", "Run repris après pause")
        return True

    def request_cancel(self, run_id: Optional[str] = None) -> bool:
        """Demande l'annulation coopérative du run en cours.

        Les résultats déjà persistés sont conservés.

        Args:
            run_id: Run visé ; ``None`` cible le run actif.

        Returns:
            ``True`` si le run actif a reçu la demande.
        """
        if not self._is_active(run_id):
            return False
        self._cancel_requested = True
        self._unpaused.set()
        self._progress = self._progress.model_copy(update={"message": "Annulation demandée"})
        return True

    async def _cooperative_point(self) -> None:
        """Point de contrôle pause / annulation.

        Raises:
            BenchmarkRunCancelled: Si une annulation a été demandée.
        """
        if self._cancel_requested:
            raise BenchmarkRunCancelled()
        await self._unpaused.wait()
        if self._cancel_requested:
            raise BenchmarkRunCancelled()

    # ------------------------------------------------------------------
    # Exécution
    # ------------------------------------------------------------------

    def _persist_run(self, run: BenchmarkRun) -> None:
        """Écrit ``run.json`` de façon atomique."""
        stamped = run.model_copy(update={"updated_at": _now_iso()})
        write_json_atomic(self._run_dir(run.run_id) / "run.json", stamped.model_dump(mode="json"))

    def _record_path(self, run_id: str, model_id: str, case_id: str, repetition: int) -> Path:
        """Chemin du fichier d'une génération.

        Le suffixe d'empreinte distingue deux identifiants qui s'assainissent en
        un même nom de fichier (``a/b`` et ``a-b``) : sans lui, un record en
        écraserait un autre et la reprise sauterait une génération jamais faite.
        """
        digest = hashlib.sha256(f"{model_id}|{case_id}".encode("utf-8")).hexdigest()[:8]
        name = f"{_slug(model_id)}__{_slug(case_id)}__{digest}__{repetition}.json"
        return self._run_dir(run_id) / "generations" / name

    def _record_is_usable(self, path: Path) -> bool:
        """Indique si un record déjà présent peut être considéré comme fait.

        Se fier à la seule existence du fichier ferait passer un record tronqué
        (écriture interrompue, disque plein) pour une génération produite : la
        cellule ne serait jamais rejouée et manquerait définitivement à la matrice,
        alors que le run se déclarerait complet.

        Args:
            path: Chemin du record.

        Returns:
            ``True`` si le fichier existe et se valide.
        """
        if not path.exists():
            return False
        raw = read_json_file(path, None)
        if raw is None:
            logger.warning("Record de benchmark illisible, régénération : %s", path.name)
            return False
        try:
            BenchmarkGenerationRecord.model_validate(raw)
        except ValidationError as exc:
            logger.warning("Record de benchmark invalide, régénération (%s) : %s", path.name, exc)
            return False
        return True

    def _persist_record(self, record: BenchmarkGenerationRecord) -> None:
        """Écrit une génération immédiatement après sa production.

        La sauvegarde est incrémentale par conception : un run interrompu par un
        plafond, une panne ou une fermeture conserve tout ce qui précède.
        """
        path = self._record_path(
            record.run_id, record.model_id, record.case_id, record.repetition
        )
        write_json_atomic(path, record.model_dump(mode="json"))

    async def _execute(self, run: BenchmarkRun, suite: BenchmarkSuite) -> None:
        """Boucle principale d'un run.

        Args:
            run: État initial du run.
            suite: Suite rejouée.
        """
        async with self._run_lock:
            billable_token = push_billable_user_id(BENCHMARK_BILLABLE_USER_ID)
            # Recalculé depuis les records, jamais lu dans `run.json` : un run tué
            # brutalement n'a pas eu le temps d'y écrire son cumul, et la reprise
            # repartirait d'un budget à zéro — le plafond serait rejouable à l'infini.
            existing = self.list_generations(run.run_id)
            spent = round(sum(record.cost_usd for record in existing), 6)
            completed = 0
            # Le statut ne devient `completed` qu'après sortie normale des boucles :
            # `asyncio.CancelledError` hérite de `BaseException` et traverse les
            # `except` ci-dessous, mais pas le `finally` qui persiste l'état.
            status: str = "failed"
            message = "Run interrompu avant la fin (arrêt du processus ?)"
            unusable = {
                diagnostic.model_id: diagnostic.reason or "Modèle inutilisable"
                for diagnostic in run.model_diagnostics
                if not diagnostic.usable
            }

            self._progress = BenchmarkRunProgress(
                active=True,
                run_id=run.run_id,
                status="running",
                generations_total=run.generations_total,
                generations_completed=0,
                spent_usd=spent,
                budget_cap_usd=run.config.budget_cap_usd,
                message="Run démarré",
            )

            try:
                for case in suite.cases:
                    for model_id in run.config.models:
                        for repetition in range(run.config.repetitions):
                            # Avant le test d'existence : reprendre une matrice
                            # presque complète enchaînerait des milliers de `stat()`
                            # sans rendre la main, gelant la boucle d'événements.
                            await self._cooperative_point()

                            path = self._record_path(
                                run.run_id, model_id, case.case_id, repetition
                            )
                            if self._record_is_usable(path):
                                completed += 1
                                continue

                            if model_id in unusable:
                                self._persist_record(
                                    BenchmarkGenerationRecord(
                                        run_id=run.run_id,
                                        case_id=case.case_id,
                                        model_id=model_id,
                                        repetition=repetition,
                                        status="config_error",
                                        error_message=unusable[model_id],
                                        created_at=_now_iso(),
                                    )
                                )
                                completed += 1
                                self._update_progress(completed, spent, model_id, case, repetition)
                                continue

                            if spent >= run.config.budget_cap_usd:
                                status = "interrupted_budget"
                                message = (
                                    f"Plafond budgétaire atteint ({spent:.4f} USD "
                                    f"≥ {run.config.budget_cap_usd:.4f} USD) — "
                                    "résultats partiels conservés"
                                )
                                raise _BudgetExhausted()

                            record = await self._generate_one(
                                run=run,
                                case=case,
                                model_id=model_id,
                                repetition=repetition,
                            )
                            self._persist_record(record)
                            spent += record.cost_usd
                            completed += 1
                            self._update_progress(completed, spent, model_id, case, repetition)

                status = "completed"
                message = "Run terminé"

            except _BudgetExhausted:
                logger.info("Run %s interrompu par le plafond budgétaire", run.run_id)
            except BenchmarkRunCancelled:
                status = "cancelled"
                message = "Run annulé — résultats partiels conservés"
                logger.info("Run %s annulé à la demande", run.run_id)
            except asyncio.CancelledError:
                status = "cancelled"
                message = "Run interrompu par l'arrêt du processus — résultats partiels conservés"
                logger.warning("Run de benchmark %s annulé par l'ordonnanceur", run.run_id)
                raise
            except Exception as exc:
                status = "failed"
                message = f"Run interrompu par une erreur : {exc}"
                logger.exception("Run de benchmark %s en échec", run.run_id)
            finally:
                # `_active_run_id` est libéré en premier : une exception dans la
                # finalisation (disque plein, record illisible) laisserait sinon le
                # service bloqué sur un run mort, insensible à pause et annulation.
                self._active_run_id = None
                reset_billable_user_id(billable_token)
                try:
                    records = self.list_generations(run.run_id)
                    # Un cas dont toutes les générations sont `config_error` n'est pas
                    # couvert : le compter gonflerait la couverture d'un run sans mesure.
                    covered = len(
                        {
                            record.case_id
                            for record in records
                            if record.status != "config_error"
                        }
                    )
                    final = run.model_copy(
                        update={
                            "status": status,
                            "message": message,
                            "generations_completed": len(records),
                            "cases_covered": covered,
                            "spent_usd": round(sum(record.cost_usd for record in records), 6),
                        }
                    )
                    self._persist_run(final)
                    self._progress = BenchmarkRunProgress(
                        active=False,
                        run_id=run.run_id,
                        status=final.status,
                        generations_total=run.generations_total,
                        generations_completed=len(records),
                        spent_usd=final.spent_usd,
                        budget_cap_usd=run.config.budget_cap_usd,
                        message=message,
                    )
                except Exception:
                    logger.exception(
                        "Finalisation du run de benchmark %s impossible", run.run_id
                    )

    def _update_progress(
        self,
        completed: int,
        spent: float,
        model_id: str,
        case: BenchmarkCase,
        repetition: int,
    ) -> None:
        """Met à jour la progression en mémoire après une unité de travail."""
        self._progress = self._progress.model_copy(
            update={
                "generations_completed": completed,
                "spent_usd": round(spent, 6),
                "current_model": model_id,
                "current_case": case.case_id,
                "current_repetition": repetition,
            }
        )

    def _build_request(
        self, case: BenchmarkCase, model_id: str
    ) -> GenerateUnityDialogueRequest:
        """Construit la requête d'un cas pour un modèle donné.

        La graine de contexte est dérivée du cas : tous les modèles et toutes les
        répétitions d'un même cas reçoivent alors strictement le même prompt, ce
        qui est la condition d'une comparaison honnête.

        Les paramètres d'échantillonnage que le modèle n'accepte pas sont retirés :
        un cas capturé avec ``top_p`` ferait répondre 400 aux tiers GPT-5.6, et le
        rapport conclurait que ces modèles sont inutilisables pour un défaut qui
        appartient au cas.

        Args:
            case: Cas rejoué.
            model_id: Modèle candidat.

        Returns:
            La requête à passer à l'orchestrateur.
        """
        seed = case.request.context_seed
        if seed is None:
            # `hash()` sur str est randomisé par processus : une graine dérivée
            # ainsi changerait à chaque redémarrage et casserait la reprise.
            digest = hashlib.sha256(case.case_id.encode("utf-8")).hexdigest()[:8]
            seed = int(digest, 16)
        update: dict[str, Any] = {
            "llm_model_identifier": model_id,
            "context_seed": seed,
        }
        if ModelNames.normalize_model_id(model_id) in ModelNames.MODELS_WITHOUT_CUSTOM_TEMPERATURE:
            update["top_p"] = None
        return case.request.model_copy(update=update)

    async def _generate_one(
        self,
        *,
        run: BenchmarkRun,
        case: BenchmarkCase,
        model_id: str,
        repetition: int,
    ) -> BenchmarkGenerationRecord:
        """Produit une génération et lui applique les portes structurelles.

        Args:
            run: Run courant.
            case: Cas rejoué.
            model_id: Modèle candidat.
            repetition: Index de répétition.

        Returns:
            Le record persistable. Une erreur de l'orchestrateur donne
            ``config_error`` — jamais un score nul, qui classerait à tort le modèle
            dernier pour un problème de protocole.
        """
        request = self._build_request(case, model_id)
        request_id = f"benchmark-{run.run_id}-{_slug(model_id)}-{_slug(case.case_id)}-{repetition}"
        started = time.monotonic()

        json_content: Optional[str] = None
        title: Optional[str] = None
        raw_prompt: Optional[str] = None
        prompt_hash: Optional[str] = None
        cost = 0.0
        prompt_tokens = 0
        completion_tokens = 0
        error_message: Optional[str] = None

        try:
            orchestrator = self._orchestrator_factory(request_id)
            orchestrator.config_service = _NoFallbackConfigService(orchestrator.config_service)
            async for event in orchestrator.generate_with_events(request, lambda: False):
                if event.type == "metadata":
                    cost = float(event.data.get("cost_usd", 0.0) or 0.0)
                    prompt_tokens = int(event.data.get("usage_prompt_tokens", 0) or 0)
                    completion_tokens = int(event.data.get("usage_completion_tokens", 0) or 0)
                elif event.type == "complete":
                    result = event.data.get("result") or {}
                    json_content = result.get("json_content")
                    title = result.get("title")
                    raw_prompt = result.get("raw_prompt")
                    prompt_hash = result.get("prompt_hash")
                elif event.type == "error":
                    error_message = str(event.data.get("message", "Erreur de génération"))
        except Exception as exc:
            error_message = f"{type(exc).__name__}: {exc}"
            logger.warning(
                "Génération de benchmark en échec (%s / %s) : %s", model_id, case.case_id, exc
            )

        duration_ms = int((time.monotonic() - started) * 1000)

        if error_message is not None or json_content is None:
            return BenchmarkGenerationRecord(
                run_id=run.run_id,
                case_id=case.case_id,
                model_id=model_id,
                repetition=repetition,
                status="config_error",
                raw_prompt=raw_prompt,
                prompt_hash=prompt_hash,
                cost_usd=cost,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                duration_ms=duration_ms,
                error_message=error_message or "Aucun contenu généré",
                created_at=_now_iso(),
            )

        try:
            failures = self._gate_service.evaluate(json_content, expectations=case.expectations)
        except Exception as exc:
            # Une sortie pathologique (récursion profonde, encodage exotique) ne doit
            # pas faire tomber le run entier et abandonner les générations restantes.
            logger.warning(
                "Portes structurelles en échec technique (%s / %s) : %s",
                model_id,
                case.case_id,
                exc,
            )
            failures = [
                BenchmarkGateFailure(
                    gate="parsable",
                    message=f"Évaluation des portes impossible : {type(exc).__name__}: {exc}",
                )
            ]
        return BenchmarkGenerationRecord(
            run_id=run.run_id,
            case_id=case.case_id,
            model_id=model_id,
            repetition=repetition,
            status="valid" if not failures else "invalid",
            gate_failures=failures,
            json_content=json_content,
            title=title,
            raw_prompt=raw_prompt,
            prompt_hash=prompt_hash,
            cost_usd=cost,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens,
            duration_ms=duration_ms,
            language_detector=self._gate_service.detect_language_of(json_content),
            created_at=_now_iso(),
        )
