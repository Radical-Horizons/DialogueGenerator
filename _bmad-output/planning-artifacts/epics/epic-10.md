## Epic 10: Gestion de session et sauvegarde

Les utilisateurs peuvent sauvegarder leur travail automatiquement et récupérer leur session après crash. Le système gère auto-save (2min), session recovery, sauvegarde manuelle, détection changements non sauvegardés, et historique basique (MVP) ou détaillé (V2.0+).

**FRs covered:** FR95-101 (auto-save, session recovery, sauvegarde manuelle, Git commit, détection changements, historique)

**NFRs covered:** NFR-R3 (Data Loss Prevention 100%), NFR-P3 (API Response <200ms)

**Valeur utilisateur:** Garantir qu'aucun travail n'est perdu, même en cas de crash navigateur ou fermeture accidentelle, avec récupération automatique et historique des modifications.

**Dépendances:** Epic 0 Story 0.5 (auto-save base), Epic 1 (dialogues), Epic 7 (RBAC pour historique par utilisateur)

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

### Story 10.1: Restaurer session après crash navigateur (FR96)

As a **utilisateur éditant des dialogues**,
I want **récupérer ma session après un crash du navigateur**,
So that **je ne perds pas mon travail même si le navigateur se ferme accidentellement**.

**Acceptance Criteria:**

**Given** je modifie un dialogue et le navigateur crash (fermeture accidentelle)
**When** je rouvre l'application
**Then** un message s'affiche "Session précédente détectée - Voulez-vous restaurer vos modifications ?"
**And** je peux choisir "Restaurer" ou "Ignorer"

**Given** je choisis "Restaurer"
**When** la session est restaurée
**Then** le dialogue est rechargé avec mes dernières modifications (état avant crash)
**And** les modifications non sauvegardées sont récupérées depuis localStorage
**And** un message s'affiche "Session restaurée - X modifications récupérées"

**Given** je choisis "Ignorer"
**When** je refuse la restauration
**Then** le dialogue est chargé depuis la dernière sauvegarde (pas de modifications non sauvegardées)
**And** les données de session dans localStorage sont supprimées

**Given** plusieurs dialogues étaient ouverts avant le crash
**When** je rouvre l'application
**Then** tous les dialogues ouverts sont listés dans le message de restauration
**And** je peux restaurer sélectivement certains dialogues (checkbox par dialogue)

**Given** la session est restaurée
**When** je consulte le dialogue restauré
**Then** un indicateur s'affiche "Session restaurée - modifications non sauvegardées"
**And** je peux sauvegarder manuellement pour persister les modifications (voir Story 10.2)

**Given** les données de session sont corrompues ou invalides
**When** je tente de restaurer
**Then** un message d'erreur s'affiche "Impossible de restaurer la session - données corrompues"
**And** le dialogue est chargé depuis la dernière sauvegarde valide
**And** les données corrompues sont supprimées

**Given** je restaure une session après plusieurs jours
**When** la session est ancienne (>24h)
**Then** un warning s'affiche "Session ancienne (X jours) - données peuvent être obsolètes"
**And** je peux quand même restaurer ou ignorer

**Technical Requirements:**
- Frontend : Hook `useSessionRecovery` avec détection session au démarrage (localStorage check)
- Backup : Sauvegarde automatique état dialogue dans localStorage toutes les 30 secondes (en plus auto-save 2min)
- Format : Structure JSON avec timestamp, dialogue_id, état complet (nodes, edges, metadata)
- Validation : Vérifier intégrité données session avant restauration (schema validation)
- Cleanup : Supprimer sessions >7 jours automatiquement (éviter localStorage plein)
- API : Optionnel, endpoint `/api/v1/sessions/recover` (POST) pour récupération depuis backend (V1.5+)
- Tests : Unit (recovery logique), Integration (session recovery), E2E (crash simulation + recovery)

**References:** FR96 (session recovery), Story 0.5 (auto-save), Story 10.2 (sauvegarde manuelle), NFR-R3 (Data Loss Prevention 100%)

---

### Story 10.2: Sauvegarder manuellement le progrès dialogue (FR97)

