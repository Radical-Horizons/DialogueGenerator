"""Passe de jugement d'un run de benchmark.

Rejoue les générations **déjà produites** — la passe n'appelle jamais
l'orchestrateur de génération. Rejuger avec un autre juge ne coûte donc que le
prix du juge, et les textes candidats restent strictement identiques d'un juge à
l'autre : c'est ce qui rend deux jugements comparables entre eux.

Même patron coopératif que le moteur de run (`CooperativePassControl`) :
progression consultable, pause et annulation, sauvegarde après chaque verdict,
reprise sans rejouer l'existant, plafond budgétaire dur.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, List, Optional

from pydantic import ValidationError

from api.middleware.billable_user_context import (
    push_billable_user_id,
    reset_billable_user_id,
)
from api.schemas.benchmark import BenchmarkGenerationRecord
from api.schemas.benchmark_judging import (
    CriteriaGrid,
    JudgePassConfig,
    JudgePassProgress,
    JudgePassState,
    PairwisePassConfig,
    PairwisePassProgress,
    PairwisePassState,
    PairwiseVerdict,
    RubricVerdict,
)
from services.benchmark_criteria_store import BenchmarkCriteriaStore
from services.benchmark_judge_service import BenchmarkJudgeService
from services.benchmark_pair_builder import (
    PairAssignment,
    build_pairs,
    count_unpairable_cases,
)
from services.benchmark_pass_control import CooperativePassControl, PassCancelled
from services.benchmark_run_service import (
    BENCHMARK_BILLABLE_USER_ID,
    BenchmarkRunService,
    slug_for_filename,
)
from services.gdd_notion_atomic_io import read_json_file, write_json_atomic

logger = logging.getLogger(__name__)

DEFAULT_JUDGE_PROMPT_TOKENS_ESTIMATE = 2000
"""Estimation d'entrée d'un appel de juge (grille + fragment de dialogue)."""

DEFAULT_JUDGE_COMPLETION_TOKENS_ESTIMATE = 800
"""Estimation de sortie d'un appel de juge (une note et un commentaire par critère)."""

_PASS_STATE_NAME = "_pass.json"
"""État de passe, logé parmi les verdicts mais exclu de leur relevé."""


class JudgePassConflictError(RuntimeError):
    """Une passe est déjà en cours, ou la demande n'est pas exécutable."""


class JudgePassNotFoundError(LookupError):
    """La passe demandée n'existe pas."""


class _BudgetExhausted(Exception):
    """Signal interne : plafond atteint, arrêt propre de la passe."""


def _now_iso() -> str:
    """Horodatage ISO-8601 en UTC."""
    return datetime.now(timezone.utc).isoformat()


