"""Le budget de contexte ne laisse jamais une fiche en évincer une autre."""

from __future__ import annotations

from services.context_truncator import cap_context_text_to_budget


def _context(npc_body: str, pj_body: str = "Voix de la joueuse.") -> str:
    """Contexte sérialisé : PNJ, PJ, puis une espèce et un lieu, dans l'ordre réel."""
    return (
        "--- CONTEXTE GÉNÉRAL DE LA SCÈNE ---\n\n"
        "--- CHARACTERS ---\n"
        "--- Voknir ---\n"
        "--- VOIX ET STYLE ---\n"
        "Phrases saccadées.\n"
        f"--- HISTOIRE ET RELATIONS ---\n{npc_body}\n\n"
        "--- Uresaïr ---\n"
        f"--- VOIX ET STYLE ---\n{pj_body}\n\n"
        "--- SPECIES ---\n"
        "--- Van'Doei ---\n"
        "Peuple des os.\n\n"
        "--- LOCATIONS ---\n"
        "--- Atelier ---\n"
        "Lieu de travail.\n"
    )


_NAMES = ["Voknir", "Uresaïr", "Van'Doei", "Atelier"]


def test_oversized_speaker_does_not_evict_the_other_sheets() -> None:
    """Régression : une fiche PNJ plus grosse que le budget effaçait PJ, espèce et lieu.

    Constaté sur quatre cas de benchmark sur huit en octobre 2026 : la fiche du
    locuteur, coupée par la tête, était tout ce qui restait du contexte.
    """
    capped = cap_context_text_to_budget(
        _context("biographie " * 6000),
        600,
        protect_entity_names=["Voknir"],
        all_entity_names=_NAMES,
    )
    for kept in ("Phrases saccadées", "Voix de la joueuse", "Peuple des os", "Lieu de travail"):
        assert kept in capped
    assert "--- SPECIES ---" in capped and "--- LOCATIONS ---" in capped


def test_species_listed_before_locations_survives() -> None:
    """Régression : la queue démarrait au premier marqueur du tuple (LOCATIONS).

    Le texte place SPECIES avant LOCATIONS : l'espèce disparaissait même quand il
    restait du budget.
    """
    capped = cap_context_text_to_budget(
        _context("biographie " * 300),
        400,
        protect_entity_names=["Voknir"],
        all_entity_names=_NAMES,
    )
    assert "Peuple des os" in capped


def test_a_second_large_sheet_does_not_starve_the_small_ones() -> None:
    """Le partage entre fiches non prioritaires est équitable : la grosse cède."""
    capped = cap_context_text_to_budget(
        _context("Court.", pj_body="mémoire " * 6000),
        600,
        protect_entity_names=["Voknir"],
        all_entity_names=_NAMES,
    )
    assert "Peuple des os" in capped
    assert "Lieu de travail" in capped
    assert "Phrases saccadées" in capped


def test_text_under_budget_is_returned_unchanged() -> None:
    """Sous le plafond, rien ne bouge."""
    text = _context("Court.")
    assert (
        cap_context_text_to_budget(
            text, 10_000, protect_entity_names=["Voknir"], all_entity_names=_NAMES
        )
        == text
    )
