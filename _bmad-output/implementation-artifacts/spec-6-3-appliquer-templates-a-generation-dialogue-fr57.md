---
title: 'Story 6.3 — Appliquer un template à la génération (FR57)'
type: 'feature'
created: '2026-08-16'
status: 'done'
baseline_commit: 'f65f4e3ff9db15a39fd43652281015bd210dfd65'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-2-sauvegarder-editer-supprimer-templates-fr56.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les templates custom se créent, filtrent, éditent et suppriment, mais un clic sur la carte ne remplit pas le formulaire de génération — le cold start reste entier.

**Approach:** Clic sur le corps de la carte = appliquer le snapshot (instructions, contexte GDD, modèle/fournisseur). Validation GDD comme les presets (`Annuler` / `Charger quand même`). Les champs restent éditables ensuite.

## Boundaries & Constraints

**Always:**
- Clic carte → hydrater le formulaire (même chemin que `applyPreset` : ContextSelector, instructions, `llmModel` / `llmProvider`). Éditer / Supprimer inchangés (`stopPropagation`).
- Refs GDD : `GET /api/v1/templates/{id}/validate` (miroir presets). Invalide → `PresetValidationModal` existant. Annuler = no-op. Charger quand même = IDs cassés ignorés (`preparePresetForApply`).
- Template = point de départ : l’utilisateur peut modifier les champs après chargement. Ne pas réécrire documents / dialogues.
- Auth `get_current_user` (JWT guest OK), dossier partagé. GET `{id}` déjà livré (6.2) — s’en servir si la liste est stale.
- Narrow : modal existant, pas d’overlay desktop compressé.

**Ask First:**
- `require_non_guest` sur validate.
- Brancher `template_id` dans les logs de génération (reporté, choix 3A).

**Never:**
- Recréer POST/PUT/DELETE, filtres, éditeur. Nouveau `TemplateSelector.tsx` parallèle. Pré-built, marketplace, anti-drop, suggestions.
- Appeler `/presets/{id}/validate` avec un UUID template. Casser charger / Enregistrer presets. Logger `template_id` (1.15).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clic carte valide | template GDD OK | formulaire rempli ; toast succès | N/A |
| GDD obsolète | IDs inconnus | modal Annuler / Charger quand même | pas de 4xx apply |
| Annuler modal | clic Annuler | formulaire inchangé | N/A |
| Charger quand même | confirm | champs remplis ; IDs cassés omis | N/A |
| Validate inconnu | UUID absent | 404 | HTTPException |
| Guest JWT | clic + token guest | apply OK | N/A |
| Éditer / Supprimer | clic bouton | pas d’apply | N/A |

</frozen-after-approval>

## Code Map

- `api/routers/templates.py` / `services/template_service.py` -- `GET /{id}/validate` via helpers GDD presets
- `frontend/src/api/templates.ts` -- `validateTemplateApi`
- `frontend/src/hooks/usePresetManagement.ts` -- `applyPreset` + modal ; mapper Template → Preset puis `preparePresetForApply` ; `llmStore.setProvider` si snapshot
- `frontend/src/components/generation/PresetSelector.tsx` -- `onClick` carte (`template-item`)
- `frontend/src/components/generation/PresetValidationModal.tsx` -- réutiliser (libellé template si prop existante, sinon optionnel)
- `frontend/src/components/generation/GenerationPanel.tsx` -- brancher le handler comme `onPresetLoaded`
- `tests/api/test_templates_crud.py` -- validate 200/404
- `frontend/src/__tests__/PresetSelector.test.tsx` / `usePresetManagement` tests -- clic apply vs boutons
- `e2e/templates-create.spec.ts` -- cleanup FS ; nouveau `e2e/templates-apply.spec.ts`

## Tasks & Acceptance

