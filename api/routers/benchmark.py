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
    get_benchmark_run_service,
    get_benchmark_suite_store,
    require_admin,
)
from api.routers.auth import get_current_user, get_current_user_or_none
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
