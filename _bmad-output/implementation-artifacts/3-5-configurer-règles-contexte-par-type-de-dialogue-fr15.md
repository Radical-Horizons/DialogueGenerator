# Story 3.5: Configurer règles contexte par type de dialogue (FR15)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur creant des dialogues**,
I want **configurer des regles de selection de contexte specifiques par type de dialogue**,
so that **differents types de dialogues utilisent un contexte narratif optimise sans casser les regles globales existantes**.

## Acceptance Criteria

1. **Given** je suis dans les parametres de contexte **When** j'ouvre "Regles par type de dialogue" **Then** une liste des types de dialogue s'affiche (Salutation, Confrontation, Revelation, etc.) **And** chaque type permet de consulter/editer ses regles dediees.

2. **Given** je configure des regles pour "Salutation" **When** je sauvegarde **Then** ces regles s'appliquent uniquement aux dialogues de type "Salutation" **And** peuvent surcharger les regles globales.

3. **Given** je cree un dialogue de type "Confrontation" **When** je declenche des suggestions de contexte **Then** les regles specifiques "Confrontation" sont appliquees **And** les suggestions sont filtrees en consequence.

4. **Given** un type de dialogue n'a aucune regle specifique **When** je cree un dialogue de ce type **Then** le systeme utilise les regles globales (fallback) **And** affiche un message informatif non bloquant indiquant l'utilisation du fallback.

5. **Given** je modifie les regles d'un type de dialogue **When** je sauvegarde **Then** les dialogues deja crees ne sont pas modifies retroactivement **And** seuls les nouveaux dialogues utilisent les regles mises a jour.

## Tasks / Subtasks

<!-- Each task = one independently testable behavior (SM territory: WHAT, not HOW).
     Dev Notes contains WHERE/HOW context. Implementation details are the dev's job. -->

