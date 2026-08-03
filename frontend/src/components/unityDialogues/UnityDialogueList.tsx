/**
 * Composant pour afficher la liste des dialogues Unity avec recherche.
 *
 * Consomme le hook partagé `useDialogueListData` (Story 17.7) ; conserve
 * la gestion locale du raccourci `/` (focus champ recherche) et de
 * l'exposition du `refresh()` via ref impérative.
 */
import { useCallback, useEffect, useImperativeHandle, forwardRef, useMemo, useRef, useState } from 'react'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import type { UnityDialogueMetadata } from '../../types/api'
import { useAuthStore } from '../../store/authStore'
import { UnityDialogueItem } from './UnityDialogueItem'
import {
  DialogueListContextMenu,
  type DialogueListContextMenuState,
} from './DialogueListContextMenu'
import { StyledSelect } from '../shared/StyledSelect'
import { useDialogueListData } from '../../hooks/useDialogueListData'
import {
  normalizeDialogueFilenameKey,
  titleToDocumentId,
} from '../../utils/formatDialogueTitle'
import { useToast, Badge } from '../shared'
import { useBatchUnityExport, toDocumentId } from '../../hooks/useBatchUnityExport'
import { useRegisterUnityBatchExportMenu } from '../../hooks/useRegisterUnityBatchExportMenu'
import { useDocumentSchemaValidation } from '../../hooks/useDocumentSchemaValidation'
import { useUnityExportPreview } from '../../hooks/useUnityExportPreview'
import { BatchExportToolbar } from './BatchExportToolbar'
import { BatchExportSummaryBanner } from './BatchExportSummaryBanner'
import { ExportPreviewModal } from './ExportPreviewModal'
import { ExportLogsPanel } from './ExportLogsPanel'
import { DownloadExportOptionsPanel } from './DownloadExportOptionsPanel'
import { SchemaValidationPanel } from '../graph/SchemaValidationPanel'
import {
  loadDownloadExportOptions,
  saveDownloadExportOptions,
  type DownloadExportOptions,
} from '../../utils/downloadExportOptions'
import {
  DIALOGUE_DATE_PERIOD_LABELS,
  type DialogueDatePeriod,
} from '../../utils/dialogueListFilters'
import { downloadAllExportedFiles, downloadPersistedUnityDialogue } from '../../utils/unityExportDownload'
import { useGraphStore } from '../../store/graphStore'
import { getDialogueDisplayTitle } from '../../utils/formatDialogueTitle'
import * as documentsAPI from '../../api/documents'
import { getErrorMessage } from '../../types/errors'

const BATCH_UNSAVED_WARNING =
  'Le dialogue ouvert a des modifications non sauvegardées. Sauvegardez avant de l’inclure dans l’export batch.'

interface UnityDialogueListProps {
  onSelectDialogue: (dialogue: UnityDialogueMetadata | null) => void
  selectedFilename: string | null
}

export interface UnityDialogueListRef {
  refresh: () => void | Promise<void>
}

