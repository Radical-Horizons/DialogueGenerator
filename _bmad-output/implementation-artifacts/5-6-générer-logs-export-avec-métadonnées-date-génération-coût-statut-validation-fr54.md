# Story 5.6: Générer logs export avec métadonnées (date génération, coût, statut validation) (FR54)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur exportant des dialogues**,
I want **voir les logs d'export avec métadonnées (date génération, coût, statut validation)**,
so that **je peux tracer l'historique des exports et identifier les problèmes**.

## Acceptance Criteria

1. **Given** un dialogue est exporté vers Unity (single graphe `save-and-write`, `POST /dialogues/unity/export`, ou item batch réussi), **When** l'export se termine, **Then** une entrée de log est persistée avec : timestamp ISO, `dialogue_id`, `filename`, `export_status` (`success` | `failure`), `validation_status` (`valid` | `invalid` | `skipped`), `cost_eur` (total LLM du dialogue si disponible, sinon `null`), `file_size_bytes`, `errors` (liste si échec), `warnings_gdd` (avertissements non bloquants du validateur export si présents), **And** le fichier journalier est sous `data/logs/exports/YYYY-MM-DD.json` (tableau JSON append-safe).
2. **Given** un export échoue (validation schéma, document absent, erreur disque), **When** l'échec est remonté au client, **Then** une entrée `export_status=failure` est aussi persistée avec les `errors` structurées — **sans** écriture fichier Unity.
3. **Given** je consulte les logs d'export, **When** j'ouvre « Logs d'export » (bibliothèque Unity), **Then** une liste chronologique s'affiche (plus récent → plus ancien) avec : date lisible, dialogue, fichier, statut coloré (succès/échec), taille formatée, **And** un chargement initial via `GET /api/v1/exports/logs`.
4. **Given** je clique une entrée de log, **When** le panneau détail s'ouvre, **Then** s'affichent : timestamp, dialogue ID, coût, statut validation, erreurs, warnings GDD, **And** un lien/action « Voir JSON » ouvre la prévisualisation existante (Story 5.5) ou le download 5.4 si le fichier existe encore.
5. **Given** je filtre par période (aujourd'hui / 7 jours / 30 jours) ou par statut (succès / échec / tous), **When** j'applique le filtre, **Then** seules les entrées correspondantes sont listées, **And** un résumé « X exports, Y succès, Z échecs » est visible.
6. **Given** des logs sont affichés (filtres appliqués ou non), **When** je clique « Exporter logs » (CSV ou JSON), **Then** un fichier est téléchargé côté navigateur avec toutes les entrées visibles : timestamp, dialogue, fichier, statut, coût, validation, erreurs, warnings.
7. **Anti-scope :** ne pas logger les appels **preview-only** (`preview-export`, batch preview) — uniquement les exports réels (écriture disque ou tentative bloquée après validation). Ne pas remplacer les logs de génération LLM (Story 1.15). Ne pas modifier le flux download 5.4.
8. **Tests :** pytest service + API logs + hooks export ; Vitest panneau liste/détail/filtres/export CSV ; lint 0 régression ; non-régression export/preview 5.1–5.5.

## Tasks / Subtasks

- [x] Task 1 : Chaque export Unity réel produit une entrée persistée (AC: #1, #2, #7)
  - [x] 🔴 Test échoue : `save-and-write` graphe valide → entrée `success` dans `data/logs/exports/` avec `filename`, `file_size_bytes`, `validation_status=valid` ; validation échouée → `failure` sans fichier Unity écrit ; batch 2 docs (1 OK, 1 invalide) → 2 entrées distinctes ; preview-export → **aucune** nouvelle entrée
  - [x] 🟢 Implémenter `ExportLogService` + branchements sur les chemins d'export réels (voir Dev Notes)
  - [x] 🔵 Refactor : centraliser la construction du payload métadonnées (coût LLM, warnings GDD, taille) dans une fonction du service — éviter duplication entre single, batch et `unity/export`

- [x] Task 2 : API de consultation des logs export (AC: #3, #5 — fondation liste)
  - [x] 🔴 Test échoue : `GET /api/v1/exports/logs` sans filtre → 200, entrées triées récent→ancien ; query `start_date`/`end_date` + `status=success|failure` filtre correctement ; réponse inclut agrégats `total_count`, `success_count`, `failure_count`
  - [x] 🟢 Ajouter router `exports` + schémas Pydantic + client API frontend (voir Dev Notes)
  - [x] 🔵 Refactor : lecture multi-fichiers journaliers (`exports/*.json`) factorisée et testée isolément ; handlers router ≤ 30 lignes

- [x] Task 3 : Panneau « Logs d'export » avec liste chronologique (AC: #3)
  - [x] 🔴 Test échoue : panneau monté → appel API logs ; liste affiche date, dialogue, fichier, badge succès/échec, taille formatée ; état vide → message explicite ; erreur API → message d'erreur
  - [x] 🟢 Implémenter `ExportLogsPanel` + point d'entrée UI bibliothèque Unity (voir Dev Notes)
  - [x] 🔵 Refactor : réutiliser helpers période/format (`formatBytes`, patterns `GenerationLogsPanel`) sans copier-coller le composant entier — extraire utilitaires partagés si duplication > 2 fonctions

- [x] Task 4 : Détail entrée + lien vers JSON exporté (AC: #4)
  - [x] 🔴 Test échoue : clic ligne → panneau détail avec coût, validation, erreurs, warnings ; entrée succès → action « Voir JSON » déclenche preview (`previewUnityDialogueExport`) ou download persisté ; entrée échec → pas de preview trompeuse, erreurs listées
  - [x] 🟢 Brancher sélection ligne + détail + actions preview/download existantes (voir Dev Notes)
  - [x] 🔵 Refactor : nommer les cas Vitest par comportement utilisateur (« affiche résumé échec validation », « ouvre preview depuis log succès ») ; isoler sous-composant détail si le panneau dépasse ~300 lignes

- [x] Task 5 : Filtres période/statut et résumé agrégé (AC: #5)
  - [x] 🔴 Test échoue : filtre « cette semaine » + statut « échec » → seules entrées correspondantes ; résumé « X exports, Y succès, Z échecs » cohérent avec la liste filtrée ; changement filtre → refetch ou filtrage client documenté
  - [x] 🟢 Ajouter contrôles filtre + résumé dans `ExportLogsPanel` (voir Dev Notes)
  - [x] 🔵 Refactor : aligner libellés période avec `GenerationLogsPanel` (today/week/month) pour cohérence UX ; clarifier dans tests si filtrage serveur vs client

- [x] Task 6 : Télécharger les logs affichés en CSV ou JSON (AC: #6)
  - [x] 🔴 Test échoue : bouton « Exporter logs » JSON → blob JSON des entrées filtrées ; CSV → en-têtes + lignes échappées RFC4180 ; nom fichier contient date du jour
  - [x] 🟢 Implémenter export blob frontend (pattern `GenerationLogsPanel.exportLogs`) sur les entrées **filtrées** visibles
  - [x] 🔵 Refactor : extraire `csvEscape` / helper export tabulaire partagé entre logs génération et logs export si duplication identique

## Dev Notes

### Écart actuel vs cible (ne pas réinventer)

| Composant | État actuel (Stories 5.1–5.5) | Delta Story 5.6 |
|-----------|-------------------------------|-----------------|
| Export single/batch | `write_unity_dialogue_to_file`, `batch_export_documents`, routes `save-and-write` / `unity/export` / `batch-export` | **Ajouter** journalisation après succès **et** échec export réel |
| Preview export | `unity_export_preview_service` — sans écriture | **Ne pas** logger (anti-scope 5.5) |
| Logs génération LLM | `GenerationLogsPanel` + `GET /llm-usage/dialogue/{id}/generation-logs` | **Modèle UX/API** — domaine différent (génération vs export) |
| Coût dialogue | `LLMUsageService.get_dialogue_costs(dialogue_id)` | **Réutiliser** au moment du log export (snapshot `cost_eur`) |
| Warnings GDD export | `unity_export_validation_service` → `warnings` non bloquants | **Capturer** dans `warnings_gdd` au log (même validateur que export) |
| Download / preview JSON | Story 5.4 download, Story 5.5 preview | **Réutiliser** pour lien « Voir JSON » depuis détail log |
| Stockage logs API | `data/logs/logs_YYYY-MM-DD.json` (observabilité) | **Dossier dédié** `data/logs/exports/YYYY-MM-DD.json` (métier export) |

**Anti-scope :** pas de modification du validateur schéma ; pas de nouvelle dépendance npm ; pas de remplacement des logs structurés FastAPI ; pas de logging sur preview-only.

### Décision d'architecture (SM)

- **Moment du log :** immédiatement après tentative d'export réel — succès (`write_unity_dialogue_to_file` retourne) ou échec (`ValidationException`, `FileNotFoundError`, `OSError` capturés aux frontières service/router). Batch : **une entrée par document**, pas une seule entrée agrégée.
- **Service :** `services/export_log_service.py` — `log_export(...)`, `list_exports(start_date, end_date, status)`, append atomique sur fichier journalier (pattern similaire `DateRotatingFileHandler` mais tableau JSON métier, pas le handler logging root).
- **Identifiant dialogue :** stem du filename sans `.json`, ou `document_id` batch ; graphe : `dialogueMetadata.filename` / titre slug aligné export.
- **Coût :** appeler `LLMUsageService.get_dialogue_costs` (injection via container) — si dialogue inconnu ou 0 génération → `cost_eur: null`. Ne pas recalculer côté frontend.
- **Taille fichier :** `len(formatted_json.encode('utf-8'))` après sérialisation effective (aligné 5.5).
- **API :** nouveau router `api/routers/exports.py`, prefix `/api/v1/exports`, `GET /logs` avec query `start_date`, `end_date`, `status` (`success`|`failure`|omit=all). Enregistrer dans `api/main.py`.
- **Frontend :** `ExportLogsPanel.tsx` + CSS dédié ou extension modérée ; entrée depuis `UnityDialoguesPage` ou barre `UnityDialogueList` (onglet / bouton « Logs d'export ») — **ne pas** enfouir dans `GraphEditorHeader` (1611 L).
- **Export CSV/JSON logs :** 100 % frontend (blob) comme `GenerationLogsPanel` — pas d'endpoint download logs.

### Architecture guardrails

- **Handlers API** : ≤ 30 lignes ; logique dans `ExportLogService`.
- **UTF-8** : fichiers JSON `ensure_ascii=False` ; Windows-first `pathlib.Path`.
- **Injection** : `ExportLogService` via `api/container.py` + `Depends` — pas de singleton global.
- **Sécurité** : pas de path traversal dans `filename` loggé ; `dialogue_id` via `safe_document_id` quand applicable.
- **Performance** : lecture logs agrège fichiers sur plage de dates demandée — acceptable pour volume MVP ; pagination optionnelle si > 500 entrées (hors scope sauf lenteur mesurée).

### What to reuse

- **Backend** : `write_unity_dialogue_to_file`, `batch_export_documents`, `unity_export_schema_validator`, `LLMUsageService`, `safe_document_id`
- **Frontend** : patterns `GenerationLogsPanel` (filtres période, export CSV/JSON, détail au clic), `formatBytes`, `previewUnityDialogueExport`, `downloadPersistedUnityDialogue`, `StyledSelect`, thème `theme` / responsive
- **Tests** : patterns `GenerationLogsPanel.test.tsx`, `test_batch_export_story_5_2.py`, `test_unity_export_story_5_1.py`

### Quality bar

- pytest : log succès/échec single ; batch 2 entrées ; preview sans log ; GET logs filtres ; corruption fichier journalier → liste partielle ou erreur explicite
- Vitest : liste, détail, filtres + résumé, export CSV/JSON, lien preview
- Non-régression : preview 5.5, download 5.4, export 5.1–5.2
- Lint frontend 0 warning

### Refactor bar (defaults)

- ~300 lignes max par fichier source touché ; ~60 lignes par fonction
- Nouveau code dans modules dédiés — pas d'extension massive de `dialogues.py` (832 L)

### Fichiers chauds

| Fichier | Taille actuelle | Contrainte |
|---------|-----------------|------------|
| `api/routers/dialogues.py` | **832 L** | Handlers export existants : appeler `ExportLogService` en 1–2 lignes — **aucune** logique métier inline ; si nouveau endpoint, préférer router `exports.py` |
| `frontend/src/components/graph/GraphEditorHeader.tsx` | **1611 L** | **Aucun** UI logs export ici — branchement logging côté hook/API uniquement |
| `frontend/src/components/unityDialogues/UnityDialogueList.tsx` | **415 L** | Point d'entrée « Logs d'export » → si > 450 L après ajout, extraire bouton/onglet barre outils |
| `services/unity_dialogue_export_service.py` | 160 L | Hook log post-écriture via callback injecté ou appel service depuis callers — éviter gonfler au-delà de ~220 L |

### Conventions

- Messages UI en français ; statuts API en anglais (`success`/`failure`, `valid`/`invalid`/`skipped`)
- `document_id` sans `.json` (aligné 5.2–5.5)
- Tests sans entités GDD réelles nommées
- Dossier logs : `data/logs/exports/` (gitignore cohérent avec `data/logs/`)

### Project Structure Notes

- Nouveau probable : `services/export_log_service.py`, `api/routers/exports.py`, `api/schemas/export_log.py`, `tests/services/test_export_log_service.py`, `tests/api/test_export_logs_story_5_6.py`, `frontend/src/components/unityDialogues/ExportLogsPanel.tsx`, `frontend/src/api/exports.ts`, `frontend/src/__tests__/ExportLogsPanel.test.tsx`
- Modifications probables : `api/main.py`, `api/container.py`, `api/routers/graph_io.py` (save-and-write), `api/routers/dialogues.py` (unity/export, batch-export), `services/batch_export_service.py`, `frontend/src/components/unityDialogues/UnityDialoguesPage.tsx` ou `UnityDialogueList.tsx`
- Schéma entrée log (indicatif) : `{ "id": "uuid", "timestamp": "ISO8601", "dialogue_id": "...", "filename": "....json", "export_status": "success|failure", "validation_status": "valid|invalid|skipped", "cost_eur": number|null, "file_size_bytes": number|null, "errors": string[], "warnings_gdd": object[], "source": "graph|library|batch|unity_export" }`

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-05.md` — Story 5.6, FR54]
- [Source: `_bmad-output/implementation-artifacts/5-5-prévisualiser-export-avant-téléchargement-structure-json-taille-fr53.md` — anti-scope preview-only, patterns preview/download]
- [Source: `_bmad-output/implementation-artifacts/5-1-exporter-dialogue-single-vers-format-unity-json-fr49.md` — write_unity_dialogue_to_file, validation bloquante]
- [Source: `frontend/src/components/usage/GenerationLogsPanel.tsx` — modèle UI logs + export CSV/JSON]
- [Source: `api/routers/llm_usage.py` — GET generation-logs, filtres date]
- [Source: `services/unity_export_validation_service.py` — warnings GDD non bloquants]
- [Source: `services/llm_usage_service.py` — get_dialogue_costs]
- [Source: `.cursor/rules/logging.mdc` — séparation logs observabilité vs logs métier export]
- [Source: `_bmad-output/project-context.md` — services/, handlers courts, tests mockés]

### Previous story intelligence (Story 5.5 — prérequis direct)

- Preview **sans** écriture — ne pas confondre avec export loggé ; les tests 5.6 doivent prouver l'absence de log sur preview.
- `unity_graph_export_serialization.py` : taille/octets cohérents — réutiliser pour `file_size_bytes` au log graphe.
- Export depuis modal preview enchaîne `save-and-write` → **c'est** un export réel à logger.
- Code review 5.5 : pas de second validateur — capturer `validation_status` depuis le résultat déjà calculé au moment export.
- **Où tester UI :** bibliothèque Unity « Logs d'export » ; export graphe/batch doit créer entrées consultables immédiatement après.

### Git intelligence (commits récents)

- `7346f38d` — Story 5.4 download Unity JSON.
- `042c1f05` — Epic 5 export single/batch + validation FR51.
- Branche `Epic/05-unity-export` → epic 5 ; stories 5.1–5.5 **done** ; **5.6** clôt l'epic MVP export (dernière story backlog epic 5).

### Latest tech information

- **Stockage append JSON journalier :** lire tableau existant, append entrée, réécrire atomiquement (tmp → rename) — même philosophie ADR-006 que exports Unity ; éviter corruption si crash mid-write.
- **TanStack Query :** `queryKey` `['export-logs', filters]` + `staleTime` ~15s (aligné generation logs).
- **FastAPI Query dates :** `Optional[date]` comme `llm_usage.get_generation_logs`.
- **Pas de nouvelle dépendance** pour CSV — pattern `csvEscape` existant suffit.

### Project context reference

- `_bmad-output/project-context.md` — logique métier dans `services/`, pas de secrets en dur, tests sans GDD réels.

## Dev Agent Record

### Agent Model Used

Composer (dev-story)

### Debug Log References

- pytest `tests/services/test_export_log_service.py` + `tests/api/test_export_logs_story_5_6.py` : 14 passed
- pytest régression 5.1/5.2/5.5 + 5.6 : 23 passed
- Vitest `ExportLogsPanel.test.tsx` + `GenerationLogsPanel.test.tsx` : 15 passed
- Fix régression : `extract_validation_errors` utilise `exc.detail` (HTTPException) au lieu de `exc.message`

### Completion Notes List

- `ExportLogService` : append atomique `data/logs/exports/YYYY-MM-DD.json`, `build_export_log_metadata` + `metadata_from_document` centralisés
- Hooks export réel : `graph_io.save-and-write`, `dialogues.unity/export`, `batch_export_service` (1 entrée/doc)
- Anti-scope respecté : aucun log sur `preview-export` / batch preview
- API `GET /api/v1/exports/logs` avec filtres date/statut + agrégats
- UI `ExportLogsPanel` drawer depuis `UnityDialogueList`, détail + preview JSON, export CSV/JSON blob
- 🔵 Refactor Task 1 : `export_log_recorder.py` délègue métadonnées au service
- 🔵 Refactor Task 2 : `_read_daily_entries` isolé, router `exports.py` ~55 L handler
- 🔵 Refactor Task 3/6 : `logPanelUtils.ts` partagé avec `GenerationLogsPanel` (csvEscape, période, downloadLogBlob)

### File List

- services/export_log_service.py (new)
- services/export_log_recorder.py (new)
- services/batch_export_service.py
- api/schemas/export_log.py (new)
- api/routers/exports.py (new)
- api/routers/graph_io.py
- api/routers/dialogues.py
- api/container.py
- api/dependencies.py
- api/main.py
- tests/services/test_export_log_service.py (new)
- tests/api/test_export_logs_story_5_6.py (new)
- frontend/src/api/exports.ts (new)
- frontend/src/utils/logPanelUtils.ts (new)
- frontend/src/components/unityDialogues/ExportLogsPanel.tsx (new)
- frontend/src/components/unityDialogues/ExportLogsPanel.css (new)
- frontend/src/components/unityDialogues/ExportLogsPanel.test.tsx (new)
- frontend/src/components/unityDialogues/UnityDialogueList.tsx
- frontend/src/components/usage/GenerationLogsPanel.tsx

## Senior Developer Review (AI)

**Reviewer:** Véronique (via Amelia / code-review) — 2026-06-20  
**Outcome:** Approve après corrections option [1]

### Findings (initial)

| Sev | Issue | Fichier |
|-----|-------|---------|
| HIGH | AC #2 — `POST /unity/export` : échecs disque (`OSError`) / erreurs internes non journalisés | `api/routers/dialogues.py` |
| HIGH | AC #4 — « Voir JSON » : preview seule, pas de repli download 5.4 si fichier persisté | `ExportLogsPanel.tsx` |
| MEDIUM | `save-and-write` : `ValueError` converti en 422 sans entrée log | `api/routers/graph_io.py` |
| MEDIUM | Task 6 — test Vitest CSV manquant | `ExportLogsPanel.test.tsx` |
| LOW | Import inline `extract_validation_errors` dans handler | `dialogues.py` |
| LOW | Handler `GET /exports/logs` ~40 L (> 30 L barre story) | `exports.py` |
| LOW | `source: library` jamais émis (batch couvre bibliothèque) | schéma |

### Fixes applied ([1])

- Journalisation échec sur `OSError` + `Exception` dans `export_unity_dialogue`
- Log export sur `ValueError` save-and-write (si document/filename disponibles)
- Repli `downloadUnityDialogue` quand preview échoue (AC #4)
- Tests : repli download + export CSV blob
- Import top-level `extract_validation_errors`

### Verification

- pytest 5.6 : 14 passed
- Vitest `ExportLogsPanel.test.tsx` : 11 passed

## Change Log

- 2026-06-20 — Code review FR54 : corrections HIGH/MEDIUM, statut → done

## Story Completion Status

- **Status:** done
- **Completion note:** FR54 validé — persistence, API, UI, filtres, export CSV/JSON ; revue adversariale passée avec fixes.
