# Story 0.10: Tests avec 4 résultats (échec critique, échec, réussite, réussite critique)

Status: done

**Architecture (ADR-007):** Toute modification du canvas éditeur (GraphCanvas) ou du flux nodes/edges doit respecter le mode controlled React Flow. GraphView (vue read-only) est hors périmètre ADR-007. Voir `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md`.

**Note** : Synchronisation bidirectionnelle TestNode ↔ choix parent implémentée (voir section "Synchronisation TestNode ↔ Choix Parent" dans Dev Notes).

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **auteur de dialogues**,
I want **quand une réponse d'un PJ inclut un "test", avoir 4 réponses possibles du PNJ (échec critique, échec, réussite, réussite critique) au lieu d'une seule**,
So that **je peux créer des dialogues plus nuancés avec des résultats de test variés selon le niveau de réussite/échec**.

## Acceptance Criteria

1. **Given** je crée un choix de joueur avec un attribut `test` (ex: "Raison+Diplomatie:8")
   **When** je génère le nœud suivant avec l'IA
   **Then** l'IA génère 4 réponses possibles du PNJ : échec critique, échec, réussite, réussite critique
   **And** chaque réponse est connectée à un nœud distinct dans le graphe

2. **Given** un choix avec `test` dans le graphe
   **When** je visualise le graphe dans l'éditeur
   **Then** un TestNode (barre avec 4 ronds) apparaît automatiquement après le choix avec test
   **And** le TestNode affiche 4 handles de sortie distincts : échec critique (rouge foncé), échec (rouge), réussite (vert), réussite critique (vert foncé)
   **And** chaque handle est étiqueté clairement (visible au survol)

3. **Given** je génère un nœud suivant depuis un choix avec test
   **When** la génération est complète
   **Then** 4 nœuds sont créés automatiquement (un pour chaque résultat)
   **And** les connexions sont établies correctement entre le choix et les 4 nœuds de résultat

4. **Given** j'exporte un dialogue vers Unity JSON
   **When** un choix contient un test avec 4 résultats
   **Then** le JSON Unity contient les 4 champs de nœuds cibles : `testCriticalFailureNode`, `testFailureNode`, `testSuccessNode`, `testCriticalSuccessNode` (pour les choix) ou `criticalFailureNode`, `failureNode`, `successNode`, `criticalSuccessNode` (pour les nœuds)
   **And** le schéma JSON est valide selon les spécifications Unity (`docs/resources/JsonDocUnity/Documentation/dialogue-format.schema.json`)
   **And** la logique de fallback est respectée : `testCriticalSuccessNode` → `testSuccessNode`, `testCriticalFailureNode` → `testFailureNode`

5. **Given** je charge un dialogue Unity JSON existant
   **When** un choix contient les 4 résultats de test
   **Then** le graphe affiche correctement les 4 connexions
   **And** chaque nœud de résultat est visible et accessible

## Tasks / Subtasks

