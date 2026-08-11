"""Middleware pour la gouvernance des coûts LLM."""
import logging
import os
from typing import Callable, Optional

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from services.cost_governance_service import CostGovernanceService
from services.llm_pricing_service import LLMPricingService
from api.dependencies import get_cost_budget_repository
from constants import Defaults

from api.middleware.billable_user_context import get_billable_user_id

logger = logging.getLogger(__name__)

# Endpoints à intercepter pour vérification budget
GENERATION_ENDPOINTS = [
    "/api/v1/dialogues/generate/unity-dialogue",
    "/api/v1/dialogues/generate/variants",
    "/api/v1/unity-dialogues/graph/generate-node",
    "/api/v1/unity-dialogues/graph/batch-generate-from-nodes/jobs",
    "/api/v1/dialogues/generate/jobs",  # Streaming generation
]

# Estimation par défaut des tokens (si non disponibles dans la requête)
DEFAULT_PROMPT_TOKENS = 5000  # Estimation conservatrice
DEFAULT_COMPLETION_TOKENS = 1000  # Estimation conservatrice

# Plafond anti-abus pour les en-têtes d'estimation client (POST body illisible en middleware)
_MAX_HEADER_TOKEN_ESTIMATE = 2_000_000
_MAX_BATCH_PARENT_COUNT = 100
_DEFAULT_BATCH_PARENT_COUNT = 10  # seuil job FR88

_HEADER_PROMPT = "x-estimated-prompt-tokens"
_HEADER_COMPLETION = "x-estimated-completion-tokens"
_HEADER_LLM_MODEL = "x-llm-model"
_HEADER_BATCH_PARENT_COUNT = "x-batch-parent-count"


def _parse_positive_int_header(request: Request, header_name: str) -> Optional[int]:
    """Lit un entier positif borné depuis les en-têtes (clés ASGI en minuscules)."""
    raw = request.headers.get(header_name)
    if raw is None:
        return None
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return None
    if value <= 0 or value > _MAX_HEADER_TOKEN_ESTIMATE:
        return None
    return value


def _is_cost_governed_generation_path(path: str) -> bool:
    """True si le POST doit passer le contrôle budget (exclut /cancel)."""
    normalized = path.rstrip("/") or path
    if normalized.endswith("/cancel"):
        return False
    return any(
        normalized == endpoint.rstrip("/") or normalized.startswith(endpoint)
        for endpoint in GENERATION_ENDPOINTS
    )


def _batch_parent_count_for_estimate(request: Request) -> int:
    """Nombre de parents pour multiplier l'estimation batch-generate.

    ⚠️ Best-effort seulement : le body POST n'est pas lisible en middleware
    (stream à consommation unique), donc ce compte vient d'un header client
    auto-déclaré et non vérifié. Ce n'est PAS le contrôle budgétaire qui fait
    autorité pour ``/batch-generate-from-nodes/jobs`` — celui-ci vit dans le
    router (``_check_batch_budget_or_raise`` dans
    ``api/routers/graph_generation.py``), qui utilise le N réel du body
    désérialisé. Ce pré-check middleware n'est qu'un filtre rapide.
    """
    raw = request.headers.get(_HEADER_BATCH_PARENT_COUNT)
    if raw is not None:
        try:
            value = int(str(raw).strip())
        except (TypeError, ValueError):
            value = _DEFAULT_BATCH_PARENT_COUNT
        else:
            if value <= 0:
                value = _DEFAULT_BATCH_PARENT_COUNT
            value = min(value, _MAX_BATCH_PARENT_COUNT)
            return value
    return _DEFAULT_BATCH_PARENT_COUNT


