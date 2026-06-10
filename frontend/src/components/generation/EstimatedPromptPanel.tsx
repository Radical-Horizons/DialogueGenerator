/**
 * Panneau d'affichage du prompt brut (RawPrompt).
 * Source de vérité unique pour ce qui est envoyé au LLM.
 */
import { memo, useState, useCallback } from 'react'
import { usePromptPreview } from '../../hooks/usePromptPreview'
import { StructuredPromptView } from './StructuredPromptView'
import { TokenBudgetBar } from './TokenBudgetBar'
import { theme } from '../../theme'
import { useToast } from '../shared'
import { useGenerationStore } from '../../store/generationStore'
import type { RawPrompt } from '../../types/api'
import type { PromptStructure } from '../../types/prompt'

export interface EstimatedPromptPanelProps {
  /** Le prompt brut à afficher (RawPrompt) */
  raw_prompt: RawPrompt | null | undefined
  /** Indique si l'estimation est en cours */
  isEstimating?: boolean
  /** Nombre de tokens */
  tokenCount?: number | null
  /** Hash du prompt pour validation */
  promptHash?: string | null
  /** Structure JSON du prompt (optionnel) */
  structuredPrompt?: PromptStructure | null
}

export const EstimatedPromptPanel = memo(function EstimatedPromptPanel({
  raw_prompt,
  isEstimating = false,
  tokenCount,
  structuredPrompt: structuredPromptProp,
}: EstimatedPromptPanelProps) {
  const [viewMode, setViewMode] = useState<'raw' | 'structured'>('structured')
  const toast = useToast()
  
  // État pour le bouton "Tout déplier" (uniquement en mode structuré)
  const [allExpanded, setAllExpanded] = useState(false)
  const [toggleAllFn, setToggleAllFn] = useState<(() => void) | null>(null)
  
  // Récupérer structuredPrompt depuis le store si non fourni en prop
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
  
  // Calculer le total structuré uniquement comme fallback d'affichage.
  const calculatedTotal = sections.reduce((sum, section) => {
    return sum + (section.tokenCount || 0)
  }, 0)
  
  // Le total backend est la source canonique. Les sections peuvent être tronquées ou estimées côté UI.
  const displayTotal = tokenCount ?? (sections.length > 0 ? calculatedTotal : null)

  return (
    <>
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
      <div style={{ 
        padding: '0.65rem 0.75rem', 
        borderBottom: `1px solid ${theme.border.primary}`,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.55rem',
      }}>
        <div
          style={{
            fontSize: '0.78rem',
            color: theme.text.secondary,
            lineHeight: 1.45,
            marginBottom: 2,
          }}
        >
          <span style={{ fontWeight: 600, color: theme.text.primary }}>Total prompt</span> — compte
          le XML complet envoyé au LLM (prompt système, règles, instructions, contexte GDD, etc.). Ce
          total diffère du décompte « contexte GDD seul » du panneau de gauche, qui applique uniquement
          la           limite de tokens du contexte narratif.
        </div>
        {/* Barre de budget de tokens */}
        <TokenBudgetBar
          structuredPrompt={structuredPrompt}
          tokenCount={displayTotal}
          isEstimating={isEstimating}
          maxTokens={null}
        />
        {raw_prompt && !isEstimating && (
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
            }}
          >
            {isEstimating
              ? 'Construction du prompt...'
              : 'Aucun prompt disponible. Configurez votre génération.'}
          </div>
        )}
      </div>
    </div>
    </>
  )
})


