"""Router FastAPI pour les endpoints /api/v1/templates (CRUD)."""
import logging
from typing import Annotated, Any, Dict, List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from api.dependencies import (
    get_config_service,
    get_dialogue_tree_expansion_service,
    get_llm_quality_judge_service,
    get_llm_usage_service,
    get_request_id,
    get_template_ab_test_job_manager,
    get_template_ab_testing_service,
    get_template_service,
    get_template_access_service,
    get_template_suggestion_service,
    get_unity_dialogue_orchestrator,
    require_non_guest,
)
from api.routers.auth import get_current_user
from api.routers.graph_router_helpers import create_llm_client_for_router
from api.schemas.preset import PresetValidationResult
from api.schemas.template import (
    ABTestCreateRequest,
    ABTestCreateResponse,
    ABTestFeedbackRequest,
    PrebuiltTemplate,
    Template,
    TemplateCreate,
    TemplateCreateResponse,
    TemplateSuggestionItem,
    TemplateSuggestionRequest,
    TemplateSuggestionUsedRequest,
    TemplateSuggestionUsedResponse,
    TemplateUpdate,
    TemplateVersionSummary,
)
from api.services.template_ab_test_job_manager import TemplateABTestJobManager
from api.utils.job_ownership import template_owner_key
from constants import ModelNames
from services.configuration_service import ConfigurationService
from services.dialogue_tree_expansion_service import DialogueTreeExpansionService
from services.llm_quality_judge_service import LLMQualityJudgeService
from services.llm_usage_service import LLMUsageService
from services.template_ab_testing_service import (
    AB_TEST_USAGE_ENDPOINT,
    PREBUILT_ID_PREFIX,
    TemplateABTestNotFoundError,
    TemplateABTestValidationError,
    TemplateABTestingService,
)
from services.template_service import TemplateService
from services.template_access_service import (
    TemplateAccessForbiddenError,
    TemplateAccessNotFoundError,
    TemplateAccessValidationError,
    TemplateAccessService,
)
from services.template_suggestion_service import (
    TemplateSuggestionService,
    TemplateSuggestionValidationError,
)
from services.unity_dialogue_orchestrator import UnityDialogueOrchestrator

router = APIRouter(dependencies=[Depends(get_current_user)])
logger = logging.getLogger(__name__)






def _ab_is_admin(current_user: dict[str, object]) -> bool:
    """Admin actif."""
    return (
        current_user.get("role") == "admin" and current_user.get("is_active") is True
    )


def _require_ab_side_readable(
    template_id: str,
    current_user: dict[str, object],
    template_service: TemplateService,
    access_service: TemplateAccessService,
) -> None:
    """Refuse un custom hors visibilité ; les pré-built sont publics."""
    raw = (template_id or "").strip()
    if raw.startswith(PREBUILT_ID_PREFIX):
        return
    access_service.require_readable(
        template_service.get_template(raw),
        current_user,
    )



@router.get("", response_model=List[Template])
def list_templates(
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    template_service: TemplateService = Depends(get_template_service),
    access_service: TemplateAccessService = Depends(get_template_access_service),
) -> List[Template]:
    """Liste les templates visibles pour l'acteur (owned, shared, legacy).

    Returns:
        Liste filtrée (vide si aucun).
    """
    try:
        templates = access_service.list_visible(
            template_service.list_templates(),
            current_user,
        )
        logger.info("Liste templates retournée: %s templates", len(templates))
        return templates
    except Exception as exc:
        logger.exception("Erreur liste templates")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error listing templates",
        ) from exc


