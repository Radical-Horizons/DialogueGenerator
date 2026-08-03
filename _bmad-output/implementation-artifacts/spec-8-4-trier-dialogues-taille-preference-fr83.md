---
title: 'Story 8.4 — Trier les dialogues (taille + préférence persistée) (FR83)'
type: 'feature'
created: '2026-08-04'
status: 'done'
baseline_commit: 'a3a4ba3a5241dc74df5922ec59a1166591a69ca9'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-3-filtrer-dialogues-date-auteur-fr82.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FR83 exige de trier la bibliothèque par nom, date ou **taille** (nombre de nœuds), avec persistance de la préférence. Nom et date sont déjà livrés (8.1 / 17.7) ; manquent le tri par `node_count` et la sauvegarde localStorage.

**Approach:** Étendre le tri **client-side** existant (`useDialogueListData`) avec `size-desc` / `size-asc` (nulls en fin). Persister `sortType` via localStorage (pattern `batchExportOptions`). Ajouter les options dans `UnityDialogueList` et `DialogueCombobox`. Pas d'API sort serveur.

## Boundaries & Constraints

**Always:**
- Réutiliser `useDialogueListData`, les selects de tri existants, `node_count` déjà exposé — étendre, pas dupliquer.
- Tri appliqué **après** search + filtres FR82 (pipeline inchangé). Défaut `date-desc` si localStorage absent/invalide.
- Persistance clé `dialogueGenerator.dialogueListSort` (string du `DialogueListSortType` validé). Écriture à chaque `setSortType` ; lecture au montage du hook.
- `size-*` : comparer `node_count ?? -1` (ou sentinel) pour placer les items sans compte en fin, ordre stable secondaire par filename.
- Options taille dans **liste et combobox** (même hook). Types/tests alignés.

**Ask First:**
- Sync serveur user-settings → hors MVP (namespaces context/generation seulement).
- Tri serveur `sort_by` → reporter à 8.6 si volumes 1000+.

**Never:**
- Pas de nouvel endpoint `/dialogues` ni `DialogueManagementService` / ORDER BY SQL.
- Pas de refactor cosmétique (icônes ↑↓, nouveau `DialogueSortSelector`) sauf nécessité.
- Ne pas régresser date/nom, filtres, recherche, pagination.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|----------|--------------|-------------------|
| Taille desc | node_count 45, 10, null | ordre 45 → 10 → null |
| Taille asc | idem | ordre 10 → 45 → null (nulls en fin) |
| Persist | choisir size-desc, remonter | sortType = size-desc |
| Invalide LS | valeur inconnue en LS | fallback date-desc |
| Après filtre | search + size-desc | tri uniquement sur le sous-ensemble filtré |
| Non-régression date | défaut sans LS | date-desc (8.1) |

</frozen-after-approval>

## Code Map

- `frontend/src/hooks/useDialogueListData.ts` -- étendre `DialogueListSortType` + branche size ; init/save LS
- `frontend/src/utils/dialogueListSort.ts` (nouveau) -- load/save/validate (pattern batchExportOptions)
- `frontend/src/components/unityDialogues/UnityDialogueList.tsx` -- options taille
- `frontend/src/components/unityDialogues/DialogueCombobox.tsx` -- options taille
- `frontend/src/hooks/useDialogueListData.test.ts` -- tri taille + LS
- `frontend/src/utils/dialogueListSort.test.ts` -- load/save/invalid

## Tasks & Acceptance

**Execution:**
- [x] `frontend/src/utils/dialogueListSort.ts` -- load/save/validate localStorage
- [x] `frontend/src/hooks/useDialogueListData.ts` -- size-asc/desc + hydratation LS
- [x] `UnityDialogueList.tsx` + `DialogueCombobox.tsx` -- options « Taille (grand/petit) »
- [x] Tests Vitest (tri taille, nulls, persist, invalid → défaut)

**Acceptance Criteria:**
- Given des dialogues avec des `node_count` différents, when je choisis « Taille (grand) », then ils sont ordonnés par nombre de nœuds décroissant (nulls en fin).
- Given je change de tri, when je recharge la page, then la préférence est restaurée depuis localStorage.
- Given recherche/filtres actifs, when je trie, then seuls les résultats filtrés sont réordonnés.
- Given aucune préférence stockée, when j'ouvre la liste, then le tri reste date-desc.

## Design Notes

Client-side only : cohérent 8.1–8.3. `node_count` déjà enrichi au listing. Persistence locale (pas user-settings) = scope FR83 épics. Sync serveur / sort API = dette 8.6.

## Verification

**Commands:**
- `npm --prefix frontend run lint` -- zéro erreur
- Vitest ciblé hook + util sort -- verts

**Manual checks:**
- Choisir taille → ordre correct ; F5 → préférence conservée ; combobox narrow aussi.

## Suggested Review Order

**Persistance**

- Load/save/validate localStorage.
  [`dialogueListSort.ts:35`](../../frontend/src/utils/dialogueListSort.ts#L35)

**Tri taille + hydratation**

- Branches size-asc/desc (nulls en fin) + setSortType validé.
  [`useDialogueListData.ts:177`](../../frontend/src/hooks/useDialogueListData.ts#L177)

**UI**

- Options taille liste + combobox.
  [`UnityDialogueList.tsx:420`](../../frontend/src/components/unityDialogues/UnityDialogueList.tsx#L420)

