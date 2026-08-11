/**
 * Comparaison des options générées (écran 2b) — N appels LLM parallèles.
 *
 * Principe de l'écran : **une seule option ouverte**. Celle qu'on examine est
 * dépliée derrière un filet accent ; les autres tiennent en une ligne de réplique
 * + méta. Comparer, c'est lire N premières phrases, pas N cartes.
 *
 * « Garder » pousse l'option dans le résultat courant, « Variante » relance cette
 * seule option (Story 1.10 recâblée), « Régénérer les N » relance tout le lot.
 */
import { useMemo, useState } from 'react'
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
import { useContextStore } from '../../store/contextStore'
import {
  computeOptionDiagnostics,
  formatOptionMeta,
  type OptionDiagnostics,
} from '../../utils/generationOptionDiagnostics'

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

const ghostButtonStyle = {
  height: 30,
  padding: '0 12px',
  borderRadius: redesignRadius.control,
  border: `1px solid ${redesignControl.border}`,
  background: 'transparent',
  color: redesignText.body,
  cursor: 'pointer',
  fontSize: '12.5px',
  whiteSpace: 'nowrap' as const,
  flexShrink: 0,
}

const monoLabelStyle = {
  fontFamily: redesignFont.mono,
  fontSize: '10px',
  letterSpacing: '0.12em',
  color: redesignText.label,
}

/** Noms de toutes les fiches GDD envoyées au modèle, toutes catégories confondues. */
function useSentEntityNames(): string[] {
  const selections = useContextStore((s) => s.selections)
  return useMemo(() => {
    const sel = selections as unknown as Record<string, unknown> | undefined
    if (!sel) return []
    const names: string[] = []
    for (const value of Object.values(sel)) {
      if (Array.isArray(value)) {
        names.push(...value.filter((v): v is string => typeof v === 'string'))
      }
    }
    return Array.from(new Set(names))
  }, [selections])
}

