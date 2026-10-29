/**
 * Indicateur visuel du statut de sauvegarde automatique.
 */
import { useState, useEffect } from 'react'
import { theme } from '../../theme'
import { redesignAccent, redesignFont, redesignText } from '../../theme/redesignTokens'

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

/** ADR-006: mode d'affichage du statut sync (Synced / Offline / Error). */
export type SyncStatusDisplay = 'synced' | 'offline' | 'error'

export interface SaveStatusIndicatorProps {
  status: SaveStatus
  lastSavedAt?: number | null // Timestamp ms (Task 3 - Story 0.5)
  variant?: 'draft' | 'disk' // Optionnel, pour wording si besoin (Task 3 - Story 0.5)
  /**
   * dot = pastille colorée seule (compact) ;
   * discreet = pastille + libellé mono capitales type « BROUILLON SAUVEGARDÉ ✓ ».
   */
  appearance?: 'dot' | 'discreet'
  errorMessage?: string | null // Message d'erreur optionnel (Task 3 - Story 0.5)
  style?: React.CSSProperties
  /** ADR-006: dernier seq reconnu par le serveur → "Synced (seq …)" */
  ackSeq?: number | null
  /** ADR-006: nombre de changements en attente → "Offline, N changes queued" */
  pendingCount?: number
  /** ADR-006: synced | offline | error pour libellés dédiés */
  syncStatusDisplay?: SyncStatusDisplay
}

const STATUS_LABELS: Record<SaveStatus, string> = {
  saved: 'Sauvegardé',
  saving: 'Sauvegarde…',
  unsaved: 'En attente',
  error: 'Erreur',
}

/** Couleur du point d'état — mêmes teintes que les bordures de nœuds validés / en attente. */
function statusDotColor(status: SaveStatus): string {
  switch (status) {
    case 'saved':
      return theme.state.accepted.border
    case 'saving':
      return redesignAccent.base
    case 'unsaved':
      return theme.state.pending.border
    case 'error':
      return theme.state.error.color
  }
}

const PULSE_KEYFRAMES = `
  @keyframes pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }
`

/** Libellés brouillon local (discreet) — évite la confusion avec la sauvegarde fichier dialogue. */
const DISCREET_DRAFT_LABELS: Record<SaveStatus, string> = {
  saved: 'Brouillon sauvegardé',
  saving: 'Sauvegarde du brouillon…',
  unsaved: 'Modifications non enregistrées',
  error: 'Erreur brouillon',
}

// Helper pour formater le temps relatif (Task 3 - Story 0.5)
function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  
  if (seconds < 5) return 'à l\'instant'
  if (seconds < 60) return `il y a ${seconds}s`
  if (minutes < 60) return `il y a ${minutes}min`
  if (hours < 24) return `il y a ${hours}h`
  return `il y a ${Math.floor(hours / 24)}j`
}

export function SaveStatusIndicator({
  status,
  lastSavedAt,
  errorMessage,
  appearance = 'dot',
  style,
  ackSeq,
  pendingCount = 0,
  syncStatusDisplay,
}: SaveStatusIndicatorProps) {
  const statusLabel = STATUS_LABELS[status]
  const [relativeTime, setRelativeTime] = useState<string | null>(null)

  // Mettre à jour le temps relatif toutes les 10 secondes (Task 3 - Story 0.5)
  useEffect(() => {
    if (status === 'saved' && lastSavedAt) {
      setRelativeTime(formatRelativeTime(lastSavedAt))
      const interval = setInterval(() => {
        setRelativeTime(formatRelativeTime(lastSavedAt))
      }, 10000)
      return () => clearInterval(interval)
    } else {
      setRelativeTime(null)
    }
  }, [status, lastSavedAt])

  // ADR-006: libellés Synced (seq …) / Offline, N changes queued / Error
  let label = statusLabel
  if (syncStatusDisplay === 'synced' && ackSeq != null) {
    label = `Synced (seq ${ackSeq})`
  } else if (syncStatusDisplay === 'offline') {
    label = pendingCount > 0 ? `Offline, ${pendingCount} change(s) queued` : 'Offline'
  } else if (syncStatusDisplay === 'error') {
    label = 'Error'
  } else if (status === 'saved' && relativeTime) {
    label = `${statusLabel} ${relativeTime}`
  }

  let discreetLine = label
  if (appearance === 'discreet' && !syncStatusDisplay) {
    const base = DISCREET_DRAFT_LABELS[status]
    discreetLine =
      status === 'saved' && relativeTime ? `${base} · ${relativeTime}` : base
    if (status === 'saved') {
      discreetLine = `${discreetLine} ✓`
    }
  }

  const tooltipText = status === 'error' && errorMessage ? errorMessage : label

  const dot = (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        width: 6,
        height: 6,
        borderRadius: '50%',
        flexShrink: 0,
        backgroundColor: statusDotColor(status),
        opacity: status === 'saving' ? 0.6 : 1,
        animation: status === 'saving' ? 'pulse 1.5s ease-in-out infinite' : 'none',
      }}
    />
  )

  if (appearance === 'discreet') {
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          fontFamily: redesignFont.mono,
          fontSize: '10.5px',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: redesignText.secondary,
          whiteSpace: 'nowrap',
          maxWidth: 'min(220px, 42vw)',
          ...style,
        }}
        title={tooltipText}
      >
        {dot}
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {syncStatusDisplay ? label : discreetLine}
        </span>
        <style>{PULSE_KEYFRAMES}</style>
      </span>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        cursor: 'default',
        ...style,
      }}
      title={tooltipText}
    >
      {dot}
      <style>{PULSE_KEYFRAMES}</style>
    </div>
  )
}
