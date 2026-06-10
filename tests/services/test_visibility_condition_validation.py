"""Tests validation visibilityConditions (Story 9.2)."""

from __future__ import annotations

import pytest

from services.flag_catalog_service import FlagCatalogService
from services.visibility_condition_validation import (
    VisibilityConditionValidationService,
    validate_atom_against_catalog,
)


@pytest.fixture
def catalog(tmp_path):
    csv_path = tmp_path / "FlagCatalog.csv"
    csv_path.write_text(
        (
            "Id,Type,Category,Label,Description,DefaultValue,Tags,IsFavorite,"
            "Scope,MinValue,MaxValue,EnumValues\n"
            "VF_BOOL,bool,Event,T,,false,,,,,,,\n"
            "VF_INT,int,Stat,T,,5,,,,0,10,,\n"
            "VF_ENUM,string,Choice,T,,a,,,,,,a;b\n"
        ),
        encoding="utf-8",
    )
    return FlagCatalogService(csv_path=csv_path)


def _defs(cat: FlagCatalogService) -> dict:
    return {f["id"]: f for f in cat.load_definitions()}


def test_bool_ok(catalog):
    from api.schemas.visibility_conditions import FlagBoolCondition

    d = _defs(catalog)
    atom = FlagBoolCondition(kind="flag_bool", flagId="VF_BOOL", equals=True)
    validate_atom_against_catalog(atom, d, "t")


def test_bool_wrong_semantic(catalog):
    from api.schemas.visibility_conditions import FlagBoolCondition

    d = _defs(catalog)
    atom = FlagBoolCondition(kind="flag_bool", flagId="VF_INT", equals=True)
    with pytest.raises(ValueError, match="bool"):
        validate_atom_against_catalog(atom, d, "t")


def test_counter_bounds(catalog):
    from api.schemas.visibility_conditions import FlagCounterCondition

    d = _defs(catalog)
    ok = FlagCounterCondition(
        kind="flag_counter", flagId="VF_INT", operator=">=", value=3
    )
    validate_atom_against_catalog(ok, d, "t")

    bad = FlagCounterCondition(
        kind="flag_counter", flagId="VF_INT", operator=">=", value=99
    )
    with pytest.raises(ValueError, match="bornes"):
        validate_atom_against_catalog(bad, d, "t")


def test_enum_value(catalog):
    from api.schemas.visibility_conditions import FlagEnumCondition

    d = _defs(catalog)
    ok = FlagEnumCondition(
        kind="flag_enum", flagId="VF_ENUM", operator="=", value="b"
    )
    validate_atom_against_catalog(ok, d, "t")

    bad = FlagEnumCondition(
        kind="flag_enum", flagId="VF_ENUM", operator="=", value="gamma"
    )
    with pytest.raises(ValueError, match="enum"):
        validate_atom_against_catalog(bad, d, "t")


def test_document_walk_invalid_flag(catalog):
    svc = VisibilityConditionValidationService(catalog)
    doc = {
        "schemaVersion": "1.2.0",
        "nodes": [
            {
                "id": "node-a",
                "line": "x",
                "visibilityConditions": {
                    "combinator": "AND",
                    "items": [
                        {
                            "kind": "flag_bool",
                            "flagId": "UNKNOWN",
                            "equals": True,
                        }
                    ],
                },
            }
        ],
    }
    with pytest.raises(ValueError, match="inconnu"):
        svc.validate_document(doc)


def test_document_choice_round_trip_ok(catalog):
    svc = VisibilityConditionValidationService(catalog)
    doc = {
        "schemaVersion": "1.2.0",
        "nodes": [
            {
                "id": "node-a",
                "line": "x",
                "visibilityConditions": {
                    "combinator": "OR",
                    "items": [
                        {"kind": "flag_bool", "flagId": "VF_BOOL", "equals": False}
                    ],
                },
                "choices": [
                    {
                        "choiceId": "c1",
                        "text": "Go",
                        "targetNode": "END",
                        "visibilityConditions": {
                            "combinator": "AND",
                            "items": [
                                {
                                    "kind": "flag_counter",
                                    "flagId": "VF_INT",
                                    "operator": "=",
                                    "value": 5,
                                }
                            ],
                        },
                    }
                ],
            }
        ],
    }
    svc.validate_document(doc)
