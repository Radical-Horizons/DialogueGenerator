---
title: 'Story 6.1.1 — Créer des templates custom de génération (FR55)'
type: 'feature'
created: '2026-08-16'
status: 'done'
baseline_commit: '916e5200a8b4d459bf3eb22b352f61abac755f3c'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
  - '{project-root}/_bmad-output/project-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Reconfigurer instructions, contexte GDD et paramètres LLM à chaque dialogue coûte 10+ clics. Les presets sauvent déjà cette config, sans description/catégorie ni domaine templates.

**Approach:** `/api/v1/templates` (GET liste, POST créer), JSON UUID sous `data/templates/custom/`. « Enregistrer sous » ouvre un modal nom + description + catégorie + emoji + aperçu lecture seule, snapshot de la config courante. Après save, l’item apparaît dans « Mes templates », groupé par catégorie.

## Boundaries & Constraints

**Always:**
- Router dédié — GET collection + POST seulement. `TemplateService` + wiring container / dependencies / main.
- Config = composer `PresetConfiguration` + `name`, `description`, `category`, `icon`. Optionnel : `llmProvider` / `temperature` si présents dans `llmStore`.
- Snapshot à l’ouverture du modal via `getCurrentConfiguration()` (`useContextStore.getState()` + `userInstructions` courant).
- Validation GDD lazy : warnings, jamais de 4xx à la sauvegarde. Réutiliser les helpers `PresetService`.
- Auth `get_current_user` (JWT guest OK). IDs GDD seulement, jamais le corps des fiches.
- UI dans `PresetSelector` / `GenerationPanel` (disclosure modèle, 1c). Extraire `TemplateCreatorModal`. Liste dans ce chrome, pas sur le hero Générer.
- Narrow : tokens `responsiveChrome` ; pas d’overlay desktop compressé.

**Ask First:**
- Migrer `data/presets/` ou casser `/api/v1/presets`.
- Mutations en `require_non_guest`.

**Never:**
- Filtrer / rechercher la liste (6.1.2). PUT/DELETE (6.2). Appliquer au formulaire (6.3). Pré-built, anti-drop, marketplace, A/B, partage, suggestions.
- Étendre le router dialogues ; nouveau catalogue `scene_instructions` ; toucher charger / « Enregistrer » presets.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Créer (happy) | POST nom+catégorie+config | 201 ; UUID.json ; item dans GET | N/A |
| Nom manquant | POST `name` vide | 422 | validation Pydantic |
| Liste vide | GET sans fichiers | `[]` | N/A |
| Liste groupée | 3 templates, 2 catégories | GET tous ; UI groupée par `category` | N/A |
| Refs GDD obsolètes | IDs inconnus | 201 + `warnings` | pas de 4xx |
| Guest JWT | POST token guest | 201 | N/A |
| Sans auth | POST sans JWT | 401 | N/A |
| Aperçu modal | clic « Sauvegarder comme template » | 4 champs + preview RO figé | N/A |

</frozen-after-approval>

## Code Map

- `api/schemas/preset.py` -- `PresetConfiguration` à composer
- `api/schemas/template.py` -- Template / TemplateCreate / TemplateCreateResponse
- `services/preset_service.py` -- validation GDD lazy
- `services/template_service.py` -- create + list JSON UUID
- `api/routers/presets.py` -- pattern CRUD ; ne pas y ajouter les templates
- `api/routers/templates.py` -- GET + POST `/api/v1/templates`
- `api/main.py` / `container.py` / `dependencies.py` -- wiring
- `frontend/src/hooks/usePresetManagement.ts` -- snapshot
- `frontend/src/components/generation/PresetSelector.tsx` -- ancrage save + liste
- `frontend/src/components/generation/TemplateCreatorModal.tsx` -- 4 champs + aperçu RO
- `frontend/src/types/template.ts` / `api/templates.ts` / `store/templateStore.ts` -- types + client + store
- `frontend/src/store/presetStore.ts` / `api/presets.ts` / `types/preset.ts` -- patterns à copier
- `frontend/src/components/unityDialogues/CollectionManager.tsx` -- modal nom+description+emoji
- `tests/api/test_presets_crud.py` -- miroir tests
- `tests/api/test_templates_crud.py` / `tests/services/test_template_service.py` -- matrice I/O
- `frontend/src/__tests__/PresetSelector.test.tsx` / `e2e/presets-crud.spec.ts` -- non-régression
- `frontend/src/__tests__/TemplateCreatorModal.test.tsx` / `templateStore.test.ts` / `e2e/templates-create.spec.ts`

## Tasks & Acceptance

