# Story 3.8 : Synchroniser les données GDD depuis Notion (V2.0+) (FR18)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **synchroniser les données GDD depuis Notion automatiquement (configuration, déclenchement manuel et périodique)**,
so that **j’utilise les dernières versions du lore sans copier à la main depuis Notion Scrapper**.

## Acceptance Criteria

1. **Given** la fonctionnalité de sync GDD Notion est disponible **When** je renseigne la configuration (au minimum : secret/token Notion valide, identifiants de sources — ex. page racine / bases selon le design retenu) **Then** le système peut **tester** la connexion et retourner un statut explicite (succès / échec avec raison) **And** les paramètres persistés incluent au moins la fréquence de sync et le périmètre (types de catégories / entités à inclure), sans exposer le secret en clair dans les réponses API ni dans les logs.

2. **Given** la sync automatique est activée **When** l’intervalle configuré est atteint **Then** une synchronisation s’exécute en arrière-plan (ou via planificateur intégré au processus API — pas de dépendance obligatoire à un cron OS si le produit reste « fichier + API ») **And** un résumé exploitable est disponible (ex. « X entités / fichiers mis à jour», erreurs partielles listées) **And** les données GDD déjà présentes restent utilisables si la sync échoue (pas d’état corrompu : écriture atomique ou staging + swap).

3. **Given** des contenus Notion changent **When** une sync s’exécute **Then** seules les ressources modifiées depuis le dernier succès connu sont retraitées en priorité (comparaison sur horodatages Notion, ex. `last_edited_time`, stockés dans un manifeste local) **And** un re-sync complet reste possible en cas de manifeste absent ou sur action admin explicite (comportement à documenter).

4. **Given** l’API Notion ou le réseau échoue **When** la sync se termine en erreur **Then** l’utilisateur voit un message du type « Sync Notion échouée — [raison courte]» **And** les fichiers GDD précédents restent inchangés **And** les tentatives suivantes appliquent une politique de **retry avec backoff** (côté service, pas busy-loop).

5. **Given** je suis dans l’UI **When** je déclenche « Synchroniser maintenant » **Then** la sync démarre sans attendre le prochain créneau **And** un indicateur de progression / statut (en cours, terminé, erreur) est visible jusqu’à fin d’opération.

## Tasks / Subtasks

