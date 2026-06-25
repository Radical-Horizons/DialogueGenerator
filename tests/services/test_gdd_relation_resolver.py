"""Tests pour la résolution des champs relation Notion (UUID → Nom)."""
from services.gdd_relation_resolver import (
    build_notion_page_id_index,
    get_gdd_property,
    resolve_relation_field_to_names,
    resolve_scene_location_labels,
)


def test_get_gdd_property_reads_values_block() -> None:
    record = {"Nom": "Parent", "values": {"Contient": "uuid-1, uuid-2"}}
    assert get_gdd_property(record, "Contient") == "uuid-1, uuid-2"


def test_resolve_contient_uuids_to_location_names() -> None:
    locs = [
        {"Nom": "Nef Centrale", "notion_page_id": "1b36e4d2-1b45-80ce-9d1b-f71e60cb8e53"},
        {"Nom": "Narthex abyssal", "notion_page_id": "1b36e4d2-1b45-80d1-a752-c46051c2f742"},
    ]
    raw = "1b36e4d2-1b45-80ce-9d1b-f71e60cb8e53, 1b36e4d2-1b45-80d1-a752-c46051c2f742"
    index = build_notion_page_id_index(locs)
    names = resolve_relation_field_to_names(
        raw,
        notion_id_index=index,
        known_names=[loc["Nom"] for loc in locs],
    )
    assert names == ["Narthex abyssal", "Nef Centrale"]


def test_resolve_scene_location_labels() -> None:
    locs = [
        {"Nom": "Léviathan pétrifié", "notion_page_id": "1886e4d2-1b45-8150-a894-cfe31d31abd4"},
        {"Nom": "Nef Centrale", "notion_page_id": "1b36e4d2-1b45-80ce-9d1b-f71e60cb8e53"},
    ]
    resolved = resolve_scene_location_labels(
        {
            "lieu": "1886e4d2-1b45-8150-a894-cfe31d31abd4",
            "sous_lieu": "1b36e4d2-1b45-80ce-9d1b-f71e60cb8e53",
        },
        locs,
    )
    assert resolved["lieu"] == "Léviathan pétrifié"
    assert resolved["sous_lieu"] == "Nef Centrale"


def test_unresolved_uuid_omitted_from_contient() -> None:
    names = resolve_relation_field_to_names(
        "00000000-0000-4000-8000-000000000001, Site A",
        notion_id_index={},
        known_names=["Site A"],
    )
    assert names == ["Site A"]
