"""Tests Réputation FR94 (Story 9.6 Task 4)."""

from services.game_systems_reputation import (
    ReputationAxis,
    ReputationCondition,
    ReputationDeltaEffect,
    ReputationPreviewState,
    SocialTarget,
    calculate_rep_palier,
    classify_reputation_delta_impact,
    evaluate_reputation_condition,
    legacy_reputation_state_key,
    validate_dialogue_flags_do_not_store_rep_palier,
)


def test_reputation_condition_uses_explicit_target_axis_and_read_mode() -> None:
    """Évalue une condition Réputation avec héroïne, cible sociale, axe et mode de lecture."""
    target = SocialTarget(kind="npc", id="PNJ_A")
    condition = ReputationCondition(
        heroine_id="HEROINE_A",
        target=target,
        axis=ReputationAxis.ADMIRATION,
        read_mode="final_npc",
        operator=">=",
        threshold=30,
    )
    state = ReputationPreviewState(
        values={condition.state_key(): 35},
    )

    result = evaluate_reputation_condition(condition, state)

    assert result.satisfied is True
    assert result.current_value == 35
    assert result.current_palier == "Faveur"
    assert condition.state_key() != legacy_reputation_state_key("Admiration", "PNJ_A")


def test_rep_palier_is_calculated_from_numeric_value() -> None:
    """Couvre les paliers FR94 calculés depuis la valeur numérique."""
    assert calculate_rep_palier(-80) == "Hostilité"
    assert calculate_rep_palier(-45) == "Rejet"
    assert calculate_rep_palier(-20) == "Méfiance"
    assert calculate_rep_palier(-5) == "Distance"
    assert calculate_rep_palier(0) == "Neutre"
    assert calculate_rep_palier(15) == "Sympathie"
    assert calculate_rep_palier(35) == "Faveur"
    assert calculate_rep_palier(65) == "Dévotion"
    assert calculate_rep_palier(95) == "Icône"


def test_reputation_effect_exposes_explicit_target_axis_and_impact_tier() -> None:
    """Un effet Réputation FR94 cible une héroïne, une cible sociale, un axe et un impact."""
    effect = ReputationDeltaEffect(
        heroine_id="HEROINE_A",
        target=SocialTarget(kind="community", id="garde"),
        axis=ReputationAxis.PRESTIGE,
        delta=10,
    )

    assert effect.axis == ReputationAxis.PRESTIGE
    assert effect.target.kind == "community"
    assert classify_reputation_delta_impact(effect.delta) == "critique"


def test_reputation_delta_impact_tiers_follow_fr94_ranges() -> None:
    """Classe les impacts mineur, majeur et critique selon les repères FR94."""
    assert classify_reputation_delta_impact(0) == "aucun"
    assert classify_reputation_delta_impact(3) == "mineur"
    assert classify_reputation_delta_impact(-9) == "majeur"
    assert classify_reputation_delta_impact(10) == "critique"


def test_dialogue_flags_cannot_store_runtime_rep_palier() -> None:
    """Un RepPalier courant ne doit pas être persisté comme dialogueFlag."""
    errors = validate_dialogue_flags_do_not_store_rep_palier(
        [{"flagId": "RepPalier_PNJ_A_Admiration", "type": "enum", "initialValue": "Faveur"}],
    )

    assert errors == [
        {
            "code": "reputation_palier_runtime_only",
            "path": "dialogueFlags[0]",
            "message": "RepPalier est calculé à la volée depuis la Réputation numérique, ne le stockez pas dans dialogueFlags.",
        }
    ]
