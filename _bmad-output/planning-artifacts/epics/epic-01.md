### Epic 1: Amélioration et peaufinage de la génération de dialogues

**Objectif :** Améliorer l'expérience utilisateur et la robustesse de la génération de dialogues existante.

**Contexte :** La génération de dialogues assistée par IA est déjà fonctionnelle (génération single/batch, édition manuelle, auto-link). Cet Epic se concentre sur les améliorations qui réduisent la friction dans le workflow et donnent plus de contrôle à l'utilisateur.

**Valeur utilisateur :** Réduire la friction dans le workflow de génération, améliorer la qualité des dialogues générés, et donner plus de contrôle à l'utilisateur sur l'itération et l'optimisation.

**FRs covered:** FR1-10 (génération, édition, auto-link, régénération), FR72-79 (estimation coûts, logs, fallback provider)

**NFRs covered:** NFR-P2 (LLM Generation <30s single, <2min batch), NFR-I2 (LLM API Reliability >99%), NFR-R4 (Error Recovery LLM >95%)

**Dépendances:** Epic 0 (infrastructure), Epic 3 (contexte GDD requis pour génération)

**Statut des US :**
- ✅ **DONE (8)** : US 1.1, 1.2, 1.3, 1.5, 1.8, 1.9, 1.13
- 🔴 **PRIORITÉ A - Critiques (4)** : US 1.4, 1.6, 1.10, 1.17
- 🟡 **PRIORITÉ B - Importantes (3)** : US 1.7, 1.11, 1.15
- 🟢 **PRIORITÉ C - Nice-to-have (3)** : US 1.12, 1.14, 1.16

---

## ⚠️ GARDE-FOUS - Vérification de l'Existant (Scrum Master)

**OBLIGATOIRE avant création de chaque story de cet epic :**

### Checklist de Vérification

1. **Fichiers mentionnés dans les stories :**
   - [ ] Vérifier existence avec `glob_file_search` ou `grep`
   - [ ] Vérifier chemins corrects (ex: `core/llm/` vs `services/llm/`)
   - [ ] Si existe : **DÉCISION** - Étendre ou remplacer ? (documenter dans story)

2. **Composants/Services similaires :**
   - [ ] Rechercher composants React similaires (`codebase_search` dans `frontend/src/components/`)
   - [ ] Rechercher stores Zustand similaires (`codebase_search` dans `frontend/src/store/`)
   - [ ] Rechercher services Python similaires (`codebase_search` dans `services/`, `core/`)
   - [ ] Si similaire existe : **DÉCISION** - Réutiliser ou créer nouveau ? (documenter dans story)

3. **Endpoints API :**
   - [ ] Vérifier namespace cohérent (`/api/v1/dialogues/*` vs autres)
   - [ ] Vérifier si endpoint similaire existe (`grep` dans `api/routers/`)
   - [ ] Si endpoint similaire : **DÉCISION** - Étendre ou créer nouveau ? (documenter dans story)

4. **Patterns existants :**
   - [ ] Vérifier patterns Zustand (immutable updates, structure stores)
   - [ ] Vérifier patterns FastAPI (routers, dependencies, schemas)
   - [ ] Vérifier patterns React (composants, hooks, modals)
   - [ ] Respecter conventions de nommage et structure dossiers

5. **Documentation des décisions :**
   - Si remplacement : Documenter **POURQUOI** dans story "Dev Notes"
   - Si extension : Documenter **COMMENT** (quels champs/méthodes ajouter)
   - Si nouveau : Documenter **POURQUOI** pas de réutilisation

---

### Story 1.1: Générer un nœud de dialogue single depuis un nœud parent dans le graphe (FR1)

**Status:** ✅ **DÉJÀ IMPLÉMENTÉ**

**Note:** Cette fonctionnalité existe déjà complètement. Cette US sert de documentation de référence.
- ✅ Endpoint `/api/v1/unity-dialogues/graph/generate-node` implémenté
- ✅ Composant `AIGenerationPanel.tsx` avec toutes les fonctionnalités
- ✅ Contexte parent intégré, streaming, auto-layout, auto-link

As a **utilisateur créant des dialogues dans le graphe**,
I want **générer un nœud de dialogue unique depuis un nœud parent existant avec assistance LLM**,
So that **je peux itérer rapidement sur la création de dialogues en construisant le graphe nœud par nœud**.

**Acceptance Criteria:**

**Given** j'ai un dialogue ouvert dans l'éditeur de graphe avec au moins un nœud existant
**When** je sélectionne un nœud parent et clique sur "✨ Générer nœud IA"
**Then** le modal `AIGenerationPanel` s'ouvre avec le contexte du nœud parent (speaker + line tronquée)
**And** je peux sélectionner un choix spécifique du parent ou laisser libre
**And** je peux saisir des instructions optionnelles (tone, style, theme)

**Given** j'ai configuré la génération (choix cible + instructions optionnelles)
**When** je clique sur "✨ Générer"
**Then** un nœud de dialogue est généré avec texte, speaker, et choix (si applicable)
**And** le nœud apparaît dans le graphe avec un stableID unique
**And** la génération se termine en <30 secondes (NFR-P2)

**Given** je lance une génération single depuis le graphe
**When** la génération est en cours
**Then** la modal de progression (Epic 0 Story 0.2) affiche le streaming en temps réel
**And** je peux interrompre la génération si nécessaire

**Given** la génération réussit
**When** le nœud est créé dans le graphe
**Then** le nœud est automatiquement positionné visuellement (auto-layout)
**And** le nœud est automatiquement lié au nœud parent si un choix a été sélectionné (auto-link, voir Story 1.9)
**And** je peux accepter ou rejeter le nœud (voir Story 1.4)

**Given** je spécifie des instructions de génération (tone, style, theme)
**When** le nœud est généré
**Then** le nœud respecte les instructions (tone cohérent, style demandé, theme présent)
**And** les instructions sont incluses dans le prompt LLM avec le contexte du nœud parent

**Technical Requirements:**
- Backend : Endpoint `/api/v1/unity-dialogues/graph/generate-node` (existant, à consolider)
  - Utilise `UnityDialogueOrchestrator` qui coordonne les services
  - Service : `UnityDialogueGenerationService.generate_dialogue_node()` avec Structured Output
  - Intègre le contexte du nœud parent dans le prompt (speaker + line + choix si applicable)
- LLM : Utilise provider sélectionné (OpenAI/Mistral via Epic 0 Story 0.3)
- Frontend : 
  - Composant `AIGenerationPanel.tsx` (existant, à améliorer) : Modal de génération depuis graphe
  - Composant `GenerationPanel.tsx` : Génération standalone (hors scope de cette story)
- Integration : Epic 0 Story 0.2 (Progress Modal) pour feedback streaming
- Auto-layout : Positionnement automatique du nouveau nœud dans le graphe (React Flow)
- Tests : Unit (génération nœud avec contexte parent), Integration (API génération graphe), E2E (workflow complet depuis graphe)

**Dev Notes:**
- **Différence avec génération standalone :** La génération depuis le graphe utilise le contexte du nœud parent (speaker, line, choix) pour créer une continuité narrative. La génération standalone (`GenerationPanel.tsx`) génère un nœud isolé sans contexte de graphe.
- **Architecture :** L'endpoint utilise `UnityDialogueOrchestrator` qui orchestre plusieurs services (prompt building, LLM generation, cost tracking). Ne pas appeler directement `UnityDialogueGenerationService` depuis l'endpoint.
- **Dépendances :** Story 1.4 (accept/reject) et Story 1.9 (auto-link) sont des améliorations qui s'appliquent après la génération. Cette story se concentre sur la génération elle-même.

