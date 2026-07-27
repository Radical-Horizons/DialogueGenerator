/**
 * Panneau sync des catégories GDD depuis Notion (FR18).
 *
 * La logique vit dans les hooks `useGddNotionSync*` ; ce composant compose leur état
 * et rend le panneau.
 */
import type { CSSProperties } from 'react'
import { useCallback, useState } from 'react'
import {
  deleteGddFullSyncCheckpoint,
  postGddFullSyncCancel,
  postGddFullSyncPause,
  postGddFullSyncUnpause,
  postGddNotionArchiveRestore,
  postGddNotionTestConnection,
} from '../../api/gddNotionSync'
import { GddNotionSyncProgressModal } from './GddNotionSyncProgressModal'
import { useGddNotionSyncUi, type GddNotionSyncOutcomeTone } from '../../hooks/useGddNotionSyncUi'
import { useGddNotionSyncConfig } from '../../hooks/useGddNotionSyncConfig'
import { useGddNotionSyncPerimeter } from '../../hooks/useGddNotionSyncPerimeter'
import { useGddNotionSyncCheckpoint } from '../../hooks/useGddNotionSyncCheckpoint'
import { useGddNotionSyncArchives } from '../../hooks/useGddNotionSyncArchives'
import { useGddNotionSyncPreview } from '../../hooks/useGddNotionSyncPreview'
import { useGddNotebooklmExport } from '../../hooks/useGddNotebooklmExport'
import {
  refreshContextAfterGddDiskChange,
  useGddNotionSyncRun,
} from '../../hooks/useGddNotionSyncRun'
import { theme } from '../../theme'
import { isGddNotionSyncSecondaryDatabase } from '../../constants/gddNotionSyncSecondaryDatabases'
import { PasswordInput } from '../shared/PasswordInput'
import { Tooltip } from '../shared/Tooltip'

function gddSyncOutcomeBannerPalette(tone: GddNotionSyncOutcomeTone): {
  border: string
  background: string
  accent: string
  title: string
} {
  if (tone === 'error') {
    return {
      border: theme.state.error.border,
      background: theme.state.error.background,
      accent: theme.state.error.color,
      title: 'Synchronisation échouée',
    }
  }
  if (tone === 'warning') {
    return {
      border: theme.state.warning.border ?? '#ffc107',
      background: theme.state.warning.background,
      accent: theme.state.warning.color,
      title: 'Synchronisation terminée — action requise',
    }
  }
  return {
    border: theme.state.success.color,
    background: theme.state.success.background,
    accent: theme.state.success.color,
    title: 'Synchronisation réussie',
  }
}

export interface GddNotionSyncSectionProps {
  /** Après mise à jour locale du checkpoint (sync / abandon), rafraîchir l’UI parent (ex. onglet Options). */
  onCheckpointDiskChanged?: () => void
}

