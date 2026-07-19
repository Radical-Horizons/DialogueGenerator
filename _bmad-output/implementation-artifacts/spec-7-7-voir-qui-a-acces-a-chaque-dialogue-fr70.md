---
title: 'Story 7.7 — Voir qui a accès à chaque dialogue (FR70)'
type: 'feature'
created: '2026-07-19'
baseline_commit: '03ee6c1d'
status: 'done'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-6-partager-dialogues-co-edition-entre-writers-fr69.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Après le partage 7.6, owner/admin gèrent les invites via une modal, mais co-éditeurs et lecteurs autorisés ne voient pas clairement propriétaire + co-éditeurs, et la liste dialogues n’indique pas Privé vs Co-édité.

**Approach:** Agrégat lecture `GET …/permissions` (owner + co-éditeurs) pour qui a `can_read` hors guest ; panneau Permissions avec révocation owner/admin (réutilise DELETE shares) ; badge/tooltip liste `Privé` | `Co-édité (N)` via `share_count` sur la liste Unity.

## Boundaries & Constraints

**Always:** Pas de `share_links` / liens invités per-dialogue — les guests sont une session démo app-wide (7.5), hors surface d’exposition d’un dialogue. `GET /permissions` : users authentifiés non-guest avec `can_read` (owner, co-éditeur, admin). Réponse : owner `{user_id, username}` + `co_editors[]` (mêmes champs utiles que shares) + `can_manage` (owner|admin). Révocation : uniquement via DELETE shares existant, UI visible si `can_manage`. Liste : enrichir métadonnées avec `share_count` (entier ≥ 0) pour badge sans N+1 GET. Badge : `Privé` si `share_count === 0`, sinon `Co-édité (N)`. Guest / `DISABLE_AUTH` inchangés. Tests auth réelle avec `DISABLE_AUTH=false` quand pertinent.

**Ask First:** Exposer le panneau Permissions aux guests ; compter l’owner dans N ; autre surface liste que Unity Dialogues / combobox.

**Never:** Table ou CRUD `share_links`. Variante badge « Lien invité ». Audit logs (7.8). Directory users pour writers. Changer SoT document/révisions. Dupliquer la logique grant (reste dans DialogueSharingModal / POST shares).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| View perms | Owner/co-éditeur/admin GET permissions | Owner + liste co-éditeurs ; `can_manage` true seulement owner/admin | 403 guest / sans can_read ; 404 doc absent |
| Revoke | Owner/admin révoque depuis panneau | Share disparu ; GET permissions à jour ; co-éditeur perd accès | 403 co-éditeur ; 404 share |
| Badge privé | Liste item `share_count=0` | Affiche/tooltip « Privé » | N/A |
| Badge co-edit | Liste item `share_count=2` | Affiche/tooltip « Co-édité (2) » | N/A |
| Guest | Guest ouvre permissions / liste | Pas de panneau manage ; badge optionnel informatif OK si list visible, pas d’API permissions | GET permissions → 403 |

</frozen-after-approval>

## Code Map

- `api/schemas/dialogue_permissions.py` — schéma agrégat owner + co_editors + can_manage.
- `services/dialogue_sharing_service.py` — méthode `get_permissions(document_id, user)` (index + shares + username owner).
- `api/routers/dialogue_shares.py` (ou router dédié) — `GET /api/v1/dialogues/{id}/permissions` gate `can_read` non-guest.
- `api/schemas/dialogue.py` + `api/routers/unity_dialogues.py` — `share_count` sur `UnityDialogueMetadata` / listing batch.
- `services/repositories/sqlite/dialogue_shares_repository.py` — count/batch counts par document_id si absent.
- `docs/api/api-contracts-api.md` — contrat permissions + champ liste.
- `frontend/src/api/dialoguePermissions.ts` — client GET permissions.
- `frontend/src/components/unityDialogues/DialoguePermissionsPanel.tsx` — owner + co-éditeurs + Révoquer si can_manage.
- `frontend/src/components/unityDialogues/UnityDialogueDetails.tsx` — entrée « Permissions » (coexistence avec Partager).
- `frontend/src/components/unityDialogues/UnityDialogueItem.tsx` (+ types `api.ts`) — badge/tooltip Privé | Co-édité (N).
- Tests : `tests/api/test_dialogue_permissions.py` ; Vitest panel + `UnityDialogueList`/`UnityDialogueItem`.

