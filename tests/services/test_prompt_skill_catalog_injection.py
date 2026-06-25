"""Vérifie l'injection catalogue compétences/caractéristiques dans le prompt LLM."""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET

from core.prompt.prompt_engine import PromptInput
from services.prompt_builder import PromptBuilder
from services.skill_check_catalog import load_attribute_ids_for_prompt, load_skill_ids_for_prompt


def test_technical_section_includes_attributes_and_space_free_skills() -> None:
    builder = PromptBuilder()
    attributes = load_attribute_ids_for_prompt()
    skills = load_skill_ids_for_prompt()
    if not skills:
        import pytest

        pytest.skip("SkillCatalog.csv absent")

    technical = builder._build_technical_section(
        PromptInput(
            user_instructions="Test",
            npc_speaker_id="TEST_NPC",
            attributes_list=attributes,
            skills_list=skills,
        )
    )
    assert technical is not None
    xml_text = ET.tostring(technical, encoding="unicode")

    assert "<available_attributes>" in xml_text
    assert "Intelligence" in xml_text
    assert "Puissance" in xml_text

    assert "<available_skills>" in xml_text
    assert "identifiants sans espace" in xml_text
    assert "Armes de Poing" not in xml_text
    assert "ArmesdePoing" in xml_text or "ArmesDePoing" in xml_text

    for skill_id in skills[:20]:
        assert " " not in skill_id, f"identifiant compétence avec espace: {skill_id!r}"
        assert re.fullmatch(r"[^\s:+]+", skill_id), skill_id
