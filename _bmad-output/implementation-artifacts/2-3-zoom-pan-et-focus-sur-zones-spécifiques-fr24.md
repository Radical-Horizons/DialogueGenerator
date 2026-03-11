# Story 2.3: Zoom, pan, et focus sur zones spécifiques (FR24)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **zoomer, panner, et me concentrer sur des zones spécifiques du graphe**,
so that **je peux naviguer efficacement dans des graphes complexes et me concentrer sur des sections précises**.

## Acceptance Criteria

1. **Given** je suis dans l'éditeur de graphe  
   **When** je fais défiler la molette de la souris (ou pinch sur trackpad)  
   **Then** le graphe zoome in/out autour du curseur  
   **And** le niveau de zoom est affiché dans les contrôles (ex: "150%")

2. **Given** je veux panner le graphe  
   **When** je fais glisser avec le bouton gauche de la souris (ou espace+drag)  
   **Then** le graphe se déplace dans la direction du glissement  
   **And** la navigation reste fluide (<100ms latence, NFR-P4)

3. **Given** je veux me concentrer sur un nœud spécifique  
   **When** je double-clique sur un nœud (ou sélectionne + bouton "Focus")  
   **Then** le graphe se centre automatiquement sur ce nœud  
   **And** le nœud est zoomé à un niveau confortable (ex: 200% zoom)  
   **And** l'animation de transition est fluide (300ms)

4. **Given** je veux voir tout le graphe  
   **When** je clique sur "Fit View" (bouton dans contrôles ou Ctrl+0)  
   **Then** tout le graphe est visible dans le viewport  
   **And** le zoom est ajusté automatiquement pour afficher tous les nœuds

5. **Given** je navigue avec le clavier  
   **When** j'utilise les flèches directionnelles (ou WASD)  
   **Then** le graphe se déplace dans la direction de la flèche  
   **And** la navigation clavier est fluide (NFR-A1, 100% keyboard navigation)

## Tasks / Subtasks