@router.post("", response_model=TemplateCreateResponse, status_code=status.HTTP_201_CREATED)
def create_template(
    template_data: TemplateCreate,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    template_service: TemplateService = Depends(get_template_service),
    access_service: TemplateAccessService = Depends(get_template_access_service),
) -> TemplateCreateResponse:
    """Crée un template custom owned par l'acteur.

    Args:
        template_data: Nom, description, catégorie, icône et configuration snapshotée.

    Returns:
        Template créé avec ``warnings`` (tableau, éventuellement vide).

    Raises:
        500: Erreur d'écriture disque ou permissions.
    """
    require_non_guest(current_user)
    try:
        payload = template_data.model_dump()
        payload["owner_id"] = template_owner_key(current_user) or None

        template, warnings = template_service.create_template(payload)
        annotated = access_service.annotate(template, current_user)
        logger.info("Template créé: %s (ID: %s)", template.name, template.id)
        return TemplateCreateResponse(
            **annotated.model_dump(),
            warnings=warnings,
        )
    except PermissionError as exc:
        logger.exception("Permission denied creating template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Permission denied",
        ) from exc
    except OSError as exc:
        logger.exception("Disk error creating template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Disk error",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur création template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error creating template",
        ) from exc


@router.post("/suggestions", response_model=List[TemplateSuggestionItem])
def suggest_templates(
    payload: TemplateSuggestionRequest,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    template_service: TemplateService = Depends(get_template_service),
    suggestion_service: TemplateSuggestionService = Depends(
        get_template_suggestion_service
    ),
) -> List[TemplateSuggestionItem]:
    """Classe les templates lisibles selon le scénario (déterministe, sans LLM)."""
    try:
        return suggestion_service.suggest(
            current_user=current_user,
            template_service=template_service,
            instructions=payload.instructions,
            scene_type=payload.sceneType,
            characters=payload.characters,
            locations=payload.locations,
            rencontre_initiale_by_character=payload.rencontreInitialeByCharacter,
        )
    except Exception as exc:
        logger.exception("Erreur suggestions templates")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error suggesting templates",
        ) from exc


@router.post("/suggestions/used", response_model=TemplateSuggestionUsedResponse)
def record_template_suggestion_used(
    payload: TemplateSuggestionUsedRequest,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    suggestion_service: TemplateSuggestionService = Depends(
        get_template_suggestion_service
    ),
) -> TemplateSuggestionUsedResponse:
    """Incrémente le compteur perso après un Charger réussi."""
    require_non_guest(current_user)
    try:
        count = suggestion_service.record_used(
            current_user,
            payload.source,
            payload.id,
            scene_type=payload.sceneType,
            characters=payload.characters,
        )
        return TemplateSuggestionUsedResponse(
            source=payload.source,
            id=payload.id,
            useCount=count,
        )
    except TemplateSuggestionValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        logger.exception("Erreur compteur suggestions templates")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error recording template usage",
        ) from exc


@router.get("/prebuilt", response_model=List[PrebuiltTemplate])
def list_prebuilt_templates(
    template_service: TemplateService = Depends(get_template_service),
) -> List[PrebuiltTemplate]:
    """Liste les templates pré-built Alteir (lecture seule).

    Returns:
        Catalogue versionné (vide si fichier absent).
    """
    try:
        templates = template_service.list_prebuilt_templates()
        logger.info("Liste pré-built retournée: %s fiches", len(templates))
        return templates
    except ValueError as exc:
        logger.exception("Catalogue pré-built invalide")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error listing prebuilt templates",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur liste pré-built")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error listing prebuilt templates",
        ) from exc


@router.get("/prebuilt/{slug}", response_model=PrebuiltTemplate)
def get_prebuilt_template(
    slug: str,
    template_service: TemplateService = Depends(get_template_service),
) -> PrebuiltTemplate:
    """Charge une fiche pré-built par slug.

    Raises:
        404: Slug absent.
    """
    try:
        return template_service.get_prebuilt_template(slug)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prebuilt template not found",
        ) from exc
    except ValueError as exc:
        logger.exception("Catalogue pré-built invalide")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error loading prebuilt template",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur chargement pré-built")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error loading prebuilt template",
        ) from exc



