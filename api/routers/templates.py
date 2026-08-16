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
    get_template_marketplace_service,
    get_template_service,
    get_template_sharing_service,
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
    MarketplaceListing,
    MarketplacePublishRequest,
    MarketplaceRatingRequest,
    PrebuiltTemplate,
    Template,
    TemplateCreate,
    TemplateCreateResponse,
    TemplateShareCreateRequest,
    TemplateShareResponse,
    TemplateUpdate,
)
from api.services.template_ab_test_job_manager import TemplateABTestJobManager
from constants import ModelNames
from services.configuration_service import ConfigurationService
from services.dialogue_tree_expansion_service import DialogueTreeExpansionService
from services.llm_quality_judge_service import LLMQualityJudgeService
from services.llm_usage_service import LLMUsageService
from services.template_ab_testing_service import (
    AB_TEST_USAGE_ENDPOINT,
    TemplateABTestNotFoundError,
    TemplateABTestValidationError,
    TemplateABTestingService,
)
from services.template_marketplace_service import (
    MarketplaceForbiddenError,
    OwnListingRatingError,
    TemplateMarketplaceService,
)
from services.template_service import TemplateService
from services.template_sharing_service import (
    TemplateShareConflictError,
    TemplateShareForbiddenError,
    TemplateShareNotFoundError,
    TemplateShareSelfShareError,
    TemplateShareValidationError,
    TemplateShareView,
    TemplateSharingService,
)
from services.unity_dialogue_orchestrator import UnityDialogueOrchestrator

router = APIRouter(dependencies=[Depends(get_current_user)])
logger = logging.getLogger(__name__)


def _share_to_response(share: TemplateShareView) -> TemplateShareResponse:
    """Mappe une vue service vers le schéma API."""
    return TemplateShareResponse(
        template_id=share.template_id,
        user_id=share.user_id,
        username=share.username,
        created_at=share.created_at,
    )


def _http_from_share_exc(exc: Exception) -> HTTPException:
    """Traduit les erreurs de partage en HTTP."""
    if isinstance(exc, TemplateShareValidationError):
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if isinstance(exc, TemplateShareSelfShareError):
        return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if isinstance(exc, TemplateShareConflictError):
        return HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    if isinstance(exc, TemplateShareForbiddenError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    if isinstance(exc, (TemplateShareNotFoundError, FileNotFoundError)):
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Error managing template share",
    )


@router.get("", response_model=List[Template])
def list_templates(
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    template_service: TemplateService = Depends(get_template_service),
    sharing_service: TemplateSharingService = Depends(get_template_sharing_service),
) -> List[Template]:
    """Liste les templates visibles pour l'acteur (owned, shared, legacy).

    Returns:
        Liste filtrée (vide si aucun).
    """
    try:
        templates = sharing_service.list_visible(
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
    sharing_service: TemplateSharingService = Depends(get_template_sharing_service),
) -> TemplateCreateResponse:
    """Crée un template custom owned par l'acteur.

    Args:
        template_data: Nom, description, catégorie, icône et configuration snapshotée.

    Returns:
        Template créé avec ``warnings`` (tableau, éventuellement vide).

    Raises:
        500: Erreur d'écriture disque ou permissions.
    """
    try:
        payload = template_data.model_dump()
        payload["owner_id"] = str(current_user.get("id") or "").strip() or None
        template, warnings = template_service.create_template(payload)
        annotated = sharing_service.annotate(template, current_user)
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


@router.get("/marketplace", response_model=List[MarketplaceListing])
def list_marketplace_templates(
    marketplace_service: TemplateMarketplaceService = Depends(
        get_template_marketplace_service
    ),
) -> List[MarketplaceListing]:
    """Liste les fiches marketplace publiées."""
    try:
        return marketplace_service.browse_templates()
    except Exception as exc:
        logger.exception("Erreur liste marketplace")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error listing marketplace templates",
        ) from exc


@router.get("/marketplace/{listing_id}", response_model=MarketplaceListing)
def get_marketplace_template(
    listing_id: str,
    marketplace_service: TemplateMarketplaceService = Depends(
        get_template_marketplace_service
    ),
) -> MarketplaceListing:
    """Charge une fiche marketplace."""
    try:
        return marketplace_service.get_listing(listing_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Marketplace listing not found",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur chargement marketplace")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error loading marketplace listing",
        ) from exc


@router.post(
    "/marketplace",
    response_model=MarketplaceListing,
    status_code=status.HTTP_201_CREATED,
)
def publish_marketplace_template(
    body: MarketplacePublishRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    template_service: TemplateService = Depends(get_template_service),
    sharing_service: TemplateSharingService = Depends(get_template_sharing_service),
    marketplace_service: TemplateMarketplaceService = Depends(
        get_template_marketplace_service
    ),
) -> MarketplaceListing:
    """Publie un template custom (upsert si déjà publié par le même auteur)."""
    require_non_guest(current_user)
    try:
        sharing_service.require_writable(
            template_service.get_template(body.templateId),
            current_user,
        )
        listing = marketplace_service.share_template(body.templateId, current_user)
        logger.info("Template publié marketplace: %s", listing.id)
        return listing
    except (TemplateShareNotFoundError, FileNotFoundError) as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Template not found",
        ) from exc
    except TemplateShareForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Marketplace publish forbidden",
        ) from exc
    except MarketplaceForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Marketplace publish forbidden",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur publication marketplace")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error publishing marketplace template",
        ) from exc


