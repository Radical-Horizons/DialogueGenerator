# Story 5.4: Télécharger fichiers JSON exportés (FR52)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur exportant des dialogues**,
I want **télécharger les fichiers JSON exportés vers mon poste**,
so that **je peux transférer les dialogues vers Unity, les archiver ou les partager sans accès direct au disque serveur**.

## Acceptance Criteria

1. **Given** un export Unity single vient de réussir (graphe ou bibliothèque), **When** l'opération se termine, **Then** une action « Télécharger » s'affiche avec le nom du fichier exporté, **And** un clic déclenche le téléchargement du JSON Unity formaté (indent 2, UTF-8) sous `[dialogue-title].json`.
2. **Given** je clique « Télécharger » après export single, **When** le téléchargement démarre, **Then** le fichier contient le même contenu que celui écrit sur disque (document `{ schemaVersion, nodes, … }` si présent), **And** le nom respecte la stratégie de nommage export (slug titre / filename existant), **And** aucune erreur navigateur n'est levée.
3. **Given** un export batch vient de se terminer avec au moins un succès, **When** le résumé batch s'affiche, **Then** un bouton « Télécharger tous » est proposé, **And** un clic télécharge une archive ZIP contenant tous les fichiers exportés avec leurs noms individuels.
4. **Given** j'ouvre « Options téléchargement », **When** je configure format (JSON individuel vs ZIP pour batch), stratégie de nom et niveau de compression ZIP, **Then** les options sont persistées en `localStorage` (clé dédiée) pour les prochains téléchargements, **And** le batch respecte le format choisi (ZIP par défaut si plusieurs fichiers).
5. **Given** un fichier JSON exporté dépasse ~10 Mo, **When** je lance le téléchargement, **Then** un indicateur « Téléchargement en cours… » reste visible jusqu'à la fin, **And** le téléchargement aboutit sans timeout côté UI (pas de blocage silencieux).
6. **Given** je télécharge depuis la bibliothèque un dialogue déjà exporté sur disque (sans ré-export), **When** j'utilise l'action « Télécharger », **Then** le JSON est servi via l'API backend avec en-tête `Content-Disposition: attachment`, **And** le contenu correspond au fichier dans `unity_dialogues_path`.
7. **Tests** : pytest endpoints download + batch-download ; Vitest flux UI single/batch + options localStorage ; lint frontend 0 régression ; ne pas casser l'écriture serveur Story 5.1/5.2.

## Tasks / Subtasks

