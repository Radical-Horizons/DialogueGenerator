# Story 4.7 : évaluer-qualité-dialogue-avec-llm-judge-score-0-10-1-marge-fr42

Status: done

<!-- Note : validation optionnelle. Exécuter validate-create-story avant dev-story si besoin. -->

## Story

As a **utilisateur créant des dialogues**,
I want **évaluer la qualité des dialogues avec un LLM judge (score 0-10, marge de variance ±1)**,
so that **je peux obtenir un feedback objectif sur la qualité narrative et itérer si nécessaire**.

## Acceptance Criteria

1. **Given** j’ai un graphe / dialogue chargé dans l’éditeur, **When** je lance une **évaluation qualité LLM**, **Then** un appel backend utilise le **provider LLM configuré** (même abstraction que la génération — OpenAI/Mistral, `DummyLLMClient` sans clé) avec un **prompt judge** dédié, **And** la réponse structurée contient un **score global 0–10** (nombre) et une **marge explicite ±1** documentée côté UI (variance attendue entre deux passes).
2. **Given** l’évaluation est terminée avec succès, **When** je consulte le résultat, **Then** j’obtiens un **rapport** avec : score global, **scores ou notes par critère** (cohérence narrative, caractérisation, agentivité, style — alignés epic), **et commentaires textuels** par critère ou globaux, **And** les types sont alignés **Pydantic ↔ `frontend/src/types/api.ts`**.
3. **Given** le score global est **&lt; 5**, **When** le rapport s’affiche, **Then** un **avertissement** non bloquant du type « Qualité faible — considérer régénération » apparaît **And** des **suggestions** issues du judge (ou dérivées des commentaires) sont visibles.
4. **Given** le score global est **&gt; 8**, **When** le rapport s’affiche, **Then** un **message positif** (« Qualité excellente » ou équivalent) apparaît **And** les **points forts** (extraits des commentaires / rubrique dédiée) sont mis en avant.
5. **Given** je lance **plusieurs évaluations** sur le même dialogue dans une session, **When** je consulte l’historique **session** (pas obligatoirement persisté disque dans le MVP), **Then** je vois **l’évolution des scores** (liste ou graphique simple — ex. sparkline / série) **And** l’UI rappelle que **±1** entre passes est **normal**.
6. **Given** le LLM échoue (timeout, provider indisponible, parsing JSON invalide), **When** l’API répond, **Then** erreur **HTTP + message** clair (pas de score vide silencieux), **And** le frontend affiche l’échec sans casser le graphe.
7. **Tests** : **pytest** (service + route, LLM mocké / dummy) ; **Vitest** sur parsing client + états UI critiques ; **`npm --prefix frontend run lint`** sans régression ; pas de données GDD réelles dans les tests.

## Tasks / Subtasks