def _raise_access_http(exc: Exception) -> None:
    """Convertit les erreurs d'accès aux templates en HTTP 400/403/404.

    La copie appelait `_http_from_share_exc`, nom hérité du partage nominatif retiré
    au lot 2 et jamais défini ici : le chemin d'erreur levait un NameError, donc un
    500, au lieu du 404 attendu quand la source est introuvable ou invisible.
    """
    if isinstance(exc, TemplateAccessValidationError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if isinstance(exc, TemplateAccessForbiddenError):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc)) from exc
    if isinstance(exc, (TemplateAccessNotFoundError, FileNotFoundError)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    raise exc


def _raise_ab_http(exc: Exception) -> None:
    """Convertit les erreurs A/B métier en HTTP 400/404."""
    if isinstance(exc, TemplateABTestValidationError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if isinstance(exc, TemplateABTestNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if isinstance(exc, FileNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if isinstance(exc, TemplateAccessNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    raise exc


def _schedule_ab_job(
    *,
    test_id: str,
    total: int,
    background_tasks: BackgroundTasks,
    ab_service: TemplateABTestingService,
    job_manager: TemplateABTestJobManager,
    expansion_service: DialogueTreeExpansionService,
    unity_orchestrator: UnityDialogueOrchestrator,
    judge_service: LLMQualityJudgeService,
    config_service: ConfigurationService,
    usage_service: LLMUsageService,
    request_id: str,
) -> ABTestCreateResponse:
    """Enregistre le job mémoire et planifie ``run_ab_test``."""
    job_manager.create_job(test_id, total=total)
    generation_client = create_llm_client_for_router(
        ModelNames.GPT_5_6_LUNA,
        config_service,
        usage_service,
        request_id,
        endpoint=AB_TEST_USAGE_ENDPOINT,
    )
    judge_model = LLMQualityJudgeService.resolve_default_model_id(config_service)
    judge_client = create_llm_client_for_router(
        judge_model,
        config_service,
        usage_service,
        request_id,
        endpoint=AB_TEST_USAGE_ENDPOINT,
    )

    async def _runner() -> None:
        try:

            def on_progress(current: int, step_total: int, detail: str) -> None:
                job_manager.set_progress(test_id, current, step_total, detail)

            await ab_service.run_ab_test(
                test_id,
                expansion_service=expansion_service,
                unity_orchestrator=unity_orchestrator,
                generation_llm_client=generation_client,
                judge_llm_client=judge_client,
                judge_service=judge_service,
                config_service=config_service,
                usage_service=usage_service,
                on_progress=on_progress,
            )
            job_manager.complete(test_id, status="completed")
        except Exception as exc:  # noqa: BLE001
            logger.exception("Job A/B %s échoué (request_id=%s)", test_id, request_id)
            job_manager.complete(test_id, status="error", error=str(exc))

    background_tasks.add_task(_runner)
    return ABTestCreateResponse(
        testId=test_id,
        status="queued",
        current=0,
        total=total,
    )


@router.get("/ab-test")
def list_ab_tests(
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    ab_service: TemplateABTestingService = Depends(get_template_ab_testing_service),
) -> List[Dict[str, Any]]:
    """Historique des tests A/B de l'acteur (admin : tous)."""
    return ab_service.list_tests(
        owner_key=template_owner_key(current_user),
        is_admin=_ab_is_admin(current_user),
    )


@router.post(
    "/ab-test",
    response_model=ABTestCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_ab_test(
    body: ABTestCreateRequest,
    background_tasks: BackgroundTasks,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    ab_service: TemplateABTestingService = Depends(get_template_ab_testing_service),
    job_manager: TemplateABTestJobManager = Depends(get_template_ab_test_job_manager),
    expansion_service: DialogueTreeExpansionService = Depends(
        get_dialogue_tree_expansion_service
    ),
    unity_orchestrator: UnityDialogueOrchestrator = Depends(
        get_unity_dialogue_orchestrator
    ),
    judge_service: LLMQualityJudgeService = Depends(get_llm_quality_judge_service),
    config_service: ConfigurationService = Depends(get_config_service),
    usage_service: LLMUsageService = Depends(get_llm_usage_service),
    request_id: str = Depends(get_request_id),
    template_service: TemplateService = Depends(get_template_service),
    access_service: TemplateAccessService = Depends(get_template_access_service),
) -> ABTestCreateResponse:
    """Lance un job A/B — réservé aux comptes, consomme du LLM.

    Un run lance N × 2 générations : le mode invité est une démonstration en lecture,
    il n'a pas à engager le budget LLM du projet.
    """
    require_non_guest(current_user)
    try:
        ab_service.validate_launch_params(
            body.templateAId,
            body.templateBId,
            body.generationsPerTemplate,
            body.maxDepth,
        )
        _require_ab_side_readable(
            body.templateAId, current_user, template_service, access_service
        )
        _require_ab_side_readable(
            body.templateBId, current_user, template_service, access_service
        )
        payload = ab_service.create_queued_test(
            template_a_id=body.templateAId,
            template_b_id=body.templateBId,
            generations_per_template=body.generationsPerTemplate,
            max_depth=body.maxDepth,
            owner_key=template_owner_key(current_user),
            winner_mode=body.winnerMode,
        )
    except (
        TemplateABTestValidationError,
        TemplateABTestNotFoundError,
        FileNotFoundError,
        TemplateAccessNotFoundError,
    ) as exc:
        _raise_ab_http(exc)
        raise
    try:
        return _schedule_ab_job(
            test_id=str(payload["testId"]),
            total=int(payload["total"]),
            background_tasks=background_tasks,
            ab_service=ab_service,
            job_manager=job_manager,
            expansion_service=expansion_service,
            unity_orchestrator=unity_orchestrator,
            judge_service=judge_service,
            config_service=config_service,
            usage_service=usage_service,
            request_id=request_id,
        )
    except Exception as exc:
        payload["error"] = str(exc)
        ab_service.mark_failed(str(payload["testId"]), str(exc))
        logger.exception("Impossible de démarrer le job A/B %s", payload["testId"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error starting A/B test job",
        ) from exc


@router.get("/ab-test/{test_id}")
def get_ab_test(
    test_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    ab_service: TemplateABTestingService = Depends(get_template_ab_testing_service),
    job_manager: TemplateABTestJobManager = Depends(get_template_ab_test_job_manager),
) -> Dict[str, Any]:
    """Statut et résultats d'un test A/B."""
    try:
        payload = ab_service.get_test(test_id)
        ab_service.assert_visible(
            payload,
            owner_key=template_owner_key(current_user),
            is_admin=_ab_is_admin(current_user),
        )
    except TemplateABTestNotFoundError as exc:
        _raise_ab_http(exc)
        raise
    job = job_manager.get_job(test_id)
    if job:
        payload["current"] = job.get("current", payload.get("current"))
        if job.get("status") == "running" and payload.get("status") == "queued":
            payload["status"] = "running"
        if job.get("status") == "error":
            payload["status"] = "failed"
            payload["error"] = job.get("error") or payload.get("error")
    return payload


@router.patch("/ab-test/{test_id}/feedback")
def patch_ab_test_feedback(
    test_id: str,
    body: ABTestFeedbackRequest,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    ab_service: TemplateABTestingService = Depends(get_template_ab_testing_service),
) -> Dict[str, Any]:
    """Pouce haut/bas/none sur une génération."""
    require_non_guest(current_user)
    try:
        payload = ab_service.get_test(test_id)
        ab_service.assert_visible(
            payload,
            owner_key=template_owner_key(current_user),
            is_admin=_ab_is_admin(current_user),
        )
        return ab_service.apply_feedback(test_id, body.generationId, body.thumb)
    except (TemplateABTestValidationError, TemplateABTestNotFoundError) as exc:
        _raise_ab_http(exc)
        raise


@router.post(
    "/ab-test/{test_id}/rerun",
    response_model=ABTestCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def rerun_ab_test(
    test_id: str,
    background_tasks: BackgroundTasks,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    ab_service: TemplateABTestingService = Depends(get_template_ab_testing_service),
    job_manager: TemplateABTestJobManager = Depends(get_template_ab_test_job_manager),
    expansion_service: DialogueTreeExpansionService = Depends(
        get_dialogue_tree_expansion_service
    ),
    unity_orchestrator: UnityDialogueOrchestrator = Depends(
        get_unity_dialogue_orchestrator
    ),
    judge_service: LLMQualityJudgeService = Depends(get_llm_quality_judge_service),
    config_service: ConfigurationService = Depends(get_config_service),
    usage_service: LLMUsageService = Depends(get_llm_usage_service),
    request_id: str = Depends(get_request_id),
) -> ABTestCreateResponse:
    """Relance un test lié au parent (snapshots templates actuels).

    Même garde que le lancement : une relance dépense autant qu'un run initial.
    """
    require_non_guest(current_user)
    try:
        parent = ab_service.get_test(test_id)
        ab_service.assert_visible(
            parent,
            owner_key=template_owner_key(current_user),
            is_admin=_ab_is_admin(current_user),
        )
        queued = ab_service.prepare_rerun(test_id)
    except (TemplateABTestValidationError, TemplateABTestNotFoundError, FileNotFoundError) as exc:
        _raise_ab_http(exc)
        raise
    try:
        return _schedule_ab_job(
            test_id=str(queued["testId"]),
            total=int(queued["total"]),
            background_tasks=background_tasks,
            ab_service=ab_service,
            job_manager=job_manager,
            expansion_service=expansion_service,
            unity_orchestrator=unity_orchestrator,
            judge_service=judge_service,
            config_service=config_service,
            usage_service=usage_service,
            request_id=request_id,
        )
    except Exception as exc:
        ab_service.mark_failed(str(queued["testId"]), str(exc))
        logger.exception("Impossible de relancer le job A/B %s", queued["testId"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error starting A/B test job",
        ) from exc



@router.post(
    "/{template_id}/copy",
    response_model=TemplateCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def copy_template(
    template_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    template_service: TemplateService = Depends(get_template_service),
    access_service: TemplateAccessService = Depends(get_template_access_service),
) -> TemplateCreateResponse:
    """Clone un template visible en custom owned par l'acteur."""
    require_non_guest(current_user)
    try:
        copied, warnings = access_service.copy_template(
            template_service,
            template_id,
            current_user,
        )
    except (
        TemplateAccessValidationError,
        TemplateAccessForbiddenError,
        TemplateAccessNotFoundError,
        FileNotFoundError,
    ) as exc:
        _raise_access_http(exc)
    except PermissionError as exc:
        logger.exception("Permission denied copying template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Permission denied",
        ) from exc
    except OSError as exc:
        logger.exception("Disk error copying template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Disk error",
        ) from exc
    logger.info("Template %s copié vers %s", template_id, copied.id)
    return TemplateCreateResponse(**copied.model_dump(), warnings=warnings)


@router.get("/{template_id}/versions", response_model=List[TemplateVersionSummary])
def list_template_versions(
    template_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    template_service: TemplateService = Depends(get_template_service),
    access_service: TemplateAccessService = Depends(get_template_access_service),
) -> List[TemplateVersionSummary]:
    """Snapshots d'un custom (lecture)."""
    try:
        access_service.require_readable(
            template_service.get_template(template_id),
            current_user,
        )
        return template_service.list_versions(template_id)
    except (TemplateAccessNotFoundError, FileNotFoundError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        ) from exc


@router.post(
    "/{template_id}/versions/{version_id}/restore",
    response_model=TemplateCreateResponse,
)
def restore_template_version(
    template_id: str,
    version_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    template_service: TemplateService = Depends(get_template_service),
    access_service: TemplateAccessService = Depends(get_template_access_service),
) -> TemplateCreateResponse:
    """Restaure un snapshot (owner / can_edit)."""
    require_non_guest(current_user)
    try:
        access_service.require_writable(
            template_service.get_template(template_id),
            current_user,
        )
        template, warnings = template_service.restore_version(template_id, version_id)
        annotated = access_service.annotate(template, current_user)
        return TemplateCreateResponse(**annotated.model_dump(), warnings=warnings)
    except TemplateAccessForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except (TemplateAccessNotFoundError, FileNotFoundError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        ) from exc


@router.get("/{template_id}/validate", response_model=PresetValidationResult)
def validate_template(
    template_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    template_service: TemplateService = Depends(get_template_service),
    access_service: TemplateAccessService = Depends(get_template_access_service),
) -> PresetValidationResult:
    """Valide les références GDD d'un template (sans muter le JSON).

    Raises:
        404: Template absent ou hors visibilité.
    """
    try:
        access_service.require_readable(
            template_service.get_template(template_id),
            current_user,
        )
        result = template_service.validate_template_references(template_id)
        if not result.valid:
            logger.warning(
                "Template %s has %s obsolete references",
                template_id,
                len(result.obsoleteRefs),
            )
        return result
    except (TemplateAccessNotFoundError, FileNotFoundError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur validation template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error validating template",
        ) from exc


@router.get("/{template_id}", response_model=Template)
def get_template(
    template_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    template_service: TemplateService = Depends(get_template_service),
    access_service: TemplateAccessService = Depends(get_template_access_service),
) -> Template:
    """Charge un template par UUID s'il est visible.

    Raises:
        404: Template absent ou hors visibilité.
    """
    try:
        return access_service.require_readable(
            template_service.get_template(template_id),
            current_user,
        )
    except (TemplateAccessNotFoundError, FileNotFoundError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur chargement template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error loading template",
        ) from exc


@router.put("/{template_id}", response_model=TemplateCreateResponse)
def update_template(
    template_id: str,
    update_data: TemplateUpdate,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    template_service: TemplateService = Depends(get_template_service),
    access_service: TemplateAccessService = Depends(get_template_access_service),
) -> TemplateCreateResponse:
    """Met à jour un template (owner/admin, ou legacy).

    Returns:
        Template persisté avec ``warnings`` GDD.

    Raises:
        404: Template absent ou hors visibilité.
        403: Destinataire (lecture seule).
        500: Erreur disque.
    """
    require_non_guest(current_user)
    try:
        existing = template_service.get_template(template_id)
        access_service.require_writable(existing, current_user)
        # Un destinataire avec droit d'édition modifie le contenu, pas le statut :
        # décider qui voit le template reste au propriétaire.
        if update_data.visibility is not None and not access_service.can_change_visibility(
            existing, current_user
        ):
            raise TemplateAccessForbiddenError(
                "Seul le propriétaire peut changer la visibilité de ce template"
            )
        template, warnings = template_service.update_template(
            template_id,
            update_data.model_dump(exclude_none=True),
        )
        annotated = access_service.annotate(template, current_user)
        logger.info("Template mis à jour: %s (ID: %s)", template.name, template.id)
        return TemplateCreateResponse(
            **annotated.model_dump(),
            warnings=warnings,
        )
    except TemplateAccessForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except (TemplateAccessNotFoundError, FileNotFoundError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        ) from exc
    except PermissionError as exc:
        logger.exception("Permission denied updating template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Permission denied",
        ) from exc
    except OSError as exc:
        logger.exception("Disk error updating template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Disk error",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur mise à jour template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error updating template",
        ) from exc


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    template_service: TemplateService = Depends(get_template_service),
    access_service: TemplateAccessService = Depends(get_template_access_service),
) -> None:
    """Supprime un template owned (cascade des partages).

    Raises:
        404: Template absent ou hors visibilité.
        403: Destinataire (lecture seule).
    """
    require_non_guest(current_user)
    try:
        access_service.require_deletable(
            template_service.get_template(template_id),
            current_user,
        )
        template_service.delete_template(template_id)
        logger.info("Template supprimé: %s", template_id)
    except TemplateAccessForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except (TemplateAccessNotFoundError, FileNotFoundError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur suppression template")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error deleting template",
        ) from exc
