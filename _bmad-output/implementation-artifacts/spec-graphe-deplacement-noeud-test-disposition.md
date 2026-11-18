---
title: 'Graphe : déplacer un nœud de test, sauvegarder un glisser seul, disposition à l''ouverture'
type: 'bugfix'
created: '2026-11-18'
status: 'done'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un nœud de test (barre à 4 résultats) ne se déplace qu'avec son parent ; un glisser de nœud seul n'est jamais sauvegardé ; un dialogue importé sans layout (« Voknir — L'Atelier du Cartographe ») s'ouvre étiré sur 14 000 px.

**Approach:** Le layout persisté fait foi pour les barres de test qu'il positionne ; le lâcher d'un glisser seul marque le graphe à sauvegarder ; l'estimation de hauteur avant mesure porte sur l'aperçu réellement affiché.

## Boundaries & Constraints

**Always:** le choix parent reste la source de vérité des TestNodes (`testNodeSync.ts`) ; positions via layout backend uniquement ; une action = un Ctrl+Z.

**Ask First:** changer l'algorithme dagre ou l'éventail des fratries (`redistributeSiblingBranches`).

**Never:** persister des positions hors layout ; recentrer une barre déplacée à la main lors d'une simple édition.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Déplacer une barre | layout porte la barre, glisser à (900,700) | position gardée en store et dans le layout | N/A |
| Éditer le parent | barre déplacée, ligne du parent modifiée | barre reste à (900,700) | N/A |
| Nouveau test | 2ᵉ choix reçoit un test | groupe réaligné sous le parent | N/A |
| Glisser seul | frames déjà appliquées, lâcher | `hasUnsavedChanges` = true, PUT layout | N/A |
| Réplique longue | nœud non mesuré, 900 car. | hauteur estimée = aperçu (≤ 200 px) | N/A |

</frozen-after-approval>

## Code Map

- `frontend/src/utils/graphNormalizers.ts` -- `normalizeTestBars(nodes, edges, layout?)`
- `frontend/src/utils/testNodeSync.ts` -- position existante conservée ; recentrage seulement si une barre n'a pas de position stockée
- `frontend/src/store/slices/{layout,node,generation,persistence}Slice.ts` -- passent le layout
- `frontend/src/hooks/useReactFlowHandlers.ts` -- `markDirty` au lâcher d'un glisser seul
- `frontend/src/utils/dagreLayout.ts` -- estimation calée sur la carte 2e (101 px + 18 px/ligne, 40 car./ligne, aperçu 100 car.)

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/__tests__/graphStore.testNodeMove.test.ts` -- scénarios de la matrice + ajout puis glisser, test retiré puis remis, mode sans document
- [x] `frontend/src/__tests__/GraphCanvas.multiSelection.test.tsx` -- glisser seul marqué à sauvegarder
- [x] `frontend/src/__tests__/dagreLayout.test.ts` -- estimation sur l'aperçu
- [x] `frontend/src/__tests__/testNodeSync.test.ts` -- assertion « Position préservée » restaurée (retirée par `3cb76cfe1`)

**Acceptance Criteria:**
- Given le dialogue Voknir ouvert, when on glisse `test-node-node-equations-choice-1` puis on recharge, then la barre est à la position déposée (vérifié : 1980,7395 persisté).
- Given Voknir sans layout, when on l'ouvre, then le graphe fait ~8 700 px de haut (contre 14 254).

## Spec Change Log

- 2026-11-18, revue `graph-editor-reviewer` : (1) les chemins `updateNode` en mode document n'écrivaient pas le layout → une barre ajoutée restait « sans position » et le glisser suivant recollait le groupe : ils renvoient désormais `layout` ; (2) positions orphelines de barres disparues → superposition au retour d'un test : `mergeLayoutWithNodePositions` élague les clés `test-node-*` absentes ; (3) mode sans document : réalignement quand l'ensemble des barres change ; (4) multi-sélection : les barres des parents sélectionnés suivent ; (5) « Disposer » réaligne les barres comme le chargement ; (6) l'estimation compte les sauts de ligne (`pre-wrap`).

## Verification

- `npx vitest run` ciblé graphe (601 tests) et `npm --prefix frontend run typecheck`
- Preuve navigateur Playwright headless : `tmp/voknir-graph.cjs`
