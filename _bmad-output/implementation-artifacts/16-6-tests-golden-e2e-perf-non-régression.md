# Story 16.6: Tests golden, E2E, perf, non-régression

Status: in-progress

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **équipe / qualité**,
I want **des tests golden (projection, IDs stables), E2E (édition, connect/disconnect, dupliquer, reload layout) et perf (borne confort/stress), et une vérification de non-régression**,
so that **on vise zéro régression et la cible perf ADR-008**.

## Acceptance Criteria

1. **Given** des tests golden  
   **Then** JSON → projection nodes/edges avec IDs stables, edgeIds stables ; changement de cible → edgeId inchangé

2. **Given** des tests E2E  
   **Then** édition line/speaker/choice sans perte ; connecter/déconnecter ; dupliquer nœud (nouveaux node.id et choiceId, refs effacées) ; reload avec layout

3. **Given** des tests de concurrence  
   **Then** deux clients effectuant PUT concurrent sur le même document : l’un reçoit 200, l’autre 409 + dernier état ; le client en 409 peut recharger et réessayer

4. **Given** des tests de migration  
   **Then** l’outil one-shot est idempotent (ré-exécution ne modifie pas les choiceId existants) ; documents migrés refusés s’ils sont rechargés sans choiceId en mode strict

5. **Given** des tests perf  
   **Then** cible confort + borne stress (milliers de nœuds, 4/8 choices selon métier) ; p95 load/drag/frappe mesuré (ex. p95 load < seuil raisonnable pour N nœuds, pas de nœuds invisibles)

6. **Given** la batterie de tests existante (API, E2E, front)  
   **When** les changements ADR-008 sont livrés  
   **Then** aucune régression sur les scénarios couverts ; les AC de chaque story 16.1–16.5 sont couverts par des tests

## Tasks / Subtasks

- [x] **Task 1** (AC: 1) – Tests golden projection, IDs stables
  - [x] 1.1 Étendre ou créer tests « golden » : document JSON (v1.1.0 avec choiceId) → projection nodes/edges ; vérifier node id = node.id, choice handle = choice:choiceId, edge id = e:nodeId:choice:choiceId:targetId ; vérifier que changer la cible d’un choice ne change pas l’edgeId (basé sur la sortie).
  - [x] 1.2 Fixtures : au moins un document multi-nœuds avec choix (4 et 8 choices si métier) pour couvrir borne confort/stress.
  - [x] 1.3 Réutiliser ou étendre `frontend/src/__tests__/documentToGraph.test.ts` et/ou ajouter tests backend si projection partagée côté API.

- [ ] **Task 2** (AC: 2) – Tests E2E ADR-008
  - [ ] 2.1 E2E édition : charger un dialogue → éditer line/speaker/choice → sauvegarder → recharger ; pas de perte, pas de reset du panel (story 16.4).
  - [ ] 2.2 E2E connecter/déconnecter : connecter un choix à un nœud, déconnecter ; vérifier document et layout cohérents après save.
  - [ ] 2.3 E2E dupliquer nœud : dupliquer un nœud → nouveaux node.id et choiceId, refs (nextNode/choices[].targetNode) des autres nœuds non pointant vers l’ancien ; sauvegarder et recharger.
  - [ ] 2.4 E2E reload avec layout : charger dialogue → modifier positions (drag) → sauvegarder → recharger ; layout restauré (positions, viewport si applicable).
  - [ ] 2.5 Réutiliser Playwright `e2e/*.spec.ts` ; ajouter ou étendre specs dans `e2e/` (ex. `e2e/documents-layout-adr008.spec.ts` ou étendre `graph-load-display-nodes.spec.ts` / `graph-node-accept-reject.spec.ts` selon périmètre).

- [ ] **Task 3** (AC: 3) – Tests concurrence 409
  - [ ] 3.1 Scénario : deux clients (deux requêtes PUT séquentielles ou parallèles) sur le même document ; premier PUT avec revision N → 200 ; second PUT avec même revision N → 409 + corps avec document/layout actuel et nouvelle revision.
  - [ ] 3.2 Vérifier que le client en 409 peut recharger (GET document + GET layout) et réessayer PUT avec la revision reçue.
  - [ ] 3.3 Implémentation : test API (pytest) avec deux appels PUT (même doc_id, même revision) ou test E2E avec deux sessions si nécessaire ; privilégier test API pour reproductibilité.

