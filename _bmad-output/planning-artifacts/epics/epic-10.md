## Epic 10: Gestion de session et sauvegarde

Les utilisateurs peuvent compter sur un travail persisté en continu et récupérer leur session après un crash. Le système gère la persistance immédiate (store → journal IndexedDB → backend, conforme ADR-006), la restauration de session, la synchronisation forcée, l'avertissement sur changements non acquittés, et l'historique basique (MVP) ou détaillé (V2.0+).

> ⚠️ **Révision du 2026-10-29.** Cet epic a été rédigé **avant ADR-006** et en portait encore le vocabulaire : « auto-save 2 min », « sauvegarde manuelle », « changements non sauvegardés », `localStorage`. ADR-006 (`architecture/v10-architectural-decisions-adrs.md:478-530`) a supprimé le modèle brouillon/sauvegarde : chaque frappe part au store (≤100 ms), est journalisée en **IndexedDB** avec un `clientSeq`, puis poussée au backend ~50 ms plus tard. Les stories **10.2** et **10.4** ont été réécrites ; **10.1** porte un avertissement ciblé sur son mécanisme de stockage. FR95, FR97 et FR99 ont été reformulées dans le PRD.

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

> ⚠️ **Mécanisme de stockage périmé (2026-10-29).** Les AC et exigences techniques ci-dessous décrivent `localStorage` et un backup « toutes les 30 secondes en plus de l'auto-save 2 min ». Le mécanisme réellement en place est le **journal IndexedDB** d'ADR-006 (`utils/graphJournal.ts`, par `documentId`, avec `clientSeq` / `ackSeq`), alimenté à chaque `markDirty` (`uiSlice.ts:313-328`) — donc à chaque modification, pas toutes les 30 secondes. **Le fond de la story (restaurer après crash) reste valable** ; c'est son plomberie qui est à réécrire au moment du découpage, en réutilisant le journal au lieu d'en créer un second.

- Frontend : Hook `useSessionRecovery` avec détection session au démarrage (localStorage check)
- Backup : Sauvegarde automatique état dialogue dans localStorage toutes les 30 secondes (en plus auto-save 2min)
- Format : Structure JSON avec timestamp, dialogue_id, état complet (nodes, edges, metadata)
- Validation : Vérifier intégrité données session avant restauration (schema validation)
- Cleanup : Supprimer sessions >7 jours automatiquement (éviter localStorage plein)
- API : Optionnel, endpoint `/api/v1/sessions/recover` (POST) pour récupération depuis backend (V1.5+)
- Tests : Unit (recovery logique), Integration (session recovery), E2E (crash simulation + recovery)

**References:** FR96 (session recovery), Story 0.5 (auto-save), Story 10.2 (sauvegarde manuelle), NFR-R3 (Data Loss Prevention 100%)

---

### Story 10.2: Forcer une synchronisation immédiate du dialogue (FR97)

**Status:** backlog — **AC réécrites le 2026-10-29** (les précédentes contredisaient ADR-006)

> ⚠️ **Ce que décrivait la version précédente, et pourquoi c'était faux.** Elle construisait la story autour d'un bouton « Sauvegarder », d'un timer d'auto-save à réinitialiser (« prochaine auto-save dans 2 min ») et de `localStorage`. Les trois contredisent **ADR-006** (`architecture/v10-architectural-decisions-adrs.md:478-530`) : pas de bouton « Sauvegarder » (`:493`, `:524`), pas de timer mais un debounce de **50 ms** (`useDialogueLoader.ts:436-450`), et un journal en **IndexedDB** par `documentId` avec `clientSeq` / `ackSeq` (`uiSlice.ts:313-328`, `utils/graphJournal.ts`), pas `localStorage`.
>
> Relevé pendant la réécriture de la story 1.5 d'Epic 1. Epic 10 est en `backlog` : ce sont des specs non implémentées, donc la correction ne touche aucun code.

As a **utilisateur éditant des dialogues**,
I want **forcer l'envoi immédiat de mon dialogue au serveur sans attendre l'envoi automatique**,
So that **je peux m'assurer que tout est bien arrivé avant de fermer, de partager un lien ou d'exporter**.

**Acceptance Criteria:**

**Given** j'ai modifié un dialogue et l'envoi automatique n'a pas encore été acquitté
**When** je presse `Ctrl+S`
**Then** le formulaire en cours d'édition est flushé vers le store, puis le document est poussé au backend sans attendre le debounce
**And** aucun bouton « Sauvegarder » n'existe dans l'interface — c'est l'affordance « Synchroniser maintenant » autorisée par ADR-006 `:493`

**Given** la synchronisation forcée réussit
**When** l'acquittement serveur arrive
**Then** `SaveStatusIndicator` passe à l'état **synchronisé** avec son `ackSeq` à jour
**And** aucun message de confirmation modal n'est affiché — l'indicateur suffit, et c'est son rôle

