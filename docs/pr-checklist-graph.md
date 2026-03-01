# Checklist PR – Éditeur de graphe

À vérifier avant de merger des changements touchant le graphe (store, projection doc→graph, TestNode, edges, autosave).

## Invariants

- [ ] **Pas de double edge dialogue→test** : un seul edge par (dialogue, choice) vers le TestNode ; ID canonique `e:{nodeId}:choice:{choiceId}:test` (voir `graphEdgeBuilders.ts`, `testNodeSync.ts`, `documentToGraph.ts`).
- [ ] **IDs legacy + stable** : les deux formats d’ID TestNode sont gérés (`test:choiceId` et `test-node-{nodeId}-choice-{index}`) ; le layout peut stocker la position sous l’un ou l’autre.
- [ ] **Drag + autosave** : déplacer un nœud dialogue ou test ne déclenche pas de boucle d’erreurs 4xx ; le circuit breaker (backoff 10 s sur 4xx) reste en place dans `GraphEditor.tsx`.

## Tests

- [ ] Tests unitaires : `frontend/src/__tests__/documentToGraph.test.ts`, `testNodeSync.test.ts` (invariants « no duplicate edges », « position from layout »).
- [ ] E2E smoke : `e2e/graph-load-display-nodes.spec.ts` (chargement + drag, pas d’erreurs console en boucle).

## Migration choiceId

- [ ] Si le PR modifie le schéma ou l’API documents : `npm run check:migration` (ou GET `/api/v1/documents/check-migration`) ne doit pas lister de documents à migrer, ou la migration est prévue.
