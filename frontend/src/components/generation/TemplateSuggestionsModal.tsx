/**
 * Modal plein écran des suggestions de templates (Story 6.9).
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { theme } from '../../theme'
import { generationPanelChrome, modalTypography } from '../../theme/responsiveChrome'
import {
  redesignControl,
  redesignRadius,
  redesignSpacing,
  redesignSurface,
  redesignText,
} from '../../theme/redesignTokens'
import { TOUCH_TARGET_MIN_PX } from '../../constants'
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext'
import { suggestTemplatesApi } from '../../api/templates'
import type { TemplateSuggestion, TemplateSuggestionRequest } from '../../types/template'

export interface TemplateSuggestionsModalProps {
  isOpen: boolean
  onClose: () => void
  request: TemplateSuggestionRequest
  onLoad: (item: TemplateSuggestion) => void | Promise<void>
}

function sourceLabel(item: TemplateSuggestion): string {
  if (item.source === 'prebuilt') {
    return 'Pré-built'
  }
  if (item.source === 'marketplace') {
    return 'Marketplace'
  }
  if (item.relation === 'granted') {
    return 'Partagé'
  }
  if (item.relation === 'legacy') {
    return 'Legacy'
  }
  return 'Mes templates'
}

export function TemplateSuggestionsModal({
  isOpen,
  onClose,
  request,
  onLoad,
}: TemplateSuggestionsModalProps) {
  const isNarrow = useGenerationPanelNarrow()
  const chrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable
  const type = isNarrow ? modalTypography.narrow : modalTypography.comfortable
  const [items, setItems] = useState<TemplateSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const loadSeq = useRef(0)

  const loadSuggestions = useCallback(async () => {
    const seq = ++loadSeq.current
    setIsLoading(true)
    setError(null)
    try {
      const next = await suggestTemplatesApi(request)
      if (seq !== loadSeq.current) {
        return
      }
      setItems(next)
    } catch {
      if (seq !== loadSeq.current) {
        return
      }
      setError('Impossible de charger les suggestions')
      setItems([])
    } finally {
      if (seq === loadSeq.current) {
        setIsLoading(false)
      }
    }
  }, [request])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    setItems([])
    setError(null)
    setBusyId(null)
    setIsLoading(true)
    void loadSuggestions()
  }, [isOpen, loadSuggestions])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  const buttonStyle: CSSProperties = {
    padding: chrome.buttonPadding,
    minHeight: TOUCH_TARGET_MIN_PX,
    backgroundColor: theme.button.default.background,
    border: `1px solid ${theme.border.secondary}`,
    borderRadius: `${redesignRadius.control}px`,
    color: theme.button.default.color,
    cursor: 'pointer',
    fontSize: `${chrome.buttonFontRem}rem`,
  }

  return (
    <div
      data-testid="template-suggestions-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Suggestions de templates"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '5vh',
        paddingBottom: '5vh',
        overflowY: 'auto',
        boxSizing: 'border-box',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: redesignSurface.panel,
          border: `1px solid ${redesignControl.border}`,
          borderRadius: redesignRadius.frame,
          width: '90%',
          maxWidth: '1200px',
          maxHeight: 'min(90vh, calc(100vh - 10vh))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            padding: `${redesignSpacing.md}px ${redesignSpacing.lg}px`,
            borderBottom: `1px solid ${theme.border.secondary}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: `${type.titleFontRem}rem`,
              color: redesignText.strong,
            }}
          >
            Suggestions
          </h2>
          <button
            type="button"
            data-testid="suggestions-close-btn"
            onClick={onClose}
            style={buttonStyle}
          >
            Fermer
          </button>
        </div>

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: `${redesignSpacing.md}px ${redesignSpacing.lg}px`,
          }}
        >
          {isLoading ? (
            <div data-testid="suggestions-loading">Chargement…</div>
          ) : error ? (
            <div data-testid="suggestions-error">{error}</div>
          ) : items.length === 0 ? (
            <div data-testid="suggestions-empty">
              Aucune suggestion. Ajoutez un brief, un personnage ou un lieu.
            </div>
          ) : (
            items.map((item) => (
              <div
                key={`${item.source}-${item.id}`}
                data-testid="suggestion-item"
                data-suggestion-source={item.source}
                data-suggestion-id={item.id}
                style={{
                  padding: chrome.dropdownOptionPadding,
                  border: `1px solid ${theme.border.secondary}`,
                  borderRadius: `${redesignRadius.control}px`,
                  marginBottom: '0.5rem',
                  display: 'flex',
                  flexDirection: isNarrow ? 'column' : 'row',
                  alignItems: isNarrow ? 'stretch' : 'flex-start',
                  gap: '0.75rem',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                      alignItems: 'center',
                    }}
                  >
                    <strong data-testid="suggestion-name">{item.name}</strong>
                    <span data-testid="suggestion-badge">Suggéré pour votre contexte</span>
                    <span data-testid="suggestion-score">{item.score}%</span>
                    <span data-testid="suggestion-source">{sourceLabel(item)}</span>
                  </div>
                  <ul data-testid="suggestion-reasons" style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem' }}>
                    {item.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
                <button
                  type="button"
                  data-testid="suggestion-load-btn"
                  disabled={busyId === item.id}
                  onClick={async () => {
                    setBusyId(item.id)
                    try {
                      await onLoad(item)
                      onClose()
                    } catch {
                      // Apply 6.3 a échoué : le toast est déjà posé, on reste ouvert.
                    } finally {
                      setBusyId(null)
                    }
                  }}
                  style={{
                    ...buttonStyle,
                    minWidth: isNarrow ? undefined : '7rem',
                  }}
                >
                  Charger
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
