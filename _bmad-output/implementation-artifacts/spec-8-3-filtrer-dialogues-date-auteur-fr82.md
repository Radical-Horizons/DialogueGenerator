---
title: 'Story 8.3 — Filtrer les dialogues par date et auteur (FR82)'
type: 'feature'
created: '2026-08-03'
status: 'done'
baseline_commit: '6b51653f56197b51d955804023c79b51e9a35f5d'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-2-rechercher-dialogues-fr81.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La bibliothèque n'offre aucun filtre par métadonnées. FR82 veut filtrer par date de création, auteur et statut, avec filtres combinables (ET), badges actifs et reset. Le **statut éditorial** (Validé / En cours / Brouillon) n'existe nulle part (ni index, ni JSON Unity) → hors MVP. L'**auteur** existe en SQLite (`owner_id`) mais n'est pas exposé au listing.

**Approach:** Enrichir le listing avec `owner_id` / `owner_username` (index + résolution username). Étendre le filtrage **client-side** (cohérent 8.1/8.2) : presets de période sur `created_at` + dropdown auteur dérivé des items visibles, combinés en ET avec la recherche existante. Badges actifs retirables + reset. Afficher l'auteur sur l'item.

## Boundaries & Constraints

**Always:**
- Réutiliser `GET /api/v1/unity-dialogues`, `UnityDialogueMetadata`, `useDialogueListData`, `UnityDialogueList`, `UnityDialogueItem`, `Badge` (étendre, pas dupliquer).
- Enrichissement listing : `owner_id` + `owner_username` depuis `dialogues_index` + `UserRepository` ; `None` si non indexé / user introuvable (item conservé).
- Filtres **client-side**, combinés en **ET** avec la recherche FR81. Presets date : `all` | `today` | `week` | `month` | `year` (année civile) sur `created_at` (repli `modified_time` si absent). Auteur = `owner_id` sélectionné (ou « Tous »).
- Dropdown auteurs = distinct des dialogues **déjà visibles** (post-RBAC) — pas d'appel `/users` admin-only. Respect RBAC : ne jamais élargir la visibilité.
- Rétrocompat champs optionnels ; types TS alignés ; docstrings + annotations Python ; `pathlib.Path`/UTF-8.

**Ask First:**
- Si volume rend le filtre client trop lent → escalader vers filtrage serveur / index 8.6.
- Toute introduction d'un modèle de statut éditorial → hors MVP, demander avant.

**Never:**
- Pas de statut Validé/En cours/Brouillon (aucune donnée ; ne pas réutiliser tags nœud ni `validationMode`).
- Pas de nouvel endpoint `/dialogues` ni `DialogueManagementService` parallèle ; pas de filtrage serveur (query params) dans cette story.
- Ne pas régresser recherche/pagination/tri ni combobox/palette.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|----------|--------------|-------------------|
| Période semaine | preset `week`, dialogues créés J-3 et J-20 | seul J-3 visible |
| Année civile | preset `year`, créé cette année vs année précédente | seuls ceux de l'année civile |
| Auteur | sélection owner X | seuls dialogues avec `owner_id=X` |
| Combinaison ET | `week` + auteur X + recherche « ures » | intersection des trois |
| Badges | filtre date + auteur actifs | 2 badges, clic X retire un seul |
| Reset | filtres actifs | un clic → période=all, auteur=tous |
| Non indexé | pas d'entrée index | `owner_*=null` ; exclus d'un filtre auteur précis ; date via repli fichier |
| RBAC writer | dialogues d'autrui non partagés | absents du listing (inchangé) ; dropdown = owners visibles seulement |
| Aucun résultat | filtres trop restrictifs | « Aucun dialogue trouvé » + compteur ; reset possible |

</frozen-after-approval>

## Code Map

- `api/schemas/dialogue.py` -- `UnityDialogueMetadata` : ajouter `owner_id`, `owner_username`
- `services/document_persistence_service.py` -- exposer owner depuis l'index (éviter double lecture vs `get_created_at` si possible)
- `api/routers/unity_dialogues.py` -- résoudre username via `UserRepository` dans la passe listing
- `frontend/src/types/api.ts` -- mirror `owner_id?`, `owner_username?`
- `frontend/src/hooks/useDialogueListData.ts` -- état période + auteur ; filtre ET ; liste auteurs distincts ; reset
- `frontend/src/utils/logPanelUtils.ts` ou helper dédié -- étendre presets (`year`) pour le filtre date
- `frontend/src/components/unityDialogues/UnityDialogueList.tsx` -- selects période/auteur + badges `Badge` + reset
- `frontend/src/components/unityDialogues/UnityDialogueItem.tsx` -- afficher auteur si présent
- Tests : `tests/api/test_unity_dialogues.py`, `useDialogueListData.test.ts`, `UnityDialogueList.test.tsx`