class BenchmarkJudgePassService:
    """Orchestre la notation absolue des générations d'un run."""

    def __init__(
        self,
        *,
        run_service: BenchmarkRunService,
        criteria_store: BenchmarkCriteriaStore,
        judge_service: BenchmarkJudgeService,
        pricing_service: Any,
        config_service: Any,
        llm_client_factory: Callable[[str], Any],
    ) -> None:
        """Initialise la passe.

        Args:
            run_service: Moteur de run — source des générations et des chemins.
            criteria_store: Magasin des grilles.
            judge_service: Producteur d'un verdict.
            pricing_service: `LLMPricingService`, pour l'estimation et le plafond.
            config_service: `ConfigurationService`.
            llm_client_factory: Fabrique de client LLM pour le juge, par identifiant.
        """
        self._run_service = run_service
        self._criteria_store = criteria_store
        self._judge_service = judge_service
        self._pricing_service = pricing_service
        self._config_service = config_service
        self._llm_client_factory = llm_client_factory

        self._control = CooperativePassControl()
        self._progress = JudgePassProgress()

    # ------------------------------------------------------------------
    # Lecture
    # ------------------------------------------------------------------

    @property
    def run_service(self) -> BenchmarkRunService:
        """Moteur de run associé — permet au routeur de valider l'existence d'un run."""
        return self._run_service

    def read_progress(self) -> JudgePassProgress:
        """Retourne une copie de la progression en mémoire."""
        return self._progress.model_copy(deep=True)

    @property
    def background_task(self) -> Optional[asyncio.Task]:
        """Tâche de fond de la passe en cours — introspection et tests."""
        return self._control.task

    def _verdicts_dir(self, run_id: str, judge_model: str) -> Path:
        """Répertoire des verdicts d'un juge pour un run.

        Le juge fait partie du chemin : deux juges cohabitent sans collision, et
        refuser d'agréger des juges différents devient trivial.

        Args:
            run_id: Run jugé.
            judge_model: Modèle juge.

        Returns:
            Chemin du répertoire des verdicts.
        """
        digest = hashlib.sha256(judge_model.encode("utf-8")).hexdigest()[:8]
        directory = f"{slug_for_filename(judge_model)}__{digest}"
        return self._run_service.run_dir(run_id) / "verdicts" / "rubric" / directory

    def _verdict_path(self, verdict_dir: Path, record: BenchmarkGenerationRecord) -> Path:
        """Chemin du verdict d'une génération.

        Le suffixe d'empreinte distingue deux couples qui s'assainissent en un même
        nom de fichier (``a/b`` et ``a-b``) : sans lui, un verdict en écraserait un
        autre et la reprise sauterait une génération jamais notée.
        """
        digest = hashlib.sha256(
            f"{record.model_id}|{record.case_id}".encode("utf-8")
        ).hexdigest()[:8]
        name = (
            f"{slug_for_filename(record.model_id)}__{slug_for_filename(record.case_id)}"
            f"__{digest}__{record.repetition}.json"
        )
        return verdict_dir / name

    def _verdict_is_usable(self, path: Path) -> bool:
        """Indique si un verdict déjà présent peut être considéré comme produit.

        Se fier à la seule lisibilité du JSON ferait passer un verdict d'un schéma
        antérieur pour une notation faite : la cellule ne serait jamais rejouée et
        manquerait définitivement, alors que la passe se déclarerait terminée.

        Args:
            path: Chemin du verdict.

        Returns:
            ``True`` si le fichier existe et se valide.
        """
        if not path.exists():
            return False
        raw = read_json_file(path, None)
        if raw is None:
            return False
        try:
            RubricVerdict.model_validate(raw)
        except ValidationError as exc:
            logger.warning("Verdict de benchmark invalide, rejugement (%s) : %s", path.name, exc)
            return False
        return True

    def _pass_state_path(self, run_id: str, judge_model: str) -> Path:
        """Chemin de l'état persisté d'une passe."""
        return self._verdicts_dir(run_id, judge_model) / _PASS_STATE_NAME

    def get_pass_state(self, run_id: str, judge_model: str) -> JudgePassState:
        """Charge l'état persisté d'une passe.

        Args:
            run_id: Run jugé.
            judge_model: Modèle juge.

        Returns:
            L'état de la passe.

        Raises:
            JudgePassNotFoundError: Si aucune passe n'a été lancée pour ce juge.
        """
        raw = read_json_file(self._pass_state_path(run_id, judge_model), None)
        if raw is None:
            raise JudgePassNotFoundError(
                f"Aucune passe de jugement pour le run '{run_id}' et le juge '{judge_model}'"
            )
        try:
            return JudgePassState.model_validate(raw)
        except ValidationError as exc:
            raise JudgePassNotFoundError(f"État de passe illisible : {exc}") from exc

    def list_verdicts(self, run_id: str) -> List[RubricVerdict]:
        """Liste tous les verdicts rubrique d'un run, tous juges confondus.

        Args:
            run_id: Run jugé.

        Returns:
            Verdicts triés par juge, cas, modèle, répétition. Le champ `judge_model`
            de chacun permet à l'appelant de refuser une agrégation mixte.
        """
        root = self._run_service.run_dir(run_id) / "verdicts" / "rubric"
        if not root.exists():
            return []
        verdicts: List[RubricVerdict] = []
        for path in sorted(root.glob("*/*.json")):
            if path.name == _PASS_STATE_NAME:
                continue
            raw = read_json_file(path, None)
            if raw is None:
                continue
            try:
                verdicts.append(RubricVerdict.model_validate(raw))
            except ValidationError as exc:
                logger.warning("Verdict de benchmark invalide ignoré (%s) : %s", path.name, exc)
        verdicts.sort(
            key=lambda v: (v.judge_model, v.case_id, v.model_id, v.repetition)
        )
        return verdicts

    # ------------------------------------------------------------------
    # Lancement
    # ------------------------------------------------------------------

    def _scorable_records(self, run_id: str) -> List[BenchmarkGenerationRecord]:
        """Générations notables d'un run.

        Seules les générations `valid` sont notées : une génération écartée par les
        portes structurelles n'est pas une génération médiocre, et lui donner une
        note l'introduirait dans les moyennes par la petite porte.

        Args:
            run_id: Run jugé.

        Returns:
            Générations `valid`, triées.
        """
        return [
            record
            for record in self._run_service.list_generations(run_id)
            if record.status == "valid"
        ]

    def _discard_judge_error_verdicts(self, run_id: str, judge_model: str) -> None:
        """Supprime les verdicts en erreur d'un juge avant un relancement.

        Args:
            run_id: Run concerné.
            judge_model: Juge concerné.
        """
        directory = self._verdicts_dir(run_id, judge_model)
        if not directory.exists():
            return
        for path in directory.glob("*.json"):
            if path.name == _PASS_STATE_NAME:
                continue
            raw = read_json_file(path, None)
            if isinstance(raw, dict) and raw.get("status") == "judge_error":
                try:
                    path.unlink()
                except OSError as exc:
                    logger.warning("Verdict judge_error non supprimé (%s) : %s", path.name, exc)

    def _spent_for(self, run_id: str, judge_model: str) -> float:
        """Dépense déjà engagée par ce juge sur ce run.

        Recalculée depuis les verdicts et non lue dans l'état persisté : une passe
        tuée brutalement n'a pas eu le temps d'écrire son cumul, et le plafond
        repartirait de zéro à chaque redémarrage.

        Args:
            run_id: Run concerné.
            judge_model: Juge concerné.

        Returns:
            Coût cumulé, en USD.
        """
        return round(
            sum(
                verdict.cost_usd
                for verdict in self.list_verdicts(run_id)
                if verdict.judge_model == judge_model
            ),
            6,
        )

    def _remaining_records(
        self,
        records: List[BenchmarkGenerationRecord],
        run_id: str,
        judge_model: str,
    ) -> List[BenchmarkGenerationRecord]:
        """Générations restant à noter pour ce juge.

        Args:
            records: Générations notables du run.
            run_id: Run concerné.
            judge_model: Juge concerné.

        Returns:
            Sous-ensemble sans verdict exploitable déjà présent.
        """
        directory = self._verdicts_dir(run_id, judge_model)
        return [
            record
            for record in records
            if not self._verdict_is_usable(self._verdict_path(directory, record))
        ]

    def _assert_judge_is_usable(self, judge_model: str) -> None:
        """Vérifie que le juge peut réellement juger.

        Le juge subit le même piège que les candidats : sans clé API, la fabrique
        retombe silencieusement sur `DummyLLMClient` et l'on noterait toutes les
        générations avec un juge factice.

        Args:
            judge_model: Modèle juge demandé.

        Raises:
            JudgePassConflictError: Si le juge n'est pas utilisable.
        """
        if judge_model == "dummy":
            # `diagnose_models` exempte volontairement `dummy` (mode sans clé assumé
            # du dépôt) : ici ce serait précisément le juge factice à écarter.
            raise JudgePassConflictError(
                "Juge 'dummy' interdit : il produirait des notes factices présentées comme réelles"
            )
        diagnostics = self._run_service.diagnose_models([judge_model])
        if not diagnostics or not diagnostics[0].usable:
            reason = diagnostics[0].reason if diagnostics else "diagnostic indisponible"
            raise JudgePassConflictError(f"Juge '{judge_model}' inutilisable : {reason}")

    def estimate_max_cost(self, judge_model: str, verdict_count: int) -> float:
        """Estime le coût maximal d'une passe.

        Args:
            judge_model: Modèle juge.
            verdict_count: Nombre de verdicts à produire.

        Returns:
            Coût maximal estimé, en USD.

        Raises:
            JudgePassConflictError: Si le tarif du juge est inconnu — le plafond ne
                pourrait alors jamais se déclencher et la dépense serait non bornée.
        """
        pricing = None
        try:
            pricing = self._pricing_service.get_model_pricing(judge_model)
        except Exception as exc:
            logger.warning("Tarif indisponible pour le juge '%s' : %s", judge_model, exc)
        if not pricing:
            raise JudgePassConflictError(
                f"Tarif inconnu pour le juge '{judge_model}' : le plafond budgétaire ne "
                "pourrait pas se déclencher. Renseigner config/llm_pricing.json avant de lancer."
            )
        try:
            unit = self._pricing_service.calculate_cost(
                judge_model,
                DEFAULT_JUDGE_PROMPT_TOKENS_ESTIMATE,
                DEFAULT_JUDGE_COMPLETION_TOKENS_ESTIMATE,
            )
        except Exception as exc:
            raise JudgePassConflictError(
                f"Tarif inconnu pour le juge '{judge_model}' ({exc}) : le plafond "
                "budgétaire ne pourrait pas se déclencher."
            ) from exc
        return round(unit * verdict_count, 6)

    async def start_pass(self, run_id: str, config: JudgePassConfig) -> JudgePassState:
        """Lance une passe de jugement en tâche de fond.

        Args:
            run_id: Run à juger.
            config: Paramètres de la passe.

        Returns:
            L'état initial de la passe.

        Raises:
            JudgePassConflictError: Passe déjà en cours, juge inutilisable, tarif
                inconnu, plafond sous l'estimation, ou run sans génération notable.
            BenchmarkRunNotFoundError: Si le run n'existe pas.
            CriteriaGridNotFoundError: Si la grille n'existe pas.
        """
        if self._control.active_id is not None:
            raise JudgePassConflictError(
                f"Une passe de jugement est déjà en cours ({self._control.active_id})"
            )

        run = self._run_service.get_run(run_id)
        if run.status == "running":
            # Juger un run encore en génération figerait `verdicts_total` sur un
            # instantané partiel, et les générations tardives ne seraient jamais notées.
            raise JudgePassConflictError(
                f"Le run '{run_id}' génère encore : attendre sa fin avant de le juger"
            )
        grid = self._criteria_store.get_grid(config.grid_id, version=config.grid_version)
        records = self._scorable_records(run_id)
        if not records:
            raise JudgePassConflictError(
                f"Le run '{run_id}' ne contient aucune génération valide à noter"
            )

        self._assert_judge_is_usable(config.judge_model)
        # La dépense est relevée AVANT la purge : les verdicts en erreur ont coûté,
        # et les supprimer d'abord ferait repartir chaque relance d'une ardoise
        # vierge — le plafond deviendrait rejouable à volonté.
        already_spent = self._spent_for(run_id, config.judge_model)
        # Un `judge_error` traduit un problème d'environnement (juge injoignable,
        # dérive de format), pas une propriété de la génération : le conserver
        # ferait sauter la cellule au relancement, alors que la cause a été corrigée.
        self._discard_judge_error_verdicts(run_id, config.judge_model)

        remaining = self._remaining_records(records, run_id, config.judge_model)
        # `budget_cap_usd` plafonne la dépense **totale** du jugement de ce run par
        # ce juge, reprises comprises : le compteur d'exécution repart du déjà-dépensé,
        # sinon chaque relance réautoriserait un plafond entier. La garde de lancement
        # doit donc comparer au même total, faute de quoi elle laisserait partir une
        # passe que la boucle arrêterait aussitôt.
        estimated_max = self.estimate_max_cost(config.judge_model, len(remaining))
        if already_spent + estimated_max > config.budget_cap_usd:
            raise JudgePassConflictError(
                f"Plafond ({config.budget_cap_usd:.4f} USD) insuffisant : "
                f"{already_spent:.4f} USD déjà dépensés et {estimated_max:.4f} USD estimés "
                f"pour les {len(remaining)} verdicts restants."
            )

        state = JudgePassState(
            run_id=run_id,
            judge_model=config.judge_model,
            grid_id=grid.grid_id,
            grid_version=grid.version,
            status="running",
            verdicts_total=len(records),
            budget_cap_usd=config.budget_cap_usd,
            message="Passe de jugement démarrée",
            created_at=_now_iso(),
        )
        self._persist_state(state)

        self._control.claim(f"{run_id}:{config.judge_model}")
        self._control.task = asyncio.create_task(
            self._execute(state, grid, records, config.budget_cap_usd, already_spent)
        )
        return state

    # ------------------------------------------------------------------
    # Contrôle
    # ------------------------------------------------------------------

    def request_pause(self, run_id: Optional[str] = None) -> bool:
        """Demande une pause coopérative de la passe en cours."""
        if not self._is_active_for(run_id):
            return False
        self._control.pause()
        self._progress = self._progress.model_copy(
            update={"paused": True, "status": "paused", "message": "Pause demandée"}
        )
        return True

    def request_unpause(self, run_id: Optional[str] = None) -> bool:
        """Relance une passe suspendue."""
        if not self._is_active_for(run_id):
            return False
        self._control.unpause()
        self._progress = self._progress.model_copy(
            update={"paused": False, "status": "running", "message": "Reprise"}
        )
        return True

    def request_cancel(self, run_id: Optional[str] = None) -> bool:
        """Annule la passe en cours ; les verdicts déjà produits sont conservés."""
        if not self._is_active_for(run_id):
            return False
        self._control.cancel()
        self._progress = self._progress.model_copy(update={"message": "Annulation demandée"})
        return True

    def _is_active_for(self, run_id: Optional[str]) -> bool:
        """Indique si une commande visant ``run_id`` peut s'appliquer.

        L'identifiant de passe est ``<run_id>:<juge>`` : une commande portant le
        seul ``run_id`` s'applique à la passe active de ce run, et à aucune autre.
        """
        active = self._control.active_id
        if active is None:
            return False
        return run_id is None or active.split(":", 1)[0] == run_id

    # ------------------------------------------------------------------
    # Exécution
    # ------------------------------------------------------------------

    def _persist_state(self, state: JudgePassState) -> None:
        """Écrit l'état de la passe de façon atomique."""
        stamped = state.model_copy(update={"updated_at": _now_iso()})
        write_json_atomic(
            self._pass_state_path(state.run_id, state.judge_model),
            stamped.model_dump(mode="json"),
        )

    async def _execute(
        self,
        state: JudgePassState,
        grid: CriteriaGrid,
        records: List[BenchmarkGenerationRecord],
        budget_cap_usd: float,
        already_spent: float,
    ) -> None:
        """Boucle principale de la passe.

        Args:
            state: État initial.
            grid: Grille employée.
            records: Générations notables.
            budget_cap_usd: Plafond dur.
        """
        async with self._control.lock:
            billable_token = push_billable_user_id(BENCHMARK_BILLABLE_USER_ID)
            verdict_dir = self._verdicts_dir(state.run_id, state.judge_model)
            # Reprend le cumul relevé avant la purge des verdicts en erreur :
            # le recalculer ici oublierait ce que ces appels ont coûté.
            spent = already_spent
            completed = 0
            status: str = "failed"
            message = "Passe interrompue avant la fin (arrêt du processus ?)"

            self._progress = JudgePassProgress(
                active=True,
                run_id=state.run_id,
                judge_model=state.judge_model,
                status="running",
                verdicts_total=state.verdicts_total,
                spent_usd=spent,
                budget_cap_usd=budget_cap_usd,
                message="Passe de jugement démarrée",
            )

            try:
                llm_client = self._llm_client_factory(state.judge_model)
                for record in records:
                    await self._control.checkpoint()

                    path = self._verdict_path(verdict_dir, record)
                    if self._verdict_is_usable(path):
                        completed += 1
                        continue

                    if spent >= budget_cap_usd:
                        status = "interrupted_budget"
                        message = (
                            f"Plafond budgétaire atteint ({spent:.4f} USD "
                            f"≥ {budget_cap_usd:.4f} USD) — verdicts déjà produits conservés"
                        )
                        raise _BudgetExhausted()

                    verdict = await self._judge_service.judge_rubric(
                        record=record,
                        grid=grid,
                        llm_client=llm_client,
                        judge_model=state.judge_model,
                    )
                    try:
                        write_json_atomic(path, verdict.model_dump(mode="json"))
                    except OSError as exc:
                        # Une cellule non écrivable ne doit pas abandonner les suivantes.
                        logger.warning("Verdict non persisté (%s) : %s", path.name, exc)
                    spent += verdict.cost_usd
                    completed += 1
                    self._progress = self._progress.model_copy(
                        update={
                            "verdicts_completed": completed,
                            "spent_usd": round(spent, 6),
                            "current_model": record.model_id,
                            "current_case": record.case_id,
                        }
                    )

                status = "completed"
                message = "Passe de jugement terminée"

            except _BudgetExhausted:
                logger.info("Passe de jugement %s interrompue par le plafond", state.run_id)
            except PassCancelled:
                status = "cancelled"
                message = "Passe annulée — verdicts déjà produits conservés"
                logger.info("Passe de jugement %s annulée à la demande", state.run_id)
            except asyncio.CancelledError:
                status = "cancelled"
                message = "Passe interrompue par l'arrêt du processus"
                logger.warning("Passe de jugement %s annulée par l'ordonnanceur", state.run_id)
                raise
            except Exception as exc:
                status = "failed"
                message = f"Passe interrompue par une erreur : {exc}"
                logger.exception("Passe de jugement %s en échec", state.run_id)
            finally:
                self._control.release()
                # Marquée inactive immédiatement : si la finalisation échoue
                # (disque plein, verdict illisible), la progression annoncerait
                # sinon une passe en cours qu'aucune commande ne peut atteindre.
                self._progress = self._progress.model_copy(update={"active": False})
                reset_billable_user_id(billable_token)
                try:
                    produced = [
                        verdict
                        for verdict in self.list_verdicts(state.run_id)
                        if verdict.judge_model == state.judge_model
                    ]
                    scored = [v for v in produced if v.status == "scored"]
                    if status == "completed" and produced and not scored:
                        # Une passe intégralement en erreur a coûté le prix plein et
                        # n'a produit aucune mesure : la déclarer terminée laisserait
                        # croire à un résultat exploitable.
                        status = "failed"
                        message = (
                            f"Aucun verdict exploitable : {len(produced)} réponses du juge "
                            "non conformes à la grille"
                        )
                    final = state.model_copy(
                        update={
                            "status": status,
                            "message": message,
                            "verdicts_completed": len(produced),
                            "judge_errors": sum(
                                1 for verdict in produced if verdict.status == "judge_error"
                            ),
                            "spent_usd": round(
                                sum(verdict.cost_usd for verdict in produced), 6
                            ),
                        }
                    )
                    self._persist_state(final)
                    self._progress = JudgePassProgress(
                        active=False,
                        run_id=state.run_id,
                        judge_model=state.judge_model,
                        status=final.status,
                        verdicts_total=state.verdicts_total,
                        verdicts_completed=final.verdicts_completed,
                        spent_usd=final.spent_usd,
                        budget_cap_usd=budget_cap_usd,
                        message=message,
                    )
                except Exception:
                    logger.exception(
                        "Finalisation de la passe de jugement %s impossible", state.run_id
                    )


