/**
 * Indicateur visuel du statut de sauvegarde automatique.
 */
import { useState, useEffect } from 'react'
import { theme } from '../../theme'

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error'

/** ADR-006: mode d'affichage du statut sync (Synced / Offline / Error). */
export type SyncStatusDisplay = 'synced' | 'offline' | 'error'

export interface SaveStatusIndicatorProps {
  status: SaveStatus
  lastSavedAt?: number | null // Timestamp ms (Task 3 - Story 0.5)
  variant?: 'draft' | 'disk' // Optionnel, pour wording si besoin (Task 3 - Story 0.5)
  /**
   * dot = pastille colorée seule (compact) ;
   * discreet = texte discret type « Sauvegardé ✓ » (barres d’outils modernes).
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

const STATUS_CONFIG: Record<SaveStatus, { label: string; color: string }> = {
  saved: { label: 'Sauvegardé', color: theme.state.success.color },
  saving: { label: 'Sauvegarde…', color: theme.state.info.color },
  unsaved: { label: 'En attente', color: theme.state.warning.color },
  error: { label: 'Erreur', color: theme.state.error.color },
}

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
  const config = STATUS_CONFIG[status]
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
  let label = config.label
  if (syncStatusDisplay === 'synced' && ackSeq != null) {
    label = `Synced (seq ${ackSeq})`
  } else if (syncStatusDisplay === 'offline') {
    label = pendingCount > 0 ? `Offline, ${pendingCount} change(s) queued` : 'Offline'
  } else if (syncStatusDisplay === 'error') {
    label = 'Error'
  } else if (status === 'saved' && relativeTime) {
    label = `${config.label} ${relativeTime}`
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

  if (appearance === 'discreet') {
    const textColor =
      status === 'error'
        ? theme.state.error.color
        : status === 'unsaved'
          ? theme.text.secondary
          : status === 'saving'
            ? theme.state.info.color
            : theme.text.tertiary
    return (
      <span
        style={{
          fontSize: '0.78rem',
          fontWeight: 500,
          color: textColor,
          letterSpacing: '0.01em',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 'min(220px, 42vw)',
          ...style,
        }}
        title={tooltipText}
      >
        {syncStatusDisplay ? label : discreetLine}
      </span>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        fontSize: '0.85rem',
        color: config.color,
        ...style,
      }}
      title={tooltipText}
    >
      <div
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: config.color,
          opacity: status === 'saving' ? 0.6 : 1,
          animation: status === 'saving' ? 'pulse 1.5s ease-in-out infinite' : 'none',
          cursor: 'default',
        }}
      />
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 0.6; }
            50% { opacity: 1; }
          }
        `}
      </style>
    </div>
  )
}