export function GddNotionSyncSection({ onCheckpointDiskChanged }: GddNotionSyncSectionProps) {
  const { phase, userMessage, outcomeTone, run, resetMessage } = useGddNotionSyncUi()

  const {
    config,
    configLoadError,
    serverStatus,
    statusLoadError,
    intervalMin,
    setIntervalMin,
    autoSync,
    setAutoSync,
    tokenInput,
    setTokenInput,
    archiveRetentionSetting,
    setArchiveRetentionSetting,
    includedDbFiles,
    setIncludedDbFiles,
    saving,
    perimeterSaving,
    saveMessage,
    saveError,
    loadConfig,
    refreshStatus,
    handleSaveSettings: saveSettings,
    persistIncludedPerimeter,
  } = useGddNotionSyncConfig(phase)

  const {
    sources,
    databaseSources,
    dbCount,
    pageCount,
    runScopeDbCount,
    toggleDbInclusion,
    checkAllDatabaseSources,
    uncheckAllDatabaseSources,
    checkEssentialDatabaseSources,
    runIncludedCategories,
  } = useGddNotionSyncPerimeter({
    config,
    includedDbFiles,
    setIncludedDbFiles,
    persistIncludedPerimeter,
  })

  const {
    checkpoint,
    checkpointBannerError,
    setCheckpointBannerError,
    refreshCheckpoint,
  } = useGddNotionSyncCheckpoint()

  const {
    archives,
    archivesLoadError,
    restoreTargetId,
    setRestoreTargetId,
    restoreBackupCurrent,
    setRestoreBackupCurrent,
    refreshArchives,
  } = useGddNotionSyncArchives(archiveRetentionSetting)

  const {
    previewOpen,
    previewForFile,
    previewLoading,
    previewError,
    previewData,
    runPreviewOneRow,
    closePreview,
  } = useGddNotionSyncPreview()

  const { notebooklmExporting, notebooklmExportError, handleNotebooklmExport } =
    useGddNotebooklmExport()

  const { progressOpen, progressSnapshot, syncModeFull, elapsedSec, runGddSync } =
    useGddNotionSyncRun({
      run,
      refreshStatus,
      refreshArchives,
      refreshCheckpoint,
      runIncludedCategories,
      onCheckpointDiskChanged,
    })

  /** Un enregistrement de réglages peut changer la rétention : relire l'historique. */
  const handleSaveSettings = useCallback(async () => {
    await saveSettings()
    void refreshArchives()
  }, [saveSettings, refreshArchives])

  const busy = phase === 'loading' || perimeterSaving
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
      }}
    >
      <div
        style={{
          padding: '1rem',
          border: `1px solid ${theme.border.primary}`,
          borderRadius: '8px',
          backgroundColor: theme.background.secondary,
        }}
      >
        <h3 style={{ margin: '0 0 0.75rem 0', color: theme.text.primary }}>
          Synchronisation GDD (Notion)
        </h3>
        {(() => {
          if (!userMessage || phase === 'loading' || !outcomeTone) {
            return null
          }
          const pal = gddSyncOutcomeBannerPalette(outcomeTone)
          return (
            <div
              role="status"
              aria-live="polite"
              style={{
                margin: '0 0 1rem 0',
                padding: '1rem 1rem 0.9rem',
                borderRadius: '8px',
                border: `2px solid ${pal.border}`,
                backgroundColor: pal.background,
                boxShadow: theme.shadow.card,
              }}
            >
              <div
                style={{
                  color: theme.text.primary,
                  fontWeight: 700,
                  fontSize: '1rem',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span aria-hidden style={{ color: pal.accent, fontSize: '1.15rem' }}>
                  {outcomeTone === 'error' ? '✕' : outcomeTone === 'warning' ? '!' : '✓'}
                </span>
                {pal.title}
              </div>
              <p
                style={{
                  margin: '0 0 1rem 0',
                  color: theme.text.primary,
                  fontSize: '0.92rem',
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {userMessage}
              </p>
              <button
                type="button"
                onClick={resetMessage}
                style={{
                  padding: '0.55rem 1.25rem',
                  borderRadius: '6px',
                  border: `1px solid ${theme.button.primary.background}`,
                  backgroundColor: theme.button.primary.background,
                  color: theme.button.primary.color,
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                }}
              >
                Fermer ce message
              </button>
            </div>
          )
        })()}
        <p
          style={{
            margin: '0 0 1rem 0',
            color: theme.text.secondary,
            fontSize: '0.9rem',
          }}
        >
          Met à jour les fichiers JSON sous <code style={{ fontSize: '0.85em' }}>data/GDD_categories/</code>{' '}
          selon <code style={{ fontSize: '0.85em' }}>settings.json</code>. Le token n&apos;est jamais
          renvoyé par l&apos;API.
        </p>
        <p
          style={{
            margin: '0 0 1rem 0',
            color: theme.text.secondary,
            fontSize: '0.88rem',
            lineHeight: 1.45,
          }}
        >
          <strong style={{ color: theme.text.primary }}>Sync complète</strong> interrompue (onglet fermé,
          navigateur quitté, erreur réseau) : rouvrez <strong style={{ color: theme.text.primary }}>Options</strong>{' '}
          → onglet <strong style={{ color: theme.text.primary }}>Notion</strong>, puis{' '}
          <strong style={{ color: theme.text.primary }}>Reprendre la sync</strong> — le serveur conserve le
          checkpoint et le staging tant que vous n&apos;annulez pas.
        </p>

        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            borderRadius: '6px',
            border: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.panel,
          }}
        >
          <p style={{ margin: '0 0 0.5rem 0', color: theme.text.primary, fontWeight: 'bold' }}>
            Export NotebookLM (présentations)
          </p>
          <p
            style={{
              margin: '0 0 0.75rem 0',
              color: theme.text.secondary,
              fontSize: '0.88rem',
              lineHeight: 1.45,
            }}
          >
            Télécharge un ZIP Markdown : tout le GDD local disponible sur disque (bases et fiches
            page synchronisées), regroupé par thèmes. Les petits volets sont fusionnés ; chaque
            fichier reste sous la limite NotebookLM (~500k mots / source) — les très gros thèmes
            seulement sont découpés en <code style={{ fontSize: '0.85em' }}>-part02.md</code>, etc.
            Un second bouton exporte uniquement le périmètre sauvegardé (cases cochées +
            « Sauver sans sync »).
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => void handleNotebooklmExport('disk')}
              disabled={notebooklmExporting || busy || !config || sources.length === 0}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: `1px solid ${theme.border.primary}`,
                backgroundColor: theme.background.secondary,
                color: theme.text.primary,
                cursor:
                  notebooklmExporting || busy || !config || sources.length === 0 ? 'not-allowed' : 'pointer',
                opacity: notebooklmExporting || busy || !config || sources.length === 0 ? 0.6 : 1,
              }}
            >
              {notebooklmExporting ? 'Préparation du ZIP…' : 'Télécharger tout le GDD local (.zip)'}
            </button>
            <button
              type="button"
              onClick={() => void handleNotebooklmExport('sync')}
              disabled={notebooklmExporting || busy || !config || sources.length === 0}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                border: `1px solid ${theme.border.primary}`,
                backgroundColor: theme.background.panel,
                color: theme.text.secondary,
                cursor:
                  notebooklmExporting || busy || !config || sources.length === 0 ? 'not-allowed' : 'pointer',
                opacity: notebooklmExporting || busy || !config || sources.length === 0 ? 0.6 : 1,
              }}
              title="Utilise included_categories sauvegardé (Sauver sans sync), pas les cases non enregistrées"
            >
              Export périmètre sync sauvegardé
            </button>
          </div>
          {notebooklmExportError && (
            <p style={{ margin: '0.5rem 0 0 0', color: theme.state.error.color, fontSize: '0.88rem' }}>
              {notebooklmExportError}
            </p>
          )}
        </div>

        {configLoadError && (
          <p style={{ color: theme.state.error.color, fontSize: '0.9rem', margin: '0 0 1rem 0' }}>
            {configLoadError}
          </p>
        )}

        {config && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              borderRadius: '6px',
              backgroundColor: theme.background.panel,
              border: `1px solid ${theme.border.primary}`,
            }}
          >
            <p style={{ margin: '0 0 0.5rem 0', color: theme.text.primary, fontWeight: 'bold' }}>
              Résumé configuration
            </p>
            <ul
              style={{
                margin: 0,
                paddingLeft: '1.25rem',
                color: theme.text.secondary,
                fontSize: '0.88rem',
                lineHeight: 1.5,
              }}
            >
              <li>Schéma : {config.schema_version}</li>
              <li>
                Token Notion :{' '}
                <strong style={{ color: theme.text.primary }}>
                  {config.token_configured ? 'configuré' : 'non configuré'}
                </strong>{' '}
                (.env ou fichier côté serveur)
              </li>
              <li>
                Sources : <strong style={{ color: theme.text.primary }}>{sources.length}</strong> au total
                ({dbCount} base{dbCount !== 1 ? 's' : ''}, {pageCount} page{pageCount !== 1 ? 's' : ''})
              </li>
              <li>
                Filtre bases (Notion) :{' '}
                {config.included_categories?.length
                  ? `${config.included_categories.length} base(s) — sur chaque sync, seules ces bases (pas les fiches page)`
                  : 'aucun — toutes les bases et toutes les fiches (pages) sont synchronisées'}
              </li>
            </ul>
            {sources.length > 0 && (
              <details style={{ marginTop: '0.75rem' }}>
                <summary
                  style={{
                    cursor: 'pointer',
                    color: theme.text.primary,
                    fontSize: '0.88rem',
                  }}
                >
                  Liste des sources ({sources.length})
                </summary>
                <div
                  style={{
                    marginTop: '0.5rem',
                    maxHeight: '220px',
                    overflow: 'auto',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    color: theme.text.secondary,
                  }}
                >
                  {sources.map((s, idx) => (
                    <div key={`${idx}-${s.kind}-${s.notion_id}`} style={{ marginBottom: '0.25rem' }}>
                      [{s.kind}] {s.category_file} · {s.notion_id}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            borderRadius: '6px',
            backgroundColor: theme.background.panel,
            border: `1px solid ${theme.border.primary}`,
          }}
        >
          <p style={{ margin: '0 0 0.75rem 0', color: theme.text.primary, fontWeight: 'bold' }}>
            Paramètres
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={labelStyle}>
              <span>Intervalle auto-sync (minutes)</span>
              <input
                type="number"
                min={1}
                disabled={!config || saving || busy}
                value={intervalMin}
                onChange={(e) => setIntervalMin(Number(e.target.value))}
                style={inputStyle}
              />
            </label>
            <label style={{ ...labelStyle, flexDirection: 'row', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                disabled={!config || saving || busy}
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
              />
              <span>Activer la synchronisation automatique (côté serveur)</span>
            </label>
            <label style={labelStyle}>
              <span>Conserver les N dernières sauvegardes automatiques (dossiers sous .archive/)</span>
              <input
                type="number"
                min={1}
                disabled={!config || saving || busy}
                value={archiveRetentionSetting}
                onChange={(e) => setArchiveRetentionSetting(Number(e.target.value))}
                style={inputStyle}
              />
            </label>
            <div style={labelStyle}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <span>Bases de données à synchroniser</span>
                <DatabasePerimeterHelp />
              </div>
              {databaseSources.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.85rem', color: theme.text.secondary }}>
                  Aucune source <code style={{ fontSize: '0.85em' }}>database</code> dans la configuration.
                </p>
              ) : (
                <>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <button
                      type="button"
                      disabled={!config || saving || busy}
                      onClick={checkAllDatabaseSources}
                      style={buttonStyle(saving || busy)}
                    >
                      Tout cocher
                    </button>
                    <button
                      type="button"
                      disabled={!config || saving || busy}
                      onClick={uncheckAllDatabaseSources}
                      style={buttonStyle(saving || busy)}
                    >
                      Tout décocher
                    </button>
                    <button
                      type="button"
                      disabled={!config || saving || busy}
                      onClick={checkEssentialDatabaseSources}
                      style={buttonStyle(saving || busy)}
                      title="Coche toutes les bases sauf la liste « secondaires » du dépôt (voir constante gddNotionSyncSecondaryDatabases)"
                    >
                      Cocher essentiels
                    </button>
                    <button
                      type="button"
                      disabled={!config || saving || busy}
                      onClick={() => void persistIncludedPerimeter(includedDbFiles)}
                      style={buttonStyle(saving || busy)}
                      title="Enregistre les cases cochées sans lancer de sync"
                    >
                      {perimeterSaving ? 'Enregistrement…' : 'Appliquer le périmètre'}
                    </button>
                  </div>
                  <div
                    role="group"
                    aria-label="Bases de données Notion à inclure dans la synchronisation"
                    style={{
                      maxHeight: '220px',
                      overflowY: 'auto',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      border: `1px solid ${theme.border.primary}`,
                      backgroundColor: theme.background.secondary,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.35rem',
                    }}
                  >
                    {databaseSources.map((s) => {
                      const checked = includedDbFiles.includes(s.category_file)
                      const id = `gdd-sync-db-${s.notion_id}-${s.category_file}`
                      return (
                        <div
                          key={`${s.notion_id}:${s.category_file}`}
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'flex-start',
                            gap: '0.35rem 0.5rem',
                            justifyContent: 'space-between',
                          }}
                        >
                          <label
                            htmlFor={id}
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '0.5rem',
                              cursor: !config || saving || busy ? 'not-allowed' : 'pointer',
                              fontSize: '0.86rem',
                              color: theme.text.primary,
                              flex: '1 1 200px',
                              minWidth: 0,
                            }}
                          >
                            <input
                              id={id}
                              type="checkbox"
                              disabled={!config || saving || busy}
                              checked={checked}
                              onChange={(e) => toggleDbInclusion(s.category_file, e.target.checked)}
                            />
                            <span style={{ wordBreak: 'break-word' }}>
                              <span style={{ fontWeight: 600 }}>{s.category_file}</span>
                              {isGddNotionSyncSecondaryDatabase(s.category_file) ? (
                                <span style={{ color: theme.text.secondary, fontSize: '0.78rem' }}>
                                  {' '}
                                  (secondaire)
                                </span>
                              ) : null}
                              <span style={{ color: theme.text.secondary, fontSize: '0.8rem' }}>
                                {' '}
                                · {s.notion_id}
                              </span>
                            </span>
                          </label>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                            <button
                              type="button"
                              disabled={!config || saving || busy || previewLoading}
                              onClick={() => void runPreviewOneRow(s.category_file)}
                              style={buttonStyle(saving || busy || previewLoading)}
                              title="Récupère la première ligne Notion et le JSON mappé (comme la sync)"
                            >
                              Tester 1 ligne
                            </button>
                            <button
                              type="button"
                              disabled={!config || saving || busy}
                              onClick={() => runGddSync(true, { categoryFiles: [s.category_file] })}
                              style={buttonStyle(saving || busy)}
                              title="Sync complète miroir pour cette base seule ; n’efface pas les autres bases du disque"
                            >
                              Sync cette base
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
            <label style={labelStyle}>
              <span>Nouveau token Notion (laisser vide pour ne pas changer)</span>
              <PasswordInput
                autoComplete="off"
                disabled={!config || saving || busy}
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="secret…"
                showLabel="Afficher le token"
                hideLabel="Masquer le token"
                style={inputStyle}
              />
            </label>
            <p
              style={{
                margin: 0,
                fontSize: '0.8rem',
                color: theme.text.secondary,
                lineHeight: 1.45,
              }}
            >
              <strong style={{ color: theme.text.primary }}>Sauver sans sync</strong> : écrit sur le serveur
              l’intervalle, l’auto-sync, la rétention <code style={{ fontSize: '0.85em' }}>.archive/</code>, le token
              ci-dessus et les cases des bases — <strong style={{ color: theme.text.primary }}>sans</strong>{' '}
              lancer de synchronisation.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
              <button
                type="button"
                disabled={!config || saving || busy}
                onClick={() => void handleSaveSettings()}
                style={buttonStyle(saving || busy, true)}
              >
                {saving ? 'Sauvegarde…' : 'Sauver sans sync'}
              </button>
              <button
                type="button"
                disabled={!config || saving || busy}
                onClick={() => void loadConfig()}
                style={buttonStyle(saving || busy)}
              >
                Recharger la config
              </button>
              {saveMessage && (
                <span style={{ color: theme.state.success.color, fontSize: '0.88rem' }}>
                  {saveMessage}
                </span>
              )}
            </div>
            {saveError && (
              <p style={{ color: theme.state.error.color, fontSize: '0.85rem', margin: 0 }}>{saveError}</p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.35rem', alignItems: 'flex-start' }}>
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const r = await postGddNotionTestConnection()
                return { ok: r.ok, message: r.message }
              })
            }
            style={buttonStyle(busy)}
          >
            {busy ? '…' : 'Tester la connexion'}
          </button>
          <button
            type="button"
            disabled={busy || !config}
            onClick={() => runGddSync(false)}
            style={buttonStyle(busy || !config, true)}
            title={
              config
                ? undefined
                : 'Périmètre en cours de chargement — patientez pour ne pas lancer une sync sur toutes les sources.'
            }
          >
            {busy ? 'Synchronisation…' : 'Synchroniser (incrémental)'}
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
              <button
                type="button"
                disabled={busy || !config}
                onClick={() => runGddSync(true)}
                style={buttonStyle(busy || !config)}
                title={
                  !config
                    ? 'Périmètre en cours de chargement — patientez pour ne pas lancer une sync sur toutes les sources.'
                    : checkpoint?.resumable
                      ? 'Démarre une nouvelle sync complète (archive + staging neufs). L’ancien checkpoint est abandonné.'
                      : 'Lance une sync complète avec archive puis miroir Notion → disque.'
                }
              >
                {busy ? '…' : 'Sync complète'}
              </button>
              {checkpoint?.resumable ? (
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    backgroundColor: theme.border.focus,
                    color: theme.background.panel,
                    whiteSpace: 'nowrap',
                  }}
                  title="Une sync complète est en cours côté serveur (staging). Utilisez Reprendre ci-dessous."
                >
                  Incomplet {checkpoint.sources_completed}/{checkpoint.sources_total}
                </span>
              ) : null}
              {checkpoint &&
              !checkpoint.resumable &&
              (checkpoint.checkpoint_status === 'stale' || checkpoint.checkpoint_status === 'invalid_file') ? (
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: theme.state.error.color,
                    whiteSpace: 'nowrap',
                  }}
                >
                  Checkpoint expiré
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <p
          style={{
            margin: '0 0 0.5rem 0',
            fontSize: '0.8rem',
            color: theme.text.secondary,
            lineHeight: 1.4,
          }}
        >
          Périmètre de ce run :{' '}
          <strong style={{ color: theme.text.primary }}>
            {!config
              ? 'chargement du périmètre…'
              : runScopeDbCount === null
                ? `toutes les bases (${dbCount}) + toutes les fiches page (${pageCount})`
                : `${runScopeDbCount} base(s) cochée(s) — fiches page ignorées`}
          </strong>
        </p>
        <p
          style={{
            margin: '0 0 0.65rem 0',
            fontSize: '0.78rem',
            color: theme.text.secondary,
            lineHeight: 1.4,
          }}
        >
          <strong style={{ color: theme.text.primary }}>Reprendre la sync</strong> reprend une sync complète
          en cours sur le serveur (même après fermeture du site ou de l’application).{' '}
          <strong style={{ color: theme.text.primary }}>Sync complète</strong> sans reprise démarre un nouveau
          run et abandonne l’ancien checkpoint. L’annulation <em>pendant</em> la sync supprime le checkpoint.
        </p>

        <div
          style={{
            marginBottom: '1rem',
            padding: '0.65rem 0.75rem',
            borderRadius: '6px',
            backgroundColor: theme.background.panel,
            border: `1px solid ${
              checkpoint?.resumable ? theme.border.focus : theme.border.primary
            }`,
          }}
        >
          <p
            style={{
              margin: '0 0 0.35rem 0',
              color: theme.text.secondary,
              fontSize: '0.72rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            État reprise (sync complète)
          </p>
          {checkpointBannerError ? (
            <p style={{ margin: '0 0 0.5rem 0', color: theme.state.error.color, fontSize: '0.88rem' }}>
              {checkpointBannerError}
            </p>
          ) : (
            <p style={{ margin: '0 0 0.5rem 0', color: theme.text.primary, fontSize: '0.88rem', lineHeight: 1.45 }}>
              {checkpoint?.message ?? 'Chargement de l’état…'}
            </p>
          )}
          {checkpoint && checkpoint.orphan_staging_runs > 0 ? (
            <p style={{ margin: '0 0 0.5rem 0', color: theme.text.secondary, fontSize: '0.8rem' }}>
              Dossiers sous <code style={{ fontSize: '0.85em' }}>.staging/</code> :{' '}
              {checkpoint.orphan_staging_runs} — au plus un run incomplet est conservé ; le serveur supprime
              les orphelins à l’abandon ou au démarrage d’une nouvelle sync complète.
            </p>
          ) : null}
          {!checkpointBannerError && checkpoint?.resumable && !busy ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
              {checkpoint.mirror_promotion_pending ? (
                <div
                  style={{
                    padding: '0.55rem 0.65rem',
                    borderRadius: '6px',
                    border: `1px solid ${theme.state.warning.color}`,
                    backgroundColor: theme.background.secondary,
                  }}
                >
                  <p
                    style={{
                      margin: '0 0 0.45rem 0',
                      color: theme.state.warning.color,
                      fontSize: '0.88rem',
                      fontWeight: 600,
                    }}
                  >
                    Miroir prêt mais non appliqué (erreurs Notion sur certaines bases)
                  </p>
                  <p style={{ margin: '0 0 0.45rem 0', color: theme.text.secondary, fontSize: '0.82rem' }}>
                    Vous pouvez appliquer le contenu déjà récupéré : les bases absentes du staging restent
                    inchangées sur disque. Ou reprendre pour retenter les appels Notion.
                  </p>
                  {serverStatus?.partial_errors?.length ? (
                    <ul
                      style={{
                        margin: '0 0 0.5rem 1rem',
                        padding: 0,
                        color: theme.text.primary,
                        fontSize: '0.78rem',
                        maxHeight: '8rem',
                        overflowY: 'auto',
                      }}
                    >
                      {serverStatus.partial_errors.map((line) => (
                        <li key={line} style={{ marginBottom: '0.25rem' }}>
                          {line}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runGddSync(true, { applyStagingDespiteErrors: true })}
                      style={buttonStyle(busy, true)}
                    >
                      Appliquer le miroir malgré tout
                    </button>
                  </div>
                </div>
              ) : null}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runGddSync(true, { resume: true })}
                  style={buttonStyle(busy, true)}
                >
                  Reprendre la sync
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => runGddSync(true, { fresh: true })}
                  style={buttonStyle(busy)}
                >
                  Tout recommencer
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void (async () => {
                      try {
                        await deleteGddFullSyncCheckpoint()
                        await refreshCheckpoint()
                        onCheckpointDiskChanged?.()
                      } catch (e) {
                        setCheckpointBannerError(
                          e instanceof Error ? e.message : 'Abandon du checkpoint impossible',
                        )
                      }
                    })()
                  }
                  style={buttonStyle(busy)}
                >
                  Abandonner (checkpoint + staging)
                </button>
              </div>
            </div>
          ) : null}
          {!checkpointBannerError &&
          checkpoint &&
          !checkpoint.resumable &&
          !busy &&
          (checkpoint.checkpoint_status === 'stale' || checkpoint.checkpoint_status === 'invalid_file') ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => runGddSync(true, { fresh: true })}
                style={buttonStyle(busy, true)}
              >
                Tout recommencer
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    try {
                      await deleteGddFullSyncCheckpoint()
                      await refreshCheckpoint()
                      onCheckpointDiskChanged?.()
                    } catch (e) {
                      setCheckpointBannerError(
                        e instanceof Error ? e.message : 'Nettoyage impossible',
                      )
                    }
                  })()
                }
                style={buttonStyle(busy)}
              >
                Nettoyer checkpoint / staging
              </button>
            </div>
          ) : null}
          {!checkpointBannerError &&
          checkpoint &&
          !checkpoint.resumable &&
          checkpoint.checkpoint_status === 'none' &&
          checkpoint.orphan_staging_runs > 0 &&
          !busy ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void (async () => {
                    try {
                      await deleteGddFullSyncCheckpoint()
                      await refreshCheckpoint()
                      onCheckpointDiskChanged?.()
                    } catch (e) {
                      setCheckpointBannerError(
                        e instanceof Error ? e.message : 'Nettoyage impossible',
                      )
                    }
                  })()
                }
                style={buttonStyle(busy, true)}
              >
                Supprimer les dossiers .staging orphelins
              </button>
            </div>
          ) : null}
        </div>

        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            borderRadius: '6px',
            backgroundColor: theme.background.panel,
            border: `1px solid ${theme.border.primary}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem',
              marginBottom: '0.5rem',
            }}
          >
            <p style={{ margin: 0, color: theme.text.primary, fontWeight: 'bold' }}>
              Historique des sauvegardes
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void refreshArchives()}
              style={buttonStyle(busy)}
            >
              Actualiser la liste
            </button>
          </div>
          <p style={{ margin: '0 0 0.5rem 0', color: theme.text.secondary, fontSize: '0.85rem' }}>
            Snapshots locaux sous <code style={{ fontSize: '0.82em' }}>.archive/</code>. La sync
            complète en crée un avant mise à jour seulement si l’état sur disque diffère du dernier
            snapshot. « Taille » = somme des fichiers du dossier ; « Fiches » = estimation (un JSON
            par fiche dans les sous-dossiers + entrées des listes dans les monolithes à la racine).
            Les sauvegardes sans aucune fiche détectée ne sont pas affichées.
          </p>
          {archivesLoadError && (
            <p style={{ color: theme.state.error.color, fontSize: '0.85rem', margin: '0 0 0.5rem 0' }}>
              {archivesLoadError}
            </p>
          )}
          {archives.length === 0 && !archivesLoadError ? (
            <p style={{ margin: 0, color: theme.text.secondary, fontSize: '0.88rem' }}>
              Aucune sauvegarde pour l’instant (lancez une sync complète pour en créer une).
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: theme.text.secondary }}>
                    <th style={{ padding: '0.35rem 0.5rem' }}>Date (UTC)</th>
                    <th style={{ padding: '0.35rem 0.5rem' }}>Id</th>
                    <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Taille</th>
                    <th style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>Fiches</th>
                    <th style={{ padding: '0.35rem 0.5rem' }} />
                  </tr>
                </thead>
                <tbody>
                  {archives.map((a) => (
                    <tr
                      key={a.id}
                      style={{ borderTop: `1px solid ${theme.border.primary}`, color: theme.text.primary }}
                    >
                      <td style={{ padding: '0.35rem 0.5rem', whiteSpace: 'nowrap' }}>
                        {formatArchiveLabel(a.created_at)}
                      </td>
                      <td
                        style={{
                          padding: '0.35rem 0.5rem',
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          wordBreak: 'break-all',
                        }}
                      >
                        {a.id}
                      </td>
                      <td
                        style={{
                          padding: '0.35rem 0.5rem',
                          textAlign: 'right',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {formatArchiveSizeBytes(a.size_bytes)}
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>
                        {typeof a.fiche_count === 'number' ? a.fiche_count : '—'}
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setRestoreBackupCurrent(true)
                            setRestoreTargetId(a.id)
                          }}
                          style={buttonStyle(busy)}
                        >
                          Restaurer
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        {statusLoadError && (
          <p
            style={{
              margin: '0 0 0.5rem 0',
              color: theme.state.error.color,
              fontSize: '0.85rem',
            }}
          >
            Statut serveur indisponible — {statusLoadError}
          </p>
        )}
        {serverStatus?.last_finished_at && (
          <p style={{ margin: '0 0 0.5rem 0', color: theme.text.secondary, fontSize: '0.85rem' }}>
            Dernière sync GDD : {new Date(serverStatus.last_finished_at).toLocaleString('fr-FR')}
            {serverStatus.last_success === false && ' (échec)'}
            {typeof serverStatus.updated_entities === 'number' &&
              serverStatus.updated_entities > 0 &&
              ` — ${serverStatus.updated_entities} entité(s)`}
          </p>
        )}
        {serverStatus && serverStatus.partial_errors.length > 0 && (
          <details style={{ marginTop: '0.25rem' }}>
            <summary style={{ cursor: 'pointer', color: theme.state.error.color, fontSize: '0.85rem' }}>
              Erreurs partielles ({serverStatus.partial_errors.length})
            </summary>
            <ul style={{ fontSize: '0.8rem', color: theme.text.secondary, maxHeight: '160px', overflow: 'auto' }}>
              {serverStatus.partial_errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <GddNotionSyncProgressModal
        open={progressOpen}
        modeFull={syncModeFull}
        progress={progressSnapshot}
        elapsedSeconds={elapsedSec}
        syncActive={phase === 'loading'}
        onPause={() => void postGddFullSyncPause()}
        onUnpause={() => void postGddFullSyncUnpause()}
        onCancel={() => void postGddFullSyncCancel()}
      />

      {previewOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="gdd-preview-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 2150,
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
              maxWidth: 'min(920px, 100vw - 2rem)',
              maxHeight: 'min(85vh, 720px)',
              borderRadius: '10px',
              padding: '1.25rem 1.5rem',
              backgroundColor: theme.background.panel,
              border: `1px solid ${theme.border.primary}`,
              boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
            }}
          >
            <h3 id="gdd-preview-title" style={{ margin: 0, color: theme.text.primary }}>
              Test Notion — {previewForFile ?? 'base'}
            </h3>
            <p style={{ margin: 0, color: theme.text.secondary, fontSize: '0.88rem' }}>
              Première ligne de la base, même pipeline que la sync (query → get_page → mapping). Aucune écriture sur
              le GDD.
            </p>
            {previewLoading && (
              <p style={{ margin: 0, color: theme.text.secondary }}>Chargement…</p>
            )}
            {previewError && (
              <p style={{ margin: 0, color: theme.state.error.color, fontSize: '0.9rem' }}>{previewError}</p>
            )}
            {previewData && !previewLoading && (
              <>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: '1.2rem',
                    color: theme.text.secondary,
                    fontSize: '0.82rem',
                    lineHeight: 1.5,
                  }}
                >
                  <li>
                    Data sources (API 2025-09-03) : <strong>{previewData.data_sources_count}</strong>
                  </li>
                  <li>Lignes retournées par query : {previewData.query_total_rows}</li>
                  <li>Clés propriétés (ligne query / get_page) : {previewData.property_keys_from_query_row.length} /{' '}
                    {previewData.property_keys_from_get_page.length}</li>
                  <li>
                    Colonnes dans <code style={{ fontSize: '0.85em' }}>values</code> (hors titre) :{' '}
                    {previewData.mapped_record &&
                    typeof previewData.mapped_record === 'object' &&
                    previewData.mapped_record !== null &&
                    'values' in previewData.mapped_record &&
                    typeof previewData.mapped_record.values === 'object' &&
                    previewData.mapped_record.values !== null
                      ? Object.keys(previewData.mapped_record.values as object).length
                      : 0}
                  </li>
                  <li>Mode compact table : {previewData.compact_table ? 'oui' : 'non'}</li>
                </ul>
                <pre
                  style={{
                    margin: 0,
                    flex: 1,
                    minHeight: '200px',
                    overflow: 'auto',
                    padding: '0.65rem',
                    fontSize: '0.75rem',
                    lineHeight: 1.35,
                    backgroundColor: theme.background.secondary,
                    borderRadius: '6px',
                    border: `1px solid ${theme.border.primary}`,
                    color: theme.text.primary,
                  }}
                >
                  {JSON.stringify(previewData.mapped_record ?? previewData, null, 2)}
                </pre>
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                disabled={previewLoading}
                onClick={closePreview}
                style={buttonStyle(previewLoading)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {restoreTargetId ? (
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
      ) : null}
    </div>
  )
}

/** Explication du filtre de bases : identique en tooltip (survol) et en dépliage (tactile / clavier). */
function DatabasePerimeterHelpText() {
  const em: CSSProperties = { color: theme.text.primary }
  return (
    <span style={{ display: 'block', fontSize: '0.82rem', lineHeight: 1.45 }}>
      Cochez les bases Notion à inclure. <strong style={em}>Aucune case</strong> ou{' '}
      <strong style={em}>toutes les cases</strong> cochées = pas de filtre (toutes les bases + toutes
      les fiches page). Si vous restreignez les bases, chaque sync ne traite{' '}
      <strong style={em}>que</strong> ces bases — les fiches (sources page) sont alors ignorées sur ce
      run (évite de parcourir tout le hub). Retirez le filtre pour tout resynchroniser.
      <br />
      <strong style={em}>Cocher essentiels</strong> : coche toutes les bases sauf celles marquées
      « secondaire » et <strong style={em}>enregistre</strong> immédiatement le périmètre sur le
      serveur.
      <br />
      <strong style={em}>Sync complète (bouton global) avec filtre :</strong> les fichiers (ou
      dossiers shards) des bases <em>non</em> cochées sont <strong>retirés</strong> du dossier GDD
      local après promotion du miroir (les fiches page déjà sur disque ne sont pas effacées). Utilisez
      le bouton <strong>Sync cette base</strong> sur une ligne pour une sync complète{' '}
      <em>uniquement</em> sur cette base sans toucher aux autres.
      <br />
      <strong style={em}>Sync normale ou complète :</strong> les cases cochées s’appliquent à ce run
      uniquement (filtre éphémère). Le périmètre <strong>sauvegardé</strong> (Cocher essentiels,
      Appliquer le périmètre ou Sauver sans sync) détermine quelles bases sont retirées du disque lors
      d’une sync complète globale.
    </span>
  )
}

function DatabasePerimeterHelp() {
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <Tooltip content={<DatabasePerimeterHelpText />} position="bottom" maxWidth="520px">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label="Aide sur le périmètre des bases à synchroniser"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            minHeight: '28px',
            padding: '0.1rem 0.5rem',
            borderRadius: '999px',
            border: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.secondary,
            color: theme.text.secondary,
            fontSize: '0.78rem',
            cursor: 'help',
          }}
        >
          <span aria-hidden>ⓘ</span> Aide
        </button>
      </Tooltip>
      {expanded ? (
        <div
          style={{
            flexBasis: '100%',
            padding: '0.6rem 0.7rem',
            borderRadius: '6px',
            border: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.secondary,
            color: theme.text.secondary,
          }}
        >
          <DatabasePerimeterHelpText />
        </div>
      ) : null}
    </>
  )
}

function formatArchiveLabel(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) {
      return iso
    }
    return d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function formatArchiveSizeBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return '—'
  }
  if (n === 0) {
    return '0 o'
  }
  const units = ['o', 'Ko', 'Mo', 'Go'] as const
  let i = 0
  let x = n
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024
    i += 1
  }
  const rounded = i === 0 || x >= 10 ? Math.round(x) : Math.round(x * 10) / 10
  return `${rounded} ${units[i]}`
}

function apiErrorDetail(e: unknown): string {
  if (e && typeof e === 'object' && 'response' in e) {
    const data = (e as { response?: { data?: { detail?: unknown } } }).response?.data
    const d = data?.detail
    if (typeof d === 'string') {
      return d
    }
    if (Array.isArray(d)) {
      const first = d[0] as { msg?: string } | undefined
      if (first && typeof first.msg === 'string') {
        return first.msg
      }
    }
  }
  if (e instanceof Error) {
    return e.message
  }
  return 'Erreur lors de la restauration'
}

const labelStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.35rem',
  color: theme.text.secondary,
  fontSize: '0.88rem',
}

const inputStyle: CSSProperties = {
  padding: '0.45rem 0.6rem',
  borderRadius: '4px',
  border: `1px solid ${theme.border.primary}`,
  backgroundColor: theme.background.secondary,
  color: theme.text.primary,
}

function buttonStyle(disabled: boolean, primary = false): CSSProperties {
  return {
    padding: '0.5rem 1rem',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: disabled
      ? theme.button.default.background
      : primary
        ? theme.button.primary.background
        : theme.button.default.background,
    color: primary ? theme.button.primary.color : theme.text.primary,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    fontWeight: primary ? 'bold' : 'normal',
  }
}
