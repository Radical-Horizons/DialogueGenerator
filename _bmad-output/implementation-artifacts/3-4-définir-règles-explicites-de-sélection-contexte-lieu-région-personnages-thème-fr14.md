# Story 3.4: Définir règles explicites de sélection contexte (lieu → région → personnages → thème) (FR14)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **définir des règles explicites de sélection de contexte (lieu → région → personnages → thème)**,
so that **le système filtre les suggestions GDD selon mes préférences, en ne proposant que les types d'entités pertinents plutôt que toutes les entités liées**.

## Acceptance Criteria

1. **Given** je suis dans les paramètres de contexte **When** j'ouvre "Règles de sélection" **Then** un éditeur de règles s'affiche avec la liste des règles existantes (vide si aucune) **And** un bouton "Ajouter règle" est visible.

2. **Given** je crée une règle "Si lieu sélectionné, alors suggérer région" **When** la règle est sauvegardée **Then** quand je sélectionne un lieu dans `ContextSelector`, seules les entités de type `region` issues des liens GDD sont proposées (et non tous les types liés) **And** la règle apparaît dans la liste avec son nom, son statut actif, et sa priorité.

3. **Given** je crée une règle complexe "Si personnage A ET lieu B sélectionnés, alors suggérer thème" **When** personnage A et lieu B sont tous deux dans la sélection courante au moment du trigger **Then** les entités de type `community`/`item` liées à A ou B sont également proposées selon les `suggested_types` de la règle.

4. **Given** j'ai plusieurs règles définies **When** je consulte la liste **Then** les règles affichent leur priorité (ordre d'évaluation) **And** je peux réorganiser l'ordre via boutons ↑/↓ **And** je peux activer/désactiver chaque règle individuellement.

5. **Given** je modifie ou désactive une règle existante **When** la modification est sauvegardée **Then** la prochaine sélection d'entité dans `ContextSelector` utilise les règles mises à jour **And** les règles sont persistées entre sessions (fichier JSON backend).

6. **Given** aucune règle n'est active ou définie **When** l'utilisateur sélectionne une entité **Then** le comportement par défaut de Story 3.3 est préservé (toutes les entités GDD liées sont suggérées) — pas de régression.

## Tasks / Subtasks

<!-- Each task = one independently testable behavior (SM territory: WHAT, not HOW).
     Dev Notes contains WHERE/HOW context. Implementation details are the dev's job. -->

