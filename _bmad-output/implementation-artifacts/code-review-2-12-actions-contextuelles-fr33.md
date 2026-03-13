# Code Review — Story 2.12 (FR33) — Actions contextuelles sur nœuds (menu clic droit)

**Story:** 2-12-actions-contextuelles-sur-nœuds-menu-clic-droit-fr33.md  
**Date:** 2026-03-13  
**Reviewer:** Amelia (Dev Agent, adversarial code review)

---

## Git vs Story Discrepancies

- **Fichiers modifiés/nouveaux (git)** : `GraphCanvas.tsx`, `NodeContextMenu.tsx`, `PaneContextMenu.tsx` (nouveau), 3 fichiers de tests (nouveaux), story, sprint-status, fichiers _bmad create-story, `Assets/Dialogue/Dialogue_Unity.seq`.
- **File List story** : Tous les fichiers applicatifs listés sont bien modifiés ou créés (présents en git ou untracked). Aucune fausse déclaration.
- **Hors scope (branch tolerance)** : Fichiers dans git mais pas dans la File List (_bmad, Assets) — considérés comme travail parallèle, pas de finding "documentation".

**Git vs Story Discrepancies:** 0 (aucune incohérence critique).

---

## Résumé des findings

| Sévérité | Nombre |
|----------|--------|
| HIGH     | 2      |
| MEDIUM   | 3      |
| LOW      | 3      |

---

## CRITICAL ISSUES

- Aucune. Toutes les tâches [x] sont implémentées et les AC sont couverts par le code.

---

## HIGH ISSUES

### H1 — Inversion des arguments `applyAutoLayout` (GraphCanvas.tsx)

- **Fichier:** `frontend/src/components/graph/GraphCanvas.tsx` (ligne 419)
- **Constat:** Appel `applyAutoLayout('TB', 'dagre')`. Le store (layoutSlice) et le toolbar (useGraphToolbar) utilisent la signature **(algorithm, direction)** → `applyAutoLayout('dagre', 'TB')`.
- **Impact:** Avec `('TB', 'dagre')`, le slice reçoit `algorithm='TB'`, `direction='dagre'`. La condition `algorithm === 'dagre'` est fausse, donc le layout dagre côté client n’est jamais utilisé ; le code part en fallback backend avec des paramètres incorrects. Comportement différent du bouton toolbar.
- **Action:** Remplacer par `applyAutoLayout('dagre', 'TB')`.

### H2 — Type incorrect pour `contains()` dans le handler mousedown (GraphCanvas.tsx)

- **Fichier:** `frontend/src/components/graph/GraphCanvas.tsx` (ligne 219)
- **Constat:** `ref.current.contains(e.target as Node)` — `Node` est importé depuis `reactflow` (type nœud graphe), alors que `Element.contains()` attend un **DOM Node**.
- **Impact:** Erreur de typage TypeScript (mauvais type passé à `contains`). À l’exécution ça fonctionne car `e.target` est bien un nœud DOM, mais le code est trompeur et fragile.
- **Action:** Caster en type DOM, p.ex. `e.target as Node` en utilisant le type global DOM (renommer l’import React Flow en `ReactFlowNode` ou utiliser `e.target as EventTarget` et vérifier avec `ref.current.contains(e.target as HTMLElement)` si nécessaire).

---

## MEDIUM ISSUES

### M1 — Position de fallback si React Flow pas encore initialisé

- **Fichier:** `frontend/src/components/graph/GraphCanvas.tsx` (lignes 237–240)
- **Constat:** Si `reactFlowInstanceRef.current` est null (clic droit pane avant `onInit`), on utilise `{ x: event.clientX, y: event.clientY }` (coordonnées écran) pour `createEmptyNode(position)`.
- **Impact:** Le nœud peut être créé à une position incorrecte (espace écran au lieu de l’espace flow).
- **Action:** Soit retarder l’ouverture du menu pane jusqu’à ce que l’instance soit prête, soit utiliser une position par défaut documentée (ex. centre du viewport en coordonnées flow) au lieu de clientX/clientY.

### M2 — Pas de test pour la fermeture du menu pane avec Escape (AC #6)

- **Fichier:** `frontend/src/__tests__/GraphCanvas.paneContextMenu.test.tsx`
- **Constat:** AC #6 exige que le menu se ferme à la pression sur Escape. Aucun test ne vérifie que `keydown` Escape ferme le menu pane.
- **Action:** Ajouter un test qui ouvre le menu pane puis simule `keydown` avec `key: 'Escape'` et vérifie que le menu n’est plus rendu.

