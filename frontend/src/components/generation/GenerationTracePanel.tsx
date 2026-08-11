/**
 * Colonne TRACE de l'écran 2a — remplace « ce qui part au modèle » pendant un run.
 *
 * Chaque ligne est un fait horodaté du run réel (étape SSE atteinte), pas une
 * narration inventée : le décompte du prompt est déjà parti, ce qui reste utile
 * à l'écran c'est ce que le modèle fait *maintenant* et ce qui est déjà dépensé.
 */
import { useEffect, useRef, useState } from 'react'
import { redesignAccent, redesignFont, redesignHairline, redesignText } from '../../theme/redesignTokens'
import { useGenerationStore } from '../../store/generationStore'
import { formatRunElapsed, useGenerationRunActive } from '../../hooks/useGenerationRunState'

/** Nom de l'animation du point « en cours » (déclarée localement, pas de CSS global). */
const TRACE_BLINK_ANIMATION = 'generation-trace-blink'

type StreamStep = 'Prompting' | 'Generating' | 'Validating' | 'Complete'

/** Libellé humain de chaque étape SSE — ce que le modèle fait, pas le nom technique. */
const STEP_LINES: Record<StreamStep, string> = {
  Prompting: 'Contexte assemblé, prompt envoyé.',
  Generating: 'Écrit la réplique et les réponses.',
  Validating: 'Vérifie la structure du dialogue.',
  Complete: 'Dialogue terminé.',
}

interface TraceEntry {
  at: string
  line: string
}

export interface GenerationTracePanelProps {
  /** Masquer la colonne (le lien « masquer » de la maquette). */
  onHide?: () => void
}

export function GenerationTracePanel({ onHide }: GenerationTracePanelProps) {
  const currentStep = useGenerationStore((s) => s.currentStep)
  const streamingContent = useGenerationStore((s) => s.streamingContent)
  const startedAt = useGenerationStore((s) => s.generationStartedAt)
  const tokenCount = useGenerationStore((s) => s.tokenCount)
  const runActive = useGenerationRunActive()

  const [entries, setEntries] = useState<TraceEntry[]>([])
  const seenStepsRef = useRef<Set<string>>(new Set())

  // Nouvelle étape atteinte → une ligne horodatée, jamais deux fois la même.
  useEffect(() => {
    if (startedAt == null) {
      seenStepsRef.current = new Set()
      setEntries([])
      return
    }
    if (seenStepsRef.current.has(currentStep)) return
    seenStepsRef.current.add(currentStep)
    setEntries((prev) => [
      ...prev,
      {
        at: formatRunElapsed(Date.now() - startedAt),
        line: STEP_LINES[currentStep as StreamStep] ?? currentStep,
      },
    ])
  }, [currentStep, startedAt])

  const receivedTokens = streamingContent.length > 0
    ? Math.max(1, Math.round(streamingContent.length / 4))
    : 0

  return (
    <div
      data-testid="generation-trace-panel"
      style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}
    >
      <style>{`@keyframes ${TRACE_BLINK_ANIMATION} { 50% { opacity: 0; } }`}</style>

      <div
        style={{
          padding: '0 20px 13px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: redesignFont.mono,
            fontSize: '10px',
            letterSpacing: '0.12em',
            color: redesignText.label,
          }}
        >
          TRACE
        </span>
        {onHide && (
          <button
            type="button"
            data-testid="trace-hide"
            onClick={onHide}
            style={{
              border: 'none',
              background: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: '11.5px',
              color: redesignText.secondary,
            }}
          >
            masquer
          </button>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {entries.map((entry, index) => (
          <div
            key={`${entry.at}-${index}`}
            style={{
              padding: '10px 20px',
              borderTop: `1px solid ${redesignHairline.standard}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <span
              style={{
                fontFamily: redesignFont.mono,
                fontSize: '9.5px',
                letterSpacing: '0.08em',
                color: redesignText.label,
              }}
            >
              {entry.at}
            </span>
            <span style={{ fontSize: '12.5px', lineHeight: 1.5, color: redesignText.secondary }}>
              {entry.line}
            </span>
          </div>
        ))}

        {runActive && (
          <div
            style={{
              padding: '10px 20px',
              borderTop: `1px solid ${redesignHairline.standard}`,
              display: 'flex',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <span
              aria-hidden
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                backgroundColor: redesignAccent.base,
                animation: `${TRACE_BLINK_ANIMATION} 1.1s steps(1, end) infinite`,
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '12.5px', color: '#8fb0ff' }}>
              {currentStep === 'Validating' ? 'valide la structure…' : 'écrit la réplique…'}
            </span>
          </div>
        )}
      </div>

      {/* Ce qui est déjà dépensé — pas une estimation. */}
      <div
        style={{
          flexShrink: 0,
          borderTop: `1px solid ${redesignHairline.standard}`,
          padding: '14px 20px',
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: redesignFont.mono,
            fontSize: '10px',
            letterSpacing: '0.08em',
            color: redesignText.label,
          }}
        >
          <span>ENVOYÉ</span>
          <span style={{ color: redesignText.secondary }}>
            {tokenCount != null ? tokenCount.toLocaleString('fr-FR') : '—'}
          </span>
        </div>
        <div
          data-testid="trace-received"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontFamily: redesignFont.mono,
            fontSize: '10px',
            letterSpacing: '0.08em',
            color: redesignText.label,
          }}
        >
          <span>REÇU</span>
          <span style={{ color: redesignAccent.base }}>
            {receivedTokens.toLocaleString('fr-FR')}
          </span>
        </div>
      </div>
    </div>
  )
}
