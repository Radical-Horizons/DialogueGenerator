/**
 * Modal de détail d'une fiche pré-built Alteir (lecture seule).
 */
import React, { useEffect } from 'react'
import { theme } from '../../theme'
import { generationPanelChrome, modalTypography } from '../../theme/responsiveChrome'
import { redesignRadius } from '../../theme/redesignTokens'
import { TOUCH_TARGET_MIN_PX } from '../../constants'
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext'
import type { PrebuiltTemplate } from '../../types/template'

export interface PrebuiltTemplateModalProps {
  isOpen: boolean
  template: PrebuiltTemplate | null
  onClose: () => void
  onLoad: (template: PrebuiltTemplate) => void
}

export function PrebuiltTemplateModal({
  isOpen,
  template,
  onClose,
  onLoad,
}: PrebuiltTemplateModalProps) {
  const isNarrow = useGenerationPanelNarrow()
  const chrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable
  const type = isNarrow ? modalTypography.narrow : modalTypography.comfortable

  useEffect(() => {
    if (!isOpen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !template) {
    return null
  }

  const buttonStyle: React.CSSProperties = {
    minHeight: TOUCH_TARGET_MIN_PX,
    padding: chrome.buttonPadding,
    backgroundColor: theme.button.default.background,
    border: `1px solid ${theme.border.secondary}`,
    borderRadius: `${redesignRadius.control}px`,
    color: theme.button.default.color,
    cursor: 'pointer',
    fontSize: `${chrome.buttonFontRem}rem`,
  }

  return (
    <div
      data-testid="prebuilt-template-modal"
      role="dialog"
      aria-modal="true"
      aria-label={template.name}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: isNarrow ? '0.6rem' : '1rem',
      }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          backgroundColor: theme.background.panel,
          padding: chrome.cardPadding,
          borderRadius: `${redesignRadius.node}px`,
          width: isNarrow ? '100%' : 'min(32rem, 92vw)',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: `1px solid ${theme.border.primary}`,
        }}
      >
        <h3
          style={{
            marginTop: 0,
            color: theme.text.primary,
            fontSize: `${type.titleFontRem}rem`,
          }}
        >
          {template.icon} {template.name}
        </h3>
        <div
          data-testid="prebuilt-modal-gdd-system"
          style={{
            color: theme.text.secondary,
            fontSize: `${chrome.labelFontRem}rem`,
          }}
        >
          {template.gddSystem}
        </div>
        <div
          data-testid="prebuilt-modal-scene-type"
          style={{
            color: theme.text.secondary,
            fontSize: `${chrome.labelFontRem}rem`,
            marginBottom: `${chrome.controlGapRem}rem`,
          }}
        >
          {template.sceneTypeHint}
        </div>
        <p style={{ color: theme.text.primary, fontSize: `${type.bodyFontRem}rem` }}>
          {template.objectif}
        </p>
        <p style={{ color: theme.text.secondary, fontSize: `${type.bodyFontRem}rem` }}>
          {template.casUsage}
        </p>
        {template.examples.length > 0 && (
          <ul data-testid="prebuilt-modal-examples" style={{ color: theme.text.secondary }}>
            {template.examples.map((example) => (
              <li key={example}>{example}</li>
            ))}
          </ul>
        )}
        <pre
          data-testid="prebuilt-modal-instructions"
          style={{
            whiteSpace: 'pre-wrap',
            fontFamily: 'inherit',
            fontSize: `${chrome.labelFontRem}rem`,
            color: theme.text.primary,
            backgroundColor: theme.background.secondary,
            padding: chrome.cardPadding,
            borderRadius: `${redesignRadius.control}px`,
            maxHeight: '10rem',
            overflowY: 'auto',
          }}
        >
          {template.configuration.instructions}
        </pre>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            justifyContent: 'flex-end',
            marginTop: `${chrome.controlGapRem}rem`,
          }}
        >
          <button type="button" data-testid="prebuilt-modal-cancel" onClick={onClose} style={buttonStyle}>
            Annuler
          </button>
          <button
            type="button"
            data-testid="prebuilt-modal-load"
            onClick={() => onLoad(template)}
            style={{
              ...buttonStyle,
              backgroundColor: theme.button.primary.background,
              border: 'none',
              color: theme.button.primary.color,
            }}
          >
            Charger
          </button>
        </div>
      </div>
    </div>
  )
}