class BenchmarkPairwisePassService:
    """Orchestre la comparaison par paires des générations d'un run.

    Même patron coopératif et mêmes refus de lancement que la passe rubrique ;
    ce qui change est l'unité de travail — un duel, deux appels de juge — et le
    dénombrement, qui croît en carré du nombre de modèles.
    """

    def __init__(
        self,
        *,
        run_service: BenchmarkRunService,
        criteria_store: BenchmarkCriteriaStore,
        judge_service: Any,
        pricing_service: Any,
        llm_client_factory: Callable[[str], Any],
    ) -> None:
        """Initialise la passe.

        Args:
            run_service: Moteur de run — source des générations et des chemins.
            criteria_store: Magasin des grilles.
            judge_service: `BenchmarkPairwiseJudgeService`.
            pricing_service: `LLMPricingService`.
            llm_client_factory: Fabrique de client LLM pour le juge.
        """
        self._run_service = run_service
        self._criteria_store = criteria_store
        self._judge_service = judge_service
        self._pricing_service = pricing_service
        self._llm_client_factory = llm_client_factory

        self._control = CooperativePassControl()
        self._progress = PairwisePassProgress()

    @property
    def run_service(self) -> BenchmarkRunService:
        """Moteur de run associé — permet au routeur de valider l'existence d'un run."""
        return self._run_service

    @property
    def background_task(self) -> Optional[asyncio.Task]:
        """Tâche de fond de la passe en cours — introspection et tests."""
        return self._control.task

    def read_progress(self) -> PairwisePassProgress:
        """Retourne une copie de la progression en mémoire."""
        return self._progress.model_copy(deep=True)

    # ------------------------------------------------------------------
    # Chemins
    # ------------------------------------------------------------------

    def _duels_dir(self, run_id: str, judge_model: str) -> Path:
        """Répertoire des duels d'un juge pour un run."""
        digest = hashlib.sha256(judge_model.encode("utf-8")).hexdigest()[:8]
        directory = f"{slug_for_filename(judge_model)}__{digest}"
        return self._run_service.run_dir(run_id) / "verdicts" / "pairwise" / directory

    def _duel_path(self, duels_dir: Path, pair: PairAssignment) -> Path:
        """Chemin d'un duel.

        Les modèles sont triés dans le nom : une paire a un seul fichier quel que
        soit l'ordre d'énumération ou l'attribution des étiquettes.
        """
        first, second = pair.models_sorted
        digest = hashlib.sha256(
            f"{pair.case_id}|{first}|{second}".encode("utf-8")
        ).hexdigest()[:8]
        name = (
            f"{slug_for_filename(pair.case_id)}__{slug_for_filename(first)}"
            f"_vs_{slug_for_filename(second)}__{digest}__{pair.repetition}.json"
        )
        return duels_dir / name

    def _pass_state_path(self, run_id: str, judge_model: str) -> Path:
        """Chemin de l'état persisté d'une passe de comparaison."""
        return self._duels_dir(run_id, judge_model) / _PASS_STATE_NAME

    # ------------------------------------------------------------------
    # Lecture
    # ------------------------------------------------------------------

    def _duel_is_usable(self, path: Path, grid: Optional[CriteriaGrid] = None) -> bool:
        """Indique si un duel déjà présent peut être considéré comme produit.

        La grille fait partie de l'identité du duel : relancer après avoir édité un
        critère doit rejuger, sinon la passe se déclarerait terminée sur la nouvelle
        version alors que tous les duels sur disque portent l'ancienne.

        Args:
            path: Chemin du duel.
            grid: Grille de la passe courante, si l'appelant veut vérifier la version.

        Returns:
            ``True`` si le fichier existe, se valide, et relève de la même grille.
        """
        if not path.exists():
            return False
        raw = read_json_file(path, None)
        if raw is None:
            return False
        try:
            verdict = PairwiseVerdict.model_validate(raw)
        except ValidationError as exc:
            logger.warning("Duel de benchmark invalide, rejugement (%s) : %s", path.name, exc)
            return False
        if grid is not None and (
            verdict.grid_id != grid.grid_id or verdict.grid_version != grid.version
        ):
            logger.info(
                "Duel produit sur %s v%s, grille courante %s v%s — rejugement (%s)",
                verdict.grid_id,
                verdict.grid_version,
                grid.grid_id,
                grid.version,
                path.name,
            )
            return False
        return True

    def list_verdicts(self, run_id: str) -> List[PairwiseVerdict]:
        """Liste tous les duels d'un run, tous juges confondus.

        Args:
            run_id: Run concerné.

        Returns:
            Duels triés par juge, cas, modèles puis répétition.
        """
        root = self._run_service.run_dir(run_id) / "verdicts" / "pairwise"
        if not root.exists():
            return []
        verdicts: List[PairwiseVerdict] = []
        for path in sorted(root.glob("*/*.json")):
            if path.name == _PASS_STATE_NAME:
                continue
            raw = read_json_file(path, None)
            if raw is None:
                continue
            try:
                verdicts.append(PairwiseVerdict.model_validate(raw))
            except ValidationError as exc:
                logger.warning("Duel de benchmark invalide ignoré (%s) : %s", path.name, exc)
        verdicts.sort(key=lambda v: (v.judge_model, v.case_id, v.model_a, v.model_b, v.repetition))
        return verdicts

    def get_pass_state(self, run_id: str, judge_model: str) -> PairwisePassState:
        """Charge l'état persisté d'une passe de comparaison.

        Raises:
            JudgePassNotFoundError: Si aucune passe n'a été lancée pour ce juge.
        """
        raw = read_json_file(self._pass_state_path(run_id, judge_model), None)
        if raw is None:
            raise JudgePassNotFoundError(
                f"Aucune passe de comparaison pour le run '{run_id}' et le juge '{judge_model}'"
            )
        try:
            return PairwisePassState.model_validate(raw)
        except ValidationError as exc:
            raise JudgePassNotFoundError(f"État de passe illisible : {exc}") from exc

    def _spent_for(self, run_id: str, judge_model: str) -> float:
        """Dépense déjà engagée par ce juge sur ce run, recalculée depuis les duels."""
        return round(
            sum(
                verdict.cost_usd
                for verdict in self.list_verdicts(run_id)
                if verdict.judge_model == judge_model
            ),
            6,
        )

    def estimate_max_cost(self, judge_model: str, duel_count: int) -> float:
        """Estime le coût maximal d'une passe de comparaison.

        Chaque duel coûte **deux** appels — c'est le prix du contrôle du biais de
        position, et l'estimation doit le refléter.

        Raises:
            JudgePassConflictError: Si le tarif du juge est inconnu.
        """
        pricing = None
        try:
            pricing = self._pricing_service.get_model_pricing(judge_model)
        except Exception as exc:
            logger.warning("Tarif indisponible pour le juge '%s' : %s", judge_model, exc)
        if not pricing:
            raise JudgePassConflictError(
                f"Tarif inconnu pour le juge '{judge_model}' : le plafond budgétaire ne "
                "pourrait pas se déclencher. Renseigner config/llm_pricing.json avant de lancer."
            )
        try:
            unit = self._pricing_service.calculate_cost(
                judge_model,
                DEFAULT_JUDGE_PROMPT_TOKENS_ESTIMATE * 2,
                DEFAULT_JUDGE_COMPLETION_TOKENS_ESTIMATE,
            )
        except Exception as exc:
            raise JudgePassConflictError(
                f"Tarif inconnu pour le juge '{judge_model}' ({exc}) : le plafond "
                "budgétaire ne pourrait pas se déclencher."
            ) from exc
        return round(unit * duel_count * 2, 6)

    # ------------------------------------------------------------------
    # Lancement
    # ------------------------------------------------------------------

    def _discard_judge_error_duels(self, run_id: str, judge_model: str) -> None:
        """Supprime les duels en erreur avant un relancement.

        Args:
            run_id: Run concerné.
            judge_model: Juge concerné.
        """
        directory = self._duels_dir(run_id, judge_model)
        if not directory.exists():
            return
        for path in directory.glob("*.json"):
            if path.name == _PASS_STATE_NAME:
                continue
            raw = read_json_file(path, None)
            if isinstance(raw, dict) and raw.get("status") == "judge_error":
                try:
                    path.unlink()
                except OSError as exc:
                    logger.warning("Duel judge_error non supprimé (%s) : %s", path.name, exc)

    async def start_pass(
        self, run_id: str, config: PairwisePassConfig
    ) -> PairwisePassState:
        """Lance une passe de comparaison en tâche de fond.

        Args:
            run_id: Run à comparer.
            config: Paramètres de la passe.

        Returns:
            L'état initial de la passe.

        Raises:
            JudgePassConflictError: Passe déjà en cours, run encore en génération,
                juge inutilisable, tarif inconnu, plafond insuffisant, ou moins de
                deux modèles appariables.
            BenchmarkRunNotFoundError: Si le run n'existe pas.
            CriteriaGridNotFoundError: Si la grille n'existe pas.
        """
        if self._control.active_id is not None:
            raise JudgePassConflictError(
                f"Une passe de comparaison est déjà en cours ({self._control.active_id})"
            )

        run = self._run_service.get_run(run_id)
        if run.status == "running":
            raise JudgePassConflictError(
                f"Le run '{run_id}' génère encore : attendre sa fin avant de le comparer"
            )
        grid = self._criteria_store.get_grid(config.grid_id, version=config.grid_version)

        records = self._run_service.list_generations(run_id)
        pairs = build_pairs(records, run_id=run_id)
        unpairable = count_unpairable_cases(records)
        if not pairs:
            raise JudgePassConflictError(
                f"Le run '{run_id}' n'offre aucune paire comparable : il faut au moins "
                "deux modèles ayant produit une génération valide sur un même cas."
            )

        if config.judge_model == "dummy":
            raise JudgePassConflictError(
                "Juge 'dummy' interdit : il produirait des duels factices présentés comme réels"
            )
        diagnostics = self._run_service.diagnose_models([config.judge_model])
        if not diagnostics or not diagnostics[0].usable:
            reason = diagnostics[0].reason if diagnostics else "diagnostic indisponible"
            raise JudgePassConflictError(
                f"Juge '{config.judge_model}' inutilisable : {reason}"
            )

        # Relevée AVANT la purge : les duels en erreur ont coûté deux appels chacun,
        # et les supprimer d'abord ferait repartir chaque relance d'une ardoise vierge.
        already_spent = self._spent_for(run_id, config.judge_model)
        self._discard_judge_error_duels(run_id, config.judge_model)
        duels_dir = self._duels_dir(run_id, config.judge_model)
        remaining = [
            pair
            for pair in pairs
            if not self._duel_is_usable(self._duel_path(duels_dir, pair), grid)
        ]

        estimated_max = self.estimate_max_cost(config.judge_model, len(remaining))
        if already_spent + estimated_max > config.budget_cap_usd:
            raise JudgePassConflictError(
                f"Plafond ({config.budget_cap_usd:.4f} USD) insuffisant : "
                f"{already_spent:.4f} USD déjà dépensés et {estimated_max:.4f} USD estimés "
                f"pour les {len(remaining)} duels restants (deux appels de juge chacun)."
            )

        state = PairwisePassState(
            run_id=run_id,
            judge_model=config.judge_model,
            grid_id=grid.grid_id,
            grid_version=grid.version,
            status="running",
            duels_total=len(pairs),
            unpairable_slots=unpairable,
            # Autorisé par la spécification, mais signalé : le biais d'auto-préférence
            # est cohérent dans les deux sens, donc invisible au contrôle de position.
            judge_is_candidate=config.judge_model in set(run.config.models),
            estimated_max_usd=estimated_max,
            budget_cap_usd=config.budget_cap_usd,
            message="Passe de comparaison démarrée",
            created_at=_now_iso(),
        )
        self._persist_state(state)

        self._control.claim(f"{run_id}:{config.judge_model}")
        self._control.task = asyncio.create_task(
            self._execute(state, grid, pairs, config.budget_cap_usd, already_spent)
        )
        return state

    # ------------------------------------------------------------------
    # Contrôle
    # ------------------------------------------------------------------

    def _is_active_for(self, run_id: Optional[str]) -> bool:
        """Indique si une commande visant ``run_id`` peut s'appliquer."""
        active = self._control.active_id
        if active is None:
            return False
        return run_id is None or active.split(":", 1)[0] == run_id

    def request_pause(self, run_id: Optional[str] = None) -> bool:
        """Demande une pause coopérative de la passe en cours."""
        if not self._is_active_for(run_id):
            return False
        self._control.pause()
        self._progress = self._progress.model_copy(
            update={"paused": True, "status": "paused", "message": "Pause demandée"}
        )
        return True

    def request_unpause(self, run_id: Optional[str] = None) -> bool:
        """Relance une passe suspendue."""
        if not self._is_active_for(run_id):
            return False
        self._control.unpause()
        self._progress = self._progress.model_copy(
            update={"paused": False, "status": "running", "message": "Reprise"}
        )
        return True

    def request_cancel(self, run_id: Optional[str] = None) -> bool:
        """Annule la passe en cours ; les duels déjà produits sont conservés."""
        if not self._is_active_for(run_id):
            return False
        self._control.cancel()
        self._progress = self._progress.model_copy(update={"message": "Annulation demandée"})
        return True

    # ------------------------------------------------------------------
    # Exécution
    # ------------------------------------------------------------------

    def _persist_state(self, state: PairwisePassState) -> None:
        """Écrit l'état de la passe de façon atomique."""
        stamped = state.model_copy(update={"updated_at": _now_iso()})
        write_json_atomic(
            self._pass_state_path(state.run_id, state.judge_model),
            stamped.model_dump(mode="json"),
        )

    async def _execute(
        self,
        state: PairwisePassState,
        grid: CriteriaGrid,
        pairs: List[PairAssignment],
        budget_cap_usd: float,
        already_spent: float,
    ) -> None:
        """Boucle principale de la passe de comparaison.

        Args:
            state: État initial.
            grid: Grille employée.
            pairs: Paires à juger.
            budget_cap_usd: Plafond dur.
        """
        async with self._control.lock:
            billable_token = push_billable_user_id(BENCHMARK_BILLABLE_USER_ID)
            duels_dir = self._duels_dir(state.run_id, state.judge_model)
            # Cumul relevé avant la purge des duels en erreur.
            spent = already_spent
            completed = 0
            status: str = "failed"
            message = "Passe interrompue avant la fin (arrêt du processus ?)"

            self._progress = PairwisePassProgress(
                active=True,
                run_id=state.run_id,
                judge_model=state.judge_model,
                status="running",
                duels_total=state.duels_total,
                spent_usd=spent,
                budget_cap_usd=budget_cap_usd,
                message="Passe de comparaison démarrée",
            )

            try:
                llm_client = self._llm_client_factory(state.judge_model)
                for pair in pairs:
                    await self._control.checkpoint()

                    path = self._duel_path(duels_dir, pair)
                    if self._duel_is_usable(path, grid):
                        completed += 1
                        continue

                    if spent >= budget_cap_usd:
                        status = "interrupted_budget"
                        message = (
                            f"Plafond budgétaire atteint ({spent:.4f} USD "
                            f"≥ {budget_cap_usd:.4f} USD) — duels déjà produits conservés"
                        )
                        raise _BudgetExhausted()

                    verdict = await self._judge_service.judge_pair(
                        run_id=state.run_id,
                        pair=pair,
                        grid=grid,
                        llm_client=llm_client,
                        judge_model=state.judge_model,
                    )
                    try:
                        write_json_atomic(path, verdict.model_dump(mode="json"))
                    except OSError as exc:
                        logger.warning("Duel non persisté (%s) : %s", path.name, exc)
                    spent += verdict.cost_usd
                    completed += 1
                    self._progress = self._progress.model_copy(
                        update={
                            "duels_completed": completed,
                            "spent_usd": round(spent, 6),
                            "current_case": pair.case_id,
                        }
                    )

                status = "completed"
                message = "Passe de comparaison terminée"

            except _BudgetExhausted:
                logger.info("Passe de comparaison %s interrompue par le plafond", state.run_id)
            except PassCancelled:
                status = "cancelled"
                message = "Passe annulée — duels déjà produits conservés"
                logger.info("Passe de comparaison %s annulée à la demande", state.run_id)
            except asyncio.CancelledError:
                status = "cancelled"
                message = "Passe interrompue par l'arrêt du processus"
                logger.warning("Passe de comparaison %s annulée par l'ordonnanceur", state.run_id)
                raise
            except Exception as exc:
                status = "failed"
                message = f"Passe interrompue par une erreur : {exc}"
                logger.exception("Passe de comparaison %s en échec", state.run_id)
            finally:
                self._control.release()
                self._progress = self._progress.model_copy(update={"active": False})
                reset_billable_user_id(billable_token)
                try:
                    produced = [
                        verdict
                        for verdict in self.list_verdicts(state.run_id)
                        if verdict.judge_model == state.judge_model
                    ]
                    decided = [v for v in produced if v.status == "decided"]
                    if status == "completed" and produced and not decided:
                        status = "failed"
                        message = (
                            f"Aucun duel exploitable : {len(produced)} réponses du juge "
                            "non conformes à la grille"
                        )
                    final = state.model_copy(
                        update={
                            "status": status,
                            "message": message,
                            "duels_completed": len(produced),
                            "judge_errors": sum(
                                1 for v in produced if v.status == "judge_error"
                            ),
                            "spent_usd": round(sum(v.cost_usd for v in produced), 6),
                        }
                    )
                    self._persist_state(final)
                    self._progress = PairwisePassProgress(
                        active=False,
                        run_id=state.run_id,
                        judge_model=state.judge_model,
                        status=final.status,
                        duels_total=state.duels_total,
                        duels_completed=final.duels_completed,
                        spent_usd=final.spent_usd,
                        budget_cap_usd=budget_cap_usd,
                        message=message,
                    )
                except Exception:
                    logger.exception(
                        "Finalisation de la passe de comparaison %s impossible", state.run_id
                    )
