### Epic 16: Implémentation ADR-008 – Pipeline document canonique Unity JSON

**CONTEXTE CRITIQUE** : Le pipeline actuel a une SoT en mémoire = nodes/edges (store) et une conversion backend (JSON → graphe au load, graphe → JSON au save). L’objectif est **une seule implémentation cohérente** : document canonique = Unity Dialogue JSON partout ; backend propriétaire ; frontend envoie le document (pas nodes/edges) ; identités stables (choiceId). Pas de livrable intermédiaire qui laisse le système en état hybride.

**Objectif (non négociable)** : Architecture propre, SOLID, KISS, DRY – une seule source de vérité (document canonique), pas de dette technique. Référence : `objectifs-contraintes-implementation-adr-008.md` et ADR-008 dans `architecture/v10-architectural-decisions-adrs.md`.

**Périmètre ADR-008** : Document canonique v1.1.0 (schemaVersion, choices[].choiceId) ; backend propriétaire (GET/PUT document, revision, 409) ; layout artefact distinct (sidecar, même concurrence) ; frontend SoT = document + layout, nodes/edges = projection dérivée, IDs stables (choiceId) ; migration one-shot choiceId ; validation draft vs export ; refus docs sans choiceId pour schemaVersion >= 1.1.0.

**Contraintes** : Zéro régression (tests, non-régression). Unity mis à jour après DG. Priorité absolue.

**Position produit (petite équipe, petit groupe utilisateur)** : **Robustesse d’abord, flexibilité optionnelle.** Pas de rétrocompatibilité avec l’ancien modèle (nodes/edges comme payload) ; tolérance minimale : uniquement le strict nécessaire pour la migration one-shot (chargement d’anciens fichiers pour les migrer), puis format strict v1.1.0 partout. Pas de feature flag ni de coexistence longue ; bascule directe vers le nouveau pipeline.

**Related ADR:** ADR-008 (Pipeline document canonique Unity JSON – Backend propriétaire, SoT document, choiceId, layout partagé)

---

## ⚠️ GARDE-FOUS – Vérification de l’Existant (Scrum Master)

**OBLIGATOIRE avant création de chaque story de cet epic :**

1. **Fichiers / schémas** : Vérifier `docs/resources/dialogue-format.schema.json`, `api/routers/dialogues.py`, stores frontend (graphStore, etc.), services persistance.
2. **Pas de bricolage** : Chaque livrable doit faire progresser vers l’état cible ADR-008 ; pas de couche de contournement (ex. garder en parallèle nodes/edges comme SoT).
3. **AC conformité** : Chaque story doit avoir des critères d’acceptation explicites « conforme ADR-008 » et « pas de régression sur [scénarios] ».

---

### Story 16.1: Schéma JSON v1.1.0 et choiceId (Fondations)

As a **développeur / système**,
I want **que le schéma Unity Dialogue JSON soit en v1.1.0 avec schemaVersion et choices[].choiceId requis**,
So that **tout le pipeline partage une référence unique et les identités (choiceId) sont stables**.

**Acceptance Criteria (conforme ADR-008) :**

**Given** le schéma Unity Dialogue JSON (ex. `docs/resources/dialogue-format.schema.json`)
**When** un document est validé pour schemaVersion 1.1.0
**Then** `schemaVersion` est requis et fixé à "1.1.0"
**And** chaque entrée dans `choices[]` a un champ `choiceId` requis (format libre, stable)

**Given** un document sans choiceId pour schemaVersion >= 1.1.0
**When** on tente une validation export (bloquant)
**Then** la validation échoue avec erreur structurée (refus document sans choiceId)

**Technical Requirements:**
- Mettre à jour le schéma JSON (ou équivalent) pour v1.1.0 : `schemaVersion`, `choices[].choiceId` requis ; `node.id` en SCREAMING_SNAKE_CASE ; pseudo-nœud END documenté si référencé (ADR-008).
- Document de synthèse architecture (si pas déjà présent) : déposer dans `docs/architecture/` (ex. `pipeline-unity-backend-front-architecture.md`).

**Dev Notes:** Jalon 0 – Fondations. Pas encore de changement API ni store ; uniquement schéma et doc. Référence : ADR-008 Technical Design (Modèle de données).

---

### Story 16.2: Backend document – GET/PUT, revision, 409

As a **frontend ou client API**,
I want **des endpoints GET/PUT par document avec revision et gestion des conflits (409)**,
So that **le backend soit le propriétaire du document canonique et que les conflits soient gérés proprement**.

