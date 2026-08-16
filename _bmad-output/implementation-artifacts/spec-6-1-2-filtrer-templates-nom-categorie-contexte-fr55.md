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

### Review Findings

Revue combinée 6.1.1 + 6.1.2 (2026-08-16). Les AC des deux specs sont tenus ; les items ci-dessous sont des écarts d’implémentation / dette.

- [x] [Review][Decision] Dossier templates partagé sans `owner_id` — **tranché 2026-08-16 : garder le dossier partagé** (même modèle que les presets). Pas d’`owner_id` ni de `require_non_guest`. Le partage d’équipe reste 6.8. L’historique des dates de modification devient un patch (ci-dessous), pas `data/templates/versions/` (6.2).

- [x] [Review][Patch] Historique avec date : champ `history[]` (`at` ISO + `action` created/updated) dans le JSON custom ; à la création une entrée ; afficher la date sur la carte « Mes templates ». Pas de `versions.json` ni de diff (6.2) [`api/schemas/template.py:31`]
- [x] [Review][Patch] Course GET liste vs create : `createTemplate` incrémente `listRequestSeq` et jette le GET en vol — la liste peut ne garder que le nouvel item [`frontend/src/store/templateStore.ts:70`]
- [x] [Review][Patch] Double-clic Créer : `isCreating` est asynchrone, deux POST peuvent partir [`frontend/src/components/generation/TemplateCreatorModal.tsx:57`]
- [x] [Review][Patch] Après 201, des filtres actifs peuvent cacher le nouvel item (AC « apparaît dans Mes templates ») [`frontend/src/components/generation/PresetSelector.tsx:492`]
- [x] [Review][Patch] Narrow + drawer fermé + aucun match : critères de filtre invisibles [`frontend/src/components/generation/PresetSelector.tsx:445`]
- [x] [Review][Patch] Catégorie vide persistée en « Général » mais groupée UI en « Sans catégorie » [`services/template_service.py:58`]
- [x] [Review][Patch] Pas de `max_length` sur nom / description / catégorie / icône [`api/schemas/template.py:59`]
- [x] [Review][Patch] Modal sans Escape pour fermer [`frontend/src/components/generation/TemplateCreatorModal.tsx:43`]
- [x] [Review][Patch] Pas de test `resolvedRefs` + conservation `llmProvider` [`tests/services/test_template_service.py:224`]
- [x] [Review][Patch] `scene_protagonists` / `scene_location` (records) non aplatis pour le filtre contexte [`frontend/src/utils/templateGroups.ts:32`]
- [x] [Review][Patch] Toasts d’erreur store en anglais (`Failed to create…`) [`frontend/src/store/templateStore.ts:9`]
- [x] [Review][Patch] Pas de test filtre sur `subLocation` / `selectedRegion` seuls [`frontend/src/__tests__/templateGroups.test.ts:52`]
- [x] [Review][Patch] Toast `warnings` du modal non couvert par Vitest [`frontend/src/__tests__/TemplateCreatorModal.test.tsx:52`]

- [x] [Review][Defer] Strip GDD lazy seulement `characters`/`locations` [`services/template_service.py:91`] — deferred, pre-existing (même limite presets ; déjà au ledger 6.1.1)
