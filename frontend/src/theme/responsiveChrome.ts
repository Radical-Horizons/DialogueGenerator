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
    fontSizeRem: 0.8125,
    buttonPadding: '0.32rem 0.7rem',
    rowGapRem: 0.28,
    rowPadding: '0.4rem 0.55rem',
  },
  narrow: {
    /** Plancher lisibilité ≈ 12px si root 16px */
    fontSizeRem: 0.75,
    buttonPadding: '0.28rem 0.5rem',
    rowGapRem: 0.22,
    rowPadding: '0.34rem 0.45rem',
  },
} as const

export const panelHeaderTitleTypography = {
  comfortableFontRem: 0.84,
  narrowFontRem: 0.775,
} as const

/**
 * Libellé vertical des `PanelExpandButton` (rails GDD / Détails) — variante « caption »
 * AC1 : plancher lisibilité ≥ ~12px (`0.75rem` si root 16px).
 */
export const panelExpandRailCaptionTypography = {
  comfortableFontRem: 0.78,
  narrowFontRem: 0.75,
} as const

/**
 * Barre d’outils de l’éditeur de graphe : densité adaptative.
 * Se base sur une mesure de largeur du conteneur (pas le viewport).
 */
export const GRAPH_TOOLBAR_COMFORT_MIN_WIDTH_PX = 640

export const graphToolbarChrome = {
  comfortable: {
    containerPadding: '0.75rem 1rem',
    containerGapRem: 0.5,
    groupGapRem: 0.5,
    touchMinPx: 44,
    buttonFontSizeRem: 0.9,
    buttonPadding: '0.5rem 1rem',
    badgeFontSizeRem: 0.85,
    badgePadding: '0.4rem 0.75rem',
    chipFontSizeRem: 0.72,
    chipPadding: '0.1rem 0.35rem',
    dropdownItemFontSizeRem: 0.9,
    dropdownItemPadding: '0.5rem 1rem',
  },
  narrow: {
    containerPadding: '0.45rem 0.55rem',
    containerGapRem: 0.35,
    groupGapRem: 0.35,
    touchMinPx: 32,
    /** Plancher lisibilité ≈ 12px si root 16px */
    buttonFontSizeRem: 0.78,
    /** Padding horizontal réduit, min 44px garanti par GRAPH_CHROME_TOUCH */
    buttonPadding: '0.38rem 0.6rem',
    badgeFontSizeRem: 0.78,
    badgePadding: '0.32rem 0.55rem',
    chipFontSizeRem: 0.68,
    chipPadding: '0.08rem 0.28rem',
    dropdownItemFontSizeRem: 0.82,
    dropdownItemPadding: '0.42rem 0.75rem',
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
