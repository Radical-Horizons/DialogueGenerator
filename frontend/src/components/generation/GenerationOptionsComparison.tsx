/**
 * Comparaison des options générées (écran 2b) — N appels LLM parallèles.
 *
 * Rendu quand un run multi-options est actif : bandeau de progression mono
 * (`OPTION k SUR N` + traits), puis liste verticale des options terminées avec
 * « Garder » (l'option devient le résultat courant) et « Variante » (relance
 * cette seule option — Story 1.10 recâblée, pas une fonctionnalité neuve).
 */
import { useMemo } from 'react'
import { theme } from '../../theme'
import {
  redesignAccent,
  redesignControl,
  redesignFont,
  redesignHairline,
  redesignRadius,
  redesignText,
} from '../../theme/redesignTokens'
import {
  launchBackgroundOption,
  useGenerationOptionsStore,
  type GenerationOptionSlot,
} from '../../store/generationOptionsStore'
import { useGenerationStore } from '../../store/generationStore'
import type { GenerateUnityDialogueResponse } from '../../types/api'

interface OptionPreview {
  speaker: string | null
  line: string | null
  choicesCount: number
}

/**
 * Extrait de quoi comparer depuis le JSON Unity. La génération one-shot renvoie
 * `{title, node: {...}}` (singulier) ; un document complet porte `nodes: [...]`.
 */
function extractPreview(result: GenerateUnityDialogueResponse | null): OptionPreview {
  if (!result?.json_content) return { speaker: null, line: null, choicesCount: 0 }
  try {
    const doc = JSON.parse(result.json_content) as {
      node?: { speaker?: string; line?: string; choices?: unknown[] }
      nodes?: Array<{ speaker?: string; line?: string; choices?: unknown[] }>
    }
    const first = doc.node ?? doc.nodes?.[0]
    return {
      speaker: first?.speaker ?? null,
      line: first?.line ?? null,
      choicesCount: Array.isArray(first?.choices) ? first.choices.length : 0,
    }
  } catch {
    return { speaker: null, line: null, choicesCount: 0 }
  }
}

const STATUS_LABELS: Record<GenerationOptionSlot['status'], string> = {
  pending: 'EN ATTENTE',
  running: 'EN ÉCRITURE',
  completed: 'PRÊTE',
  error: 'ERREUR',
  cancelled: 'ANNULÉE',
}

function statusColor(status: GenerationOptionSlot['status'], kept: boolean): string {
  if (kept) return redesignAccent.base
  switch (status) {
    case 'completed':
      return theme.state.accepted.border
    case 'error':
      return theme.state.error.color
    case 'running':
      return redesignAccent.light
    default:
      return redesignText.label
  }
}

