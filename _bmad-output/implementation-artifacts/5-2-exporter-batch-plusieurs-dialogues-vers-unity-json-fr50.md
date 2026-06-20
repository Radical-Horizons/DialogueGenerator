# Story 5.2: Exporter batch plusieurs dialogues vers Unity JSON (FR50)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur gérant plusieurs dialogues**,
I want **exporter plusieurs dialogues en batch vers Unity JSON**,
so that **je peux intégrer toute ma bibliothèque de dialogues en une seule opération**.

## Acceptance Criteria

1. **Given** plusieurs dialogues sont listés dans le panneau bibliothèque (`UnityDialogueList`), **When** je sélectionne plusieurs entrées (checkboxes) et clique sur « Exporter batch », **Then** chaque dialogue sélectionné est exporté vers le répertoire Unity (`unity_dialogues_path`), **And** un indicateur de progression affiche « Export batch : 3/10 dialogues », **And** chaque dialogue est validé contre le schéma Unity (`validate_unity_json`) **avant** écriture disque (comportement par défaut, aligné Story 5.1).
2. **Given** un dialogue du batch échoue la validation, **When** l'export batch continue, **Then** les dialogues valides sont exportés normalement, **And** les échecs sont listés « X dialogues non exportés : [liste] » avec erreurs par fichier, **And** je peux relancer un export batch sur la sélection des seuls échecs.
3. **Given** l'export batch se termine, **When** tous les traitements sont faits, **Then** un résumé s'affiche « Export batch terminé : X dialogues exportés, Y échecs », **And** les fichiers JSON valides sont présents dans le répertoire Unity (écriture atomique ADR-006, même service que Story 5.1).
4. **Given** j'ouvre « Options export batch », **When** je configure validation avant export (on/off) et le format de nom de fichier (slug titre vs filename existant), **Then** les options sont persistées en `localStorage` (clé dédiée) pour les prochains exports, **And** le chemin destination reste `unity_dialogues_path` (ConfigurationService — pas de nouveau panneau settings global ; AC chemin identique Story 5.1).
5. **Given** un export batch est en cours, **When** je clique « Arrêter », **Then** les dialogues déjà exportés restent sur disque (pas de rollback), **And** les dialogues restants ne sont pas traités, **And** le résumé partiel indique combien ont été exportés avant l'arrêt.
6. **Tests** : pytest service + API batch (succès partiel, validation bloquante, chemin Unity null) ; Vitest sélection multi + progression + annulation ; lint frontend 0 régression ; pas de suite Vitest complète obligatoire.

## Tasks / Subtasks

