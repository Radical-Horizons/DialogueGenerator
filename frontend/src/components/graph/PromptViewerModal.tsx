/**
 * Modale "Voir le prompt" — affiche le prompt exact ou reconstruit envoyé au LLM (Story 1.14).
 * AC #1 : sections délimitées, syntaxe lisible ; AC #2 : Copier, tokens.
 */
import { memo, useCallback, useState } from 'react'
import { theme } from '../../theme'
import type { NodePromptResponse } from '../../types/graph'

export interface PromptViewerModalProps {
  isOpen: boolean
  /** Données du prompt (raw_prompt, tokens, message). */
  data: NodePromptResponse | null
  /** Erreur à afficher si chargement échoué. */
  error: string | null
  /** En cours de chargement. */
  isLoading?: boolean
  onClose: () => void
}

const modalStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 2000,
}

const panelStyle: React.CSSProperties = {
  backgroundColor: theme.background.panel,
  padding: '1.5rem',
  borderRadius: '8px',
  minWidth: '420px',
  width: 'min(90vw, 720px)',
  maxHeight: '85vh',
  overflow: 'auto',
  border: `1px solid ${theme.border.primary}`,
}

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: '1rem',
  backgroundColor: theme.background.secondary,
  border: `1px solid ${theme.border.primary}`,
  borderRadius: '4px',
  fontSize: '0.85rem',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
  overflow: 'auto',
  maxHeight: '50vh',
  color: theme.text.primary,
  fontFamily: 'ui-monospace, monospace',
}

function formatTimestamp(ts: string | null | undefined): string {
  if (!ts) return '—'
  try {
    const d = new Date(ts)
    return Number.isNaN(d.getTime()) ? ts : d.toLocaleString()
  } catch {
    return ts
  }
}

/** Découpe le prompt en sections pour affichage (AC #1 — sections délimitées). */
const SECTION_MARKERS = [
  'Contexte précédent:',
  'Réponse du joueur:',
  'Instructions pour la suite:',
] as const

function parsePromptSections(raw: string): Array<{ title: string; content: string }> {
  const sections: Array<{ title: string; content: string }> = []
  const text = raw.trim()
  type Pos = { index: number; label: string }
  const positions: Pos[] = []
  for (const label of SECTION_MARKERS) {
    const idx = text.indexOf(label)
    if (idx !== -1) positions.push({ index: idx, label })
  }
  positions.sort((a, b) => a.index - b.index)
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i].index
    const end = i + 1 < positions.length ? positions[i + 1].index : text.length
    const block = text.slice(start, end)
    const colon = block.indexOf(':')
    const content = (colon >= 0 ? block.slice(colon + 1) : block).trim()
    if (content) sections.push({ title: positions[i].label.replace(/:$/, ''), content })
  }
  if (sections.length === 0) return [{ title: 'Prompt', content: text || raw }]
  return sections
}

export const PromptViewerModal = memo(function PromptViewerModal({
  isOpen,
  data,
  error,
  isLoading = false,
  onClose,
}: PromptViewerModalProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    if (!data?.raw_prompt) return
    try {
      await navigator.clipboard.writeText(data.raw_prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error('Copy failed:', e)
    }
  }, [data?.raw_prompt])

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }

  if (!isOpen) return null

  const totalTokens =
    data?.prompt_tokens != null && data?.completion_tokens != null
      ? data.prompt_tokens + data.completion_tokens
      : null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="prompt-viewer-modal-title"
      style={modalStyle}
      onClick={handleBackdropClick}
    >
      <div onClick={(e) => e.stopPropagation()} style={panelStyle}>
        <h3
          id="prompt-viewer-modal-title"
          style={{ marginTop: 0, marginBottom: '1rem', color: theme.text.primary }}
        >
          Prompt envoyé au LLM
        </h3>

        {isLoading && (
          <p style={{ color: theme.text.secondary, marginBottom: '1rem' }}>
            Chargement…
          </p>
        )}

        {error && (
          <p
            role="alert"
            style={{
              marginBottom: '1rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: theme.state?.error?.background ?? 'rgba(231, 76, 60, 0.15)',
              border: `1px solid ${theme.state?.error?.color ?? '#E74C3C'}`,
              borderRadius: '4px',
              color: theme.text.primary,
              fontSize: '0.9rem',
            }}
          >
            {error}
          </p>
        )}

        {data?.message && !error && (
          <p
            role="status"
            style={{
              marginBottom: '1rem',
              padding: '0.5rem 0.75rem',
              backgroundColor: theme.state?.warning?.background ?? 'rgba(245, 166, 35, 0.15)',
              border: `1px solid ${theme.state?.warning?.color ?? '#F5A623'}`,
              borderRadius: '4px',
              color: theme.text.primary,
              fontSize: '0.85rem',
            }}
          >
            {data.message}
          </p>
        )}

        {data?.raw_prompt && !error && (
          <>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '0.5rem',
                marginBottom: '0.5rem',
                flexWrap: 'wrap',
              }}
            >
              <span
                style={{
                  fontSize: '0.85rem',
                  color: theme.text.secondary,
                }}
              >
                Tokens : prompt {data.prompt_tokens ?? '—'} · completion{' '}
                {data.completion_tokens ?? '—'}
                {totalTokens != null && ` · total ${totalTokens}`}
                {data.timestamp && ` · ${formatTimestamp(data.timestamp)}`}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                style={{
                  padding: '0.35rem 0.75rem',
                  backgroundColor: theme.button.default.background,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  color: theme.text.primary,
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                }}
              >
                {copied ? 'Copié' : 'Copier'}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {parsePromptSections(data.raw_prompt).map(({ title, content }) => (
                <div key={title}>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: theme.text.secondary,
                      marginBottom: '0.25rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {title}
                  </div>
                  <pre style={preStyle}>{content}</pre>
                </div>
              ))}
            </div>
          </>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '1.25rem',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: theme.background.secondary,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              color: theme.text.primary,
              cursor: 'pointer',
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
})
