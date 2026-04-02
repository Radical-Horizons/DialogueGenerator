---
stepsCompleted: ['step-01-load-context', 'step-02-discover-tests', 'step-03-map-criteria', 'step-04-analyze-gaps', 'step-05-gate-decision']
lastStep: 'step-05-gate-decision'
lastSaved: '2026-03-07'
workflowType: 'testarch-trace'
gate_type: epic
scope: Epic-2
inputDocuments:
  - _bmad-output/planning-artifacts/epics/epic-02.md
  - _bmad/tea/testarch/knowledge/test-priorities-matrix (ref)
  - _bmad/tea/testarch/knowledge/test-quality.md (ref)
---

# Matrice de traçabilité et décision de gate — Epic 2

**Story / Epic :** Epic-2 — Éditeur de graphe de dialogues  
**Date :** 2026-03-07  
**Évaluateur :** Marc (TEA Agent)

---

## ⚠️ Portée réelle de ce document

**L’Epic 2 n’est pas terminée.** Elle couvre les stories 2.1 à 2.14 (visualisation, navigation, zoom, pan, drag-and-drop, recherche, filtres, sélection multiple, etc.). Une grande partie de ce périmètre est encore à faire ou en cours.

**Ce qui a été tracé ici**, c’est uniquement la **partie déjà implémentée et testée** : les **5 endpoints backend** du graphe (`load`, `save`, `save-and-write`, `validate`, `calculate-layout`). Ces endpoints existent dans le code et sont couverts par `test_graph_crud.py`.

En résumé :
- **« 100 % de couverture »** = 100 % des **exigences tracées**, i.e. ces 5 endpoints. Pas 100 % de l’Epic 2.
- **« Gate PASS »** = la partie **déjà livrée** (l’API graphe) respecte les critères de gate. Ça ne signifie pas que l’Epic 2 est done.

Quand l’Epic 2 sera complète (stories 2.1–2.14 livrées), il faudra **refaire une trace** sur le périmètre complet (AC de chaque story) pour avoir une vraie matrice Epic 2 et une décision de gate sur l’ensemble.

---

*Ce workflow ne génère pas de tests. En cas de lacunes, exécuter `*atdd` ou `*automate` pour créer la couverture.*

## PHASE 1 : TRACEABILITY

### Résumé de couverture

| Priorité | Critères totaux | Couverture FULL | % couverture | Statut   |
|----------|-----------------|-----------------|--------------|----------|
| P0       | 3               | 3               | 100%         | ✅ PASS  |
| P1       | 2               | 2               | 100%         | ✅ PASS  |
| P2       | 0               | 0               | —            | —        |
| P3       | 0               | 0               | —            | —        |
| **Total** | **5**          | **5**           | **100%**     | ✅ PASS  |

**Légende :** ✅ PASS = seuil respecté | ⚠️ WARN = sous le seuil | ❌ FAIL = bloquant

**Périmètre tracé :** Uniquement la **partie déjà implémentée** de l’Epic 2 — les 5 endpoints backend graphe (`load`, `save`, `save-and-write`, `validate`, `calculate-layout`). Les critères d’acceptation des stories 2.1–2.14 (UI, navigation, zoom, etc.) ne sont pas inclus : l’epic n’est pas done, donc on ne trace que ce qui existe et est testé.

---

### Cartographie détaillée

#### AC-GRAPH-1 : Charge un graphe depuis Unity JSON (P0)

- **Couverture :** FULL ✅
- **Tests :**
  - `TestGraphLoad::test_load_graph_success` — tests/api/test_graph_crud.py
  - `TestGraphLoad::test_load_graph_invalid_json` — tests/api/test_graph_crud.py
  - `TestGraphLoad::test_load_graph_empty_json` — tests/api/test_graph_crud.py
- **Recommandation :** Aucune. Couverture API complète (succès, JSON invalide, tableau vide).

#### AC-GRAPH-2 : Sauvegarde un graphe en Unity JSON (P0)

- **Couverture :** FULL ✅
- **Tests :**
  - `TestGraphSave::test_save_graph_success` — tests/api/test_graph_crud.py
  - `TestGraphSave::test_save_graph_invalid_structure` — tests/api/test_graph_crud.py
- **Recommandation :** Aucune.

#### AC-GRAPH-3 : Sauvegarde et écriture fichier (save-and-write) (P0)

- **Couverture :** FULL ✅
- **Tests :**
  - `TestGraphSaveAndWrite::test_save_and_write_success` — tests/api/test_graph_crud.py
  - `TestGraphSaveAndWrite::test_save_and_write_path_not_configured` — tests/api/test_graph_crud.py
  - `TestGraphSaveAndWrite::test_save_and_write_with_seq_returns_ack` — tests/api/test_graph_crud.py
  - `TestGraphSaveAndWrite::test_save_and_write_seq_le_last_seq_skips_write` — tests/api/test_graph_crud.py
- **Recommandation :** Aucune. ADR-006 (seq/last_seq) couvert.

