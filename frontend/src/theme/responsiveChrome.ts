/**
 * Typographie et densité du chrome segmenté (story 17.6 / FR118).
 * Seuil en px : sous cette largeur de *conteneur* (pas le viewport seul),
 * on applique le jeu « colonne étroite ».
 *
 * **Stratégie largeur conteneur (documentée)** : la bascule narrow / confortable
 * repose sur `useNarrowInlineSize` (`ResizeObserver` + mesure via `readLayoutWidthPx`),
 * pas sur des règles CSS `@container`, afin d’avoir le même comportement en runtime et
 * sous Vitest/jsdom (où les container queries et `cqw` sont peu fiables). Le rail
 * segmenté expose quand même `container-type: inline-size` sur le row pour une
 * évolution future en CSS pur si besoin.
 */
export const SEGMENTED_CHROME_COMFORT_MIN_WIDTH_PX = 480

export const segmentedTabTypography = {
  comfortable: {
    fontSizeRem: 0.8,
    buttonPadding: '0.14rem 0.62rem',
    rowGapRem: 0.2,
    rowPadding: '0.14rem 0.5rem',
    tabMinHeightPx: 28,
  },
  narrow: {
    /** Plancher lisibilité ≈ 12px si root 16px */
    fontSizeRem: 0.75,
    buttonPadding: '0.26rem 0.48rem',
    rowGapRem: 0.2,
    rowPadding: '0.32rem 0.42rem',
    /** FR119 : cible tactile sur colonne étroite / mobile */
    tabMinHeightPx: 44,
  },
} as const

/** En-têtes latéraux Dashboard (Contexte GDD / Détails) — alignés sur le rail segmenté central. */
export const panelSideHeaderChrome = {
  comfortable: {
    padding: '0.15rem 0.75rem',
  },
  narrow: {
    padding: '0.32rem 0.75rem',
  },
} as const

/** Bouton chevron de repli des panneaux latéraux (desktop uniquement). */
export const panelCollapseButtonChrome = {
  comfortable: {
    padding: '0.18rem 0.45rem',
    minHeightPx: 28,
    minWidthPx: 28,
  },
  narrow: {
    padding: '0.35rem 0.5rem',
    minHeightPx: 44,
    minWidthPx: 44,
  },
} as const

export const panelHeaderTitleTypography = {
  comfortableFontRem: 0.8,
  narrowFontRem: 0.75,
} as const

/**
 * Libellé vertical des `PanelExpandButton` (rails GDD / Détails) — variante « caption »
 * AC1 : plancher lisibilité ≥ ~12px (`0.75rem` si root 16px).
 */
export const panelExpandRailCaptionTypography = {
  comfortableFontRem: 0.75,
  narrowFontRem: 0.72,
} as const

/**
 * Barre d’outils de l’éditeur de graphe : densité adaptative.
 * Se base sur une mesure de largeur du conteneur (pas le viewport).
 */
export const GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX = 640

/** Même seuil conteneur pour panneau Génération, graphe, etc. */
export const PANEL_COMFORT_MIN_WIDTH_PX = GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX

export const generationPanelChrome = {
  comfortable: {
    containerPadding: '1.35rem',
    sectionTitleFontRem: 0.92,
    labelFontRem: 0.82,
    controlGapRem: 0.45,
    buttonPadding: '0.42rem 0.85rem',
    buttonFontRem: 0.8,
    textareaFontRem: 0.82,
    selectTriggerMinHeightPx: 32,
    selectTriggerPadding: '0.42rem 0.55rem',
    selectTextFontRem: 0.8125,
    dropdownOptionPadding: '0.62rem 0.7rem',
    dropdownOptionFontRem: 0.82,
    structureGridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
    structureGapRem: 0.45,
    cardPadding: '0.85rem',
    iconActionSizePx: 32,
    tabInnerPadding: '0.85rem',
  },
  narrow: {
    containerPadding: '0.6rem 0.7rem',
    sectionTitleFontRem: 0.85,
    labelFontRem: 0.75,
    controlGapRem: 0.32,
    buttonPadding: '0.32rem 0.5rem',
    buttonFontRem: 0.72,
    textareaFontRem: 0.78,
    selectTriggerMinHeightPx: 28,
    selectTriggerPadding: '0.22rem 0.32rem',
    selectTextFontRem: 0.75,
    dropdownOptionPadding: '0.42rem 0.5rem',
    dropdownOptionFontRem: 0.78,
    structureGridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    structureGapRem: 0.32,
    cardPadding: '0.6rem',
    iconActionSizePx: 28,
    tabInnerPadding: '0.6rem',
  },
} as const

