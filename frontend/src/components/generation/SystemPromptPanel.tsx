/**
 * Prompt système principal — section du tiroir de réglages.
 *
 * Extrait de `SystemPromptEditor`. Conserve son avertissement « zone avancée » :
 * il définit l'identité technique du LLM, pas le contenu de la scène.
 */
import React, { useCallback } from 'react'
import { FormField } from '../shared/FormField'
import { useSystemPrompt } from '../../hooks/useSystemPrompt'
import { useToast } from '../shared'
import { theme } from '../../theme'
import { generationPanelChrome } from '../../theme/responsiveChrome'
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext'

export interface SystemPromptPanelProps {
  systemPromptOverride: string | null
  onSystemPromptChange: (prompt: string | null) => void
}

export function SystemPromptPanel({
  systemPromptOverride,
  onSystemPromptChange,
}: SystemPromptPanelProps) {
  const {
    systemPrompt,
    isLoading: isLoadingSystemPrompt,
    savePrompt,
    restore: restoreSystemPrompt,
    updatePrompt,
  } = useSystemPrompt()
  const toast = useToast()
  const isNarrow = useGenerationPanelNarrow()
  const genChrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable

  const handleSystemPromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      updatePrompt(value)
      onSystemPromptChange(value || null)
    },
    [updatePrompt, onSystemPromptChange]
  )

  const handleSaveSystemPrompt = useCallback(() => {
    const currentPrompt = systemPromptOverride || systemPrompt || ''
    try {
      savePrompt(currentPrompt)
      onSystemPromptChange(currentPrompt || null)
      toast('Prompt système sauvegardé avec succès', 'success')
    } catch (err) {
      console.error('Erreur lors de la sauvegarde:', err)
      toast('Erreur lors de la sauvegarde du prompt système', 'error')
    }
  }, [systemPromptOverride, systemPrompt, savePrompt, onSystemPromptChange, toast])

  const handleRestoreSystemPrompt = useCallback(async () => {
    const restoredPrompt = await restoreSystemPrompt()
    onSystemPromptChange(restoredPrompt || null)
  }, [restoreSystemPrompt, onSystemPromptChange])

  return (
    <div style={{ padding: genChrome.tabInnerPadding, minWidth: 0 }}>
      <div
        style={{
          marginBottom: '1rem',
          padding: '0.75rem',
          backgroundColor: theme.background.secondary,
          border: `1px solid ${theme.border.primary}`,
          borderRadius: '4px',
          fontSize: '0.85rem',
          color: theme.text.secondary,
        }}
      >
        <strong style={{ color: theme.text.primary }}>⚠️ Zone avancée</strong>
        <br />
        Modifiez uniquement si vous savez ce que vous faites. Ce prompt définit l'identité technique du LLM et les règles de format de sortie.
      </div>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: `${genChrome.controlGapRem}rem`,
          marginBottom: '0.5rem',
        }}
      >
        <label
          htmlFor="system-prompt-textarea"
          style={{
            color: theme.text.primary,
            fontSize: `${genChrome.labelFontRem}rem`,
            fontWeight: 500,
            flex: isNarrow ? '1 1 100%' : undefined,
          }}
        >
          Prompt Système Principal:
        </label>
        <div style={{ display: 'flex', gap: `${genChrome.controlGapRem}rem`, flexWrap: 'wrap' }}>
          <button
            onClick={handleSaveSystemPrompt}
            disabled={isLoadingSystemPrompt}
            style={{
              padding: genChrome.buttonPadding,
              border: `1px solid ${theme.border.secondary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: isLoadingSystemPrompt ? 'not-allowed' : 'pointer',
              opacity: isLoadingSystemPrompt ? 0.6 : 1,
              fontSize: `${genChrome.buttonFontRem}rem`,
              fontWeight: 600,
            }}
            title="Sauvegarde le prompt système actuel"
          >
            Sauvegarder
          </button>
          <button
            onClick={handleRestoreSystemPrompt}
            disabled={isLoadingSystemPrompt}
            style={{
              padding: genChrome.buttonPadding,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: isLoadingSystemPrompt ? 'not-allowed' : 'pointer',
              opacity: isLoadingSystemPrompt ? 0.6 : 1,
              fontSize: `${genChrome.buttonFontRem}rem`,
              fontWeight: 400,
            }}
            title="Restaure la dernière version sauvegardée (ou le défaut si rien n'est sauvegardé)"
          >
            Restaurer
          </button>
        </div>
      </div>
      <FormField label="" htmlFor="system-prompt-textarea">
        <textarea
          id="system-prompt-textarea"
          value={systemPromptOverride || systemPrompt || ''}
          onChange={handleSystemPromptChange}
          rows={12}
          placeholder="Modifiez le prompt système principal envoyé au LLM. Ce prompt guide le comportement général de l'IA et le format de sortie."
          style={{
            width: '100%',
            padding: '0.65rem 0.75rem',
            boxSizing: 'border-box',
            backgroundColor: theme.input.background,
            border: `1px solid ${theme.input.border}`,
            color: theme.input.color,
            borderRadius: '6px',
            fontFamily: 'monospace',
            fontSize: isNarrow ? '0.78rem' : '0.85rem',
            resize: 'vertical',
            lineHeight: 1.55,
          }}
        />
      </FormField>
    </div>
  )
}
