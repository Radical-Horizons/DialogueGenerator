"""Tests pour GddNameResolver."""
from services.gdd_loader import GDDData
from services.gdd_name_resolver import GddNameResolver


def test_resolve_historical_alias_plus_nom() -> None:
    """Seigneuresse Uresaïr → Uresaïr via alias (sans fuzzy)."""
    gdd_data = GDDData(
        characters=[
            {
                "Nom": "Uresaïr",
                "values": {"Alias": "Seigneuresse, La Rebelle Immortelle"},
            }
        ]
    )
    resolver = GddNameResolver(gdd_data)

    assert resolver.resolve_character("Seigneuresse Uresaïr") == "Uresaïr"


def test_fuzzy_resolves_typo() -> None:
    """Typo légère sur le nom canonique."""
    gdd_data = GDDData(characters=[{"Nom": "Uresaïr"}])
    resolver = GddNameResolver(gdd_data)

    assert resolver.resolve_character("Uresair") == "Uresaïr"


def test_fuzzy_no_match_returns_none() -> None:
    """Nom sans rapport → None."""
    gdd_data = GDDData(characters=[{"Nom": "Uresaïr"}])
    resolver = GddNameResolver(gdd_data)

    assert resolver.resolve_character("Inconnu-999") is None
