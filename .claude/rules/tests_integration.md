---
description: Règles spécifiques pour tests d'intégration avec données réelles GDD
paths:
  - "tests/**/*integration*.py"
  - "tests/**/test_*_real*.py"
---
# Tests — Tests d'intégration avec données réelles

## Principe

Quand un test d'intégration utilise les vraies données GDD (marqué `@pytest.mark.integration`) :

- **Sélection dynamique** : Utiliser `all_entities[0]` ou une sélection basée sur des critères génériques (ex: "le plus grand nombre de tokens")
- **Critères génériques** : Sélectionner par taille, complexité, pas par nom
- **Fixtures réutilisables** : Créer des fixtures qui sélectionnent dynamiquement des entités de test
- **Documentation** : Expliquer pourquoi on teste avec des données réelles (ex: "teste avec une fiche volumineuse")

## Pattern correct pour tests d'intégration

```python
def test_extraction_without_field_configs(real_client):
    """Test l'extraction complète sans field_configs (générique)."""
    from context_builder import ContextBuilder
    cb = ContextBuilder()
    cb.load_gdd_files()
    all_characters = cb.get_characters_names()
    assert len(all_characters) > 0, "Aucun personnage disponible dans le GDD"
    
    # Utiliser le premier personnage disponible (générique)
    character_name = all_characters[0]
    # ... test de la logique, pas du nom spécifique
```

## ⚠️ INTERDICTIONS — Tests hardcodés

- ❌ **INTERDIT** : Recherche par nom hardcodé (`if "Akthar" in name`)
- ❌ **INTERDIT** : Assertions dépendant d'un nom spécifique
- ✅ **CORRECT** : Utiliser le premier élément disponible (`all_characters[0]` si non vide)
- ✅ **CORRECT** : Sélectionner par critères génériques (taille, complexité)

**Raison** : Les tests doivent tester la **fonctionnalité**, pas des données spécifiques. Si une fiche change de nom ou est supprimée, les tests ne doivent pas casser.

## Références

- **Règle principale** : `.claude/rules/tests.md`
- **Exemples** : `tests/test_context_builder_real_data.py`
