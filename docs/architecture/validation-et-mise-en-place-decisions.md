# Validation et mise en place des décisions ADR-008

Document de suivi pour la validation et la mise en place de l'architecture **document canonique Unity JSON** (ADR-008).

**Référence principale :** [ADR-008](../../_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md) dans `v10-architectural-decisions-adrs.md`.

---

## Objectif

Valider que l'implémentation de l'ADR-008 respecte les six décisions associées et les contraintes définies dans `objectifs-contraintes-implementation-adr-008.md`.

---

## Six décisions associées (hypothèses validées)

| # | Décision | Status | Notes |
|---|----------|--------|-------|
| 1 | Backend = propriétaire du document (source canonique, revision, conflits) | 🟡 En cours | Story 16.2 (GET/PUT document, revision, 409) |
| 2 | Layout = partagé par document, persisté backend, même concurrence | 🟡 En cours | Story 16.3 (layout sidecar) |
| 3 | `schemaVersion` dans le JSON ; sémantique partagée frontend/backend/Unity | ✅ Fait | Story 16.1 (schéma v1.1.0) |
| 4 | Unity ne perd aucun champ (même format strict, DTO alignés) | 🔴 À faire | Story 16.2+ (Unity mis à jour après DG) |
| 5 | Refus document sans `choiceId` conditionné par `schemaVersion >= 1.1.0` ; migration one-shot puis format courant uniquement | ✅ Fait | Story 16.1 (validation) + 16.5 (migration) |
| 6 | Cible perf : plusieurs milliers de nœuds ; tests avec borne confort/stress et règles métier (4 choix cinéma, 8+ hors cinéma) | 🔴 À faire | Story 16.6 (tests perf) |

---

## Checklist de validation (par story)

### Story 16.1: Schéma JSON v1.1.0 et choiceId (Fondations)

- [x] Schéma v1.1.0 : racine objet, `schemaVersion` requis, `choices[].choiceId` requis
- [x] Validateur : `validate_unity_json()` et `validate_unity_json_structured()` avec erreurs structurées
- [x] Tests unitaires : structure schéma, document valide/invalide, refus sans choiceId
- [x] Tests non-régression : `test_frontend_backend_validation.py` (9 tests passent)
- [x] Doc architecture : `pipeline-unity-backend-front-architecture.md` créé

**Status:** ✅ **Complété** (Story 16.1)

---

### Story 16.2: Backend document – GET/PUT, revision, 409

- [ ] Endpoints GET /documents/{id}, PUT /documents/{id}
- [ ] Payload : `{ document, revision }` → `{ revision, validationReport }`
- [ ] Conflit : 409 + dernier état
- [ ] Refus payload nodes/edges (ancien contrat)
- [ ] Validation draft vs export (non bloquant vs bloquant)
- [ ] Tests : GET/PUT, 409, validationReport structuré

**Status:** 🔴 **À faire**

---

### Story 16.3: Backend layout – sidecar, même concurrence

- [ ] Persistance layout (sidecar ou équivalent)
- [ ] Même mécanisme revision/concurrence que le document
- [ ] Tests : GET/PUT layout, 409 sur conflit

**Status:** 🔴 **À faire**

---

### Story 16.4: Frontend SoT document + layout, projection, IDs stables

- [ ] Store : SoT = document + layout ; nodes/edges = projection dérivée
- [ ] Identités UI stables : node id = `node.id`, choice handle = `choice:${choiceId}`, edge ids basés sur sortie
- [ ] Save : envoyer document (+ layout) uniquement, pas nodes/edges
- [ ] Projection : pas de reset panel lors édition
- [ ] Tests : projection IDs stables, save document, édition sans perte

**Status:** 🔴 **À faire**

---

### Story 16.5: Migration choiceId, tolérance minimale, refus sans choiceId

- [ ] Outil one-shot : ajout choiceId à tous les choices
- [ ] Idempotence : choiceId existants non modifiés
- [ ] Tolérance minimale : migration uniquement, pas en production
- [ ] Refus strict : schemaVersion >= 1.1.0 sans choiceId → erreur
- [ ] Tests : idempotence, refus strict hors migration

**Status:** 🔴 **À faire**

---

### Story 16.6: Tests golden, E2E, perf, non-régression

- [ ] Golden : projection document → nodes/edges, IDs stables, edgeIds stables
- [ ] E2E : édition line/speaker/choice, connect/disconnect, dupliquer, reload layout
- [ ] Concurrence : deux PUT concurrent, un 200 un 409
- [ ] Migration : idempotence outil one-shot
- [ ] Perf : cible confort + borne stress (milliers de nœuds, 4/8 choices), p95 load/drag/frappe
- [ ] Non-régression : batterie existante (API, E2E, front)

**Status:** 🔴 **À faire**

---

## Conformité ADR-008

### Contraintes respectées (Story 16.1)

- ✅ Document canonique : Unity Dialogue JSON v1.1.0
- ✅ `schemaVersion` requis, `choices[].choiceId` requis
- ✅ `node.id` en SCREAMING_SNAKE_CASE
- ✅ Pseudo-nœud END documenté
- ✅ Validation : erreurs structurées (code, message, path)
- ✅ Pas de rétrocompatibilité v1.0 (supprimée en code review)

### Contraintes à valider (Stories 16.2+)

- 🔴 Backend propriétaire : GET/PUT document, revision, 409
- 🔴 Frontend : SoT = document, pas nodes/edges au save
- 🔴 Layout : sidecar, même concurrence
- 🔴 Migration : outil one-shot, tolérance minimale
- 🔴 Perf : tests borne confort/stress

---

## Références

- **ADR-008 :** `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md`
- **Objectifs / contraintes :** `_bmad-output/planning-artifacts/epics/objectifs-contraintes-implementation-adr-008.md`
- **Epic 16 :** `_bmad-output/planning-artifacts/epics/epic-16.md`
- **Schéma JSON :** `docs/resources/dialogue-format.schema.json` (v1.1.0)
- **Validateur :** `api/utils/unity_schema_validator.py`
- **Tests :** `tests/api/utils/test_unity_schema_validator.py`, `tests/integration/test_frontend_backend_validation.py`
