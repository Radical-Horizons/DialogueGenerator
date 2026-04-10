# DialogueGenerator/llm_client.py
import asyncio
import logging
from abc import ABC, abstractmethod
from typing import List, Optional, Type, Union, Dict, Any
from pydantic import BaseModel, ValidationError
import inspect

logger = logging.getLogger(__name__)

class ILLMClient(ABC):
    """Interface pour les clients LLM."""
    @abstractmethod
    async def generate_variants(self, prompt: str, k: int, response_model: Optional[Type[BaseModel]] = None, previous_dialogue_context: Optional[List[Dict[str, Any]]] = None, user_system_prompt_override: Optional[str] = None) -> List[Union[str, BaseModel]]:
        """
        Génère k variantes de texte à partir du prompt donné.

        Args:
            prompt (str): Le prompt à envoyer au LLM.
            k (int): Le nombre de variantes à générer.
            response_model (Optional[Type[BaseModel]]): Le modèle Pydantic attendu pour la sortie structurée.
            previous_dialogue_context (Optional[List[Dict[str, Any]]]): Contexte de dialogue précédent.
            user_system_prompt_override (Optional[str]): Pour surcharger le system prompt.

        Returns:
            list[Union[str, BaseModel]]: Une liste de k éléments, chaque élément étant une variante ou une instance de response_model.
        """
        pass

    @abstractmethod
    def get_max_tokens(self) -> int:
        """Retourne le nombre maximum de tokens que le modèle peut gérer pour un prompt."""
        pass

    async def close(self):
        if hasattr(self, 'client') and hasattr(self.client, 'close'): # Vérifier si le client existe et a une méthode close
            if inspect.iscoroutinefunction(self.client.close):
                await self.client.close()
            else:
                self.client.close() # Pour les clients synchrones si jamais ils sont utilisés dans l'interface
        pass

class DummyLLMClient(ILLMClient):
    def __init__(self, delay_seconds: float = 0.0):
        super().__init__()
        self.delay_seconds = delay_seconds
        self.last_call_cost: float = 0.0
        self.last_usage_prompt_tokens: int = 0
        self.last_usage_completion_tokens: int = 0
        logger.info(f"DummyLLMClient initialisé avec un délai de {self.delay_seconds}s par variante.")

    async def generate_variants(self, prompt: str, k: int, response_model: Optional[Type[BaseModel]] = None, previous_dialogue_context: Optional[List[Dict[str, Any]]] = None, user_system_prompt_override: Optional[str] = None) -> List[Union[str, BaseModel]]:
        logger.info(f"DummyLLMClient (délai={self.delay_seconds}s): Début de la génération de {k} variante(s). response_model: {response_model.__name__ if response_model else 'None'}")
        variants = []
        for i in range(k):
            if self.delay_seconds > 0:
                await asyncio.sleep(self.delay_seconds)
            
            if response_model:
                # Cas spécial pour UnityDialogueGenerationResponse
                if response_model.__name__ == "DialogueQualityJudgeStructuredResult":
                    from models.dialogue_quality_judge import (
                        DialogueQualityCriterionJudgeItem,
                    )

                    dummy_criteria = [
                        DialogueQualityCriterionJudgeItem(
                            criterion_id="narrative_coherence",
                            score=7,
                            comment="Cohérence factice (DummyLLMClient).",
                        ),
                        DialogueQualityCriterionJudgeItem(
                            criterion_id="characterization",
                            score=7,
                            comment="Caractérisation factice.",
                        ),
                        DialogueQualityCriterionJudgeItem(
                            criterion_id="agency",
                            score=6,
                            comment="Agentivité factice.",
                        ),
                        DialogueQualityCriterionJudgeItem(
                            criterion_id="style",
                            score=7,
                            comment="Style factice.",
                        ),
                    ]
                    dummy_data = {
                        "overall_score": 7,
                        "criteria": [c.model_dump() for c in dummy_criteria],
                        "global_comment": "Évaluation simulée (DummyLLMClient, sans clé API).",
                        "improvement_suggestions": [],
                        "strengths": ["Structure de dialogue lisible (dummy)."],
                    }
                elif response_model.__name__ == "UnityDialogueGenerationResponse":
                    dummy_data = {
                        "title": "Dialogue de test généré par DummyLLMClient",
                        "node": {
                            "line": "Texte de test généré par DummyLLMClient pour Unity JSON.",
                            "choices": [
                                {
                                    "text": "Choix de test 1"
                                },
                                {
                                    "text": "Choix de test 2"
                                }
                            ]
                        }
                    }
                else:
                    # Pour les autres modèles (Interaction, etc.)
                    dummy_data: Dict[str, Any] = {
                        "interaction_id": f"dummy_id_{i+1}",
                        "title": f"Dummy Title {i+1}",
                    }
                    if hasattr(response_model, "model_fields"):
                        phase_idx = 1
                        while f"phase_{phase_idx}" in response_model.model_fields:
                            field_info = response_model.model_fields[f"phase_{phase_idx}"]
                            field_type_name = str(field_info.annotation)
                            if "DialogueLineElement" in field_type_name: 
                                 dummy_data[f"phase_{phase_idx}"] = {"element_type": "dialogue_line", "speaker":"DummyPNJ", "text":f"Ligne PNJ phase {phase_idx} var {i+1}"}
                            elif "PlayerChoicesBlockElement" in field_type_name:
                                 dummy_data[f"phase_{phase_idx}"] = {"element_type": "player_choices_block", "choices":[{"text":f"Choix {c_idx+1}", "next_interaction_id":f"next_dummy_{i+1}_{phase_idx}_{c_idx+1}"} for c_idx in range(2)]}
                            phase_idx += 1
                
                try:
                    parsed_dummy = response_model.model_validate(dummy_data) 
                    variants.append(parsed_dummy)
                    logger.info(f"DummyLLMClient: Variante structurée {i+1} (simulée) générée pour {response_model.__name__}.")
                except ValidationError as e_dummy_parse:
                    logger.warning(f"DummyLLMClient: Erreur de validation Pydantic factice {response_model.__name__} pour la variante {i+1}: {e_dummy_parse}. Retour d'un dict brut: {dummy_data}")
                    variants.append(dummy_data) 
                except Exception as e_generic_dummy:
                    logger.error(f"DummyLLMClient: Erreur générique lors de la simulation de variante structurée: {e_generic_dummy}")
                    variants.append(f"// Erreur Dummy LLM: {e_generic_dummy}")
            else:
                # DummyLLMClient : génération de variante factice (structured output ou texte)
                variant_text = f"Variante {i+1} générée par DummyLLMClient (mode test)"
                variants.append(variant_text)
                logger.info(f"DummyLLMClient: Variante {i+1} générée (mode test).")
        return variants

    def get_max_tokens(self) -> int:
        return 16000