@router.post(
    "/marketplace/{listing_id}/use",
    response_model=TemplateCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def use_marketplace_template(
    listing_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    marketplace_service: TemplateMarketplaceService = Depends(
        get_template_marketplace_service
    ),
) -> TemplateCreateResponse:
    """Copie une fiche vers Mes templates et incrémente les usages."""
    try:
        owner_id = str(current_user.get("id") or "").strip() or None
        return marketplace_service.use_listing(listing_id, owner_id=owner_id)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Marketplace listing not found",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur copie marketplace")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error using marketplace listing",
        ) from exc


@router.put("/marketplace/{listing_id}/rating", response_model=MarketplaceListing)
def rate_marketplace_template(
    listing_id: str,
    body: MarketplaceRatingRequest,
    current_user: Dict[str, Any] = Depends(get_current_user),
    marketplace_service: TemplateMarketplaceService = Depends(
        get_template_marketplace_service
    ),
) -> MarketplaceListing:
    """Note une fiche (1–5, pas soi-même)."""
    require_non_guest(current_user)
    try:
        return marketplace_service.rate_listing(listing_id, body.stars, current_user)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Marketplace listing not found",
        ) from exc
    except OwnListingRatingError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot rate own marketplace listing",
        ) from exc
    except MarketplaceForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Marketplace rating forbidden",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur notation marketplace")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error rating marketplace listing",
        ) from exc


@router.delete("/marketplace/{listing_id}", status_code=status.HTTP_204_NO_CONTENT)
def unpublish_marketplace_template(
    listing_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user),
    marketplace_service: TemplateMarketplaceService = Depends(
        get_template_marketplace_service
    ),
) -> None:
    """Retire une fiche (auteur ou admin)."""
    require_non_guest(current_user)
    try:
        marketplace_service.unpublish_listing(listing_id, current_user)
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Marketplace listing not found",
        ) from exc
    except MarketplaceForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Marketplace unpublish forbidden",
        ) from exc
    except Exception as exc:
        logger.exception("Erreur retrait marketplace")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error unpublishing marketplace listing",
        ) from exc


