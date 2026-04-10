## Epic 4: Validation et assurance qualité

Les utilisateurs peuvent valider la qualité, cohérence et conformité structurelle des dialogues avant export. Le système détecte orphans, cycles, nœuds vides, contradictions lore, "AI slop", context dropping, et fournit LLM judge scoring + simulation flow.

**FRs covered:** FR36-48 (validation structure, lore, qualité LLM, slop detection, simulation)

**NFRs covered:** NFR-R1 (Zero Blocking Bugs), NFR-P3 (API Response <200ms validation checks)

**Valeur utilisateur:** Maintenir qualité narrative constante sur 1M+ lignes sans review manuelle exhaustive.

**Dépendances:** Epic 1 (dialogues à valider), Epic 3 (lore GDD pour validation contradictions)

---

## ⚠️ GARDE-FOUS - Vérification de l'Existant (Scrum Master)

**OBLIGATOIRE avant création de chaque story de cet epic :**

### Checklist de Vérification

1. **Fichiers mentionnés dans les stories :**
  - Vérifier existence avec `glob_file_search` ou `grep`
  - Vérifier chemins corrects (ex: `core/llm/` vs `services/llm/`)
  - Si existe : **DÉCISION** - Étendre ou remplacer ? (documenter dans story)
2. **Composants/Services similaires :**
  - Rechercher composants React similaires (`codebase_search` dans `frontend/src/components/`)
  - Rechercher stores Zustand similaires (`codebase_search` dans `frontend/src/store/`)
  - Rechercher services Python similaires (`codebase_search` dans `services/`, `core/`)
  - Si similaire existe : **DÉCISION** - Réutiliser ou créer nouveau ? (documenter dans story)
3. **Endpoints API :**
  - Vérifier namespace cohérent (`/api/v1/dialogues/`* vs autres)
  - Vérifier si endpoint similaire existe (`grep` dans `api/routers/`)
  - Si endpoint similaire : **DÉCISION** - Étendre ou créer nouveau ? (documenter dans story)
4. **Patterns existants :**
  - Vérifier patterns Zustand (immutable updates, structure stores)
  - Vérifier patterns FastAPI (routers, dependencies, schemas)
  - Vérifier patterns React (composants, hooks, modals)
  - Respecter conventions de nommage et structure dossiers
5. **Documentation des décisions :**
  - Si remplacement : Documenter **POURQUOI** dans story "Dev Notes"
  - Si extension : Documenter **COMMENT** (quels champs/méthodes ajouter)
  - Si nouveau : Documenter **POURQUOI** pas de réutilisation

---

### Story 4.1: Valider structure nœuds (champs requis: DisplayName, stableID, text) (FR36)

As a **utilisateur créant des dialogues**,
I want **valider que tous les nœuds ont les champs requis (DisplayName, stableID, text)**,
So that **je peux détecter les erreurs structurelles avant export et garantir la conformité Unity**.

**Acceptance Criteria:**

**Given** j'ai un dialogue avec plusieurs nœuds
**When** je lance une validation structurelle
**Then** tous les nœuds sont vérifiés pour les champs requis : DisplayName, stableID, text
**And** les erreurs sont listées avec nœud concerné et champ manquant

**Given** un nœud manque le champ DisplayName
**When** la validation est lancée
**Then** une erreur s'affiche "Nœud [stableID] : DisplayName manquant"
**And** le nœud est surligné dans le graphe (couleur rouge)
**And** je peux cliquer sur l'erreur pour naviguer vers le nœud

**Given** un nœud manque le champ stableID
**When** la validation est lancée
**Then** une erreur s'affiche "Nœud [index] : stableID manquant"
**And** le système propose de générer automatiquement un stableID (bouton "Générer stableID")

**Given** un nœud manque le champ text (contenu dialogue vide)
**When** la validation est lancée
**Then** une erreur s'affiche "Nœud [stableID] : text manquant" (voir Story 4.2 pour détection nœuds vides)
**And** le nœud est marqué comme "vide" dans le graphe

**Given** tous les nœuds sont valides structurellement
**When** la validation est lancée
**Then** un message de succès s'affiche "Validation structurelle : 0 erreurs"
**And** la validation se termine en <200ms (NFR-P3)

**Technical Requirements:**

- Backend : Service `GraphValidationService.validate_graph()` (existant) avec validation champs requis
- Validation : Vérifier DisplayName, stableID, text pour chaque nœud dialogue
- API : Endpoint `/api/v1/graph/validate` (POST) retourne erreurs structurelles (existant)
- Frontend : Composant `ValidationPanel.tsx` affiche erreurs avec navigation vers nœuds
- Highlight : Surlignage nœuds avec erreurs dans graphe (couleur rouge, border)
- Tests : Unit (validation champs), Integration (API validation), E2E (workflow validation)

