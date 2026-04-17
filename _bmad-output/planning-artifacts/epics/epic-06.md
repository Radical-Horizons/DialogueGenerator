## Epic 6: Templates et réutilisabilité

Les utilisateurs peuvent créer, sauvegarder et réutiliser des configurations de génération (instructions, contexte, paramètres). Le système fournit templates pré-built (salutations, confrontation), marketplace (V1.5+), A/B testing (V2.5+) et partage équipe.

**FRs covered:** FR55-63 (templates custom, pre-built, marketplace, A/B testing, partage)

**NFRs covered:** NFR-P3 (API Response <200ms template load), NFR-SC1 (Storage Scalability templates)

**Valeur utilisateur:** Réduire friction cold start (10+ clics → 1 clic) et standardiser qualité via templates éprouvés.

**Dépendances:** Epic 1 (templates pour génération), Epic 3 (templates incluent contexte GDD)

---

## Contexte GDD Alteir — Ce que les templates doivent couvrir

Source : `gdd-systems-reference.md`. Les templates de DialogueGenerator ne sont pas neutres : ils embarquent implicitement la connaissance des systèmes Alteir. Un template "Confrontation" doit savoir que les choix peuvent tester `Sociabilité` ou `Puissance`, qu'ils peuvent modifier la réputation (axe Crainte), et qu'un flag `Flag_perso_X_confrontation` sera probablement affecté.

### Templates pré-built Alteir à prévoir (Story 6.4)

| Template | Système GDD principal | Effets typiques |
|----------|----------------------|-----------------|
| **Salutation / Première rencontre** | Réputation (initialisation), Flags bool | `Flag_perso_X_rencontre_initiale = true`, delta Admiration +2 |
| **Confrontation** | Skill check (Puissance/Sociabilité), Réputation Crainte | Test DD variable, delta Crainte ±N |
| **Révélation narrative** | Flags enum/compteur, souvenir | `Flag_systeme_memoire_*`, progression Connaissance |
| **Négociation / Marchandage** | Réputation Prestige, Effort pool | Conditions `Prestige >= 30`, delta Prestige ±5 |
| **Recrutement compagnon** | Influence & Respect, flags Faction | `influence_delta`, `Flag_faction_*_recrutement` |
| **Cut-scene déclenchée** | Cut-scene (pas de choix), flags système | `nodeType: "cutscene"`, `trigger_animation` |
| **Test de caractéristique pur** | Core System (8 caractéristiques, Effort pool) | `skillCheckConfig` avec caractéristique + DD |

### Contexte GDD dans un template

Un template peut pré-sélectionner un **type de scène** qui oriente automatiquement le ContextSelector (Epic 15) vers les fiches GDD pertinentes. Exemples :
- Template "Confrontation" → hint `type_scene: "confrontation"` → RLM favorise fiches avec champ `Valeurs`, `Défauts`, `Contradictions`
- Template "Première rencontre" → hint `type_scene: "rencontre_initiale"` → RLM favorise `Rencontre initiale` dans fiches personnages

### Instructions anti-context-dropping (Story 6.5)

Les règles anti-context-dropping dépendent du système GDD actif :
- **Mode Explicite** (Réputation, Flags) : Les valeurs numériques (DD, delta réputation) doivent être explicitement dans le JSON généré
- **Mode Subtil** (Lore, Souvenir) : Les références implicites à la cosmologie ou au passé du PNJ sont acceptées

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

### Story 6.1: Créer templates custom d'instructions pour génération dialogue (FR55)

As a **utilisateur créant des dialogues**,
I want **créer des templates custom d'instructions pour la génération de dialogues**,
So that **je peux réutiliser des configurations éprouvées et standardiser la qualité**.

**Acceptance Criteria:**

**Given** j'ai configuré une génération avec instructions, contexte GDD, et paramètres
**When** je clique sur "Sauvegarder comme template"
**Then** un modal s'ouvre me demandant : nom template, description, catégorie, icône emoji
**And** tous les paramètres de génération sont sauvegardés (instructions, contexte, paramètres LLM)

**Given** je crée un template custom
**When** le template est sauvegardé
**Then** le template apparaît dans ma liste de templates personnels
**And** je peux voir le template avec nom, description, aperçu (contexte inclus)

