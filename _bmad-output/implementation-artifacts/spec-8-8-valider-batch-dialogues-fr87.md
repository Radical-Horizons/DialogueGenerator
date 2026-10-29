---
title: 'Story 8.8 — Valider en batch plusieurs dialogues (FR87)'
type: 'feature'
created: '2026-08-04'
status: 'done'
baseline_commit: '09afad0741b4b079731c2d77ae97ddff26c04337'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-7-afficher-metadonnees-dialogue-fr86.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FR87 exige de valider N dialogues (structure, schéma Unity, lore) depuis la bibliothèque avec progression, annulation, rapport exportable et ouverture ciblée — aujourd’hui la validation est unitaire (éditeur) et le batch UI ne sert qu’à l’export.

**Approach:** `BatchValidationService` réutilisant Epic 4 (graphe + schéma + lore). UI sur la sélection bibliothèque existante. **A3** : client séquentiel si N &lt; 20 ; job serveur (202 + SSE/polling + cancel) si N ≥ 20. Rapport + export CSV/JSON + clic → ouvrir dialogue + focus erreur.

## Boundaries & Constraints

**Always:**
- Bouton « Valider en batch » sur la sélection multi existante (`checkedDocumentIds` / mode batch bibliothèque).
- Par dialogue (séquentiel MVP) : (1) `GraphValidationService` via conversion document → graphe ; (2) schéma Unity `validate_persisted_document` ; (3) lore explicite **seulement** si le document fournit un contexte exploitable (`context_selections` / faits lore / équivalent persisté) — sinon **warning** `lore_not_applicable` (« lore non applicable »), sans échec.
- Seuil **20** : N &lt; 20 → appels API synchrone(s) côté client + `AbortController` (miroir export batch) ; N ≥ 20 → job serveur unique (progress X/Y, cancel, toast fin même si l’utilisateur navigue ailleurs).
- RBAC : ne valider que les docs lisibles ; ids inaccessibles → entrée rapport `skipped`/`denied`, pas de fuite.
- Rapport final : valides / avec erreurs / skipped ; erreurs+warnings agrégés par dialogue (`type`, `message`, `node_id` si dispo, source `graph|schema|lore`).
- Export rapport **CSV** et **JSON** (dialogue id, statut, erreurs, timestamp).
- Clic dialogue en erreur → ouvrir dans l’éditeur ; après load + auto-validate, **focus** le premier `node_id` d’erreur si présent (deep-link léger).
- Annulation : stoppe les items restants ; items déjà validés restent dans le rapport partiel.

**Ask First:**
- Changer le seuil 20.
- Validation parallèle multi-workers (V1.5+).
- Persistance longue durée des jobs / historique batch en SQLite.

**Never:**
- Pas de re-implémentation des règles Epic 4 ; pas de batch qui mute les fichiers dialogues.
- Pas de bloquer l’UI sur N ≥ 20 (job async obligatoire).
- Pas de régression export batch / listing 8.1–8.7.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|----------|--------------|-------------------|
| Petit lot OK | 5 docs valides | progress 1…5 ; rapport 5 valides |
| Erreurs mixtes | 3 OK + 2 erreurs | rapport séparé ; erreurs listées |
| Lore absent | doc sans contexte | warning lore_not_applicable ; graphe+schéma inchangés |
| Lore présent | contexte OK + contradiction | erreur/warning lore dans rapport |
| Cancel mid | abort à 2/5 | rapport partiel 2 ; reste skipped/cancelled |
| Job large | N=25 | 202 + progress ; toast à la fin |
| Cancel job | cancel pendant run | statut cancelled ; partiel conservé |
| RBAC | id privé autre user | skipped/denied dans rapport |
| Export | rapport prêt | télécharge CSV et JSON |
| Open+focus | clic erreur avec node_id | éditeur ouvert + focus nœud |
| Vide | 0 sélection | CTA désactivé / no-op |

</frozen-after-approval>

## Code Map

- `services/batch_validation_service.py` -- orchestrate graphe+schéma+lore par document_id
- `services/graph_conversion_service.py` + `graph_validation_service.py` + `unity_export_validation_service.py` + `lore_contradiction_validator.py` -- réemploi
- `api/routers/dialogues.py` -- `POST /batch-validate` (sync petit / kick job) + cancel + export éventuellement
- `api/services/` job manager batch-validate (pattern génération ou reindex) + SSE/status
- `api/schemas/` -- request ids, progress, report item, export
- `frontend/src/hooks/useBatchDialogueValidation.ts` -- seuil 20, AbortController vs job
- `BatchValidationModal.tsx` / rapport + export CSV/JSON (miroir bannières export)
- `UnityDialogueList` / toolbar batch -- CTA « Valider en batch »
- Deep-link : loader dialogue + `focusNode` / inject query `nodeId` best-effort
- Tests : `tests/api/test_batch_validate.py`, Vitest hook/modal, matrice I/O

## Tasks & Acceptance

**Execution:**
- [x] `BatchValidationService` -- 1 dialogue : graphe + schéma + lore|warning
- [x] API sync + job N≥20 (progress, cancel, toast-ready status)
- [x] Schemas rapport + export CSV/JSON
- [x] Hook + modal progression/rapport + CTA bibliothèque
- [x] Open dialogue + focus node_id
- [x] Tests matrice (pytest + Vitest) + lint

**Acceptance Criteria:**
- Given N&lt;20 sélectionnés, when Valider en batch, then progression X/Y, annulation possible, rapport final.
- Given N≥20, when lancé, then job async non bloquant + notification de fin.
- Given erreurs, when rapport, then détail par dialogue + export CSV/JSON + clic ouvre éditeur (focus si node_id).
- Given sans contexte lore, when validé, then warning lore non applicable (pas d’échec lore seul).

## Design Notes

Seuil 20 côté front **et** serveur (refus/force job si N≥20 sur sync). Contexte lore : lire champs déjà persistés sur le document / sidecars génération s’ils existent ; ne pas appeler Notion live. Export = blob client depuis le rapport en mémoire (ou endpoint si job).

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_batch_validate.py -q` -- pass
- `npm --prefix frontend run test -- --run src/hooks/useBatchDialogueValidation src/components/unityDialogues/` -- pass (ciblé)
- `npm --prefix frontend run lint` -- zéro erreur

## Suggested Review Order

**Service**

- Orchestration graphe + schéma + lore|warning
  [`batch_validation_service.py:148`](../../services/batch_validation_service.py#L148)

**API**

- Sync N&lt;20 et rejet N≥20
  [`dialogues.py:894`](../../api/routers/dialogues.py#L894)

- Job 202 + status + cancel
  [`dialogues.py:934`](../../api/routers/dialogues.py#L934)

**Frontend**

- Seuil 20 sync vs job + polling
  [`useBatchDialogueValidation.ts:40`](../../frontend/src/hooks/useBatchDialogueValidation.ts#L40)

- Rapport, export, ouverture
  [`BatchValidationModal.tsx:90`](../../frontend/src/components/unityDialogues/BatchValidationModal.tsx#L90)

- Focus nœud après load
  [`useDialogueLoader.ts:194`](../../frontend/src/hooks/useDialogueLoader.ts#L194)

**Tests**

- Matrice API/service
  [`test_batch_validate.py:1`](../../tests/api/test_batch_validate.py#L1)
