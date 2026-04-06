# Story 4.8 : détecter-patterns-ai-slop-gpt-isms-répétition-phrases-génériques-fr43

Status: ready-for-dev

<!-- Note : validation optionnelle. Exécuter validate-create-story avant dev-story si besoin. -->

## Story

As a **utilisateur créant des dialogues**,
I want **détecter les patterns « AI slop » (GPT-isms, répétitions, phrases génériques)**,
so that **je peux identifier et corriger les dialogues qui sonnent trop artificiels**.

## Acceptance Criteria

1. **Given** un graphe / dialogue chargé dans l’éditeur, **When** je lance une **détection AI slop**, **Then** le backend analyse le **texte des nœuds** (lignes de dialogue et libellés de choix pertinents) pour **GPT-isms**, **répétitions** (même phrase ou quasi-duplicatas) et **phrases génériques**, **And** les occurrences sont renvoyées avec **nœud** (stableID ou id affichable) et **extrait / position** suffisante pour l’UI.
2. **Given** des GPT-isms sont présents (ex. formulations type « Ah, je vois », « C’est intéressant », « Permettez-moi de » — la liste exacte est **donnée par défaut côté service**, extensible), **When** la détection s’exécute, **Then** un **résumé** du type « GPT-isms : X occurrences dans Y nœuds » apparaît **And** chaque occurrence est **listée** avec suggestion de remplacement **heuristique** (pas obligatoire d’être parfaite ; cohérente et testable).
3. **Given** une **même phrase** (normalisée : casse / espaces) apparaît **plusieurs fois** dans le dialogue, **When** la détection s’exécute, **Then** un avertissement **répétitions** indique la phrase et le **nombre** d’occurrences **And** les **nœuds** concernés sont identifiables pour surlignage.
4. **Given** des **phrases génériques** (base par défaut + patterns configurables), **When** la détection s’exécute, **Then** elles sont listées avec **suggestions** orientées « plus spécifique au contexte » (texte guide ou template), **And** la sévérité reste **warning** (non bloquant), alignée FR36–FR41.
5. **Given** j’ouvre **Paramètres détection AI slop**, **When** je modifie les options, **Then** je peux **activer/désactiver** les trois familles (GPT-isms, répétitions, génériques) **And** ajouter des **mots-clés** ou **regex** personnalisés (au minimum **côté client** persistés — ex. `localStorage` — avec possibilité d’**envoyer la config** dans le corps de la requête pour un run ; persistance serveur **si** un pattern équivalent existe déjà pour d’autres validations — sinon documenter MVP client-only).
6. **Given** une erreur serveur ou graphe vide, **When** l’API répond, **Then** message **clair** (pas de liste vide silencieuse prise pour succès) **And** le frontend ne casse pas le graphe.
7. **Tests** : **pytest** (service pur + route, graphes minuscules, sans GDD réel) ; **Vitest** (parsing réponse / états UI) ; **`npm --prefix frontend run lint`** sans régression.

## Tasks / Subtasks

