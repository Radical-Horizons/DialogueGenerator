# Story 3.11 : Optimiser contexte pour respecter budget tokens tout en maintenant pertinence (FR21)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **que le système propose une optimisation automatique de la sélection GDD pour respecter mon budget tokens tout en limitant la perte de pertinence**,
so that **je n’ai pas à basculer manuellement chaque entité en mode Extrait quand le budget FR20 est dépassé**.

## Acceptance Criteria

1. **Given** la sélection courante **dépasse** le budget tokens utilisateur (FR20) **When** l’utilisateur est dans le panneau contexte **Then** le CTA « Optimiser le contexte » (ou libellé équivalent) est **actif** (plus désactivé « FR21 ») **And** une action permet de lancer l’optimisation (sans bloquer la navigation si l’utilisateur ignore le CTA).

2. **Given** l’utilisateur **lance** l’optimisation **When** le backend calcule une proposition **Then** une **prévisualisation** indique clairement accepter / refuser **And** lorsque le plafond est **atteignable**, **selection_tokens estimés ≤ budget** (même pipeline que `estimate-tokens` / `context_token_breakdown`) **And** si le plafond est **inatteignable** (ex. entités épinglées), la réponse expose `budget_respected: false`, un avertissement explicite, et l’UI **n’autorise pas** « Accepter » pour cette proposition.

3. **Given** l’utilisateur **accepte** la proposition **When** l’UI applique le résultat **Then** les modes **Complet → Extrait** (ou retraits ordonnés documentés) sont reflétés dans la **source de vérité** de la sélection contexte (store / état déjà utilisé par la génération) **And** le compteur budget FR20 se met à jour sans rechargement manuel.

4. **Given** l’optimisation a été appliquée **When** l’utilisateur consulte le retour **Then** un **rapport** résume au minimum : nombre d’entités passées en extrait (ou équivalent), **tokens économisés** (delta mesurable cohérent avec l’estimation) **And** l’utilisateur peut identifier **quelles entités** ont changé (liste ou surbrillance légère dans l’UI existante — pas de refonte complète du sélecteur si un panneau récap suffit pour le MVP).

5. **Given** l’heuristique estime un **risque de perte de pertinence** élevé (seuil produit aligné epic : ex. **&lt; 50 %** sur un **score proxy** documenté, pas obligatoirement un embedding) **When** la proposition est affichée **Then** un **avertissement non bloquant** invite à augmenter le budget ou ajuster les règles **And** l’utilisateur peut **refuser** et conserver la sélection actuelle.

6. **Given** l’utilisateur ouvre **« Règles d’optimisation »** (ou section dans le même flux) **When** il configure des options MVP **Then** au minimum : **entités / types prioritaires** (à ne pas réduire en premier), **stratégie** (ex. conservatrice vs agressive), éventuellement **seuil de warning** **And** les règles sont **persistées** (session ou Zustand persist, cohérent FR20) **And** réutilisées par le prochain appel optimize.

## Tasks / Subtasks