**Given** je crée un template avec contexte GDD sélectionné
**When** le template est sauvegardé
**Then** le contexte GDD est inclus dans le template (personnages, lieux, région)
**And** le template peut être chargé avec contexte pré-rempli (voir Story 6.3)

**Given** je crée un template avec paramètres LLM (provider, model, temperature)
**When** le template est sauvegardé
**Then** les paramètres LLM sont inclus dans le template
**And** le template peut être chargé avec paramètres pré-configurés

**Given** je crée plusieurs templates
**When** je consulte ma liste de templates
**Then** tous mes templates sont listés avec catégories (groupement visuel)
**And** je peux rechercher/filtrer mes templates par nom, catégorie, ou contexte

**Technical Requirements:**
- Backend : Endpoints `/api/v1/templates` (GET liste, POST créer) pour templates custom
- Service : `TemplateService` avec méthode `create_template(name, config, metadata)` pour sauvegarde
- Stockage : Fichiers JSON `data/templates/custom/*.json` + API backend (sync)
- Structure : Template inclut instructions, contexte GDD, paramètres LLM, métadonnées (nom, description, catégorie)
- Frontend : Composant `TemplateCreatorModal.tsx` avec formulaire création + aperçu
- Store : `useTemplateStore` pour liste templates + création
- Tests : Unit (création template), Integration (API templates), E2E (workflow création)

**References:** FR55 (créer templates custom), Story 6.3 (appliquer templates), Epic 0 Story 0.4 (presets système)

---

### Story 6.2: Sauvegarder, éditer, et supprimer templates (FR56)

As a **utilisateur gérant des templates**,
I want **sauvegarder, éditer, et supprimer mes templates**,
So that **je peux maintenir ma bibliothèque de templates à jour et supprimer les templates obsolètes**.

**Acceptance Criteria:**

**Given** j'ai créé un template (voir Story 6.1)
**When** le template est sauvegardé
**Then** le template est persisté dans `data/templates/custom/`
**And** le template apparaît dans ma liste de templates

**Given** je modifie un template existant
**When** je sélectionne un template et clique sur "Éditer"
**Then** un modal s'ouvre avec tous les champs du template pré-remplis
**And** je peux modifier : nom, description, instructions, contexte, paramètres
**And** après sauvegarde, le template est mis à jour (pas de duplication)

**Given** je supprime un template
**When** je sélectionne un template et clique sur "Supprimer"
**Then** une confirmation s'affiche "Supprimer ce template ?"
**And** après confirmation, le template est supprimé définitivement
**And** le template disparaît de ma liste

**Given** je modifie un template utilisé dans plusieurs dialogues
**When** le template est modifié
**Then** les dialogues existants ne sont pas affectés (templates appliqués au moment de la création)
**And** seuls les nouveaux dialogues utilisent le template mis à jour

**Given** je consulte l'historique d'un template
**When** j'ouvre "Historique modifications"
**Then** une timeline s'affiche montrant toutes les modifications (dates, changements)
**And** je peux voir les versions précédentes (diff ou snapshot)

**Technical Requirements:**
- Backend : Endpoints `/api/v1/templates/{id}` (GET, PUT, DELETE) pour CRUD templates
- Service : `TemplateService` avec méthodes `update_template(id, updates)`, `delete_template(id)`
- Versioning : Stockage versions précédentes dans `data/templates/versions/{id}/versions.json` (optionnel)
- Frontend : Composant `TemplateEditorModal.tsx` avec formulaire édition + historique
- Confirmation : Modal confirmation avant suppression (composant `ConfirmDialog.tsx`)
- Tests : Unit (CRUD templates), Integration (API templates), E2E (workflow édition/suppression)

**References:** FR56 (sauvegarder/éditer/supprimer templates), Story 6.1 (créer templates), Story 6.3 (appliquer templates)

---

### Story 6.3: Appliquer templates à génération dialogue (FR57)

As a **utilisateur générant des dialogues**,
I want **appliquer un template à la génération de dialogue**,
So that **je peux utiliser rapidement des configurations éprouvées sans reconfiguration manuelle**.

**Acceptance Criteria:**

**Given** j'ai créé plusieurs templates (voir Story 6.1)
**When** j'ouvre le sélecteur de templates dans l'écran de génération
**Then** tous mes templates sont listés avec nom, description, aperçu
**And** je peux sélectionner un template en 1 clic