- [x] Task 1: Étendre schémas TypeScript pour 4 résultats de test (AC: #1, #2, #4, #5)
  - [x] Modifier `frontend/src/types/api.ts` : Ajouter `testCriticalFailureNode?`, `testCriticalSuccessNode?` à `UnityDialogueChoice`
  - [x] Modifier `frontend/src/schemas/nodeEditorSchema.ts` : Étendre `testNodeDataSchema` avec 4 champs optionnels
  - [x] Vérifier que `[key: string]: unknown` permet extension sans casser types existants
  - [x] Tests unitaires : Validation schéma avec 2 résultats (rétrocompatibilité) et 4 résultats

- [x] Task 2: Étendre modèles Pydantic Python pour 4 résultats (AC: #1, #4)
  - [x] Modifier `models/dialogue_structure/unity_dialogue_node.py` : Ajouter `testCriticalFailureNode?`, `testCriticalSuccessNode?` à `UnityDialogueChoiceContent`
  - [x] Vérifier rétrocompatibilité : Champs optionnels, anciens JSON avec 2 résultats fonctionnent toujours
  - [x] Tests unitaires : Sérialisation/désérialisation avec 2 et 4 résultats

- [x] Task 3: Mettre à jour TestNode React pour afficher 4 handles (AC: #2)
  - [x] Modifier `frontend/src/components/graph/nodes/TestNode.tsx` (point de départ : composant existant)
  - [x] Transformer le TestNode en "barre compacte" avec 4 handles de sortie : `critical-failure` (rouge foncé #C0392B), `failure` (rouge #E74C3C), `success` (vert #27AE60), `critical-success` (vert foncé #229954)
  - [x] Positionner handles : critical-failure (gauche 12.5%), failure (gauche 37.5%), success (droite 37.5%), critical-success (droite 12.5%)
  - [x] Labels au survol uniquement : Afficher "Échec critique", "Échec", "Réussite", "Réussite critique" au survol du handle (pas de texte visible sur la barre)
  - [x] Apparition automatique : Le TestNode doit apparaître automatiquement quand un choix dans un DialogueNode contient un attribut `test`
  - [x] Tests visuels : Vérifier affichage 4 handles avec couleurs distinctes et labels au survol

- [x] Task 4: Mettre à jour génération IA pour créer 4 réponses (AC: #1, #3)
  - [x] Modifier `services/unity_dialogue_generation_service.py` : Détecter choix avec `test`
  - [x] Quand choix a `test`, modifier prompt pour demander 4 réponses au lieu d'une
  - [x] Structure réponse IA : Génération de 4 réponses séparées avec prompts adaptés pour chaque résultat
  - [x] Créer 4 nœuds automatiquement après génération (un par résultat)
  - [x] Établir connexions : `testCriticalFailureNode`, `testFailureNode`, `testSuccessNode`, `testCriticalSuccessNode` (ordre : critical-failure, failure, success, critical-success)
  - [x] Tests unitaires : Génération avec test crée 4 nœuds et connexions

- [x] Task 5: Mettre à jour GraphView pour charger 4 résultats (AC: #5)
  - [x] Modifier `frontend/src/components/generation/GraphView.tsx` : Fonction `unityJsonToGraph()`
  - [x] Détecter `testCriticalFailureNode`, `testCriticalSuccessNode` en plus de `testFailureNode`, `testSuccessNode`
  - [x] Créer automatiquement un TestNode (barre avec 4 handles) quand un choix contient un test avec 4 résultats
  - [x] Créer edges pour les 4 résultats avec labels et couleurs appropriés : `DialogueNode` (choix avec test) → `TestNode` → `4 DialogueNodes` (réponses)
  - [x] Tests unitaires : Chargement JSON avec 4 résultats affiche TestNode et 4 connexions

- [x] Task 6: Mettre à jour ChoiceEditor pour éditer 4 résultats (AC: #2)
  - [x] Modifier `frontend/src/components/graph/ChoiceEditor.tsx`
  - [x] Ajouter champs input pour `testCriticalFailureNode`, `testCriticalSuccessNode` (si test présent)
  - [x] Afficher champs input pour les 4 résultats (testCriticalFailureNode, testFailureNode, testSuccessNode, testCriticalSuccessNode)
  - [x] Interface conditionnelle : Afficher 4 champs seulement si `test` est défini
  - [x] Tests unitaires : Édition choix avec test affiche 4 champs et permet modification

- [x] Task 7: Mettre à jour NodeEditorPanel pour gérer 4 résultats (AC: #2)
  - [x] Modifier `frontend/src/components/graph/NodeEditorPanel.tsx`
  - [x] Si nœud est TestNode avec test, afficher 4 champs de connexion
  - [x] Permettre sélection manuelle des 4 nœuds cibles
  - [x] Mise à jour defaultValues et reset pour inclure les 4 champs
  - [x] Tests unitaires : Édition nœud de test affiche 4 champs et permet modification

- [x] Task 8: Mettre à jour GraphConversionService pour exporter 4 résultats (AC: #4)
  - [x] Modifier `services/graph_conversion_service.py` : Méthode `graph_to_unity_json()`
  - [x] Détecter connexions depuis TestNode vers handles `critical-failure`, `critical-success` en plus de `failure`, `success`
  - [x] Exporter `testCriticalFailureNode`, `testCriticalSuccessNode` dans JSON Unity (dans le choix du DialogueNode, pas dans un nœud séparé)
  - [x] **Important** : Le TestNode n'est pas exporté dans le JSON Unity, seuls les champs `test*Node` dans les choix sont exportés
  - [x] Nettoyage des champs test*Node avant reconstruction depuis les edges
  - [x] Mapping TestNode → DialogueNode/choiceIndex pour reconstruire les 4 champs
  - [x] Tests unitaires : Export graphe avec 4 résultats génère JSON valide (sans TestNode dans JSON)

- [x] Task 9: Mettre à jour UnityJsonRenderer pour valider 4 résultats (AC: #4)
  - [x] Modifier `services/json_renderer/unity_json_renderer.py` : Méthode `validate_nodes()`
  - [x] Valider les 4 champs test*Node dans les choix (testCriticalFailureNode, testFailureNode, testSuccessNode, testCriticalSuccessNode)
  - [x] Valider que références pointent vers nœuds existants
  - [x] Extraction constante TEST_RESULT_FIELDS pour éviter duplication
  - [x] Méthode helper `_validate_choice_references()` pour améliorer la lisibilité
  - [x] Tests unitaires : Validation JSON avec 4 résultats détecte références invalides (4 tests, tous passent)

- [x] Task 10: Documentation et validation schéma Unity (AC: #4)
  - [x] **VALIDÉ** : Schéma Unity supporte les 4 champs (confirmé dans `docs/resources/JsonDocUnity/Documentation/dialogue-format.schema.json`)
  - [x] Documenter format exact attendu par Unity :
    - **Pour les choix** : `testCriticalSuccessNode`, `testSuccessNode`, `testFailureNode`, `testCriticalFailureNode`
    - **Pour les nœuds** : `criticalSuccessNode`, `successNode`, `failureNode`, `criticalFailureNode`
  - [x] Documenter logique de fallback : `criticalSuccessNode` → `successNode` si non défini, `criticalFailureNode` → `failureNode` si non défini
  - [x] Documenter seuils de test : Critical success (score >= DD + 5), Success (score >= DD et < DD + 5), Failure (score >= DD - 5 et < DD), Critical failure (score < DD - 5)
  - [x] Créé documentation technique complète : `docs/specifications/Unity_Dialogue_Format_4_Test_Results.md`
  - [x] Tests intégration : Export/import cycle avec 4 résultats fonctionne (test créé et passe)
  - [x] Correction : Ignorer edges "choice" vers TestNode dans `_rebuild_connections` (choix avec test n'ont pas de targetNode direct)

- [x] Task 11: Tests E2E complets (AC: #1, #2, #3, #4, #5)
  - [x] Test E2E : Créer choix avec test, générer 4 nœuds, vérifier connexions
  - [x] Test E2E : Exporter dialogue avec 4 résultats, importer, vérifier graphe
  - [x] Test E2E : Éditer manuellement les 4 connexions dans l'éditeur
  - [x] Test E2E : Rétrocompatibilité : Charger ancien dialogue avec 2 résultats fonctionne
  - [x] Créé fichier de tests E2E : `e2e/graph-4-test-results.spec.ts` avec 4 scénarios complets

## Dev Notes

### Synchronisation TestNode ↔ Choix Parent (Architecture SOLID)

**Implémenté** : Synchronisation bidirectionnelle complète pour garantir la cohérence entre TestNodes (vue dérivée) et choix parents (Source of Truth).

**Module utilitaire** : `frontend/src/utils/testNodeSync.ts`
- `parseTestNodeId()` : Parse ID TestNode pour extraire dialogueNodeId et choiceIndex
- `getParentChoiceForTestNode()` : Trouve le choix parent d'un TestNode
- `syncTestNodeFromChoice()` : Synchronise TestNode depuis choix (choice → testNode)
- `syncChoiceFromTestNode()` : Synchronise choix depuis TestNode (testNode → choice)
- `syncTestNodeResultEdges()` : Crée/met à jour edges TestNode → nœuds de résultat

**graphStore.ts refactorisé** :
- `updateNode()` : Détecte TestNode, redirige vers choix parent, sync bidirectionnelle
- `deleteNode()` : Supprime test du choix parent si TestNode supprimé
- `connectNodes()` : Met à jour choix parent lors connexion depuis TestNode
- `disconnectNodes()` : Met à jour choix parent lors déconnexion depuis TestNode

**Garde-fous anti-récursion** : TestNode → choix → TestNode en une seule passe. Le TestNode est toujours resynchronisé depuis le choix (choix = Source of Truth).

**Tests** : 32 tests passent (24 unitaires + 8 intégration). Voir `frontend/src/__tests__/testNodeSync.test.ts` et `useGraphStore.testNodeSync.test.ts`.

**Documentation** : `docs/architecture/test-node-sync.md` (architecture complète), `.cursor/rules/testnode_sync.mdc` (mémo concis).

### Architecture Patterns

- **Rétrocompatibilité critique** : Les anciens dialogues avec 2 résultats (success/failure) doivent continuer à fonctionner
- **Extension progressive** : Utiliser champs optionnels dans schémas TypeScript/Pydantic
- **Validation Unity** : ✅ **VALIDÉ** - Le schéma Unity supporte les 4 champs (voir `docs/resources/JsonDocUnity/Documentation/dialogue-format.schema.json`)
- **Distinction choix vs nœuds** : 
  - **Pour les choix** (dans `choices[]`) : `testCriticalSuccessNode`, `testSuccessNode`, `testFailureNode`, `testCriticalFailureNode`
  - **Pour les nœuds** (au niveau racine) : `criticalSuccessNode`, `successNode`, `failureNode`, `criticalFailureNode`
  - **Important** : Cette story se concentre sur les **choix avec test**, donc utiliser les champs avec préfixe `test*`
- **TestNode comme visualisation graphique** : 
  - **Point de départ** : Le composant `TestNode.tsx` existant est le point de départ de cette story
  - **Visualisation** : Le TestNode devient la "barre avec 4 ronds" (handles) qui visualise les choix avec test
  - **Apparition automatique** : Le TestNode doit être visible automatiquement dès qu'un choix PJ (rond orange sur DialogueNode) contient un attribut `test`
  - **Représentation graphique uniquement** : Le TestNode n'est **pas** un élément supplémentaire dans le JSON Unity, mais la représentation graphique des choix avec test dans l'éditeur de graphe
  - **Flux** : `DialogueNode` (avec choix contenant `test`) → `choice handle` (rond orange) → `TestNode` (barre avec 4 handles) → `4 DialogueNodes` (réponses selon résultat)

### Fichiers à Modifier

**Frontend:**
- `frontend/src/types/api.ts` - Types TypeScript Unity
- `frontend/src/schemas/nodeEditorSchema.ts` - Schémas validation
- `frontend/src/components/graph/nodes/TestNode.tsx` - Composant nœud de test
- `frontend/src/components/graph/ChoiceEditor.tsx` - Éditeur de choix
- `frontend/src/components/graph/NodeEditorPanel.tsx` - Panel édition nœud
- `frontend/src/components/generation/GraphView.tsx` - Conversion JSON → graphe

**Backend:**
- `models/dialogue_structure/unity_dialogue_node.py` - Modèles Pydantic
- `services/unity_dialogue_generation_service.py` - Génération IA
- `services/graph_conversion_service.py` - Conversion graphe → JSON
- `services/json_renderer/unity_json_renderer.py` - Validation JSON

### Décisions Techniques

1. **Schéma Unity** : **VALIDÉ** - Le schéma Unity (`docs/resources/JsonDocUnity/Documentation/dialogue-format.schema.json`) supporte les 4 champs :
   - **Pour les choix** (dans `choices[]`) : `testCriticalSuccessNode`, `testSuccessNode`, `testFailureNode`, `testCriticalFailureNode`
   - **Pour les nœuds** (au niveau racine) : `criticalSuccessNode`, `successNode`, `failureNode`, `criticalFailureNode`
   - **Focus de cette story** : Les choix avec test, donc utiliser les champs avec préfixe `test*`
   - **Logique de fallback** : Si `testCriticalSuccessNode` non défini → utilise `testSuccessNode`, si `testCriticalFailureNode` non défini → utilise `testFailureNode`
   - **Seuils de test** : 
     - Critical success : score >= DD + 5
     - Success : score >= DD et < DD + 5
     - Failure : score >= DD - 5 et < DD
     - Critical failure : score < DD - 5

2. **TestNode comme visualisation graphique** :
   - **Point de départ** : Le composant `TestNode.tsx` existant est le point de départ
   - **Visualisation** : Le TestNode devient une "barre compacte" avec 4 handles (ronds colorés)
   - **Apparition automatique** : Le TestNode apparaît automatiquement quand un choix PJ (rond orange sur DialogueNode) contient un attribut `test`
   - **Flux graphique** : `DialogueNode` (avec choix contenant `test`) → `choice handle` (rond orange) → `TestNode` (barre avec 4 handles) → `4 DialogueNodes` (réponses selon résultat)
   - **Pas dans JSON Unity** : Le TestNode n'est **pas** un élément supplémentaire dans le JSON Unity, mais uniquement la représentation graphique des choix avec test dans l'éditeur

3. **Couleurs handles** : 
   - Échec critique : `#C0392B` (rouge foncé)
   - Échec : `#E74C3C` (rouge)
   - Réussite : `#27AE60` (vert)
   - Réussite critique : `#229954` (vert foncé)

4. **Position handles** : Répartir équitablement sur 4 positions (12.5%, 37.5%, 62.5%, 87.5% de la largeur)

5. **Génération IA** : Modifier prompt pour demander explicitement 4 réponses avec contexte de chaque résultat :
   - **Échec critique** (score < DD - 5) : Réponse très négative, conséquence grave
   - **Échec** (score >= DD - 5 et < DD) : Réponse négative, conséquence modérée
   - **Réussite** (score >= DD et < DD + 5) : Réponse positive, conséquence favorable
   - **Réussite critique** (score >= DD + 5) : Réponse très positive, conséquence exceptionnelle

### Références

- **Schéma Unity officiel** : `docs/resources/JsonDocUnity/Documentation/dialogue-format.schema.json` (version 1.0.0)
- Schéma TypeScript actuel : `frontend/src/types/api.ts` lignes 270-308
- Composant TestNode : `frontend/src/components/graph/nodes/TestNode.tsx`
- Modèles Pydantic : `models/dialogue_structure/unity_dialogue_node.py`
- Service génération : `services/unity_dialogue_generation_service.py`

### Questions Résolues

1. **Schéma Unity** : ✅ **RÉSOLU** - Le schéma JSON Unity supporte les 4 champs (confirmé dans `docs/resources/JsonDocUnity/Documentation/dialogue-format.schema.json`)

2. **Rétrocompatibilité** : ✅ **RÉSOLU** - Solution : Champs optionnels, anciens JSON avec 2 résultats fonctionnent toujours grâce au fallback Unity

3. **Génération IA** : ✅ **RÉSOLU** - Solution : Demander explicitement 4 réponses avec contexte de chaque niveau (échec critique = très mauvais, échec = mauvais, réussite = bon, réussite critique = excellent)

## Dev Agent Record

### Agent Model Used

Claude Sonnet 4.5 (via Cursor)

### Debug Log References

N/A

### Completion Notes List

**Task 1 (Complète)** : 
- ✅ Étendu `UnityDialogueChoice` dans `frontend/src/types/api.ts` avec `testCriticalFailureNode?` et `testCriticalSuccessNode?`
- ✅ Étendu `choiceSchema` et `testNodeDataSchema` dans `frontend/src/schemas/nodeEditorSchema.ts` avec les 4 champs optionnels
- ✅ Créé tests unitaires complets dans `frontend/src/__tests__/nodeEditorSchema.test.ts` (5 tests, tous passent)
- ✅ Rétrocompatibilité vérifiée : `[key: string]: unknown` permet extension sans casser types existants

**Task 2 (Complète)** :
- ✅ Étendu `UnityDialogueChoiceContent` dans `models/dialogue_structure/unity_dialogue_node.py` avec les 4 champs optionnels
- ✅ Créé tests unitaires complets dans `tests/models/test_unity_dialogue_node_4_results.py` (3 tests, tous passent)
- ✅ Rétrocompatibilité vérifiée : Sérialisation/désérialisation avec 2 et 4 résultats fonctionne

**Task 3 (Complète)** :
- ✅ Transformé TestNode en "barre compacte" (200x40px) avec 4 handles de sortie
- ✅ Ajouté 4 handles avec couleurs : critical-failure (#C0392B), failure (#E74C3C), success (#27AE60), critical-success (#229954)
- ✅ Positionné handles aux positions correctes (12.5%, 37.5%, 62.5%, 87.5%)
- ✅ Ajouté labels au survol via attribut `title` sur chaque handle
- ✅ Étendu interface `TestNodeData` avec les 4 champs optionnels
- ✅ Apparition automatique implémentée : TestNode créé automatiquement dans `GraphView.tsx` quand un choix contient un attribut `test` (lignes 103-188)
- ✅ Créé tests unitaires complets dans `frontend/src/__tests__/TestNode.test.tsx` (4 tests, tous passent)

**Task 4 (Complète)** :
- ✅ Créé méthode `generate_nodes_for_choice_with_test()` pour générer 4 nœuds pour un choix avec test
- ✅ Modifié prompts pour demander 4 réponses avec contexte adapté pour chaque résultat (échec critique, échec, réussite, réussite critique)
- ✅ Extraction automatique du DD depuis le format de test (Attribut+Compétence:DD)
- ✅ Génération de 4 nœuds avec IDs au format `{parent_id}_CHOICE_{index}_{RESULT_SUFFIX}`
- ✅ Modifié `enrich_with_ids()` pour accepter `test_result_node_ids` et établir les 4 connexions dans les choix
- ✅ Créé tests unitaires complets dans `tests/services/test_unity_dialogue_generation_service_4_results.py` (2 tests, tous passent)

**Task 5 (Complète)** :
- ✅ Modifié `unityJsonToGraph()` pour détecter les choix avec attribut `test`
- ✅ Création automatique d'un TestNode (barre avec 4 handles) quand un choix contient un test
- ✅ TestNode créé même si les 4 nœuds de résultat ne sont pas encore générés (conforme à la clarification : un test a TOUJOURS 4 handles)
- ✅ Création d'edges depuis DialogueNode vers TestNode (via handle du choix)
- ✅ Création d'edges depuis TestNode vers les 4 nœuds de résultat avec labels et couleurs appropriés (#C0392B, #E74C3C, #27AE60, #229954)
- ✅ Export de `unityJsonToGraph()` pour les tests
- ✅ Créé tests unitaires complets dans `frontend/src/__tests__/GraphView.4results.test.tsx` (4 tests, tous passent)

**Task 6 (Complète)** :
- ✅ Ajouté section "Résultats de test" dans ChoiceEditor avec 4 champs input
- ✅ Affichage conditionnel : Section visible seulement si `test` est défini dans le choix
- ✅ Champs pour les 4 résultats : testCriticalFailureNode, testFailureNode, testSuccessNode, testCriticalSuccessNode
- ✅ Labels et IDs correctement associés pour l'accessibilité
- ✅ Section stylisée avec fond secondaire pour distinction visuelle
- ✅ Créé tests unitaires complets dans `frontend/src/__tests__/ChoiceEditor.4results.test.tsx` (3 tests, tous passent)

**Task 7 (Complète)** :
- ✅ Ajouté section "Connexions de test" dans NodeEditorPanel pour TestNode avec 4 champs input
- ✅ Champs pour les 4 résultats : criticalFailureNode, failureNode, successNode, criticalSuccessNode
- ✅ Mise à jour defaultValues et reset pour inclure les 4 champs
- ✅ Labels et IDs correctement associés pour l'accessibilité
- ✅ Section stylisée avec fond secondaire pour distinction visuelle
- ✅ Les 4 champs sont toujours affichés (conforme à la clarification : un test a TOUJOURS 4 handles)
- ✅ Créé tests unitaires complets dans `frontend/src/__tests__/NodeEditorPanel.testNode.4results.test.tsx` (3 tests, tous passent)

**Task 8 (Complète)** :
- ✅ Modifié `graph_to_unity_json()` pour exclure les TestNodes du JSON Unity (ils ne sont que des visualisations graphiques)
- ✅ Nettoyage des champs test*Node dans les choix avant reconstruction
- ✅ Mapping TestNode → DialogueNode/choiceIndex pour identifier le choix parent
- ✅ Détection des edges depuis TestNode avec sourceHandle (critical-failure, failure, success, critical-success)
- ✅ Reconstruction des 4 champs test*Node dans les choix du DialogueNode parent
- ✅ Support rétrocompatible pour 2 résultats (testFailureNode, testSuccessNode)
- ✅ Créé tests unitaires complets dans `tests/services/test_graph_conversion_service_4_results.py` (2 tests, tous passent)

**Task 9 (Complète)** :
- ✅ Modifié `validate_nodes()` pour valider les 4 champs test*Node dans les choix
- ✅ Validation des références testCriticalFailureNode, testFailureNode, testSuccessNode, testCriticalSuccessNode
- ✅ Extraction constante de classe `TEST_RESULT_FIELDS` pour éviter la duplication
- ✅ Méthode helper `_validate_choice_references()` pour améliorer la lisibilité et la maintenabilité
- ✅ Support rétrocompatible pour 2 résultats (testFailureNode, testSuccessNode)
- ✅ Créé tests unitaires complets dans `tests/services/test_unity_json_renderer_4_results.py` (4 tests, tous passent)

**Task 10 (Complète)** :
- ✅ Créé documentation complète : `docs/specifications/Unity_Dialogue_Format_4_Test_Results.md`
- ✅ Documenté format exact attendu par Unity (choix et nœuds)
- ✅ Documenté logique de fallback pour rétrocompatibilité
- ✅ Documenté seuils de test avec exemples
- ✅ Documenté export/import cycle
- ✅ Créé test d'intégration : Export/import cycle avec 4 résultats fonctionne (`tests/services/test_unity_export_import_4_results.py`)
- ✅ Correction : Ignorer edges "choice" vers TestNode dans `_rebuild_connections` (choix avec test n'ont pas de targetNode direct)

**Task 11 (Complète)** :
- ✅ Créé fichier de tests E2E : `e2e/graph-4-test-results.spec.ts`
- ✅ Test E2E AC#1 : Créer choix avec test, générer 4 nœuds, vérifier connexions
- ✅ Test E2E AC#2 : Exporter dialogue avec 4 résultats, importer, vérifier graphe
- ✅ Test E2E AC#3 : Éditer manuellement les 4 connexions dans l'éditeur
- ✅ Test E2E AC#4 : Rétrocompatibilité - Charger ancien dialogue avec 2 résultats fonctionne
- ✅ Tests structurés avec helpers d'authentification et sélecteurs robustes
- ⚠️ **Note** : Les tests E2E nécessitent l'application en cours d'exécution (`npm run test:e2e`)

**Code Review Fixes (2026-01-19)** :
- ✅ **CRITICAL FIX** : Marqué sous-tâche "Apparition automatique" de Task 3 comme [x] complète (implémentée dans `GraphView.tsx:103-188`)
- ✅ **HIGH FIX** : Mis à jour statut story de "ready-for-dev" à "review" pour cohérence avec sprint-status.yaml
- ✅ **HIGH FIX** : Ajouté fichiers manquants au File List : `tests/services/test_unity_export_import_4_results.py`, `docs/specifications/Unity_Dialogue_Format_4_Test_Results.md`, `e2e/graph-4-test-results.spec.ts`
- ✅ **MEDIUM FIX** : Documenté apparition automatique dans Completion Notes Task 3
- ✅ **BUG FIX** : Correction création automatique TestNode dans `graph_conversion_service.py` (conversion JSON → graphe)
- ✅ **BUG FIX** : Correction création dynamique TestNode dans `graphStore.ts` (modification choix dans l'éditeur)
- ✅ **UX FIX** : Troncature des labels d'edges à 30 caractères (cohérence avec autres edges)
- ✅ **UX FIX** : Formatage du test "Raison+Architecture:8" → "Architecture (DD8)" dans TestNode

**Améliorations Graphiques Post-Review (2026-01-19)** :
- ✅ **TestNode** : Hauteur ajustée à 44px (optimisée pour visibilité des handles)
- ✅ **TestNode** : Couleur de fond harmonisée (#16a085) pour mode sombre
- ✅ **TestNode** : Handles avec couleurs vives (rouge vif, orange vif, vert vif, bleu vif) pour meilleure distinction
- ✅ **TestNode** : Input handle rendu transparent (connexion invisible mais fonctionnelle)
- ✅ **TestNode** : Positionnement des handles ajusté (bottom: 2px) pour visibilité complète
- ✅ **Architecture** : Documentation ajoutée dans `GraphView.tsx` et `graphStore.ts` pour clarifier les responsabilités (projection vs conversion canonique)

### File List

**Modifiés :**
- `frontend/src/types/api.ts` - Ajout champs `testCriticalFailureNode?`, `testCriticalSuccessNode?` à `UnityDialogueChoice`
- `frontend/src/schemas/nodeEditorSchema.ts` - Ajout 4 champs optionnels à `choiceSchema` et `testNodeDataSchema`
- `models/dialogue_structure/unity_dialogue_node.py` - Ajout 4 champs optionnels à `UnityDialogueChoiceContent`
- `frontend/src/components/graph/nodes/TestNode.tsx` - Transformé en barre compacte avec 4 handles + améliorations graphiques (formatage test, couleurs vives, hauteur optimisée)
- `services/unity_dialogue_generation_service.py` - Ajout méthode `generate_nodes_for_choice_with_test()` et modification `enrich_with_ids()`
- `frontend/src/components/generation/GraphView.tsx` - Modifié `unityJsonToGraph()` pour créer automatiquement TestNode et edges pour les 4 résultats + troncature labels + documentation architecture
- `frontend/src/components/graph/ChoiceEditor.tsx` - Ajouté section conditionnelle pour éditer les 4 résultats de test
- `frontend/src/components/graph/NodeEditorPanel.tsx` - Ajouté section "Connexions de test" pour éditer les 4 résultats d'un TestNode
- `services/graph_conversion_service.py` - Modifié `unity_json_to_graph()` pour créer automatiquement TestNodes + `graph_to_unity_json()` pour exporter les 4 résultats + troncature labels
- `services/json_renderer/unity_json_renderer.py` - Modifié `validate_nodes()` pour valider les 4 résultats de test dans les choix (avec refactor : constante et méthode helper)
- `frontend/src/store/graphStore.ts` - Ajout création dynamique TestNodes dans `updateNode()` + troncature labels + documentation architecture + synchronisation bidirectionnelle TestNode ↔ choix parent (refactorisé `updateNode()`, `deleteNode()`, `connectNodes()`, `disconnectNodes()`)
- `docs/specifications/Unity_Dialogue_Format_4_Test_Results.md` - Documentation complète du format Unity avec 4 résultats
- `tests/services/test_unity_export_import_4_results.py` - Test d'intégration export/import cycle avec 4 résultats
- `e2e/graph-4-test-results.spec.ts` - Tests E2E complets pour les 4 résultats de test (4 scénarios)

**Créés :**
- `frontend/src/__tests__/nodeEditorSchema.test.ts` - Tests unitaires pour schémas TypeScript (5 tests)
- `tests/models/test_unity_dialogue_node_4_results.py` - Tests unitaires pour modèles Pydantic (3 tests)
- `tests/models/__init__.py` - Module init pour tests/models
- `frontend/src/__tests__/TestNode.test.tsx` - Tests unitaires pour TestNode React (4 tests)
- `tests/services/test_unity_dialogue_generation_service_4_results.py` - Tests unitaires pour génération 4 résultats (2 tests)
- `frontend/src/__tests__/GraphView.4results.test.tsx` - Tests unitaires pour GraphView avec 4 résultats (4 tests)
- `frontend/src/__tests__/ChoiceEditor.4results.test.tsx` - Tests unitaires pour ChoiceEditor avec 4 résultats (3 tests)
- `frontend/src/__tests__/NodeEditorPanel.testNode.4results.test.tsx` - Tests unitaires pour NodeEditorPanel avec TestNode et 4 résultats (3 tests)
- `tests/services/test_graph_conversion_service_4_results.py` - Tests unitaires pour GraphConversionService avec 4 résultats (2 tests)
- `tests/services/test_unity_json_renderer_4_results.py` - Tests unitaires pour UnityJsonRenderer avec 4 résultats (4 tests)
- `tests/services/test_unity_export_import_4_results.py` - Test d'intégration export/import cycle avec 4 résultats
- `docs/specifications/Unity_Dialogue_Format_4_Test_Results.md` - Documentation complète du format Unity avec 4 résultats
- `e2e/graph-4-test-results.spec.ts` - Tests E2E complets pour les 4 résultats de test (4 scénarios)
- `frontend/src/utils/testNodeSync.ts` - Module utilitaire synchronisation TestNode ↔ choix parent (SRP)
- `frontend/src/types/testNode.ts` - Types TypeScript pour synchronisation TestNode
- `frontend/src/__tests__/testNodeSync.test.ts` - Tests unitaires synchronisation (24 tests)
- `frontend/src/__tests__/useGraphStore.testNodeSync.test.ts` - Tests d'intégration synchronisation (8 tests)
- `docs/architecture/test-node-sync.md` - Documentation architecture synchronisation complète
- `.cursor/rules/testnode_sync.mdc` - Règle cursor mémo synchronisation TestNode
