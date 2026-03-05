# Code Review Findings – Story 16.6

**Story:** 16-6-tests-golden-e2e-perf-non-régression.md  
**Git vs Story Discrepancies:** 6  
**Issues Found:** 1 High, 4 Medium, 2 Low  

---

## CRITICAL / HIGH

### 1. [HIGH] E2E spec – fonction inexistante `readFixtureViaApi` (l.260)
- **Fichier:** `e2e/documents-layout-adr008.spec.ts`
- **Problème:** Le test « dupliquer nœud (Task 2.3) » appelle `readFixtureViaApi(request)` qui n’existe pas. La seule helper définie est `readDialogueViaApi(request, filename)`. Dès que le test ne skip plus (bouton Dupliquer visible), il plantera en `ReferenceError`.
- **Preuve:** Ligne 260 : `const nodes = await readFixtureViaApi(request)` ; aucune définition de `readFixtureViaApi` dans le fichier.
- **Impact:** AC2 (E2E) partiellement non vérifiable pour le scénario dupliquer ; régression cachée quand 2.3 sera exécuté.

---

## MEDIUM

### 2. [MEDIUM] File List story incomplète vs git
- **Fichiers modifiés (git) absents de la File List:**  
  `frontend/src/components/graph/GraphEditor.tsx`, `tests/api/test_unity_dialogues.py`, `e2e/graph-load-display-nodes.spec.ts`, `e2e/graph-node-accept-reject.spec.ts`, `docs/troubleshooting/e2e-adr008.md`
- **Règle workflow:** Toute modification liée à la story doit être documentée dans Dev Agent Record → File List.

### 3. [MEDIUM] Fixture API sans choiceId (v1.1.0)
- **Fichier:** `tests/api/test_unity_dialogues.py` (l.38–61)
- **Problème:** La fixture `sample_unity_dialogue` utilise des `choices` sans `choiceId`. En schéma v1.1.0, `choiceId` est requis. Risque de tests qui passent alors que le format réel serait refusé.
- **Action:** Ajouter `choiceId` aux choices dans les fixtures ou documenter que ces tests ciblent le format legacy.

### 4. [MEDIUM] Test E2E connect/disconnect (Task 2.2) ne déconnecte pas
- **Fichier:** `e2e/documents-layout-adr008.spec.ts` (test Task 2.2)
- **Problème:** Le test fait `triggerSave()` puis vérifie que le nombre d’arêtes est inchangé. Il n’effectue aucune action de déconnexion (clic sur une arête, bouton déconnecter). Le scénario « connecter/déconnecter » n’est pas vraiment couvert.
- **Action:** Soit renforcer le test (action de déconnexion + vérification état), soit documenter la limite.

### 5. [MEDIUM] Changements non commités / non documentés
- **Fichiers:** `.cursor/rules/frontend_testing.mdc`, `Assets/Dialogue/...` (hors périmètre « code applicatif » pour la revue, mais présents dans `git status`). À documenter ou à exclure explicitement si hors story.

---

## LOW

### 6. [LOW] Section « Senior Developer Review (AI) » absente
- La story n’a pas encore de section « Senior Developer Review (AI) » ni d’entrée « Change Log » pour cette revue. À ajouter après traitement des findings (workflow code-review).

### 7. [LOW] Cohérence nommage helper E2E
- `readDialogueViaApi(request, filename)` vs usage attendu dans 2.3 : pour la fixture, le filename est `FIXTURE_FILENAME` (`e2e-adr008-fixture.json`). Corriger l’appel (voir correctif #1) aligne aussi le nommage.

---

## Résumé validation AC / Tasks

| AC / Task | Statut | Note |
|-----------|--------|------|
| AC1 (golden, IDs stables) | IMPLEMENTED | documentToGraph.test.ts + edgeId stable quand cible change |
| AC2 (E2E) | PARTIAL | 4 tests OK, 2.3 skip + bug readFixtureViaApi ; 2.2 ne teste pas la déconnexion |
| Task 1 [x] | DONE | Cohérent avec le code |
| Task 2 [x] | PARTIAL | 2.3 code cassé si exécuté ; 2.2 couverture faible |
| Tasks 3–6 [ ] | Non implémentés | Conformes au statut story |

---

*Reviewer: Amelia (Dev Agent, adversarial code review) – workflow code-review*
