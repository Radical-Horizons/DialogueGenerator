# Story 4.6 : Détecter cycles dans flux dialogue (FR41)

Status: done

<!-- Note : validation optionnelle. Exécuter validate-create-story avant dev-story si besoin. -->

## Story

As a **utilisateur créant des dialogues**,
I want **détecter les cycles dans le flux de dialogue, les visualiser et distinguer boucles intentionnelles vs à corriger**,
so that **je peux valider des dialogues récursifs légitimes sans masquer les erreurs de câblage accidentelles**.

## Acceptance Criteria

1. **Given** un graphe avec des arêtes formant au moins un cycle orienté, **When** je lance la validation structurelle (`validateGraph` / `POST .../graph/validate`), **Then** chaque cycle distinct est remonté en **warning** `cycle_detected` (non-bloquant, aligné Epic 0 / 0.6) avec **chemin lisible** et métadonnées **`cycle_id`**, `cycle_nodes`, `cycle_path` stables côté API.
2. **Given** un cycle est présent, **When** le panneau de validation affiche les avertissements, **Then** le libellé permet d’identifier le cycle (ex. chemin « A → B → … ») **And** un **résumé** du type **« X cycles détectés »** (ou équivalent cohérent avec les autres compteurs du panneau) reflète le **nombre de cycles encore visibles** après application du filtre « intentionnels ».
3. **Given** des nœuds participent à un cycle, **When** la validation est active, **Then** le graphe **surligne** ces nœuds de façon **distincte** des autres warnings structurels (réutiliser la logique existante `highlightedCycleNodes` / styles topologie) **And** un clic sur l’entrée de liste **focalise** le graphe sur les nœuds du cycle (pattern `graphViewStore` / zoom existant pour les cycles).
4. **Given** un cycle est **intentionnel** (dialogue récursif), **When** je le marque comme tel, **Then** il **disparaît des warnings affichés** (filtrage par `cycle_id`) **And** le **résumé** et le **surlignage** ne le comptent plus **And** au rechargement de la session navigateur, le marquage persiste via **`localStorage`** (`graph_intentional_cycles`) comme aujourd’hui.
5. **Given** l’epic exige **« localStorage + backend »** pour les cycles intentionnels, **When** le périmètre de cette story est clos, **Then** soit les IDs intentionnels sont **persistés côté serveur** (scopés au **document / dialogue** courant, pas globaux anonymes), soit un **écart produit documenté** dans les notes de complétion + piste de follow-up (sans laisser l’écart implicite).
6. **Given** je supprime l’arête qui créait un cycle accidentel, **When** la validation est relancée (flux existant post-mutation), **Then** le warning `cycle_detected` correspondant disparaît si le graphe ne contient plus ce cycle **And** aucun état stale (ids de nœuds supprimés) ne reste dans `validationErrors` / surlignages (réutiliser `pruneGraphValidationDiagnostics` si pertinent).
7. **Tests** : non-régression **pytest** (`_validate_cycles`, API validate — jeux déjà présents dans `tests/services/test_graph_validation_service.py`, `tests/api/test_graph_validate.py`) ; **Vitest** sur résumé / filtre intentionnel si nouveau code UI ; **lint** frontend à zéro régression.

## Tasks / Subtasks

