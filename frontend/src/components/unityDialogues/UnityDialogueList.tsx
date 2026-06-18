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
import { UnityDialogueItem } from './UnityDialogueItem'
import {
  DialogueListContextMenu,
  type DialogueListContextMenuState,
} from './DialogueListContextMenu'
import { StyledSelect } from '../shared/StyledSelect'
import { useDialogueListData } from '../../hooks/useDialogueListData'
import { normalizeDialogueFilenameKey } from '../../utils/formatDialogueTitle'
import { useToast } from '../shared'
import { useBatchUnityExport, toDocumentId } from '../../hooks/useBatchUnityExport'
import { useDocumentSchemaValidation } from '../../hooks/useDocumentSchemaValidation'
import { BatchExportToolbar } from './BatchExportToolbar'
import { BatchExportSummaryBanner } from './BatchExportSummaryBanner'
import { SchemaValidationPanel } from '../graph/SchemaValidationPanel'
import { useGraphStore } from '../../store/graphStore'
import { getDialogueDisplayTitle } from '../../utils/formatDialogueTitle'

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
  const batch = useBatchUnityExport(toast)
  const docSchemaValidation = useDocumentSchemaValidation()
  const hasUnsavedChanges = useGraphStore((s) => s.hasUnsavedChanges)
  const openDocumentId = useGraphStore((s) => s.documentId)
  const openFilename = useGraphStore((s) => s.dialogueMetadata.filename)
  const {
    filteredDialogues,
    total,
    filteredCount,
    searchQuery,
    setSearchQuery,
    sortType,
    setSortType,
    isLoading,
    error,
    refresh,
  } = useDialogueListData()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [contextMenu, setContextMenu] = useState<DialogueListContextMenuState | null>(null)

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

  const handleValidateDocumentSchema = useCallback(
    (dialogue: UnityDialogueMetadata) => {
      const docId = toDocumentId(dialogue.filename)
      void docSchemaValidation.validateDocument(docId, getDialogueDisplayTitle(dialogue))
    },
    [docSchemaValidation],
  )

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
        </div>

        <div style={{ fontSize: remSize('small'), color: theme.text.secondary }}>
          {filteredCount} dialogue{filteredCount !== 1 ? 's' : ''}
          {searchQuery && ` (sur ${total} total)`}
        </div>
      </div>

      <BatchExportToolbar
        checkedCount={batch.checkedDocumentIds.size}
        filteredCount={filteredCount}
        isBatchExporting={batch.isBatchExporting}
        batchProgress={batch.batchProgress}
        showOptionsPanel={batch.showOptionsPanel}
        batchOptions={batch.batchOptions}
        onToggleSelectAll={() => {
          if (batch.checkedDocumentIds.size === filteredDocumentIds.length) {
            batch.clearChecks()
          } else {
            batch.selectAllFiltered(filteredDocumentIds)
          }
        }}
        onStartExport={handleStartBatchExport}
        onCancelExport={batch.cancelBatchExport}
        onToggleOptions={() => batch.setShowOptionsPanel(!batch.showOptionsPanel)}
        onOptionsChange={batch.setBatchOptions}
      />

      {batch.batchSummary && (
        <BatchExportSummaryBanner
          summary={batch.batchSummary}
          onDismiss={batch.dismissSummary}
          onRetryFailed={() => {
            void batch.retryFailedExports()
          }}
        />
      )}

      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '0.5rem', minHeight: 0 }}>
        {filteredDialogues.length === 0 ? (
          <div style={{ padding: '0.75rem', textAlign: 'center', fontSize: remSize('body'), color: theme.text.secondary }}>
            {searchQuery ? 'Aucun dialogue trouvé' : 'Aucun dialogue Unity'}
          </div>
        ) : (
          filteredDialogues.map((dialogue) => {
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
      {contextMenu && (
        <DialogueListContextMenu
          state={contextMenu}
          onClose={() => setContextMenu(null)}
          onSelect={(dialogue) => onSelectDialogue(dialogue)}
          onValidateSchema={handleValidateDocumentSchema}
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
    </div>
  )
  }
)
