/**
 * Modale de confirmation de restauration d'un snapshot GDD.
 */
import { theme } from '../../theme'
import { postGddNotionArchiveRestore } from '../../api/gddNotionSync'
import { refreshContextAfterGddDiskChange } from '../../hooks/useGddNotionSyncRun'
import type { GddNotionSyncUiRunResult } from '../../hooks/useGddNotionSyncUi'
import { apiErrorDetail, buttonStyle } from './gddNotionSyncStyles'

export interface GddNotionSyncRestoreModalProps {
  restoreTargetId: string
  restoreBackupCurrent: boolean
  setRestoreBackupCurrent: (v: boolean) => void
  setRestoreTargetId: (id: string | null) => void
  busy: boolean
  run: (fn: () => Promise<GddNotionSyncUiRunResult>) => Promise<void>
  refreshArchives: () => Promise<void>
  refreshStatus: () => Promise<void>
}

export function GddNotionSyncRestoreModal({
  restoreTargetId,
  restoreBackupCurrent,
  setRestoreBackupCurrent,
  setRestoreTargetId,
  busy,
  run,
  refreshArchives,
  refreshStatus,
}: GddNotionSyncRestoreModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gdd-restore-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2100,
        backgroundColor: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '420px',
          borderRadius: '10px',
          padding: '1.25rem 1.5rem',
          backgroundColor: theme.background.panel,
          border: `1px solid ${theme.border.primary}`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
        }}
      >
        <h3 id="gdd-restore-title" style={{ margin: '0 0 0.75rem 0', color: theme.text.primary }}>
          Restaurer cette sauvegarde ?
        </h3>
        <p style={{ margin: '0 0 0.75rem 0', color: theme.text.secondary, fontSize: '0.9rem' }}>
          Le contenu actuel de <code style={{ fontSize: '0.85em' }}>GDD_categories</code> sera
          remplacé par le snapshot{' '}
          <code style={{ fontSize: '0.8em', wordBreak: 'break-all' }}>{restoreTargetId}</code>.
          Le manifeste Notion sera réinitialisé (prochaine sync incrémentale rechargera depuis
          Notion).
        </p>
        <label
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: '0.5rem',
            marginBottom: '1rem',
            color: theme.text.secondary,
            fontSize: '0.88rem',
          }}
        >
          <input
            type="checkbox"
            checked={restoreBackupCurrent}
            onChange={(e) => setRestoreBackupCurrent(e.target.checked)}
          />
          <span>Sauvegarder l’état actuel dans .archive/ avant restauration</span>
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => setRestoreTargetId(null)}
            style={buttonStyle(busy)}
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const id = restoreTargetId
              if (!id) return
              void run(async () => {
                try {
                  const r = await postGddNotionArchiveRestore(id, {
                    backup_current: restoreBackupCurrent,
                  })
                  setRestoreTargetId(null)
                  await refreshArchives()
                  await refreshStatus()
                  if (r.ok) {
                    refreshContextAfterGddDiskChange()
                  }
                  return { ok: r.ok, message: r.message }
                } catch (e) {
                  return { ok: false, message: apiErrorDetail(e) }
                }
              })
            }}
            style={buttonStyle(busy, true)}
          >
            Confirmer la restauration
          </button>
        </div>
      </div>
    </div>
  )
}
