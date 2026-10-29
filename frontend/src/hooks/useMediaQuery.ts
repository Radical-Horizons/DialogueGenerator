/**
 * Abonnement à une media query CSS.
 *
 * `useViewportMode` classe en mobile/tablet/desktop ; certaines bascules ont
 * besoin d'un seuil qui ne tombe pas sur ces frontières (écran 2d : la barre
 * basse vit entre 1024 et 1200px, à cheval sur « desktop »).
 */
import { useEffect, useState } from 'react'

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
    return window.matchMedia(query).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setMatches(mql.matches)
    onChange()
    // `addEventListener` sur MediaQueryList : Safari < 14 n'a que `addListener`.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    }
    mql.addListener(onChange)
    return () => mql.removeListener(onChange)
  }, [query])

  return matches
}
