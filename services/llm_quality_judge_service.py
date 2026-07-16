"""Service d'évaluation qualité dialogue via LLM juge (FR42)."""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Set

from pydantic import BaseModel

from api.schemas.dialogue_quality import (
    DialogueQualityCriterionDetail,
    EvaluateDialogueQualityResponse,
)
from models.dialogue_quality_judge import (
    DialogueQualityCriterionId,
    DialogueQualityCriterionJudgeItem,
    DialogueQualityJudgeStructuredResult,
)
from core.llm.llm_client import ILLMClient
from core.prompt.dialogue_quality_judge import (
    DIALOGUE_QUALITY_JUDGE_SYSTEM_PROMPT,
    build_dialogue_quality_judge_user_prompt,
)
from services.configuration_service import ConfigurationService
from services.graph_conversion_service import GraphConversionService

logger = logging.getLogger(__name__)

_CRITERION_LABELS_FR: Dict[DialogueQualityCriterionId, str] = {
    "narrative_coherence": "Cohérence narrative",
    "characterization": "Caractérisation",
    "agency": "Agentivité",
    "style": "Style",
}

_EXPECTED_IDS: Set[DialogueQualityCriterionId] = set(_CRITERION_LABELS_FR.keys())

_VARIANCE_NOTE_FR = (
    "Variance attendue ±1 point sur le score global entre deux évaluations successives "
    "(le juge LLM n'est pas déterministe)."
)


class LLMQualityJudgeService:
    """Évalue un graphe chargé via conversion Unity JSON + appel LLM structuré."""

    def __init__(self, config_service: Optional[ConfigurationService] = None) -> None:
        """Initialise le service.

        Args:
            config_service: Optionnel ; utilisé uniquement par helpers statiques si besoin.
        """
        self._config_service = config_service

    @staticmethod
    def resolve_default_model_id(config_service: ConfigurationService) -> str:
        """Retourne l'api_identifier du modèle par défaut."""
        return str(config_service.get_llm_setting("default_model", "gpt-5.6-terra"))

    @staticmethod
    def resolve_provider_for_model(
        config_service: ConfigurationService,
        model_id: str,
    ) -> str:
        """Retourne le client_type (openai, mistral, …) pour un api_identifier."""
        for m in config_service.get_available_llm_models():
            if m.get("api_identifier") == model_id:
                return str(m.get("client_type", "unknown"))
        return "unknown"

    def _unity_json_from_graph(
        self,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
    ) -> str:
        """Convertit nœuds/arêtes ReactFlow en JSON Unity."""
        return GraphConversionService.graph_to_unity_json(nodes, edges)

    def _structured_to_api_response(
        self,
        structured: DialogueQualityJudgeStructuredResult,
        *,
        model_id: str,
        provider: str,
    ) -> EvaluateDialogueQualityResponse:
        """Mappe la sortie LLM vers le schéma API."""
        by_id: Dict[DialogueQualityCriterionId, DialogueQualityCriterionJudgeItem] = {}
        for c in structured.criteria:
            by_id[c.criterion_id] = c
        missing = _EXPECTED_IDS - set(by_id.keys())
        if missing:
            raise ValueError(f"Critères manquants dans la réponse juge: {sorted(missing)}")
        ordered: List[DialogueQualityCriterionDetail] = []
        for cid in (
            "narrative_coherence",
            "characterization",
            "agency",
            "style",
        ):
            item = by_id[cid]
            ordered.append(
                DialogueQualityCriterionDetail(
                    criterion_id=item.criterion_id,
                    label=_CRITERION_LABELS_FR[item.criterion_id],
                    score=item.score,
                    comment=item.comment,
                )
            )
        return EvaluateDialogueQualityResponse(
            overall_score=structured.overall_score,
            score_variance_margin=1,
            score_variance_note=_VARIANCE_NOTE_FR,
            criteria=ordered,
            global_comment=structured.global_comment or None,
            suggestions=list(structured.improvement_suggestions),
            strengths=list(structured.strengths),
            model_id=model_id,
            provider=provider,
        )

    async def evaluate_graph(
        self,
        *,
        nodes: List[Dict[str, Any]],
        edges: List[Dict[str, Any]],
        llm_client: ILLMClient,
        config_service: ConfigurationService,
        model_id: str,
    ) -> EvaluateDialogueQualityResponse:
        """Lance l'évaluation qualité sur le graphe.

        Args:
            nodes: Nœuds ReactFlow.
            edges: Arêtes ReactFlow.
            llm_client: Client LLM (dummy, OpenAI, Mistral, fallback…).
            config_service: Configuration (résolution provider).
            model_id: Identifiant modèle réellement utilisé.

        Returns:
            Rapport structuré pour l'API.

        Raises:
            ValueError: Conversion graphe ou réponse LLM invalide.
            RuntimeError: Réponse LLM vide ou non structurée.
        """
        unity_json = self._unity_json_from_graph(nodes, edges)
        user_prompt = build_dialogue_quality_judge_user_prompt(unity_json)
        provider = self.resolve_provider_for_model(config_service, model_id)

        logger.info(
            "Évaluation qualité LLM: model_id=%s provider=%s nodes=%d edges=%d",
            model_id,
            provider,
            len(nodes),
            len(edges),
        )

        variants = await llm_client.generate_variants(
            user_prompt,
            k=1,
            response_model=DialogueQualityJudgeStructuredResult,
            user_system_prompt_override=DIALOGUE_QUALITY_JUDGE_SYSTEM_PROMPT,
        )
        if not variants:
            raise RuntimeError("Le juge LLM n'a retourné aucune variante.")
        first = variants[0]
        if not isinstance(first, BaseModel):
            raise RuntimeError("Réponse juge non structurée (attendu Pydantic).")
        if not isinstance(first, DialogueQualityJudgeStructuredResult):
            raise RuntimeError(
                f"Type de réponse juge inattendu: {type(first).__name__}"
            )
        return self._structured_to_api_response(
            first,
            model_id=model_id,
            provider=provider,
        )
