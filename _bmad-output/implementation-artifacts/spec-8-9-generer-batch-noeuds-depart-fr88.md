---
title: 'Story 8.9 — Générer en batch depuis plusieurs nœuds de départ (FR88)'
type: 'feature'
created: '2026-08-04'
status: 'done'
baseline_commit: '923d83a8941e2e5fa77a10af40b461e5dd294648'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-8-8-valider-batch-dialogues-fr87.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** FR88 exige de lancer une génération depuis plusieurs nœuds parents sélectionnés (branches parallèles) avec progression, tolérance aux échecs partiels et liaison auto parent→enfant — aujourd’hui le batch 1.2 ne couvre qu’un seul parent.

**Approach:** Réutiliser `generate-node` / `generate_all_choices` + `connectNodes` (front). **A3** : N &lt; 10 orchestration front séquentielle ; N ≥ 10 job serveur (202 + progress/cancel + toast fin même hors graphe). Contexte **B2** : snapshot GDD du nœud si présent, sinon contexte global.

## Boundaries & Constraints

**Always:**
- Entrée UI : multi-sélection (`selectedNodeIds`) + action « Générer batch depuis sélection » (`BatchOperationsMenu` et/ou menu contextuel multi).
- Par parent : générer les choix non connectés (équivalent `generate_all_choices`) ; plage ~3–8 nœuds/parent = résultat du LLM/règles existantes, pas une boucle forcée côté UI.
- Liaisons parent→enfant : **toujours** `connectNodes` côté front (jamais déléguer la connexion déterministe à l’API).
- Contexte : `node.data.gddContextSelectionsSnapshot` si présent, sinon `useContextStore.selections` (enrichissement scène BE inchangé).
- Seuil **10** : N &lt; 10 → boucle front séquentielle + AbortController / cancel ; N ≥ 10 → job serveur unique (progress « Nœud i/N — j/k », cancel, toast de fin même si navigation hors page graphe — store/polling app-level).
- Échec partiel : les autres parents continuent ; rapport liste les parents en erreur ; CTA « Réessayer les échecs ».
- Résumé final : « X nœuds générés depuis Y nœuds de départ ».
- Séquentiel MVP (pas de parallel workers multi-parents).

**Ask First:**
- Changer le seuil 10.
- Génération parallèle multi-parents (V1.5+).
- Persistance longue des jobs en SQLite.

**Never:**
- Pas de re-implémenter la génération mono-parent 1.2 ; pas de skip `connectNodes` front.
- Pas de bloquer l’UI sur N ≥ 10.
- Pas d’exiger un snapshot GDD obligatoire (B3 exclu).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Behavior |
|----------|--------------|-------------------|
| Petit lot OK | 3 parents sélectionnés | progress 1/3… ; nœuds liés ; résumé |
| Échec partiel | parent 2 LLM fail | 1+3 OK ; rapport fail parent 2 ; retry possible |
| Snapshot GDD | parent avec snapshot | requête utilise snapshot |
| Sans snapshot | parent sans snapshot | contexte global |
| Cancel mid | abort à parent 2/3 | partiel conservé ; reste cancelled |
| Job large | N=12 | 202 + progress ; toast fin même hors graphe |
| Cancel job | cancel pendant run | statut cancelled + partiel |
| 0 / 1 sélection | 0 ou 1 nœud | CTA désactivé / no-op (batch = ≥2) |
| Choix déjà liés | parent sans choix libre | skip parent + warning rapport |

</frozen-after-approval>

## Code Map

- `frontend/src/store/slices/generationSlice.ts` -- réutiliser generateFromNode / connectNodes
- `BatchOperationsMenu.tsx` + `useBatchOperations.ts` -- CTA « Générer batch depuis sélection »
- `useBatchGenerateFromNodes.ts` (+ store app-level job poll pour toast hors page)
- Modal progression/rapport/retry
- `services/batch_node_generation_service.py` -- orchestrate N parents (job path)
- `api/routers/graph_generation.py` ou dialogues -- `POST …/batch-generate-from-nodes` + jobs
- Réemploi `GraphNodeOrchestrator` / `GraphGenerationService.generate_nodes_for_all_choices`
- Tests : pytest job/sync service ; Vitest hook/menu/modal

## Tasks & Acceptance

**Execution:**
- [x] Service + API job (N≥10) + progress/cancel
- [x] Hook front seuil 10 (boucle sync vs job) + polling app-level toast
- [x] CTA multi-sélection + modal progression/résumé/retry
- [x] Contexte snapshot|global + connectNodes après chaque parent
- [x] Tests matrice + lint

**Acceptance Criteria:**
- Given ≥2 nœuds sélectionnés, when Générer batch, then progression par parent et liaisons auto.
- Given un parent échoue, when lot termine, then rapport + retry des échecs sans relancer les OK.
- Given N≥10, when lancé, then job non bloquant + toast de fin même hors graphe.
- Given snapshot GDD sur un parent, when généré, then ce snapshot est utilisé.

## Design Notes

Endpoint sous `/api/v1/unity-dialogues/graph/` (espace graphe existant) plutôt que `/dialogues/{id}/…` si plus cohérent — garder document_id dans le body. Job payload = résultats par parent (`nodes`, `suggested_connections`) pour que le front applique `connectNodes`.

## Verification

**Commands:**
- `node scripts/getPythonPath.js -m pytest tests/api/test_batch_generate_from_nodes.py -q` -- pass
- `npm --prefix frontend run test -- --run src/hooks/useBatchGenerateFromNodes src/components/graph/` -- pass (ciblé)
- `npm --prefix frontend run lint` -- zéro erreur
