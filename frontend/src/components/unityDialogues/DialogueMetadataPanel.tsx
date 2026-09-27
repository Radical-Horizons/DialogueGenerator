/** Panneau de consultation des métadonnées agrégées d'un dialogue. */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import * as dialogueMetadataAPI from '../../api/dialogueMetadata'
import { TOUCH_TARGET_MIN_PX } from '../../constants'
import { useAuthStore } from '../../store/authStore'
import { theme } from '../../theme'
import {
  redesignFont,
  redesignHairline,
  redesignMonoLabelStyle,
  redesignRadius,
  redesignSpacing,
  redesignText,
} from '../../theme/redesignTokens'
import type { DialogueMetadataResponse } from '../../types/api'
import { getErrorMessage } from '../../types/errors'
import { formatCostEur } from '../../utils/dialogueMetadataFormat'
import { formatNumber } from '../../utils/formatCurrency'
import { DialogueCostBreakdown } from '../usage/DialogueCostBreakdown'
import { DialoguePermissionsPanel } from './DialoguePermissionsPanel'

export interface DialogueMetadataPanelProps {
  documentId: string
  open: boolean
  onClose: () => void
}

/**
 * Étiquette mono capitales. Sur la surface élevée de la modale (#1f1f26), `label`
 * (#84848f) passe sous 4,5:1 : on prend `muted`.
 */
const monoLabelStyle: CSSProperties = {
  ...redesignMonoLabelStyle,
  fontSize: '10px',
  letterSpacing: '0.12em',
  color: redesignText.muted,
}

const secondaryButtonStyle: CSSProperties = {
  minHeight: TOUCH_TARGET_MIN_PX,
  padding: `${redesignSpacing.sm}px ${redesignSpacing.md}px`,
  borderRadius: redesignRadius.control,
  border: `1px solid ${theme.button.secondary.border}`,
  backgroundColor: theme.button.secondary.background,
  color: theme.button.secondary.color,
  fontSize: '13px',
  cursor: 'pointer',
}

function MetadataRow({
  label,
  mono = false,
  testId,
  children,
}: {
  label: string
  mono?: boolean
  testId?: string
  children: ReactNode
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(9rem, 1fr) minmax(0, 2fr)',
        alignItems: 'baseline',
        gap: redesignSpacing.md,
        padding: `${redesignSpacing.sm}px 0`,
        borderBottom: `1px solid ${redesignHairline.standard}`,
      }}
    >
      <dt style={monoLabelStyle}>{label}</dt>
      <dd
        data-testid={testId}
        style={{
          margin: 0,
          fontSize: '13px',
          color: redesignText.body,
          overflowWrap: 'anywhere',
          ...(mono ? { fontFamily: redesignFont.mono, fontVariantNumeric: 'tabular-nums' } : {}),
        }}
      >
        {children}
      </dd>
    </div>
  )
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
            padding: redesignSpacing.lg,
            borderRadius: redesignRadius.frame,
            border: `1px solid ${redesignHairline.strong}`,
            backgroundColor: theme.background.elevated,
            color: redesignText.body,
            boxShadow: theme.shadow.card,
          }}
        >
          <h2
            id="dialogue-metadata-title"
            style={{
              margin: `0 0 ${redesignSpacing.md}px`,
              fontSize: '15px',
              fontWeight: 600,
              color: redesignText.strong,
            }}
          >
            Métadonnées dialogue
          </h2>
          {isLoading && (
            <p role="status" style={{ margin: 0, fontSize: '13px', color: redesignText.secondary }}>
              Chargement…
            </p>
          )}
          {error && (
            <p role="alert" style={{ margin: 0, fontSize: '13px', color: theme.state.error.color }}>
              {error}
            </p>
          )}
          {metadata && (
            <>
              <dl style={{ margin: 0, borderTop: `1px solid ${redesignHairline.standard}` }}>
                <MetadataRow label="Nom">{metadata.name}</MetadataRow>
                <MetadataRow label="Auteur">{metadata.owner_username ?? 'Inconnu'}</MetadataRow>
                <MetadataRow label="Créé le" mono>{formatDate(metadata.created_at)}</MetadataRow>
                <MetadataRow label="Modifié le" mono>{formatDate(metadata.updated_at)}</MetadataRow>
                <MetadataRow label="Dernier éditeur">
                  {metadata.last_modified_by_username ?? 'Inconnu'}
                </MetadataRow>
                <MetadataRow label="Nœuds" mono>{formatNumber(metadata.node_count)}</MetadataRow>
                <MetadataRow label="Coût total" mono testId="dialogue-metadata-total-cost">
                  {formatCostEur(metadata.total_cost_eur)}
                </MetadataRow>
                <MetadataRow label="Coût par nœud" mono>
                  {formatCostEur(metadata.cost_per_node_eur)}
                </MetadataRow>
              </dl>

              <section style={{ marginTop: redesignSpacing.lg }}>
                <h3 style={{ ...monoLabelStyle, margin: `0 0 ${redesignSpacing.sm}px`, fontWeight: 400 }}>
                  Coûts LLM
                </h3>
                <button
                  type="button"
                  style={secondaryButtonStyle}
                  onClick={() => setShowCosts((current) => !current)}
                >
                  {showCosts ? 'Masquer le détail des coûts' : 'Voir le détail des coûts'}
                </button>
                {showCosts && (
                  <div style={{ marginTop: redesignSpacing.md }}>
                    <DialogueCostBreakdown dialogueId={metadata.document_id} />
                  </div>
                )}
              </section>

              {userRole !== 'guest' && (
                <section style={{ marginTop: redesignSpacing.lg }}>
                  <h3 style={{ ...monoLabelStyle, margin: `0 0 ${redesignSpacing.sm}px`, fontWeight: 400 }}>
                    Permissions
                  </h3>
                  <p
                    style={{
                      margin: `0 0 ${redesignSpacing.sm}px`,
                      fontSize: '13px',
                      color: redesignText.secondary,
                    }}
                  >
                    Consultez le propriétaire et les co-éditeurs de ce dialogue.
                  </p>
                  <button
                    type="button"
                    style={secondaryButtonStyle}
                    onClick={() => setShowPermissions(true)}
                  >
                    Voir les permissions
                  </button>
                </section>
              )}
            </>
          )}
          <div style={{ marginTop: redesignSpacing.lg, textAlign: 'right' }}>
            <button type="button" style={secondaryButtonStyle} onClick={onClose}>
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
