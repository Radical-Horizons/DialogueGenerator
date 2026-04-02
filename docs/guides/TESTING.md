# Guide des Tests

Ce document décrit l'organisation et les conventions des tests du projet.

## Types de Tests

### Tests Unitaires (`@pytest.mark.unit`)

**Caractéristiques :**
- Utilisent des **mocks** et des **données de test** (fixtures temporaires)
- **Isolés** : ne dépendent pas des vraies données GDD, fichiers, ou services externes
- **Rapides** : exécution en millisecondes
- **Fiables** : résultats reproductibles, pas de dépendances externes

**Exemples :**
- `tests/test_context_builder.py` : Tests avec données mockées
- `tests/api/test_dialogues.py` : Tests API avec mocks de services

**Exécution :**
```bash
# Tous les tests unitaires
pytest -m unit

# Tests unitaires d'un module spécifique
pytest tests/test_context_builder.py -m unit
```

### Tests d'Intégration (`@pytest.mark.integration`)

**Caractéristiques :**
- Utilisent les **vraies données** du projet (GDD, fichiers réels)
- Utilisent les **vrais services** (pas de mocks)
- **Plus lents** : chargement de fichiers, appels réels
- **Vérifient le comportement réel** du système

**Exemples :**
- `tests/test_context_builder_real_data.py` : Tests avec vraies données GDD
- `tests/api/test_prompt_raw_verification.py` : Tests API avec vrais services

**Exécution :**
```bash
# Tous les tests d'intégration
pytest -m integration

# Tests d'intégration d'un module spécifique
pytest tests/test_context_builder_real_data.py -m integration
```

### Tests Lents (`@pytest.mark.slow`)

**Caractéristiques :**
- Tests qui prennent du temps (chargement fichiers, appels réseau, etc.)
- Généralement des tests d'intégration
- Peuvent être exclus pour des exécutions rapides

**Exécution :**
```bash
# Exclure les tests lents
pytest -m "not slow"

# Exécuter uniquement les tests lents
pytest -m slow
```

## Organisation des Fichiers

### Convention de Nommage

- **Tests unitaires** : `test_<module>.py` (ex: `test_context_builder.py`)
- **Tests d'intégration** : `test_<module>_real_data.py` ou `test_<module>_integration.py`

### Structure des Dossiers

```
tests/
├── api/                    # Tests des endpoints API
│   ├── test_dialogues.py   # Tests unitaires (mocks)
│   └── test_prompt_raw_verification.py  # Tests d'intégration (vraies données)
├── services/                # Tests des services métier
├── test_context_builder.py  # Tests unitaires ContextBuilder
└── test_context_builder_real_data.py  # Tests d'intégration ContextBuilder
```

## Markers Pytest

Les markers suivants sont disponibles (définis dans `pytest.ini`) :

- `@pytest.mark.unit` : Test unitaire avec mocks
- `@pytest.mark.integration` : Test d'intégration avec vraies données
- `@pytest.mark.slow` : Test lent (peut être exclu)
- `@pytest.mark.api` : Test d'endpoint API
- `@pytest.mark.service` : Test de service métier

## Exécution des Tests

### Tous les Tests

```bash
pytest tests/
```

### Par Type

```bash
# Tests unitaires uniquement (rapides)
pytest -m unit

# Tests d'intégration uniquement
pytest -m integration

# Tests API uniquement
pytest -m api

# Tests services uniquement
pytest -m service
```

### Combinaisons

```bash
# Tests unitaires API (rapides)
pytest -m "unit and api"

# Tests d'intégration mais pas les lents
pytest -m "integration and not slow"
```

### Par Fichier/Module

```bash
# Tous les tests d'un fichier
pytest tests/test_context_builder.py

# Test spécifique
pytest tests/test_context_builder.py::TestContextBuilderInitialization::test_init_with_dummy_config_file
```

## Fixtures

### Fixtures Unitaires

Les tests unitaires utilisent des fixtures qui créent des données temporaires :

```python
@pytest.fixture
def dummy_context_config_file(temp_test_dir: Path) -> Path:
    """Crée un fichier de config temporaire pour les tests."""
    # ...
```

### Fixtures d'Intégration