/** Détail d'une option ouverte : réplique serif, didascalie, réponses numérotées. */
function OpenOptionBody({ diag }: { diag: OptionDiagnostics }) {
  return (
    <div style={{ maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 11 }}>
      {diag.speaker && (
        <span
          style={{
            fontFamily: redesignFont.mono,
            fontSize: '10px',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: redesignText.label,
          }}
        >
          {diag.speaker}
        </span>
      )}
      {diag.line && (
        <span
          style={{
            fontFamily: redesignFont.serif,
            fontSize: '16.5px',
            lineHeight: 1.65,
            color: '#f0efe9',
          }}
        >
          {diag.line}
        </span>
      )}
      {diag.stageDirection && (
        <span style={{ fontSize: '13.5px', lineHeight: 1.6, color: redesignText.secondary }}>
          {diag.stageDirection}
        </span>
      )}
      {diag.choices.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {diag.choices.map((choice) => (
            <div
              key={choice.index}
              style={{
                padding: '9px 0',
                borderTop: '1px solid rgba(255,255,255,0.07)',
                display: 'flex',
                gap: 12,
                alignItems: 'baseline',
              }}
            >
              <span
                style={{
                  fontFamily: redesignFont.mono,
                  fontSize: '11px',
                  color: redesignText.label,
                  flexShrink: 0,
                }}
              >
                {String(choice.index + 1).padStart(2, '0')}
              </span>
              <span style={{ fontSize: '14px', lineHeight: 1.5, color: redesignText.body, flex: 1 }}>
                {choice.text}
              </span>
              {choice.tag && (
                <span
                  style={{
                    fontFamily: redesignFont.mono,
                    fontSize: '10px',
                    letterSpacing: '0.06em',
                    color: choice.emphasised ? '#8fb0ff' : redesignText.label,
                    flexShrink: 0,
                  }}
                >
                  {choice.tag}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Colonne droite : ce qui aide à trancher, uniquement du calculable. */
function OptionDiagnosticColumn({
  diag,
  optionNumber,
}: {
  diag: OptionDiagnostics
  optionNumber: number
}) {
  const rows: Array<{ label: string; value: string; note?: string }> = [
    {
      label: 'Longueur',
      value: `${diag.wordCount} mots`,
      note: diag.withinLengthTarget
        ? 'dans la cible (40–90) pour un premier nœud'
        : 'hors de la cible (40–90) pour un premier nœud',
    },
    {
      label: 'Réponses',
      value: String(diag.choices.length),
      note:
        diag.choices.length === 0
          ? 'aucune branche — le dialogue se termine ici'
          : `${diag.choices.filter((c) => c.tag).length} portent un test, un flag ou un coût`,
    },
    {
      label: 'Flags posés',
      value: String(diag.flags.length),
      note: diag.flags.length > 0 ? diag.flags.join(' · ') : 'le nœud ne change aucun état',
    },
  ]

  return (
    <aside
      data-testid="option-diagnostic-column"
      style={{
        width: 290,
        flexShrink: 0,
        borderLeft: `1px solid ${redesignHairline.standard}`,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        paddingTop: 20,
      }}
    >
      <div style={{ padding: '0 20px 13px', flexShrink: 0 }}>
        <span style={monoLabelStyle}>DIAGNOSTIC · OPTION {optionNumber}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {rows.map((row) => (
          <div
            key={row.label}
            style={{
              padding: '12px 20px',
              borderTop: `1px solid ${redesignHairline.standard}`,
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <span style={{ fontSize: '12.5px', color: redesignText.body }}>{row.label}</span>
              <span
                style={{
                  fontFamily: redesignFont.mono,
                  fontSize: '11px',
                  color: redesignText.secondary,
                }}
              >
                {row.value}
              </span>
            </div>
            {row.note && (
              <span style={{ fontSize: '11.5px', lineHeight: 1.45, color: redesignText.muted }}>
                {row.note}
              </span>
            )}
          </div>
        ))}

        <div
          style={{
            padding: '12px 20px',
            borderTop: `1px solid ${redesignHairline.standard}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
          }}
        >
          <span style={{ ...monoLabelStyle, letterSpacing: '0.1em' }}>FICHES CITÉES</span>
          {diag.citedEntities.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {diag.citedEntities.map((name) => (
                <span
                  key={name}
                  style={{
                    height: 22,
                    padding: '0 8px',
                    borderRadius: redesignRadius.chip,
                    border: '1px solid rgba(79,127,255,0.4)',
                    background: redesignAccent.selectedBg,
                    fontSize: '11px',
                    color: redesignAccent.light,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <span style={{ fontSize: '11.5px', color: redesignText.muted }}>
              Aucune fiche envoyée n'apparaît nommément dans le texte.
            </span>
          )}
          {diag.uncitedCount > 0 && (
            <span
              data-testid="diagnostic-uncited"
              style={{ fontSize: '11.5px', lineHeight: 1.45, color: redesignText.muted }}
            >
              {diag.uncitedCount} fiche{diag.uncitedCount > 1 ? 's' : ''} envoyée
              {diag.uncitedCount > 1 ? 's' : ''} n'
              {diag.uncitedCount > 1 ? 'ont' : 'a'} pas servi — réduire le contexte allège le coût.
            </span>
          )}
        </div>
      </div>
    </aside>
  )
}

export interface GenerationOptionsComparisonProps {
  /** Ouvre l'option gardée dans l'éditeur (action « Éditer » de la maquette). */
  onEditKept?: () => void
  /**
   * Redéploie le brief, rangé tant qu'on compare (écran 2b). Absent = le
   * conteneur ne gère pas ce repli et l'action n'est pas proposée.
   */
  onEditBrief?: () => void
  /** État courant du repli, pour libeller l'action. */
  briefExpanded?: boolean
}

export function GenerationOptionsComparison({
  onEditKept,
  onEditBrief,
  briefExpanded = false,
}: GenerationOptionsComparisonProps = {}) {
  const slots = useGenerationOptionsStore((s) => s.slots)
  const keptIndex = useGenerationOptionsStore((s) => s.keptIndex)
  const lastRequest = useGenerationOptionsStore((s) => s.lastRequest)
  const setUnityDialogueResponse = useGenerationStore((s) => s.setUnityDialogueResponse)
  const sentEntityNames = useSentEntityNames()

  /**
   * Option dépliée. `null` = tout replié (lien « tout replier »).
   * `undefined` = pas encore de choix explicite : on ouvre alors la première option
   * *prête*, pour ne pas offrir un panneau vide quand l'option 1 a échoué.
   */
  const [openIndexChoice, setOpenIndexChoice] = useState<number | null | undefined>(undefined)

  const diagnostics = useMemo(
    () => slots.map((slot) => computeOptionDiagnostics(slot.result?.json_content, sentEntityNames)),
    [slots, sentEntityNames]
  )

  const doneCount = slots.filter((s) => s.status === 'completed').length
  const runningIndex = slots.findIndex((s) => s.status === 'running' || s.status === 'pending')
  const allSettled = slots.length > 0 && runningIndex === -1

  const firstReadyIndex = slots.findIndex((s) => s.status === 'completed')
  const openIndex =
    openIndexChoice === undefined
      ? firstReadyIndex >= 0
        ? firstReadyIndex
        : null
      : openIndexChoice
  const setOpenIndex = (next: number | null) => setOpenIndexChoice(next)

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

  const handleRegenerateAll = () => {
    if (!lastRequest) return
    for (const slot of slots) {
      void launchBackgroundOption(slot.index, lastRequest)
    }
  }

  const openDiag = openIndex != null ? diagnostics[openIndex] : null

  return (
    <section
      data-testid="generation-options-comparison"
      style={{ marginBottom: 20, display: 'flex', gap: 0, minWidth: 0 }}
    >
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Barre d'entête : état du lot + relance groupée. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <span
            data-testid="options-progress-label"
            style={{ ...monoLabelStyle, color: allSettled ? redesignText.label : '#8fb0ff' }}
          >
            {allSettled
              ? `${doneCount} OPTION${doneCount > 1 ? 'S' : ''} SUR ${slots.length} — À COMPARER`
              : `OPTION ${runningIndex + 1} SUR ${slots.length} — EN ÉCRITURE`}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
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
            <button
              type="button"
              data-testid="options-regenerate-all"
              onClick={handleRegenerateAll}
              disabled={!lastRequest || !allSettled}
              title={`Relancer les ${slots.length} options (coût ×${slots.length})`}
              style={{
                ...ghostButtonStyle,
                height: 28,
                fontSize: '12px',
                color: redesignText.secondary,
                cursor: lastRequest && allSettled ? 'pointer' : 'not-allowed',
                opacity: lastRequest && allSettled ? 1 : 0.5,
              }}
            >
              Régénérer les {slots.length}
            </button>
            {onEditBrief && (
              <button
                type="button"
                data-testid="options-edit-brief"
                onClick={onEditBrief}
                style={{
                  border: 'none',
                  background: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  fontSize: '11.5px',
                  color: redesignText.secondary,
                }}
              >
                {briefExpanded ? 'ranger le brief' : 'modifier le brief'}
              </button>
            )}
            <button
              type="button"
              data-testid="options-collapse-all"
              onClick={() =>
                setOpenIndex(openIndex === null ? (firstReadyIndex >= 0 ? firstReadyIndex : 0) : null)
              }
              style={{
                border: 'none',
                background: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: '11.5px',
                color: redesignText.secondary,
              }}
            >
              {openIndex === null ? 'déplier la première' : 'tout replier'}
            </button>
          </span>
        </div>

        {/* Options : une seule dépliée, les autres en une ligne. */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {slots.map((slot) => {
            const diag = diagnostics[slot.index] ?? diagnostics[0]
            const kept = keptIndex === slot.index
            const open = openIndex === slot.index
            const ready = slot.status === 'completed'

            return (
              <div
                key={slot.index}
                data-testid={`generation-option-${slot.index}`}
                data-open={open ? 'true' : 'false'}
                style={{
                  padding: open ? '14px 0 8px 14px' : '15px 0',
                  borderTop: `1px solid rgba(255,255,255,0.07)`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: open ? 12 : 4,
                  borderLeft: open ? `2px solid ${redesignAccent.base}` : '2px solid transparent',
                  background: open ? redesignAccent.selectedBgStrong : 'transparent',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 16,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
                    <span
                      style={{
                        fontFamily: redesignFont.mono,
                        fontSize: '11px',
                        color: open ? '#8fb0ff' : redesignText.label,
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
                    {ready && (
                      <span style={{ fontSize: '12px', color: redesignText.muted }}>
                        {formatOptionMeta(diag)}
                      </span>
                    )}
                  </span>

                  <span style={{ display: 'flex', gap: 9, flexShrink: 0 }}>
                    {ready && open && (
                      <>
                        <button
                          type="button"
                          data-testid={`option-keep-${slot.index}`}
                          onClick={() => handleKeep(slot)}
                          style={{
                            ...ghostButtonStyle,
                            border: 'none',
                            background: kept ? redesignAccent.selectedBg : redesignAccent.base,
                            color: kept ? redesignAccent.light : '#ffffff',
                            fontWeight: 600,
                            padding: '0 14px',
                          }}
                        >
                          {kept ? 'Gardée' : 'Garder'}
                        </button>
                        <button
                          type="button"
                          data-testid={`option-edit-${slot.index}`}
                          onClick={() => {
                            handleKeep(slot)
                            onEditKept?.()
                          }}
                          title="Garder cette option et l'ouvrir dans l'éditeur"
                          style={{ ...ghostButtonStyle, color: redesignText.body }}
                        >
                          Éditer
                        </button>
                        <button
                          type="button"
                          data-testid={`option-variant-${slot.index}`}
                          onClick={() => handleVariant(slot)}
                          disabled={!lastRequest}
                          title="Régénérer uniquement cette option avec la même requête"
                          style={{
                            ...ghostButtonStyle,
                            color: redesignText.secondary,
                            cursor: lastRequest ? 'pointer' : 'not-allowed',
                          }}
                        >
                          Variante
                        </button>
                      </>
                    )}
                    {ready && !open && (
                      <button
                        type="button"
                        data-testid={`option-expand-${slot.index}`}
                        onClick={() => setOpenIndex(slot.index)}
                        style={{ ...ghostButtonStyle, height: 28, color: redesignText.secondary }}
                      >
                        Déplier
                      </button>
                    )}
                    {slot.status === 'error' && (
                      <button
                        type="button"
                        data-testid={`option-retry-${slot.index}`}
                        onClick={() => handleVariant(slot)}
                        disabled={!lastRequest}
                        style={{
                          ...ghostButtonStyle,
                          height: 28,
                          color: redesignText.secondary,
                          cursor: lastRequest ? 'pointer' : 'not-allowed',
                        }}
                      >
                        Réessayer
                      </button>
                    )}
                  </span>
                </div>

                {ready && open && <OpenOptionBody diag={diag} />}

                {/* Repliée : la première phrase suffit à comparer. */}
                {ready && !open && diag.line && (
                  <span
                    style={{
                      fontFamily: redesignFont.serif,
                      fontSize: '15px',
                      lineHeight: 1.5,
                      color: redesignText.body,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {diag.line}
                  </span>
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
      </div>

      {/* Diagnostic de l'option ouverte — ce qui aide à trancher. */}
      {openIndex != null && openDiag && slots[openIndex]?.status === 'completed' && (
        <OptionDiagnosticColumn diag={openDiag} optionNumber={openIndex + 1} />
      )}
    </section>
  )
}