- [x] Task 1 : Persistance configuration + test de connexion Notion (AC: #1)
  - [x] 🔴 Test échoue : avec config mockée, « test connexion » appelle le client Notion (mock) et renvoie succès ou erreur typée ; sans token configuré, erreur claire ; aucun secret dans le corps de réponse JSON ni dans les logs (masquage ou omission).
  - [x] 🟢 Implémenter stockage config sync (fichier sous `data/` ou clés `ConfigurationService` — alignement avec patterns existants) + endpoint ou extension router dédié sous `/api/v1/` + schémas Pydantic (voir Dev Notes).
  - [x] 🔵 Refactor : centraliser validation des champs sensibles et normalisation des IDs Notion (trim, format) dans un petit module ou fonctions pures partagées tests + router.

- [x] Task 2 : Pipeline sync incrémentale → artefacts GDD locaux + manifeste (AC: #2, #3)
  - [x] 🔴 Test échoue : à partir d’un jeu de pages/bases mockées avec `last_edited_time` différents, le service ne réécrit que les entrées « stale » ; manifeste mis à jour ; en cas d’échec milieu-parcours, pas de fichier JSON tronqué servi comme valide (transaction / fichier temporaire + rename).
  - [x] 🟢 Implémenter service dédié (nom libre : ex. `GddNotionSyncService` ou extension contrôlée de `NotionImportService`) qui produit des JSON compatibles `GDDLoader` / `ContextBuilder` et un manifeste (chemins, timestamps, version schéma) — voir Dev Notes pour le rapport avec `data/GDD_categories/` vs staging.
  - [x] 🔵 Refactor : isoler « diff manifeste » et « map Notion → structure GDD interne » dans des unités testables sans appels HTTP réels.

- [x] Task 3 : Planification, retry / backoff et journalisation sync (AC: #2, #4)
  - [x] 🔴 Test échoue : après N échecs simulés, le délai entre tentatives augmente (backoff) jusqu’à un plafond ; les événements critiques sont loggés avec corrélation `request_id` si présent ; pas de fuite de token dans les messages d’erreur.
  - [x] 🟢 Brancher une tâche périodique (APScheduler, `asyncio` loop + `create_task`, ou équivalent déjà présent dans le projet — réutiliser plutôt qu’introduire une stack lourde) déclenchée au démarrage optionnel selon config ; fichier log dédié sous `data/logs/` pour la sync Notion (rotation alignée sur règles logging projet).
  - [x] 🔵 Refactor : extraire la politique retry dans une fonction / petite classe injectable pour tests déterministes (horloge mockable).

- [x] Task 4 : UI — statut, déclenchement manuel et feedback utilisateur (AC: #5 + messages #4)
  - [x] 🔴 Test échoue : avec API mockée, bouton « Synchroniser maintenant » affiche états chargement / succès / erreur ; message utilisateur lisible sur échec ; pas d’affichage du secret.
  - [x] 🟢 Étendre le client API TS + types ; composant ou section dans l’écran paramètres / admin (cohérent avec `syncStore` ou patterns existants pour guides / vocabulaire).
  - [x] 🔵 Refactor : mutualiser avec les autres flux « sync Notion » (vocabulaire, guides) les hooks d’état async (pending, error) si duplication visible après implémentation.

## Dev Notes

### Architecture guardrails

- Logique métier dans `services/` ; routes dans `api/routers/` ; schémas dans `api/schemas/` ; injection via `api/container.py` (`ServiceContainer`) — **pas** de singletons ad hoc.
- `ConfigurationService` pour chemins et flags ; pas de `config_manager` racine pour le nouveau code. Respecter `GDD_CATEGORIES_PATH` / variables documentées dans `docs/deployment/DATA_MAINTENANCE.md` : la story **remplace progressivement** la mise à jour 100 % manuelle, mais le dev doit trancher explicitement : écriture directe dans le répertoire configuré vs répertoire intermédiaire + bascule ; documenter le risque et la procédure de rollback.
- Ne **pas** exposer `NOTION_API_KEY` / tokens dans les réponses JSON ni les logs ; utiliser chiffrement au repos ou secret manager seulement si déjà pattern projet — sinon fichier local restreint + masquage logs (comme pour autres intégrations Notion existantes).
- Réutiliser `NotionAPIClient` / `NotionImportService` là où c’est pertinent (guides narratifs, vocabulaire) ; éviter un second client HTTP parallèle sans raison. L’export GDD complet peut s’inspirer du pipeline Notion Scrapper (parent repo) **conceptuellement** ; l’implémentation doit rester dans ce dépôt ou appeler un script documenté — ne pas supposer MCP disponible en prod.

### What to reuse

- `services/notion_api_client.py`, `services/notion_import_service.py`, endpoints de sync existants : `api/routers/narrative_guides.py`, `api/routers/vocabulary.py` (patterns de réponse succès / erreur, `NOTION_API_KEY`, cache Notion si utile).
- `frontend/src/store/syncStore.ts` (ou équivalent) pour cohérence UX multi-sync.
- Système de logs central (`data/logs/`, règles `.cursor/rules/logging.mdc`).

### Quality bar

- Tests unitaires sur diff incrémental, manifeste, et politique retry ; tests d’intégration API avec mocks HTTP / client Notion mocké — **pas** d’appels réseau Notion en CI.
- Aucune régression sur chargement GDD existant : si sync désactivée ou jamais lancée, l’app se comporte comme aujourd’hui.
- Frontend : Vitest + RTL sur le flux declenchement + états ; pas de données GDD réelles dans les tests.

### Refactor bar (defaults)

- Critères dev-story : ~300 lignes max par fichier source touché par tâche, ~60 lignes par fonction, duplication non triviale interdite, responsabilité unique des modules exportés.

### Conventions

- Windows-first : `pathlib.Path`, UTF-8 pour écriture JSON (`ensure_ascii=False` aligné Unity/GDD).
- Types TS alignés sur schémas Pydantic (`frontend/src/types/api.ts`).

### Project Structure Notes

- Zones probables : `services/` (nouveau service sync GDD), `api/routers/` (+ enregistrement router dans `api/main` ou équivalent), `api/schemas/`, `data/.gdd_snapshot/` ou manifeste dédié (déjà présence de fichiers snapshot dans le repo — vérifier réutilisation vs nouveau manifeste), `frontend/src/components/` ou écran settings.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-03.md` — Story 3.8, FR18, NFR-I3]
- [Source: `docs/deployment/DATA_MAINTENANCE.md` — état actuel maintenance manuelle `data/GDD_categories/`]
- [Source: `_bmad-output/planning-artifacts/prd/non-functional-requirements.md` — NFR-I3 Notion Integration]
- [Source: `_bmad-output/project-context.md` — stack, interdiction secrets, Structure API]

## Technical Requirements (rappel épic — adapté au repo)

- Service de synchronisation Notion → artefacts GDD consommables par `ContextBuilder` / `GDDLoader`, avec manifeste et sync incrémentale par timestamps.
- API REST pour configuration, test connexion, déclenchement manuel, et lecture statut dernière sync (contrat stable).
- Mécanisme de sync périodique côté backend + retry backoff sur erreurs transitoires.
- Journalisation dédiée des opérations de sync (succès, partiel, échec).

## Architecture Compliance

- FastAPI, `ServiceContainer`, `ConfigurationService`, versioning `/api/v1/`, pas de logique métier dans les composants React hors orchestration / présentation.

## Library / Framework Requirements

- Préférence : réutiliser dépendances existantes (`httpx`, Tenacity si déjà utilisé pour retries, etc.). Toute nouvelle lib (ex. scheduler) doit être justifiée et minime.

## File Structure Requirements

- Nouveaux modules sous `services/`, `api/`, `tests/` en miroir ; pas de fichiers « hors arbo » à la racine sauf script documenté existant (`scripts/`).

## Testing Requirements

- pytest avec mocks ; couverture des chemins heureux + échec réseau + skip incrémental ; tests frontend pour états UI.

## Previous Story Intelligence

- Story 3.7 a renforcé la **transparence contexte** (usage par section, `LLMUsageRecord`, endpoints `llm-usage`). Story 3.8 change la **source de données GDD** : après sync, le contexte affiché / injecté doit refléter les fichiers à jour — anticiper invalidation cache côté `ContextBuilder` ou GDD loader si cache mémoire existe.
- Garder le principe **non-bloquant** : une sync ne doit pas casser la génération en cours ; erreurs loggées, UI informative.

## Git Intelligence Summary

- Commits récents sur contexte LLM, règles de contexte, suggestions — la suite naturelle est l’**alimentation données** (GDD) plutôt que l’édition graphe. Réutiliser les patterns de sync Notion déjà présents (guides, vocabulaire) pour cohérence UX et erreurs.

## Latest Tech Information

- API Notion : utiliser la version d’API configurée sur le client existant (`Notion-Version` header dans `NotionAPIClient`) ; vérifier la doc officielle Notion pour pagination bases de données et `last_edited_time` au moment de l’implémentation — ne pas coder en dur des champs obsolètes sans lecture du client actuel.

## Project Context Reference

- Voir `_bmad-output/project-context.md` : chemins GDD, interdiction tests sur entités réelles, injection DI, pas de secrets en dur.

## Dev Agent Record

### Agent Model Used

Composer / Amelia (dev-story workflow)

### Debug Log References

- Suite pytest : `1304 passed, 1 skipped` (dont nouveaux tests `tests/services/test_gdd_notion_*`, `tests/api/test_gdd_notion_sync.py`).
- Vitest : `GddNotionSyncSection.test.tsx` (2 tests).

### Completion Notes List

- **Décision écriture GDD** : écriture **directe** dans `GDD_CATEGORIES_PATH` / `data/GDD_categories` (fichiers listes JSON par catégorie), avec **écriture atomique** (`.tmp` + replace) pour éviter JSON tronqué. Manifeste incrémental : `data/.gdd_snapshot/manifest.json` (`last_edited_time` par page Notion).
- **Token** : `data/gdd_notion_sync/notion_token.secret` (gitignore) ou repli `NOTION_API_KEY` ; jamais renvoyé par l’API ; `verify_credentials` via `GET /users/me` sur `NotionAPIClient`.
- **Planificateur** : boucle `asyncio` dans `api/main.py` lifespan (`create_task`), intervalle lu depuis `settings.json` (min 60 s entre réveils), sync seulement si `auto_sync_enabled`.
- **Retry** : `run_with_retries` + `SyncBackoffPolicy` sur la passe complète ; erreurs 429/502/503/504 + timeouts considérées transitoires.
- **🔵 Refactor Task 1** : IDs Notion normalisés dans `gdd_notion_sync_utils.normalize_notion_id` + `validate_sources` ; masquage `mask_secret` / `redact_notion_token_from_text`.
- **🔵 Refactor Task 2** : diff manifeste `gdd_notion_manifest.filter_stale_page_ids` ; map `gdd_notion_sync_mapper.notion_page_to_gdd_record` + `merge_records_by_nom`.
- **🔵 Refactor Task 3** : `gdd_notion_sync_retry.py` (`SyncBackoffPolicy`, `run_with_retries`) injectable / testable.
- **🔵 Refactor Task 4** : `frontend/src/hooks/useGddNotionSyncUi.ts` pour pending / message / erreur réutilisable.
- **Code review (fix auto [1])** : périmètre `included_categories` appliqué dans `GddNotionSyncService` + `category_file_matches_included` (`gdd_notion_sync_utils`) ; `last_full_sync_at` renseigné après sync avec `force_full` ; routes protégées par `Depends(get_current_user)` ; exceptions métier resserrées (`_SYNC_RECOVERABLE`) + filet `Exception` documenté après retries ; tests API/service/utils + message d’erreur si GET `/status` échoue (UI).

### File List

- `constants.py`
- `.gitignore`
- `services/gdd_notion_sync_utils.py`
- `services/gdd_notion_atomic_io.py`
- `services/gdd_notion_manifest.py`
- `services/gdd_notion_sync_retry.py`
- `services/gdd_notion_sync_log.py`
- `services/gdd_notion_sync_config_store.py`
- `services/gdd_notion_sync_mapper.py`
- `services/gdd_notion_sync_service.py`
- `services/notion_api_client.py`
- `api/container.py`
- `api/dependencies.py`
- `api/main.py`
- `api/schemas/gdd_notion_sync.py`
- `api/routers/gdd_notion_sync.py`
- `tests/services/test_gdd_notion_sync_utils.py`
- `tests/services/test_gdd_notion_manifest.py`
- `tests/services/test_gdd_notion_atomic_io.py`
- `tests/services/test_gdd_notion_sync_retry.py`
- `tests/services/test_gdd_notion_sync_service.py`
- `tests/api/test_gdd_notion_sync.py`
- `frontend/src/api/gddNotionSync.ts`
- `frontend/src/hooks/useGddNotionSyncUi.ts`
- `frontend/src/components/generation/GddNotionSyncSection.tsx`
- `frontend/src/components/generation/GddNotionSyncSection.test.tsx`
- `frontend/src/components/generation/VocabularyGuidesTab.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Senior Developer Review (AI)

- **Date** : 2026-03-26  
- **Issue** : Revue adversariale (option correctifs **[1]** appliqués).  
- **Résultat** : HIGH/MEDIUM traités (filtre `included_categories`, `last_full_sync_at`, auth JWT sur router, exceptions resserrées, tests API étendus, UX erreur statut).  
- **Outcome** : Approuvé pour clôture story après validation manuelle smoke UI si besoin.

## Change Log

- 2026-03-26 : Implémentation sync GDD Notion (API v1, service, manifeste, scheduler asyncio, UI onglet vocabulaire/guides), tests pytest + vitest ; statut sprint → review.
- 2026-03-26 : Correctifs post code-review (périmètre catégories, manifeste full sync, auth routes, tests, UI statut) ; statut sprint → done.

## Story Completion Status

- **Statut** : done  
- **Note** : Code review automatique + correctifs intégrés ; smoke : onglet génération → vocabulaire/guides → section sync GDD Notion.
