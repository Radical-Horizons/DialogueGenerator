---
title: 'Story 6.2 — Éditer et supprimer les templates custom (FR56)'
type: 'feature'
created: '2026-08-16'
status: 'done'
baseline_commit: '89f5a7b030c610df1f63b9f6d1578bd7833c183e'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-6-1-1-creer-templates-custom-generation-dialogue-fr55.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La bibliothèque custom se crée et se filtre (6.1) mais un item ne peut ni être corrigé ni retiré. Les dates `history[]` existent déjà ; il manque PUT/DELETE et l’UI.

**Approach:** `GET`/`PUT`/`DELETE /api/v1/templates/{id}` sur le même JSON UUID. Modal d’édition (métadonnées + instructions, snapshot remplaçable) et suppression avec `ConfirmDialog`. Un PUT ajoute une entrée `history` `updated` et met à jour `metadata.modified`.

## Boundaries & Constraints

**Always:**
- Même fichier UUID : pas de duplication. 404 si l’id n’existe pas. DELETE → 204. PUT → 200 + `warnings` GDD lazy (jamais 4xx).
- Auth `get_current_user` (JWT guest OK), dossier partagé `data/templates/custom/` (décision 6.1).
- `max_length` identiques à la création. Nom strippé vide → 422.
- UI « Mes templates » : actions Éditer / Supprimer par carte (`TOUCH_TARGET_MIN_PX`), pas d’application au formulaire.
- Édition : champs nom, description, catégorie, icône, instructions pré-remplis ; contexte / LLM en aperçu RO + bouton « Remplacer par la config actuelle » (même snapshot que 6.1.1). Timeline `history[]` dans le modal.
- Suppression : `ConfirmDialog` « Supprimer ce template ? » ; Annuler ne change rien.
- Narrow : `responsiveChrome` / `ConfirmDialog` existant, pas d’overlay desktop compressé.
- Ne pas réécrire les documents / dialogues existants.

**Ask First:**
- Sidecar `data/templates/versions/{id}/versions.json` (diff / snapshots complets — optionnel dans l’épic).
- `require_non_guest` sur PUT/DELETE.

**Never:**
- Recréer POST/liste/filtres. Appliquer au formulaire (6.3). Pré-built, marketplace, partage.
- Embedder le ContextSelector dans le modal. Casser charger / Enregistrer presets.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| GET id | UUID existant | 200 template | N/A |
| GET inconnu | UUID absent | 404 | HTTPException |
| PUT métadonnées | nom+desc, même id | 200 ; fichier inchangé d’id ; `history` + `updated` | N/A |
| PUT nom vide | `name` espaces | 422 | Pydantic |
| PUT GDD obsolète | IDs inconnus | 200 + `warnings` | pas de 4xx |
| DELETE | UUID existant | 204 ; fichier parti ; plus dans GET | N/A |
| DELETE inconnu | UUID absent | 404 | HTTPException |
| Guest JWT | PUT/DELETE token guest | 200 / 204 | N/A |
| Annuler suppression | ConfirmDialog Annuler | item toujours là | N/A |

</frozen-after-approval>

## Code Map

- `api/schemas/template.py` -- `TemplateUpdate` ; réutiliser `Template` / `history`
- `services/template_service.py` -- get / update (append `updated`) / delete ; écriture atomique existante
- `api/routers/templates.py` -- miroir presets GET/PUT/DELETE `/{id}`
- `frontend/src/api/templates.ts` / `types/template.ts` / `store/templateStore.ts` -- client + upsert / retrait liste
- `frontend/src/components/generation/TemplateCreatorModal.tsx` -- patterns (Escape, garde, maxLength)
- `frontend/src/components/generation/TemplateEditorModal.tsx` -- prérempli + timeline + snapshot optionnel
- `frontend/src/components/generation/PresetSelector.tsx` -- Éditer / Supprimer sur `template-item`
- `frontend/src/components/shared/ConfirmDialog.tsx` -- `variant="danger"`
- `tests/api/test_templates_crud.py` / `tests/services/test_template_service.py` -- matrice I/O
- `frontend/src/__tests__/PresetSelector.test.tsx` -- non-régression create/filtre
- `e2e/templates-create.spec.ts` -- cleanup FS à réutiliser

