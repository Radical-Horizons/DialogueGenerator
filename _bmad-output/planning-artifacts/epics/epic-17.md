## Epic 17: Expérience mobile et responsive (web)

Les utilisateurs peuvent utiliser DialogueGenerator sur **navigateur mobile et tablette** (largeurs typiques 320px–1023px) sans layout cassé : shell applicatif adaptatif, graphe utilisable au **tactile**, panneaux contexte / édition accessibles via **patterns mobile** (drawers, onglets ou plein écran). Le périmètre reste **web responsive** (pas d’app native iOS/Android dans cet epic).

**FRs covered:** FR118 (layout viewport étroit + **lisibilité / densité UI** dans panneaux réduits — story 17.6), FR119 (interactions tactiles), FR120 (panneaux sur narrow), FR121 (PWA installable — option V1.5+)

**NFRs covered:** NFR-P4 (UI Interaction Responsiveness), NFR-P5 (Initial Page Load — pas de régression sur mobile)

**Valeur utilisateur:** Revue et édition légère hors bureau, démos sur tablette, alignement avec la priorité produit « mobile nécessaire ».

**Dépendances:** Epic 1 (génération), Epic 2 (graphe), Epic 3 (contexte GDD) — **l’epic suppose la boucle cœur existante.**

**Séquençage recommandé (SM / PO) :** Traiter **Epic 17 tôt**, idéalement **après Epic 3** et **avant** d’empiler les livrables **Epics 4 → 6** sur une UI encore 100 % desktop — pour éviter de valider / exporter / templatiser des parcours inutilisables au tactile. *Note : l’identifiant « Epic 17 » évite de renuméroter les epics 4–16 déjà référencés dans `sprint-status.yaml` et les stories.*

**Référence UX :** `planning-artifacts/ux-design-specification/responsive-design-accessibility.md` (à tenir cohérent avec cet epic).

---

## ⚠️ GARDE-FOUS - Vérification de l'Existant (Scrum Master)

**OBLIGATOIRE avant création ou découpage de chaque story :**

1. **Mesurer l’existant** : `ResizablePanels`, layout 3 colonnes, React Flow — quels breakpoints déjà implicites ?
2. **Graphe** : React Flow supporte-t-il déjà pinch / touch ; quels handlers desktop (clic droit) exigent un équivalent tactile ?
3. **Pas de double epic** : Epic 14 (accessibilité) reste clavier / ARIA ; Epic 12 reste raccourcis desktop — coordonner sans dupliquer.
4. **Tests** : au minimum smoke responsive (largeurs cibles) + un scénario tactile en Playwright si supporté.

---

### Story 17.1: Shell responsive et breakpoints (layout utilisable ≥320px) (FR118)

As a **utilisateur sur mobile ou tablette**,
I want **un agencement qui s’adapte à la largeur du viewport (≥320px) sans débordement horizontal global**,
So that **je peux ouvrir l’app et accéder aux zones principales (navigation, graphe, contexte) de façon prévisible**.

**Acceptance Criteria:**

**Given** une largeur viewport 320px, 375px, 768px et 1024px  
**When** je charge l’application authentifiée sur un dialogue / graphe  
**Then** aucun scroll horizontal **sur le document entier** pour le shell principal (exceptions localisées acceptées dans le canvas si documentées)  
**And** les zones critiques (header / accès graphe / ouverture panneaux) restent atteignables

**Given** un viewport desktop large  
**When** je redimensionne au-dessus du breakpoint « large »  
**Then** le layout desktop actuel (3 colonnes ou équivalent) est **préservé** — pas de régression visuelle majeure

**Précision :** Définir en implémentation les breakpoints exacts (alignés sur `responsive-design-accessibility.md` une fois mis à jour).

**References:** FR118, NFR-P4, UX responsive spec

---

### Story 17.2: Cibles tactiles et équivalents aux interactions souris (FR119)

As a **utilisateur tactile**,
I want **des zones d’appui suffisantes et des gestes standards (pan, zoom) sur le graphe**,
So that **je peux naviguer et sélectionner sans frustration**.

**Acceptance Criteria:**

**Given** un écran tactile  
**When** j’interagis avec les contrôles chrome (boutons, onglets, toggles du shell)  
**Then** les cibles respectent **minimum 44×44px** (ou équivalent accessibilité documenté)

**Given** le graphe affiché  
**When** j’utilise le geste de **pan / zoom** supporté par la librairie  
**Then** la navigation reste fluide et cohérente avec Epic 2 (pas de régression desktop)