> ⚠️ **AC non conformes à ADR-006 — signalé le 2026-10-07, non corrigé.** Relevé pendant la réécriture de la story 1.5 d'Epic 1. Epic 10 est en `backlog`, donc ce sont des specs non implémentées : le correctif est bon marché, mais il dépasse le périmètre de cette passe et n'a pas été arbitré.
>
> Trois divergences avec **ADR-006** (`architecture/v10-architectural-decisions-adrs.md:478-530`) :
>
> | AC | ADR-006 / code réel |
> |---|---|
> | « je clique sur **"Sauvegarder"** (bouton ou Ctrl+S) » | ADR-006 `:493` et `:524` : **« pas de bouton "Sauvegarder" »**, seulement un « Synchroniser maintenant » optionnel. En place aujourd'hui : `Ctrl+S` → flush + sync forcé (`useGraphToolbar.ts:260`), et `SaveStatusIndicator` à la place du bouton. |
> | « le timer auto-save est réinitialisé (**prochaine auto-save dans 2min**) » | Il n'y a pas de timer : debounce **50 ms** après `markDirty` (`useDialogueLoader.ts:436-450`). Les « 2 min » viennent de la rédaction initiale de FR95, antérieure à ADR-006. |
> | « les modifications restent dans **localStorage** » | Le journal est en **IndexedDB**, par `documentId`, avec `clientSeq` / `ackSeq` (`uiSlice.ts:313-328`, `utils/graphJournal.ts`). |
>
> **FR97 lui-même** (« Users can manually save dialogue progress ») gagnerait à être reformulé : « forcer une synchronisation immédiate » plutôt que « sauvegarder », ou marqué *superseded by ADR-006*. À trancher avec l'équipe.
>
> ✅ À l'actif de cette story : elle cite déjà correctement **NFR-R3** (Data Loss Prevention) — c'est Epic 18 qui citait NFR-R2 par erreur, pas celle-ci.

As a **utilisateur éditant des dialogues**,
I want **sauvegarder manuellement mon dialogue à tout moment**,
So that **je peux contrôler quand mes modifications sont persistées et m'assurer que tout est sauvegardé avant de quitter**.

**Acceptance Criteria:**

**Given** j'ai modifié un dialogue
**When** je clique sur "Sauvegarder" (bouton ou Ctrl+S)
**Then** le dialogue est sauvegardé immédiatement
**And** un message de confirmation s'affiche "Dialogue sauvegardé"
**And** l'indicateur de statut passe à "Sauvegardé" (voir Story 10.4)

**Given** je sauvegarde manuellement
**When** la sauvegarde réussit
**Then** le timer auto-save est réinitialisé (prochaine auto-save dans 2min, voir Story 0.5)
**And** l'indicateur "Sauvegardé il y a Xs" se met à jour
**And** les modifications sont persistées dans le backend

**Given** je sauvegarde manuellement pendant une génération LLM
**When** la sauvegarde est lancée
**Then** la sauvegarde attend la fin de la génération (pas de sauvegarde partielle)
**And** un message s'affiche "Sauvegarde en attente - génération en cours"
**And** la sauvegarde se déclenche automatiquement après la génération

**Given** la sauvegarde manuelle échoue (erreur réseau, serveur down)
**When** la sauvegarde est tentée
**Then** un message d'erreur s'affiche "Échec sauvegarde - réessayer ?"
**And** l'indicateur passe à "Erreur"
**And** je peux réessayer la sauvegarde (bouton "Réessayer")
**And** les modifications restent dans localStorage (pas perdues)

**Given** je sauvegarde plusieurs dialogues rapidement
**When** je sauvegarde dialogue A puis dialogue B
**Then** les deux sauvegardes sont traitées séquentiellement (pas de conflit)
**And** chaque dialogue est sauvegardé avec succès
**And** les indicateurs de statut sont mis à jour individuellement

**Given** je consulte le raccourci clavier
**When** je regarde les raccourcis disponibles
**Then** Ctrl+S est listé comme "Sauvegarder dialogue"
**And** le raccourci fonctionne depuis n'importe où dans l'éditeur (pas seulement focus input)

**Technical Requirements:**
- Backend : Endpoint `/api/v1/dialogues/{id}` (PUT) pour sauvegarde manuelle (existant)
- Service : `DialogueService.save_dialogue()` pour persistance dialogue
- Frontend : Bouton "Sauvegarder" + raccourci clavier Ctrl+S (gestionnaire global)
- Zustand store : `useDialogueStore` avec méthode `saveDialogue()` pour sauvegarde manuelle
- Queue : Gérer queue sauvegardes si plusieurs dialogues ouverts (sauvegarde séquentielle)
- Retry : Logique retry automatique en cas d'échec (3 tentatives, exponential backoff)
- Tests : Unit (sauvegarde logique), Integration (API save), E2E (workflow sauvegarde manuelle)