- [x] Task 1: Bornes zoom et affichage niveau zoom (AC: #1)
  - [x] 1.1 (TDD) Écrire ou étendre test : ReactFlow reçoit minZoom/maxZoom ; niveau de zoom affiché dans l’UI (contrôles ou indicateur)
  - [x] 1.2 Dans `GraphCanvas.tsx`, ajouter `minZoom={0.1}` et `maxZoom={2}` sur le composant `<ReactFlow>`
  - [x] 1.3 Vérifier si les `<Controls>` React Flow affichent déjà le pourcentage de zoom ; sinon ajouter un indicateur de zoom (ex. lecture de `useStore(reactFlowStore => reactFlowStore.transform)` ou équivalent) dans la zone contrôles
  - [x] 1.4 (TDD) Exécuter tests existants `graphStore.controlledMode.test.ts` et `GraphCanvas.virtualization.test.tsx` pour régression
- [x] Task 2: Pan souris et espace+drag (AC: #2)
  - [x] 2.1 Vérifier que le pan sur le fond (pane) est déjà actif (comportement natif React Flow) ; documenter dans Dev Notes si besoin
  - [x] 2.2 Si espace+drag n’est pas géré nativement par React Flow, ajouter la logique (touche espace = mode pan temporaire) dans `GraphCanvas` ou `GraphCanvasInner`
  - [x] 2.3 (TDD) Test d’intégration : pan fluide, pas de régression sur le drag de nœuds
- [x] Task 3: Double-clic nœud → focus (AC: #3)
  - [x] 3.1 (TDD) Test : double-clic sur un nœud déclenche centrage + zoom confortable (fitView sur ce nœud avec padding/duration)
  - [x] 3.2 RÉUTILISER l’event `focus-generated-node` et le handler existant dans `GraphCanvasInner` (fitView sur le nœud) ; brancher `onNodeDoubleClick` dans `GraphCanvas.tsx` pour dispatcher cet event avec le nodeId du nœud cliqué (ou appeler directement setSelectedNode + fitView avec nodes: [node])
  - [x] 3.3 S’assurer que l’animation est fluide (duration ~300ms) et que le zoom cible est confortable (ex. padding 0.3, zoom implicite via fitView)
  - [x] 3.4 (TDD) Exécuter tests E2E ou intégration existants graphe pour régression
- [x] Task 4: Fit View et Ctrl+0 (AC: #4)
  - [x] 4.1 (TDD) Test : action "Fit View" (bouton ou raccourci) appelle `fitView()` sur l’instance React Flow ; tout le graphe visible
  - [x] 4.2 Le bouton Fit View est déjà présent dans `<Controls>` React Flow ; ajouter le raccourci clavier Ctrl+0 dans `useKeyboardShortcuts` (GraphEditor.tsx) pour appeler `reactFlowInstance.fitView()` lorsque le focus est dans l’éditeur graphe
  - [x] 4.3 S’assurer que Ctrl+0 ne conflit pas avec d’autres raccourcis (vérifier `useKeyboardShortcuts` et `allowedInInputs` si nécessaire)
- [x] Task 5: Navigation clavier flèches / WASD (AC: #5)
  - [x] 5.1 (TDD) Test : flèches (ou WASD) déplacent le viewport (pan) dans la direction correspondante ; pas de conflit avec focus dans inputs
  - [x] 5.2 Dans `GraphEditor.tsx` (ou là où les raccourcis graphe sont enregistrés), étendre `useKeyboardShortcuts` : ArrowUp, ArrowDown, ArrowLeft, ArrowRight (et optionnellement w, a, s, d) → appeler une fonction de pan (ex. `reactFlowInstance.setCenter(x, y, { zoom })` ou mise à jour viewport par delta). Ne pas déclencher quand le focus est dans un input/textarea
  - [x] 5.3 Documenter les raccourcis dans l’aide (KeyboardShortcutsHelp / tooltip GraphEditor) : Ctrl+0 Fit View, flèches/WASD pan
  - [x] 5.4 (TDD) Exécuter tests existants pour régression

## Dev Notes

- **Objectif US (vérification existant):** Zoom, pan, Controls, fitView et focus sur nœud (`focus-generated-node`) sont **déjà en place**. L’US vise un **enrichissement** : bornes min/max zoom, raccourcis clavier (flèches, WASD, Ctrl+0), et double-clic → focus explicite si pas déjà relié.
- **ÉTENDRE** `GraphCanvas.tsx` : ajouter `minZoom={0.1}` `maxZoom={2}` et raccourcis clavier zoom/pan dans `useKeyboardShortcuts` (ou dans GraphEditor si l’instance React Flow n’est disponible que là). Double-clic nœud : brancher `onNodeDoubleClick` pour réutiliser le mécanisme `focus-generated-node` + `fitView`.
- **RÉUTILISER** l’event `focus-generated-node` + `fitView` existant dans `GraphCanvasInner` (lignes 56–88) pour la fonctionnalité de focus sur nœud (double-clic).
- **Ne pas réinventer :** `<Controls>` (zoom in/out, fit view bouton), pan natif React Flow sur le pane, `fitView` dans GraphCanvasInner ; uniquement ajouter bornes, indicateur de zoom si absent, et raccourcis clavier.

### Project Structure Notes

- **Fichiers concernés :** `frontend/src/components/graph/GraphCanvas.tsx` (minZoom, maxZoom, onNodeDoubleClick), `frontend/src/components/graph/GraphCanvasInner.tsx` (déjà listener focus-generated-node), `frontend/src/components/graph/GraphEditor.tsx` (useKeyboardShortcuts : Ctrl+0, flèches, WASD), `frontend/src/hooks/useKeyboardShortcuts.ts` (format raccourcis).
- **Aucun nouveau composant** requis ; éventuel petit indicateur de zoom si les Controls ne l’affichent pas (à vérifier avec la version React Flow en place).
- **Architecture :** ADR-007 (controlled) et ADR-006 inchangés ; zoom/pan sont des interactions viewport, pas de modification du store nodes/edges.

### Architecture Compliance

- **ADR-007 (React Flow controlled):** Les nodes/edges restent dérivés du store ; minZoom/maxZoom et pan/zoom ne modifient que le viewport (transform), pas la source de vérité.
- **NFR-P4 (UI Responsiveness <100ms):** Pan et zoom doivent rester fluides ; pas de logique lourde dans les handlers clavier.
- **NFR-A1 (Keyboard Navigation 100%):** Raccourcis clavier pour Fit View (Ctrl+0) et pan (flèches / WASD) pour navigation complète au clavier.

### Library / Framework Requirements

- **React Flow (xyflow):** Utiliser les props `minZoom` et `maxZoom` sur `<ReactFlow>`. Les `<Controls>` fournissent zoom in/out et fit view ; vérifier l’API actuelle pour l’affichage du niveau de zoom (optionnel). Pan : comportement natif sur le pane ; espace+drag peut nécessiter un handler custom si non supporté.
- **useKeyboardShortcuts:** Supporte "ctrl+0", "arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d". Pour les flèches/WASD, s’assurer que le raccourci n’est actif que lorsque le focus est dans le canvas (pas dans un input) — utiliser `enabled` ou vérifier `event.target` dans le handler.

### File Structure Requirements

- Modifications limitées à : `GraphCanvas.tsx`, `GraphEditor.tsx` ; tests dans `frontend/src/__tests__/` (unit ou intégration pour zoom/pan/fitView/raccourcis).
- Réutiliser `graphStore.controlledMode.test.ts` et `GraphCanvas.virtualization.test.tsx` pour régression.

### Testing Requirements

- **Unit / intégration :** minZoom/maxZoom appliqués ; double-clic → focus (fitView sur nœud) ; Ctrl+0 → fitView ; flèches/WASD → pan (delta viewport). Ne pas déclencher flèches/WASD quand focus dans input.
- **Régression :** Tous les tests existants du graphe (controlled, virtualisation) restent verts.
- **E2E (optionnel) :** Workflow « ouvrir graphe → zoom molette → pan → double-clic nœud → Fit View Ctrl+0 → pan clavier ».

### Previous Story Intelligence

- **Story 2.2 (Naviguer grands graphes FR23):** Virtualisation active, `focus-generated-node` appelle `setHighlightedNodes([nodeId])` + `fitView` dans GraphCanvasInner ; contrat documenté pour Story 2.7. **À réutiliser :** même mécanisme pour double-clic nœud (dispatcher `focus-generated-node` avec le nodeId ou appeler le même flux).
- **Story 2.1 (Visualiser graphe FR22):** Virtualisation, Minimap, Background, Controls déjà en place. **À réutiliser :** pas de changement de source de vérité ; uniquement options viewport (minZoom, maxZoom, raccourcis).
- **Patterns établis :** Pas d’état local nodes/edges ; raccourcis dans GraphEditor via `useKeyboardShortcuts` ; instance React Flow exposée via event `reactflow-instance-ready` ou ref dans GraphEditor.

### Git Intelligence Summary

- Travail récent sur GraphCanvas, virtualisation, focus-generated-node, useKeyboardShortcuts dans GraphEditor. Respecter les patterns 2.1/2.2 et ne pas casser les tests existants.

### Latest Tech Information

- **React Flow viewport :** `setCenter`, `getViewport`, `setViewport` permettent de déplacer le viewport par programme ; pour pan clavier, appliquer un delta à la position actuelle du viewport. `fitView({ padding, duration })` pour centrage sur nœud ou tout le graphe.
- **Raccourcis clavier :** Éviter les conflits avec inputs (focus dans contenteditable, input, textarea) en vérifiant `document.activeElement` ou en enregistrant les raccourcis avec `enabled: focus dans le canvas`.

### Project Context Reference

- [Source: _bmad-output/project-context.md] — Stack frontend (React 18, TypeScript, Zustand, React Flow 11.11), règles tests (Vitest, RTL, Playwright).
- [Source: _bmad-output/planning-artifacts/epics/epic-02.md#Story-2.3] — Story 2.3 complète, AC, contraintes techniques.
- [Source: _bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md#ADR-007] — React Flow controlled.
- [Source: _bmad-output/implementation-artifacts/2-2-naviguer-dans-de-grands-graphes-500-nœuds-fr23.md] — Story 2.2 (focus-generated-node, fitView, Dev Notes).
- [Source: frontend/src/components/graph/GraphCanvas.tsx] — Lignes 414–453 : ReactFlow sans minZoom/maxZoom, Controls présent ; GraphCanvasInner lignes 56–88 : listener focus-generated-node.

## Dev Agent Record

### Agent Model Used

Cursor / BMAD dev-story workflow (Amelia)

### Debug Log References

### Completion Notes List

- **Task 1:** minZoom=0.1, maxZoom=2 sur ReactFlow ; indicateur de zoom (onMove + state viewport) affiché en bas à gauche ; tests GraphCanvas.virtualization étendus (minZoom/maxZoom, zoom UI 100%).
- **Task 2:** Pan sur le pane déjà natif React Flow ; espace+drag activé via `panActivationKeyCode="Space"` sur ReactFlow.
- **Task 3:** onNodeDoubleClick dans GraphCanvas dispatch `focus-generated-node` avec nodeId ; GraphCanvasInner réutilise le handler existant (fitView 300ms, padding 0.3, AC #3) ; test double-clic → event dispatch ajouté.
- **Task 4:** Ctrl+0 dans useKeyboardShortcuts (GraphEditor) appelle reactFlowInstance.fitView() ; pas dans allowedInInputs donc inactif dans inputs.
- **Task 5:** Flèches + WASD enregistrés dans useKeyboardShortcuts ; pan par delta (PAN_DELTA=50) via getViewport/setViewport ; enabled quand reactFlowInstance disponible ; tooltip raccourcis graphe mis à jour (Ctrl+0, Flèches/WASD, Double-clic).

### Code Review (AI) – Correctifs appliqués

- **MEDIUM (Task 4.1 / 5.1):** Ajout du fichier de tests `frontend/src/__tests__/GraphEditor.keyboard.test.tsx` : tests pour Ctrl+0 → fitView(), pan clavier (flèches, WASD), et non-déclenchement quand le focus est dans un input (AC #5).
- **LOW (AC #3):** Durée d’animation du focus sur nœud alignée sur la spec : 400 ms → 300 ms dans `GraphCanvas.tsx` (handler `focus-generated-node`).

### File List

- `frontend/src/components/graph/GraphCanvas.tsx` (modifié)
- `frontend/src/components/graph/GraphEditor.tsx` (modifié)
- `frontend/src/__tests__/GraphCanvas.virtualization.test.tsx` (modifié)
- `frontend/src/__tests__/GraphEditor.keyboard.test.tsx` (ajouté – Code Review)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modifié)
- `_bmad-output/implementation-artifacts/2-3-zoom-pan-et-focus-sur-zones-spécifiques-fr24.md` (modifié)
