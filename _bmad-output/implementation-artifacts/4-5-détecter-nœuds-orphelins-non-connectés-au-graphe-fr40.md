# Story 4.5 : Détecter nœuds orphelins (non connectés au graphe) (FR40)

Status: done

<!-- Note : validation optionnelle. Exécuter validate-create-story avant dev-story si besoin. -->

## Story

As a **utilisateur créant des dialogues**,
I want **détecter les nœuds orphelins (sans connexion entrante, hors entrée START)** et les traiter depuis le panneau de validation,
so that **je peux les reconnecter, les supprimer (y compris en lot) ou comprendre leur lien avec les nœuds « inaccessibles depuis START » sans ambiguïté**.

## Acceptance Criteria

1. **Given** un graphe avec plusieurs nœuds, **When** je lance la validation structurelle (même flux qu’en 4.1 / 4.2), **Then** les nœuds **sans arête entrante** (sauf le nœud d’entrée résolu : `START` ou premier nœud dialogue si pas de START) sont remontés comme **`orphan_node`** avec **nœud identifiable** pour navigation UI ; **And** le message utilisateur est **aligné** sur l’intention produit (voir note « orphelin vs inaccessible » ci-dessous).
2. **Given** un nœud `START` présent, **When** validation, **Then** START **n’est jamais** signalé comme orphelin ; **And** l’absence de sorties depuis START peut être signalée de façon **cohérente** avec les règles existantes (erreur / warning selon ce que le code fait déjà — **documenter** dans les notes de complétion si le produit demande un renforcement).
3. **Given** un orphelin listé, **When** je clique l’entrée, **Then** le graphe **focus** le nœud (pattern `graphViewStore` / `focusNode` comme pour FR36–FR37) ; **And** le surlignage validation distingue clairement **orphelin** (`orphan_node`) et **inatteignable depuis l’entrée** (`unreachable_node`) — couleurs / icônes déjà partiellement en place sur les nœuds : **vérifier** cohérence **orange** demandée par l’epic pour les orphelins.
4. **Given** je crée une connexion **vers** un nœud qui était orphelin, **When** la persistance / validation auto après mutation le permet, **Then** l’avertissement orphelin **disparaît** après revalidation (réutiliser le chemin existant `validateGraph` / hooks post-connect si présents — **ne pas** dupliquer une troisième voie).
5. **Given** plusieurs orphelins, **When** le panneau affiche le résumé, **Then** un libellé du type **« X nœuds orphelins détectés »** (ou équivalent déjà utilisé pour les compteurs warnings) reflète le **nombre affiché** après filtres éventuels ; **And** je peux **sélectionner plusieurs nœuds orphelins** (multi-sélection graphe existante) et lancer une **suppression en lot** via le mécanisme **déjà prévu** (`batchDeleteNodes` / menu batch — **étendre** l’UX pour « supprimer les orphelins sélectionnés » ou raccourci depuis le panneau si pertinent, sans casser undo/dirty).
6. **Tests** : pytest sur `_validate_orphan_nodes` (jeux de nœuds/arêtes **synthétiques**) ; API `POST .../graph/validate` inchangée contractuellement sauf **extensions additives** (messages, champs optionnels) ; Vitest sur panneau / résumé / action navigation / batch si nouveau bouton ; non-régression **FR36, FR37, FR39** (lore) et **surlignage** partagé.
7. **Clarification technique (obligatoire dans les notes de complétion)** : aujourd’hui le backend distingue **`orphan_node`** (pas d’entrée) et **`unreachable_node`** (BFS depuis l’entrée). L’epic cite parfois « accessible depuis START » pour l’orphelin — **le livrable FR40** cible la **détection sans entrée** ; si le texte utilisateur final doit dire « pas accessible depuis START », **harmoniser** copy côté UI **ou** documenter que `unreachable_node` couvre la formulation « depuis START » et `orphan_node` la coupure d’arêtes entrantes.

