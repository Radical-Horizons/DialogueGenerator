# Story 3.9 : Mettre à jour les données GDD sans régénérer les dialogues existants (FR19)

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **mettre à jour les données GDD sans que les dialogues existants soient régénérés ou altérés automatiquement**,
so that **je peux corriger ou enrichir le lore (y compris via sync Notion) sans perdre le travail déjà généré dans le graphe**.

## Acceptance Criteria

1. **Given** les fichiers GDD sous `data/GDD_categories/` (ou chemin configuré) sont mis à jour — manuellement, par sync Notion (story 3.8), ou toute autre voie supportée **When** l’utilisateur ouvre un dialogue existant **Then** le contenu des nœuds et du document reste **identique** à ce qui était sauvegardé (pas de régénération automatique, pas de réécriture des textes de nœuds) **And** aucun job LLM n’est déclenché uniquement parce que les fichiers GDD ont changé sur disque.

2. **Given** un nœud a été généré avec un contexte GDD **When** le contenu GDD pertinent à ce contexte a changé depuis la génération **Then** l’utilisateur peut voir un **indicateur non bloquant** du type « GDD mis à jour depuis la génération — régénérer ? » (ou équivalent court) **And** l’indicateur ne bloque pas l’édition ni la navigation **And** sans action utilisateur, le texte affiché du nœud reste celui d’origine.

3. **Given** l’utilisateur crée un **nouveau** dialogue ou lance une **nouvelle** génération de nœud **When** le moteur de contexte construit le prompt **Then** les données GDD **courantes** sur disque sont utilisées (comportement par défaut attendu, à vérifier / verrouiller par tests si besoin).

4. **Given** l’utilisateur régénère explicitement un nœud (flux existant — story 1.10 / régénération) **When** la régénération s’exécute **Then** le prompt utilise le GDD courant **And** le nouveau contenu peut différer du nœud d’origine (comportement attendu).

5. **Given** l’utilisateur consulte l’historique des modifications pour une entité GDD **When** il ouvre la fonctionnalité « Historique » (ou équivalent) **Then** une **timeline** affiche les changements connus du système (dates / source, ex. sync Notion) **And** l’utilisateur peut consulter au moins une **version antérieure** ou un **diff** raisonnable par rapport à la version courante pour cette entité (MVP : périmètre et granularité à trancher en implémentation — voir Dev Notes ; ne pas promettre un audit légal sans source de données).

## Tasks / Subtasks

