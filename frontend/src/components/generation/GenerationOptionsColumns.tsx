/**
 * Options côte à côte (écran 2b, vue « côte à côte »).
 *
 * Une colonne par option, une rangée par critère : réplique, didascalie, réponses,
 * flags, fiches citées, longueur. Comparer, c'est lire en travers une même rangée —
 * d'où la grille alignée plutôt que N cartes posées côte à côte. La colonne retenue
 * porte le filet accent et le seul bouton plein (« Garder ») ; les autres se retiennent.
 *
 * Maquette : artifact « Points ouverts — comparaison et tiroir », planche A.
 */
import type { CSSProperties, ReactNode } from 'react'
import { theme } from '../../theme'
import {
  redesignAccent,
  redesignFont,
  redesignHairline,
  redesignRadius,
  redesignText,
} from '../../theme/redesignTokens'
import {
  OPTIONS_COLUMNS_LABEL_WIDTH_PX,
  OPTIONS_COLUMN_MIN_WIDTH_PX,
} from '../../theme/responsiveChrome'
import type { GenerationOptionSlot } from '../../store/generationOptionsStore'
import { formatOptionMeta, type OptionDiagnostics } from '../../utils/generationOptionDiagnostics'
import {
  STATUS_LABELS,
  ghostButtonStyle,
  keepButtonStyle,
  statusColor,
} from './generationOptionsChrome'

export interface GenerationOptionsColumnsProps {
  slots: GenerationOptionSlot[]
  diagnostics: OptionDiagnostics[]
  /** Option retenue : celle qui porte « Garder ». `null` = aucune prête. */
  retainedIndex: number | null
  keptIndex: number | null
  canRelaunch: boolean
  onRetain: (index: number) => void
  onKeep: (slot: GenerationOptionSlot) => void
  onEdit: (slot: GenerationOptionSlot) => void
  onVariant: (slot: GenerationOptionSlot) => void
}

const rowLabelStyle: CSSProperties = {
  padding: '11px 0',
  borderTop: `1px solid ${redesignHairline.standard}`,
  fontFamily: redesignFont.mono,
  fontSize: '9.5px',
  letterSpacing: '0.1em',
  color: redesignText.label,
}

/** Message d'une option qui n'a pas (encore) de contenu à comparer. */
function slotPlaceholder(slot: GenerationOptionSlot): { text: string; color: string } {
  switch (slot.status) {
    case 'running':
      return { text: 'En écriture…', color: redesignAccent.text }
    case 'pending':
      return { text: 'En attente.', color: redesignText.muted }
    case 'cancelled':
      return { text: 'Annulée.', color: redesignText.muted }
    case 'error':
      return { text: slot.error ?? 'La génération a échoué.', color: theme.state.error.color }
    default:
      return { text: '', color: redesignText.muted }
  }
}