def _raise_ab_http(exc: Exception) -> None:
    """Convertit les erreurs A/B métier en HTTP 400/404."""
    if isinstance(exc, TemplateABTestValidationError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if isinstance(exc, TemplateABTestNotFoundError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if isinstance(exc, FileNotFoundError):
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
    ab_service: TemplateABTestingService = Depends(get_template_ab_testing_service),
) -> List[Dict[str, Any]]:
    """Historique des tests A/B (fichiers ``data/ab-tests``)."""
    return ab_service.list_tests()


@router.post(
    "/ab-test",
    response_model=ABTestCreateResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_ab_test(
    body: ABTestCreateRequest,
    background_tasks: BackgroundTasks,
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
    """Lance un job A/B (guest autorisé, consomme du LLM)."""
    try:
        payload = ab_service.create_queued_test(
            template_a_id=body.templateAId,
            template_b_id=body.templateBId,
            generations_per_template=body.generationsPerTemplate,
            max_depth=body.maxDepth,
        )
    except (TemplateABTestValidationError, TemplateABTestNotFoundError, FileNotFoundError) as exc:
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
    ab_service: TemplateABTestingService = Depends(get_template_ab_testing_service),
    job_manager: TemplateABTestJobManager = Depends(get_template_ab_test_job_manager),
) -> Dict[str, Any]:
    """Statut et résultats d'un test A/B."""
    try:
        payload = ab_service.get_test(test_id)
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
    ab_service: TemplateABTestingService = Depends(get_template_ab_testing_service),
) -> Dict[str, Any]:
    """Pouce haut/bas/none sur une génération (ne change pas le gagnant)."""
    try:
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
    """Relance un test lié au parent (snapshots templates actuels)."""
    try:
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


@router.get("/{template_id}/shares", response_model=List[TemplateShareResponse])
def list_template_shares(
    template_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    template_service: TemplateService = Depends(get_template_service),
    sharing_service: TemplateSharingService = Depends(get_template_sharing_service),
) -> List[TemplateShareResponse]:
    """Liste les destinataires d'un template (owner/admin)."""
    try:
        shares = sharing_service.list_shares(template_service, template_id, current_user)
    except (
        TemplateShareValidationError,
        TemplateShareForbiddenError,
        TemplateShareNotFoundError,
        FileNotFoundError,
    ) as exc:
        raise _http_from_share_exc(exc) from exc
    return [_share_to_response(share) for share in shares]


@router.post(
    "/{template_id}/shares",
    response_model=TemplateShareResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_template_share(
    template_id: str,
    body: TemplateShareCreateRequest,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    template_service: TemplateService = Depends(get_template_service),
    sharing_service: TemplateSharingService = Depends(get_template_sharing_service),
) -> TemplateShareResponse:
    """Invite un writer actif par username (pointeur live)."""
    try:
        username = body.normalized_username()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    try:
        share = sharing_service.grant_share(
            template_service,
            template_id,
            username,
            current_user,
        )
    except (
        TemplateShareValidationError,
        TemplateShareSelfShareError,
        TemplateShareConflictError,
        TemplateShareForbiddenError,
        TemplateShareNotFoundError,
        FileNotFoundError,
    ) as exc:
        raise _http_from_share_exc(exc) from exc
    logger.info("Template %s partagé avec %s", template_id, username)
    return _share_to_response(share)


@router.delete(
    "/{template_id}/shares/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_template_share(
    template_id: str,
    user_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    template_service: TemplateService = Depends(get_template_service),
    sharing_service: TemplateSharingService = Depends(get_template_sharing_service),
) -> None:
    """Révoque l'accès live d'un destinataire."""
    try:
        sharing_service.revoke_share(
            template_service,
            template_id,
            user_id,
            current_user,
        )
    except (
        TemplateShareValidationError,
        TemplateShareForbiddenError,
        TemplateShareNotFoundError,
        FileNotFoundError,
    ) as exc:
        raise _http_from_share_exc(exc) from exc
    logger.info("Partage template %s révoqué pour %s", template_id, user_id)


@router.post(
    "/{template_id}/copy",
    response_model=TemplateCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def copy_template(
    template_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    template_service: TemplateService = Depends(get_template_service),
    sharing_service: TemplateSharingService = Depends(get_template_sharing_service),
) -> TemplateCreateResponse:
    """Clone un template visible en custom owned par l'acteur."""
    try:
        copied, warnings = sharing_service.copy_template(
            template_service,
            template_id,
            current_user,
        )
    except (
        TemplateShareValidationError,
        TemplateShareForbiddenError,
        TemplateShareNotFoundError,
        FileNotFoundError,
    ) as exc:
        raise _http_from_share_exc(exc) from exc
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


@router.get("/{template_id}/validate", response_model=PresetValidationResult)
def validate_template(
    template_id: str,
    current_user: Annotated[dict[str, object], Depends(get_current_user)],
    template_service: TemplateService = Depends(get_template_service),
    sharing_service: TemplateSharingService = Depends(get_template_sharing_service),
) -> PresetValidationResult:
    """Valide les références GDD d'un template (sans muter le JSON).

    Raises:
        404: Template absent ou hors visibilité.
    """
    try:
        sharing_service.require_readable(
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
    except (TemplateShareNotFoundError, FileNotFoundError) as exc:
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
    sharing_service: TemplateSharingService = Depends(get_template_sharing_service),
) -> Template:
    """Charge un template par UUID s'il est visible.

    Raises:
        404: Template absent ou hors visibilité.
    """
    try:
        return sharing_service.require_readable(
            template_service.get_template(template_id),
            current_user,
        )
    except (TemplateShareNotFoundError, FileNotFoundError) as exc:
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
    sharing_service: TemplateSharingService = Depends(get_template_sharing_service),
) -> TemplateCreateResponse:
    """Met à jour un template (owner/admin, ou legacy).

    Returns:
        Template persisté avec ``warnings`` GDD.

    Raises:
        404: Template absent ou hors visibilité.
        403: Destinataire (lecture seule).
        500: Erreur disque.
    """
    try:
        sharing_service.require_writable(
            template_service.get_template(template_id),
            current_user,
        )
        template, warnings = template_service.update_template(
            template_id,
            update_data.model_dump(exclude_none=True),
        )
        annotated = sharing_service.annotate(template, current_user)
        logger.info("Template mis à jour: %s (ID: %s)", template.name, template.id)
        return TemplateCreateResponse(
            **annotated.model_dump(),
            warnings=warnings,
        )
    except TemplateShareForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except (TemplateShareNotFoundError, FileNotFoundError) as exc:
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
    sharing_service: TemplateSharingService = Depends(get_template_sharing_service),
) -> None:
    """Supprime un template owned (cascade des partages).

    Raises:
        404: Template absent ou hors visibilité.
        403: Destinataire (lecture seule).
    """
    try:
        sharing_service.require_writable(
            template_service.get_template(template_id),
            current_user,
        )
        template_service.delete_template(template_id)
        sharing_service.delete_shares_for_template(template_id)
        logger.info("Template supprimé: %s", template_id)
    except TemplateShareForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(exc),
        ) from exc
    except (TemplateShareNotFoundError, FileNotFoundError) as exc:
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
