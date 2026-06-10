# Story 4.3 : Détecter contradictions lore explicites (faits GDD conflictuels)

Status: done

<!-- Note : validation optionnelle. Exécuter validate-create-story avant dev-story si besoin. -->

## Story

As a **utilisateur créant des dialogues**,
I want **détecter les contradictions lore explicites (faits GDD conflictuels)**,
so that **je peux garantir la cohérence narrative et corriger les incohérences**.

## Acceptance Criteria

1. **Given** un dialogue avec contexte GDD (données chargées côté serveur), **When** je lance une validation lore, **Then** le contenu textuel des nœuds est confronté à des **faits structurés** issus du GDD ; **And** les **contradictions explicites** (ex. état contradictoire d’une même entité : mort vs vivant, lieu détruit vs existant) sont remontées comme **erreurs** avec nœud concerné.
2. **Given** une contradiction explicite sur une entité (ex. dialogue affirme « X est mort » alors que le GDD indique « X est vivant »), **When** validation lore, **Then** le message est actionnable (qui, quoi dans le dialogue, quoi dans le GDD) ; **And** une **référence GDD** est fournie (au minimum : nom d’entité, catégorie / identifiant stable côté données, extrait ou champ source) pour vérification ; **And** le **nœud** est identifiable pour navigation UI.
3. **Given** plusieurs contradictions, **When** validation, **Then** elles sont **toutes listées** ; **And** un **résumé** du type « X contradictions détectées dans Y nœuds » (ou équivalent exact sur les compteurs) est disponible dans la réponse API et reflété dans l’UI.
4. **Given** un écart **non explicite / ambigu**, **When** validation, **Then** ce cas est classé en **warning** « potentiel » (pas erreur bloquante) — périmètre détaillé Story **4.4** ; **And** le contrat (type / sévérité) est **stable** pour extension ultérieure sans casser les clients.
5. **Intégration produit** : déclenchement depuis l’éditeur (bouton ou flux cohérent avec la validation graphe existante) ; pas de logique lore **dupliquée** côté client pour prétendre valider sans API.
6. **Tests** : unitaires sur le service (jeux de données **synthétiques** — pas de personnages/lieux réels du GDD en dur, conformément `project-context.md`) ; tests API sur le contrat ; au moins un test frontend (RTL) sur l’affichage et la navigation si l’UI est branchée.
7. **Perf** : documenter ou respecter une cible raisonnable (la passe lore peut être plus coûteuse que FR36 ; éviter explosion O(n²) inutile sur les gros graphes — à chiffrer dans les notes de perf si besoin).

## Tasks / Subtasks

