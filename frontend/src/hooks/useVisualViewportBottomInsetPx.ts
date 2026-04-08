import { useEffect, useState } from 'react'

/**
 * Hauteur (px) de la zone du layout masquée sous le bas du visual viewport
 * (clavier logiciel, barres système). 0 si pas de `visualViewport` ou si tout est visible.
 */
export function computeVisualViewportBottomInsetPx(): number {
  if (typeof window === 'undefined') return 0
  const vv = window.visualViewport
  if (!vv) return 0
  const layoutHeight = window.innerHeight
  const visibleBottom = vv.offsetTop + vv.height
  return Math.max(0, Math.round(layoutHeight - visibleBottom))
}

/**
 * Suit `window.visualViewport` pour exposer un padding-bottom shell quand le clavier
 * réduit la hauteur utile (story 17.4 / FR118–FR120).
 *
 * @param enabled - Désactiver sur desktop pour éviter du bruit inutile.
 */
export function useVisualViewportBottomInsetPx(enabled: boolean): number {
  const [px, setPx] = useState(0)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setPx(0)
      return
    }

    const vv = window.visualViewport
    const update = () => setPx(computeVisualViewportBottomInsetPx())
    update()

    if (vv) {
      vv.addEventListener('resize', update)
      vv.addEventListener('scroll', update)
      return () => {
        vv.removeEventListener('resize', update)
        vv.removeEventListener('scroll', update)
      }
    }

    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [enabled])

  return enabled ? px : 0
}