- [x] **Task 1** : Exposer une évaluation qualité côté API avec réponse structurée (score global + critères + commentaires) (AC: #1, #2, #6, #7)  
  - [x] 🔴 Test échoue : test d’intégration API (ou service pur) où un **mock LLM** renvoie un JSON judge valide → réponse contient `overall_score` (0–10), critères attendus, champs texte ; cas **erreur LLM** → statut d’erreur documenté.  
  - [x] 🟢 Implémenter un service dans **`services/`** (ex. `LLMQualityJudgeService` ou nom cohérent avec le dépôt) + route **FastAPI** sous le préfixe **`/api/v1`** aligné sur les patterns existants : **même style que** `POST .../unity-dialogues/graph/validate` (corps avec contenu graphe / JSON dialogue) **ou** variante document si déjà canonique pour ce flux — **choisir une seule** et la documenter en Dev Notes (éviter `/dialogues/{id}` si l’app utilise **`documents`** + payload graphe).  
  - [x] 🔵 Refactor : isoler le **prompt judge** + schéma de sortie dans un module dédié (ex. `core/prompt/` ou `services/` + constantes) pour éviter un router bouffi ; réutiliser l’**injection** `ServiceContainer` / `get_*` existante.

- [x] **Task 2** : Panneau UI « Qualité LLM » intégré à l’éditeur graphe (lancement, chargement, affichage rapport) (AC: #1–#5, #6, #7)  
  - [x] 🔴 Test échoue : avec **mock HTTP**, clic (ou action store) « Évaluer » → **état loading** puis rendu du **score** et d’au moins **un critère** ; erreur API → message utilisateur visible.  
  - [x] 🟢 Ajouter UI dans **`frontend/src/components/graph/`** (nouveau composant ou extension **non destructive** de `GraphValidationPanel` / toolbar) ; consommer le client **`frontend/src/api/`** typé ; respect **Zustand** / pas d’événements `window`.  
  - [x] 🔵 Refactor : si le panneau grossit, extraire sous-composants (**résumé score**, **liste critères**, **historique session**) avec props minimales ; garder **ESLint** vert.

- [x] **Task 3** : Seuils UX &lt; 5 / &gt; 8 + historique session des scores (AC: #3–#5, #7)  
  - [x] 🔴 Test échoue : avec scores mockés **4** et **9**, les libellés **warning** vs **positif** apparaissent ; après **deux** résultats mockés, l’**historique** affiche **2 points** (ou série) avec rappel **±1**.  
  - [x] 🟢 Implémenter la logique de seuils et l’historique **session** (store ou état local du panneau — pas d’obligation backend tant que l’AC « session » est couvert).  
  - [x] 🔵 Refactor : centraliser seuils (`QUALITY_LOW_THRESHOLD`, etc.) dans un petit module utilitaire testable plutôt que magie dans le JSX.

## Dev Notes

- **Branche courante** `Epic/04-validation-QA` → épique **4** ; enchaînement logique après **4.6 (cycles)** : le panneau validation est déjà dense — **préférer une section ou onglet** « Qualité LLM » plutôt qu’un empilement illisible.
- **Ne pas réinventer** : clients LLM existants (`core/llm/`, orchestration déjà utilisée pour génération) ; **coût / usage** : si `LLMUsageService` ou équivalent est branché sur la génération, **évaluer** une ligne d’enregistrement cohérente pour le judge (sans bloquer la story sur une refonte facturation).
- **Structured output** : suivre **`docs/prompts/STRUCTURED_OUTPUT_EXPLANATION.md`** et **`.cursor/rules/structured_output.mdc`** — schéma Pydantic strict côté API, pas de doublon d’instructions dans le prompt.
- **GPT-5 / Responses API** : si le chemin judge passe par les clients OpenAI récents, respecter **`.cursor/rules/llm.mdc`** et **`docs/architecture/OPENAI_API_GPT5.md`**.
- **DummyLLM** : les tests et le dev sans clé doivent rester **déterministes** (réponse judge fixture).
- **Références UI voisines** : `GraphValidationPanel.tsx`, `GraphValidationPanelLists.tsx`, `uiSlice.ts` (patterns loading / erreurs) ; **ne pas régresser** FR36–FR41 (validate, lore, orphelins, cycles).
- **Qualité** : pas de logique métier dans les routers ; pas de secrets en dur ; **Windows / UTF-8** pour tout texte dialogue sérialisé.

### Endpoint FR42 (décision implémentation)

- **`POST /api/v1/unity-dialogues/graph/evaluate-dialogue-quality`**
- **Corps** : `{ "nodes": [...], "edges": [...], "llm_model_identifier": "<optionnel>" }` — aligné sur `ValidateGraphRequest` + modèle optionnel (défaut = `default_model` de `llm_config.json`).
- **Réponse** : `EvaluateDialogueQualityResponse` (Pydantic) — miroir `frontend/src/types/graph.ts` + réexport `frontend/src/types/api.ts`.

### Project Structure Notes

- Backend : `services/` (nouveau service judge), `api/routers/` (route mince), `api/schemas/` (modèles réponse).
- Frontend : `frontend/src/components/graph/`, `frontend/src/api/*.ts`, types `frontend/src/types/api.ts`.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-04.md` — Story 4.7, FR42]  
- [Source: `api/routers/graph.py` — `validate_graph`, `validate_lore_explicit` patterns]  
- [Source: `_bmad-output/implementation-artifacts/4-6-détecter-cycles-dans-flux-dialogue-fr41.md` — intégration panneau, tests, layout]  
- [Source: `_bmad-output/project-context.md` — stack, documents, tests sans GDD réel]

### Architecture Compliance

- FastAPI : routers minces, **`ServiceContainer`** / `Depends` ; logique **`services/`**.  
- React : état **`Zustand`**, communication **`graphViewStore`** si besoin de focus nœud ; **pas** d’événements globaux `window`.

### Library / Framework Requirements

- Pas de nouvelle dépendance **sauf justification** (graphiques : préférer HTML/CSS simple ou lib déjà présente ; vérifier `package.json` avant d’ajouter Recharts/Chart.js).

### File Structure Requirements

- Respecter la limite **~300 lignes** par fichier source touché ; extraire si nécessaire.

### Testing Requirements

- `pytest` ciblé nouveau service + route ; `vitest` ciblé composants / store ; `npm --prefix frontend run lint`.  
- Tiers : `.cursor/commands/test-tiers.md` / `workflow.mdc`.

### Previous Story Intelligence

- **4.6 (done)** : patterns **`GraphValidationPanel*`**, **`graphViewStore`** pour navigation, **`uiSlice`** pour agrégation erreurs/warnings, **tests Vitest** riches sur validation ; **layout sidecar** pour persistance — le judge peut rester **session-first** sauf décision produit d’aligner sur document.  
- **Revue 4.6** : attention **synchro** états (ex. recalcul surlignages quand plusieurs validations cohabitent) — pour 4.7, éviter d’écraser des états `validationErrors` / loading existants : **clés d’état séparées** ou sous-slice dédié.

### Git Intelligence Summary

- Commits récents sur `Epic/04-validation-QA` : **FR41** (cycles, layout `intentionalCycleIds`), **FR40**, **FR39**. Fichiers chauds probables : **`graph.py`**, **`GraphValidationPanel*.tsx`**, **`uiSlice.ts`**, **`api/schemas/graph.py`**.

### Latest Tech Information

- Stack stable (FastAPI, Pydantic v2, React 18, React Flow 11). Pour schémas JSON / judge, vérifier la doc du **provider** utilisé via le client déjà intégré (pas d’upgrade imposé par la story).

### Project Context Reference

- `_bmad-output/project-context.md` — chemins API, interdiction logique métier dans routers, Unity JSON v1.1.0.

## Dev Agent Record

### Agent Model Used

Composer / Amelia (dev-story workflow)

### Debug Log References

- Pytest : `tests/api/test_graph_evaluate_dialogue_quality.py`, `tests/services/test_llm_quality_judge_service.py`
- Vitest : `GraphQualityLlmPanel.test.tsx`, `qualityLlmUi.test.ts`
- Régression : `pytest tests/api/ -k graph` (62 passed)

### Completion Notes List

- **Task 1** : `LLMQualityJudgeService` + `POST .../evaluate-dialogue-quality` ; schéma LLM `models/dialogue_quality_judge.py` ; prompt `core/prompt/dialogue_quality_judge.py` ; réponse HTTP `api/schemas/dialogue_quality.py` ; `DummyLLMClient` étendu ; `get_llm_quality_judge_service` ; tracking `LLMUsageService` best-effort.
- **🔵 Task 1 Refactor** : avant → logique et schéma auraient pu vivre dans le router ; après → prompt isolé `core/prompt/dialogue_quality_judge.py`, schéma structuré `models/dialogue_quality_judge.py`, router < 150 lignes ajoutées dédiées juge.
- **Task 2–3** : panneau `GraphQualityLlmPanel` (overlay top-right), bouton toolbar `✨ Qualité LLM`, état session local + sparkline ; seuils `qualityLlmUi.ts`.
- **🔵 Task 2 Refactor** : `GraphQualityLlmCriteriaList.tsx`, `GraphQualityLlmHistorySparkline.tsx` extraits du JSX principal.
- **🔵 Task 3 Refactor** : `QUALITY_LOW_THRESHOLD` / `QUALITY_HIGH_THRESHOLD` / `qualityBandForOverallScore` centralisés dans `qualityLlmUi.ts` (plus de seuils en dur dans le rapport).
- **Code review (post-merge)** : `mergeLowScoreSuggestions` / `mergeHighScoreStrengths` (AC #3/#4) ; `import time` global dans `api/routers/graph.py`.

### File List

- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/4-7-évaluer-qualité-dialogue-avec-llm-judge-score-0-10-1-marge-fr42.md`
- `api/dependencies.py`
- `api/routers/graph.py`
- `api/schemas/dialogue_quality.py`
- `core/llm/llm_client.py`
- `core/prompt/dialogue_quality_judge.py`
- `models/dialogue_quality_judge.py`
- `services/llm_quality_judge_service.py`
- `tests/api/test_graph_evaluate_dialogue_quality.py`
- `tests/services/test_llm_quality_judge_service.py`
- `frontend/src/api/graph.ts`
- `frontend/src/types/graph.ts`
- `frontend/src/types/api.ts`
- `frontend/src/hooks/useGraphToolbar.ts`
- `frontend/src/utils/qualityLlmUi.ts`
- `frontend/src/utils/qualityLlmUi.test.ts`
- `frontend/src/components/graph/GraphEditor.tsx`
- `frontend/src/components/graph/GraphEditorHeader.tsx`
- `frontend/src/components/graph/GraphQualityLlmPanel.tsx`
- `frontend/src/components/graph/GraphQualityLlmPanel.test.tsx`
- `frontend/src/components/graph/GraphQualityLlmCriteriaList.tsx`
- `frontend/src/components/graph/GraphQualityLlmHistorySparkline.tsx`
- `frontend/src/__tests__/GraphEditorHeader.undoRedo.test.tsx`
- `frontend/src/__tests__/GraphEditor.loreValidationPanel.test.tsx`

## Change Log

- 2026-04-07 : Implémentation FR42 — endpoint juge qualité, UI panneau session, tests pytest/Vitest, lint vert ; statut sprint → review.
- 2026-04-07 : Code review (Amelia) — corrections UX AC #3/#4 (`mergeLowScoreSuggestions` / `mergeHighScoreStrengths`), `import time` module-level `api/routers/graph.py` ; statut → done.

## Senior Developer Review (AI)

**Reviewer :** Amelia (workflow code-review) — 2026-04-07

**Git vs File List :** écarts **LOW** (branche) — `.cursor/`, `data/cost_budgets.json`, `.gitignore`, story 4-8 supprimée : hors périmètre FR42, non traités comme échec doc.

**Findings corrigés (option [1]) — MEDIUM**

1. **AC #3 partiel** : bandeau score &lt; 5 sans `suggestions` API n’affichait pas de pistes « dérivées des commentaires » → `frontend/src/utils/qualityLlmUi.ts` : `mergeLowScoreSuggestions` ; `GraphQualityLlmPanel.tsx` ; tests `qualityLlmUi.test.ts`, `GraphQualityLlmPanel.test.tsx`.
2. **AC #4 partiel** : bandeau score &gt; 8 sans `strengths` API → `mergeHighScoreStrengths` (commentaires critères par score décroissant).
3. **Qualité code** : `import time` déplacé en tête de `api/routers/graph.py` (cohérence imports).

**Findings restés LOW / INFO (non bloquants)**

- UI n’envoie pas `llm_model_identifier` (défaut config — acceptable MVP).
- Tests pytest succès dummy n’assertent pas le contenu des listes `suggestions`/`strengths` (couverture UI renforcée côté Vitest).

**Verdict :** AC #1–#7 validés après correctifs ; tâches [x] cohérentes avec le code relu.

## Story completion status

**Statut :** done  
**Note :** Code review terminée ; sprint synchronisé `4-7-…-fr42` → done.