class CostGovernanceMiddleware(BaseHTTPMiddleware):
    """Middleware pour vérifier le budget avant génération LLM.
    
    Intercepte les requêtes POST vers les endpoints de génération,
    estime le coût, vérifie le budget, et bloque si nécessaire.
    """
    
    def __init__(self, app):
        """Initialise le middleware.
        
        Args:
            app: L'application ASGI.
        """
        super().__init__(app)
        self.pricing_service = LLMPricingService()
        # Le service sera créé à chaque requête via dependency injection
        # pour éviter les problèmes de cycle de vie
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Vérifie le budget avant génération.
        
        Args:
            request: La requête HTTP.
            call_next: La fonction suivante dans la chaîne middleware.
            
        Returns:
            La réponse HTTP (429 si budget dépassé, sinon réponse normale).
        """
        # Vérifier si c'est une requête POST vers un endpoint de génération
        if request.method != "POST":
            return await call_next(request)
        
        path = request.url.path
        if not _is_cost_governed_generation_path(path):
            return await call_next(request)
        
        try:
            # Créer le service de cost governance
            repository = get_cost_budget_repository()
            cost_service = CostGovernanceService(repository=repository)
            
            # Estimer le coût
            estimated_cost = await self._estimate_cost(request)
            
            # Vérifier le budget
            budget_check = cost_service.check_budget(
                user_id=get_billable_user_id(),
                estimated_cost=estimated_cost
            )
            
            # Si bloqué, retourner HTTP 429
            if not budget_check["allowed"]:
                logger.warning(
                    f"Génération bloquée pour {path}: budget dépassé ({budget_check['percentage']:.1f}%)"
                )
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={
                        "error": {
                            "code": "QUOTA_EXCEEDED",
                            "message": budget_check.get("warning", "Monthly quota reached"),
                            "details": {
                                "percentage": budget_check["percentage"],
                                "estimated_cost": estimated_cost
                            }
                        }
                    }
                )
            
            # Si warning (90%), logger mais continuer
            if budget_check.get("warning"):
                logger.warning(
                    f"Budget warning pour {path}: {budget_check['warning']} "
                    f"({budget_check['percentage']:.1f}%)"
                )
            
            # Continuer avec la requête
            return await call_next(request)
            
        except FileNotFoundError as e:
            # Fichier de budget n'existe pas encore (première utilisation)
            # Autoriser la génération et laisser le système créer le budget
            logger.debug(f"Fichier de budget non trouvé (première utilisation): {e}")
            return await call_next(request)
        except (ValueError, KeyError, TypeError) as e:
            # Erreurs de données (JSON invalide, clés manquantes, etc.)
            # Fail-safe: bloquer la génération pour protéger le budget
            logger.error(f"Erreur de données dans CostGovernanceMiddleware: {e}", exc_info=True)
            _prod = os.getenv("ENVIRONMENT", "development") == "production"
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "error": {
                        "code": "BUDGET_CHECK_ERROR",
                        "message": "Erreur lors de la vérification du budget. La génération a été bloquée pour protéger votre budget.",
                        "details": {} if _prod else {"error": str(e)},
                    }
                }
            )
        except Exception as e:
            # Erreur inattendue: fail-safe en bloquant la génération
            logger.error(f"Erreur inattendue dans CostGovernanceMiddleware: {e}", exc_info=True)
            _prod = os.getenv("ENVIRONMENT", "development") == "production"
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "error": {
                        "code": "BUDGET_CHECK_ERROR",
                        "message": "Erreur lors de la vérification du budget. La génération a été bloquée pour protéger votre budget.",
                        "details": {} if _prod else {"error": str(e)},
                    }
                }
            )
    
    def _resolve_model_for_cost_estimate(self, request: Request) -> str:
        """Détermine l'identifiant modèle pour le tarif (body illisible ici).

        Priorité : en-tête ``X-LLM-Model`` si présent **et** présent dans
        ``llm_pricing.json``, sinon query ``model`` / ``llm_model``, sinon défaut.

        Args:
            request: Requête entrante.

        Returns:
            Identifiant modèle passé à ``calculate_cost``.
        """
        raw = request.headers.get(_HEADER_LLM_MODEL)
        if raw is not None:
            mid = str(raw).strip()
            if mid and self.pricing_service.get_model_pricing(mid) is not None:
                return mid
            logger.debug(
                "En-tête %s ignoré (vide ou modèle absent de la grille tarifaire): %r",
                _HEADER_LLM_MODEL,
                raw,
            )
        q = request.query_params.get("model") or request.query_params.get("llm_model")
        if q:
            return str(q).strip()
        return Defaults.MODEL_ID

    async def _estimate_cost(self, request: Request) -> float:
        """Estime le coût d'une génération basé sur la requête.
        
        NOTE: Le body de la requête FastAPI ne peut pas être lu en middleware
        car il est un stream consommable une seule fois. On utilise donc:
        1. Query parameters pour le modèle (si disponible)
        2. Endpoint-specific defaults (plus précis selon le type de génération)
        3. Valeurs par défaut conservatrices (fallback)
        
        Args:
            request: La requête HTTP.
            
        Returns:
            Coût estimé en USD (estimation conservatrice).
        """
        model_name = self._resolve_model_for_cost_estimate(request)
        
        # Estimation selon le type d'endpoint
        path = request.url.path
        if "/generate/variants" in path:
            # Génération de variantes: tokens plus élevés (multiples réponses)
            prompt_tokens = DEFAULT_PROMPT_TOKENS
            completion_tokens = DEFAULT_COMPLETION_TOKENS * 2  # Estimation conservatrice pour variantes
        elif "/batch-generate-from-nodes/jobs" in path:
            # Multi-parents FR88 : multiplier par N (header X-Batch-Parent-Count)
            batch_count = _batch_parent_count_for_estimate(request)
            prompt_tokens = DEFAULT_PROMPT_TOKENS * batch_count
            completion_tokens = DEFAULT_COMPLETION_TOKENS * batch_count
        elif "/generate/jobs" in path:
            # Streaming generation: tokens similaires mais traitement spécial
            prompt_tokens = DEFAULT_PROMPT_TOKENS
            completion_tokens = int(DEFAULT_COMPLETION_TOKENS * 1.5)
        else:
            # Génération standard (unity-dialogue, generate-node)
            prompt_tokens = DEFAULT_PROMPT_TOKENS
            completion_tokens = DEFAULT_COMPLETION_TOKENS

        # Headers d'estimation client : remplacent le total (agrégé côté client si batch).
        hdr_pt = _parse_positive_int_header(request, _HEADER_PROMPT)
        hdr_ct = _parse_positive_int_header(request, _HEADER_COMPLETION)
        if hdr_pt is not None:
            prompt_tokens = hdr_pt
        if hdr_ct is not None:
            completion_tokens = hdr_ct

        return self.pricing_service.calculate_cost(
            model_name=model_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens
        )
