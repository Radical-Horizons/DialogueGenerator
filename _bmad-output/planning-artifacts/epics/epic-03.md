## Epic 3: Gestion du contexte narratif (GDD)

Les utilisateurs peuvent explorer, sélectionner et utiliser le Game Design Document (500+ pages) pour enrichir la génération de dialogues. Le système permet le browse des entités (personnages, lieux, régions), sélection manuelle/automatique, règles de contexte, budget tokens, et sync Notion (V2.0+).

**FRs covered:** FR11-21 (browse GDD, sélection, règles contexte, budget tokens, sync Notion)

**NFRs covered:** NFR-P3 (API Response <200ms pour context selection), NFR-I3 (Notion Integration V2.0+)

**Valeur utilisateur:** Garantir cohérence narrative en injectant automatiquement le lore pertinent dans les prompts LLM.

**Dépendances:** Epic 0 (infrastructure), requis par Epic 1 (génération nécessite contexte)

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

### Story 3.1: Parcourir entités GDD disponibles (personnages, lieux, régions, thèmes) (FR11)

As a **utilisateur créant des dialogues**,
I want **parcourir les entités GDD disponibles (personnages, lieux, régions, thèmes)**,
So that **je peux découvrir et sélectionner le contexte narratif pertinent pour mes dialogues**.

**Acceptance Criteria:**

**Given** je suis sur l'écran de sélection de contexte
**When** j'ouvre le panneau "Contexte GDD"
**Then** je vois des onglets pour chaque type d'entité : Personnages, Lieux, Régions, Objets, Espèces, Communautés, Thèmes
**And** chaque onglet affiche la liste des entités disponibles avec nom et aperçu (résumé)

**Given** je parcours la liste des personnages
**When** je scroll dans la liste
**Then** la liste se charge progressivement (pagination ou virtualisation pour 500+ entités)
**And** chaque personnage affiche : nom, aperçu (résumé), icône si disponible
**And** la recherche fonctionne en temps réel (filtre par nom)

**Given** je sélectionne une entité (personnage, lieu, etc.)
**When** je clique sur une entité
**Then** un panneau de détails s'affiche avec : nom complet, résumé, sections GDD pertinentes
**And** je peux voir le contenu complet de l'entité (expand/collapse sections)

**Given** je recherche une entité spécifique
**When** je saisis un nom dans la barre de recherche
**Then** les résultats sont filtrés en temps réel (pas besoin de valider)
**And** les résultats affichent le type d'entité (badge "Personnage", "Lieu", etc.)

**Given** je consulte les entités GDD
**When** le GDD est très volumineux (500+ pages)
**Then** le chargement initial se fait en <200ms (NFR-P3)
**And** la navigation reste fluide (<100ms latence)

**Technical Requirements:**
- Backend : Endpoints `/api/v1/context/characters` (GET), `/locations` (GET), `/regions` (GET), etc. avec pagination
- Service : `ContextBuilder.get_characters()`, `get_locations()`, `get_regions()` (existant)
- Frontend : Composant `GDDEntityBrowser.tsx` avec onglets + liste virtualisée (react-window)
- Recherche : Filtrage côté frontend (debounce 300ms) + recherche backend si nécessaire
- Détails : Modal `EntityDetailsModal.tsx` avec contenu GDD formaté (sections expand/collapse)
- Tests : Unit (browse entités), Integration (API context), E2E (workflow browse)

**References:** FR11 (browse GDD entities), NFR-P3 (API Response <200ms), Story 3.2 (sélection manuelle)

---

### Story 3.2: Sélectionner manuellement contexte GDD pertinent (FR12)

As a **utilisateur créant des dialogues**,
I want **sélectionner manuellement le contexte GDD pertinent pour la génération**,
So that **je peux contrôler précisément quelles informations sont injectées dans le prompt LLM**.

**Acceptance Criteria:**

**Given** je parcours les entités GDD (voir Story 3.1)
**When** je clique sur une entité (personnage, lieu, etc.)
**Then** l'entité est ajoutée à ma sélection de contexte
**And** un indicateur visuel s'affiche "X entités sélectionnées"
**And** l'entité apparaît dans le panneau "Sélection actuelle"

