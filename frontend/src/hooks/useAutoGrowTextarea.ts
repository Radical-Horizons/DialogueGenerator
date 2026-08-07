/**
 * Fait grandir un `<textarea>` avec son contenu, jusqu'à un plafond.
 *
 * Un `rows` fixe donne une zone d'écriture figée : le brief défilait dans 8 lignes
 * alors que la colonne avait 200 px de vide en dessous. Ici la zone prend la place
 * dont le texte a besoin, et ne défile qu'une fois le plafond atteint.
 */
import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'

interface AutoGrowOptions {
  /** Hauteur minimale, pour que la zone vide reste une invitation à écrire. */
  minHeightPx: number
  /** Plafond au-delà duquel la zone défile au lieu de pousser le reste de l'écran. */
  maxHeightPx: number
}

/**
 * Arrondit une hauteur au nombre entier de lignes qu'elle peut contenir.
 *
 * Sans cet arrondi, le plafond tombe au hasard dans une ligne et la dernière
 * apparaît tranchée en deux — le défaut se voit d'autant plus que la barre de
 * défilement est discrète.
 */
function arrondirAuxLignes(hauteur: number, el: HTMLTextAreaElement, minimum: number): number {
  const cs = getComputedStyle(el)
  const ligne = parseFloat(cs.lineHeight)
  if (!Number.isFinite(ligne) || ligne <= 0) return hauteur
  const cadre =
    parseFloat(cs.paddingTop) +
    parseFloat(cs.paddingBottom) +
    parseFloat(cs.borderTopWidth) +
    parseFloat(cs.borderBottomWidth)
  const lignes = Math.floor((hauteur - cadre) / ligne)
  if (lignes < 1) return hauteur
  return Math.max(minimum, Math.round(lignes * ligne + cadre))
}

/**
 * Ajuste la hauteur à chaque changement de `value` ou d'option.
 *
 * `height: auto` avant la mesure est indispensable : sans cette remise à zéro,
 * `scrollHeight` ne redescend jamais quand on efface du texte — la zone resterait
 * à sa taille maximale historique.
 */
export function useAutoGrowTextarea(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  { minHeightPx, maxHeightPx }: AutoGrowOptions
): void {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const voulue = el.scrollHeight
    const plafond = arrondirAuxLignes(maxHeightPx, el, minHeightPx)
    const hauteur = Math.min(Math.max(voulue, minHeightPx), plafond)
    el.style.height = `${hauteur}px`
    el.style.overflowY = voulue > plafond ? 'auto' : 'hidden'
  }, [ref, value, minHeightPx, maxHeightPx])
}
