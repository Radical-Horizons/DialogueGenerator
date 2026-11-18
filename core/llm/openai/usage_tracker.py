"""Extraction des métriques d'utilisation depuis les réponses OpenAI Responses API."""

import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)


class OpenAIUsageTracker:
    """Extrait et normalise les métriques d'utilisation depuis les réponses OpenAI.
    
    Les réponses Responses API utilisent `input_tokens` et `output_tokens`,
    tandis que Chat Completions (legacy) utilise `prompt_tokens` et `completion_tokens`.
    Cette classe normalise tout en `prompt_tokens`, `completion_tokens`, `total_tokens`.
    """

    @staticmethod
    def extract_usage_metrics(response: Any) -> Dict[str, int]:
        """Extrait les métriques d'utilisation depuis une réponse OpenAI.
        
        Args:
            response: Réponse de l'API OpenAI (Responses API ou Chat Completions).
            
        Returns:
            Dictionnaire avec les clés:
            - prompt_tokens: Tokens d'entrée (input/prompt)
            - completion_tokens: Tokens de sortie (output/completion)
            - total_tokens: Total des tokens
            - cached_tokens: Tokens d'entrée relus depuis le cache (inclus dans prompt_tokens)
            - cache_write_tokens: Tokens d'entrée écrits en cache (inclus dans prompt_tokens)
        """
        prompt_tokens = 0
        completion_tokens = 0
        total_tokens = 0
        cached_tokens = 0
        cache_write_tokens = 0

        if hasattr(response, 'usage') and response.usage:
            # Responses API utilise input_tokens et output_tokens
            if hasattr(response.usage, "input_tokens"):
                prompt_tokens = getattr(response.usage, "input_tokens", 0) or 0
                completion_tokens = getattr(response.usage, "output_tokens", 0) or 0
                total_tokens = prompt_tokens + completion_tokens
                details = getattr(response.usage, "input_tokens_details", None)
                cached_tokens = OpenAIUsageTracker._int_field(details, "cached_tokens")
                cache_write_tokens = OpenAIUsageTracker._int_field(details, "cache_write_tokens")
            # Chat Completions (legacy) utilise prompt_tokens et completion_tokens
            elif hasattr(response.usage, "prompt_tokens"):
                prompt_tokens = response.usage.prompt_tokens or 0
                completion_tokens = response.usage.completion_tokens or 0
                total_tokens = response.usage.total_tokens or 0
        
        return {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "cached_tokens": cached_tokens,
            "cache_write_tokens": cache_write_tokens,
        }

    @staticmethod
    def _int_field(details: Any, name: str) -> int:
        """Entier ``name`` d'un objet de détail d'usage (attribut ou clé), 0 si absent."""
        if details is None:
            return 0
        value = details.get(name) if isinstance(details, dict) else getattr(details, name, None)
        try:
            return int(value or 0)
        except (TypeError, ValueError):
            return 0
