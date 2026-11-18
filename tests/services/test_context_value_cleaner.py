"""Nettoyage des valeurs de fiches GDD avant le prompt (balisage Notion, UUID, URL)."""
from __future__ import annotations

from typing import Dict

import pytest

from services.context_serializer.deduplicator import FieldDeduplicator
from services.context_value_cleaner import clean_context_text, clean_context_value
from services.gdd_notion_sync_utils import normalize_notion_id

KNOWN_ID = "1996e4d21b4580c49c73ddac6322e9bd"
OTHER_ID = "dfe787839d63424aad5caa7726bf6394"
UNKNOWN_ID = "3e13e12e934c4a7888507439b7d1dc60"


@pytest.fixture
def relation_index() -> Dict[str, str]:
    """Index UUID → nom réduit à deux fiches connues."""
    return {
        normalize_notion_id(KNOWN_ID): "Fiche connue",
        normalize_notion_id(OTHER_ID): "Autre fiche",
    }


def test_mention_is_replaced_by_the_name_of_the_cited_sheet(relation_index: Dict[str, str]) -> None:
    """Une mention de page devient le nom de la fiche citée."""
    text = f'Iel admire <mention-page url="https://app.notion.com/p/{KNOWN_ID}"/> depuis longtemps.'

    assert clean_context_text(text, relation_index) == "Iel admire Fiche connue depuis longtemps."


def test_unknown_mention_is_removed(relation_index: Dict[str, str]) -> None:
    """Une mention vers une page absente de l'index disparaît sans laisser de balise."""
    text = f'Avant <mention-page url="https://app.notion.com/p/{UNKNOWN_ID}"/> après.'

    cleaned = clean_context_text(text, relation_index)

    assert cleaned is not None
    assert "mention" not in cleaned and UNKNOWN_ID not in cleaned


def test_images_attachments_and_embeds_are_removed() -> None:
    """Images S3, pièces jointes et bases intégrées ne laissent que le texte lisible."""
    text = (
        "Portrait : ![](https://prod-files-secure.s3.amazonaws.com/x.png?X-Amz-Signature=abc)\n"
        '<file src="file://%7B%22source%22%7D"></file>\n'
        '<database url="https://app.notion.com/p/abc" inline="true"></database>\n'
        "Silhouette voûtée."
    )

    cleaned = clean_context_text(text)

    assert cleaned == "Portrait :\n\nSilhouette voûtée."


def test_link_keeps_its_title_and_bare_urls_disappear() -> None:
    """Un lien markdown garde son titre ; une URL nue est retirée."""
    text = "Voir [la carte des Plis](https://app.notion.com/p/abc) ou https://example.com/page."

    assert clean_context_text(text) == "Voir la carte des Plis ou"


def test_table_cells_and_line_breaks_become_plain_text() -> None:
    """Les tableaux HTML deviennent des lignes séparées par des barres."""
    text = "<table><tr><td>Axe</td><td>Choix</td></tr><tr><td>Peur</td><td>Fuir</td></tr></table>Ligne 1<br>Ligne 2"

    cleaned = clean_context_text(text)

    assert cleaned is not None
    assert "Axe | Choix |" in cleaned and "Peur | Fuir |" in cleaned
    assert "Ligne 1\nLigne 2" in cleaned
    assert "<" not in cleaned


def test_relation_field_is_resolved_deduplicated_and_unknown_ids_dropped(
    relation_index: Dict[str, str],
) -> None:
    """Un champ relation garde les noms connus, une seule fois chacun."""
    value = f"{KNOWN_ID}, {UNKNOWN_ID}; {OTHER_ID}, {KNOWN_ID}"

    assert clean_context_text(value, relation_index) == "Fiche connue, Autre fiche"


@pytest.mark.parametrize(
    "value",
    [
        f"{UNKNOWN_ID}, {UNKNOWN_ID}",
        "; ; ; ",
        '<database url="https://app.notion.com/p/abc"></database>',
        "### Quête de recrutement\n\t",
        "![](https://example.com/a.png)",
    ],
)
def test_value_without_readable_content_is_dropped(value: str) -> None:
    """Une valeur qui ne porte plus rien de lisible est omise (None)."""
    assert clean_context_text(value, {}) is None


def test_plain_text_and_non_text_values_are_unchanged() -> None:
    """Le texte narratif ordinaire et les valeurs non textuelles passent tels quels."""
    assert clean_context_value("Cartographe en exil") == "Cartographe en exil"
    assert clean_context_value(33) == 33
    assert clean_context_value({"a": "b"}) == {"a": "b"}


def test_list_of_texts_is_cleaned_item_by_item(relation_index: Dict[str, str]) -> None:
    """Une liste de textes est nettoyée élément par élément, sans doublons ni vides."""
    value = ["Abraldique", KNOWN_ID, "Abraldique", "![](https://example.com/a.png)"]

    assert clean_context_value(value, relation_index) == ["Abraldique", "Fiche connue"]


@pytest.mark.parametrize(
    "path",
    [
        "values.Actes effectifs",
        "values.Date de création",
        "values.Niveau d’IA",
        "values.Slug",
        "values.Référence visuelle",
        "values.Présence dans les chapitres",
    ],
)
def test_production_properties_never_reach_the_prompt(path: str) -> None:
    """Les propriétés Notion de suivi de production sont écartées du contexte."""
    assert FieldDeduplicator().deduplicate_fields([path, "values.Occupation"], {}) == [
        "values.Occupation"
    ]


def test_identical_texts_with_different_indentation_are_deduplicated() -> None:
    """Deux champs au même texte, indenté différemment par Notion, ne sortent qu'une fois."""
    data = {
        "sections": {
            "voix_et_pre_sence": "Voix saccadée.\n\tIel murmure des équations.",
            "registre_de_langage_du_personnage": "Voix saccadée. Iel murmure des équations.",
        }
    }
    fields = ["sections.voix_et_pre_sence", "sections.registre_de_langage_du_personnage"]

    assert FieldDeduplicator().deduplicate_fields(fields, data) == ["sections.voix_et_pre_sence"]
