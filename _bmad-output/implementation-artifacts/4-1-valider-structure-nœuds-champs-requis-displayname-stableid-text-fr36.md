# Story 4.1 : Valider structure nœuds (champs requis : DisplayName, stableID, text)

Status: ready-for-dev

<!-- Note: Validation optionnelle. Exécuter validate-create-story avant dev-story si besoin. -->

## Story

As a **utilisateur créant des dialogues**,
I want **valider que tous les nœuds ont les champs requis (DisplayName, stableID, text)**,
so that **je peux détecter les erreurs structurelles avant export et garantir la conformité Unity**.

## Acceptance Criteria

1. **Given** un dialogue avec plusieurs nœuds, **When** je lance une validation structurelle, **Then** chaque nœud pertinent est vérifié pour DisplayName, stableID et text ; **And** les erreurs listent nœud + champ manquant.
2. **Given** un nœud sans DisplayName (vide / absent / non significatif selon règle métier définie en Dev Notes), **When** validation, **Then** message du type « Nœud [stableID] : DisplayName manquant » ; **And** surlignage rouge sur le graphe ; **And** clic sur l’erreur → sélection / focus du nœud.
3. **Given** un nœud sans stableID cohérent avec le modèle document (id technique manquant alors qu’exigé), **When** validation, **Then** message « Nœud [index] : stableID manquant » si pas d’id utilisable ; **And** action UI « Générer stableID » proposée pour corriger.
4. **Given** un nœud dialogue sans texte (pas de `line` ni `choices` exploitables — chevauchement contrôlé avec 4.2 : 4.1 = conformité champs requis export Unity, 4.2 = sémantique « vide » étendue), **When** validation, **Then** erreur explicite ; **And** marquage visuel « vide / invalide » sur le graphe.
5. **Given** graphe valide structurellement, **When** validation, **Then** message de succès du type « Validation structurelle : 0 erreurs ».
6. **NFR-P3** : la validation côté API reste rapide (cible &lt; 200 ms pour graphes typiques ; documenter / tester sur taille référence).

## Tasks / Subtasks

