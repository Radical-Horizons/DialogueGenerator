---
title: 'Story 7.4 — Writers créent, éditent et suppriment des dialogues'
type: 'feature'
created: '2026-07-16'
baseline_commit: 53b0aadfc47f5479f1c20159e335e7e9c497b1c6
status: 'done'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-7-3-administrateurs-gerent-les-utilisateurs.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les dialogues sur disque n’ont pas de propriétaire : tout compte authentifié peut les modifier et les chemins de création/suppression divergent. Un writer ne dispose donc pas d’un CRUD isolé.

**Approach:** Indexer les dialogues dans SQLite, unifier le CRUD sur le document révisionné et appliquer côté API les droits propriétaire/admin. Ajouter à la bibliothèque une création sans LLM et des actions pilotées par les capacités serveur.

## Boundaries & Constraints

**Always:** Attribuer chaque nouveau dialogue au writer courant; autoriser propriétaire et admin au CRUD; indexer seulement après écriture fichier réussie; préserver révisions et `choiceId`; protéger toutes les voies persistantes; maintenir `DISABLE_AUTH=true`; garder le JSON comme source de vérité.

**Ask First:** Toute attribution automatique des dialogues historiques à un writer, modification du format Unity, suppression d’une voie API publique au lieu d’une façade compatible, ou changement du contrat de révision exige une validation.

**Never:** Ne pas ajouter co-édition, liens invités, audit persistant, rôle `viewer`, temps réel ou recherche Epic 8. Aucun fallback legacy après 400/401/403/409/422.

## I/O & Edge-Case Matrix

| Scénario | Entrée / état | Résultat attendu | Gestion d’erreur |
|----------|----------------|-----------------|------------------|
| CRUD propriétaire | Writer crée, modifie puis supprime | Fichiers, révision, index et UI convergent | N/A |
| Accès tiers | Writer B cible un dialogue de Writer A | Aucune lecture ni mutation; aucune voie legacy n’écrit | 403 explicite |
| Administration | Admin cible un dialogue | CRUD autorisé | N/A |
| Écriture invalide | Validation ou révision échoue | Fichier et index inchangés | 400/422 ou 409 |
| Dialogue historique | Fichier sans index | Admin autorisé; aucune attribution implicite | 403 writer |
| Suppression active | Changements non sauvegardés | Confirmation puis nettoyage complet après succès | État conservé si échec |

</frozen-after-approval>

## Code Map

- `services/repositories/sqlite/` — migration et repository `dialogues_index`.
- `services/document_persistence_service.py` — orchestration fichier/index/révisions.
- `api/container.py`, `api/dependencies.py` — injection et gardes owner/admin.
- `api/routers/documents.py`, `unity_dialogues.py`, `graph_io.py`, `graph_expansion.py` — voies à unifier.
- `frontend/src/api/documents.ts`, `frontend/src/types/`, `persistenceSlice.ts` — contrat et état canonique.
- `frontend/src/components/UnityDialogueList.tsx`, `DialogueListContextMenu.tsx`, `UnityDialogueDetails.tsx` — parcours CRUD.

## Tasks & Acceptance

**Execution:**
- [x] `services/repositories/sqlite/migrations/002_dialogues_index.sql`, `dialogues_index_repository.py` — créer l’index propriétaire et son CRUD transactionnel.
- [x] `services/document_persistence_service.py`, `api/container.py` — centraliser et injecter les mutations fichier/index.
- [x] `api/dependencies.py`, `api/routers/documents.py` — protéger GET, PUT, layout et DELETE par owner/admin.
- [x] `api/routers/unity_dialogues.py`, `graph_io.py`, `graph_expansion.py` — déléguer au service ou refuser les bypass.
- [x] `api/schemas/`, types/client frontend, `persistenceSlice.ts` — exposer les capacités, unifier le CRUD et propager strictement les erreurs.
- [x] Composants bibliothèque — créer sans LLM, conditionner les actions et protéger l’état non sauvegardé.
- [x] Tests backend/Vitest et `docs/api/api-contracts-api.md` — couvrir la matrice et le contrat réel.

**Acceptance Criteria:**
- Given un writer, when il crée depuis la bibliothèque, then il devient propriétaire et le dialogue reste éditable après rechargement.
- Given le propriétaire, when il sauvegarde ou supprime, then document, layout, révision, index et UI convergent.
- Given un autre writer, when il tente l’accès par l’UI ou directement par toute route persistante, then l’API répond 403 et aucune donnée ne change.
- Given un admin ou le bypass local, when il gère un dialogue, then le parcours existant reste fonctionnel, y compris pour un fichier historique non indexé.

## Spec Change Log

## Design Notes