#### AC-GRAPH-4 : Valide un graphe (P1)

- **Couverture :** FULL ✅
- **Tests :**
  - `TestGraphValidate::test_validate_graph_valid` — tests/api/test_graph_crud.py
  - `TestGraphValidate::test_validate_graph_orphan_node` — tests/api/test_graph_crud.py
  - `TestGraphValidate::test_validate_graph_cycle` — tests/api/test_graph_crud.py
- **Recommandation :** Aucune.

#### AC-GRAPH-5 : Calcule un layout (P1)

- **Couverture :** FULL ✅
- **Tests :**
  - `TestGraphCalculateLayout::test_calculate_layout_success` — tests/api/test_graph_crud.py
- **Recommandation :** Aucune.

---

### Analyse des lacunes

#### Lacunes critiques (BLOCKER) ❌

0 lacune. Les critères P0 backend graphe sont tous couverts.

#### Lacunes haute priorité (PR BLOCKER) ⚠️

0 lacune. Les critères P1 (validate, calculate-layout) sont couverts.

#### Lacunes moyenne / basse priorité

- **Epic 2 — UI (Stories 2.1–2.14) :** Aucun test E2E Playwright ciblant l’éditeur de graphe (visualisation, zoom, pan, drag-and-drop, recherche, etc.). Tests frontend existants : `frontend/src/__tests__/graphStore.controlledMode.test.ts` (mode contrôlé). Recommandation : ajouter des E2E ou tests composant pour les parcours critiques (ex. charger un dialogue → afficher le graphe → modifier un nœud → sauvegarder) si la qualité de livraison l’exige.

---

### Heuristiques de couverture

#### Endpoints

- Endpoints graphe sans test API direct : **0** (load, save, save-and-write, validate, calculate-layout sont tous exercés par `test_graph_crud.py`).
- Endpoints non couverts dans ce périmètre : `POST /generate-node`, `POST /nodes/{id}/accept`, `POST /nodes/{id}/reject` (hors scope trace Epic 2 backend ci-dessus).

#### Chemins d’erreur

- Validation (JSON invalide, structure invalide, chemin non configuré) : couverts.
- Pas de test dédié auth/authz sur le graphe (auth désactivée ou gérée ailleurs).

---

### Couverture par niveau de test

| Niveau   | Nombre de tests | Critères couverts | % (dans ce scope) |
|----------|------------------|-------------------|-------------------|
| API      | 14 (graph_crud)  | 5/5               | 100%              |
| Unit     | —                | —                 | —                 |
| E2E      | 0 (graphe)       | 0                 | —                 |
| **Total** | **14**          | **5**             | **100%**          |

---

## PHASE 2 : DÉCISION DE GATE

**Type de gate :** epic  
**Mode de décision :** deterministic

### Synthèse des preuves

- **Couverture exigences (backend Epic 2) :** P0 100 %, P1 100 %, global 100 %.
- **Exécution des tests :** 40 passent, 1 skip (hors graphe) — voir revue TEA précédente.
- **Lacunes critiques :** 0. Lacunes haute priorité : 0.

### Critères P0 (tous doivent passer)

| Critère         | Seuil | Réel   | Statut   |
|-----------------|-------|--------|----------|
| Couverture P0   | 100%  | 100%   | ✅ PASS  |
| Lacunes critiques | 0   | 0      | ✅ PASS  |

### Critères P1

| Critère       | Seuil | Réel   | Statut   |
|---------------|-------|--------|----------|
| Couverture P1 | ≥80%  | 100%   | ✅ PASS  |
| Couverture globale | ≥80% | 100% | ✅ PASS  |

### DÉCISION DE GATE : **PASS** ✅ (pour la partie tracée uniquement)

**Justification :** Pour le **sous-ensemble tracé** (les 5 endpoints API graphe déjà implémentés), les critères sont entièrement couverts par `test_graph_crud.py`. P0 et P1 à 100 %, aucune lacune. **Cette décision ne vaut que pour ce sous-ensemble.** Elle ne signifie pas que l’Epic 2 est terminée ni que tout le périmètre Epic 2 est couvert. Quand l’epic sera complète, refaire une trace sur l’ensemble des AC des stories 2.1–2.14 pour une décision de gate sur l’epic entier.

---

### Prochaines étapes

1. **Immédiat :** Aucun blocage. Déploiement possible pour le backend graphe.
2. **Court terme :** Si objectif qualité UI Epic 2, ajouter E2E ou tests composant pour au moins un parcours (charger → afficher graphe → modifier → sauvegarder).
3. **Artéfacts liés :** Epic 2 — `_bmad-output/planning-artifacts/epics/epic-02.md` ; tests — `tests/api/test_graph_crud.py` ; revue qualité — `_bmad-output/test-artifacts/test-review-batch-3.md`.

---

**Généré :** 2026-03-07  
**Workflow :** testarch-trace (Traceability & Gate Decision)