**Execution:**
- [x] `api/schemas/template.py` -- Template / TemplateCreate
- [x] `services/template_service.py` -- create + list JSON UUID ; warnings GDD
- [x] `api/routers/templates.py` + wiring -- GET + POST `/api/v1/templates`
- [x] `tests/services/test_template_service.py` + `tests/api/test_templates_crud.py` -- matrice I/O
- [x] `frontend/src/types/template.ts` + `frontend/src/api/templates.ts` -- types + client
- [x] `frontend/src/store/templateStore.ts` -- liste + create
- [x] `frontend/src/components/generation/TemplateCreatorModal.tsx` -- 4 champs + aperçu RO
- [x] `PresetSelector.tsx` -- « Sauvegarder comme template » + liste groupée (sans filtre)
- [x] `data/templates/custom/.gitkeep`
- [x] Vitest modal/store/liste ; E2E création ; lint + typecheck

**Acceptance Criteria:**
- Given une config renseignée, when « Sauvegarder comme template », then modal nom, description, catégorie, icône + aperçu lecture seule de la config snapshotée.
- Given un POST valide, when sauvegarde OK, then le template apparaît dans « Mes templates » avec nom, description et aperçu (contexte inclus).
- Given sélections GDD + params LLM, when persisté, then le JSON contient les IDs (pas les fiches) et les champs LLM du snapshot.
- Given plusieurs templates, when je consulte la liste, then ils sont groupés par catégorie.
- Given des IDs GDD obsolètes, when je sauvegarde, then 201 avec warnings.

## Design Notes

Presets charger / « Enregistrer » inchangés jusqu’à 6.3. `sceneType` peut rester `Generic`. Filtre nom/catégorie/contexte → 6.1.2.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_templates_crud.py tests/services/test_template_service.py -q` -- expected: passed
- `cd frontend && npx vitest run src/__tests__/PresetSelector.test.tsx --reporter=dot` -- expected: passed (ajouter les fichiers de test créés)
- `npm --prefix frontend run lint` -- expected: zéro erreur
- `npm --prefix frontend run typecheck` -- expected: zéro erreur

**Manual checks (if no CLI):**
- `npm run dev` → modal 4 champs + aperçu ; après save, item groupé par catégorie dans Mes templates.

## Suggested Review Order

**Contrat API**

- Point d’entrée GET/POST, auth guest JWT, 201 avec `warnings` non bloquants.
  [`templates.py:12`](../../api/routers/templates.py#L12)

- Compose `PresetConfiguration` + métadonnées ; nom strippé (whitespace → 422).
  [`template.py:18`](../../api/schemas/template.py#L18)

- Enregistrement du router dédié, pas d’extension dialogues.
  [`main.py:796`](../../api/main.py#L796)

**Persistance et validation GDD**

- UUID JSON, validation lazy via PresetService, warnings sans 4xx.
  [`template_service.py:43`](../../services/template_service.py#L43)

- Écriture atomique `.tmp` + `replace` pour éviter un GET 500.
  [`template_service.py:159`](../../services/template_service.py#L159)

- Remap d’alias GDD exposé publiquement (plus d’appel `_` privé).
  [`preset_service.py:72`](../../services/preset_service.py#L72)

**UI génération (1c)**

- Snapshot à l’ouverture : `getCurrentConfiguration` + `llmProvider`, sans température inventée.
  [`PresetSelector.tsx:74`](../../frontend/src/components/generation/PresetSelector.tsx#L74)

- Bouton « Sauvegarder comme template » dans la disclosure modèle, pas le hero Générer.
  [`PresetSelector.tsx:294`](../../frontend/src/components/generation/PresetSelector.tsx#L294)

- Liste « Mes templates » groupée par catégorie (sans filtre 6.1.2).
  [`PresetSelector.tsx:335`](../../frontend/src/components/generation/PresetSelector.tsx#L335)

- Modal 4 champs + aperçu RO ; toast d’erreur ; overlay ignoré pendant le POST.
  [`TemplateCreatorModal.tsx:57`](../../frontend/src/components/generation/TemplateCreatorModal.tsx#L57)

**État client**

- Course load/create : seq de liste + upsert par id.
  [`templateStore.ts:33`](../../frontend/src/store/templateStore.ts#L33)

**Tests**

- Matrice I/O API (201, 422, [], warnings, guest, 401).
  [`test_templates_crud.py:1`](../../tests/api/test_templates_crud.py#L1)

- E2E création : bouton obligatoire, item groupé, nettoyage FS.
  [`templates-create.spec.ts:34`](../../e2e/templates-create.spec.ts#L34)

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
