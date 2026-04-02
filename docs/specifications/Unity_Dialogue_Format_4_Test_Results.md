# Format Unity Dialogue - Tests avec 4 Résultats

## Vue d'ensemble

Le format Unity JSON supporte les tests d'attribut avec **4 résultats possibles** : échec critique, échec, réussite, et réussite critique. Cette documentation décrit le format exact attendu par Unity et la logique de fallback.

## Format JSON Unity

### Pour les Choix (dans `choices[]`)

Quand un choix contient un attribut `test`, il peut spécifier jusqu'à 4 nœuds cibles selon le résultat du test :

```json
{
  "id": "START",
  "speaker": "PNJ",
  "line": "Bonjour",
  "choices": [
    {
      "text": "Tenter de convaincre",
      "test": "Raison+Diplomatie:8",
      "testCriticalFailureNode": "NODE_CRITICAL_FAILURE",
      "testFailureNode": "NODE_FAILURE",
      "testSuccessNode": "NODE_SUCCESS",
      "testCriticalSuccessNode": "NODE_CRITICAL_SUCCESS"
    }
  ]
}
```

**Champs disponibles :**
- `test` (requis) : Format `Attribut+Compétence:DD` (ex: `"Raison+Diplomatie:8"`)
- `testCriticalFailureNode` (optionnel) : ID du nœud cible en cas d'échec critique
- `testFailureNode` (optionnel) : ID du nœud cible en cas d'échec
- `testSuccessNode` (optionnel) : ID du nœud cible en cas de réussite
- `testCriticalSuccessNode` (optionnel) : ID du nœud cible en cas de réussite critique

### Pour les Nœuds (au niveau racine)

Les nœuds peuvent également avoir des tests directs (sans passer par un choix) :

```json
{
  "id": "NODE_WITH_TEST",
  "speaker": "PNJ",
  "line": "Test direct",
  "test": "Raison+Diplomatie:8",
  "criticalFailureNode": "NODE_CRITICAL_FAILURE",
  "failureNode": "NODE_FAILURE",
  "successNode": "NODE_SUCCESS",
  "criticalSuccessNode": "NODE_CRITICAL_SUCCESS"
}
```

**Champs disponibles :**
- `test` (requis) : Format `Attribut+Compétence:DD`
- `criticalFailureNode` (optionnel) : ID du nœud cible en cas d'échec critique
- `failureNode` (optionnel) : ID du nœud cible en cas d'échec
- `successNode` (optionnel) : ID du nœud cible en cas de réussite
- `criticalSuccessNode` (optionnel) : ID du nœud cible en cas de réussite critique

**Note :** Cette story se concentre sur les **choix avec test** (champs avec préfixe `test*`).

## Logique de Fallback

Unity implémente une logique de fallback pour assurer la rétrocompatibilité avec les anciens dialogues qui n'utilisent que 2 résultats :

### Pour les Choix

- Si `testCriticalSuccessNode` n'est pas défini → Unity utilise `testSuccessNode`
- Si `testCriticalFailureNode` n'est pas défini → Unity utilise `testFailureNode`
- Si `testSuccessNode` n'est pas défini → Le test échoue (pas de fallback)
- Si `testFailureNode` n'est pas défini → Le test réussit (pas de fallback)

### Pour les Nœuds

- Si `criticalSuccessNode` n'est pas défini → Unity utilise `successNode`
- Si `criticalFailureNode` n'est pas défini → Unity utilise `failureNode`
- Si `successNode` n'est pas défini → Le test échoue (pas de fallback)
- Si `failureNode` n'est pas défini → Le test réussit (pas de fallback)

## Seuils de Test

Les 4 résultats sont déterminés selon le score obtenu par le joueur comparé à la Difficulté (DD) :

| Résultat | Condition | Description |
|----------|-----------|-------------|
| **Échec critique** | `score < DD - 5` | Échec total, conséquence grave |
| **Échec** | `DD - 5 <= score < DD` | Échec, conséquence modérée |
| **Réussite** | `DD <= score < DD + 5` | Réussite, conséquence favorable |
| **Réussite critique** | `score >= DD + 5` | Réussite exceptionnelle, conséquence exceptionnelle |

