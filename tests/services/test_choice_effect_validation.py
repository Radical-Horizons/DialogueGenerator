"""Tests validation choiceEffects (Story 9.3)."""

from __future__ import annotations

import pytest

from services.choice_effect_validation import (
    parse_and_validate_choice_effects,
    validate_effect_atom_against_catalog,
)
from services.flag_catalog_index import definitions_by_id_from_catalog
from services.flag_catalog_service import FlagCatalogService


def _csv(tmp_path) -> FlagCatalogService:
    p = tmp_path / "fc.csv"
    p.write_text(
        "Id,Type,Category,Label,Description,DefaultValue,Tags,IsFavorite,Scope,MinValue,MaxValue,EnumValues\n"
        "B,bool,Event,x,,false,,,,,,,\n"
        "C,int,Stat,y,,0,,,,0,10,,\n"
        "E,string,Choice,z,,a,,,,,,a;b\n",
        encoding="utf-8",
    )
    return FlagCatalogService(csv_path=p)


def test_validate_bool_effect_wrong_semantic_raises(tmp_path):
    catalog = _csv(tmp_path)
    defs = definitions_by_id_from_catalog(catalog)
    from api.schemas.choice_effects import SetBoolEffect

    atom = SetBoolEffect(kind="set_bool", flagId="C", value=True)
    doc = {}
    with pytest.raises(ValueError, match="bool"):
        validate_effect_atom_against_catalog(atom, defs, doc, "test")


def test_parse_list_round_trip(tmp_path):
    catalog = _csv(tmp_path)
    defs = definitions_by_id_from_catalog(catalog)
    raw = [{"kind": "set_bool", "flagId": "B", "value": True}]
    doc = {}
    parse_and_validate_choice_effects(raw, "ce", defs, doc)
