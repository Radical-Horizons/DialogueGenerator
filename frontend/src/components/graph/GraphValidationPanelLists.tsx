import type { CSSProperties } from 'react'
import { useGraphViewStore } from '../../store/graphViewStore'
import { theme } from '../../theme'
import type { ValidationErrorDetail } from '../../types/graph'
import type { LoreWarningDisposition } from '../../utils/loreWarningUi'
import {
  isDismissibleLoreWarning,
  resolveLoreWarningKey,
} from '../../utils/loreWarningUi'
import {
  getIconForType,
  getLabelForType,
  isDocumentIdRepairable,
} from './validationPanelLabels'

const LORE_BADGE_TYPES = new Set([
  'lore_contradiction_explicit',
  'lore_contradiction_potential',
  'lore_potential_ambiguity',
])

function loreWarnBtnStyle(border: string, color: string): CSSProperties {
  return {
    fontSize: '0.7rem',
    padding: '0.15rem 0.4rem',
    borderRadius: 4,
    border: `1px solid ${border}`,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    color,
    cursor: 'pointer',
  }
}

interface ValidationErrorsByTypeProps {
  errorsByType: Record<string, ValidationErrorDetail[]>
  setSelectedNode: (id: string) => void
  syncNodeDocumentId: (id: string) => void
}