## Tasks / Subtasks

- [x] **Task 1** : Contrat backend + messages `orphan_node` (AC: #1, #2, #6, #7)  
  - [x] 🔴 Test échoue : pour un graphe minimal avec `START` + nœud sans cible d’edge entrante, la validation émet au moins un warning `orphan_node` avec `node_id` stable ; `START` n’en produit pas ; cas avec uniquement arêtes sortantes depuis START couvre le scénario ORPHAN du test API existant ou un nouveau cas plus strict.  
  - [x] 🟢 Ajuster si nécessaire `GraphValidationService._validate_orphan_nodes` (et tests miroir dans `tests/services/test_graph_validation_service.py`) + réponse `POST /api/v1/unity-dialogues/graph/validate` — **pas** de breaking change sur les champs existants.  
  - [x] 🔵 Refactor : si la logique « entrée du graphe » est dupliquée entre `_validate_orphan_nodes` et `_validate_unreachable_nodes`, extraire un helper privé minimal (résolution `entry_id` / `start_node_id`) **sans** fusionner les deux règles métier.

- [x] **Task 2** : Panneau validation — liste, résumé, distinction orphelin / inaccessible (AC: #1, #3, #5, #6)  
  - [x] 🔴 Test échoue : avec une réponse mockée contenant `orphan_node` et `unreachable_node`, le panneau (ou module extrait) affiche des **compteurs ou sections** distingués et un **résumé** total cohérent ; clic simulé déclenche **focus** nœud.  
  - [x] 🟢 Étendre `GraphValidationPanel` / `validationPanelLabels` / `graphValidationSummary` selon l’existant — réutiliser `getValidationHighlightKind` et les **couleurs** déjà utilisées pour warnings structurels.  
  - [x] 🔵 Refactor : si le panneau grossit encore, extraire un sous-composant « warnings graphe structurel » ou hook dédié **sans** dupliquer le filtrage des erreurs vs warnings.

- [x] **Task 3** : Flux utilisateur post-correction + suppression en lot des orphelins (AC: #4, #5, #6)  
  - [x] 🔴 Test échoue : après suppression en lot (ou connect) simulée, l’état du store ne conserve pas des warnings **stale** pour des `node_id` supprimés ; revalidation reflète la disparition de l’orphelin.  
  - [x] 🟢 Brancher **batch delete** sur la sélection courante **ou** action panneau « supprimer sélection » en réutilisant `batchDeleteNodes` / `runGraphTransaction` ; garantir **undo** + **dirty** ; enchaîner **validate** comme pour les autres corrections structurelles.  
  - [x] 🔵 Refactor : centraliser « nettoyer les diagnostics de validation pour ids absents » si la même logique existe déjà après delete nœud (éviter trois copies dans slices différents).

## Dev Notes

- **Garde-fous architecture** : validation dans **`services/graph_validation_service.py`** ; router mince **`api/routers/graph.py`** ; frontend **Zustand** + **`graphViewStore`** pour focus ; pas d’événements `window` pour le graphe.
- **Réutiliser** : `GraphValidationService.validate_graph`, types `orphan_node` / `unreachable_node`, `validationPanelLabels`, `graphValidationSummary.ts`, surlignage sur `DialogueNode` / `TestNode` / `EndNode`, tests API `tests/api/test_graph_crud.py` (`TestGraphValidate`), règles **ADR-007** (graphe contrôlé) et **mergeNodeFormIntoStoreData** si l’édition ouvre le panneau nœud.
- **Ne pas confondre** : **orphelin** = pas d’arête **entrante** ; **inatteignable** = pas dans la fermeture atteignable depuis l’entrée (peut avoir des entrées mais être sur une île). Les deux peuvent coexister ; l’UX doit les rendre **compréhensibles** sans mentir sur la sémantique.
- **Endpoint réel** : préfixe canon **`/api/v1/unity-dialogues/graph/validate`** (vérifier dans `api/routers/graph.py` — les stories précédentes ont déjà corrigé des chemins obsolètes).
- **Qualité** : pas de tests sur entités GDD réelles ; données synthétiques. Respect **`_bmad-output/project-context.md`** et T0–T3 du dépôt.

### Project Structure Notes

- Backend : `services/graph_validation_service.py`, `api/schemas/graph.py` si champs additifs, `tests/services/`, `tests/api/`.
- Frontend : `frontend/src/components/graph/GraphValidationPanel.tsx`, `validationPanelLabels.ts`, `frontend/src/utils/graphValidationSummary.ts`, store `graphStore` / `uiSlice`, `frontend/src/types/graph.ts`.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-04.md` — Story 4.5, FR40]  
- [Source: `services/graph_validation_service.py` — `_validate_orphan_nodes`, `_validate_unreachable_nodes`]  
- [Source: `_bmad-output/implementation-artifacts/4-4-signaler-incohérences-lore-potentielles-pour-review-humaine-fr39.md` — patterns panneau, non-régression lore]

### Architecture Compliance

- React contrôlé + mutations via store ; logique graphe côté **services** ; auth alignée sur les routes graphe existantes.

### Library / Framework Requirements

- Aucune nouvelle dépendance attendue pour FR40 ; React Flow / Zustand / FastAPI inchangés.

### File Structure Requirements

- Préférer extensions localisées ; fichiers > ~300 lignes → extraction testée (alignement dev-story).

### Testing Requirements

- `pytest` ciblé validation graphe + API validate ; `npm --prefix frontend run lint` ; Vitest sur panneau / store concernés ; smoke backend si touché.

### Previous Story Intelligence

- **4.4 (done)** : enrichissement **lore** (`lore_potential_ambiguity`), persistance **localStorage** warnings, filtres UI, **`GraphValidationPanel`** déjà dense — toute extension FR40 doit **isoler** les sous-sections (structurel vs lore) pour lisibilité et tests.
- **4.2 / 4.3 (review ou done)** : navigation erreur → nœud et surlignage **structurel** déjà établis ; réutiliser les mêmes hooks plutôt que nouveaux callbacks ad hoc.
- Ne pas relancer la validation lore dans le flux structurel sans décision produit.

### Git Intelligence Summary

- Commits récents sur la branche `Epic/04-validation-QA` : **FR39** (ambiguïtés lore, `summary_explicit_only`), documentation story 4-4 ; zones chaudes **`GraphValidationPanel`**, **`api/routers/graph.py`**, **`services/lore_*`**. Pour 4.5, focus **`graph_validation_service`** + panneau **structurel**.

### Latest Tech Information

- Stack stable (FastAPI, Pydantic v2, React 18, React Flow 11) — pas d’upgrade imposé pour FR40.

### Project Context Reference

- `_bmad-output/project-context.md` — chemins API Unity vs documents, tests sans GDD réel, imports Python canoniques, interdiction endpoints batch HTTP hors modèle document/graphe existant.

## Dev Agent Record

### Agent Model Used

Composer (agent Dev / Amelia — dev-story)

### Debug Log References

_(aucun incident bloquant)_

### Completion Notes List

- **AC #7 / sémantique** : UI + messages API distinguent explicitement **orphelin** (aucune arête entrante, hors nœud d’entrée résolu) et **inatteignable depuis l’entrée** (`unreachable_node`, îlot avec éventuelles entrées). La formulation « depuis START » côté produit correspond à **atteignabilité** (`unreachable_node`), pas à la coupure « sans entrée ».
- **AC #2 (START sans sorties)** : pas de nouveau type d’avertissement ; le validateur existant ne signale pas un libellé dédié « START sans sortie ». Les règles déjà en place (orphelin / inatteignable / cycles) s’appliquent ; aucun renforcement produit demandé au-delà de cette cohérence.
- **🔵 Task 1 refactor** : `_resolve_graph_entry_node_id()` au niveau module — avant : boucles dupliquées dans `_validate_orphan_nodes`, `_validate_unreachable_nodes`, `find_orphan_nodes` ; après : une seule résolution d’entrée (START puis premier nœud non-test hors END).
- **🔵 Task 2 refactor** : `GraphStructuralWarningsSummary.tsx` extrait du panneau pour le résumé orphelin / inaccessible + ligne cycles.
- **🔵 Task 3 refactor** : `pruneGraphValidationDiagnostics()` — avant : aucun nettoyage des `validationErrors` / surlignages après delete ; après : appliqué dans `deleteNode` (branche TestNode + branche principale) + retrait des ids supprimés de `selectedNodeIds`.
- **Surlignage canvas** : `getGraphTopologyWarningKind` + `GRAPH_TOPOLOGY_WARNING_STYLES` — orphelin orange (`#ff9800`), inatteignable indigo (`#5c6bc0`), priorité orphelin si les deux types coexistent sur le nœud.

### File List

- `services/graph_validation_service.py`
- `tests/services/test_graph_validation_service.py`
- `tests/api/test_graph_crud.py`
- `frontend/src/utils/graphStructuralValidation.ts`
- `frontend/src/utils/pruneGraphValidationDiagnostics.ts`
- `frontend/src/components/graph/GraphStructuralWarningsSummary.tsx`
- `frontend/src/components/graph/GraphValidationPanel.tsx`
- `frontend/src/components/graph/validationPanelLabels.ts`
- `frontend/src/components/graph/nodes/DialogueNode.tsx`
- `frontend/src/components/graph/nodes/TestNode.tsx`
- `frontend/src/store/slices/nodeSlice.ts`
- `frontend/src/__tests__/GraphValidationPanel.test.tsx`
- `frontend/src/__tests__/graphStructuralValidation.test.ts`
- `frontend/src/__tests__/pruneGraphValidationDiagnostics.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Senior Developer Review (AI)

- **Reviewer** : Amelia (workflow code-review) · **Date** : 2026-04-06  
- **Git vs File List** : hors périmètre story — modifications `.cursor/`, `.gitignore` (branche) ; pas d’écart sur les chemins applicatifs listés.  
- **Constats (adversarial)**  
  - **MEDIUM** : `missing_start` — message « Aucun nœud START trouvé » **faux** quand l’entrée implicite est un dialogue sans START (`_resolve_graph_entry_node_id`).  
  - **MEDIUM** : `GraphValidationPanel` — résumé FR40 (orphelin / inaccessible / cycles) **masqué** dès qu’une erreur existait, alors que les AC #1 / #5 exigent le résumé avec les compteurs filtrés.  
  - **LOW** : `find_unreachable_nodes(..., start_id="START")` — écart documenté vs `validate_graph` ; docstring renforcée.  
- **Correction [1]** : message API corrigé (`services/graph_validation_service.py`) ; résumé topologie affiché si compte orphelin / inaccessible / cycle > 0 même en présence d’erreurs (`GraphValidationPanel.tsx`) ; test Vitest de non-régression ; commentaire test API aligné.  
- **Verdict** : AC couverts après correctifs ; **HIGH** : 0 · **MEDIUM** résolus · **LOW** : 1 docstring.

## Story Completion Status

- **Status** : done  
- **Note** : FR40 livré : messages `orphan_node` / `unreachable_node`, tests pytest + API + Vitest, panneau (résumé, bouton suppression orphelins sélectionnés + `validateGraph`), purge diagnostics stale au delete, distinction visuelle sur `DialogueNode` / `TestNode`. Revue code-review : message `missing_start` + visibilité résumé topologie avec erreurs coexistantes.

---

**Ultimate context engine analysis completed — comprehensive developer guide created.**