Le service d’accès est l’unique autorité : `owner | admin` en 7.4; 7.6 ajoutera `shared writer` sans changer les routeurs. Le frontend consomme les capacités API.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/services/repositories/sqlite tests/services/test_document_persistence_service.py tests/api/test_documents.py tests/api/test_dialogues_rbac.py tests/api/test_graph_crud.py tests/api/test_graph_expand_tree.py tests/api/test_unity_export_story_5_1.py -q --tb=short` — `92 passed`.
- `cd frontend && npx vitest run src/__tests__/graphStore.documents.test.ts src/components/generation/UnityDialogueEditor.save.test.tsx src/components/unityDialogues/DialogueListContextMenu.test.tsx src/components/unityDialogues/UnityDialogueList.test.tsx src/api/unityDialogues.test.ts --reporter=dot` — `33 passed`.
- `npm --prefix frontend run lint` — zéro erreur ou warning.
- `npm run test:backend:fast` — aucune régression backend rapide.

**Manual checks (if no CLI):**
- Avec `DISABLE_AUTH=false`, vérifier en navigateur les parcours writer propriétaire, writer tiers et admin à largeur desktop puis 320 px.

## Completion Notes

- Index propriétaire SQLite et autorité de persistance fichier/index ajoutés avec compensation des écritures, révisions optimistes et séquence ADR-006.
- Toutes les voies persistantes identifiées appliquent owner/admin avant mutation ; les erreurs 400/401/403/409/422 ne déclenchent aucun fallback frontend.
- La bibliothèque permet la création sans LLM, consomme les capacités serveur, confirme la suppression active et bascule liste/détails à faible largeur.
- Revue adversariale corrigée : création `createOnly` atomique, identité chemin/index, lecture document+révision sérialisée, dry-run sans conflit, suppression sans layout, IDs Windows stricts et conflit ADR-006 non trompeur.
- La sauvegarde frontend conserve la révision document après échec layout, invalide les opérations tardives à la navigation, attend le callback post-save et acquitte atomiquement le journal pending/snapshot.
- Vérification navigateur réelle effectuée avec le bypass local : création, rechargement, ouverture, suppression et contrôle à 320 px.
- Vérifications finales : backend fast initial `1973 passed, 3 skipped, 15 deselected`; régressions adversariales backend `92 passed`; frontend ciblé `33 passed`; ESLint sans erreur ni warning.

## File List

- Backend : `services/document_persistence_service.py`, `services/document_id_validation.py`, `services/repositories/sqlite/`, `api/container.py`, `api/dependencies.py`, `api/routers/{documents,unity_dialogues,graph_io,graph_expansion,dialogues}.py`, `api/schemas/`.
- Frontend : `frontend/src/api/`, `frontend/src/types/`, `frontend/src/store/{slices/persistenceSlice.ts,types/graphState.ts}`, `frontend/src/utils/graphJournal.ts`, `frontend/src/hooks/useDialogueLoader.ts`, `frontend/src/components/unityDialogues/`, `frontend/src/components/generation/UnityDialogueEditor.tsx`.
- Tests et contrat : `tests/api/test_dialogues_rbac.py`, `tests/services/test_document_persistence_service.py`, `tests/services/repositories/sqlite/`, tests export existants, tests Vitest bibliothèque/store/éditeur et `docs/api/api-contracts-api.md`.

## Suggested Review Order

**Autorité de persistance et d’accès**

- Centralise ownership, révisions, compensation fichier/index et sérialisation des lectures.
  [`document_persistence_service.py:67`](../../services/document_persistence_service.py#L67)

- Branche les contrats HTTP canoniques sur l’autorité commune.
  [`documents.py:580`](../../api/routers/documents.py#L580)

- Supprime document, sidecars et index selon les mêmes permissions.
  [`documents.py:751`](../../api/routers/documents.py#L751)

- Encapsule les opérations SQLite sans modifier le propriétaire à l’édition.
  [`dialogues_index_repository.py:24`](../../services/repositories/sqlite/dialogues_index_repository.py#L24)

**Création et concurrence**

- Rend la création exclusive atomique même sous requêtes concurrentes.
  [`document_persistence_service.py:273`](../../services/document_persistence_service.py#L273)

- Expose explicitement la sémantique create-only au contrat document.
  [`documents.py:45`](../../api/schemas/documents.py#L45)

- Initialise un dialogue sans LLM puis sélectionne le document créé.
  [`UnityDialogueList.tsx:143`](../../frontend/src/components/unityDialogues/UnityDialogueList.tsx#L143)

**État frontend et capacités**

- Isole chaque sauvegarde pour éviter les races lors d’une navigation.
  [`persistenceSlice.ts:392`](../../frontend/src/store/slices/persistenceSlice.ts#L392)

- Rend la suppression strictement fail-closed sur la capacité serveur.
  [`DialogueListContextMenu.tsx:195`](../../frontend/src/components/unityDialogues/DialogueListContextMenu.tsx#L195)

- Formalise les capacités calculées par l’API pour chaque dialogue.
  [`dialogue_access.py:6`](../../api/schemas/dialogue_access.py#L6)

**Schéma et preuves**

- Ajoute l’index relationnel propriétaire et ses contraintes utilisateur.
  [`002_dialogues_index.sql:1`](../../services/repositories/sqlite/migrations/002_dialogues_index.sql#L1)

- Prouve CRUD propriétaire, refus tiers et administration des fichiers historiques.
  [`test_dialogues_rbac.py:63`](../../tests/api/test_dialogues_rbac.py#L63)

- Prouve la création frontend déterministe sans appel LLM.
  [`UnityDialogueList.test.tsx:119`](../../frontend/src/components/unityDialogues/UnityDialogueList.test.tsx#L119)
