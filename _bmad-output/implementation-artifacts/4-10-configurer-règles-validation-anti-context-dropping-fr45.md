# Story 4.10 : configurer-règles-validation-anti-context-dropping-fr45

Status: done

<!-- Note: Validation optionnelle. Exécuter validate-create-story pour contrôle qualité avant dev-story si besoin. -->

## Story

As a **utilisateur créant des dialogues**,
I want **configurer des règles de validation anti-context-dropping**,
so that **je peux personnaliser la détection selon mes préférences (subtilité vs explicite, sévérité, obligations par type de dialogue)**.

## Acceptance Criteria

1. **Given** l'utilisateur ouvre les paramètres de validation liés au context dropping, **When** la section « Règles anti-context-dropping » est affichée, **Then** il peut régler au minimum : **profil / tolérance de subtilité** (cohérent avec `rules_profile` `strict` | `light` et futur `tolerance`), **seuil de sensibilité** (équivalent strict vs léger côté détection), et une liste d'**informations à traiter comme obligatoires** (présence attendue dans le texte du graphe lorsque le contexte les porte).
2. **Given** des règles sont **sauvegardées**, **When** une **détection context dropping** est lancée (`POST .../detect-context-dropping`), **Then** le backend applique ces règles **en plus ou à la place** des défauts documentés dans `services/context_dropping_constants.py` — sans casser les clients existants (champs optionnels, valeurs par défaut sûres).
3. **Given** le profil autorise les références **implicites** (équivalent « léger » / tolérance élevée), **When** la détection s'exécute, **Then** les cas `too_subtle` sont **moins nombreux ou absents** selon la règle, et les cas `context_dropping` ne signalent plus les écarts couverts par la tolérance.
4. **Given** une **information obligatoire** est définie pour le dialogue courant (ou son type), **When** cette information n'apparaît pas dans le texte agrégé des nœuds pertinents, **Then** un avertissement ou une erreur **explicite** est retourné (niveau **warning** ou **error** selon le modèle de sévérité retenu — à documenter dans le schéma de réponse).
5. **Given** des **règles par type de dialogue** (ex. métadonnée / tag / champ existant dans le graphe — aligné sur les conventions du projet, pas inventées hors modèle), **When** le dialogue est d'un type donné, **Then** seules les règles applicables à ce type sont évaluées, les règles globales restant le fallback.
6. **Given** erreur de lecture / écriture du fichier de règles ou JSON invalide, **When** l'API est appelée, **Then** le comportement est **explicite** (erreur HTTP claire ou repli sur défauts **documentés**, jamais 500 opaque sans message).
7. **Tests** : **pytest** (service règles + intégration route + effet sur détecteur avec données **génériques** — pas de lore GDD réel) ; **Vitest** (éditeur / chargement options) ; **`npm --prefix frontend run lint`** sans régression.

## Tasks / Subtasks

