"""Point de coupure du cache de prompt OpenAI entre partie stable et consigne de la scène.

GPT-5.6 et suivants placent seuls un point de cache à la fin du dernier message. Nos
prompts tiennent en un message qui finit par ``<scene_instructions>`` (historique du chemin,
consigne du nœud), différent à chaque appel : chaque génération écrivait donc tout le
prompt en cache (facturé 1,25 × le prix d'entrée) sans jamais le relire. Mesuré le
2026-11-19 sur gpt-5.6-sol, prompt de 36 736 tokens : sans coupure, 36 733 tokens écrits
à chaque appel ; avec une coupure explicite avant ``<scene_instructions>``, le second
appel relit 36 295 tokens (0,1 × le prix d'entrée) et n'en écrit que 442.

Doc : developers.openai.com/api/docs/guides/prompt-caching (« A shared prefix is not
always a cached prefix »).
"""
from __future__ import annotations

from typing import Any, Dict

from constants import ModelNames

# Début de la partie propre à chaque appel ; tout ce qui précède est commun aux nœuds
# d'un même dialogue (contrat, catalogues, contexte GDD).
SCENE_INSTRUCTIONS_TAG = "<scene_instructions>"


def build_user_message(prompt: str, model_name: str) -> Dict[str, Any]:
    """Message utilisateur Responses API, coupé pour le cache quand le modèle le permet.

    Args:
        prompt: Prompt complet (XML) construit par ``PromptEngine``.
        model_name: Identifiant du modèle appelé.

    Returns:
        ``{"role": "user", "content": prompt}`` inchangé si le modèle ne gère pas les
        points de coupure explicites ou si le prompt n'a pas de consigne de scène ; sinon
        deux blocs de texte dont le premier porte ``prompt_cache_breakpoint``.
    """
    cut = prompt.rfind(SCENE_INSTRUCTIONS_TAG)
    if model_name not in ModelNames.MODELS_WITH_EXPLICIT_CACHE_BREAKPOINTS or cut <= 0:
        return {"role": "user", "content": prompt}
    return {
        "role": "user",
        "content": [
            {
                "type": "input_text",
                "text": prompt[:cut],
                "prompt_cache_breakpoint": {"mode": "explicit"},
            },
            {"type": "input_text", "text": prompt[cut:]},
        ],
    }
