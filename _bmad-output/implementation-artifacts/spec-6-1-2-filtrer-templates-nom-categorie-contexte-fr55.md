---
title: 'Story 6.1.2 — Filtrer les templates custom (FR55)'
type: 'feature'
created: '2026-08-16'
status: 'draft'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-1-1-creer-templates-custom-generation-dialogue-fr55.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dès que la bibliothèque custom dépasse quelques items, retrouver un template par nom, catégorie ou contexte GDD n’est pas possible (6.1.1 livre seulement la liste groupée).

**Approach:** Sur la liste « Mes templates » déjà livrée, ajouter recherche / filtres (nom, catégorie, contexte). Filtrage client sur le GET existant, sauf si le volume impose un query param.

## Boundaries & Constraints

**Always:**
- Dépend de 6.1.1 (liste groupée existante). Ne pas recréer le domaine templates.
- Filtres : nom, catégorie, contexte (IDs / libellés GDD du snapshot). Aucun match → liste vide, pas d’erreur.
- Narrow : drawer / combobox plein écran (`responsiveChrome`, `TOUCH_TARGET_MIN_PX`), pas d’overlay desktop compressé.

**Ask First:**
- Ajouter des query params serveur si le filtrage client ne suffit pas.

**Never:**
- Recréer POST/create ou le modal. Appliquer un template (6.3). Éditer / supprimer (6.2). Marketplace / suggestions.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Filtre nom | 3 templates ; saisie partielle | sous-ensemble correspondant | N/A |
| Filtre catégorie | 2 catégories | une section (ou vide) | N/A |
| Filtre contexte | ID / nom personnage | templates dont le snapshot contient cet ID | N/A |
| Aucun match | filtre trop strict | liste vide, pas d’erreur | N/A |

</frozen-after-approval>

## Code Map

- `frontend/src/components/generation/PresetSelector.tsx` -- liste Mes templates (6.1.1)
- `frontend/src/store/templateStore.ts` -- liste déjà chargée
- `frontend/src/theme/responsiveChrome.ts` -- tokens narrow

## Tasks & Acceptance

**Execution:**
- [ ] Contrôles filtre nom / catégorie / contexte sur la liste 6.1.1
- [ ] Vitest des trois axes + cas aucun match ; preuve narrow si le chrome change

**Acceptance Criteria:**
- Given plusieurs templates, when je filtre par nom, catégorie ou contexte, then la liste ne montre que les correspondances.
- Given un filtre sans match, when j’applique, then liste vide sans erreur.

## Verification

**Commands:**
- `cd frontend && npx vitest run src/__tests__/PresetSelector.test.tsx --reporter=dot` -- expected: passed (tests filtre)

**Manual checks (if no CLI):**
- `npm run dev` → filtrer Mes templates sur les trois axes ; viewport étroit utilisable.
