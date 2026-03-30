# Story 3.6 : Mesurer la pertinence du contexte GDD utilisé dans le dialogue généré

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur générant des dialogues**,
I want **voir une mesure de pertinence du contexte GDD par rapport au dialogue généré**,
so that **je peux évaluer si le contexte sélectionné est effectivement exploité par le LLM**.

## Acceptance Criteria

1. **Given** une génération de nœud/dialogue a été effectuée avec contexte GDD injecté dans le prompt **When** la génération se termine avec succès **Then** l’utilisateur peut consulter un indicateur de pertinence (score ou pourcentage interprétable) **And** un breakdown synthétique indique la contribution par type d’entité (personnages, lieux, régions, thèmes, etc.) lorsque l’information est disponible.

2. **Given** j’ouvre le panneau ou la section « Pertinence contexte » pour un nœud donné **When** les données sont chargées **Then** je vois le score global, le breakdown par type, et la distinction sections / entités mises en avant comme « reflétées » vs « peu ou pas détectées » selon la méthode choisie **And** l’UI reste cohérente avec les panneaux contexte existants (pas de rupture de patterns UX).

3. **Given** la pertinence estimée est faible (seuil configurable côté produit, ex. inférieur à 30 %) **When** le rapport s’affiche **Then** un avertissement non bloquant invite à enrichir le contexte ou les instructions **And** des pistes génériques peuvent être proposées (sans dépendre d’un second appel LLM obligatoire pour respecter la perf).

4. **Given** plusieurs générations ont eu lieu pour le même dialogue **When** je consulte l’historique de pertinence **Then** je peux voir l’évolution dans le temps (liste ou graphique simple) pour les enregistrements disponibles **And** les entrées sont liées à un `node_id` / `request_id` lorsque ces identifiants existent.

5. **Given** le calcul de pertinence s’exécute **When** il est déclenché (post-génération ou à la demande) **Then** il se termine en moins d'une seconde dans le scénario nominal (jeu de données local / tests) **And** le résultat est persisté ou récupérable via la même chaîne que les logs de génération (Story 1.15) ou extension documentée équivalente.

## Tasks / Subtasks

