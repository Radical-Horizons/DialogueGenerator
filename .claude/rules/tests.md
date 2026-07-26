---
alwaysApply: false
description: Structure et bonnes pratiques pour les tests pytest
---
# Tests — Structure et bonnes pratiques

## Framework et structure

- **Framework** : pytest uniquement (pytest-asyncio, pytest-mock). Pas `unittest`.
- **Structure** : Tests dans `tests/`. Miroir de la structure du code (`tests/api/`, `tests/services/`, etc.).
- **Configuration** : `pytest.ini` définit asyncio_mode, testpaths. Fixtures globales dans `tests/conftest.py`.

## Créer un nouveau test

### Test API (endpoint FastAPI)

1. Créer `tests/api/test_<nom_endpoint>.py`
2. Utiliser `TestClient` de FastAPI (fixture `client` disponible dans `conftest.py`)
3. Mock des dépendances : `app.dependency_overrides` ou `monkeypatch.setattr("api.dependencies.<fonction>", mock)`
4. **Référence** : Voir `tests/api/test_config_field_validation.py` pour exemple complet

### Test service (logique métier)

1. Créer `tests/services/test_<nom_service>.py`
2. Utiliser `@pytest.mark.asyncio` et `AsyncMock` pour méthodes async
3. **Référence** : Voir `tests/services/test_unity_dialogue_generation_service.py` pour exemple complet

### Test utilitaire

1. Créer `tests/utils/test_<nom_utilitaire>.py`
2. Même structure que test service, sans dépendances complexes

## Bonnes pratiques

- **Annotations de types** : Toutes les fixtures et fonctions de test doivent avoir des types
- **Docstrings** : Chaque test doit avoir une docstring expliquant ce qu'il teste
- **Isolation** : Chaque test est indépendant. Pas de dépendances entre tests
- **Mock réseau/IO** : Toujours mocker OpenAI, fichiers GDD, variables d'env (sauf `tmp_path`)
- **Markers** : voir `pytest.ini` (`unit`, `integration`, `slow`, `api`, `p0`, etc.).
  - `@pytest.mark.asyncio` : Pour les tests async (obligatoire)
  - `@pytest.mark.skip(reason="...")` : Pour désactiver temporairement (toujours documenter)
  - `@pytest.mark.parametrize` : Pour tester plusieurs valeurs
  - Tests **lents** ou **intégration lourde** : `@pytest.mark.slow` et/ou `@pytest.mark.integration` — obligatoire pour tout nouveau test qui allonge la CI (grille T0–T3 : `.claude/commands/test-tiers.md`).
- **tmp_path** : Fixture pytest pour fichiers temporaires (auto-nettoyage)
- **Nommage** : `test_<scenario>` pour les fonctions, `Test<Classe>` pour les classes

## ⚠️ INTERDICTIONS — Tests hardcodés sur entités spécifiques

**JAMAIS de tests hardcodés sur des entités GDD spécifiques** (personnages, lieux, objets) :

- ❌ **INTERDIT** : `test_akthar_extraction()`, `test_character_<nom_specifique>()`
- ❌ **INTERDIT** : Recherche par nom hardcodé (`if "Akthar" in name`)
- ❌ **INTERDIT** : Assertions dépendant d'un nom spécifique
- ✅ **CORRECT** : Utiliser le premier élément disponible (`all_characters[0]` si non vide)
- ✅ **CORRECT** : Utiliser une fixture qui sélectionne dynamiquement une entité
- ✅ **CORRECT** : Tester la logique, pas des données spécifiques

**Raison** : Les tests doivent tester la **fonctionnalité**, pas des données spécifiques.

## Commandes de test

- **Tous les tests (T3)** : `pytest tests/` ou `npm test` / `npm run test:backend:full`
- **Tiers rapides (repo)** : `npm run test:backend:smoke` (T0, `p0 and not integration`), `npm run test:backend:fast` (T2, `not slow`) — implémentation [`scripts/pytest-tier.cjs`](scripts/pytest-tier.cjs)
- **Tests API uniquement** : `pytest tests/api/` ou `npm run test:api`
- **Tests unitaires (hors API)** : `pytest tests/ -k "not api"`
- **Test spécifique** : `pytest tests/path/to/test_file.py::TestClass::test_method`
- **Avec couverture** : `pytest tests/ --cov=api --cov=services --cov-report=html`
- **Mode verbose** : `pytest tests/ -v`
- **Arrêt au premier échec** : `pytest tests/ -x`
- **Filtres par marqueur** (exemples) : `pytest tests/ -m p0`, `pytest tests/ -m "not slow"` — préférer les scripts npm ci-dessus sous Windows pour éviter les problèmes de quoting avec `node scripts/getPythonPath.js`.

