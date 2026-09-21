"""Le prompt ne doit pas demander l'inverse de ce que le schéma attend.

Constaté au banc du 2026-09-21 : le bloc `<output_format>` imposait « génère UN
SEUL nœud, ne génère PAS de séquence » **y compris** en mode fragment, où le
schéma réclame un panneau d'ouverture plus la suite de chaque choix.

Un modèle obéissant rendait donc 1 panneau et se faisait pénaliser pour
« fragment incomplet » : `mistralai/mistral-medium-3-5` sur 4 cas sur 5,
`gpt-5.6-terra` sur 1. Leurs duels les opposaient à des fragments de 4 panneaux
— une comparaison faussée par notre propre consigne, pas par leur écriture.
"""

from __future__ import annotations

import pytest

import xml.etree.ElementTree as ET

from core.prompt.prompt_engine import PromptInput
from services.prompt_builder import PromptBuilder


def _prompt(*, fragment_mode: bool = False, allow_stage_directions: bool = True) -> str:
    """Construit la structure de prompt et la rend en texte."""
    structure = PromptBuilder().build_structure(
        PromptInput(
            user_instructions="Écris l'ouverture de la scène.",
            npc_speaker_id="Voknir",
            fragment_mode=fragment_mode,
            allow_stage_directions=allow_stage_directions,
        )
    )
    return ET.tostring(structure, encoding="unicode")


def test_fragment_mode_asks_for_the_whole_fragment() -> None:
    """Le schéma attend la suite de chaque choix : la consigne doit le dire."""
    prompt = _prompt(fragment_mode=True)

    assert "FRAGMENT complet" in prompt
    assert "la suite de chaque" in prompt


def test_fragment_mode_never_asks_for_a_single_node() -> None:
    """La consigne mono-nœud est ce qui a coûté quatre mesures à Mistral."""
    prompt = _prompt(fragment_mode=True)

    assert "UN SEUL nœud" not in prompt
    assert "Ne génère PAS de séquence" not in prompt


def test_single_node_mode_is_untouched() -> None:
    """La génération de production reste mono-nœud : ne pas la casser en passant."""
    prompt = _prompt(fragment_mode=False)

    assert "UN SEUL nœud" in prompt
    assert "FRAGMENT complet" not in prompt


@pytest.mark.parametrize("fragment_mode", [True, False])
def test_both_modes_keep_the_structured_output_reminder(fragment_mode: bool) -> None:
    """Les deux branches disent que le JSON est garanti mais pas la logique métier."""
    assert "Structured Output" in _prompt(fragment_mode=fragment_mode)


def test_narration_sans_removes_the_permissions_it_contradicts() -> None:
    """Interdire les didascalies doit retirer ce qui les autorise.

    Au banc du 2026-09-21, le prompt les autorisait quatre fois et les
    interdisait une : la directive était minoritaire dans son propre prompt.
    """
    prompt = _prompt(allow_stage_directions=False)

    assert "Didascalies autorisées" not in prompt
    assert "Aucune didascalie" in prompt


def test_narration_avec_keeps_them_authorised() -> None:
    """Le mode « avec » reste le comportement de production, inchangé."""
    prompt = _prompt(allow_stage_directions=True)

    assert "Didascalies autorisées" in prompt
    assert "Aucune didascalie" not in prompt


def test_the_two_axes_are_independent() -> None:
    """Fragment et didascalies se règlent séparément : pas de couplage caché."""
    prompt = _prompt(fragment_mode=True, allow_stage_directions=False)

    assert "FRAGMENT complet" in prompt
    assert "Aucune didascalie" in prompt