- [ ] **Task 1** : Service backend + route API « detect slop » sur payload graphe (AC: #1, #2, #3, #4, #6, #7)  
  - [ ] 🔴 Test échoue : fixture graphe avec **deux nœuds** contenant la **même ligne** → réponse contient au moins une entrée **répétition** ; graphe avec chaîne **GPT-ism** connue → entrée **gpt_ism** ; appel avec **nodes vides** → comportement documenté (0 occurrence ou erreur explicite, mais **pas** 500 silencieux).  
  - [ ] 🟢 Implémenter **`AISlopDetector`** (ou nom aligné dépôt) dans **`services/`** avec API **mince** dans **`api/routers/`** — **même convention que** `POST /api/v1/unity-dialogues/graph/validate` : corps **`nodes` + `edges`** (et optionnellement **options** de détection), **pas** de dépendance à `/dialogues/{id}` si le produit travaille en **document + graphe** ([Source: `_bmad-output/project-context.md`]). Schémas Pydantic + types **`frontend/src/types/api.ts`**.  
  - [ ] 🔵 Refactor : séparer **catalogue de patterns** par défaut (constantes / petit module data) de la **logique de scan** ; éviter un router > 300 lignes — extraire construction de réponse si besoin.

- [ ] **Task 2** : Panneau UI « AI slop » dans l’éditeur graphe (liste, résumés, navigation nœud) (AC: #1–#7)  
  - [ ] 🔴 Test échoue : mock API → clic « Détecter slop » → **loading** puis **résumé** + **au moins une ligne** de détail ; erreur API → message visible.  
  - [ ] 🟢 Ajouter UI dans **`frontend/src/components/graph/`** (section ou onglet du panneau validation existant pour **ne pas** saturer la colonne — même principe que story 4.7) ; client dans **`frontend/src/api/graph.ts`** (ou fichier voisin) ; **Zustand** / **`graphViewStore`** pour **focus** nœud si pattern déjà utilisé pour lore/orphelins/cycles.  
  - [ ] 🔵 Refactor : sous-composants **Résumé**, **Liste d’occurrences**, **Paramètres** si le fichier dépasse ~300 lignes ; assertions ESLint propres.

- [ ] **Task 3** : Paramètres utilisateur (toggles + patterns custom) et intégration requête (AC: #5, #7)  
  - [ ] 🔴 Test échoue : désactiver **répétitions** via état → mock reçoit `include_repetitions: false` (ou équivalent) **ou** le client n’affiche pas de section répétitions quand désactivé ; ajout d’un **mot-clé** custom → présent dans le payload ou filtré côté client selon design choisi.  
  - [ ] 🟢 Persistance **session / localStorage** pour toggles et liste custom ; documenter en Dev Notes si **backend** reporté (KISS).  
  - [ ] 🔵 Refactor : module util **`slopDetectionSettings.ts`** (seuils, clés storage, sérialisation) pour garder le composant lisible et testable.

## Dev Notes

- **Branche** `Epic/04-validation-QA` → épique **4** ; enchaînement après **4.7** (judge LLM, encore souvent non mergé) : **ne pas partager d’état** qui écrase `validationErrors` / loaders — **clés dédiées** (cf. story 4.7 *Previous Story Intelligence*).
- **Réutiliser** : `GraphValidationService` / patterns de `ValidationError` **uniquement si** le modèle d’erreur unifié du panneau s’y prête ; sinon **nouveau type** de résultat `warnings` slop **distinct** mais **affichage cohérent** avec `GraphValidationPanel` / `GraphValidationPanelLists`.
- **Pas de logique métier** dans les routers ; injection **`ServiceContainer`** / `Depends` comme le reste de `api/routers/graph.py`.
- **Performance** : scan **textuel** sur liste de nœuds — viser **< 200 ms** sur graphes typiques pour la partie locale (hors LLM) ; pas d’appel LLM requis pour FR43 (heuristiques / regex).
- **Données tests** : jamais de texte dépendant du GDD réel ; phrases inventées courtes.
- **Epic** mentionne `POST /api/v1/dialogues/{id}/detect-slop` — **ajuster** au contrat réel du repo (**unity-dialogues/graph/...** + body) et le noter comme **écart documenté** pour éviter que le dev cherche un endpoint inexistant.

### Project Structure Notes

- Backend : `services/` (détection), `api/routers/graph.py` ou route dédiée sous le même préfixe `unity-dialogues/graph/`, `api/schemas/` (modèles réponse + options).
- Frontend : `frontend/src/components/graph/`, `frontend/src/api/`, `frontend/src/types/api.ts`, store si nécessaire.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-04.md` — Story 4.8, FR43]  
- [Source: `api/routers/graph.py` — `validate_graph`, schémas associés]  
- [Source: `services/graph_validation_service.py` — patterns validation existants]  
- [Source: `_bmad-output/implementation-artifacts/4-7-évaluer-qualité-dialogue-avec-llm-judge-score-0-10-1-marge-fr42.md` — intégration panneau, état UI]  
- [Source: `_bmad-output/project-context.md` — documents, API, tests]

### Architecture Compliance

- FastAPI : routers minces, logique **`services/`**, **`ServiceContainer`**.  
- React : **Zustand**, **`graphViewStore`** pour navigation ; pas d’événements `window`.

### Library / Framework Requirements

- Pas de nouvelle dépendance npm **sauf** justification (UI : composants existants).  
- Python : stdlib + regex ; pas besoin de NLP lourd pour le MVP.

### File Structure Requirements

- Limite **~300 lignes** par fichier source touché ; découper si nécessaire.

### Testing Requirements

- `pytest` ciblé service + route ; `vitest` ciblé UI / settings ; `npm --prefix frontend run lint`.  
- Tiers : `.cursor/commands/test-tiers.md`, `.cursor/rules/workflow.mdc`.

### Previous Story Intelligence

- **4.7 (ready-for-dev)** : judge LLM = autre axe ; **slop** = **déterministe**. Ne pas fusionner les deux features dans un seul état loading.  
- **4.6 / 4.5 / 4.4** : **`GraphValidationPanel*`**, **`uiSlice`**, agrégation erreurs/warnings — pour le slop, préférer **section** dédiée avec **bouton** propre pour éviter conflits de timing avec re-validation automatique.

### Git Intelligence Summary

- Fichiers chauds récents sur la branche : **`api/routers/graph.py`**, **`GraphValidationPanel*.tsx`**, **`uiSlice.ts`**, **`frontend/src/api/graph.ts`**, **`api/schemas/graph.py`**.

### Latest Tech Information

- Stack actuelle du repo (FastAPI, Pydantic v2, React 18, React Flow 11) — pas d’upgrade imposé par cette story.

### Project Context Reference

- `_bmad-output/project-context.md` — chemins API, Unity JSON, interdiction logique dans routers.

## Dev Agent Record

### Agent Model Used

_(à compléter par l’agent dev)_

### Debug Log References

### Completion Notes List

### File List

## Story completion status

**Statut :** ready-for-dev  
**Note :** Ultimate context engine analysis completed — comprehensive developer guide created (workflow create-story, mode auto).