Les tests d'intégration utilisent les vraies données :

```python
@pytest.fixture
def real_context_builder():
    """ContextBuilder avec les vraies données GDD du projet."""
    cb = ContextBuilder()
    cb.load_gdd_files()
    return cb
```

## Documentation des Tests

Chaque fichier de test doit avoir :

1. **En-tête de module** : Explique le type de test (unitaire vs intégration)
2. **Docstrings de classes** : Décrit ce qui est testé
3. **Docstrings de fonctions** : Explique le scénario testé
4. **Markers appropriés** : `@pytest.mark.unit` ou `@pytest.mark.integration`

## Bonnes Pratiques

### Tests Unitaires

- ✅ Utiliser des mocks pour isoler les dépendances
- ✅ Créer des fixtures temporaires pour les données
- ✅ Tests rapides (< 100ms chacun)
- ✅ Résultats reproductibles

### Tests d'Intégration

- ✅ Utiliser les vraies données du projet
- ✅ Vérifier le comportement réel du système
- ✅ Peuvent être plus lents (acceptable)
- ✅ Documenter les dépendances (fichiers GDD, etc.)

### Général

- ✅ Un test = un scénario
- ✅ Noms de tests explicites : `test_<scenario>_<expected_result>`
- ✅ Assertions claires avec messages d'erreur utiles
- ✅ Nettoyer après les tests (fixtures avec `yield`)

## Exemples

### Test Unitaire

```python
"""Tests unitaires du ContextBuilder avec données mockées."""
import pytest
from context_builder import ContextBuilder

@pytest.mark.unit
class TestContextBuilderInitialization:
    """Tests d'initialisation avec données mockées."""
    
    def test_init_with_dummy_config_file(self, dummy_context_config_file):
        """Test d'initialisation avec fichier de config temporaire."""
        cb = ContextBuilder(config_file_path=dummy_context_config_file)
        assert cb.context_config is not None
```

### Test d'Intégration

```python
"""Tests d'intégration du ContextBuilder avec vraies données GDD."""
import pytest
from context_builder import ContextBuilder

@pytest.fixture
def real_context_builder():
    """ContextBuilder avec les vraies données GDD."""
    cb = ContextBuilder()
    cb.load_gdd_files()
    return cb

@pytest.mark.integration
@pytest.mark.slow
class TestContextBuilderRealData:
    """Tests avec les vraies données GDD."""
    
    def test_find_character(self, real_context_builder):
        """Test de recherche de personnage avec vraies données."""
        details = real_context_builder.get_character_details_by_name("Akthar-Neth Amatru, l'Exégète")
        assert details is not None
```

## Dépannage

### Tests qui échouent de manière intermittente

- Vérifier les dépendances externes (fichiers, réseau)
- Utiliser des fixtures avec `scope="function"` pour isolation
- Vérifier les races conditions dans les tests parallèles

### Tests trop lents

- Identifier les tests lents : `pytest --durations=10`
- Marquer avec `@pytest.mark.slow`
- Exclure avec `-m "not slow"` pour développement rapide

### Problèmes d'encodage

- Utiliser UTF-8 pour tous les fichiers de test
- Éviter les caractères Unicode dans les `print()` (problèmes Windows)
- Utiliser des fichiers de sortie pour les tests avec beaucoup de texte

## Tests E2E (Playwright) — graphe

Les specs sous `e2e/*.spec.ts` lancent API + frontend (voir `playwright.config.ts`).

- **Chargement / drag** : `e2e/graph-load-display-nodes.spec.ts`
- **ADR-008 / documents** : `e2e/documents-layout-adr008.spec.ts`
- **Combobox de cible (Nœud suivant) + persistance document** : `e2e/graph-connection-target-dropdown.spec.ts`  
  - Le panneau **`NodeEditorPanel`** n’est **pas** monté sur `/graph-editor` standalone : ce scénario passe par le **Dashboard** (bouton « Éditeur de Graphe ») puis sélection du document seedé. Détails : [`docs/architecture/adr-graph-connection-targets-ui-shell.md`](../architecture/adr-graph-connection-targets-ui-shell.md).

```bash
npx playwright test e2e/graph-connection-target-dropdown.spec.ts --project=chromium
```
