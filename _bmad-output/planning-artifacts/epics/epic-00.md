### Epic 0: Infrastructure & Setup (Brownfield Adjustments)

**CONTEXTE CRITIQUE** : DialogueGenerator est un projet **brownfield** (architecture existante React + FastAPI déjà en place). Epic 0 ne crée PAS l'infrastructure depuis zéro, mais applique les ajustements critiques identifiés dans l'Architecture.

Les utilisateurs peuvent travailler sur une application stable avec l'infrastructure technique nécessaire. Le système configure ADR-001 à ADR-004 (Progress Modal SSE, Presets, Graph Fixes, Multi-Provider LLM), ID-001 à ID-005 (Auto-save, Validation cycles, Cost governance, Streaming cleanup, Preset validation).

**FRs covered:** Infrastructure Requirements (Architecture Document)

**NFRs covered:** NFR-R1 (Zero Blocking Bugs), NFR-R2 (Uptime >99%), NFR-S1 (API Key Protection), NFR-S2 (Auth Security)

**Valeur utilisateur:** Base technique fiable pour débloquer production narrative (fix bugs bloquants, stabilité).

**Dépendances:** Aucune (point d'entrée)

**Implementation Priority:** Epic 0 Story 1 = ADR-003 (Graph Fix stableID) - **CRITIQUE** car bug bloquant corruption graphe

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

6. **Version produit (semver applicative, distincte de `schemaVersion` JSON) :**
   - À la clôture d’un epic qui livre une release : bump via `npm run version:bump:patch` (ou `minor` / `major` selon [workflow.mdc](../../../.cursor/rules/workflow.mdc)), puis commit ; tag Git optionnel.
   - Vérifier : `npm run verify:app-version` (également exécuté par `npm run test:all` et `npm run build:check`).

### Fichiers/Composants Spécifiques Epic 0

**OBLIGATOIRE avant création de chaque story de cet epic :**

### Checklist Spécifique Epic 0 (Brownfield)

1. **Fichiers existants à vérifier :**
   - [ ] `frontend/src/store/generationStore.ts` (existe déjà, gère sceneSelection, rawPrompt)
   - [ ] `frontend/src/store/graphStore.ts` (existe déjà, gère graphe)
   - [ ] `core/llm/llm_client.py` (existe déjà, OpenAIClient)
   - [ ] `api/routers/dialogues.py` (existe déjà, endpoints génération)
   - [ ] `api/main.py` (existe déjà, inclusion routers)

2. **Patterns existants à respecter :**
   - [ ] Zustand stores : Immutable updates, pattern `set((state) => ({ ...state, newValue }))`
   - [ ] FastAPI routers : Namespace `/api/v1/dialogues/*` (cohérent)
   - [ ] React modals : Pattern `GenerationOptionsModal.tsx` (overlay + header + contenu scrollable)
   - [ ] LLM client : `core/llm/llm_client.py` (pas `services/llm/`)

3. **Décisions de remplacement :**
   - Si story propose de créer un fichier qui existe : **DOCUMENTER** décision (étendre vs remplacer)
   - Si story propose un chemin incorrect : **CORRIGER** avant création
   - Si story propose un pattern différent : **JUSTIFIER** dans "Dev Notes"

### Exemples Epic 0

**Story 0.2 (Progress Modal SSE) :**
- ✅ **Corrigé** : Étendre `generationStore.ts` au lieu de créer nouveau
- ✅ **Corrigé** : Chemin API `/api/v1/dialogues/generate/stream` (cohérent)
- ✅ **Corrigé** : Chemin LLM `core/llm/llm_client.py` (correct)

**Story 0.3 (Multi-Provider LLM) :**
- ⚠️ **À vérifier** : `factories/llm_factory.py` existe-t-il déjà ?
- ⚠️ **À vérifier** : `services/llm/mistral_client.py` ou `core/llm/mistral_client.py` ?

**Story 0.4 (Presets) :**
- ⚠️ **À vérifier** : Système de sauvegarde/chargement existe-t-il déjà ?
- ⚠️ **À vérifier** : `localStorage` ou backend pour persistance ?

---


### Story 0.1: Fix Graph Editor stableID (ADR-003)

As a **développeur/utilisateur**,
I want **que les nœuds du graphe utilisent stableID (UUID) au lieu de displayName comme identifiant**,
So that **le graphe ne se corrompe pas lors du renommage de dialogues et que les connexions restent stables**.

**Acceptance Criteria:**

**Given** un dialogue existant avec des nœuds dans le graphe
**When** je renomme le dialogue (displayName change)
**Then** toutes les connexions parent/enfant restent intactes
**And** le graphe se charge correctement sans erreurs

**Given** un dialogue sans stableID (données legacy)
**When** le dialogue est chargé dans l'éditeur
**Then** un stableID (UUID) est généré automatiquement
**And** le dialogue est sauvegardé avec le nouveau stableID

**Given** un graphe avec plusieurs nœuds
**When** je crée une connexion entre deux nœuds
**Then** la connexion utilise les stableID des nœuds (pas displayName)
**And** la connexion persiste après sauvegarde/chargement

**Given** un dialogue avec displayName dupliqué
**When** le graphe est rendu
**Then** aucun conflit d'ID ne se produit (chaque nœud a un stableID unique)
**And** tous les nœuds sont visibles et éditables

**Technical Requirements:**
- Modifier `frontend/src/components/graph/GraphEditor.tsx` pour utiliser `node.id = dialogue.stableID`
- Créer fonction utilitaire `generateStableID()` si stableID manquant
- Script migration données existantes (backup + génération UUID)
- Tests unitaires : `generateStableID()` unicité
- Tests intégration : Graph serialization/deserialization
- Tests E2E : Renommer dialogue ne casse pas connexions

**References:** ADR-003 (Architecture Document), NFR-R1 (Zero Blocking Bugs)

---


---

### Story 0.2: Progress Feedback Modal avec SSE Streaming (ADR-001)

As a **utilisateur générant des dialogues**,
I want **voir la progression de la génération LLM en temps réel dans une modal avec streaming**,
So that **je ne pense pas que l'application est gelée et je peux interrompre si nécessaire**.

**Acceptance Criteria:**

**Given** je lance une génération de dialogue (single ou batch)
**When** la génération commence
**Then** une modal centrée s'affiche avec le titre "Génération en cours..."
**And** le texte généré par le LLM s'affiche en streaming (caractère par caractère)
**And** une barre de progression indique l'étape (Prompting → Generating → Validating → Complete)

**Given** la modal de progression est affichée
**When** je clique sur "Interrompre"
**Then** la génération est annulée proprement (timeout 10s max)
**And** la modal se ferme
**And** aucun dialogue partiel n'est sauvegardé

**Given** la génération est en cours
**When** je clique sur "Réduire" (icône minimize)
**Then** la modal se réduit en badge compact (coin écran)
**And** je peux continuer à travailler sur le graphe
**And** le badge affiche toujours la progression

**Given** la génération se termine (succès ou erreur)
**When** le résultat est disponible
**Then** la modal affiche "Génération terminée" avec bouton "Fermer"
**And** les nœuds générés sont ajoutés au graphe automatiquement
**And** la modal se ferme après 3 secondes ou clic utilisateur

**Technical Requirements:**
- Nouveau composant `frontend/src/components/generation/GenerationProgressModal.tsx`
- Zustand slice `useGenerationStore` pour état streaming
- API endpoint `/api/v1/generate/stream` avec SSE (Server-Sent Events)
- Backend : Streaming via `EventSource` (frontend) + `yield` (backend FastAPI)
- Actions : Interrompre (POST `/api/v1/generate/cancel`), Réduire (state local)
- Tests E2E : Modal s'affiche, streaming visible, interruption fonctionne

**References:** ADR-001 (Architecture Document), FR1-2 (génération single/batch), NFR-P2 (LLM Generation <30s)

---

### Story 0.3: Multi-Provider LLM avec abstraction Mistral (ADR-004)

As a **utilisateur générant des dialogues**,
I want **sélectionner le provider LLM (OpenAI ou Mistral) et le modèle via l'interface**,
So that **j'ai plus de flexibilité et je peux réduire ma dépendance à un seul provider**.

**Acceptance Criteria:**

**Given** je suis sur l'écran de génération
**When** j'ouvre le sélecteur de modèle
**Then** je vois deux providers : "OpenAI" (GPT-5.2) et "Mistral" (Small Creative)
**And** chaque provider affiche son modèle disponible avec icône distincte

**Given** je sélectionne "Mistral Small Creative"
**When** je lance une génération
**Then** le backend utilise `MistralClient` (au lieu de `OpenAIClient`)
**And** la génération fonctionne avec le même format de sortie (Unity JSON)
**And** le streaming SSE fonctionne identiquement

**Given** je change de provider pendant une session
**When** je sélectionne un autre provider
**Then** ma sélection est sauvegardée dans localStorage (préférence utilisateur)
**And** la prochaine génération utilise le provider sélectionné

**Given** le provider sélectionné est indisponible (erreur API)
**When** la génération échoue
**Then** un message d'erreur clair s'affiche ("Mistral API unavailable")
**And** l'utilisateur peut basculer vers OpenAI manuellement
**And** un fallback automatique n'est PAS implémenté (V1.0)

**Technical Requirements:**
- Backend : Interface `IGenerator` existante, nouveau `services/llm/mistral_client.py`
- Factory pattern : `LLMFactory.create(provider: str, model: str)` dans `factories/llm_factory.py`
- Configuration : `config/llm_config.json` définit providers + modèles disponibles
- Frontend : Composant `ModelSelector.tsx` avec dropdown providers/models
- Zustand store : `useLLMStore` pour sélection provider/model + localStorage persistence
- SDK Mistral : `mistralai` Python package, Chat Completions API, streaming natif
- Tests : Unit (factory retourne bon client), Integration (génération Mistral fonctionne), E2E (sélection provider)

**References:** ADR-004 (Architecture Document), FR72-79 (estimation coûts, logs, fallback provider), NFR-I2 (LLM API Reliability >99%)

---

### Story 0.10: Multi-Provider LLM avec OpenRouter (Extension ADR-004)

As a **utilisateur générant des dialogues**,
I want **accéder à une variété de modèles LLM via OpenRouter (en gardant OpenAI direct et Anthropic comme fallback)**,
So that **j'ai un large choix de modèles (Claude, GPT-4, Llama, Mistral, etc.) avec un seul point d'accès tout en conservant les providers directs pour la fiabilité**.

**Acceptance Criteria:**

**Given** je suis sur l'écran de génération
**When** j'ouvre le sélecteur de modèle
**Then** je vois trois providers : "OpenAI" (direct), "Mistral" (direct), et "OpenRouter" (multi-models)
**And** OpenRouter affiche les modèles disponibles (Claude, GPT-4, Llama, Mistral, etc.) avec leurs noms complets (ex: "openai/gpt-4-turbo", "anthropic/claude-3.5-sonnet")
**And** chaque provider affiche son icône distincte

**Given** je sélectionne un modèle OpenRouter (ex: "openai/gpt-4-turbo" ou "anthropic/claude-3.5-sonnet")
**When** je lance une génération
**Then** le backend utilise `OpenRouterClient` pour accéder au modèle via l'API OpenRouter
**And** la génération fonctionne avec le même format de sortie (Unity JSON)
**And** le streaming SSE fonctionne identiquement (format compatible OpenAI)
**And** les coûts sont trackés correctement (utiliser les prix OpenRouter pour facturation)

**Given** OpenRouter est indisponible ou le modèle sélectionné échoue
**When** la génération échoue avec OpenRouter
**Then** un message d'erreur clair s'affiche ("OpenRouter API unavailable" ou "Model unavailable on OpenRouter")
**And** l'utilisateur peut basculer manuellement vers OpenAI direct ou Mistral direct
**And** les providers directs (OpenAI, Mistral) restent disponibles indépendamment d'OpenRouter

**Given** j'ai configuré `OPENROUTER_API_KEY` dans les variables d'environnement
**When** j'ouvre le sélecteur de modèle
**Then** les modèles OpenRouter sont chargés depuis l'API OpenRouter (`GET /api/v1/models`)
**And** seuls les modèles accessibles avec ma clé API sont affichés (filtrage automatique)
**And** si la clé API est manquante, OpenRouter n'apparaît pas dans le sélecteur (pas d'erreur)

