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
