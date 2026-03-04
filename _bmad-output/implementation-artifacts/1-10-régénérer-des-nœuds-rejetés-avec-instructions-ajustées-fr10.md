# Story 1.10: Régénérer des nœuds rejetés avec instructions ajustées (FR10)

Status: ready-for-dev

**Architecture (ADR-007):** Toute modification du canvas (GraphCanvas) ou du flux nodes/edges doit respecter le mode controlled React Flow. Voir `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md`. Note spécifique : le remplacement d'un nœud (rejet → régénération) doit conserver le même flux store/React Flow ; le nouveau nœud doit recevoir les dimensions via onNodesChange type `dimensions` (width/height reflétés dans le store). Ne pas contourner GraphCanvas.

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur générant des dialogues**,
I want **régénérer des nœuds rejetés avec des instructions ajustées**,
so that **je peux itérer sur la qualité des dialogues sans perdre le contexte de la génération précédente**.

### Valeur Ajoutée par rapport au workflow actuel

**Actuellement :** Lorsqu'un nœud est rejeté (Story 1.4), il est supprimé du graphe. L'utilisateur doit alors relancer une génération complète depuis le nœud parent avec de nouvelles instructions, sans historique des tentatives précédentes.

**Avec cette story :**
1. **Itération préservée** : L'historique des instructions précédentes est conservé, permettant de comprendre ce qui a déjà été tenté
2. **Workflow optimisé** : Régénération directe depuis le nœud rejeté sans repartir du parent
3. **Contexte conservé** : Les connexions (parent/enfant) sont préservées lors du remplacement
4. **Apprentissage** : L'historique permet d'identifier les patterns d'instructions qui fonctionnent mieux

## Acceptance Criteria

1. **Given** j'ai rejeté un nœud généré (voir Story 1.4)
   **When** je sélectionne le nœud rejeté et clique sur "Régénérer"
   **Then** un panneau/modal s'ouvre avec les instructions originales pré-remplies
   **And** je peux modifier les instructions avant régénération

2. **Given** je modifie les instructions (ex: "Tone plus sombre, moins de répétition")
   **When** je lance la régénération
   **Then** un nouveau nœud est généré avec les instructions ajustées
   **And** le nœud rejeté est remplacé par le nouveau nœud (même position dans graphe)
   **And** les connexions du nœud rejeté sont préservées (même parent/enfant)

3. **Given** je régénère un nœud plusieurs fois
   **When** je régénère 3 fois le même nœud
   **Then** l'historique des instructions est sauvegardé (3 versions)
   **And** je peux voir les instructions précédentes dans un dropdown "Historique"

