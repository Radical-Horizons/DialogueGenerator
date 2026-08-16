"""Tests du scorer pur 6.9 (golden alignés sur le miroir TS)."""

from __future__ import annotations

from dataclasses import replace

from services.template_suggestion_score import (
    REASON_GDD,
    REASON_KW,
    REASON_MARKET,
    REASON_PERSO,
    REASON_RENCONTRE,
    SuggestionCandidateFeatures,
    SuggestionQuery,
    gdd_score,
    has_rencontre_initiale_text,
    is_first_meeting,
    keyword_score,
    normalize_tokens,
    rank_scored,
    score_candidate,
)


def _features(**overrides: object) -> SuggestionCandidateFeatures:
    """Candidat générique (pas de noms GDD réels)."""
    base = SuggestionCandidateFeatures(
        name="Confrontation",
        description="Conflit tendu",
        category="Confrontation",
        scene_type_hint="confrontation",
        scene_type="Generic",
        instructions="Brief tension",
        characters=("char-alpha",),
        locations=("loc-alpha",),
        use_count=0,
        market_usage_count=0,
    )
    return replace(base, **overrides)  # type: ignore[arg-type]


def test_golden_keyword_confrontation_beats_cutscene() -> None:
    """Brief confrontation : hint confrontation > cutscene (kw seul)."""
    query = SuggestionQuery(
        instructions="confrontation au port",
        scene_type="",
        characters=(),
        locations=(),
        has_rencontre_initiale=False,
    )
    confrontation = score_candidate(_features(), query)
    cutscene = score_candidate(
        _features(
            name="Cut-scene",
            category="Cut-scene",
            scene_type_hint="cutscene",
            instructions="Cinématique",
            characters=(),
            locations=(),
        ),
        query,
    )
    assert confrontation.score > cutscene.score
    assert confrontation.score == 13
    assert REASON_KW in confrontation.reasons
    assert cutscene.score == 0


def test_gdd_overlap_boosts_matching_snapshot() -> None:
    """Perso/lieu du POST présents dans le snapshot → boost gdd."""
    query = SuggestionQuery(
        instructions="",
        scene_type="",
        characters=("char-alpha",),
        locations=("loc-alpha",),
        has_rencontre_initiale=False,
    )
    matched = score_candidate(_features(scene_type_hint="", name="Autre", category="Autre"), query)
    other = score_candidate(
        _features(
            name="Autre",
            category="Autre",
            scene_type_hint="",
            characters=("char-beta",),
            locations=("loc-beta",),
        ),
        query,
    )
    assert matched.score > other.score
    assert REASON_GDD in matched.reasons
    assert other.score == 0


def test_rencontre_initiale_boosts_salutation() -> None:
    """Section non vide + candidat première rencontre → +20."""
    query = SuggestionQuery(
        instructions="",
        scene_type="",
        characters=(),
        locations=(),
        has_rencontre_initiale=True,
    )
    greeting = score_candidate(
        _features(
            name="Salutation / première rencontre",
            category="Salutation",
            scene_type_hint="rencontre_initiale",
            characters=(),
            locations=(),
        ),
        query,
    )
    other = score_candidate(
        _features(name="Négociation", category="Négociation", scene_type_hint="negociation"),
        query,
    )
    assert greeting.score == 20
    assert REASON_RENCONTRE in greeting.reasons
    assert other.score == 0
    assert not has_rencontre_initiale_text({"npc": "  "})
    assert has_rencontre_initiale_text({"npc": "Bonjour."})
    assert is_first_meeting("rencontre_initiale", "X", "Y")


def test_personal_usage_and_market_boost() -> None:
    """5 Chargers perso et usage marketplace élèvent le score d'un jumeau."""
    query = SuggestionQuery(
        instructions="confrontation",
        scene_type="",
        characters=(),
        locations=(),
        has_rencontre_initiale=False,
    )
    unused = score_candidate(_features(characters=(), locations=()), query)
    used = score_candidate(
        _features(characters=(), locations=(), use_count=5),
        query,
    )
    popular = score_candidate(
        _features(characters=(), locations=(), market_usage_count=50),
        query,
    )
    assert used.score > unused.score
    assert REASON_PERSO in used.reasons
    assert popular.score > unused.score
    assert REASON_MARKET in popular.reasons


def test_rank_drops_zero_and_caps_ten() -> None:
    """Score 0 exclu ; max 10 conservés."""
    zero = score_candidate(
        _features(name="Z", category="Z", scene_type_hint="cutscene", characters=(), locations=()),
        SuggestionQuery("", "", (), (), False),
    )
    ranked = rank_scored([(zero, "Z")])
    assert ranked == []
    items = [
        (
            score_candidate(
                _features(
                    name=f"Confrontation {index}",
                    characters=(),
                    locations=(),
                ),
                SuggestionQuery("confrontation", "", (), (), False),
            ),
            f"Confrontation {index}",
        )
        for index in range(12)
    ]
    assert len(rank_scored(items)) == 10


def test_normalize_and_keyword_helpers() -> None:
    """Tokens normalisés et scores plafonds."""
    assert "revelation" in normalize_tokens("Révélation")
    assert keyword_score(frozenset(), frozenset({"a"})) == 0
    assert gdd_score([], [], ["a"], ["b"]) == 0
