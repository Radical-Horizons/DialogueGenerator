# Architecture : Conversion JSON Unity ↔ Graph ReactFlow

## Vue d'ensemble

Ce document explique la distinction entre **Source of Truth métier**, **projection canonique**, et **view state**, ainsi que les responsabilités de chaque couche dans la conversion entre le format Unity JSON et le format ReactFlow (nodes/edges).

## Les trois couches conceptuelles

### 1. Source of Truth (SoT) métier : JSON Unity

**Définition** : Le format Unity JSON est la **source de vérité métier**. C'est le format de stockage et d'échange avec Unity.

**Caractéristiques** :
- Format standard Unity Dialogue Format v1.0.0
- Tableau de nœuds avec propriétés canoniques (`id`, `text`, `choices`, `test*Node`, etc.)
- **Ne contient pas** de nœuds `TestNode` (ces nœuds sont des artefacts de visualisation uniquement)
- **Ne contient pas** de positions (positions = view state)

**Exemple** :
```json
[
  {
    "id": "START",
    "text": "Bonjour",
    "choices": [
      {
        "text": "Répondre",
        "test": "Raison+Diplomatie:8",
        "testCriticalFailureNode": "node_fail_crit",
        "testFailureNode": "node_fail",
        "testSuccessNode": "node_success",
        "testCriticalSuccessNode": "node_success_crit"
      }
    ]
  }
]
```

### 2. Projection canonique : GraphModel (nodes/edges sémantiques)

**Définition** : La **projection canonique** transforme le JSON Unity en un modèle de graphe éditable (ReactFlow nodes/edges) avec les règles sémantiques correctes.

**Responsabilités** :
- Créer des `TestNode` automatiquement pour visualiser les choix avec test
- Reconstruire les connexions `test*Node` depuis les edges ReactFlow
- Gérer les 4 résultats de test (critical-failure, failure, success, critical-success)
- Valider la cohérence (références cassées, nœuds orphelins)

**Implémentation canonique** : `GraphConversionService` (backend Python)

**Pourquoi backend ?**
- **Logique métier complexe** : Reconstruction des connexions Unity depuis les edges, détection des TestNodes
- **Validation centralisée** : Garantit que le format exporté est compatible Unity
- **Cohérence** : Un seul compilateur évite le drift entre frontend et backend
- **Réutilisabilité** : Même service utilisé par l'API web et les tests Python

### 3. View State : Positions et état d'édition

**Définition** : Les **positions** et autres états d'édition (zoom, pan, sélection) sont des données de confort d'édition persistantes, mais **pas** une vérité métier Unity.

**Caractéristiques** :
- Positions stockées dans localStorage (clé: `node_positions:{filename}`)
- Priorité de merge : positions localStorage > positions draft > positions backend
- **Ne doit pas** influencer la sémantique (edges, handles, règles `test*Node`)
- **En session** : les positions ne sont lues depuis localStorage **qu'au chargement** (merge une fois dans le store). Pendant la session, la seule source pour les positions est le store ; localStorage est mis à jour à chaque changement de position (cache pour la prochaine ouverture).

**React Flow et source de vérité (ADR-007)** : Le canvas utilise React Flow en **mode controlled** : les nodes et edges passés à `<ReactFlow>` viennent **uniquement** du store (graphStore). Le **viewport** (zoom, pan, caméra) reste en état **local** à React Flow (non persisté). Détails : `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md` (ADR-007).

**Export visuel (PNG/SVG)** : en mode controlled (ADR-007), l'export reflète l'état du store.

## Flux de données

### Chargement (JSON Unity → ReactFlow)

```
JSON Unity (SoT)
    ↓
API /load → GraphConversionService.unity_json_to_graph()
    ↓
GraphModel canonique (nodes/edges + métadonnées)
    ↓
Frontend : Merge avec positions localStorage
    ↓
ReactFlow (nodes/edges avec positions)
```

### Sauvegarde (ReactFlow → JSON Unity)

```
ReactFlow (nodes/edges + positions)
    ↓
API /save → GraphConversionService.graph_to_unity_json()
    ↓
[Reconstruction des connexions Unity depuis edges]
[Exclusion des TestNodes (artefacts visuels)]
[Reconstruction des 4 résultats de test]
    ↓
JSON Unity canonique (validé, format Unity conforme)
    ↓
API /unity/export → Écriture fichier
```