**Acceptance Criteria (conforme ADR-008) :**

**Given** un endpoint GET document existe (ex. GET /documents/{id})
**When** j’appelle GET
**Then** la réponse contient `{ document, schemaVersion, revision }`
**And** le backend ne reconstruit pas le document à partir d’un graphe UI ; il sert le document persisté

**Given** un endpoint PUT document existe (ex. PUT /documents/{id}) avec payload `{ document, revision }`
**When** j’envoie un document valide (v1.1.0, choiceId présents) avec la revision courante
**Then** le backend valide et normalise le document sans casser choiceId, ordre des choices[], node.id
**And** la réponse contient `{ revision, validationReport }` (validationReport : liste d’erreurs structurées, ex. code + message)
**And** en cas de conflit (revision obsolète), le backend retourne 409 + dernier état

**Given** un client envoie un payload contenant nodes/edges (ancien contrat) au lieu du document
**When** le backend reçoit la requête PUT
**Then** le backend refuse la requête (ex. 400) avec erreur structurée indiquant que seul le document canonique est accepté (pas de rétrocompatibilité)

**Given** la validation distingue draft (non bloquant, autosave autorisé) et export (bloquant)
**When** une validation échoue en mode draft
**Then** les erreurs sont structurées mais n’empêchent pas la sauvegarde draft
**When** une validation échoue en mode export
**Then** l’export est refusé avec erreurs structurées

**Technical Requirements:**
- Backend : Endpoints (cible P0) GET /documents/{id}, PUT /documents/{id} ; persistance document ; revision ; 409 sur conflit. Pas de support de l’ancien contrat nodes/edges.
- Backend : Ne jamais reconstruire le document à partir d’un graphe UI ; valider/normaliser le document reçu. validationReport : structure cohérente (ex. erreurs[].{ code, message, path }).

**Dev Notes:** Jalon 1 – Backend document. API parle uniquement en « document canonique » ; pas d’échange nodes/edges ; pas de rétrocompatibilité. Référence : ADR-008 Backend, Constraints.

---

### Story 16.3: Backend layout – sidecar, même concurrence

As a **frontend ou client API**,
I want **que le layout (positions, zoom) soit un artefact distinct persisté côté backend avec les mêmes règles de revision/conflit**,
So that **le layout soit partagé par document et cohérent avec le document**.

**Acceptance Criteria (conforme ADR-008) :**

**Given** le layout est un artefact séparé (ex. `*.layout.json` ou équivalent)
**When** je sauvegarde ou charge un document
**Then** le layout associé est persisté/chargé côté backend (ex. sidecar)
**And** le layout est soumis aux mêmes règles de revision et concurrence que le document (GET/PUT layout, 409 sur conflit)

**Technical Requirements:**
- Backend : Persistance layout (sidecar ou équivalent), même mécanisme revision/concurrence que le document.

**Dev Notes:** Jalon 2 – Backend layout. Référence : ADR-008 Layout partagé.

---

### Story 16.4: Frontend SoT document + layout, projection, IDs stables

As a **utilisateur éditant un dialogue dans le graphe**,
I want **que le frontend ait pour SoT le document (et le layout) et que nodes/edges soient une projection dérivée avec identités stables (choiceId)**,
So that **je n’envoie plus nodes/edges au save et que les identités UI ne « sautent » plus**.

**Acceptance Criteria (conforme ADR-008) :**

**Given** le store frontend
**When** un dialogue est chargé ou édité
**Then** la SoT contenu = `document` (Unity JSON) ; la SoT layout = `layout`
**And** nodes/edges = projection dérivée uniquement (pas de SoT nodes/edges)

**Given** les identités UI
**Then** node id = `node.id` (SCREAMING_SNAKE_CASE, ADR-008) ; choice handle = `choice:${choiceId}` ; TestNode id = `test:${choiceId}` ; edge ids basés sur la sortie (ex. `e:${nodeId}:choice:${choiceId}:target`), jamais sur la destination seule

**Given** la sauvegarde (autosave ou manuelle)
**When** le frontend envoie les données au backend
**Then** le frontend envoie le **document** (et optionnellement le layout) ; il n’envoie **pas** nodes/edges

**Given** la saisie (form local, debounce/throttle/blur)
**When** l’utilisateur édite line/speaker/choice
**Then** la projection ne provoque pas de reset du panel ; les identités restent stables

**Technical Requirements:**
- Frontend : Refactor store – SoT = document + layout ; projection document → nodes/edges ; IDs stables (choiceId pour handles, edgeId basé sur sortie).
- Frontend : Save : envoyer document (+ layout) uniquement.

