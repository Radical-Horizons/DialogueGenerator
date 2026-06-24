/**
 * Composant pour les contrôles de génération (sliders tokens, max choix, tags narratifs).
 */
import { useRef, type CSSProperties, type RefObject } from 'react'
import { CONTEXT_TOKENS_LIMITS, COMPLETION_TOKENS_LIMITS } from '../../constants'
import { theme } from '../../theme'
import { generationPanelChrome } from '../../theme/responsiveChrome'
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext'

const TOKEN_SLIDER_INPUT_STYLE: CSSProperties = {
  height: '6px',
  borderRadius: '3px',
  outline: 'none',
  WebkitAppearance: 'none',
  appearance: 'none',
  padding: 0,
  margin: 0,
}

interface TokenSliderRowProps {
  isNarrow: boolean
  controlGapRem: number
  sliderRef: RefObject<HTMLInputElement | null>
  min: number
  max: number
  step: number
  value: number
  valueLabel: string
  valueTitle?: string
  onChange: (value: number) => void
}

/** Ligne slider + valeur : côte à côte (confortable) ou valeur sous le curseur (narrow). */
function TokenSliderRow({
  isNarrow,
  controlGapRem,
  sliderRef,
  min,
  max,
  step,
  value,
  valueLabel,
  valueTitle,
  onChange,
}: TokenSliderRowProps) {
  return (
    <div
      data-testid={isNarrow ? 'generation-token-slider-control-narrow' : 'generation-token-slider-control-row'}
      style={
        isNarrow
          ? {
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              gap: '0.28rem',
              minWidth: 0,
              width: '100%',
            }
          : {
              display: 'flex',
              alignItems: 'center',
              gap: `${controlGapRem}rem`,
              minWidth: 0,
            }
      }
    >
      <input
        ref={sliderRef}
        type="range"
        className="token-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        style={{
          ...TOKEN_SLIDER_INPUT_STYLE,
          ...(isNarrow ? { width: '100%', boxSizing: 'border-box' } : { flex: 1, minWidth: 0 }),
        }}
      />
      <span
        title={valueTitle}
        style={{
          flexShrink: 0,
          textAlign: 'right',
          color: theme.text.primary,
          fontWeight: 'bold',
          ...(isNarrow
            ? { alignSelf: 'flex-end' }
            : { minWidth: valueTitle ? '70px' : '60px' }),
        }}
      >
        {valueLabel}
      </span>
    </div>
  )
}

export interface GenerationPanelControlsProps {
  /** Max tokens pour contexte */
  maxContextTokens: number
  /** Max tokens pour completion (null = auto) */
  maxCompletionTokens: number | null
  /** Nombre max de choix (null = libre) */
  maxChoices: number | null
  /** Tags narratifs sélectionnés */
  narrativeTags: string[]
  /** Tags narratifs disponibles */
  availableNarrativeTags: string[]
  /** Erreurs de validation */
  validationErrors: Record<string, string>
  /** Correctifs proposés pour aligner l'UI sur l'API */
  configFixes?: import('../../utils/generationConfigNormalization').GenerationConfigFix[]
  /** Applique les correctifs (sliders / modèle) */
  onApplyConfigFixes?: () => void
  /** Token count estimé */
  tokenCount: number | null
  /** Callback pour maxContextTokens */
  onMaxContextTokensChange: (value: number) => void
  /** Callback pour maxCompletionTokens */
  onMaxCompletionTokensChange: (value: number | null) => void
  /** Callback pour maxChoices */
  onMaxChoicesChange: (value: number | null) => void
  /** Callback pour narrativeTags */
  onNarrativeTagsChange: (tags: string[]) => void
  /** Callback pour marquer comme dirty */
  onDirty: () => void
}

/**
 * Contrôles de génération (sliders tokens, max choix, tags narratifs).
 */
