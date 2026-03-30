/**
 * Modal détail section GDD + aperçu généré surligné (Story 3.7, AC#3).
 */
import { useEffect, useMemo, type ReactNode } from 'react'
import { theme } from '../../theme'
import { buildHighlightRanges, type TextRange } from '../../utils/textHighlightRanges'

export interface ContextSectionUsageModalProps {
  open: boolean
  onClose: () => void
  sectionTitle: string
  entityLabel: string
  excerpt: string
  generatedPlainPreview: string
}

function renderHighlighted(text: string, ranges: TextRange[]) {
  if (!ranges.length) {
    return <span>{text}</span>
  }
  const parts: ReactNode[] = []
  let i = 0
  let k = 0
  for (const r of ranges) {
    if (r.start > i) {
      parts.push(<span key={`t-${k++}`}>{text.slice(i, r.start)}</span>)
    }
    parts.push(
      <mark
        key={`m-${k++}`}
        data-testid="context-usage-highlight-mark"
        style={{
          backgroundColor: theme.state.info.background,
          color: theme.state.info.color,
          padding: '0 0.1em',
        }}
      >
        {text.slice(r.start, r.end)}
      </mark>
    )
    i = r.end
  }
  if (i < text.length) {
    parts.push(<span key={`t-${k++}`}>{text.slice(i)}</span>)
  }
  return <>{parts}</>
}

export function ContextSectionUsageModal({
  open,
  onClose,
  sectionTitle,
  entityLabel,
  excerpt,
  generatedPlainPreview,
}: ContextSectionUsageModalProps) {
  const ranges = useMemo(
    () => buildHighlightRanges(generatedPlainPreview, excerpt),
    [generatedPlainPreview, excerpt]
  )

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      data-testid="context-section-usage-modal"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.45)',
        zIndex: 10020,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="context-section-usage-modal-title"
        tabIndex={-1}
        style={{
          backgroundColor: theme.background.panel,
          color: theme.text.primary,
          maxWidth: 'min(640px, 100%)',
          maxHeight: '85vh',
          overflow: 'auto',
          borderRadius: 8,
          border: `1px solid ${theme.border.primary}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          padding: '1rem 1.25rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: '0.75rem',
            marginBottom: '0.75rem',
          }}
        >
          <h3
            id="context-section-usage-modal-title"
            style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}
          >
            {sectionTitle} — {entityLabel}
          </h3>
          <button
            type="button"
            data-testid="context-section-usage-modal-close"
            onClick={onClose}
            style={{
              flexShrink: 0,
              cursor: 'pointer',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 4,
              background: theme.background.secondary,
              color: theme.text.primary,
              padding: '0.25rem 0.5rem',
            }}
          >
            Fermer
          </button>
        </div>
        <section style={{ marginBottom: '1rem' }}>
          <div
            style={{
              fontSize: '0.75rem',
              color: theme.text.secondary,
              marginBottom: '0.35rem',
            }}
          >
            Extrait injecté
          </div>
          <pre
            data-testid="context-section-usage-modal-excerpt"
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              fontSize: '0.8rem',
              padding: '0.5rem',
              background: theme.background.secondary,
              borderRadius: 4,
            }}
          >
            {excerpt}
          </pre>
        </section>
        <section>
          <div
            style={{
              fontSize: '0.75rem',
              color: theme.text.secondary,
              marginBottom: '0.35rem',
            }}
          >
            Texte généré (aperçu, mots communs surlignés)
          </div>
          <div
            data-testid="context-section-usage-modal-generated"
            style={{
              fontSize: '0.8rem',
              padding: '0.5rem',
              background: theme.background.secondary,
              borderRadius: 4,
              whiteSpace: 'pre-wrap',
            }}
          >
            {generatedPlainPreview
              ? renderHighlighted(generatedPlainPreview, ranges)
              : '—'}
          </div>
        </section>
      </div>
    </div>
  )
}
