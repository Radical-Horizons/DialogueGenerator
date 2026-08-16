/**
 * Modal owner/admin pour inviter/révoquer des destinataires writer.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'

import {
  createTemplateShareApi,
  deleteTemplateShareApi,
  listTemplateSharesApi,
} from '../../api/templates'
import type { TemplateShare } from '../../types/template'
import { theme } from '../../theme'
import { getErrorMessage } from '../../types/errors'

export interface TemplateSharingModalProps {
  templateId: string
  templateName: string
  open: boolean
  onClose: () => void
}

export function TemplateSharingModal({
  templateId,
  templateName,
  open,
  onClose,
}: TemplateSharingModalProps) {
  const [shares, setShares] = useState<TemplateShare[]>([])
  const [username, setUsername] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [revokingIds, setRevokingIds] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const loadGeneration = useRef(0)

  const loadShares = useCallback(async () => {
    const requestId = ++loadGeneration.current
    setIsLoading(true)
    setError(null)
    try {
      const next = await listTemplateSharesApi(templateId)
      if (requestId !== loadGeneration.current) return
      setShares(next)
    } catch (err) {
      if (requestId !== loadGeneration.current) return
      setShares([])
      setError(getErrorMessage(err))
    } finally {
      if (requestId === loadGeneration.current) {
        setIsLoading(false)
      }
    }
  }, [templateId])

  useEffect(() => {
    if (!open) return
    setUsername('')
    setError(null)
    setRevokingIds(new Set())
    void loadShares()
  }, [open, templateId, loadShares])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const handleInvite = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = username.trim()
    if (!trimmed || isSubmitting) return
    setIsSubmitting(true)
    setError(null)
    try {
      await createTemplateShareApi(templateId, trimmed)
      setUsername('')
      await loadShares()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRevoke = async (userId: string) => {
    if (revokingIds.has(userId)) return
    setError(null)
    setRevokingIds((current) => new Set(current).add(userId))
    try {
      await deleteTemplateShareApi(templateId, userId)
      setShares((current) => current.filter((share) => share.user_id !== userId))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setRevokingIds((current) => {
        const next = new Set(current)
        next.delete(userId)
        return next
      })
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="template-sharing-title"
      data-testid="template-sharing-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        style={{
          width: 'min(420px, 100%)',
          backgroundColor: theme.background.secondary,
          color: theme.text.primary,
          borderRadius: 8,
          padding: '1.25rem',
          boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          border: `1px solid ${theme.border.primary}`,
        }}
      >
        <h2 id="template-sharing-title" style={{ marginTop: 0, fontSize: '1.1rem' }}>
          Partager « {templateName} »
        </h2>
        <p style={{ color: theme.text.secondary, fontSize: '0.9rem' }}>
          Invitez un writer existant par nom d&apos;utilisateur. Il pourra
          appliquer et copier ce template, pas l&apos;éditer.
        </p>

        <form onSubmit={handleInvite} style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            aria-label="Nom d'utilisateur du destinataire"
            data-testid="template-share-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="username"
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              borderRadius: 4,
              border: `1px solid ${theme.input.border}`,
              backgroundColor: theme.input.background,
              color: theme.input.color,
            }}
          />
          <button
            type="submit"
            data-testid="template-share-invite"
            disabled={isSubmitting || !username.trim()}
            style={{
              padding: '0.5rem 0.9rem',
              borderRadius: 4,
              border: 'none',
              backgroundColor: theme.button.primary.background,
              color: theme.button.primary.color,
              cursor: 'pointer',
              opacity: isSubmitting || !username.trim() ? 0.6 : 1,
            }}
          >
            Inviter
          </button>
        </form>

        {error && (
          <p role="alert" style={{ color: theme.state.error.color, marginTop: '0.75rem' }}>
            {error}
          </p>
        )}

        <div style={{ marginTop: '1rem' }}>
          <h3 style={{ fontSize: '0.95rem' }}>Destinataires</h3>
          {isLoading ? (
            <p style={{ color: theme.text.secondary }}>Chargement…</p>
          ) : shares.length === 0 ? (
            <p style={{ color: theme.text.secondary }}>Aucun partage actif.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {shares.map((share) => (
                <li
                  key={share.user_id}
                  data-testid={`template-share-row-${share.user_id}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.4rem 0',
                    borderBottom: `1px solid ${theme.border.primary}`,
                  }}
                >
                  <span>{share.username}</span>
                  <button
                    type="button"
                    onClick={() => void handleRevoke(share.user_id)}
                    data-testid={`template-share-revoke-${share.user_id}`}
                    disabled={revokingIds.has(share.user_id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: theme.state.error.color,
                      cursor: revokingIds.has(share.user_id) ? 'not-allowed' : 'pointer',
                      opacity: revokingIds.has(share.user_id) ? 0.6 : 1,
                    }}
                  >
                    Révoquer
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
          <button
            type="button"
            onClick={onClose}
            data-testid="template-sharing-close"
            style={{
              padding: '0.45rem 0.9rem',
              borderRadius: 4,
              border: `1px solid ${theme.button.default.border}`,
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
            }}
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
