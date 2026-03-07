# Revue qualité — 3 fichiers (batch)

**Workflow :** testarch-test-review (scope single × 3)  
**Date :** 2026-03-07  
**Langue :** French  
**Fichiers revus :** (1) integration, (2) services, (3) API graph CRUD

---

## Vue d’ensemble

| # | Fichier | Score | Grade | Violations (M/L) | Recommandation |
|---|---------|-------|--------|-------------------|----------------|
| 1 | `tests/integration/test_full_generation_flow.py` | 93 | A | 1 M, 1 L | Approve with Comments |
| 2 | `tests/services/test_dialogue_generation_service.py` | 95 | A | 1 L | Approve |
| 3 | `tests/api/test_graph_crud.py` | 91 | A | 2 M, 2 L | Approve with Comments |

**Moyenne suite :** 93/100 (A). Aucun blocage ; améliorations optionnelles en maintenabilité (longueur, IDs, priorités).

---

# Revue 1 — `tests/integration/test_full_generation_flow.py`

**Score :** 93/100 (A)  
**Lignes :** 357  
**Classes :** TestFullGenerationFlow, TestErrorHandlingAndFallback  
**Framework :** pytest (async + sync)

## Résumé

- **Déterminisme :** 100 — Mocks LLM uniquement, pas de sleep/random, GIVEN/WHEN/THEN clairs.
- **Isolation :** 100 — Fixtures `unity_service`, `renderer`, `mock_llm_client` ; pas d’état partagé.
- **Maintenabilité :** 72 — Fichier >300 lignes (357) ; pas de test IDs ni P0/P1.
- **Performance :** 100 — Pas d’appels réels LLM.

## Points forts

- GIVEN/WHEN/THEN explicites dans les docstrings.
- Mocks LLM uniquement (déterministe).
- Fixtures `renderer` / `unity_service` réutilisables.
- Test skip documenté (`test_llm_provider_fallback` — feature future).

## Violations

| Sév. | Critère | Description |
|------|---------|-------------|
| MEDIUM | Longueur | Fichier 357 lignes (>300). Extraire des helpers ou scinder (ex. flow vs error-handling). |
| LOW | Test IDs | Aucun identifiant de test ni marqueurs P0/P1/P2/P3. |

## Recommandations

1. **Scinder ou factoriser :** soit un module par thème (flow vs error-handling), soit extraction de helpers (ex. build_unity_json_from_string) pour rester sous 300 lignes.
2. **Traçabilité :** ajouter @pytest.mark.p0/p1 sur les tests critiques (flux complet, export/import, gestion d’erreurs LLM) et des test IDs si vous utilisez le workflow `trace`.

**Décision :** Approbation avec commentaires.

---

# Revue 2 — `tests/services/test_dialogue_generation_service.py`

**Score :** 95/100 (A)  
**Lignes :** 207  
**Classe :** TestDialogueGenerationService  
**Framework :** pytest

## Résumé

- **Déterminisme :** 100 — Aucun sleep/random, mocks uniquement.
- **Isolation :** 100 — Fixtures avec `spec=ContextBuilder` / `spec=PromptEngine`, pas de globals.
- **Maintenabilité :** 80 — Fichier <300 lignes ; manque test IDs / P0–P1.
- **Performance :** 100 — Tout mocké.

## Points forts

- Fixtures `mock_context_builder` / `mock_prompt_engine` avec `spec=` (bonne pratique).
- 207 lignes, structure claire.
- Assertions explicites sur les appels mock (assert_called_once, call_args).
- Aucune dépendance externe.

## Violations

| Sév. | Critère | Description |
|------|---------|-------------|
| LOW | Test IDs | Aucun identifiant de test ni marqueurs P0/P1 pour ces tests unitaires service. |

## Recommandations

1. Ajouter @pytest.mark.unit et @pytest.mark.p0/p1 sur les tests critiques (_build_context_summary, _restore_prompt_on_error, _extract_json_from_text) pour alignement avec test-levels et sélection ciblée.

**Décision :** Approbation.

---

# Revue 3 — `tests/api/test_graph_crud.py`

**Score :** 91/100 (A)  
**Lignes :** 486  
**Classes :** TestGraphLoad, TestGraphSave, TestGraphSaveAndWrite, TestGraphValidate, TestGraphCalculateLayout  
**Framework :** pytest, FastAPI TestClient

## Résumé

- **Déterminisme :** 100 — Pas de sleep/random ; `assert response.status_code in [200, 422]` acceptable.
- **Isolation :** 95 — Fixture `TestGraphSaveAndWrite._override_config` avec cleanup (finally pop) ; attention à `dependency_overrides` en parallèle.
- **Maintenabilité :** 70 — Fichier 486 lignes (>300) ; P0/P1 en docstring mais pas en markers.
- **Performance :** 100 — TestClient, pas d’attentes arbitraires.

## Points forts

- GIVEN/WHEN/THEN dans les docstrings.
- Fixtures `sample_unity_json` et `sample_graph_nodes_edges` réutilisables.
- Priorités P0/P1 indiquées en en-tête de classe (load, save, save-and-write, validate, layout).
- Fixture `tmp_path` pour save-and-write isolée du disque.

## Violations

| Sév. | Critère | Description |
|------|---------|-------------|
| MEDIUM | Longueur | 486 lignes (>300). Scinder par endpoint ou extraire fixtures/helpers. |
| MEDIUM | Test IDs | [P0]/[P1] en texte uniquement ; pas de @pytest.mark.p0/p1 ni test IDs pour trace. |
| LOW | Isolation | dependency_overrides dans une fixture autouse ; documenter pour exécution parallèle. |
| LOW | Assertions | Plusieurs `assert response.status_code in [200, 400]` ; préférer un code attendu unique quand l’API est stable. |

## Recommandations

1. **Scinder le fichier :** par exemple `test_graph_load.py`, `test_graph_save.py`, `test_graph_save_and_write.py`, `test_graph_validate.py`, `test_graph_calculate_layout.py`, ou regrouper (load/save, validate/layout) pour rester sous 300 lignes par fichier.
2. **Marqueurs :** ajouter @pytest.mark.p0 sur load/save/save-and-write et @pytest.mark.p1 sur validate/calculate-layout ; ajouter des test IDs si vous utilisez `trace`.
3. **Documentation :** en-tête du module ou de la classe indiquant que `dependency_overrides` est utilisé (pour éviter interférences en `pytest -n auto`).
4. **Assertions :** là où le contrat API est fixe, remplacer `in [200, 422]` par `== 422` ou `== 200` pour des échecs plus explicites.

**Décision :** Approbation avec commentaires.

---

## Synthèse commune

- **Aucun problème critique** (pas de hard waits, pas de fuite d’état non nettoyée, pas d’absence d’assertions).
- **Thèmes récurrents :** longueur >300 lignes (2/3 fichiers), absence de test IDs / P0–P1 formalisés (3/3), usage de `dependency_overrides` à documenter (2/3).
- **Prochaines étapes suggérées :**  
  - Introduire @pytest.mark.p0/p1 et test IDs sur les tests critiques.  
  - Scinder ou factoriser les fichiers >300 lignes.  
  - Utiliser le workflow **Trace Requirements [TR]** pour lier exigences et tests.

---

**Rapport généré par TEA Agent (Murat). Batch 3 fichiers — 2026-03-07.**  
**Résumés JSON :** `tea-review-summary-test_full_generation_flow-20260307-143802.json`, `tea-review-summary-test_dialogue_generation_service-20260307-143802.json`, `tea-review-summary-test_graph_crud-20260307-143802.json`.