## Vitesse et CI

- **PR (GitHub Actions)** : backend et frontend en **T2** (`not slow`, Vitest sans `VITEST_FULL`). **Push sur `main`** : **T3** (pytest complet, `VITEST_FULL=1`). Détail : `.github/workflows/ci.yml`.
- **Orchestration agent / humain** : tableau unique **T0–T3** — `.claude/commands/test-tiers.md` + `.claude/rules/workflow.md`.

## Quand tester

- **Après modification backend** : ciblé T1 → fichier ou `-k` ; large → `npm run test:backend:fast` ; complet → `pytest tests/` (T3)
- **Après modification API** : `pytest tests/api/` ou sous-ensemble touché
- **Après modification service** : `pytest tests/services/` ou `pytest tests/ -k "<nom_service>"`
- **Avant commit** : **T2** `npm run test:premerge` ; **T3** avant merge release / alignement CI complète
- **Nouveau code** : Créer les tests en même temps que le code

## Workflow "teste X"

1. **Identifier X** : Service, endpoint, fonction, composant ?
2. **Vérifier existence** : Chercher `tests/<module>/test_<X>.py`
3. **Si existe** : Exécuter `pytest tests/<module>/test_<X>.py -v`
4. **Si manquant** : Créer selon structure appropriée (voir exemples dans références)
5. **Résultat** : Tous les tests passent, code coverage acceptable

## Maintenance

- **Test manquant** : Si un composant/service/endpoint n'a pas de test, le créer immédiatement
- **Test cassé** : Corriger avant de continuer. Ne pas skip sauf raison documentée. **Preuve obligatoire** : après toute correction demandée par l’utilisateur (y compris échec CI), **relancer** le test ou la spec touchée et ne pas conclure sans sortie pass/fail — voir `.claude/rules/workflow.md` (section « Correction de tests »).
- **Refactoring** : Mettre à jour les tests en même temps que le code
- **Nouvelle fonctionnalité** : Tests requis pour validation, edge cases, erreurs
- **Couverture** : Viser >80% pour code critique (services, API)

## Persistance Unity / schéma dialogue

- **Fixture canonique** : `tests/fixtures/unity_post_generation.py` (`RAW_POST_GENERATION_DOCUMENT`) et miroir `frontend/src/testFixtures/rawPostGeneration.ts` — réutiliser pour export, PUT, `enrich_with_ids`, validate-schema, Vitest.
- **Validateur obligatoire** : tout **nouveau chemin de persistance** (save, export, write fichier) doit passer par `validate_unity_export_document` (normalisation + schéma + GDD). Réserver `validate_unity_json_structured` aux tests unitaires du validateur brut ou aux assertions « sans normaliseur ».
- **Schéma choices** (`docs/resources/dialogue-format.schema.json`, miroir `docs/JsonDocUnity/Documentation/`) : max **8** choix par nœud ; max **4** seulement si `cutsceneMode: true`. Tout `if/then` sur une propriété optionnelle doit inclure `"required": ["cutsceneMode"]` dans le `if` — sinon jsonschema applique le `then` par défaut (piège connu).
- **Tests régression** : `tests/services/test_unity_export_normalizer.py` (messages `maxItems`, cutscene vs normal) ; `frontend/src/utils/documentValidationFieldErrors.test.ts` (mapping inline).
- **Contrat intégration** : `tests/integration/test_unity_schema_save_contract.py` et `tests/api/test_graph_generate_node_schema_contract.py` couvrent génération IA → validate-schema → PUT.

## Références

- **Tiers T0–T3 (vitesse, scripts npm)** : `.claude/commands/test-tiers.md`
- **Patterns de mock** : Voir `.claude/rules/tests_patterns.md`
- **Tests d'intégration** : Voir `.claude/rules/tests_integration.md`
- **Fixtures communes** : `tests/conftest.py`
- **Exemples API** : `tests/api/test_config_field_validation.py`, `tests/api/test_dialogues.py`
- **Exemples services** : `tests/services/test_unity_dialogue_generation_service.py`, `tests/services/test_context_field_validator.py`
