# Story 4.8 : détecter patterns AI slop (GPT-isms, répétition, phrases génériques) — fr43

Status: ready-for-dev

<!-- Note : validation optionnelle. Exécuter validate-create-story avant dev-story si besoin. -->

## Story

As a **utilisateur créant des dialogues**,
I want **détecter les patterns « AI slop » (GPT-isms, répétitions, phrases génériques)**,
so that **je peux identifier et corriger les dialogues qui sonnent trop artificiels**.

## Acceptance Criteria

1. **Given** un graphe / dialogue chargé dans l’éditeur, **When** je lance une **détection AI slop**, **Then** le backend analyse le **texte agrégé des nœuds de dialogue** (et titres/choix pertinents selon le modèle Unity déjà utilisé pour la validation FR36), **And** les résultats distinguent au minimum les familles **GPT-isms**, **répétitions** (même phrase ou quasi-doublons), **phrases génériques** (liste configurable), avec **occurrences** et **références de nœud** (id stable / display cohérent avec le panneau validation existant).
2. **Given** le dialogue contient des GPT-isms du type epic (ex. tournures « Ah, je vois », « Permettez-moi de »), **When** la détection s’exécute, **Then** un **résumé** du type « GPT-isms détectés : X occurrences dans Y nœuds » apparaît **And** la liste détaille **nœud**, **extrait** ou span, **suggestion** de reformulation (heuristique ou template — pas besoin d’LLM pour le MVP si coût 0 respecté).
3. **Given** une même phrase (ou fenêtre de similarité définie en Dev Notes) apparaît plusieurs fois, **When** la détection s’exécute, **Then** un avertissement **répétitions** avec comptage et **nœuds** concernés est retourné **And** le frontend peut **surligner / focus** les nœuds via le **même mécanisme** que les autres diagnostics graphe (`graphViewStore` / patterns existants post FR40–FR41).
4. **Given** des **phrases génériques** configurées sont trouvées, **When** la détection s’exécute, **Then** le résumé et le détail sont affichés **And** des **suggestions** (remplacer par formulation plus contextuelle) sont proposées au niveau UI.
5. **Given** j’ouvre les **paramètres** de détection AI slop, **When** je modifie les options, **Then** je peux **activer/désactiver** les familles (GPT-isms, répétitions, génériques) **And** ajouter des **patterns personnalisés** (mots-clés ou regex sûrs — voir garde-fous sécurité) **And** la config est **persistée** (priorité : **localStorage** côté client pour MVP rapide ; **sync backend** si un pattern utilisateur API existe déjà — sinon reporter sync API en sous-tâche optionnelle clairement bornée dans Dev Notes pour ne pas exploser le scope).
6. **Given** une erreur serveur ou graphe vide / sans texte exploitable, **When** l’API répond, **Then** message d’erreur **clair** (pas de liste vide silencieuse prise pour « OK ») **And** le frontend reste stable.
7. **Tests** : **pytest** (service pur + route intégration avec graphe fixture) ; **Vitest** (résumés UI, toggles paramètres, navigation nœud si applicable) ; **`npm --prefix frontend run lint`** sans régression.

## Tasks / Subtasks