- [x] Task 1 : Contrat API `POST /api/v1/context/optimize` (AC: #2)
  - [x] 🔴 Test échoue : avec payload minimal valide (sélection + budget + même shape que estimate-tokens côté pertinent), la route répond **200** et un schéma Pydantic fixe contient une **sélection proposée** + **métriques** (tokens avant/après ou delta, liste des changements) ; cas budget déjà respecté → réponse définie (no-op documenté).
  - [x] 🟢 Implémenter route + schémas + branchement `ServiceContainer` / `ContextBuilder` (voir Dev Notes) — pas de logique métier lourde dans le router.
  - [x] 🔵 Refactor : aligner les types de réponse avec `EstimateTokensResponse` / breakdown existants pour éviter deux vocabulaires « tokens » sans lien ; docstrings + erreurs 422 explicites.

- [x] Task 2 : Moteur d’optimisation déterministe (AC: #2, #5)
  - [x] 🔴 Test échoue : sur **fixtures** (listes full/excerpt fictives + comptages mockés ou tokenizer fixe), l’algorithme produit une sélection sous plafond en un nombre fini d’étapes ; ordre de réduction respecte les **priorités** (règles + defaults) ; cas « impossible sans retirer des entités » → comportement documenté (erreur contrôlée ou liste des retraits).
  - [x] 🟢 Implémenter service dans `services/` (réutiliser `compute_context_selection_token_metrics` / `ContextBuilder` pour mesurer — pas de second compteur divergent).
  - [x] 🔵 Refactor : isoler la **politique de tri** (priorités) des **étapes full→excerpt** pour tests unitaires lisibles ; éviter duplication avec `context_token_budget.py`.

- [x] Task 3 : Score proxy « pertinence résiduelle » (AC: #5)
  - [x] 🔴 Test échoue : pour des jeux de sélection avant/après, le proxy retourne un pourcentage et le warning s’affiche côté API (`warnings[]` ou champ booléen) lorsque &lt; seuil configurable (défaut 50).
  - [x] 🟢 Calculer un **proxy explicite** (ex. pondération par tokens full conservés vs budget, ou heuristique liée au breakdown) — **ne pas** prétendre à la sémantique LLM dans le MVP sauf extension clairement bornée.
  - [x] 🔵 Refactor : nommer le champ API pour qu’il ne soit pas confondu avec `context_relevance` post-génération (Story 3.6) ; documenter la sémantique dans le schéma OpenAPI.

- [x] Task 4 : Frontend — activer le CTA et flux accepter / refuser (AC: #1, #2, #3)
  - [x] 🔴 Test échoue : avec flag d’activation et mock API, dépassement budget → CTA cliquable ; clic → modal ou panneau avec **Accepter** / **Refuser** ; **Accepter** déclenche mutation du store de sélection (assert observable : état `_element_modes` ou équivalent).
  - [x] 🟢 Brancher `CONTEXT_OPTIMIZE_API_ENABLED` (ou équivalent) à **true** une fois l’endpoint livré ; client API dans `frontend/src/api/` ; composant dédié si `ContextSelector` / `ContextTokenBudgetSection` dépasse ~300 lignes.
  - [x] 🔵 Refactor : garder la logique « apply selection » testable hors React (helper pur) si le store devient verbeux.

- [x] Task 5 : Rapport post-optimisation + annulation (AC: #4)
  - [x] 🔴 Test échoue : après acceptation, le rapport affiche au moins **X entités modifiées** et **tokens économisés** ; **Annuler** (ou « Revenir ») restaure la sélection **capturée avant apply** dans le même flux utilisateur.
  - [x] 🟢 Implémenter snapshot pré-apply + UI rapport (toast, modal secondaire ou section expandable — cohérent avec le design existant).
  - [x] 🔵 Refactor : unifier les libellés avec les traductions / termes du panneau contexte (Complet / Extrait) pour accessibilité (`aria-live` sur le résumé).

- [x] Task 6 : Règles d’optimisation persistées (AC: #6)
  - [x] 🔴 Test échoue : modification d’une règle (stratégie ou liste « ne pas réduire ») → persistée (reload store / remount) ; l’appel optimize (mock) reçoit les règles dans le body ou via champ dédié.
  - [x] 🟢 Étendre un store existant (ex. `contextConfigStore` ou slice dédié) avec `partialize` — pas de backend user-settings inventé.
  - [x] 🔵 Refactor : limites de taille sur listes « pin » pour éviter payloads énormes ; validation côté Pydantic.

## Dev Notes

### Architecture guardrails

- **Backend** : logique dans `services/` ; route dans `api/routers/context.py` (ou sous-route claire) ; schémas `api/schemas/` ; injection via `api/container.py`. Réutiliser `ContextBuilder`, `context_token_budget`, patterns de `estimate_context_tokens`.
- **Frontend** : pas de logique métier opaque dans le LLM ; décisions d’optimisation = **réponse API déterministe**. Types TS alignés Pydantic (`frontend/src/types/api.ts`).
- **Story 3.6** (`context_relevance_scoring`) mesure la pertinence **après** génération — ne pas la confondre avec le **proxy pré-génération** de cette story ; nommage distinct obligatoire.
- **Story 3.4 / 3.5** : réutiliser les concepts de règles de contexte / type de dialogue si une source de priorité existe déjà (`ContextRuleService` ou équivalent) — sinon MVP avec liste utilisateur « pin » uniquement.
- **FR20** : budget minimum **10 000** tokens ; l’optimize doit respecter les mêmes bornes que `max_context_tokens`.

### What to reuse

- `services/context_token_breakdown.py` / `services/context_token_budget.py`, endpoint `POST /api/v1/context/estimate-tokens`, composant `ContextTokenBudgetSection`, constante `CONTEXT_OPTIMIZE_API_ENABLED` dans `frontend/src/constants.ts`.
- Patterns modaux / toasts déjà utilisés dans le panneau génération ou graphe.
- Stores : sélection contexte (`contextStore` ou équivalent — vérifier où `_element_modes` et listes full/excerpt sont écrits aujourd’hui).

### Quality bar

- **pytest** : service optimize + router (mocks `ContextBuilder`) ; pas d’entités GDD réelles.
- **Vitest** : flux CTA → modal → apply / cancel ; mocks `fetch` / client API.
- E2E optionnel si déjà des specs contexte — ne pas bloquer le MVP.

### Refactor bar (defaults)

- Critères dev-story : ~300 lignes max par fichier source touché par tâche, ~60 lignes par fonction, etc.

### Conventions

- Windows-first, UTF-8, logging contextualisé sur échecs d’optimisation.
- OpenAPI à jour pour le nouveau endpoint.

### Project Structure Notes

- Préférer **extraire** un `ContextOptimizeModal.tsx` (ou similaire) plutôt que gonfler indéfiniment `ContextSelector.tsx`.
- Si l’epic mentionne `ContextOptimizationService` comme nom, le code peut utiliser un nom plus précis (`ContextSelectionOptimizer`) pour éviter la collision avec d’autres « optimization » (LLM, coût).

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-03.md` — Story 3.11, FR21]
- [Source: `_bmad-output/implementation-artifacts/3-10-configurer-budget-tokens-pour-sélection-contexte-fr20.md` — intégration CTA / estimate / breakdown]
- [Source: `services/context_relevance_scoring.py` — pertinence **post** génération, à ne pas confondre avec le proxy pré-optimize]
- [Source: `_bmad-output/project-context.md` — stack, tests, API, stores]

## Technical Requirements

- Endpoint **`POST /api/v1/context/optimize`** : entrée = sélection + budget + paramètres alignés sur estimate-tokens (field_configs, organization_mode, user_instructions si nécessaire au build) + **règles** MVP ; sortie = sélection proposée, delta tokens, changements, warning proxy éventuel.
- **Déterminisme** : même entrée → même sortie (hors évolution explicite de données GDD).
- **Sécurité / perf** : pas de boucle N× appels LLM ; complexité raisonnable (nombre d’entités typique du sélecteur).

## Architecture Compliance

- FastAPI + `ServiceContainer` ; React consommateur API ; logique métier hors composants sauf orchestration UI.

## Library / Framework Requirements

- Tiktoken / comptage existant uniquement ; pas de nouvelle dépendance lourde sans justification (embeddings = option hors MVP saucisson).

## File Structure Requirements

- Fichiers sous `api/`, `services/`, `frontend/src/components/context/`, `frontend/src/api/`, `tests/` en miroir.

## Testing Requirements

- pytest + Vitest comme ci-dessus ; mocks I/O ; couverture des cas no-op, sous-budget, impossible sans retrait, warning proxy.

## Previous Story Intelligence

- **3.10 (FR20)** : budget persisté `contextConfigStore`, `useContextSelectionTokenEstimate`, breakdown `context_token_breakdown`, CTA optimisation **désactivé** tant que `CONTEXT_OPTIMIZE_API_ENABLED === false` — cette story doit **activer** le flux réel et retirer l’état placeholder.
- Ne pas casser le **debounce** estimate ni le **soft warning** sur dépassement.
- Réutiliser les mêmes limites **min 10k / max 100k** tokens.

## Git Intelligence Summary

- Travaux récents sur **fingerprint GDD**, **Notion sync**, **context section usage** — attention aux conflits dans `context.py` / stores ; garder les PR petites et testées.

## Latest Tech Information

- Pas de mise à jour de framework requise pour le MVP ; s’appuyer sur Pydantic v2 et patterns FastAPI existants.

## Project Context Reference

- `_bmad-output/project-context.md` : chemins GDD, interdiction tests sur entités réelles, injection DI, règles FastAPI/React.

## Dev Agent Record

### Agent Model Used

Composer (agent dev Amelia / implémentation Cursor)

### Debug Log References

_(aucun)_

### Completion Notes List

- Endpoint `POST /api/v1/context/optimize` + schémas `OptimizeContextRequest` / `OptimizeContextResponse` ; moteur `services/context_selection_optimizer.py` (mesure = `compute_context_selection_token_metrics` uniquement).
- 🔵 Refactor Task 1–2 : `_measure`, `_reduction_order`, `_iter_candidate_moves`, `_move_full_to_excerpt` ; vocabulaire tokens aligné (`selection_tokens_before` / `after`, `tokens_saved`).
- 🔵 Refactor Task 3 : champ `pre_generation_context_fidelity_proxy_percent` (distinct Story 3.6).
- 🔵 Refactor Task 4–5 : `buildOptimizeContextRequest()` pur dans `frontend/src/utils/buildContextOptimizeRequest.ts` ; `ContextOptimizeModal` + `aria-live` sur warnings / rapport.
- 🔵 Refactor Task 6 : `clampOptimizationPins` (200) + Pydantic validator ; persistance Zustand `partialize` + `resetToDefault`.
- Pytest : `1376 passed`, `1 failed` sur `test_build_context_with_akthar` (nom GDD « Akthar » non résolu — hors périmètre FR21). Vitest suite complète : 2 échecs intermittents `ContextSelector` en run parallèle ; fichiers FR21 passent en ciblé.
- Revue code : `budget_respected` (schéma + service + TS) ; undo fiable (snapshot à l’ouverture) ; tests service/API/modal mis à jour.

### File List

- `api/schemas/dialogue.py`
- `api/routers/context.py`
- `services/context_selection_optimizer.py`
- `tests/services/test_context_selection_optimizer.py`
- `tests/api/test_context_optimize.py`
- `frontend/src/constants.ts`
- `frontend/src/types/api.ts`
- `frontend/src/api/context.ts`
- `frontend/src/utils/buildContextOptimizeRequest.ts`
- `frontend/src/store/contextConfigStore.ts`
- `frontend/src/components/context/ContextTokenBudgetSection.tsx`
- `frontend/src/components/context/ContextTokenBudgetSection.test.tsx`
- `frontend/src/components/context/ContextOptimizeModal.tsx`
- `frontend/src/components/context/ContextOptimizeModal.test.tsx`
- `frontend/src/store/contextConfigStore.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/3-11-optimiser-contexte-pour-respecter-budget-tokens-tout-en-maintenant-pertinence-fr21.md`

## Senior Developer Review (AI)

**Revue** : adversariale sur story 3-11 (FR21), post-implémentation initiale.

### Findings (initiaux)

| Sévérité | Finding | Résolution |
|----------|---------|------------|
| High | AC#2 : `selection_tokens_after` pouvait dépasser le budget si tout était épinglé ; « Accepter » restait possible. | Champ API **`budget_respected`** ; bouton **Accepter** désactivé si `!no_op && !budget_respected` + message `role="alert"`. |
| Medium | Undo : snapshot pris **après** la réponse réseau → risque si la sélection bouge pendant la requête. | Snapshot **au début** du flux (clone JSON de `selections` à l’ouverture de la modal, avant `await`). |
| Low | Code mort `_ENTITY_TYPES` dans l’optimiseur. | Supprimé. |
| Low (suivi optionnel) | Changer stratégie / pins dans la modal ne relance pas l’optimisation sans fermer / rouvrir. | **Non bloquant MVP** — piste : bouton « Recalculer » ou effet sur deps règles. |

### Tests de régression

- `tests/services/test_context_selection_optimizer.py` : `test_budget_respected_false_when_impossible`.
- `tests/api/test_context_optimize.py` : assertions `budget_respected`.
- `ContextOptimizeModal.test.tsx` : cas `budget_respected: false` → Accepter désactivé.

### Verdict

**Approuvé avec correctifs** — critères d’acceptation satisfaits avec la nuance documentée pour les budgets inatteignables.

## Change Log

- 2026-03-28 : FR21 — API optimize, UI modal + persistance règles, tests pytest/vitest ciblés.
- 2026-03-28 : Revue code — `budget_respected`, snapshot undo avant réseau, retrait `_ENTITY_TYPES`, story → **done**.

## Story Completion Status

- **Statut** : done
- **Note** : Proxy = ratio tokens après/avant (pré-génération), pas sémantique LLM ; AC#2 inclut le cas `budget_respected: false` + UI.
