# Story 4.9 : détecter-context-dropping-lore-explicite-vs-subtil-fr44

Status: review

<!-- Note : validation optionnelle. Exécuter validate-create-story avant dev-story si besoin. -->

## Story

As a **utilisateur créant des dialogues**,
I want **détecter le context dropping (lore explicite vs subtil)**,
so that **je peux garantir que le contexte GDD sélectionné est effectivement reflété dans les dialogues générés**.

## Acceptance Criteria

1. **Given** un graphe / dialogue chargé et un **contexte GDD utilisable** (sélections / texte de contexte aligné sur ce que la génération utilise — même famille de données que `validate_graph`), **When** je lance une **détection context dropping**, **Then** le backend compare des **informations clés** dérivées du contexte avec le **texte des nœuds** (lignes + choix pertinents) **And** les cas où une information jugée **explicite / attendue** dans le contexte n’apparaît **ni explicitement ni de façon détectable comme référence** dans le dialogue sont **listés** avec nœud(s) concerné(s) et message actionnable.
2. **Given** le contexte mentionne explicitement une information factuelle (ex. statut, relation) **When** aucun nœud ne contient de signal raisonnable de cette information **Then** un **warning** du type « Context dropping : … du contexte non utilisé » est produit **And** au moins un **stableId** (ou identifiant affichable) cible le bon nœud ou indique « dialogue entier / à placer » selon le design retenu.
3. **Given** une information est présente mais **trop vague / trop subtile** par rapport au seuil MVP (heuristique documentée), **When** la détection tourne **Then** un avertissement **« subtilité »** peut être émis **And** une **suggestion** textuelle invite à renforcer l’explicitation (sans imposer une réécriture automatique).
4. **Given** la **Story 4.10** n’est pas encore implémentée, **When** la détection tourne **Then** un **jeu de règles par défaut** (strict / léger ou équivalent minimal) est appliqué **côté serveur** **And** le contrat API prévoit (champs optionnels ou stub documenté) l’**extension** par règles utilisateur sans casser les clients.
5. **Given** plusieurs cas sont détectés, **When** la réponse revient **Then** un **résumé** du type « X cas de context dropping détectés » est présent **And** la liste détaillée reste non vide si X > 0.
6. **Given** graphe vide, contexte vide ou erreur serveur, **When** l’API répond **Then** le comportement est **explicite** (message clair, pas de succès silencieux vide confondu avec « RAS »).
7. **Tests** : **pytest** (service pur + route, données **génériques** inventées — pas de personnages/lieux GDD réels) ; **Vitest** (UI / client) ; **`npm --prefix frontend run lint`** sans régression.

## Tasks / Subtasks

