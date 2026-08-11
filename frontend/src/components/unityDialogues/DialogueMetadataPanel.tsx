/** Panneau de consultation des métadonnées agrégées d'un dialogue. */
import { useEffect, useRef, useState } from 'react'

import * as dialogueMetadataAPI from '../../api/dialogueMetadata'
import { TOUCH_TARGET_MIN_PX } from '../../constants'
import { useAuthStore } from '../../store/authStore'
import { theme } from '../../theme'
import type { DialogueMetadataResponse } from '../../types/api'
import { getErrorMessage } from '../../types/errors'
import { formatCostEur } from '../../utils/dialogueMetadataFormat'
import { DialogueCostBreakdown } from '../usage/DialogueCostBreakdown'
import { DialoguePermissionsPanel } from './DialoguePermissionsPanel'

export interface DialogueMetadataPanelProps {
  documentId: string
  open: boolean
  onClose: () => void
}

function formatDate(isoTimestamp: string): string {
  const date = new Date(isoTimestamp)
  return Number.isNaN(date.getTime())
    ? isoTimestamp
    : date.toLocaleString('fr-FR', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
}

export function DialogueMetadataPanel({
  documentId,
  open,
  onClose,
}: DialogueMetadataPanelProps) {
  const userRole = useAuthStore((state) => state.user?.role)
  const [metadata, setMetadata] = useState<DialogueMetadataResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showCosts, setShowCosts] = useState(false)
  const [showPermissions, setShowPermissions] = useState(false)
  const loadGeneration = useRef(0)

  useEffect(() => {
    if (!open) return
    const generation = ++loadGeneration.current
    setMetadata(null)
    setError(null)
    setShowCosts(false)
    setShowPermissions(false)
    setIsLoading(true)
    void dialogueMetadataAPI
      .getDialogueMetadata(documentId)
      .then((result) => {
        if (generation === loadGeneration.current) setMetadata(result)
      })
      .catch((reason: unknown) => {
        if (generation === loadGeneration.current) setError(getErrorMessage(reason))
      })
      .finally(() => {
        if (generation === loadGeneration.current) setIsLoading(false)
      })
  }, [documentId, open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, open])

  if (!open) return null

  const actionStyle = {
    minHeight: TOUCH_TARGET_MIN_PX,
    padding: '0.55rem 0.9rem',
    borderRadius: 6,
    border: `1px solid ${theme.border.primary}`,
    backgroundColor: theme.button.secondary.background,
    color: theme.button.secondary.color,
    cursor: 'pointer',
  } as const

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialogue-metadata-title"
        data-testid="dialogue-metadata-panel"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
        }}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose()
        }}
      >
        <div
          style={{
            width: 'min(720px, 100%)',
            maxHeight: 'min(820px, calc(100vh - 2rem))',
            overflowY: 'auto',
            padding: '1.25rem',
            borderRadius: 8,
            border: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.secondary,
            color: theme.text.primary,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
        >
          <h2 id="dialogue-metadata-title" style={{ marginTop: 0 }}>
            Métadonnées dialogue
          </h2>
          {isLoading && <p role="status">Chargement…</p>}
          {error && <p role="alert" style={{ color: theme.state.error.color }}>{error}</p>}
          {metadata && (
            <>
              <dl
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(9rem, 1fr) minmax(0, 2fr)',
                  gap: '0.65rem 1rem',
                  margin: 0,
                }}
              >
                <dt>Nom</dt><dd style={{ margin: 0 }}>{metadata.name}</dd>
                <dt>Auteur</dt><dd style={{ margin: 0 }}>{metadata.owner_username ?? 'Inconnu'}</dd>
                <dt>Créé le</dt><dd style={{ margin: 0 }}>{formatDate(metadata.created_at)}</dd>
                <dt>Modifié le</dt><dd style={{ margin: 0 }}>{formatDate(metadata.updated_at)}</dd>
                <dt>Dernier éditeur</dt>
                <dd style={{ margin: 0 }}>{metadata.last_modified_by_username ?? 'Inconnu'}</dd>
                <dt>Nœuds</dt><dd style={{ margin: 0 }}>{metadata.node_count}</dd>
                <dt>Coût total</dt>
                <dd data-testid="dialogue-metadata-total-cost" style={{ margin: 0 }}>
                  {formatCostEur(metadata.total_cost_eur)}
                </dd>
                <dt>Coût par nœud</dt>
                <dd style={{ margin: 0 }}>{formatCostEur(metadata.cost_per_node_eur)}</dd>
              </dl>

              <section style={{ marginTop: '1.25rem' }}>
                <h3 style={{ fontSize: '1rem' }}>Coûts LLM</h3>
                <button
                  type="button"
                  style={actionStyle}
                  onClick={() => setShowCosts((current) => !current)}
                >
                  {showCosts ? 'Masquer le détail des coûts' : 'Voir le détail des coûts'}
                </button>
                {showCosts && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <DialogueCostBreakdown dialogueId={metadata.document_id} />
                  </div>
                )}
              </section>

              {userRole !== 'guest' && (
                <section style={{ marginTop: '1.25rem' }}>
                  <h3 style={{ fontSize: '1rem' }}>Permissions</h3>
                  <p style={{ color: theme.text.secondary }}>
                    Consultez le propriétaire et les co-éditeurs de ce dialogue.
                  </p>
                  <button
                    type="button"
                    style={actionStyle}
                    onClick={() => setShowPermissions(true)}
                  >
                    Voir les permissions
                  </button>
                </section>
              )}
            </>
          )}
          <div style={{ marginTop: '1.25rem', textAlign: 'right' }}>
            <button type="button" style={actionStyle} onClick={onClose}>
              Fermer
            </button>
          </div>
        </div>
      </div>
      <DialoguePermissionsPanel
        documentId={documentId}
        open={showPermissions}
        onClose={() => setShowPermissions(false)}
      />
    </>
  )
}
