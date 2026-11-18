# Architecture : Synchronisation TestNode ↔ Choix Parent

## Vue d'ensemble

Les TestNodes sont des **artefacts de visualisation** créés automatiquement pour représenter les choix avec tests dans l'éditeur de graphe ReactFlow. Ils ne sont **pas** stockés dans le JSON Unity (Source of Truth métier).

Cette documentation explique comment la synchronisation bidirectionnelle garantit la cohérence entre les TestNodes (vue dérivée) et leurs choix parents (Source of Truth).

## Principe fondamental : Source of Truth unique

### Choix parent = Source of Truth

- **Format Unity JSON** : Les choix avec tests contiennent directement les champs `test`, `testCriticalFailureNode`, `testFailureNode`, `testSuccessNode`, `testCriticalSuccessNode`
- **Stockage** : Ces champs sont persistés dans le JSON Unity
- **Export** : Seuls ces champs sont exportés vers Unity (les TestNodes sont exclus)

### TestNode = Vue dérivée

- **Visualisation** : Les TestNodes sont créés automatiquement pour faciliter l'édition dans ReactFlow
- **Non persisté** : Les TestNodes n'existent pas dans le JSON Unity
- **Synchronisation** : Toute modification d'un TestNode doit être répercutée sur le choix parent

## Architecture de synchronisation

### Module utilitaire : `testNodeSync.ts`

**Responsabilité unique (SRP)** : Gérer toute la logique de synchronisation TestNode ↔ choix parent.

**Fonctions principales** :

1. **`parseTestNodeId(testNodeId)`** : Parse l'ID d'un TestNode pour extraire `dialogueNodeId` et `choiceIndex`
2. **`getParentChoiceForTestNode(testNodeId, nodes)`** : Trouve le choix parent d'un TestNode
3. **`syncTestNodeFromChoice(...)`** : Synchronise TestNode depuis choix parent (choice → testNode)
4. **`syncChoiceFromTestNode(...)`** : Synchronise choix parent depuis TestNode (testNode → choice)
5. **`syncTestNodeResultEdges(...)`** : Crée/met à jour les edges TestNode → nœuds de résultat

### Flux de synchronisation

#### Direction 1 : Choix → TestNode (choice-to-test)

```
Choix modifié (ajout/suppression test, modification test*Node)
  ↓
syncTestNodeFromChoice()
  ↓
TestNode créé/mis à jour/supprimé
  ↓
Edges créés/mis à jour/supprimés
```

**Quand** : Modification d'un DialogueNode avec choix contenant un `test`

#### Direction 2 : TestNode → Choix (test-to-choice)

```
TestNode modifié (test, criticalFailureNode, etc.)
  ↓
syncChoiceFromTestNode()
  ↓
Choix parent mis à jour
  ↓
syncTestNodeFromChoice() (pour cohérence)
  ↓
TestNode resynchronisé depuis choix
```

**Quand** : Modification directe d'un TestNode via NodeEditorPanel

## Implémentation dans graphStore

### `updateNode`

**Détection TestNode** :
- Si `node.type === 'testNode'` → rediriger vers le choix parent
- Modifier le choix parent avec `syncChoiceFromTestNode()`
- Puis synchroniser le TestNode depuis le choix avec `syncTestNodeFromChoice()`

**Garde-fou anti-récursion** : La synchronisation TestNode → choix → TestNode se fait en une seule passe, évitant les boucles infinies.

### `deleteNode`

**Suppression TestNode** :
- Si `nodeId.startsWith('test-node-')` → trouver le choix parent
- Supprimer `test` et tous les champs `test*Node` du choix parent
- Le TestNode sera automatiquement supprimé par la synchronisation

### `connectNodes`

**Connexion depuis TestNode** :
- Si `sourceNode.type === 'testNode'` et `sourceHandle` présent → trouver le choix parent
- Mettre à jour le champ `test*Node` correspondant dans le choix parent
- Puis synchroniser le TestNode depuis le choix

### `disconnectNodes`

**Déconnexion depuis TestNode** :
- Si `edge.source.startsWith('test-node-')` et `edge.sourceHandle` présent → trouver le choix parent
- Supprimer le champ `test*Node` correspondant dans le choix parent
- Puis synchroniser le TestNode depuis le choix

## Garde-fous anti-récursion

### Problème

Une synchronisation bidirectionnelle peut créer des boucles infinies :
- TestNode modifié → choix modifié → TestNode modifié → ...

### Solution

**Flag de direction implicite** : La synchronisation se fait toujours dans un ordre précis :

1. **TestNode → Choix** : `syncChoiceFromTestNode()` met à jour le choix
2. **Choix → TestNode** : `syncTestNodeFromChoice()` resynchronise le TestNode depuis le choix

Le TestNode est **toujours** resynchronisé depuis le choix après modification, garantissant que le choix (Source of Truth) a le dernier mot.