**Given** je sélectionne une entité
**When** je sélectionne l'entité
**Then** je peux choisir le mode d'inclusion : "Complet" (toutes sections) ou "Extrait" (résumé uniquement)
**And** le mode est sauvegardé avec la sélection

**Given** j'ai sélectionné plusieurs entités
**When** je consulte ma sélection
**Then** je vois toutes les entités sélectionnées groupées par type (Personnages, Lieux, etc.)
**And** je peux supprimer une entité de la sélection (bouton X)
**And** je peux changer le mode d'une entité (Complet ↔ Extrait)

**Given** je sélectionne un lieu
**When** le lieu est sélectionné
**Then** le système suggère automatiquement la région associée (voir Story 3.4)
**And** je peux accepter ou rejeter la suggestion

**Given** je lance une génération avec contexte sélectionné
**When** la génération commence
**Then** le contexte sélectionné est inclus dans le prompt LLM
**And** les entités en mode "Complet" incluent toutes les sections GDD
**And** les entités en mode "Extrait" incluent uniquement le résumé

**Technical Requirements:**
- Frontend : Composant `ContextSelector.tsx` avec checkboxes entités + modes (full/excerpt)
- Store : `useContextStore` avec méthodes `addEntity(type, name, mode)`, `removeEntity(type, name)`, `getSelections()`
- Backend : Intégration avec `ContextBuilder.build_context()` (existant) avec `selected_elements` dict
- Modes : Support `characters_full`, `characters_excerpt`, `locations_full`, `locations_excerpt`, etc. (existant dans API)
- Suggestion : Integration avec Story 3.4 (suggestions automatiques) pour région associée
- Tests : Unit (sélection logique), Integration (API context), E2E (workflow sélection)

**References:** FR12 (sélection manuelle), Story 3.1 (browse entités), Story 3.4 (suggestions automatiques), Story 1.1 (génération)

---

### Story 3.3: Suggestions automatiques contexte GDD basées sur règles (FR13)

As a **utilisateur créant des dialogues**,
I want **que le système suggère automatiquement le contexte GDD pertinent basé sur des règles configurées**,
So that **je peux accélérer la sélection de contexte sans parcourir manuellement toutes les entités**.

**Acceptance Criteria:**

**Given** j'ai configuré des règles de sélection de contexte (voir Story 3.5)
**When** je sélectionne un lieu dans le contexte
**Then** le système suggère automatiquement : la région du lieu, les personnages associés au lieu, les thèmes du lieu
**And** les suggestions apparaissent dans un panneau "Suggestions" avec boutons "Accepter" / "Ignorer"

**Given** je sélectionne un personnage
**When** le personnage est sélectionné
**Then** le système suggère automatiquement : les lieux fréquentés, les autres personnages liés, les communautés d'appartenance
**And** les suggestions sont basées sur les relations GDD (liens entre entités)

**Given** j'accepte une suggestion
**When** je clique sur "Accepter" pour une suggestion
**Then** l'entité suggérée est ajoutée à ma sélection
**And** la suggestion disparaît du panneau (pas de doublon)

**Given** j'ignore une suggestion
**When** je clique sur "Ignorer"
**Then** la suggestion disparaît (pas ajoutée à la sélection)
**And** la suggestion ne réapparaît pas pour cette session

**Given** les suggestions sont nombreuses (10+)
**When** le panneau de suggestions s'affiche
**Then** les suggestions sont groupées par type (Personnages, Lieux, etc.)
**And** je peux accepter/ignorer toutes les suggestions d'un type en une action (bouton "Accepter tout" / "Ignorer tout")

**Technical Requirements:**
- Backend : Service `LinkedSelectorService.get_linked_elements()` (existant) pour relations GDD
- Service : `ContextSuggestionService` avec logique suggestions basée sur règles (Story 3.5)
- Frontend : Composant `ContextSuggestionsPanel.tsx` avec liste suggestions + actions accepter/ignorer
- Relations : Utiliser `get_linked_elements(character_name, location_names)` pour trouver entités liées
- Store : `useContextStore` avec méthodes `acceptSuggestion(suggestion)`, `ignoreSuggestion(suggestion)`
- Tests : Unit (logique suggestions), Integration (API suggestions), E2E (workflow suggestions)