**References:** FR36 (validation structure), Story 4.2 (détection nœuds vides), NFR-P3 (API Response <200ms)

---

### Story 4.2: Détecter nœuds vides (contenu texte manquant) (FR37)

As a **utilisateur créant des dialogues**,
I want **détecter les nœuds vides (contenu texte manquant)**,
So that **je peux identifier et corriger les nœuds incomplets avant export**.

**Acceptance Criteria:**

**Given** j'ai un dialogue avec des nœuds
**When** je lance une validation
**Then** tous les nœuds sont vérifiés pour contenu texte (champ `line` ou `choices`)
**And** les nœuds vides sont détectés et listés

**Given** un nœud de dialogue n'a ni `line` ni `choices`
**When** la validation est lancée
**Then** une erreur s'affiche "Nœud [stableID] : contenu vide (ni dialogue ni choix)"
**And** le nœud est surligné dans le graphe (couleur orange)
**And** je peux cliquer sur l'erreur pour éditer le nœud

**Given** un nœud de test n'a pas de test défini
**When** la validation est lancée
**Then** une erreur s'affiche "Nœud test [stableID] : test d'attribut manquant"
**And** le nœud est marqué comme "incomplet"

**Given** un nœud END est vide
**When** la validation est lancée
**Then** aucun warning n'est affiché (nœuds END peuvent être vides)
**And** la validation continue normalement

**Given** je corrige un nœud vide (ajout texte)
**When** je sauvegarde le nœud
**Then** la validation est automatiquement relancée
**And** l'erreur "nœud vide" disparaît si le nœud est maintenant valide

**Technical Requirements:**

- Backend : `GraphValidationService._validate_node_content()` (existant) détecte nœuds vides
- Validation : Vérifier `line` ou `choices` pour dialogueNode, `test` pour testNode
- Frontend : `ValidationPanel.tsx` affiche nœuds vides avec action "Éditer nœud"
- Auto-validation : Relancer validation après édition nœud (déclenchement automatique)
- Tests : Unit (détection nœuds vides), Integration (API validation), E2E (workflow correction)

**References:** FR37 (détection nœuds vides), Story 4.1 (validation structure), Story 1.5 (édition nœuds)

---

### Story 4.3: Détecter contradictions lore explicites (faits GDD conflictuels) (FR38)

As a **utilisateur créant des dialogues**,
I want **détecter les contradictions lore explicites (faits GDD conflictuels)**,
So that **je peux garantir la cohérence narrative et corriger les incohérences**.

**Acceptance Criteria:**

**Given** j'ai généré un dialogue avec contexte GDD
**When** je lance une validation lore
**Then** le système compare le contenu du dialogue avec les faits GDD
**And** les contradictions explicites sont détectées (ex: personnage mort vs vivant, lieu détruit vs existant)

**Given** un dialogue mentionne "Akthar est mort" mais le GDD indique "Akthar est vivant"
**When** la validation lore est lancée
**Then** une erreur s'affiche "Contradiction lore : Akthar est mentionné comme mort mais GDD indique vivant"
**And** les références GDD pertinentes sont affichées (lien vers fiche GDD)
**And** le nœud concerné est surligné dans le graphe

**Given** une contradiction lore est détectée
**When** je consulte l'erreur
**Then** je peux voir : nœud concerné, fait contradictoire, référence GDD correcte
**And** je peux naviguer vers la fiche GDD pour vérifier

**Given** le dialogue contient des contradictions multiples
**When** la validation est lancée
**Then** toutes les contradictions sont listées
**And** un résumé s'affiche "X contradictions détectées dans Y nœuds"

**Given** une contradiction est ambiguë (pas explicite)
**When** la validation est lancée
**Then** la contradiction est marquée comme "potentielle" (warning, pas erreur)
**And** elle apparaît dans la section "Incohérences potentielles" (voir Story 4.4)

**Technical Requirements:**

- Backend : Service `LoreContradictionValidator` avec méthode `detect_contradictions(dialogue, gdd_data)`
- Analyse : Comparaison texte dialogue vs faits GDD (extraction entités + vérification faits)
- GDD : Utiliser `ContextBuilder` pour accéder données GDD (personnages, lieux, événements)
- API : Endpoint `/api/v1/dialogues/{id}/validate-lore` (POST) retourne contradictions
- Frontend : Composant `LoreValidationPanel.tsx` avec liste contradictions + liens GDD
- Tests : Unit (détection contradictions), Integration (API lore validation), E2E (workflow correction)