## Tasks & Acceptance

**Execution:**
- [x] `dialogue_shares_repository.py` + `dialogue_sharing_service.py` — agrégat permissions + counts batch pour liste.
- [x] Schemas/router + `api-contracts-api.md` — `GET …/permissions` + `share_count` liste Unity.
- [x] `DialoguePermissionsPanel.tsx` + client + wire `UnityDialogueDetails` — surface FR70 détail.
- [x] `UnityDialogueItem.tsx` + types — badge/tooltip liste.
- [x] Tests pytest matrice I/O + Vitest panel/liste + lint — non-régression 7.6.

**Acceptance Criteria:**
- Given owner, co-éditeur ou admin avec accès, when ouverture Permissions, then propriétaire et co-éditeurs sont listés ; révocation visible seulement owner/admin.
- Given owner/admin, when révocation depuis le panneau, then le share disparaît et le co-éditeur perd lecture/écriture.
- Given liste Unity Dialogues, when `share_count` 0 vs N>0, then badge/tooltip « Privé » vs « Co-édité (N) ».
- Given guest, when GET permissions, then 403 ; aucun CRUD share_links.

## Spec Change Log

## Design Notes

L’epic 7.7 cite encore `share_links` et « Lien invité actif » — **périmé** : guests = session démo 7.5, pas partage per-dialogue. `/shares` reste manager-only (grant/list/revoke) ; `/permissions` est la vue lecture élargie (co-éditeur inclus). Enrichir la liste avec `share_count` évite N appels permissions. Conserver `DialogueSharingModal` pour l’invite ; le panneau 7.7 se concentre sur la lecture + revoke.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_dialogue_permissions.py tests/api/test_dialogue_shares.py -q --tb=short` — pass.
- `cd frontend && npx vitest run src/components/unityDialogues/DialoguePermissionsPanel.test.tsx src/components/unityDialogues/UnityDialogueList.test.tsx --reporter=dot` — pass.
- `npm --prefix frontend run lint` — zéro erreur.

## Suggested Review Order

**Agrégat permissions API**

- Entrée métier : owner réel (sans inventer le requester) + co-éditeurs actifs seulement
  [`dialogue_sharing_service.py:133`](../../../services/dialogue_sharing_service.py#L133)

- Route lecture élargie (can_read, guest 403) distincte du CRUD `/shares`
  [`dialogue_shares.py:62`](../../../api/routers/dialogue_shares.py#L62)

- Counts badge : writers actifs uniquement, batch `IN`
  [`dialogue_shares_repository.py:95`](../../../services/repositories/sqlite/dialogue_shares_repository.py#L95)

- Enrichissement liste Unity avec `share_count`
  [`unity_dialogues.py:132`](../../../api/routers/unity_dialogues.py#L132)

**UI FR70**

- Gate bouton : user hydraté et non-guest
  [`UnityDialogueDetails.tsx:53`](../../../frontend/src/components/unityDialogues/UnityDialogueDetails.tsx#L53)

- Panneau + revoke (404 = succès local, garde génération)
  [`DialoguePermissionsPanel.tsx:80`](../../../frontend/src/components/unityDialogues/DialoguePermissionsPanel.tsx#L80)

- Badge/tooltip `Privé` | `Co-édité (N)`
  [`UnityDialogueItem.tsx:88`](../../../frontend/src/components/unityDialogues/UnityDialogueItem.tsx#L88)

**Périphériques**

- Matrice I/O + inactifs exclus
  [`test_dialogue_permissions.py:85`](../../../tests/api/test_dialogue_permissions.py#L85)

- Vitest panneau + badge liste
  [`DialoguePermissionsPanel.test.tsx:33`](../../../frontend/src/components/unityDialogues/DialoguePermissionsPanel.test.tsx#L33)
