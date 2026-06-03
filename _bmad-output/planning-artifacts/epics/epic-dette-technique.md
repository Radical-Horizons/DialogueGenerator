## Epic Dette technique

Refactorings et durcissements **hors livraison fonctionnelle** : maintenabilité, tests, réduction de la complexité des composants critiques sans changement de comportement utilisateur attendu.

**Valeur :** Réduire le risque de régression sur les zones déjà livrées (ex. toolbar responsive Epic 17) et accélérer les évolutions futures.

**Dépendances :** Les stories de cet epic **supposent** le comportement produit déjà validé de l’epic source (ex. Epic 17 livré pour la story DT-1).

**Priorisation :** À traiter **après** les epics de livraison en cours (ex. Epic 4+) sauf décision PO explicite.

---

## ⚠️ GARDE-FOUS - Vérification de l'Existant (Scrum Master)

**OBLIGATOIRE avant création de chaque story :**

1. **Scope** : refactor interne uniquement — comportement utilisateur inchangé (tolérance CSS minime documentée).
2. **Tests** : exécuter la liste de tests de la story **avant** et **après** ; ajouter test anti-régression si manquant.
3. **Pas de feature creep** : ne pas mélanger correctif produit et dette dans la même PR si évitable.

---

### Story DT-1: Refactor `GraphEditorHeader` (maintenabilité) — tri-state toolbar

*Reportée depuis Epic 17 — Story 17.9 (hors périmètre livraison mobile/responsive).*

As a **développeur**,
I want **découper `GraphEditorHeader.tsx` en sous-composants et isoler la logique tri‑state (narrow/compact/full)**,
So that **les évolutions responsive/tactiles (Epic 17) restent sûres, testables, et sans réintroduire des bugs de double-mount / overflow**.

**Scope :** refactor interne uniquement (comportement utilisateur inchangé).

**Acceptance Criteria:**

- **Given** un desktop large / compact / narrow  
  **When** je redimensionne et j’utilise les actions toolbar (batch ops, auto-layout, actions, coûts, undo/redo, badge santé + save status)  
  **Then** le comportement et l’UI restent équivalents (tolérance CSS minime acceptée)

- **Given** le mode compact desktop (entre seuils “comfortable” et “compact max”)  
  **When** la toolbar bascule  
  **Then** les rangées sont explicites et testables (status puis tools), et les composants sensibles ne sont montés **qu’une seule fois**

- **Given** la base de code  
  **When** je lis/modifie la toolbar  
  **Then** `GraphEditorHeader.tsx` est significativement réduit (orchestration/wiring), et l’essentiel du JSX est dans des sous-composants dédiés

**Découpage recommandé (si besoin en plusieurs PRs/stories) :**

- **Story DT-1.A (UI extraction)** : extraire les sous-composants “presentation” (ex. `GraphToolbarStatusRow`, `GraphToolbarToolsRow`, `GraphToolbarTitleBlock`) sans changer la logique.
- **Story DT-1.B (logic extraction)** : extraire un hook/helper `useGraphToolbarTriState()` (ou équivalent) et stabiliser le contrat via tests.
- **Story DT-1.C (tests/mocks hardening)** : harmoniser les mocks partiels (`../components/shared`) et ajouter un test “anti double-mount” (`SaveStatusIndicator` unique).

**Test Plan (preuve minimale) :**

- `npm --prefix frontend test -- src/__tests__/GraphEditorHeader.desktopToolbar.test.tsx src/__tests__/GraphEditorHeader.searchRow.test.tsx src/__tests__/GraphEditorHeader.undoRedo.test.tsx src/__tests__/GraphEditor.multiSelection.test.tsx`
- `npm --prefix frontend run lint`
- **Preuve UI** : `npm run dev` puis redimensionnements full → compact → narrow → full sans scroll horizontal indésirable ni écran noir.

**Références techniques :**

- `frontend/src/components/graph/GraphEditorHeader.tsx`
- `frontend/src/hooks/useNarrowInlineSize.ts` (deux instances : seuils 640 px / 1100 px)
- `frontend/src/theme/responsiveChrome.ts` — `graphToolbarChrome`, `GRAPH_TOOLBAR_*`
- Tests existants : `GraphEditorHeader.desktopToolbar.test.tsx`, `GraphEditorHeader.searchRow.test.tsx`, `GraphEditorHeader.undoRedo.test.tsx`

**Dépend de :** Epic 17 livré (stories 17.7–17.8 — toolbar tri‑state stable en production).

---

## Synthèse dépendances stories

| Story | Dépend de |
|-------|-----------|
| DT-1 | Epic 17 done (17.7–17.8) |