**References:** FR38 (contradictions lore explicites), Story 4.4 (incohérences potentielles), Epic 3 (contexte GDD)

---

### Story 4.4: Signaler incohérences lore potentielles pour review humaine (FR39)

As a **utilisateur créant des dialogues**,
I want **être averti des incohérences lore potentielles (non explicites)**,
So that **je peux les examiner manuellement et décider si correction nécessaire**.

**Acceptance Criteria:**

**Given** j'ai généré un dialogue avec contexte GDD
**When** je lance une validation lore
**Then** les incohérences potentielles sont détectées (ambiguïtés, références implicites)
**And** elles sont listées comme "warnings" (pas erreurs bloquantes)

**Given** un dialogue mentionne "le port" sans précision mais plusieurs ports existent dans le GDD
**When** la validation est lancée
**Then** un warning s'affiche "Référence ambiguë : 'le port' pourrait être Port de Valdris ou Port de Meridian"
**And** le warning est non-bloquant (pas d'erreur)
**And** je peux ignorer le warning ou le corriger

**Given** une incohérence potentielle est détectée
**When** je consulte le warning
**Then** je peux voir : nœud concerné, incohérence détectée, suggestions de clarification
**And** je peux marquer le warning comme "Examiné" ou "Ignoré"

**Given** je marque un warning comme "Ignoré"
**When** la validation est relancée
**Then** le warning ignoré n'apparaît plus (préférence utilisateur sauvegardée)
**And** je peux réactiver les warnings ignorés dans les paramètres

**Given** plusieurs incohérences potentielles sont détectées
**When** la validation est lancée
**Then** un résumé s'affiche "X incohérences potentielles détectées"
**And** je peux filtrer les warnings par type (ambiguïté, référence implicite, etc.)

**Technical Requirements:**

- Backend : Service `LoreInconsistencyDetector` avec méthode `detect_potential_issues(dialogue, gdd_data)`
- Heuristiques : Détection ambiguïtés (références vagues), références implicites (pronoms sans contexte)
- Stockage : Préférences utilisateur pour warnings ignorés (localStorage + backend)
- API : Endpoint `/api/v1/dialogues/{id}/validate-lore` (POST) retourne warnings + erreurs
- Frontend : Composant `LoreValidationPanel.tsx` avec section warnings + actions ignorer/examiner
- Tests : Unit (détection incohérences), Integration (API warnings), E2E (workflow review)

**References:** FR39 (incohérences potentielles), Story 4.3 (contradictions explicites), Epic 3 (contexte GDD)

---

### Story 4.5: Détecter nœuds orphelins (non connectés au graphe) (FR40)

As a **utilisateur créant des dialogues**,
I want **détecter les nœuds orphelins (non connectés au graphe)**,
So that **je peux identifier les nœuds inaccessibles et les connecter ou les supprimer**.

**Acceptance Criteria:**

**Given** j'ai un dialogue avec des nœuds
**When** je lance une validation structurelle
**Then** tous les nœuds sont vérifiés pour connexions (entrantes et sortantes)
**And** les nœuds orphelins sont détectés (pas de connexion entrante sauf START)

**Given** un nœud n'a aucune connexion entrante (sauf START qui est autorisé)
**When** la validation est lancée
**Then** une erreur s'affiche "Nœud orphelin : [stableID] n'est pas accessible depuis START"
**And** le nœud est surligné dans le graphe (couleur orange)
**And** je peux cliquer sur l'erreur pour naviguer vers le nœud

**Given** un nœud START est détecté
**When** la validation est lancée
**Then** le nœud START est toujours considéré comme valide (pas d'erreur orphelin)
**And** la validation vérifie que START a des connexions sortantes

**Given** je connecte un nœud orphelin au graphe
**When** je crée une connexion vers le nœud
**Then** la validation est automatiquement relancée
**And** l'erreur "nœud orphelin" disparaît si le nœud est maintenant connecté

**Given** plusieurs nœuds orphelins sont détectés
**When** la validation est lancée
**Then** tous les nœuds orphelins sont listés
**And** un résumé s'affiche "X nœuds orphelins détectés"
**And** je peux sélectionner plusieurs nœuds orphelins et les supprimer en batch

**Technical Requirements:**

- Backend : `GraphValidationService._validate_orphan_nodes()` (existant) détecte nœuds orphelins
- Algorithme : DFS depuis START pour trouver nœuds accessibles, nœuds non accessibles = orphelins
- API : Endpoint `/api/v1/graph/validate` (POST) retourne nœuds orphelins dans erreurs (existant)
- Frontend : `ValidationPanel.tsx` affiche nœuds orphelins avec action "Connecter" ou "Supprimer"
- Auto-validation : Relancer validation après création connexion (déclenchement automatique)
- Tests : Unit (détection orphelins), Integration (API validation), E2E (workflow correction)

**References:** FR40 (détection orphelins), Story 4.1 (validation structure), Story 2.5 (créer connexions), Epic 0 Story 0.6 (validation cycles)

---

### Story 4.6: Détecter cycles dans flux dialogue (FR41)

As a **utilisateur créant des dialogues**,
I want **détecter les cycles dans le flux de dialogue**,
So that **je peux identifier les boucles intentionnelles (dialogues récursifs) ou les erreurs accidentelles**.

**Acceptance Criteria:**

**Given** j'ai un dialogue avec des connexions
**When** je lance une validation structurelle
**Then** tous les cycles sont détectés (algorithme DFS)
**And** les cycles sont listés comme warnings (non-bloquants, voir Epic 0 Story 0.6)

**Given** un cycle est détecté (A → B → C → A)
**When** la validation est lancée
**Then** un warning s'affiche "Cycle détecté : A → B → C → A"
**And** les nœuds du cycle sont surlignés dans le graphe (couleur orange)
**And** je peux marquer le cycle comme "intentionnel" (dialogues récursifs autorisés)

**Given** je marque un cycle comme "intentionnel"
**When** la validation est relancée
**Then** le cycle marqué n'apparaît plus dans les warnings
**And** le cycle reste détecté structurellement (pas d'erreur, juste pas de warning)

**Given** plusieurs cycles sont détectés
**When** la validation est lancée
**Then** tous les cycles sont listés
**And** un résumé s'affiche "X cycles détectés"
**And** je peux examiner chaque cycle individuellement

**Given** un cycle est accidentel (erreur de connexion)
**When** je détecte le cycle
**Then** je peux supprimer la connexion qui crée le cycle
**And** la validation est automatiquement relancée après suppression

**Technical Requirements:**

- Backend : `GraphValidationService._validate_cycles()` (existant) détecte cycles avec DFS
- Algorithme : DFS pour détecter cycles dans graphe orienté
- API : Endpoint `/api/v1/graph/validate` (POST) retourne cycles dans warnings (existant)
- Frontend : `ValidationPanel.tsx` affiche cycles avec action "Marquer intentionnel" ou "Corriger"
- Stockage : Préférences utilisateur pour cycles marqués intentionnels (localStorage + backend)
- Tests : Unit (détection cycles), Integration (API validation), E2E (workflow cycles)

**References:** FR41 (détection cycles), Epic 0 Story 0.6 (validation cycles warning), Story 2.5 (créer connexions)

---

### Story 4.7: Évaluer qualité dialogue avec LLM judge (score 0-10, ±1 marge) (FR42)

As a **utilisateur créant des dialogues**,
I want **évaluer la qualité des dialogues avec un LLM judge (score 0-10, ±1 marge de variance)**,
So that **je peux obtenir un feedback objectif sur la qualité narrative et itérer si nécessaire**.

**Acceptance Criteria:**

**Given** j'ai un dialogue généré
**When** je lance une évaluation qualité LLM
**Then** un LLM judge évalue le dialogue sur plusieurs critères (cohérence, caractérisation, agentivité, style)
**And** un score global 0-10 est attribué avec marge de variance ±1

**Given** le LLM judge évalue un dialogue
**When** l'évaluation est terminée
**Then** un rapport s'affiche avec : score global (ex: 7.5 ± 1), scores par critère, commentaires détaillés
**And** les critères évalués incluent : cohérence narrative, caractérisation personnages, agentivité, style écriture

**Given** le score est faible (<5)
**When** l'évaluation est terminée
**Then** un warning s'affiche "Qualité faible - considérer régénération"
**And** des suggestions d'amélioration sont proposées (ex: "Améliorer caractérisation personnage X")

**Given** le score est élevé (>8)
**When** l'évaluation est terminée
**Then** un message positif s'affiche "Qualité excellente"
**And** les points forts sont mis en avant (ex: "Caractérisation très réussie")

**Given** je lance plusieurs évaluations sur le même dialogue
**When** les évaluations sont terminées
**Then** les scores peuvent varier dans la marge ±1 (variance LLM acceptée)
**And** un graphique montre l'évolution des scores si plusieurs évaluations

**Technical Requirements:**

- Backend : Service `LLMQualityJudgeService` avec méthode `evaluate_quality(dialogue, criteria)` retournant score + commentaires
- LLM : Utiliser provider sélectionné (OpenAI/Mistral) avec prompt spécialisé "quality judge"
- Critères : Rubrique d'évaluation (cohérence, caractérisation, agentivité, style) avec scores individuels
- Variance : Accepter variance ±1 entre évaluations (comportement normal LLM)
- API : Endpoint `/api/v1/dialogues/{id}/evaluate-quality` (POST) retourne score + rapport
- Frontend : Composant `QualityEvaluationPanel.tsx` avec score + breakdown + graphique évolution
- Tests : Unit (logique évaluation), Integration (API LLM judge), E2E (workflow évaluation)

**References:** FR42 (LLM judge scoring), Story 1.1 (génération), Epic 0 Story 0.3 (Multi-Provider LLM)

---

### Story 4.8: Détecter patterns "AI slop" (GPT-isms, répétition, phrases génériques) (FR43)

As a **utilisateur créant des dialogues**,
I want **détecter les patterns "AI slop" (GPT-isms, répétition, phrases génériques)**,
So that **je peux identifier et corriger les dialogues qui sonnent trop artificiels**.

**Acceptance Criteria:**

**Given** j'ai un dialogue généré
**When** je lance une détection "AI slop"
**Then** le système scanne le dialogue pour patterns : GPT-isms, répétitions, phrases génériques
**And** les patterns détectés sont listés avec nœuds concernés

**Given** un dialogue contient des GPT-isms (ex: "Ah, je vois", "C'est intéressant", "Permettez-moi de")
**When** la détection est lancée
**Then** un warning s'affiche "GPT-isms détectés : X occurrences dans Y nœuds"
**And** chaque occurrence est listée avec nœud concerné et suggestion de remplacement

**Given** un dialogue contient des répétitions (même phrase/phrase similaire plusieurs fois)
**When** la détection est lancée
**Then** un warning s'affiche "Répétitions détectées : phrase 'X' répétée Y fois"
**And** les nœuds avec répétitions sont surlignés dans le graphe

**Given** un dialogue contient des phrases génériques (ex: "C'est une bonne question", "Je comprends")
**When** la détection est lancée
**Then** un warning s'affiche "Phrases génériques détectées : X occurrences"
**And** des suggestions de remplacement sont proposées (phrases plus spécifiques au contexte)

**Given** je configure les patterns "AI slop" à détecter
**When** j'ouvre "Paramètres détection AI slop"
**Then** je peux activer/désactiver types de détection (GPT-isms, répétitions, génériques)
**And** je peux ajouter des patterns personnalisés (regex ou mots-clés)

**Technical Requirements:**

- Backend : Service `AISlopDetector` avec méthode `detect_slop(dialogue, patterns)` retournant occurrences
- Patterns : Base de données patterns "AI slop" (GPT-isms, répétitions, génériques) avec regex/mots-clés
- Détection : Scan texte dialogue pour patterns avec scoring (nombre occurrences, sévérité)
- API : Endpoint `/api/v1/dialogues/{id}/detect-slop` (POST) retourne occurrences + suggestions
- Frontend : Composant `AISlopDetectionPanel.tsx` avec liste occurrences + suggestions remplacement
- Configuration : Paramètres utilisateur pour patterns personnalisés (localStorage + backend)
- Tests : Unit (détection patterns), Integration (API slop detection), E2E (workflow correction)

**References:** FR43 (détection AI slop), Story 1.1 (génération), Story 1.10 (régénération)

---

### Story 4.9: Détecter context dropping (lore explicite vs subtil) (FR44)

As a **utilisateur créant des dialogues**,
I want **détecter le context dropping (lore explicite vs subtil)**,
So that **je peux garantir que le contexte GDD sélectionné est effectivement utilisé dans les dialogues**.

**Acceptance Criteria:**

**Given** j'ai généré un dialogue avec contexte GDD sélectionné
**When** je lance une détection context dropping
**Then** le système compare le contenu du dialogue avec le contexte GDD utilisé
**And** les cas de "context dropping" sont détectés (lore explicite dans GDD mais absent ou trop subtil dans dialogue)

**Given** le contexte GDD mentionne explicitement "Akthar est un mage puissant"
**When** le dialogue généré ne mentionne pas cette information (ni explicitement ni implicitement)
**Then** un warning s'affiche "Context dropping : information 'Akthar est mage' du GDD non utilisée"
**And** le nœud concerné est surligné dans le graphe
**And** une suggestion s'affiche "Considérer mentionner le statut de mage d'Akthar"

**Given** le contexte GDD est utilisé de manière trop subtile (référence implicite)
**When** la détection est lancée
**Then** un warning s'affiche "Contexte utilisé de manière subtile - considérer être plus explicite"
**And** des suggestions sont proposées pour rendre le contexte plus visible

**Given** je configure les règles anti-context-dropping (voir Story 4.10)
**When** les règles sont configurées
**Then** la détection respecte ces règles (ex: tolérer subtilité si configuré)
**And** les warnings sont adaptés selon les règles

**Given** plusieurs cas de context dropping sont détectés
**When** la détection est lancée
**Then** tous les cas sont listés avec : information GDD non utilisée, nœuds concernés, suggestions
**And** un résumé s'affiche "X cas de context dropping détectés"

**Technical Requirements:**

- Backend : Service `ContextDroppingDetector` avec méthode `detect_dropping(dialogue, context_used)` retournant cas détectés
- Analyse : Comparaison texte dialogue vs contexte GDD (extraction informations clés + vérification présence)
- Subtilité : Détection références implicites vs explicites (analyse sémantique ou keywords)
- API : Endpoint `/api/v1/dialogues/{id}/detect-context-dropping` (POST) retourne cas détectés
- Frontend : Composant `ContextDroppingPanel.tsx` avec liste cas + suggestions + liens GDD
- Integration : Story 4.10 (règles anti-context-dropping) pour configuration
- Tests : Unit (détection dropping), Integration (API detection), E2E (workflow correction)

**References:** FR44 (détection context dropping), Story 4.10 (règles anti-context-dropping), Story 3.6 (mesurer pertinence)

---

### Story 4.10: Configurer règles validation anti-context-dropping (FR45)

As a **utilisateur créant des dialogues**,
I want **configurer des règles de validation anti-context-dropping**,
So that **je peux personnaliser la détection selon mes préférences (subtilité vs explicite)**.

**Acceptance Criteria:**

**Given** je suis dans les paramètres de validation
**When** j'ouvre "Règles anti-context-dropping"
**Then** un éditeur de règles s'affiche avec options : tolérance subtilité, informations obligatoires, seuils détection

**Given** je configure la tolérance subtilité (ex: "Autoriser références implicites")
**When** la règle est sauvegardée
**Then** la détection context dropping tolère les références subtiles
**And** seules les informations complètement absentes sont signalées

**Given** je définis des informations obligatoires (ex: "Statut mage d'Akthar doit être mentionné")
**When** la règle est sauvegardée
**Then** la validation vérifie que ces informations sont présentes dans le dialogue
**And** une erreur s'affiche si information obligatoire absente

**Given** je configure le seuil de détection (ex: "Strict" vs "Léger")
**When** le seuil est défini
**Then** la détection s'adapte (strict = plus de warnings, léger = moins de warnings)
**And** les warnings sont filtrés selon le seuil

**Given** je configure des règles par type de dialogue
**When** je définis règles pour "Salutation" vs "Confrontation"
**Then** les règles s'appliquent uniquement aux dialogues du type correspondant
**And** les règles globales restent valides pour autres types

**Technical Requirements:**

- Backend : Endpoints `/api/v1/validation/rules/context-dropping` (GET/PUT) pour règles
- Service : `ContextDroppingRulesService` pour évaluation règles + application détection
- Stockage : Fichiers JSON `data/validation-rules/context-dropping.json` + API backend
- Frontend : Composant `ContextDroppingRulesEditor.tsx` avec éditeur règles + seuils
- Évaluation : Moteur règles avec support conditions (obligatoire, tolérance, seuils)
- Tests : Unit (évaluation règles), Integration (API rules), E2E (workflow configuration)

**References:** FR45 (règles anti-context-dropping), Story 4.9 (détection context dropping), Story 3.5 (règles par type dialogue)

---

### Story 4.11: Simuler flux dialogue pour détecter dead ends (FR46)

As a **utilisateur créant des dialogues**,
I want **simuler le flux de dialogue pour détecter les dead ends (nœuds inatteignables)**,
So that **je peux garantir que tous les chemins narratifs sont accessibles au joueur**.

**Acceptance Criteria:**

**Given** j'ai un dialogue avec plusieurs chemins narratifs
**When** je lance une simulation de flux
**Then** le système parcourt tous les chemins possibles depuis START
**And** les dead ends (nœuds inatteignables) sont détectés

**Given** un nœud est inatteignable depuis START (aucun chemin)
**When** la simulation est lancée
**Then** une erreur s'affiche "Dead end : nœud [stableID] est inatteignable"
**And** le nœud est surligné dans le graphe (couleur rouge)
**And** je peux voir le chemin manquant (connexions à créer)

**Given** un nœud est atteignable mais mène à un cul-de-sac (pas de sortie sauf END)
**When** la simulation est lancée
**Then** un warning s'affiche "Cul-de-sac : nœud [stableID] mène uniquement à END"
**And** le warning est non-bloquant (cul-de-sac peut être intentionnel)

**Given** plusieurs dead ends sont détectés
**When** la simulation est lancée
**Then** tous les dead ends sont listés
**And** un résumé s'affiche "X dead ends détectés"
**And** je peux corriger chaque dead end individuellement (créer connexions manquantes)

**Given** je corrige un dead end (création connexion)
**When** la simulation est relancée
**Then** le dead end disparaît si le nœud est maintenant accessible
**And** la simulation se termine en <1 seconde (performance)

**Technical Requirements:**

- Backend : Service `DialogueFlowSimulator` avec méthode `simulate_flow(nodes, edges)` retournant dead ends
- Algorithme : BFS depuis START pour trouver tous les nœuds accessibles, nœuds non accessibles = dead ends
- Cul-de-sac : Détection nœuds avec uniquement connexions vers END (warning, pas erreur)
- API : Endpoint `/api/v1/dialogues/{id}/simulate-flow` (POST) retourne dead ends + chemins manquants
- Frontend : Composant `FlowSimulationPanel.tsx` avec liste dead ends + visualisation chemins
- Performance : Optimisation algorithme pour graphes larges (500+ nodes) <1s
- Tests : Unit (simulation flow), Integration (API simulation), E2E (workflow correction)

**References:** FR46 (simulation flux), Story 4.5 (détection orphelins), Story 4.12 (rapport couverture)

---

### Story 4.12: Afficher rapport couverture simulation (% nœuds accessibles, inatteignables) (FR47)

As a **utilisateur créant des dialogues**,
I want **voir un rapport de couverture simulation (% nœuds accessibles, inatteignables)**,
So that **je peux évaluer la complétude du dialogue et identifier les zones à améliorer**.

**Acceptance Criteria:**

**Given** j'ai lancé une simulation de flux (voir Story 4.11)
**When** la simulation est terminée
**Then** un rapport de couverture s'affiche avec : % nœuds accessibles, % nœuds inatteignables, nombre total nœuds
**And** un graphique visuel montre la répartition (camembert ou bar chart)

**Given** je consulte le rapport de couverture
**When** le rapport s'affiche
**Then** je vois : nombre nœuds accessibles, nombre nœuds inatteignables, pourcentage couverture
**And** un indicateur visuel montre la qualité (vert = >90%, orange = 70-90%, rouge = <70%)

**Given** la couverture est faible (<70%)
**When** le rapport s'affiche
**Then** un warning s'affiche "Couverture faible - X% des nœuds sont inatteignables"
**And** des suggestions sont proposées (ex: "Créer connexions vers nœuds inatteignables")

**Given** je consulte les détails du rapport
**When** j'ouvre "Détails couverture"
**Then** une liste des nœuds accessibles vs inatteignables s'affiche
**And** je peux cliquer sur un nœud pour naviguer vers lui dans le graphe

**Given** je compare la couverture entre plusieurs dialogues
**When** je consulte l'historique de couverture
**Then** un graphique montre l'évolution de la couverture (ligne temporelle)
**And** je peux identifier les dialogues avec meilleure/pire couverture

**Technical Requirements:**

- Backend : Service `CoverageReportService` avec méthode `generate_report(simulation_result)` retournant rapport
- Calcul : Pourcentage nœuds accessibles = (nœuds accessibles / total nœuds) × 100
- API : Endpoint `/api/v1/dialogues/{id}/coverage-report` (GET) retourne rapport couverture
- Frontend : Composant `CoverageReportPanel.tsx` avec graphique + liste nœuds + indicateurs
- Graphique : Camembert ou bar chart (Chart.js ou Recharts) pour visualisation couverture
- Historique : Stockage rapports couverture dans `data/coverage-reports/` avec timestamps
- Tests : Unit (calcul couverture), Integration (API report), E2E (workflow rapport)

**References:** FR47 (rapport couverture), Story 4.11 (simulation flux), Story 4.5 (détection orphelins)

---

### Story 4.13: Valider conformité schéma JSON Unity (100%) (FR48)

As a **utilisateur exportant des dialogues**,
I want **valider la conformité du schéma JSON Unity (100%)**,
So that **je peux garantir que les exports Unity sont valides et ne causent pas d'erreurs d'intégration**.

**Acceptance Criteria:**

**Given** j'ai un dialogue prêt à exporter
**When** je lance une validation schéma Unity
**Then** le système valide le JSON contre le schéma Unity strict
**And** toutes les erreurs de conformité sont détectées (champs manquants, types incorrects, valeurs invalides)

**Given** un dialogue contient un champ invalide (ex: type incorrect)
**When** la validation est lancée
**Then** une erreur s'affiche "Erreur schéma Unity : champ 'X' a type incorrect (attendu Y, reçu Z)"
**And** le nœud concerné est identifié
**And** je peux corriger l'erreur avant export

**Given** un dialogue est conforme au schéma Unity
**When** la validation est lancée
**Then** un message de succès s'affiche "Validation schéma Unity : 100% conforme"
**And** l'export peut être lancé sans risque d'erreur

**Given** plusieurs erreurs de schéma sont détectées
**When** la validation est lancée
**Then** toutes les erreurs sont listées avec : champ concerné, erreur, nœud concerné
**And** un résumé s'affiche "X erreurs de schéma détectées"

**Given** je lance un export Unity
**When** l'export est lancé
**Then** la validation schéma est automatiquement exécutée avant export
**And** l'export est bloqué si erreurs détectées (voir Epic 5)

**Technical Requirements:**

- Backend : Service `UnitySchemaValidator` avec méthode `validate_unity_json(json_data)` retournant erreurs (existant)
- Schéma : Schéma JSON Unity strict (Pydantic models ou JSON Schema) pour validation
- Validation : Vérification champs requis, types, valeurs, structure hiérarchique
- API : Endpoint `/api/v1/dialogues/{id}/validate-schema` (POST) retourne erreurs schéma (existant)
- Frontend : Composant `SchemaValidationPanel.tsx` affiche erreurs schéma avec navigation nœuds
- Auto-validation : Intégration avec Epic 5 (export Unity) pour validation avant export
- Tests : Unit (validation schéma), Integration (API validation), E2E (workflow export)

**References:** FR48 (validation schéma Unity), Epic 5 (export Unity), Story 1.5 (édition nœuds)

---

### Story 4.14: Refactorer `api/routers/graph.py` — découpage en modules cohérents (dette technique)

As a **développeur maintenant la codebase**,
I want **éclater `api/routers/graph.py` (1 650+ lignes) en modules router cohérents par domaine**,
So that **chaque module reste lisible, testable indépendamment, et que les futures stories d'epic 4+ ne continuent pas d'alimenter un god-file**.

**Acceptance Criteria:**

**Given** `api/routers/graph.py` contient les domaines suivants : génération de nœuds, estimation de coût, validation lore/structure, détection AI slop, context dropping, simulation de flux, layout, gestion des prompts/accept/reject
**When** le refactor est terminé
**Then** chaque module router ne dépasse pas ~400 lignes, chaque module adresse un seul domaine fonctionnel, et tous les endpoints existants répondent identiquement (zéro régression API).

**Given** des helpers privés (`_load_unity_nodes_from_dialogue`, `_reconstruct_prompt_for_node`, etc.) sont actuellement inlined dans `graph.py`
**When** le refactor est terminé
**Then** ces helpers sont soit dans le service approprié, soit dans un module `graph_router_helpers.py` si vraiment transverses.

**Given** le singleton `_cd_rules_service` introduit hors `ServiceContainer`
**When** le refactor est terminé
**Then** il est remplacé par une injection propre via `ServiceContainer` / `api/dependencies.py`.

**Technical Requirements:**

- Pas de nouveau comportement — refactor pur, zéro feature ajoutée
- Taille cible par module : ≤ 400 lignes (idéalement ≤ 300)
- Candidats de découpage : `graph_generation.py`, `graph_validation.py`, `graph_flow_simulation.py`, `graph_cost.py`, `graph_prompt_history.py` (à affiner à l'analyse)
- `api/main.py` inclut les nouveaux routers avec les mêmes prefixes — contrat URL inchangé
- Tests : full backend suite verte (1 550+ tests), lint ✅ — preuve de non-régression obligatoire

**References:** Dette accumulée sur epic 4 (stories 4.7 → 4.13), `api/routers/graph.py` commit history

---