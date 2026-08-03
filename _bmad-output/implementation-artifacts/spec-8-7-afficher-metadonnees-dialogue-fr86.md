---
title: 'Story 8.7 — Afficher les métadonnées d’un dialogue (nodes, coût, last edited) (FR86)'
type: 'feature'
created: '2026-08-04'
status: 'done'
baseline_commit: '384afaa1799e64c5593cd62caf8bb07b64ecebe0'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-6-indexer-dialogues-recherche-rapide-fr85.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FR86 exige d’évaluer taille, coût LLM et fraîcheur d’un dialogue sans l’ouvrir — la liste a nodes/dates/auteur mais pas de coût ni panneau métadonnées, et `last_modified_by` n’est pas exposé.

**Approach:** Service d’agrégation + `GET /dialogues/{id}/metadata` ; enrichir le listing (coût EUR, last editor) ; UI compacte + tooltip hover + panneau détail réutilisant breakdown coûts (1.12) et permissions (Epic 7). Statut éditorial et historique des mods différés.

## Boundaries & Constraints

**Always:**
- `DialogueMetadataService.get_dialogue_metadata(document_id)` : index SQLite (`created_at`, `updated_at`, `owner_*`, `last_modified_by`) + `node_count` + agrégat coûts via `LLMUsageService.get_dialogue_costs` (EUR, coût/nœud) — pas de nouveau store de coûts.
- `GET /api/v1/dialogues/{document_id}/metadata` authentifié, scoped RBAC (même accès lecture que le document) ; 404 si inconnu/interdit.
- Listing `UnityDialogueMetadata` : champs optionnels `total_cost_eur`, `last_modified_by` / username (ou équivalent) pour vue compacte ; coût 0 / absent si aucun usage.
- Front liste : affichage compact nodes + coût + last edit ; tooltip hover (« N nœuds, X€, modifié il y a … par … ») disparaît après ~3 s ou clic/leave.
- Panneau « Métadonnées dialogue » : nom, auteur, dates création/modif, last editor, nodes, coût total, coût/nœud ; lien/embed breakdown 1.12 ; section permissions via API/UI Epic 7 existante.
- `document_id` = stem filename (aligné `dialogue_id` llm-usage).

**Ask First:**
- Nouveau modèle de statut éditorial (déjà différé 8.3).
- Historique détaillé des modifications (Story 10.5).
- Cache serveur dédié au-delà du best-effort listing.

**Never:**
- Pas de statut Validé/En cours/Brouillon dans cette story.
- Pas d’historique timeline mods ; pas de table `cost_logs` SQL ni duplication du calcul coûts.
- Pas de régression listing/filtres/search/collections (8.1–8.6).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|----------|--------------|-------------------|
| Meta OK | GET metadata doc accessible | 200 : nodes, coûts EUR, dates, owner, last_editor |
| Coût absent | doc sans usage LLM | total 0 ; coût/nœud 0 ou N/A |
| Coût + nodes | usage + N nodes | total + cost_per_node = total/N (N&gt;0) |
| RBAC | doc privé autre user | 404/403 cohérent documents |
| Liste enrichie | page unity-dialogues | items avec cost + last editor si dispo |
| Tooltip | hover item | aperçu ; auto-hide ~3s / leave / clic |
| Partagé | panneau meta | creator + last editor + permissions Epic 7 |
| Guest lecture | doc partagé visible | meta lecture OK ; pas de mutate |

</frozen-after-approval>

## Code Map

- `services/dialogue_metadata_service.py` -- agrégation index + LLMUsage + usernames
- `api/schemas/dialogue.py` (+ schema metadata dédié si besoin) -- contrat réponse
- `api/routers/dialogues.py` -- `GET /{id}/metadata`
- `api/routers/unity_dialogues.py` -- enrichissement listing
- `api/container.py` + `dependencies.py` -- wiring
- `frontend/src/api/dialogueMetadata.ts` (+ types)
- `frontend/src/components/unityDialogues/DialogueMetadataPanel.tsx` -- panneau détail
- `UnityDialogueItem.tsx` / `UnityDialogueList.tsx` / `UnityDialogueDetails.tsx` -- compact + tooltip + ouverture panneau
- `useDialogueListData.ts` -- si merge coûts côté client nécessaire
- Réutiliser : `LLMUsageService`, `DialogueCostBreakdown`, `DialoguePermissionsPanel`
- Tests : `tests/api/test_dialogue_metadata.py`, Vitest panel + item tooltip

## Tasks & Acceptance

**Execution:**
- [x] `DialogueMetadataService` + DI -- agrégation + résolution usernames
- [x] `GET /dialogues/{id}/metadata` + schemas -- contrat FR86 détail
- [x] Enrichir listing Unity -- cost + last_modified_by exposés
- [x] Client API + types front
- [x] `DialogueMetadataPanel` + entrée depuis détails/liste
- [x] Compact liste + tooltip hover 3s
- [x] Brancher breakdown coûts + permissions existants
- [x] Tests matrice I/O (pytest) + Vitest ciblés

**Acceptance Criteria:**
- Given un dialogue avec nœuds et usages LLM, when je vois la liste, then nodes, coût total € et last edit sont visibles (compact et/ou tooltip).
- Given ouverture « Métadonnées dialogue », when le panneau s’affiche, then nom, auteur, dates, nodes, coût total, coût/nœud, last editor (sans statut éditorial ni historique).
- Given usages LLM, when je consulte le panneau, then je peux ouvrir le breakdown par génération (1.12).
- Given dialogue partagé, when panneau, then creator + last editor + permissions (Epic 7).
- Given doc sans coût / inaccessible, when liste ou GET metadata, then 0€ ou 404/403 sans crash UI.

## Design Notes

Réutiliser `get_dialogue_costs` / `get_all_dialogues_costs` (EUR via facteur existant). Enrichissement listing : préférer agrégat batch côté service listing plutôt que N appels HTTP front. Tooltip custom (pas seulement `title=`) pour contrôle 3 s. Statut éditorial déjà en deferred-work (8.3) ; historique → 10.5.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_dialogue_metadata.py -q` -- pass
- `npm --prefix frontend run test -- --run src/components/unityDialogues/` -- pass (ciblé panel/item)
- `npm --prefix frontend run lint` -- zéro erreur

## Suggested Review Order

**Service d'agrégation**

- Point d'entrée métier : index + coûts EUR + usernames
  [`dialogue_metadata_service.py:55`](../../services/dialogue_metadata_service.py#L55)

- Dates index normalisées ISO-UTC
  [`dialogue_metadata_service.py:73`](../../services/dialogue_metadata_service.py#L73)

**API**

- GET metadata RBAC + pas de fuite `storage_path`
  [`dialogues.py:136`](../../api/routers/dialogues.py#L136)

- Enrichissement listing après filtre RBAC
  [`unity_dialogues.py:315`](../../api/routers/unity_dialogues.py#L315)

**Frontend**

- Panneau détail + breakdown 1.12 + permissions
  [`DialogueMetadataPanel.tsx:30`](../../frontend/src/components/unityDialogues/DialogueMetadataPanel.tsx#L30)

- Compact + tooltip 3s (coût omis si absent/0)
  [`UnityDialogueItem.tsx:118`](../../frontend/src/components/unityDialogues/UnityDialogueItem.tsx#L118)

**Tests**

- Matrice API/service
  [`test_dialogue_metadata.py:1`](../../tests/api/test_dialogue_metadata.py#L1)