**Given** je sélectionne un template
**When** le template est chargé
**Then** tous les champs de génération sont pré-remplis : instructions, contexte GDD, paramètres LLM
**And** je peux immédiatement lancer une génération sans reconfiguration
**And** je peux modifier les champs pré-remplis si nécessaire (template = point de départ)

**Given** un template inclut un contexte GDD (personnages, lieux)
**When** le template est chargé
**Then** le contexte GDD est pré-sélectionné dans les onglets contexte
**And** la validation des références GDD est effectuée (voir Epic 0 Story 0.9)

**Given** un template inclut des paramètres LLM (provider, model)
**When** le template est chargé
**Then** les paramètres LLM sont pré-configurés (sélecteur provider/model mis à jour)
**And** je peux changer de provider/model si nécessaire

**Given** je lance une génération avec un template
**When** la génération se termine
**Then** le template utilisé est enregistré dans les logs de génération (voir Story 1.15)
**And** je peux voir quel template a été utilisé pour chaque dialogue généré

**Technical Requirements:**
- Backend : Endpoint `/api/v1/templates/{id}` (GET) retourne template complet avec configuration
- Service : `TemplateService` avec méthode `load_template(id)` retournant configuration complète
- Frontend : Composant `TemplateSelector.tsx` avec dropdown templates + chargement automatique
- Store : `useTemplateStore` avec méthode `loadTemplate(id)` qui pré-remplit `useGenerationStore`
- Validation : Intégration avec Epic 0 Story 0.9 (preset validation) pour références GDD
- Logs : Stockage template_id dans `generation_logs` (voir Story 1.15)
- Tests : Unit (chargement template), Integration (API template), E2E (workflow template + génération)

**References:** FR57 (appliquer templates), Story 6.1 (créer templates), Story 1.1 (génération), Epic 0 Story 0.9 (preset validation)

---

### Story 6.4: Fournir templates pré-built (salutations, confrontation, révélation) (FR58)

As a **utilisateur créant des dialogues**,
I want **accéder à des templates pré-built (salutations, confrontation, révélation)**,
So that **je peux démarrer rapidement avec des configurations optimisées sans créer mes propres templates**.

**Acceptance Criteria:**

**Given** je suis sur l'écran de génération
**When** j'ouvre le sélecteur de templates
**Then** une section "Templates pré-built" s'affiche avec templates Alteir : Salutation/Première rencontre, Confrontation, Révélation narrative, Négociation, Recrutement compagnon, Cut-scene, Test de caractéristique
**And** chaque template pré-built affiche : nom, description, système GDD associé, aperçu (instructions type)

**Given** je sélectionne un template pré-built "Confrontation"
**When** le template est chargé
**Then** les instructions sont pré-remplies avec configuration optimisée pour confrontations Alteir
**And** le template inclut : test de caractéristique (Puissance ou Sociabilité), condition/effet réputation axe Crainte, flag bool de confrontation
**And** le hint `type_scene: "confrontation"` est pré-rempli (utilisé par Epic 15 RLM si activé)
**And** je peux lancer une génération immédiatement

**Given** je consulte les détails d'un template pré-built
**When** je clique sur un template pré-built
**Then** une description détaillée s'affiche : objectif, cas d'usage, instructions incluses
**And** des exemples d'utilisation sont fournis

**Given** je modifie un template pré-built après chargement
**When** je modifie les instructions
**Then** les modifications n'affectent pas le template pré-built original (template = copie)
**And** je peux sauvegarder mes modifications comme nouveau template custom (voir Story 6.1)

**Given** les templates pré-built sont mis à jour (nouvelle version)
**When** je consulte les templates pré-built
**Then** les nouvelles versions sont disponibles automatiquement
**And** un indicateur s'affiche "Nouveau" pour templates récemment ajoutés

