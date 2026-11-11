/**
 * Chrome de l'éditeur de dialogue (section Éditer) : titre renommable, état de
 * sauvegarde automatique, barre d'actions qui replie dans « Autres » ce qui ne tient pas.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { Link, useInRouterContext } from 'react-router-dom'
import { theme } from '../../theme'
import { redesignFont, redesignText } from '../../theme/redesignTokens'
import { unityDialogueEditorChrome } from '../../theme/responsiveChrome'
import {
  countInlineActions,
  saveStatusLabel,
  type EditorSaveState,
  type UnityDialogueEditorAction,
} from './UnityDialogueEditorLogic'

type EditorChrome = (typeof unityDialogueEditorChrome)[keyof typeof unityDialogueEditorChrome]

const MONO_LABEL: CSSProperties = {
  fontFamily: redesignFont.mono,
  fontSize: '10.5px',
  letterSpacing: '0.05em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
}

export function EditorSaveStatusLabel({ state }: { state: EditorSaveState }) {
  const label = saveStatusLabel(state)
  return (
    <span
      data-testid="unity-dialogue-editor-save-status"
      data-status={state.status}
      role="status"
      aria-live="polite"
      title={state.status === 'error' && state.error ? state.error : label}
      style={{
        ...MONO_LABEL,
        color: state.status === 'error' ? theme.state.error.color : redesignText.label,
      }}
    >
      {label}
    </span>
  )
}

export function ReadOnlyNotice({ reason }: { reason: 'guest' | 'permission' }) {
  const inRouter = useInRouterContext()
  const linkStyle: CSSProperties = { color: redesignText.secondary, textDecoration: 'underline' }
  return (
    <div
      data-testid="unity-dialogue-editor-readonly"
      role="note"
      style={{
        ...MONO_LABEL,
        whiteSpace: 'normal',
        color: redesignText.label,
        padding: '5px 0',
      }}
    >
      {reason === 'guest' ? (
        <>
          Lecture seule · mode invité —{' '}
          {inRouter ? (
            <Link to="/login" style={linkStyle}>
              Connexion
            </Link>
          ) : (
            <a href="/login" style={linkStyle}>
              Connexion
            </a>
          )}{' '}
          pour modifier ce dialogue
        </>
      ) : (
        <>Lecture seule · vous n'avez pas le droit de modifier ce dialogue</>
      )}
    </div>
  )
}

export function EditableDialogueTitle({
  title,
  editable,
  onCommit,
  style,
}: {
  title: string
  editable: boolean
  onCommit: (next: string) => void
  style: CSSProperties
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  const commit = useCallback(() => {
    if (draft === null) return
    const next = draft.trim()
    setDraft(null)
    if (cancelledRef.current) {
      cancelledRef.current = false
      return
    }
    if (next && next !== title) onCommit(next)
  }, [draft, onCommit, title])

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      cancelledRef.current = true
      setDraft(null)
    }
  }

  if (draft !== null) {
    return (
      <input
        aria-label="Titre du dialogue"
        data-testid="unity-dialogue-editor-title-input"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        style={{
          ...style,
          width: '100%',
          boxSizing: 'border-box',
          padding: '2px 5px',
          border: `1px solid ${theme.input.border}`,
          borderRadius: 6,
          backgroundColor: theme.input.background,
          color: theme.input.color,
          font: 'inherit',
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
        }}
      />
    )
  }

  if (!editable) {
    return (
      <div data-testid="unity-dialogue-editor-title" style={style}>
        {title}
      </div>
    )
  }

  return (
    <button
      type="button"
      data-testid="unity-dialogue-editor-title"
      title="Renommer le dialogue"
      onClick={() => {
        cancelledRef.current = false
        setDraft(title)
      }}
      style={{
        ...style,
        display: 'block',
        maxWidth: '100%',
        padding: 0,
        border: 'none',
        background: 'none',
        textAlign: 'left',
        cursor: 'text',
        font: 'inherit',
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
      }}
    >
      {title}
    </button>
  )
}

function actionButtonStyle(chrome: EditorChrome, danger = false): CSSProperties {
  return {
    flexShrink: 0,
    padding: chrome.toolbarButtonPadding,
    minHeight: `${chrome.toolbarButtonMinHeightPx}px`,
    border: `1px solid ${danger ? theme.state.error.border : theme.button.secondary.border}`,
    borderRadius: '6px',
    backgroundColor: danger ? 'transparent' : theme.button.secondary.background,
    color: danger ? theme.state.error.color : theme.button.secondary.color,
    cursor: 'pointer',
    fontSize: `${chrome.toolbarButtonFontRem}rem`,
    fontWeight: chrome.toolbarButtonFontWeight,
    lineHeight: 1.25,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
  }
}

const MORE_LABEL = 'Autres'

export function UnityDialogueEditorActionsBar({
  actions,
  chrome,
  stacked = false,
}: {
  actions: UnityDialogueEditorAction[]
  chrome: EditorChrome
  /** En-tête en colonne (narrow) : la barre prend toute la largeur sous le titre. */
  stacked?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [inlineCount, setInlineCount] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const candidates = actions.filter((a) => !a.overflowOnly)
  const overflowOnly = actions.filter((a) => a.overflowOnly)
  const gapPx = chrome.toolbarGapRem * 16
  const candidateKey = candidates.map((a) => a.label).join('|')

  const measure = useCallback(() => {
    const container = containerRef.current
    const measured = measureRef.current
    if (!container || !measured) return
    const buttons = Array.from(measured.children) as HTMLElement[]
    const moreButton = buttons.pop()
    const widths = buttons.map((b) => b.offsetWidth)
    const next = countInlineActions(
      widths,
      container.clientWidth,
      gapPx,
      moreButton?.offsetWidth ?? 0,
      overflowOnly.length > 0,
    )
    setInlineCount((prev) => (prev === next ? prev : next))
  }, [gapPx, overflowOnly.length])

  useLayoutEffect(() => {
    measure()
  }, [measure, candidateKey])

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => measure())
    observer.observe(container)
    return () => observer.disconnect()
  }, [measure])

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [menuOpen])

  const visibleCount = inlineCount ?? candidates.length
  const inline = candidates.slice(0, visibleCount)
  const overflow = [...candidates.slice(visibleCount), ...overflowOnly]

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      setMenuOpen(false)
      triggerRef.current?.focus()
    }
  }

  return (
    <div
      ref={containerRef}
      className="unity-dialogue-toolbar-actions"
      data-inline-count={visibleCount}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: `${chrome.toolbarGapRem}rem`,
        minWidth: 0,
        flex: stacked ? 'none' : '1 1 0%',
        width: '100%',
      }}
    >
      {inline.map((action) => (
        <button
          key={action.id}
          type="button"
          data-testid={action.testId}
          title={action.title}
          disabled={action.disabled}
          onClick={action.onClick}
          style={{
            ...actionButtonStyle(chrome, action.danger),
            opacity: action.disabled ? 0.6 : 1,
            cursor: action.disabled ? 'not-allowed' : 'pointer',
          }}
        >
          {action.label}
        </button>
      ))}
      {overflow.length > 0 && (
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            ref={triggerRef}
            type="button"
            data-testid="unity-dialogue-editor-more"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            style={actionButtonStyle(chrome)}
          >
            {MORE_LABEL} ▾
          </button>
          {menuOpen && (
            <div
              ref={menuRef}
              role="menu"
              aria-label="Autres actions"
              onKeyDown={onMenuKeyDown}
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 5,
                minWidth: 200,
                padding: '5px 0',
                backgroundColor: theme.background.tertiary,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: 8,
                boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                zIndex: 30,
              }}
            >
              {overflow.map((action, index) => {
                const startsDangerGroup =
                  action.overflowOnly && index > 0 && !overflow[index - 1].overflowOnly
                return (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    data-testid={action.testId}
                    title={action.title}
                    disabled={action.disabled}
                    autoFocus={index === 0}
                    onClick={() => {
                      setMenuOpen(false)
                      action.onClick()
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      padding: '9px 14px',
                      border: 'none',
                      borderTop: startsDangerGroup ? `1px solid ${theme.border.primary}` : 'none',
                      background: 'none',
                      textAlign: 'left',
                      fontSize: `${chrome.toolbarButtonFontRem}rem`,
                      color: action.danger ? theme.state.error.color : theme.text.primary,
                      cursor: action.disabled ? 'not-allowed' : 'pointer',
                      opacity: action.disabled ? 0.6 : 1,
                    }}
                  >
                    {action.label}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
      <div
        ref={measureRef}
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: 'max-content',
          display: 'flex',
          gap: `${chrome.toolbarGapRem}rem`,
          visibility: 'hidden',
          pointerEvents: 'none',
          height: 0,
          overflow: 'hidden',
        }}
      >
        {candidates.map((action) => (
          <span key={action.id} style={actionButtonStyle(chrome, action.danger)}>
            {action.label}
          </span>
        ))}
        <span style={actionButtonStyle(chrome)}>{MORE_LABEL} ▾</span>
      </div>
    </div>
  )
}
