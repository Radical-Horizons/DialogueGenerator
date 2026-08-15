---
title: 'Story 6.1.2 — Filtrer les templates custom (FR55)'
type: 'feature'
created: '2026-08-16'
status: 'done'
baseline_commit: '382140fa0c11de88a9592e0beff1d83b87b3a9ba'
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

- `frontend/src/components/generation/PresetSelector.tsx` -- section `mes-templates-list` (6.1.1) : y brancher les 3 champs
- `frontend/src/utils/templateGroups.ts` -- `groupTemplatesByCategory` ; y ajouter le filtre pur
- `frontend/src/store/templateStore.ts` -- liste déjà chargée ; ne pas y mettre la query (état UI local)
- `frontend/src/types/template.ts` -- `configuration.characters` / `locations` / `region` / `selectedSubLocations`
- `frontend/src/theme/responsiveChrome.ts` + `frontend/src/constants.ts` -- `generationPanelChrome`, `TOUCH_TARGET_MIN_PX`
- `frontend/src/components/layout/NarrowOverlayDrawer.tsx` -- drawer narrow si les champs ne tiennent pas en ligne
- `frontend/src/__tests__/templateGroups.test.ts` / `PresetSelector.test.tsx` -- étendre (pas recréer le store)

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/utils/templateGroups.ts` -- `filterTemplates(templates, { name, category, context })` (sous-chaîne insensible à la casse ; contexte = IDs/libellés du snapshot)
- [x] `frontend/src/__tests__/templateGroups.test.ts` -- 3 axes + aucun match + champs vides = liste intacte
- [x] `PresetSelector.tsx` -- 3 contrôles au-dessus de la liste groupée ; grouper le résultat filtré ; état vide distinct « aucun résultat »
- [x] Narrow : `minHeight: TOUCH_TARGET_MIN_PX` ; empiler ou `NarrowOverlayDrawer` / combobox ; pas d’overlay desktop compressé
- [x] `PresetSelector.test.tsx` -- les 4 lignes de la matrice I/O ; charger / Enregistrer / create inchangés
- [x] lint + typecheck sur le diff

**Acceptance Criteria:**
- Given plusieurs templates, when je filtre par nom, catégorie ou contexte, then la liste ne montre que les correspondances (groupes vides masqués).
- Given un filtre sans match, when j’applique, then liste vide sans erreur (pas l’état « Aucun template sauvegardé »).

## Design Notes

Filtrage **client** sur `templates` déjà en mémoire. Pas de query param (Ask First). Pipeline : `filterTemplates` puis `groupTemplatesByCategory`. Contexte : concaténer `characters`, `locations`, `region`, `subLocation`, `selectedRegion`, `selectedSubLocations` (sous-chaîne). Les 3 axes se combinent en ET. Cliquer un item ne l’applique toujours pas (6.3).

## Verification

**Commands:**
- `cd frontend && npx vitest run src/__tests__/templateGroups.test.ts src/__tests__/PresetSelector.test.tsx --reporter=dot` -- expected: passed, matrice filtre verte
- `npm --prefix frontend run lint` -- expected: zéro erreur
- `npm --prefix frontend run typecheck` -- expected: zéro erreur

**Manual checks (if no CLI):**
- `npm run dev` → Mes templates : filtrer nom / catégorie / contexte ; aucun match = message dédié ; viewport étroit = bouton Filtrer → drawer, pas d’overlay compressé.

## Suggested Review Order

**Filtre pur**

- ET nom / catégorie / contexte, sous-chaîne insensible à la casse.
  [`templateGroups.ts:58`](../../frontend/src/utils/templateGroups.ts#L58)

- Même clé que le groupement (« Sans catégorie »).
  [`templateGroups.ts:17`](../../frontend/src/utils/templateGroups.ts#L17)

- Tokens GDD du snapshot, y compris tableaux de `contextSelections`.
  [`templateGroups.ts:32`](../../frontend/src/utils/templateGroups.ts#L32)

**UI Mes templates**

- Trois champs + datalist catégories ; wrap desktop (min 9rem).
  [`PresetSelector.tsx:157`](../../frontend/src/components/generation/PresetSelector.tsx#L157)

- Narrow : bouton Filtrer 44px, pas trois champs empilés dans la colonne.
  [`PresetSelector.tsx:450`](../../frontend/src/components/generation/PresetSelector.tsx#L450)

- Drawer plein écran (`NarrowOverlayDrawer`), pas d’overlay compressé.
  [`PresetSelector.tsx:468`](../../frontend/src/components/generation/PresetSelector.tsx#L468)

**Tests**

- Matrice I/O + ET + Sans catégorie + contextSelections.
  [`templateGroups.test.ts:52`](../../frontend/src/__tests__/templateGroups.test.ts#L52)

- RTL : 4 lignes matrice, ET, drawer narrow, filtres encore visibles si aucun match.
  [`PresetSelector.test.tsx:254`](../../frontend/src/__tests__/PresetSelector.test.tsx#L254)
