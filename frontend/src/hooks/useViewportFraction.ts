/**
 * Une fraction de la hauteur de fenêtre, bornée — l'équivalent en JS d'un
 * `clamp(min, Nvh, max)` quand la valeur doit être calculée, pas déclarée.
 *
 * Sert aux plafonds de hauteur pilotés en JavaScript (zone d'écriture qui grandit
 * avec son texte) : sur un écran court, un plafond en pixels mangerait tout
 * l'espace utile ; sur un grand écran, il gaspillerait la place disponible.
 */
import { useEffect, useState } from 'react'

interface Bornes {
  min: number
  max: number
}

function calculer(fraction: number, { min, max }: Bornes): number {
  if (typeof window === 'undefined') return min
  return Math.min(Math.max(window.innerHeight * fraction, min), max)
}

export function useViewportFraction(fraction: number, bornes: Bornes): number {
  const [valeur, setValeur] = useState(() => calculer(fraction, bornes))

  const { min, max } = bornes
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onResize = () => setValeur(calculer(fraction, { min, max }))
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [fraction, min, max])

  return valeur
}