## Tasks & Acceptance

**Execution:**
- [x] `api/schemas/dialogue.py` -- ajouter `owner_id` / `owner_username` optionnels
- [x] `services/document_persistence_service.py` -- méthode d'accès owner (+ created_at si regroupable) depuis l'index
- [x] `api/routers/unity_dialogues.py` -- enrichir items avec owner (résolution username, résilient)
- [x] `frontend/src/types/api.ts` -- mirror des champs
- [x] `frontend/src/hooks/useDialogueListData.ts` -- filtres période + auteur (ET avec search), auteurs distincts, reset, reset page
- [x] `frontend/src/components/unityDialogues/UnityDialogueList.tsx` -- UI selects + badges actifs + bouton reset
- [x] `frontend/src/components/unityDialogues/UnityDialogueItem.tsx` -- afficher l'auteur
- [x] Tests backend + Vitest (période, auteur, ET, badges/reset, owner null)

**Acceptance Criteria:**
- Given des dialogues créés à différentes dates, when je choisis « Cette semaine », then seuls ceux créés dans les 7 derniers jours apparaissent.
- Given plusieurs auteurs visibles, when je sélectionne un auteur, then seuls ses dialogues apparaissent.
- Given période + auteur + recherche, when les trois sont actifs, then l'intersection (ET) est affichée avec badges retirables et un reset global.
- Given un item avec propriétaire indexé, when il s'affiche, then l'auteur (username) est visible.
- Given un writer, when il ouvre le dropdown auteur, then il ne voit que les owners des dialogues déjà visibles (pas de fuite RBAC).

## Design Notes

Client-side + enrichissement listing (pas endpoint filtre serveur) : cohérent avec 8.1/8.2 ; le RBAC a déjà réduit le corpus. Les auteurs du dropdown sont dérivés des items chargés → pas besoin de `GET /users` (admin-only). Presets date calqués sur `getPeriodRange` (+ `year` = 1er janvier → aujourd'hui). **Statut éditorial reporté** (aucune source) — entrée dans `deferred-work.md`.

## Verification

**Commands:**
- `npm run test:backend:fast` -- `test_unity_dialogues*` verts (owner enrichi)
- `npm --prefix frontend run lint` -- zéro erreur
- `npm run test:frontend:quick` -- hook + liste (période, auteur, ET, badges) verts

**Manual checks:**
- `npm run dev` → filtres période/auteur, badges X, reset, auteur visible sur l'item, combinaison avec recherche.

## Suggested Review Order

**Enrichissement auteur (backend)**

- Champs index regroupés (created_at + owner_id, une lecture).
  [`document_persistence_service.py:243`](../../services/document_persistence_service.py#L243)

- ISO UTC explicite pour l'index + résolution username cachée.
  [`unity_dialogues.py:147`](../../api/routers/unity_dialogues.py#L147)

- Payload owner sur chaque item.
  [`unity_dialogues.py:377`](../../api/routers/unity_dialogues.py#L377)

**Filtres client-side (FR82)**

- Période + auteur en ET avec la recherche ; auteurs distincts + stale clear.
  [`useDialogueListData.ts:116`](../../frontend/src/hooks/useDialogueListData.ts#L116)

- Seuils de période (année civile, rolling 7/30 j).
  [`dialogueListFilters.ts:26`](../../frontend/src/utils/dialogueListFilters.ts#L26)

- Selects + badges retirables + reset + empty state.
  [`UnityDialogueList.tsx:426`](../../frontend/src/components/unityDialogues/UnityDialogueList.tsx#L426)

**Tests**

- Owner enrichi / null (API).
  [`test_unity_dialogues.py`](../../tests/api/test_unity_dialogues.py)

- Période, auteur, ET+search, badges X (Vitest).
  [`useDialogueListData.test.ts`](../../frontend/src/hooks/useDialogueListData.test.ts)