- [ ] **Task 1** : Service backend **détection slop** + schéma de réponse API aligné graphe (AC: #1, #6, #7)  
  - [ ] 🔴 Test échoue : avec **graphe fixture** contenant GPT-isms + répétition + phrase générique, le service retourne **occurrences typées**, **node_id** (ou identifiant stable aligné `GraphValidationService`), **sévérité** ; cas **graphe sans texte** → réponse documentée (warning agrégé ou erreur selon choix produit — à figer dans le test).  
  - [ ] 🟢 Implémenter **`services/`** (ex. `AISlopDetector` ou nom cohérent) appelé depuis une route **FastAPI** sous **`/api/v1/unity-dialogues/graph/...`** (même style que `validate`, `validate-lore-explicit` — **corps avec nœuds/edges**, pas de dépendance à `/dialogues/{id}` si l’éditeur actuel ne l’utilise pas pour la validation). Router **mince**, schémas **Pydantic** + types **`frontend/src/types/api.ts`**.  
  - [ ] 🔵 Refactor : séparer **catalogue de patterns** (données / module constant) de la **logique de scan** pour faciliter tests unitaires et évolution vers **Slop Score EQ-bench** (PRD : listes officielles — voir Dev Notes ; ne pas mélanger dans un seul fichier 500 lignes).

- [ ] **Task 2** : Intégration **UI** dans l’éditeur graphe (liste, résumés, liens vers nœuds) (AC: #2–#4, #6, #7)  
  - [ ] 🔴 Test échoue : **mock API** — clic « Détecter slop » → **loading** → affichage **résumés** (GPT-isms / répétitions / génériques) + **au moins une ligne détail** avec action **focus nœud** (ou équivalent store).  
  - [ ] 🟢 Étendre **`GraphValidationPanel`** / listes associées (**`GraphValidationPanelLists.tsx`**, **`uiSlice`**) **sans régression** FR36–FR41 : nouvelle clé de diagnostic ou section dédiée **« AI slop »** ; consommer **`frontend/src/api/graph.ts`** (ou module voisin) ; **Zustand** + **`graphViewStore`** pour le focus — **pas** d’événements `window`.  
  - [ ] 🔵 Refactor : extraire **sous-composants** (résumé, liste occurrences, panneau paramètres) si le fichier approche le plafond qualité ; garder **seuils de lignes** du workflow dev-story.

- [ ] **Task 3** : **Paramètres** utilisateur (familles + patterns custom) (AC: #5, #7)  
  - [ ] 🔴 Test échoue : désactiver **répétitions** → requête ou client **ne remonte pas** ce type (ou le filtre côté client est testé) ; ajouter **regex / mot-clé** custom → prochaine détection **les inclut** ; préférences **rechargées** après refresh simulé (localStorage).  
  - [ ] 🟢 Implémenter stockage **localStorage** (clé versionnée) + types ; passer **options** au backend si le contrat API inclut `options` dans le POST (recommandé pour une seule source de vérité métier) **ou** filtrer côté client de façon **testée** — choisir une option et **documenter** en Dev Notes.  
  - [ ] 🔵 Refactor : centraliser **validation des regex** utilisateur (rejeter patterns **ReDoS** / trop larges) dans un helper testable ; messages d’erreur **explicites** pour l’utilisateur.

## Dev Notes

- **Branche** `Epic/04-validation-QA` → épique **4** ; enchaînement après **4.7 (LLM judge)** : **ne pas** saturer le panneau — onglet / section **repliable** ou accordéon « Qualité » partagé judge + slop si pertinent.  
- **Ne pas réinventer** : `GraphValidationService`, `api/routers/graph.py` (patterns validate), `frontend/src/store/slices/uiSlice.ts`, `graphViewStore`, **`mergeNodeFormIntoStoreData`** / invariants graphe (`.cursor/rules/graph_editor.mdc`).  
- **Coût** : FR43 / PRD — **détection slop sans LLM** ($0) ; heuristiques + listes. **Roadmap qualité** : `_bmad-output/planning-artifacts/prd/automated-testing-quality-framework.md` (Slop Score EQ-bench 60/25/15, listes officielles slop-forensics) — si le MVP livre des **familles** epic avant le score composite, le documenter comme **itération 2** ou tâche 🔵 bornée pour alignement EQ-bench.  
- **Sécurité** : pas d’`eval` ; regex utilisateur **bornées** (longueur, timeout ou moteur sûr) ; pas de secrets en dur.  
- **Windows / UTF-8** : texte dialogue et patterns en Unicode.  
- **Alignement epic vs code** : l’epic mentionne `/api/v1/dialogues/{id}/detect-slop` — **le code réel** valide par **payload graphe** ; **adapter** l’implémentation et cette story à **`unity-dialogues/graph/...`** pour cohérence avec 4.6–4.7.

### Project Structure Notes

- Backend : `services/` (détection), `api/routers/graph.py` ou router voisin, `api/schemas/` (requête/réponse).  
- Frontend : `frontend/src/components/graph/`, `frontend/src/api/`, types partagés.  
- Données patterns : module Python + éventuel JSON dans `data/` ou package — **pas** de liste « illustrative » pour le **Slop Score officiel** si vous implémentez la formule EQ-bench (utiliser les listes documentées PRD).

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-04.md` — Story 4.8, FR43]  
- [Source: `_bmad-output/planning-artifacts/prd/functional-requirements.md` — FR43]  
- [Source: `_bmad-output/planning-artifacts/prd/automated-testing-quality-framework.md` — Slop detection layer, EQ-bench]  
- [Source: `_bmad-output/implementation-artifacts/4-7-évaluer-qualité-dialogue-avec-llm-judge-score-0-10-1-marge-fr42.md` — API graphe, UI panneau, états séparés]  
- [Source: `services/graph_validation_service.py` — extraction texte / ids nœuds pour cohérence diagnostics]

### Architecture Compliance

- FastAPI : routers minces, logique **`services/`**, **`ServiceContainer`** / `Depends`.  
- React : **Zustand** ; communication **`graphViewStore`** ; pas de logique métier lourde dans les composants — hooks/helpers si besoin.

### Library / Framework Requirements

- **Pas** de nouvelle dépendance lourde sans justification (NLP : préférer stdlib + regex + algorithmes simples pour répétitions). Si bibliothèque tierce pour similarité texte, **valider** licence + taille + besoin réel.

### File Structure Requirements

- Viser **~300 lignes max** par fichier source touché (critère dev-story) ; découper détecteurs / schémas / données.

### Testing Requirements

- `pytest` : service + route ; `vitest` : UI ; `npm --prefix frontend run lint`.  
- Tiers : `.cursor/commands/test-tiers.md`, `.cursor/rules/workflow.mdc`.

### Previous Story Intelligence

- **4.7 (ready-for-dev)** : même zone UI ; **clés d’état séparées** pour ne pas écraser `validationErrors` / loading — ajouter slop sans fusionner brutalement avec judge.  
- **4.6 / 4.7 Dev Notes** : patterns **`GraphValidationPanel*`**, **`uiSlice`**, sidecar layout — réutiliser les **listes cliquables** et **navigation** nœuds.  
- **Revue récurrente** : synchro surlignages quand **plusieurs** validations cohabitent — slop doit **composer** (ids de nœuds, pas reset global aveugle).

### Git Intelligence Summary

- Fichiers chauds récents : `api/routers/graph.py`, `services/graph_validation_service.py`, `frontend/src/components/graph/GraphValidationPanel*.tsx`, `frontend/src/store/slices/uiSlice.ts`, `frontend/src/api/graph.ts`.

### Latest Tech Information

- Stack stable (FastAPI, Pydantic v2, React 18, React Flow 11). Références EQ-bench / slop-score : liens dans le PRD section Slop ; pas d’upgrade de stack requis pour le MVP pattern-based.

### Project Context Reference

- `_bmad-output/project-context.md` — règles générales dépôt, chemins API, tests sans GDD réel.

## Dev Agent Record

### Agent Model Used

_(à compléter par l’agent dev)_

### Debug Log References

### Completion Notes List

### File List

## Story completion status

**Statut :** ready-for-dev  
**Note :** Ultimate context engine analysis completed — comprehensive developer guide created (create-story, mode auto, 2026-04-07).