**References:** FR13 (suggestions automatiques), Story 3.5 (règles contexte), Story 3.2 (sélection manuelle), Story 3.4 (règles explicites)

---

### Story 3.4: Définir règles explicites de sélection contexte (lieu → région → personnages → thème) (FR14)

As a **utilisateur créant des dialogues**,
I want **définir des règles explicites de sélection de contexte (lieu → région → personnages → thème)**,
So that **le système peut suggérer automatiquement le contexte pertinent selon mes préférences**.

**Acceptance Criteria:**

**Given** je suis dans les paramètres de contexte
**When** j'ouvre "Règles de sélection de contexte"
**Then** un éditeur de règles s'affiche avec interface visuelle (workflow builder)
**And** je peux définir des règles conditionnelles (si X sélectionné, alors suggérer Y)

**Given** je définis une règle "Si lieu sélectionné, alors suggérer région"
**When** la règle est sauvegardée
**Then** la règle est appliquée automatiquement lors des prochaines sélections
**And** quand je sélectionne un lieu, la région associée est suggérée (voir Story 3.3)

**Given** je définis une règle complexe "Si personnage A ET lieu B sélectionnés, alors suggérer thème C"
**When** la règle est sauvegardée
**Then** la règle est évaluée lors de chaque sélection
**And** les suggestions apparaissent quand les conditions sont remplies