## Points critiques

### ⚠️ TestNodes ne sont PAS dans le JSON Unity

Les `TestNode` (barre avec 4 handles) sont **uniquement** des artefacts de visualisation créés par la projection canonique. Ils n'existent pas dans le JSON Unity :

- **Dans Unity JSON** : Les choix avec test ont 4 champs `test*Node` directement dans le choix
- **Dans ReactFlow** : Un `TestNode` est créé automatiquement pour visualiser ces connexions
- **À l'export** : Les `TestNode` sont **exclus** du JSON Unity, seuls les champs `test*Node` dans les choix sont exportés

### ⚠️ Export canonique obligatoire pour la sauvegarde

**Problème** : `graphStore.exportToUnity()` (logique locale frontend) ne gère **pas** correctement :
- Les TestNodes avec 4 résultats (`testCriticalFailureNode`, `testCriticalSuccessNode`)
- La reconstruction complexe des connexions depuis les edges
- La validation Unity

**Solution** : Toujours utiliser `saveDialogue()` → API `/save` (ou `/save-and-write`) pour obtenir le JSON canonique avant de sauvegarder.

**Stratégie save/sync (ADR-006)** : Store = document (une seule source de vérité). Pas de mode draft/save : toute modification est journalisée localement (IndexedDB) et synchronisée vers le serveur en micro-batch 100 ms max avec **seq** monotone. Le serveur applique seq/last_seq et écriture atomique (tmp → fsync → rename). Détails : `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md` (ADR-006).

**Exception acceptable (hors ADR-006)** : `graphStore.exportToUnity()` reste utilisable pour export local (draft) si besoin ; la persistance disque et la cohérence passent par l'API.

## Décisions architecturales

### Pourquoi le backend fait la projection canonique ?

1. **Complexité métier** : 
   - Création automatique de TestNode à partir des choix avec test
   - Reconstruction des connexions Unity (nextNode, successNode, test*Node) depuis les edges ReactFlow
   - Détection du type de nœud (dialogueNode, testNode, endNode)

2. **Validation et cohérence** :
   - Le backend valide le JSON Unity avant conversion
   - Garantit que le format exporté est compatible Unity
   - Logs et erreurs structurées côté serveur

3. **Réutilisabilité** :
   - Le même service est utilisé par l'API web et les tests Python
   - Évite la duplication de logique

### Pourquoi le frontend a aussi unityJsonToGraph() ?

**Contexte** : `GraphView.tsx` (composant read-only) utilise `unityJsonToGraph()` localement. **GraphView** n'est pas couverte par ADR-007 (canvas éditeur) ; sa source est le prop `json_content` ; elle peut rester en mode uncontrolled.

**Raison actuelle** : Composant d'affichage simple qui reçoit déjà le JSON Unity et le convertit directement pour la visualisation.

**Avenir** : Cette fonction pourrait être dépréciée au profit de l'API `/load`, mais ce n'est **pas critique** car :
- C'est un composant read-only (pas d'export)
- La logique est moins complexe (pas besoin de reconstruction inverse)
- Performance acceptable (pas de latence réseau si JSON déjà en mémoire)

**Recommandation** : Documenter que c'est une "projection de présentation" et que la projection canonique reste côté backend.

## Glossaire

- **SoT métier** : Source of Truth métier = JSON Unity (format de stockage)
- **Projection canonique** : Transformation JSON Unity ↔ GraphModel (backend = source unique)
- **View state** : Positions et état d'édition (persistant mais pas métier)
- **TestNode** : Artefact de visualisation ReactFlow (n'existe pas dans Unity JSON)
- **Export canonique** : Export via API `/save` qui garantit la cohérence Unity

## Références

- Schéma Unity officiel : `docs/resources/dialogue-format.schema.json`
- Service de conversion backend : `services/graph_conversion_service.py`
- API Graph : `api/routers/graph.py`
- Store frontend : `frontend/src/store/graphStore.ts`
- Documentation Story 0-10 (4 résultats de test) : `_bmad-output/implementation-artifacts/0-10-tests-4-resultats-critiques.md`
- Stratégie autosave / seq / résilience : ADR-006 dans `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md`
- React Flow mode controlled (nodes/edges depuis le store, viewport local) : ADR-007 dans `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md`

---

**Dernière mise à jour** : 2026-01-29 (ADR-007 React Flow controlled ; référence viewport local)
