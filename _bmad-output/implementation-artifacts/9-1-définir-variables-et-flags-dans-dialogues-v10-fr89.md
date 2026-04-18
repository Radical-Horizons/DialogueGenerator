# Story 9.1: Définir variables et flags dans dialogues (V1.0+) (FR89)

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur créant des dialogues**,
I want **définir des variables et flags dans mes dialogues**,
So that **je peux créer des branches conditionnelles qui réagissent à l'état du jeu et aux choix du joueur**.

## Acceptance Criteria

1. **Given** j'ai un dialogue ouvert dans l'éditeur **When** j'ouvre « Variables et flags » dans le panneau de configuration **Then** je vois le catalogue de flags filtrable (type / portée / recherche) **And** les flags sélectionnés sont associés au dialogue courant (document).
2. **Given** un flag `bool` **When** je le sélectionne **Then** je peux fixer la valeur initiale true/false **And** il est persisté avec le dialogue.
3. **Given** un flag `compteur` **When** je le sélectionne **Then** les bornes Min/Max du catalogue sont affichées (lecture seule) **And** la valeur initiale est dans les bornes **And** persistance avec le dialogue.
4. **Given** un flag `enum` **When** je le sélectionne **Then** les valeurs ordonnées et la valeur par défaut du catalogue sont visibles **And** je choisis une valeur initiale parmi les valeurs prédéfinies **And** persistance avec le dialogue.
5. **Given** plusieurs flags **When** je sauvegarde **Then** tout est persisté **And** une alerte **non bloquante** s'affiche si seuils GDD dépassés (~10 flags « conversationnels » / ~3 compteurs — repères maintenabilité).
6. **Given** un dialogue existant **When** j'ouvre « Variables et flags » **Then** les liaisons et valeurs initiales sont rechargées **And** je peux modifier ou retirer des flags.

## Tasks / Subtasks

