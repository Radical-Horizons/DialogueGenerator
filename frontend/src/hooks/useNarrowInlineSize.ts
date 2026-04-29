import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefCallback,
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
 *
 * **Ref callback (Story 17.8)** : la ref retournée est une *callback ref* pour que
 * `ResizeObserver` s’attache dès que le nœud DOM existe — y compris s’il est rendu
 * conditionnellement après le premier paint (onglet inactif, drawer, modale). Un
 * `useRef` + `useEffect` seul ne se ré-exécute pas quand `ref.current` passe de `null`
 * à un élément sans changement de dépendances du hook.
 */
export function useNarrowInlineSize(
  thresholdPx: number,
  options?: UseNarrowInlineSizeOptions
): {
  ref: RefCallback<HTMLDivElement>
  isNarrow: boolean
} {
  const measureParent = options?.measureParentClientWidth === true
  const observedNodeRef = useRef<HTMLDivElement | null>(null)
  const observedMeasureTargetRef = useRef<HTMLElement | null>(null)
  const resizeObserverRef = useRef<ResizeObserver | null>(null)
  const [isNarrow, setIsNarrow] = useState(false)

  const measure = useCallback(() => {
    const target = observedMeasureTargetRef.current ?? observedNodeRef.current
    if (!target) return
    const w = readLayoutWidthPx(target)
    setIsNarrow(w < thresholdPx)
  }, [thresholdPx])

  const attachToNode = useCallback(
    (node: HTMLDivElement | null) => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null

      if (!node) {
        observedNodeRef.current = null
        observedMeasureTargetRef.current = null
        return
      }

      observedNodeRef.current = node
      const measureTarget = (measureParent ? node.parentElement : node) as HTMLElement | null
      observedMeasureTargetRef.current = measureTarget ?? node

      measure()
      // ~2 frames : laisser le layout se stabiliser après attache ref (AC Story 17.8).
      requestAnimationFrame(() => {
        measure()
        requestAnimationFrame(() => {
          measure()
        })
      })

      const ro = new ResizeObserver(() => {
        measure()
      })
      // IMPORTANT: si on mesure le parent, on doit observer le parent (sinon un resize du parent
      // peut ne pas redimensionner le nœud immédiatement, et on rate la transition narrow → desktop).
      ro.observe(observedMeasureTargetRef.current ?? node)
      resizeObserverRef.current = ro
    },
    [measure, measureParent]
  )

  useLayoutEffect(() => {
    measure()
  }, [measure])

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect()
      resizeObserverRef.current = null
      observedNodeRef.current = null
      observedMeasureTargetRef.current = null
    }
  }, [])

  return { ref: attachToNode, isNarrow }
}