**References:** FR1 (génération single), FR3 (instructions), NFR-P2 (LLM Generation <30s), Epic 0 Story 0.2 (Progress Modal)

---

### Story 1.2: Générer batch de nœuds depuis tous les choix existants (FR2)

**Status:** ✅ **DÉJÀ IMPLÉMENTÉ**

**Note:** Cette fonctionnalité existe déjà. Cette US sert de documentation de référence.
- ✅ Endpoint avec `generate_all_choices=True` implémenté
- ✅ Service `GraphGenerationService` avec génération parallèle
- ✅ Frontend avec bouton "✨ Générer pour tous les choix"
- ✅ Progression batch dans la modal
- ⚠️ Améliorations possibles : gestion des échecs partiels, interruption batch (peuvent être dans des US futures)

As a **utilisateur créant des dialogues dans le graphe**,
I want **générer automatiquement un nœud pour chaque choix non connecté d'un nœud parent en une seule requête**,
So that **je peux créer rapidement des branches de dialogue complètes sans générer chaque nœud individuellement**.

**Acceptance Criteria:**

**Given** j'ai un nœud avec des choix joueur (ex: "Accepter", "Refuser", "Questionner") dont certains n'ont pas de `targetNode` (ou `targetNode === "END"`)
**When** je sélectionne le nœud et clique sur "✨ Générer pour tous les choix"
**Then** un nœud est généré pour chaque choix non connecté
**And** tous les nœuds sont générés en <2 minutes (NFR-P2 batch, génération parallèle)
**And** chaque nœud est automatiquement lié au nœud parent (connexion parent→enfant via `via_choice_index`, voir Story 1.9)

**Given** je lance une génération batch
**When** la génération est en cours
**Then** la modal de progression affiche "Génération batch : X/Y nœuds" avec progression en temps réel
**And** je peux interrompre la génération batch (tous les nœuds en cours sont annulés, voir Epic 0 Story 0.8)

**Given** la génération batch réussit partiellement (ex: 5/8 nœuds générés, 3 échecs)
**When** les résultats sont affichés
**Then** les 5 nœuds réussis sont ajoutés au graphe avec auto-link
**And** un message d'erreur liste les 3 choix qui ont échoué avec raison (ex: "Choix 'Questionner' : timeout LLM")
**And** je peux régénérer individuellement les choix échoués (voir Story 1.10)

**Given** je génère un batch avec contexte GDD
**When** les nœuds sont générés
**Then** chaque nœud utilise le même contexte GDD (cohérence narrative)
**And** les nœuds sont variés (pas de répétition, chaque choix mène à un dialogue unique)
**And** chaque nœud est généré avec le contexte du choix spécifique (texte du choix inclus dans le prompt)

**Given** certains choix du nœud parent ont déjà un `targetNode` connecté
**When** je lance une génération batch
**Then** seuls les choix non connectés sont générés (pas de régénération des choix déjà connectés)
**And** un message informatif s'affiche "X choix déjà connecté(s), Y nouveau(x) nœud(s) généré(s)"

**Technical Requirements:**
- Backend : Endpoint `/api/v1/unity-dialogues/graph/generate-node` (existant) avec paramètre `generate_all_choices: bool`
  - Utilise `GraphGenerationService.generate_nodes_for_all_choices()` avec génération parallèle (asyncio.gather)
  - Filtre automatiquement les choix déjà connectés (targetNode existe et ≠ "END")
- Service : `GraphGenerationService` avec gestion erreurs par choix (échec d'un choix n'arrête pas les autres)
- Frontend : 
  - Composant `AIGenerationPanel.tsx` (existant) avec bouton "✨ Générer pour tous les choix"
  - Progression batch : `batchProgress` state avec `{current, total}` mis à jour en temps réel
- Progress : Modal `GenerationProgressModal` affiche progression batch (X/Y nœuds générés)
- Auto-link : Chaque nœud généré est connecté au parent via `suggested_connections` avec `via_choice_index` (voir Story 1.9)
- Interruption : Support interruption batch (Epic 0 Story 0.8) - annule toutes les générations en cours
- Tests : Unit (batch génération parallèle), Integration (API batch avec échecs partiels), E2E (workflow batch complet)

**Dev Notes:**
- **Génération parallèle :** Les nœuds sont générés en parallèle avec `asyncio.gather()` pour optimiser le temps de génération. Si un choix échoue, les autres continuent.
- **Filtrage automatique :** Seuls les choix sans `targetNode` (ou avec `targetNode === "END"`) sont générés. Les choix déjà connectés sont ignorés.
- **Limite de choix :** Pas de limite artificielle (3-8). Tous les choix non connectés sont générés. Si un nœud a 10 choix non connectés, 10 nœuds seront générés.
- **Sélection manuelle :** La sélection manuelle de 3-8 choix spécifiques n'est pas dans le scope. Si besoin, créer une story séparée "Story 1.2b: Générer batch avec sélection manuelle de choix".

**References:** FR2 (génération batch), NFR-P2 (LLM Generation <2min batch), Story 1.9 (auto-link), Story 1.10 (régénération), Epic 0 Story 0.8 (interruption)

---

### Story 1.3: Spécifier instructions de génération (tone, style, theme) (FR3)

**Status:** ✅ **DÉJÀ IMPLÉMENTÉ** (améliorations mineures possibles)

**Note:** Cette fonctionnalité existe déjà. Les champs `userInstructions` sont disponibles dans `AIGenerationPanel.tsx` et `GenerationPanel.tsx`, et sont intégrés dans le prompt LLM.

**Améliorations mineures possibles :**
- Warning si instructions >500 mots
- Message "Instructions par défaut utilisées" si vide

As a **utilisateur générant des dialogues**,
I want **spécifier des instructions de génération (tone, style, theme) pour chaque génération**,
So that **les dialogues générés correspondent exactement à l'ambiance et au style narratif souhaités**.

**Acceptance Criteria:**

**Given** je suis sur l'écran de génération
**When** je saisis des instructions dans le champ "Instructions" (ex: "Tone: sombre, Style: poétique, Theme: trahison")
**Then** les instructions sont incluses dans le prompt LLM
**And** le nœud généré reflète ces instructions (tone sombre, style poétique, theme trahison)

**Given** j'ai sauvegardé un preset (Epic 0 Story 0.4)
**When** je charge le preset
**Then** les instructions du preset sont pré-remplies dans le champ "Instructions"
**And** je peux modifier les instructions avant génération

**Given** je spécifie des instructions vides
**When** je lance une génération
**Then** des instructions par défaut sont utilisées (tone neutre, style standard)
**And** un message informatif s'affiche "Instructions par défaut utilisées"

**Given** je spécifie des instructions très longues (>500 mots)
**When** je lance une génération
**Then** un warning s'affiche "Instructions longues - peut affecter le budget tokens"
**And** la génération continue normalement (pas de blocage)

**Technical Requirements:**
- Frontend : Champ texte `userInstructions` dans `GenerationPanel.tsx` (existant, à améliorer)
- Backend : Intégration instructions dans `PromptEngine.build_prompt()` (existant)
- Validation : Longueur max instructions (optionnel, warning si >500 mots)
- Presets : Integration avec Epic 0 Story 0.4 (presets incluent instructions)
- Tests : Unit (instructions incluses dans prompt), Integration (génération avec instructions), E2E (instructions appliquées)

**References:** FR3 (instructions génération), Epic 0 Story 0.4 (presets), FR55-63 (templates)

---

### Story 1.4: Accepter ou rejeter nœuds générés inline (FR4)

**Status:** 🔴 **PRIORITÉ A - À IMPLÉMENTER**

