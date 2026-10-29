---
title: 'Story 6.4 — Fournir les templates pré-built Alteir (FR58)'
type: 'feature'
created: '2026-08-16'
status: 'done'
baseline_commit: '97a1dbb17aed4348619fb95de6adb152774560a7'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-3-appliquer-templates-a-generation-dialogue-fr57.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le sélecteur n’a que « Mes templates ». Sans catalogue Alteir, le cold start reste à créer un custom ou à partir de zéro.

**Approach:** Section « Templates pré-built » (7 fiches lecture seule). Clic carte → modal détail ; **Charger** applique via le chemin 6.3. **Copier vers mes templates** clone en custom sans toucher le formulaire. Badge **Nouveau** si ajout < 30 jours.

## Boundaries & Constraints

**Always:**
- 7 fiches : Salutation / première rencontre, Confrontation, Révélation narrative, Négociation, Recrutement compagnon, Cut-scene, Test de caractéristique. Carte : nom, description, `gddSystem`, aperçu d’instructions, badge Nouveau si `addedAt` < 30 j.
- Catalogue dédié versionné (pas `scene_instruction_templates.json`). Réutiliser le texte des briefs existants comme base d’instructions, enrichi des systèmes Alteir (table épic 6). Pas d’IDs personnages/lieux figés.
- Clic carte → modal (objectif, cas d’usage, exemples, instructions). **Charger** = apply 6.3 (`handleTemplateLoaded` / snapshot + validate si IDs). **Copier** (carte `stopPropagation` + modal) = POST custom `{name} (copie)` sans hydrater le formulaire. PUT/DELETE n’existent pas sur les slugs pré-built.
- Auth `get_current_user` (guest JWT OK). Routes `/prebuilt` **avant** `/{id}`. Narrow : modal existant / tokens chrome, pas d’overlay desktop compressé.

**Ask First:**
- Fusionner avec le menu « Templates de scène ».
- Épingler des IDs GDD Alteir dans le snapshot.
- Brancher `sceneTypeHint` sur le RLM Epic 15.

**Never:**
- `TemplateSelector.tsx` parallèle. Anti-drop (6.5), marketplace, A/B, partage, logs `template_id`.
- Modifier le JSON pré-built via l’UI. Casser custom CRUD / apply 6.3 / presets. Réécrire documents.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Liste | GET pré-built | 7 cartes + section ; badge si `addedAt` récent | N/A |
| Détail | clic carte | modal objectif / cas / exemples / instructions | N/A |
| Charger | bouton modal | formulaire hydraté (chemin 6.3) ; JSON pré-built intact | validate GDD comme 6.3 |
| Copier | bouton carte ou modal | item dans Mes templates ; formulaire inchangé | toast erreur POST |
| Lecture seule | PUT/DELETE slug pré-built | 404 (pas dans custom/) | HTTPException |
| Guest | GET liste + copy + charger | 200 / 201 / apply OK | N/A |
| Inconnu | GET slug absent | 404 | HTTPException |

</frozen-after-approval>

## Code Map

- `config/prebuilt_templates.json` -- 7 fiches (slugs stables, `addedAt`, `gddSystem`, `sceneTypeHint`, détails)
- `api/schemas/template.py` / `services/template_service.py` / `api/routers/templates.py` -- GET liste + GET `{slug}` ; copy = `create_template`
- `frontend/src/api/templates.ts` / `templateStore.ts` -- client + state pré-built
- `frontend/src/components/generation/PresetSelector.tsx` -- section au-dessus de Mes templates
- `frontend/src/components/generation/PrebuiltTemplateModal.tsx` -- détail + Charger / Copier
- `frontend/src/hooks/usePresetManagement.ts` -- apply pré-built sans GET UUID custom
- `tests/api/test_templates_crud.py` / Vitest PresetSelector / `e2e/templates-prebuilt.spec.ts`

## Tasks & Acceptance

**Execution:**
- [x] `config/prebuilt_templates.json` -- 7 fiches (instructions depuis catalogue scène + table GDD épic 6)
- [x] `template_service.py` + router -- `GET /prebuilt`, `GET /prebuilt/{slug}` (404) ; copy via POST custom existant
- [x] `PresetSelector.tsx` + modal -- section, badge, clic détail, Copier `stopPropagation`, Charger → apply 6.3
- [x] `usePresetManagement.ts` -- hydrater depuis le payload pré-built (pas `GET /templates/{uuid}`)
- [x] pytest / Vitest / E2E (liste, modal, charger, copier, formulaire inchangé) ; lint + typecheck