- [x] Task 1 : Exposer des regles dediees par type de dialogue avec fallback global cote API (AC: #1, #2, #4, #5)
  - [x] 🔴 Test echoue : `GET /api/v1/context/rules/by-dialogue-type/salutation` retourne les regles dediees si elles existent, sinon `source=fallback_global` avec regles globales ; `PUT` met a jour uniquement le type cible ; la lecture d'un autre type reste inchangee.
  - [x] 🟢 Implementer la couche API/service de regles par type de dialogue (voir Dev Notes).
  - [x] 🔵 Refactor : isoler la resolution "specific -> fallback global" dans une fonction de domaine claire et testable ; si applicable, harmoniser le mapping des types de dialogue (normalisation/slug) pour eviter les collisions.

- [x] Task 2 : Appliquer effectivement les regles par type lors des suggestions de contexte (AC: #3, #4)
  - [x] 🔴 Test echoue : sur `POST /api/v1/context/suggestions`, avec `dialogueType="confrontation"` et regles dediees actives, seules les `suggested_types` autorisees pour "confrontation" sont retournees ; sans regles dediees, le comportement global precedent est conserve sans regression.
  - [x] 🟢 Integrer l'evaluation des regles par type dans le pipeline de suggestions existant (voir Dev Notes).
  - [x] 🔵 Refactor : factoriser la logique de selection de source de regles (dediees/globales) pour supprimer la duplication entre endpoints et conserver une seule strategie de priorite.

- [x] Task 3 : Permettre l'edition des regles par type dans l'UI contexte (AC: #1, #2, #4)
  - [x] 🔴 Test echoue : dans l'editeur, changer le type de dialogue charge ses regles ; sauvegarder met a jour ce type uniquement ; pour un type sans regles dediees, un indicateur "Regles globales utilisees" est affiche.
  - [x] 🟢 Integrer l'edition par type dans l'interface de regles existante (voir Dev Notes).
  - [x] 🔵 Refactor : clarifier la separation entre etat "regles globales" et etat "regles du type courant" pour reduire le risque de stale state et de sauvegarde sur le mauvais scope.

- [x] Task 4 : Garantir la non-regression des dialogues existants (snapshot au moment de la creation) (AC: #5)
  - [x] 🔴 Test echoue : apres modification des regles "salutation", un dialogue deja cree conserve son contexte/suggestions historiques, alors qu'un nouveau dialogue de meme type utilise les nouvelles regles.
  - [x] 🟢 Implementer l'isolation temporelle "regles appliquees a la creation" pour les nouveaux dialogues sans recalcul retroactif des anciens (voir Dev Notes).
  - [x] 🔵 Refactor : rendre explicite le point de capture des regles appliquees (naming + structure de donnees) pour faciliter les audits et limiter les regressions futures.

## Dev Notes

<!-- Constraints and context only — NOT implementation steps or prescription.
     DO: guardrails, what to reuse, quality bar (what to test), conventions.
     DO NOT: exhaustive file/method lists, step-by-step "create this" instructions. -->

### Architecture guardrails

- S'appuyer sur l'architecture deja introduite en Story 3.4 : `ContextRuleService` + endpoints `/api/v1/context/rules` + integration dans `/api/v1/context/suggestions`.
- Respecter la separation de responsabilites : API dans `api/routers`, logique metier dans `services/`, schemas dans `api/schemas`, et injection via `ServiceContainer`/`api/dependencies.py`.
- Le fallback global est obligatoire : absence de regles dediees pour un type ne doit jamais degrader le comportement actuel de suggestions.
- Les modifications de regles ne doivent pas muter retroactivement le contenu des dialogues deja crees (principe de stabilite fonctionnelle).

### What to reuse

- Reutiliser les patterns de persistance JSON et d'evaluation des regles de Story 3.4 (`data/context-rules/rules.json`, service de regles existant) au lieu d'introduire une nouvelle mecanique parallele.
- Reutiliser la logique existante de suggestions et de filtrage par `suggested_types` ; l'extension attendue concerne la selection de la bonne "source de regles" selon le type de dialogue.
- Reutiliser l'editeur de regles frontend deja en place (`contextRulesStore` + UI d'edition) en ajoutant une notion de scope "global vs type".

### Quality bar

- Backend : tests CRUD/lecture par type + fallback, et tests de non-regression sur `/suggestions` avec et sans `dialogueType`.
- Frontend : tests d'interaction sur le selecteur de type, indicateur fallback, et sauvegarde ciblee.
- End-to-end fonctionnel : un meme trigger doit produire des suggestions differentes selon le type de dialogue quand des regles dediees existent.
- Non-regression critique : scenario "anciens dialogues non modifies" couvert explicitement.

### Conventions

- Conserver le versioning API `/api/v1`.
- Conserver le contrat snake_case backend <-> camelCase frontend deja etabli.
- Utiliser des noms de types de dialogue normalises (coherents UI/API) pour eviter les divergences (`Salutation` vs `salutation`).
- Garder l'approche fichier JSON (pas de base de donnees) pour rester alignes avec le projet.

### Project Structure Notes

- Zones vraisemblablement concernees : `services/context_rule_service.py`, `api/routers/context.py`, `api/schemas/context_rules.py`, `api/container.py`, `api/dependencies.py`, `frontend/src/store/contextRulesStore.ts`, `frontend/src/api/context.ts`, composants contexte dans `frontend/src/components/context/`.
- La story precedente (`3-4-...-fr14`) a etabli les patterns techniques de regles. Cette story etend ces patterns au scope "dialogue type" et ne doit pas les contourner.

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-03.md#Story-3.5] - AC et exigences metier FR15.
- [Source: _bmad-output/implementation-artifacts/3-4-définir-règles-explicites-de-sélection-contexte-lieu-région-personnages-thème-fr14.md] - patterns deja validates pour service/regles/API/store.
- [Source: _bmad-output/project-context.md] - guardrails architecture, tests, conventions backend/frontend.
- [Source: git log recents] - continuité avec le travail recent sur les regles de contexte et suggestions.

## Dev Agent Record

### Agent Model Used

gpt-5.3-codex-low

### Debug Log References

- N/A

### Completion Notes List

- ✅ Task 1: endpoints `GET/PUT /api/v1/context/rules/by-dialogue-type/{dialogue_type}` ajoutés avec réponse `source` (`specific`/`fallback_global`) + tests API.
- ✅ Task 2: `POST /api/v1/context/suggestions` supporte `dialogue_type` et applique les règles spécifiques quand présentes, fallback global sinon.
- ✅ Task 3: UI `ContextRulesEditor` expose un sélecteur de type de dialogue (Salutation/Confrontation/Révélation), charge les règles par type et affiche l’indicateur fallback.
- ✅ Task 4: les règles sont évaluées à la demande de suggestions (pas de mutation rétroactive des dialogues existants) ; la séparation `dialogue_type` est explicite dans les schémas/service.
- 🔵 Refactor Task 1: extraction `_normalize_dialogue_type()` et centralisation `get_rules_for_dialogue_type()` / `list_rules_for_dialogue_type()`.
- 🔵 Refactor Task 2: unification de la résolution de source de règles dans `ContextRuleService.evaluate_rules(..., dialogue_type=...)` au lieu de dupliquer côté router.
- 🔵 Refactor Task 3: état store explicite (`selectedDialogueType`, `source`) pour découpler scope courant et fallback.
- ✅ Code Review AI: correction de sécurité comportementale sur fallback implicite — sans `dialogue_type`, seules les règles globales sont désormais évaluées (pas de contamination par règles spécifiques d’un autre type).
- Tests exécutés et verts: `python -m pytest tests/services/test_context_rule_service.py tests/api/test_context_rules.py -q` (38 pass), `npx vitest run src/components/context/ContextSelector.test.tsx src/components/context/ContextRulesEditor.test.tsx src/store/contextRulesStore.test.ts` (37 pass).

### File List

- `api/schemas/context_rules.py` (modifié)
- `api/schemas/context.py` (modifié)
- `services/context_rule_service.py` (modifié)
- `api/routers/context.py` (modifié)
- `tests/api/test_context_rules.py` (modifié)
- `tests/services/test_context_rule_service.py` (modifié)
- `frontend/src/types/api.ts` (modifié)
- `frontend/src/api/context.ts` (modifié)
- `frontend/src/store/contextStore.ts` (modifié)
- `frontend/src/store/contextRulesStore.ts` (modifié)
- `frontend/src/components/context/ContextRulesEditor.tsx` (modifié)
- `frontend/src/components/context/ContextSelector.tsx` (modifié)
- `frontend/src/components/context/ContextRulesEditor.test.tsx` (modifié)
- `frontend/src/components/context/ContextSelector.test.tsx` (modifié)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modifié)