**Valeur :** Permet l'itération rapide sur la qualité des dialogues sans workflow complexe. Bloque l'US 1.10 (régénération).

As a **utilisateur générant des dialogues**,
I want **accepter ou rejeter les nœuds générés directement dans le graphe**,
So that **je peux itérer rapidement sur la qualité des dialogues sans workflow complexe**.

**Acceptance Criteria:**

**Given** un nœud vient d'être généré et apparaît dans le graphe
**When** je survole le nœud
**Then** des boutons "Accepter" (✓) et "Rejeter" (✗) s'affichent sur le nœud
**And** le nœud est en état "pending" (couleur orange/border dashed)

**Given** je clique sur "Accepter"
**When** le nœud est accepté
**Then** le nœud passe en état "accepted" (couleur verte/border solid)
**And** le nœud est sauvegardé dans le dialogue (persisté)
**And** les boutons Accepter/Rejeter disparaissent

**Given** je clique sur "Rejeter"
**When** le nœud est rejeté
**Then** le nœud est supprimé du graphe (pas sauvegardé)
**And** un message "Nœud rejeté" s'affiche
**And** je peux régénérer le nœud avec instructions ajustées (voir Story 1.10)

**Given** j'ai plusieurs nœuds pending dans le graphe
**When** je navigue dans le graphe
**Then** tous les nœuds pending affichent les boutons Accepter/Rejeter
**And** je peux accepter/rejeter chaque nœud indépendamment

**Given** je ferme l'application avec des nœuds pending
**When** je rouvre l'application
**Then** les nœuds pending sont restaurés (session recovery)
**And** je peux toujours accepter/rejeter ces nœuds

**Technical Requirements:**
- Frontend : Composant `DialogueNode.tsx` avec état "pending/accepted/rejected" + boutons inline
- Zustand store : `useGraphStore` avec méthode `acceptNode(nodeId)`, `rejectNode(nodeId)`
- Backend : Endpoint `/api/v1/dialogues/{id}/nodes/{nodeId}/accept` (POST), `/reject` (POST)
- State : Nœuds pending stockés dans dialogue JSON avec flag `status: "pending"`
- Tests : Unit (accept/reject logic), Integration (API accept/reject), E2E (workflow accept/reject)

**References:** FR4 (accepter/rejeter), FR95-101 (session management), Story 1.10 (régénération)

---

### Story 1.5: Éditer manuellement le contenu des nœuds générés (FR5)

**Status:** ✅ **DÉJÀ IMPLÉMENTÉ**

**Note:** Cette fonctionnalité existe déjà. Le composant `NodeEditorPanel.tsx` permet l'édition complète des nœuds (texte, speaker, metadata).

As a **utilisateur créant des dialogues**,
I want **éditer manuellement le contenu des nœuds générés (texte, speaker, metadata)**,
So that **je peux affiner et personnaliser les dialogues générés par l'IA**.

**Acceptance Criteria:**

**Given** un nœud est généré et accepté dans le graphe
**When** je double-clique sur le nœud (ou clic droit → "Éditer")
**Then** un panneau d'édition s'ouvre avec les champs : texte, speaker, metadata
**And** je peux modifier chaque champ

**Given** je modifie le texte d'un nœud
**When** je sauvegarde (Ctrl+S ou bouton "Sauvegarder")
**Then** les modifications sont persistées dans le dialogue
**And** un indicateur "Modifié" s'affiche sur le nœud (icône étoile)
**And** l'auto-save (Epic 0 Story 0.5) sauvegarde les modifications dans les 2 minutes

**Given** je modifie le speaker d'un nœud
**When** le speaker n'existe pas dans le GDD
**Then** un warning s'affiche "Speaker 'X' non trouvé dans GDD"
**And** je peux quand même sauvegarder (speaker custom autorisé)

**Given** je modifie les metadata d'un nœud (tags, conditions, effets)
**When** je sauvegarde
**Then** les metadata sont validées (format JSON Unity)
**And** les erreurs de validation sont affichées avant sauvegarde

**Given** j'annule l'édition (Escape ou bouton "Annuler")
**When** je ferme le panneau d'édition
**Then** les modifications non sauvegardées sont perdues
**And** un message de confirmation s'affiche si modifications non sauvegardées

**Technical Requirements:**
- Frontend : Composant `NodeEditorPanel.tsx` avec formulaires texte/speaker/metadata
- Zustand store : `useGraphStore` avec méthode `updateNode(nodeId, updates)`
- Backend : Endpoint `/api/v1/dialogues/{id}/nodes/{nodeId}` (PUT) pour mise à jour nœud
- Validation : Format Unity JSON (Pydantic models) avant sauvegarde
- Integration : Epic 0 Story 0.5 (auto-save) pour sauvegarde automatique
- Tests : Unit (édition nœud), Integration (API update), E2E (workflow édition complet)

**References:** FR5 (édition manuelle), FR48 (validation JSON Unity), Epic 0 Story 0.5 (auto-save)

---

### Story 1.6: Créer manuellement des nœuds sans LLM (FR6)

**Status:** 🔴 **PRIORITÉ A - À IMPLÉMENTER**

**Valeur :** Complète le workflow de création en permettant d'ajouter des dialogues spécifiques sans utiliser l'IA.

**Note:** La méthode `addNode()` existe dans le store, mais il manque un bouton "Nouveau nœud" visible dans l'UI.

As a **utilisateur créant des dialogues**,
I want **créer des nœuds de dialogue manuellement sans génération LLM**,
So that **je peux ajouter des dialogues spécifiques ou corriger des nœuds sans utiliser l'IA**.

**Acceptance Criteria:**

**Given** je suis dans l'éditeur de graphe
**When** je clique sur "Nouveau nœud" (bouton + ou menu contextuel)
**Then** un nœud vide est créé dans le graphe avec stableID unique
**And** le panneau d'édition s'ouvre automatiquement pour remplir le contenu

**Given** je crée un nœud manuellement
**When** je remplis les champs (texte, speaker, metadata)
**Then** le nœud est sauvegardé avec le même format que les nœuds générés
**And** le nœud est immédiatement visible dans le graphe

**Given** je crée un nœud manuellement sans texte
**When** je sauvegarde
**Then** un warning s'affiche "Nœud vide - ajouter du texte"
**And** je peux quand même sauvegarder (nœud placeholder autorisé)

**Given** je crée un nœud manuellement
**When** je crée le nœud
**Then** je peux immédiatement créer des connexions vers d'autres nœuds (drag-and-drop)
**And** le nœud peut recevoir des connexions depuis d'autres nœuds

**Given** je crée plusieurs nœuds manuellement rapidement
**When** les nœuds sont créés
**Then** chaque nœud a un stableID unique (pas de collision)
**And** les nœuds sont positionnés automatiquement dans le graphe (auto-layout)

**Technical Requirements:**
- Frontend : Bouton "Nouveau nœud" dans `GraphEditor.tsx` + menu contextuel
- Zustand store : `useGraphStore` avec méthode `createEmptyNode()` retournant nœud avec stableID
- Backend : Endpoint `/api/v1/dialogues/{id}/nodes` (POST) pour créer nœud vide
- Auto-layout : Positionnement automatique nouveau nœud (React Flow auto-layout)
- Integration : Même format Unity JSON que nœuds générés (cohérence)
- Tests : Unit (création nœud vide), Integration (API create node), E2E (workflow création manuelle)

**References:** FR6 (création manuelle), FR22-35 (graph editor), Epic 0 Story 0.1 (stableID)

---

### Story 1.7: Dupliquer des nœuds existants pour créer des variantes (FR7)

**Status:** 🟡 **PRIORITÉ B - À IMPLÉMENTER**

