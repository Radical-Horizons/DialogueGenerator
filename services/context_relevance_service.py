"""Service métier pour le calcul de pertinence contexte / génération (Story 3.6).

Délègue au module de scoring pur pour faciliter les tests et l’injection.
"""
from __future__ import annotations

from typing import Any, Dict

from services.context_relevance_scoring import compute_context_relevance_result


class ContextRelevanceService:
    """Calcule un rapport de pertinence à partir du prompt et de la réponse stockés."""

    def compute_result(
        self,
        stored_prompt: str,
        stored_response: str,
        *,
        request_id: str | None = None,
    ) -> Dict[str, Any]:
        """Retourne le dict de pertinence sérialisable (JSON).

        Args:
            stored_prompt: Prompt tel que persisté (Story 1.15).
            stored_response: Réponse brute persistée.
            request_id: Identifiant de requête à inclure dans le rapport (optionnel).

        Returns:
            Rapport avec score, breakdown, seuils et métadonnées.
        """
        return compute_context_relevance_result(
            stored_prompt, stored_response, request_id=request_id
        )