- [x] Task 1 : Sélection multiple et lancement export batch avec progression (AC: #1)
  - [x] 🔴 Test échoue : dans `UnityDialogueList` (ou panneau batch dédié), cocher 3 dialogues + « Exporter batch » → UI affiche « Export batch : 1/3 » puis « 2/3 » puis « 3/3 » ; chaque dialogue valide déclenche une écriture serveur (mock API)
  - [x] 🟢 Implémenter mode sélection multi (checkboxes + « Tout sélectionner » filtré) et orchestration batch côté UI + endpoint backend batch (voir Dev Notes)
  - [x] 🔵 Refactor : extraire la barre d'actions batch (boutons Exporter / Arrêter / Options) dans un composant enfant léger plutôt que d'alourdir `UnityDialogueList` — clarifier les noms de props (`selectedFilenames` vs `checkedDocumentIds`)

- [x] Task 2 : Échecs partiels — continuer et lister les dialogues invalides (AC: #2)
  - [x] 🔴 Test échoue : batch de 3 dont 1 invalide schéma → 2 fichiers écrits, 1 entrée dans la liste d'échecs avec message validation ; bouton « Réexporter les échecs » pré-sélectionne uniquement le dialogue en échec
  - [x] 🟢 Implémenter agrégation résultats `{ exported[], failed[] }` dans le service batch et affichage liste d'erreurs (réutiliser pattern toast + panneau erreurs Story 5.1 si pertinent)
  - [x] 🔵 Refactor : factoriser le mapping erreur validation → libellé utilisateur avec `graphApiErrors.ts` / messages export Story 5.1 ; nommer les cas pytest d'après le comportement (`test_batch_export_continues_after_single_validation_failure`)

- [x] Task 3 : Résumé de fin de batch (AC: #3)
  - [x] 🔴 Test échoue : batch 2 succès + 1 échec → toast ou bannière « Export batch terminé : 2 dialogues exportés, 1 échec » visible après la dernière itération
  - [x] 🟢 Implémenter composant résumé batch (modal ou bannière dismissible) avec compteurs exportés/échecs/annulés
  - [x] 🔵 Refactor : unifier les libellés français succès/échec batch avec ceux de l'export single (`Dialogue exporté : …`) pour cohérence UX ; clarifier les assertions Vitest (compteurs vs texte exact)

- [x] Task 4 : Options export batch persistées (AC: #4)
  - [x] 🔴 Test échoue : désactiver « Valider avant export » → dialogue invalide schéma est quand même écrit (option off) ; réactiver → export bloqué ; options survivent au rechargement page (`localStorage`)
  - [x] 🟢 Implémenter panneau « Options export batch » (validation on/off, stratégie nom fichier) consommé par le service batch backend via payload
  - [x] 🔵 Refactor : typer les options batch dans un module partagé (`batchExportOptions.ts`) avec valeurs par défaut documentées ; éviter duplication des clés `localStorage` en string magique

- [x] Task 5 : Annulation batch sans rollback (AC: #5)
  - [x] 🔴 Test échoue : lancer batch 5 dialogues, cliquer « Arrêter » après le 2e → exactement 2 écritures disque, résumé partiel « 2 exportés, annulé », pas d'appel pour les 3 restants
  - [x] 🟢 Implémenter signal d'annulation (`AbortController` frontend + flag annulation côté service si batch serveur monolithique)
  - [x] 🔵 Refactor : si boucle batch frontend, centraliser la gestion abort dans un hook `useBatchUnityExport` (miroir `useUnityExport`) ; clarifier nommage des états `isBatchExporting` / `batchProgress`

## Dev Notes

### Écart actuel vs cible (ne pas réinventer)

| Composant | État actuel | Action attendue |
|-----------|-------------|-----------------|
| `UnityDialogueList` | Sélection simple (1 dialogue), pas de checkboxes | Ajouter mode multi-sélection + actions batch |
| `useUnityExport` | Export **graphe ouvert** : validate → `saveGraphAndWrite` | **Ne pas** réutiliser tel quel — batch = dialogues **persistés** (document `{schemaVersion,nodes}` sur disque) |
| `POST /api/v1/dialogues/unity/export` | Export JSON déjà sérialisé (Story 5.1) | Réutiliser `write_unity_dialogue_to_file` + `unity_export_schema_validator` |
| `POST .../graph/save-and-write` | Graphe React Flow → Unity | Hors scope batch (sauf export du dialogue **courant** déjà couvert 5.1) |
| `BatchExportService` | **N'existe pas** | Créer dans `services/` — boucle par `document_id`, erreurs individuelles |
| `BatchExportPanel.tsx` | **N'existe pas** | Epic le nomme ; peut être intégré au panneau liste ou modal — éviter duplication avec `GraphEditorHeader` |
| Logs export structurés | Story 5.6 backlog | **Hors scope complet** : prévoir hook/extension point (`export_result` metadata) sans implémenter `ExportLogService` |

### Décision d'architecture batch (SM)

- **Source de vérité export batch** : fichiers document persistés `{document_id}.json` sous `unity_dialogues_path` (même base que API documents — voir `_resolve_document_base` dans `api/routers/documents.py`). Les `document_id` listés par `GET /api/v1/unity-dialogues` (`filename` sans extension) sont les identifiants batch.
- **Pas de conversion graphe** pour le batch : le blob document canonique est déjà `{ schemaVersion, nodes }`. Pipeline par item : lire JSON → extraire `nodes` → `validate_unity_json` (si option active) → `write_unity_dialogue_to_file`.
- **Progression UI** : privilégier **orchestration frontend séquentielle** appelant un endpoint batch unitaire **ou** un endpoint batch retournant résultats agrégés avec progression simulée côté client (KISS). N'introduire SSE/job manager que si latence batch > quelques secondes en tests réels — pattern SSE existe (`GenerationJobManager`) mais surdimensionné pour MVP batch fichiers locaux.
- **Endpoint recommandé** : `POST /api/v1/dialogues/batch-export` body `{ document_ids: string[], skip_validation?: boolean, filename_strategy?: "slug"|"preserve" }` → `{ exported: [...], failed: [{ id, errors }], cancelled?: boolean }`. Handler ≤ 30 lignes dans `api/routers/dialogues.py`, logique dans `services/batch_export_service.py`.

### Architecture guardrails

- **Documents vs graphe** : batch n'exporte pas l'état non sauvegardé de l'éditeur ouvert. Message UX si `hasUnsavedChanges` sur le dialogue courant : inviter à sauvegarder avant batch incluant ce fichier.
- **Validation** : même validateur que Story 5.1 (`unity_export_schema_validator` / `validate_unity_json`). Option « skip validation » = opt-in explicite (AC #4), défaut = bloquant par item.
- **Écriture** : réutiliser `write_unity_dialogue_to_file` (ADR-006, UTF-8, `ensure_ascii=False`). **Ne pas** envoyer `seq` (leçon code review 5.1 — skip d'écriture silencieux).
- **Handlers API** : ≤ 30 lignes ; injection `ConfigurationService` via `Depends`.
- **TestNodes** : exclusion identique Story 5.1 si conversion intermédiaire ; document canonique ne contient normalement pas de testNode.

### What to reuse

- **Backend** : `services/unity_dialogue_export_service.write_unity_dialogue_to_file`, `unity_export_schema_validator`, `api/utils/unity_schema_validator.validate_unity_json`, lecture document `_read_document_blob` (extraire helper partagé si duplication)
- **Frontend** : `useDialogueListData`, `UnityDialogueList`, `UnityDialogueItem`, messages `EXPORT_VALIDATION_BLOCKED_MESSAGE` / `UNITY_PATH_UNAVAILABLE_MESSAGE` depuis Story 5.1, `graphApiErrors.ts`
- **Patterns UX** : progression batch similaire `AIGenerationPanel` (`batchProgress.current/total`), annulation via `AbortController`

### Quality bar

- pytest : batch 3 OK ; 1 invalide + 2 OK ; chemin Unity null → échec global clair ; option skip_validation
- Vitest : checkboxes, progression, arrêt, options localStorage, résumé final
- Pas d'entités GDD réelles dans les fixtures
- NFR-P3 : batch unitaire (1 dialogue) reste < 200 ms ; batch N peut dépasser — documenter latence N=10 en test integration (warning log, pas blocker CI)

### Refactor bar (defaults)

- ~300 lignes max par fichier source touché ; ~60 lignes par fonction
- Nouveau code batch dans modules dédiés, pas dans `GraphEditorHeader` (1577 L)

### Fichiers chauds

| Fichier | Taille actuelle | Contrainte |
|---------|-----------------|------------|
| `frontend/src/components/graph/GraphEditorHeader.tsx` | **1577 L** | **Aucune** logique batch ici — bouton batch vit dans panneau liste ou toolbar liste |
| `api/routers/dialogues.py` | **604 L** | Handler batch ≤ 30 L ; déléguer à `BatchExportService` |
| `frontend/src/components/unityDialogues/UnityDialogueList.tsx` | 208 L | Accueillir checkboxes + barre actions ; si > 350 L → extraire `BatchExportToolbar.tsx` |
| `services/unity_dialogue_export_service.py` | 160 L | Réutiliser tel quel ; pas de gonfler avec logique batch |

### Conventions

- snake_case backend / camelCase frontend
- Messages UI en français
- `document_id` = clé sans `.json`, aligné `UnityDialogueMetadata.filename`

### Project Structure Notes

- Nouveau : `services/batch_export_service.py`, `tests/services/test_batch_export_service.py`, `tests/api/test_batch_export_story_5_2.py`
- Frontend : `frontend/src/hooks/useBatchUnityExport.ts`, `frontend/src/components/unityDialogues/BatchExportToolbar.tsx` (ou `BatchExportPanel.tsx`), tests Vitest associés
- Schéma API : ajouter modèles Pydantic dans `api/schemas/dialogue.py` ; client `frontend/src/api/dialogues.ts`

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-05.md` — Story 5.2, FR50]
- [Source: `_bmad-output/implementation-artifacts/5-1-exporter-dialogue-single-vers-format-unity-json-fr49.md` — validateur unifié, seq skip, fichiers créés]
- [Source: `services/unity_dialogue_export_service.py` — write_unity_dialogue_to_file]
- [Source: `api/routers/documents.py` — `_resolve_document_base`, stockage document = unity path]
- [Source: `api/routers/unity_dialogues.py` — listing métadonnées]
- [Source: `frontend/src/hooks/useDialogueListData.ts` — source liste partagée]
- [Source: `_bmad-output/project-context.md` — format document canonique, tests sans GDD réel]

### Previous story intelligence (Story 5.1 — prérequis direct)

- Export single : `useUnityExport` → `validateSchema` → `saveGraphAndWrite` sans `seq`.
- Validateur unique `validate_unity_json` injecté via `unity_export_schema_validator`.
- Helpers frontend : `buildGraphApiPayload.ts`, `graphApiErrors.ts`.
- Code review : ne jamais passer `clientSeq` sur export explicite ; tester chemin Unity null côté pytest.
- Fichiers chauds : ne pas toucher `GraphEditorHeader` pour nouvelle logique — hooks dédiés.

### Git intelligence (commits récents)

- Branche `Epic/05-unity-export` ; Story 5.1 done dans sprint-status ; commits récents orientés CI/tests — exécuter pytest/Vitest ciblés post-implémentation.

### Latest tech information

- Schéma dialogue **v1.2.0** — validateur structuré inchangé pour batch.
- `ConfigurationService.set_unity_dialogues_path` toujours désactivé — destination fixe projet.
- Pas de nouvelle dépendance npm requise pour options (localStorage natif).

### Project context reference

- `_bmad-output/project-context.md` — documents canoniques, Unity JSON, injection DI, handlers courts.

## Dev Agent Record

### Agent Model Used

claude-4.6-sonnet-medium-thinking (Cursor Agent)

### Debug Log References

- Fixtures pytest : ajout `targetNode` sur choices (schéma v1.2.0) pour documents valides batch
- Annulation batch : comptabiliser l'export en cours avant `break` sur signal abort (AC #5)

### Completion Notes List

- **Task 1** : `BatchExportService` + `POST /api/v1/dialogues/batch-export` ; checkboxes `UnityDialogueItem` ; orchestration séquentielle `useBatchUnityExport` ; `BatchExportToolbar` extrait
- **Task 2** : agrégation `{ exported, failed }` ; `formatBatchFailuresSummary` dans `graphApiErrors.ts` ; pytest `test_batch_export_continues_after_single_validation_failure`
- **Task 3** : `BatchExportSummaryBanner` + toast `formatBatchExportSummary` ; Vitest compteurs résumé
- **Task 4** : `batchExportOptions.ts` + panneau options + `skip_validation` backend ; Vitest localStorage
- **Task 5** : `AbortController` dans `useBatchUnityExport` ; états `isBatchExporting` / `batchProgress` ; Vitest annulation 2/3
- **🔵 Refactor Task 1** : `BatchExportToolbar.tsx` — props `checkedCount` / `filteredCount` (ex- confusion selectedFilenames)
- **🔵 Refactor Task 2** : `formatBatchExportFailureLabel` + `formatBatchFailuresSummary` — avant : erreurs brutes non formatées
- **🔵 Refactor Task 3** : libellés centralisés `formatBatchExportSummary` / `formatBatchExportProgress` dans `batchExportOptions.ts`
- **🔵 Refactor Task 4** : clé `BATCH_EXPORT_OPTIONS_STORAGE_KEY` constante exportée
- **🔵 Refactor Task 5** : hook dédié `useBatchUnityExport.ts` (miroir `useUnityExport.ts`)

### Code Review Fixes (2026-06-16)

- **H1** : `preserve_source_fields=True` sur `write_unity_dialogue_to_file` — batch conserve `title`, `dialogueFlags`, etc.
- **M1** : garde `hasUnsavedChanges` dans `UnityDialogueList` avant export batch
- **M2** : pytest `test_batch_export_slug_filename_from_title`
- **M3** : `batch_export_documents` attrape `OSError` + `JSONDecodeError` par item
- **M4** : checkbox batch sœur du bouton (plus d’imbrication interactive)

### File List

- `services/batch_export_service.py` (new)
- `tests/services/test_batch_export_service.py` (new)
- `tests/api/test_batch_export_story_5_2.py` (new)
- `api/schemas/dialogue.py` (modified)
- `api/routers/dialogues.py` (modified)
- `frontend/src/utils/batchExportOptions.ts` (new)
- `frontend/src/utils/graphApiErrors.ts` (modified)
- `frontend/src/hooks/useBatchUnityExport.ts` (new)
- `frontend/src/components/unityDialogues/BatchExportToolbar.tsx` (new)
- `frontend/src/components/unityDialogues/BatchExportSummaryBanner.tsx` (new)
- `frontend/src/components/unityDialogues/UnityDialogueList.tsx` (modified)
- `frontend/src/components/unityDialogues/UnityDialogueItem.tsx` (modified)
- `frontend/src/api/dialogues.ts` (modified)
- `frontend/src/types/api.ts` (modified)
- `frontend/src/__tests__/batchExportOptions.test.ts` (new)
- `frontend/src/__tests__/useBatchUnityExport.test.ts` (new)
- `frontend/src/components/unityDialogues/UnityDialogueList.batchExport.test.tsx` (new)
- `services/unity_dialogue_export_service.py` (modified — `preserve_source_fields`)

- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Senior Developer Review (AI)

**Reviewer:** Véronique (Amelia code-review) — 2026-06-16  
**Outcome:** Approve après corrections [1] — 5 HIGH/MEDIUM fixés, 3 LOW ouverts (N+1 HTTP, progression pré-appel, `cancelled` API réservé).

## Story Completion Status

- **Status:** done
- **Completion note:** Export batch FR50 validé en code review ; pytest 12 + Vitest 13 + lint verts.

## Change Log

- 2026-06-16 : Implémentation Story 5.2 — export batch Unity JSON (backend service + API + UI bibliothèque)
- 2026-06-16 : Code review — preserve metadata, guard unsaved, slug test, OSError partiel, a11y checkbox