**Technical Requirements:**
- Backend : Fichiers JSON `config/scene_instruction_templates.json` (existant) avec templates pré-built
- Service : `TemplateService` avec méthode `get_prebuilt_templates()` retournant templates système
- Structure : Templates pré-built incluent : id, name, description, instructions, catégorie, `gdd_system` (système GDD principal), `scene_type_hint` (hint pour RLM Epic 15), effets et conditions typiques (optionnel, pour aperçu)
- Templates Alteir à créer : Salutation/Première rencontre, Confrontation, Révélation narrative, Négociation, Recrutement compagnon, Cut-scene, Test de caractéristique (voir table GDD ci-dessus)
- Frontend : Composant `TemplateSelector.tsx` avec section "Pré-built" + "Mes templates"
- Stockage : Templates pré-built en lecture seule (pas modifiables), copie pour personnalisation
- Tests : Unit (chargement pré-built), Integration (API templates), E2E (workflow pré-built)

**References:** FR58 (templates pré-built), Story 6.3 (appliquer templates), Story 6.1 (créer templates custom)

---

### Story 6.5: Configurer templates anti-context-dropping (subtilité lore vs explicite) (FR59)

As a **utilisateur créant des dialogues**,
I want **configurer des templates anti-context-dropping (subtilité lore vs explicite)**,
So that **je peux standardiser l'utilisation du contexte GDD selon mes préférences narratives**.

**Acceptance Criteria:**

**Given** je crée un template custom (voir Story 6.1)
**When** je configure le template
**Then** une option "Règles anti-context-dropping" s'affiche
**And** je peux choisir : "Subtilité" (références implicites OK) ou "Explicite" (références directes requises)

**Given** je configure un template avec mode "Explicite"
**When** le template est appliqué à une génération
**Then** la validation context dropping (voir Story 4.9) utilise des règles strictes
**And** les références implicites sont signalées comme warnings

**Given** je configure un template avec mode "Subtilité"
**When** le template est appliqué à une génération
**Then** la validation context dropping tolère les références subtiles
**And** seules les informations complètement absentes sont signalées

**Given** je configure des règles anti-context-dropping personnalisées
**When** j'ouvre "Règles anti-context-dropping" dans création template
**Then** je peux définir : informations obligatoires, seuil tolérance, stratégie (agressive vs conservatrice)
**And** les règles sont sauvegardées avec le template

**Given** un template avec règles anti-context-dropping est appliqué
**When** la génération est lancée
**Then** les règles du template sont utilisées pour validation context dropping
**And** les warnings/erreurs respectent les règles configurées

**Technical Requirements:**
- Backend : Structure template avec champ `anti_context_dropping_rules` (mode, seuils, informations obligatoires)
- Service : `TemplateService` avec validation règles anti-context-dropping lors création template
- Integration : Utiliser règles template dans `ContextDroppingDetector` (voir Story 4.9) lors génération
- Frontend : Composant `AntiContextDroppingRulesEditor.tsx` dans `TemplateCreatorModal.tsx`
- Stockage : Règles sauvegardées dans template JSON avec structure `{mode: "explicit"|"subtle", rules: {...}}`
- Tests : Unit (règles template), Integration (API templates), E2E (workflow template + validation)

**References:** FR59 (templates anti-context-dropping), Story 4.9 (détection context dropping), Story 4.10 (règles anti-context-dropping), Story 6.1 (créer templates)

---

### Story 6.6: Parcourir marketplace de templates (V1.5+) (FR60)

As a **utilisateur créant des dialogues**,
I want **parcourir un marketplace de templates (V1.5+)**,
So that **je peux découvrir et utiliser des templates créés par d'autres utilisateurs**.

**Acceptance Criteria:**

**Given** le marketplace de templates est disponible (V1.5+)
**When** j'ouvre le sélecteur de templates
**Then** une section "Marketplace" s'affiche avec templates partagés par la communauté
**And** je peux parcourir les templates par catégorie, popularité, ou date

**Given** je parcours le marketplace
**When** je consulte un template du marketplace
**Then** je vois : nom, description, auteur, nombre d'utilisations, note moyenne
**And** je peux voir un aperçu du template (instructions, contexte type)

**Given** je trouve un template intéressant dans le marketplace
**When** je clique sur "Utiliser ce template"
**Then** le template est ajouté à mes templates personnels (copie locale)
**And** je peux utiliser le template comme mes templates custom (voir Story 6.3)

**Given** je partage un de mes templates au marketplace (voir Story 6.7)
**When** le template est partagé
**Then** le template apparaît dans le marketplace avec mon nom comme auteur
**And** d'autres utilisateurs peuvent découvrir et utiliser mon template