- [x] **Task 1** : Service lore + endpoint + schéma de réponse (AC: #1, #2, #3, #4, #6, #7)  
  - [x] 🔴 Tests : contradictions **explicites** → `severity: error`, `type=lore_contradiction_explicit` ; ambiguïtés **AC #4** → `severity: warning`, `type=lore_contradiction_potential` ; résumé + compteurs explicites + `warnings` + champs `potential_warnings_count` / `nodes_with_potential_warnings_count`.  
  - [x] 🟢 `services/lore_contradiction_validator.py` + `POST /api/v1/unity-dialogues/graph/validate-lore-explicit` (aligné routeur graphe existant) ; schémas `api/schemas/graph.py` ; faits via `gdd_lore_facts` + `ContextBuilder.build_context_json` (`Depends(get_context_builder)`).  
  - [x] 🔵 Extraction faits / texte : modules `lore_contradiction_validator` + `graph_dialogue_text` ; logging warning si build contexte échoue (non silencieux).

- [x] **Task 2** : UI — liste, résumé, navigation nœud, références GDD (AC: #2, #3, #5)  
  - [x] 🔴 Tests RTL : résumé lore, badge Lore, clic → focus (GraphValidationPanel) ; store `graphStore.loreValidation.test.ts`.  
  - [x] 🟢 `validateLoreExplicit` dans `uiSlice`, `graph.ts`, types `frontend/src/types/graph.ts` ; panneau + listes + menu Actions.  
  - [x] 🔵 Libellés centralisés `validationPanelLabels.ts`.

- [x] **Task 3** : Surlignage des nœuds « lore » sur le graphe (AC: #2)  
  - [x] 🔴 Tests : `getValidationHighlightKind` inclut `lore` sous structure/contenu.  
  - [x] 🟢 `GraphCanvas` + nœuds Dialogue/Test/End + thème `state.lore`.  
  - [x] 🔵 Priorité : structure > contenu > lore (documentée dans `graphStructuralValidation.ts`).

## Dev Notes

- **Garde-fous architecture** : logique dans `services/` ; routers minces ; `ConfigurationService` pour chemins ; pas de singletons hors conteneur. Réponses et erreurs via schémas Pydantic + exceptions projet.
- **Réutiliser** : `ContextBuilder` / chargement GDD déjà utilisé ailleurs ; patterns de `GraphValidationService` et de `POST .../graph/validate` comme référence de **forme** (erreurs typées, `node_id`, sévérité) — la validation lore est **orthogonale** à la validation structurelle : ne pas mélanger les responsabilités dans un seul god-method ; en revanche l’**expérience** utilisateur peut regrouper les résultats dans le même panneau ou onglet.
- **Epic vs code** : l’épique cite parfois `/api/v1/dialogues/{id}/validate-lore` et `LoreValidationPanel.tsx` — **valider** les chemins réels dans `api/routers` et `frontend/src` avant de nommer les fichiers ; l’important est le **contrat** REST + UX, pas le nom du fichier epic.
- **Frontière 4.3 / 4.4** : 4.3 = contradictions **explicites** (erreurs) + signalisation minimale des **potentielles** (warnings). 4.4 = richesse des heuristiques « review humaine », filtres, préférences ignorées, etc.
- **Qualité tests** : interdit de dépendre d’entités GDD réelles ; mocker le contexte ou utiliser JSON minimal.
- **Barre refactor (défaut dev-story)** : ~300 lignes par fichier touché, ~60 lignes par fonction, pas de duplication non triviale.

### Project Structure Notes

- Backend : nouveau service sous `services/` ; router probablement `api/routers/documents.py` ou routeur dédié inclus dans `api/main.py` selon cohésion équipe.  
- Frontend : `frontend/src/components/graph/`, `frontend/src/store/`, `frontend/src/api/`.  
- GDD : données sous `data/GDD_categories/` (env) — pas d’hypothèse POSIX.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-04.md` — Story 4.3, FR38, frontière 4.4]  
- [Source: `_bmad-output/implementation-artifacts/4-2-détecter-nœuds-vides-contenu-texte-manquant-fr37.md` — patterns validation UI, endpoint canon graphe, follow-ups éventuels]  
- [Source: `_bmad-output/project-context.md` — documents canoniques, tests sans entités GDD réelles, ContextBuilder, structure API]

### Architecture Compliance

- Conserver la séparation **React (présentation) / FastAPI (contrat) / services (métier)**. Auth : routes protégées comme le reste des dialogues/documents. Pas de logique lore dans les composants hors appel API.

### Library / Framework Requirements

- Pas de nouvelle dépendance lourde sans justification ; si extraction NLP ou LLM devient nécessaire plus tard, ce n’est **pas** le cœur de 4.3 (4.7 = judge LLM). MVP = règles / faits structurés dérivés du GDD.

### File Structure Requirements

- Fichiers nouveaux dans `services/` et `api/schemas/` ; tests miroir `tests/services/`, `tests/api/` ; frontend sous `frontend/src/` avec tests Vitest au bon endroit.

### Testing Requirements

- pytest avec mocks config/GDD ; Vitest pour UI ; respect `.cursor/rules/tests.mdc` et scripts npm du dépôt après modification.

### Previous Story Intelligence

- **4.2 (review)** : validation graphe canon **`POST /api/v1/unity-dialogues/graph/validate`** ; panneau `GraphValidationPanel` + `validationPanelLabels.ts` ; surlignage via `getValidationHighlightKind` / `CONTENT_COMPLETENESS_ERROR_TYPES` ; revalidation après persistance (`runValidationAfterPersist` / `saveDialogue`). Pour 4.3, réutiliser les patterns de **focus nœud** et de **catégories visuelles** plutôt que réinventer un overlay parallèle.  
- Petits follow-ups LOW listés dans 4.2 (docstrings tests, `act(...)` Vitest) : opportunités de nettoyage si le dev touche ces fichiers.

### Git Intelligence Summary

- Travaux récents sur la validation : commits `feat(validation): FR37...` et `FR36...` — conventions de messages et zones `graph_validation_service`, `GraphCanvas`, API graph.

### Latest Tech Information

- FastAPI + Pydantic v2 déjà en place ; réponses typées avec modèles dédiés lore. Pas d’upgrade de stack requis pour le MVP 4.3.

### Project Context Reference

- Voir `_bmad-output/project-context.md` (chemins documents, Unity JSON, règles tests).

## Dev Agent Record

### Agent Model Used

Composer (implémentation agent unique session)

### Debug Log References

- Pytest : `tests/services/test_lore_contradiction_validator.py`, `tests/api/test_graph_validate_lore_explicit.py`
- Vitest : `graphStructuralValidation`, `GraphValidationPanel`, `graphStore.loreValidation`
- `npm run test:backend:fast` : 1494 passed, 1 skipped (2026-04-06)

### Completion Notes List

- **API** : `POST /api/v1/unity-dialogues/graph/validate-lore-explicit` — body : `nodes`, `edges`, `context_selections`, `scene_instruction`, `gdd_lore_facts`. Réponse : `errors` (`lore_contradiction_explicit`), `warnings` (`lore_contradiction_potential`), `summary`, compteurs explicites + potentiels.
- **Faits GDD** : fusion `gdd_lore_facts` + extraction vitalité via `ContextBuilder.build_context_json` → `PromptStructure` (catégories personnages) ; échec build = log warning, pas de 500.
- **Frontière explicite / ambigu** : contradiction explicite = texte vs fait vitalité net ; **warning potentiel** si fiche GDD à signaux vitalité contradictoires et entité citée dans le dialogue, ou si mention vitalité près du nom sans signal vivant/mort exploitable dans le GDD (heuristiques MVP ; 4.4 enrichit).
- **UX** : validation lore **à la demande** uniquement (pas branchée sur `runValidationAfterPersist` après save — aligné note 4.2).
- **Store** : `validateGraph` **réinjecte** les entrées lore (`lore_contradiction_explicit` + `lore_contradiction_potential`) après réponse structurelle pour ne pas les perdre.
- **🔵 Refactor Task 1** : extraction texte nœud/choix → `services/graph_dialogue_text.py` (`before` : logique inline inexistante → `after` : module dédié réutilisable 4.4+).
- **🔵 Refactor Task 3** : badge « Lore » + libellés dans `validationPanelLabels` / `GraphValidationPanelLists` (évite duplication de titres).
- **🔵 Refactor Task 2 (UI)** : pas de sous-composant `LoreContradictionsList` séparé : panneau < 300 lignes ; résumé = bandeau `loreExplicitSummary` dans `GraphValidationPanel`.
### File List

- `services/graph_dialogue_text.py`
- `services/lore_contradiction_validator.py`
- `api/schemas/graph.py`
- `api/routers/graph.py`
- `tests/services/test_lore_contradiction_validator.py`
- `tests/api/test_graph_validate_lore_explicit.py`
- `frontend/src/theme.ts`
- `frontend/src/types/graph.ts`
- `frontend/src/api/graph.ts`
- `frontend/src/store/types/graphState.ts`
- `frontend/src/store/slices/uiSlice.ts`
- `frontend/src/store/slices/persistenceSlice.ts`
- `frontend/src/utils/graphStructuralValidation.ts`
- `frontend/src/components/graph/GraphCanvas.tsx`
- `frontend/src/components/graph/GraphValidationPanel.tsx`
- `frontend/src/components/graph/GraphValidationPanelLists.tsx`
- `frontend/src/components/graph/validationPanelLabels.ts`
- `frontend/src/components/graph/GraphEditor.tsx`
- `frontend/src/components/graph/GraphEditorHeader.tsx`
- `frontend/src/components/graph/nodes/DialogueNode.tsx`
- `frontend/src/components/graph/nodes/TestNode.tsx`
- `frontend/src/components/graph/nodes/EndNode.tsx`
- `frontend/src/__tests__/graphStructuralValidation.test.ts`
- `frontend/src/__tests__/GraphValidationPanel.test.tsx`
- `frontend/src/__tests__/graphStore.loreValidation.test.ts`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/4-3-détecter-contradictions-lore-explicites-faits-gdd-conflictuels-fr38.md`

## Change Log

- 2026-04-06 : Story créée (workflow create-story, Epic 4 — Bob / SM).
- 2026-04-06 : Implémentation FR38 — `validate-lore-explicit`, UI, tests ; sprint → **review**.
- 2026-04-06 : Code review (BMAD) — **Changes Requested** ; statut → **in-progress** ; action items HIGH/MEDIUM (AC #4, `build_lore_summary`, doc perf).
- 2026-04-06 : Correctifs auto (choix workflow **[1]**) — `lore_contradiction_potential`, résumé avec nœuds analysés, doc perf module, schéma/API/UI/store/Canvas ; statut → **review**.
- 2026-04-06 : Statut **done** (sprint + story) — confirmation Marc.

---

## Senior Developer Review (AI)

**Revue :** Amelia (Dev + code-review BMAD) — **Marc** — 2026-04-06  
**Outcome (initial) :** Changes Requested → **corrigé** 2026-04-06 (option fix automatique **[1]**).  
**Outcome (actuel) :** **done** (sprint + story, 2026-04-06, confirmation Marc) — AC #4 couvert (warnings stables) ; résumé zéro-explicite + perf documentée module.

**Preuves exécutées (post-fix) :**

- `pytest tests/services/test_lore_contradiction_validator.py tests/api/test_graph_validate_lore_explicit.py` → 17 passed  
- `npm --prefix frontend run lint` → OK  
- Vitest : `graphStore.loreValidation`, `GraphValidationPanel`, `graphStructuralValidation` → 9 passed  

**Git vs File List :** inchangé (écarts INFO hors story).

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] **AC #4** — `lore_contradiction_potential` + `warnings` API + fusion store + surlignage canvas (warnings comptés dans `getValidationHighlightKind` par nœud).
- [x] [AI-Review][HIGH] **Cohérence story** — Task 1 / Completion Notes alignés sur l’implémentation.
- [x] [AI-Review][MEDIUM] **`build_lore_summary`** — message explicite + comptage `dialogue_nodes_analyzed` ; segment avertissements potentiels si > 0.
- [x] [AI-Review][MEDIUM] **AC #7** — paragraphe perf en docstring module `lore_contradiction_validator.py`.
- [x] [AI-Review][LOW] **Ordre `validationErrors`** — panneau regroupe par `severity` puis par `type` ; `loreKept` conserve les deux types lore après `validateGraph`.

## Story Completion Status

**done** — HIGH/MEDIUM code review traités ; marqué done (sprint + story) sur confirmation — 2026-04-06.

**Tranchées :** (1) endpoint sous `/api/v1/unity-dialogues/graph/validate-lore-explicit` ; (2) couleur lore `theme.state.lore` (violet) ; (3) MVP faits = vitalité personnages depuis `PromptStructure` + override `gdd_lore_facts`.
