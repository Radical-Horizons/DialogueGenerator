# Story 9.1: Définir variables et flags dans dialogues (V1.0+) (FR89)

Status: ready-for-dev

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
7. **Références uniquement (ADR-010)** : le document dialogue persiste des **identifiants de flags stables** et les **valeurs initiales** par flag ; les définitions complètes (type, bornes, valeurs enum, libellés, portée) viennent **uniquement** de la couche catalogue résolue à l’exécution — **pas** de copie du catalogue dans le JSON dialogue.

## Tasks / Subtasks

- [ ] Task 1 : Persistance des liaisons flag ↔ dialogue — CRUD côté API et stockage dans le document canonique (AC: #2–#7)
  - [ ] 🔴 Test échoue : GET document sans flags → réponse stable ; PUT avec entrées **références** `{ flagId, initialValue }` (+ type si requis pour migration seulement, voir ADR-010) valides → GET renvoie les mêmes entrées ; **pas** de dump catalogue dans le document ; validation rejette hors bornes / type incohérent **par rapport aux définitions résolues du catalogue**.
  - [ ] 🟢 Implémenter persistance et validation côté service + routes sous le contrat documents (voir Dev Notes).
  - [ ] 🔵 Refactor : extraire la validation typée (bool / compteur clampé / enum ∈ valeurs catalogue) dans un module testable séparé du router pour éviter la duplication entre POST/PUT et garder les handlers ≤ ~30 lignes si le router grossit.

- [ ] Task 2 : Catalogue — filtres type et « portée » alignés GDD (AC: #1)
  - [ ] 🔴 Test échoue : liste catalogue exposée au panel applique filtres type (`bool` | `compteur` | `enum`) et portée (mapping depuis métadonnées catalogue — voir Dev Notes) sans casser la recherche textuelle existante.
  - [ ] 🟢 Implémenter extension du pipeline catalogue / API de liste (réutiliser `FlagCatalogService` et clients existants — voir Dev Notes).
  - [ ] 🔵 Refactor : si la logique de filtre duplique des structures entre frontend et backend, centraliser les constantes de type et les labels de portée dans un petit module partagé ou schéma unique pour éviter deux définitions divergentes.

- [ ] Task 3 : UI « Variables et flags » — sélection, valeurs initiales, réutilisation modale (AC: #1–#6)
  - [ ] 🔴 Test échoue : ouverture du panneau → chargement des flags du document ; changement de valeur initiale → état local cohérent ; sauvegarde déclenche PUT document incluant les flags ; alerte non bloquante visible quand seuils dépassés (assertion RTL sur message / role, pas sur détails d'implémentation).
  - [ ] 🟢 Implémenter `DialogueFlagsPanel` (ou équivalent) branché sur le store graphe / flux documents — intégration avec patterns existants `InGameFlagsModal` / `flagsStore` (voir Dev Notes).
  - [ ] 🔵 Refactor : découper tout nouveau code hors de `InGameFlagsModal.tsx` (fichier >500 lignes) — composants enfants ou hooks dédiés pour limiter la croissance du fichier si réutilisation transverse.

- [ ] Task 4 : Alertes maintenabilité GDD (AC: #5)
  - [ ] 🔴 Test échoue : jeu de flags factice > seuils → warning affiché ; en dessous → pas de warning ; sauvegarde toujours possible.
  - [ ] 🟢 Implémenter calcul seuils et présentation UX non bloquante (toast ou bannière).
  - [ ] 🔵 Refactor : isoler seuils (`MAX_CONVERSATIONAL_FLAGS`, `MAX_COUNTERS`) dans une constante exportée pour tests unitaires directs et documentation unique.

## Dev Notes

- **ADR-010 (obligatoire)** : `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md` — **ADR-010** — catalogue = source interchangeable (CSV aujourd’hui, Notion demain) ; le dialogue ne stocke que **ids + valeurs initiales**. Toute implémentation qui dupliquerait les définitions dans le document est **hors scope**.
- **Garde-fous architecture** : logique métier dans `services/` ; routers minces ; injection via `api/container.py` / `Depends`. Documents canoniques : `/api/v1/documents/{document_id}` — ne pas reconstruire le document depuis le graphe seul ; toute donnée dialogue doit suivre le flux GET/PUT document · révision · `validate_unity_json_structured` où applicable. Voir `_bmad-output/project-context.md` (documents vs graphe).
- **Écart epic vs code (critique)** : l'epic mentionne « catalogue Notion (343 flags) » ; **l’implémentation actuelle** lit `data/UnityData/FlagCatalog.csv` via `FlagCatalogService` et expose `/api/v1/mechanics/flags`. La story **doit** soit étendre ce pipeline (colonnes type/portée/valeurs enum si absentes), soit documenter une synchro Notion→CSV — **sans** inventer un second catalogue silencieux. Trancher explicitement dans les notes de PR si nouvelle source.
- **Réutiliser** : `services/flag_catalog_service.py`, `api/routers/mechanics_flags.py`, `frontend/src/store/flagsStore.ts`, `frontend/src/api/flags.ts`, `InGameFlagsModal.tsx` / `InGameFlagsSummary.tsx` pour UX de sélection — le panel dialogue peut composer ou extraire des sous-composants plutôt que dupliquer.
- **Contrat persistance** : définir un champ clair dans le blob document (ex. clé racine sœur de `schemaVersion` / `nodes`, ou objet `metadata` **documenté**) compatible avec l’export Unity — si l’export_strip les clés inconnues, le préciser et ajouter tests d’export non régression.
- **Qualité / tests** : pytest miroir pour services et routes ; Vitest RTL pour panel ; pas de données GDD réelles dans les tests ; mocker LLM/I/O comme d’habitude.
- **Refactor bar** : défauts dev-story (~300 lignes par fichier touché par tâche, fonctions ~60 lignes) sauf exception nommée ici.
- **Fichiers chauds** : `frontend/src/components/generation/InGameFlagsModal.tsx` (**678** lignes) — **ne pas** empiler toute la feature dedans ; préférer enfants / hooks dédiés. `api/routers/mechanics_flags.py` (**351** lignes) — nouvelles routes préférables dans un router dédié `documents`/`dialogue-flags` si évite d’aggraver le fichier.
- **Conventions** : types TS alignés `frontend/src/types/api.ts` ; schémas Pydantic dans `api/schemas/`.

### Project Structure Notes

- Point d’entrée UI probable : éditeur graphe / barre latérale configuration dialogue — suivre `graphViewStore` pour orchestration (pas d’événements `window`).
- Nommage flags : alignement futur avec stories 9.2–9.5 ; IDs stables depuis catalogue (`Id` CSV).

### References

- [Source: `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md` — **ADR-010** — références dialogue vs catalogue]
- [Source: `_bmad-output/planning-artifacts/epics/epic-09.md` — Story 9.1, contraintes GDD flags bool/compteur/enum]
- [Source: `_bmad-output/project-context.md` — stack, documents canoniques, tests]
- [Source: `services/flag_catalog_service.py`, `api/routers/mechanics_flags.py` — catalogue flags actuel]

## Technical Requirements

- Backend : service dédié (nom epic : `DialogueFlagsService`) pour valider et lire/écrire les liaisons flags ↔ document ; endpoints cohérents avec le modèle documents (privilégier `/api/v1/documents/{id}/…` plutôt que `/dialogues/{id}` si non existant).
- Types supportés : `bool`, `compteur` (min/max catalogue), `enum` (valeurs ordonnées).
- Frontend : panel configuration intégré au workflow graphe ; réutilisation patterns `InGameFlagsModal` / store flags.
- Performance : NFR-P3 (`<200ms` pour opérations simples sur document — viser même ordre de grandeur pour GET/PUT flags).

## Architecture Compliance

- Respect FastAPI (`api/routers/`, `api/schemas/`), services métier, pas de singletons hors container.
- Unity JSON v1.1.0 : ne pas casser `choiceId` / ordre des choix lors des évolutions du document.

## Library / Framework Requirements

- FastAPI, Pydantic v2, React 18, Zustand — versions dans `project-context.md`. Pas de nouvelle dépendance majeure sans justification dans la PR.

## File Structure Requirements

- Nouveau code : `services/` pour règles métier flags-dialogue ; `api/routers/` pour routes ; `api/schemas/` pour contrats ; `frontend/src/components/` pour UI ; tests miroir sous `tests/` et `frontend/src/__tests__/` selon conventions repo.

## Testing Requirements

- Unit : validation des valeurs initiales par type ; compteur clampé ; enum ∈ ensemble autorisé.
- Integration : routes + persistance fichier document (tmp_path).
- Frontend : RTL sur panel et alertes ; pas de snapshot fragile.
- E2E : optionnel pour cette story si coût élevé — au minimum smoke manuel documenté ; sinon un scénario Playwright ciblé « ouvrir panel → sauver → recharger ».

## Previous Story Intelligence

- Première story de l’Epic 9 — pas de story précédente dans le même epic. Les epics 1–4 et 16 ont établi documents révisionnés, graphe contrôlé, schéma Unity : réutiliser les patterns de sauvegarde document existants.

## Git Intelligence Summary

- Commits récents : enrichissement epics/GDD (`docs(epics)`, `chore(gdd)`), correctifs Notion sync / export — pas de travail flags-dialogue récent ; cette story ouvre le chantier technique sur le même dépôt.

## Latest Tech Information

- Stack figée dans `project-context.md` (FastAPI 0.104+, React 18.2, Vite 4.4). Vérifier `requirements.txt` / `frontend/package.json` avant d’ajouter une dépendance.

## Project Context Reference

- `_bmad-output/project-context.md` — règles d’implémentation obligatoires pour agents (ConfigurationService, containers, tests, Unity JSON).

## Story Completion Status

- **ready-for-dev** — Contexte BMAD préparé pour implémentation ; validation checklist optionnelle avant dev-story.

---

## Dev Agent Record

### Agent Model Used

_(À compléter par l’agent dev)_

### Debug Log References

### Completion Notes List

### File List
