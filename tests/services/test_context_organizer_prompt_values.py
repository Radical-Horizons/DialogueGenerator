"""Ce que l'organisateur fait entrer dans le prompt : routage, nettoyage, extraits."""

from __future__ import annotations

from typing import Any, Dict, List

import pytest

from services.context_organizer import ContextOrganizer

_KNOWN = "1b76e4d2-1b45-8076-8f2c-dc910ac92b7a"


@pytest.mark.parametrize(
    "path",
    [
        "sections.gestes_et_tics_re_ve_lateurs",
        "sections.champs_lexicaux_utilise_s",
        "sections.ce_dont_il_refuse_de_parler",
        "sections.modes_de_communication",
        "sections.rencontre_initiale",
        "sections.exemples_de_dialogues_additionnels",
    ],
)
def test_slugified_voice_fields_are_routed_to_voice(path: str) -> None:
    """Régression : ces champs tombaient dans AUTRES, en fin de fiche, coupés d'abord."""
    assert ContextOrganizer()._categorize_field(path, "character") == "voice"


def test_relation_field_is_not_mistaken_for_voice() -> None:
    """« Dialogues liés » est une liste de fiches, pas une manière de parler."""
    assert ContextOrganizer()._categorize_field("values.Dialogues liés", "character") == "background"


def test_slugified_characterization_and_background_fields() -> None:
    """Les slugs accentués (`de_sir`) et la biographie trouvent leur section."""
    organizer = ContextOrganizer()
    assert organizer._categorize_field("sections.de_sir__want", "character") == "characterization"
    assert organizer._categorize_field("sections.biographie", "character") == "background"
    assert organizer._categorize_field("sections.manifestations_tangibles", "character") != "mechanics"


def test_voice_section_comes_right_after_identity() -> None:
    """Coupée par la fin, une fiche doit perdre son lore avant sa voix."""
    sections = ContextOrganizer.NARRATIVE_SECTIONS
    assert sections.index("voice") == sections.index("identity") + 1


def _organize(
    data: Dict[str, Any], fields: List[str], **kwargs: Any
) -> Dict[str, Dict[str, Any]]:
    """Organise une fiche et rend ``{titre de section: contenu}``."""
    organizer = ContextOrganizer(relation_index={_KNOWN: "Fiche Connue"})
    item = organizer.organize_context_json(
        element_data=data,
        element_type="character",
        fields_to_include=fields,
        organization_mode="narrative",
        **kwargs,
    )
    return {section.title: section.raw_content for section in item.sections}


def test_values_are_cleaned_and_editorial_fields_dropped() -> None:
    """Régression : sur le chemin JSON, aucune valeur n'était nettoyée ni résolue."""
    data = {
        "Nom": "Test",
        "values": {
            "Relations principales": _KNOWN,
            "Date de création": "2025-03-27",
            "Slug": "test",
        },
        "sections": {"voix_et_pre_sence": "Parle bas."},
    }
    content = _organize(
        data,
        ["Nom", "values.Relations principales", "values.Date de création", "values.Slug",
         "sections.voix_et_pre_sence"],
    )
    flat = {label: value for section in content.values() for label, value in section.items()}
    assert "Fiche Connue" in flat.values()
    assert not any("Date" in label or "Slug" in label for label in flat)


def test_excerpt_limits_are_applied_per_field() -> None:
    """Régression : `truncate_excerpt` n'était jamais appliqué sur le chemin JSON."""
    data = {"Nom": "Test", "sections": {"biographie": "Longue phrase. " * 200}}
    content = _organize(
        data,
        ["Nom", "sections.biographie"],
        element_mode="excerpt",
        field_char_limits={"sections.biographie": 100},
    )
    biography = next(
        value for section in content.values() for label, value in section.items() if "Biographie" in label
    )
    assert len(biography) <= 104
    assert biography.endswith("[…]")