- [x] Task 1 : Persistance des liaisons flag ↔ dialogue — CRUD côté API et stockage dans le document canonique (AC: #2–#6)
  - [x] 🔴 Test échoue : GET document sans flags → réponse stable ; PUT avec entrées `{ flagId, type, initialValue }` valides → GET renvoie les mêmes entrées ; validation rejette hors bornes / type incohérent.
  - [x] 🟢 Implémenter persistance et validation côté service + routes sous le contrat documents (voir Dev Notes).
  - [x] 🔵 Refactor : extraire la validation typée (bool / compteur clampé / enum ∈ valeurs catalogue) dans un module testable séparé du router pour éviter la duplication entre POST/PUT et garder les handlers ≤ ~30 lignes si le router grossit.

- [x] Task 2 : Catalogue — filtres type et « portée » alignés GDD (AC: #1)
  - [x] 🔴 Test échoue : liste catalogue exposée au panel applique filtres type (`bool` | `compteur` | `enum`) et portée (mapping depuis métadonnées catalogue — voir Dev Notes) sans casser la recherche textuelle existante.
  - [x] 🟢 Implémenter extension du pipeline catalogue / API de liste (réutiliser `FlagCatalogService` et clients existants — voir Dev Notes).
  - [x] 🔵 Refactor : si la logique de filtre duplique des structures entre frontend et backend, centraliser les constantes de type et les labels de portée dans un petit module partagé ou schéma unique pour éviter deux définitions divergentes.

- [x] Task 3 : UI « Variables et flags » — sélection, valeurs initiales, réutilisation modale (AC: #1–#6)
  - [x] 🔴 Test échoue : ouverture du panneau → chargement des flags du document ; changement de valeur initiale → état local cohérent ; sauvegarde déclenche PUT document incluant les flags ; alerte non bloquante visible quand seuils dépassés (assertion RTL sur message / role, pas sur détails d'implémentation).
  - [x] 🟢 Implémenter `DialogueFlagsPanel` (ou équivalent) branché sur le store graphe / flux documents — intégration avec patterns existants `InGameFlagsModal` / `flagsStore` (voir Dev Notes).
  - [x] 🔵 Refactor : découper tout nouveau code hors de `InGameFlagsModal.tsx` (fichier >500 lignes) — composants enfants ou hooks dédiés pour limiter la croissance du fichier si réutilisation transverse.

- [x] Task 4 : Alertes maintenabilité GDD (AC: #5)
  - [x] 🔴 Test échoue : jeu de flags factice > seuils → warning affiché ; en dessous → pas de warning ; sauvegarde toujours possible.
  - [x] 🟢 Implémenter calcul seuils et présentation UX non bloquante (toast ou bannière).
  - [x] 🔵 Refactor : isoler seuils (`MAX_CONVERSATIONAL_FLAGS`, `MAX_COUNTERS`) dans une constante exportée pour tests unitaires directs et documentation unique.

## Dev Notes

- **Garde-fous architecture** : logique métier dans `services/` ; routers minces ; injection via `api/container.py` / `Depends`. Documents canoniques : `/api/v1/documents/{document_id}` — ne pas reconstruire le document depuis le graphe seul ; toute donnée dialogue doit suivre le flux GET/PUT document · révision · `validate_unity_json_structured` où applicable. Voir `_bmad-output/project-context.md` (documents vs graphe).
- **Écart epic vs code (critique)** : l'epic mentionne « catalogue Notion (343 flags) » ; **l’implémentation actuelle** lit `data/UnityData/FlagCatalog.csv` via `FlagCatalogService` et expose `/api/v1/mechanics/flags`. La story **étend** ce pipeline (colonnes Scope, MinValue, MaxValue, EnumValues ; champs enrichis `semanticType` / `scope`). Pas de second catalogue silencieux.
- **Réutiliser** : `services/flag_catalog_service.py`, `api/routers/mechanics_flags.py`, `frontend/src/store/flagsStore.ts`, `frontend/src/api/flags.ts`, `InGameFlagsModal.tsx` / `InGameFlagsSummary.tsx` — le panel dialogue est un composant séparé (`DialogueFlagsPanel`) pour ne pas alourdir la modale génération.
- **Contrat persistance** : clé racine document `dialogueFlags`: `[{ flagId, type: bool|compteur|enum, initialValue }]`. Schéma JSON document : `docs/resources/dialogue-format.schema.json` (propriété optionnelle `dialogueFlags`).
- **Qualité / tests** : pytest miroir services et routes ; Vitest RTL pour panel ; pas de données GDD réelles dans les tests ; mocker LLM/I/O comme d’habitude.
- **Refactor bar** : défauts dev-story (~300 lignes par fichier touché par tâche, fonctions ~60 lignes) sauf exception nommée ici.
- **Fichiers chauds** : `InGameFlagsModal.tsx` non modifié pour cette story ; nouveau `DialogueFlagsPanel.tsx`.
- **Conventions** : types TS alignés `frontend/src/types/api.ts` / `flags.ts` ; schémas Pydantic dans `api/schemas/`.

### Project Structure Notes

- Point d’entrée UI : `GenerationPanel` → section « Variables et flags » avant « Flags In-Game » (génération LLM).
- Nommage flags : IDs stables catalogue (`Id` CSV).

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-09.md` — Story 9.1, contraintes GDD flags bool/compteur/enum]
- [Source: `_bmad-output/project-context.md` — stack, documents canoniques, tests]
- [Source: `services/flag_catalog_service.py`, `api/routers/mechanics_flags.py` — catalogue flags actuel]

## Technical Requirements

- Backend : `DialogueFlagsService` + module `dialogue_flag_validation.py` ; validation sur PUT document ; réponse `flagThresholdWarnings`.
- Types supportés : `bool`, `compteur` (min/max catalogue), `enum` (valeurs ordonnées).
- Frontend : panel configuration intégré au workflow graphe ; store `dialogueFlagBindings` + persistance via `saveDialogue` → `dialogueFlags` dans le JSON document.

## Architecture Compliance

- Respect FastAPI (`api/routers/`, `api/schemas/`), services métier, pas de singletons hors container pour le nouveau service (fabrique `get_dialogue_flags_service`).

## Library / Framework Requirements

- FastAPI, Pydantic v2, React 18, Zustand — versions dans `project-context.md`. Pas de nouvelle dépendance majeure.

## File Structure Requirements

- Nouveau code : `services/dialogue_flag_*.py`, `services/dialogue_flags_service.py`, `frontend/src/components/generation/DialogueFlagsPanel.tsx`, `frontend/src/store/slices/dialogueFlagsSlice.ts`, tests miroir.

## Testing Requirements

- Unit : validation des valeurs initiales par type ; compteur clampé ; enum ∈ ensemble autorisé.
- Integration : PUT document + persistance (`tests/api/test_documents_dialogue_flags.py`).
- Frontend : RTL (`DialogueFlagsPanel.test.tsx`).

## Previous Story Intelligence

- Première story Epic 9 — réutilisation patterns documents Story 16.x.

## Git Intelligence Summary

- Epic 9 ouvre le chantier variables/flags ; CSV Unity enrichi et schéma dialogue étendu.

## Latest Tech Information

- Inchangé.

## Project Context Reference

- `_bmad-output/project-context.md`.

## Story Completion Status

- **review** — Implémentation complète ; tests exécutés (voir Dev Agent Record).

---

## Dev Agent Record

### Agent Model Used

Composer / Amelia (Dev Story workflow)

### Debug Log References

- Pytest : `tests/services/test_dialogue_flag_validation.py`, `tests/api/test_documents_dialogue_flags.py`, `tests/api/test_mechanics_flags.py` (asserts mock mis à jour pour nouveaux paramètres `search`).
- Vitest : `frontend/src/components/generation/DialogueFlagsPanel.test.tsx`

### Completion Notes List

- Champ document `dialogueFlags` validé au PUT ; réponse `flagThresholdWarnings` ; CSV `FlagCatalog.csv` colonnes Scope, MinValue, MaxValue, EnumValues ; ligne exemple enum `MISSION_BRANCH`.
- 🔵 Refactor Task 1 : validation extraite dans `services/dialogue_flag_validation.py` (aucune logique dupliquée dans le router).
- 🔵 Refactor Task 2 : constantes filtres FR89 dans `frontend/src/constants/flagCatalogSemantics.ts` (types/portées alignées API).
- 🔵 Refactor Task 3 : UI isolée dans `DialogueFlagsPanel.tsx` + slice `dialogueFlagsSlice.ts` (pas d’extension de `InGameFlagsModal.tsx`).
- 🔵 Refactor Task 4 : seuils Python `services/dialogue_flag_thresholds.py` / TS `frontend/src/constants/dialogueFlagThresholds.ts`.

### File List

- `services/dialogue_flag_thresholds.py`
- `services/dialogue_flag_validation.py`
- `services/dialogue_flags_service.py`
- `services/flag_catalog_service.py`
- `api/schemas/documents.py`
- `api/schemas/flags.py`
- `api/dependencies.py`
- `api/routers/documents.py`
- `api/routers/mechanics_flags.py`
- `data/UnityData/FlagCatalog.csv`
- `docs/resources/dialogue-format.schema.json`
- `tests/services/test_dialogue_flag_validation.py`
- `tests/api/test_documents_dialogue_flags.py`
- `tests/api/test_mechanics_flags.py`
- `frontend/src/constants/dialogueFlagThresholds.ts`
- `frontend/src/constants/flagCatalogSemantics.ts`
- `frontend/src/types/dialogueFlags.ts`
- `frontend/src/types/flags.ts`
- `frontend/src/types/documents.ts`
- `frontend/src/utils/dialogueFlagBindings.ts`
- `frontend/src/utils/dialogueFlagThresholdWarnings.ts`
- `frontend/src/api/flags.ts`
- `frontend/src/store/graphStore.ts`
- `frontend/src/store/types/graphState.ts`
- `frontend/src/store/slices/dialogueFlagsSlice.ts`
- `frontend/src/store/slices/persistenceSlice.ts`
- `frontend/src/components/generation/DialogueFlagsPanel.tsx`
- `frontend/src/components/generation/DialogueFlagsPanel.test.tsx`
- `frontend/src/components/generation/GenerationPanel.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Change Log

- 2026-04-18 — Story 9.1 : persistance `dialogueFlags`, catalogue enrichi + filtres API, UI Variables et flags, seuils GDD, tests pytest/Vitest.
