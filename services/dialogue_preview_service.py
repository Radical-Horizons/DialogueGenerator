"""Service preview document : visibilité pour un état simulé donné (Story 9.4)."""

from __future__ import annotations

import logging
from typing import Any, List, Mapping

from api.schemas.dialogue_preview import (
    DialoguePreviewRequest,
    DialoguePreviewResponse,
    MaskedChoiceRef,
)
from services.dialogue_preview_eval import evaluate_visibility_conditions_block, parse_visibility_block

logger = logging.getLogger(__name__)


class DialoguePreviewService:
    """Évalue visibilité nœuds/choix pour un état flag/réputation simulé."""

    def preview_document(
        self,
        document: Mapping[str, Any],
        body: DialoguePreviewRequest,
        *,
        stored_revision: int,
    ) -> DialoguePreviewResponse:
        """Calcule masques pour l'état demandé.

        Args:
            document: Document Unity (nodes[]).
            body: États simulés + revision attendue (optionnel).
            stored_revision: Révision lue depuis .meta.

        Raises:
            ValueError: si ``revision`` fournie et différente de ``stored_revision``.
        """
        if body.revision is not None and body.revision != stored_revision:
            raise ValueError("revision_stale")

        nodes = document.get("nodes") or []
        if not isinstance(nodes, list):
            nodes = []

        flags = dict(body.flag_states)
        reputation = dict(body.reputation_states)

        nodes_total = 0
        nodes_masked = 0
        choices_total = 0
        choices_masked = 0
        masked_node_ids: List[str] = []
        masked_choice_refs: List[MaskedChoiceRef] = []

        for node in nodes:
            if not isinstance(node, dict):
                continue
            nid = str(node.get("id") or "").strip()
            if not nid:
                continue
            nodes_total += 1
            vc = parse_visibility_block(node.get("visibilityConditions"))
            if vc and vc.items:
                if not evaluate_visibility_conditions_block(vc, flags, reputation):
                    nodes_masked += 1
                    masked_node_ids.append(nid)
            choices = node.get("choices") or []
            if not isinstance(choices, list):
                continue
            for ch in choices:
                if not isinstance(ch, dict):
                    continue
                choices_total += 1
                cid = str(ch.get("choiceId") or "").strip()
                cvc = parse_visibility_block(ch.get("visibilityConditions"))
                if cvc and cvc.items:
                    if not evaluate_visibility_conditions_block(cvc, flags, reputation):
                        choices_masked += 1
                        if cid:
                            masked_choice_refs.append(
                                MaskedChoiceRef(node_id=nid, choice_id=cid)
                            )

        return DialoguePreviewResponse(
            revision=stored_revision,
            nodes_total=nodes_total,
            nodes_masked=nodes_masked,
            choices_total=choices_total,
            choices_masked=choices_masked,
            masked_node_ids=masked_node_ids,
            masked_choice_refs=masked_choice_refs,
        )