**Dev Notes:** Jalon 3 – Frontend SoT. Contrainte ADR-008 : « Le frontend NE DOIT PLUS envoyer nodes/edges au backend pour le save ». Référence : ADR-008 Frontend, Constraints.

---

### Story 16.5: Migration choiceId, tolérance minimale, refus sans choiceId

As a **système / opérateur**,
I want **un outil one-shot pour ajouter choiceId aux documents existants, une tolérance minimale limitée à la migration, puis refus strict des docs sans choiceId pour schemaVersion >= 1.1.0**,
So that **la migration soit propre et le format courant soit strict (robustesse d’abord)**.

**Acceptance Criteria (conforme ADR-008) :**

**Given** un outil one-shot (script ou commande) existe
**When** je l’exécute sur des fichiers/fixtures existants
**Then** chaque choice sans choiceId reçoit un choiceId stable (ex. UUID ou dérivé déterministe)
**And** les documents sont écrits avec schemaVersion 1.1.0
**And** l’outil est idempotent : les choiceId déjà présents ne sont pas modifiés

**Given** la lecture (load document) en contexte de migration uniquement
**When** un document ancien (sans choiceId ou schemaVersion < 1.1.0) est chargé par l’outil one-shot ou par un chemin dédié migration
**Then** une tolérance minimale est appliquée (ex. génération choiceId à la volée pour permettre la migration) ; pas de tolérance en production pour les flux normaux

**Given** un document avec schemaVersion >= 1.1.0 n’a pas de choiceId
**When** il est chargé ou validé (flux normal, hors migration)
**Then** le chargement/validation export refuse le document avec erreur structurée (pas de génération à la volée en production)

**Technical Requirements:**
- Outil one-shot : ajout choiceId à tous les choices des documents ciblés ; écriture schemaVersion 1.1.0 ; idempotent.
- Backend / frontend : tolérance minimale uniquement dans le chemin de migration one-shot ; en production, refus strict pour tout document v1.1.0 sans choiceId.

**Dev Notes:** Jalon 4 – Migration et durcissement. Pas de rétrocompatibilité ; tolérance minimale = migration uniquement. Référence : ADR-008 Migration, décision 5.

---

### Story 16.6: Tests golden, E2E, perf, non-régression

As a **équipe / qualité**,
I want **des tests golden (projection, IDs stables), E2E (édition, connect/disconnect, dupliquer, reload layout) et perf (borne confort/stress), et une vérification de non-régression**,
So that **on vise zéro régression et la cible perf ADR-008**.

**Acceptance Criteria (conforme ADR-008) :**

**Given** des tests golden
**Then** JSON → projection nodes/edges avec IDs stables, edgeIds stables ; changement de cible → edgeId inchangé

**Given** des tests E2E
**Then** édition line/speaker/choice sans perte ; connecter/déconnecter ; dupliquer nœud (nouveaux node.id et choiceId, refs effacées) ; reload avec layout

**Given** des tests de concurrence
**Then** deux clients effectuant PUT concurrent sur le même document : l’un reçoit 200, l’autre 409 + dernier état ; le client en 409 peut recharger et réessayer

**Given** des tests de migration
**Then** l’outil one-shot est idempotent (ré-exécution ne modifie pas les choiceId existants) ; documents migrés refusés s’ils sont rechargés sans choiceId en mode strict

**Given** des tests perf
**Then** cible confort + borne stress (milliers de nœuds, 4/8 choices selon métier) ; p95 load/drag/frappe mesuré (ex. p95 load < seuil raisonnable pour N nœuds, pas de nœuds invisibles)

**Given** la batterie de tests existante (API, E2E, front)
**When** les changements ADR-008 sont livrés
**Then** aucune régression sur les scénarios couverts ; les AC de chaque story 16.1–16.5 sont couverts par des tests

**Technical Requirements:**
- Golden : tests de projection document → nodes/edges, stabilité edgeId.
- E2E : scénarios ADR-008 (édition, connexion, duplication, reload layout).
- Concurrence : scénario 409 (deux PUT, un 200 un 409).
- Migration : idempotence outil one-shot, refus strict hors migration.
- Perf : seuils mesurables (p95 load/drag/frappe) selon ADR-008 ; documenter seuils ou référence doc test.

**Dev Notes:** Jalon 5 – Qualité. Référence : ADR-008 Tests Required, objectifs-contraintes (zéro régression).
