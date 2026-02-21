### Epic 0.9: Production Readiness (Pre-Launch Polish)

**CONTEXTE CRITIQUE** : Après l'implémentation d'Epic 0 via le sprint-plan-2026-01-15, l'application est presque prête pour la mise en production. Epic 0.9 adresse les derniers ajustements nécessaires avant le lancement : correction des bugs restants, vérification de la fluidité UX, refactorisation si nécessaire, et organisation de l'application pour la mise en ligne.

Les utilisateurs peuvent utiliser une application stable, fluide et prête pour la production. Le système élimine les derniers bugs de comportement, optimise l'expérience utilisateur, et s'assure que l'application est organisée et prête pour le déploiement.

**FRs covered:** N/A (Epic de préparation production, pas de nouvelles fonctionnalités)

**NFRs covered:** NFR-R1 (Zero Blocking Bugs), NFR-U1 (User Experience Fluidity), NFR-M1 (Maintainability), NFR-D1 (Deployment Readiness)

**Valeur utilisateur:** Application stable, fluide et prête pour utilisation en production sans friction ni bugs bloquants.

**Dépendances:** Epic 0 (doit être terminé ou presque terminé)

**Contrainte architecture (ADR-007):** Toute tâche touchant GraphCanvas ou le flux nodes/edges doit respecter le mode controlled (canvas piloté uniquement par le store). Détails : `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md` (ADR-007).

**Implementation Priority:** Story 0.9.1 (Correction bugs comportement) - **CRITIQUE** car bloque la mise en production

---

## ⚠️ GARDE-FOUS - Vérification de l'Existant (Scrum Master)

**OBLIGATOIRE avant création de chaque story de cet epic :**

### Checklist de Vérification

1. **Fichiers mentionnés dans les stories :**
   - [ ] Vérifier existence avec `glob_file_search` ou `grep`
   - [ ] Vérifier chemins corrects (ex: `frontend/src/components/graph/` vs autres)
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

### Story 0.9.1: Correction bugs comportement (nodes qui changent de place, etc.)

As a **utilisateur travaillant sur l'éditeur de graphe**,
I want **que les nœuds conservent leur position après sauvegarde/chargement et que les TestNodes suivent leur parent lors du déplacement**,
So that **je peux travailler efficacement sans perdre mon organisation visuelle du graphe**.

**Acceptance Criteria:**

**Given** je déplace un DialogueNode dans le graphe (drag-and-drop)
**When** le DialogueNode est déplacé
**Then** tous les TestNodes associés suivent automatiquement leur parent
**And** les positions relatives entre parent et enfants sont préservées (offset x: +300, y: -150 + (choiceIndex * 200))

**Given** je déplace un nœud dans le graphe (drag-and-drop)
**When** je sauvegarde le dialogue
**Then** la position du nœud est persistée correctement
**And** après rechargement, le nœud est à la même position

**Given** je charge un dialogue avec des nœuds positionnés
**When** le graphe se charge
**Then** tous les nœuds apparaissent à leurs positions sauvegardées
**And** les TestNodes sont positionnés correctement relativement à leur parent
**And** aucune position n'est réinitialisée ou déplacée de manière inattendue

**Given** je génère plusieurs nœuds en batch (ex: 4 résultats de test)
**When** les nœuds sont créés
**Then** les nœuds sont positionnés avec détection de collision
**And** si collision détectée, les nœuds sont automatiquement décalés pour éviter chevauchement
**And** un espacement minimal de 50px est garanti entre nœuds

**Given** la détection de collision automatique est activée (toggle on)
**When** je génère un nouveau nœud depuis un parent
**Then** le nœud est positionné de manière logique (à droite du parent, légèrement décalé)
**And** si la position proposée chevauche un nœud existant, le nouveau nœud est décalé automatiquement
**And** les autres nœuds existants ne bougent pas

**Given** la détection de collision automatique est désactivée (toggle off)
**When** je génère un nouveau nœud depuis un parent
**Then** le nœud est positionné avec l'offset fixe (comportement actuel)
**And** je peux déplacer manuellement les nœuds si chevauchement