**Given** une action aujourd’hui exposée uniquement au **clic droit**  
**When** je suis en contexte tactile  
**Then** un **chemin équivalent** existe (long press, menu « … », ou bouton visible) — liste des actions couvertes à figer en sprint planning

**References:** FR119, NFR-P4, Epic 2 (FR22–FR35)

---

### Story 17.3: Panneaux contexte et éditeur sur narrow (drawers / plein écran) (FR120)

As a **utilisateur sur narrow viewport**,
I want **ouvrir et fermer contexte GDD et détails nœud sans écraser le graphe de façon incompréhensible**,
So that **je peux générer et éditer avec un parcours clair**.

**Acceptance Criteria:**

**Given** une largeur < seuil tablette défini  
**When** j’ouvre le sélecteur de contexte et le panneau d’édition de nœud  
**Then** ils utilisent un **pattern mobile** (drawer, modal plein écran, ou onglets explicites) avec fermeture évidente

**Given** le panneau contexte ouvert  
**When** je génère un nœud  
**Then** le flux (sélection → génération → retour graphe) reste **réalisable** sans workaround documenté comme bloquant

**References:** FR120, Epic 3 (contexte), Epic 1 (génération)

---

### Story 17.4: Qualité mobile — viewport dynamique, clavier logiciel, safe areas (renfort FR118–FR120)

As a **utilisateur sur appareil réel (iOS / Android)**,
I want **éviter les zones masquées par encoches / barres et les inputs clavier**,
So that **les champs et CTA restent utilisables**.

**Acceptance Criteria:**

**Given** un formulaire ou éditeur de texte focalisé  
**When** le **clavier logiciel** s’ouvre  
**Then** le champ actif et les actions primaires restent **visibles ou scrollables** dans la zone utile (pas de CTA définitivement hors écran)

**Given** un appareil avec **safe-area** (encoche)  
**When** j’utilise l’app en plein écran navigateur  
**Then** le shell respecte les marges sûres documentées (CSS `env(safe-area-inset-*)` ou équivalent)

**References:** FR118, FR120, NFR-P4

---

### Story 17.6: Typographie et densité adaptatives (panneaux / onglets étroits) (renfort FR118 / NFR-P4)

As a **utilisateur qui réduit la largeur des panneaux ou travaille sur une colonne centrale étroite**,
I want **que la taille du texte, des boutons et des onglets reste proportionnée à l’espace disponible**,
So that **je ne me retrouve pas avec des libellés disproportionnés, tronqués de façon illisible ou des contrôles « hors norme » par rapport au conteneur**.

**Acceptance Criteria:**

**Given** une **largeur de conteneur réduite** (colonne centrale du `Dashboard` après redimensionnement des `ResizablePanels`, ou viewport mobile / tablette déjà couverts par 17.1–17.3)  
**When** j’affiche les **onglets segmentés** (zone centrale et, si applicable, barres d’onglets équivalentes du shell) et les **boutons chrome** associés  
**Then** les **tailles de police**, **paddings** et **espacements** s’**adaptent** (ex. `clamp()`, `rem` + breakpoints, **container queries** ou équivalent documenté) dans des **bornes** définies : lisibilité minimale respectée (équivalent **≥ ~12px** corps de texte sauf caption documentée), **pas de régression** des cibles tactiles **44×44px** là où la story 17.2 s’applique  

**Given** un viewport **large desktop** avec panneaux confortables  
**When** je n’ai pas contraint les colonnes au-delà des seuils « confort » définis en implémentation  
**Then** l’apparence reste **alignée** sur le rendu actuel préféré (pas de micro-texte inutile sur grand écran)

**Given** des libellés d’onglets longs (emojis + texte)  
**When** la largeur utile est faible  
**Then** le comportement est **contrôlé** : troncature avec **title** / tooltip accessible, passage à **icône + texte court**, ou **wrap** limité — **sans** chevauchement illisible (comportement produit figé dans les tests)

**References:** FR118 (renfort), NFR-P4, UX `responsive-design-accessibility.md` (section typographie / densité), story 17.1 (breakpoints), 17.2 (touch targets), 17.3 (drawers)

**Note PO / SM :** Cette story **complète** le fil responsive déjà en cours dans l’Epic 17 : le layout peut être correct alors que la **hiérarchie typographique** et la **densité** restent calibrées pour un plein écran alors que le **panneau** est étroit.

**Priorité produit (2026-04-08) :** traiter la **story 17.6 avant la 17.4** (typographie / densité des panneaux avant clavier logiciel & safe areas).

---

### Story 17.5: PWA — installabilité et manifest (option V1.5+) (FR121)

