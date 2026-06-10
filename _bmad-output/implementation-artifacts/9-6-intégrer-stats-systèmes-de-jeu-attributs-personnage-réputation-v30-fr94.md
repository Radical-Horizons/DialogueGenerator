# Story 9.6: Intégrer stats systèmes de jeu (caractéristiques, effort, réputation)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **concepteur de dialogues**,
I want **référencer les caractéristiques, l'effort et la réputation réelle du jeu dans les conditions, tests et effets de dialogue**,
so that **les dialogues réagissent aux capacités du personnage possédé et à son état social calculé sans dupliquer les règles des systèmes de jeu**.

## Acceptance Criteria

1. **Catalogue systèmes disponible** — Étant donné le système d'intégration stats, lorsque j'ouvre "Intégration systèmes de jeu", alors le panneau affiche les familles utilisables dans les dialogues : Caractéristiques & Compétences, Gestion de l'Effort, Réputation, avec état de connexion runtime Unity/API/fichier config visible sans bloquer l'édition locale.
2. **Caractéristiques et tests tentables** — Étant donné un choix avec test de caractéristique (ex: `[Sociabilité + Tromperie vs DD 7]`), lorsque le choix est affiché en jeu ou en preview, alors il reste visible et tentable, avec score/DD lisibles, et l'issue `succès_critique`, `succès`, `échec` ou `échec_critique` détermine la branche suivante.
3. **Effort intégré aux choix** — Étant donné un choix qui peut consommer de l'Effort, lorsque je configure un coût (ex: `Dépenser 2 PE`), alors le choix est grisé si le pool disponible est insuffisant, avec pool preview par défaut `10 PE` configurable.
4. **Réputation : modèle réel** — Étant donné une condition ou un effet de Réputation, lorsque je sélectionne la cible, alors je choisis une héroïne possédée, une cible PNJ ou communauté, et un axe parmi `Admiration`, `Prestige`, `Crainte`; l'UI indique si la valeur est une jauge PNJ brute, une réputation PNJ finale ou une réputation communautaire calculée.
5. **Paliers de réputation** — Étant donné une condition par palier ou seuil, lorsque la condition est évaluée, alors le `RepPalier` est calculé à la volée depuis la valeur numérique et couvre `Hostilité`, `Rejet`, `Méfiance`, `Distance`, `Neutre`, `Sympathie`, `Faveur`, `Dévotion`, `Icône` avec les seuils Notion.
6. **Effets de réputation** — Étant donné un choix qui modifie la Réputation, lorsque je configure l'effet, alors l'effet cible un axe et une cible sociale explicite, avec repères d'impact mineur `1-3`, majeur `4-9`, critique `10+`; témoins, propagation et agrégat communautaire sont signalés comme responsabilité runtime si non disponibles localement.
7. **Titres de faction distincts des paliers** — Étant donné une option dépendant d'un titre, lorsque je configure cette condition, alors elle référence un flag one-way `Flag_faction_titre_{faction}` ou une valeur de catalogue titres, et aucun titre n'est accordé par simple franchissement de jauge.
8. **Preview avec stats** — Étant donné un dialogue avec stats, lorsque je lance la preview, alors je peux définir des valeurs simulées pour caractéristiques, compétences, Effort, Réputation PNJ/communauté et titres, avec explication des limites si les données runtime complètes manquent.
9. **Déconnexion runtime** — Étant donné Unity ou la source runtime non connectée, lorsque le dialogue utilise caractéristiques, effort ou réputation, alors un warning non bloquant indique que l'évaluation runtime dépendra de l'intégration externe, tout en gardant validation syntaxique et preview simulée.
10. **Séparation stricte des systèmes sociaux** — Étant donné un dialogue qui référence `Influence` ou `Respect`, lorsque la validation système s'exécute, alors ces jauges sont traitées comme `Influence & Respect (PJ possédés)`, pas comme Réputation, avec message explicite en cas de confusion.

## Tasks / Subtasks

