/**
 * Composant pour créer des panneaux redimensionnables avec localStorage.
 */
import {
  forwardRef,
  useEffect,
  useRef,
  useCallback,
  useImperativeHandle,
  useState,
  type ReactNode,
} from 'react'
import React from 'react'
import { theme } from '../../theme'

export interface ResizablePanelsRef {
  getSizes: () => number[]
  setSizes: (newSizes: number[], options?: { persist?: boolean }) => void
}

interface ResizablePanelsProps {
  children: ReactNode[]
  storageKey?: string
  defaultSizes?: number[]
  minSizes?: number[]
  direction?: 'horizontal' | 'vertical'
  style?: React.CSSProperties
  onSizesChange?: (sizes: number[]) => void
  renderResizer?: (index: number) => React.ReactNode
}

export const ResizablePanels = forwardRef<ResizablePanelsRef, ResizablePanelsProps>(function ResizablePanels(
  {
    children,
    storageKey,
    defaultSizes = children.map(() => 1),
    minSizes = children.map(() => 100),
    direction = 'horizontal',
    style,
    onSizesChange,
    renderResizer,
  }: ResizablePanelsProps,
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Helper pour normaliser les tailles
  const normalizeSizesHelper = useCallback((newSizes: number[]): number[] => {
    const total = newSizes.reduce((sum, size) => sum + size, 0)
    if (total === 0) return newSizes
    return newSizes.map((size) => (size / total) * 100)
  }, [])
  
  const [sizes, setSizes] = useState<number[]>(() => {
    let initialSizes = defaultSizes
    
    if (storageKey) {
      try {
        const stored = localStorage.getItem(`resizable_${storageKey}`)
        if (stored) {
          const parsed = JSON.parse(stored)
          // Utiliser defaultSizes.length au lieu de children.length car plus stable
          if (Array.isArray(parsed) && parsed.length === defaultSizes.length) {
            initialSizes = parsed
          }
        }
      } catch {
        // Ignore errors
      }
    }
    
    // Normaliser les tailles initiales pour s'assurer qu'elles totalisent 100%
    return normalizeSizesHelper(initialSizes)
  })

  const [isDragging, setIsDragging] = useState<number | null>(null)
  const [startPos, setStartPos] = useState(0)
  const [startSizes, setStartSizes] = useState<number[]>([])
  const sizesToSaveRef = useRef<number[] | null>(null)

  const normalizeSizes = useCallback(
    (newSizes: number[]): number[] => {
      const total = newSizes.reduce((sum, size) => sum + size, 0)
      return newSizes.map((size) => (size / total) * 100)
    },
    []
  )

  const persistSizes = useCallback(
    (sizesToPersist: number[]) => {
      if (!storageKey) return
      try {
        localStorage.setItem(`resizable_${storageKey}`, JSON.stringify(sizesToPersist))
      } catch (err) {
        console.error('Erreur lors de la sauvegarde des tailles de panneaux:', err)
      }
    },
    [storageKey]
  )

  const applySizes = useCallback(
    (newSizes: number[], options?: { persist?: boolean }) => {
      const normalized = normalizeSizesHelper(newSizes)
      setSizes(normalized)
      onSizesChange?.(normalized)
      if (options?.persist !== false) {
        persistSizes(normalized)
      }
    },
    [normalizeSizesHelper, onSizesChange, persistSizes]
  )

  useImperativeHandle(
    ref,
    () => ({
      getSizes: () => sizes,
      setSizes: (newSizes: number[], options?: { persist?: boolean }) => {
        applySizes(newSizes, options)
      },
    }),
    [applySizes, sizes]
  )

  const handleMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault()
      setIsDragging(index)
      const pos = direction === 'horizontal' ? e.clientX : e.clientY
      setStartPos(pos)
      setStartSizes([...sizes])
    },
    [direction, sizes]
  )

  useEffect(() => {
    if (isDragging === null || !containerRef.current) return

    const handleMouseMove = (e: MouseEvent) => {
      const pos = direction === 'horizontal' ? e.clientX : e.clientY
      const delta = pos - startPos
      const containerSize =
        direction === 'horizontal'
          ? containerRef.current!.clientWidth
          : containerRef.current!.clientHeight

      const deltaPercent = (delta / containerSize) * 100

      const newSizes = [...startSizes]
      const leftSize = newSizes[isDragging]
      const rightSize = newSizes[isDragging + 1]

      const leftMin = (minSizes[isDragging] / containerSize) * 100
      const rightMin = (minSizes[isDragging + 1] / containerSize) * 100

      const newLeftSize = Math.max(
        leftMin,
        Math.min(leftSize + deltaPercent, 100 - rightMin)
      )
      const newRightSize = Math.max(
        rightMin,
        Math.min(rightSize - deltaPercent, 100 - leftMin)
      )

      newSizes[isDragging] = newLeftSize
      newSizes[isDragging + 1] = newRightSize

      const normalized = normalizeSizes(newSizes)
      setSizes(normalized)
      onSizesChange?.(normalized)
      // Garder les tailles à sauvegarder pour handleMouseUp
      sizesToSaveRef.current = normalized
    }

    const handleMouseUp = () => {
      setIsDragging(null)
      // Sauvegarder immédiatement à la fin du drag
      if (sizesToSaveRef.current) {
        persistSizes(sizesToSaveRef.current)
        sizesToSaveRef.current = null
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, startPos, startSizes, direction, minSizes, normalizeSizes, persistSizes, onSizesChange])

  const isHorizontal = direction === 'horizontal'

  const renderedElements: React.ReactElement[] = []
  
  children.forEach((child, index) => {
    renderedElements.push(
      <div
        key={`panel-${index}`}
        style={{
          width: isHorizontal ? `${sizes[index]}%` : '100%',
          height: isHorizontal ? '100%' : `${sizes[index]}%`,
          overflow: 'hidden',
          position: 'relative',
          flexShrink: 0,
          flexGrow: 0,
        }}
      >
        {child}
      </div>
    )
    
    if (index < children.length - 1) {
      renderedElements.push(
        <div
          key={`resizer-${index}`}
          onMouseDown={(e) => handleMouseDown(index, e)}
          style={{
            [isHorizontal ? 'width' : 'height']: '6px',
            [isHorizontal ? 'height' : 'width']: '100%',
            // Refonte : la séparation visible est un **filet d'1px**, pas une bande de 6px.
            // Les 6px restent la zone de préhension ; seule la bordure se voit, et elle
            // ne s'accentue qu'au survol ou pendant le glissement.
            backgroundColor: 'transparent',
            [isHorizontal ? 'borderLeft' : 'borderTop']: `1px solid ${
              isDragging === index ? theme.button.primary.background : theme.border.primary
            }`,
            cursor: isHorizontal ? 'col-resize' : 'row-resize',
            position: 'relative',
            zIndex: 10,
            flexShrink: 0,
            flexGrow: 0,
            transition: isDragging === index ? 'none' : 'border-color 0.2s',
          }}
          onMouseEnter={(e) => {
            if (isDragging !== index) {
              e.currentTarget.style[isHorizontal ? 'borderLeftColor' : 'borderTopColor'] =
                theme.button.primary.background
            }
          }}
          onMouseLeave={(e) => {
            if (isDragging !== index) {
              e.currentTarget.style[isHorizontal ? 'borderLeftColor' : 'borderTopColor'] =
                theme.border.primary
            }
          }}
        >
          {renderResizer && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                pointerEvents: 'none',
              }}
            >
              <div style={{ pointerEvents: 'auto' }}>
                {renderResizer(index)}
              </div>
            </div>
          )}
        </div>
      )
    }
  })

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        height: '100%',
        width: '100%',
        overflow: 'hidden',
        position: 'relative',
        ...style,
      }}
    >
      {renderedElements}
    </div>
  )
})