As a **utilisateur qui revient souvent sur mobile**,
I want **pouvoir installer l’app comme PWA (icône écran d’accueil)**,
So that **le lancement est rapide et familier**.

**Acceptance Criteria:**

**Given** un navigateur compatible  
**When** les critères PWA minimaux sont remplis (manifest, service worker si requis par la cible)  
**Then** l’installation est **possible** ou le gap est documenté (ex. iOS Safari contraintes)

**Note :** Scope offline **hors MVP** de cette story sauf décision explicite PO ; prioriser install + shell.

**References:** FR121, NFR-P5

---

### Story 17.7: Sélecteur de dialogue intégré à la toolbar en mode narrow (FR120)

**Artifact :** `_bmad-output/implementation-artifacts/17-7-selecteur-dialogue-toolbar-narrow-suppression-colonne-gauche-fr120.md` — `DialogueCombobox`, `useDialogueListData`, intégration `Dashboard` + `GraphEditor`, alignement toolbar narrow.

---

### Story 17.8: Fix `useNarrowInlineSize` — ref montée tardivement (dette 17.7)

**Artifact :** `_bmad-output/implementation-artifacts/17-8-fix-usenarrowinlinesize-ref-tardive-dette-technique.md` — callback ref sur le hook, tests `useNarrowInlineSize.test.tsx`, retrait du mock dans `Dashboard.combobox-17_7.test.tsx`.

---

### Story 17.9: Refactor `GraphEditorHeader` (maintenabilité) — tri-state toolbar (dette technique)

As a **développeur**,
I want **découper `GraphEditorHeader.tsx` en sous-composants et isoler la logique tri‑state (narrow/compact/full)**,
So that **les évolutions responsive/tactiles (Epic 17) restent sûres, testables, et sans réintroduire des bugs de double-mount / overflow**.

**Scope :** refactor interne uniquement (comportement utilisateur inchangé).

**Acceptance Criteria:**

- **Given** un desktop large / compact / narrow  
  **When** je redimensionne et j’utilise les actions toolbar (batch ops, auto-layout, actions, coûts, undo/redo, badge santé + save status)  
  **Then** le comportement et l’UI restent équivalents (tolérance CSS minime acceptée)

- **Given** le mode compact desktop (entre seuils “comfortable” et “compact max”)  
  **When** la toolbar bascule  
  **Then** les rangées sont explicites et testables (status puis tools), et les composants sensibles ne sont montés **qu’une seule fois**

- **Given** la base de code  
  **When** je lis/modifie la toolbar  
  **Then** `GraphEditorHeader.tsx` est significativement réduit (orchestration/wiring), et l’essentiel du JSX est dans des sous-composants dédiés

**Découpage recommandé (si besoin en plusieurs PRs/stories) :**

- **Story 17.9.A (UI extraction)** : extraire les sous-composants “presentation” (ex. `GraphToolbarStatusRow`, `GraphToolbarToolsRow`, `GraphToolbarTitleBlock`) sans changer la logique.
- **Story 17.9.B (logic extraction)** : extraire un hook/helper `useGraphToolbarTriState()` (ou équivalent) et stabiliser le contrat via tests.
- **Story 17.9.C (tests/mocks hardening)** : harmoniser les mocks partiels (`../components/shared`) et ajouter un test “anti double-mount” (SaveStatusIndicator unique).

**Test Plan (preuve minimale) :**

- `npm --prefix frontend test -- src/__tests__/GraphEditorHeader.desktopToolbar.test.tsx src/__tests__/GraphEditorHeader.searchRow.test.tsx src/__tests__/GraphEditorHeader.undoRedo.test.tsx src/__tests__/GraphEditor.multiSelection.test.tsx`
- `npm --prefix frontend run lint`
- **Preuve UI** : `npm run dev` puis redimensionnements full → compact → narrow → full sans scroll horizontal indésirable ni écran noir.

---

## Synthèse dépendances stories

| Story | Dépend de |
|-------|-----------|
| 17.1 | — (fondation) |
| 17.2 | 17.1 (shell stable) |
| 17.3 | 17.1, 17.2 (recommandé) |
| 17.4 | 17.1–17.3 (renfort) |
| 17.5 | 17.1 (indépendant logiquement, peut suivre) |
| 17.6 | 17.1 (breakpoints / shell) ; **recommandé** après 17.2–17.3 pour ne pas contredire drawers + touch |
| 17.7 | 17.1, 17.3, 17.6 (narrow / densité / drawers) |
| 17.8 | 17.7 (diagnostic ref tardive) ; corrige le hook pour **tous** les consommateurs |
| 17.9 | 17.7–17.8 (toolbar tri‑state stable) |