- [x] **Task 1** : Résumé « X cycles détectés » aligné filtres intentionnels (AC: #2, #4, #7)  
  - [x] 🔴 Test échoue : avec une liste mockée de warnings `cycle_detected` (dont un `cycle_id` présent dans `intentionalCycles`), le composant de résumé (ou test ciblé sur la fonction de comptage) affiche un **nombre de cycles visibles** égal au nombre de warnings non filtrés ; cas zéro cycle → pas de ligne cycles (ou libellé explicite « 0 » selon cohérence produit).  
  - [x] 🟢 Étendre le résumé structurel (ex. `GraphStructuralWarningsSummary` ou voisinage dans `GraphValidationPanel`) pour inclure les **cycles** en plus orphelin / inaccessible — **sans** dupliquer la logique de filtre : réutiliser `summarizeGraphValidationWarnings` / `filterVisibleWarnings`.  
  - [x] 🔵 Refactor : si le résumé mélange trop de responsabilités, extraire un petit helper « counts by type after intentional filter » ou sous-composant **CyclesSummary** avec props minimales (`visibleCycleCount`).

- [x] **Task 2** : Persistance serveur des cycles intentionnels ou décision produit explicite (AC: #5, #7)  
  - [x] 🔴 Test échoue : soit un test d’intégration/API montrant qu’après sauvegarde + rechargement **application** (nouvelle session sans localStorage) les `cycle_id` intentionnels pour un **document donné** sont restaurés ; soit un test documenté « skip » remplacé par une **assertion** dans un fichier de suivi — **interdit** de fermer la story sans **une** des deux branches (implémentation **ou** note d’écart signée dans Completion Notes avec lien epic).  
  - [x] 🟢 Si implémentation : choisir le **scope minimal** cohérent avec le modèle document (`/api/v1/documents` — pas de logique métier dans le router ; champs ou sidecar selon patterns existants). Si report : rédiger l’écart dans **Completion Notes** + prochaine story / epic patch.  
  - [x] 🔵 Refactor : éviter de dupliquer la sérialisation JSON localStorage ; un seul module « intentional cycle ids » côté client si sync serveur ajoutée.

- [x] **Task 3** : Cohérence UX cycle (navigation, surlignage, nettoyage stale) (AC: #1, #3, #6, #7)  
  - [x] 🔴 Test échoue : clic (ou handler) sur entrée `cycle_detected` déclenche le **focus** / zoom sur l’ensemble des `cycle_nodes` (mock `graphViewStore`) ; scénario **suppression nœud** retire les diagnostics dont le `node_id` n’existe plus.  
  - [x] 🟢 Vérifier et compléter `GraphValidationPanel` / listes cycles pour respecter les AC sans régression **FR40** (orphelin / inaccessible) ni **lore** ; brancher `pruneGraphValidationDiagnostics` sur les chemins de mutation d’arêtes si un gap est trouvé.  
  - [x] 🔵 Refactor : si handlers de clic cycle et clic nœud divergent, factoriser un « navigateToValidationTarget » minimal.

## Dev Notes

- **État actuel (audit SM)** : `_validate_cycles` et warnings `cycle_detected` **existent** (`services/graph_validation_service.py`) ; API `POST .../unity-dialogues/graph/validate` les renvoie ; le store agrège `highlightedCycleNodes` dans `uiSlice.validateGraph` ; **case à cocher** « Marquer comme intentionnel » + `localStorage` **`graph_intentional_cycles`** + tests **`graphStore.test.ts`** — **déjà en place**. La story vise surtout les **écarts epic** : **résumé explicite des cycles** et **backend** pour l’intentionnel.
- **Garde-fous architecture** : validation dans **`services/`** ; router **`api/routers/graph.py`** mince ; UI **Zustand** + **`graphViewStore`** pour focus ; pas d’événements `window`.
- **Réutiliser** : `GraphValidationPanel`, `GraphValidationPanelLists`, `graphValidationSummary.ts`, `markCycleAsIntentional` / `unmarkCycleAsIntentional`, types `ValidationErrorDetail` avec `cycle_id`, tests API existants.
- **Ne pas régresser** : distinction orphelin / inaccessible (`GraphStructuralWarningsSummary`) ; panneau déjà dense — **isoler** les ajouts (sous-composant ou ligne de résumé dédiée cycles).
- **Endpoint validate** : canon **`/api/v1/unity-dialogues/graph/validate`** (vérifier le préfixe réel dans le routeur).
- **Qualité** : données de test **synthétiques** ; pas de GDD réel ; respect **`_bmad-output/project-context.md`** et T0–T3.

### Project Structure Notes

- Backend : `services/graph_validation_service.py` (cycles déjà là — toucher seulement si correction de bug ou enrichissement contractuel **additif**).
- Frontend : `GraphStructuralWarningsSummary.tsx`, `GraphValidationPanel.tsx`, `GraphValidationPanelLists.tsx`, `frontend/src/utils/graphValidationSummary.ts`, `frontend/src/store/slices/uiSlice.ts`, types `frontend/src/types/graph.ts` / `api.ts`.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-04.md` — Story 4.6, FR41]  
- [Source: `services/graph_validation_service.py` — `_validate_cycles`]  
- [Source: `_bmad-output/implementation-artifacts/4-5-détecter-nœuds-orphelins-non-connectés-au-graphe-fr40.md` — patterns panneau, prune diagnostics, résumé structurel]

### Architecture Compliance

- React contrôlé + mutations via store ; logique graphe côté **services** ; auth alignée sur les routes existantes.

### Library / Framework Requirements

- Pas de nouvelle dépendance attendue sauf nécessité serveur (reste FastAPI / Pydantic / React existants).

### File Structure Requirements

- Fichiers > ~300 lignes → extraction testée si le panneau grossit encore.

### Testing Requirements

- `pytest` ciblé `test_graph_validation_service`, `test_graph_validate` ; `npm --prefix frontend run lint` ; Vitest sur composants / store touchés.

### Previous Story Intelligence

- **4.5 (done)** : `GraphStructuralWarningsSummary` couvre **orphelin + inaccessible** uniquement — les **cycles** sont une extension naturelle du même patron de résumé ; **`pruneGraphValidationDiagnostics`** après delete — réutiliser pour edges si besoin ; éviter de casser les compteurs **FR40**.
- **4.4 / lore** : ne pas mélanger les filtres lore avec les filtres `cycle_id` ; sections distinctes dans le panneau.

### Git Intelligence Summary

- Derniers commits sur `Epic/04-validation-QA` : **FR40** (orphelin, sous-composants panneau), **FR39** (lore). Pour 4.6, zones chaudes **`GraphValidationPanel*`**, **`graphValidationSummary`**, **`uiSlice`**, éventuellement **schéma document** si persistance serveur.

### Latest Tech Information

- Stack stable (FastAPI, Pydantic v2, React 18, React Flow 11) — pas d’upgrade imposé pour FR41.

### Project Context Reference

- `_bmad-output/project-context.md` — documents canoniques vs graphe ; pas de logique métier dans les routers ; tests sans entités GDD réelles.

## Dev Agent Record

### Agent Model Used

Composer / Amelia (dev-story workflow)

### Debug Log References

- Vitest : `graphValidationSummary.test.ts`, `GraphValidationPanel.test.tsx`, `graphStore.documents.test.ts`, `graphStore.loreValidation.test.ts`, `pruneGraphValidationDiagnostics.test.ts`, `graphViewStore.test.ts`
- Pytest : `tests/services/test_graph_validation_service.py`, `tests/api/test_graph_validate.py` (23 passed)

### Completion Notes List

- **Task 1** : `CyclesSummary` + intégration dans `GraphStructuralWarningsSummary` ; comptage cycles = `warningSummary.cycleCount` (déjà dérivé de `summarizeGraphValidationWarnings` avec filtre intentionnel). Tests unitaires sur le comptage et `visibleCycleHighlightNodeIds`.
- **Task 2** : Persistance **`intentionalCycleIds`** dans le sidecar layout (`PUT/GET /documents/{id}/layout`) via `mergeIntentionalCycleIdsIntoLayout` / `readIntentionalCycleIdsFromLayout` ; `applyLoadResult` restaure `intentionalCycles` + synchronise `localStorage` ; `loadDialogueFromRawJson` préserve le blob layout serveur. Pas de changement router Python (layout = dict libre).
- **Task 3** : `validateGraph` + `markCycleAsIntentional` / `unmark` utilisent `visibleCycleHighlightNodeIds` pour exclure les cycles intentionnels du surlignage. Clic cycle → `navigateToValidationWarningTarget` + `graphViewStore.requestFitViewOnNodeIds` (consommé dans `GraphCanvasInner`). `pruneGraphValidationDiagnostics` : cycles incomplets + retrait des `cycle_nodes` des surlignages quand le diagnostic cycle est évincé.
- **🔵 Refactor Task 1** : extraction `CyclesSummary.tsx` (props `visibleCycleCount` seule).
- **🔵 Refactor Task 2** : module unique `layoutIntentionalCycles.ts` (clé `intentionalCycleIds`, read/merge).
- **🔵 Refactor Task 3** : `navigateToValidationWarningTarget()` dans `GraphValidationPanelLists.tsx` ; suppression du prop `reactFlowInstance` sur `GraphValidationPanel`.

### File List

- `frontend/src/utils/layoutIntentionalCycles.ts`
- `frontend/src/utils/graphValidationSummary.ts`
- `frontend/src/utils/pruneGraphValidationDiagnostics.ts`
- `frontend/src/components/graph/CyclesSummary.tsx`
- `frontend/src/components/graph/GraphStructuralWarningsSummary.tsx`
- `frontend/src/components/graph/GraphValidationPanel.tsx`
- `frontend/src/components/graph/GraphValidationPanelLists.tsx`
- `frontend/src/components/graph/GraphCanvas.tsx`
- `frontend/src/components/graph/GraphEditor.tsx`
- `frontend/src/store/graphViewStore.ts`
- `frontend/src/store/slices/uiSlice.ts`
- `frontend/src/store/slices/persistenceSlice.ts`
- `frontend/src/__tests__/graphValidationSummary.test.ts`
- `frontend/src/__tests__/GraphValidationPanel.test.tsx`
- `frontend/src/__tests__/graphStore.documents.test.ts`
- `frontend/src/__tests__/pruneGraphValidationDiagnostics.test.ts`
- `frontend/src/__tests__/graphViewStore.test.ts`
- `frontend/src/__tests__/graphStore.loreValidation.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/4-6-détecter-cycles-dans-flux-dialogue-fr41.md`

### Change Log

- 2026-04-06 : Impl FR41 — résumé cycles, persistance layout `intentionalCycleIds`, surlignage filtré, navigation cycle via `graphViewStore`, prune cycle renforcée.
- 2026-04-06 : Code review (AI) — recalcul `highlightedCycleNodes` après `validateLoreExplicit` ; entrées cycle exploitables sans `cycle_path` (libellé de repli) ; test Vitest associé.

### Senior Developer Review (AI)

**Reviewer :** Amelia (workflow code-review) · **Date :** 2026-04-06

**Périmètre :** File List story + AC #1–#7 ; exclusion `_bmad/`, `.cursor/` conformément instructions workflow.

**Preuves exécutées :** `pytest tests/services/test_graph_validation_service.py tests/api/test_graph_validate.py` → 23 passed ; `vitest` ciblés FR41 + `graphStore.loreValidation.test.ts` ; `npm --prefix frontend run lint` → 0 erreur.

**Constats adversariaux (corrigés où HIGH/MEDIUM) :**

1. **MEDIUM (corrigé)** — `validateLoreExplicit` mettait à jour `validationErrors` sans recalculer `highlightedCycleNodes` → risque de décalage surlignage / liste après fusion lore. **Fix :** `uiSlice.ts` + test `graphStore.loreValidation.test.ts`.
2. **MEDIUM (corrigé)** — `isCycle` exigeait `cycle_path` truthy : si API ou sérialisation affaiblie, pas de clic fitView ni case « intentionnel » malgré `cycle_nodes`. **Fix :** critère sur `cycle_nodes` non vide ; libellé `cycle_path ?? message`.
3. **LOW** — Surlignage cycle dans `GraphCanvas.tsx` : `border: '3px solid orange'` hors `theme` (incohérence token vs FR40 topologie).
4. **LOW** — `filterVisibleWarnings` : `cycle_detected` sans `cycle_id` ne peut pas être masqué comme intentionnel (backend fournit toujours `cycle_id` — `_validate_cycles` SHA256).
5. **LOW** — Vitest : `runValidationAfterPersist` loggue `Network Error` si validate non mockée (bruit stderr pré-existant, tests verts).
6. **INFO** — Fichiers frontend FR41 encore non suivis git dans certaines copies de travail ; la File List reste la vérité fonctionnelle jusqu’au commit utilisateur.

**Décision :** tous les AC validés sur code + tests ; aucun HIGH/MEDIUM ouvert après correctifs → statut **done**.

---

## Story completion status

**Statut :** done  
**Note :** Revue code passée ; persistance intentionnelle documentée (layout sidecar + localStorage).
