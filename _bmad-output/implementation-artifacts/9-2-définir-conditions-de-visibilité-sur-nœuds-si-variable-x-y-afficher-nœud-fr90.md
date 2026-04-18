# Story 9.2: Définir conditions de visibilité sur nœuds (si variable X = Y, afficher nœud)

Status: review

## Story

As a **utilisateur créant des dialogues**,
I want **définir des conditions de visibilité sur les nœuds (si variable X = Y, afficher nœud)**,
So that **je peux créer des branches de dialogue qui ne s’affichent que si certaines conditions sont remplies**.

## Acceptance Criteria

1. **Given** un nœud dans le graphe **When** je sélectionne le nœud et ouvre « Conditions » **Then** un panneau permet d’ajouter des conditions par type : Flag / Réputation **And** les conditions sont persistées avec le dialogue (document canonique).
2. **Given** une condition sur flag `bool` **When** elle est sauvegardée **Then** la représentation stockée permet d’évaluer « flag == true|false » **And** le graphe peut afficher un badge résumé sur le nœud ou le choix concerné.
3. **Given** une condition sur flag `compteur` **When** elle est sauvegardée **Then** les opérateurs `=`, `!=`, `>=`, `<=`, `>`, `<` sont supportés dans le modèle **And** la valeur comparée respecte les bornes catalogue Min/Max.
4. **Given** une condition sur flag `enum` **When** elle est sauvegardée **Then** la valeur comparée est une valeur enum du catalogue **And** le sélecteur UI liste les valeurs dans l’ordre défini (comme Story 9.1).
5. **Given** une condition Réputation (axe × faction × seuil) **When** elle est sauvegardée **Then** elle est sérialisée de façon stable pour runtime **And** le format d’affichage tooltip cible suit le standard GDD : « Requiert : Réputation Prestige ≥ 30 (actuel : X) » (implémentation tooltip peut être partielle dans l’éditeur tant que la chaîne formatée est centralisée).
6. **Given** plusieurs conditions sur un même nœud **When** je les combine **Then** je peux choisir AND ou OR entre conditions **And** le résumé lisible est visible sur le nœud ou dans le panneau.
7. **Given** un état de simulation (valeurs flags / réputation de test) dans l’éditeur **When** une condition n’est pas satisfaite **Then** le nœud ou choix concerné est distingué visuellement (ex. grisé / icône) **And** la raison est accessible au survol ou dans le panneau (préparation Story 9.4 — pas d’exigence d’endpoint preview complet ici).
8. **Given** le graphe ouvert **When** je parcours les nœuds **Then** les éléments porteurs de conditions sont identifiables sans ouvrir chaque panneau (icône ou style).

## Tasks / Subtasks

