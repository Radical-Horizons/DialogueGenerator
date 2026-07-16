"""Construction des paramètres pour l'API OpenAI Responses."""

import json
import logging
from typing import Dict, Any, List, Optional, Type
from pydantic import BaseModel
from openai import NOT_GIVEN

try:
    from openai._types import NotGiven  # type: ignore
except Exception:  # pragma: no cover
    class NotGiven:  # type: ignore
        """Fallback type used when openai._types.NotGiven is unavailable."""
        pass

from constants import ModelNames

logger = logging.getLogger(__name__)


class OpenAIParameterBuilder:
    """Construit les paramètres pour l'API OpenAI Responses.
    
    Gère la construction des tool definitions (structured output),
    la validation et l'adaptation des paramètres selon le modèle
    (reasoning, temperature, tokens).
    """

    @staticmethod
    def _enforce_strict_schema(schema: Any) -> Any:
        """Normalise récursivement un JSON Schema pour le mode strict d'OpenAI.

        Règles strictes (``strict: true``, doc OpenAI Structured Outputs) :

        1. **additionalProperties** doit être ``false`` sur chaque objet.
        2. **required** doit lister **toutes** les clés de ``properties``
           (les champs optionnels utilisent ``anyOf: [..., {type: "null"}]``
           avec ``default: null``).
        3. Un nœud contenant ``$ref`` ne peut porter **aucune** autre clé
           (Pydantic v2 ajoute souvent ``description`` à côté de ``$ref``).
           On déplace le ``$ref`` dans un ``allOf: [{$ref: ...}]`` et on
           conserve les clés annexes.
        """
        if isinstance(schema, dict):
            # --- Règle 3 : $ref ne doit avoir aucune clé sœur ---
            # Pydantic v2 ajoute souvent "description", "title", "default" à côté
            # de $ref.  OpenAI strict mode rejette toute clé annexe.
            # Solution : on ne conserve que $ref (la description est déjà dans
            # la définition référencée dans $defs).
            if "$ref" in schema and len(schema) > 1:
                ref_value = schema["$ref"]
                schema.clear()
                schema["$ref"] = ref_value
                return schema  # rien d'autre à traiter

            # --- Règle 1 & 2 : objets ---
            if schema.get("type") == "object":
                schema["additionalProperties"] = False
                props = schema.get("properties")
                if isinstance(props, dict) and props:
                    schema["required"] = sorted(props.keys())

            # --- Descente récursive ---
            for key in list(schema.keys()):
                schema[key] = OpenAIParameterBuilder._enforce_strict_schema(schema[key])
            return schema

        if isinstance(schema, list):
            return [OpenAIParameterBuilder._enforce_strict_schema(item) for item in schema]

        return schema

    @staticmethod
    def build_tool_definition(response_model: Type[BaseModel]) -> Optional[Dict[str, Any]]:
        """Construit la définition du tool pour Responses API.
        
        Args:
            response_model: Modèle Pydantic pour le structured output.
            
        Returns:
            Dictionnaire avec la définition du tool pour Responses API, ou None si pas de response_model.
        """
        if not response_model:
            return None
        
        model_schema_for_tool = response_model.model_json_schema()

        # Normaliser le schéma pour le mode strict OpenAI (additionalProperties + required)
        model_schema_for_tool = OpenAIParameterBuilder._enforce_strict_schema(
            model_schema_for_tool
        )
        
        tool_definition_responses = {
            "type": "function",
            "name": "generate_interaction",
            "description": "Génère une interaction de dialogue structurée.",
            "parameters": model_schema_for_tool,
            # Mode strict (doc OpenAI) : force l'adhérence au schéma dans les arguments du tool.
            "strict": True,
        }
        
        logger.debug(
            f"Schéma de la fonction 'generate_interaction' envoyé à OpenAI: \n"
            f"{json.dumps(model_schema_for_tool, indent=2, ensure_ascii=False)}"
        )
        
        return tool_definition_responses

    @staticmethod
    def build_tool_choice(tool_name: str = "generate_interaction") -> Dict[str, Any]:
        """Construit le tool_choice pour forcer l'appel du tool.
        
        Args:
            tool_name: Nom du tool à forcer.
            
        Returns:
            Dictionnaire avec la configuration tool_choice pour Responses API.
        """
        return {
            "type": "allowed_tools",
            "mode": "required",
            "tools": [{"type": "function", "name": tool_name}],
        }

    @staticmethod
    def build_reasoning_config(
        model_name: str,
        reasoning_effort: Optional[str],
        reasoning_summary: Optional[str],
    ) -> Dict[str, Any]:
        """Construit la configuration du reasoning selon le modèle.
        
        Args:
            model_name: Nom du modèle (ex: "gpt-5.6-sol", "gpt-5.6-luna").
            reasoning_effort: Niveau d'effort (none, minimal, low, medium, high, xhigh, max).
            reasoning_summary: Format du résumé (None ou "auto" uniquement).
                Note: "detailed" n'est pas supporté car nécessite une organisation OpenAI vérifiée (Tier 2/3).
                Si "detailed" est fourni, il sera rejeté par la validation du schéma API.
            
        Returns:
            Dictionnaire avec la configuration reasoning, ou vide si pas de reasoning.
        """
        reasoning_config = {}
        
        if reasoning_effort is not None:
            # GPT-5.6 : none | low | medium | high | xhigh | max
            # « minimal » (legacy mini/nano) → low
            if reasoning_effort == "minimal":
                logger.info(
                    f"reasoning.effort='minimal' (legacy) pour {model_name} → 'low'."
                )
                reasoning_config["effort"] = "low"
            else:
                reasoning_config["effort"] = reasoning_effort
            
            # Activer automatiquement summary selon le modèle
            # IMPORTANT: Nous utilisons uniquement "auto" car "detailed" nécessite une organisation OpenAI vérifiée (Tier 2/3).
            # Si "detailed" est demandé, l'API peut l'ignorer silencieusement si l'organisation n'est pas vérifiée,
            # ce qui entraîne un échec silencieux ("Silent Failure") où aucun résumé n'est retourné.
            # "auto" est plus fiable et fonctionne pour toutes les organisations.
            if reasoning_summary is None:
                # Utiliser "auto" par défaut (recommandation OpenAI pour organisations non vérifiées)
                reasoning_config["summary"] = "auto"
            elif reasoning_summary == "auto":
                reasoning_config["summary"] = "auto"
            else:
                # Si une autre valeur est fournie (ne devrait pas arriver grâce à la validation du schéma),
                # on log un avertissement et on utilise "auto" par sécurité
                logger.warning(
                    f"reasoning_summary='{reasoning_summary}' non supporté pour {model_name}. "
                    f"Utilisation de 'auto' à la place (les résumés 'detailed' nécessitent une organisation OpenAI vérifiée)."
                )
                reasoning_config["summary"] = "auto"
        elif reasoning_summary is not None:
            # Si seulement summary est défini (sans effort)
            # Valider que c'est "auto" (seule valeur supportée)
            if reasoning_summary == "auto":
                reasoning_config["summary"] = "auto"
            else:
                logger.warning(
                    f"reasoning_summary='{reasoning_summary}' non supporté pour {model_name}. "
                    f"Utilisation de 'auto' à la place (les résumés 'detailed' nécessitent une organisation OpenAI vérifiée)."
                )
                reasoning_config["summary"] = "auto"
        
        if reasoning_config:
            logger.info(
                f"Utilisation de reasoning pour {model_name} (Responses API): "
                f"effort={reasoning_config.get('effort', 'None (default: medium)')}, "
                f"summary={reasoning_config.get('summary', 'None')}"
            )
        else:
            logger.debug(
                f"Reasoning non spécifié pour {model_name}, l'API utilisera 'medium' par défaut."
            )
        
        return reasoning_config

    @staticmethod
    def should_include_temperature(
        model_name: str,
        reasoning_config: Dict[str, Any],
        reasoning_effort: Optional[str],
    ) -> bool:
        """Détermine si la temperature doit être incluse dans les paramètres.

        Règles (doc OpenAI + preuve runtime) :

        - Famille GPT-5.6 : **jamais** (API 400 ``Unsupported parameter: temperature``).
        - Autres GPT-5 : uniquement si ``reasoning.effort`` est **explicitement** ``none``.
          ``None`` (omis) ≠ ``none`` : GPT-5.6 omet → défaut API ``medium``.
        
        Args:
            model_name: Nom du modèle.
            reasoning_config: Configuration du reasoning (peut être vide).
            reasoning_effort: Effort de reasoning original (avant adaptation).
            
        Returns:
            True si temperature doit être incluse, False sinon.
        """
        if ModelNames.is_gpt_5_6_family(model_name):
            logger.debug(
                f"Temperature omise pour {model_name} (GPT-5.6 : paramètre non supporté). "
                f"Utiliser reasoning.effort / text.verbosity."
            )
            return False

        if model_name in ModelNames.MODELS_WITHOUT_CUSTOM_TEMPERATURE:
            logger.debug(
                f"Le modèle {model_name} ne supporte pas le paramètre temperature. "
                f"Il sera omis de la requête API."
            )
            return False
        
        # Responses API: temperature uniquement si effort === "none" (explicite)
        effective_effort = (
            reasoning_config.get("effort") if reasoning_config else None
        )
        if effective_effort is None:
            effective_effort = reasoning_effort
        
        if effective_effort == "none":
            return True

        logger.debug(
            f"Temperature omise (Responses API) pour {model_name}: "
            f"effort={effective_effort!r} (requis: 'none' explicite; "
            f"omis → défaut medium côté API)."
        )
        return False

    @staticmethod
    def should_include_top_p(
        model_name: str,
        reasoning_config: Dict[str, Any],
        reasoning_effort: Optional[str],
    ) -> bool:
        """True si ``top_p`` peut être envoyé (mêmes contraintes que temperature)."""
        return OpenAIParameterBuilder.should_include_temperature(
            model_name, reasoning_config, reasoning_effort
        )

    @staticmethod
    def build_responses_params(
        model_name: str,
        messages: List[Dict[str, Any]],
        response_model: Optional[Type[BaseModel]],
        max_tokens: int,
        temperature: float,
        reasoning_effort: Optional[str],
        reasoning_summary: Optional[str],
            instructions: Optional[str] = None,
            top_p: Optional[float] = None,
            stream: bool = False,
    ) -> Dict[str, Any]:
        """Construit les paramètres complets pour Responses API.
        
        Args:
            model_name: Nom du modèle.
            messages: Liste des messages (user, assistant, etc.) - sans system message si instructions fourni.
            response_model: Modèle Pydantic pour structured output (optionnel).
            max_tokens: Nombre maximum de tokens de sortie.
            temperature: Température (0.0-2.0).
            reasoning_effort: Effort de reasoning (optionnel).
            reasoning_summary: Format du résumé reasoning (optionnel).
            instructions: Instructions système (system prompt) séparées de input (optionnel).
            top_p: Nucleus sampling (0.0-1.0). Alternative/complément à temperature (optionnel).
            stream: Si True, active le streaming natif (optionnel, défaut: False).
            Note: Responses API n'utilise pas stream_options (c'est pour Chat Completions API uniquement).
            
        Returns:
            Dictionnaire avec tous les paramètres pour Responses API.
        """
        # Paramètres de base
        responses_params: Dict[str, Any] = {
            "model": model_name,
            "input": messages,
        }
        
        # Instructions séparées (si fourni, utilise le paramètre instructions au lieu du system message dans input)
        if instructions is not None:
            responses_params["instructions"] = instructions
            logger.debug(f"Utilisation du paramètre 'instructions' séparé pour {model_name}")
        
        # Tool definition pour structured output
        tool_definition = OpenAIParameterBuilder.build_tool_definition(response_model)
        if tool_definition:
            responses_params["tools"] = [tool_definition]
            responses_params["tool_choice"] = OpenAIParameterBuilder.build_tool_choice()
            logger.info(f"Utilisation du structured output avec le modèle: {response_model.__name__}")
            logger.info(
                f"Configuration structured output pour {model_name}: "
                f"tool_definition présent, tool_choice forcé"
            )
        else:
            responses_params["tools"] = NOT_GIVEN
        
        # Max output tokens
        responses_params["max_output_tokens"] = max_tokens
        
        # Reasoning config
        reasoning_config = OpenAIParameterBuilder.build_reasoning_config(
            model_name, reasoning_effort, reasoning_summary
        )
        if reasoning_config:
            responses_params["reasoning"] = reasoning_config
        
        # Temperature (uniquement si compatible avec le modèle / reasoning)
        if OpenAIParameterBuilder.should_include_temperature(
            model_name, reasoning_config, reasoning_effort
        ):
            responses_params["temperature"] = temperature
        
        # Top_p — même gate que temperature (GPT-5.6 : non supporté)
        if top_p is not None:
            if not (0.0 <= top_p <= 1.0):
                logger.warning(
                    f"top_p={top_p} hors limites (0.0-1.0), sera ignoré pour {model_name}"
                )
            elif OpenAIParameterBuilder.should_include_top_p(
                model_name, reasoning_config, reasoning_effort
            ):
                responses_params["top_p"] = top_p
                logger.debug(f"Utilisation de top_p={top_p} pour {model_name}")
            else:
                logger.debug(
                    f"top_p omis pour {model_name} (même contrainte que temperature)."
                )
        
        # Streaming
        # Responses API : seul `stream=True` est nécessaire.
        # (`stream_options` n'existe que pour Chat Completions API)
        if stream:
            responses_params["stream"] = True
            logger.info(f"Streaming natif activé pour {model_name}")
        
        # Logger les paramètres (sans prompt complet) pour debug
        safe_params = {
            k: v
            for k, v in responses_params.items()
            if k not in ("input",) and not isinstance(v, NotGiven)
        }
        logger.info(
            f"Paramètres API (Responses) pour {model_name}: "
            f"{json.dumps(safe_params, indent=2, ensure_ascii=False, default=str)}"
        )
        
        return responses_params
