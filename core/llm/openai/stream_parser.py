"""Parser pour les événements streaming de l'API OpenAI Responses."""

import json
import logging
from typing import Dict, Any, Optional, Callable, Coroutine, AsyncIterator
from enum import Enum

logger = logging.getLogger(__name__)


class StreamEventType(str, Enum):
    """Types d'événements streaming de Responses API."""
    # Response envelope events
    RESPONSE_CREATED = "response.created"
    RESPONSE_IN_PROGRESS = "response.in_progress"
    RESPONSE_COMPLETED = "response.completed"
    RESPONSE_FAILED = "response.failed"
    RESPONSE_INCOMPLETE = "response.incomplete"
    
    # Content events
    OUTPUT_ITEM_ADDED = "response.output_item.added"
    CONTENT_PART_ADDED = "response.content_part.added"
    OUTPUT_TEXT_DELTA = "response.output_text.delta"
    OUTPUT_TEXT_DONE = "response.output_text.done"
    
    # Function call events (structured output)
    FUNCTION_CALL_ARGUMENTS_DELTA = "response.function_call_arguments.delta"
    FUNCTION_CALL_ARGUMENTS_DONE = "response.function_call_arguments.done"
    
    # Reasoning events
    REASONING_DELTA = "response.reasoning.delta"
    REASONING_DONE = "response.reasoning.done"
    REASONING_TEXT_DELTA = "response.reasoning_text.delta"
    REASONING_TEXT_DONE = "response.reasoning_text.done"
    # Reasoning summary events (pour thinking summary GPT-5)
    REASONING_SUMMARY_TEXT_DELTA = "response.reasoning_summary_text.delta"
    REASONING_SUMMARY_TEXT_DONE = "response.reasoning_summary_text.done"
    REASONING_SUMMARY_PART_ADDED = "response.reasoning_summary_part.added"
    
    # Error events
    ERROR = "error"


class StreamChunk:
    """Représente un chunk de streaming avec son type et ses données."""
    
    def __init__(self, event_type: str, data: Dict[str, Any], sequence: Optional[int] = None):
        """Initialise un chunk de streaming.
        
        Args:
            event_type: Type d'événement (ex: "response.output_text.delta").
            data: Données de l'événement.
            sequence: Numéro de séquence (optionnel).
        """
        self.event_type = event_type
        self.data = data
        self.sequence = sequence


