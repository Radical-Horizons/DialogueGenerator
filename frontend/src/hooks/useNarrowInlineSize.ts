import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'

export type UseNarrowInlineSizeOptions = {
  /**
   * true : mesurer la coque parente directe (panneau % du ResizablePanels).
   * false : mesurer à partir du nœud référencé (racine Tabs).
   */
  measureParentClientWidth?: boolean
}

/**
 * Largeur approximative pour le chrome quand jsdom ne remplit pas offsetWidth (flex / %).
 * Parcourt style.width en px ou % jusqu’à un ancêtre dimensionné.
 */
function readLayoutWidthPx(el: HTMLElement | null): number {
  if (!el) return 0
  if (el.offsetWidth > 0) return el.offsetWidth
  if (el.clientWidth > 0) return el.clientWidth
  const sw = el.style.width
  if (typeof sw === 'string' && sw.endsWith('px')) {
    const px = parseInt(sw, 10)
    if (!Number.isNaN(px) && px > 0) return px
  }
  if (typeof sw === 'string' && sw.endsWith('%')) {
    const pw = readLayoutWidthPx(el.parentElement)
    if (pw > 0) return Math.max(0, Math.round((parseFloat(sw) / 100) * pw))
  }
  return readLayoutWidthPx(el.parentElement)
}

/**
 * Détecte si l’élément référencé est plus étroit qu’un seuil (largeur utile colonne / rail).
 * Utilisé pour le chrome segmenté et les titres de panneau (story 17.6).
 */
export function useNarrowInlineSize(
  thresholdPx: number,
  options?: UseNarrowInlineSizeOptions
): {
  ref: RefObject<HTMLDivElement | null>
  isNarrow: boolean
} {
  const measureParent = options?.measureParentClientWidth === true
  const ref = useRef<HTMLDivElement | null>(null)
  const [isNarrow, setIsNarrow] = useState(false)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    const target = measureParent ? el.parentElement : el
    const w = readLayoutWidthPx(target ?? el)
    setIsNarrow(w < thresholdPx)
  }, [thresholdPx, measureParent])

  useLayoutEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      measure()
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
    }
  }, [measure])

  return { ref, isNarrow }
}