export function GenerationPanelControls({
  maxContextTokens,
  maxCompletionTokens,
  maxChoices,
  narrativeTags,
  availableNarrativeTags,
  validationErrors,
  configFixes = [],
  onApplyConfigFixes = () => {},
  tokenCount,
  onMaxContextTokensChange,
  onMaxCompletionTokensChange,
  onMaxChoicesChange,
  onNarrativeTagsChange,
  onDirty,
}: GenerationPanelControlsProps) {
  const maxContextSliderRef = useRef<HTMLInputElement>(null)
  const maxCompletionSliderRef = useRef<HTMLInputElement>(null)
  const isNarrow = useGenerationPanelNarrow()
  const genChrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable

  return (
    <>
      {configFixes.length > 0 && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            borderRadius: '4px',
            border: `1px solid ${theme.state.warning.color}`,
            backgroundColor: theme.state.warning.background,
            color: theme.text.primary,
            fontSize: '0.9rem',
          }}
        >
          <div style={{ marginBottom: '0.5rem' }}>
            {configFixes.map((fix) => (
              <div key={fix.field}>{fix.message}</div>
            ))}
          </div>
          <button
            type="button"
            onClick={onApplyConfigFixes}
            style={{
              padding: '0.35rem 0.75rem',
              borderRadius: '4px',
              border: `1px solid ${theme.border.focus}`,
              backgroundColor: theme.button.primary.background,
              color: theme.button.primary.color,
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            Corriger automatiquement
          </button>
        </div>
      )}

      {/* Sliders tokens : 2 colonnes (confortable) ou empilés (narrow, proposition 1) */}
      <div style={{ marginBottom: '1rem', minWidth: 0, overflowX: 'hidden' }}>
        <div
          data-testid="generation-token-sliders-row"
          style={{
            display: 'flex',
            flexDirection: isNarrow ? 'column' : 'row',
            gap: isNarrow ? `${genChrome.controlGapRem}rem` : '1rem',
            alignItems: 'stretch',
            minWidth: 0,
          }}
        >
          {/* Slider Max tokens contexte */}
          <div
            style={{
              flex: isNarrow ? undefined : 1,
              minWidth: 0,
              width: isNarrow ? '100%' : undefined,
            }}
          >
            <label
              style={{
                color: theme.text.primary,
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: `${genChrome.labelFontRem}rem`,
                fontWeight: 500,
              }}
            >
              Max tokens contexte
            </label>
            {validationErrors.maxContextTokens && (
              <div style={{ fontSize: '0.85rem', color: theme.state.error.color, marginBottom: '0.25rem' }}>
                {validationErrors.maxContextTokens}
              </div>
            )}
            <TokenSliderRow
              isNarrow={isNarrow}
              controlGapRem={genChrome.controlGapRem}
              sliderRef={maxContextSliderRef}
              min={CONTEXT_TOKENS_LIMITS.MIN}
              max={CONTEXT_TOKENS_LIMITS.MAX}
              step={CONTEXT_TOKENS_LIMITS.STEP}
              value={maxContextTokens}
              valueLabel={
                maxContextTokens >= 1000
                  ? `${Math.round(maxContextTokens / 1000)}K`
                  : String(maxContextTokens)
              }
              onChange={(v) => {
                onMaxContextTokensChange(v)
                onDirty()
              }}
            />
          </div>

          {/* Slider Max tokens génération */}
          <div
            style={{
              flex: isNarrow ? undefined : 1,
              minWidth: 0,
              width: isNarrow ? '100%' : undefined,
            }}
          >
            <label
              style={{
                color: theme.text.primary,
                display: 'block',
                marginBottom: '0.5rem',
                fontSize: `${genChrome.labelFontRem}rem`,
                fontWeight: 500,
              }}
            >
              Max tokens génération
            </label>
            {validationErrors.maxCompletionTokens && (
              <div style={{ fontSize: '0.85rem', color: theme.state.error.color, marginBottom: '0.25rem' }}>
                {validationErrors.maxCompletionTokens}
              </div>
            )}
            <TokenSliderRow
              isNarrow={isNarrow}
              controlGapRem={genChrome.controlGapRem}
              sliderRef={maxCompletionSliderRef}
              min={COMPLETION_TOKENS_LIMITS.MIN}
              max={COMPLETION_TOKENS_LIMITS.MAX}
              step={COMPLETION_TOKENS_LIMITS.STEP}
              value={maxCompletionTokens ?? COMPLETION_TOKENS_LIMITS.DEFAULT}
              valueLabel={
                maxCompletionTokens
                  ? maxCompletionTokens >= 1000
                    ? `${Math.round(maxCompletionTokens / 1000)}K`
                    : String(maxCompletionTokens)
                  : isNarrow
                    ? 'Auto'
                    : `Auto (${Math.round(COMPLETION_TOKENS_LIMITS.DEFAULT / 1000)}K)`
              }
              valueTitle={
                maxCompletionTokens
                  ? undefined
                  : `Auto (${Math.round(COMPLETION_TOKENS_LIMITS.DEFAULT / 1000)}K)`
              }
              onChange={(v) => {
                onMaxCompletionTokensChange(
                  v === COMPLETION_TOKENS_LIMITS.DEFAULT ? null : v,
                )
                onDirty()
              }}
            />
          </div>
        </div>
        <style>{`
          .token-slider {
            --range-track-bg: ${theme.border.secondary};
          }

          .token-slider::-webkit-slider-runnable-track {
            height: 6px;
            border-radius: 3px;
            background: var(--range-track-bg);
          }
          .token-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: ${theme.border.focus};
            cursor: pointer;
            border: 2px solid ${theme.background.panel};
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
            margin-top: -6px;
          }
          .token-slider::-webkit-slider-thumb:hover {
            background: ${theme.button.primary.background};
            transform: scale(1.1);
          }
          .token-slider::-moz-range-track {
            height: 6px;
            border-radius: 3px;
            background: var(--range-track-bg);
          }
          .token-slider::-moz-range-thumb {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: ${theme.border.focus};
            cursor: pointer;
            border: 2px solid ${theme.background.panel};
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          }
          .token-slider::-moz-range-thumb:hover {
            background: ${theme.button.primary.background};
            transform: scale(1.1);
          }
          .token-slider::-ms-track {
            height: 6px;
            border-radius: 3px;
            background: var(--range-track-bg);
            border: none;
            color: transparent;
          }
          .token-slider::-ms-thumb {
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: ${theme.border.focus};
            cursor: pointer;
            border: 2px solid ${theme.background.panel};
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
          }
          .token-slider::-ms-thumb:hover {
            background: ${theme.button.primary.background};
            transform: scale(1.1);
          }
        `}</style>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <label style={{ color: theme.text.primary, margin: 0 }}>
            Nombre max de choix
          </label>

          <div style={{ position: 'relative', display: 'inline-block' }}>
            <button
              type="button"
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '12px',
                border: `1px solid ${theme.border.primary}`,
                backgroundColor: theme.background.secondary,
                color: theme.text.secondary,
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
              }}
              title="Vide = Mode Libre (l'IA décide entre 2 et 8 choix). Valeur 0-8 = Mode Limité (l'IA génère entre 1 et cette valeur). 0 = aucun choix (dialogue linéaire)."
            >
              ?
            </button>
          </div>
        </div>
        <input
          type="number"
          value={maxChoices ?? ''}
          onChange={(e) => {
            const value = e.target.value
            if (value === '') {
              onMaxChoicesChange(null) // Mode Libre
            } else {
              const num = parseInt(value)
              if (!isNaN(num) && num >= 0 && num <= 8) {
                onMaxChoicesChange(num) // Mode Limité
              }
            }
            onDirty()
          }}
          min={0}
          max={8}
          placeholder="Vide = Libre (2-8 choix)"
          style={{ 
            width: '100%', 
            padding: '0.5rem', 
            boxSizing: 'border-box',
            backgroundColor: theme.input.background,
            border: `1px solid ${theme.input.border}`,
            color: theme.input.color,
          }}
        />
      </div>

      {/* Tags narratifs */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem', 
          color: theme.text.primary,
          fontWeight: 'bold'
        }}>
          Tags narratifs
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {availableNarrativeTags.map((tag) => (
            <label
              key={tag}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '0.5rem 1rem',
                border: `1px solid ${narrativeTags.includes(tag) ? theme.border.focus : theme.border.primary}`,
                borderRadius: '4px',
                backgroundColor: narrativeTags.includes(tag) 
                  ? theme.button.primary.background 
                  : theme.button.default.background,
                color: narrativeTags.includes(tag) 
                  ? theme.button.primary.color 
                  : theme.button.default.color,
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              <input
                type="checkbox"
                checked={narrativeTags.includes(tag)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onNarrativeTagsChange([...narrativeTags, tag])
                  } else {
                    onNarrativeTagsChange(narrativeTags.filter(t => t !== tag))
                  }
                  onDirty()
                }}
                style={{ marginRight: '0.5rem', cursor: 'pointer' }}
              />
              #{tag}
            </label>
          ))}
        </div>
      </div>

      {tokenCount !== null && validationErrors.tokenCount && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ 
            padding: '0.5rem',
            backgroundColor: theme.state.error.background,
            border: `1px solid ${theme.state.error.border}`,
            borderRadius: '4px',
            color: theme.state.error.color,
            fontSize: '0.9rem',
          }}>
            {validationErrors.tokenCount}
          </div>
        </div>
      )}
    </>
  )
}