export const UnityDialogueList = forwardRef<UnityDialogueListRef, UnityDialogueListProps>(
  function UnityDialogueList({ onSelectDialogue, selectedFilename }, ref) {
  const toast = useToast()
  const isGuest = useAuthStore((s) => s.user?.role === 'guest')
  const batch = useBatchUnityExport(toast)
  const [downloadOptions, setDownloadOptionsState] = useState<DownloadExportOptions>(() =>
    loadDownloadExportOptions(),
  )
  const [showDownloadOptionsPanel, setShowDownloadOptionsPanel] = useState(false)
  const [showExportLogsPanel, setShowExportLogsPanel] = useState(false)
  const [isBatchDownloading, setIsBatchDownloading] = useState(false)
  const docSchemaValidation = useDocumentSchemaValidation()
  const hasUnsavedChanges = useGraphStore((s) => s.hasUnsavedChanges)
  const openDocumentId = useGraphStore((s) => s.documentId)
  const openFilename = useGraphStore((s) => s.dialogueMetadata.filename)
  const {
    filteredDialogues,
    paginatedDialogues,
    total,
    filteredCount,
    searchQuery,
    setSearchQuery,
    datePeriod,
    setDatePeriod,
    authorId,
    setAuthorId,
    availableAuthors,
    hasActiveFilters,
    resetFilters,
    sortType,
    setSortType,
    page,
    totalPages,
    setPage,
    isLoading,
    error,
    refresh,
  } = useDialogueListData()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [contextMenu, setContextMenu] = useState<DialogueListContextMenuState | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const batchPreview = useUnityExportPreview(
    toast,
    {
      setShowSchemaValidationPanel: () => undefined,
      setSchemaValidationLoading: () => undefined,
      setSchemaValidationIsValid: () => undefined,
      setSchemaValidationErrors: () => undefined,
      setSchemaValidationErrorCount: () => undefined,
      setSchemaValidationWarnings: () => undefined,
      setSchemaValidationStructuredErrors: () => undefined,
    },
    { registerSuccessfulExport: () => undefined },
  )

  const filteredDocumentIds = useMemo(
    () => filteredDialogues.map((d) => toDocumentId(d.filename)),
    [filteredDialogues],
  )

  const handleItemContextMenu = useCallback(
    (dialogue: UnityDialogueMetadata, e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setContextMenu({ dialogue, clientX: e.clientX, clientY: e.clientY })
    },
    [],
  )

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return
      }
      if (e.key === '/') {
        e.preventDefault()
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  useImperativeHandle(ref, () => ({
    refresh,
  }), [refresh])

  const handleItemClick = (dialogue: UnityDialogueMetadata) => {
    if (
      selectedFilename &&
      normalizeDialogueFilenameKey(selectedFilename) === normalizeDialogueFilenameKey(dialogue.filename)
    ) {
      onSelectDialogue(null)
    } else {
      onSelectDialogue(dialogue)
    }
  }

  const handleCreateDialogue = useCallback(async () => {
    const requestedTitle = window.prompt('Titre du nouveau dialogue')
    if (requestedTitle === null) return
    const title = requestedTitle.trim()
    const documentId = titleToDocumentId(title)
    if (!documentId) {
      toast('Le titre doit contenir au moins une lettre ou un chiffre.', 'error')
      return
    }
    setIsCreating(true)
    try {
      await documentsAPI.putDocument(documentId, {
        document: { schemaVersion: '1.2.0', title, nodes: [] },
        revision: 1,
        validationMode: 'draft',
        createOnly: true,
      })
      await refresh()
      onSelectDialogue({
        filename: `${documentId}.json`,
        file_path: '',
        size_bytes: 0,
        modified_time: new Date().toISOString(),
        title,
        capabilities: {
          can_read: true,
          can_edit: true,
          can_delete: true,
          is_owner: true,
        },
      })
    } catch (error) {
      toast(`Création impossible : ${getErrorMessage(error)}`, 'error')
    } finally {
      setIsCreating(false)
    }
  }, [onSelectDialogue, refresh, toast])

  const handleValidateDocumentSchema = useCallback(
    (dialogue: UnityDialogueMetadata) => {
      const docId = toDocumentId(dialogue.filename)
      void docSchemaValidation.validateDocument(docId, getDialogueDisplayTitle(dialogue))
    },
    [docSchemaValidation],
  )

  const handleStartBatchPreview = useCallback(async () => {
    const ids = Array.from(batch.checkedDocumentIds)
    if (ids.length === 0) {
      return
    }
    await batchPreview.handleBatchPreviewExport(ids)
  }, [batch.checkedDocumentIds, batchPreview])

  const handleStartBatchExport = useCallback(() => {
    const ids = Array.from(batch.checkedDocumentIds)
    const currentDocKey = normalizeDialogueFilenameKey(
      openDocumentId ?? openFilename ?? '',
    )
    if (
      hasUnsavedChanges &&
      currentDocKey &&
      ids.some((id) => normalizeDialogueFilenameKey(id) === currentDocKey)
    ) {
      toast(BATCH_UNSAVED_WARNING, 'warning')
      return
    }
    void batch.startBatchExport(ids)
  }, [
    batch,
    hasUnsavedChanges,
    openDocumentId,
    openFilename,
    toast,
  ])

  const setDownloadOptions = useCallback((options: DownloadExportOptions) => {
    setDownloadOptionsState(options)
    saveDownloadExportOptions(options)
  }, [])

  const handleDownloadAllExported = useCallback(async () => {
    if (!batch.batchSummary || batch.batchSummary.exportedFilenames.length === 0) {
      return
    }
    try {
      await downloadAllExportedFiles(
        batch.batchSummary.exportedFilenames,
        downloadOptions,
        setIsBatchDownloading,
      )
    } catch (err) {
      toast(`Erreur téléchargement : ${err instanceof Error ? err.message : String(err)}`, 'error')
    }
  }, [batch.batchSummary, downloadOptions, toast])

  const handleDownloadDialogue = useCallback(
    async (dialogue: UnityDialogueMetadata) => {
      const docId = toDocumentId(dialogue.filename)
      try {
        await downloadPersistedUnityDialogue(
          docId,
          dialogue.filename,
          downloadOptions,
          setIsBatchDownloading,
          dialogue.title,
        )
      } catch (err) {
        toast(`Erreur téléchargement : ${err instanceof Error ? err.message : String(err)}`, 'error')
      }
    },
    [toast, downloadOptions],
  )

  const batchMenuActions = useMemo(
    () => ({
      onToggleSelectAll: () => {
        if (batch.checkedDocumentIds.size === filteredDocumentIds.length) {
          batch.clearChecks()
        } else {
          batch.selectAllFiltered(filteredDocumentIds)
        }
      },
      onStartExport: handleStartBatchExport,
      onStartPreview: () => {
        void handleStartBatchPreview()
      },
      onCancelExport: batch.cancelBatchExport,
      onToggleBatchOptions: () => batch.setShowOptionsPanel(!batch.showOptionsPanel),
      onOpenExportLogs: () => setShowExportLogsPanel(true),
      onToggleDownloadOptions: () => setShowDownloadOptionsPanel((open) => !open),
    }),
    [
      batch,
      filteredDocumentIds,
      handleStartBatchExport,
      handleStartBatchPreview,
    ],
  )

  useRegisterUnityBatchExportMenu({
    filteredCount: filteredCount,
    checkedCount: batch.checkedDocumentIds.size,
    isBatchExporting: batch.isBatchExporting,
    batchProgress: batch.batchProgress,
    showBatchOptionsPanel: batch.showOptionsPanel,
    showDownloadOptionsPanel,
    actions: batchMenuActions,
  })

  if (isLoading) {
    return (
      <div style={{ padding: '0.65rem', textAlign: 'center', fontSize: remSize('body'), color: theme.text.secondary }}>
        <div>Chargement des dialogues Unity...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          padding: '1rem',
          color: theme.state.error.color,
          backgroundColor: theme.state.error.background,
          borderRadius: '4px',
        }}
      >
        {error}
        <button
          onClick={() => void refresh()}
          style={{
            marginTop: '0.5rem',
            padding: '0.5rem 1rem',
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '4px',
            backgroundColor: theme.button.default.background,
            color: theme.button.default.color,
            cursor: 'pointer',
          }}
        >
          Réessayer
        </button>
      </div>
    )
  }

  return (
    <div data-testid="unity-dialogue-list" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div
        style={{
          padding: '0.5rem',
          borderBottom: `1px solid ${theme.border.primary}`,
          backgroundColor: theme.background.panelHeader,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.4rem',
            marginBottom: '0.45rem',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            data-testid="create-dialogue-button"
            disabled={isCreating || isGuest}
            hidden={isGuest}
            onClick={() => void handleCreateDialogue()}
            style={{
              padding: '0.45rem 0.65rem',
              border: `1px solid ${theme.button.primary.background}`,
              borderRadius: '6px',
              backgroundColor: theme.button.primary.background,
              color: theme.button.primary.color,
              cursor: isCreating || isGuest ? 'not-allowed' : 'pointer',
              flexShrink: 0,
              display: isGuest ? 'none' : undefined,
            }}
          >
            {isCreating ? 'Création…' : 'Nouveau'}
          </button>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Rechercher… (/)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              flex: '1 1 120px',
              minWidth: 0,
              padding: '0.45rem 0.55rem',
              fontSize: remSize('body'),
              border: `1px solid ${theme.input.border}`,
              borderRadius: '6px',
              boxSizing: 'border-box',
              backgroundColor: theme.input.background,
              color: theme.input.color,
            }}
          />
          <StyledSelect
            value={sortType}
            onChange={(e) => setSortType(e.target.value as typeof sortType)}
            style={{
              padding: '0.45rem 0.5rem',
              border: `1px solid ${theme.input.border}`,
              borderRadius: '6px',
              backgroundColor: theme.input.background,
              color: theme.input.color,
              fontSize: remSize('small'),
              flexShrink: 0,
            }}
            wrapperStyle={{ width: 'auto', flexShrink: 0 }}
            title="Trier les dialogues"
          >
            <option value="date-desc">Date (récent)</option>
            <option value="date-asc">Date (ancien)</option>
            <option value="name-asc">Nom (A-Z)</option>
            <option value="name-desc">Nom (Z-A)</option>
          </StyledSelect>
          <StyledSelect
            data-testid="unity-dialogue-filter-period"
            value={datePeriod}
            onChange={(e) =>
              setDatePeriod(e.target.value as DialogueDatePeriod)
            }
            style={{
              padding: '0.45rem 0.5rem',
              border: `1px solid ${theme.input.border}`,
              borderRadius: '6px',
              backgroundColor: theme.input.background,
              color: theme.input.color,
              fontSize: remSize('small'),
              flexShrink: 0,
            }}
            wrapperStyle={{ width: 'auto', flexShrink: 0 }}
            title="Filtrer par date de création"
          >
            {(Object.keys(DIALOGUE_DATE_PERIOD_LABELS) as DialogueDatePeriod[]).map(
              (key) => (
                <option key={key} value={key}>
                  {DIALOGUE_DATE_PERIOD_LABELS[key]}
                </option>
              )
            )}
          </StyledSelect>
          <StyledSelect
            data-testid="unity-dialogue-filter-author"
            value={authorId ?? ''}
            onChange={(e) => setAuthorId(e.target.value || null)}
            style={{
              padding: '0.45rem 0.5rem',
              border: `1px solid ${theme.input.border}`,
              borderRadius: '6px',
              backgroundColor: theme.input.background,
              color: theme.input.color,
              fontSize: remSize('small'),
              flexShrink: 0,
            }}
            wrapperStyle={{ width: 'auto', flexShrink: 0 }}
            title="Filtrer par auteur"
          >
            <option value="">Tous les auteurs</option>
            {availableAuthors.map((author) => (
              <option key={author.id} value={author.id}>
                {author.username}
              </option>
            ))}
          </StyledSelect>
        </div>

        {(hasActiveFilters || searchQuery.trim()) && (
          <div
            data-testid="unity-dialogue-active-filters"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.35rem',
              alignItems: 'center',
              marginBottom: '0.35rem',
            }}
          >
            {datePeriod !== 'all' && (
              <Badge
                data-testid="unity-dialogue-filter-badge-period"
                variant="info"
                size="sm"
                onClick={() => setDatePeriod('all')}
                title="Retirer le filtre date"
              >
                {DIALOGUE_DATE_PERIOD_LABELS[datePeriod]} ×
              </Badge>
            )}
            {authorId && (
              <Badge
                data-testid="unity-dialogue-filter-badge-author"
                variant="info"
                size="sm"
                onClick={() => setAuthorId(null)}
                title="Retirer le filtre auteur"
              >
                {(
                  availableAuthors.find((a) => a.id === authorId)?.username ??
                  authorId
                )}{' '}
                ×
              </Badge>
            )}
            {hasActiveFilters && (
              <button
                type="button"
                data-testid="unity-dialogue-filters-reset"
                onClick={resetFilters}
                style={{
                  padding: '0.15rem 0.45rem',
                  border: 'none',
                  background: 'transparent',
                  color: theme.text.secondary,
                  cursor: 'pointer',
                  fontSize: remSize('small'),
                  textDecoration: 'underline',
                }}
              >
                Réinitialiser
              </button>
            )}
          </div>
        )}

        <div style={{ fontSize: remSize('small'), color: theme.text.secondary }}>
          {filteredCount} dialogue{filteredCount !== 1 ? 's' : ''}
          {(searchQuery || hasActiveFilters) && ` (sur ${total} total)`}
        </div>
      </div>

      {batch.batchSummary && (
        <BatchExportSummaryBanner
          summary={batch.batchSummary}
          isDownloading={isBatchDownloading}
          onDismiss={batch.dismissSummary}
          onRetryFailed={() => {
            void batch.retryFailedExports()
          }}
          onDownloadAll={() => {
            void handleDownloadAllExported()
          }}
        />
      )}

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0.5rem', minHeight: 0 }}>
        {filteredDialogues.length === 0 ? (
          <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: remSize('body'), color: theme.text.secondary }}>
            {searchQuery.trim() || hasActiveFilters
              ? 'Aucun dialogue trouvé'
              : 'Aucun dialogue Unity'}
          </div>
        ) : (
          paginatedDialogues.map((dialogue) => {
            const docId = toDocumentId(dialogue.filename)
            return (
            <UnityDialogueItem
              key={dialogue.filename}
              dialogue={dialogue}
              onClick={() => handleItemClick(dialogue)}
              onContextMenu={(e) => handleItemContextMenu(dialogue, e)}
              isSelected={
                !!selectedFilename &&
                normalizeDialogueFilenameKey(selectedFilename) === normalizeDialogueFilenameKey(dialogue.filename)
              }
              searchQuery={searchQuery}
              batchMode
              isChecked={batch.checkedDocumentIds.has(docId)}
              onCheckChange={(checked) => {
                const isChecked = batch.checkedDocumentIds.has(docId)
                if (checked !== isChecked) {
                  batch.toggleDocumentCheck(docId)
                }
              }}
            />
            )
          })
        )}
      </div>
      {totalPages > 1 && (
        <div
          data-testid="unity-dialogue-pagination"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem',
            padding: '0.5rem',
            borderTop: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.panelHeader,
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            data-testid="unity-dialogue-pagination-prev"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            style={{
              padding: '0.35rem 0.6rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
              opacity: page <= 1 ? 0.5 : 1,
            }}
          >
            Précédent
          </button>
          <span
            data-testid="unity-dialogue-pagination-indicator"
            style={{ fontSize: remSize('small'), color: theme.text.secondary }}
          >
            Page {page} sur {totalPages} — Total : {filteredCount}
          </span>
          <button
            type="button"
            data-testid="unity-dialogue-pagination-next"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            style={{
              padding: '0.35rem 0.6rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              opacity: page >= totalPages ? 0.5 : 1,
            }}
          >
            Suivant
          </button>
        </div>
      )}
      {contextMenu && (
        <DialogueListContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onSelect={(dialogue) => onSelectDialogue(dialogue)}
          onValidateSchema={handleValidateDocumentSchema}
          onDownload={(dialogue) => {
            void handleDownloadDialogue(dialogue)
          }}
          onDeleted={() => refresh()}
        />
      )}
      <SchemaValidationPanel
        isOpen={docSchemaValidation.isOpen}
        isLoading={docSchemaValidation.isLoading}
        isValid={docSchemaValidation.isValid}
        errors={docSchemaValidation.errors}
        errorCount={docSchemaValidation.errorCount}
        warnings={docSchemaValidation.warnings}
        structuredErrors={docSchemaValidation.structuredErrors}
        onClose={docSchemaValidation.close}
      />
      <ExportPreviewModal
        isOpen={batchPreview.previewOpen && batchPreview.previewMode === 'batch'}
        mode="batch"
        isLoading={batchPreview.previewLoading}
        error={batchPreview.previewError}
        batchPreview={batchPreview.batchPreview}
        onClose={batchPreview.closePreview}
      />
      {batch.showOptionsPanel && (
        <div
          role="dialog"
          aria-label="Options export batch"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1850,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => batch.setShowOptionsPanel(false)}
        >
          <div
            style={{
              width: 'min(420px, 96vw)',
              padding: '0.75rem',
              backgroundColor: theme.background.panel,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <BatchExportToolbar
              controlsHidden
              checkedCount={batch.checkedDocumentIds.size}
              filteredCount={filteredCount}
              isBatchExporting={batch.isBatchExporting}
              batchProgress={batch.batchProgress}
              showOptionsPanel
              batchOptions={batch.batchOptions}
              onToggleSelectAll={batchMenuActions.onToggleSelectAll}
              onStartExport={handleStartBatchExport}
              onStartPreview={() => void handleStartBatchPreview()}
              onCancelExport={batch.cancelBatchExport}
              onToggleOptions={() => batch.setShowOptionsPanel(false)}
              onOptionsChange={batch.setBatchOptions}
            />
          </div>
        </div>
      )}
      {showDownloadOptionsPanel && (
        <div
          role="dialog"
          aria-label="Options téléchargement"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1850,
            backgroundColor: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
          onClick={() => setShowDownloadOptionsPanel(false)}
        >
          <div
            style={{
              width: 'min(420px, 96vw)',
              padding: '0.75rem',
              backgroundColor: theme.background.panel,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '8px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <DownloadExportOptionsPanel options={downloadOptions} onChange={setDownloadOptions} />
          </div>
        </div>
      )}
      {batch.isBatchExporting && (
        <BatchExportToolbar
          controlsHidden
          checkedCount={batch.checkedDocumentIds.size}
          filteredCount={filteredCount}
          isBatchExporting={batch.isBatchExporting}
          batchProgress={batch.batchProgress}
          showOptionsPanel={false}
          batchOptions={batch.batchOptions}
          onToggleSelectAll={batchMenuActions.onToggleSelectAll}
          onStartExport={handleStartBatchExport}
          onStartPreview={() => void handleStartBatchPreview()}
          onCancelExport={batch.cancelBatchExport}
          onToggleOptions={() => batch.setShowOptionsPanel(true)}
          onOptionsChange={batch.setBatchOptions}
        />
      )}
      {showExportLogsPanel && (
        <div
          role="dialog"
          aria-label="Logs d'export"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1900,
            backgroundColor: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'stretch',
            justifyContent: 'flex-end',
          }}
          onClick={() => setShowExportLogsPanel(false)}
        >
          <div
            style={{
              width: 'min(520px, 96vw)',
              height: '100%',
              backgroundColor: theme.background.panel,
              borderLeft: `1px solid ${theme.border.primary}`,
              overflow: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <ExportLogsPanel onClose={() => setShowExportLogsPanel(false)} />
          </div>
        </div>
      )}
    </div>
  )
  }
)
