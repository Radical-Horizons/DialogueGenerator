---
title: 'Story 8.1 — Lister tous les dialogues du système (FR80)'
type: 'feature'
created: '2026-08-03'
status: 'done'
baseline_commit: '05e4c8f3266d61e745d82d25488c39351f3612d4'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La bibliothèque (`GET /api/v1/unity-dialogues` + `UnityDialogueList`) charge tout d'un bloc, sans pagination, et n'expose ni le nombre de nœuds ni la date de création — trois exigences de FR80 non couvertes à l'échelle de centaines de dialogues.

**Approach:** Étendre l'endpoint et le composant existants (pas de doublon) : pagination serveur opt-in (50/page, rétrocompatible), enrichissement de chaque item avec `node_count` et `created_at`, contrôles de pagination UI avec indicateur « Page X sur Y — Total : Z ». Tri par défaut (date modif desc) et filtrage RBAC `can_list` conservés.

## Boundaries & Constraints

**Always:**
- Réutiliser `GET /api/v1/unity-dialogues`, `UnityDialogueList`, `useDialogueListData` et `api/utils/pagination.py` (étendre, pas dupliquer).
- Rétrocompat : sans query param `page`, la réponse garde son comportement actuel (liste complète). `page`/`page_size` optionnels, `page_size` défaut 50.
- Paginer APRÈS le filtrage RBAC (`can_list`/`capabilities`) et le tri ; conserver `share_count` et le tri date modif desc.
- `node_count` = nb de nœuds du JSON Unity (clé `nodes`, repli legacy, `None` si illisible). `created_at` = `dialogues_index.created_at` si indexé, sinon repli horodatage fichier.
- Types TS alignés Pydantic ; docstrings + annotations sur le Python touché ; `pathlib.Path` / UTF-8.

**Ask First:**
- Impact de la pagination serveur sur la recherche client existante (page courante vs corpus complet) : la recherche plein corpus est la Story 8.2 → gater toute bascule qui la modifie.
- Si le calcul `node_count` (parse par fichier) devient un coût mesuré au-delà de quelques centaines → escalader vers l'indexation (8.6), ne pas optimiser ici.

**Never:**
- Pas de rôle « Viewer » (Epic 7 a figé le guest-first ; la visibilité reste `can_list`).
- Pas de recherche/filtrage serveur (8.2/8.3), tri additionnel (8.4), collections (8.5), indexation 1000+ (8.6), panneau métadonnées/coûts (8.7).
- Pas de nouvel endpoint `/api/v1/dialogues` GET ni `DialogueManagementService` parallèle ; ne pas modifier le format JSON Unity.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rétrocompat | `GET /unity-dialogues` sans `page` | Liste complète actuelle, triée date modif desc | N/A |
| Paginé | `?page=2&page_size=50`, 120 visibles | 20 items (101–120) + `total=120,page=2,page_size=50,total_pages=3` | N/A |
| Page hors limites | `page=99`, 10 visibles | Liste vide + `total=10,total_pages=1,page=99` | Pas d'erreur |
| Item enrichi | Dialogue 45 nœuds indexé | `node_count=45`, `created_at` de l'index | N/A |
| JSON corrompu | `.json` non parsable | Item listé, `node_count=null`, reste présent ; log warning | Ne pas casser la liste |
| Non indexé | Fichier sans entrée index | `created_at` repli fichier ; listé selon RBAC | N/A |
| RBAC | Writer non autorisé | Dialogues privés d'autrui absents (inchangé) | N/A |

</frozen-after-approval>

## Code Map

- `api/routers/unity_dialogues.py` -- endpoint listing (scan disque, tri, RBAC, share_count) — ajouter params pagination + enrichissement
- `api/schemas/dialogue.py` -- `UnityDialogueMetadata` (~L678) + `UnityDialogueListResponse` (~L704) — ajouter `node_count`, `created_at`, `page`, `page_size`, `total_pages`
- `api/utils/pagination.py` -- `PaginationParams`/`paginate_list`/`total_pages` réutilisables
- `services/repositories/sqlite/dialogues_index_repository.py` -- source `created_at`
- `frontend/src/api/unityDialogues.ts` -- `listUnityDialogues()` : query params + retour métadonnées pagination
- `frontend/src/hooks/useDialogueListData.ts` -- état page + total, tri date-desc par défaut
- `frontend/src/components/unityDialogues/UnityDialogueList.tsx` -- contrôles pagination + indicateur « Page X sur Y — Total : Z »
- `frontend/src/components/unityDialogues/UnityDialogueItem.tsx` -- afficher `node_count`
- `frontend/src/components/usage/UsageHistoryTable.tsx` -- référence pattern pagination
- `frontend/src/types/api.ts` -- types de réponse à étendre