class OpenAIStreamParser:
    """Parse les événements streaming de Responses API.
    
    Accumule les chunks pour les function calls (structured output) et le reasoning,
    et yielder les chunks au fur et à mesure pour un feedback temps réel.
    """
    
    def __init__(
        self,
        reasoning_callback: Optional[Callable[[Dict[str, Any]], Coroutine[Any, Any, None]]] = None,
    ):
        """Initialise le parser de streaming.
        
        Args:
            reasoning_callback: Callback optionnel pour notifier les chunks de reasoning.
        """
        self.reasoning_callback = reasoning_callback
        self.function_call_buffer: Dict[str, str] = {}  # call_id -> accumulated arguments
        self.reasoning_buffer: Dict[str, str] = {}  # item_id -> accumulated content
        self.completed_response: Optional[Dict[str, Any]] = None
    
    async def parse_stream(
        self,
        stream: AsyncIterator[Any]
    ) -> AsyncIterator[StreamChunk]:
        """Parse un stream d'événements Responses API.
        
        Args:
            stream: Stream async d'événements depuis client.responses.create(stream=True).
            
        Yields:
            StreamChunk avec le type d'événement et les données.
        """
        async for event in stream:
            try:
                # Le SDK OpenAI Responses API retourne des événements avec un champ 'type'
                # et des données selon le type d'événement
                event_type = getattr(event, "type", None)
                
                if not event_type:
                    logger.debug(f"Événement sans type, structure: {dir(event)}")
                    continue
                
                # Extraire les données selon le type d'événement
                # Les événements ont généralement des attributs directs (delta, item_id, etc.)
                event_data = {}
                sequence_number = getattr(event, "sequence_number", None)
                
                # Extraire les champs communs
                if hasattr(event, "delta"):
                    event_data["delta"] = getattr(event, "delta")
                if hasattr(event, "item_id"):
                    event_data["item_id"] = getattr(event, "item_id")
                if hasattr(event, "call_id"):
                    event_data["call_id"] = getattr(event, "call_id")
                if hasattr(event, "arguments"):
                    event_data["arguments"] = getattr(event, "arguments")
                if hasattr(event, "text"):
                    event_data["text"] = getattr(event, "text")
                if hasattr(event, "response"):
                    event_data["response"] = getattr(event, "response")
                if hasattr(event, "error"):
                    event_data["error"] = getattr(event, "error")
                
                # Parser selon le type d'événement (format Responses API)
                if event_type == "response.output_text.delta":
                    # Chunk de texte simple
                    delta = event_data.get("delta", "")
                    if delta:
                        yield StreamChunk(
                            event_type=event_type,
                            data={"text": delta, "type": "text"},
                            sequence=sequence_number
                        )
                
                elif event_type == "response.function_call_arguments.delta":
                    # Chunk de function call (structured output)
                    item_id = event_data.get("item_id")
                    delta = event_data.get("delta", "")
                    
                    if item_id and delta:
                        # Accumuler les arguments (utiliser item_id comme clé)
                        if item_id not in self.function_call_buffer:
                            self.function_call_buffer[item_id] = ""
                        self.function_call_buffer[item_id] += delta
                        
                        # Yielder le delta pour feedback temps réel
                        yield StreamChunk(
                            event_type=event_type,
                            data={"item_id": item_id, "delta": delta, "accumulated": self.function_call_buffer[item_id]},
                            sequence=sequence_number
                        )
                
                elif event_type == "response.function_call_arguments.done":
                    # Function call terminé
                    item_id = event_data.get("item_id")
                    arguments = event_data.get("arguments", "")
                    
                    if item_id:
                        # Utiliser arguments fourni ou buffer accumulé
                        final_arguments = arguments or self.function_call_buffer.get(item_id, "")
                        if final_arguments and item_id not in self.function_call_buffer:
                            self.function_call_buffer[item_id] = final_arguments
                        
                        yield StreamChunk(
                            event_type=event_type,
                            data={"item_id": item_id, "arguments": self.function_call_buffer.get(item_id, "")},
                            sequence=sequence_number
                        )
                
                elif event_type == "response.reasoning_text.delta":
                    # Chunk de reasoning text
                    item_id = event_data.get("item_id")
                    delta = event_data.get("delta", "")
                    
                    if item_id and delta:
                        # Accumuler le reasoning
                        if item_id not in self.reasoning_buffer:
                            self.reasoning_buffer[item_id] = ""
                        self.reasoning_buffer[item_id] += delta
                        
                        # Notifier le callback si disponible
                        if self.reasoning_callback:
                            try:
                                await self.reasoning_callback({
                                    "item_id": item_id,
                                    "delta": delta,
                                    "accumulated": self.reasoning_buffer[item_id],
                                })
                            except Exception as e:
                                logger.warning(f"Erreur dans reasoning_callback: {e}")
                        
                        # Yielder le delta pour feedback temps réel
                        yield StreamChunk(
                            event_type=event_type,
                            data={"item_id": item_id, "delta": delta, "accumulated": self.reasoning_buffer[item_id]},
                            sequence=sequence_number
                        )
                
                elif event_type == "response.reasoning_text.done":
                    # Reasoning text terminé
                    item_id = event_data.get("item_id")
                    text = event_data.get("text", "")
                    
                    if item_id:
                        if text and item_id not in self.reasoning_buffer:
                            self.reasoning_buffer[item_id] = text
                        
                        yield StreamChunk(
                            event_type=event_type,
                            data={"item_id": item_id, "text": self.reasoning_buffer.get(item_id, text)},
                            sequence=sequence_number
                        )
                
                elif event_type == "response.reasoning_summary_text.delta":
                    # Chunk de reasoning summary text (thinking summary GPT-5)
                    item_id = event_data.get("item_id")
                    delta = event_data.get("delta", "")
                    
                    if item_id and delta:
                        # Accumuler le reasoning summary
                        summary_key = f"{item_id}_summary"
                        if summary_key not in self.reasoning_buffer:
                            self.reasoning_buffer[summary_key] = ""
                        self.reasoning_buffer[summary_key] += delta
                        
                        # Notifier le callback si disponible
                        if self.reasoning_callback:
                            try:
                                await self.reasoning_callback({
                                    "item_id": item_id,
                                    "type": "summary",
                                    "delta": delta,
                                    "accumulated": self.reasoning_buffer[summary_key],
                                })
                            except Exception as e:
                                logger.warning(f"Erreur dans reasoning_callback (summary): {e}")
                        
                        # Yielder le delta pour feedback temps réel
                        yield StreamChunk(
                            event_type=event_type,
                            data={"item_id": item_id, "delta": delta, "accumulated": self.reasoning_buffer[summary_key]},
                            sequence=sequence_number
                        )
                
                elif event_type == "response.reasoning_summary_text.done":
                    # Reasoning summary text terminé
                    item_id = event_data.get("item_id")
                    text = event_data.get("text", "")
                    
                    if item_id:
                        summary_key = f"{item_id}_summary"
                        if text and summary_key not in self.reasoning_buffer:
                            self.reasoning_buffer[summary_key] = text
                        
                        yield StreamChunk(
                            event_type=event_type,
                            data={"item_id": item_id, "text": self.reasoning_buffer.get(summary_key, text)},
                            sequence=sequence_number
                        )
                
                elif event_type == "response.reasoning_summary_part.added":
                    # Partie de reasoning summary ajoutée (format alternatif)
                    item_id = event_data.get("item_id")
                    part = event_data.get("part") or event_data.get("text") or event_data.get("content", "")
                    
                    if item_id and part:
                        summary_key = f"{item_id}_summary"
                        if summary_key not in self.reasoning_buffer:
                            self.reasoning_buffer[summary_key] = ""
                        self.reasoning_buffer[summary_key] += part
                        
                        # Notifier le callback si disponible
                        if self.reasoning_callback:
                            try:
                                await self.reasoning_callback({
                                    "item_id": item_id,
                                    "type": "summary",
                                    "part": part,
                                    "accumulated": self.reasoning_buffer[summary_key],
                                })
                            except Exception as e:
                                logger.warning(f"Erreur dans reasoning_callback (summary part): {e}")
                        
                        yield StreamChunk(
                            event_type=event_type,
                            data={"item_id": item_id, "part": part, "accumulated": self.reasoning_buffer[summary_key]},
                            sequence=sequence_number
                        )
                
                elif event_type == "response.completed":
                    # Réponse complète
                    response_obj = event_data.get("response")
                    if response_obj:
                        self.completed_response = response_obj
                        yield StreamChunk(
                            event_type=event_type,
                            data={"response": response_obj},
                            sequence=sequence_number
                        )
                
                elif event_type == "response.failed":
                    # Erreur
                    error_data = event_data.get("error", {})
                    yield StreamChunk(
                        event_type=event_type,
                        data={"error": error_data},
                        sequence=sequence_number
                    )

                elif event_type == StreamEventType.RESPONSE_INCOMPLETE.value:
                    response_obj = event_data.get("response")
                    yield StreamChunk(
                        event_type=event_type,
                        data={"response": response_obj, "event_data": event_data},
                        sequence=sequence_number,
                    )

                else:
                    # Autres événements (on les log mais on ne les yield pas forcément)
                    logger.debug(f"Événement streaming non géré: {event_type}")
                    
            except Exception as e:
                logger.error(f"Erreur lors du parsing d'un événement streaming: {e}", exc_info=True)
                yield StreamChunk(
                    event_type=StreamEventType.ERROR,
                    data={"error": str(e)},
                )
    
    def get_completed_function_call_arguments(self, item_id: str) -> Optional[str]:
        """Récupère les arguments accumulés d'un function call.
        
        Args:
            item_id: ID de l'item (function call).
            
        Returns:
            Arguments JSON accumulés, ou None si pas trouvé.
        """
        return self.function_call_buffer.get(item_id)
    
    def get_completed_reasoning(self, item_id: str) -> Optional[str]:
        """Récupère le contenu accumulé d'un reasoning item.
        
        Args:
            item_id: ID de l'item reasoning.
            
        Returns:
            Contenu accumulé, ou None si pas trouvé.
        """
        return self.reasoning_buffer.get(item_id)
    
    def get_completed_reasoning_summary(self, item_id: str) -> Optional[str]:
        """Récupère le résumé de reasoning accumulé (thinking summary GPT-5).
        
        Args:
            item_id: ID de l'item reasoning.
            
        Returns:
            Résumé accumulé, ou None si pas trouvé.
        """
        summary_key = f"{item_id}_summary"
        return self.reasoning_buffer.get(summary_key)
    
    def get_completed_response(self) -> Optional[Dict[str, Any]]:
        """Récupère la réponse complète si disponible.
        
        Returns:
            Réponse complète, ou None si pas encore disponible.
        """
        return self.completed_response