### Exemple

Pour un test `Raison+Diplomatie:8` (DD = 8) :
- **Échec critique** : score < 3 (ex: 1, 2)
- **Échec** : score entre 3 et 7 (ex: 3, 4, 5, 6, 7)
- **Réussite** : score entre 8 et 12 (ex: 8, 9, 10, 11, 12)
- **Réussite critique** : score >= 13 (ex: 13, 14, 15+)

## Rétrocompatibilité

Les anciens dialogues avec seulement 2 résultats (`testSuccessNode` et `testFailureNode`) continuent de fonctionner :

```json
{
  "choices": [
    {
      "text": "Tenter de convaincre",
      "test": "Raison+Diplomatie:8",
      "testFailureNode": "NODE_FAILURE",
      "testSuccessNode": "NODE_SUCCESS"
    }
  ]
}
```

Dans ce cas :
- Les échecs critiques utilisent `testFailureNode` (fallback)
- Les échecs utilisent `testFailureNode`
- Les réussites utilisent `testSuccessNode`
- Les réussites critiques utilisent `testSuccessNode` (fallback)

## Validation

Le service `UnityJsonRenderer` valide que toutes les références pointent vers des nœuds existants :

- Les champs `test*Node` dans les choix sont validés
- Les références doivent pointer vers des IDs de nœuds existants ou vers `"END"` (nœud spécial Unity)
- Les références invalides génèrent des erreurs de validation

## Export/Import

### Export (ReactFlow → Unity JSON)

- Les `TestNode` (visualisations graphiques) ne sont **pas** exportés dans le JSON Unity
- Seuls les champs `test*Node` dans les choix sont exportés
- Les connexions depuis les `TestNode` vers les nœuds de résultat sont converties en champs `test*Node` dans le choix parent

### Import (Unity JSON → ReactFlow)

- Les choix avec attribut `test` génèrent automatiquement un `TestNode` (visualisation graphique)
- Les 4 champs `test*Node` dans les choix créent 4 edges depuis le `TestNode` vers les nœuds de résultat
- Le `TestNode` apparaît automatiquement dans l'éditeur de graphe

## Exemple Complet

```json
[
  {
    "id": "START",
    "speaker": "PNJ",
    "line": "Bonjour, que voulez-vous ?",
    "choices": [
      {
        "text": "Tenter de convaincre avec diplomatie",
        "test": "Raison+Diplomatie:8",
        "testCriticalFailureNode": "NODE_CRITICAL_FAILURE",
        "testFailureNode": "NODE_FAILURE",
        "testSuccessNode": "NODE_SUCCESS",
        "testCriticalSuccessNode": "NODE_CRITICAL_SUCCESS"
      }
    ]
  },
  {
    "id": "NODE_CRITICAL_FAILURE",
    "speaker": "PNJ",
    "line": "Votre tentative est un échec total. Le PNJ est offensé."
  },
  {
    "id": "NODE_FAILURE",
    "speaker": "PNJ",
    "line": "Votre tentative échoue. Le PNJ reste méfiant."
  },
  {
    "id": "NODE_SUCCESS",
    "speaker": "PNJ",
    "line": "Votre tentative réussit. Le PNJ est convaincu."
  },
  {
    "id": "NODE_CRITICAL_SUCCESS",
    "speaker": "PNJ",
    "line": "Votre tentative est exceptionnelle. Le PNJ est totalement convaincu et vous offre son aide."
  }
]
```

## Références

- **Schéma Unity officiel** : `docs/resources/dialogue-format.schema.json` (version 1.0.0)
- **Service de validation** : `services/json_renderer/unity_json_renderer.py`
- **Service de conversion** : `services/graph_conversion_service.py`
- **Modèles Pydantic** : `models/dialogue_structure/unity_dialogue_node.py`

---

**Dernière mise à jour** : 2026-01-25 (correction chemin schéma JSON Unity)
