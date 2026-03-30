# Story 3.7 : Voir les sections GDD utilisées dans la génération d'un nœud (FR17)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur générant des dialogues**,
I want **voir quelles sections GDD ont été utilisées pour la génération d'un nœud donné**,
so that **je comprends comment le LLM a exploité le contexte et je peux ajuster sélection ou instructions si besoin**.

## Acceptance Criteria

1. **Given** un nœud a été généré avec contexte GDD injecté **When** je sélectionne le nœud et j’ouvre « Détails contexte » (ou équivalent dans le panneau contexte existant) **Then** un panneau liste les sections GDD considérées comme utilisées pour cette génération **And** pour chaque entrée pertinente : entité (nom), type (personnage, lieu, etc.), nom de section GDD (ex. introduction / sous-section métier), extrait ou référence stable à l’extrait injecté.

2. **Given** le panneau des sections est affiché **When** je consulte la liste **Then** les entrées sont groupées par entité (Personnage X, Lieu Y, …) **And** je peux replier / déplier chaque groupe.

3. **Given** une section listée comme utilisée **When** je clique pour approfondir **Then** je peux voir le contenu de référence (modal ou panneau étendu) **And** les segments du texte générés qui recoupent fortement le contexte (même heuristique que la pertinence / overlap) sont mis en évidence visuellement — sans bloquer le MVP sur un surlignage parfait si la méthode reste documentée.

4. **Given** du contexte a été injecté mais certaines sections ne sont pas détectées comme reflétées dans la sortie **When** j’affiche le panneau **Then** les sections « peu ou pas détectées » sont visibles dans une zone distincte (équivalent UX de « non utilisées » côté détection) **And** un compteur ou libellé indique clairement cette catégorie.

5. **Given** je sélectionne deux nœuds du même dialogue **When** j’ouvre « Comparer contexte » (ou action équivalente) **Then** une vue comparative affiche sections / entités communes vs spécifiques à chaque nœud **And** l’utilisateur peut identifier des patterns d’utilisation entre générations.

## Tasks / Subtasks

