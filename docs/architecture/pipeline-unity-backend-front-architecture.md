# Pipeline Unity – Backend / Frontend (synthèse ADR-008)

Document de synthèse pour l’architecture **document canonique Unity JSON** : recommandation consolidée et six décisions associées. Référence détaillée pour l’implémentation.

**Point d’entrée unique :** [ADR-008](../../_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md) dans `v10-architectural-decisions-adrs.md`.

---

## Contexte

Le pipeline actuel (Unity ⇄ Backend Python ⇄ Front React Flow) a évolué avec une SoT en mémoire = nodes/edges (store) et une conversion backend (JSON → graphe au load, graphe → JSON au save). L’objectif est que le **document canonique** soit le **Unity Dialogue JSON** partout ; le backend en est le propriétaire ; le frontend n’envoie plus nodes/edges mais le document ; les identités (choiceId) sont stables.

---

## Modèle de données

- **Document :** Unity Dialogue JSON v1.1.0 avec `schemaVersion` requis, `choices[].choiceId` requis (format libre, stable). `node.id` reste SCREAMING_SNAKE_CASE. Pseudo-nœud END documenté si référencé.
- **Layout :** artefact distinct (ex. `*.layout.json`), même règles de revision/concurrence que le document.

---

## Six décisions associées (hypothèses validées)

1. **Backend = propriétaire du document** (source canonique, revision, conflits).
2. **Layout = partagé par document**, persisté backend, même concurrence.
3. **`schemaVersion` dans le JSON** ; sémantique partagée frontend/backend/Unity.
4. **Unity ne perd aucun champ** (même format strict, DTO alignés).
5. **Refus document sans `choiceId`** conditionné par `schemaVersion >= 1.1.0` ; migration one-shot puis format courant uniquement.
6. **Cible perf :** plusieurs milliers de nœuds ; tests avec borne confort/stress et règles métier (4 choix cinéma, 8+ hors cinéma).

---

## Backend

- Valide et normalise le document sans casser `choiceId`, ordre des `choices[]`, `node.id`. Ne reconstruit plus un document à partir d’un graphe UI.
- Endpoints (cible P0) : GET /documents/{path|id} → { document, schemaVersion, revision } ; PUT /documents/{path|id} avec payload { document, revision } → { revision, validationReport }. Conflit → 409 + dernier état.

---

## Frontend

- SoT contenu = `document` (Unity JSON) ; SoT layout = `layout`. Nodes/edges = projection dérivée uniquement.
- Identités UI stables : node id = `node.id` ; choice handle = `choice:${choiceId}` ; edge ids basés sur la sortie (ex. `e:${nodeId}:choice:${choiceId}:target`), jamais sur la destination seule.
- Saisie : form local + debounce/throttle/blur inchangé ; la projection ne doit pas provoquer de reset du panel.

---

## Unity

- DTO étendus pour inclure `choiceId` (et tout champ requis) ; sérialisation/normalisation préservent ces champs (pas de perte JsonUtility).

---

## Validation

- **Draft** (non bloquant) : autosave autorisé.
- **Export** (bloquant) : utilise la règle « refus sans choiceId » pour schemaVersion >= 1.1.0 ; erreurs structurées (code, message, path). Voir `api/utils/unity_schema_validator.py` et `validate_unity_json_structured()`.

---

## Références

- **ADR-008 :** `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md`
- **Objectifs / contraintes :** `_bmad-output/planning-artifacts/epics/objectifs-contraintes-implementation-adr-008.md`
- **Validation et mise en place :** [validation-et-mise-en-place-decisions.md](validation-et-mise-en-place-decisions.md)
- **Schéma JSON :** [../resources/dialogue-format.schema.json](../resources/dialogue-format.schema.json) (v1.1.0)
