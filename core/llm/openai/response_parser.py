"""Parsing des réponses OpenAI Responses API."""

import json
import logging
from typing import List, Optional, Type, Union, Any, Tuple
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class OpenAIResponseParser:
    """Parse les réponses de l'API OpenAI Responses.
    
    Extrait le structured output (function calls) ou le texte simple
    depuis response.output.
    """

    @staticmethod
    def extract_structured_output(
        output_items: List[Any],
        response_model: Type[BaseModel],
        model_name: str,
        variant_index: int = 1,
    ) -> Tuple[Optional[BaseModel], Optional[str], bool]:
        """Extrait le structured output depuis response.output.
        
        Args:
            output_items: Liste des items dans response.output.
            response_model: Modèle Pydantic attendu.
            model_name: Nom du modèle (pour logging).
            variant_index: Index de la variante (pour logging).
            
        Returns:
            Tuple (parsed_output, error_message, success):
            - parsed_output: Instance du response_model si succès, None sinon
            - error_message: Message d'erreur si échec, None sinon
            - success: True si succès, False sinon
        """
        function_args_raw: Optional[str] = None
        function_name: Optional[str] = None
        
        # Chercher l'item avec type="function_call", "tool_call", ou "function"
        for item in output_items:
            item_type = getattr(item, "type", None)
            if item_type in ("function_call", "tool_call", "function"):
                name = getattr(item, "name", None)
                args = getattr(item, "arguments", None)
                
                # Certains SDK encapsulent sous item.function
                if name is None and getattr(item, "function", None) is not None:
                    name = getattr(item.function, "name", None)
                    args = getattr(item.function, "arguments", None)
                
                if name:
                    function_name = name
                
                if name == "generate_interaction" and args:
                    function_args_raw = args
                    break
        
        if function_args_raw:
            logger.debug(
                f"Arguments bruts de la fonction reçus (Responses API): {function_args_raw}"
            )
            try:
                # Normaliser node.consequences si c'est une liste (comme pour Mistral)
                # Certains modèles OpenAI (ex: gpt-5-mini) retournent parfois une liste au lieu d'un objet
                normalized_ok = False
                try:
                    if isinstance(function_args_raw, str):
                        raw_obj = json.loads(function_args_raw)
                        # Cas observé: node.consequences renvoyé comme liste d'objets
                        # alors que le schéma attend un objet unique.
                        if getattr(response_model, "__name__", "") == "UnityDialogueGenerationResponse":
                            node = raw_obj.get("node")
                            if isinstance(node, dict):
                                cons = node.get("consequences")
                                if isinstance(cons, list) and len(cons) == 1 and isinstance(cons[0], dict):
                                    node["consequences"] = cons[0]
                                    parsed_output = response_model.model_validate(raw_obj)
                                    logger.info(
                                        f"Variante {variant_index} validée après normalisation "
                                        f"(node.consequences list->object, Responses API)."
                                    )
                                    normalized_ok = True
                                    return parsed_output, None, True
                                elif isinstance(cons, list) and len(cons) > 0:
                                    # Si plusieurs éléments, prendre le premier
                                    node["consequences"] = cons[0]
                                    parsed_output = response_model.model_validate(raw_obj)
                                    logger.info(
                                        f"Variante {variant_index} validée après normalisation "
                                        f"(node.consequences list[{len(cons)}]->object, premier élément, Responses API)."
                                    )
                                    normalized_ok = True
                                    return parsed_output, None, True
                except Exception as norm_error:
                    logger.debug(f"Tentative de normalisation échouée: {norm_error}")
                    normalized_ok = False
                
                # Si normalisation n'a pas réussi, essayer validation directe
                if not normalized_ok:
                    parsed_output = response_model.model_validate_json(function_args_raw)
                    logger.info(
                        f"Variante {variant_index} générée et validée avec succès "
                        f"(structured, Responses API)."
                    )
                    return parsed_output, None, True
            except Exception as e:
                logger.error(
                    f"Erreur de validation Pydantic pour la variante {variant_index} "
                    f"(Responses API): {e}"
                )
                logger.error(
                    f"Données JSON qui ont échoué à la validation (Responses API): "
                    f"{function_args_raw}"
                )
                error_message = f"Validation error: {e}"
                return None, error_message, False
        else:
            # Cas critique: response_model requis mais aucun tool call trouvé
            text_output = None
            for item in output_items:
                if getattr(item, "type", None) == "text":
                    text_output = getattr(item, "text", None) or getattr(item, "content", None)
                    break
            
            text_preview = (text_output or "")[:500] if text_output else ""
            error_msg = (
                f"Le modèle {model_name} n'a pas retourné de structured output "
                f"(function_call) alors qu'un response_model était requis (Responses API). "
                f"Outil appelé: {function_name}. "
                f"Réponse texte (premiers 500 caractères): {text_preview}"
            )
            logger.error(error_msg)
            return None, "Structured output not received from Responses API", False

    @staticmethod
    def extract_text_output(
        output_items: List[Any],
        variant_index: int = 1,
    ) -> Tuple[Optional[str], Optional[str], bool]:
        """Extrait le texte simple depuis response.output.
        
        Args:
            output_items: Liste des items dans response.output.
            variant_index: Index de la variante (pour logging).
            
        Returns:
            Tuple (text_output, error_message, success):
            - text_output: Texte extrait si succès, None sinon
            - error_message: Message d'erreur si échec, None sinon
            - success: True si succès, False sinon
        """
        # Chercher l'item avec type="text"
        for item in output_items:
            if getattr(item, "type", None) == "text":
                text_output = getattr(item, "text", None) or getattr(item, "content", None)
                if text_output:
                    text_output = str(text_output).strip()
                    if text_output:
                        logger.info(
                            f"Variante {variant_index} générée avec succès "
                            f"(texte simple, Responses API)."
                        )
                        return text_output, None, True
        
        # Fallback: essayer output_text directement sur la réponse
        # (certaines versions du SDK peuvent exposer cela)
        error_msg = f"Réponse vide ou inattendue pour la variante {variant_index} (Responses API)"
        return None, error_msg, False

    @staticmethod
    def parse_response(
        response: Any,
        response_model: Optional[Type[BaseModel]],
        model_name: str,
        variant_index: int = 1,
    ) -> Tuple[Optional[Union[BaseModel, str]], Optional[str], bool]:
        """Parse une réponse Responses API.
        
        Args:
            response: Réponse de l'API OpenAI Responses.
            response_model: Modèle Pydantic attendu (optionnel).
            model_name: Nom du modèle (pour logging).
            variant_index: Index de la variante (pour logging).
            
        Returns:
            Tuple (parsed_output, error_message, success):
            - parsed_output: Instance du response_model ou texte si succès, None sinon
            - error_message: Message d'erreur si échec, None sinon
            - success: True si succès, False sinon
        """
        output_items = getattr(response, "output", None) or []
        
        # Debug: types d'items output
        output_types = [getattr(it, "type", None) for it in output_items]
        logger.debug(f"Types d'items dans output: {output_types}")
        
        if response_model:
            # Structured output attendu
            parsed_output, error_message, success = (
                OpenAIResponseParser.extract_structured_output(
                    output_items, response_model, model_name, variant_index
                )
            )
            return parsed_output, error_message, success
        else:
            # Texte simple attendu
            text_output, error_message, success = OpenAIResponseParser.extract_text_output(
                output_items, variant_index
            )
            return text_output, error_message, success
