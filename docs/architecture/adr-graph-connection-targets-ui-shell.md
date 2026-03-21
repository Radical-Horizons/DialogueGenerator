# ADR (suivi) — Cibles de connexion en UI + coque éditeur (standalone vs Dashboard)

**ADR canonique (BMad) :** [`../../_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md`](../../_bmad-output/planning-artifacts/architecture/v10-architectural-decisions-adrs.md) — **ADR-009**.  
**Artifact d’implémentation :** [`../../_bmad-output/implementation-artifacts/graph-connection-targets-ui-dashboard-vs-standalone-2026-03.md`](../../_bmad-output/implementation-artifacts/graph-connection-targets-ui-dashboard-vs-standalone-2026-03.md).  
Ce fichier est un **miroir / détail technique** dans `docs/` (pas le registre officiel des ADR).

**Statut :** Implémenté (2026-03)  
**Périmètre :** Frontend graphe — sélection des cibles (`targetNode`, `nextNode`, sorties TestNode), alignement formulaire / store, tests E2E.

## Contexte

- Les champs « qui pointe vers quel nœud » sont portés par le **graphe** (edges + projection document), pas seulement par des champs texte du formulaire React Hook Form.
- Un écart temporaire form ↔ store (flush au changement de sélection, génération IA) avait causé des régressions ; des garde-fous (merge pur, resync) et des sélecteurs dédiés ont été introduits.
- La page **`/graph-editor`** (mode standalone) et l’onglet **Dashboard « Éditeur de Graphe »** n’exposent pas le même chrome : le panneau d’édition de nœud n’est pas au même endroit.

## Décisions

1. **Sélecteurs de cible (`ConnectionTargetSelect`)**  
   Un changement de cible appelle les primitives du store **`connectNodes` / `disconnectNodes`** (même logique qu’un branchement au drag), pas uniquement `setValue` sur un champ « possédé par les edges ».

2. **Libellés utilisateur**  
   Les options affichent un libellé lisible (`title` → `displayName` → première ligne de `line` → `id`), avec suffixe id entre parenthèses si distinct — helpers **`nodeTargetLabel.ts`**, liste **`targetPickerOptions.ts`** (entrée synthétique **`Fin (END)`**).

3. **Merge formulaire → store**  
   La fusion des valeurs du panel vers `node.data` pour les champs sensibles aux edges est centralisée dans **`mergeNodeEditorForm.ts`** (dialogue / test / end), pour éviter que le flush écrase `targetNode` / connexions de test.

4. **Resynchronisation**  
   Quand le nœud sélectionné est inchangé mais que les connexions en store évoluent (génération, normalisation), le formulaire est réaligné via une **empreinte** des champs de connexion dans **`NodeEditorPanel`** (décision produit : pour ces clés, la **vérité graphe** l’emporte sur une saisie form concurrente).

5. **Coque UI : standalone vs Dashboard**  
   - **`GraphEditorPage` (`/graph-editor`, `mode="standalone"`)** : canvas + liste Unity + header ; **pas de `NodeEditorPanel`** monté dans cette vue.  
   - **Dashboard** (onglet central **« Éditeur de Graphe »**) : même `GraphEditor` embedded + panneau droit avec **`NodeEditorPanel`** (onglet « Édition de nœud »).  
   Toute doc / test Playwright qui suppose des champs `input[name="speaker"]`, combobox de cible, etc. sur **standalone** est **incorrecte** : utiliser le **Dashboard** ou documenter l’écart.

6. **Autosave (complément)**  
   La garde « dialogue UI vs dialogue chargé » compare les identifiants **normalisés** (sans extension `.json`, casse) pour éviter de bloquer l’autosave quand la liste expose `foo.json` et le store `foo`.

## Conséquences

- **E2E** : scénario enregistré **`e2e/graph-connection-target-dropdown.spec.ts`** (seed document API → Dashboard → graphe → combobox « Nœud suivant » → `Fin (END)` → save → vérification document).
- **Tests unitaires / RTL** : `mergeNodeEditorForm.test.ts`, `ConnectionTargetSelect.test.tsx`, `nodeTargetLabel.test.ts`, resync panel, etc.
- **Piste long terme (hors périmètre)** : séparer totalement « texte éditable » et « connexions uniquement graphe » pour réduire encore la surface form/edges (voir discussions plan merge/resync).

## Fichiers de référence (non exhaustif)

- `frontend/src/components/graph/ConnectionTargetSelect.tsx`
- `frontend/src/utils/mergeNodeEditorForm.ts`, `nodeTargetLabel.ts`, `targetPickerOptions.ts`
- `frontend/src/hooks/useDialogueLoader.ts` (autosave / normalisation id)
- `frontend/src/pages/GraphEditorPage.tsx`, `frontend/src/components/layout/Dashboard.tsx`
