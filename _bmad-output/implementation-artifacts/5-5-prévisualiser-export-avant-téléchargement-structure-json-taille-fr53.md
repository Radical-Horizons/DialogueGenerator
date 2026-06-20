# Story 5.5: Prévisualiser export avant téléchargement (structure JSON, taille) (FR53)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur exportant des dialogues**,
I want **prévisualiser l'export avant téléchargement (structure JSON, taille)**,
so that **je peux vérifier le contenu et la taille avant d'écrire sur disque ou de télécharger**.

## Acceptance Criteria

1. **Given** un dialogue ouvert dans le graphe est prêt à exporter (nœuds présents, validation schéma passable), **When** je clique « Prévisualiser export », **Then** un modal s'affiche avec : aperçu JSON formaté (indent 2), taille estimée lisible (ex. « ~45 Ko »), nombre de nœuds, **And** les premières sections du JSON sont navigables (scroll + expand/collapse par nœud ou bloc racine).
2. **Given** le modal de prévisualisation est ouvert, **When** je consulte le contenu, **Then** le JSON est affiché en bloc monospace lisible (pattern `PromptViewerModal`), **And** un bouton « Copier » copie l'intégralité du JSON dans le presse-papier, **And** je peux scroller dans la structure sans bloquer l'UI.
3. **Given** la taille estimée du JSON dépasse 10 Mo, **When** la prévisualisation s'affiche, **Then** un avertissement visible indique « Fichier volumineux — téléchargement peut être lent », **And** la prévisualisation reste utilisable (pas de chargement infini).
4. **Given** je sélectionne plusieurs dialogues dans la bibliothèque Unity et lance « Prévisualiser export batch », **When** le modal s'affiche, **Then** un résumé indique : nombre de dialogues, taille totale estimée, **And** chaque dialogue est listé avec son nom, taille individuelle et nœuds (expand/collapse par dialogue pour voir un extrait JSON).
5. **Given** la prévisualisation single (graphe) est affichée et la validation schéma est conforme, **When** je clique « Exporter » dans le modal, **Then** le flux export existant (`save-and-write`) s'exécute sans fermer prématurément, **And** le modal se ferme après succès, **And** la bannière « Télécharger » Story 5.4 apparaît comme aujourd'hui.
6. **Given** la validation schéma échoue lors de la prévisualisation, **When** le modal tente de s'ouvrir, **Then** l'export est bloqué avec le même message que Story 5.1/5.3, **And** le panneau validation schéma s'affiche (pas de preview trompeuse sur JSON invalide).
7. **Tests** : pytest endpoints preview-export (single GET bibliothèque, POST graphe, POST batch) ; Vitest modal single/batch, copie, warning >10 Mo, export depuis modal ; lint 0 régression ; ne pas casser export/download 5.1–5.4.

## Tasks / Subtasks

