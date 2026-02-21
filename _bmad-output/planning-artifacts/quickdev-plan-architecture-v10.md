# Plan Quickdev — Architecture V1.0 (ADRs + State + Graph)

**Références :**
- `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md`
- `docs/architecture/state-management-frontend.md`
- `docs/architecture/graph-conversion-architecture.md`

**Objectif :** Livrer un quickdev focalisé sur un sous-ensemble exécutable en 1 session, aligné sur les ADRs et les docs d’architecture.

---

## 1. Périmètre recommandé (choix quickdev)

Un quickdev doit rester **court** (1–2 ADRs ou une tranche verticale). Options par ordre de priorité :

| Option | ADR / thème | Effort estimé | Impact |
|--------|-------------|--------------|--------|
| **A** | ADR-003 (DisplayName vs stableID) | 1 session | Critique : stabilité graphe, régression évitée |
| **B** | ADR-001 (Modal streaming LLM) | 1–2 sessions | UX critique : feedback pendant génération |
| **C** | ADR-006 Phase 1 (seq + écriture atomique backend) | 1 session | Résilience : pas de fichier tronqué, pas d’écrasement récent |
| **D** | Consolidation Graph (SoT + export canonique) | 0,5 session | Vérifier que tout passe par API `/save` ; pas de `exportToUnity()` pour persistance |

**Recommandation quickdev unique :** **Option A (ADR-003)** — correctif bien délimité, AC et tests déjà décrits dans l’ADR.

---

## 2. Plan détaillé — Option A : ADR-003 (DisplayName vs stableID)

### 2.1 Contexte (résumé)

- **Problème :** `node.id` = `displayName` → mutable, collisions, corruption graphe.
- **Solution :** `node.id` = `stableID` (UUID) ; `displayName` dans `data` pour l’affichage.
- **Alignement :** `docs/architecture/graph-conversion-architecture.md` (SoT = JSON Unity ; projection canonique backend) ; `state-management-frontend.md` (`graphStore`).

### 2.2 Fichiers cibles

- `frontend/src/store/graphStore.ts` — IDs nœuds, sérialisation
- `frontend/src/components/graph/GraphEditor.tsx` — création/édition nœuds, mapping id ↔ stableID
- `frontend/src/components/graph/NodeEditorPanel.tsx` — affichage/édition displayName sans toucher à l’id
- `frontend/src/utils/testNodeSync.ts` — TestNodes : id = stableID
- API/backend : `services/graph_conversion_service.py` — déjà basé sur IDs stables côté Unity ; vérifier cohérence avec `stableID` si exposé

### 2.3 Tâches dans l’ordre

1. **StableID partout côté front**
   - Garantir que tout nœud (dialogue, test, end) a un `stableID` (génération UUID si absent).
   - Dans le store : `nodes` indexés par `stableID` ; `node.id` = `stableID` pour React Flow.
   - `data.displayName` = libellé éditable (sans modifier `id`).

2. **Migration données existantes**
   - Au chargement (JSON Unity → graph) : si un nœud n’a pas de `stableID`, en générer un et le persister côté backend si le format le permet, ou au moins en mémoire/localStorage pour la session.
   - Script ou logique de migration : graphes existants (fichiers déjà ouverts) reçoivent des `stableID` à la première sauvegarde.

3. **Renommage = displayName uniquement**
   - Renommer un dialogue ne change jamais `node.id` ni les edges ; seule `data.displayName` (et champ métier côté Unity si applicable) est mise à jour.
   - Vérifier `ChoiceEditor`, `NodeEditorPanel` : pas d’utilisation de `displayName` comme clé de liaison.

4. **Tests**
   - Unité : génération `stableID` (unicité), mapping node.id ↔ stableID.
   - Intégration : sérialisation/désérialisation graphe (load/save) avec stableID.
   - E2E : renommer un dialogue → connexions et sauvegarde intactes.

### 2.4 Critères d’acceptation (ADR-003)

- [ ] `node.id` utilise `stableID` (UUID) partout dans React Flow.
- [ ] Renommer un dialogue préserve toutes les connexions.
- [ ] Aucun graphe existant corrompu après migration (backward compatibility).
- [ ] Tests de régression pour collisions displayName (deux nœuds même nom ≠ même id).

### 2.5 Contraintes (rappels architecture)

- **graph-conversion-architecture.md :** La SoT métier reste le JSON Unity ; la projection canonique est backend. Le front ne doit pas introduire d’IDs qui cassent la conversion.
- **state-management-frontend.md :** `graphStore` reste la source de vérité en mémoire ; cohérence avec ADR-006 (futur) : pas de draft/save séparé, sync via API.
- **ADR-007 :** Canvas éditeur (GraphCanvas) en mode controlled : nodes/edges depuis le store uniquement. Détails : `_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md`.

---

## 3. Plan détaillé — Option C : ADR-006 Phase 1 (backend seq + atomique)

Si le quickdev choisi est **résilience sauvegarde** (sans encore le journal IndexedDB) :

### 3.1 Périmètre Phase 1

- **Backend uniquement :**  
  - Requête contient `seq` (optionnel en v1).  
  - Serveur garde `last_seq` par document (fichier sidecar ou métadonnées).  
  - Règle : `seq ≤ last_seq` → 200 + ack(last_seq) ; `seq > last_seq` → appliquer, persister, `last_seq = seq`, ack(seq).  
  - Écriture atomique : `file.tmp` → fsync → rename vers `file.json`.

### 3.2 Tâches

1. Ajouter `seq` (optionnel) dans le schéma de la route save (ex. `POST /api/v1/graph/save` ou équivalent).
2. Persister `last_seq` par document (ex. `{filename}.seq` ou dans un sidecar).
3. Implémenter la logique seq / last_seq et l’écriture atomique.
4. Tests : intégration API (seq ignoré si ≤ last_seq ; appliqué si > last_seq ; écriture atomique vérifiée).

### 3.3 Références

- ADR-006 dans `v10-architectural-decisions-adrs.md`.
- `docs/architecture/graph-conversion-architecture.md` (export canonique via API `/save`).

---

## 4. Synthèse

- **Quickdev recommandé (1 session) :** ADR-003 (DisplayName vs stableID) — plan en section 2.
- **Alternative (1 session) :** ADR-006 Phase 1 (seq + atomique backend) — plan en section 3.
- **Vérification transversale :** S’assurer que toute persistance graphe passe par l’API (export canonique), pas par `graphStore.exportToUnity()` seul, conformément à `graph-conversion-architecture.md`.

**Utilisation :** Ce document peut servir de **tech-spec** pour le workflow quick-dev (`_bmad/bmm/workflows/bmad-quick-flow/quick-dev/workflow.md`) en choisissant l’option A ou C, ou de **sprint plan** pour une session Dev Story.
