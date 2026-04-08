# Story 17.3: Panneaux contexte et éditeur sur narrow (drawers / plein écran) (FR120)

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **utilisateur sur narrow viewport**,  
I want **ouvrir et fermer contexte GDD et détails nœud sans écraser le graphe de façon incompréhensible**,  
so that **je peux générer et éditer avec un parcours clair**.

## Acceptance Criteria

1. **Pattern mobile pour contexte GDD et éditeur**  
   - **Given** une largeur **strictement inférieure au seuil « desktop »** du projet (aligné sur `useViewportMode` : **&lt; 1024px**, donc modes `mobile` et `tablet`)  
   - **When** j’ouvre le **sélecteur de contexte** (panneau gauche) et le **panneau de détails / édition nœud** (panneau droit)  
   - **Then** ils utilisent un **pattern mobile explicite** : **drawer** (overlay coulissant), **modal plein écran**, ou **onglet / couche dédiée** clairement nommée — **pas** seulement une colonne `ResizablePanels` à largeur minimale sans hiérarchie visuelle  
   - **And** une **fermeture évidente** est toujours visible ou atteignable au premier coup d’œil (bouton Fermer / Replier, **Escape** si `role="dialog"`, ou équivalent documenté)

2. **Flux génération ↔ graphe**  
   - **Given** le panneau **contexte** ouvert en narrow  
   - **When** je **sélectionne** du contexte GDD puis enchaîne vers la **génération** (onglet Génération ou flux équivalent existant) puis reviens au **graphe**  
   - **Then** le parcours reste **réalisable** sans contournement documenté comme **bloquant** (overlay qui piège le focus, panneau impossible à fermer, graphe inaccessible)

**References:** FR120, Epic 3 (contexte), Epic 1 (génération), UX `responsive-design-accessibility.md`.

## Tasks / Subtasks