### M3 — Pas de test que "Nouveau nœud" appelle `createEmptyNode` avec la position flow

- **Constat:** Les tests d’intégration vérifient la présence du menu et la fermeture au pane click, mais pas que le clic sur "Nouveau nœud" appelle le store avec les coordonnées converties (`screenToFlowPosition`).
- **Action:** Ajouter un test (GraphCanvas ou PaneContextMenu) qui vérifie que le callback `onCreateNode` est appelé avec une position cohérente après clic sur le pane (ou mock du store et assertion sur les arguments de `createEmptyNode`).

---

## LOW ISSUES

### L1 — Comportement de fermeture du menu pane vs nœud

- **Fichier:** `frontend/src/components/graph/PaneContextMenu.tsx`
- **Constat:** `NodeContextMenu` a `onClick={onClose}` sur le conteneur racine (clic sur le fond du menu ferme). `PaneContextMenu` n’a pas d’équivalent — seul un clic sur un bouton, Escape ou pane ferme le menu.
- **Impact:** Comportement légèrement différent entre les deux menus (clic sur la zone vide du menu pane ne le ferme pas).
- **Action:** Optionnel : ajouter `onClick={onClose}` sur la div racine de `PaneContextMenu` pour alignement avec `NodeContextMenu`.

### L2 — Test manquant : fermeture par clic extérieur (mousedown document)

- **Constat:** La fermeture via `document.addEventListener('mousedown')` (clic hors du graphe) n’est pas couverte par les tests du menu pane.
- **Action:** Optionnel : ajouter un test qui simule un mousedown en dehors de `ref.current` et vérifie que le menu pane est fermé.

### L3 — Fichiers git hors File List

- **Constat:** Fichiers modifiés dans git mais pas listés dans la story : `Assets/Dialogue/Dialogue_Unity.seq`, `_bmad/.../create-story/*`. Conformément à la règle "branch tolerance", ce n’est pas considéré comme une erreur de documentation.
- **Action:** Aucune.

---

## Validation des AC (résumé)

| AC | Statut   | Preuve |
|----|----------|--------|
| #1 | IMPLEMENTED | NodeContextMenu : Éditer en première position, puis Générer, Voir le prompt, Dupliquer, Supprimer ; setSelectedNode(id) sur Éditer |
| #2 | IMPLEMENTED | handleEdit → setSelectedNode(id) + onClose() |
| #3 | IMPLEMENTED | PaneContextMenu avec "Nouveau nœud" et "Auto-layout" ; position via screenToFlowPosition + menu à clientX/clientY |
| #4 | IMPLEMENTED | createEmptyNode(paneMenu.position) + setPaneMenu(null) — **attention H1** : position correcte seulement si instance prête ; **attention** ordre applyAutoLayout (H1) |
| #5 | IMPLEMENTED | applyAutoLayout appelé puis setPaneMenu(null) — **bug H1** : arguments inversés |
| #6 | IMPLEMENTED | Escape (useEffect keydown) ferme les deux menus ; onPaneClick et mousedown document ferment les menus |

---

## Checklist Senior Developer Review

- [x] Story file loaded
- [x] Story Status = review
- [x] File List vs git validée (pas de fausses déclarations)
- [x] AC croisées avec l’implémentation
- [x] Tâches [x] vérifiées (implémentées)
- [x] Code quality / types (H2)
- [x] Comportement fonctionnel (H1 applyAutoLayout)
- [x] Qualité des tests (M2, M3, L2)
- [x] Outcome : **Approuvé** — correctifs appliqués (H1, H2, M1, M2, M3) + correctif additionnel (addNode manquant dans GraphCanvas). Status story → done.

---

## Correctifs appliqués (2026-03-13)

| Finding | Action |
|--------|--------|
| H1 | `applyAutoLayout('dagre', 'TB')` dans GraphCanvas.tsx |
| H2 | Import `Node as ReactFlowNode`, cast `e.target as globalThis.Node` |
| M1 | `position` undefined si ref null ; type `paneMenu.position` optionnel |
| M2 | Test "AC #6 : Escape ferme le menu pane" ajouté |
| M3 | Test "AC #4 : clic Nouveau nœud appelle createEmptyNode avec position" ajouté |
| — | **Bonus** : appel `addNode(node)` après `createEmptyNode()` (nœud désormais ajouté au store) |

---

_Reviewer: Amelia (Dev Agent) — 2026-03-13_