**Given** je déplace plusieurs nœuds rapidement (drag-and-drop multiple)
**When** les positions sont mises à jour
**Then** toutes les positions sont sauvegardées correctement (pas de perte de position)
**And** l'auto-save (Epic 0 Story 0.5) capture toutes les modifications de position

**Given** je charge un dialogue avec des nœuds sans position sauvegardée (données legacy)
**When** le graphe se charge
**Then** des positions par défaut sont générées (auto-layout)
**And** les positions sont sauvegardées pour les prochains chargements

**Given** l'auto-layout est appelé (bouton ou Ctrl+L)
**When** le layout est calculé
**Then** tous les nœuds sont repositionnés selon l'algorithme Dagre
**And** les nouvelles positions sont sauvegardées
**And** le graphe est visiblement réorganisé

**Technical Requirements:**
- Frontend : `graphStore.ts::updateNodePosition()` doit détecter TestNodes enfants et mettre à jour leurs positions
- Frontend : Fonction utilitaire `findFreePosition()` pour détection collision lors création nodes
- Frontend : Toggle on/off pour activation/désactivation détection collision (settings ou UI)
- Frontend : Vérifier `graphStore.ts::updateNodePosition()` persiste correctement dans dialogue JSON
- Frontend : Investiguer et corriger bug auto-layout (ligne 924-975 graphStore.ts)
- Backend : Vérifier sérialisation/désérialisation positions dans `services/dialogue_service.py`
- localStorage : Vérifier `saveNodePositions()` et `loadNodePositions()` fonctionnent correctement
- Tests : Unit (persistance position, suivi TestNodes, détection collision), Integration (sauvegarde/chargement positions), E2E (déplacer nœud → sauvegarder → recharger, auto-layout)
- Migration : Script migration données legacy (générer positions par défaut si manquantes)

**Dev Notes:**

**Problèmes identifiés (confirmés par utilisateur) :**
- ✅ TestNodes ne suivent pas leur parent lors déplacement → **À CORRIGER**
- ✅ Nodes se chevauchent lors création batch → **À CORRIGER**
- ⚠️ Auto-layout ne fonctionne pas → **À INVESTIGUER ET CORRIGER**
- Positions nœuds peuvent être perdues lors de sauvegarde/chargement
- localStorage positions peut être désynchronisé avec dialogue JSON

**Décisions prises (Party Mode 2026-01-23) :**
- TestNodes suivent toujours leur parent (pas de découplage manuel pour V1.0)
- Détection collision avec ajustement automatique (toggle on/off)
- Nodes peuvent être déplacés plus loin si nécessaire pour éviter collision
- Feedback visuel pendant génération : afficher nodes "vides" avant remplissage (amélioration UX)

**Références techniques :**
- `frontend/src/store/graphStore.ts::updateNodePosition()` (ligne 554-583) - À étendre pour TestNodes
- `frontend/src/store/graphStore.ts::applyAutoLayout()` (ligne 924-975) - À investiguer/corriger
- `frontend/src/store/graphStore.ts::generateFromNode()` (ligne 704-728) - À étendre avec détection collision
- `frontend/src/components/graph/GraphCanvas.tsx::handleNodesChange()` (ligne 171-189)
- Epic 0 Story 0.5 (auto-save) pour persistance automatique

**References:** NFR-R1 (Zero Blocking Bugs), Epic 0 Story 0.1 (stableID), Epic 0 Story 0.5 (auto-save)

---

### Story 0.9.2: Vérification fluidité UX et correction friction points

As a **utilisateur utilisant l'application**,
I want **une expérience fluide sans friction ni latence perceptible, avec feedback visuel pendant la génération**,
So that **je peux travailler efficacement sans frustration et voir le progrès en temps réel**.

**Acceptance Criteria:**

