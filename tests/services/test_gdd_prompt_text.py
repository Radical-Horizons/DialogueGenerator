"""Nettoyage des valeurs GDD avant leur entrée dans un prompt."""

from __future__ import annotations

from typing import Dict

import pytest

from services.gdd_prompt_text import (
    clean_gdd_text,
    clean_gdd_value,
    cut_text,
    is_editorial_field,
    strip_stage_directions,
)

_KNOWN = "1b76e4d2-1b45-8076-8f2c-dc910ac92b7a"
_UNKNOWN = "2f06e4d2-1b45-8020-a3ef-ddeec2d9c785"


@pytest.fixture
def relation_index() -> Dict[str, str]:
    """Index UUID → Nom limité à une fiche connue."""
    return {_KNOWN: "Fiche Connue"}


def test_self_closing_mention_becomes_the_cited_name(relation_index: Dict[str, str]) -> None:
    """Une mention auto-fermante ne porte que l'URL : le nom doit être restitué."""
    text = (
        "Il se croit sans contact avec "
        '<mention-page url="https://app.notion.com/p/1b76e4d21b4580768f2cdc910ac92b7a"/>'
        " et ignore son identité."
    )
    assert clean_gdd_text(text, relation_index) == (
        "Il se croit sans contact avec Fiche Connue et ignore son identité."
    )


def test_paired_mention_keeps_its_inner_text(relation_index: Dict[str, str]) -> None:
    """Une mention qui porte déjà son libellé le garde."""
    text = (
        f'Voir <mention-page url="https://app.notion.com/p/{_UNKNOWN}">la Nef</mention-page>.'
    )
    assert clean_gdd_text(text, relation_index) == "Voir la Nef."


def test_relation_list_is_resolved_and_unknown_ids_dropped(
    relation_index: Dict[str, str],
) -> None:
    """Une relation devient la liste des noms ; un identifiant inconnu disparaît."""
    assert clean_gdd_text(f"{_KNOWN}, {_UNKNOWN}", relation_index) == "Fiche Connue"
    assert clean_gdd_value(_UNKNOWN, relation_index) is None


def test_embeds_and_images_are_removed(relation_index: Dict[str, str]) -> None:
    """Bases incrustées, pièces jointes et images n'ont rien à dire au modèle."""
    text = (
        '<database url="https://app.notion.com/p/x" inline="true">Quêtes liées</database>'
        "Texte utile. ![](https://prod-files-secure.s3.amazonaws.com/a.png)"
        '<pdf src="file://guide.pdf"/><empty-block/>'
    )
    assert clean_gdd_text(text, relation_index) == "Texte utile."


def test_plain_text_is_untouched(relation_index: Dict[str, str]) -> None:
    """Le texte libre, ponctuation française comprise, passe intact."""
    text = "Les angles mentent : « Pardon ! »"
    assert clean_gdd_text(text, relation_index) == text


def test_nested_values_drop_empty_entries(relation_index: Dict[str, str]) -> None:
    """Une structure ne garde que ce qui reste lisible."""
    value = {"a": _UNKNOWN, "b": ["", _KNOWN], "c": "texte"}
    assert clean_gdd_value(value, relation_index) == {"b": ["Fiche Connue"], "c": "texte"}


@pytest.mark.parametrize(
    "path,expected",
    [
        ("values.Date de création", True),
        ("values.Slug", True),
        ("sections.guides", True),
        ("values.Relations principales", False),
        ("sections.remarques_de_conception", False),
    ],
)
def test_editorial_fields(path: str, expected: bool) -> None:
    """Le suivi éditorial est écarté, le fond et les notes de conception restent."""
    assert is_editorial_field(path) is expected


def test_cut_text_prefers_a_sentence_boundary() -> None:
    """Un extrait s'arrête sur une fin de phrase quand elle n'est pas trop loin."""
    text = "Première phrase assez longue. Deuxième phrase qui dépasse la limite fixée."
    assert cut_text(text, 45) == "Première phrase assez longue. […]"
    assert cut_text("court", 50) == "court"


def test_strip_stage_directions_removes_the_three_forms() -> None:
    """Les trois notations de jeu des fiches disparaissent, sans double espace."""
    text = (
        "« Vous confondez. » *(sa voix se fait doucereuse)* « Mon enfant. »\n"
        "(*fronce les sourcils*) « Non. »\n"
        "*\\[LA JOUEUSE s'approche\\]* « Approche. »"
    )
    assert strip_stage_directions(text) == (
        "« Vous confondez. » « Mon enfant. »\n « Non. »\n « Approche. »"
    )


def test_strip_stage_directions_keeps_emphasis_and_typography() -> None:
    """L'emphase et les espaces de la typographie française ne sont pas touchés."""
    text = "« Je ne *veux* pas : jamais ! »"
    assert strip_stage_directions(text) == text