- [x] Task 1 : Modèle canon + schéma — conditions sur **nœud** et **choix**, compatibilité avec l’existant (AC: #1–#4, #6)
  - [x] 🔴 Test échoue : document avec structure de conditions (noeud et au moins un choix) round-trip GET/PUT ; rejet des combinaisons invalides (opérateur incompatible avec type, enum hors liste, compteur hors bornes) ; pas de perte silencieuse des champs au reload.
  - [x] 🟢 Étendre le schéma JSON dialogue (`docs/resources/dialogue-format.schema.json`), types Pydantic côté validation document, et types frontend alignés (`UnityDialogueNode` / `UnityDialogueChoice`) pour porter des conditions **structurées** (voir Dev Notes — ne pas se limiter au champ chaîne `condition` hérité des choix).
  - [x] 🔵 Refactor : isoler la définition du « shape » condition (union discriminée ou schéma partagé) dans un module unique partagé backend/frontend (ex. sous-schéma JSON + types TS générés ou dupliqués minimalement) pour éviter trois définitions divergentes.
- [x] Task 2 : Services parse/validation — grammaire flags + réputation vs catalogue (AC: #2–#5)
  - [x] 🔴 Test échoue : entrées représentant chaque type (bool, compteur, enum, réputation) valident ou échouent avec messages contextualisés ; IDs flags inconnus par rapport au catalogue courant rejetés ou signalés selon politique alignée Story 9.5 (minimum : erreur bloquante à la sauvegarde document).
  - [x] 🟢 Implémenter `ConditionParserService` (ou équivalent dans `services/`) : lecture/écriture structurée, validation avec `FlagCatalogService` / patterns Story 9.1 ; router mince via container existant.
  - [x] 🔵 Refactor : garder les handlers API ≤ ~30 lignes ; logique dans services testables ; pas de duplication avec `dialogue_flag_validation.py` — factoriser les primitives « valeur dans bornes » / « enum ∈ liste » si overlap.
- [x] Task 3 : UI « Conditions » — édition AND/OR et sélecteurs typés (AC: #1, #2–#6)
  - [x] 🔴 Test échoue : ouverture du panneau depuis un nœud sélectionné → ajout condition bool + sauvegarde déclenche PUT document ; combinaison AND/OR reflétée dans l’état ; interactions RTL sans dépendre du layout pixel-perfect.
  - [x] 🟢 Implémenter `ConditionEditor.tsx` (et sous-composants) branché sur le flux document / store graphe existant ; réutiliser catalogue flags (API mechanics/flags + bindings dialogue Story 9.1) pour autocomplete IDs.
  - [x] 🔵 Refactor : **ne pas** faire grossir `NodeEditorPanel.tsx` (~1183 L) — extraire zone « Conditions » en composants enfants / hooks dédiés ; si logique commune avec futur `EffectEditor` (9.3), poser un petit hook partagé sans anticipation excessive.
- [x] Task 4 : Graphe — badges, survol, distinction visuelle (AC: #6–#8)
  - [x] 🔴 Test échoue : nœud avec condition affiche indicateur distinct ; survol ou libellé accessible expose un résumé non vide ; choix avec condition idem au niveau choix.
  - [x] 🟢 Étendre `DialogueNode.tsx` (et rendu choix si applicable) pour marqueurs + tooltips accessibles ; respect patterns React Flow existants.
  - [x] 🔵 Refactor : si le rendu du résumé condition duplique des stringify entre panneau et nœud, centraliser `formatConditionSummary()` dans `frontend/src/utils/` avec tests unitaires légers.
- [x] Task 5 : Simulation minimale état jeu dans l’éditeur — visibilité « comme preview » sans endpoint Story 9.4 (AC: #7)
  - [x] 🔴 Test échoue : avec état de simulation forcé (flags bool/compteur/enum + valeur réputation fictive), le composant graphe ou panneau dérive « visible / masqué » cohérent avec l’évaluateur partagé (pure function testée).
  - [x] 🟢 Implémenter une fonction d’évaluation pure (frontend ou import logique alignée backend) utilisée pour classement visuel grisé ; préparer API interne pour réutilisation par Story 9.4 (`ConditionEvaluatorService` dans l’epic).
  - [x] 🔵 Refactor : éviter un second moteur de règles — une seule représentation des conditions et une seule fonction d’évaluation appelée par UI graphe et futur preview.

## Dev Notes

- **Garde-fous architecture** : logique métier et validation dans `services/` ; routers minces ; injection `api/container.py`. Document canonique `/api/v1/documents/{id}` — toute persistance passe par GET/PUT document et révision ; ne pas reconstruire le document depuis seul le graphe en mémoire sans flux save.
- **Décision implémentation (9.2)** : champ **nouveau** `visibilityConditions` (bloc structuré sur **nœud** et **choix**) ; le champ legacy `choices[].condition` (chaîne) est **conservé** pour compatibilité Unity / anciens fichiers. Pas de migration automatique chaîne → objet dans cette story.
- **Réutiliser** : `FlagCatalogService`, `data/UnityData/FlagCatalog.csv`, routes mechanics flags, `DialogueFlagsPanel` / slice `dialogueFlagsSlice` pour cohérence des IDs avec Story 9.1 ; patterns validation `services/dialogue_flag_validation.py`.
- **Réputation** : données factions/axes peuvent être partielles hors runtime Unity — prévoir IDs stables ou liste catalogue comme pour les flags ; si données manquantes, stub documenté avec warning non bloquant en édition seule.
- **Story 9.4** : pas d’obligation d’implémenter `POST /preview` ici ; livrer **évaluation locale** ou service pur partagé pour ne pas dupliquer la logique plus tard.
- **Qualité / tests** : pytest services + tests API documents ; Vitest RTL pour `ConditionEditor` et indicateurs graphe ; pas de données GDD réelles dans les tests.
- **Refactor bar** : défauts dev-story (~300 lignes par fichier touché par tâche, fonctions ~60 lignes) sauf exception nommée.
- **Fichiers chauds** :
  - `frontend/src/components/graph/NodeEditorPanel.tsx` (~1183 L) — **contrainte** : nouvelle UI « Conditions » en composants enfants / hooks ; pas d’empilement de centaines de lignes dans ce fichier.
  - `frontend/src/components/generation/InGameFlagsModal.tsx` (~676 L) — **contrainte** : réutiliser pour autocomplete si pertinent ; ne pas fusionner l’éditeur de conditions dedans ; préférer composition.
- **Conventions** : types TS alignés `frontend/src/types/api.ts` ; schémas Pydantic `api/schemas/` ; nommage IDs flags comme Story 9.1.

### Project Structure Notes

- Point d’entrée UI graphe : sélection nœud → panneau latéral existant ; section « Conditions » distincte de « Variables et flags » dialogue (Story 9.1) — clarifier dans l’UI pour l’utilisateur.
- Évaluation visibilité : préférer fonction pure testable dans `frontend/src/utils/` ou mirroir minimal du service Python pour parité (si les deux existent, tests de non-divergence sur jeux d’exemples).

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-09.md` — Story 9.2, contraintes GDD conditions / réputation / tests carac]
- [Source: `_bmad-output/implementation-artifacts/9-1-définir-variables-et-flags-dans-dialogues-v10-fr89.md` — persistance `dialogueFlags`, catalogue CSV, patterns validation]
- [Source: `_bmad-output/project-context.md` — documents canoniques, stack, tests]
- [Source: `docs/resources/dialogue-format.schema.json` — état actuel `condition` sur choix]
- [Source: `models/dialogue_structure/unity_dialogue_node.py` — champs choice `condition` legacy]

## Technical Requirements

- Backend : service de validation/parsing des conditions ; intégration validation document au PUT ; pas de logique métier dans les routers.
- Frontend : `ConditionEditor.tsx`, intégration panneau graphe, badges nœuds/choix ; évaluation pure pour état simulé.
- Schéma : mise à jour `dialogue-format.schema.json` + types alignés ; stratégie migration champs `condition` chaîne existants.
- Tests : unit (parse/validate/évaluate), intégration (PUT document), RTL (éditeur + indicateurs).

## Architecture Compliance

- FastAPI + `ServiceContainer` ; pas de singletons ; `ConfigurationService` pour chemins ; schéma Unity et documents versionnés — toute évolution doit rester compatible export (`json.dumps(..., ensure_ascii=False)`).

## Library / Framework Requirements

- Stack existante uniquement (FastAPI, Pydantic v2, React 18, Zustand, React Flow) — pas de nouvelle dépendance majeure sauf justification dans la story suivante.

## File Structure Requirements

- Nouveau code privilégié : `services/condition_`* (nom final au choix du dev cohérent avec le repo), `api/schemas/` si nouveaux schémas, `frontend/src/components/graph/` ou sous-dossier `conditions/` pour éditeur, `frontend/src/utils/` pour stringify/évaluation, tests miroir sous `tests/` et `frontend/src/**/*.test.tsx`.

## Testing Requirements

- Pytest : parsing, validation contre catalogue mocké, routes documents avec corps représentatif.
- Vitest : éditeur conditions, rendu badge, régression sélection nœud (patterns NodeEditorPanel — ne pas casser flush `mergeDialogueNodeFormIntoStoreData`).
- E2E : optionnel si stable ; sinon couverture RTL + intégration API prioritaire.

## Previous Story Intelligence

- Story 9.1 a instauré `dialogueFlags` sur le document, validation typée dans `dialogue_flag_validation.py`, enrichissement `FlagCatalog.csv`, UI `DialogueFlagsPanel` sans alourdir `InGameFlagsModal`.
- Points de review récents : CSV versionné ; cohérence enum/compteur UI ; filtres catalogue côté client avec API enrichie.

## Git Intelligence Summary

- Travaux récents epic 9 : liaison `dialogueFlags`, seuils GDD, revue CSV + UI enum/compteur (`git log` — fix/feat epic-9).

## Latest Tech Information

- Pas de changement de stack requis ; rester aligné avec `project-context.md` (versions figées).

## Project Context Reference

- `_bmad-output/project-context.md` — règles critiques (documents vs graphe, tests, injection).

## Story Completion Status

- **review** — Implémentation + tests ; prête pour code-review.

---

## Dev Agent Record

### Agent Model Used

Cursor / Auto (agent Amelia — dev-story)

### Debug Log References

N/A

### Completion Notes List

- **Task 1** : `dialogue-format.schema.json` définitions `VisibilityConditions` / atomes discriminés `kind` ; Pydantic `api/schemas/visibility_conditions.py` ; TS `frontend/src/types/visibilityConditions.ts` + Zod `visibilityConditionsSchema.ts` ; types API `UnityDialogueNode` / `UnityDialogueChoice`. Tests : PUT/GET `tests/api/test_documents_visibility_conditions.py`.
- **Task 2** : `VisibilityConditionValidationService` + `services/visibility_condition_validation.py` (catalogue `FlagCatalogService`), branché sur `PUT /documents` après `dialogueFlags`. Tests services + API.
- **Task 3** : `ConditionEditor.tsx` (nœud + choix), intégré dans `NodeEditorPanel` et `ChoiceEditor` ; liste flags via `listFlags`. RTL `ConditionEditor.test.tsx`.
- **Task 4** : `DialogueNode.tsx` badge ◆ + tooltip choix (résumé structuré + legacy) ; `formatConditionSummary` / `formatVisibilityConditionsSummary` dans `utils/visibilityConditions.ts` + tests.
- **Task 5** : `evaluateVisibilityConditions` (pure) ; `graphViewStore.visibilityEvalState` + panneau simulation dans `ConditionEditor` ; grisage nœud si simulation active et conditions non satisfaites.
- 🔵 **Refactor Task 1** : shape unique via `$ref` JSON Schema `definitions` + types TS/Zod/Pydantic alignés (pas trois dialectes divergents).
- 🔵 **Refactor Task 2** : validation catalogue dans service dédié ; router inchangé hormis appel injecté (~8 lignes) ; réutilisation `default_counter_bounds` / sémantique catalogue.
- 🔵 **Refactor Task 3** : UI conditions hors `NodeEditorPanel` (composant dédié `conditions/ConditionEditor.tsx`).
- 🔵 **Refactor Task 4** : avant → résumés inline potentiels ; après → `formatConditionSummary` centralisé + tests `visibilityConditions.test.ts`.
- 🔵 **Refactor Task 5** : un seul moteur `evaluateVisibilityConditions` pour graphe + panneau (pas de second evaluateur).

### File List

- `docs/resources/dialogue-format.schema.json`
- `api/schemas/visibility_conditions.py`
- `services/visibility_condition_validation.py`
- `api/dependencies.py`
- `api/routers/documents.py`
- `tests/services/test_visibility_condition_validation.py`
- `tests/api/test_documents_visibility_conditions.py`
- `frontend/src/types/visibilityConditions.ts`
- `frontend/src/types/api.ts`
- `frontend/src/schemas/visibilityConditionsSchema.ts`
- `frontend/src/schemas/nodeEditorSchema.ts`
- `frontend/src/utils/visibilityConditions.ts`
- `frontend/src/utils/visibilityConditions.test.ts`
- `frontend/src/utils/mergeNodeEditorForm.ts`
- `frontend/src/store/graphViewStore.ts`
- `frontend/src/components/graph/conditions/ConditionEditor.tsx`
- `frontend/src/components/graph/conditions/ConditionEditor.test.tsx`
- `frontend/src/components/graph/NodeEditorPanel.tsx`
- `frontend/src/components/graph/ChoiceEditor.tsx`
- `frontend/src/components/graph/nodes/DialogueNode.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/9-2-définir-conditions-de-visibilité-sur-nœuds-si-variable-x-y-afficher-nœud-fr90.md`

### Change Log

- 2026-04-18 : Story 9.2 — conditions structurées `visibilityConditions`, validation catalogue au PUT, UI Conditions + simulation + badges graphe (voir File List).