- [x] Task 1 : Action « Télécharger » après export single réussi (AC: #1, #2)
  - [x] 🔴 Test échoue : export Unity graphe valide → toast/bannière affiche « Télécharger » avec le filename ; clic → blob JSON téléchargé (`quest_arc.json`), contenu parseable et contient `nodes` ; export échoué → pas de bouton télécharger
  - [x] 🟢 Brancher le succès `useUnityExport` sur une bannière ou toast action utilisant `json_content` + `filename` de `save-and-write` et `downloadUnityExport` (voir Dev Notes)
  - [x] 🔵 Refactor : extraire l'état « dernier export téléchargeable » (`lastExportDownload`) dans un petit hook `useUnityExportDownload` plutôt que d'alourdir `useUnityExport.ts` ; clarifier les assertions Vitest (filename vs contenu minimal)

- [x] Task 2 : Téléchargement document persisté via API (AC: #6)
  - [x] 🔴 Test échoue : `GET /api/v1/dialogues/{document_id}/download` sur fixture exportée → 200, `Content-Disposition: attachment; filename="…json"`, corps UTF-8 indenté ; `document_id` inconnu → 404 ; chemin Unity null → 422 message clair
  - [x] 🟢 Ajouter route + service lecture fichier (`unity_dialogues_path`) — handler ≤ 30 L dans `dialogues.py`, logique dans `services/unity_dialogue_download_service.py` (voir Dev Notes)
  - [x] 🔵 Refactor : factoriser résolution chemin + nom fichier avec `unity_persisted_document_io` / helpers batch 5.2 ; nommer les cas pytest par comportement observable

- [x] Task 3 : « Télécharger tous » — archive ZIP batch (AC: #3)
  - [x] 🔴 Test échoue : batch 2 succès → clic « Télécharger tous » → ZIP reçu contenant 2 entrées `.json` aux noms attendus ; batch 0 succès → bouton absent ou désactivé
  - [x] 🟢 Implémenter `POST /api/v1/dialogues/batch-download` (body `{ filenames: string[] }`) retournant ZIP (`Content-Disposition`) + bouton dans `BatchExportSummaryBanner` (voir Dev Notes)
  - [x] 🔵 Refactor : réutiliser le pattern `Response` + `Content-Disposition` de `gdd_notion_sync.download_gdd_notebooklm_export` ; éviter duplication construction ZIP — service dédié testable

- [x] Task 4 : Options téléchargement persistées (AC: #4)
  - [x] 🔴 Test échoue : panneau options → choisir compression ZIP « store » vs « deflate » → rechargement page conserve le choix ; batch multi-fichiers avec option « JSON individuel » → N téléchargements séquentiels au lieu d'un ZIP
  - [x] 🟢 Créer `downloadExportOptions.ts` (miroir `batchExportOptions.ts`) consommé par toolbar batch et bannière post-export
  - [x] 🔵 Refactor : aligner clés `localStorage` et types partagés avec `batchExportOptions.ts` (documenter préfixe `dg-export-*`) ; clarifier libellés FR dans les tests

- [x] Task 5 : Indicateur progression fichiers volumineux (AC: #5)
  - [x] 🔴 Test échoue : fixture JSON > 10 Mo (mock taille) → UI affiche « Téléchargement en cours… » pendant l'opération puis disparaît à la fin ; téléchargement < 10 Mo → pas d'indicateur bloquant
  - [x] 🟢 Envelopper `downloadUnityExport` / fetch batch-download avec helper `downloadWithProgress` (seuil 10 Mo, état loading)
  - [x] 🔵 Refactor : centraliser le helper blob download (`createObjectURL` + revoke) — aujourd'hui dupliqué entre `graphEditorStandalone.ts`, `GenerationLogsPanel`, `GddNotionSyncSection` ; extraire `utils/downloadBlob.ts` sans refactor massif des autres écrans (un seul appel site export)

## Dev Notes

### Écart actuel vs cible (ne pas réinventer)

| Composant | État actuel (Stories 5.1–5.3) | Delta Story 5.4 |
|-----------|--------------------------------|-----------------|
| `useUnityExport` | validate → `save-and-write` → toast succès ; **ignore** `json_content` retourné | **Consommer** `json_content` + `filename` pour proposer téléchargement |
| `downloadUnityExport` | Existe dans `graphEditorStandalone.ts` (blob client) | **Réutiliser** — ne pas recréer |
| `save-and-write` | Retourne déjà `json_content` + `filename` | Pas de changement backend obligatoire pour flux graphe |
| `BatchExportSummaryBanner` | Résumé + réessayer échecs | **Ajouter** « Télécharger tous » |
| `GET .../download` | **N'existe pas** | Créer pour bibliothèque / re-téléchargement |
| `POST .../batch-download` | **N'existe pas** | Créer ZIP côté backend (pas JSZip — absent de `package.json`) |
| `graphEditorStandalone.routeLoad.test.tsx` | Test legacy « Export Unity → download direct » | **Mettre à jour** pour flux validate → write → action Télécharger (Story 5.1 a changé le comportement) |

**Anti-scope :** ne pas remplacer l'écriture serveur (5.1/5.2) par un export « download only » ; le téléchargement est **additif** après export réussi. Story 5.5 (preview) et 5.6 (logs) hors scope.

### Décision d'architecture (SM)

- **Single export (graphe ouvert)** : téléchargement **client** via `downloadUnityExport(response.json_content, response.filename)` — le JSON est déjà dans la réponse `save-and-write` ; évite un GET redondant.
- **Bibliothèque / re-téléchargement** : **backend** `GET /api/v1/dialogues/{document_id}/download` lit le fichier sous `unity_dialogues_path` (même base que batch 5.2).
- **Batch ZIP** : **backend** `POST /api/v1/dialogues/batch-download` avec `zipfile` stdlib (pattern `gdd_notion_sync` NotebookLM). Le frontend envoie la liste `exported[]` du dernier batch.
- **JSZip npm** : **non requis** — préférer ZIP serveur (cohérent Windows-first, pas de nouvelle dépendance frontend).
- **Options** : module `downloadExportOptions.ts` + `localStorage` ; distinct de `batchExportOptions.ts` (validation/nom export) mais préfixe clé documenté.

### Architecture guardrails

- **Export ≠ Download** : l'export continue d'écrire sur disque (ADR-006) ; le download ne doit pas sauter la validation ni l'écriture des stories précédentes.
- **UTF-8** : `ensure_ascii=False`, fichiers lus/écrits en UTF-8 ; blob `application/json;charset=utf-8`.
- **Handlers API** : ≤ 30 lignes ; logique dans `services/`.
- **Sécurité** : valider `document_id` / filenames (pas de path traversal — basename only, rejet `..` et séparateurs).
- **GraphEditorHeader** : **aucun** nouveau bouton permanent — actions download post-export dans bannière/toast ou panneau batch.

### What to reuse

- **Frontend** : `downloadUnityExport`, `buildUnityExportFilename` (`graphEditorStandalone.ts`), `BatchExportSummaryBanner`, `useBatchUnityExport` (`exported` dans summary), `batchExportOptions.ts` (pattern options), `GenerationLogsPanel` / `GddNotionSyncSection` (pattern blob download)
- **Backend** : `ConfigurationService.get_unity_dialogues_path()`, `services/unity_persisted_document_io.py`, pattern `Content-Disposition` dans `api/routers/gdd_notion_sync.py`, slug filename depuis `write_unity_dialogue_to_file`

### Quality bar

- pytest : GET download OK/404 ; POST batch-download ZIP 2 fichiers ; path traversal rejeté ; chemin Unity null
- Vitest : bouton Télécharger post-export single ; ZIP batch ; options localStorage ; indicateur > 10 Mo (mock taille)
- Non-régression : `test_unity_export_story_5_1`, `test_batch_export_story_5_2`, `test_unity_export_validation_service`
- Lint frontend 0 warning

### Refactor bar (defaults)

- ~300 lignes max par fichier touché ; ~60 lignes par fonction
- Nouveau code download dans modules dédiés (`unity_dialogue_download_service.py`, `useUnityExportDownload.ts`, `downloadExportOptions.ts`)

### Fichiers chauds

| Fichier | Taille actuelle | Contrainte |
|---------|-----------------|------------|
| `frontend/src/components/graph/GraphEditorHeader.tsx` | **1577 L** | **Aucune** logique download ici — bannière/toast/hook uniquement |
| `api/routers/dialogues.py` | **677 L** | Handlers download/batch-download ≤ 30 L chacun ; déléguer au service |
| `frontend/src/hooks/useUnityExport.ts` | 104 L | État download → hook séparé si > 150 L après ajout |
| `frontend/src/components/unityDialogues/UnityDialogueList.tsx` | 306 L | Action « Télécharger » ligne document → appel API GET ; si > 400 L → extraire bouton dans sous-composant |

### Conventions

- Messages UI en français
- `document_id` = clé sans `.json` (aligné 5.2)
- Tests sans entités GDD réelles nommées

### Project Structure Notes

- Nouveau probable : `services/unity_dialogue_download_service.py`, `tests/services/test_unity_dialogue_download_service.py`, `tests/api/test_dialogue_download_story_5_4.py`, `frontend/src/utils/downloadExportOptions.ts`, `frontend/src/utils/downloadBlob.ts`, `frontend/src/hooks/useUnityExportDownload.ts`, `frontend/src/components/unityDialogues/ExportDownloadBanner.tsx` (ou extension `BatchExportSummaryBanner`)
- Client API : `frontend/src/api/dialogues.ts` — `downloadUnityDialogue`, `batchDownloadUnityDialogues`
- Schémas : `api/schemas/dialogue.py` — `BatchDownloadRequest`

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-05.md` — Story 5.4, FR52]
- [Source: `_bmad-output/implementation-artifacts/5-1-exporter-dialogue-single-vers-format-unity-json-fr49.md` — save-and-write, json_content]
- [Source: `_bmad-output/implementation-artifacts/5-2-exporter-batch-plusieurs-dialogues-vers-unity-json-fr50.md` — exported[], BatchExportSummaryBanner]
- [Source: `_bmad-output/implementation-artifacts/5-3-valider-json-exporté-contre-schéma-unity-custom-fr51.md` — pipeline validation inchangé]
- [Source: `frontend/src/components/graph/graphEditorStandalone.ts` — downloadUnityExport]
- [Source: `api/routers/graph_io.py` — SaveGraphResponse json_content]
- [Source: `api/routers/gdd_notion_sync.py` — pattern ZIP Content-Disposition]
- [Source: `services/unity_dialogue_export_service.py` — format indent 2, UTF-8]
- [Source: `_bmad-output/project-context.md` — handlers courts, services/]

### Previous story intelligence (Story 5.3 — prérequis direct)

- Pipeline validation unifié (`unity_export_validation_service`) — le download ne re-valide pas ; il sert le fichier **déjà validé** à l'export.
- `preserve_source_fields=True` en batch — le JSON téléchargé doit inclure `dialogueFlags` et champs racine si présents dans le document source.
- Ne pas toucher `SchemaValidationPanel` pour le download.

### Git intelligence (commits récents)

- Branche `Epic/05-unity-export` ; commit `042c1f05` — export single/batch + validation FR51 livrés ; Stories 5.1–5.3 **done**.
- Prochaine story backlog epic 5 : **5.4** (cette story) ; 5.5 preview et 5.6 logs suivent.

### Latest tech information

- **JSZip** : non présent dans `frontend/package.json` — ZIP batch via **Python `zipfile`** (stdlib 3.10+), pas de nouvelle dépendance npm.
- **Blob download** : `URL.createObjectURL` + `revokeObjectURL` (pattern existant) ; pour gros fichiers, `fetch` + `ReadableStream` optionnel si GET backend — privilégier indicateur UI simple avant optimisation streaming.
- **FastAPI** : `Response(content=..., media_type="application/zip", headers={"Content-Disposition": ...})` — même pattern que NotebookLM export.

### Project context reference

- `_bmad-output/project-context.md` — logique métier dans `services/`, pas de secrets en dur, tests mockés.

## Dev Agent Record

### Agent Model Used

Composer (dev-story workflow)

### Debug Log References

- pytest story 5.4 + correctifs review : 16 passed
- Vitest story 5.4 + correctifs review : 32 passed

### Completion Notes List

- **Task 1** : `useUnityExportDownload` + `ExportDownloadBanner` après `save-and-write` ; export échoué → pas de bannière (validation bloquante inchangée).
- **Task 2** : `GET /api/v1/dialogues/{document_id}/download` + `unity_dialogue_download_service.py` ; menu contextuel « Télécharger » bibliothèque.
- **Task 3** : `POST /api/v1/dialogues/batch-download` (ZIP stdlib) + bouton « Télécharger tous » dans `BatchExportSummaryBanner`.
- **Task 4** : `downloadExportOptions.ts` (clé `dg-export-downloadOptions`) + `DownloadExportOptionsPanel`.
- **Task 5** : `downloadBlob.ts` / `downloadWithProgress` seuil 10 Mo ; indicateur dans bannières single/batch.
- **🔵 Refactor Task 1** : état download extrait de `useUnityExport.ts` → `useUnityExportDownload.ts` (104 L → hook dédié 55 L).
- **🔵 Refactor Task 5** : `graphEditorStandalone.downloadUnityExport` délègue à `triggerBlobDownload` — avant : createObjectURL inline ; après : import `utils/downloadBlob.ts`.

### Code Review Fixes (2026-06-19 — option [1])

- **H1** : `resolveDownloadExportFilename` + `slugFromTitle` (Unicode `\p{L}`) ; branché dans `unityExportDownload.ts`, `downloadUnityExport`, `useUnityExportDownload` (lit `loadDownloadExportOptions`).
- **M1** : `triggerBlobDownloadAsync` + délai min 100 ms avant `onProgressEnd` pour gros fichiers ; `downloadWithProgress` sans reset synchrone.
- **M2** : tests `DialogueListContextMenu` + `UnityDialogueList.batchExport` menu contextuel → `downloadUnityDialogue`.
- **M3** : `JSONDecodeError` → `ValueError` 422 dans `unity_dialogue_download_service` ; pytest service + API.

### Senior Developer Review (AI)

**Reviewer:** Véronique (via Amelia code-review workflow) — 2026-06-19  
**Outcome:** Approve après correctifs [1] (HIGH/MEDIUM résolus)

| ID | Sévérité | Finding | Résolution |
|----|----------|---------|------------|
| H1 | HIGH | `filenameStrategy` UI sans effet | `resolveDownloadExportFilename` câblé |
| M1 | MEDIUM | Indicateur progression flash synchrone | `triggerBlobDownloadAsync` + min 100 ms |
| M2 | MEDIUM | Pas de test Vitest bibliothèque GET | Tests context menu ajoutés |
| M3 | MEDIUM | JSON corrompu → 500 | ValueError → 422 |

**Où tester UI :** Bibliothèque Unity (liste dialogues) — export single/batch puis « Télécharger » / « Télécharger tous » ; menu clic-droit « Télécharger » ; graphe — export Unity puis bannière « Télécharger » ; panneau « Options téléchargement ».

### File List

- `services/unity_dialogue_download_service.py` (new)
- `tests/services/test_unity_dialogue_download_service.py` (new)
- `tests/api/test_dialogue_download_story_5_4.py` (new)
- `api/routers/dialogues.py` (modified)
- `api/schemas/dialogue.py` (modified)
- `frontend/src/utils/downloadBlob.ts` (new)
- `frontend/src/utils/downloadExportOptions.ts` (modified — resolveDownloadExportFilename)
- `frontend/src/utils/downloadBlob.ts` (modified — triggerBlobDownloadAsync)
- `frontend/src/utils/unityExportDownload.ts` (modified — filenameStrategy)
- `frontend/src/components/graph/graphEditorStandalone.ts` (modified — async download + strategy)
- `frontend/src/hooks/useUnityExportDownload.ts` (modified — loadDownloadExportOptions)
- `frontend/src/components/unityDialogues/UnityDialogueList.tsx` (modified — pass options/title)
- `services/unity_dialogue_download_service.py` (modified — JSONDecodeError)
- `tests/services/test_unity_dialogue_download_service.py` (modified)
- `tests/api/test_dialogue_download_story_5_4.py` (modified)
- `frontend/src/__tests__/downloadExportOptions.test.ts` (modified)
- `frontend/src/__tests__/downloadBlob.test.ts` (modified)
- `frontend/src/__tests__/useUnityExportDownload.test.ts` (modified)
- `frontend/src/components/unityDialogues/DialogueListContextMenu.test.tsx` (modified)
- `frontend/src/components/unityDialogues/UnityDialogueList.batchExport.test.tsx` (modified)
- `frontend/src/utils/unityExportDownload.ts` (new)
- `frontend/src/hooks/useUnityExportDownload.ts` (new)
- `frontend/src/hooks/useUnityExport.ts` (modified)
- `frontend/src/hooks/useGraphToolbar.ts` (modified)
- `frontend/src/hooks/useBatchUnityExport.ts` (modified)
- `frontend/src/api/dialogues.ts` (modified)
- `frontend/src/components/graph/graphEditorStandalone.ts` (modified)
- `frontend/src/components/graph/GraphEditor.tsx` (modified)
- `frontend/src/components/unityDialogues/ExportDownloadBanner.tsx` (new)
- `frontend/src/components/unityDialogues/DownloadExportOptionsPanel.tsx` (new)
- `frontend/src/components/unityDialogues/BatchExportSummaryBanner.tsx` (modified)
- `frontend/src/components/unityDialogues/UnityDialogueList.tsx` (modified)
- `frontend/src/components/unityDialogues/DialogueListContextMenu.tsx` (modified)
- `frontend/src/components/unityDialogues/UnityDialogueList.batchExport.test.tsx` (modified)
- `frontend/src/__tests__/downloadBlob.test.ts` (new)
- `frontend/src/__tests__/downloadExportOptions.test.ts` (new)
- `frontend/src/__tests__/ExportDownloadBanner.test.tsx` (new)
- `frontend/src/__tests__/useUnityExportDownload.test.ts` (new)
- `frontend/src/__tests__/useGraphToolbar.unityExport.test.ts` (modified)
- `frontend/src/__tests__/graphEditorStandalone.routeLoad.test.tsx` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Change Log

- 2026-06-19 : Story 5.4 FR52 — téléchargement JSON single (client), GET download bibliothèque, ZIP batch, options localStorage, indicateur >10 Mo.
- 2026-06-19 : Code review [1] — filenameStrategy câblé, progression async, tests bibliothèque, JSON corrompu 422.

## Story Completion Status

- **Status:** done
- **Completion note:** FR52 livré ; code-review HIGH/MEDIUM corrigés ; pytest 16 + Vitest 32 verts périmètre story.
