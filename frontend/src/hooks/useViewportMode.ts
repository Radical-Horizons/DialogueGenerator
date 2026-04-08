import { useEffect, useState } from 'react'

export type ViewportMode = 'mobile' | 'tablet' | 'desktop'

function computeViewportMode(width: number): ViewportMode {
  if (width < 768) return 'mobile'
  if (width < 1024) return 'tablet'
  return 'desktop'
}

export function useViewportMode(): ViewportMode {
  const [mode, setMode] = useState<ViewportMode>(() => {
    const w = typeof window !== 'undefined' ? window.innerWidth : 1024
    return computeViewportMode(w)
  })

  useEffect(() => {
    const onResize = () => setMode(computeViewportMode(window.innerWidth))
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return mode
}