**Given** je filtre le marketplace par catégorie ou popularité
**When** je sélectionne un filtre
**Then** seuls les templates correspondants sont affichés
**And** je peux trier par : popularité, date, note, nombre utilisations

**Technical Requirements:**
- Backend : Endpoints `/api/v1/templates/marketplace` (GET liste, POST partager) pour marketplace
- Service : `TemplateMarketplaceService` avec méthodes `browse_templates(filters)`, `share_template(template_id)`
- Base de données : Table `shared_templates` (template_id, author_id, category, popularity, rating, usage_count)
- Frontend : Composant `TemplateMarketplacePanel.tsx` avec liste templates + filtres + tri
- Partage : Intégration avec Story 6.7 (partage templates) pour publier templates
- Tests : Unit (marketplace logic), Integration (API marketplace), E2E (workflow marketplace)

**References:** FR60 (marketplace templates V1.5+), Story 6.7 (partage templates), Story 6.3 (appliquer templates)

---

### Story 6.7: A/B tester templates et scorer qualité (V2.5+) (FR61)

As a **utilisateur optimisant mes templates**,
I want **A/B tester mes templates et scorer leur qualité (V2.5+)**,
So that **je peux identifier les templates les plus performants et améliorer la qualité narrative**.

**Acceptance Criteria:**

**Given** le système A/B testing est disponible (V2.5+)
**When** j'ouvre "A/B Testing templates"
**Then** je peux créer un test A/B en sélectionnant 2 templates à comparer
**And** je configure : nombre de générations par template, critères d'évaluation

**Given** je lance un test A/B entre 2 templates
**When** le test est lancé
**Then** le système génère des dialogues avec chaque template (alternance)
**And** les résultats sont trackés : scores qualité LLM judge (voir Story 4.7), feedback utilisateur, coûts

**Given** un test A/B est terminé
**When** je consulte les résultats
**Then** un rapport comparatif s'affiche : scores moyens, coûts, temps génération, feedback utilisateur
**And** un graphique montre la comparaison visuelle (bar chart scores, coûts)
**And** un template "gagnant" est identifié (meilleur score global)

**Given** je consulte l'historique des tests A/B
**When** j'ouvre "Historique tests A/B"
**Then** tous mes tests passés sont listés avec résultats
**And** je peux voir l'évolution des scores de mes templates au fil du temps

**Given** je modifie un template basé sur résultats A/B
**When** le template est amélioré
**Then** je peux relancer un test A/B pour valider les améliorations
**And** les nouveaux résultats sont comparés aux anciens

**Technical Requirements:**
- Backend : Service `TemplateABTestingService` avec méthode `run_ab_test(template_a_id, template_b_id, config)`
- Génération : Alternance générations avec template A vs B, tracking résultats par template
- Scoring : Utiliser Story 4.7 (LLM judge) pour évaluer qualité chaque génération
- API : Endpoints `/api/v1/templates/ab-test` (POST créer test, GET résultats) pour A/B testing
- Frontend : Composant `TemplateABTestingPanel.tsx` avec création test + rapport comparatif + graphiques
- Stockage : Résultats tests A/B dans `data/ab-tests/{test_id}/results.json` avec métadonnées
- Tests : Unit (A/B test logic), Integration (API A/B test), E2E (workflow A/B test complet)

**References:** FR61 (A/B test templates V2.5+), Story 4.7 (LLM judge scoring), Story 6.1 (créer templates), Story 1.1 (génération)

---

### Story 6.8: Partager templates avec membres équipe (FR62)

As a **utilisateur travaillant en équipe**,
I want **partager mes templates avec les membres de mon équipe**,
So that **nous pouvons standardiser nos configurations et réutiliser les meilleures pratiques**.

**Acceptance Criteria:**

**Given** j'ai créé un template custom (voir Story 6.1)
**When** je sélectionne le template et clique sur "Partager avec équipe"
**Then** un modal s'affiche avec liste des membres de l'équipe (voir Epic 7)
**And** je peux sélectionner les membres avec qui partager

**Given** je partage un template avec un membre de l'équipe
**When** le partage est confirmé
**Then** le template apparaît dans la liste de templates du membre
**And** le template est marqué comme "Partagé par [mon nom]"
**And** le membre peut utiliser le template comme ses templates custom