**Given** je sélectionne un modèle OpenRouter avec une clé API valide
**When** je lance une génération
**Then** le backend utilise l'authentification Bearer token (`Authorization: Bearer <OPENROUTER_API_KEY>`)
**And** la requête utilise l'endpoint OpenRouter `/api/v1/chat/completions` (format compatible OpenAI)
**And** le modèle est spécifié dans le champ `model` (ex: "openai/gpt-4-turbo")

**Technical Requirements:**
- Backend : Créer `core/llm/openrouter_client.py` implémentant `ILLMClient`
  - SDK : Utiliser `openai` SDK avec `base_url="https://openrouter.ai/api/v1"` et `api_key=OPENROUTER_API_KEY`
  - Format compatible : OpenRouter est compatible OpenAI API, donc réutiliser patterns `OpenAIClient`
  - Streaming : Support `stream=True` pour SSE (identique format OpenAI)
  - Structured output : Support via tool calling (compatible OpenAI, format identique)
  - Gestion erreurs : Messages clairs ("OpenRouter API unavailable", "Model unavailable on OpenRouter")
  - Méthode `get_max_tokens()` : Récupérer depuis métadonnées modèle OpenRouter (`GET /api/v1/models/:author/:slug/endpoints`)
- Factory : Étendre `factories/llm_factory.py` pour support `client_type="openrouter"`
  - Branche `elif client_type == "openrouter"` dans `create_client()`
  - Récupérer clé API : `config.get("openrouter_api_key_env_var")` ou `OPENROUTER_API_KEY`
  - Créer `OpenRouterClient` avec config compatible (api_key, model, temperature, max_tokens)
  - Gestion erreurs : Si clé API manquante → DummyLLMClient avec warning