## Tasks & Acceptance

**Execution:**
- [x] `api/schemas/dialogue.py` -- ajouter `node_count: int | None`, `created_at: datetime | None` à l'item ; `page`, `page_size`, `total_pages` à la réponse -- exposer FR80 sans casser les clients
- [x] `api/routers/unity_dialogues.py` -- query params optionnels `page`/`page_size` (défaut 50) ; calculer `node_count` (parse `nodes`, `None` si illisible) et `created_at` (index sinon fichier) ; paginer via `api/utils/pagination.py` après RBAC + tri
- [x] `services/document_persistence_service.py` -- `get_created_at(document_id)` exposant la date de création indexée (ajout non prévu initialement, nécessaire pour rester dans la couche service)
- [x] `frontend/src/types/api.ts` -- étendre les types réponse -- alignement TS/Pydantic
- [x] `frontend/src/api/unityDialogues.ts` -- transmettre `page`/`page_size`, retourner métadonnées pagination
- [x] `frontend/src/hooks/useDialogueListData.ts` -- pagination client-side (préserve la recherche existante), tri date-desc conservé
- [x] `frontend/src/components/unityDialogues/UnityDialogueList.tsx` -- Précédent/Suivant + « Page X sur Y — Total : Z » (visible dès > `page_size`)
- [x] `frontend/src/components/unityDialogues/UnityDialogueItem.tsx` -- afficher le nombre de nœuds + date de création
- [x] `tests/api/test_unity_dialogues.py` -- couvrir les scénarios de la matrice I/O (rétrocompat, pagination, hors limites, node_count, JSON corrompu, created_at repli) ; RBAC via `tests/api/test_dialogues_rbac.py`
- [x] `frontend/src/components/unityDialogues/UnityDialogueList.test.tsx` + `frontend/src/hooks/useDialogueListData.test.ts` -- Vitest : rendu pagination + indicateur + node_count + reset de page

**Acceptance Criteria:**
- Given plus de `page_size` dialogues visibles, when j'ouvre la liste, then je vois la 1re page (50 défaut), l'indicateur « Page X sur Y — Total : Z », et je navigue entre pages.
- Given un item, when il s'affiche, then il montre nom, date de modification, date de création et nombre de nœuds.
- Given un appel sans `page`, when la réponse revient, then le comportement legacy est inchangé (combobox, palette, continuité, logs génération non régressés).
- Given des dialogues privés d'autrui, when je liste, then ils restent absents (aucune régression `can_list`).
- Given je clique sur un dialogue, when je le sélectionne, then il s'ouvre dans l'éditeur (flux existant inchangé).

## Design Notes

Étendre `unity-dialogues` plutôt que créer le `/api/v1/dialogues` du PRD : l'endpoint réel porte déjà RBAC + tri + `share_count` ; dupliquer fragmenterait la source de vérité. Paginer après RBAC+tri garantit que la page N reflète l'ordre global.

**Pagination : serveur (opt-in) + UI client-side.** Le backend expose une pagination serveur opt-in (params `page`/`page_size`, rétrocompatible, testée) — utile pour les futurs consommateurs (8.2 recherche, 8.6 index). Mais la bibliothèque `UnityDialogueList` conserve une recherche/tri **client-side** sur le corpus complet ; y brancher la pagination serveur casserait la recherche multi-pages (territoire 8.2). Conformément à la boundary « Ask First », l'UI applique donc une pagination **client-side** (`useDialogueListData`) qui satisfait les AC (50/page, « Page X sur Y — Total : Z », navigation) sans régresser la recherche existante.

## Verification

**Commands:**
- `npm run test:backend:fast` -- expected: `test_unity_dialogues*` et `test_dialogues_rbac` verts
- `npm --prefix frontend run lint` -- expected: zéro erreur
- `npm run test:frontend:quick` -- expected: test pagination `UnityDialogueList` vert

**Manual checks:**
- `npm run dev` → liste de dialogues : vérifier indicateur « Page X sur Y — Total : Z », navigation, nombre de nœuds, ouverture au clic.