- [x] Task 1 : Service `ContextRuleService` + endpoint CRUD `/api/v1/context/rules` (AC: #1, #2, #4, #5)
  - [x] 🔴 Test échoue : `GET /api/v1/context/rules` → 200 `{"rules": [], "total": 0}` ; `POST /api/v1/context/rules` avec corps valide → 201 avec `id` généré ; `PUT /api/v1/context/rules/{id}` avec `{"enabled": false}` → règle désactivée dans le retour ; `DELETE /api/v1/context/rules/{id}` → 204 ; `GET` après delete → règle absente. Tests de `ContextRuleService.evaluate_rules("location", "Nef Centrale", {})` avec règle active "location → region" → retourne `{"region"}` ; règle disabled → retourne `set()`.
  - [x] 🟢 Implémenter `ContextRuleService` (services/) + schemas Pydantic + 4 endpoints CRUD dans `api/routers/context.py` pour passer 🔴 (voir Dev Notes)
  - [x] 🔵 Refactor : extraire la persistence (load/save JSON atomique) dans méthodes privées `_load_rules()` / `_save_rules()` dans `ContextRuleService`. Si applicable : valider unicité des `id` à la création (uuid4).

- [x] Task 2 : Intégration règles dans `POST /api/v1/context/suggestions` (AC: #2, #3, #6)
  - [x] 🔴 Test échoue : avec règle active `{"conditions": [{"entity_type": "location"}], "suggested_types": ["character"]}` → `POST /api/v1/context/suggestions` avec `trigger_type="location"` retourne UNIQUEMENT des suggestions de type `character` (les autres types GDD-liés sont filtrés) ; même endpoint SANS règle active → retourne tous les types liés (régression 0 Story 3.3) ; règle avec `condition_operator="AND"` et deux conditions → fire uniquement si les deux entités sont présentes dans `already_selected` + trigger.
  - [x] 🟢 Modifier `get_context_suggestions` dans `api/routers/context.py` pour appliquer `ContextRuleService.evaluate_rules()` et filtrer les suggestions GDD par types autorisés pour passer 🔴 (voir Dev Notes)
  - [x] 🔵 Refactor : extraire `_filter_suggestions_by_types(suggestions, allowed_types)` en helper pur (testable isolément). Si applicable : injecter `ContextRuleService` via dépendance FastAPI (cohérent avec pattern container).

- [x] Task 3 : Store `contextRulesStore.ts` + client API CRUD (AC: #4, #5)
  - [x] 🔴 Test échoue : `loadRules()` (mock API retourne 2 règles) → `rules` dans le store mis à jour ; `toggleRule(id)` appelle `PUT /api/v1/context/rules/{id}` avec `enabled=!current` et met à jour la règle dans le store ; `reorderRules([id2, id1])` appelle `PUT` pour chaque règle avec `priority` recalculé (1-indexed dans l'ordre du tableau) ; `createRule({name, conditions, suggestedTypes})` appelle `POST` et ajoute la règle au store ; `deleteRule(id)` appelle `DELETE` et retire la règle.
  - [x] 🟢 Implémenter `contextRulesStore.ts` (Zustand, sans persist — les règles viennent du backend) + fonctions API dans `frontend/src/api/context.ts` pour passer 🔴 (voir Dev Notes)
  - [x] 🔵 Refactor : `reorderRules` — update local optimiste avant résolution API (UX réactive). Traiter en priorité : éviter appels API en double si deux toggles rapides (debounce ou guard `isLoading`).

- [x] Task 4 : Composant `ContextRulesEditor.tsx` + intégration dans `ContextSelector.tsx` (AC: #1, #4, #5)
  - [x] 🔴 Test échoue : `ContextRulesEditor` avec 2 règles → rendu de 2 items avec nom et badge actif/inactif ; clic toggle switch → `toggleRule(id)` appelé ; clic "Supprimer" → `deleteRule(id)` appelé ; clic bouton ↑ sur règle d'index 1 → `reorderRules` appelé avec les deux premières règles swappées ; clic "Ajouter règle" → formulaire visible ; soumission formulaire avec `name="Ma règle"`, `entity_type="location"`, `suggestedTypes=["character"]` → `createRule` appelé avec ces valeurs. Intégration `ContextSelector` : bouton/icône "Règles" visible dans le header ; clic → panel `ContextRulesEditor` visible.
  - [x] 🟢 Implémenter `ContextRulesEditor.tsx` + intégration dans `ContextSelector.tsx` pour passer 🔴 (voir Dev Notes)
  - [x] 🔵 Refactor : extraire `RuleItem` (toggle + boutons ↑/↓/supprimer) en sous-composant mémoïsé. Traiter en priorité : factoriser la logique du formulaire (validation champs requis) dans un hook `useRuleForm`. Si applicable : accessibilité — `aria-label` sur les boutons toggle/supprimer.

## Dev Notes

<!-- Constraints and context only — NOT implementation steps or prescription.
     DO: guardrails, what to reuse, quality bar (what to test), conventions.
     DO NOT: exhaustive file/method lists, step-by-step "create this" instructions. -->

### Garde-fous architecture

- **Modèle de règle** : une règle contient `id` (uuid4), `name` (str), `enabled` (bool), `priority` (int, 1-indexed, lower = first), `condition_operator` ("AND"/"OR"), `conditions` (liste de `{entity_type, entity_name?}`), `suggested_types` (liste de types), `created_at` / `updated_at` (ISO 8601). Une règle avec `condition_operator="OR"` et plusieurs conditions fire si AU MOINS une condition est vérifiée. Avec `"AND"`, toutes les conditions doivent être présentes dans `already_selected` ∪ `{trigger}`.
- **Logique de filtrage** : si au moins une règle active matche → filtrer les suggestions GDD pour ne retourner que les entités dont le type est dans l'union des `suggested_types` des règles matchées. Si AUCUNE règle n'est active ou ne matche → comportement Story 3.3 inchangé (toutes les entités liées). C'est une règle de non-régression critique.
- **Persistence** : stocker les règles dans `data/context-rules/rules.json`. Créer le fichier et le dossier si absent. Pattern identique à `cost_budgets.json` — lecture en début de requête, écriture atomique (write to temp + rename). PAS de base de données.
- **Injection dépendance** : enregistrer `ContextRuleService` dans `api/container.py` (ServiceContainer) et exposer via `get_context_rule_service` dans `api/dependencies.py`. Injecter dans `get_context_suggestions` via `Depends`.

### Ce qui existe et doit être réutilisé

- `api/routers/context.py` — ajouter les 4 endpoints `/rules` (même fichier, même pattern que les endpoints existants)
- `api/schemas/context.py` — trop volumineux ; créer `api/schemas/context_rules.py` séparé pour les schémas Pydantic des règles
- `services/element_linker.py` — `get_linked_elements()` retourne les entités groupées par catégorie ; c'est la source des entités à filtrer
- `frontend/src/store/contextStore.ts` — NE PAS modifier ; les règles sont dans un store séparé `contextRulesStore.ts`
- `frontend/src/api/context.ts` — étendre avec les 4 fonctions CRUD (`listRules`, `createRule`, `updateRule`, `deleteRule`)
- `frontend/src/components/context/ContextSelector.tsx` — ajouter un bouton "Règles" (icône settings) dans le header du panneau ; clic affiche/masque `ContextRulesEditor`

### Quality bar (tests)

- **Backend service** : au minimum 5 cas — règle OR fire si une condition match ; règle AND fire uniquement si toutes conditions dans `all_selected` ; règle disabled ignorée ; aucune règle → `evaluate_rules` retourne `None`/sentinel → endpoint retourne toutes entités liées ; conditions avec `entity_name` spécifique → fire uniquement pour l'entité nommée.
- **Backend endpoint** : CRUD complet + cas d'erreur (PUT sur id inexistant → 404).
- **Store** : optimistic update pour `reorderRules` ; `toggleRule` met à jour uniquement la règle concernée sans recréer tout le tableau.
- **UI** : formulaire invalide (name vide ou aucun `suggestedTypes`) → `createRule` non appelé ; badge "Actif"/"Inactif" cohérent avec l'état du store.

### Conventions

- Nouveau composant : `frontend/src/components/context/ContextRulesEditor.tsx` (cohérent avec `ContextSuggestionsPanel.tsx`, `ContextSelector.tsx`)
- Test co-localisé : `frontend/src/components/context/ContextRulesEditor.test.tsx`
- Nouveau store : `frontend/src/store/contextRulesStore.ts` (pas de persist Zustand — SoT = backend)
- Schemas Pydantic : `api/schemas/context_rules.py` (séparé pour garder `context.py` lisible)
- Données : `data/context-rules/rules.json` (créé à la demande, absent OK au démarrage)
- Types TypeScript : ajouter `ContextRule`, `RuleCondition`, `CreateRuleRequest`, `UpdateRuleRequest`, `RulesListResponse` dans `frontend/src/types/api.ts`

### Project Structure Notes

- `services/context_rule_service.py` — nouveau service (même dossier que `linked_selector.py`)
- `api/schemas/context_rules.py` — nouveau fichier de schemas (ne pas surcharger `context.py`)
- `api/routers/context.py` — 4 nouveaux endpoints (ajouter à la fin, comme `/suggestions`)
- `api/container.py` — enregistrer `ContextRuleService`
- `api/dependencies.py` — ajouter `get_context_rule_service`
- `data/context-rules/rules.json` — créé à runtime si absent (NE PAS commiter de fichier vide)
- `tests/api/test_context_rules.py` — tests API (classe `TestContextRulesCRUD`)
- `tests/services/test_context_rule_service.py` — tests service (évaluation règles)
- `frontend/src/types/api.ts` — types ContextRule
- `frontend/src/api/context.ts` — 4 fonctions CRUD rules
- `frontend/src/store/contextRulesStore.ts` — nouveau store Zustand
- `frontend/src/components/context/ContextRulesEditor.tsx` — nouveau composant
- `frontend/src/components/context/ContextRulesEditor.test.tsx` — tests

### References

- [Source: _bmad-output/planning-artifacts/epics/epic-03.md#Story-3.4] — Acceptance Criteria officiels, Technical Requirements
- [Source: _bmad-output/implementation-artifacts/3-3-suggestions-automatiques-contexte-gdd-basées-sur-règles-fr13.md] — Dev Notes 3.3 (pattern endpoint /suggestions, contextStore suggestions slice, ContextSuggestionsPanel) — NE PAS modifier ces fichiers pour les règles
- [Source: api/routers/context.py] — Pattern CRUD existant (dépendances, gestion erreurs, schemas)
- [Source: services/element_linker.py] — `get_linked_elements()` retourne `dict[str, set[str]]` — source des entités à filtrer par règles
- [Source: api/container.py] — Pattern d'enregistrement des services
- [Source: data/cost_budgets.json] — Pattern de stockage JSON persistant en `data/`
- [Source: _bmad-output/planning-artifacts/architecture/baseline-patterns-summary.md] — snake_case backend ↔ camelCase frontend, pas de wrapper API, ISO 8601 dates

## Dev Agent Record

### Agent Model Used

claude-4.6-sonnet-medium-thinking

### Debug Log References

(aucun)

### Completion Notes List

- Task 1 : `ContextRuleService` + 4 endpoints CRUD `/api/v1/context/rules` — TDD complet, tests backend 100% verts
- Task 2 : Intégration `evaluate_rules` dans `POST /api/v1/context/suggestions` + helper `_filter_suggestions_by_types` — régression Story 3.3 vérifiée (aucune)
- Task 3 : `contextRulesStore.ts` (Zustand) + 4 fonctions CRUD dans `frontend/src/api/context.ts` + types TS dans `api.ts` — optimistic update `reorderRules` implémenté
- Task 4 : `ContextRulesEditor.tsx` (liste règles + formulaire création) + intégration bouton "⚙" dans `ContextSelector.tsx` — `RuleItem` mémoïsé, `useRuleForm` hook, `swapItems` utilitaire pur
- Refactors documentés : Task 1 (extraction `_load_rules_unlocked`/`_save_rules_unlocked`), Task 2 (extraction `_filter_suggestions_by_types`), Task 3 (`reordered` → `nextRules`), Task 4 (`swapItems` utilitaire + `useRuleForm` hook)

**Code Review fixes :**
- H1 : Priorité `#N` affichée dans `RuleItem` (AC#2 + AC#4 complétés)
- H2 : Écriture atomique dans `_save_rules_unlocked` (temp + os.replace)
- M1+M2 : Gestion erreurs dans toutes les actions mutantes du store + rollback `reorderRules` sur échec API
- M3 : Type annotation `RuleCondition` sur `_condition_met`
- M4 : `ContextSelector.test.tsx` ajouté au File List
- M5 : Formulaire multi-conditions avec opérateur AND/OR (AC#3 accessible via UI)

### File List

- `services/context_rule_service.py` (créé)
- `api/schemas/context_rules.py` (créé)
- `api/routers/context.py` (modifié — 4 endpoints + intégration suggestions)
- `api/container.py` (modifié — ContextRuleService)
- `api/dependencies.py` (modifié — get_context_rule_service)
- `constants.py` (modifié — CONTEXT_RULES_FILE)
- `tests/services/test_context_rule_service.py` (créé)
- `tests/api/test_context_rules.py` (créé)
- `frontend/src/types/api.ts` (modifié — ContextRule, RuleCondition, etc.)
- `frontend/src/api/context.ts` (modifié — listRules, createRule, updateRule, deleteRule)
- `frontend/src/store/contextRulesStore.ts` (créé)
- `frontend/src/store/contextRulesStore.test.ts` (créé)
- `frontend/src/components/context/ContextRulesEditor.tsx` (créé)
- `frontend/src/components/context/ContextRulesEditor.test.tsx` (créé)
- `frontend/src/components/context/ContextSelector.tsx` (modifié — bouton ⚙ + ContextRulesEditor)
- `frontend/src/components/context/ContextSelector.test.tsx` (modifié — mock refreshSuggestionsForTrigger)
