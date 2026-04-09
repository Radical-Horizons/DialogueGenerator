/**
 * Échelle typographique UI (rem, relatif à la taille de `html`).
 *
 * La base est ajustée dans `index.css` (desktop ~93.75 %, ≤1024px ~87.5 %, ≤640px ~84.375 %)
 * pour une densité un peu plus compacte et un rendu cohérent sur petits écrans.
 *
 * Préférer ces constantes aux `fontSize` en dur dans le chrome partagé (Header, listes, champs).
 */
export const uiFontRem = {
  /** Méta, hints, kbd */
  caption: 0.6875,
  /** Secondaire dense (sous-titres liste, dates) */
  small: 0.75,
  /** Corps interface standard */
  body: 0.8125,
  /** Labels de formulaire, entrées secondaires */
  label: 0.8125,
  /** Texte d’accent (descriptions courtes, items menu) */
  accent: 0.8125,
  /** Titres de section compacts, ligne principale liste */
  section: 0.875,
  /** Marque / titre barre d’app */
  title: 1.05,
  /** Titre ligne liste Unity (explicite vs héritage global) */
  unityListTitle: 0.8,
} as const

export type UiFontRemKey = keyof typeof uiFontRem

/** `fontSize` inline React : `"0.8125rem"` */
export function remSize(key: UiFontRemKey): `${number}rem` {
  return `${uiFontRem[key]}rem`
}