## Tasks & Acceptance

**Execution:**
- [x] `api/schemas/template.py` -- `TemplateUpdate` (optionnels, mêmes `max_length`)
- [x] `services/template_service.py` -- get / update (même UUID, `history` + `modified`, warnings GDD) / delete
- [x] `api/routers/templates.py` -- GET/PUT/DELETE `/{id}` (404, 204, 200+warnings, guest)
- [x] `tests/api/test_templates_crud.py` + `tests/services/test_template_service.py` -- matrice I/O
- [x] `frontend/src/api/templates.ts` + `types/template.ts` + `store/templateStore.ts` -- client + update/delete
- [x] `TemplateEditorModal.tsx` -- prérempli, timeline, remplacer snapshot, Escape / garde POST
- [x] `PresetSelector.tsx` -- Éditer / Supprimer + `ConfirmDialog` ; cartes toujours no-op pour 6.3
- [x] Vitest editor/store/liste ; E2E édition + suppression ; lint + typecheck

**Acceptance Criteria:**
- Given un template listé, when Éditer puis enregistrer, then le même id est mis à jour (pas de second fichier) et la carte reflète nom / date.
- Given un template listé, when Supprimer et confirmer, then il disparaît de la liste et du disque.
- Given un PUT, when je rouvre l’éditeur, then la timeline montre une entrée `updated` datée.

## Design Notes

Ne pas forker `PresetSelector` delete inline (overlay ad hoc presets) : `ConfirmDialog` partagé. Snapshot « config actuelle » = `captureTemplateSnapshot()` déjà utilisé à la création. Timeline = `history[]` existant, pas un second store.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_templates_crud.py tests/services/test_template_service.py -q` -- expected: passed
- `cd frontend && npx vitest run src/__tests__/PresetSelector.test.tsx src/__tests__/templateStore.test.ts --reporter=dot` -- expected: passed (ajouter le fichier editor)
- `npm --prefix frontend run lint` -- expected: zéro erreur
- `npm --prefix frontend run typecheck` -- expected: zéro erreur

**Manual checks (if no CLI):**
- `npm run dev` → Éditer préremplit ; PUT met à jour la carte ; Supprimer + confirmer retire l’item ; Annuler le laisse.

## Suggested Review Order

**API CRUD par UUID**

- Point d’entrée PUT : même fichier, 200 + warnings GDD, 404 si absent.
  [`templates.py:110`](../../api/routers/templates.py#L110)

- GET et DELETE miroir presets (200 / 404 / 204).
  [`templates.py:85`](../../api/routers/templates.py#L85)

- Payload partiel, `max_length` et nom strippé vide → 422.
  [`template.py:138`](../../api/schemas/template.py#L138)

**Persistance et historique**

- Update in-place : append `history.updated`, `metadata.modified`, refuse d’écrire si le fichier a disparu.
  [`template_service.py:123`](../../services/template_service.py#L123)

**Éditeur et snapshot**

- Modal prérempli, instructions éditables, aperçu RO, remplacement de snapshot, timeline.
  [`TemplateEditorModal.tsx:39`](../../frontend/src/components/generation/TemplateEditorModal.tsx#L39)

- Store : upsert PUT, retrait DELETE + invalidation GET concurrent.
  [`templateStore.ts:109`](../../frontend/src/store/templateStore.ts#L109)

**Liste « Mes templates »**

- Boutons Éditer / Supprimer sur la carte (pas d’application au formulaire).
  [`PresetSelector.tsx:680`](../../frontend/src/components/generation/PresetSelector.tsx#L680)

- Modal keyed + reset filtres après save ; ConfirmDialog danger.
  [`PresetSelector.tsx:497`](../../frontend/src/components/generation/PresetSelector.tsx#L497)

**Tests**

- Matrice I/O API (GET/PUT/DELETE, guest, GDD, nom vide).
  [`test_templates_crud.py:264`](../../tests/api/test_templates_crud.py#L264)

- Vitest éditeur / liste / store + E2E édition et Annuler suppression.
  [`templates-edit.spec.ts:55`](../../e2e/templates-edit.spec.ts#L55)

