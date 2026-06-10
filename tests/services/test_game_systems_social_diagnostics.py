"""Tests titres de faction et diagnostics sociaux FR94 (Story 9.6 Task 5)."""

from services.game_systems_social_diagnostics import (
    diagnose_reputation_axis_confusion,
    validate_document_social_systems,
    validate_faction_title_condition,
)


def test_faction_title_condition_accepts_one_way_flag() -> None:
    """Une condition de titre peut référencer un flag one-way de faction."""
    result = validate_faction_title_condition({"flagId": "Flag_faction_titre_garde"})

    assert result.valid is True
    assert result.source == "one_way_flag"
    assert result.message is None


def test_faction_title_condition_accepts_catalog_title() -> None:
    """Une condition de titre peut référencer une valeur de catalogue titres."""
    result = validate_faction_title_condition(
        {"titleId": "garde_capitaine"},
        catalog_title_ids={"garde_capitaine"},
    )

    assert result.valid is True
    assert result.source == "title_catalog"


def test_influence_respect_axes_are_reported_as_social_system_not_reputation() -> None:
    """Influence et Respect ne doivent pas être recyclés comme axes de Réputation."""
    diagnostics = [
        diagnose_reputation_axis_confusion(axis)
        for axis in ("Influence", "Respect")
    ]

    assert diagnostics == [
        {
            "code": "social_system_confusion",
            "message": "Influence appartient au système Influence & Respect (PJ possédés), pas à la Réputation.",
        },
        {
            "code": "social_system_confusion",
            "message": "Respect appartient au système Influence & Respect (PJ possédés), pas à la Réputation.",
        },
    ]


def test_document_social_system_validation_reports_runtime_palier_and_reputation_confusion() -> None:
    """Le flux document remonte RepPalier runtime et confusion Respect/Réputation."""
    findings = validate_document_social_systems(
        {
            "dialogueFlags": [{"flagId": "RepPalier_PNJ_A_Admiration"}],
            "nodes": [
                {
                    "id": "START",
                    "visibilityConditions": {
                        "combinator": "AND",
                        "items": [
                            {
                                "kind": "reputation",
                                "axisId": "Respect",
                                "factionId": "garde",
                                "operator": ">=",
                                "threshold": 10,
                            }
                        ],
                    },
                    "choices": [],
                }
            ],
        }
    )

    assert [finding["code"] for finding in findings] == [
        "reputation_palier_runtime_only",
        "social_system_confusion",
    ]