### Exemple

```typescript
// Utilisateur modifie TestNode
updateNode('test-node-dialogue-1-choice-0', {
  data: { test: 'Force+Combat:10' }
})

// 1. syncChoiceFromTestNode() : choix.test = 'Force+Combat:10'
// 2. syncTestNodeFromChoice() : TestNode resynchronisé depuis choix
// → Pas de boucle, car TestNode est toujours recalculé depuis choix
```

## Mapping Handle ↔ Champ Choice

### Mapping Handle → Champ Choice

```typescript
TEST_HANDLE_TO_CHOICE_FIELD = {
  'critical-failure': 'testCriticalFailureNode',
  'failure': 'testFailureNode',
  'success': 'testSuccessNode',
  'critical-success': 'testCriticalSuccessNode',
}
```

### Mapping Champ Choice → Handle

```typescript
CHOICE_FIELD_TO_HANDLE = {
  'testCriticalFailureNode': 'critical-failure',
  'testFailureNode': 'failure',
  'testSuccessNode': 'success',
  'testCriticalSuccessNode': 'critical-success',
}
```

## Exemples d'utilisation

### Exemple 1 : Modification d'un TestNode

```typescript
// Utilisateur modifie le test dans NodeEditorPanel
updateNode('test-node-dialogue-1-choice-0', {
  data: {
    test: 'Force+Combat:10',
    successNode: 'node-success',
  }
})

// Résultat :
// 1. Choix parent mis à jour : choice.test = 'Force+Combat:10', choice.testSuccessNode = 'node-success'
// 2. TestNode resynchronisé depuis choix (pour cohérence)
// 3. Edge créé : test-node-dialogue-1-choice-0 → node-success (handle: success
```

### Exemple 2 : Suppression d'un TestNode

```typescript
// Utilisateur supprime le TestNode (raccourci pour supprimer le test)
deleteNode('test-node-dialogue-1-choice-0')

// Résultat :
// 1. Choix parent mis à jour : choice.test = undefined, tous les test*Node supprimés
// 2. TestNode supprimé automatiquement
// 3. Toutes les edges liées supprimées
```

### Exemple 3 : Connexion depuis TestNode

```typescript
// Utilisateur connecte depuis le handle "success" du TestNode
connectNodes('test-node-dialogue-1-choice-0', 'node-success', undefined, 'test-success', 'success')

// Résultat :
// 1. Choix parent mis à jour : choice.testSuccessNode = 'node-success'
// 2. TestNode resynchronisé depuis choix
// 3. Edge créé : test-node-dialogue-1-choice-0 → node-success
```

## Validation

### Tests unitaires

**Fichier** : `frontend/src/__tests__/testNodeSync.test.ts`

- Tests pour chaque fonction utilitaire
- Cas limites (IDs invalides, choix absent, etc.)
- Validation des mappings bidirectionnels

### Tests d'intégration

**Fichier** : `frontend/src/__tests__/useGraphStore.testNodeSync.test.ts`

- `updateNode` sur TestNode → met à jour choix parent
- `deleteNode` sur TestNode → supprime test du choix
- `connectNodes` depuis TestNode → met à jour choix parent
- `disconnectNodes` depuis TestNode → met à jour choix parent
- Anti-récursion : pas de boucle infinie

## Points d'attention

### Performance

- **Sync à chaque modification** : Acceptable car les choix sont peu nombreux
- **Recalcul TestNode** : Le TestNode est toujours resynchronisé depuis le choix pour garantir la cohérence

### Rétrocompatibilité

- **Code existant** : Continue de fonctionner (pas de breaking changes)
- **Migration progressive** : Les anciens patterns sont progressivement remplacés

### Positions TestNode

- **Préservées** : une barre dont le layout porte la position reste où l'auteur l'a posée (`normalizeTestBars(nodes, edges, layout)`), y compris après une édition du parent ou une connexion de résultat.
- **Réalignement** : dès qu'une barre du dialogue n'a pas de position stockée (test ajouté), tout le groupe se recentre sous le parent ; même chose après « Disposer » / dagre (appel sans layout).
- **Layout élagué** : `mergeLayoutWithNodePositions` retire les clés `test-node-*` des barres disparues — sinon une barre réapparue (test retiré puis remis, choix réordonnés) passerait pour déplacée et se superposerait à sa voisine.
- **Glisser** : une barre se glisse seule ; une multi-sélection de parents emporte leurs barres (`useReactFlowHandlers`).

## Références

- **Module utilitaire** : `frontend/src/utils/testNodeSync.ts`
- **Types** : `frontend/src/types/testNode.ts`
- **Store** : `frontend/src/store/graphStore.ts`
- **Architecture générale** : `docs/architecture/graph-conversion-architecture.md`
- **Format Unity** : `docs/specifications/Unity_Dialogue_Format_4_Test_Results.md`