- [x] Task 1 : Capturer et persister le détail « sections GDD injectées + score d’usage » par génération de nœud (AC: #1, #4)
  - [x] 🔴 Test échoue : pour un enregistrement d’usage simulé (dialogue_id, node_id, request_id), le service persiste une structure typée listant au moins une entité, une section, un extrait ou identifiant de fragment, et un indicateur utilisé / peu détecté ; lecture renvoie la même structure ; cas vide (pas de contexte) géré sans erreur.
  - [x] 🟢 Étendre la chaîne existante post-génération (Story 3.6 : `LLMUsageService`, `annotate_usage`, `_try_compute_context_relevance`) pour produire et stocker un blob « usage par section » cohérent avec le prompt effectivement envoyé — **sans** introduire de base SQL ; stockage fichier / champs sur `LLMUsageRecord` comme `context_relevance` (voir Dev Notes).
  - [x] 🔵 Refactor : isoler le calcul « section-level » (pur, testable) dans un module dédié ou fonctions pures ; éviter de dupliquer la logique d’overlap déjà présente dans `context_relevance_scoring.py` — composer ou factoriser.

- [x] Task 2 : Exposer l’usage contexte par nœud via API REST typée (AC: #1, #5)
  - [x] 🔴 Test échoue : `GET` sur la ressource convenue retourne 404 si dialogue ou nœud inconnu ; retourne un schéma Pydantic stable (groupes par entité, sections utilisées / peu détectées, corrélation `request_id` si présent) quand des données existent.
  - [x] 🟢 Router sous le même namespace que `llm-usage` ou `dialogues` (cohérence avec Story 3.6), schémas dans `api/schemas/`, injection via `ServiceContainer`.
  - [x] 🔵 Refactor : mutualiser la validation « dialogue existe + node_id » avec les endpoints `context-relevance` existants pour éviter trois copies de la même garde.

- [x] Task 3 : UI — panneau « Détails contexte » avec groupes et zones utilisées / peu détectées (AC: #1, #2, #4)
  - [x] 🔴 Test échoue : avec mock API, l’UI affiche groupes par entité, états chargement / erreur / vide, et la distinction visuelle entre sections mises en avant vs zone « peu détectées » ; tests RTL ciblés (`data-testid` stables).
  - [x] 🟢 Composant dédié (ex. `ContextUsagePanel.tsx`) + client `api/*.ts` + types `frontend/src/types/api.ts` si besoin ; intégration au flux existant (panneau GDD / sélecteur de contexte / NodeEditor — choisir l’emplacement le plus cohérent avec `ContextRelevancePanel`).
  - [x] 🔵 Refactor : extraire formatage des libellés (types d’entité, titres de sections) dans un util ou hook pour garder le composant présentationnel.

- [x] Task 4 : Drill-down section + mise en évidence des recoupements texte généré / contexte (AC: #3)
  - [x] 🔴 Test échoue : au clic sur une section, une modal ou panneau étendu s’ouvre avec le texte de référence ; si la réponse générée est fournie par le mock, des segments attendus sont marqués (classe CSS ou `mark`) selon la règle documentée.
  - [x] 🟢 Réutiliser patterns de modal / détail entité existants (`EntityDetailsModal` ou équivalent) si pertinent ; ne pas dupliquer tout le rendu GDD.
  - [x] 🔵 Refactor : si la logique de surlignage dépasse ~60 lignes dans le composant, extraire une fonction pure `buildHighlightRanges` testée unitairement côté TS.

- [x] Task 5 : Comparaison de contexte entre deux nœuds (AC: #5)
  - [x] 🔴 Test échoue : avec deux jeux de données mockés, la vue comparative affiche au moins « communs » vs « uniquement A » / « uniquement B » (par entité ou par clé de section) ; accessible depuis l’UI sans erreur console.
  - [x] 🟢 Composant dédié (ex. `ContextComparisonView.tsx`) + endpoint ou agrégation côté client à partir de deux `GET` — préférer deux appels simples si pas de besoin serveur lourd.
  - [x] 🔵 Refactor : normaliser la forme « liste plate de clés de section » en un seul endroit pour que le panneau détail et la comparaison partagent la même clé métier.

## Dev Notes

### Architecture guardrails

- **Pas de table SQL** : le dépôt est fichier-based ; l’énoncé epic mentionnant `context_usage_logs` est **non applicable tel quel**. Étendre le modèle de persistance déjà utilisé pour `LLMUsageRecord` (champ JSON optionnel sibling de `context_relevance`, ou enrichissement structuré si un seul blob reste cohérent) et `LLMUsageService` / repository existants.
- Logique métier dans `services/` ; routes dans `api/routers/` ; schémas Pydantic dans `api/schemas/` ; injection via `api/container.py` — pas de singletons globaux.
- **Source de vérité** : sections réellement présentes dans le **prompt enregistré** (`prompt` sur l’usage) ou, mieux, snapshot structuré produit au moment du `build_context` / assemblage prompt dans le router graphe — à documenter dans le code pour éviter dérive « UI a changé après coup » (même principe que Story 3.6).
- Réutiliser / composer avec `services/context_relevance_scoring.py` et les structures de breakdown existantes pour ne pas inventer une deuxième métrique incompatible.
- Échecs d’analyse section-level ne doivent **pas** casser la génération (logging + fallback gracieux), comme pour la pertinence.

### What to reuse

- `services/llm_usage_service.py`, `api/routers/llm_usage.py`, `models/llm_usage.py`, flux `api/routers/graph.py` post-génération (`_try_compute_context_relevance`).
- UI : `ContextRelevancePanel`, `ContextSelector`, conventions client API — même famille de panneaux « transparence contexte ».
- `ContextBuilder` / `build_context_json` : point d’accroche pour savoir quelles sections ont été injectées si le backend peut émettre une structure en parallèle du texte.

### Quality bar

- Backend : tests unitaires sur le module de découpage / scoring section-level (texte vide, une section, plusieurs entités, caractères non ASCII).
- API : tests d’intégration (404, schéma, auth alignée sur routes voisines).
- Frontend : Vitest + RTL sur panneau et comparaison ; pas d’entités GDD réelles dans les tests.
- Aucune régression sur génération et sur Story 3.6 (champs `context_relevance` inchangés côté contrat public ou migration documentée).

### Conventions

- Types TS alignés sur schémas backend ; snake_case ↔ camelCase comme le reste du projet.
- Windows-first, `pathlib`, UTF-8 pour toute persistance fichier.

### Project Structure Notes

- Zones probables : `services/` (service ou extension relevance/usage), `api/schemas/llm_usage.py` ou schéma dédié, `api/routers/llm_usage.py`, `frontend/src/components/context/`, `frontend/src/api/`.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-03.md` — Story 3.7] — AC et FR17.
- [Source: `_bmad-output/implementation-artifacts/3-6-mesurer-pertinence-contexte-gdd-utilisé-dans-dialogue-généré-fr16.md`] — persistance usage, endpoints, UI pertinence, garde-fous scoring.
- [Source: `_bmad-output/project-context.md`] — architecture, interdiction tests sur entités GDD réelles, chemins API.

## Technical Requirements (rappel épic — adapté au repo)

- Service de suivi / dérivation des sections utilisées par nœud, aligné sur le stockage fichier des usages LLM.
- Endpoint REST `GET` documenté pour consultation par `dialogue_id` + `node_id` (et option comparaison via double appel ou query params si justifié).
- Frontend : panneau liste + groupement + comparaison deux nœuds ; cohérence visuelle avec les panneaux contexte existants.
- Performance : rester dans l’ordre de grandeur de Story 3.6 (pas de chaîne synchrone lourde sur la requête de génération ; async ou post-traitement acceptable si documenté).

## Architecture Compliance

- FastAPI + `ServiceContainer` + `ConfigurationService` ; pas de logique métier dans les composants React hors présentation.

## Library / Framework Requirements

- Pas de nouvelle dépendance lourde obligatoire ; réutiliser tiktoken / heuristiques existantes si besoin de normalisation.

## File Structure Requirements

- Nouveaux fichiers sous `services/`, `api/`, `frontend/src/` selon conventions ; ne pas créer de racine ad hoc.

## Testing Requirements

- pytest (miroir `tests/services/`, `tests/api/`) ; Vitest pour UI ; mocks, pas d’appels LLM réels.

## Previous Story Intelligence

- Story 3.6 a posé `context_relevance` sur `LLMUsageRecord`, scoring `keyword_overlap_v1`, endpoints sous `llm-usage`, `ContextRelevancePanel`, post-génération dans `graph.py` via `_try_compute_context_relevance`. **FR17** ajoute la granularité **section / entité** et l’UI dédiée : étendre plutôt que paralléliser un second système sans lien.
- La revue 3.6 a insisté sur **reflected / weak** et `request_id` visible — répliquer le même souci de traçabilité pour l’usage par section.

## Git Intelligence Summary

- Travaux récents sur règles de contexte, suggestions, `contextRulesStore` ; la 3.7 prolonge la transparence « qualité contexte » côté utilisateur après mesure agrégée (3.6).

## Latest Technical Information

- Prioriser une approche **déterministe** (overlap sur fragments injectés par section) pour cohérence avec 3.6 et absence de coût LLM supplémentaire ; documenter les limites (paraphrase, sections non citées textuellement).
- Si capture au moment du `ContextBuilder` : prévoir un format JSON sérialisable stable (liste d’objets avec `entity_type`, `entity_name`, `section_key`, `excerpt`, `token_estimate` optionnel).

## Project Context Reference

- Voir `_bmad-output/project-context.md` : couches backend/frontend, règles de tests, documents vs Unity, logs.

## Story Completion Status

- **Statut fichier :** done
- Implémentation : persistance `context_section_usage`, `GET .../context-usage`, UI panneau + modal + comparaison ; tests pytest + Vitest ciblés verts ; revue code 2026-03-24 (correctifs intégrés).

## Senior Developer Review (AI)

**Date :** 2026-03-24  
**Résultat :** Approuvé après correctifs (revue adversariale + option correctifs auto).

### Constats (revue)

1. **HIGH → résolu** : prompts système souvent **XML** (`PromptEngine`) alors que le découpeur section est calibré **markdown `###`** — risque de seau unique « Contexte » peu informatif vs AC#1. **Correctif :** champ `parser_note` dans le rapport API + affichage discret dans le panneau ; test `test_parser_note_when_xml_system_prompt`.
2. **MEDIUM → résolu** : **Échap** sur la modal d’usage : handler uniquement sur l’overlay non focalisable. **Correctif :** `useEffect` + `document.addEventListener('keydown')` ; `tabIndex={-1}` sur le dialog.
3. **MEDIUM → résolu** : **AC#5** — la multi-sélection graphe (`selectedNodeIds`) ne pré-remplissait pas le second nœud pour la comparaison. **Correctif :** effet qui définit `compareNodeId` à `selectedNodeIds[1]` quand le premier ID est le nœud courant.
4. **MEDIUM → résolu** : mock tests sans `selectedNodeIds` → crash `.length`. **Correctif :** garde `selectedNodeIds ?? []` + mock explicite dans `ContextUsagePanel.test.tsx`.
5. **LOW (info)** : `buildHighlightRanges` fait des `indexOf` sur sous-chaînes (pas de `\b` systématique) — faux positifs possibles ; acceptable MVP (aligné heuristique backend).
6. **LOW (info)** : fichiers modifiés hors File List story dans le working tree (`data/notion_cache/`, `test_prompt_output.txt`) — hors périmètre 3.7 ; ne pas confondre avec dette doc story.

### Action items revue

- [x] `parser_note` + test XML
- [x] Escape global modal
- [x] Préremplissage comparaison multi-sélection + robustesse `selectedNodeIds`

## Change Log

- 2026-03-24 : Implémentation Story 3.7 (backend scoring sections, API, UI, tests).
- 2026-03-24 : Revue code — `parser_note`, Escape modal, comparaison multi-sélection, tests associés.

## Dev Agent Record

### Agent Model Used

Composer (Cursor agent / dev-story)

### Debug Log References

- N/A

### Completion Notes List

- Task 1 : `services/context_section_usage_scoring.py` ; champs exportés dans `context_relevance_scoring.py` ; `LLMUsageRecord.context_section_usage` ; `compute_and_persist_context_relevance` enrichit et lazy-load remplit pertinence + usage en binôme.
- Task 2 : `GET /api/v1/llm-usage/dialogue/{id}/nodes/{id}/context-usage` ; schémas `ContextSectionUsage*` ; `_context_section_usage_to_response` + aperçu généré via `extract_generated_plain_text` ; `get_record_for_dialogue_node` pour mutualiser l’accès record.
- Task 3 : `ContextUsagePanel` + `contextUsageLabels.ts` sous `ContextSelector` après `ContextRelevancePanel`.
- Task 4 : `ContextSectionUsageModal` + `textHighlightRanges.ts` (`buildHighlightRanges`) + test unitaire TS.
- Task 5 : `ContextComparisonView` + double `getNodeContextSectionUsage` ; sélecteur second nœud dans le panneau.
- 🔵 Task 1 : scoring isolé dans `context_section_usage_scoring.py`, réutilisation `tokenize_words_for_overlap` / `overlap_percent_sets` / `slice_gdd_type_bodies`.
- 🔵 Task 2 : `get_record_for_dialogue_node` centralise la résolution dialogue/nœud.
- 🔵 Task 3 : libellés FR hors composant (`labelForEntityType`).
- 🔵 Task 4 : surlignage hors modal (`buildHighlightRanges`).
- 🔵 Task 5 : clés `section_key` partagées API ↔ comparaison (dérivées backend `_slug_key`).
- Tests : `tests/services/test_context_section_usage_scoring.py` ; `tests/api/test_llm_usage.py` (404 + 200 context-usage) ; extension `test_llm_usage_compute_and_persist` ; Vitest `ContextUsagePanel`, `ContextComparisonView`, `textHighlightRanges`.
- Revue code : `parser_note` (XML vs markdown), listener Escape sur `ContextSectionUsageModal`, auto-compare `selectedNodeIds`, `test_parser_note_when_xml_system_prompt`.

### File List

- `models/llm_usage.py`
- `services/context_relevance_scoring.py`
- `services/context_section_usage_scoring.py`
- `services/llm_usage_service.py`
- `api/schemas/llm_usage.py`
- `api/routers/llm_usage.py`
- `tests/services/test_context_section_usage_scoring.py`
- `tests/api/test_llm_usage.py`
- `tests/services/test_context_relevance_scoring.py`
- `frontend/src/api/llmUsage.ts`
- `frontend/src/utils/contextUsageLabels.ts`
- `frontend/src/utils/textHighlightRanges.ts`
- `frontend/src/utils/textHighlightRanges.test.ts`
- `frontend/src/components/context/ContextSectionUsageModal.tsx`
- `frontend/src/components/context/ContextUsagePanel.tsx`
- `frontend/src/components/context/ContextUsagePanel.test.tsx`
- `frontend/src/components/context/ContextComparisonView.tsx`
- `frontend/src/components/context/ContextComparisonView.test.tsx`
- `frontend/src/components/context/ContextSelector.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/3-7-voir-sections-gdd-utilisées-dans-génération-nœud-fr17.md`

