"""Tests pour la résolution des champs relation Notion (UUID → Nom)."""
import json
from pathlib import Path

from services.gdd_relation_resolver import (
    build_global_relation_index,
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


# --- build_global_relation_index ---


def test_build_global_relation_index_monolith(tmp_path: Path) -> None:
    """Monolithe JSON : tous les enregistrements indexés.

    ``normalize_notion_id`` retourne le format avec tirets ; les clés de l'index
    sont donc des UUID canoniques ``xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx``.
    """
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir()
    uid1 = "1a16e4d2-1b45-8051-88d9-d744a1bbc095"
    uid2 = "1a16e4d2-1b45-8051-88d9-aabbccddeeff"
    records = [
        {"Nom": "Uresaïr", "notion_page_id": uid1},
        {"Nom": "Valkazer", "notion_page_id": uid2},
    ]
    (gdd / "Piliers.json").write_text(json.dumps(records), encoding="utf-8")
    idx = build_global_relation_index(gdd)
    assert idx.get(uid1) == "Uresaïr"
    assert idx.get(uid2) == "Valkazer"


def test_build_global_relation_index_shard(tmp_path: Path) -> None:
    """Shards (un fichier par enregistrement) dans un sous-dossier."""
    gdd = tmp_path / "GDD_categories"
    shard_dir = gdd / "lieux"
    shard_dir.mkdir(parents=True)
    uid = "1b36e4d2-1b45-80ce-9d1b-f71e60cb8e53"
    shard = {"Nom": "Nef Centrale", "notion_page_id": uid}
    (shard_dir / "nef_centrale.json").write_text(json.dumps(shard), encoding="utf-8")
    idx = build_global_relation_index(gdd)
    assert idx.get(uid) == "Nef Centrale"


def test_build_global_relation_index_skips_archive(tmp_path: Path) -> None:
    """.archive et .staging sont ignorés."""
    gdd = tmp_path / "GDD_categories"
    archive = gdd / ".archive" / "snap1"
    archive.mkdir(parents=True)
    uid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    (archive / "rec.json").write_text(
        json.dumps({"Nom": "Secret", "notion_page_id": uid}), encoding="utf-8"
    )
    idx = build_global_relation_index(gdd)
    assert "aaaaaaaa" not in " ".join(idx.keys())


def test_build_global_relation_index_empty_dir(tmp_path: Path) -> None:
    """Répertoire vide → index vide."""
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir()
    assert build_global_relation_index(gdd) == {}


def test_build_global_relation_index_first_wins(tmp_path: Path) -> None:
    """En cas de collision UUID, la première entrée trouvée est conservée."""
    gdd = tmp_path / "GDD_categories"
    gdd.mkdir()
    uid = "1a16e4d2-1b45-8051-88d9-d744a1bbc095"
    (gdd / "A.json").write_text(
        json.dumps([{"Nom": "Premier", "notion_page_id": uid}]), encoding="utf-8"
    )
    (gdd / "B.json").write_text(
        json.dumps([{"Nom": "Deuxième", "notion_page_id": uid}]), encoding="utf-8"
    )
    idx = build_global_relation_index(gdd)
    assert idx[uid] in ("Premier", "Deuxième")