/**
 * En-tête et zone scroll de l’éditeur Unity (onglet Édition de dialogues, page dédiée).
 * Même seuil conteneur que {@link PANEL_COMFORT_MIN_WIDTH_PX} via `useNarrowInlineSize` sur la colonne workspace.
 *
 * Story 17.7 (AC #4) : `headerPadding` et `contentPadding` partagent désormais
 * la **même valeur de padding horizontal** afin d'aligner le bord gauche du
 * header (toolbar) avec celui de la première carte du contenu (`ID: START`)
 * à 0 px d'écart (≪ tolérance ±2 px).
 */
const unityDialogueEditorPaddingHorizontal = {
  comfortable: '0.85rem',
  narrow: '0.58rem',
} as const

/**
 * Barre d’onglets du panneau Contexte GDD (`ContextSelector`).
 * Deux densités : `balanced` (harmonie avec recherche / segmented narrow) puis `tight`
 * si `scrollWidth > clientWidth` (drawer ~420px).
 */
export const contextGddTabChrome = {
  balanced: {
    tabPadding: '0.14rem 0.1rem',
    gearPadding: '0.18rem 0.14rem',
    barPadding: '0.14rem 0.42rem 0',
    barGap: '0.16rem',
    borderRadiusPx: 6,
    /** Compromis : plus bas que 44px touch, plus aéré que le compact extrême. */
    tabMinHeightPx: 30,
    tabFontKey: 'accent',
  },
  tight: {
    tabPadding: '0.12rem 0.08rem',
    gearPadding: '0.12rem 0.14rem',
    barPadding: '2px 4px 0',
    barGap: '0.06rem',
    borderRadiusPx: 4,
    tabMinHeightPx: 30,
    tabFontKey: 'caption',
  },
  /** Repasse en `balanced` lorsque la barre est assez large (sidebar desktop). */
  relaxToBalancedMinWidthPx: 480,
} as const

export type ContextGddTabDensity = keyof Pick<typeof contextGddTabChrome, 'balanced' | 'tight'>

/**
 * Onglets segmentés des drawers narrow (ex. panneau Détails) — alignés sur {@link contextGddTabChrome.balanced}.
 */
export const drawerPanelTabChrome = {
  tabPadding: contextGddTabChrome.balanced.tabPadding,
  barPadding: contextGddTabChrome.balanced.barPadding,
  barGap: contextGddTabChrome.balanced.barGap,
  borderRadiusPx: contextGddTabChrome.balanced.borderRadiusPx,
  tabMinHeightPx: contextGddTabChrome.balanced.tabMinHeightPx,
  tabFontKey: contextGddTabChrome.balanced.tabFontKey,
} as const