- [ ] **Task 4** (AC: 4) – Tests migration
  - [ ] 4.1 Tests outil one-shot (story 16.5) : idempotence (ré-exécution sur document déjà migré ne modifie pas choiceId) ; document migré rechargé via GET en mode strict → refus 422 si on retire artificiellement choiceId (ou test avec fichier sans choiceId refusé par GET).
  - [ ] 4.2 Intégrer dans suite existante (pytest pour script migration, tests API pour GET refus v1.1.0 sans choiceId déjà en 16.5).

- [ ] **Task 5** (AC: 5) – Tests perf
  - [ ] 5.1 Définir seuils : document de référence (ex. `docs/architecture/adr-008-perf-targets.md` ou section dans pipeline-unity-backend-front-architecture.md) avec cible confort (ex. N nœuds < 500, 4 choices) et borne stress (milliers de nœuds, 8 choices) ; p95 load, p95 drag, p95 frappe (saisie).
  - [ ] 5.2 Tests perf : mesurer p95 load (temps du GET document + projection + affichage), p95 drag (déplacer un nœud), p95 frappe (éditer un champ) sur un document de taille cible ; pas de nœuds invisibles (vérification visuelle ou snapshot).
  - [ ] 5.3 Outil : Playwright trace/performance ou test dédié (ex. `e2e/perf-document-load.spec.ts`) ; documenter seuils et comment les faire passer en CI (optionnel : marquer perf comme non bloquant en CI si flaky).

- [ ] **Task 6** (AC: 6) – Non-régression et couverture AC 16.1–16.5
  - [ ] 6.1 Lister les scénarios couverts par les tests existants : `tests/api/test_documents.py`, `tests/api/test_unity_schema_validator.py`, `frontend/src/__tests__/documentToGraph.test.ts`, `frontend/src/__tests__/graphStore.documents.test.ts`, E2E `e2e/*.spec.ts`.
  - [ ] 6.2 S’assurer que chaque AC des stories 16.1 (schéma choiceId), 16.2 (GET/PUT document, 409), 16.3 (layout, 409), 16.4 (SoT document, projection, save document+layout), 16.5 (migration idempotente, refus GET sans choiceId) est couvert par au moins un test (unit, API ou E2E).
  - [ ] 6.3 Exécuter toute la batterie (pytest, npm run test:frontend, npm run test:e2e) et corriger toute régression introduite par les changements ADR-008.

## Dev Notes

- **Jalon 5 – Qualité.** Référence : ADR-008 Tests Required, objectifs-contraintes (zéro régression).

### Existants à réutiliser / étendre

- **Projection / golden** : `frontend/src/utils/documentToGraph.ts`, `frontend/src/__tests__/documentToGraph.test.ts` — déjà tests IDs stables (choiceId, edge id e:...). Étendre avec cas « changement de cible → edgeId inchangé » et fixtures plus grosses (4/8 choices).
- **API documents** : `tests/api/test_documents.py` — GET/PUT document, GET/PUT layout, 409 revision ; étendre pour GET refus document v1.1.0 sans choiceId (story 16.5), et pour test concurrence 409 (deux PUT).
- **E2E** : `e2e/` avec Playwright, `playwright.config.ts` (baseURL 3000, API 4243). Specs existants : `graph-load-display-nodes.spec.ts`, `graph-node-accept-reject.spec.ts`, `graph-manual-node.spec.ts`, etc. Ajouter ou étendre pour édition line/speaker/choice sans perte, connect/disconnect, dupliquer, reload layout.
- **Store frontend** : `frontend/src/store/graphStore.ts` — loadDialogueByDocumentId, saveDialogue (document + layout), updateNode, connectNodes, disconnectNodes. Tests dans `frontend/src/__tests__/graphStore.documents.test.ts`.
- **Migration (16.5)** : une fois l’outil one-shot livré, tests idempotence et refus strict dans cette story (Task 4).

### GARDE-FOUS (epic 16)

- Vérifier `docs/architecture/pipeline-unity-backend-front-architecture.md`, `_bmad-output/planning-artifacts/epics/objectifs-contraintes-implementation-adr-008.md`.
- Pas de régression : toute modification doit préserver les tests existants ou les adapter explicitement.
- Les AC 16.1–16.5 doivent être tracés jusqu’à des tests concrets (liste de scénarios ou noms de tests).