**References:** FR97 (sauvegarde manuelle), Story 0.5 (auto-save), Story 10.4 (détection changements), NFR-R3 (Data Loss Prevention)

---

### Story 10.3: Commiter changements dialogue vers dépôt Git (workflow externe) (FR98)

As a **utilisateur gérant des dialogues**,
I want **commiter mes changements de dialogues vers le dépôt Git**,
So that **je peux versionner mes dialogues et collaborer avec l'équipe via Git**.

**Acceptance Criteria:**

**Given** j'ai sauvegardé des modifications de dialogues
**When** je clique sur "Commit Git"
**Then** un modal s'affiche me demandant un message de commit
**And** je peux voir la liste des fichiers modifiés (dialogues JSON)

**Given** je saisis un message de commit (ex: "Ajout dialogue Akthar - rencontre initiale")
**When** je confirme le commit
**Then** les fichiers dialogues sont commités vers le dépôt Git local
**And** un message de confirmation s'affiche "Commit réussi - X fichiers modifiés"
**And** le commit est visible dans l'historique Git

**Given** le dépôt Git n'est pas initialisé
**When** je tente de commiter
**Then** un message d'erreur s'affiche "Dépôt Git non initialisé - initialiser d'abord"
**And** je peux initialiser le dépôt Git (bouton "Initialiser Git")

**Given** j'ai des changements non sauvegardés
**When** je tente de commiter
**Then** un warning s'affiche "X dialogues ont des modifications non sauvegardées - sauvegarder d'abord ?"
**And** je peux sauvegarder automatiquement avant commit (bouton "Sauvegarder et commiter")

**Given** je commite plusieurs dialogues
**When** le commit est lancé
**Then** tous les dialogues modifiés depuis le dernier commit sont inclus
**And** un résumé s'affiche "X dialogues commités, Y fichiers modifiés"

**Given** le commit Git échoue (conflit, pas de remote configuré)
**When** l'erreur se produit
**Then** un message d'erreur détaillé s'affiche (ex: "Conflit Git détecté - résoudre manuellement")
**And** les fichiers restent modifiés localement (pas de rollback)
**And** je peux résoudre le conflit manuellement via Git

**Given** je consulte l'historique Git
**When** j'ouvre "Historique Git"
**Then** une liste des commits récents s'affiche avec messages, dates, auteurs
**And** je peux voir les différences entre commits (diff view)

**Technical Requirements:**
- Backend : Service `GitService` avec méthodes `commit_dialogues(message, file_paths)`, `get_git_status()`, `init_repo()`
- Git : Utiliser `gitpython` ou commandes Git via subprocess pour opérations Git
- Workflow : Commit local uniquement (pas de push automatique, workflow externe comme spécifié)
- Frontend : Composant `GitCommitModal.tsx` avec input message + liste fichiers + bouton commit
- Validation : Vérifier Git initialisé, fichiers modifiés détectés, message non vide
- Historique : Endpoint `/api/v1/git/history` (GET) retourne liste commits récents
- Tests : Unit (Git operations), Integration (API Git), E2E (workflow commit Git)

**References:** FR98 (Git commit workflow externe), Story 10.2 (sauvegarde manuelle), Story 10.5 (historique), NFR-R3 (Data Loss Prevention)

---

### Story 10.4: Détecter changements non sauvegardés et avertir avant navigation (FR99)

As a **utilisateur éditant des dialogues**,
I want **être averti si j'ai des changements non sauvegardés avant de naviguer**,
So that **je ne perds pas accidentellement mes modifications en quittant la page ou en changeant de dialogue**.

**Acceptance Criteria:**

**Given** j'ai modifié un dialogue (ajout nœud, édition texte)
**When** je tente de naviguer vers une autre page (changer dialogue, quitter éditeur)
**Then** un warning modal s'affiche "Modifications non sauvegardées - Voulez-vous sauvegarder avant de quitter ?"
**And** j'ai les options : "Sauvegarder", "Ignorer", "Annuler"

**Given** je choisis "Sauvegarder"
**When** la sauvegarde réussit
**Then** la navigation se poursuit vers la page demandée
**And** les modifications sont persistées

