/**
 * Place réservée par la colonne centrale aux rails latéraux repliés.
 *
 * Les rails sont posés en overlay (`position: absolute`) sur la colonne centrale.
 * Tant que la colonne de lecture est centrée avec des marges (repos, bureau), ils
 * tombent dans ces marges. Mais la comparaison des options (2b) occupe toute la
 * largeur, et en étroit il n'y a aucune marge : sans réserve, le rail recouvrait le
 * titre de scène et le début des options (mesuré : texte à x=6 sous un rail de 52 px).
 */

/** Rail « riche » du mode écriture et de la comparaison : compteur, initiales, total. */
export const WRITING_MODE_RAIL_WIDTH_PX = 52

/** Pilule de repli (« GDD », « Détails ») : 4 px d'écart + 24 px de pilule + 4 px d'air. */
export const RAIL_GUTTER_PX = 32

export interface RailReserveInput {
  /** Le panneau de ce côté est replié : un rail ou une pilule s'affiche. */
  collapsed: boolean
  writingMode: boolean
  /** Un lot de plusieurs options est en cours de comparaison (écran 2b). */
  comparisonActive: boolean
  /** Colonne étroite ou écran graphe : aucune marge ne protège le contenu. */
  narrowOrGraph: boolean
}

/** Marge intérieure à donner à la colonne centrale de ce côté, ou `undefined`. */
export function centerColumnRailPadding(
  side: 'left' | 'right',
  { collapsed, writingMode, comparisonActive, narrowOrGraph }: RailReserveInput
): number | undefined {
  if (!collapsed) return undefined
  // Le rail riche remplace la pilule : à gauche en écriture et en comparaison,
  // à droite en écriture seulement (même règle que son affichage dans Dashboard).
  const richRail = side === 'left' ? writingMode || comparisonActive : writingMode
  if (richRail) return WRITING_MODE_RAIL_WIDTH_PX
  // La comparaison prend toute la largeur : la pilule y tombe sur la dernière colonne.
  return narrowOrGraph || comparisonActive ? RAIL_GUTTER_PX : undefined
}
