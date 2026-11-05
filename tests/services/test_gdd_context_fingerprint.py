"""Tests empreinte du contenu des fiches GDD sélectionnées (Story 3.9)."""
from unittest.mock import MagicMock

from services.gdd_context_fingerprint import (
    clear_gdd_content_fingerprint_cache,
    compute_gdd_content_fingerprint,
    selected_gdd_element_names,
    structured_context_fingerprint,
)


def test_structured_context_fingerprint_stable() -> None:
    """L'ordre des clés ne change pas l'empreinte."""
    a = structured_context_fingerprint({"z": 1, "a": {"b": 2}})
    b = structured_context_fingerprint({"a": {"b": 2}, "z": 1})
    assert a == b
    assert len(a) == 64


def test_compute_gdd_content_fingerprint_reloads_before_each_compute() -> None:
    """AC3 : chaque calcul recharge le GDD ; l'empreinte suit le contenu de la fiche."""
    mock_cb = MagicMock()
    mock_cb.get_element_record.side_effect = [{"v": 1}, {"v": 2}]
    sel = {"characters": ["Zorg"]}
    clear_gdd_content_fingerprint_cache()
    fp1 = compute_gdd_content_fingerprint(mock_cb, sel)
    clear_gdd_content_fingerprint_cache()
    fp2 = compute_gdd_content_fingerprint(mock_cb, sel)
    assert fp1 != fp2
    assert mock_cb.load_gdd_files.call_count >= 2


def test_compute_gdd_content_fingerprint_is_versioned_hash_of_records() -> None:
    """L'empreinte couvre les fiches, sous un préfixe de version."""
    mock_cb = MagicMock()
    mock_cb.get_element_record.return_value = {"x": 1}
    clear_gdd_content_fingerprint_cache()

    fp = compute_gdd_content_fingerprint(mock_cb, {"characters": ["A"]})

    mock_cb.load_gdd_files.assert_called_once()
    mock_cb.get_element_record.assert_called_once_with("characters", "A")
    assert fp == f"v2:{structured_context_fingerprint({'characters': {'A': {'x': 1}}})}"


def test_fingerprint_ignores_selection_order_and_mode() -> None:
    """Déplacer une fiche de « complet » à « extrait » ou réordonner ne change rien."""
    mock_cb = MagicMock()
    mock_cb.get_element_record.side_effect = lambda _category, name: {"Nom": name}

    clear_gdd_content_fingerprint_cache()
    fp_full = compute_gdd_content_fingerprint(
        mock_cb, {"characters_full": ["A", "B"], "characters_excerpt": []}
    )
    clear_gdd_content_fingerprint_cache()
    fp_excerpt = compute_gdd_content_fingerprint(
        mock_cb, {"characters_full": ["B"], "characters_excerpt": ["A"]}
    )

    assert fp_full == fp_excerpt


def test_fingerprint_ignores_empty_lists_and_generation_settings() -> None:
    """Les clés sans fiche (réglages, listes vides) n'entrent pas dans l'empreinte."""
    mock_cb = MagicMock()
    mock_cb.get_element_record.return_value = {"Nom": "A"}

    clear_gdd_content_fingerprint_cache()
    bare = compute_gdd_content_fingerprint(mock_cb, {"characters_full": ["A"]})
    clear_gdd_content_fingerprint_cache()
    with_defaults = compute_gdd_content_fingerprint(
        mock_cb,
        {
            "characters_full": ["A"],
            "items_full": [],
            "generation_settings": {"tone": "sec"},
            "_element_modes": {"characters": {"A": "full"}},
        },
    )

    assert bare == with_defaults


def test_selected_names_include_scene_protagonists_and_location() -> None:
    """Protagonistes et lieu de scène comptent : le prompt les inclut toujours."""
    names = selected_gdd_element_names(
        {
            "characters_excerpt": ["Témoin"],
            "locations_full": [],
            "dialogues_examples": ["Exemple"],
            "scene_protagonists": {"personnage_a": "Héros", "personnage_b": "PNJ"},
            "scene_location": {"lieu": "Port", "sous_lieu": "Quai", "ambiance": "pluie"},
        }
    )

    assert names == {
        "characters": ["Héros", "PNJ", "Témoin"],
        "dialogues_examples": ["Exemple"],
        "locations": ["Port", "Quai"],
    }