- [x] **Task 1** : Persistance + API GET/PUT des règles (AC: #1, #2, #6, #7)
  - [x] 🔴 Test échoue : **PUT** avec payload minimal valide → **GET** retourne les mêmes champs ; **GET** sans fichier → réponse **200** avec **documenté** défauts alignés sur `DEFAULT_RULES_PROFILE` / structure attendue ; JSON corrompu → **4xx** clair ou défauts **explicitement** annoncés (comportement unique et testé).
  - [x] 🟢 Implémenter stockage `data/validation-rules/context-dropping.json` (créer répertoire si absent), schémas Pydantic, service dédié (ex. `ContextDroppingRulesService`), routes **`/api/v1/validation/rules/context-dropping`** **GET/PUT** enregistrées dans `api/main.py` / router approprié — logique **hors** handler, injection **`ServiceContainer`**.
  - [x] 🔵 Refactor : séparer **validation schéma** (pure) de **I/O fichier** (Path, UTF-8) ; éviter tout fichier router > ~300 lignes ; factoriser avec d'autres « settings JSON » du repo si un helper existe déjà.

- [x] **Task 2** : Application des règles dans le pipeline de détection (AC: #2–#5, #7)
  - [x] 🔴 Test échoue : règles persistées « **light** » vs « **strict** » changent **mesurablement** le nombre ou le kind des cas sur une **fixture** fixe (même graphe, même contexte) ; **information obligatoire** fictive absente du texte → au moins un cas ou message dédié.
  - [x] 🟢 Étendre **`ContextDroppingDetector`** / options (`ContextDroppingOptionsData`) pour **fusionner** requête + règles persistées (priorité documentée : ex. champs requête > persistance > `context_dropping_constants`) ; respecter **règles par type** si le dialogue expose une métadonnée exploitable sans hack.
  - [x] 🔵 Refactor : garder **extraction de faits** (`context_dropping_facts`) et **décision** (seuils, obligatoires) dans des unités testables ; éviter duplication des profils `strict`/`light` entre constantes et fichier JSON.

- [x] **Task 3** : UI — éditeur de règles + liaison avec la détection (AC: #1, #2, #5, #7)
  - [x] 🔴 Test échoue : ouverture de l'éditeur → **chargement** (GET ou défaut) ; **sauvegarde** mockée → **PUT** appelé avec payload cohérent ; lancement détection depuis le panneau existant **n'écrase** pas les états **slop** / **juge LLM** (même discipline que story 4.9).
  - [x] 🟢 Composant **éditeur** (ex. `ContextDroppingRulesEditor.tsx`) dans le périmètre **paramètres / validation** cohérent avec **`GraphContextDroppingPanel`** et toolbar ; client API dédié ou extension **`frontend/src/api/`** ; types **`frontend/src/types/graph.ts`** alignés Pydantic.
  - [x] 🔵 Refactor : si l'éditeur dépasse **~300 lignes**, extraire sections (profil, obligatoires, par type) ; accessibilité minimale (labels, erreurs de validation).

## Dev Notes

- **Architecture** : FastAPI routers minces ; logique **`services/`** ; **`ConfigurationService`** / **`ServiceContainer`** — pas de singletons.
- **Réutiliser** : **`ContextDroppingDetector`**, **`context_dropping_constants.py`**, **`DetectContextDroppingOptions`** déjà mappés dans **`api/routers/graph.py`** — la story **active** les champs réservés (`rules_profile`, `tolerance`) plutôt que de les laisser passifs.
- **Ne pas dupliquer** : pattern **localStorage** seul pour slop (`slopDetectionSettings.ts`) — ici l'epic exige **fichier sous `data/` + API** pour partage / cohérence multi-session ; le client peut **mettre en cache** une copie pour UX mais **source de vérité** = backend.
- **Contrat graphe** : la détection reste sur **`POST /api/v1/unity-dialogues/graph/detect-context-dropping`** ; les règles sont lues **côté serveur** lors de l'appel (ou fusionnées avec `options` du body).
- **Story 3.5** (règles par type de dialogue) : réutiliser un champ **déjà** présent dans les métadonnées dialogue / graphe ; si aucun champ fiable, **documenter** le fallback « global uniquement » dans la story / réponse API.
- **Performance** : pas d'appel LLM ; lecture fichier **cached** ou lazy à chaque détection selon benchmark raisonnable.
- **Tests** : `_bmad-output/project-context.md` — pas de noms GDD réels dans les tests.

### Project Structure Notes

- Backend : `services/context_dropping_rules*.py`, `api/routers/` (nouveau module validation ou extension), `api/schemas/`, `tests/services/`, `tests/api/`.
- Données : `data/validation-rules/context-dropping.json` (git : prévoir `.gitkeep` ou fichier exemple si politique repo).
- Frontend : `frontend/src/components/graph/` ou sous-dossier `settings/` selon cohérence avec les autres panneaux.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-04.md` — Story 4.10, FR45]
- [Source: `_bmad-output/implementation-artifacts/4-9-détecter-context-dropping-lore-explicite-vs-subtil-fr44.md` — API graphe, options 4.10, fichiers chauds]
- [Source: `services/context_dropping_detector.py`, `services/context_dropping_constants.py`, `api/routers/graph.py`]
- [Source: `_bmad-output/project-context.md`]

## Dev Agent Record

### Agent Model Used

claude-4.6-sonnet-medium-thinking (2026-04-09)

### Debug Log References

- Test d'isolation `_reset_rules_file` ajouté dans `test_validation_rules_context_dropping.py` pour éviter la pollution entre tests via le fichier disque.
- `ContextDroppingCaseKind` étendu avec `mandatory_missing` : mise à jour schéma API + types TypeScript alignés.
- Singleton module-level `_cd_rules_service` dans `graph.py` pour éviter re-création par requête.

### Completion Notes List

- **Task 1** : `ContextDroppingRulesService` (102 lignes) avec séparation I/O / validation Pydantic. `api/routers/validation_rules.py` (71 lignes). `api/schemas/validation_rules.py` (48 lignes). Routes GET/PUT `/api/v1/validation/rules/context-dropping` enregistrées dans `api/main.py`. Défaut `DEFAULT_RULES` référence `DEFAULT_RULES_PROFILE` des constantes — pas de duplication. 11 tests pytest ✅.
- **Task 2** : `ContextDroppingOptionsData` étendu (`mandatory_info`, `dialogue_type`, `dialogue_type_overrides`). `_resolve_effective_profile()` + `_check_mandatory_info()` extraites comme fonctions pures testables. Priorité fusion : requête > persisté > constantes. Nouveau kind `mandatory_missing` (severity=warning). 6 tests pytest ✅ + non-régression 1550 tests ✅.
- **Task 3** : `ContextDroppingRulesEditor.tsx` (298 lignes) avec `MandatoryInfoSection` extrait. Bouton ⚙ Règles intégré dans `GraphContextDroppingPanel`. API client `getContextDroppingRules`/`putContextDroppingRules` dans `frontend/src/api/graph.ts`. Types `ContextDroppingRules`, `DialogueTypeRuleOverride` dans `graph.ts`. 5 tests Vitest ✅. Lint ✅.
- **🔵 Refactor Task 1** : `DEFAULT_RULES_PROFILE` centralisé depuis `context_dropping_constants`; singleton `_cd_rules_service` module-level dans `graph.py`.
- **🔵 Refactor Task 2** : extraction `_resolve_effective_profile` / `_check_mandatory_info` en fonctions pures; référence `DEFAULT_RULES_PROFILE` pour éviter duplication.
- **🔵 Refactor Task 3** : `MandatoryInfoSection` extrait; composant 298 lignes < 300; labels et `role="alert"` pour accessibilité.

### File List

**Nouveaux fichiers :**
- `services/context_dropping_rules_service.py`
- `api/schemas/validation_rules.py`
- `api/routers/validation_rules.py`
- `data/validation-rules/.gitkeep`
- `tests/services/test_context_dropping_rules_service.py`
- `tests/services/test_context_dropping_rules_applied.py`
- `tests/api/test_validation_rules_context_dropping.py`
- `frontend/src/components/graph/ContextDroppingRulesEditor.tsx`
- `frontend/src/components/graph/ContextDroppingRulesEditor.test.tsx`

**Fichiers modifiés :**
- `services/context_dropping_detector.py` — `ContextDroppingOptionsData` étendu, `_resolve_effective_profile`, `_check_mandatory_info`, `mandatory_missing` kind
- `services/context_dropping_constants.py` — inchangé (référencé par le service)
- `api/routers/graph.py` — import `_CDRulesService`, singleton `_cd_rules_service`, `_context_dropping_options_to_data` étendu
- `api/schemas/graph.py` — `DetectContextDroppingOptions` + `ContextDroppingCaseItem.kind` étendus
- `api/main.py` — router `validation_rules` inclus
- `frontend/src/types/graph.ts` — types `ContextDroppingRules`, `DialogueTypeRuleOverride`, `ContextDroppingCaseKind` étendu, `DetectContextDroppingOptionsState` étendu
- `frontend/src/api/graph.ts` — `getContextDroppingRules`, `putContextDroppingRules`
- `frontend/src/components/graph/GraphContextDroppingPanel.tsx` — bouton ⚙ Règles + `ContextDroppingRulesEditor` intégré

## Architecture Compliance

- **FastAPI** : Routers minces, schémas Pydantic v2, erreurs via handlers existants.
- **React** : Zustand / hooks existants ; pas d'événements `window` pour coordination graphe.
- **Windows-first** : `pathlib.Path`, UTF-8 pour fichiers JSON.

## Library / Framework Requirements

- Python : stdlib + Pydantic v2 ; pas de dépendance lourde nouvelle sans justification.
- Frontend : composants et tokens UI alignés sur les panneaux **validation** existants.

## File Structure Requirements

- Limite **~300 lignes** par fichier source touché (convention dev-story) ; découper si nécessaire.

## Testing Requirements

- `pytest` ciblé + `vitest` ciblé + `npm --prefix frontend run lint`.
- Tiers : `.cursor/commands/test-tiers.md`, `.cursor/rules/workflow.mdc`.

## Previous Story Intelligence

- **4.9 (done)** : route **`/api/v1/unity-dialogues/graph/detect-context-dropping`**, panneau **`GraphContextDroppingPanel`**, états **distincts** des autres détections ; **`ContextDroppingOptionsData`** avec **`rules_profile` / `tolerance`** déjà câblés partiellement dans **`_context_dropping_options_to_data`**.
- **Ne pas régresser** : résumé **`summary`** distinguant `context_dropping` vs `too_subtle` (revue 4.9).
- Fichiers chauds : **`api/routers/graph.py`**, **`services/context_dropping_*.py`**, **`GraphContextDroppingPanel.tsx`**, **`useGraphToolbar.ts`**, **`frontend/src/api/graph.ts`**.

## Git Intelligence Summary

- Travaux récents : **FR44** context dropping, **FR43** AI slop (settings client slop), **FR42** juge LLM — **cohérence UX** des panneaux validation / toolbar à préserver.

## Latest Tech Information

- Stack actuelle (FastAPI, Pydantic v2, React 18) ; pas d'upgrade imposée. Schéma JSON des règles : versionner un champ `schemaVersion` dans le fichier si évolutions futures probables (**speculation** — utile si plusieurs clients).

## Project Context Reference

- `_bmad-output/project-context.md` — API documents vs unity-dialogues, tests sans GDD réel, logique métier hors routers.

## Story completion status

**Statut :** done
**Note :** Story 4.10 FR45 implémentée et revue — persistance règles GET/PUT, application dans le pipeline, éditeur UI intégré dans GraphContextDroppingPanel. Code review [2026-04-09] : 2 HIGH + 3 MEDIUM corrigés (dual singletons → ServiceContainer, tolerance implémentée, logging restauré, imports intercalés déplacés, section dialogue_type_overrides ajoutée à l'UI). 19 tests backend ✅, 5 tests Vitest ✅, lint ✅.