- [ ] **Task 1 : Panneau contexte GDD en pattern mobile + fermeture évidente** (AC: #1, panneau gauche)  
  - [ ] 🔴 Test échoue : en viewport **narrow** (ex. `innerWidth` 375 ou 768, cohérent avec les tests existants du `Dashboard`), à l’**ouverture** du panneau contexte, le contenu est présenté dans une **couche au-dessus du canvas** (assertion **comportementale** : `role="dialog"` ou `aria-modal="true"` **ou** présence d’un **backdrop / overlay** identifiable en test, selon le pattern retenu) **et** un contrôle de **fermeture** explicite est dans le document (libellé ou `aria-label` clair).  
  - [ ] 🟢 Implémenter le pattern retenu pour le **panneau gauche** en narrow, en **réutilisant** `ContextSelector` et l’état d’ouverture existants du `Dashboard` / `useViewportMode` — **sans** dupliquer la logique métier GDD.  
  - [ ] 🔵 Refactor : si une logique « overlay + focus / Escape » est partagée plus tard avec le panneau droit, **extraire** un petit hook ou wrapper commun **seulement une fois** les deux comportements visibles ; sinon, clarifier le **nommage** des états (`collapsed` vs `open`) pour éviter la confusion mobile / desktop.

- [ ] **Task 2 : Panneau détails / éditeur nœud en pattern mobile + fermeture évidente** (AC: #1, panneau droit)  
  - [ ] 🔴 Test échoue : en **narrow**, à l’ouverture du panneau **détails** (onglets / contenu actuel du panneau droit), **même exigence** que Task 1 : couche mobile identifiable + **fermeture évidente** (bouton ou `dialog` + Escape selon pattern).  
  - [ ] 🟢 Implémenter le pattern pour le **panneau droit** en narrow en s’appuyant sur les composants existants (`NodeEditorPanel`, onglets du panneau droit, etc.) — **préserver** le comportement **desktop** (≥ 1024px) inchangé ou équivalent fonctionnel.  
  - [ ] 🔵 Refactor : réduire la **duplication de styles** (z-index, transitions, header drawer) entre gauche et droite si le code le montre ; sinon, **chantier tests** : regrouper les helpers de rendu narrow dans un fichier de test partagé pour éviter deux suites divergentes.

- [ ] **Task 3 : Parcours contexte → génération → graphe sans état bloquant** (AC: #2)  
  - [ ] 🔴 Test échoue : en narrow, **enchaînement minimal** — ouvrir contexte → **fermer** explicitement → basculer vers l’onglet **Génération** puis **Graphe** (ou l’inverse selon scénario le plus court réaliste en RTL) : à chaque étape, **aucun** élément `aria-hidden` incorrect sur le main interactif **et** le **graphe** reste montable (ex. onglet graphe actif, conteneur `GraphEditor` présent sans overlay opaque persistant sans bouton de fermeture). Adapter les assertions au **réel** du `Dashboard` (pas de test vacuous).  
  - [ ] 🟢 Garantir la **cohérence d’état** (un seul overlay « gagnant », fermeture au changement d’onglet si c’est le comportement produit retenu) **sans** nouveau endpoint API.  
  - [ ] 🔵 Refactor : si des effets `useEffect` gèrent l’overlay, **documenter l’intention** en un commentaire bref **ou** fusionner les effets qui réagissent au même signal (`centerPanelTab`, `viewportMode`) pour réduire les courses.

## Dev Notes

- **Architecture guardrails** : Shell et layout — `Dashboard` + `ResizablePanels` + `useViewportMode` (seuils **768 / 1024**). Ne pas casser le layout **desktop** ; les changements narrow doivent être **conditionnés** au mode viewport (ou largeur équivalente en test). Pas de logique métier GDD / graphe dans l’API : tout reste UI.  
- **What to reuse** : `useViewportMode`, `PanelExpandButton` / `PanelCollapseButton`, `ContextSelector`, contenu panneau droit existant (`NodeEditorPanel`, titres d’onglets déjà dans `Dashboard`). S’inspirer des patterns **focus** déjà mentionnés dans la spec UX (modals, `role="dialog"`).  
- **Quality bar** : tests **RTL + Vitest** sur largeurs narrow ; **ESLint** sans régression ; optionnel **Playwright** sur un seul scénario narrow si le harnais le permet sans flaky.  
- **Piège à éviter** : conflit entre **rails latéraux** actuels et **drawer** — définir une règle produit claire (ex. en narrow, le rail est remplacé par une **icône / FAB** qui ouvre le drawer, ou le rail reste mais le **premier état ouvert** est overlay). Le story **ne prescrit pas** le choix exact : le dev le **fixe** et le **test** verrouille le comportement observable.  
- **Relation 17.2** : cibles tactiles 44×44 déjà exigées ; les boutons fermer / ouvrir des drawers doivent **rester** dans cette enveloppe.  
- **Refactor bar** : critères par défaut du workflow **dev-story** (~300 lignes par fichier touché par tâche, fonctions ~60 lignes, pas de duplication non triviale).

### Project Structure Notes

- Point d’ancrage probable : `frontend/src/components/layout/Dashboard.tsx` (triptyque panneaux + onglets centraux).  
- Spec UX : `_bmad-output/planning-artifacts/ux-design-specification/responsive-design-accessibility.md` (drawers, breakpoints mobile / tablette).  
- Epic : `_bmad-output/planning-artifacts/epics/epic-17.md` — Story 17.3.

### References

- [Source: `_bmad-output/planning-artifacts/epics/epic-17.md` — Story 17.3 / FR120]  
- [Source: `_bmad-output/planning-artifacts/ux-design-specification/responsive-design-accessibility.md` — Mobile / tablet / drawers]  
- [Source: `frontend/src/hooks/useViewportMode.ts` — Seuils narrow]  
- [Source: `_bmad-output/project-context.md` — Stack React / tests]

## Technical Requirements

- **React 18 + TypeScript** : composants contrôlés ; pas de fuite de state global hors patterns existants (Zustand reste pour le graphe / éditeur, pas pour remplacer un simple UI local si non nécessaire).  
- **Accessibilité minimale** : si overlay modal, gérer **focus** (au minimum : ne pas laisser le focus « derrière » un overlay non modal sans indication) ; préférer les primitives sémantiques déjà utilisées dans le projet.  
- **Aucune** dépendance lourde **obligatoire** : si introduction d’une lib drawer, la **justifier** (bundle, alignement design) ; sinon **CSS + état React** suffisent.

## Architecture Compliance

- Conforme **migration web** : UI dans `frontend/` ; pas de changement de contrat API pour cette story.  
- Cohérent **Epic 17** : 17.1 (shell / breakpoints) et 17.2 (touch) sont des **prérequis** ; 17.4 traitera clavier logiciel / safe-area — **ne pas** préempter 17.4 ici.

## Library / Framework Requirements

- **React Flow** : pas au cœur de cette story sauf si le drawer masque le canvas : vérifier **resize** / **dimensions** du conteneur graphe après fermeture drawer (non-régression).  
- Versions : rester sur **React 18.2** et **Vite** du repo ; pas d’upgrade majeure dans cette story.

## File Structure Requirements

- Modifications attendues **surtout** sous `frontend/src/components/layout/` et éventuellement `frontend/src/components/` pour extraits UI réutilisables.  
- Tests : à côté des tests `Dashboard` / layout existants (`*.test.tsx`), en suivant `frontend_testing.mdc` / `workflow.mdc`.

## Testing Requirements

- **Vitest + RTL** : mocker `innerWidth` ou utiliser les patterns déjà présents dans `Dashboard.test.tsx` / tests responsive.  
- Comportements à verrouiller : **ouverture / fermeture** narrow, **non-régression** desktop (un seul test smoke largeur ≥ 1024 si pertinent).  
- Éviter les tests **couplés à l’implémentation interne** (`ResizablePanels` sizes) sauf si c’est le seul signal fiable — préférer **rôles ARIA**, libellés, ou présence du backdrop.

## Previous Story Intelligence (17.2)

- **Livrables utiles** : `TOUCH_TARGET_MIN_PX`, `useCoarsePointerMatch`, long-press menus graphe ; fermeture menus au **`pointerdown`** — les drawers devraient être **cohérents** (fermeture au tap extérieur ou bouton dédié).  
- **Tests** : `QueryClientProvider` requis autour de certains arbres ; `__BUILD_DATE__` défini dans Vitest ; `innerWidth` via `Object.defineProperty` pour éviter `any`.  
- **Review** : éviter les overlays qui restent ouverts après navigation onglet — même discipline pour **drawers**.

## Git Intelligence Summary

- Activité récente sur le dépôt : merges et correctifs Mistral / Vitest non directement liés au layout ; le travail **Epic 17** est porté par les fichiers layout (`Dashboard`, `MainLayout`, hooks viewport). **Rebase / pull** avant dev pour intégrer les derniers changements `Dashboard`.

## Latest Technical Notes (overlays / dialogs)

- **WAI-ARIA** : pour une fenêtre superposée qui bloque l’interaction avec le reste, combiner `role="dialog"`, `aria-modal="true"`, titre accessible (`aria-labelledby` / `aria-label`), et **Escape** pour fermer si le pattern est modal.  
- **Inert / focus trap** : HTML `inert` ou gestion focus manuelle selon support navigateur cible ; rester proportionné au niveau d’accessibilité du projet (spec UX : minimal A, cible AA phase 2).

## Project Context Reference

- `_bmad-output/project-context.md` — stack frontend, ESLint zéro warning, tests RTL, pas de secrets en dur.

## Dev Agent Record

### Agent Model Used

_(à remplir par l’agent dev)_

### Debug Log References

### Completion Notes List

### File List

---

**Story completion status**

- **Status** : ready-for-dev  
- **Note** : Ultimate context engine analysis completed — comprehensive developer guide created (create-story workflow, 2026-04-08).