- Configuration : Étendre `config/llm_config.json` pour modèles OpenRouter
  - Ajouter champ `openrouter_api_key_env_var: "OPENROUTER_API_KEY"` (niveau config global)
  - Ajouter modèles OpenRouter dans `available_models` (liste d'objets)
  - Modèles exemple : `{"api_identifier": "openai/gpt-4-turbo", "display_name": "GPT-4 Turbo (via OpenRouter)", "client_type": "openrouter", "parameters": {"default_temperature": 0.7, "max_tokens": 128000}}`
  - Note : Les modèles OpenRouter utilisent le format `provider/model-slug` (ex: "anthropic/claude-3.5-sonnet")
- Frontend : Étendre `ModelSelector.tsx` pour afficher modèles OpenRouter
  - Ajouter groupe "OpenRouter" dans le dropdown (après "OpenAI" et "Mistral")
  - Charger modèles depuis API backend : `ConfigurationService.get_available_llm_models()` retourne modèles OpenRouter
  - Affichage : Afficher `display_name` avec indication "(via OpenRouter)" pour clarté
  - Icône : Logo OpenRouter ou icône générique pour multi-provider
- API Backend : Endpoint pour charger modèles OpenRouter (optionnel, pour rafraîchissement dynamique)
  - Endpoint `/api/v1/llm/models/openrouter` (GET) appelle `GET /api/v1/models` OpenRouter
  - Cache : Mettre en cache les modèles OpenRouter (1 heure) pour éviter appels répétés
  - Filtrage : Retourner uniquement les modèles accessibles avec clé API (gérer erreurs 401/403)
- Tests : Unit (OpenRouterClient génère variantes), Integration (génération OpenRouter fonctionne), E2E (sélection modèle OpenRouter)
- Documentation : Mettre à jour `README.md` avec instructions configuration `OPENROUTER_API_KEY`

**Dev Notes:**

**Architecture Patterns (Extension Story 0.3):**
- **Interface commune** : `ILLMClient` (EXISTANT) - `OpenRouterClient` implémente même interface que `OpenAIClient` et `MistralClient`
- **Format compatible OpenAI** : OpenRouter utilise exactement le même format que OpenAI API, donc `OpenRouterClient` peut hériter de la logique `OpenAIClient` avec `base_url` différent
- **Factory Pattern** : Extension `factories/llm_factory.py` avec branche `elif client_type == "openrouter"`
- **Configuration** : Extension `config/llm_config.json` avec modèles OpenRouter (format `provider/model-slug`)

**OpenRouter API Specifics:**
- **Authentification** : Bearer token `Authorization: Bearer <OPENROUTER_API_KEY>` (identique OpenAI)
- **Base URL** : `https://openrouter.ai/api/v1` (pas `https://api.openai.com/v1`)
- **Endpoint chat** : `/api/v1/chat/completions` (format identique OpenAI, messages + parameters)
- **Streaming** : `stream=True` retourne SSE identique OpenAI (`data: {"choices": [{"delta": {"content": "..."}}]}`)
- **Liste modèles** : `GET /api/v1/models` retourne liste modèles accessibles avec clé API
- **Modèle identifier** : Format `provider/model-slug` (ex: "openai/gpt-4-turbo", "anthropic/claude-3.5-sonnet")
- **Structured output** : Support via tool calling (identique OpenAI, fonctionne avec OpenRouter)

**Fallback Strategy:**
- **Pas de fallback automatique** : Si OpenRouter échoue, l'utilisateur doit basculer manuellement vers OpenAI/Mistral direct
- **Raison** : Éviter la complexité de la détection d'erreur et du fallback automatique (peut masquer des problèmes)
- **V1.0** : Focus sur support OpenRouter + providers directs (OpenAI, Mistral) comme alternatives manuelles

**Réutilisation Code:**
- **Pattern OpenAIClient** : OpenRouter étant compatible OpenAI, `OpenRouterClient` peut réutiliser la logique `OpenAIClient` avec `base_url` et `api_key` différents
- **Alternative** : Créer `OpenRouterClient` indépendant mais suivant même structure que `OpenAIClient` (pour clarté)

**References:** ADR-004 (Architecture Document - Multi-Provider LLM), Story 0.3 (Mistral implementation), OpenRouter API Documentation (https://openrouter.ai/docs)

---

### Story 0.4: Presets système (ADR-002)

As a **utilisateur créant des dialogues**,
I want **sauvegarder et charger rapidement des configurations de génération (personnages, lieux, instructions)**,
So that **je réduis la friction cold start de 10+ clics à 1 clic**.

**Acceptance Criteria:**

**Given** j'ai configuré un contexte de génération (personnages sélectionnés, lieux, région, instructions)
**When** je clique sur "Sauvegarder comme preset"
**Then** une modal s'ouvre me demandant un nom, une icône emoji, et un aperçu optionnel
**And** après sauvegarde, le preset apparaît dans le dropdown "Presets"

**Given** j'ai créé plusieurs presets
**When** j'ouvre le dropdown "Presets"
**Then** je vois tous mes presets avec nom, icône emoji, et aperçu (personnages/lieux)
**And** je peux sélectionner un preset en 1 clic

**Given** je sélectionne un preset
**When** le preset est chargé
**Then** tous les champs de contexte sont pré-remplis (personnages, lieux, région, instructions)
**And** je peux immédiatement lancer une génération sans reconfiguration

**Given** un preset référence un personnage/lieu qui n'existe plus dans le GDD
**When** je charge le preset
**Then** un warning s'affiche listant les références obsolètes
**And** j'ai l'option "Charger quand même" (les références obsolètes sont ignorées)
**And** les champs valides sont chargés normalement

**Given** je modifie un preset existant
**When** je sauvegarde
**Then** le preset est mis à jour (pas de duplication)
**And** je peux supprimer un preset via menu contextuel

**Technical Requirements:**
- Backend : API `/api/v1/presets` (GET liste, POST créer, PUT mettre à jour, DELETE supprimer)
- Service : `services/preset_service.py` pour logique métier (validation références GDD)
- Stockage : Fichiers JSON locaux `data/presets/*.json` + API backend (sync)
- Frontend : Composant `PresetSelector.tsx` avec dropdown + modal création/édition
- Zustand store : `usePresetStore` pour liste presets + chargement
- Validation : `ID-005` (Preset validation) - vérifier références GDD avant chargement
- Tests : Unit (validation références), Integration (CRUD presets), E2E (créer/charger preset)

**References:** ADR-002 (Architecture Document), FR55-63 (templates), ID-005 (Preset validation), NFR-P3 (API Response <200ms)

---

### Story 0.5: Auto-save dialogues (ID-001)

As a **utilisateur éditant des dialogues**,
I want **que mes modifications soient sauvegardées automatiquement toutes les 2 minutes**,
So that **je ne perds jamais mon travail même en cas de crash ou fermeture accidentelle**.

**Acceptance Criteria:**

**Given** je modifie un dialogue (ajout nœud, édition texte, connexion)
**When** 2 minutes s'écoulent sans sauvegarde manuelle
**Then** le dialogue est sauvegardé automatiquement en arrière-plan
**And** un indicateur visuel "Sauvegardé il y a Xs" s'affiche dans l'UI
**And** aucune interruption de mon travail (pas de modal, pas de freeze)

**Given** une génération LLM est en cours
**When** le timer auto-save atteint 2 minutes
**Then** l'auto-save est suspendu (pas de sauvegarde pendant génération)
**And** l'auto-save reprend après la fin de la génération

**Given** je sauvegarde manuellement (Ctrl+S)
**When** la sauvegarde réussit
**Then** le timer auto-save est réinitialisé (prochaine sauvegarde dans 2min)
**And** l'indicateur "Sauvegardé il y a Xs" se met à jour

**Given** deux modifications simultanées (conflit Last-Write-Wins)
**When** l'auto-save sauvegarde
**Then** la dernière modification écrasant la précédente (pas de merge)
**And** aucun dialogue n'est corrompu (format JSON valide)

**Given** je ferme l'application sans sauvegarder manuellement
**When** je rouvre l'application
**Then** mes modifications des 2 dernières minutes sont récupérées (session recovery)
**And** un message "Modifications non sauvegardées récupérées" s'affiche

**Technical Requirements:**
- Backend : Endpoint `/api/v1/dialogues/{id}/autosave` (POST) avec stratégie LWW
- Service : `services/autosave_service.py` pour logique timer + suspension pendant génération
- Frontend : Hook `useAutoSave` avec `setInterval` 2min + état "saving/saved/error"
- Zustand store : `useDialogueStore` pour état dialogue + flag "hasUnsavedChanges"
- Session recovery : localStorage backup + restauration au démarrage
- Tests : Unit (timer fonctionne), Integration (auto-save API), E2E (session recovery)

**References:** ID-001 (Architecture Document), FR95-101 (session management), NFR-R3 (Data Loss Prevention 100%)

---

### Story 0.5.5: Génération next node avec gestion automatique des connexions

As a **utilisateur créant des dialogues dans l'éditeur de graphe OU dans l'éditeur de dialogue**,
I want **générer la suite d'un dialogue (next node) pour un choix de réponse spécifique ou pour tous les choix d'un coup**,
So that **je peux rapidement construire des arbres de dialogue complets avec toutes les connexions (targetNode/nextNode) gérées automatiquement par le logiciel, que je travaille dans l'éditeur de graphe ou dans l'éditeur de dialogue**.

**Acceptance Criteria:**

**Given** je suis dans l'éditeur de graphe et je sélectionne un nœud de dialogue PNJ qui contient plusieurs réponses PJ (choices)
**When** je sélectionne une réponse PJ spécifique (choice) et je lance "Générer la suite pour ce choix"
**Then** un nouveau nœud de dialogue PNJ est généré par l'IA
**And** le champ `targetNode` de la réponse PJ sélectionnée est automatiquement rempli avec l'ID du nouveau nœud généré
**And** le nouveau nœud est ajouté au graphe à une position logique (à droite du parent, légèrement décalé verticalement)
**And** une connexion visuelle (edge) est créée automatiquement entre le choix et le nouveau nœud

**Given** je suis dans l'éditeur de dialogue et je sélectionne un nœud de dialogue PNJ qui contient plusieurs réponses PJ (choices)
**When** je sélectionne une réponse PJ spécifique (choice) dans le panneau d'édition et je lance "Générer la suite pour ce choix"
**Then** un nouveau nœud de dialogue PNJ est généré par l'IA
**And** le champ `targetNode` de la réponse PJ sélectionnée est automatiquement rempli avec l'ID du nouveau nœud généré
**And** les connexions sont gérées automatiquement identiquement à l'éditeur de graphe
**And** après génération, je suis redirigé vers le nouveau nœud généré (focus automatique dans l'éditeur de dialogue)

**Given** je suis dans l'éditeur de graphe et je sélectionne un nœud de dialogue PNJ qui contient plusieurs réponses PJ (choices) dont aucune n'a de `targetNode` défini
**When** je lance "Générer la suite pour tous les choix"
**Then** un nouveau nœud de dialogue PNJ est généré par l'IA pour chaque réponse PJ sans `targetNode`
**And** chaque nouveau nœud est positionné dans le graphe de manière organisée (en cascade verticale, à droite du parent)
**And** chaque champ `targetNode` des réponses PJ est automatiquement rempli avec l'ID du nœud correspondant
**And** toutes les connexions visuelles (edges) sont créées automatiquement
**And** les nœuds sont générés séquentiellement ou en batch (selon configuration) avec indicateur de progression

**Given** je suis dans l'éditeur de dialogue et je sélectionne un nœud de dialogue PNJ qui contient plusieurs réponses PJ (choices) dont aucune n'a de `targetNode` défini
**When** je lance "Générer la suite pour tous les choix" depuis le panneau d'édition
**Then** un nouveau nœud de dialogue PNJ est généré par l'IA pour chaque réponse PJ sans `targetNode`
**And** chaque champ `targetNode` des réponses PJ est automatiquement rempli avec l'ID du nœud correspondant
**And** les connexions sont gérées automatiquement identiquement à l'éditeur de graphe
**And** les nœuds sont générés séquentiellement ou en batch avec indicateur de progression dans la modal
**And** après génération, je suis redirigé vers le premier nouveau nœud généré (focus automatique)

**Given** je suis dans l'éditeur de graphe et je sélectionne un nœud de dialogue PNJ sans choix (navigation linéaire)
**When** je lance "Générer la suite (nextNode)"
**Then** un nouveau nœud de dialogue PNJ est généré par l'IA
**And** le champ `nextNode` du nœud parent est automatiquement rempli avec l'ID du nouveau nœud généré
**And** le nouveau nœud est ajouté au graphe à une position logique (à droite du parent)
**And** une connexion visuelle (edge) est créée automatiquement entre le parent et le nouveau nœud

**Given** je suis dans l'éditeur de dialogue et je sélectionne un nœud de dialogue PNJ sans choix (navigation linéaire)
**When** je lance "Générer la suite (nextNode)" depuis le panneau d'édition
**Then** un nouveau nœud de dialogue PNJ est généré par l'IA
**And** le champ `nextNode` du nœud parent est automatiquement rempli avec l'ID du nouveau nœud généré
**And** les connexions sont gérées automatiquement identiquement à l'éditeur de graphe
**And** après génération, je suis redirigé vers le nouveau nœud généré (focus automatique)

**Given** je génère plusieurs nœuds depuis un même parent (génération multi-choix), que ce soit depuis l'éditeur de graphe ou l'éditeur de dialogue
**When** les nœuds sont générés
**Then** chaque nouveau nœud reçoit un ID unique et stable (format cohérent)
**And** les références `targetNode` et `nextNode` pointent vers les bons IDs
**And** aucune référence orpheline n'est créée (toutes les références pointent vers des nœuds existants)
**And** l'ordre logique des connexions est respecté (les nœuds se suivent dans l'ordre de génération)

**Given** je génère la suite d'un dialogue avec des choix déjà connectés à d'autres nœuds, que ce soit depuis l'éditeur de graphe ou l'éditeur de dialogue
**When** je lance "Générer la suite pour tous les choix"
**Then** seuls les choix sans `targetNode` (ou avec `targetNode="END"`) génèrent de nouveaux nœuds
**And** les choix déjà connectés ne sont pas modifiés
**And** un message indique "X choix(s) déjà connecté(s), Y nouveau(x) nœud(s) généré(s)"

**Technical Requirements:**
- Backend : Étendre endpoint `/api/v1/graph/generate-node` pour support choix spécifique
  - Nouveau paramètre optionnel `target_choice_index: Optional[int]` pour générer pour un choix spécifique
  - Nouveau paramètre optionnel `generate_all_choices: bool = False` pour générer tous les choix en batch
  - Modifier logique connexions suggérées : si `target_choice_index` fourni, connecter explicitement ce choix
  - Si `generate_all_choices=True`, générer plusieurs nœuds et retourner liste avec connexions
- Backend : Service `services/graph_generation_service.py` pour logique batch génération multi-choix
  - Fonction `generate_nodes_for_all_choices(parent_node, instructions, context)` → liste nœuds + connexions
  - Gestion automatique IDs : générer IDs uniques pour chaque nœud (format `NODE_{parent_id}_CHOICE_{index}`)
  - Gestion automatique connexions : remplir `targetNode` dans les choix du parent, créer `suggested_connections`
- Frontend : Étendre `AIGenerationPanel.tsx` pour support génération choix spécifique
  - Nouveau mode sélection : "Générer pour ce choix" (visible quand parent a des choix)
  - Nouveau bouton "Générer la suite pour tous les choix" (visible quand parent a plusieurs choix sans targetNode)
  - Indicateur de progression si génération batch (plusieurs nœuds)
- Frontend : Étendre `graphStore.ts` méthode `generateFromNode` pour support batch
  - Nouveau paramètre `targetChoiceIndex?: number` pour choix spécifique
  - Nouveau paramètre `generateAllChoices?: boolean` pour génération batch
  - Gestion automatique connexions : après génération, mettre à jour `targetNode` dans le parent automatiquement
  - Positionnement automatique : calculer positions en cascade pour batch génération
- Frontend : Étendre `NodeEditorPanel.tsx` pour support génération depuis éditeur de dialogue
  - Bouton "Générer la suite" pour nœud sélectionné (visible dans panneau édition)
  - Menu contextuel choix : "Générer suite pour ce choix" (si parent a des choix)
  - Bouton "Générer la suite pour tous les choix" (visible quand parent a plusieurs choix sans targetNode)
  - Intégration même logique que `AIGenerationPanel.tsx` (réutilisation code génération)
  - Support génération choix spécifique (`targetChoiceIndex`) et batch (`generateAllChoices`)
  - Gestion automatique connexions identique à éditeur de graphe (mettre à jour `targetNode`/`nextNode`)
  - Focus automatique vers nouveau nœud généré après génération
- Frontend : Éditeur de dialogue - S'assurer que toutes les fonctionnalités de génération sont disponibles
  - Même UX que éditeur de graphe : modal progression, streaming, indicateur batch
  - Même gestion connexions automatiques : `targetNode` et `nextNode` remplis automatiquement
  - Navigation après génération : focus vers nouveau nœud (équivalent zoom graphe)
- Validation : Vérifier que toutes les références `targetNode` et `nextNode` pointent vers des nœuds existants après génération (depuis les deux interfaces)
- Tests : Unit (génération choix spécifique), Integration (génération batch multi-choix), E2E (génération depuis éditeur de graphe + E2E depuis éditeur de dialogue)
- Documentation : Mettre à jour `GRAPH_EDITOR.md` avec workflow génération next node

**Dev Notes:**

**Architecture Patterns (Extension Story 0.2):**
- **Réutilisation existante** : Étendre `generateFromNode` existant au lieu de créer nouveau endpoint
- **Gestion automatique connexions** : Le backend retourne `suggested_connections`, le frontend doit appliquer automatiquement (actuellement c'est suggéré, ici c'est obligatoire)
- **Format IDs** : Respecter format existant pour IDs (`NODE_{parent_id}_CHILD` → `NODE_{parent_id}_CHOICE_{index}` pour choix spécifique)

**Gestion automatique connexions :**
- **Backend** : Retourner `suggested_connections` avec flag `auto_apply: true` pour différencier des suggestions manuelles
- **Frontend** : Si `auto_apply: true`, appliquer connexion automatiquement (mettre à jour `targetNode` dans parent, créer edge)
- **Positionnement** : Calculer positions en cascade verticale pour batch (offset Y = 150 * index_choice)

**Génération batch multi-choix :**
- **Séquentielle** : Générer un nœud à la fois (plus simple, feedback progressif)
- **Alternative future** : Génération parallèle si nécessaire (optimisation)
- **Progression** : Afficher "Génération 2/5..." dans modal progression si batch

**Intégration éditeur dialogue (OBLIGATOIRE - Égale priorité avec éditeur de graphe) :**
- **Parité fonctionnelle** : Toutes les fonctionnalités de génération doivent être disponibles dans l'éditeur de dialogue ET l'éditeur de graphe
  - Génération pour choix spécifique (disponible dans les deux interfaces)
  - Génération batch pour tous les choix (disponible dans les deux interfaces)
  - Génération nextNode pour navigation linéaire (disponible dans les deux interfaces)
- **Réutilisation code** : Utiliser même logique `generateFromNode` que graphe (éviter duplication)
  - Même appel API backend (`/api/v1/graph/generate-node`)
  - Même gestion connexions automatiques (mettre à jour `targetNode`/`nextNode`)
  - Même modal progression et streaming
- **UX cohérente** : Même expérience utilisateur dans les deux interfaces
  - Modal progression identique (même design, même indicateurs)
  - Streaming identique (même feedback temps réel)
  - Indicateur batch identique ("Génération 2/5..." si applicable)
- **Focus automatique** : Après génération, sélectionner et naviguer vers nouveau nœud généré
  - Éditeur de graphe : Zoom vers nouveau nœud généré
  - Éditeur de dialogue : Focus sur nouveau nœud dans la liste/panneau d'édition
- **Tests obligatoires** : Tous les tests E2E doivent couvrir les deux interfaces (graphe + dialogue)

**References:** Story 0.2 (Progress Modal SSE), ADR-003 (Graph Fix stableID), FR15-25 (génération dialogues avec choix)

---

### Story 0.6: Validation cycles graphe (ID-002)

As a **utilisateur créant des dialogues**,
I want **être averti si mon graphe contient des cycles (boucles)**,
So that **je peux décider consciemment si les cycles sont intentionnels (dialogues récursifs) ou des erreurs**.

**Acceptance Criteria:**

**Given** un graphe de dialogue avec un cycle (nœud A → B → C → A)
**When** je sauvegarde ou lance une validation
**Then** un warning non-bloquant s'affiche "Cycle détecté : A → B → C → A"
**And** les nœuds du cycle sont surlignés dans le graphe (couleur orange)
**And** je peux continuer à travailler (pas de blocage)

**Given** un graphe avec plusieurs cycles
**When** la validation détecte les cycles
**Then** tous les cycles sont listés dans le warning
**And** chaque cycle est cliquable pour zoomer sur les nœuds concernés

**Given** un cycle intentionnel (dialogue récursif "Boucle de conversation")
**When** je vois le warning
**Then** je peux marquer le cycle comme "intentionnel" (checkbox)
**And** le warning ne réapparaît plus pour ce cycle spécifique
**And** le cycle est toujours validé structurellement (pas d'erreur)

**Given** un graphe sans cycles
**When** je lance une validation
**Then** aucun warning cycle n'est affiché
**And** la validation structurelle continue normalement (orphans, START, etc.)

**Technical Requirements:**
- Backend : Service `services/validation_service.py` avec fonction `detect_cycles(graph)` (algorithme DFS)
- API : Endpoint `/api/v1/dialogues/{id}/validate` retourne `{cycles: [...], orphans: [...], ...}`
- Frontend : Composant `ValidationPanel.tsx` affiche warnings cycles avec highlight graphe
- Algorithme : DFS (Depth-First Search) pour détecter cycles dans graphe orienté
- Highlight : React Flow `node.style` pour surligner nœuds cycles (couleur orange)
- Tests : Unit (détection cycles), Integration (validation API), E2E (warning affiché)

**References:** ID-002 (Architecture Document), FR36-48 (validation structurelle), NFR-R1 (Zero Blocking Bugs)

---

### Story 0.7: Cost governance (ID-003)

As a **utilisateur générant des dialogues avec LLM**,
I want **configurer un budget LLM avec limite soft (90%) et limite hard (100%)**,
So that **je ne dépasse jamais mon budget et je suis averti avant d'atteindre la limite**.

**Acceptance Criteria:**

**Given** je configure un budget LLM (ex: 100€/mois) dans les paramètres
**When** j'atteins 90% du budget (90€ dépensés)
**Then** un warning s'affiche "Budget atteint à 90% - 10€ restants"
**And** je peux continuer à générer (pas de blocage, juste avertissement)

**Given** j'atteins 100% du budget (100€ dépensés)
**When** je tente de lancer une génération
**Then** la génération est bloquée avec message "Budget dépassé - Veuillez augmenter le budget ou attendre le prochain mois"
**And** aucun appel LLM n'est effectué (protection financière)

**Given** je consulte le dashboard de coûts
**When** j'ouvre la section "Usage LLM"
**Then** je vois le budget total, le montant dépensé, le pourcentage utilisé, et les coûts par génération
**And** un graphique montre l'évolution des coûts sur le mois

**Given** je change de provider LLM (OpenAI → Mistral)
**When** les coûts sont calculés
**Then** les coûts Mistral sont trackés séparément (ou agrégés selon configuration)
**And** le budget global s'applique à tous les providers

**Technical Requirements:**
- Backend : Service `services/cost_governance_service.py` pour calcul coûts + vérification budgets
- API : Endpoints `/api/v1/costs/budget` (GET/PUT), `/api/v1/costs/usage` (GET avec graphique)
- Base de données : Table `cost_logs` (timestamp, provider, model, tokens, cost, dialogue_id)
- Frontend : Composant `CostDashboard.tsx` avec graphique + indicateurs budget
- Validation : Avant chaque génération, vérifier budget (soft warning 90%, hard block 100%)
- Tests : Unit (calcul coûts), Integration (budget enforcement), E2E (warning/block affichés)

**References:** ID-003 (Architecture Document), FR72-79 (estimation coûts, logs), NFR-S1 (API Key Protection - coûts backend uniquement)

---

### Story 0.8: Streaming cleanup (ID-004)

As a **utilisateur interrompant une génération LLM**,
I want **que l'interruption soit propre avec timeout de 10 secondes maximum**,
So that **les ressources backend sont libérées rapidement et l'UI reste réactive**.

**Acceptance Criteria:**

**Given** une génération LLM est en cours (streaming SSE actif)
**When** je clique sur "Interrompre" dans la modal de progression
**Then** un signal d'annulation est envoyé au backend (POST `/api/v1/generate/cancel`)
**And** le backend arrête le streaming dans les 10 secondes maximum
**And** la modal se ferme avec message "Génération interrompue"

**Given** le backend reçoit un signal d'annulation
**When** le streaming est interrompu
**Then** toutes les ressources sont libérées (connexions SSE fermées, tokens LLM annulés si possible)
**And** aucun dialogue partiel n'est sauvegardé
**And** les logs indiquent "Génération annulée par utilisateur"

**Given** le backend ne répond pas à l'annulation dans les 10 secondes
**When** le timeout est atteint
**Then** la connexion SSE est fermée côté frontend (force close)
**And** un message "Interruption en cours..." puis "Interruption terminée" s'affiche
**And** l'UI reste réactive (pas de freeze)

**Given** une génération se termine normalement (succès)
**When** le streaming se termine
**Then** toutes les ressources sont nettoyées automatiquement dans les 10 secondes
**And** la modal affiche "Génération terminée" puis se ferme

**Technical Requirements:**
- Backend : Endpoint `/api/v1/generate/cancel` (POST) avec flag `cancelled` dans état génération
- Service : `services/generation_service.py` vérifie flag `cancelled` à chaque chunk streaming
- Timeout : 10 secondes maximum pour cleanup (configurable)
- Frontend : `EventSource.close()` si timeout, gestion erreurs réseau
- Logs : Événement "generation_cancelled" avec timestamp + durée génération
- Tests : Unit (timeout fonctionne), Integration (annulation API), E2E (interruption propre)

**References:** ID-004 (Architecture Document), ADR-001 (Progress Modal), NFR-R4 (Error Recovery LLM >95%)

---

### Story 0.9: Preset validation (ID-005)

As a **utilisateur chargeant un preset**,
I want **être averti si le preset référence des personnages/lieux qui n'existent plus dans le GDD**,
So that **je peux décider de charger le preset quand même ou le mettre à jour**.

**Acceptance Criteria:**

**Given** un preset sauvegardé référence le personnage "Akthar" et le lieu "Port de Valdris"
**When** je charge le preset après que "Akthar" ait été supprimé du GDD
**Then** un warning modal s'affiche "Références obsolètes détectées : Personnage 'Akthar'"
**And** le lieu "Port de Valdris" est chargé normalement (référence valide)
**And** j'ai deux options : "Charger quand même" ou "Annuler"

**Given** je clique sur "Charger quand même"
**When** le preset est chargé
**Then** les références obsolètes sont ignorées (champs vides)
**And** les références valides sont chargées (personnages/lieux existants)
**And** un message "Preset chargé avec 1 référence obsolète ignorée" s'affiche

**Given** je clique sur "Annuler"
**When** je ferme le warning
**Then** le preset n'est pas chargé
**And** je reste sur l'écran de sélection de preset

**Given** un preset avec toutes les références valides
**When** je charge le preset
**Then** aucun warning n'est affiché
**And** le preset est chargé immédiatement

**Given** je modifie un preset avec références obsolètes
**When** je sauvegarde le preset
**Then** les références obsolètes sont supprimées automatiquement du preset
**And** un message "Preset mis à jour - références obsolètes supprimées" s'affiche

**Technical Requirements:**
- Backend : Service `services/preset_service.py` avec fonction `validate_preset_references(preset, gdd_data)`
- Validation : Vérifier personnages/lieux/régions référencés existent dans GDD actuel
- API : Endpoint `/api/v1/presets/{id}/validate` retourne `{valid: bool, obsolete_refs: [...]}`
- Frontend : Composant `PresetValidationModal.tsx` affiche warning + options "Charger quand même" / "Annuler"
- Auto-cleanup : Lors de la sauvegarde preset, supprimer références obsolètes automatiquement
- Tests : Unit (validation références), Integration (warning API), E2E (charger preset avec obsolètes)

**References:** ID-005 (Architecture Document), ADR-002 (Presets système), FR55-63 (templates)