**Given** je génère plusieurs nœuds en batch (ex: 4 résultats de test)
**When** la génération commence
**Then** les nœuds "vides" (squelettes) sont immédiatement créés et affichés dans le graphe
**And** je peux voir leur position avant qu'ils soient remplis avec le contenu généré
**And** je peux interagir avec le graphe pendant la génération (zoom, pan, déplacer autres nœuds)

**Given** je génère un dialogue avec LLM
**When** la génération est en cours
**Then** l'interface reste réactive (pas de freeze)
**And** je peux interagir avec d'autres parties de l'interface (navigation, édition autres nœuds)
**And** un indicateur de progression montre l'avancement (SSE progress modal)

**Given** je navigue dans l'interface (dashboard → graphe → édition)
**When** je change de vue
**Then** la transition est fluide (<100ms)
**And** aucun freeze ou lag perceptible ne se produit

**Given** je charge un dialogue avec beaucoup de nœuds (100+)
**When** le graphe se charge
**Then** le chargement est progressif (nœuds apparaissent progressivement)
**And** l'interface reste réactive pendant le chargement

**Given** je sauvegarde un dialogue
**When** la sauvegarde est en cours
**Then** un indicateur visuel discret s'affiche (spinner ou badge)
**And** je peux continuer à travailler (sauvegarde en arrière-plan)

**Given** je fais une action qui déclenche une erreur réseau
**When** l'erreur se produit
**Then** un message d'erreur clair s'affiche (non-bloquant)
**And** je peux réessayer ou continuer à travailler

**Technical Requirements:**
- Frontend : Créer nodes "squelettes" immédiatement lors début génération batch
- Frontend : Mettre à jour nodes progressivement avec contenu généré (SSE streaming)
- Frontend : Permettre interaction graphe pendant génération (pas de blocage UI)
- Performance : Profiler React (React DevTools Profiler) pour identifier composants lents
- Optimisation : Lazy loading composants lourds, memoization si nécessaire
- UX : Indicateurs de chargement discrets, feedback immédiat pour actions utilisateur
- Tests : E2E (navigation fluide, génération avec feedback visuel, chargement graphe large)
- Monitoring : Ajouter métriques performance (temps chargement, latence interactions)

**Dev Notes:**

**Points de friction identifiés :**
- ⚠️ Pendant génération batch, utilisateur bloqué sans feedback visuel → **NOUVELLE AMÉLIORATION UX**
- Latence lors chargement graphe large
- Freeze possible pendant génération LLM (même avec SSE)
- Transitions entre vues peuvent être lentes

**Optimisations possibles :**
- Créer nodes "squelettes" immédiatement (ID, position, type) avant génération contenu
- Virtualisation liste nœuds si >100 nœuds
- Debounce/throttle mises à jour position nœuds
- Code splitting React (lazy load composants lourds)

**Références techniques :**
- `frontend/src/store/graphStore.ts::generateFromNode()` (ligne 586-777) - À modifier pour créer nodes squelettes
- `frontend/src/components/graph/AIGenerationPanel.tsx` - Panel génération avec feedback
- Epic 0 Story 0.2 (Progress Modal SSE) - Réutiliser pour feedback génération

**References:** NFR-U1 (User Experience Fluidity), NFR-P2 (LLM Generation <30s), Epic 0 Story 0.2 (Progress Modal SSE)

---

### Story 0.9.3: Refactorisation code critique si nécessaire

As a **développeur maintenant l'application**,
I want **un code propre, maintenable et bien organisé**,
So that **je peux ajouter de nouvelles fonctionnalités et corriger des bugs facilement**.

**Acceptance Criteria:**

**Given** je parcours le codebase
**When** j'identifie du code dupliqué ou des patterns incohérents
**Then** le code est refactorisé pour éliminer duplication
**And** les patterns sont standardisés (cohérence architecture)

**Given** je parcours les composants React
**When** j'identifie des composants trop gros (>500 lignes) ou avec trop de responsabilités
**Then** les composants sont décomposés en composants plus petits et réutilisables
**And** la logique métier est extraite dans des hooks ou services

