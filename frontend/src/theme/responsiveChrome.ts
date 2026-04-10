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
    buttonPadding: '0.3rem 0.62rem',
    rowGapRem: 0.26,
    rowPadding: '0.36rem 0.5rem',
  },
  narrow: {
    /** Plancher lisibilité ≈ 12px si root 16px */
    fontSizeRem: 0.75,
    buttonPadding: '0.26rem 0.48rem',
    rowGapRem: 0.2,
    rowPadding: '0.32rem 0.42rem',
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
 */
export const unityDialogueEditorChrome = {
  comfortable: {
    headerPadding: '0.48rem 0.65rem',
    headerLayoutGapRem: 0.42,
    titleFontRem: 0.85,
    subtitleFontRem: 0.75,
    subtitleMarginTopRem: 0.18,
    toolbarGapRem: 0.35,
    toolbarButtonPadding: '0.35rem 0.62rem',
    toolbarButtonFontRem: 0.78,
    toolbarButtonFontWeight: 700,
    contentPadding: '0.85rem',
    nodeSectionGapRem: 1.25,
    nodeCardPadding: '0.85rem',
    labelFontRem: 0.82,
    inputPadding: '0.45rem 0.55rem',
  },
  narrow: {
    headerPadding: '0.35rem 0.48rem',
    headerLayoutGapRem: 0.32,
    titleFontRem: 0.78,
    subtitleFontRem: 0.68,
    subtitleMarginTopRem: 0.12,
    toolbarGapRem: 0.26,
    toolbarButtonPadding: '0.26rem 0.42rem',
    toolbarButtonFontRem: 0.7,
    toolbarButtonFontWeight: 600,
    contentPadding: '0.58rem',
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
    containerPadding: '0.65rem 0.85rem',
    containerGapRem: 0.42,
    groupGapRem: 0.42,
    touchMinPx: 44,
    buttonFontSizeRem: 0.84,
    buttonPadding: '0.42rem 0.85rem',
    badgeFontSizeRem: 0.8,
    badgePadding: '0.35rem 0.65rem',
    chipFontSizeRem: 0.68,
    chipPadding: '0.08rem 0.3rem',
    dropdownItemFontSizeRem: 0.84,
    dropdownItemPadding: '0.45rem 0.85rem',
  },
  narrow: {
    containerPadding: '0.42rem 0.5rem',
    containerGapRem: 0.32,
    groupGapRem: 0.32,
    touchMinPx: 44,
    /** Plancher lisibilité ≈ 12px si root 16px */
    buttonFontSizeRem: 0.75,
    /** Padding horizontal réduit, min 44px garanti par GRAPH_CHROME_TOUCH */
    buttonPadding: '0.35rem 0.55rem',
    badgeFontSizeRem: 0.75,
    badgePadding: '0.28rem 0.5rem',
    chipFontSizeRem: 0.65,
    chipPadding: '0.06rem 0.25rem',
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
