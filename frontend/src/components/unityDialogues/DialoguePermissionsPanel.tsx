/**
 * Panneau de consultation du propriétaire et des co-éditeurs d'un dialogue.
 */
import axios from 'axios'
import { useCallback, useEffect, useRef, useState } from 'react'

import * as dialoguePermissionsAPI from '../../api/dialoguePermissions'
import type { DialoguePermissions } from '../../api/dialoguePermissions'
import * as dialogueSharesAPI from '../../api/dialogueShares'
import { theme } from '../../theme'
import { getErrorMessage } from '../../types/errors'

export interface DialoguePermissionsPanelProps {
  documentId: string
  open: boolean
  onClose: () => void
}

export function DialoguePermissionsPanel({
  documentId,
  open,
  onClose,
}: DialoguePermissionsPanelProps) {
  const [permissions, setPermissions] = useState<DialoguePermissions | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [revokingIds, setRevokingIds] = useState<Set<string>>(() => new Set())
  const [error, setError] = useState<string | null>(null)
  const loadGeneration = useRef(0)
  const revokingIdsRef = useRef<Set<string>>(new Set())

  const loadPermissions = useCallback(async () => {
    const requestId = ++loadGeneration.current
    setIsLoading(true)
    setError(null)
    try {
      const next = await dialoguePermissionsAPI.getDialoguePermissions(documentId)
      if (requestId !== loadGeneration.current) return
      setPermissions(next)
    } catch (err) {
      if (requestId !== loadGeneration.current) return
      setPermissions(null)
      setError(getErrorMessage(err))
    } finally {
      if (requestId === loadGeneration.current) {
        setIsLoading(false)
      }
    }
  }, [documentId])

  useEffect(() => {
    if (!open) return
    setPermissions(null)
    setRevokingIds(new Set())
    revokingIdsRef.current = new Set()
    void loadPermissions()
  }, [open, documentId, loadPermissions])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const removeCoEditor = (userId: string) => {
    setPermissions((current) =>
      current
        ? {
            ...current,
            co_editors: current.co_editors.filter(
              (coEditor) => coEditor.user_id !== userId
            ),
          }
        : current
    )
  }

  const handleRevoke = async (userId: string) => {
    if (revokingIdsRef.current.has(userId)) return
    const requestId = loadGeneration.current
    const requestedDocumentId = documentId
    setError(null)
    revokingIdsRef.current.add(userId)
    setRevokingIds(new Set(revokingIdsRef.current))
    try {
      await dialogueSharesAPI.deleteDialogueShare(documentId, userId)
      if (
        requestId !== loadGeneration.current ||
        requestedDocumentId !== documentId
      ) {
        return
      }
      removeCoEditor(userId)
    } catch (err) {
      if (
        requestId !== loadGeneration.current ||
        requestedDocumentId !== documentId
      ) {
        return
      }
      if (axios.isAxiosError(err) && err.response?.status === 404) {
        removeCoEditor(userId)
        return
      }
      setError(getErrorMessage(err))
    } finally {
      revokingIdsRef.current.delete(userId)
      if (
        requestId === loadGeneration.current &&
        requestedDocumentId === documentId
      ) {
        setRevokingIds(new Set(revokingIdsRef.current))
      }
    }
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialogue-permissions-title"
      data-testid="dialogue-permissions-panel"
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
        <h2 id="dialogue-permissions-title" style={{ marginTop: 0, fontSize: '1.1rem' }}>
          Permissions
        </h2>

        {error && (
          <p role="alert" style={{ color: theme.state.error.color }}>
            {error}
          </p>
        )}

        {isLoading ? (
          <p style={{ color: theme.text.secondary }}>Chargement…</p>
        ) : permissions ? (
          <>
            <section>
              <h3 style={{ fontSize: '0.95rem' }}>Propriétaire</h3>
              <p data-testid="dialogue-permission-owner">
                {permissions.owner.username}
              </p>
            </section>
            <section>
              <h3 style={{ fontSize: '0.95rem' }}>Co-éditeurs</h3>
              {permissions.co_editors.length === 0 ? (
                <p style={{ color: theme.text.secondary }}>Aucun co-éditeur.</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {permissions.co_editors.map((coEditor) => (
                    <li
                      key={coEditor.user_id}
                      data-testid={`dialogue-permission-row-${coEditor.user_id}`}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0.4rem 0',
                        borderBottom: `1px solid ${theme.border.primary}`,
                      }}
                    >
                      <span>{coEditor.username}</span>
                      {permissions.can_manage && (
                        <button
                          type="button"
                          onClick={() => void handleRevoke(coEditor.user_id)}
                          data-testid={`dialogue-permission-revoke-${coEditor.user_id}`}
                          disabled={revokingIds.has(coEditor.user_id)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: theme.state.error.color,
                            cursor: revokingIds.has(coEditor.user_id)
                              ? 'not-allowed'
                              : 'pointer',
                            opacity: revokingIds.has(coEditor.user_id) ? 0.6 : 1,
                          }}
                        >
                          Révoquer
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : null}

        <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
          <button
            type="button"
            onClick={onClose}
            data-testid="dialogue-permissions-close"
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