4. **Given** je régénère un nœud batch (partie d'un batch de 5 nœuds)
   **When** je régénère un seul nœud du batch
   **Then** seul ce nœud est régénéré (pas tout le batch)
   **And** les autres nœuds du batch restent inchangés

5. **Given** je régénère un nœud avec un contexte GDD modifié
   **When** le contexte GDD a changé depuis la génération originale
   **Then** le nouveau contexte GDD est utilisé pour la régénération
   **And** un message informatif s'affiche "Contexte GDD mis à jour depuis la génération originale"

## Tasks / Subtasks

- [ ] Task 1: Ajouter stockage historique instructions dans metadata nœud (AC: #3)
  - [ ] Modifier `DialogueNodeData` interface pour ajouter `regenerationHistory: RegenerationEntry[]`
  - [ ] Interface `RegenerationEntry: { timestamp, instructions, generationId, cost }`
  - [ ] Modifier `generateFromNode()` pour sauvegarder instructions dans `lastGenerationInstructions`
  - [ ] Ajouter méthode `addToRegenerationHistory(nodeId, instructions)` dans `graphStore.ts`

- [ ] Task 2: Créer modal/panneau de régénération (AC: #1)
  - [ ] Créer composant `RegenerateNodeModal.tsx`
  - [ ] Champ texte "Instructions" pré-rempli avec `lastGenerationInstructions`
  - [ ] Dropdown "Historique" affichant les entrées `regenerationHistory`
  - [ ] Bouton "Utiliser" à côté de chaque entrée historique pour pré-remplir
  - [ ] Boutons "Régénérer" et "Annuler"

- [ ] Task 3: Implémenter logique régénération dans graphStore (AC: #2, #4)
  - [ ] Ajouter méthode `regenerateNode(nodeId: string, newInstructions: string)` dans `useGraphStore`
  - [ ] Sauvegarder instructions actuelles dans `regenerationHistory`
  - [ ] Appeler API de génération avec contexte parent préservé
  - [ ] Remplacer nœud existant tout en conservant : `stableID`, position (x,y), connexions (edges)
  - [ ] Marquer nouveau nœud comme `status: "pending"`
  - [ ] Gérer état loading pendant régénération

- [ ] Task 4: Implémenter endpoint API régénération (AC: #2)
  - [ ] Créer endpoint `POST /api/v1/unity-dialogues/graph/nodes/{nodeId}/regenerate` dans `api/routers/graph.py` — cohérent avec `/nodes/{nodeId}/accept` et `/nodes/{nodeId}/reject` existants
  - [ ] Body: `{ dialogue_id: string, new_instructions: string, preserve_connections: boolean }` (pattern identique à `AcceptNodeRequest`/`RejectNodeRequest`)
  - [ ] Récupérer contexte parent depuis le nœud existant (speaker, line, choix)
  - [ ] Appeler `UnityDialogueGenerationService.generate_dialogue_node()` avec nouveau contexte
  - [ ] Préserver `stableID` du nœud existant (remplacement inplace)
  - [ ] Retourner nouveau nœud généré

- [ ] Task 5: Intégrer UI dans DialogueNode (AC: #1)
  - [ ] Ajouter bouton "Régénérer" en **overlay hover inline** dans `DialogueNode.tsx` pour nœuds pending — ⚠️ **AUCUN menu contextuel n'existe** : `DialogueNode.tsx` utilise exclusivement des overlays hover inline (comme les boutons existants ✓ et ✗). Suivre exactement le même pattern.
  - [ ] Afficher le bouton uniquement si `status === "pending"` (nœud généré mais pas encore accepté)
  - [ ] Ouvrir `RegenerateNodeModal` au clic

- [ ] Task 6: Préservation connexions lors remplacement (AC: #2)
  - [ ] Dans `regenerateNode()`, identifier toutes les edges connectées au nœud
  - [ ] Sauvegarder `source`, `target`, `label` de chaque edge
  - [ ] Après remplacement du nœud, recréer les edges avec les mêmes propriétés
  - [ ] Vérifier que `via_choice_index` est préservé pour les connexions parent

- [ ] Task 7: Gestion contexte GDD modifié (AC: #5)
  - [ ] Stocker `contextGddHash` ou `contextGddTimestamp` dans metadata nœud lors génération
  - [ ] Comparer contexte actuel vs contexte original lors régénération
  - [ ] Afficher warning informatif si différence détectée

- [ ] Task 8: Tests (AC: tous)
  - [ ] Unit: logique `regenerateNode()` dans `graphStore.ts`
  - [ ] Unit: préservation connexions lors remplacement
  - [ ] Unit: historique instructions (ajout/récupération)
  - [ ] Integration: API regenerate endpoint
  - [ ] E2E: workflow complet rejection → régénération → acceptation

## Dev Notes

### Contexte Epic et Story

**Epic 1: Amélioration et peaufinage de la génération de dialogues**
- **Objectif:** Améliorer l'expérience utilisateur et la robustesse de la génération de dialogues existante
- **Valeur:** Réduire la friction dans le workflow de génération, améliorer la qualité des dialogues générés
- **Statut:** 8 stories DONE (1.1, 1.2, 1.3, 1.5, 1.8, 1.9, 1.13), 3 PRIORITÉ A (1.4, 1.6, 1.10)

**Story 1.10: Régénérer des nœuds rejetés avec instructions ajustées (FR10)**
- **Priorité:** 🔴 **PRIORITÉ A - CRITIQUE**
- **Valeur:**
  - **Itération préservée** : Historique des instructions pour apprentissage
  - **Workflow optimisé** : Régénération directe sans repartir du parent
  - **Contexte conservé** : Connexions préservées lors remplacement
- **Dépendances:** Story 1.4 (accept/reject) - **DONE**, Story 1.1 (génération single) - **DONE**
- **Bloque:** Aucune (story terminale de l'epic 1 pour ce workflow)

### Vérification Codebase Existant

**✅ Fichiers/Composants à Étendre (pas de création nouvelle):**

1. **`frontend/src/store/graphStore.ts`** (EXISTE)
   - **Décision:** Étendre avec méthode `regenerateNode()`
   - **Justification:** Le store gère déjà `acceptNode()` et `rejectNode()`, logique similaire
   - **Modifications:**
     - Ajouter interface `RegenerationEntry`
     - Ajouter champ `regenerationHistory` et `lastGenerationInstructions` dans `DialogueNodeData`
     - Ajouter méthode `regenerateNode(nodeId, newInstructions)`
     - Réutiliser logique `generateFromNode()` avec préservation contexte

2. **`frontend/src/components/graph/nodes/DialogueNode.tsx`** (EXISTE)
   - **Décision:** Étendre avec bouton "Régénérer" en **overlay hover inline** (⚠️ PAS de menu contextuel — le composant n'en a pas)
   - **Justification:** UI accept/reject déjà présente via overlays hover (`isHovered` state + boutons absolus) — le bouton "Régénérer" suit le même pattern que ✓ et ✗
   - **Pattern existant:** boutons positionnés en `position: absolute` sur le nœud, visibles si `isHovered && isPending`
   - **Modifications:**
     - Ajouter bouton "Régénérer" visible si `isHovered && status === "pending"` (en plus de ✓ et ✗)
     - Connecter à l'ouverture de `RegenerateNodeModal`

3. **`frontend/src/components/graph/AIGenerationPanel.tsx`** (EXISTE - référence)
   - **Décision:** Réutiliser patterns pour `RegenerateNodeModal.tsx`
   - **Justification:** Même logique de génération avec instructions
   - **Patterns à copier:**
     - Gestion état loading
     - Appel API génération
     - Affichage progression

4. **`api/routers/graph.py`** (EXISTE)
   - **Décision:** Ajouter endpoint `/regenerate` dans le router existant
   - **Justification:** Router existant pour opérations graphe, prefix `/api/v1/unity-dialogues/graph`
   - **Modifications:**
     - Ajouter `POST /api/v1/unity-dialogues/graph/nodes/{node_id}/regenerate` (⚠️ PAS `/api/v1/dialogues/{id}/nodes/...` — namespace cohérent avec `/nodes/{node_id}/accept` et `/nodes/{node_id}/reject`)
     - Nouveau schema `RegenerateNodeRequest` dans `api/schemas/graph.py` : `dialogue_id: str`, `new_instructions: str`, `preserve_connections: bool = True`
     - Utiliser `LLMClientFactory.create_client()` + `UnityDialogueGenerationService.generate_dialogue_node()` (identique au endpoint `/generate-node`)
     - Utiliser `_validate_dialogue_exists()` (helper existant dans `graph.py`)

5. **`services/graph_conversion_service.py`** (EXISTE)
   - **Décision:** Étendre pour gérer champ `regenerationHistory` et `lastGenerationInstructions`
   - **Justification:** Service existant qui convertit Unity JSON ↔ ReactFlow
   - **Modifications:**
     - Préserver champs métadonnées lors conversion
     - Champs internes éditeur (non exportés vers Unity)

6. **`services/unity_dialogue_generation_service.py`** (EXISTE)
   - **Décision:** Réutiliser méthode `generate_dialogue_node()`
   - **Justification:** Même logique de génération, juste contexte différent
   - **Note:** L'endpoint `/regenerate` récupère le contexte parent depuis le nœud existant

**❌ Fichiers/Composants à Créer (nouveaux):**

1. **`frontend/src/components/graph/RegenerateNodeModal.tsx`** (NOUVEAU)
   - **Justification:** UI spécifique avec historique des instructions
   - **Features:** Instructions pré-remplies, dropdown historique, bouton régénérer

### Architecture et Patterns

**Patterns Zustand (graphStore.ts):**
- Utiliser `set()` avec spread operator pour updates immutables
- Suivre pattern `acceptNode()` / `rejectNode()` pour gestion état
- Middleware `temporal` pour undo/redo (déjà présent)
- Méthode `regenerateNode()` = async avec état loading

**Patterns FastAPI (graph.py):**
- Suivre structure `@router.post()` avec `response_model`
- Utiliser `Annotated[str, Depends(get_request_id)]`
- Réutiliser `UnityDialogueGenerationService` pour génération

**Patterns React (DialogueNode.tsx + RegenerateNodeModal.tsx):**
- Utiliser `useState` pour état local (modal ouvert/fermé, instructions)
- Utiliser `useGraphStore()` hook pour accéder au store
- Suivre pattern `AIGenerationPanel.tsx` pour UI génération

**Structure Données:**

⚠️ **Note architecture importante :** Il n'existe pas d'interface `DialogueNodeData` exportée dans `graphStore.ts`. Les données de nœud sont typées en générique (`Node` de React Flow). L'interface `DialogueNodeData` est définie **localement** dans `DialogueNode.tsx` pour les props du composant. Les nouveaux champs doivent être ajoutés dans les deux endroits.

```typescript
// À ajouter dans DialogueNode.tsx (props locales) ET dans le typage implicite du store
interface RegenerationEntry {
  timestamp: string;           // ISO date
  instructions: string;        // Instructions utilisées
  generationId: string;        // ID unique de la génération
  cost: number;               // Coût en €
  provider: string;           // Provider LLM utilisé
}

// Champs à ajouter dans DialogueNodeData (DialogueNode.tsx)
// Ces champs existent déjà : id, speaker, line, choices, nextNode, status, validationErrors
// Nouveaux champs à ajouter :
//   lastGenerationInstructions?: string;     // Instructions dernière génération
//   regenerationHistory?: RegenerationEntry[];  // Historique complet (max 10 entrées)
//   contextGddHash?: string;                 // Hash contexte GDD original
```

### Intégration avec Stories Existantes

**Story 1.4 (Accept/Reject) - DONE:**
- Les nœuds en `status: "pending"` peuvent être régénérés
- Le bouton "Régénérer" apparaît pour les nœuds pending (au lieu de "Accepter/Rejeter")
- Workflow: Génération → Pending → Régénérer (optionnel) → Accept

**Story 1.1 (Génération single) - DONE:**
- Réutiliser `UnityDialogueGenerationService.generate_dialogue_node(llm_client, prompt, system_prompt_override, max_choices)`
- La génération passe par `GraphNodeOrchestrator` (backend) — contexte parent à reconstituer depuis le nœud rejeté existant
- Pour la régénération, le frontend peut appeler `useGraphStore().generateFromNode(parentNodeId, instructions, options)` en passant l'ID du nœud parent original (plutôt que créer un endpoint backend complet), ou passer par l'endpoint `/regenerate` dédié qui reconstruit le contexte côté backend

**Story 1.9 (Auto-link) - DONE:**
- Les connexions créées par auto-link doivent être préservées lors régénération
- `via_choice_index` conservé pour reconstruction edges

**ADR-007 (React Flow controlled):**
- **RISQUE IDENTIFIÉ:** Remplacer un nœud peut causer des bugs d'affichage si mal géré
- **SOLUTION:** Utiliser `updateNode()` du store (pas suppression/recréation brute)
- Le nouveau nœud doit recevoir les dimensions via `onNodesChange` type `dimensions`
- Voir post-mortem dans `_bmad-output/implementation-artifacts/1-17-adr-007-react-flow-controlled.md`

### Préservation Connexions lors Remplacement

```typescript
// Pseudo-code pour préservation connexions
async regenerateNode(nodeId, newInstructions) {
  // 1. Sauvegarder edges connectées
  const connectedEdges = edges.filter(e => e.source === nodeId || e.target === nodeId);
  const edgeData = connectedEdges.map(e => ({
    source: e.source,
    target: e.target,
    label: e.label,
    via_choice_index: e.data?.via_choice_index
  }));

  // 2. Générer nouveau nœud
  const newNode = await api.regenerateNode(nodeId, newInstructions);

  // 3. Remplacer nœud (même ID/stableID pour éviter casser edges)
  updateNode(nodeId, { ...newNode, id: nodeId, status: "pending" });

  // 4. Recréer edges (si ID changé, mapper ancien→nouveau)
  // Si même ID préservé, edges restent valides
}
```

### Historique Instructions

**Stockage:**
- `lastGenerationInstructions`: string (dernières instructions utilisées)
- `regenerationHistory`: RegenerationEntry[] (tableau historique complet)

**UI Historique:**
- Dropdown dans `RegenerateNodeModal` listant les entrées (date + preview instructions)
- Bouton "Utiliser" à côté de chaque entrée pour pré-remplir le champ
- Maximum 10 entrées (FIFO si dépassement)

### Project Structure Notes

**Alignement avec structure unifiée:**
- ✅ Frontend: `frontend/src/components/graph/RegenerateNodeModal.tsx` (nouveau)
- ✅ Frontend: `frontend/src/components/graph/nodes/DialogueNode.tsx` (modification)
- ✅ Store: `frontend/src/store/graphStore.ts` (modification)
- ✅ API: `api/routers/graph.py` (modification)
- ✅ Services: `services/graph_conversion_service.py` (modification)

**Pas de conflits détectés** - tous les fichiers suivent les conventions du projet.

### Testing Standards

**Unit Tests:**
- `tests/frontend/graphStore.regenerate.test.ts`: Tester `regenerateNode()` logique
- Vérifier préservation edges lors remplacement
- Vérifier historique instructions (ajout/récupération)
- Vérifier appel API avec bon paramètres

**Integration Tests:**
- `tests/api/test_graph_regenerate.py`: Tester endpoint regenerate
- Tester récupération contexte parent depuis nœud existant
- Tester préservation stableID
- Tester erreurs: nœud inexistant, dialogue inexistant, échec LLM

**E2E Tests (Playwright):**
- `e2e/graph-node-regenerate.spec.ts`: Workflow complet
- Générer nœud → Rejeter → Régénérer avec nouvelles instructions → Accepter
- Vérifier historique préservé
- Vérifier connexions préservées

### References

- **FR10:** Régénérer des nœuds rejetés avec instructions ajustées
- **Story 1.4:** Accepter ou rejeter nœuds générés inline (dépendance - DONE)
- **Story 1.1:** Génération single (référence patterns)
- **Story 1.9:** Auto-link (préservation connexions)
- **ADR-007:** React Flow controlled (risque nœuds invisibles)
- **Source:** `_bmad-output/planning-artifacts/epics/epic-01.md#story-110`
- **Post-mortem ADR-007:** `_bmad-output/implementation-artifacts/1-17-adr-007-react-flow-controlled.md`

## Dev Agent Record

### Agent Model Used

_(À remplir par le Dev Agent lors de l'implémentation)_

### Debug Log References

_(À remplir - références vers logs d'erreurs rencontrées)_

### Completion Notes List

_(À remplier par le Dev Agent lors de l'implémentation)_

### File List

**Frontend (nouveau/modifié):**
- `frontend/src/components/graph/RegenerateNodeModal.tsx` (NOUVEAU - UI régénération avec historique)
- `frontend/src/components/graph/nodes/DialogueNode.tsx` (MODIFIÉ - bouton "Régénérer" dans menu contextuel)
- `frontend/src/store/graphStore.ts` (MODIFIÉ - méthode `regenerateNode()`, interfaces historique)
- `frontend/src/types/dialogue.ts` (MODIFIÉ - interfaces `RegenerationEntry`, champs node)

**Backend (modifié):**
- `api/routers/graph.py` (MODIFIÉ - endpoint `POST /nodes/{nodeId}/regenerate`)
- `api/schemas/graph.py` (MODIFIÉ - schemas `RegenerateNodeRequest`, `RegenerateNodeResponse`)
- `services/graph_conversion_service.py` (MODIFIÉ - préservation champs métadonnées)

**Tests (nouveau):**
- `frontend/src/__tests__/graphStore.regenerate.test.ts` (NOUVEAU - tests unitaires)
- `tests/api/test_graph_regenerate.py` (NOUVEAU - tests API)
- `e2e/graph-node-regenerate.spec.ts` (NOUVEAU - tests E2E)

## Change Log

- **2026-03-04** : Story créée par Scrum Master (Bob)
  - Analyse complète dépendances Story 1.4 (DONE)
  - Identification risque ADR-007 (nœuds invisibles lors remplacement)
  - Définition patterns et fichiers à modifier
  - Status: ready-for-dev
- **2026-03-04** : Révision garde-fous (Scrum Master)
  - Corrigé : bouton "Régénérer" → overlay hover inline (pas de menu contextuel dans `DialogueNode.tsx`)
  - Corrigé : endpoint → `/api/v1/unity-dialogues/graph/nodes/{nodeId}/regenerate` (cohérent avec accept/reject)
  - Corrigé : `DialogueNodeData` → interface locale dans `DialogueNode.tsx` (pas d'interface exportée dans `graphStore.ts`)
  - Clarifié : pattern `generateFromNode()` et ses paramètres exacts
  - Clarifié : schema `RegenerateNodeRequest` avec `dialogue_id` dans le body (pas en URL)