- [x] Task 1 : Catalogue d'intégration systèmes visible et non bloquant (AC: #1, #9)
  - [x] 🔴 Test échoue : ouverture du panneau d'intégration systèmes → familles Caractéristiques, Effort, Réputation visibles ; source runtime absente → warning non bloquant et édition locale disponible.
  - [x] 🟢 Implémenter la surface UI/API d'intégration systèmes et l'état de connexion simulable (voir Dev Notes).
  - [x] 🔵 Refactor : clarifier le vocabulaire public autour de "runtime source" vs "preview simulée" dans les tests et libellés, pour éviter toute ambiguïté entre absence de connexion et feature indisponible.

- [x] Task 2 : Tests de caractéristiques tentables avec branches de résultat (AC: #2)
  - [x] 🔴 Test échoue : un choix avec `Sociabilité + Tromperie vs DD 7` reste visible en preview, calcule une issue parmi les quatre résultats et expose la cible de branche correspondante sans masquer l'option.
  - [x] 🟢 Implémenter l'évaluation pure des skill checks et son branchement preview/UI sans le faire passer par les conditions de visibilité (voir Dev Notes).
  - [x] 🔵 Refactor : renommer ou regrouper les helpers de test pour refléter le vocabulaire métier `skill check` / `issue` plutôt qu'un détail d'implémentation de preview.

- [x] Task 3 : Coût d'Effort et état grisé des choix (AC: #3, #8)
  - [x] 🔴 Test échoue : pool preview `10 PE`, choix coûtant `2 PE` accessible ; choix coûtant plus que le pool grisé avec explication ; pool modifié en preview met à jour l'état immédiatement.
  - [x] 🟢 Implémenter l'état simulé d'Effort et l'évaluation des coûts dans la preview choix (voir Dev Notes).
  - [x] 🔵 Refactor : éliminer toute duplication émergente entre calcul d'accessibilité Effort et calcul des comptes preview, en gardant les fonctions pures testables.

- [x] Task 4 : Réputation FR94 avec cible explicite et paliers calculés (AC: #4, #5, #6)
  - [x] 🔴 Test échoue : condition Réputation avec héroïne + cible + axe + mode de lecture évalue le seuil/palier attendu ; tentative de stocker le palier courant dans `dialogueFlags` produit une erreur typée.
  - [x] 🟢 Implémenter les modèles et helpers purs de Réputation FR94, dont `RepPalier`, modes de lecture et repères d'impact (voir Dev Notes).
  - [x] 🔵 Refactor : séparer clairement les compatibilités legacy `axisId::factionId` des nouveaux modèles FR94 pour éviter un modèle hybride illisible.

- [x] Task 5 : Titres de faction et séparation Réputation / Influence & Respect (AC: #7, #10)
  - [x] 🔴 Test échoue : condition de titre utilise un flag one-way ou catalogue titre ; référence `Respect` dans une condition Réputation produit un message indiquant le système `Influence & Respect (PJ possédés)`.
  - [x] 🟢 Implémenter la validation et la preview des titres de faction, plus les diagnostics de confusion sociale (voir Dev Notes).
  - [x] 🔵 Refactor : centraliser les messages de diagnostics sociaux pour que `Réputation`, `Titres`, `Influence` et `Respect` restent cohérents côté backend et frontend.

- [x] Task 6 : Preview stats complète et contrats API/TS alignés (AC: #8, #9)
  - [x] 🔴 Test échoue : payload preview avec caractéristiques, Effort, Réputation et titres round-trip backend/frontend ; la réponse indique les limites d'agrégat communautaire quand les témoins/poids PNJ manquent.
  - [x] 🟢 Implémenter l'extension de `DialoguePreviewRequest`/types frontend et l'affichage des limites de simulation (voir Dev Notes).
  - [x] 🔵 Refactor : simplifier les fixtures de preview stats pour qu'elles expriment les cas métier au lieu d'objets JSON verbeux et difficiles à relire.

## Dev Notes

- **Architecture guardrails** : logique métier dans `services/`, DTOs dans `api/schemas/`, routers minces via `api/dependencies.py` / `api/container.py`. Ne pas créer de singletons globaux. Le document canonique reste `GET/PUT /api/v1/documents/{id}` ; les nouvelles règles doivent composer avec le flux documents existant.
- **Contrat existant à préserver** : Story 9.2/9.3 utilisent déjà `ReputationCondition(axisId, factionId, threshold)` et `ReputationDeltaEffect(axisId, factionId, delta)` ; Story 9.4 preview encode aujourd'hui la réputation comme clé `axisId::factionId`. 9.6 peut étendre ce modèle, mais doit documenter explicitement le mode legacy vs FR94 pour éviter une migration silencieuse cassante.
- **Source de vérité Réputation** : Notion `Réputation` décrit le stockage par héroïne possédée × PNJ × axe, avec communauté calculée par agrégat pondéré. Notion `Paliers de Réputation` définit les seuils et `RepPalier` calculé. Notion `Titres de faction` définit les titres comme statuts narratifs one-way, distincts des paliers.
- **Séparation sociale obligatoire** : `Influence` / `Respect` existent déjà comme champs legacy sur `UnityDialogueChoiceContent` et relèvent du système `Influence & Respect (PJ possédés)`. Ne pas les recycler comme axes de Réputation.
- **Caractéristiques et Effort** : `gdd-systems-reference.md` définit 8 caractéristiques, formule `Score = Caractéristique + Compétence + Modificateurs`, quatre issues autour du DD, pool Effort par défaut `10 PE`, coût d'Effort et choix grisé si insuffisant. Les tests de caractéristiques restent tentables, séparés des conditions de visibilité.
- **What to reuse** : reprendre les patterns `visibility_condition_validation.py`, `choice_effect_validation.py`, `dialogue_preview_eval.py`, `DialoguePreviewService`, `graphViewStore` preview, `ConditionEditor`, `EffectEditor`, `DialoguePreviewPanel`, `GraphValidationPanel`, sans dupliquer leurs responsabilités.
- **Quality bar** : tout helper de calcul (`RepPalier`, skill check, effort access, diagnostics sociaux) doit avoir tests unitaires purs. Les contrats API doivent avoir tests `TestClient`. Les surfaces UI/preview doivent avoir Vitest centrés sur comportements visibles, pas uniquement snapshots.
- **Refactor bar** : défaut dev-story (~300 lignes par fichier source touché dans une tâche, fonctions ~60 lignes, pas de duplication non triviale). Toute exception doit être nommée dans la completion note.
- **Fichiers chauds** :
  - `frontend/src/components/graph/NodeEditorPanel.tsx` (**1227 L**) — ne pas concentrer la feature : ajouter panneaux/hooks enfants ou surfaces dédiées.
  - `frontend/src/components/graph/nodes/DialogueNode.tsx` (**874 L**) — limiter à affichage/dispatch minimal ; déplacer calculs dans utils/services frontend.
  - `api/routers/documents.py` (**781 L**) — handler ≤ 30 lignes, délégation à schémas/services.
  - `services/graph_validation_service.py` (**789 L**) — ne pas ajouter de logique FR94 lourde ; préférer service dédié ou helper pur.

### Project Structure Notes

- Backend attendu : petits modules dédiés sous `services/` pour calculs et validation FR94, avec schémas miroir sous `api/schemas/`. Les routes documents/preview restent des points d'intégration minces.
- Frontend attendu : types sous `frontend/src/types/`, helpers purs sous `frontend/src/utils/`, composants ou panneaux dédiés sous `frontend/src/components/graph/` ou sous-dossiers existants `conditions/`, `effects/`, `preview/`.
- Éviter les noms ambigus : réserver `reputation` à `Admiration/Prestige/Crainte`; utiliser explicitement `influenceRespect` ou libellé équivalent pour le système PJ possédés.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-09.md` — Story 9.6 FR94 réécrite, AC et contraintes GDD/Notion]
- [Source: `_bmad-output/planning-artifacts/gdd-systems-reference.md` — Caractéristiques, Effort, Réputation, Influence & Respect]
- [Source: `_bmad-output/implementation-artifacts/9-5-valider-références-variables-détecter-variables-non-définies-fr93.md` — pattern validation, documents canoniques, séparation flag vs réputation]
- [Source: `api/schemas/visibility_conditions.py`, `api/schemas/choice_effects.py`, `api/schemas/dialogue_preview.py` — contrats Pydantic existants]
- [Source: `services/dialogue_preview_eval.py`, `services/choice_effect_validation.py`, `services/visibility_condition_validation.py` — logique pure existante à prolonger]
- [Source: `frontend/src/types/visibilityConditions.ts`, `frontend/src/types/choiceEffects.ts`, `frontend/src/store/graphViewStore.ts` — types et état preview actuels]

## Technical Requirements

- Ajouter des modèles typés pour les stats FR94 au lieu d'étendre des chaînes libres : caractéristiques/compétences, effort, réputation cible/mode, titres.
- Préserver la validation catalogue existante des flags et effets ; les nouvelles validations FR94 ne doivent pas transformer une condition Réputation en obligation `dialogueFlags`.
- Prévoir une compatibilité claire avec le format actuel `axisId::factionId` en preview ; tout nouveau format doit être testé et documenté.
- L'absence de source runtime Unity/API/fichier config est un warning non bloquant ; les valeurs simulées de preview suffisent pour l'édition.

## Architecture Compliance

- FastAPI + Pydantic + services purs, injection via `api/container.py`.
- Zustand pour l'état preview ; pas d'événements globaux `window`.
- Graph mutations via patterns existants du graph editor ; pas de logique métier dans les nœuds React.
- Windows-first : chemins `pathlib.Path`, UTF-8, pas d'hypothèses POSIX dans scripts/tests.

## Library / Framework Requirements

- Aucune nouvelle dépendance attendue pour 9.6. Calculs de paliers, skill checks, effort et diagnostics doivent être en Python/TypeScript pur.
- Ne pas confondre "Effort" de gameplay avec `reasoning_effort` OpenAI ; aucun changement LLM n'est requis par cette story.
- Pas de recherche web nécessaire : les surfaces techniques sont internes au repo et aux contrats existants.

## File Structure Requirements

- Tests backend miroir sous `tests/services/` et `tests/api/`.
- Tests frontend près des helpers/composants existants (`frontend/src/utils/*.test.ts`, `frontend/src/__tests__/`, ou dossier composant).
- Documentation API à mettre à jour dans `README_API.md` si un endpoint ou payload public change.

## Testing Requirements

- Pytest services : `RepPalier` complet, skill check quatre issues, effort access, conditions/effets Réputation FR94, titres, diagnostics `Respect` vs Réputation.
- Pytest API : preview payload FR94, validation erreurs typées, absence de régression PUT documents et graph validate.
- Vitest : panel intégration systèmes, preview stats simulées, choix grisé par Effort, copie warning runtime non connecté, affichage titre vs palier.
- E2E ciblé seulement après UI stable : un dialogue combinant skill check, Effort, condition Réputation et titre.

## Previous Story Intelligence

- **9.5** a livré validation références flags vs `dialogueFlags` avec service pur, endpoint documents et merge dans graph validate. 9.6 doit réutiliser cette discipline : erreurs typées, messages FR, pas de logique métier dans routers.
- **9.4** a livré preview sans persistance, `visibilityEvalState`, `collectPreviewKeys`, `DialoguePreviewPanel`, historique d'effets. 9.6 doit prolonger cet état simulé sans persister les stats runtime dans le document.
- **9.3** a livré `choiceEffects` structurés et validation PUT, dont `reputation_delta` legacy. 9.6 doit étendre ou composer avec ce contrat, pas créer un deuxième système d'effets non raccordé.
- **9.2** a livré conditions structurées, dont `reputation` legacy `axisId/factionId`. La migration vers cible FR94 doit rester explicite et testée.

## Git Intelligence Summary

- Travaux récents epic 9 suivent le pattern : schéma Pydantic/TS + service pur + tests API/service + UI ciblée + sprint sync.
- Commits récents à prolonger : `feat(fr93): validation références flags vs dialogueFlags`, `feat(epic-9): story 9.4 preview scénario variables + POST documents preview`, `feat(epic-9): story 9.3 choiceEffects`.
- Attention à `api/routers/documents.py`, déjà modifié à plusieurs reprises : toute nouvelle route ou validation doit rester mince.

## Latest Tech Information

- Pas de dépendance externe ni API récente à valider. L'information la plus récente et contraignante vient des fiches Notion live récupérées pour `Réputation`, `Paliers de Réputation`, `Titres de faction`, plus `gdd-systems-reference.md`.

## Project Context Reference

- `_bmad-output/planning-artifacts/architecture/project-context-analysis.md` — brownfield React/FastAPI, GDD externe, Unity JSON strict, validation/observabilité.
- `_bmad-output/planning-artifacts/architecture/technical-foundation-existing-architecture.md` — services métier dans `services/`, DI via `api/container.py`, React 18 + Zustand + React Flow, pytest/Vitest.

## Story Completion Status

- **done** — Code review FR94 complétée, HIGH/MEDIUM corrigés, validations ciblées vertes.

## Dev Agent Record

### Agent Model Used

Composer (session agent Cursor)

### Debug Log References

- 2026-04-25 — Task 1 RED API : `node scripts/getPythonPath.js -m pytest tests/api/test_mechanics_systems_integration.py -q` échoue comme attendu sur `404 != 200` pour `GET /api/v1/mechanics/systems/integration`.
- 2026-04-25 — Task 1 RED UI : `npx vitest run src/components/graph/systems/GameSystemsIntegrationPanel.test.tsx --reporter=dot` échoue comme attendu, import `./GameSystemsIntegrationPanel` introuvable (`tmp/vitest-task1-red.txt`).
- 2026-04-25 — Task 1 GREEN API : `node scripts/getPythonPath.js -m pytest tests/api/test_mechanics_systems_integration.py -q` → `1 passed`.
- 2026-04-25 — Task 1 GREEN UI : `npx vitest run src/components/graph/systems/GameSystemsIntegrationPanel.test.tsx --reporter=dot` → `1 passed` (`tmp/vitest-task1-green.txt`).
- 2026-04-25 — Task 1 REFACTOR : `node scripts/getPythonPath.js -m pytest tests/api/test_mechanics_systems_integration.py -q` → `1 passed`; `npx vitest run src/components/graph/systems/GameSystemsIntegrationPanel.test.tsx --reporter=dot` → `1 passed` (`tmp/vitest-task1-refactor.txt`).
- 2026-04-25 — Task 2 RED backend : `node scripts/getPythonPath.js -m pytest tests/services/test_game_systems_skill_checks.py -q` échoue comme attendu, `ModuleNotFoundError: services.game_systems_skill_checks`.
- 2026-04-25 — Task 2 RED frontend : `npx vitest run src/utils/skillChecks.test.ts --reporter=dot` échoue comme attendu, import `./skillChecks` introuvable (`tmp/vitest-task2-red.txt`).
- 2026-04-25 — Task 2 GREEN backend : `node scripts/getPythonPath.js -m pytest tests/services/test_game_systems_skill_checks.py -q` → `4 passed`.
- 2026-04-25 — Task 2 GREEN frontend : `npx vitest run src/utils/skillChecks.test.ts --reporter=dot` → `2 passed` (`tmp/vitest-task2-green.txt`).
- 2026-04-25 — Task 2 REFACTOR : `node scripts/getPythonPath.js -m pytest tests/services/test_game_systems_skill_checks.py -q` → `4 passed`; `npx vitest run src/utils/skillChecks.test.ts --reporter=dot` → `2 passed` (`tmp/vitest-task2-refactor.txt`).
- 2026-04-25 — Task 3 RED backend : `node scripts/getPythonPath.js -m pytest tests/services/test_game_systems_effort.py -q` échoue comme attendu, `ModuleNotFoundError: services.game_systems_effort`.
- 2026-04-25 — Task 3 RED frontend : `npx vitest run src/utils/effortPreview.test.ts --reporter=dot` échoue comme attendu, import `./effortPreview` introuvable (`tmp/vitest-task3-red.txt`).
- 2026-04-25 — Task 3 GREEN backend : `node scripts/getPythonPath.js -m pytest tests/services/test_game_systems_effort.py -q` → `3 passed`.
- 2026-04-25 — Task 3 GREEN frontend : `npx vitest run src/utils/effortPreview.test.ts --reporter=dot` → `3 passed` (`tmp/vitest-task3-green.txt`).
- 2026-04-25 — Task 3 REFACTOR : `node scripts/getPythonPath.js -m pytest tests/services/test_game_systems_effort.py -q` → `3 passed`; `npx vitest run src/utils/effortPreview.test.ts --reporter=dot` → `3 passed` (`tmp/vitest-task3-refactor.txt`).
- 2026-04-25 — Task 4 RED backend : `node scripts/getPythonPath.js -m pytest tests/services/test_game_systems_reputation.py -q` échoue comme attendu, `ModuleNotFoundError: services.game_systems_reputation`.
- 2026-04-25 — Task 4 RED frontend : `npx vitest run src/utils/reputationFr94.test.ts --reporter=dot` échoue comme attendu, import `./reputationFr94` introuvable (`tmp/vitest-task4-red.txt`).
- 2026-04-25 — Task 4 GREEN backend : `node scripts/getPythonPath.js -m pytest tests/services/test_game_systems_reputation.py -q` → `3 passed`.
- 2026-04-25 — Task 4 GREEN frontend : `npx vitest run src/utils/reputationFr94.test.ts --reporter=dot` → `2 passed` (`tmp/vitest-task4-green.txt`).
- 2026-04-25 — Task 4 REFACTOR : `node scripts/getPythonPath.js -m pytest tests/services/test_game_systems_reputation.py -q` → `3 passed`; `npx vitest run src/utils/reputationFr94.test.ts --reporter=dot` → `2 passed` (`tmp/vitest-task4-refactor.txt`).
- 2026-04-25 — Task 5 RED backend : `node scripts/getPythonPath.js -m pytest tests/services/test_game_systems_social_diagnostics.py -q` échoue comme attendu, `ModuleNotFoundError: services.game_systems_social_diagnostics`.
- 2026-04-25 — Task 5 RED frontend : `npx vitest run src/utils/socialDiagnostics.test.ts --reporter=dot` échoue comme attendu, import `./socialDiagnostics` introuvable (`tmp/vitest-task5-red.txt`).
- 2026-04-25 — Task 5 GREEN backend : `node scripts/getPythonPath.js -m pytest tests/services/test_game_systems_social_diagnostics.py -q` → `3 passed`.
- 2026-04-25 — Task 5 GREEN frontend : `npx vitest run src/utils/socialDiagnostics.test.ts --reporter=dot` → `3 passed` (`tmp/vitest-task5-green.txt`).
- 2026-04-25 — Task 5 REFACTOR : `node scripts/getPythonPath.js -m pytest tests/services/test_game_systems_social_diagnostics.py -q` → `3 passed`; `npx vitest run src/utils/socialDiagnostics.test.ts --reporter=dot` → `3 passed` (`tmp/vitest-task5-refactor.txt`).
- 2026-04-25 — Task 6 RED API : `node scripts/getPythonPath.js -m pytest tests/api/test_documents_preview_game_systems.py -q` échoue comme attendu sur `422 != 200`, champ `game_systems_state` interdit.
- 2026-04-25 — Task 6 RED frontend : `npx vitest run src/utils/previewSimulationLimits.test.ts --reporter=dot` échoue comme attendu, import `./previewSimulationLimits` introuvable (`tmp/vitest-task6-red-frontend.txt`).
- 2026-04-25 — Task 6 GREEN API : `node scripts/getPythonPath.js -m pytest tests/api/test_documents_preview_game_systems.py -q` → `1 passed`.
- 2026-04-25 — Task 6 GREEN frontend : `npx vitest run src/utils/previewSimulationLimits.test.ts src/types/documents.previewGameSystems.test.ts --reporter=dot` → `2 passed` (`tmp/vitest-task6-green.txt`).
- 2026-04-25 — Task 6 REFACTOR : `node scripts/getPythonPath.js -m pytest tests/api/test_documents_preview_game_systems.py -q` → `1 passed`; `npx vitest run src/utils/previewSimulationLimits.test.ts src/types/documents.previewGameSystems.test.ts --reporter=dot` → `2 passed` (`tmp/vitest-task6-refactor.txt`).
- 2026-04-25 — Validation finale backend : `node scripts/getPythonPath.js -m pytest tests/api/test_mechanics_systems_integration.py tests/api/test_documents_preview_game_systems.py tests/services/test_game_systems_skill_checks.py tests/services/test_game_systems_effort.py tests/services/test_game_systems_reputation.py tests/services/test_game_systems_social_diagnostics.py -q` → `15 passed`.
- 2026-04-25 — Validation finale frontend : `npx vitest run src/components/graph/systems/GameSystemsIntegrationPanel.test.tsx src/utils/skillChecks.test.ts src/utils/effortPreview.test.ts src/utils/reputationFr94.test.ts src/utils/socialDiagnostics.test.ts src/utils/previewSimulationLimits.test.ts src/types/documents.previewGameSystems.test.ts --reporter=dot` → `7 files / 13 tests passed` (`tmp/vitest-story96-final-rerun.txt`).
- 2026-04-25 — Lint frontend : `npm --prefix frontend run lint` → OK, `max-warnings 0`.
- 2026-04-25 — Preuve UI : `npm run dev`, vérification visuelle via `tmp/story96-systems-panel.png` — panneau `Intégration systèmes de jeu`, familles FR94, `Source runtime externe non connectée`, `Édition locale disponible`.
- 2026-04-25 — Code review fix backend : `node scripts/getPythonPath.js -m pytest tests/api/test_mechanics_systems_integration.py tests/api/test_documents_preview_game_systems.py tests/services/test_game_systems_skill_checks.py tests/services/test_game_systems_effort.py tests/services/test_game_systems_reputation.py tests/services/test_game_systems_social_diagnostics.py -q` → `19 passed`.
- 2026-04-25 — Code review fix frontend : `npx vitest run src/components/graph/nodes/DialogueNode.test.tsx src/components/graph/systems/GameSystemsIntegrationPanel.test.tsx src/utils/skillChecks.test.ts src/utils/effortPreview.test.ts src/utils/reputationFr94.test.ts src/utils/socialDiagnostics.test.ts src/utils/previewSimulationLimits.test.ts src/types/documents.previewGameSystems.test.ts --reporter=dot` → `8 files / 15 tests passed`.
- 2026-04-25 — Code review fix lint : `npm --prefix frontend run lint` → OK, `max-warnings 0`.

### Completion Notes List

- 🔵 Refactor Task 1 : vocabulaire public clarifié — `Runtime Unity/API/fichier config` → `Source runtime externe (Unity/API/fichier config)` et `Source runtime non connectée` → `Source runtime externe non connectée`, tout en conservant `preview simulée` dans le message pour distinguer connexion absente et édition locale disponible.
- 🔵 Refactor Task 2 : helper d'issue renommé pour porter le vocabulaire métier — `_issue_from_margin` / `issueFromMargin` → `_skill_check_issue_from_margin` / `skillCheckIssueFromMargin`.
- 🔵 Refactor Task 3 : message d'état grisé Effort extrait — chaîne inline → `format_effort_disabled_reason()` / `formatEffortDisabledReason()` pour garder le calcul d'accessibilité et l'affichage preview cohérents.
- 🔵 Refactor Task 4 : compatibilité legacy isolée — ajout `legacy_reputation_state_key()` / `legacyReputationStateKey()` distincts de `ReputationCondition.state_key()` / `reputationStateKey()` FR94.
- 🔵 Refactor Task 5 : diagnostic social centralisé — message inline → `social_system_confusion_message()` / `formatSocialSystemConfusionMessage()`.
- 🔵 Refactor Task 6 : fixtures preview stats simplifiées — objets JSON inline → helpers `_game_systems_preview_state()`, `gameSystemsPreviewState()` et `communityAggregatePreviewState()`.
- Code review fix : raccordement UI preview réel des skill checks/Effort, typage du payload `game_systems_state`, diagnostics FR94 branchés sur `PUT /documents`, repères d'impact Réputation ajoutés, tests backend/frontend renforcés.
- Implémentation prête pour review : catalogue systèmes FR94, helpers purs skill check/Effort/Réputation/titres/diagnostics, extension preview API/TS, doc API et preuve UI.

### File List

- `api/main.py`
- `api/routers/documents.py`
- `api/routers/mechanics_systems.py`
- `api/schemas/dialogue_preview.py`
- `api/schemas/game_systems.py`
- `services/game_systems_integration_service.py`
- `tests/api/test_mechanics_systems_integration.py`
- `frontend/src/api/gameSystemsIntegration.ts`
- `frontend/src/components/graph/GraphEditor.tsx`
- `frontend/src/components/graph/GraphEditorHeader.tsx`
- `frontend/src/components/graph/nodes/DialogueNode.tsx`
- `frontend/src/components/graph/nodes/DialogueNode.test.tsx`
- `frontend/src/components/graph/preview/DialoguePreviewPanel.tsx`
- `frontend/src/components/graph/systems/GameSystemsIntegrationPanel.tsx`
- `frontend/src/components/graph/systems/GameSystemsIntegrationPanel.test.tsx`
- `frontend/src/hooks/useGraphToolbar.ts`
- `frontend/src/store/graphViewStore.ts`
- `frontend/src/types/choiceEffects.ts`
- `frontend/src/types/documents.ts`
- `frontend/src/types/documents.previewGameSystems.test.ts`
- `frontend/src/types/gameSystemsIntegration.ts`
- `frontend/src/types/visibilityConditions.ts`
- `services/game_systems_skill_checks.py`
- `tests/services/test_game_systems_skill_checks.py`
- `frontend/src/utils/skillChecks.ts`
- `frontend/src/utils/skillChecks.test.ts`
- `frontend/src/utils/choiceEffects.ts`
- `frontend/src/utils/collectPreviewKeys.ts`
- `frontend/src/utils/visibilityConditions.ts`
- `services/game_systems_effort.py`
- `tests/services/test_game_systems_effort.py`
- `frontend/src/utils/effortPreview.ts`
- `frontend/src/utils/effortPreview.test.ts`
- `services/game_systems_reputation.py`
- `tests/services/test_game_systems_reputation.py`
- `frontend/src/utils/reputationFr94.ts`
- `frontend/src/utils/reputationFr94.test.ts`
- `services/game_systems_social_diagnostics.py`
- `tests/services/test_game_systems_social_diagnostics.py`
- `frontend/src/utils/socialDiagnostics.ts`
- `frontend/src/utils/socialDiagnostics.test.ts`
- `services/dialogue_preview_service.py`
- `tests/api/test_documents_preview_game_systems.py`
- `frontend/src/utils/previewSimulationLimits.ts`
- `frontend/src/utils/previewSimulationLimits.test.ts`
- `README_API.md`

### Senior Developer Review (AI)

- Review option `[1]` appliquée : tous les findings HIGH/MEDIUM identifiés ont été corrigés.
- Corrections principales : helpers FR94 branchés au flux UI/preview, validation sociale FR94 intégrée au rapport document, contrat preview stats typé, effets Réputation avec repères d'impact, couverture tests élargie.
- Résultat : aucun HIGH/MEDIUM restant ; LOW non bloquants acceptés.

### Change Log

- 2026-04-25 — Implémentation Story 9.6 FR94 : catalogue systèmes non bloquant, helpers stats purs, preview stats API/TS, tests backend/frontend ciblés, documentation API.
- 2026-04-25 — Code review Story 9.6 : corrections HIGH/MEDIUM appliquées, tests ciblés relancés, statut passé à done.