**Execution:**
- [x] `api/routers/templates.py` + `template_service.py` -- `GET /{id}/validate` (200 + warnings / 404)
- [x] `frontend/src/api/templates.ts` -- client validate
- [x] `usePresetManagement.ts` -- charger template (validate → modal ou apply) + provider LLM
- [x] `PresetSelector.tsx` -- clic carte applique ; Éditer/Supprimer no-apply
- [x] `GenerationPanel.tsx` -- brancher le handler
- [x] Vitest apply/modal/boutons ; pytest validate ; E2E clic → formulaire rempli ; lint + typecheck

**Acceptance Criteria:**
- Given un template listé, when je clique la carte, then instructions, contexte GDD et modèle sont préremplis et je peux générer ou modifier.
- Given des refs GDD cassées, when je clique, then le modal propose Annuler (rien) ou Charger quand même (IDs omis).
- Given Éditer ou Supprimer, when je clique le bouton, then le formulaire n’est pas appliqué.

## Design Notes

Ne pas forker `applyPreset` : construire un `Preset` synthétique depuis le template (id, name, icon, metadata, configuration) puis `preparePresetForApply`. `llmProvider` se pose sur `llmStore` après, ce n’est pas un champ preset. Route validate **avant** ou distincte de `/{id}` (chemin `/{id}/validate`).

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_templates_crud.py tests/services/test_template_service.py -q` -- expected: passed
- `cd frontend && npx vitest run src/__tests__/PresetSelector.test.tsx --reporter=dot` -- expected: passed (ajouter tests apply / hook)
- `npm --prefix frontend run lint` -- expected: zéro erreur
- `npm --prefix frontend run typecheck` -- expected: zéro erreur

**Manual checks (if no CLI):**
- `npm run dev` → clic carte remplit brief + contexte + modèle ; Annuler du modal laisse l’écran ; Éditer n’applique pas.

## Suggested Review Order

**Apply path**

- Clic carte → GET frais + validate, ignore les réponses périmées
  [`usePresetManagement.ts:233`](../../frontend/src/hooks/usePresetManagement.ts#L233)

- Preset synthétique puis `applyPreset` ; `setProvider`/`setModel` après
  [`usePresetManagement.ts:199`](../../frontend/src/hooks/usePresetManagement.ts#L199)

- Mapping Template → Preset sans `llmProvider`/`temperature`
  [`templateApply.ts:15`](../../frontend/src/utils/templateApply.ts#L15)

- Branche le handler comme les presets
  [`GenerationPanel.tsx:652`](../../frontend/src/components/generation/GenerationPanel.tsx#L652)

- Corps de carte = apply ; Éditer/Supprimer `stopPropagation`
  [`PresetSelector.tsx:626`](../../frontend/src/components/generation/PresetSelector.tsx#L626)

**GDD validate**

- `GET /{id}/validate` avant `GET /{id}`, sans muter le JSON
  [`templates.py:87`](../../api/routers/templates.py#L87)

- Réutilise `validate_preset_references` via Preset temporaire
  [`template_service.py:183`](../../services/template_service.py#L183)

- Client dédié (pas `/presets/{id}/validate`)
  [`templates.ts:75`](../../frontend/src/api/templates.ts#L75)

- « Charger quand même » omet aussi `contextSelections`
  [`presetUtils.ts:131`](../../frontend/src/utils/presetUtils.ts#L131)

- Même modal Annuler / Charger quand même, libellé template
  [`PresetValidationModal.tsx:42`](../../frontend/src/components/generation/PresetValidationModal.tsx#L42)

**Tests**

- Validate 200 / 404 / obsolète non muté / guest
  [`test_templates_crud.py:373`](../../tests/api/test_templates_crud.py#L373)

- Apply, modal, GET stale, IDs omis
  [`usePresetManagement.templates.test.ts:145`](../../frontend/src/__tests__/usePresetManagement.templates.test.ts#L145)

- E2E clic carte remplit le brief ; Éditer n’applique pas
  [`templates-apply.spec.ts:116`](../../e2e/templates-apply.spec.ts#L116)