**Valeur :** Gain de productivité en permettant de créer rapidement des variantes sans recréer depuis zéro.

As a **utilisateur créant des dialogues**,
I want **dupliquer des nœuds existants pour créer des variantes rapidement**,
So that **je peux itérer sur des versions alternatives sans recréer le nœud depuis zéro**.

**Acceptance Criteria:**

**Given** j'ai un nœud dans le graphe
**When** je sélectionne le nœud et clique sur "Dupliquer" (menu contextuel ou bouton)
**Then** une copie du nœud est créée avec un nouveau stableID unique
**And** le nœud dupliqué est positionné à côté du nœud original (offset visuel)
**And** le panneau d'édition s'ouvre pour modifier la copie

**Given** je duplique un nœud avec des connexions
**When** le nœud est dupliqué
**Then** le nœud dupliqué n'a PAS de connexions (copie isolée)
**And** je peux créer de nouvelles connexions pour la variante

**Given** je duplique un nœud avec metadata (tags, conditions, effets)
**When** le nœud est dupliqué
**Then** toutes les metadata sont copiées dans le nœud dupliqué
**And** je peux modifier les metadata indépendamment

**Given** je duplique plusieurs nœuds en sélection multiple
**When** je sélectionne 3 nœuds et clique "Dupliquer"
**Then** 3 copies sont créées (une par nœud sélectionné)
**And** chaque copie a un stableID unique
**And** les copies sont positionnées en groupe à côté des originaux

**Given** je duplique un nœud
**When** je modifie le nœud dupliqué
**Then** les modifications n'affectent pas le nœud original
**And** les deux nœuds sont indépendants (pas de lien de dépendance)

**Technical Requirements:**
- Frontend : Action "Dupliquer" dans menu contextuel `DialogueNode.tsx` + sélection multiple
- Zustand store : `useGraphStore` avec méthode `duplicateNode(nodeId)` retournant nouveau nœud
- Backend : Endpoint `/api/v1/dialogues/{id}/nodes/{nodeId}/duplicate` (POST) pour duplication
- Positionnement : Offset visuel (ex: +50px x, +50px y) pour distinguer copie de l'original
- Metadata : Copie profonde (deep copy) de toutes les propriétés sauf stableID et connexions
- Tests : Unit (duplication logique), Integration (API duplicate), E2E (workflow duplication)

**Risque bug nœuds invisibles (post 1.17) :** En mode controlled React Flow (ADR-007), tout nœud ajouté au store doit laisser React Flow émettre et traiter les changements `dimensions` ; le store doit refléter `width`/`height` après mesure. Si `duplicateNode()` ajoute un nœud au store, le même flux que pour « Nouveau nœud » s'applique ; ne pas contourner GraphCanvas ou onNodesChange. Voir post-mortem dans `_bmad-output/implementation-artifacts/1-17-adr-007-react-flow-controlled.md`.

**References:** FR7 (duplication), FR31-32 (sélection multiple), Epic 0 Story 0.1 (stableID)

---

### Story 1.8: Supprimer des nœuds du dialogue (FR8)

**Status:** ✅ **DÉJÀ IMPLÉMENTÉ**

**Note:** Cette fonctionnalité existe déjà. La méthode `deleteNode()` existe avec modal de confirmation.

As a **utilisateur créant des dialogues**,
I want **supprimer des nœuds du dialogue**,
So that **je peux nettoyer et réorganiser le graphe en supprimant les nœuds non désirés**.

**Acceptance Criteria:**

**Given** j'ai un nœud dans le graphe
**When** je sélectionne le nœud et clique sur "Supprimer" (menu contextuel ou touche Delete)
**Then** une confirmation s'affiche "Supprimer ce nœud ? Les connexions seront également supprimées"
**And** j'ai les options "Supprimer" et "Annuler"

**Given** je confirme la suppression
**When** le nœud est supprimé
**Then** le nœud disparaît du graphe
**And** toutes les connexions (entrantes et sortantes) sont également supprimées
**And** le nœud est supprimé du dialogue (persisté)

**Given** je supprime un nœud avec plusieurs connexions
**When** le nœud est supprimé
**Then** un warning s'affiche "Nœud supprimé - X connexions supprimées"
**And** les nœuds orphelins sont détectés (validation structurelle, voir Epic 4)

**Given** je supprime plusieurs nœuds en sélection multiple
**When** je sélectionne 3 nœuds et appuie sur Delete
**Then** une confirmation s'affiche "Supprimer 3 nœuds ?"
**And** tous les nœuds sélectionnés sont supprimés en une seule action

**Given** je supprime un nœud par erreur
**When** je supprime le nœud
**Then** je peux annuler avec Ctrl+Z (undo, voir FR35)
**And** le nœud et ses connexions sont restaurés

**Technical Requirements:**
- Frontend : Action "Supprimer" dans menu contextuel `DialogueNode.tsx` + touche Delete keyboard
- Zustand store : `useGraphStore` avec méthode `deleteNode(nodeId)` + confirmation modal
- Backend : Endpoint `/api/v1/dialogues/{id}/nodes/{nodeId}` (DELETE) pour suppression
- Connexions : Suppression cascade des connexions (orphans détectés par validation)
- Undo/Redo : Integration avec système undo/redo (FR35, Epic 2)
- Tests : Unit (suppression logique), Integration (API delete), E2E (workflow suppression + undo)

**References:** FR8 (suppression), FR35 (undo/redo), FR40 (orphans), Epic 4 (validation structurelle)

---

### Story 1.9: Auto-link des nœuds générés au graphe existant (FR9)

**Status:** ✅ **DÉJÀ IMPLÉMENTÉ**

**Note:** Cette fonctionnalité existe déjà. Les connexions automatiques sont créées via `suggested_connections` dans l'API de génération.

As a **utilisateur générant des dialogues**,
I want **que les nœuds générés soient automatiquement liés à la structure du graphe existante**,
So that **je n'ai pas à créer manuellement les connexions après chaque génération**.

**Acceptance Criteria:**

**Given** je génère un nœud depuis un nœud parent existant
**When** le nœud est généré
**Then** une connexion automatique est créée du nœud parent vers le nouveau nœud
**And** la connexion est visible dans le graphe (flèche parent→enfant)

**Given** je génère un batch de nœuds depuis des choix joueur
**When** les nœuds sont générés
**Then** chaque nœud est automatiquement lié au nœud parent (connexion depuis le choix vers le nouveau nœud)
**And** chaque connexion utilise le texte du choix comme label (ex: "Accepter" → nœud généré)