- [x] Task 1 : Garantir l’absence de régénération / mutation automatique des dialogues lors d’un changement GDD (AC: #1)
  - [x] 🔴 Test échoue : après modification simulée des fichiers GDD (fixture temporaire) ou bascule de hash manifeste, charger un document existant via API/store ne déclenche pas d’appel LLM ni ne modifie `nodes` / contenu textuel des nœuds sans action explicite ; le graphe persistant reste byte-identique ou équivalent sémantique attendu selon le contrat document.
  - [x] 🟢 Valider les chemins d’entrée (chargement document, refresh contexte, sync Notion terminée) pour confirmer qu’aucun effet de bord ne réécrit le document ; ajouter garde-fous ou tests d’intégration là où un watcher ou un effet pourrait exister (voir Dev Notes).
  - [x] 🔵 Refactor : extraire toute logique « refresh / invalidation » dispersée (frontend ou backend) en points de contrôle testables et documentés pour éviter les doubles effets lors d’événements GDD.

- [x] Task 2 : Détection « GDD stale » par rapport à la génération — au-delà du hash des seules sélections (AC: #2)
  - [x] 🔴 Test échoue : avec sélections identiques mais contenu GDD d’une entité modifié, le système marque le nœud (ou le document) comme « contexte potentiellement obsolète » ; avec contenu inchangé, pas de faux positif sur un jeu de fixtures contrôlé.
  - [x] 🟢 Étendre le modèle de traçabilité : aujourd’hui `contextGddHash` dans `generationSlice` est un hash de `JSON.stringify(contextSelections)` (clés de sélection), **pas** du contenu GDD — introduire un snapshot minimal (ex. empreinte par entité utilisée, timestamps manifeste sync, ou hash du JSON entité) stocké côté nœud ou document selon le design retenu ; calculer la comparaison avec l’état courant via service ou helper dédié.
  - [x] 🔵 Refactor : centraliser calcul « empreinte contexte génération » et « empreinte GDD courant » dans un module unique (backend et/ou frontend) pour éviter divergences de logique.

- [x] Task 3 : UI — indicateur non bloquant « GDD mis à jour — régénérer ? » (AC: #2, #3)
  - [x] 🔴 Test échoue : avec API/store mockés, lorsque le nœud est marqué stale, un libellé ou badge discret apparaît ; pas de modal forcé ; l’utilisateur peut continuer à éditer ; pas de fuite de données sensibles.
  - [x] 🟢 Implémenter l’affichage au bon niveau (nœud `DialogueNode`, panneau d’édition, ou les deux — trancher pour cohérence UX) + accessibilité minimale (title / aria-live si pertinent).
  - [x] 🔵 Refactor : mutualiser avec autres indicateurs de statut nœud (validation, coût) si duplication de layout ; harmoniser vocabulaire avec `GddNotionSyncSection`.

- [x] Task 4 : Historique des modifications d’entité GDD — timeline + consultation version antérieure / diff (AC: #5)
  - [x] 🔴 Test échoue : pour une entité de test, l’API (ou service) retourne une liste d’événements ordonnés (date, type, résumé) ; au moins une entrée « avant / après » ou snapshot stocké est accessible ; erreurs typées si entité inconnue.
  - [x] 🟢 Implémenter persistance des versions : l’épic suggère `data/GDD_versions/{type}/{name}/versions.json` — **réutiliser en priorité** le manifeste / snapshots existants post-sync Notion (`data/.gdd_snapshot/`, `manifest.json`) si suffisant ; sinon couche légère de versioning à l’écriture GDD (sync ou futur PUT manuel) sans dupliquer toute la pile « CRUD GDD » si hors scope.
  - [x] 🔵 Refactor : isoler lecture/écriture historique dans un service dédié testable ; garder les fichiers versionnés hors du hot path de lecture GDD pour les performances.

- [x] Task 5 : Composant « GDDHistoryViewer » (ou intégration équivalente) (AC: #5)
  - [x] 🔴 Test échoue : ouverture du viewer avec données mockées affiche la timeline ; sélection d’une entrée affiche diff ou contenu précédent selon contrat ; pas de crash si une seule version.
  - [x] 🟢 Composant React dédié (nom libre si `GDDHistoryViewer.tsx` trop rigide — rester cohérent avec l’arborescence `frontend/src/components/`) branché sur l’API ; point d’entrée UX documenté (panneau contexte, détail entité, etc.).
  - [x] 🔵 Refactor : si logique de formatage / tri dates dupliquée avec sync UI, extraire utilitaires partagés.

## Dev Notes

### Architecture guardrails

- Logique métier et accès disque dans `services/` ; routes dans `api/routers/` ; schémas Pydantic dans `api/schemas/` ; injection via `api/container.py`. Pas de singletons ad hoc.
- **Documents** : source de vérité = API documents / graphe persisté — ne jamais reconstruire un document à partir du seul GDD courant pour « rafraîchir » le dialogue. Réf. `_bmad-output/project-context.md` (documents vs Unity).
- **Sync Notion (3.8)** : écriture atomique déjà en place vers `GDD_categories` + `data/.gdd_snapshot/manifest.json`. Toute solution historique doit composer avec ce pipeline (pas deux vérités contradictoires).
- **Ne pas** exposer secrets Notion ; historique = métadonnées + snapshots de contenu GDD public local, pas tokens.

### What to reuse

- `services/gdd_notion_sync_service.py`, `services/gdd_notion_manifest.py`, `data/.gdd_snapshot/manifest.json` pour dates / invalidation « fraîcheur » globale ou par page Notion.
- `frontend/src/store/slices/generationSlice.ts` (`contextGddHash`) — **à étendre ou compléter**, pas supposer que le hash actuel suffit pour FR19.
- `api/utils/context_field_cache.py` (invalidation par `gdd_data_hash`) — pattern d’empreinte contenu déjà entamé côté champs contexte.
- `services/graph_conversion_service.py` — champs éditeur non exportés Unity ; conserver `contextGddHash` / nouveaux champs comme métadonnées éditeur si hors schéma Unity.

### Quality bar

- Tests : régression « pas de mutation document sur changement GDD » ; tests unitaires sur calcul stale ; tests API historique ; frontend Vitest + RTL sur indicateur et viewer (mocks).
- Pas de dépendance aux entités lore réelles dans les tests (personnages/lieux du GDD prod) — fixtures minimales.
- Performance : pas de scan complet des 500+ fichiers GDD à chaque frame ; comparer de façon ciblée (entités liées au nœud / document).

### Refactor bar (defaults)

- Critères dev-story : ~300 lignes max par fichier source touché par tâche, ~60 lignes par fonction, duplication non triviale interdite.

### Conventions

- Windows-first : `pathlib.Path`, UTF-8, JSON `ensure_ascii=False` si aligné avec le reste du repo.
- Types TS alignés sur réponses API (`frontend/src/types/api.ts`).

### Project Structure Notes

- Éviter d’introduire `PUT /api/v1/gdd/{type}/{name}` **en doublon** de la sync Notion si le produit décide que Notion reste la seule source d’édition : dans ce cas, historique + staleness se basent sur **sync + fichiers locaux**. Si PUT est requis par produit, le documenter comme extension explicite et la faire converger avec l’écriture atomique existante.
- Champs additionnels sur nœuds : vérifier sérialisation document (`schemaVersion`, persistenceSlice) pour ne pas casser clients existants.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-03.md` — Story 3.9, FR19]
- [Source: `_bmad-output/implementation-artifacts/3-8-synchroniser-données-gdd-depuis-notion-v20-fr18.md` — sync, manifeste, atomic write]
- [Source: `_bmad-output/project-context.md` — stack, documents SoT, tests]

## Technical Requirements

- Comportement d’isolation : dialogues existants = contenu figé jusqu’à action utilisateur (régénération, édition manuelle).
- Mécanisme de détection d’obsolescence contexte GDD vs génération (empreintes, manifeste, ou snapshots).
- API REST pour historique (GET) sous `/api/v1/...` cohérent avec le versioning existant ; pas de fuite d’informations sensibles.
- UI : indicateur non bloquant + viewer d’historique / diff MVP.

## Architecture Compliance

- FastAPI + `ServiceContainer` + `ConfigurationService` ; React consommateur d’API ; logique métier hors composants sauf orchestration.

## Library / Framework Requirements

- Pas de nouvelle dépendance lourde sans justification ; diff texte : solution standard légère ou HTML simple selon besoin.

## File Structure Requirements

- Nouveaux modules sous `services/`, `api/`, `frontend/src/components/` ou `hooks/`, `tests/` en miroir.

## Testing Requirements

- pytest + Vitest comme le reste du projet ; mocks I/O et LLM ; e2e optionnel si déjà pattern Playwright pour parcours critique.

## Previous Story Intelligence

- **3.8** a livré sync incrémentale Notion → `GDD_categories` + manifeste `.gdd_snapshot`. La story 3.9 doit **composer** avec ce flux : un sync réussi ne doit pas corrompre ni auto-muter les documents ; c’est le cœur de FR19.
- **3.7** a ajouté la transparence d’usage contexte (`LLMUsageRecord`, sections) — l’indicateur « stale » peut s’aligner sur les mêmes entités visibles à l’utilisateur.
- Fichiers déjà touchés par 3.8 listés dans la story 3.8 (router `gdd_notion_sync`, `GddNotionSyncService`, etc.) : vérifier les points d’accroche pour « événement sync terminé » sans effet de bord document.

## Git Intelligence Summary

- Commits récents : sync GDD Notion, contexte LLM, règles de contexte — la suite logique est **cohérence données vs graphe persisté** et **signal utilisateur**, pas nouvelle intégration Notion.

## Latest Tech Information

- S’appuyer sur les structures JSON GDD existantes (objet `Nom` + `sections`) ; pas d’hypothèse sur un schéma Notion différent sans relire `gdd_notion_sync_mapper.py`.

## Project Context Reference

- `_bmad-output/project-context.md` : chemins GDD, interdiction tests sur entités réelles, injection DI, Unity JSON v1.1.0.

## Dev Agent Record

### Agent Model Used

Composer (Cursor agent)

### Debug Log References

_(aucun incident bloquant en dev-story)_

### Completion Notes List

- Empreinte **contenu** GDD : `services/gdd_context_fingerprint.py` + `POST /api/v1/context/gdd-content-fingerprint` ; réponse `context_gdd_content_fingerprint` sur génération / régénération de nœud.
- Staleness UI : `useGddStaleIndicator` + badge **GDD↑** sur `DialogueNode` (`data-testid="gdd-stale-badge"`). Tests Vitest : mock `api/client` + références **stables** pour `gddContextSelectionsSnapshot` (éviter re-run d’effet à chaque render).
- Historique entité : `services/gdd_entity_history.py`, append après sync Notion ; `GET /api/v1/context/gdd-entity-history` ; UI `GddEntityHistoryViewer` dans le panneau contexte (`ContextDetail` / `ContextSelector`).
- Export Unity : champs éditeur (`contextGddContentFingerprint`, etc.) stripés dans `graph_conversion_service`.
- AC3 : comportement attendu (ContextBuilder lit le GDD disque au moment du prompt) — test dédié optionnel si besoin de verrouillage explicite.
- Suivi revue 2026-03-28 : tests isolation + LLM (`test_documents_gdd_isolation.py`) ; `GET gdd-entity-history` → **404** si entité absente du GDD live et sans historique ; `include_snapshots` + diff unifié (`diff_snapshots_json`, `gdd_category_entity_lookup.py`) ; cache TTL empreinte + debounce hook stale ; viewer sélection événement + snapshot/diff ; plafond `_FINGERPRINT_MAX_CONTEXT_TOKENS = 200_000` (empreinte).
- Correctif reload GDD 2026-03-28 : `load_gdd_files()` recrée repository/resolver/linker ; `GddNotionSyncService(after_gdd_disk_mutation=…)` + `reload_context_builder_if_loaded` (ne recharge que si `_context_builder` déjà créé).

### File List

- `core/context/context_builder.py`, `services/gdd_notion_sync_service.py`, `api/container.py`
- `services/gdd_context_fingerprint.py`, `services/gdd_entity_history.py`, `services/gdd_context_refresh.py`
- `services/graph_conversion_service.py`
- `api/schemas/gdd_context_stale.py`, `api/schemas/graph.py`, `api/routers/context.py`, `api/routers/graph.py`
- `frontend/src/api/gddContextStale.ts`, `frontend/src/hooks/useGddStaleIndicator.ts`, `frontend/src/hooks/useGddStaleIndicator.test.tsx`
- `frontend/src/store/slices/generationSlice.ts`, `frontend/src/types/graph.ts`, `frontend/src/schemas/nodeEditorSchema.ts`
- `frontend/src/components/graph/nodes/DialogueNode.tsx`
- `frontend/src/components/context/GddEntityHistoryViewer.tsx`, `GddEntityHistoryViewer.test.tsx`, `ContextDetail.tsx`, `ContextSelector.tsx`, `Dashboard.tsx`
- `tests/test_context_builder.py`, `tests/services/test_gdd_notion_sync_service.py`
- `tests/services/test_gdd_context_fingerprint.py`, `tests/services/test_gdd_entity_history.py`, `tests/services/test_gdd_category_entity_lookup.py`, `tests/api/test_gdd_context_stale.py`, `tests/api/test_documents_gdd_isolation.py`
- `services/gdd_category_entity_lookup.py`

## Change Log

- 2026-03-26 — Code review (AI) : revue adversariale post-implémentation ; statut repassé `in-progress`, follow-ups listés ci-dessous.
- 2026-03-28 — Implémentation follow-ups revue (HIGH/MEDIUM + LOW) : 404 entité, diff unifié, cache empreinte, debounce UI, tests étendus ; statut `review`.
- 2026-03-28 — Code review (BMAD) : finding HIGH `ElementRepository` / reload GDD ; statut `in-progress` + sprint-status synchronisé ; nouveaux follow-ups.
- 2026-03-28 — Correctif option [1] : reload complet chaîne GDD + hook sync ; tests ; statut `review`.
- 2026-03-28 — Clôture revue + epic 3 : story `done`, sprint `3-9` + `epic-3` → `done`.

## Senior Developer Review (AI)

**Revue par :** Amelia (Dev Agent + workflow code-review) pour Marc  
**Date :** 2026-03-26  
**Décision :** **Changes Requested** (constats HIGH/MEDIUM non résolus dans cette session)

### Synthèse git vs File List

- Fichiers modifiés hors liste story (branche « sale ») : `data/notion_cache/metadata.json`, `test_prompt_output.txt` — **INFO** seulement, hors périmètre FR19.
- Périmètre story : la liste Dev Agent Record couvre bien le cœur des changements ; les deux fichiers ci-dessus devraient être exclus du commit ou justifiés.

### Validation AC (implémentation vs critères)

| AC | Verdict | Preuve / commentaire |
|----|---------|----------------------|
| AC1 | **IMPLEMENTED** (partiel côté tests) | `tests/api/test_documents_gdd_isolation.py` garantit stabilité GET document si fichier GDD change ; ne couvre pas explicitement « aucun job LLM » ni ouverture UI. |
| AC2 | **IMPLEMENTED** | `useGddStaleIndicator.ts` + `DialogueNode.tsx` (`gdd-stale-badge`, `title` explicite, non bloquant). |
| AC3 | **PARTIAL** | Comportement attendu (ContextBuilder recharge disque) mais **aucun test** dédié malgré l’AC (« verrouiller par tests »). |
| AC4 | **IMPLEMENTED** (aligné génération/régén) | Fingerprint renvoyé côté API graphe (story + `graph.py`). |
| AC5 | **PARTIAL** | Timeline OK ; `diff_snapshots_json` dans `services/gdd_entity_history.py` est un **stub** (en-têtes / pas de diff utile) ; pas de sélection d’entrée dans le viewer. |

### Review Follow-ups (AI)

- [x] **[AI-Review][HIGH]** Task 1 — sous-tâche 🔴 : élargir les tests ou réduire le libellé de la tâche ; aujourd’hui `test_documents_gdd_isolation` ne vérifie **pas** l’absence d’appel LLM ni le store frontend (`tests/api/test_documents_gdd_isolation.py`).
- [x] **[AI-Review][HIGH]** Task 5 — sous-tâche 🔴 : implémenter **sélection d’un événement** dans `GddEntityHistoryViewer.tsx` avec affichage snapshot / diff (ou ajuster la tâche [x] si le MVP accepte uniquement la liste + `diff_hint` global).
- [x] **[AI-Review][MEDIUM]** AC3 : ajouter un test d’intégration ou unitaire minimal (ex. mock ContextBuilder + une écriture GDD fixture) prouvant que **nouvelle** génération lit le contenu disque à jour.
- [x] **[AI-Review][MEDIUM]** Performance : `postGddContentFingerprint` par nœud avec `load_gdd_files()` — risque de **rafale** sur gros graphes ; envisager debounce, cache serveur court, ou fingerprint par document.
- [x] **[AI-Review][MEDIUM]** `diff_snapshots_json` : fournir un diff lisible (ex. diff lignes clés, ou hash par section) pour honorer l’esprit AC5.
- [x] **[AI-Review][MEDIUM]** Task 4 🔴 : « erreurs typées si entité inconnue » — l’API retourne **200 + events vides** ; trancher produit (404 vs vide) et tester.
- [x] **[AI-Review][LOW]** `useGddStaleIndicator.ts` : `catch` vide — au moins `console.debug` / télémétrie en dev pour diagnostiquer les échecs réseau.
- [x] **[AI-Review][LOW]** Charge : `_FINGERPRINT_MAX_CONTEXT_TOKENS = 999_999` — documenter limite ou plafonner côté API pour éviter pics CPU/mémoire.

### Passe revue adversariale — 2026-03-28 (workflow code-review)

**Revue par :** Assistant BMAD (code-review) pour Marc  
**Décision :** **Changes Requested** — au moins un point **HIGH** structurel non couvert par les tests existants.

**Git :** arbre propre (`git status` vide) ; pas d’écart File List vs modifications non commitées dans cette session.

**Points validés (échantillon) :**

- AC1 côté API : `test_documents_gdd_isolation.py` (stabilité document + absence d’appel LLM sur GET document et POST empreinte).
- AC2 UI : badge `GDD↑`, `title` aligné FR19, hook avec debounce + `console.debug` en dev.
- AC4 : `context_gdd_content_fingerprint` branché génération / régénération (`graph.py`, `generationSlice`).
- AC5 : timeline, 404 entité inconnue sans historique, `diff_snapshots_json` unifié, viewer avec sélection d’événement + diff.
- AC3 : `test_gdd_context_fingerprint` + `test_load_gdd_files_twice_refreshes_resolver_after_disk_change` (resolver aligné disque après reload).

**Principale finding (HIGH) — corrigée 2026-03-28 (suite option [1]) :** `load_gdd_files()` recrée désormais `ElementRepository`, `ElementResolver` et `ElementLinker` à chaque chargement ; `GddNotionSyncService` appelle un hook `after_gdd_disk_mutation` → `reload_context_builder_if_loaded` depuis `ServiceContainer` après invalidation cache disque. Test `test_load_gdd_files_twice_refreshes_resolver_after_disk_change` verrouille le resolver sur JSON à jour.

**Autres findings :** charge réseau empreintes, `except Exception` sur POST empreinte, migration `contextGddContentFingerprint` — restent des améliorations optionnelles (voir follow-ups ouverts).

## Story Completion Status

- **Statut** : done
- **Note** : Revue clôturée 2026-03-28 — ACs couverts, correctif reload GDD mergé ; améliorations restantes reportées hors périmètre obligatoire de clôture (voir ci-dessous).

### Review Follow-ups (AI) — suite revue 2026-03-28

- [x] **[AI-Review][HIGH]** Resynchronisation `ElementRepository` / resolver / linker à chaque `load_gdd_files()` ; hook post-sync Notion → `reload_context_builder_if_loaded` (`api/container.py`, `GddNotionSyncService`).
- [x] **[AI-Review][MEDIUM]** Test intégration resolver : `tests/test_context_builder.py::test_load_gdd_files_twice_refreshes_resolver_after_disk_change` ; tests hook `tests/services/test_gdd_notion_sync_service.py`.
- [ ] **[AI-Review][MEDIUM]** *(reporté backlog produit)* — Nœuds / documents sans `contextGddContentFingerprint` : accepter absence d’indicateur stale pour légacy ; backfill optionnel si besoin métier.
- [ ] **[AI-Review][LOW]** *(reporté)* — Rafales `POST /context/gdd-content-fingerprint` sur très gros graphes.
- [ ] **[AI-Review][LOW]** *(reporté)* — Resserrer `except Exception` sur `post_gdd_content_fingerprint`.

### Clôture code review — 2026-03-28

**Revue par :** Marc (validation) / assistant (synthèse)  
**Décision :** **Approuvé — done**  
**Epic 3 :** toutes les stories 3.1–3.11 en `done` ; `epic-3` → `done` dans `sprint-status.yaml`. Rétrospective epic (`epic-3-retrospective`) reste **optional** selon le fichier de suivi.