**Given** une génération LLM est en cours
**When** je presse `Ctrl+S`
**Then** la synchronisation attend la fin de la génération (pas d'envoi partiel)
**And** l'interface le signale sans bloquer l'édition

**Given** la synchronisation échoue (réseau coupé, serveur indisponible, 409)
**When** l'échec est constaté
**Then** `SaveStatusIndicator` passe à l'état **erreur**, distinguable de l'état en attente
**And** le travail reste intégralement dans le **journal IndexedDB** — rien n'est perdu (**NFR-R3**)
**And** une nouvelle tentative est possible, manuelle ou automatique, et un 409 déclenche la résolution de révision d'ADR-008

**Given** je presse `Ctrl+S` pendant qu'une synchronisation est déjà en cours
**When** la seconde demande arrive
**Then** elle attend la première au lieu de la doubler — l'ordre est garanti par le `clientSeq` monotone, et le serveur ignore tout `seq` inférieur ou égal à son `last_seq`

**Given** je consulte l'aide clavier
**When** je regarde les raccourcis disponibles
**Then** `Ctrl+S` y figure sous un libellé qui dit ce qu'il fait — « Synchroniser maintenant », pas « Sauvegarder »
**And** il fonctionne aussi depuis un champ de saisie (`ctrl+s` est dans `allowedInInputs`, `useKeyboardShortcuts.ts:148`)

**Technical Requirements:**
- Frontend : `useGraphToolbar.ts:260` (`Ctrl+S` → `handleSave`) et `useDialogueLoader.ts:481` (flush + attente de génération + push) — **déjà en place**, cette story les vérifie et corrige le libellé
- Indicateur : `SaveStatusIndicator` (`components/shared/`) — `SyncStatusDisplay = 'synced' | 'offline' | 'error'`, `ackSeq`, `pendingCount`
- Journal : `utils/graphJournal.ts` (IndexedDB par `documentId`, `snapshot.ackSeq` / `pending.seq`)
- Backend : `PUT /api/v1/documents/{id}` avec `revision` ; 409 sur conflit (ADR-008)
- Tests : Vitest sur l'ordre des `seq` et l'état de l'indicateur ; E2E sur `Ctrl+S` → rechargement → contenu présent

**References:** FR97 (reformulée 2026-10-29), **ADR-006** (autosave immédiat, pas de bouton Sauvegarder), ADR-008 (revision, 409), Story 10.4 (avertissement avant navigation), **NFR-R3** (Data Loss Prevention)

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

### Story 10.4: Avertir avant de quitter si des changements ne sont pas encore acquittés (FR99)

**Status:** backlog — **AC réécrites le 2026-10-29** (les précédentes contredisaient ADR-006)

> ⚠️ **Ce que décrivait la version précédente, et pourquoi c'était faux.** Elle proposait un modal « Modifications non sauvegardées — Voulez-vous sauvegarder avant de quitter ? » avec les options **Sauvegarder / Ignorer / Annuler**, et prévenait que choisir « Ignorer » perd les modifications (« récupérables via session recovery si < 2 min »).
>
> Sous **ADR-006**, il n'existe aucune modification « non sauvegardée » : tout est déjà dans le store **et** dans le journal IndexedDB avant même l'envoi. Proposer « Ignorer » offrirait donc de **jeter du travail qui n'est pas en danger** — l'inverse de l'intention. Le vrai risque n'est pas la perte locale, c'est de partir en croyant le serveur à jour alors qu'il ne l'est pas.

As a **utilisateur éditant des dialogues**,
I want **savoir, avant de quitter ou de changer de dialogue, si mes dernières modifications ont bien été acquittées par le serveur**,
So that **je ne crois pas à tort que tout est en ligne — et que je sache que rien n'est perdu même si ce n'est pas le cas**.

**Acceptance Criteria:**

**Given** j'édite un dialogue
**When** je consulte l'interface
**Then** `SaveStatusIndicator` dit en permanence où j'en suis : **synchronisé**, **N changements en attente**, ou **erreur**
**And** le libellé parle d'acquittement, **jamais** de « non sauvegardé »

**Given** des changements ne sont pas encore acquittés par le serveur
**When** je change de dialogue ou quitte l'éditeur
**Then** l'avertissement propose **Synchroniser maintenant** ou **Continuer** — **pas** « Ignorer »
**And** il indique explicitement que le travail est conservé localement dans les deux cas

**Given** je choisis « Synchroniser maintenant »
**When** l'acquittement arrive
**Then** la navigation se poursuit et l'indicateur est passé à synchronisé

**Given** je choisis « Continuer »
**When** la navigation se poursuit
**Then** **aucune modification n'est perdue** : le journal IndexedDB conserve l'état par `documentId`, et la synchronisation reprend au prochain chargement de ce document (**NFR-R3**)
**And** l'avertissement le dit, au lieu de laisser croire à un abandon

**Given** tout est acquitté
**When** je navigue
**Then** **aucun avertissement** ne s'affiche

**Given** je ferme l'onglet avec des changements non acquittés
**When** `beforeunload` se déclenche
**Then** l'avertissement natif du navigateur s'affiche
**And** il ne se déclenche **pas** si tout est acquitté — un avertissement systématique entraîne à l'ignorer

**Given** je rouvre un document dont la synchronisation avait été interrompue
**When** il se charge
**Then** l'état est restauré depuis le journal (dernier snapshot acquitté + file en attente) et la synchronisation reprend, conformément à ADR-006
**And** le parcours est couvert par un test E2E : éditer → couper le réseau → quitter → revenir → le contenu est là

**Technical Requirements:**
- Détection : `hasUnsavedChanges` + `clientSeq` / `ackSeq` dans `useGraphStore` (`uiSlice.ts:313-328`) — à renommer en termes d'acquittement si la story touche le store
- Indicateur : `SaveStatusIndicator` existant, **ne pas en créer un second**
- Avertissement : deux actions seulement (Synchroniser / Continuer) ; `beforeunload` conditionné à l'existence de changements non acquittés
- Journal : `utils/graphJournal.ts` — c'est lui qui rend « Continuer » sans danger
- Tests : Vitest sur la condition d'affichage ; E2E sur le parcours hors-ligne → retour

**References:** FR99 (reformulée 2026-10-29), **ADR-006**, Story 10.1 (restauration de session), Story 10.2 (synchronisation forcée), **NFR-R3** (Data Loss Prevention)

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