export function GenerationOptionsColumns({
  slots,
  diagnostics,
  retainedIndex,
  keptIndex,
  canRelaunch,
  onRetain,
  onKeep,
  onEdit,
  onVariant,
}: GenerationOptionsColumnsProps) {
  const cellStyle = (index: number): CSSProperties => {
    const retained = index === retainedIndex
    return {
      padding: '11px 12px',
      minWidth: 0,
      borderTop: `1px solid ${redesignHairline.standard}`,
      borderLeft: `1px solid ${redesignHairline.standard}`,
      background: retained ? redesignAccent.selectedBgStrong : 'transparent',
      boxShadow: retained ? `inset 2px 0 0 ${redesignAccent.base}` : 'none',
    }
  }

  /** Une rangée : son libellé, puis une cellule par option (vide tant qu'elle n'est pas prête). */
  const row = (key: string, label: string, render: (diag: OptionDiagnostics) => ReactNode) => [
    <span key={`${key}-label`} style={rowLabelStyle}>
      {label}
    </span>,
    ...slots.map((slot) => (
      <div key={`${key}-${slot.index}`} data-testid={`options-cell-${key}-${slot.index}`} style={cellStyle(slot.index)}>
        {slot.status === 'completed' ? render(diagnostics[slot.index] ?? diagnostics[0]) : null}
      </div>
    )),
  ]

  return (
    <div data-testid="options-columns" style={{ overflowX: 'auto', minWidth: 0 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${OPTIONS_COLUMNS_LABEL_WIDTH_PX}px repeat(${slots.length}, minmax(${OPTIONS_COLUMN_MIN_WIDTH_PX}px, 1fr))`,
          alignItems: 'stretch',
          borderBottom: `1px solid ${redesignHairline.standard}`,
        }}
      >
        <span style={{ ...rowLabelStyle, borderTopColor: redesignHairline.strong }} />
        {slots.map((slot) => {
          const retained = slot.index === retainedIndex
          const kept = keptIndex === slot.index
          const ready = slot.status === 'completed'
          const placeholder = slotPlaceholder(slot)
          return (
            <div
              key={`head-${slot.index}`}
              data-testid={`options-column-head-${slot.index}`}
              data-retained={retained ? 'true' : 'false'}
              style={{
                ...cellStyle(slot.index),
                borderTopColor: redesignHairline.strong,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 9 }}>
                <span
                  style={{
                    fontFamily: redesignFont.mono,
                    fontSize: '11px',
                    color: retained ? redesignAccent.text : redesignText.label,
                  }}
                >
                  OPTION {slot.index + 1}
                </span>
                <span
                  style={{
                    fontFamily: redesignFont.mono,
                    fontSize: '9.5px',
                    letterSpacing: '0.08em',
                    color: retained && !kept && ready ? redesignAccent.text : statusColor(slot.status, kept),
                  }}
                >
                  {kept ? 'GARDÉE' : retained && ready ? 'RETENUE' : STATUS_LABELS[slot.status]}
                </span>
              </span>
              {ready ? (
                <span style={{ fontSize: '12px', color: redesignText.muted }}>
                  {formatOptionMeta(diagnostics[slot.index] ?? diagnostics[0])}
                </span>
              ) : (
                <span style={{ fontSize: '12px', lineHeight: 1.45, color: placeholder.color }}>{placeholder.text}</span>
              )}
            </div>
          )
        })}

        {row('line', 'RÉPLIQUE', (diag) => (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {diag.speaker && (
              <span
                style={{
                  fontFamily: redesignFont.mono,
                  fontSize: '9.5px',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: redesignText.label,
                }}
              >
                {diag.speaker}
              </span>
            )}
            <span style={{ fontFamily: redesignFont.serif, fontSize: '14.5px', lineHeight: 1.5, color: redesignText.dialogue }}>
              {diag.line ?? '—'}
            </span>
          </span>
        ))}

        {row('direction', 'DIDASCALIE', (diag) => (
          <span
            style={{
              fontSize: '12.5px',
              lineHeight: 1.55,
              color: diag.stageDirection ? redesignText.secondary : redesignText.label,
            }}
          >
            {diag.stageDirection ?? 'Aucune didascalie.'}
          </span>
        ))}

        {row('choices', 'RÉPONSES', (diag) =>
          diag.choices.length === 0 ? (
            <span style={{ fontSize: '12.5px', color: redesignText.label }}>Aucune réponse : le dialogue se termine ici.</span>
          ) : (
            <span style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {diag.choices.map((choice) => (
                <span key={choice.index} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
                    <span style={{ fontFamily: redesignFont.mono, fontSize: '10.5px', color: redesignText.label, flexShrink: 0 }}>
                      {String(choice.index + 1).padStart(2, '0')}
                    </span>
                    <span style={{ fontSize: '12.5px', lineHeight: 1.45, color: redesignText.body }}>{choice.text}</span>
                  </span>
                  {choice.tag && (
                    <span
                      style={{
                        marginLeft: 25,
                        fontFamily: redesignFont.mono,
                        fontSize: '9.5px',
                        letterSpacing: '0.06em',
                        color: choice.emphasised ? redesignAccent.text : redesignText.label,
                      }}
                    >
                      {choice.tag}
                    </span>
                  )}
                </span>
              ))}
            </span>
          )
        )}

        {row('flags', 'FLAGS', (diag) => (
          <span
            style={{
              fontFamily: redesignFont.mono,
              fontSize: '10.5px',
              lineHeight: 1.6,
              color: diag.flags.length > 0 ? redesignText.muted : redesignText.label,
            }}
          >
            {diag.flags.length > 0 ? diag.flags.join(' · ') : 'Aucun.'}
          </span>
        ))}

        {row('cited', 'FICHES CITÉES', (diag) => (
          <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {diag.citedEntities.length > 0 ? (
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
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
                      display: 'inline-flex',
                      alignItems: 'center',
                    }}
                  >
                    {name}
                  </span>
                ))}
              </span>
            ) : (
              <span style={{ fontSize: '12px', color: redesignText.label }}>Aucune.</span>
            )}
            {diag.uncitedCount > 0 && (
              <span style={{ fontFamily: redesignFont.mono, fontSize: '10px', letterSpacing: '0.05em', color: redesignText.muted }}>
                {diag.uncitedCount} ENVOYÉE{diag.uncitedCount > 1 ? 'S' : ''} SANS USAGE
              </span>
            )}
          </span>
        ))}

        {row('length', 'LONGUEUR', (diag) => (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontFamily: redesignFont.mono,
              fontSize: '10.5px',
              letterSpacing: '0.05em',
              color: redesignText.secondary,
            }}
          >
            <span
              aria-hidden
              style={{
                width: 6,
                height: 6,
                borderRadius: redesignRadius.chip,
                flexShrink: 0,
                background: diag.withinLengthTarget ? theme.state.accepted.border : theme.state.pending.border,
              }}
            />
            {diag.wordCount} MOTS · {diag.withinLengthTarget ? 'DANS LA CIBLE' : 'HORS CIBLE (40–90)'}
          </span>
        ))}

        <span style={rowLabelStyle} />
        {slots.map((slot) => {
          const retained = slot.index === retainedIndex
          const kept = keptIndex === slot.index
          const ready = slot.status === 'completed'
          return (
            <div
              key={`actions-${slot.index}`}
              style={{ ...cellStyle(slot.index), display: 'flex', flexWrap: 'wrap', gap: 9, paddingBottom: 14 }}
            >
              {ready && retained && (
                <button
                  type="button"
                  data-testid={`option-keep-${slot.index}`}
                  onClick={() => onKeep(slot)}
                  style={keepButtonStyle(kept)}
                >
                  {kept ? 'Gardée' : 'Garder'}
                </button>
              )}
              {ready && !retained && (
                <button
                  type="button"
                  data-testid={`option-retain-${slot.index}`}
                  onClick={() => onRetain(slot.index)}
                  style={ghostButtonStyle}
                >
                  Retenir
                </button>
              )}
              {ready && (
                <button
                  type="button"
                  data-testid={`option-edit-${slot.index}`}
                  onClick={() => onEdit(slot)}
                  title="Garder cette option et l'ouvrir dans l'éditeur"
                  style={ghostButtonStyle}
                >
                  Éditer
                </button>
              )}
              {ready && (
                <button
                  type="button"
                  data-testid={`option-variant-${slot.index}`}
                  onClick={() => onVariant(slot)}
                  disabled={!canRelaunch}
                  title="Régénérer uniquement cette option avec la même requête"
                  style={{
                    ...ghostButtonStyle,
                    color: redesignText.secondary,
                    cursor: canRelaunch ? 'pointer' : 'not-allowed',
                  }}
                >
                  Variante
                </button>
              )}
              {slot.status === 'error' && (
                <button
                  type="button"
                  data-testid={`option-retry-${slot.index}`}
                  onClick={() => onVariant(slot)}
                  disabled={!canRelaunch}
                  style={{
                    ...ghostButtonStyle,
                    color: redesignText.secondary,
                    cursor: canRelaunch ? 'pointer' : 'not-allowed',
                  }}
                >
                  Réessayer
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