**Given** un membre de l'équipe partage un template avec moi
**When** je consulte mes templates
**Then** le template partagé apparaît dans une section "Templates partagés"
**And** je peux utiliser le template normalement (voir Story 6.3)
**And** je peux voir qui a partagé le template

**Given** je modifie un template que j'ai partagé
**When** le template est modifié
**Then** les membres avec qui le template est partagé voient la mise à jour
**And** un message informatif s'affiche "Template '[nom]' a été mis à jour par [auteur]"

**Given** je retire le partage d'un template
**When** je clique sur "Arrêter le partage"
**Then** le template disparaît de la liste des membres
**And** les membres ne peuvent plus utiliser le template (sauf s'ils l'ont copié localement)

**Technical Requirements:**
- Backend : Endpoints `/api/v1/templates/{id}/share` (POST partager, DELETE arrêter partage) avec liste membres
- Service : `TemplateSharingService` avec méthodes `share_template(template_id, member_ids)`, `revoke_share(template_id)`
- Base de données : Table `template_shares` (template_id, owner_id, shared_with_user_id, timestamp)
- Frontend : Composant `TemplateSharingModal.tsx` avec sélection membres équipe + gestion partage
- Notifications : Intégration avec Epic 7 (collaboration) pour notifications partage templates
- Sync : Mise à jour templates partagés en temps réel (WebSocket ou polling)
- Tests : Unit (partage logique), Integration (API sharing), E2E (workflow partage)

**References:** FR62 (partage templates équipe), Epic 7 (collaboration), Story 6.1 (créer templates), Story 6.3 (appliquer templates)

---

### Story 6.9: Suggérer templates basés sur scénario dialogue (FR63)

As a **utilisateur créant des dialogues**,
I want **que le système suggère des templates basés sur le scénario du dialogue**,
So that **je peux découvrir rapidement les templates les plus pertinents pour mon contexte**.

**Acceptance Criteria:**

**Given** je configure un dialogue avec contexte GDD (personnages, lieux, type scène)
**When** je consulte le sélecteur de templates
**Then** des suggestions de templates s'affichent en haut de la liste
**And** les suggestions sont basées sur : type scène, personnages, contexte narratif

**Given** je sélectionne un personnage "Akthar" et un lieu "Port de Valdris"
**When** je consulte les suggestions de templates
**Then** les templates pertinents pour "première rencontre" ou "conversation portuaire" sont suggérés
**And** si le GDD indique que `Flag_perso_akthar_rencontre_initiale` n'est pas encore posé, le template "Salutation/Première rencontre" est prioritaire
**And** un indicateur "Suggéré pour votre contexte" s'affiche

**Given** je configure des instructions avec mots-clés (ex: "confrontation", "révélation")
**When** les suggestions sont générées
**Then** les templates correspondant aux mots-clés sont priorisés
**And** un score de pertinence s'affiche pour chaque suggestion (ex: "95% pertinent")

**Given** je consulte les suggestions de templates
**When** les suggestions s'affichent
**Then** je peux voir pourquoi chaque template est suggéré (raison : "Correspond à votre type scène 'confrontation'")
**And** je peux accepter la suggestion (1 clic) ou parcourir tous les templates

**Given** j'utilise fréquemment un template suggéré
**When** le template est utilisé plusieurs fois
**Then** le système apprend mes préférences
**And** le template est suggéré plus souvent dans des contextes similaires

**Technical Requirements:**
- Backend : Service `TemplateSuggestionService` avec méthode `suggest_templates(context, instructions)` retournant templates pertinents
- Algorithme : Matching contexte GDD + instructions + mots-clés avec métadonnées templates (catégorie, tags)
- Scoring : Calcul score pertinence (0-100%) basé sur correspondance contexte + instructions
- API : Endpoint `/api/v1/templates/suggestions` (POST) avec contexte retourne templates suggérés
- Frontend : Composant `TemplateSuggestionsPanel.tsx` avec liste suggestions + scores + raisons
- Machine Learning : Apprentissage préférences utilisateur (optionnel, V2.0+) pour améliorer suggestions
- Tests : Unit (algorithme suggestions), Integration (API suggestions), E2E (workflow suggestions)

**References:** FR63 (suggestions templates), Story 6.3 (appliquer templates), Story 3.3 (suggestions contexte GDD), Story 6.1 (créer templates)

---

