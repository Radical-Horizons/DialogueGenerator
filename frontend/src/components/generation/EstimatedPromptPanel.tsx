/**
 * Panneau d'affichage du prompt brut (RawPrompt).
 * Le compteur tokens contexte est affiché une seule fois dans ContextSelectionBudgetBar (panneau droit).
 */
import { memo, useState, useCallback } from 'react'
import { usePromptPreview } from '../../hooks/usePromptPreview'
import { useLazyPromptPreview } from '../../hooks/useLazyPromptPreview'
import { StructuredPromptView } from './StructuredPromptView'
import { theme } from '../../theme'
import { useToast } from '../shared'
import { useGenerationStore } from '../../store/generationStore'
import type { RawPrompt } from '../../types/api'
import type { PromptStructure } from '../../types/prompt'

export interface EstimatedPromptPanelProps {
  /** Le prompt brut à afficher (RawPrompt) */
  raw_prompt: RawPrompt | null | undefined
  /** Indique si l'estimation / construction du prompt est en cours */
  isEstimating?: boolean
  /** Onglet Prompt visible — déclenche le chargement du prompt complet */
  isActive?: boolean
  /** Structure JSON du prompt (optionnel) */
  structuredPrompt?: PromptStructure | null
}

export const EstimatedPromptPanel = memo(function EstimatedPromptPanel({
  raw_prompt,
  isEstimating = false,
  isActive = true,
  structuredPrompt: structuredPromptProp,
}: EstimatedPromptPanelProps) {
  const [viewMode, setViewMode] = useState<'raw' | 'structured'>('structured')
  const toast = useToast()

  useLazyPromptPreview({ enabled: isActive })

  const [allExpanded, setAllExpanded] = useState(false)
  const [toggleAllFn, setToggleAllFn] = useState<(() => void) | null>(null)

  const structuredPromptFromStore = useGenerationStore((state) => state.structuredPrompt)
  const structuredPrompt = structuredPromptProp ?? structuredPromptFromStore

  const { sections } = usePromptPreview(raw_prompt, structuredPrompt)

  const handleCopyPrompt = useCallback(() => {
    if (!raw_prompt) return

    navigator.clipboard.writeText(raw_prompt)
      .then(() => {
        toast('Prompt copié dans le presse-papier', 'success', 2000)
      })
      .catch(() => {
        toast('Erreur lors de la copie', 'error', 2000)
      })
  }, [raw_prompt, toast])

  const isLoadingPrompt = isEstimating && !raw_prompt

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        maxHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.background.panel,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '0.65rem 0.75rem',
          borderBottom: `1px solid ${theme.border.primary}`,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.55rem',
        }}
      >
        {raw_prompt && !isLoadingPrompt && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '0.75rem',
              color: theme.text.secondary,
              fontSize: '0.78rem',
            }}
          >
            {viewMode === 'raw' && (
              <button
                type="button"
                onClick={handleCopyPrompt}
                style={{
                  padding: '0.4rem 0.75rem',
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  backgroundColor: theme.background.secondary,
                  color: theme.text.primary,
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  transition: 'background-color 0.2s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme.background.panel
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = theme.background.secondary
                }}
              >
                📋 Copier
              </button>
            )}
            {viewMode === 'structured' && toggleAllFn && (
              <button
                type="button"
                onClick={toggleAllFn}
                style={{
                  padding: '0.4rem 0.75rem',
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  backgroundColor: theme.background.secondary,
                  color: theme.text.primary,
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  transition: 'background-color 0.2s',
                  marginRight: '0.75rem',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme.background.panel
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = theme.background.secondary
                }}
              >
                {allExpanded ? 'Tout replier' : 'Tout déplier'}
              </button>
            )}
            <span style={{ color: viewMode === 'raw' ? theme.text.primary : theme.text.secondary }}>
              Brut
            </span>
            <label
              style={{
                position: 'relative',
                display: 'inline-block',
                width: '44px',
                height: '24px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={viewMode === 'structured'}
                onChange={(e) => setViewMode(e.target.checked ? 'structured' : 'raw')}
                style={{
                  opacity: 0,
                  width: 0,
                  height: 0,
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: viewMode === 'structured' ? theme.border.focus : theme.input.border,
                  borderRadius: '12px',
                  transition: 'background-color 0.2s',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  top: '2px',
                  left: viewMode === 'structured' ? '22px' : '2px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: 'white',
                  transition: 'left 0.2s',
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                }}
              />
            </label>
            <span style={{ color: viewMode === 'structured' ? theme.text.primary : theme.text.secondary }}>
              Structuré
            </span>
          </div>
        )}
      </div>
      <div
        style={{
          flex: '1 1 0%',
          minHeight: 0,
          height: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '0.75rem',
          boxSizing: 'border-box',
          scrollbarGutter: 'stable',
        }}
      >
        {raw_prompt ? (
          viewMode === 'raw' ? (
            <pre
              style={{
                fontFamily: 'monospace',
                fontSize: '0.78rem',
                lineHeight: '1.55',
                color: theme.text.secondary,
                backgroundColor: theme.background.secondary,
                padding: '0.75rem',
                borderRadius: '4px',
                border: `1px solid ${theme.border.primary}`,
                whiteSpace: 'pre-wrap',
                wordWrap: 'break-word',
                margin: 0,
              }}
            >
              {raw_prompt}
            </pre>
          ) : (
            <StructuredPromptView
              prompt={raw_prompt}
              structuredPrompt={structuredPrompt}
              sections={sections}
              onToggleStateChange={(expanded, toggleFn) => {
                setAllExpanded(expanded)
                setToggleAllFn(() => toggleFn)
              }}
            />
          )
        ) : (
          <div
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: theme.text.secondary,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '0.75rem',
            }}
          >
            {isLoadingPrompt
              ? 'Construction du prompt…'
              : 'Aucun prompt disponible. Configurez votre génération.'}
          </div>
        )}
      </div>
    </div>
  )
})