export function ValidationErrorsByType({
  errorsByType,
  setSelectedNode,
  syncNodeDocumentId,
}: ValidationErrorsByTypeProps) {
  return (
    <>
      {Object.entries(errorsByType).map(([type, typeErrors]) => (
        <div key={`error-${type}`} style={{ marginBottom: '0.75rem' }}>
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: theme.state.error.color,
              marginBottom: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>{getIconForType(type)}</span>
            <span>
              {getLabelForType(type)} ({typeErrors.length})
            </span>
          </div>
          {typeErrors.map((err, idx) => (
            <div
              key={idx}
              onClick={() => {
                if (err.node_id) {
                  setSelectedNode(err.node_id)
                  useGraphViewStore.getState().focusNode(err.node_id)
                }
              }}
              style={{
                fontSize: '0.75rem',
                color: theme.state.error.color,
                marginBottom: '0.2rem',
                padding: '0.3rem 0.5rem',
                borderRadius: '4px',
                cursor: err.node_id ? 'pointer' : 'default',
                backgroundColor: err.node_id ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                transition: 'background-color 0.2s',
                marginLeft: '1.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                flexWrap: 'wrap',
              }}
              onMouseEnter={(e) => {
                if (err.node_id) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
              }}
              onMouseLeave={(e) => {
                if (err.node_id) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
              }}
            >
              {LORE_BADGE_TYPES.has(type) ? (
                <span
                  style={{
                    fontSize: '0.62rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    color: theme.state.lore.color,
                    border: `1px solid ${theme.state.lore.border}`,
                    borderRadius: 4,
                    padding: '1px 5px',
                    flexShrink: 0,
                  }}
                >
                  Lore
                </span>
              ) : null}
              <span style={{ flex: '1 1 auto', minWidth: 0 }}>
                {err.node_id ? `[${err.node_id}] ` : ''}
                {err.message}
              </span>
              {err.node_id ? (
                <button
                  type="button"
                  aria-label="Éditer le nœud"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedNode(err.node_id as string)
                    useGraphViewStore.getState().focusNode(err.node_id as string)
                  }}
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.2rem 0.45rem',
                    borderRadius: '4px',
                    border: `1px solid ${theme.state.error.border}`,
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    color: theme.state.error.color,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  Éditer le nœud
                </button>
              ) : null}
              {isDocumentIdRepairable(err) && err.node_id ? (
                <button
                  type="button"
                  aria-label="Générer stableID (aligner data.id)"
                  onClick={(e) => {
                    e.stopPropagation()
                    syncNodeDocumentId(err.node_id as string)
                  }}
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.2rem 0.45rem',
                    borderRadius: '4px',
                    border: `1px solid ${theme.state.error.border}`,
                    backgroundColor: 'rgba(255, 255, 255, 0.15)',
                    color: theme.state.error.color,
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  Générer stableID
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </>
  )
}

/** Navigation depuis une entrée du panneau de validation (cycle → fitView multi-nœuds, sinon focus). */
function navigateToValidationWarningTarget(
  warn: ValidationErrorDetail,
  ctx: {
    isCycle: boolean
    cycleNodeIds: string[] | undefined
    setSelectedNode: (id: string) => void
  }
): void {
  if (ctx.isCycle && ctx.cycleNodeIds && ctx.cycleNodeIds.length > 0) {
    const first = ctx.cycleNodeIds[0]
    if (first) {
      ctx.setSelectedNode(first)
    }
    useGraphViewStore.getState().requestFitViewOnNodeIds(ctx.cycleNodeIds)
    return
  }
  if (warn.node_id) {
    ctx.setSelectedNode(warn.node_id)
    useGraphViewStore.getState().focusNode(warn.node_id)
  }
}

interface ValidationWarningsByTypeProps {
  warningsByType: Record<string, ValidationErrorDetail[]>
  setSelectedNode: (id: string) => void
  intentionalCycles: string[]
  markCycleAsIntentional: (id: string) => void
  unmarkCycleAsIntentional: (id: string) => void
  /** FR39 — actions Examiné / Ignoré / Réactiver sur avertissements lore révisables */
  loreWarningUi?: {
    getDisposition: (w: ValidationErrorDetail) => LoreWarningDisposition
    onDisposition: (w: ValidationErrorDetail, d: LoreWarningDisposition) => void
    showIgnored: boolean
  }
}

export function ValidationWarningsByType({
  warningsByType,
  setSelectedNode,
  intentionalCycles,
  markCycleAsIntentional,
  unmarkCycleAsIntentional,
  loreWarningUi,
}: ValidationWarningsByTypeProps) {
  return (
    <>
      {Object.entries(warningsByType).map(([type, typeWarnings]) => (
        <div key={`warning-${type}`} style={{ marginBottom: '0.75rem' }}>
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 600,
              color: theme.state.warning.color,
              marginBottom: '0.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>{getIconForType(type)}</span>
            <span>
              {getLabelForType(type)} ({typeWarnings.length})
            </span>
          </div>
          {typeWarnings.map((warn, widx) => {
            const isCycle =
              type === 'cycle_detected' &&
              Array.isArray(warn.cycle_nodes) &&
              warn.cycle_nodes.length > 0
            const handleClick = () => {
              navigateToValidationWarningTarget(warn, {
                isCycle: Boolean(isCycle),
                cycleNodeIds: warn.cycle_nodes,
                setSelectedNode,
              })
            }
            return (
              <div
                key={`${type}-${widx}-${warn.node_id ?? ''}`}
                onClick={handleClick}
                style={{
                  fontSize: '0.75rem',
                  color: theme.state.warning.color,
                  marginBottom: '0.2rem',
                  padding: '0.3rem 0.5rem',
                  borderRadius: '4px',
                  cursor: isCycle || warn.node_id ? 'pointer' : 'default',
                  backgroundColor:
                    isCycle || warn.node_id ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                  transition: 'background-color 0.2s',
                  marginLeft: '1.5rem',
                }}
                onMouseEnter={(e) => {
                  if (isCycle || warn.node_id)
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
                }}
                onMouseLeave={(e) => {
                  if (isCycle || warn.node_id)
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)'
                }}
                title={isCycle ? 'Cliquer pour zoomer sur les nœuds du cycle' : undefined}
              >
                {isCycle ? (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontWeight: 500, flex: 1 }}>
                      {warn.cycle_path?.trim() ? warn.cycle_path : warn.message}
                    </span>
                    {warn.cycle_id && (
                      <label
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={intentionalCycles.includes(warn.cycle_id)}
                          onChange={(e) => {
                            e.stopPropagation()
                            if (warn.cycle_id) {
                              if (e.target.checked) {
                                markCycleAsIntentional(warn.cycle_id)
                              } else {
                                unmarkCycleAsIntentional(warn.cycle_id)
                              }
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                        <span>Marquer comme intentionnel</span>
                      </label>
                    )}
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.35rem' }}>
                      {LORE_BADGE_TYPES.has(type) ? (
                        <span
                          style={{
                            fontSize: '0.62rem',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                            color: theme.state.lore.color,
                            border: `1px solid ${theme.state.lore.border}`,
                            borderRadius: 4,
                            padding: '1px 5px',
                            flexShrink: 0,
                          }}
                        >
                          Lore
                        </span>
                      ) : null}
                      <span style={{ flex: '1 1 12rem', minWidth: 0 }}>
                        {warn.node_id ? `[${warn.node_id}] ` : ''}
                        {warn.message}
                      </span>
                      {warn.ambiguity_candidates && warn.ambiguity_candidates.length > 0 ? (
                        <span style={{ fontSize: '0.65rem', opacity: 0.92, width: '100%' }}>
                          Candidats :{' '}
                          {warn.ambiguity_candidates
                            .map((c) => `${c.name} (${c.gdd_path})`)
                            .join(' · ')}
                        </span>
                      ) : null}
                      {loreWarningUi && isDismissibleLoreWarning(warn) ? (
                        <span
                          style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: '0.25rem',
                            marginTop: 2,
                            width: '100%',
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {(() => {
                            const key = resolveLoreWarningKey(warn)
                            const tid = `${warn.node_id ?? widx}-${key.length}`
                            const d = loreWarningUi.getDisposition(warn)
                            if (d === 'ignored' && loreWarningUi.showIgnored) {
                              return (
                                <button
                                  type="button"
                                  data-testid={`lore-reactivate-${tid}`}
                                  onClick={() => loreWarningUi.onDisposition(warn, 'active')}
                                  style={loreWarnBtnStyle(theme.state.warning.border, theme.state.warning.color)}
                                >
                                  Réactiver
                                </button>
                              )
                            }
                            if (d === 'ignored') {
                              return null
                            }
                            return (
                              <>
                                <button
                                  type="button"
                                  data-testid={`lore-examine-${tid}`}
                                  onClick={() => loreWarningUi.onDisposition(warn, 'examined')}
                                  style={loreWarnBtnStyle(theme.state.lore.border, theme.state.lore.color)}
                                >
                                  Examiné
                                </button>
                                <button
                                  type="button"
                                  data-testid={`lore-ignore-${tid}`}
                                  onClick={() => loreWarningUi.onDisposition(warn, 'ignored')}
                                  style={loreWarnBtnStyle(theme.state.warning.border, theme.state.warning.color)}
                                >
                                  Ignorer
                                </button>
                                {d === 'examined' ? (
                                  <span
                                    style={{
                                      fontSize: '0.65rem',
                                      fontWeight: 600,
                                      color: theme.state.lore.color,
                                    }}
                                  >
                                    (marqué examiné)
                                  </span>
                                ) : null}
                              </>
                            )
                          })()}
                        </span>
                      ) : null}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}