- [x] Task 1 : « Prévisualiser export » depuis le graphe ouvre le modal avec métadonnées et JSON (AC: #1, #2, #3, #6)
  - [x] 🔴 Test échoue : graphe valide → clic « Prévisualiser export » → modal visible avec `node_count`, taille estimée (regex `~?\d+(\.\d+)?\s*(o|Ko|Mo)`), extrait JSON contenant `"nodes"` ; validation échouée → pas de modal preview, panneau schéma affiché ; fixture >10 Mo → warning volumineux présent
  - [x] 🟢 Implémenter flux preview graphe : bouton toolbar + `ExportPreviewModal` + hook/service consommant l'API preview sans écriture disque (voir Dev Notes)
  - [x] 🔵 Refactor : extraire le rendu JSON expandable (toggle nœud/bloc) depuis la logique fetch/état du modal — pattern proche `UnityDialogueViewer` mais sans dupliquer le viewer LLM ; clarifier les assertions Vitest (métadonnées vs contenu JSON minimal)

- [x] Task 2 : Exporter depuis la prévisualisation single (AC: #5)
  - [x] 🔴 Test échoue : modal preview ouvert → clic « Exporter » → `save-and-write` appelé une fois ; succès → modal fermé + bannière `ExportDownloadBanner` avec action Télécharger ; échec export → modal reste ouvert, toast erreur
  - [x] 🟢 Brancher le CTA « Exporter » du modal sur `useUnityExport` / `save-and-write` existant en réutilisant le payload déjà validé (voir Dev Notes)
  - [x] 🔵 Refactor : éviter double validation schéma (preview puis export) — conserver le résultat validation en session/ref pour la durée du modal ; nommer les cas de test par comportement utilisateur observable

- [x] Task 3 : Prévisualisation batch depuis la bibliothèque (AC: #4)
  - [x] 🔴 Test échoue : sélection 2 dialogues → « Prévisualiser export batch » → modal résumé « 2 dialogues », taille totale, liste expandable par fichier ; 0 sélection → action absente ou désactivée
  - [x] 🟢 Ajouter action batch preview + modal résumé consommant `POST .../batch-preview-export` (voir Dev Notes)
  - [x] 🔵 Refactor : réutiliser styles/actions du modal single (en-tête métadonnées, bouton Copier par dialogue) plutôt que deux modals divergents ; aligner libellés FR avec `BatchExportSummaryBanner`

- [x] Task 4 : Endpoints backend preview-export (AC: #1, #4, #7 — fondation API)
  - [x] 🔴 Test échoue : `POST /api/v1/unity-dialogues/graph/preview-export` payload valide → 200, corps avec `json_content`, `size_bytes`, `node_count`, `filename` ; `GET /api/v1/dialogues/{id}/preview-export` fixture exportée → 200 métadonnées cohérentes ; id inconnu → 404 ; `POST .../batch-preview-export` 2 ids → 200 liste + `total_size_bytes`
  - [x] 🟢 Créer `services/unity_export_preview_service.py` + routes (handlers ≤ 30 L) — conversion sans écriture disque pour graphe, lecture fichier pour bibliothèque (voir Dev Notes)
  - [x] 🔵 Refactor : factoriser sérialisation `json.dumps(..., indent=2, ensure_ascii=False)` et comptage nœuds avec le chemin `save-and-write` / `batch_export_service` ; pytest nommés par comportement HTTP observable

## Dev Notes

### Écart actuel vs cible (ne pas réinventer)

| Composant | État actuel (Stories 5.1–5.4) | Delta Story 5.5 |
|-----------|-------------------------------|-----------------|
| Export graphe | `handleExportUnity` → validate → `save-and-write` direct | **Ajouter** branche « Prévisualiser export » → preview API **sans** écriture, puis export optionnel depuis modal |
| `save-and-write` | Retourne déjà `json_content` après conversion | **Extraire** la conversion (l.183–189 `graph_io.py`) pour preview sans dupliquer la logique métier |
| `UnityDialogueViewer` | Expand/collapse nœuds + Copier JSON (flux génération LLM) | **Réutiliser patterns UI**, pas le composant tel quel (contexte différent) |
| `PromptViewerModal` | Modal + `<pre>` monospace + Copier | **Modèle modal** — pas de nouvelle dépendance `react-syntax-highlighter` (absente de `package.json`) |
| `GET .../preview-export` | **N'existe pas** | Créer pour bibliothèque (fichier déjà sur disque) |
| `POST graph/preview-export` | **N'existe pas** | Créer — même payload que `validate-schema` / `save-and-write` |
| `ExportDownloadBanner` | Post-export download | **Inchangé** — preview précède l'export, download reste après succès |
| Batch bibliothèque | Export batch + `BatchExportSummaryBanner` | **Ajouter** preview batch **avant** export (pas remplacer le résumé post-export) |

**Anti-scope :** pas de logs export (Story 5.6) ; pas de remplacement du flux download 5.4 ; pas de ré-écriture du validateur schéma 5.3 ; pas d'ajout npm `react-syntax-highlighter` sauf justification mesurée (préférer `<pre>` + tree expandable).

### Décision d'architecture (SM)

- **Preview ≠ Export ≠ Download** : preview calcule JSON + métadonnées **sans** `write_unity_dialogue_to_file` ; export depuis modal déclenche le flux 5.1 existant ; download reste 5.4.
- **Graphe ouvert** : `POST /api/v1/unity-dialogues/graph/preview-export` — body identique à `SaveGraphRequest` (nodes, edges, dialogue_flags, metadata) ; réponse `{ json_content, size_bytes, node_count, filename, schema_valid, errors? }`.
- **Bibliothèque (fichier persisté)** : `GET /api/v1/dialogues/{document_id}/preview-export` — lit via `unity_dialogue_download_service` / chemin Unity, calcule taille et `node_count` depuis le JSON.
- **Batch** : `POST /api/v1/dialogues/batch-preview-export` body `{ document_ids: string[] }` → `{ items: [{ document_id, filename, size_bytes, node_count, json_preview_truncated? }], total_size_bytes, dialogue_count }` ; tronquer l'aperçu par dialogue si > N Ko pour perf (seuil documenté dans le service, ex. 32 Ko) — le modal batch expand charge le détail ou affiche tronqué + « Copier » sur contenu complet via GET single si nécessaire.
- **Validation** : exécuter `unity_export_schema_validator` dans preview ; si invalide → 422 ou `{ schema_valid: false, errors }` — le frontend bloque l'ouverture du modal et réutilise le panneau schéma existant.
- **Taille** : `size_bytes = len(json_content.encode('utf-8'))` après sérialisation indent 2 ; formater côté frontend (`formatBytes` utilitaire).
- **Seuil 10 Mo** : constante partagée avec `downloadWithProgress` (Story 5.4) si possible.

### Architecture guardrails

- **Handlers API** : ≤ 30 lignes ; logique dans `services/unity_export_preview_service.py`.
- **UTF-8** : `ensure_ascii=False`, indent 2 — aligné export 5.1.
- **GraphEditorHeader** (1577 L) : **un seul** bouton ou entrée menu « Prévisualiser export » — **aucune** logique modal inline ; état dans hook dédié (`useUnityExportPreview.ts`).
- **Pas d'écriture disque** en preview — ADR-006 respecté pour la phase preview.
- **Sécurité** : `document_id` / filenames validés (basename, pas de path traversal) — même règles que 5.4.
- **Performance NFR-P3** : preview graphe cible <200 ms pour dialogues typiques ; batch preview peut être plus lent — afficher loading dans modal.

### What to reuse

- **Backend** : `GraphConversionService.graph_to_unity_document`, `unity_export_schema_validator`, `unity_dialogue_download_service`, `batch_export_service.export_persisted_document` (lecture seule / conversion sans write)
- **Frontend** : `PromptViewerModal` (structure modal + copier), patterns expand/collapse de `UnityDialogueViewer`, `buildGraphSchemaApiPayload`, `useUnityExport` (export depuis modal), `ExportDownloadBanner`, `BatchExportSummaryBanner` (libellés FR batch), `theme` / `modalTypography` / `useNarrowInlineSize`
- **Tests** : patterns `test_dialogue_download_story_5_4.py`, `useGraphToolbar.unityExport.test.ts`, `ExportDownloadBanner.test.tsx`

### Quality bar

- pytest : preview graphe OK/422 invalid ; GET preview bibliothèque OK/404 ; batch 2 ids ; path traversal rejeté
- Vitest : modal single métadonnées + copier ; warning >10 Mo ; export depuis modal ; batch résumé 2 dialogues ; validation bloquante sans modal
- Non-régression : `test_unity_export_story_5_1`, `test_batch_export_story_5_2`, `test_dialogue_download_story_5_4`, Vitest export/download 5.4
- Lint frontend 0 warning

### Refactor bar (defaults)

- ~300 lignes max par fichier touché ; ~60 lignes par fonction
- Nouveau code preview dans modules dédiés — pas d'extension massive de `useGraphToolbar.ts` (586 L actuellement)

### Fichiers chauds

| Fichier | Taille actuelle | Contrainte |
|---------|-----------------|------------|
| `frontend/src/components/graph/GraphEditorHeader.tsx` | **1577 L** | Un bouton/entrée menu max — modal et fetch dans hook/composant dédié |
| `api/routers/dialogues.py` | **742 L** | Handlers preview ≤ 30 L ; déléguer au service |
| `api/routers/graph_io.py` | ~256 L | Handler `preview-export` ≤ 30 L ; factoriser conversion partagée avec `save-and-write` |
| `frontend/src/hooks/useGraphToolbar.ts` | **586 L** | Exposer `handlePreviewExport` via hook enfant — ne pas dépasser ~650 L |
| `frontend/src/components/unityDialogues/UnityDialogueList.tsx` | **384 L** | Action batch preview → si > 450 L, extraire boutons barre d'outils |

### Conventions

- Messages UI en français
- `document_id` sans `.json` (aligné 5.2/5.4)
- Tests sans entités GDD réelles nommées
- Bouton graphe : « Prévisualiser export » distinct de « Export Unity » (export direct reste disponible pour power users — ne pas supprimer)

### Project Structure Notes

- Nouveau probable : `services/unity_export_preview_service.py`, `tests/services/test_unity_export_preview_service.py`, `tests/api/test_dialogue_preview_export_story_5_5.py`, `frontend/src/hooks/useUnityExportPreview.ts`, `frontend/src/components/unityDialogues/ExportPreviewModal.tsx`, `frontend/src/utils/formatBytes.ts`
- Routes : `graph_io.py` (POST preview-export), `dialogues.py` (GET preview-export, POST batch-preview-export)
- Schémas : `api/schemas/dialogue.py` — `ExportPreviewResponse`, `BatchExportPreviewRequest/Response`
- Client API : `frontend/src/api/graph.ts` + `frontend/src/api/dialogues.ts`

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-05.md` — Story 5.5, FR53]
- [Source: `_bmad-output/implementation-artifacts/5-4-télécharger-fichiers-json-exportés-fr52.md` — download post-export, anti-scope preview]
- [Source: `_bmad-output/implementation-artifacts/5-1-exporter-dialogue-single-vers-format-unity-json-fr49.md` — save-and-write, validation bloquante]
- [Source: `api/routers/graph_io.py` — conversion graphe → document Unity]
- [Source: `frontend/src/components/graph/PromptViewerModal.tsx` — pattern modal + pre + copier]
- [Source: `frontend/src/components/generation/UnityDialogueViewer.tsx` — expand/collapse nœuds]
- [Source: `services/unity_dialogue_download_service.py` — lecture fichier exporté]
- [Source: `_bmad-output/project-context.md` — handlers courts, services/, format Unity v1.1.0]

### Previous story intelligence (Story 5.4 — prérequis direct)

- Download **additif** après export — preview s'insère **avant** export, pas à la place du download.
- ZIP batch côté backend (stdlib) — preview batch suit la même philosophie (pas JSZip frontend).
- `useUnityExportDownload` + `ExportDownloadBanner` : conserver le enchaînement export → bannière Télécharger quand l'utilisateur exporte depuis le modal preview.
- Code review 5.4 : `resolveDownloadExportFilename`, `triggerBlobDownloadAsync`, JSON corrompu → 422 — preview bibliothèque doit surfacer 422 proprement si fichier illisible.
- **Où tester UI (5.4)** : bibliothèque Unity, graphe export — ajouter : toolbar graphe « Prévisualiser export », bibliothèque sélection multiple « Prévisualiser export batch ».

### Git intelligence (commits récents)

- `7346f38d` — Story 5.4 FR52 livrée (download single, GET bibliothèque, ZIP batch, options localStorage).
- Branche `Epic/05-unity-export` — epic 5 in-progress ; stories 5.1–5.4 **done** ; **5.5** (cette story) puis 5.6 logs.

### Latest tech information

- **`react-syntax-highlighter`** : non présent dans `frontend/package.json` — **ne pas ajouter** par défaut ; `<pre>` monospace + tree expandable suffit (cohérent `PromptViewerModal`, zéro dépendance).
- **Clipboard** : `navigator.clipboard.writeText` (pattern `UnityDialogueViewer`) — gérer fallback/test mock RTL.
- **Taille fichiers** : calcul backend en octets UTF-8 ; formatage frontend (`Intl` ou helper simple Ko/Mo).
- **FastAPI** : réponses JSON preview — pas de `Content-Disposition` (preview inline API, pas download).

### Project context reference

- `_bmad-output/project-context.md` — logique métier dans `services/`, document Unity `{ schemaVersion, nodes }`, tests mockés.

## Dev Agent Record

### Agent Model Used

Composer (dev-story workflow)

### Debug Log References

- pytest `tests/api/test_dialogue_preview_export_story_5_5.py` + `tests/services/test_unity_export_preview_service.py` : 8 passed
- Vitest `ExportPreviewModal.test.tsx` + `useGraphToolbar.unityExportPreview.test.ts` : 7 passed
- Régression 5.1/5.4 pytest : 23 passed ; Vitest export 5.1 : 5 passed

### Completion Notes List

- Backend : `unity_export_preview_service.py` + `unity_graph_export_serialization.py` (sérialisation partagée avec `save-and-write`)
- Routes : `POST graph/preview-export`, `GET dialogues/{id}/preview-export`, `POST batch-preview-export`
- Frontend : `ExportPreviewModal`, `ExportPreviewJsonTree`, `useUnityExportPreview`, bouton graphe + batch bibliothèque
- Export depuis modal réutilise payload validé (`validatedPayloadRef`) — pas de second `validateSchema`
- 🔵 Refactor Task 1 : `ExportPreviewJsonTree` extrait du modal
- 🔵 Refactor Task 2 : tests nommés par comportement observable ; cache payload export
- 🔵 Refactor Task 3 : modal unique single/batch ; bouton batch désactivé si 0 sélection
- 🔵 Refactor Task 4 : factorisation sérialisation dans `unity_graph_export_serialization.py`

### File List

- `services/unity_graph_export_serialization.py` (new)
- `services/unity_export_preview_service.py` (new)
- `api/schemas/graph.py`
- `api/schemas/dialogue.py`
- `api/routers/graph_io.py`
- `api/routers/dialogues.py`
- `tests/api/test_dialogue_preview_export_story_5_5.py` (new)
- `tests/services/test_unity_export_preview_service.py` (new)
- `frontend/src/utils/formatBytes.ts` (new)
- `frontend/src/types/graph.ts`
- `frontend/src/types/api.ts`
- `frontend/src/api/graph.ts`
- `frontend/src/api/dialogues.ts`
- `frontend/src/hooks/useUnityExportPreview.ts` (new)
- `frontend/src/hooks/useGraphToolbar.ts`
- `frontend/src/components/unityDialogues/ExportPreviewModal.tsx` (new)
- `frontend/src/components/unityDialogues/ExportPreviewJsonTree.tsx` (new)
- `frontend/src/components/unityDialogues/BatchExportToolbar.tsx`
- `frontend/src/components/unityDialogues/UnityDialogueList.tsx`
- `frontend/src/components/graph/GraphEditorHeader.tsx`
- `frontend/src/components/graph/GraphEditor.tsx`
- `frontend/src/__tests__/ExportPreviewModal.test.tsx` (new)
- `frontend/src/__tests__/useGraphToolbar.unityExportPreview.test.ts` (new)
- `frontend/src/__tests__/useGraphToolbar.unityExport.test.ts`

## Change Log

- 2026-06-19 : Story 5.5 FR53 — preview export single/batch, export depuis modal, endpoints preview sans écriture disque
- 2026-06-19 : Code review — copie batch JSON complet via GET si tronqué ; déduplication hook batch preview ; tests copie + schéma invalide

## Senior Developer Review (AI)

**Reviewer:** Véronique (Amelia / code-review workflow) — 2026-06-19

**Outcome:** Approuvé après corrections auto

### Findings (initial)

| Sévérité | Finding | Statut |
|----------|---------|--------|
| MEDIUM | Batch « Copier extrait » ne copiait que `json_preview` tronqué — AC #4 exige JSON complet (GET single si tronqué) | ✅ Corrigé |
| MEDIUM | `UnityDialogueList` dupliquait fetch/état batch au lieu de `useUnityExportPreview.handleBatchPreviewExport` | ✅ Corrigé |
| MEDIUM | Pas de test Vitest bouton Copier (AC #2) | ✅ Corrigé |
| LOW | Pas de pytest `schema_valid: false` sur graphe invalide | ✅ Corrigé |
| LOW | Double appel `validateSchema` + `previewGraphExport` (validation redondante réseau) | Accepté — blocage UX explicite avant modal |
| LOW | `GraphEditor` expose `batchPreview` toolbar jamais alimenté depuis bibliothèque | Accepté — modal batch isolé dans liste Unity |

### Verification

- pytest `test_dialogue_preview_export_story_5_5.py` + `test_unity_export_preview_service.py` : 9 passed
- Vitest `ExportPreviewModal` + `useGraphToolbar.unityExportPreview` : 8 passed

## Story Completion Status

- **Status:** done
- **Completion note:** AC #1–#7 validés ; review HIGH/MEDIUM corrigés ; sprint synced