- [x] **Task 1** : Service `ContextDroppingDetector` + route API sur payload graphe + contexte (AC: #1, #2, #4, #6, #7)  
  - [x] 🔴 Test échoue : fixture avec **contexte texte minimal** contenant une **entité / fait** clairement extractible par la heuristique MVP, et **nœuds** sans mention → réponse contient **au moins un** cas `context_dropping` (ou type nommé équivalent) ; fixture **sans contexte** → erreur ou message **documenté**, pas 500 opaque.  
  - [x] 🟢 Implémenter **`ContextDroppingDetector`** dans **`services/`**, route sous **`/api/v1/unity-dialogues/graph/`** alignée sur **`detect-ai-slop`** / **`validate_graph`** (corps avec `nodes`/`edges` + champs contexte — réutiliser ou mirroir de `context_selections` / blob construit côté client si déjà disponible). Schémas **Pydantic** (`api/schemas/graph.py`) + types **`frontend/src/types/graph.ts`**. Logique **hors router** ; injection **`ServiceContainer`**.  
  - [x] 🔵 Refactor : isoler **extraction « faits / entités »** (MVP : heuristique simple, pas NLP lourd) de la **comparaison texte** ; éviter fichier router > 300 lignes — extraire helpers réponse comme pour slop.

- [x] **Task 2** : Panneau UI « Context dropping » dans l’éditeur graphe (résumé, liste, navigation nœud) (AC: #1–#6, #7)  
  - [x] 🔴 Test échoue : mock API → action « Détecter context dropping » → **loading** puis **résumé** + **au moins une ligne** de détail ; erreur API → message visible ; **pas** d’écrasement des états **juge LLM** / **AI slop** (clés d’état distinctes, même principe que story 4.8).  
  - [x] 🟢 Ajouter composant sous **`frontend/src/components/graph/`** ; client **`frontend/src/api/graph.ts`** ; **`graphViewStore`** / **`jumpToNode`** pour focus. Placer l’entrée **toolbar** / panneau validation de façon **cohérente** avec **FR42/43** (pas trois loaders mutuellement écrasants).  
  - [x] 🔵 Refactor : si le panneau dépasse **~300 lignes**, extraire **Résumé** + **Liste** ; garder accessibilité basique (titres, listes).

- [x] **Task 3** : Seuil « subtil vs explicite » + suggestions (AC: #3, #5, #7)  
  - [x] 🔴 Test échoue : cas où l’information est présente sous forme **très indirecte** → le service retourne soit **warning subtilité** soit **absence** selon la règle documentée — **comportement stable** couvert par test nommé.  
  - [x] 🟢 Implémenter branche **« too_subtle »** ou score minimal **sans LLM obligatoire** pour le MVP ; documenter limites dans Dev Notes (faux positifs / négatifs attendus).  
  - [x] 🔵 Refactor : centraliser constantes de seuils / messages dans un petit module **`context_dropping_*`** (Python) ou objet de config pour éviter magie dans le détecteur.

## Dev Notes

- **Architecture** : FastAPI routers minces ; logique **`services/`** ; **`ConfigurationService`** / **`ServiceContainer`** — pas de singletons. Pas de logique métier lourde dans le frontend.  
- **Réutiliser** : `services/graph_dialogue_text.py` pour parcourir texte nœuds comme lore/slop ; patterns **`GraphValidationService`** / payload **`validate_graph`** pour **context_selections** et enrichment **ContextBuilder** — ne pas dupliquer la construction JSON contexte si une fonction existe déjà ; sinon **appel unique** documenté.  
- **Ne pas confondre** : **FR38/39** = contradictions / ambiguïtés ; **FR44** = **absence** d’usage du contexte sélectionné. Réutiliser les **structures** de faits si utile, mais le **signal métier** est différent.  
- **Epic doc** mentionne `POST /api/v1/dialogues/{id}/detect-context-dropping` — **contrat réel du repo** = `POST /api/v1/unity-dialogues/graph/detect-context-dropping` (graphe + `context_selections`, comme FR43 / validate-lore-explicit).  
- **Story 4.10** : prévoir champs optionnels (`rules_profile`, `tolerance`) **ignorés** ou **partiellement lus** avec défauts sûrs — pas de dépendance dure à 4.10 pour merger 4.9.  
- **Performance** : pas d’appel LLM **requis** pour le MVP ; viser latence comparable au **slop** sur graphes moyens.  
- **Tests** : respect **`project-context.md`** — pas de noms GDD réels dans les tests.

### Project Structure Notes

- Backend : `services/context_dropping_*.py`, `api/routers/graph.py`, `api/schemas/graph.py`, `tests/services/`, `tests/api/`.  
- Frontend : `frontend/src/components/graph/`, `frontend/src/api/graph.ts`, `frontend/src/types/graph.ts`, hooks toolbar si nécessaire.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-04.md` — Story 4.9, FR44]  
- [Source: `_bmad-output/implementation-artifacts/4-8-détecter-patterns-ai-slop-gpt-isms-répétition-phrases-génériques-fr43.md` — contrat API graphe, UI, états]  
- [Source: `services/lore_contradiction_validator.py` / `services/graph_dialogue_text.py` — texte nœuds, patterns lore]  
- [Source: `api/routers/graph.py` — `validate_graph`, `detect-ai-slop`]  
- [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

Composer (implémentation agentique dev-story)

### Debug Log References

### Completion Notes List

- **Task 1** : `POST /api/v1/unity-dialogues/graph/detect-context-dropping` ; schémas `DetectContextDroppingRequest/Response` ; extraction listes GDD dans `services/context_dropping_facts.py`, comparaison dans `services/context_dropping_detector.py`, mapping HTTP dans `api/utils/context_dropping_response.py` (router mince).
- **Task 2** : Panneau `GraphContextDroppingPanel` + sous-composants résumé/liste ; état `showContextDroppingPanel` dans `useGraphToolbar` (distinct slop / juge LLM) ; bouton toolbar « 📎 Contexte ».
- **Task 3** : Seuil « subtil » = mention multi-mots avec recouvrement partiel des mots (≥2 mots significatifs) ; alignement accent-insensible via `normalize_entity_name` sur le texte agrégé pour éviter faux positifs.
- **🔵 Refactor Task 1** : avant → logique potentiellement monolithique dans un seul fichier ; après → `context_dropping_facts.py` / `context_dropping_detector.py` / `context_dropping_constants.py` + `api/utils/context_dropping_response.py` (fragment responsabilités : extraction vs scan vs sérialisation).
- **🔵 Refactor Task 2** : `GraphContextDroppingPanel.tsx` → `GraphContextDroppingSummary.tsx` + `GraphContextDroppingCaseList.tsx` (orchestration seule dans le panneau).
- **🔵 Refactor Task 3** : seuils / profils dans `context_dropping_constants.py` ; options runtime dans `ContextDroppingOptionsData` (champ `tolerance` réservé 4.10).

### File List

- `services/context_dropping_constants.py`
- `services/context_dropping_facts.py`
- `services/context_dropping_detector.py`
- `api/schemas/graph.py`
- `api/utils/context_dropping_response.py`
- `api/routers/graph.py`
- `tests/services/test_context_dropping_detector.py`
- `tests/api/test_graph_detect_context_dropping.py`
- `frontend/src/types/graph.ts`
- `frontend/src/api/graph.ts`
- `frontend/src/hooks/useGraphToolbar.ts`
- `frontend/src/components/graph/GraphEditor.tsx`
- `frontend/src/components/graph/GraphEditorHeader.tsx`
- `frontend/src/components/graph/GraphContextDroppingPanel.tsx`
- `frontend/src/components/graph/GraphContextDroppingSummary.tsx`
- `frontend/src/components/graph/GraphContextDroppingCaseList.tsx`
- `frontend/src/components/graph/GraphContextDroppingPanel.test.tsx`
- `frontend/src/__tests__/GraphEditor.loreValidationPanel.test.tsx`
- `frontend/src/__tests__/GraphEditorHeader.undoRedo.test.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/4-9-détecter-context-dropping-lore-explicite-vs-subtil-fr44.md`

### Change Log

- 2026-04-07 : Story 4.9 — détection context dropping (API + UI + tests pytest/vitest).

---

## Architecture Compliance

- **FastAPI** : Routers minces, schémas Pydantic v2, erreurs via handlers existants.  
- **React** : Zustand, pas d’événements `window` pour coordination éditeur.  
- **Windows-first** : chemins, encodage UTF-8.

## Library / Framework Requirements

- Python : stdlib + regex / heuristiques ; **pas** de dépendance NLP lourde pour MVP sauf justification ADR.  
- Frontend : réutiliser composants / tokens UI existants du panneau validation.

## File Structure Requirements

- Limite **~300 lignes** par fichier source touché (convention dev-story) ; découper si nécessaire.

## Testing Requirements

- `pytest` ciblé + `vitest` ciblé + `npm --prefix frontend run lint`.  
- Tiers : `.cursor/commands/test-tiers.md`, `.cursor/rules/workflow.mdc`.

## Previous Story Intelligence

- **4.8 (done)** : `POST .../detect-ai-slop`, `GraphAiSlopPanel`, `slopDetectionSettings`, états **séparés** du juge LLM — **répliquer le même discipline d’état** pour context dropping.  
- **4.7** : juge LLM = autre pipeline ; ne pas fusionner loaders.  
- Fichiers chauds : **`api/routers/graph.py`**, **`GraphEditor*.tsx`**, **`useGraphToolbar.ts`**, **`frontend/src/api/graph.ts`**.

## Git Intelligence Summary

- Travaux récents sur la branche : détection **AI slop** (`services/ai_slop_detector.py`, route `detect-ai-slop`), juge qualité **4.7**, validation lore/cycles/orphelins — **cohérence UX** des boutons validation à préserver.

## Latest Tech Information

- Stack actuelle (FastAPI, Pydantic v2, React 18, React Flow 11) — pas d’upgrade imposée par cette story. Pour recherche ultérieure : heuristiques « information extraction » légères (TF-IDF / overlap) restent optionnelles ; MVP = mots-clés + entités + phrases candidates.

## Project Context Reference

- `_bmad-output/project-context.md` — API documents vs unity-dialogues, tests sans GDD réel, interdiction logique dans routers.

## Story completion status

**Statut :** review  
**Note :** Implémentation FR44 ; heuristique MVP (mots des sélections + lignes `scene_instruction` / `context_text`) — faux positifs/négatifs possibles ; Story 4.10 pourra activer `rules_profile` / `tolerance` côté règles métier.