**Given** je parcours les services backend
**When** j'identifie des services avec trop de responsabilités ou des dépendances circulaires
**Then** les services sont refactorisés pour respecter Single Responsibility Principle
**And** les dépendances sont clarifiées (pas de cycles)

**Given** je parcours les tests
**When** j'identifie des tests manquants pour code critique (services, API, composants)
**Then** les tests manquants sont ajoutés (coverage >80% pour code critique)
**And** les tests existants sont maintenus (pas de régression)

**Technical Requirements:**
- Analyse : Outil analyse code (SonarQube, ESLint, Pylint) pour identifier code smells
- Refactorisation : Respecter patterns existants (Zustand, FastAPI, React)
- Tests : Maintenir coverage >80% après refactorisation (pas de régression)
- Documentation : Mettre à jour documentation si architecture change significativement
- Review : Code review obligatoire avant merge (workflow code-review)

**Dev Notes:**

**Zones critiques à vérifier :**
- `frontend/src/components/graph/GraphEditor.tsx` (1170 lignes - potentiellement trop gros)
- `frontend/src/store/graphStore.ts` (1075 lignes - vérifier si peut être décomposé)
- Services backend avec logique métier complexe

**Critères refactorisation :**
- Composant >500 lignes → Décomposer
- Fonction >50 lignes → Extraire logique
- Code dupliqué >3 occurrences → Créer utilitaire/hook
- Tests coverage <80% pour code critique → Ajouter tests

**References:** NFR-M1 (Maintainability), Architecture Document (patterns), Epic 0 (infrastructure)

---

### Story 0.9.4: Organisation application pour mise en ligne (deployment readiness)

As a **développeur déployant l'application**,
I want **que l'application soit organisée et prête pour le déploiement en production**,
So that **je peux déployer facilement et maintenir l'application en production**.

**Acceptance Criteria:**

**Given** je prépare le déploiement
**When** je vérifie la configuration
**Then** toutes les variables d'environnement sont documentées (`.env.example` à jour)
**And** les secrets ne sont pas hardcodés dans le code

**Given** je vérifie la structure du projet
**When** je parcours les fichiers
**Then** les fichiers sensibles sont dans `.gitignore` (`.env`, logs, données utilisateur)
**And** la structure est organisée (pas de fichiers orphelins ou obsolètes)

**Given** je vérifie les dépendances
**When** je parcours `package.json` et `requirements.txt`
**Then** toutes les dépendances sont à jour (pas de vulnérabilités critiques)
**And** les versions sont verrouillées (lock files présents)

**Given** je vérifie la documentation
**When** je parcours `README.md` et `docs/`
**Then** la documentation est à jour (instructions installation, configuration, déploiement)
**And** les exemples sont fonctionnels

**Given** je prépare le build de production
**When** je lance le build
**Then** le build frontend (React) génère des assets optimisés (minification, tree-shaking)
**And** le build backend (FastAPI) est prêt pour déploiement (Docker ou serveur)

**Technical Requirements:**
- Configuration : Vérifier `.env.example` contient toutes les variables nécessaires
- Sécurité : Audit sécurité (pas de secrets hardcodés, validation inputs, CORS configuré)
- Build : Scripts build production (`npm run build`, `python -m build`)
- Déploiement : Documentation déploiement (Docker, serveur, CI/CD si applicable)
- Monitoring : Configuration logging production (niveaux logs, rotation fichiers)
- Tests : Tests E2E passent en environnement production-like

**Dev Notes:**

**Checklist déploiement :**
- [ ] Variables d'environnement documentées (`.env.example`)
- [ ] Secrets dans variables d'environnement (pas hardcodés)
- [ ] `.gitignore` à jour (exclut fichiers sensibles)
- [ ] Dépendances à jour (audit sécurité)
- [ ] Build production fonctionne (`npm run build`, backend prêt)
- [ ] Documentation à jour (`README.md`, `docs/`)
- [ ] Tests passent (unit + integration + E2E)
- [ ] Logging configuré (production-ready)
- [ ] CORS configuré (si API publique)
- [ ] Health check endpoint (`/api/v1/health`)

