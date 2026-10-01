"""Ce que le modèle lit réellement : schéma de sortie, message système, contexte.

Le banc doit mesurer le prompt de la production, en entier, et savoir lequel il a
mesuré. Chaque test ici verrouille un écart trouvé en relisant les prompts
enregistrés d'octobre 2026, et qu'aucun test existant ne voyait.
"""

from __future__ import annotations

import json
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Optional

import pytest

from api.schemas.benchmark import BenchmarkGenerationRecord
from core.prompt.prompt_engine import PromptInput
from services.benchmark_prompt_audit import audit_prompt
from services.benchmark_prompt_fingerprint import (
    fragment_tool_schema_text,
    generation_prompt_fingerprint,
)
from services.prompt_builder import PromptBuilder, _strip_stage_directions_in_tree

_PROMPT = "<prompt><output_format>FRAGMENT de DEUX niveaux</output_format><generation_instructions>x</generation_instructions></prompt>"


def test_the_tool_schema_is_audited_like_the_prompt() -> None:
    """Régression : le schéma autorisait les didascalies dans tous les modes.

    Ses descriptions de `line` et `choices.text` sont lues par le modèle ; un run
    « sans » en recevait l'autorisation par une voie que l'audit ne lisait pas.
    """
    old_schema = json.dumps(
        {"description": "paroles du PNJ entre guillemets ; didascalies en *italique* (markdown)"},
        ensure_ascii=False,
    )
    assert audit_prompt(
        _PROMPT, tool_schema=old_schema, fragment_mode=True, allow_stage_directions=False
    )
    assert audit_prompt(
        _PROMPT,
        tool_schema=fragment_tool_schema_text(),
        fragment_mode=True,
        allow_stage_directions=False,
    ) == []


def _record(case_id: str, prompt_hash: Optional[str], system_prompt: Optional[str]) -> BenchmarkGenerationRecord:
    """Génération minimale portant ce qui entre dans l'empreinte."""
    return BenchmarkGenerationRecord(
        run_id="r",
        case_id=case_id,
        model_id="m",
        repetition=0,
        status="valid",
        prompt_hash=prompt_hash,
        system_prompt=system_prompt,
    )


def test_fingerprint_changes_with_the_system_prompt() -> None:
    """Deux consignes système différentes ne se comparent pas en silence."""
    before = generation_prompt_fingerprint([_record("a", "h1", "Écris riche.")])
    after = generation_prompt_fingerprint([_record("a", "h1", "Écris oral.")])
    assert before and after and before != after


def test_fingerprint_ignores_models_and_repetitions_of_the_same_prompt() -> None:
    """Le même prompt reçu par deux modèles ne compte qu'une fois."""
    single = generation_prompt_fingerprint([_record("a", "h1", "S")])
    doubled = generation_prompt_fingerprint([_record("a", "h1", "S"), _record("a", "h1", "S")])
    assert single == doubled


def test_fingerprint_is_none_when_nothing_was_sent() -> None:
    """Un run sans appel n'a rien envoyé : pas d'empreinte inventée."""
    assert generation_prompt_fingerprint([_record("a", None, None)]) is None


def _built(*, allow_stage_directions: bool = False) -> str:
    """Prompt assemblé en mode fragment."""
    structure = PromptBuilder().build_structure(
        PromptInput(
            user_instructions="Scène.",
            npc_speaker_id="Voknir",
            fragment_mode=True,
            allow_stage_directions=allow_stage_directions,
        )
    )
    return ET.tostring(structure, encoding="unicode")


def test_announced_choice_range_matches_the_fragment_schema() -> None:
    """Régression : « entre 2 et 8 » face à un schéma de fragment plafonné à 6."""
    from models.dialogue_structure.unity_dialogue_fragment import MAX_CHOICES

    assert f"entre 2 et {MAX_CHOICES} choix" in _built()


def test_priority_rules_are_escaped_once() -> None:
    """Régression : le modèle lisait `&amp;lt;scene_instructions&amp;gt;`."""
    prompt = _built()
    assert "&lt;scene_instructions&gt;" in prompt
    assert "&amp;lt;" not in prompt


def test_stage_directions_are_stripped_from_the_context_tree() -> None:
    """Les exemples de fiche perdent leurs didascalies dans un run qui les interdit."""
    context = ET.Element("context")
    ET.SubElement(context, "gdd_context").text = (
        "« Vous confondez. » *(sa voix se fait doucereuse)* « Mon enfant. »"
    )
    _strip_stage_directions_in_tree(context)
    assert context.find("gdd_context").text == "« Vous confondez. » « Mon enfant. »"


def test_notion_cache_is_resolved_from_the_main_checkout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Régression : résolu depuis le worktree, le cache était vide et les guides absents."""
    import constants

    monkeypatch.delenv("NOTION_CACHE_DIR", raising=False)
    assert constants.resolve_notion_cache_dir() == (
        constants._main_checkout_root() / constants.FilePaths.NOTION_CACHE_DIR
    )
    monkeypatch.setenv("NOTION_CACHE_DIR", "ailleurs")
    assert constants.resolve_notion_cache_dir() == Path("ailleurs")


def test_speaker_voice_loses_its_stage_directions_too() -> None:
    """La voix épinglée hors budget reprend la fiche : elle est nettoyée comme le contexte."""
    from unittest.mock import patch

    with patch.object(
        PromptBuilder,
        "_build_speaker_voice_section",
        return_value=_voice_element("Voix basse *(phénomène émergent)* et lente."),
    ):
        prompt = _built()
    assert "*(" not in prompt.split("<context>")[0]


def _voice_element(text: str) -> ET.Element:
    """Élément `<speaker_voice>` portant ce texte."""
    element = ET.Element("speaker_voice")
    element.text = text
    return element
