# Code Review — Story 2.8 Jump to nœud (FR29)

**Story:** 2-8-jump-to-nœud-spécifique-par-id-ou-nom-fr29.md  
**Git vs Story Discrepancies:** 0 (fichiers story cohérents avec les changements git ; autres fichiers modifiés hors File List considérés hors périmètre)  
**Issues trouvées:** 0 High, 3 Medium, 2 Low

---

## 🔴 CRITICAL ISSUES

- Aucun. Toutes les tâches marquées [x] sont implémentées ; les AC sont couverts.

---

## 🟡 MEDIUM ISSUES

1. **AC1 « ou menu » (AC #1)**  
   - **Fichier:** `frontend/src/components/graph/GraphEditor.tsx`  
   - L’AC exige d’ouvrir le panneau « Jump to Node » via **Ctrl+J ou menu**. Seul le raccourci Ctrl+J existe ; aucune entrée de menu (ex. menu « Actions ») n’ouvre le modal.  
   - **Correctif:** Ajouter une entrée « Aller à un nœud (Ctrl+J) » dans le menu Actions qui appelle `setShowJumpToNodeModal(true)`.

2. **Focus trap (Task 3.3 / NFR-A1)**  
   - **Fichier:** `frontend/src/components/graph/JumpToNodeModal.tsx`  
   - La story demande un « focus trap dans le modal ». Actuellement le focus est mis sur l’input à l’ouverture, mais Tab / Shift+Tab peut faire sortir le focus du modal.  
   - **Correctif:** Implémenter un focus trap (boucle Tab/Shift+Tab entre input et liste, ou utiliser un hook/pattern focus-trap).

3. **Tests act() (qualité des tests)**  
   - **Fichier:** `frontend/src/__tests__/JumpToNodeModal.test.tsx`  
   - Les tests qui déclenchent le debounce (saisie puis suggestions) produisent des warnings « An update was not wrapped in act(...) » car les mises à jour d’état asynchrones du debounce ne sont pas dans act().  
   - **Correctif:** Utiliser `vi.useFakeTimers()` et `vi.advanceTimersByTime(DEBOUNCE_MS + marge)` avant les assertions, ou encapsuler les attentes dans act()/waitFor de manière appropriée.

---

## 🟢 LOW ISSUES

4. **Raccourci Ctrl+J absent de l’aide**  
   - **Fichier:** `frontend/src/components/graph/GraphEditor.tsx` (tooltip « Raccourcis graphe »)  
   - Le raccourci Ctrl+J (Aller à un nœud) n’est pas listé dans la tooltip des raccourcis.  
   - **Correctif:** Ajouter une ligne du type : `<kbd>Ctrl+J</kbd> : Aller à un nœud (Jump to Node)`.

5. **listRef non utilisé**  
   - **Fichier:** `frontend/src/components/graph/JumpToNodeModal.tsx`  
   - `listRef` est déclaré mais jamais utilisé (scroll into view de l’option mise en surbrillance au clavier pourrait l’utiliser).  
   - **Correctif:** Soit utiliser listRef pour scrollIntoView sur l’option highlightée, soit supprimer la ref si non nécessaire.

---

## Validation AC / Tâches

| AC / Tâche | Statut | Preuve |
|-----------|--------|--------|
| AC1 Champ + suggestions (Ctrl+J) | ✅ | JumpToNodeModal input + findNodesByQuery, Ctrl+J dans useKeyboardShortcuts |
| AC1 « ou menu » | ⚠️ PARTIAL | Pas d’entrée menu → correctif Medium #1 |
| AC2 ID → Enter → centre + sélection | ✅ | jumpToNode + focus-generated-node (GraphCanvas), handleSubmit |
| AC3 Nom → centre avec animation | ✅ | findNodesByQuery + jumpToNode → fitView dans GraphCanvas |
| AC4 Plusieurs nœuds → liste + sélection | ✅ | Liste suggestions + clic option → handleSelect |
| AC5 Nœud inexistant → « Nœud non trouvé » | ✅ | notFoundMessage dans handleSubmit |
| Task 1 jumpToNode / findNodesByQuery | ✅ | uiSlice.ts + graphStore.jumpToNode.test.ts |
| Task 2 Helper recherche | ✅ | findNodesByQuery dans uiSlice |
| Task 3 JumpToNodeModal | ✅ | Composant + JumpToNodeModal.test.tsx ; focus trap partiel → Medium #2 |
| Task 4 Intégration + Ctrl+J | ✅ | GraphEditor état + raccourci ; menu manquant → Medium #1 |

---

*Review effectuée selon workflow code-review (adversarial). Correctifs automatiques appliqués pour Medium #1, #2 et Low #4, #5 (scrollIntoView). Medium #3 act() laissé en l’état pour éviter timeouts en fake timers.*

---

## Où tester dans l’interface

- **Écran :** Éditeur de graphe (route `/graph` ou « Graphe » depuis la liste des dialogues).
- **Prérequis :** Un dialogue chargé avec au moins un nœud (sinon la recherche ne retourne rien).
- **Ouvrir le panneau Jump to Node :**
  - **Raccourci :** `Ctrl+J` → le modal « Jump to node » s’ouvre avec le champ « ID ou nom du nœud ».
  - **Menu :** Bouton **Actions** (barre d’outils du graphe) → **Aller à un nœud (Ctrl+J)** → même modal.
- **À vérifier :**
  1. Saisir un **ID** de nœud (ex. `node_abc123` si présent) puis **Enter** → le graphe se centre sur le nœud et le nœud est sélectionné.
  2. Saisir un **nom** (extrait de `displayName` ou première ligne de `data.line`) → les suggestions s’affichent ; **Enter** sur le premier ou **clic** sur une ligne → centrage + sélection.
  3. Saisir un terme **ambigu** (plusieurs nœuds) → choisir dans la liste avec la souris ou les flèches + Enter.
  4. Saisir un ID/nom **inexistant** puis **Enter** → message « Nœud non trouvé » (alerte rouge), le graphe reste inchangé.
  5. **Escape** ferme le modal sans changer la sélection.
  6. **Tooltip ?** (bouton d’aide à côté des raccourcis) → la ligne **Ctrl+J : aller à un nœud (Jump to Node)** doit apparaître dans la liste des raccourcis.
