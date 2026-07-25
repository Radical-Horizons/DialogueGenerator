---
description: Synchronisation bidirectionnelle TestNode ↔ choix parent
globs: ["frontend/src/store/graphStore.ts", "frontend/src/utils/testNodeSync.ts", "frontend/src/components/graph/nodes/TestNode.tsx"]
alwaysApply: false
---

- **Source of Truth** : Le choix parent (JSON Unity) est la source de vérité. Les TestNodes sont des vues dérivées (artefacts de visualisation ReactFlow).
- **Synchronisation bidirectionnelle** : Toute modification TestNode → choix parent, toute modification choix → TestNode. Utiliser `testNodeSync.ts` pour toute logique de sync.
- **Module utilitaire** : `frontend/src/utils/testNodeSync.ts` (SRP) avec `parseTestNodeId()`, `getParentChoiceForTestNode()`, `syncTestNodeFromChoice()`, `syncChoiceFromTestNode()`, `syncTestNodeResultEdges()`.
- **graphStore.ts** : `updateNode()`, `deleteNode()`, `connectNodes()`, `disconnectNodes()` détectent TestNode et synchronisent automatiquement avec choix parent.
- **Anti-récursion** : TestNode → choix → TestNode en une seule passe. Le TestNode est toujours resynchronisé depuis le choix (choix a le dernier mot).
- **Mapping handles** : `TEST_HANDLE_TO_CHOICE_FIELD` et `CHOICE_FIELD_TO_HANDLE` pour convertir handles TestNode ↔ champs choice.
- **Format ID TestNode** : `test-node-{dialogueNodeId}-choice-{choiceIndex}`. Parser avec `parseTestNodeId()`.
- **Export Unity** : TestNodes ne sont pas exportés. Seuls les champs `test`, `test*Node` dans les choix sont exportés.
- **Références** : `docs/architecture/test-node-sync.md` pour détails complets.