- [ ] **Task 1** : Règles backend — erreurs structurelles alignées FR36 (AC: #1, #2, #3, #4, #6)  
  - [ ] 🔴 Test échoue : pour un payload graphe avec nœud dialogue sans `displayName` (ou vide selon règle), sans id stable attendu, ou sans `line`/`choices`, `GraphValidationService.validate_graph` produit des erreurs typées avec `node_id` / index et messages stables ; succès → 0 erreur structurelle de ce groupe.  
  - [ ] 🟢 Étendre `services/graph_validation_service.py` (et contrat renvoyé par l’endpoint validate existant) pour couvrir DisplayName, stableID et text requis sans casser les validations déjà livrées (orphelins, cycles, etc.). Voir Dev Notes pour forme des nœuds.  
  - [ ] 🔵 Refactor : factoriser l’extraction des champs depuis nœud React Flow **et** forme document (`id` racine vs `data`) pour éviter duplication entre nouvelles règles et `_validate_node_content` ; si déjà satisfait après GREEN, refactor sur lisibilité des messages / constantes de `error_type` et nommage des tests.

- [ ] **Task 2** : Contrat API + non-régression (AC: #1, #6)  
  - [ ] 🔴 Test échoue : `POST /api/v1/unity-dialogues/graph/validate` retourne les nouveaux codes/types d’erreur dans le JSON attendu par le frontend (`errors[]` avec `type`, `message`, `severity`, `node_id`).  
  - [ ] 🟢 Ajuster router/service si nécessaire pour sérialiser les nouveaux types ; mettre à jour ou ajouter tests dans `tests/api/test_graph_validate.py` / `tests/api/test_graph_crud.py` en cohérence avec les chemins réels.  
  - [ ] 🔵 Refactor : mutualiser fixtures graphe minimal entre tests API et tests service si duplication non triviale apparaît ; sinon clarifier noms de cas pytest (given/when explicite dans le docstring).

- [ ] **Task 3** : Panneau validation — libellés, navigation, action stableID (AC: #2, #3)  
  - [ ] 🔴 Test échoue : avec erreurs mockées ou API, `GraphValidationPanel` affiche un regroupement lisible pour les nouveaux `type` ; clic sur une ligne avec `node_id` appelle la sélection de nœud (store) ; présence ou accessibilité de l’action « Générer stableID » lorsque l’erreur concerne stableID manquant.  
  - [ ] 🟢 Mettre à jour `frontend/src/components/graph/GraphValidationPanel.tsx`, `ICON_FOR_TYPE` / `LABEL_FOR_TYPE`, types dans `frontend/src/types/graph.ts` si besoin ; brancher génération stableID sur utilitaires / actions store existants (pas de nouvelle roue).  
  - [ ] 🔵 Refactor : si le panneau grossit, extraire une petite sous-composante « liste d’erreurs par type » ou hook `useValidationPanelErrors` pour respecter ~300 lignes fichier et clarifier les handlers de clic.

- [ ] **Task 4** : Surlignage graphe des nœuds en erreur structurelle (AC: #2, #4)  
  - [ ] 🔴 Test échoue : étant donné `validationErrors` contenant au moins une erreur structurelle FR36 avec `node_id`, le nœud correspondant sur le canvas reçoit un style distinctif (bordure / classe erreur rouge) jusqu’à correction ou nouvelle validation.  
  - [ ] 🟢 Implémenter via React Flow (`nodeClassName`, `style` ou data dérivée du store) en réutilisant les patterns déjà utilisés pour états sélection / warning ; éviter de dupliquer la logique de résolution d’id.  
  - [ ] 🔵 Refactor : centraliser le calcul « set des node_id en erreur » dans un sélecteur store ou memo pour éviter recalculs et garder un seul endroit pour futurs types d’erreurs.

## Dev Notes

- **Garde-fous architecture** : logique métier validation dans `services/` ; router `api/routers/` mince ; injection via `ServiceContainer` / `Depends` ; pas de singleton global. Frontend : pas de logique métier côté client au-delà de présentation et actions déjà existantes (sauvegarde, sélection). ADR-003 : `node.id` (React Flow) = identifiant stable ; `displayName` dans `data` pour l’affichage — la validation doit être cohérente avec le modèle document Unity v1.1.0 (`_bmad-output/project-context.md`).
- **Réutiliser** : `GraphValidationService.validate_graph`, endpoint déjà exposé sous **`POST /api/v1/unity-dialogues/graph/validate`** (le PRD épique mentionne `/api/v1/graph/validate` — **chemin canonique = unity-dialogues** comme `frontend/src/api/graph.ts`). Composant UI : **`GraphValidationPanel.tsx`** (pas `ValidationPanel.tsx`). Store : `validateGraph` dans `uiSlice` / `useGraphStore`.
- **Cartographie existante** : `_validate_node_ids` vérifie la présence d’un id (racine ou `data.id`) ; `_validate_node_content` vérifie `line`/`choices` pour `dialogueNode` et `test` pour `testNode`. La story **affine** les messages et types pour FR36 (DisplayName, stableID explicite, text) sans supprimer les comportements utiles existants.
- **Qualité / tests** : pytest miroir `tests/services/`, `tests/api/` ; Vitest pour UI critique ; pas de données GDD réelles dans les tests. Conserver verts les tests existants `test_graph_validation_service.py`, e2e validate si touchés.
- **Barre refactor (défaut dev-story)** : ~300 lignes par fichier source touché, ~60 lignes par fonction, pas de duplication non triviale, responsabilité unique.
- **NFR-P3** : si la validation supplémentaire risque de dépasser 200 ms sur gros graphes, documenter dans les tests ou commentaire service la complexité attendue et éviter scans répétés inutiles.

### Project Structure Notes

- Backend : `services/graph_validation_service.py`, route validate dans `api/routers/` (graph / unity-dialogues).  
- Frontend : `frontend/src/components/graph/GraphValidationPanel.tsx`, `GraphEditor.tsx`, `GraphCanvas` / nœuds custom si styles dynamiques, `frontend/src/store/slices/uiSlice.ts`, `frontend/src/api/graph.ts`.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-04.md` — Story 4.1, FR36, NFR-P3]  
- [Source: `_bmad-output/project-context.md` — Unity JSON, documents vs graphe, tests]  
- [Source: `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md` — ADR-003 DisplayName vs stableID]

## Dev Agent Record

### Agent Model Used

_(À compléter par l’agent dev)_

### Debug Log References

### Completion Notes List

### File List

---

## Developer context (garde-fous)

### Exigences techniques

- Nouveaux `error_type` stables côté backend (ex. `missing_display_name`, `missing_stable_id`, `missing_dialogue_text` — noms à figer dans l’implémentation et réutilisés par le frontend pour icônes/libellés).  
- Messages utilisateur en français, cohérents avec l’épique.  
- `node_id` renseigné quand un id existe ; sinon index explicité dans le message (AC stableID).

### Conformité architecture

- Respect strict des couches `api` → `services` ; types Pydantic / TS alignés.  
- Pas d’endpoint parallèle : extension du flux validate existant.

### Bibliothèques / frameworks

- Python 3.10+, FastAPI, Pydantic v2 ; React 18, React Flow 11, Zustand — versions déjà projet ; pas de nouvelle dépendance sauf justification forte.

### Structure fichiers

- Ne pas créer de second service de validation parallèle ; étendre `GraphValidationService`.  
- Tests au bon emplacement miroir.

### Exigences de test

- Unit : règles par type de nœud (dialogue, test, START/END exclus selon règles actuelles).  
- Intégration : POST validate avec payload minimal.  
- Frontend : au moins un test composant ou store pour navigation + libellés si faisable sans sur-mock.

## Previous story intelligence

- Story 4.1 est la **première** de l’épique 4 : pas de story file `4-0-*` dans le même epic.  
- Épique 3 et 0 ont livré validation cycles, graphe stable, sync GDD — réutiliser les patterns de tests API et de store déjà présents pour le graphe.

## Git intelligence summary

- Travail récent sur branche : sync GDD Notion, fingerprinting (`git log` : commits « GDD Notion sync », « content fingerprinting »).  
- Impact : prudence sur conflits éventuels dans zones `services/` liées au contexte ; la story 4.1 reste centrée validation graphe.

## Latest technical information

- Pas de upgrade majeur requis pour cette story ; React Flow 11 et FastAPI actuels suffisent. Vérifier changelog interne si toucher `reactflow` props (`nodeClassName`).

## Project context reference

- Lire `_bmad-output/project-context.md` avant implémentation (règles imports Python, chemins API, interdiction tests sur entités GDD réelles).

## Story completion status

- **Statut** : ready-for-dev  
- **Note** : Analyse contexte « ultimate story » terminée — garde-fous alignés sur le code réel (endpoint `unity-dialogues`, `GraphValidationPanel`, `GraphValidationService`).