export const unityDialogueEditorChrome = {
  comfortable: {
    headerPadding: `0.48rem ${unityDialogueEditorPaddingHorizontal.comfortable}`,
    headerLayoutGapRem: 0.42,
    titleFontRem: 0.85,
    subtitleFontRem: 0.75,
    subtitleMarginTopRem: 0.18,
    toolbarGapRem: 0.4,
    toolbarButtonPadding: '0.375rem 0.75rem',
    toolbarButtonFontRem: 0.85,
    toolbarButtonFontWeight: 700,
    toolbarButtonMinHeightPx: 30,
    contentPadding: unityDialogueEditorPaddingHorizontal.comfortable,
    nodeSectionGapRem: 1.25,
    nodeCardPadding: '0.85rem',
    labelFontRem: 0.82,
    inputPadding: '0.45rem 0.55rem',
  },
  narrow: {
    headerPadding: `0.35rem ${unityDialogueEditorPaddingHorizontal.narrow}`,
    headerLayoutGapRem: 0.32,
    titleFontRem: 0.78,
    subtitleFontRem: 0.68,
    subtitleMarginTopRem: 0.12,
    toolbarGapRem: 0.38,
    toolbarButtonPadding: '0.36rem 0.65rem',
    toolbarButtonFontRem: 0.8,
    toolbarButtonFontWeight: 600,
    /** Grille 2×2 : hauteur ~75 % de la cible tactile précédente (44px). */
    toolbarButtonMinHeightPx: 33,
    contentPadding: unityDialogueEditorPaddingHorizontal.narrow,
    nodeSectionGapRem: 0.9,
    nodeCardPadding: '0.58rem',
    labelFontRem: 0.75,
    inputPadding: '0.35rem 0.42rem',
  },
} as const

/**
 * Tokens de base pour modales (titres, corps, légendes) — utilisés dans modules lourds.
 * Préfère une densité compacte même en “comfortable”.
 */
export const modalTypography = {
  comfortable: {
    titleFontRem: 1.05,
    subtitleFontRem: 0.82,
    bodyFontRem: 0.8125,
    smallFontRem: 0.75,
    captionFontRem: 0.6875,
  },
  narrow: {
    titleFontRem: 0.95,
    subtitleFontRem: 0.78,
    bodyFontRem: 0.78,
    smallFontRem: 0.72,
    captionFontRem: 0.67,
  },
} as const

export const graphToolbarChrome = {
  comfortable: {
    containerPadding: '0.55rem 0.7rem',
    containerGapRem: 0.32,
    groupGapRem: 0.32,
    /** Conformité accessibilité (WCAG 2.5.5 / FR119) : 44 px en confortable. */
    touchMinPx: 44,
    buttonFontSizeRem: 0.84,
    buttonPadding: '0.35rem 0.65rem',
    badgeFontSizeRem: 0.8,
    badgePadding: '0.35rem 0.65rem',
    chipFontSizeRem: 0.68,
    chipPadding: '0.08rem 0.3rem',
    dropdownItemFontSizeRem: 0.84,
    dropdownItemPadding: '0.45rem 0.85rem',
  },
  narrow: {
    containerPadding: '0.28rem 0.38rem',
    containerGapRem: 0.18,
    groupGapRem: 0.18,
    touchMinPx: 44,
    /** Plancher lisibilité ≈ 12px si root 16px */
    buttonFontSizeRem: 0.75,
    /** Padding horizontal réduit, min 44px garanti par GRAPH_CHROME_TOUCH */
    buttonPadding: '0.08rem 0.22rem',
    badgeFontSizeRem: 0.75,
    badgePadding: '0.18rem 0.38rem',
    chipFontSizeRem: 0.65,
    chipPadding: '0.02rem 0.18rem',
    dropdownItemFontSizeRem: 0.78,
    dropdownItemPadding: '0.38rem 0.68rem',
  },
} as const

/**
 * Variables CSS pour safe-area (story 17.4). Valeurs `env()` définies sur `:root` dans `App.css`
 * — les inline styles React + jsdom rejettent souvent `env()` directement.
 */
export const shellSafeAreaCssVars = {
  top: '--dg-shell-safe-top',
  right: '--dg-shell-safe-right',
  bottom: '--dg-shell-safe-bottom',
  left: '--dg-shell-safe-left',
} as const
