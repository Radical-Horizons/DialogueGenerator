# Responsive Design & Accessibility

## Responsive Strategy

**Desktop-First Approach (Priorité principale) :**
- **Focus principal** : Écrans d'ordinateur (1024px+)
- **Layout 3 colonnes** : Panneau gauche (Contexte) | Canvas central | Panneau droit (Détails)
- **Panneaux redimensionnables** : `ResizablePanels` pour ajustement fin
- **Mode plein écran** : Masquer panneaux latéraux (raccourci F11) pour maximiser canvas

**Mobile Strategy (priorité produit — Epic 17) :**
- **Epic de référence :** `_bmad-output/planning-artifacts/epics/epic-17.md` (FR118–FR121)
- **Séquençage :** après boucle cœur (Epics 1–3), idéalement avant d’empiler validation / export / templates (Epics 4–6)
- Patterns attendus : layouts empilés, drawers / plein écran pour panneaux, navigation claire entre graphe et contexte
- **Touch targets :** minimum 44×44px sur le chrome (voir Story 17.2)

**Tablet Strategy (aligné Epic 17) :**
- Layout simplifié : 2 colonnes ou shell hybride (Canvas | Panneau contextuel) selon breakpoint
- Panneaux collapsibles / drawers : masquer le non essentiel sur largeur intermédiaire

## Breakpoint Strategy

**Breakpoints (Desktop-First) :**
- **Small Desktop** : 1024px - 1279px (layout 3 colonnes, panneaux réduits)
- **Medium Desktop** : 1280px - 1919px (layout optimal, panneaux taille normale)
- **Large Desktop** : 1920px+ (layout 3 colonnes, espace généreux)

**Breakpoints (Mobile / tablette — Epic 17) :**
- **Mobile** : 320px - 767px (cible FR118)
- **Tablet** : 768px - 1023px (layout 2 colonnes ou drawers, selon story 17.1)

## Accessibility Strategy

**WCAG Compliance Level :**
- **Approche minimale** : WCAG 2.1 Level A (essentiel pour conformité légale)
- **Target (Phase 2)** : WCAG 2.1 Level AA (recommandé pour outils professionnels)
- **Note** : Accessibilité secondaire et minimale pour l'instant, amélioration progressive

**Key Accessibility Considerations :**

1. **Color Contrast :**
   - Texte normal : Ratio minimum 4.5:1 (WCAG AA)
   - Texte large : Ratio minimum 3:1 (WCAG AA)
   - Vérifier : `theme.text.primary` sur `theme.background.panel` (contraste suffisant)

2. **Keyboard Navigation :**
   - Navigation complète au clavier (Tab, Enter, Escape)
   - Focus visible : `theme.border.focus` (#646cff)
   - Raccourcis clavier : `/` pour recherche, `Ctrl+S` pour sauvegarder
   - Skip links : Navigation rapide vers sections principales (Phase 2)

3. **Screen Reader Compatibility :**
   - ARIA labels : Tous les composants interactifs
   - ARIA roles : `role="dialog"` pour modals, `role="button"` pour handles
   - ARIA live regions : Notifications, progression génération
   - Semantic HTML : Utiliser éléments HTML sémantiques (`<button>`, `<nav>`, etc.)

4. **Touch Targets (si support tactile ajouté) :**
   - Minimum 44x44px pour éléments interactifs
   - Espacement suffisant entre éléments (minimum 8px)

5. **Focus Indicators :**
   - Focus visible : Outline avec `theme.border.focus`
   - Focus trap : Dans modals (Tab cycle)
   - Focus management : Focus sur premier élément interactif à l'ouverture modal

## Testing Strategy

**Responsive Testing :**
- **Desktop** : Chrome, Firefox, Safari, Edge (versions récentes)
- **Résolutions** : 1024px, 1280px, 1920px, 2560px
- **Panneaux redimensionnables** : Tester différentes largeurs panneaux
- **Mode plein écran** : Vérifier comportement avec panneaux masqués
- **Mobile/Tablet** : tests ciblés Epic 17 (largeurs 320 / 375 / 768 px + smoke tactile si Playwright le permet)

**Accessibility Testing :**
- **Automated** : axe DevTools, Lighthouse Accessibility (tests minimaux)
- **Screen readers** : NVDA (Windows), VoiceOver (macOS) - Phase 2
- **Keyboard navigation** : Navigation complète sans souris (tests minimaux)
- **Color contrast** : Vérifier tous les textes avec outils (WebAIM Contrast Checker)

**User Testing :**
- **Phase 1** : Tests avec utilisateurs desktop (Marc, Mathieu)
- **Phase 2** : Tests avec utilisateurs ayant besoins d'accessibilité (si applicable)

## Implementation Guidelines

**Responsive Development :**
- **Units** : Utiliser `rem`, `%`, `vw`, `vh` plutôt que `px` fixes
- **Media queries** : Desktop-first (min-width) avec overrides progressifs pour Epic 17
- **Flexbox/Grid** : Layout flexibles avec `ResizablePanels`
- **Images** : Optimisation pour différentes résolutions (Phase 2 si besoin)

**Accessibility Development :**
- **Semantic HTML** : Utiliser éléments HTML sémantiques (`<button>`, `<nav>`, `<main>`, etc.)
- **ARIA labels** : Tous les composants interactifs (ex: `aria-label="Test results: 4 outcomes"`)
- **Keyboard navigation** : Implémenter navigation complète (Tab, Enter, Escape)
- **Focus management** : Focus visible avec `theme.border.focus`, focus trap dans modals
- **Skip links** : Navigation rapide vers sections principales (Phase 2)
- **High contrast mode** : Support mode contraste élevé (Phase 2)

**Composants critiques pour accessibilité :**
- **TestNode Barre 4 Résultats** : ARIA labels pour chaque handle, navigation clavier
- **AIGenerationPanel** : Focus trap, ARIA modal, navigation clavier
- **NodeEditorPanel** : Labels associés aux inputs, messages d'erreur avec `aria-describedby`
- **GraphCanvas** : ARIA labels pour contrôles ReactFlow, navigation clavier

**Note importante :** Le **responsive mobile/tablette** est porté par **Epic 17** (priorité produit). L’**accessibilité** (Epic 14) reste en approche progressive ; éviter les refactorings massifs hors stories.
