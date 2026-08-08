"""Endpoints REST du mode Benchmark (suites, runs, progression).

Surface unique : la CLI et l'UI à venir passent par ces mêmes endpoints, aucune
n'a de chemin privilégié. La lecture des suites est ouverte aux utilisateurs
authentifiés ; tout ce qui déclenche des appels LLM facturés est réservé aux
administrateurs.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status

from api.dependencies import (
    get_benchmark_criteria_store,
    get_benchmark_judge_pass_service,
    get_benchmark_pairwise_pass_service,
    get_benchmark_report_service,
    get_benchmark_run_service,
    get_benchmark_suite_store,
    require_admin,
)
from api.routers.auth import get_current_user, get_current_user_or_none
from api.schemas.benchmark_judging import (
    CriteriaGrid,
    CriteriaGridListResponse,
    CriteriaGridResponse,
    CriteriaGridUpsertRequest,
    JudgePassConfig,
    JudgePassControlResponse,
    JudgePassLaunchResponse,
    JudgePassProgress,
    JudgePassState,
    PairwisePassConfig,
    PairwisePassLaunchResponse,
    PairwisePassProgress,
    PairwisePassState,
    PairwiseVerdictListResponse,
    RubricVerdictListResponse,
)
from services.benchmark_criteria_store import (
    BenchmarkCriteriaStore,
    CriteriaGridInvalidError,
    CriteriaGridNotFoundError,
)
from services.benchmark_judge_pass_service import (
    BenchmarkJudgePassService,
    BenchmarkPairwisePassService,
    JudgePassConflictError,
    JudgePassNotFoundError,
)
from api.schemas.benchmark import (
    BenchmarkGenerationListResponse,
    BenchmarkRunConfig,
    BenchmarkRun,
    BenchmarkRunControlResponse,
    BenchmarkRunLaunchResponse,
    BenchmarkRunListResponse,
    BenchmarkRunProgress,
    BenchmarkSuite,
    BenchmarkSuiteListResponse,
    BenchmarkSuiteResponse,
    BenchmarkSuiteUpsertRequest,
)
from api.schemas.benchmark_report import (
    BenchmarkRunPreview,
    BenchmarkRunPreviewRequest,
    BenchmarkRunReport,
)
from services.benchmark_report_service import BenchmarkReportService
from services.benchmark_run_service import (
    BenchmarkRunConflictError,
    BenchmarkRunNotFoundError,
    BenchmarkRunService,
)
from services.benchmark_suite_store import (
    BenchmarkSuiteInvalidError,
    BenchmarkSuiteNotFoundError,
    BenchmarkSuiteStore,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/benchmark",
    tags=["Benchmark"],
    dependencies=[Depends(get_current_user)],
)


async def _require_admin_user(
    current_user: Annotated[
        Optional[Dict[str, object]],
        Depends(get_current_user_or_none),
    ],
) -> Dict[str, object]:
    """Résout et vérifie l'administrateur de la requête.

    Un run consomme du budget LLM réel : le déclencher, le reprendre ou l'annuler
    est une action d'administration.
    """
    return require_admin(current_user)


# ----------------------------------------------------------------------
# Suites
# ----------------------------------------------------------------------


@router.get("/suites", response_model=BenchmarkSuiteListResponse)
async def list_benchmark_suites(
    store: Annotated[BenchmarkSuiteStore, Depends(get_benchmark_suite_store)],
) -> BenchmarkSuiteListResponse:
    """Liste les suites disponibles."""
    return BenchmarkSuiteListResponse(suites=store.list_suites())


@router.get("/suites/{suite_id}", response_model=BenchmarkSuiteResponse)
async def get_benchmark_suite(
    suite_id: str,
    store: Annotated[BenchmarkSuiteStore, Depends(get_benchmark_suite_store)],
) -> BenchmarkSuiteResponse:
    """Retourne une suite complète."""
    try:
        return BenchmarkSuiteResponse(suite=store.get_suite(suite_id))
    except BenchmarkSuiteNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except BenchmarkSuiteInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.put("/suites/{suite_id}", response_model=BenchmarkSuiteResponse)
async def upsert_benchmark_suite(
    suite_id: str,
    body: BenchmarkSuiteUpsertRequest,
    store: Annotated[BenchmarkSuiteStore, Depends(get_benchmark_suite_store)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> BenchmarkSuiteResponse:
    """Crée ou remplace une suite ; la version est incrémentée par le magasin."""
    if body.suite_id != suite_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"suite_id du corps ('{body.suite_id}') ≠ chemin ('{suite_id}')",
        )
    try:
        suite = BenchmarkSuite(
            suite_id=body.suite_id,
            version=1,
            name=body.name,
            description=body.description,
            cases=body.cases,
        )
        return BenchmarkSuiteResponse(suite=store.save_suite(suite))
    except (BenchmarkSuiteInvalidError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/suites/{suite_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_benchmark_suite(
    suite_id: str,
    store: Annotated[BenchmarkSuiteStore, Depends(get_benchmark_suite_store)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> None:
    """Supprime une suite."""
    try:
        deleted = store.delete_suite(suite_id)
    except BenchmarkSuiteInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Suite de benchmark introuvable : {suite_id}",
        )


@router.get("/suites/{suite_id}/export", response_model=BenchmarkSuite)
async def export_benchmark_suite(
    suite_id: str,
    store: Annotated[BenchmarkSuiteStore, Depends(get_benchmark_suite_store)],
) -> BenchmarkSuite:
    """Exporte une suite telle quelle, pour versionnement en git."""
    try:
        return store.get_suite(suite_id)
    except BenchmarkSuiteNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except BenchmarkSuiteInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/suites/import", response_model=BenchmarkSuiteResponse)
async def import_benchmark_suite(
    store: Annotated[BenchmarkSuiteStore, Depends(get_benchmark_suite_store)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
    payload: Annotated[Dict[str, Any], Body(...)],
) -> BenchmarkSuiteResponse:
    """Importe une suite depuis un document exporté."""
    try:
        return BenchmarkSuiteResponse(suite=store.import_suite(payload))
    except BenchmarkSuiteInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


# ----------------------------------------------------------------------
# Runs
# ----------------------------------------------------------------------


@router.post("/runs/preview", response_model=BenchmarkRunPreview)
async def preview_benchmark_run(
    body: BenchmarkRunPreviewRequest,
    service: Annotated[BenchmarkReportService, Depends(get_benchmark_report_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> BenchmarkRunPreview:
    """Chiffre un run **sans le créer ni dépenser**.

    `POST /runs` estime et démarre dans le même appel : une interface qui doit
    faire consentir un humain à une dépense ne peut pas afficher le prix après
    l'avoir engagée. Route distincte plutôt que drapeau sur `POST /runs` — un
    booléen mal sérialisé lancerait un run facturé.
    """
    try:
        return service.preview(body)
    except BenchmarkSuiteNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except BenchmarkSuiteInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/runs", response_model=BenchmarkRunLaunchResponse)
async def start_benchmark_run(
    body: BenchmarkRunConfig,
    service: Annotated[BenchmarkRunService, Depends(get_benchmark_run_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> BenchmarkRunLaunchResponse:
    """Lance un run en tâche de fond et retourne immédiatement son identifiant.

    La réponse porte la fourchette de coût estimée et le diagnostic par modèle :
    un modèle inutilisable est signalé ici, avant d'apparaître en ``config_error``
    dans les résultats.
    """
    try:
        run, estimate = await service.start_run(body)
    except (BenchmarkSuiteNotFoundError,) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except BenchmarkSuiteInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except BenchmarkRunConflictError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return BenchmarkRunLaunchResponse(
        run_id=run.run_id,
        status=run.status,
        estimate=estimate,
        model_diagnostics=run.model_diagnostics,
    )


@router.get("/runs", response_model=BenchmarkRunListResponse)
async def list_benchmark_runs(
    service: Annotated[BenchmarkRunService, Depends(get_benchmark_run_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> BenchmarkRunListResponse:
    """Liste les runs persistés, du plus récent au plus ancien."""
    return BenchmarkRunListResponse(runs=service.list_runs())


@router.get("/runs/progress", response_model=BenchmarkRunProgress)
async def get_benchmark_run_progress(
    service: Annotated[BenchmarkRunService, Depends(get_benchmark_run_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> BenchmarkRunProgress:
    """Retourne la progression du run en cours dans ce processus."""
    return service.read_progress()


@router.get("/runs/{run_id}", response_model=BenchmarkRun)
async def get_benchmark_run(
    run_id: str,
    service: Annotated[BenchmarkRunService, Depends(get_benchmark_run_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> BenchmarkRun:
    """Retourne l'état persisté d'un run."""
    try:
        return service.get_run(run_id)
    except BenchmarkRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/runs/{run_id}/generations", response_model=BenchmarkGenerationListResponse)
async def list_benchmark_run_generations(
    run_id: str,
    service: Annotated[BenchmarkRunService, Depends(get_benchmark_run_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    include_content: Annotated[bool, Query()] = True,
) -> BenchmarkGenerationListResponse:
    """Liste les générations persistées d'un run, textes bruts inclus (audit).

    Réservé aux administrateurs : `raw_prompt` contient le contexte GDD injecté.
    Paginé : un run de plusieurs centaines de générations dépasserait sinon
    plusieurs mégaoctets par réponse. `include_content=false` renvoie les verdicts
    et les coûts sans les textes.
    """
    try:
        service.get_run(run_id)
    except BenchmarkRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    records = service.list_generations(run_id)[offset : offset + limit]
    if not include_content:
        records = [
            record.model_copy(update={"json_content": None, "raw_prompt": None})
            for record in records
        ]
    return BenchmarkGenerationListResponse(run_id=run_id, generations=records)


@router.get("/runs/{run_id}/report", response_model=BenchmarkRunReport)
async def get_benchmark_run_report(
    run_id: str,
    service: Annotated[BenchmarkReportService, Depends(get_benchmark_report_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> BenchmarkRunReport:
    """Agrège un run : validité et coût par modèle, puis notes et duels par juge.

    L'agrégation est faite ici et non côté client parce que ses règles sont celles
    du protocole (`invalid` jamais noté zéro, juges jamais fusionnés, critères
    appariés par identifiant) : les réécrire ailleurs en produirait une seconde
    version, hors de portée des tests.
    """
    try:
        return service.build_report(run_id)
    except BenchmarkRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("/runs/{run_id}/resume", response_model=BenchmarkRunLaunchResponse)
async def resume_benchmark_run(
    run_id: str,
    service: Annotated[BenchmarkRunService, Depends(get_benchmark_run_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> BenchmarkRunLaunchResponse:
    """Reprend un run interrompu sans refaire ce qui est déjà produit."""
    try:
        run, estimate = await service.resume_run(run_id)
    except BenchmarkRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except BenchmarkSuiteNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except (BenchmarkRunConflictError, BenchmarkSuiteInvalidError) as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return BenchmarkRunLaunchResponse(
        run_id=run.run_id,
        status=run.status,
        estimate=estimate,
        model_diagnostics=run.model_diagnostics,
    )


@router.post("/runs/{run_id}/pause", response_model=BenchmarkRunControlResponse)
async def pause_benchmark_run(
    run_id: str,
    service: Annotated[BenchmarkRunService, Depends(get_benchmark_run_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> BenchmarkRunControlResponse:
    """Demande une pause coopérative du run en cours."""
    applied = service.request_pause(run_id)
    return BenchmarkRunControlResponse(
        run_id=run_id,
        applied=applied,
        message="Pause demandée" if applied else "Ce run n'est pas le run actif de ce processus",
    )


@router.post("/runs/{run_id}/unpause", response_model=BenchmarkRunControlResponse)
async def unpause_benchmark_run(
    run_id: str,
    service: Annotated[BenchmarkRunService, Depends(get_benchmark_run_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> BenchmarkRunControlResponse:
    """Relance un run mis en pause."""
    applied = service.request_unpause(run_id)
    return BenchmarkRunControlResponse(
        run_id=run_id,
        applied=applied,
        message="Reprise demandée" if applied else "Ce run n'est pas le run actif de ce processus",
    )


@router.post("/runs/{run_id}/cancel", response_model=BenchmarkRunControlResponse)
async def cancel_benchmark_run(
    run_id: str,
    service: Annotated[BenchmarkRunService, Depends(get_benchmark_run_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> BenchmarkRunControlResponse:
    """Annule le run en cours ; les résultats déjà produits sont conservés."""
    applied = service.request_cancel(run_id)
    return BenchmarkRunControlResponse(
        run_id=run_id,
        applied=applied,
        message="Annulation demandée" if applied else "Ce run n'est pas le run actif de ce processus",
    )


# ----------------------------------------------------------------------
# Grilles de critères
# ----------------------------------------------------------------------


@router.get("/criteria", response_model=CriteriaGridListResponse)
async def list_criteria_grids(
    store: Annotated[BenchmarkCriteriaStore, Depends(get_benchmark_criteria_store)],
) -> CriteriaGridListResponse:
    """Liste les grilles de critères disponibles."""
    return CriteriaGridListResponse(grids=store.list_grids())


@router.get("/criteria/{grid_id}", response_model=CriteriaGridResponse)
async def get_criteria_grid(
    grid_id: str,
    store: Annotated[BenchmarkCriteriaStore, Depends(get_benchmark_criteria_store)],
) -> CriteriaGridResponse:
    """Retourne une grille complète."""
    try:
        return CriteriaGridResponse(grid=store.get_grid(grid_id))
    except CriteriaGridNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except CriteriaGridInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.put("/criteria/{grid_id}", response_model=CriteriaGridResponse)
async def upsert_criteria_grid(
    grid_id: str,
    body: CriteriaGridUpsertRequest,
    store: Annotated[BenchmarkCriteriaStore, Depends(get_benchmark_criteria_store)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> CriteriaGridResponse:
    """Crée ou remplace une grille ; la version est incrémentée par le magasin."""
    if body.grid_id != grid_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"grid_id du corps ('{body.grid_id}') ≠ chemin ('{grid_id}')",
        )
    try:
        grid = CriteriaGrid(
            grid_id=body.grid_id,
            version=1,
            name=body.name,
            description=body.description,
            criteria=body.criteria,
        )
        return CriteriaGridResponse(grid=store.save_grid(grid))
    except (CriteriaGridInvalidError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/criteria/{grid_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_criteria_grid(
    grid_id: str,
    store: Annotated[BenchmarkCriteriaStore, Depends(get_benchmark_criteria_store)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> None:
    """Supprime une grille."""
    try:
        deleted = store.delete_grid(grid_id)
    except CriteriaGridInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Grille de critères introuvable : {grid_id}",
        )


# ----------------------------------------------------------------------
# Passe de jugement
# ----------------------------------------------------------------------


@router.post("/runs/{run_id}/judge", response_model=JudgePassLaunchResponse)
async def start_judge_pass(
    run_id: str,
    body: JudgePassConfig,
    service: Annotated[BenchmarkJudgePassService, Depends(get_benchmark_judge_pass_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> JudgePassLaunchResponse:
    """Lance la notation absolue des générations valides d'un run.

    Aucune génération n'est refaite : la passe ne coûte que le prix du juge.
    """
    try:
        state = await service.start_pass(run_id, body)
    except (BenchmarkRunNotFoundError, CriteriaGridNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except CriteriaGridInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except JudgePassConflictError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return JudgePassLaunchResponse(
        run_id=state.run_id,
        judge_model=state.judge_model,
        status=state.status,
        verdicts_total=state.verdicts_total,
        estimated_max_usd=service.estimate_max_cost(state.judge_model, state.verdicts_total),
    )


@router.get("/runs/{run_id}/verdicts", response_model=RubricVerdictListResponse)
async def list_run_verdicts(
    run_id: str,
    service: Annotated[BenchmarkJudgePassService, Depends(get_benchmark_judge_pass_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
    judge_model: Annotated[Optional[str], Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> RubricVerdictListResponse:
    """Liste les verdicts rubrique d'un run.

    `judge_models` recense les juges présents dans le lot : plus d'un signifie
    qu'aucune agrégation directe n'est licite — changer de juge change les
    résultats. Filtrer par `judge_model` rend le lot agrégeable.
    """
    try:
        service.run_service.get_run(run_id)
    except BenchmarkRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    all_verdicts = service.list_verdicts(run_id)
    # Calculés AVANT le filtre : filtrer par juge ne doit pas éteindre le signal
    # « plusieurs juges présents », qui est précisément ce qui interdit d'agréger.
    judges = sorted({verdict.judge_model for verdict in all_verdicts})
    verdicts = (
        all_verdicts
        if judge_model is None
        else [verdict for verdict in all_verdicts if verdict.judge_model == judge_model]
    )
    return RubricVerdictListResponse(
        run_id=run_id,
        judge_models=judges,
        total=len(verdicts),
        verdicts=verdicts[offset : offset + limit],
    )


@router.get("/runs/{run_id}/judge/{judge_model:path}/state", response_model=JudgePassState)
async def get_judge_pass_state(
    run_id: str,
    judge_model: str,
    service: Annotated[BenchmarkJudgePassService, Depends(get_benchmark_judge_pass_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> JudgePassState:
    """Retourne l'état persisté d'une passe de jugement.

    Contrairement à `/judge/progress`, qui vit en mémoire et disparaît au
    redémarrage, cet état survit au processus : c'est le seul moyen de savoir,
    après un arrêt brutal, combien de verdicts ont été produits et ce qui a été
    dépensé.
    """
    try:
        return service.get_pass_state(run_id, judge_model)
    except (JudgePassNotFoundError, BenchmarkRunNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/judge/progress", response_model=JudgePassProgress)
async def get_judge_pass_progress(
    service: Annotated[BenchmarkJudgePassService, Depends(get_benchmark_judge_pass_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> JudgePassProgress:
    """Retourne la progression de la passe de jugement en cours."""
    return service.read_progress()


@router.post("/runs/{run_id}/judge/pause", response_model=JudgePassControlResponse)
async def pause_judge_pass(
    run_id: str,
    service: Annotated[BenchmarkJudgePassService, Depends(get_benchmark_judge_pass_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> JudgePassControlResponse:
    """Suspend la passe de jugement de ce run."""
    applied = service.request_pause(run_id)
    return JudgePassControlResponse(
        run_id=run_id,
        applied=applied,
        message="Pause demandée" if applied else "Aucune passe active pour ce run",
    )


@router.post("/runs/{run_id}/judge/unpause", response_model=JudgePassControlResponse)
async def unpause_judge_pass(
    run_id: str,
    service: Annotated[BenchmarkJudgePassService, Depends(get_benchmark_judge_pass_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> JudgePassControlResponse:
    """Relance la passe de jugement suspendue de ce run."""
    applied = service.request_unpause(run_id)
    return JudgePassControlResponse(
        run_id=run_id,
        applied=applied,
        message="Reprise demandée" if applied else "Aucune passe active pour ce run",
    )


@router.post("/runs/{run_id}/judge/cancel", response_model=JudgePassControlResponse)
async def cancel_judge_pass(
    run_id: str,
    service: Annotated[BenchmarkJudgePassService, Depends(get_benchmark_judge_pass_service)],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> JudgePassControlResponse:
    """Annule la passe de jugement de ce run ; les verdicts produits sont conservés."""
    applied = service.request_cancel(run_id)
    return JudgePassControlResponse(
        run_id=run_id,
        applied=applied,
        message="Annulation demandée" if applied else "Aucune passe active pour ce run",
    )


# ----------------------------------------------------------------------
# Comparaison par paires
# ----------------------------------------------------------------------


@router.post("/runs/{run_id}/judge/pairwise", response_model=PairwisePassLaunchResponse)
async def start_pairwise_pass(
    run_id: str,
    body: PairwisePassConfig,
    service: Annotated[
        BenchmarkPairwisePassService, Depends(get_benchmark_pairwise_pass_service)
    ],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> PairwisePassLaunchResponse:
    """Lance la comparaison par paires des générations valides d'un run.

    Chaque duel coûte **deux** appels de juge — le sens direct et le sens inverse —
    et le nombre de duels croît en carré du nombre de modèles : l'estimation
    retournée ici est le garde-fou avant de dépenser.
    """
    try:
        state = await service.start_pass(run_id, body)
    except (BenchmarkRunNotFoundError, CriteriaGridNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except CriteriaGridInvalidError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except JudgePassConflictError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    return PairwisePassLaunchResponse(
        run_id=state.run_id,
        judge_model=state.judge_model,
        status=state.status,
        duels_total=state.duels_total,
        unpairable_slots=state.unpairable_slots,
        judge_is_candidate=state.judge_is_candidate,
        # Estimation portée par l'état : calculée sur les duels RESTANTS avant le
        # lancement. La recalculer ici, après création de la tâche, afficherait le
        # coût de la totalité sur une reprise — et une levée laisserait une passe
        # orpheline en train de dépenser.
        estimated_max_usd=state.estimated_max_usd,
    )


@router.get("/runs/{run_id}/pairwise", response_model=PairwiseVerdictListResponse)
async def list_run_pairwise_verdicts(
    run_id: str,
    service: Annotated[
        BenchmarkPairwisePassService, Depends(get_benchmark_pairwise_pass_service)
    ],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
    judge_model: Annotated[Optional[str], Query()] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PairwiseVerdictListResponse:
    """Liste les duels d'un run.

    `judge_models` recense les juges présents dans le lot complet, avant pagination :
    plus d'un signifie qu'aucune agrégation directe n'est licite.
    """
    try:
        service.run_service.get_run(run_id)
    except BenchmarkRunNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    all_verdicts = service.list_verdicts(run_id)
    judges = sorted({verdict.judge_model for verdict in all_verdicts})
    verdicts = (
        all_verdicts
        if judge_model is None
        else [verdict for verdict in all_verdicts if verdict.judge_model == judge_model]
    )
    return PairwiseVerdictListResponse(
        run_id=run_id,
        judge_models=judges,
        total=len(verdicts),
        verdicts=verdicts[offset : offset + limit],
    )


@router.get(
    "/runs/{run_id}/pairwise/{judge_model:path}/state", response_model=PairwisePassState
)
async def get_pairwise_pass_state(
    run_id: str,
    judge_model: str,
    service: Annotated[
        BenchmarkPairwisePassService, Depends(get_benchmark_pairwise_pass_service)
    ],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> PairwisePassState:
    """Retourne l'état persisté d'une passe de comparaison.

    Porte notamment `unpairable_slots` : un run largement invalide produit peu de
    duels, et le rapport ne doit pas présenter ce classement comme s'il en avait
    couvert beaucoup.
    """
    try:
        return service.get_pass_state(run_id, judge_model)
    except (JudgePassNotFoundError, BenchmarkRunNotFoundError) as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/pairwise/progress", response_model=PairwisePassProgress)
async def get_pairwise_pass_progress(
    service: Annotated[
        BenchmarkPairwisePassService, Depends(get_benchmark_pairwise_pass_service)
    ],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> PairwisePassProgress:
    """Retourne la progression de la passe de comparaison en cours."""
    return service.read_progress()


@router.post("/runs/{run_id}/pairwise/pause", response_model=JudgePassControlResponse)
async def pause_pairwise_pass(
    run_id: str,
    service: Annotated[
        BenchmarkPairwisePassService, Depends(get_benchmark_pairwise_pass_service)
    ],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> JudgePassControlResponse:
    """Suspend la passe de comparaison de ce run."""
    applied = service.request_pause(run_id)
    return JudgePassControlResponse(
        run_id=run_id,
        applied=applied,
        message="Pause demandée" if applied else "Aucune passe active pour ce run",
    )


@router.post("/runs/{run_id}/pairwise/unpause", response_model=JudgePassControlResponse)
async def unpause_pairwise_pass(
    run_id: str,
    service: Annotated[
        BenchmarkPairwisePassService, Depends(get_benchmark_pairwise_pass_service)
    ],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> JudgePassControlResponse:
    """Relance la passe de comparaison suspendue de ce run."""
    applied = service.request_unpause(run_id)
    return JudgePassControlResponse(
        run_id=run_id,
        applied=applied,
        message="Reprise demandée" if applied else "Aucune passe active pour ce run",
    )


@router.post("/runs/{run_id}/pairwise/cancel", response_model=JudgePassControlResponse)
async def cancel_pairwise_pass(
    run_id: str,
    service: Annotated[
        BenchmarkPairwisePassService, Depends(get_benchmark_pairwise_pass_service)
    ],
    _admin: Annotated[Dict[str, object], Depends(_require_admin_user)],
) -> JudgePassControlResponse:
    """Annule la passe de comparaison ; les duels déjà produits sont conservés."""
    applied = service.request_cancel(run_id)
    return JudgePassControlResponse(
        run_id=run_id,
        applied=applied,
        message="Annulation demandée" if applied else "Aucune passe active pour ce run",
    )