- [x] Task 1 : Calculer une métrique de pertinence contexte ↔ texte généré côté backend (AC: #1, #5)
  - [x] 🔴 Test échoue : pour un prompt connu contenant des extraits GDD identifiables et une réponse générée fixée, le service retourne un score global, un breakdown par type d’entité cohérent, et un temps de calcul sous le budget défini dans la story (tests avec données synthétiques, sans dépendre d’entités GDD réelles du projet).
  - [x] 🟢 Implémenter `ContextRelevanceService` (ou équivalent dans `services/`) et exposition HTTP sous `/api/v1/...` alignée sur les routers existants (voir Dev Notes).
  - [x] 🔵 Refactor : extraire la stratégie de scoring (heuristique mots / chevauchement / tokenizer) derrière une interface ou fonctions pures testables pour éviter que le router ou le repository ne deviennent le dépôt de la logique métier.

- [x] Task 2 : Exposer la pertinence par dialogue et par nœud avec contrats API typés (AC: #1, #5)
  - [x] 🔴 Test échoue : `GET` sur la ressource convenue (dialogue + node) retourne 404 si le nœud ou le dialogue est introuvable ; retourne un schéma Pydantic stable (score, breakdown, seuils, timestamps) quand les données existent ; erreurs via les exceptions API standard du projet.
  - [x] 🟢 Brancher le router (ex. sous `/api/v1/dialogues` ou domaine contexte) + schémas dans `api/schemas/`, injection via `ServiceContainer` / `Depends`.
  - [x] 🔵 Refactor : mutualiser avec les patterns de `llm_usage` (dialogue_id, node_id, request_id) pour éviter la duplication de validation « dialogue existe » et de sérialisation.

- [x] Task 3 : Afficher pertinence, breakdown et alerte « faible utilisation » dans le frontend (AC: #1, #2, #3)
  - [x] 🔴 Test échoue : après un mock API renvoyant score élevé puis score faible, l’UI affiche le pourcentage / libellé, le breakdown, et le warning sous le seuil ; états chargement et erreur visibles.
  - [x] 🟢 Implémenter `ContextRelevancePanel` (ou intégration dans un panneau existant du workflow de génération) + client `api/*.ts` + types dans `frontend/src/types/api.ts` si besoin.
  - [x] 🔵 Refactor : isoler le formatage des pourcentages et des seuils dans un petit module ou hook pour garder le composant focalisé sur la présentation et les tests sur la logique d’affichage.

- [x] Task 4 : Historique de pertinence par dialogue (AC: #4)
  - [x] 🔴 Test échoue : pour un dialogue_id fixé, l’API liste au moins deux mesures ordonnées chronologiquement avec leurs identifiants de corrélation ; le frontend affiche une série ou une liste exploitable (sans exiger un graphique lourd si une timeline simple suffit pour le MVP).
  - [x] 🟢 Persister ou agréger les scores de façon cohérente avec le stockage des logs de génération (voir Dev Notes — éviter deux silos contradictoires).
  - [x] 🔵 Refactor : clarifier le modèle « une mesure par génération » vs « refresh manuel » pour éviter les doublons confus dans l’historique.

- [x] Task 5 : Intégration post-génération et cohérence avec les logs (AC: #5)
  - [x] 🔴 Test échoue : lors d’un flux de génération simulé (service orchestrateur ou endpoint de test), une entrée de pertinence est créée ou liée au `request_id` / `node_id` attendu et réapparaît dans `GET` historique + détail nœud.
  - [x] 🟢 Brancher le déclenchement au bon point du pipeline (après succès, sans bloquer la réponse utilisateur si le design choisit du async — à documenter dans les Dev Notes du dev).
  - [x] 🔵 Refactor : garantir que les erreurs de scoring ne cassent pas la génération (fallback gracieux, logging contextualisé) et factoriser ce garde-fou pour ne pas dupliquer les try/except dans plusieurs couches.

## Dev Notes

### Architecture guardrails

- Logique métier dans `services/` ; routes dans `api/routers/` ; schémas Pydantic dans `api/schemas/` ; injection via `api/container.py` et `api/dependencies.py` — pas de singletons globaux.
- Le projet distingue documents canoniques (`/api/v1/documents`) et dialogues Unity / génération ; utiliser le même identifiant de dialogue que le reste du flux génération (souvent nom de fichier / `dialogue_id` côté `graph` et `llm_usage`).
- Story 1.15 : `LLMUsageService`, `GET .../dialogue/{dialogue_id}/generation-logs`, modèle `LLMUsageRecord` avec `prompt`, `response`, `node_id` — réutiliser ou étendre pour stocker un champ de pertinence ou une table fichier JSON adjacente, plutôt qu’un second système sans lien.
- Ne pas introduire d’appel LLM obligatoire pour le score si l’AC perf (moins d'une seconde) doit tenir en local ; une heuristique (tokens, n-grams, overlap normalisé) est acceptable pour le MVP si documentée ; une voie « amélioration future » peut être mentionnée sans l’implémenter.
- Story 3.7 (FR17) viendra affiner le détail « sections GDD utilisées » ; éviter de coder un tracker complet ici si cela duplique FR17 — livrer une base de scoring + breakdown compatible avec une extension ultérieure.

### What to reuse

- `services/llm_usage_service.py`, `api/routers/llm_usage.py`, repository d’usage existant pour corrélation `dialogue_id` / `node_id` / `request_id`.
- Patterns frontend des panneaux contexte : `ContextSelector`, stores contexte, et conventions API client dans `frontend/src/api/`.
- Tiktoken déjà dans la stack (estimation tokens ailleurs) si besoin de normalisation longueur / fragments.

### Quality bar

- Backend : tests unitaires du service de scoring (cas limites : texte vide, contexte vide, réponse identique au prompt, caractères non ASCII).
- API : tests d’intégration router (404, schéma, auth si les routes voisines sont protégées de la même façon).
- Frontend : tests Vitest + RTL sur le panneau (seuils, warning, loading).
- Aucune régression sur la génération existante : échec du scoring ne doit pas faire échouer la génération.

### Conventions

- Types TS alignés sur les schémas backend ; snake_case ↔ camelCase comme le reste du projet.
- Pas d’entités GDD réelles dans les tests (règle project-context).
- Windows-first, `pathlib`, UTF-8 pour toute persistance fichier.

### Project Structure Notes

- Zones probables : `services/context_relevance_service.py` (nouveau), `api/routers/dialogues.py` ou `api/routers/context.py`, `api/schemas/…`, `api/container.py`, `frontend/src/components/context/`, `frontend/src/api/`.

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-03.md — Story 3.6] — AC et FR16.
- [Source: _bmad-output/implementation-artifacts/3-5-configurer-règles-contexte-par-type-de-dialogue-fr15.md] — continuité règles/suggestions/contexte.
- [Source: _bmad-output/project-context.md] — architecture, tests, chemins API.
- [Source: api/routers/llm_usage.py, services/llm_usage_service.py, models/llm_usage.py] — logs de génération Story 1.15.

## Technical Requirements (rappel épic)

- Service dédié calcul pertinence : comparaison texte généré vs bloc contexte GDD effectivement injecté (heuristique et/ou similarité — choix à documenter).
- Endpoint REST documenté pour rapport par nœud ; intégration logs génération.
- UI : panneau pertinence + possibilité de surlignage léger dans les vues détail entité si cohérent avec l’existant (ne pas bloquer le MVP sur le highlight si FR17 couvre une partie plus fine).
- Performance : moins d'une seconde en cible nominale ; persistance ou lien aux logs.

## Architecture Compliance

- Respect strict FastAPI + ServiceContainer + `ConfigurationService` pour chemins et config.
- Pas de logique métier dans les composants React au-delà de la présentation ; appels via API.

## Library / Framework Requirements

- Pas de nouvelle dépendance lourde obligatoire ; si ajout (ex. lib NLP), justifier vs heuristique maison et versions dans `requirements.txt`.

## File Structure Requirements

- Nouveaux fichiers sous `services/`, `api/`, `frontend/src/` selon conventions existantes ; ne pas créer de racine ad hoc hors arborescence du repo.

## Testing Requirements

- pytest (miroir `tests/services/`, `tests/api/`) ; Vitest pour UI ; mocks LLM / pas d’appels réseau dans les tests unitaires.

## Previous Story Intelligence

- Story 3.5 a consolidé `ContextRuleService`, endpoints règles par type de dialogue, intégration `dialogue_type` dans les suggestions, store `contextRulesStore` et `ContextRulesEditor`. Garde-fou important : fallback global et non-rétroactivité des dialogues existants — la pertinence doit s’appuyer sur le **contexte effectivement injecté au moment de la génération** (prompt stocké ou reconstruisible), pas sur une sélection UI qui aurait changé après coup.
- Refactors récents : normalisation `_normalize_dialogue_type()`, résolution centralisée des règles dans `evaluate_rules(..., dialogue_type=...)`.

## Git Intelligence Summary

- Commits récents centrés sur règles de contexte, suggestions, intégration UI — la 3.6 complète la boucle « qualité du contexte » côté mesure après les stories 3.2–3.5.

## Latest Technical Information

- Prioriser une approche **déterministe** (overlap, tokenisation, scoring par entité présente dans le prompt système/utilisateur) pour respecter perf et coût zéro LLM supplémentaire ; documenter les limites (ex. paraphrase forte) dans la réponse API ou l’UI.
- Si évolution ultérieure vers embeddings, vérifier contraintes perf et dépendances — hors scope MVP sauon décision explicite.

## Project Context Reference

- Voir `_bmad-output/project-context.md` : couches backend/frontend, règles de tests sans entités GDD réelles, Unity vs documents, logs sous `data/logs/`.

## Senior Developer Review (AI)

**Date :** 2026-03-24  
**Résultat :** Approuvé après correctifs intégrés en même session.

### Constats initiaux (revue adversariale)

1. **AC#2 (HIGH)** : l’UI n’exposait pas explicitement « reflétées » vs « peu détectées » — **corrigé** : blocs « Bien reflétés » / « Peu ou pas détectés » dans `ContextRelevancePanel.tsx` (`data-testid` `context-relevance-reflected`, `context-relevance-weak`).
2. **AC#4 (MEDIUM)** : corrélation `request_id` peu visible dans l’historique — **corrigé** : libellé `req {request_id}` + `title` avec l’identifiant complet.
3. **Tests (MEDIUM)** : absence de couverture erreur API autre que 404 — **corrigé** : test Vitest « API échoue (hors 404) ».
4. **LOW** : import `logging` inutilisé dans `context_relevance_scoring.py` — **supprimé**.
5. **LOW** : `_classify_reflected` — branches `elif pct > 0` / `else` redondantes — **fusionnées**.

### Action items

- [x] Exposer reflected / weak en UI (AC#2)
- [x] Rendre `request_id` lisible dans l’historique (AC#4)
- [x] Test erreur API générique
- [x] Nettoyage module scoring

## Story Completion Status

- Implémentation livrée : scoring `keyword_overlap_v1`, persistance sur `LLMUsageRecord.context_relevance`, endpoints llm-usage, panneau UI dans le panneau GDD, post-génération sur `generate-node` et `regenerate`.
- Revue code : correctifs appliqués ; Vitest `ContextRelevancePanel` (4 tests) et pytest `test_context_relevance_scoring` (7 tests) verts après revue.
- **Statut fichier :** done

## Change Log

- 2026-03-24 : Story 3.6 — pertinence contexte GDD (backend + API + UI + tests).
- 2026-03-24 : Revue code — UI reflected/weak, historique `request_id`, test erreur API, nettoyage scoring.

## Dev Agent Record

### Agent Model Used

Composer (agent dev-story)

### Debug Log References

- N/A

### Completion Notes List

- Task 1–2 : `services/context_relevance_scoring.py` (fonctions pures) + `ContextRelevanceService` ; champ `context_relevance` sur `LLMUsageRecord` ; `LLMUsageService.compute_and_persist_context_relevance` / `get_context_relevance_for_node` / `list_context_relevance_history` ; routes `GET .../context-relevance` et `.../context-relevance-history`.
- Task 3 : `ContextRelevancePanel` + `contextRelevanceFormat.ts` ; client `llmUsage.ts`.
- Task 4 : historique basé sur enregistrements avec `context_relevance` persisté ; tri chronologique.
- Task 5 : `_try_compute_context_relevance` dans `graph.py` après `annotate_usage` (generate-node + regenerate) ; échecs scoring logués sans impact HTTP.
- 🔵 Refactor Task 1 : logique scoring isolée dans `context_relevance_scoring.py` (pas dans le router).
- 🔵 Refactor Task 2 : endpoints sous préfixe `llm-usage` existant, réutilisation `LLMUsageService` / `get_by_dialogue_and_node`.
- 🔵 Refactor Task 3 : formatage pourcentage dans `contextRelevanceFormat.ts`.
- 🔵 Refactor Task 4 : historique = uniquement entrées avec blob persisté (pas de double calcul silencieux en masse).
- 🔵 Refactor Task 5 : helper unique `_try_compute_context_relevance` pour éviter try/except dupliqués.
- Tests : `pytest tests/` — 1276 passed, 1 skipped ; Vitest ciblés context relevance + ContextSelector OK.
- Revue code : assertion `context-relevance-reflected` (score élevé) ; test erreur API ; après correctifs : `vitest run ContextRelevancePanel.test.tsx` (4 passed) ; `pytest tests/services/test_context_relevance_scoring.py` (7 passed).

### File List

- `models/llm_usage.py`
- `services/context_relevance_scoring.py`
- `services/context_relevance_service.py`
- `services/llm_usage_service.py`
- `api/schemas/llm_usage.py`
- `api/routers/llm_usage.py`
- `api/routers/graph.py`
- `frontend/src/api/llmUsage.ts`
- `frontend/src/utils/contextRelevanceFormat.ts`
- `frontend/src/utils/contextRelevanceFormat.test.ts`
- `frontend/src/components/context/ContextRelevancePanel.tsx`
- `frontend/src/components/context/ContextRelevancePanel.test.tsx`
- `frontend/src/components/context/ContextSelector.tsx`
- `tests/services/test_context_relevance_scoring.py`
- `tests/api/test_llm_usage.py`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/3-6-mesurer-pertinence-contexte-gdd-utilisé-dans-dialogue-généré-fr16.md`

