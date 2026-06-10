/**
 * Enveloppe pour outils graphe : rendu en portail sur document.body, position fixed,
 * barre de titre déplaçable, mémorisation optionnelle de la position (session).
 */
import type React from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { theme } from '../../theme'
import { GRAPH_TOOL_FLOATING_PANEL_Z_INDEX } from './graphToolbarConstants'

const POS_PREFIX = 'graph-tool-float-pos:'

function readStoredPosition(storageKey: string): { left: number; top: number } | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(`${POS_PREFIX}${storageKey}`)
    if (!raw) return null
    const j = JSON.parse(raw) as unknown
    if (
      j &&
      typeof j === 'object' &&
      'left' in j &&
      'top' in j &&
      typeof (j as { left: unknown }).left === 'number' &&
      typeof (j as { top: unknown }).top === 'number'
    ) {
      return { left: (j as { left: number }).left, top: (j as { top: number }).top }
    }
  } catch {
    /* ignore */
  }
  return null
}

function writeStoredPosition(storageKey: string, left: number, top: number): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(`${POS_PREFIX}${storageKey}`, JSON.stringify({ left, top }))
  } catch {
    /* ignore */
  }
}

function clampToViewport(
  left: number,
  top: number,
  panelW: number,
  panelH: number
): { left: number; top: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 800
  const vh = typeof window !== 'undefined' ? window.innerHeight : 600
  const margin = 8
  const w = Math.max(120, panelW)
  const h = Math.max(80, panelH)
  const maxL = Math.max(margin, vw - w - margin)
  const maxT = Math.max(margin, vh - h - margin)
  return {
    left: Math.min(maxL, Math.max(margin, left)),
    top: Math.min(maxT, Math.max(margin, top)),
  }
}

export interface GraphToolFloatingShellProps {
  /** Titre affiché dans la barre déplaçable (à gauche). */
  title: React.ReactNode
  onClose: () => void
  children: React.ReactNode
  /** data-testid sur le conteneur principal. */
  dataTestId?: string
  /** Position initiale si rien en session. */
  initialOffset: { top: number; left: number }
  /** Mémoriser la position pour cette clé (sessionStorage). */
  storageKey?: string
  width?: string
  maxHeight?: string
  /** Boutons entre titre et fermer (ex. ⚙ Règles). */
  headerEnd?: React.ReactNode
  /** Styles du conteneur externe (bordure, fond global). */
  containerStyle?: React.CSSProperties
  /** Styles de la barre titre (fond / bordure). */
  headerBarStyle?: React.CSSProperties
  /** data-testid du bouton Fermer (rétrocompat tests). */
  closeButtonTestId?: string
  /** aria-label du bouton Fermer. */
  closeAriaLabel?: string
  /** Contenu du bouton fermer (défaut : « Fermer »). */
  closeButtonChildren?: React.ReactNode
  closeButtonStyle?: React.CSSProperties
}

/**
 * Fenêtre flottante hors du cadre scroll/overflow du graphe : portail + fixed + drag.
 */
export function GraphToolFloatingShell({
  title,
  onClose,
  children,
  dataTestId,
  initialOffset,
  storageKey,
  width = 'min(420px, calc(100vw - 24px))',
  maxHeight = 'min(72vh, 560px)',
  headerEnd,
  containerStyle,
  headerBarStyle,
  closeButtonTestId,
  closeAriaLabel = 'Fermer',
  closeButtonChildren = 'Fermer',
  closeButtonStyle,
}: GraphToolFloatingShellProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number }>(() => {
    if (storageKey) {
      const s = readStoredPosition(storageKey)
      if (s) return s
    }
    return { left: initialOffset.left, top: initialOffset.top }
  })

  const clampNow = useCallback(() => {
    const el = panelRef.current
    if (!el || typeof window === 'undefined') return
    const r = el.getBoundingClientRect()
    setPos((p) => clampToViewport(p.left, p.top, r.width, r.height))
  }, [])

  useLayoutEffect(() => {
    clampNow()
  }, [clampNow])

  useEffect(() => {
    const onResize = () => {
      clampNow()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clampNow])

  const dragState = useRef<{
    startX: number
    startY: number
    origLeft: number
    origTop: number
  } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const onHeaderPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return
      const t = e.target as HTMLElement
      if (t.closest('button') || t.closest('a') || t.closest('input') || t.closest('select')) {
        return
      }
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        origLeft: pos.left,
        origTop: pos.top,
      }
      setIsDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [pos.left, pos.top]
  )

  const onHeaderPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return
    const dx = e.clientX - dragState.current.startX
    const dy = e.clientY - dragState.current.startY
    const el = panelRef.current
    const w = el?.offsetWidth ?? 400
    const h = el?.offsetHeight ?? 300
    const next = clampToViewport(
      dragState.current.origLeft + dx,
      dragState.current.origTop + dy,
      w,
      h
    )
    setPos(next)
  }, [])

  const endDrag = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      setIsDragging(false)
      if (!dragState.current) return
      dragState.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* already released */
      }
      if (storageKey && panelRef.current) {
        const r = panelRef.current.getBoundingClientRect()
        writeStoredPosition(storageKey, r.left, r.top)
      }
    },
    [storageKey]
  )

  if (typeof document === 'undefined' || !document.body) {
    return null
  }

  const node = (
    <div
      ref={panelRef}
      data-testid={dataTestId}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width,
        maxHeight,
        zIndex: GRAPH_TOOL_FLOATING_PANEL_Z_INDEX,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: theme.background.panel,
        border: `1px solid ${theme.border.primary}`,
        borderRadius: 8,
        boxShadow: '0 8px 28px rgba(0, 0, 0, 0.45)',
        color: theme.text.primary,
        ...containerStyle,
      }}
    >
      <div
        role="toolbar"
        aria-label="Déplacer la fenêtre"
        title="Glisser pour déplacer"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '0.5rem 0.65rem',
          borderBottom: `1px solid ${theme.border.primary}`,
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none',
          backgroundColor: theme.background.tertiary,
          ...headerBarStyle,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            minWidth: 0,
            fontSize: '0.9rem',
            fontWeight: 600,
          }}
        >
          <span aria-hidden style={{ opacity: 0.45, fontSize: '0.85rem', letterSpacing: -2 }}>
            ⠿
          </span>
          <div style={{ minWidth: 0 }}>{title}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {headerEnd}
          <button
            type="button"
            data-testid={closeButtonTestId}
            aria-label={closeAriaLabel}
            onClick={onClose}
            style={{
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 6,
              background: theme.button.default.background,
              color: theme.text.primary,
              cursor: 'pointer',
              padding: '0.25rem 0.5rem',
              fontSize: '0.8rem',
              ...closeButtonStyle,
            }}
          >
            {closeButtonChildren}
          </button>
        </div>
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '0.75rem',
          fontSize: '0.9rem',
        }}
      >
        {children}
      </div>
    </div>
  )

  return createPortal(node, document.body)
}