**Given** je choisis "Ignorer"
**When** je confirme
**Then** la navigation se poursuit sans sauvegarder
**And** les modifications non sauvegardées sont perdues (mais récupérables via session recovery si <2min)

**Given** je choisis "Annuler"
**When** je ferme le modal
**Then** je reste sur la page actuelle
**And** je peux continuer à éditer le dialogue

**Given** j'ai des changements non sauvegardés
**When** je consulte l'interface
**Then** un indicateur visuel s'affiche "Non sauvegardé" (badge orange, voir `SaveStatusIndicator` existant)
**And** l'indicateur est visible dans la barre d'outils ou footer

**Given** je ferme l'onglet du navigateur avec changements non sauvegardés
**When** l'événement `beforeunload` est déclenché
**Then** le navigateur affiche son propre warning "Êtes-vous sûr de vouloir quitter ?"
**And** je peux annuler la fermeture pour sauvegarder

**Given** je sauvegarde manuellement (Ctrl+S)
**When** la sauvegarde réussit
**Then** l'indicateur "Non sauvegardé" disparaît
**And** l'avertissement de navigation ne s'affiche plus (jusqu'à nouvelle modification)

**Given** l'auto-save sauvegarde automatiquement (voir Story 0.5)
**When** l'auto-save réussit
**Then** l'indicateur "Non sauvegardé" disparaît
**And** l'avertissement de navigation ne s'affiche plus

**Technical Requirements:**
- Frontend : Hook `useUnsavedChangesWarning` avec détection navigation (React Router `useBlocker` ou `beforeunload`)
- Détection : Flag `hasUnsavedChanges` dans `useDialogueStore` mis à jour à chaque modification
- Modal : Composant `UnsavedChangesModal.tsx` avec options Sauvegarder/Ignorer/Annuler
- Indicateur : Réutiliser `SaveStatusIndicator` (existant) avec statut "unsaved"
- beforeunload : Gestionnaire `window.beforeunload` pour warning navigateur natif
- Tests : Unit (détection changements), Integration (navigation warning), E2E (workflow navigation avec warning)

**References:** FR99 (détection changements non sauvegardés), Story 0.5 (auto-save), Story 10.2 (sauvegarde manuelle), NFR-R3 (Data Loss Prevention)

---

### Story 10.5: Voir versions précédentes dialogue (historique basique MVP) (FR100)

As a **utilisateur gérant des dialogues**,
I want **voir les versions précédentes d'un dialogue**,
So that **je peux comparer les modifications et restaurer une version antérieure si nécessaire**.

**Acceptance Criteria:**

**Given** j'ai un dialogue avec plusieurs sauvegardes
**When** j'ouvre "Historique" pour le dialogue
**Then** une liste chronologique des versions s'affiche (plus récent → plus ancien)
**And** chaque version affiche : date/heure, auteur (si RBAC activé), nombre de nœuds, taille fichier

**Given** je consulte une version précédente
**When** je clique sur une version dans l'historique
**Then** un aperçu de la version s'affiche (graphe avec nœuds de cette version)
**And** je peux voir les différences avec la version actuelle (nœuds ajoutés/supprimés/modifiés)

**Given** je restaure une version précédente
**When** je clique sur "Restaurer cette version"
**Then** une confirmation s'affiche "Remplacer la version actuelle par cette version ?"
**And** je peux confirmer ou annuler

**Given** je confirme la restauration
**When** la version est restaurée
**Then** le dialogue est remplacé par la version sélectionnée
**And** la version actuelle devient la nouvelle version dans l'historique
**And** un message s'affiche "Version restaurée - dialogue mis à jour"

**Given** je consulte l'historique d'un dialogue
**When** l'historique est chargé
**Then** les versions sont limitées aux 50 dernières (pour performance)
**And** un indicateur affiche "Affichage des 50 dernières versions"

**Given** un dialogue n'a qu'une seule version
**When** j'ouvre l'historique
**Then** un message s'affiche "Aucune version précédente - première sauvegarde"
**And** seule la version actuelle est affichée

**Given** je compare deux versions
**When** je sélectionne deux versions dans l'historique
**Then** un diff s'affiche montrant les différences (nœuds ajoutés/supprimés/modifiés)
**And** les différences sont surlignées (vert = ajouté, rouge = supprimé, orange = modifié)

**Technical Requirements:**
- Backend : Service `DialogueHistoryService` avec méthode `get_dialogue_history(dialogue_id)` retournant liste versions
- Stockage : Table `dialogue_versions` (id, dialogue_id, version_number, content_json, created_at, author_id) ou fichiers versionnés
- API : Endpoint `/api/v1/dialogues/{id}/history` (GET) retourne historique, `/api/v1/dialogues/{id}/history/{version}` (GET) retourne version spécifique
- Restauration : Endpoint `/api/v1/dialogues/{id}/restore-version` (POST) avec version_number pour restauration
- Frontend : Composant `DialogueHistoryPanel.tsx` avec liste versions + aperçu + restauration
- Diff : Service `DialogueDiffService` pour calcul différences entre versions (nœuds, connexions)
- Performance : Limiter historique à 50 versions, pagination si nécessaire
- Tests : Unit (historique logique), Integration (API history), E2E (workflow historique)

**References:** FR100 (historique basique MVP), Story 10.2 (sauvegarde manuelle), Story 10.6 (historique détaillé V2.0+), Story 7.4 (RBAC auteur)

---

### Story 10.6: Voir historique détaillé modifications dialogue (V2.0+) (FR101)

As a **utilisateur gérant des dialogues**,
I want **voir l'historique détaillé des modifications d'un dialogue (qui a modifié quoi, quand)**,
So that **je peux tracer toutes les modifications et comprendre l'évolution du dialogue dans le temps**.

**Acceptance Criteria:**

**Given** le système d'historique détaillé est disponible (V2.0+)
**When** j'ouvre "Historique détaillé" pour un dialogue
**Then** une timeline chronologique s'affiche avec toutes les modifications
**And** chaque modification affiche : timestamp, auteur, type modification (création, édition, suppression nœud), détails

**Given** je consulte l'historique détaillé
**When** la timeline est chargée
**Then** je peux voir : création dialogue, ajout nœuds, modification texte, suppression nœuds, ajout connexions
**And** chaque entrée affiche l'auteur (si RBAC activé, voir Epic 7)

**Given** je filtre l'historique par auteur
**When** je sélectionne un utilisateur
**Then** seules les modifications de cet utilisateur sont affichées
**And** un résumé s'affiche "X modifications par [username]"

**Given** je filtre l'historique par type modification
**When** je sélectionne "Ajout nœuds"
**Then** seules les modifications d'ajout de nœuds sont affichées
**And** je peux voir quels nœuds ont été ajoutés et quand

**Given** je consulte les détails d'une modification
**When** je clique sur une entrée de l'historique
**Then** les détails complets s'affichent : avant/après, nœuds concernés, valeurs modifiées
**And** je peux voir un diff visuel des changements

**Given** je compare deux points dans l'historique
**When** je sélectionne deux timestamps
**Then** un diff complet s'affiche montrant toutes les différences entre ces deux points
**And** je peux voir l'évolution complète du dialogue entre ces deux moments

**Given** j'exporte l'historique détaillé
**When** je clique sur "Exporter historique" (CSV ou JSON)
**Then** un fichier est téléchargé avec toutes les modifications (format structuré)
**And** l'export inclut : timestamp, auteur, type, détails, avant/après

**Technical Requirements:**
- Backend : Service `DialogueHistoryService` avec méthode `get_detailed_history(dialogue_id, filters)` pour historique détaillé
- Stockage : Table `dialogue_history_entries` (id, dialogue_id, entry_type, details_json, author_id, timestamp) pour chaque modification
- Tracking : Intercepteur modifications (ajout/suppression/modification nœuds) pour enregistrement automatique dans historique
- API : Endpoint `/api/v1/dialogues/{id}/history-detailed` (GET) avec filtres auteur/type/période
- Frontend : Composant `DialogueDetailedHistoryPanel.tsx` avec timeline + filtres + diff view
- Diff : Service `DialogueDiffService` pour calcul différences détaillées (champs modifiés, valeurs avant/après)
- Performance : Pagination historique (50 entrées par page), index sur timestamp pour requêtes rapides
- Tests : Unit (tracking modifications), Integration (API history detailed), E2E (workflow historique détaillé)

**References:** FR101 (historique détaillé V2.0+), Story 10.5 (historique basique), Story 7.4 (RBAC auteur), Story 7.8 (audit logs)