**Given** j'ai plusieurs règles définies
**When** je consulte les règles
**Then** toutes les règles sont listées avec priorité (ordre d'évaluation)
**And** je peux réorganiser l'ordre des règles (drag-and-drop)
**And** je peux activer/désactiver des règles individuellement

**Given** je modifie une règle existante
**When** je sauvegarde la modification
**Then** la règle mise à jour est appliquée immédiatement
**And** les suggestions existantes sont recalculées si nécessaire

**Technical Requirements:**
- Backend : Endpoints `/api/v1/context/rules` (GET liste, POST créer, PUT mettre à jour, DELETE supprimer)
- Service : `ContextRuleService` pour évaluation règles + suggestions
- Frontend : Composant `ContextRulesEditor.tsx` avec workflow builder (react-flow ou custom)
- Stockage : Fichiers JSON `data/context-rules/*.json` + API backend (sync)
- Évaluation : Moteur de règles (conditions if/then) avec support opérateurs (AND, OR, NOT)
- Tests : Unit (évaluation règles), Integration (API rules), E2E (workflow règles)

**References:** FR14 (règles explicites), Story 3.3 (suggestions automatiques), Story 3.5 (règles par type dialogue)

---

### Story 3.5: Configurer règles contexte par type de dialogue (FR15)

As a **utilisateur créant des dialogues**,
I want **configurer des règles de sélection de contexte spécifiques par type de dialogue**,
So that **différents types de dialogues (salutation, confrontation, révélation) utilisent des contextes optimisés**.

**Acceptance Criteria:**

**Given** je suis dans les paramètres de contexte
**When** j'ouvre "Règles par type de dialogue"
**Then** une liste des types de dialogue s'affiche : Salutation, Confrontation, Révélation, etc.
**And** chaque type a ses propres règles de sélection de contexte

**Given** je configure les règles pour "Salutation"
**When** je définis les règles
**Then** les règles s'appliquent uniquement aux dialogues de type "Salutation"
**And** les règles peuvent différer des règles globales (override)

**Given** je crée un dialogue de type "Confrontation"
**When** je sélectionne le contexte
**Then** les règles spécifiques à "Confrontation" sont appliquées
**And** les suggestions sont adaptées au type (ex: personnages antagonistes, lieux de tension)

**Given** un type de dialogue n'a pas de règles spécifiques
**When** je crée un dialogue de ce type
**Then** les règles globales sont utilisées (fallback)
**And** un message informatif s'affiche "Règles globales utilisées - configurer des règles spécifiques ?"

**Given** je modifie les règles d'un type de dialogue
**When** la modification est sauvegardée
**Then** les dialogues existants de ce type ne sont pas affectés (règles appliquées au moment de la création)
**And** seuls les nouveaux dialogues utilisent les règles mises à jour

**Technical Requirements:**
- Backend : Endpoints `/api/v1/context/rules/by-dialogue-type/{type}` (GET/PUT) pour règles par type
- Service : `ContextRuleService` avec méthode `getRulesForDialogueType(type)` retournant règles spécifiques ou globales
- Frontend : Composant `DialogueTypeRulesEditor.tsx` avec sélecteur type dialogue + éditeur règles
- Stockage : Fichiers JSON `data/context-rules/by-type/{dialogue-type}.json` + API backend
- Fallback : Logique fallback règles globales si règles spécifiques absentes
- Tests : Unit (règles par type), Integration (API rules by type), E2E (workflow règles par type)

**References:** FR15 (règles par type dialogue), Story 3.4 (règles explicites), FR55-63 (templates)

---

### Story 3.6: Mesurer pertinence contexte (% GDD utilisé dans dialogue généré) (FR16)

As a **utilisateur générant des dialogues**,
I want **voir le pourcentage de contexte GDD utilisé dans le dialogue généré**,
So that **je peux évaluer si le contexte sélectionné est effectivement exploité par le LLM**.

**Acceptance Criteria:**

**Given** j'ai généré un dialogue avec contexte GDD sélectionné
**When** la génération se termine
**Then** un indicateur de pertinence s'affiche "Contexte utilisé : 75%" (ou "Faible utilisation : 25%")
**And** un breakdown détaillé montre quelles sections GDD ont été utilisées (personnages, lieux, thèmes)

**Given** je consulte le rapport de pertinence
**When** j'ouvre le panneau "Pertinence contexte"
**Then** je vois : pourcentage global, breakdown par type d'entité, sections GDD utilisées vs ignorées
**And** les sections utilisées sont surlignées (highlight) dans le contexte GDD affiché

**Given** la pertinence est faible (<30%)
**When** le rapport s'affiche
**Then** un warning s'affiche "Faible utilisation du contexte - considérer ajuster les instructions ou le contexte"
**And** des suggestions sont proposées (ex: "Ajouter plus de contexte sur les personnages")

**Given** je compare la pertinence entre plusieurs générations
**When** je consulte l'historique de pertinence
**Then** un graphique montre l'évolution de la pertinence (ligne temporelle)
**And** je peux identifier les patterns (ex: pertinence plus élevée avec contexte complet vs extrait)

**Given** la pertinence est calculée
**When** le calcul est effectué
**Then** le calcul se fait en <1 seconde (analyse LLM ou heuristique)
**And** le résultat est sauvegardé dans les logs de génération (voir Story 1.15)

**Technical Requirements:**
- Backend : Service `ContextRelevanceService` avec méthode `calculateRelevance(generatedDialogue, contextUsed)` retournant pourcentage
- Analyse : Comparaison texte généré vs contexte GDD (similarité sémantique ou keywords matching)
- API : Endpoint `/api/v1/dialogues/{id}/nodes/{nodeId}/context-relevance` (GET) retourne rapport pertinence
- Frontend : Composant `ContextRelevancePanel.tsx` avec indicateur pourcentage + breakdown détaillé
- Highlight : Surlignage sections GDD utilisées dans `EntityDetailsModal.tsx` (couleur verte)
- Logs : Integration avec Story 1.15 (generation logs) pour stockage pertinence
- Tests : Unit (calcul pertinence), Integration (API relevance), E2E (workflow pertinence)

**References:** FR16 (mesurer pertinence), Story 1.15 (generation logs), Story 3.2 (sélection contexte)

---

### Story 3.7: Voir sections GDD utilisées dans génération nœud (FR17)

As a **utilisateur générant des dialogues**,
I want **voir quelles sections GDD ont été utilisées dans la génération d'un nœud spécifique**,
So that **je peux comprendre comment le LLM a exploité le contexte et ajuster si nécessaire**.

**Acceptance Criteria:**

**Given** un nœud a été généré avec contexte GDD
**When** je sélectionne le nœud et ouvre "Détails contexte"
**Then** un panneau s'affiche listant toutes les sections GDD utilisées
**And** chaque section affiche : nom entité, type (personnage/lieu), section GDD (ex: "Introduction", "Qualités"), extrait utilisé

**Given** je consulte les sections GDD utilisées
**When** le panneau s'affiche
**Then** les sections sont groupées par entité (Personnage X, Lieu Y, etc.)
**And** je peux expand/collapse chaque groupe pour voir les détails

**Given** une section GDD a été utilisée
**When** je clique sur la section
**Then** le contenu complet de la section s'affiche (modal ou panneau expand)
**And** les parties utilisées dans le dialogue généré sont surlignées (highlight)

**Given** une section GDD n'a pas été utilisée
**When** je consulte les sections
**Then** les sections non utilisées sont listées séparément (section "Non utilisées")
**And** un indicateur visuel montre "X sections non utilisées" (couleur grise)

**Given** je compare les sections utilisées entre plusieurs nœuds
**When** je sélectionne 2 nœuds et ouvre "Comparer contexte"
**Then** un tableau comparatif s'affiche montrant sections communes vs uniques
**And** je peux identifier les patterns d'utilisation (ex: mêmes sections utilisées pour nœuds similaires)

**Technical Requirements:**
- Backend : Service `ContextUsageTracker` avec méthode `trackContextUsage(nodeId, contextSections)` pour stocker sections utilisées
- Stockage : Table `context_usage_logs` (node_id, entity_type, entity_name, section_name, excerpt_used, timestamp)
- API : Endpoint `/api/v1/dialogues/{id}/nodes/{nodeId}/context-usage` (GET) retourne sections utilisées
- Frontend : Composant `ContextUsagePanel.tsx` avec liste sections + highlight + comparaison
- Highlight : Surlignage texte utilisé dans `EntityDetailsModal.tsx` (couleur bleue)
- Comparaison : Composant `ContextComparisonView.tsx` pour comparer sections entre nœuds
- Tests : Unit (tracking usage), Integration (API context usage), E2E (workflow context usage)

**References:** FR17 (voir sections GDD utilisées), Story 3.6 (mesurer pertinence), Story 1.15 (generation logs)

---

### Story 3.8: Synchroniser données GDD depuis Notion (V2.0+) (FR18)

As a **utilisateur créant des dialogues**,
I want **synchroniser les données GDD depuis Notion automatiquement**,
So that **je peux utiliser les dernières versions du GDD sans import manuel**.

**Acceptance Criteria:**

**Given** la synchronisation Notion est configurée (V2.0+)
**When** je configure la connexion Notion (token API, database ID)
**Then** la connexion est testée et validée
**And** les paramètres de sync sont sauvegardés (fréquence, types d'entités à sync)

**Given** la synchronisation est activée
**When** la période de sync est atteinte (ex: toutes les heures)
**Then** le système synchronise automatiquement les données GDD depuis Notion
**And** un log de sync s'affiche "Sync Notion terminée - X entités mises à jour"

**Given** des entités GDD sont modifiées dans Notion
**When** la synchronisation se déclenche
**Then** les entités modifiées sont détectées (comparaison timestamps)
**And** seules les entités modifiées sont mises à jour (pas de re-sync complet)

**Given** une synchronisation échoue (erreur API Notion)
**When** l'erreur se produit
**Then** un message d'erreur s'affiche "Sync Notion échouée - [raison]"
**And** les données GDD existantes restent disponibles (pas de corruption)
**And** la prochaine sync est retentée automatiquement (retry avec backoff)

**Given** je lance une synchronisation manuelle
**When** je clique sur "Synchroniser maintenant"
**Then** la synchronisation se lance immédiatement (pas d'attente période)
**And** un indicateur de progression s'affiche "Synchronisation en cours..."

**Technical Requirements:**
- Backend : Service `NotionSyncService` avec méthode `syncFromNotion(databaseId, token)` pour synchronisation
- API Notion : Utiliser Notion API (MCP tools ou SDK) pour récupérer données bases de données
- Scheduler : Tâche périodique (cron ou background worker) pour sync automatique
- Détection changements : Comparaison timestamps Notion `last_edited_time` vs cache local
- Cache : Stockage données GDD synchronisées dans `data/GDD_synced/` avec métadonnées sync
- Logs : Événements sync dans `data/logs/sync-notion.log` avec timestamps + résultats
- Tests : Unit (sync logique), Integration (API Notion), E2E (workflow sync)

**References:** FR18 (sync Notion V2.0+), NFR-I3 (Notion Integration), Story 3.9 (update GDD sans régénérer)

---

### Story 3.9: Mettre à jour données GDD sans régénérer dialogues existants (FR19)

As a **utilisateur créant des dialogues**,
I want **mettre à jour les données GDD sans régénérer les dialogues existants**,
So that **je peux corriger ou enrichir le GDD sans perdre mon travail de génération**.

**Acceptance Criteria:**

**Given** je mets à jour une entité GDD (ex: ajouter section "Qualités" à un personnage)
**When** la mise à jour est sauvegardée
**Then** l'entité GDD est mise à jour dans le système
**And** tous les dialogues existants restent inchangés (pas de régénération automatique)

**Given** un dialogue existant référence une entité GDD mise à jour
**When** je consulte le dialogue
**Then** le dialogue affiche toujours le contenu généré original
**And** un indicateur optionnel s'affiche "GDD mis à jour depuis génération - régénérer ?" (non-bloquant)

**Given** je veux utiliser la nouvelle version du GDD pour un nouveau dialogue
**When** je crée un nouveau dialogue
**Then** la nouvelle version du GDD est utilisée automatiquement
**And** le contexte inclut les mises à jour récentes

**Given** je consulte l'historique d'une entité GDD
**When** j'ouvre "Historique modifications"
**Then** une timeline s'affiche montrant toutes les modifications (dates, sections modifiées)
**And** je peux voir les versions précédentes (diff ou snapshot)

**Given** je régénère un dialogue avec GDD mis à jour
**When** je régénère un nœud (voir Story 1.10)
**Then** la nouvelle version du GDD est utilisée pour la régénération
**And** le nœud régénéré peut différer du nœud original (nouveau contexte)

**Technical Requirements:**
- Backend : Service `GDDVersioningService` avec méthode `updateEntity(type, name, newData)` pour mise à jour
- Versioning : Stockage versions précédentes dans `data/GDD_versions/{type}/{name}/versions.json` avec timestamps
- Isolation : Dialogues existants stockent snapshot contexte GDD utilisé (pas de référence dynamique)
- API : Endpoint `/api/v1/gdd/{type}/{name}` (PUT) pour mise à jour + versioning automatique
- Historique : Endpoint `/api/v1/gdd/{type}/{name}/history` (GET) retourne timeline modifications
- Frontend : Composant `GDDHistoryViewer.tsx` avec timeline + diff entre versions
- Tests : Unit (versioning logique), Integration (API GDD update), E2E (workflow update GDD)

**References:** FR19 (update GDD sans régénérer), Story 1.10 (régénération), Story 3.8 (sync Notion)

---

### Story 3.10: Configurer budget tokens pour sélection contexte (FR20)

As a **utilisateur créant des dialogues**,
I want **configurer un budget de tokens pour la sélection de contexte**,
So that **je peux contrôler la taille du prompt et optimiser les coûts LLM**.

**Acceptance Criteria:**

**Given** je suis dans les paramètres de contexte
**When** j'ouvre "Budget tokens contexte"
**Then** un champ de saisie s'affiche pour définir le budget max (plancher produit **≥ 10 000** tokens ; défaut typique ex. 50 000)
**And** un indicateur montre le budget actuel utilisé vs budget max

**Given** je définis un budget de 50 000 tokens
**When** je sélectionne du contexte GDD
**Then** un compteur s'affiche par ex. « Tokens contexte : 25 000 / 50 000 »
**And** un warning s'affiche si le budget est dépassé "Budget dépassé - réduire la sélection"

**Given** je sélectionne trop de contexte (dépasse budget)
**When** le budget est dépassé
**Then** le système suggère automatiquement d'optimiser la sélection (voir Story 3.11)
**And** je peux accepter l'optimisation ou réduire manuellement la sélection

**Given** je modifie le budget tokens
**When** le budget est réduit (ex: 50 000 → 12 000)
**Then** si la sélection actuelle dépasse le nouveau budget, un warning s'affiche
**And** je dois ajuster la sélection pour respecter le nouveau budget

**Given** je consulte le breakdown tokens contexte
**When** j'ouvre "Détails tokens"
**Then** un breakdown s'affiche : tokens par type d'entité (personnages, lieux, etc.), tokens par mode (complet vs extrait)
**And** je peux identifier les entités les plus coûteuses en tokens

**Technical Requirements:**
- Backend : Service `TokenBudgetService` avec méthode `calculateContextTokens(selections)` retournant tokens totaux
- Estimation : Utiliser tokenizer (tiktoken ou similaire) pour calculer tokens contexte GDD
- API : Endpoint `/api/v1/context/estimate-tokens` (POST) avec sélections, retourne tokens estimés
- Frontend : Composant `TokenBudgetPanel.tsx` avec champ budget + compteur + breakdown
- Validation : Vérification budget avant génération (bloquer si dépassé ou suggérer optimisation)
- Integration : Story 3.11 (optimisation contexte) pour suggestions automatiques
- Tests : Unit (calcul tokens), Integration (API token budget), E2E (workflow budget)

**References:** FR20 (budget tokens contexte), Story 3.11 (optimisation contexte), Story 1.11 (estimation coût)

---

### Story 3.11: Optimiser contexte pour respecter budget tokens tout en maintenant pertinence (FR21)

As a **utilisateur créant des dialogues**,
I want **que le système optimise automatiquement le contexte pour respecter le budget tokens tout en maintenant la pertinence**,
So that **je peux maximiser l'utilisation du contexte sans dépasser mon budget**.

**Acceptance Criteria:**

**Given** ma sélection de contexte dépasse le budget tokens
**When** le système détecte le dépassement
**Then** une suggestion d'optimisation s'affiche "Optimiser contexte pour respecter budget ?"
**And** je peux accepter ou refuser l'optimisation

**Given** j'accepte l'optimisation
**When** l'optimisation est appliquée
**Then** le système priorise les entités les plus pertinentes (score de pertinence)
**And** les entités moins pertinentes sont passées en mode "Extrait" (au lieu de "Complet")
**And** le budget tokens est respecté (sélection optimisée ≤ budget)

**Given** l'optimisation est appliquée
**When** je consulte la sélection optimisée
**Then** un rapport s'affiche "Optimisation appliquée : X entités en mode Extrait, Y tokens économisés"
**And** je peux voir quelles entités ont été modifiées (highlight)

**Given** l'optimisation réduit trop la pertinence
**When** le score de pertinence estimé tombe <50%
**Then** un warning s'affiche "Optimisation peut réduire la pertinence - considérer augmenter le budget"
**And** je peux annuler l'optimisation et augmenter le budget manuellement

**Given** je configure des règles d'optimisation
**When** j'ouvre "Règles d'optimisation"
**Then** je peux définir : entités prioritaires (jamais réduites), seuil pertinence minimum, stratégie (agressive vs conservatrice)
**And** les règles sont appliquées lors de l'optimisation automatique

**Technical Requirements:**
- Backend : Service `ContextOptimizationService` avec méthode `optimizeContext(selections, budget, rules)` retournant sélection optimisée
- Algorithme : Priorisation entités par score pertinence (calculé via similarité sémantique ou règles configurées)
- Stratégie : Conversion mode "Complet" → "Extrait" pour entités moins prioritaires jusqu'à respecter budget
- Score : Calcul score pertinence par entité (basé sur relations, fréquence usage, règles utilisateur)
- API : Endpoint `/api/v1/context/optimize` (POST) avec sélections + budget, retourne sélection optimisée
- Frontend : Composant `ContextOptimizationModal.tsx` avec rapport optimisation + actions accepter/refuser
- Tests : Unit (algorithme optimisation), Integration (API optimize), E2E (workflow optimisation)

**References:** FR21 (optimisation contexte), Story 3.10 (budget tokens), Story 3.6 (mesurer pertinence)

---

