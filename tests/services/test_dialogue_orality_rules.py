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


@pytest.mark.parametrize("allow_stage_directions", [True, False])
def test_style_examples_reach_every_scene(allow_stage_directions: bool) -> None:
    """L3 : les exemples « écrit / dit » suivent la consigne d'oralité, dans les deux modes."""
    from services.dialogue_dramatic_progression import style_examples_block

    block = style_examples_block()
    assert "Dit (à viser)" in block
    assert block in compose_generation_instructions(
        "Scène.", is_start=True, allow_stage_directions=allow_stage_directions
    )


def test_style_examples_are_held_out_of_the_bench_suite() -> None:
    """Un exemple tiré d'un cas mesuré ferait mesurer de la mémorisation : aucun
    personnage déclaré par un cas de la suite n'y apparaît."""
    from services.benchmark_suite_seed import default_suites
    from services.dialogue_dramatic_progression import style_examples_block

    block = style_examples_block().lower()
    declared = {
        name
        for suite in default_suites()
        for case in suite.cases
        for name in (
            *case.request.context_selections.characters_full,
            *case.request.context_selections.characters_excerpt,
            *case.request.context_selections.locations_excerpt,
            *case.request.context_selections.species_excerpt,
        )
    }
    assert declared
    assert not [name for name in declared if name.lower() in block]


def test_style_examples_carry_no_stage_direction() -> None:
    """Valables en mode « sans » : l'audit du banc ne trouve rien à redire."""
    from services.dialogue_dramatic_progression import style_examples_block

    assert audit_prompt(
        _PROMPT + style_examples_block(), fragment_mode=True, allow_stage_directions=False
    ) == []
    assert "*(" not in style_examples_block()


def test_missing_style_examples_fall_back_to_l1bis(tmp_path) -> None:
    """Sans fichier, le prompt redevient celui de L1bis au lieu d'échouer."""
    from services.dialogue_dramatic_progression import style_examples_block

    assert style_examples_block(tmp_path / "absent.json") == ""