**References:** NFR-D1 (Deployment Readiness), Architecture Document (déploiement), Epic 0 (infrastructure)

---

## 📊 Estimation Effort

### Effort Total Estimé (Mise à jour après exploration et décisions)
- **Story 0.9.1 (Bugs comportement) :** 4-6 jours (CRITIQUE)
  - Suivi TestNodes parent : 2-3h
  - Détection collision + ajustement auto : 3-4h
  - Toggle on/off collision : 1h
  - Correction auto-layout : 2-3h
  - Tests et validation : 1 jour
- **Story 0.9.2 (Fluidité UX) :** 3-5 jours
  - Feedback visuel nodes squelettes : 4-6h
  - Interaction graphe pendant génération : 2-3h
  - Tests et validation : 1 jour
- **Story 0.9.3 (Refactorisation) :** 3-5 jours (si nécessaire)
- **Story 0.9.4 (Deployment readiness) :** 2-3 jours
- **Total :** 12-19 jours (2.5-4 semaines pour 1 développeur)

### Recommandation Sprint (Objectif 3 jours - Scope réduit)
**Sprint de préparation production (3 jours - scope ciblé) :**
- Story 0.9.1 (CRITIQUE) : 2-3 jours - Focus sur bugs bloquants
  - ✅ Suivi TestNodes parent (2-3h)
  - ✅ Détection collision + toggle (4-5h)
  - ✅ Correction auto-layout (2-3h)
  - ⏭️ Tests complets (reporté si nécessaire)
- Story 0.9.2 (HAUTE) : 1 jour - Feedback visuel prioritaire
  - ✅ Nodes squelettes pendant génération (4-6h)
  - ⏭️ Autres optimisations (reportées si nécessaire)
- Story 0.9.3 (MOYENNE) : ⏭️ Reportée si code déjà propre
- Story 0.9.4 (MOYENNE) : ⏭️ Reportée si déploiement non immédiat

**Note :** Scope ajusté pour respecter contrainte 3 jours. Stories 0.9.3 et 0.9.4 peuvent être reportées si non critiques pour MVP.

---

## 🔗 Dépendances

### Dépendances Identifiées
- **Epic 0** : Doit être terminé ou presque terminé (stories critiques done)
- **Aucune dépendance entre stories** - Stories peuvent être travaillées en parallèle

### Ordre Recommandé
1. **Story 0.9.1** (CRITIQUE) - Commencer immédiatement
2. **Story 0.9.2** - En parallèle si possible
3. **Story 0.9.3** - Après analyse code (peut être optionnel si code déjà propre)
4. **Story 0.9.4** - Avant déploiement final

---

## ✅ Definition of Done

Une story est considérée "done" quand :
- [ ] Tous les Acceptance Criteria sont satisfaits
- [ ] Code implémenté et testé (unit + integration + E2E si applicable)
- [ ] Tests passent (>80% coverage pour code critique)
- [ ] Code review effectué (workflow `code-review`)
- [ ] Documentation mise à jour si nécessaire
- [ ] Story marquée `done` dans `sprint-status.yaml`
- [ ] Aucune régression introduite (tests existants passent)

---

## 📈 Métriques de Succès

### Métriques Techniques
- **Zero Blocking Bugs** : Story 0.9.1 élimine tous les bugs comportement bloquants
- **UX Fluide** : Story 0.9.2 élimine friction et latence perceptible
- **Code Maintenable** : Story 0.9.3 améliore maintenabilité (si nécessaire)
- **Deployment Ready** : Story 0.9.4 prépare application pour production

### Métriques Business
- **Production Readiness** : Application stable et prête pour mise en ligne
- **User Satisfaction** : Expérience fluide sans frustration
- **Maintainability** : Code propre et facile à maintenir

---

**Document créé le :** 2026-01-23  
**Statut :** ✅ Epic créé, prêt pour création stories détaillées