export function GenerationOptionsComparison() {
  const slots = useGenerationOptionsStore((s) => s.slots)
  const keptIndex = useGenerationOptionsStore((s) => s.keptIndex)
  const lastRequest = useGenerationOptionsStore((s) => s.lastRequest)
  const setUnityDialogueResponse = useGenerationStore((s) => s.setUnityDialogueResponse)

  const doneCount = useMemo(
    () => slots.filter((s) => s.status === 'completed').length,
    [slots]
  )
  const runningIndex = slots.findIndex((s) => s.status === 'running' || s.status === 'pending')
  const allSettled = slots.length > 0 && runningIndex === -1

  if (slots.length < 2) return null

  const handleKeep = (slot: GenerationOptionSlot) => {
    if (!slot.result) return
    useGenerationOptionsStore.getState().setKeptIndex(slot.index)
    setUnityDialogueResponse(slot.result)
  }

  const handleVariant = (slot: GenerationOptionSlot) => {
    if (!lastRequest) return
    void launchBackgroundOption(slot.index, lastRequest)
  }

  return (
    <section
      data-testid="generation-options-comparison"
      style={{
        marginBottom: 20,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
      }}
    >
      {/* Bandeau de progression : OPTION k SUR N + traits (écran 2a). */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 16,
        }}
      >
        <span
          data-testid="options-progress-label"
          style={{
            fontFamily: redesignFont.mono,
            fontSize: '10px',
            letterSpacing: '0.12em',
            color: allSettled ? redesignText.label : '#8fb0ff',
          }}
        >
          {allSettled
            ? `${doneCount} OPTION${doneCount > 1 ? 'S' : ''} SUR ${slots.length} — À COMPARER`
            : `OPTION ${runningIndex + 1} SUR ${slots.length} — EN ÉCRITURE`}
        </span>
        <span style={{ display: 'flex', gap: 5 }}>
          {slots.map((slot) => (
            <span
              key={slot.index}
              data-testid={`option-trait-${slot.index}`}
              style={{
                width: 16,
                height: 2,
                background:
                  slot.status === 'completed'
                    ? redesignAccent.base
                    : slot.status === 'error' || slot.status === 'cancelled'
                      ? theme.state.error.color
                      : 'rgba(255,255,255,0.14)',
              }}
            />
          ))}
        </span>
      </div>

      {/* Options terminées : liste verticale, filets, serif pour la réplique. */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {slots.map((slot) => {
          const preview = extractPreview(slot.result)
          const kept = keptIndex === slot.index
          return (
            <div
              key={slot.index}
              data-testid={`generation-option-${slot.index}`}
              style={{
                padding: '14px 0',
                borderTop: `1px solid ${redesignHairline.standard}`,
                display: 'flex',
                flexDirection: 'column',
                gap: 9,
                boxShadow: kept ? `inset 2px 0 0 ${redesignAccent.base}` : undefined,
                paddingLeft: kept ? 12 : 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span
                  style={{
                    fontFamily: redesignFont.mono,
                    fontSize: '10px',
                    letterSpacing: '0.1em',
                    color: redesignText.label,
                    flexShrink: 0,
                  }}
                >
                  OPTION {slot.index + 1}
                </span>
                <span
                  style={{
                    fontFamily: redesignFont.mono,
                    fontSize: '9.5px',
                    letterSpacing: '0.08em',
                    color: statusColor(slot.status, kept),
                    flexShrink: 0,
                  }}
                >
                  {kept ? 'GARDÉE' : STATUS_LABELS[slot.status]}
                </span>
                {preview.choicesCount > 0 && (
                  <span
                    style={{
                      fontFamily: redesignFont.mono,
                      fontSize: '9.5px',
                      color: redesignText.label,
                      flexShrink: 0,
                    }}
                  >
                    {preview.choicesCount} RÉPONSES
                  </span>
                )}
                <span style={{ flex: 1 }} />
                {slot.status === 'completed' && (
                  <span style={{ display: 'flex', gap: 9, flexShrink: 0 }}>
                    <button
                      type="button"
                      data-testid={`option-keep-${slot.index}`}
                      onClick={() => handleKeep(slot)}
                      style={{
                        padding: '4px 12px',
                        borderRadius: redesignRadius.control,
                        border: kept
                          ? `1px solid ${redesignAccent.base}`
                          : `1px solid ${redesignControl.border}`,
                        background: kept ? redesignAccent.selectedBg : 'transparent',
                        color: kept ? redesignAccent.light : redesignText.body,
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Garder
                    </button>
                    <button
                      type="button"
                      data-testid={`option-variant-${slot.index}`}
                      onClick={() => handleVariant(slot)}
                      disabled={!lastRequest}
                      title="Régénérer uniquement cette option avec la même requête"
                      style={{
                        padding: '4px 12px',
                        borderRadius: redesignRadius.control,
                        border: `1px solid ${redesignControl.border}`,
                        background: 'transparent',
                        color: redesignText.secondary,
                        cursor: lastRequest ? 'pointer' : 'not-allowed',
                        fontSize: '12px',
                      }}
                    >
                      Variante
                    </button>
                  </span>
                )}
                {slot.status === 'error' && (
                  <button
                    type="button"
                    data-testid={`option-retry-${slot.index}`}
                    onClick={() => handleVariant(slot)}
                    disabled={!lastRequest}
                    style={{
                      padding: '4px 12px',
                      borderRadius: redesignRadius.control,
                      border: `1px solid ${redesignControl.border}`,
                      background: 'transparent',
                      color: redesignText.secondary,
                      cursor: lastRequest ? 'pointer' : 'not-allowed',
                      fontSize: '12px',
                      flexShrink: 0,
                    }}
                  >
                    Réessayer
                  </button>
                )}
              </div>

              {slot.status === 'completed' && preview.line && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {preview.speaker && (
                    <span
                      style={{
                        fontFamily: redesignFont.mono,
                        fontSize: '10px',
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: redesignText.label,
                      }}
                    >
                      {preview.speaker}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: redesignFont.serif,
                      fontSize: '14.5px',
                      lineHeight: 1.6,
                      color: redesignText.body,
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    « {preview.line} »
                  </span>
                </div>
              )}
              {slot.status === 'error' && slot.error && (
                <span style={{ fontSize: '12.5px', color: theme.state.error.color }}>
                  {slot.error}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