### Architecture & conformité

- **ADR-008** : Tests golden (projection, edgeId stable), E2E (édition, connect, dupliquer, reload layout), concurrence (409), migration (idempotence, refus strict), perf (p95 load/drag/frappe, borne confort/stress).
- **Objectifs / contraintes** : Zéro régression ; cible perf documentée.

### Stack & librairies

- **Backend** : pytest, TestClient FastAPI ; `tests/api/test_documents.py`, `tests/api/utils/test_unity_schema_validator.py`.
- **Frontend** : Vitest, React Testing Library ; `frontend/src/__tests__/documentToGraph.test.ts`, `graphStore.documents.test.ts`.
- **E2E** : Playwright (`e2e/*.spec.ts`, `playwright.config.ts`).
- **Perf** : Playwright trace/performance ou mesures manuelles ; documenter seuils dans `docs/` ou fichier dédié.

### Structure de fichiers

- **Tests golden** : étendre `frontend/src/__tests__/documentToGraph.test.ts` ; optionnel backend si module de projection partagé.
- **Tests API** : étendre `tests/api/test_documents.py` (concurrence 409, GET refus sans choiceId si pas déjà en 16.5).
- **E2E** : nouveaux ou étendus dans `e2e/` (ex. `documents-layout-adr008.spec.ts`, `perf-document-load.spec.ts`).
- **Doc perf** : `docs/architecture/adr-008-perf-targets.md` ou section dans `pipeline-unity-backend-front-architecture.md`.

### Tests

- Golden : projection document → nodes/edges, edgeId stable quand cible change.
- E2E : édition, connect/disconnect, dupliquer, reload layout (Playwright).
- Concurrence : 409 deux PUT (pytest ou E2E).
- Migration : idempotence outil 16.5, refus GET v1.1.0 sans choiceId.
- Perf : p95 load/drag/frappe, seuils documentés.
- Non-régression : pytest + npm run test:frontend + npm run test:e2e verts.

### Previous story (16.5) intelligence

- Story 16.5 livre l’outil one-shot migration choiceId, refus GET document v1.1.0 sans choiceId (422), et tests associés. Pour 16.6 : réutiliser ces tests et ajouter couverture idempotence + refus strict (Task 4) ; s’assurer que la batterie 16.1–16.5 reste couverte après ajout des nouveaux tests (Task 6).

### Project Structure Notes

- Alignement avec `docs/architecture/pipeline-unity-backend-front-architecture.md` et `docs/guides/TESTING.md`. E2E dans `e2e/`, tests API dans `tests/api/`, tests frontend dans `frontend/src/__tests__/` et `tests/frontend/`.

### References

- [Source: _bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md – ADR-008 Tests Required, perf]
- [Source: _bmad-output/planning-artifacts/epics/epic-16.md – Story 16.6, GARDE-FOUS]
- [Source: _bmad-output/planning-artifacts/epics/objectifs-contraintes-implementation-adr-008.md – Zéro régression]
- [Source: docs/architecture/pipeline-unity-backend-front-architecture.md]
- [Source: tests/api/test_documents.py – tests GET/PUT document et layout]
- [Source: frontend/src/__tests__/documentToGraph.test.ts – projection, IDs stables]
- [Source: e2e/*.spec.ts – Playwright E2E]
- [Source: playwright.config.ts – baseURL, webServer]

## Dev Agent Record

### Agent Model Used

GPT-5.2 (Cursor)

### Debug Log References

- Vitest: ajout d’un test rouge sur stabilité d’edgeId lors d’un retarget de choix (ADR-008), puis correction + tests verts.

### Completion Notes List

- ✅ Task 1: edgeId de choix rendu stable (n'inclut plus la cible) pour permettre retarget sans churn d'IDs ; ajout de fixtures 4/8 choix et assertions d’unicité.

### File List

- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `frontend/src/utils/graphEdgeBuilders.ts`
- `frontend/src/utils/documentToGraph.ts`
- `frontend/src/store/graphStore.ts`
- `frontend/src/__tests__/documentToGraph.test.ts`
- `frontend/src/utils/graphEdgeBuilders.test.ts`
- `frontend/src/__tests__/graphStore.documents.test.ts`
