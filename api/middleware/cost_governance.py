"""Middleware pour la gouvernance des coûts LLM."""
import logging
import time
from typing import Callable

from fastapi import Request, Response, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from services.cost_governance_service import CostGovernanceService
from services.llm_pricing_service import LLMPricingService
from api.dependencies import get_cost_budget_repository
from constants import ModelNames, Defaults

logger = logging.getLogger(__name__)

# User ID par défaut (V1.0: pas d'authentification, utilisateur unique)
DEFAULT_USER_ID = "default_user"

# Endpoints à intercepter pour vérification budget
GENERATION_ENDPOINTS = [
    "/api/v1/dialogues/generate/unity-dialogue",
    "/api/v1/dialogues/generate/variants",
    "/api/v1/graph/generate-node",
    "/api/v1/dialogues/generate/jobs",  # Streaming generation
]

# Estimation par défaut des tokens (si non disponibles dans la requête)
DEFAULT_PROMPT_TOKENS = 5000  # Estimation conservatrice
DEFAULT_COMPLETION_TOKENS = 1000  # Estimation conservatrice


class CostGovernanceMiddleware(BaseHTTPMiddleware):
    """Middleware pour vérifier le budget avant génération LLM.

    Intercepte les requêtes POST vers les endpoints de génération,
    estime le coût, vérifie le budget, et bloque si nécessaire.

    Les objets ``CostGovernanceService`` et ``FileCostBudgetRepository`` sont
    des singletons au niveau du middleware pour éviter leur recréation à chaque
    requête. ``FileCostBudgetRepository`` est thread-safe (verrou interne).
    """

    def __init__(self, app):
        """Initialise le middleware.

        Args:
            app: L'application ASGI.
        """
        super().__init__(app)
        self.pricing_service = LLMPricingService()
        # Singletons: évite de recréer repository + service à chaque requête.
        self._repository = get_cost_budget_repository()
        self._cost_service = CostGovernanceService(repository=self._repository)

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
        if not any(path.startswith(endpoint) for endpoint in GENERATION_ENDPOINTS):
            return await call_next(request)

        try:
            # Estimer le coût
            estimated_cost = await self._estimate_cost(request)

            # Vérifier le budget via le service singleton
            budget_check = self._cost_service.check_budget(
                user_id=DEFAULT_USER_ID,
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
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "error": {
                        "code": "BUDGET_CHECK_ERROR",
                        "message": "Erreur lors de la vérification du budget. La génération a été bloquée pour protéger votre budget.",
                        "details": {"error": str(e)}
                    }
                }
            )
        except Exception as e:
            # Erreur inattendue: fail-safe en bloquant la génération
            logger.error(f"Erreur inattendue dans CostGovernanceMiddleware: {e}", exc_info=True)
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "error": {
                        "code": "BUDGET_CHECK_ERROR",
                        "message": "Erreur lors de la vérification du budget. La génération a été bloquée pour protéger votre budget.",
                        "details": {"error": str(e)}
                    }
                }
            )

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
        # Essayer d'extraire le modèle depuis les query params
        model_name = request.query_params.get("model") or request.query_params.get("llm_model")
        if not model_name:
            model_name = Defaults.MODEL_ID

        # Estimation selon le type d'endpoint
        path = request.url.path
        if "/generate/variants" in path:
            # Génération de variantes: tokens plus élevés (multiples réponses)
            prompt_tokens = DEFAULT_PROMPT_TOKENS
            completion_tokens = DEFAULT_COMPLETION_TOKENS * 2  # Estimation conservatrice pour variantes
        elif "/generate/jobs" in path:
            # Streaming generation: tokens similaires mais traitement spécial
            prompt_tokens = DEFAULT_PROMPT_TOKENS
            completion_tokens = DEFAULT_COMPLETION_TOKENS * 1.5
        else:
            # Génération standard (unity-dialogue, generate-node)
            prompt_tokens = DEFAULT_PROMPT_TOKENS
            completion_tokens = DEFAULT_COMPLETION_TOKENS

        return self.pricing_service.calculate_cost(
            model_name=model_name,
            prompt_tokens=prompt_tokens,
            completion_tokens=completion_tokens
        )