**Given** je génère un nœud "Continue" (suite d'un dialogue existant)
**When** le nœud est généré
**Then** le nœud est automatiquement lié au nœud cible spécifié (targetNode mis à jour)
**And** la connexion est créée dans le bon sens (parent→nouveau nœud)

**Given** je génère un nœud sans contexte parent (génération standalone)
**When** le nœud est généré
**Then** le nœud est créé sans connexion automatique (nœud isolé)
**And** je peux créer manuellement des connexions vers ce nœud

**Given** je génère un nœud qui crée un cycle (A → B → C → A)
**When** le nœud est généré
**Then** le cycle est détecté par la validation (Epic 0 Story 0.6)
**And** un warning s'affiche "Cycle détecté" (non-bloquant)
**And** la connexion est créée quand même (cycles autorisés pour dialogues récursifs)

**Technical Requirements:**
- Backend : Service `UnityDialogueGenerationService` avec méthode `autoLinkNode(parentNodeId, newNodeId, choiceText?)`
- Frontend : Hook `useAutoLink` dans `GenerationPanel.tsx` qui crée connexion après génération
- Zustand store : `useGraphStore` avec méthode `createConnection(fromNodeId, toNodeId, label?)`
- Connexions : Format React Flow edge avec `source`, `target`, `label` (texte choix)
- Validation : Integration avec Epic 0 Story 0.6 (détection cycles)
- Tests : Unit (auto-link logique), Integration (connexion créée), E2E (workflow auto-link complet)

**References:** FR9 (auto-link), Story 1.1 (génération single), Story 1.2 (génération batch), Epic 0 Story 0.6 (validation cycles)

---

### Story 1.10: Régénérer des nœuds rejetés avec instructions ajustées (FR10)

**Status:** 🔴 **PRIORITÉ A - À IMPLÉMENTER**

**Valeur :** Permet l'itération sur la qualité sans perdre le contexte. Dépend de l'US 1.4 (accept/reject).

**Note:** Nécessite l'implémentation de l'US 1.4 en premier.

As a **utilisateur générant des dialogues**,
I want **régénérer des nœuds rejetés avec des instructions ajustées**,
So that **je peux itérer sur la qualité des dialogues sans perdre le contexte de la génération précédente**.

**Acceptance Criteria:**

**Given** j'ai rejeté un nœud généré (voir Story 1.4)
**When** je sélectionne le nœud rejeté et clique sur "Régénérer"
**Then** un panneau s'ouvre avec les instructions originales pré-remplies
**And** je peux modifier les instructions avant régénération

**Given** je modifie les instructions (ex: "Tone plus sombre, moins de répétition")
**When** je lance la régénération
**Then** un nouveau nœud est généré avec les instructions ajustées
**And** le nœud rejeté est remplacé par le nouveau nœud (même position dans graphe)
**And** les connexions du nœud rejeté sont préservées (même parent/enfant)

**Given** je régénère un nœud plusieurs fois
**When** je régénère 3 fois le même nœud
**Then** l'historique des instructions est sauvegardé (3 versions)
**And** je peux voir les instructions précédentes dans un dropdown "Historique"

**Given** je régénère un nœud batch (partie d'un batch de 5 nœuds)
**When** je régénère un seul nœud du batch
**Then** seul ce nœud est régénéré (pas tout le batch)
**And** les autres nœuds du batch restent inchangés

**Given** je régénère un nœud avec un contexte GDD modifié
**When** le contexte GDD a changé depuis la génération originale
**Then** le nouveau contexte GDD est utilisé pour la régénération
**And** un message informatif s'affiche "Contexte GDD mis à jour depuis la génération originale"

**Technical Requirements:**
- Frontend : Bouton "Régénérer" en **overlay hover inline** dans `DialogueNode.tsx` pour nœuds pending (⚠️ pas de menu contextuel — `DialogueNode.tsx` utilise exclusivement des overlays hover inline, comme les boutons Accept/Reject existants)
- Composant : `RegenerateNodeModal.tsx` avec champ instructions pré-rempli + historique
- Backend : Endpoint `/api/v1/unity-dialogues/graph/nodes/{nodeId}/regenerate` (POST) — cohérent avec `/nodes/{nodeId}/accept` et `/nodes/{nodeId}/reject` existants dans `api/routers/graph.py`
- Historique : Stockage instructions précédentes dans metadata nœud (`regenerationHistory: [...]`)
- Connexions : Préservation connexions lors remplacement nœud (même stableID ou mapping)
- Tests : Unit (régénération logique), Integration (API regenerate), E2E (workflow régénération)

**Risque bug nœuds invisibles (post 1.17) :** Remplacer un nœud (rejet → régénération) doit conserver le même flux store/React Flow ; le nouveau nœud doit recevoir les dimensions via onNodesChange type `dimensions` (width/height reflétés dans le store). Ne pas contourner GraphCanvas. Voir post-mortem dans `_bmad-output/implementation-artifacts/1-17-adr-007-react-flow-controlled.md`.

**References:** FR10 (régénération), Story 1.4 (rejeter nœuds), FR3 (instructions), Story 1.1 (génération)

---

### Story 1.11: Estimer le coût LLM avant génération (FR72)

**Status:** 🟡 **PRIORITÉ B - À IMPLÉMENTER** (UI manquante)

**Valeur :** Donne le contrôle sur le budget avant de lancer une génération coûteuse.

**Note:** L'estimation existe dans le middleware, mais il manque une UI dédiée pour afficher l'estimation avant génération.

As a **utilisateur générant des dialogues**,
I want **voir une estimation du coût LLM avant de lancer la génération**,
So that **je peux gérer mon budget et décider si je veux procéder avec la génération**.

**Acceptance Criteria:**

**Given** j'ai configuré un contexte GDD et des instructions
**When** je clique sur "Estimer le coût" (bouton avant "Générer")
**Then** une estimation s'affiche avec : coût estimé (€), tokens estimés (prompt + completion), provider sélectionné
**And** l'estimation se calcule en <1 seconde (pas de latence perceptible)

**Given** je modifie le contexte GDD (ajout personnage)
**When** le contexte change
**Then** l'estimation est recalculée automatiquement
**And** le nouveau coût estimé s'affiche (mise à jour en temps réel)

**Given** je change de provider LLM (OpenAI → Mistral)
**When** le provider change
**Then** l'estimation est recalculée avec les prix du nouveau provider
**And** la différence de coût est affichée (ex: "Mistral: -30% vs OpenAI")

**Given** je lance une génération batch (5 nœuds)
**When** j'estime le coût
**Then** l'estimation affiche le coût total (5 × coût single nœud)
**And** un breakdown par nœud est disponible (déplier pour voir détails)

**Given** l'estimation dépasse mon budget (90% ou 100%)
**When** j'estime le coût
**Then** un warning s'affiche "Budget atteint à 90%" ou "Budget dépassé - génération bloquée" (voir Epic 0 Story 0.7)
**And** le bouton "Générer" est désactivé si budget 100% dépassé

**Technical Requirements:**
- Backend : Endpoint `/api/v1/unity-dialogues/graph/estimate-cost` (POST) — nouveau endpoint cohérent avec le namespace graph (⚠️ `/api/v1/dialogues/estimate-cost` n'existe pas ; note : `/api/v1/dialogues/estimate-tokens` existe déjà dans `api/routers/dialogues.py` comme fondation pour le comptage tokens)
- Services : `TokenEstimationService` (`services/token_estimation_service.py` — ⚠️ **stub vide actuellement** `class TokenEstimationService: pass`, à implémenter) + `LLMPricingService` (`services/llm_pricing_service.py` — ✅ **existe**, calcule le coût €/token depuis `config/llm_pricing.json`) — (⚠️ `CostEstimationService` n'existe pas)
- Frontend : Composant `CostEstimationBadge.tsx` affiche estimation + bouton "Estimer" dans `AIGenerationPanel.tsx` (⚠️ pas dans `GenerationPanel.tsx` qui est la génération standalone ; le panneau du graphe est `AIGenerationPanel.tsx`)
- Cache : Estimation mise en cache (hash prompt) pour éviter recalculs inutiles
- Integration : Epic 0 Story 0.7 (cost governance) — hook `useCostGovernance()` + `CostGovernanceService` (`services/cost_governance_service.py` ✅ existant)
- Tests : Unit (calcul estimation), Integration (API estimation), E2E (workflow estimation)

**Risque bug nœuds invisibles (1.17) :** Aucun — cette US ne modifie pas l'affichage des nœuds dans le graphe (pas de changement nodes/edges ou du canvas).

**References:** FR72 (estimation coût), Epic 0 Story 0.7 (cost governance), FR77 (prompt transparency)

---

### Story 1.12: Afficher breakdown des coûts par dialogue (FR73)

**Status:** 🟢 **PRIORITÉ C - NICE-TO-HAVE**

**Valeur :** Analytics avancés pour optimiser les coûts. Utile mais pas critique pour le workflow principal.

As a **utilisateur générant des dialogues**,
I want **voir le breakdown détaillé des coûts par dialogue (coût total, coût par nœud)**,
So that **je peux analyser où mes coûts LLM sont concentrés et optimiser mes générations**.

**Acceptance Criteria:**

**Given** j'ai généré plusieurs nœuds dans un dialogue
**When** j'ouvre le panneau "Coûts" du dialogue
**Then** je vois : coût total dialogue (€), nombre de nœuds générés, coût moyen par nœud
**And** un graphique montre la distribution des coûts (bar chart par nœud)

**Given** je consulte le breakdown de coûts
**When** je clique sur un nœud dans le graphique
**Then** les détails du nœud s'affichent : tokens prompt, tokens completion, coût exact, timestamp génération
**And** je peux voir le prompt utilisé pour ce nœud (voir Story 1.14)

**Given** j'ai plusieurs dialogues dans le système
**When** je compare les coûts entre dialogues
**Then** je peux trier les dialogues par coût total (plus cher → moins cher)
**And** un indicateur visuel montre les dialogues les plus coûteux (rouge = cher, vert = économique)

**Given** je génère un nouveau nœud dans un dialogue existant
**When** le nœud est généré
**Then** le breakdown de coûts est mis à jour automatiquement
**And** le coût total dialogue augmente du coût du nouveau nœud

**Given** je supprime un nœud d'un dialogue
**When** le nœud est supprimé
**Then** le coût du nœud supprimé reste dans l'historique (pas supprimé du breakdown)
**And** un indicateur "Nœud supprimé" s'affiche à côté du coût dans le breakdown

**Technical Requirements:**
- Backend : Endpoint `/api/v1/llm-usage/dialogue/{id}/costs` (GET) retourne breakdown détaillé — (⚠️ `GET /api/v1/dialogues/{id}/costs` n'existe pas ; utiliser le namespace `llm-usage` existant dans `api/routers/llm_usage.py`)
- Service : `LLMUsageService` (`services/llm_usage_service.py` ✅ existant) — ⚠️ **PRÉREQUIS CRITIQUE** : le schéma `LLMUsageRecord` actuel (stocké dans `data/llm_usage/usage_YYYY-MM-DD.json`) n'a **pas** de champs `dialogue_id` ni `node_id`. Story 1.15 doit étendre ce schéma avant que cette story soit implémentable. (⚠️ `CostTrackingService` n'existe pas)
- Frontend : Composant `DialogueCostBreakdown.tsx` avec graphique (Chart.js ou Recharts) + tableau détaillé
- Graphique : Bar chart coût par nœud, tooltip avec détails au survol
- Integration : `LLMUsageService` pour données coûts + `CostGovernanceService` pour budget
- Tests : Unit (agrégation coûts), Integration (API costs), E2E (affichage breakdown)

**Risque bug nœuds invisibles (1.17) :** Aucun — cette US ne modifie pas l'affichage des nœuds dans le graphe.

**References:** FR73 (breakdown coûts), Epic 0 Story 0.7 (cost governance), Story 1.14 (logs génération)

---

### Story 1.13: Afficher coûts LLM cumulatifs (daily, monthly) (FR74)

**Status:** ✅ **DÉJÀ IMPLÉMENTÉ**

**Note:** Cette fonctionnalité existe déjà. Le composant `UsageDashboard.tsx` et l'endpoint `/api/v1/costs/usage` sont implémentés.

As a **utilisateur générant des dialogues**,
I want **voir mes coûts LLM cumulatifs (quotidien, mensuel)**,
So that **je peux suivre mon budget global et identifier les tendances de consommation**.

**Acceptance Criteria:**

**Given** je consulte le dashboard de coûts
**When** j'ouvre la section "Coûts cumulatifs"
**Then** je vois : coût aujourd'hui (€), coût ce mois (€), coût total (tous temps)
**And** un graphique linéaire montre l'évolution des coûts sur les 30 derniers jours

**Given** je consulte les coûts cumulatifs
**When** je change la période (quotidien → mensuel → annuel)
**Then** le graphique se met à jour avec les données de la période sélectionnée
**And** les totaux sont recalculés (ex: "Janvier 2026: 45€")

**Given** je consulte les coûts par provider (OpenAI vs Mistral)
**When** j'ouvre le breakdown par provider
**Then** je vois : coût OpenAI (€), coût Mistral (€), pourcentage de chaque provider
**And** un graphique en camembert montre la répartition (ex: "OpenAI 70%, Mistral 30%")

**Given** je dépense plus que d'habitude un jour
**When** le coût quotidien dépasse la moyenne (ex: +50%)
**Then** un indicateur visuel s'affiche "Dépense élevée aujourd'hui"
**And** un tooltip explique la raison (ex: "5 générations batch aujourd'hui")

**Given** je configure un budget mensuel (Epic 0 Story 0.7)
**When** je consulte les coûts cumulatifs
**Then** un indicateur de progression s'affiche "Budget: 45€ / 100€ (45%)"
**And** une barre de progression visuelle montre l'avancement (vert <90%, orange 90-100%, rouge >100%)

**Technical Requirements (AS IMPLEMENTED — DONE) :**
- Backend : Endpoints existants : `GET /api/v1/costs/usage` (daily_costs[], total, percentage) + `GET /api/v1/llm-usage/statistics` (stats par période/modèle) dans `api/routers/costs.py` et `api/routers/llm_usage.py` — (⚠️ `/api/v1/costs/cumulative` n'existe pas)
- Services : `LLMUsageService.get_statistics()` + `CostGovernanceService.get_budget_status()` (✅ existants) — (⚠️ `CostTrackingService` n'existe pas)
- Frontend : Composant `UsageDashboard.tsx` dans `frontend/src/components/usage/` (✅ existant, affiche budget, graphique barres daily costs, stats grid, UsageHistoryTable) — (⚠️ `CumulativeCostsDashboard.tsx` n'existe pas — c'est le nom de documentation, le vrai composant est `UsageDashboard.tsx`)
- Graphique : Bar chart coûts quotidiens (mois en cours), tooltip détails — intégré dans `UsageDashboard.tsx`
- Integration : `costs.ts` API client appelle `GET /api/v1/costs/budget`, `GET /api/v1/costs/usage` ; `llmUsage.ts` appelle `GET /api/v1/llm-usage/statistics`
- Tests : (à vérifier)

**References:** FR74 (coûts cumulatifs), Epic 0 Story 0.7 (cost governance), FR76 (budgets)

---

### Story 1.14: Afficher prompt transparency (prompt exact envoyé au LLM) (FR77)

**Status:** 🟢 **PRIORITÉ C - NICE-TO-HAVE**

**Valeur :** Utile pour le debug avancé, mais pas critique pour le workflow principal.

As a **utilisateur générant des dialogues**,
I want **voir le prompt exact envoyé au LLM pour chaque génération**,
So that **je peux comprendre comment le contexte GDD et les instructions sont utilisés et déboguer les générations**.

**Acceptance Criteria:**

**Given** un nœud a été généré
**When** je sélectionne le nœud et clique sur "Voir le prompt" (menu contextuel ou panneau détails)
**Then** un modal s'ouvre affichant le prompt complet envoyé au LLM
**And** le prompt est formaté avec syntaxe highlight (markdown ou code block)
**And** les sections sont clairement délimitées (System prompt, Context GDD, Instructions, etc.)

**Given** je consulte le prompt d'une génération
**When** le prompt est affiché
**Then** je peux copier le prompt (bouton "Copier") pour l'utiliser ailleurs
**And** je peux voir les tokens utilisés (prompt tokens, completion tokens, total)

**Given** je génère un nouveau nœud
**When** la génération se termine
**Then** le prompt est automatiquement sauvegardé dans les logs (voir Story 1.15)
**And** je peux consulter le prompt immédiatement après génération

**Given** je consulte le prompt d'une génération batch
**When** le prompt est affiché
**Then** je vois le prompt de base (identique pour tous les nœuds du batch)
**And** je peux voir les variations spécifiques par nœud (ex: "Choix 1: Accepter", "Choix 2: Refuser")

**Given** je modifie le contexte GDD après une génération
**When** je consulte le prompt d'une génération ancienne
**Then** le prompt affiché est celui utilisé à l'époque (pas le contexte actuel)
**And** un message informatif s'affiche "Prompt historique - contexte GDD depuis modifié"

**Technical Requirements:**
- Backend : Stockage prompt dans `generation_logs` — ⚠️ **n'existe pas encore** ; `LLMUsageRecord` actuel (`data/llm_usage/usage_YYYY-MM-DD.json`) ne stocke que tokens/cost/duration/success, **pas le prompt ni la réponse brute**. Cette story dépend de Story 1.15 qui doit d'abord étendre le schéma de log pour inclure `prompt` et `response`.
- API : Endpoint `/api/v1/unity-dialogues/graph/nodes/{nodeId}/prompt` (GET) — namespace cohérent avec les autres endpoints graphe (⚠️ `/api/v1/dialogues/{id}/nodes/{nodeId}/prompt` n'est pas le bon namespace)
- Frontend : Composant `PromptViewerModal.tsx` avec syntaxe highlight (react-syntax-highlighter) + bouton copier
- Format : Prompt formaté avec sections (System, Context, Instructions) + line numbers
- Integration : Story 1.15 (generation logs) **PRÉREQUIS** — à implémenter après Story 1.15
- Tests : Unit (formatage prompt), Integration (API prompt), E2E (affichage prompt)

**Risque bug nœuds invisibles (1.17) :** Aucun — cette US ne modifie pas l'affichage des nœuds dans le graphe (modal/panneau détail uniquement).

**References:** FR77 (prompt transparency), Story 1.15 (generation logs), FR78 (logs)

---

### Story 1.15: Afficher logs de génération (prompts, réponses, coûts) (FR78)

**Status:** 🟡 **PRIORITÉ B - À IMPLÉMENTER** (UI manquante)

**Valeur :** Transparence et debug. Le tracking existe déjà, mais il manque une UI de consultation.

**Note:** Le tracking des coûts existe déjà (`LLMUsageService`), mais il manque une interface pour consulter les logs.

As a **utilisateur générant des dialogues**,
I want **consulter les logs de génération (prompts, réponses LLM, coûts) pour chaque nœud**,
So that **je peux analyser l'historique des générations et comprendre les patterns de coûts/qualité**.

**Acceptance Criteria:**

**Given** j'ai généré plusieurs nœuds dans un dialogue
**When** j'ouvre le panneau "Logs de génération"
**Then** je vois une liste chronologique de toutes les générations (plus récent → plus ancien)
**And** chaque entrée affiche : timestamp, nœud généré, coût (€), tokens, provider, statut (succès/échec)

**Given** je consulte les logs de génération
**When** je clique sur une entrée de log
**Then** les détails s'affichent : prompt complet, réponse LLM brute, coût détaillé, durée génération
**And** je peux voir le prompt (voir Story 1.14) et la réponse formatée

**Given** je filtre les logs par période (aujourd'hui, cette semaine, ce mois)
**When** je sélectionne une période
**Then** seuls les logs de cette période sont affichés
**And** un résumé s'affiche "X générations, Y€ total"

**Given** je filtre les logs par provider (OpenAI vs Mistral)
**When** je sélectionne un provider
**Then** seuls les logs de ce provider sont affichés
**And** un résumé s'affiche "X générations OpenAI, Y€ total"

**Given** une génération a échoué (erreur LLM API)
**When** je consulte le log de cette génération
**Then** le statut affiche "Échec" avec message d'erreur détaillé
**And** le coût affiché est 0€ (pas de coût pour génération échouée)
**And** je peux voir la tentative de prompt (si disponible)

**Given** j'exporte les logs de génération
**When** je clique sur "Exporter logs" (CSV ou JSON)
**Then** un fichier est téléchargé avec tous les logs (format structuré)
**And** les logs incluent : timestamp, nœud, prompt, réponse, coût, tokens, provider, statut

**Technical Requirements:**
- Backend : Extension du schéma `LLMUsageRecord` (`services/repositories/llm_usage_repository.py` + `data/llm_usage/usage_YYYY-MM-DD.json`) pour ajouter `dialogue_id`, `node_id`, `prompt`, `response` — ⚠️ **ATTENTION** : le schéma actuel ne contient que `request_id`, `model`, `tokens`, `cost`, `duration`, `success`/`error` — **les champs `dialogue_id`, `node_id`, `prompt` et `response` n'existent pas encore**. Option alternative : nouveau `GenerationLogRepository` séparé pour ne pas casser l'existant. (⚠️ `CostTrackingService` n'existe pas — vrai service : `LLMUsageService`)
- API : Endpoint `/api/v1/llm-usage/dialogue/{id}/generation-logs` (GET) avec filtres période/provider — cohérent avec le namespace `llm-usage` existant dans `api/routers/llm_usage.py` (⚠️ `/api/v1/dialogues/{id}/generation-logs` n'est pas le bon namespace ; `/api/v1/llm-usage/history` existe déjà pour données globales sans filtrage par dialogue)
- Frontend : Composant `GenerationLogsPanel.tsx` avec liste chronologique + filtres + export
- Format : Logs formatés avec timestamps lisibles, coûts en €, statuts colorés (vert=succès, rouge=échec)
- Export : Fonction export CSV/JSON côté frontend (download blob)
- Tests : Unit (filtrage logs), Integration (API logs), E2E (affichage + export logs)

**Risque bug nœuds invisibles (1.17) :** Aucun — cette US ne modifie pas l'affichage des nœuds dans le graphe (panneau logs uniquement).

**References:** FR78 (generation logs), Story 1.14 (prompt transparency), FR72-74 (coûts), Epic 0 Story 0.7 (cost governance)

---

### Story 1.16: Fallback vers provider LLM alternatif en cas d'échec (FR79)

**Status:** 🟢 **PRIORITÉ C - NICE-TO-HAVE**

**Valeur :** Robustesse système. Utile mais peut être reporté à un Epic futur (robustesse infrastructure).

**Note:** Peut être déplacé vers Epic 0 (infrastructure) si plus logique.

As a **utilisateur générant des dialogues**,
I want **que le système bascule automatiquement vers un provider LLM alternatif si le provider principal échoue**,
So that **mes générations ne sont pas interrompues par des pannes temporaires d'un provider**.

**Acceptance Criteria:**

**Given** j'ai configuré OpenAI comme provider principal et Mistral comme fallback
**When** OpenAI API échoue (erreur 500, timeout, quota dépassé)
**Then** le système bascule automatiquement vers Mistral
**And** la génération continue sans interruption visible pour l'utilisateur
**And** un message informatif s'affiche "OpenAI indisponible - bascule vers Mistral"

**Given** le fallback vers Mistral est activé
**When** la génération réussit avec Mistral
**Then** le nœud est généré normalement (même format Unity JSON)
**And** le log de génération indique "Provider: Mistral (fallback depuis OpenAI)"
**And** le coût Mistral est tracké séparément (voir Story 1.13)

**Given** les deux providers (OpenAI et Mistral) échouent
**When** la génération est tentée
**Then** la génération échoue avec message "Tous les providers LLM sont indisponibles"
**And** aucun coût n'est facturé (pas de tentative facturée)
**And** l'utilisateur peut réessayer manuellement plus tard

**Given** je configure les providers de fallback dans les paramètres
**When** je définis l'ordre de fallback (ex: OpenAI → Mistral → Anthropic)
**Then** l'ordre est sauvegardé dans mes préférences
**And** le système respecte cet ordre lors des fallbacks automatiques

**Given** un fallback est déclenché
**When** je consulte les logs de génération
**Then** le log affiche clairement "Fallback: OpenAI → Mistral" avec raison (ex: "Timeout OpenAI")
**And** les métriques de fallback sont trackées (nombre de fallbacks par provider)

**Technical Requirements:**
- Backend : Logique fallback dans `LLMClientFactory` (`factories/llm_factory.py` ✅ existant) — ⚠️ **`LLMFallbackService` n'existe pas** ; implémenter directement dans la factory ou créer un décorateur/wrapper. Actuellement la factory dégrade vers `DummyLLMClient` sur erreur (dev-only, pas un vrai fallback production). Nouvelle méthode `create_client_with_fallback(primary_model_id, fallback_model_id, config, ...)` à ajouter (⚠️ `createWithFallback()` n'existe pas)
- Factory : Retry avec backoff exponentiel (3 tentatives) avant basculement vers provider secondaire ; les providers existants : `OpenAIClient` (`core/llm/openai/client.py`) et `MistralClient` (`core/llm/mistral_client.py`)
- Logs : Événement "llm_fallback" à ajouter dans `LLMUsageService.track_usage()` — ⚠️ `generation_logs` n'existe pas encore (Story 1.15 prérequis pour le log complet) ; utiliser `LLMUsageService` existant avec champ `error_message` pour le fallback
- Frontend : Message toast informatif "Fallback vers [provider]" (non-bloquant, 5s timeout)
- Configuration : Paramètres ordre fallback en config backend (`config/`) — pas de localStorage pour ce type de config sécurité
- Tests : Unit (logique fallback), Integration (API fallback), E2E (workflow fallback complet)

**Risque bug nœuds invisibles (1.17) :** Aucun — cette US ne modifie pas l'affichage des nœuds dans le graphe (backend/LLM uniquement).

**References:** FR79 (fallback provider), Epic 0 Story 0.3 (Multi-Provider LLM), NFR-R4 (Error Recovery LLM >95%), NFR-I2 (LLM API Reliability >99%)

---

### Story 1.17: Implémenter ADR-007 — GraphCanvas en mode controlled React Flow

**Status:** 🔴 **PRIORITÉ A - CRITIQUE (architecture)**

**Valeur :** Une seule source de vérité pour le graphe (store) → cohérence autosave, undo/redo, synchro serveur, suppression des bugs de sync (scintillement, liens qui disparaissent). Prérequis pour collaboration future.

**Référence :** ADR-007 dans `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md`. Doc : `docs/architecture/state-management-frontend.md`, `docs/architecture/graph-conversion-architecture.md`.

As a **développeur / mainteneur de l'éditeur de graphe**,
I want **que le canvas éditeur (GraphCanvas) utilise React Flow en mode controlled (nodes/edges provenant uniquement du store)**,
So that **il n'y ait qu'une seule source de vérité, que l'autosave, l'undo/redo et la synchro serveur soient cohérents, et que les bugs de désynchronisation (étiquettes, edges) disparaissent**.

**Acceptance Criteria:**

**Given** je modifie le graphe (drag, clic, connexion, suppression)
**When** l'action est effectuée
**Then** les `nodes` et `edges` affichés par React Flow proviennent **exclusivement** du store (ou de dérivations du store, ex. enrichissement validation/highlight)
**And** aucun `useNodesState` ni `useEdgesState` n'est utilisé dans le composant principal du canvas graphe (éditeur)

**Given** React Flow émet des changements (onNodesChange, onEdgesChange)
**When** un changement est émis
**Then** les handlers ne font qu'appeler des actions du store (updateNodePosition, deleteNode, setSelectedNode, etc.)
**And** aucun `setNodes` / `setEdges` local n'est utilisé

**Given** je sélectionne un nœud (clic, multi-select ou programmatique)
**When** la sélection change
**Then** le store est mis à jour (ex. setSelectedNode) via onNodesChange (type `select`) ou handlers dédiés
**And** les `nodes` passés à React Flow reflètent la sélection depuis le store (ex. node.selected = (node.id === selectedNodeId))

**Given** je zoome ou panne le canvas
**When** le viewport change
**Then** le viewport reste en état local à React Flow (non persisté dans le store document)

**Given** j'ai implémenté le mode controlled
**When** je clique sur un nœud ou je déplace un nœud
**Then** aucune régression : les edges restent visibles après clic ; pas de scintillement des étiquettes lors du drag (avec throttling si besoin)

**Technical Requirements:**
- Frontend : `frontend/src/components/graph/GraphCanvas.tsx` — supprimer `useNodesState(storeNodes)` / `useEdgesState(storeEdges)` ; dériver `nodes` et `edges` du store (useGraphStore) avec enrichissement via useMemo si besoin ; passer ces props à `<ReactFlow nodes={…} edges={…} />`.
- Handlers : `onNodesChange` et `onEdgesChange` doivent traiter **tous** les types de changement (position, dimension, remove, **select**) et mettre à jour uniquement le store (applyNodeChanges / applyEdgeChanges côté store ou dans les handlers).
- Sélection : `selectedNodeId` dans le store ; dériver `node.selected` depuis le store dans les nodes passés à React Flow ; gérer type `select` dans onNodesChange pour appeler setSelectedNode.
- Viewport : ne pas stocker dans le store (laisser React Flow gérer en interne).
- Performance : si besoin, throttler les appels updateNodePosition pendant le drag (ex. requestAnimationFrame) pour limiter les re-renders.
- Supprimer le code de contournement existant (stableEnrichedNodes, prevNodesRef, lastSetNodesRef, comparaisons "position seule") une fois le mode controlled en place.
- GraphView (vue read-only) : hors périmètre ADR-007 ; peut rester uncontrolled.
- Tests : régression (edges visibles après clic ; positions dans le store après drag) ; unitaire/intégration (sélection mise à jour dans le store).

**Dev Notes:**
- **Architecture :** ADR-007 impose une seule source de vérité (store). Référence complète : `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md` (section ADR-007).
- **Pattern React Flow controlled :** état (nodes, edges) dans le parent (store) ; onNodesChange / onEdgesChange mettent à jour ce state uniquement. Doc React Flow : pattern "controlled" (useState + applyNodeChanges/applyEdgeChanges dans les handlers).
- **Fichiers existants :** GraphCanvas.tsx utilise actuellement useNodesState/useEdgesState ; graphStore.ts a déjà updateNodePosition, deleteNode, setSelectedNode, connectNodes ; à réutiliser dans les handlers.
- **Bug corrigé (nœuds invisibles) :** En mode controlled, React Flow v11 garde le conteneur des nœuds en `visibility: hidden` tant que les dimensions (width/height) ne sont pas reflétées dans le store. Détail, cause et correctif dans le post-mortem de l'artifact `_bmad-output/implementation-artifacts/1-17-adr-007-react-flow-controlled.md`. Ne pas réintroduire en omettant la propagation des changements type `dimensions` (width/height) vers le store.

**References:** ADR-007, ADR-006 (store = document), docs/architecture/state-management-frontend.md, docs/architecture/graph-conversion-architecture.md

---

