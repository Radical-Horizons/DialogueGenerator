"""Palier L1 : une seule source pour le message système, une consigne d'oralité partagée."""

from __future__ import annotations

from typing import Any, Dict, List
from unittest.mock import patch

import pytest

from core.llm.openrouter_client import OpenRouterClient
from services.benchmark_prompt_audit import audit_prompt
from services.configuration_service import read_default_system_prompt
from services.dialogue_dramatic_progression import (
    DIALOGUE_LENGTH_RULE,
    DIALOGUE_ORALITY_RULES,
    compose_generation_instructions,
)

_PROMPT = (
    "<prompt><output_format>FRAGMENT de DEUX niveaux</output_format>"
    "<generation_instructions>x</generation_instructions></prompt>"
)


def test_clients_send_the_system_prompt_the_ui_shows(monkeypatch: pytest.MonkeyPatch) -> None:
    """Régression : les clients envoyaient un autre texte que celui affiché dans l'UI.

    `llm_config.json` portait « contenu textuel riche… chaque champ doit être
    développé » ; l'éditeur montrait `default.txt`. La consigne réellement reçue
    par le modèle n'était lisible nulle part.
    """
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-test-not-a-real-key")
    client = OpenRouterClient(api_key="sk-test-not-a-real-key", config={})
    assert client.system_prompt_template == read_default_system_prompt()
    assert "développé" not in client.system_prompt_template


def test_default_system_prompt_leaves_the_format_to_the_mode() -> None:
    """Le message système ne décrit pas les didascalies : c'est le mode qui décide."""
    assert audit_prompt(
        _PROMPT,
        system_prompt=read_default_system_prompt(),
        fragment_mode=True,
        allow_stage_directions=False,
    ) == []


def test_the_system_prompt_is_audited() -> None:
    """L'ancien `default.txt`, devenu message envoyé, aurait contredit un run « sans »."""
    old_default = "Format : paroles entre « guillemets » ; didascalies en *italique* narrateur."
    assert audit_prompt(
        _PROMPT, system_prompt=old_default, fragment_mode=True, allow_stage_directions=False
    )


@pytest.mark.parametrize("allow_stage_directions", [True, False])
def test_orality_and_gdd_length_reach_every_scene(allow_stage_directions: bool) -> None:
    """Les deux modes portent l'oralité et la longueur du GDD, plus « 1 à 4 phrases »."""
    composed = compose_generation_instructions(
        "Scène.", is_start=True, allow_stage_directions=allow_stage_directions
    )
    assert DIALOGUE_ORALITY_RULES in composed
    assert DIALOGUE_LENGTH_RULE in composed
    assert "1 à 4 phrases" not in composed


@pytest.mark.asyncio
async def test_graph_child_nodes_receive_the_orality_rules() -> None:
    """La génération de nœuds enfants contourne `PromptEngine` : elle doit quand même
    recevoir la consigne d'oralité, par les contraintes partagées."""
    from services.graph_node_orchestrator import GraphNodeOrchestrator

    seen: List[str] = []

    class _Stop(Exception):
        """Arrête la génération une fois les consignes capturées."""

    def _capture(parent_speaker: str, parent_line: str, instructions: str, **kwargs: Any) -> str:
        seen.append(instructions)
        raise _Stop()

    parent: Dict[str, Any] = {"speaker": "PNJ", "line": "Bonjour.", "choices": [{"text": "Salut"}]}
    with patch("services.graph_node_orchestrator._build_enriched_instructions", _capture):
        with pytest.raises(_Stop):
            await GraphNodeOrchestrator(generation_service=object()).generate(
                llm_client=object(),
                parent_node_id="START",
                parent_node_content=parent,
                user_instructions="La suite.",
            )
    assert seen and DIALOGUE_ORALITY_RULES in seen[0]


def test_the_orality_rules_ask_each_panel_for_something_new() -> None:
    """Régression L1 : la consigne disait que l'oral « se répète », et le juge a puni la
    répétition d'un panneau à l'autre (platitude +0,46)."""
    assert "se répète" not in DIALOGUE_ORALITY_RULES
    assert "chaque réplique apporte du neuf" in DIALOGUE_ORALITY_RULES
