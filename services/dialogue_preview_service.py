"""Service preview document : visibilité et limites stats pour un état simulé."""

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

COMMUNITY_AGGREGATE_SIMULATION_LIMIT = (
    "Agrégat communautaire simulé localement : témoins, propagation et poids PNJ "
    "restent responsabilité runtime."
)


def collect_preview_simulation_limits(game_systems_state: Mapping[str, Any]) -> list[str]:
    """Retourne les limites connues de la simulation locale stats FR94."""
    reputation_values = game_systems_state.get("reputation_values")
    if not isinstance(reputation_values, Mapping):
        return []
    has_community_aggregate = any(
        "::community::" in str(key) or str(key).endswith("::community_calculated")
        for key in reputation_values
    )
    return [COMMUNITY_AGGREGATE_SIMULATION_LIMIT] if has_community_aggregate else []


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
        visibility_warnings: List[str] = []

        for node in nodes:
            if not isinstance(node, dict):
                continue
            nid = str(node.get("id") or "").strip()
            if not nid:
                continue
            nodes_total += 1
            node_vc = parse_visibility_block(
                node.get("visibilityConditions"),
                path=f"nodes[{nid}].visibilityConditions",
            )
            if node_vc.warning:
                visibility_warnings.append(node_vc.warning)
            vc = node_vc.block
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
                choice_vc = parse_visibility_block(
                    ch.get("visibilityConditions"),
                    path=f"nodes[{nid}].choices[{cid or '?'}].visibilityConditions",
                )
                if choice_vc.warning:
                    visibility_warnings.append(choice_vc.warning)
                cvc = choice_vc.block
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
            game_systems_state=body.game_systems_state,
            simulation_limits=collect_preview_simulation_limits(
                body.game_systems_state.model_dump()
            ),
            visibility_warnings=visibility_warnings,
        )