**Acceptance Criteria:**
- Given l’écran génération, when j’ouvre les réglages modèle, then la section Pré-built liste les 7 fiches Alteir avec système GDD et aperçu.
- Given une carte, when je clique, then le modal détail s’affiche ; Charger préremplit le brief ; Copier ajoute un custom sans changer le brief.
- Given un pré-built chargé puis modifié dans le formulaire, when je recharge la fiche, then l’original est inchangé.

## Design Notes

Slugs (`confrontation`, …), pas UUID — le validateur UUID de `Template` custom ne s’applique pas. Schéma pré-built à part (`gddSystem`, `sceneTypeHint`, `objectif`, `casUsage`, `examples`, `addedAt`). `sceneTypeHint` est affiché / persisté sur la fiche ; pas branché au RLM. Copy : `createTemplate` avec `configuration` du pré-built (contexte GDD vide). Badge : `now - addedAt < 30j`.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_templates_crud.py tests/services/test_template_service.py -q` -- expected: passed
- `cd frontend && npx vitest run src/__tests__/PresetSelector.test.tsx --reporter=dot` -- expected: passed
- `npm --prefix frontend run lint` -- expected: zéro erreur
- `npm --prefix frontend run typecheck` -- expected: zéro erreur

**Manual checks (if no CLI):**
- `npm run dev` → section Pré-built, modal, Charger remplit le brief, Copier apparaît dans Mes templates, Éditer absent sur pré-built.

## Suggested Review Order

**Catalogue lecture seule**

- Sept fiches Alteir versionnées, slugs stables, aucun ID GDD figé
  [`prebuilt_templates.json:1`](../../config/prebuilt_templates.json#L1)

- Schéma à part (slug, gddSystem, sceneTypeHint, addedAt) — pas l’UUID custom
  [`template.py:180`](../../api/schemas/template.py#L180)

- GET liste + GET slug avant `/{id}` ; copy = POST custom existant
  [`templates.py:87`](../../api/routers/templates.py#L87)

- Lecture fichier ; 404 slug inconnu ; PUT/DELETE UUID refuse le slug
  [`template_service.py:210`](../../services/template_service.py#L210)

**UI : section, modal, Copier**

- Section au-dessus de Mes templates ; clic carte ouvre le détail, pas l’apply
  [`PresetSelector.tsx:577`](../../frontend/src/components/generation/PresetSelector.tsx#L577)

- Copier `stopPropagation` + garde in-flight ; reset filtres comme le créateur custom
  [`PresetSelector.tsx:193`](../../frontend/src/components/generation/PresetSelector.tsx#L193)

- Modal objectif / cas / exemples / instructions ; Charger vs Copier
  [`PrebuiltTemplateModal.tsx:63`](../../frontend/src/components/generation/PrebuiltTemplateModal.tsx#L63)

**Apply 6.3 sans GET UUID**

- Snapshot pré-built → Template synthétique, puis `applyPreset`
  [`templateApply.ts:37`](../../frontend/src/utils/templateApply.ts#L37)

- Incrémente `templateLoadSeqRef` pour ignorer un GET custom encore en vol
  [`usePresetManagement.ts:260`](../../frontend/src/hooks/usePresetManagement.ts#L260)

- Branche le handler comme les presets / templates custom
  [`GenerationPanel.tsx:653`](../../frontend/src/components/generation/GenerationPanel.tsx#L653)

**Tests**

- GET 7 fiches, slug 404, PUT/DELETE slug 404, copy POST, guest
  [`test_templates_crud.py:431`](../../tests/api/test_templates_crud.py#L431)

- Liste, modal, Charger, Copier, anti double-clic
  [`PresetSelector.test.tsx:370`](../../frontend/src/__tests__/PresetSelector.test.tsx#L370)

- E2E : 7 cartes, Charger, edit+recharger JSON intact, Copier sans toucher le brief
  [`templates-prebuilt.spec.ts:48`](../../e2e/templates-prebuilt.spec.ts#L48)

