/**
 * Tiroir dev — état simulé, override skill check, historique (Story 9.4 + VN).
 */
import { useEffect, useMemo, useState } from 'react'
import { useGraphStore } from '../../../store/graphStore'
import {
  useGraphViewStore,
  type PreviewCatalogMap,
} from '../../../store/graphViewStore'
import { theme } from '../../../theme'
import { listFlags } from '../../../api/flags'
import type { FlagDefinition } from '../../../types/flags'
import { computeDialoguePreviewCounts } from '../../../utils/dialoguePreviewStats'
import { collectKeysFromGraphNodes } from '../../../utils/collectPreviewKeys'
import { collectPreviewSimulationLimits } from '../../../utils/previewSimulationLimits'
import type { SkillCheckIssue } from '../../../utils/skillChecks'
import { playthroughChrome } from './playthroughChrome'

const SKILL_ISSUE_OPTIONS: { value: SkillCheckIssue | ''; label: string }[] = [
  { value: '', label: 'Auto (stats simulées)' },
  { value: 'succès_critique', label: 'Succès critique' },
  { value: 'succès', label: 'Succès' },
  { value: 'échec', label: 'Échec' },
  { value: 'échec_critique', label: 'Échec critique' },
]

function clampCounter(v: number, meta: FlagDefinition | undefined): number {
  if (!meta || meta.semanticType !== 'compteur') return v
  const lo = typeof meta.minValue === 'number' ? meta.minValue : Number(meta.minValue ?? 0)
  const hi = typeof meta.maxValue === 'number' ? meta.maxValue : Number(meta.maxValue ?? 0)
  if (Number.isFinite(lo) && Number.isFinite(hi)) {
    return Math.min(hi, Math.max(lo, v))
  }
  return v
}

export interface ScenarioPlaythroughDevDrawerProps {
  open: boolean
  onClose: () => void
}

export function ScenarioPlaythroughDevDrawer({ open, onClose }: ScenarioPlaythroughDevDrawerProps) {
  const nodes = useGraphStore((s) => s.nodes)
  const dialogueFlagBindings = useGraphStore((s) => s.dialogueFlagBindings)
  const visibilityEvalState = useGraphViewStore((s) => s.visibilityEvalState)
  const previewEffectHistory = useGraphViewStore((s) => s.previewEffectHistory)
  const dialoguePreviewActive = useGraphViewStore((s) => s.dialoguePreviewActive)
  const previewGameSystemsState = useGraphViewStore((s) => s.previewGameSystemsState)
  const forcedIssue = useGraphViewStore((s) => s.scenarioPlaythrough.forcedSkillCheckIssue)
  const setPreviewCatalogById = useGraphViewStore((s) => s.setPreviewCatalogById)
  const setVisibilityEvalFlag = useGraphViewStore((s) => s.setVisibilityEvalFlag)
  const setVisibilityEvalReputation = useGraphViewStore((s) => s.setVisibilityEvalReputation)
  const clearPreviewEffectHistory = useGraphViewStore((s) => s.clearPreviewEffectHistory)
  const setPreviewAttribute = useGraphViewStore((s) => s.setPreviewAttribute)
  const setPreviewSkill = useGraphViewStore((s) => s.setPreviewSkill)
  const setPreviewEffortPool = useGraphViewStore((s) => s.setPreviewEffortPool)
  const setPreviewSimulationLimits = useGraphViewStore((s) => s.setPreviewSimulationLimits)
  const setForcedSkillCheckIssue = useGraphViewStore((s) => s.setForcedSkillCheckIssue)

  const [flagsCatalogError, setFlagsCatalogError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await listFlags()
        if (cancelled) return
        const map: PreviewCatalogMap = {}
        for (const f of res.flags) {
          map[f.id] = f
        }
        setPreviewCatalogById(map)
        setFlagsCatalogError(null)
      } catch (err) {
        if (cancelled) return
        console.warn('[ScenarioPlaythroughDevDrawer] listFlags failed', err)
        setPreviewCatalogById(undefined)
        setFlagsCatalogError(
          'Catalogue des flags indisponible — bornes des compteurs et métadonnées peuvent être incorrectes.',
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setPreviewCatalogById])

  const catalog = useGraphViewStore((s) => s.previewCatalogById)

  const { flagIds, reputationKeys, skillAttributeIds, skillIds, usesEffort } = useMemo(
    () => collectKeysFromGraphNodes(nodes),
    [nodes],
  )

  const simulationLimits = useMemo(
    () =>
      collectPreviewSimulationLimits({
        reputation_values: previewGameSystemsState.reputationValues,
      }),
    [previewGameSystemsState.reputationValues],
  )

  useEffect(() => {
    setPreviewSimulationLimits(simulationLimits)
  }, [setPreviewSimulationLimits, simulationLimits])

  const bindingIds = useMemo(
    () => dialogueFlagBindings.map((b) => b.flagId),
    [dialogueFlagBindings],
  )

  const sortedFlagIds = useMemo(() => {
    const s = new Set([...bindingIds, ...flagIds])
    return [...s].sort()
  }, [bindingIds, flagIds])

  const counts = useMemo(
    () => computeDialoguePreviewCounts(nodes, visibilityEvalState, dialoguePreviewActive),
    [nodes, visibilityEvalState, dialoguePreviewActive],
  )

  if (!open) return null

  return (
    <aside
      data-testid="playthrough-dev-drawer"
      aria-label="Tiroir dev preview scénario"
      style={{
        position: 'absolute',
        top: playthroughChrome.topBarHeight,
        right: 0,
        bottom: 0,
        width: playthroughChrome.devDrawerWidth,
        borderLeft: `1px solid ${theme.border.primary}`,
        backgroundColor: theme.background.secondary,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
        zIndex: 2,
        boxShadow: '-4px 0 24px rgba(0,0,0,0.35)',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          borderBottom: `1px solid ${theme.border.primary}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Dev — simulation</span>
        <button type="button" onClick={onClose} style={{ cursor: 'pointer', padding: '4px 10px' }}>
          Fermer
        </button>
      </div>

      <div style={{ padding: '10px 12px', overflowY: 'auto', flex: 1 }}>
        {flagsCatalogError ? (
          <div role="alert" style={{ marginBottom: 12, fontSize: '0.82rem', color: theme.state.error.color }}>
            {flagsCatalogError}
          </div>
        ) : null}

        <section style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Forcer issue skill check</div>
          <select
            data-testid="playthrough-forced-skill-issue"
            value={forcedIssue ?? ''}
            onChange={(e) => {
              const v = e.target.value
              setForcedSkillCheckIssue(v === '' ? null : (v as SkillCheckIssue))
            }}
            style={{ width: '100%', padding: 6 }}
          >
            {SKILL_ISSUE_OPTIONS.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </section>

        <section style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Synthèse visibilité</div>
          <div style={{ fontSize: '0.88rem', color: theme.text.secondary }}>
            Nœuds accessibles / masqués : {counts.nodesAccessible} / {counts.nodesMasked}
          </div>
          <div style={{ fontSize: '0.88rem', color: theme.text.secondary }}>
            Choix accessibles / masqués : {counts.choicesAccessible} / {counts.choicesMasked}
          </div>
        </section>

        <section style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>État simulé</div>
          {sortedFlagIds.map((fid) => {
            const meta = catalog?.[fid]
            const binding = dialogueFlagBindings.find((b) => b.flagId === fid)
            const raw = visibilityEvalState.flags[fid]
            const sem = meta?.semanticType
            const isBool =
              binding?.type === 'bool' ||
              sem === 'bool' ||
              meta?.type === 'bool' ||
              typeof raw === 'boolean'
            if (isBool) {
              return (
                <label key={fid} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: '0.88rem' }}>
                  <input
                    type="checkbox"
                    checked={Boolean(raw)}
                    onChange={(e) => setVisibilityEvalFlag(fid, e.target.checked)}
                  />
                  <span>{fid}</span>
                </label>
              )
            }
            if (binding?.type === 'compteur' || sem === 'compteur') {
              const n = typeof raw === 'number' ? raw : Number(raw ?? 0)
              return (
                <label key={fid} style={{ display: 'block', marginBottom: 8, fontSize: '0.88rem' }}>
                  <div>{fid} (compteur)</div>
                  <input
                    type="number"
                    value={Number.isNaN(n) ? 0 : n}
                    onChange={(e) => setVisibilityEvalFlag(fid, clampCounter(Number(e.target.value), meta))}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>
              )
            }
            return (
              <label key={fid} style={{ display: 'block', marginBottom: 8, fontSize: '0.88rem' }}>
                <div>{fid}</div>
                <input
                  type="text"
                  value={raw === undefined ? '' : String(raw)}
                  onChange={(e) => setVisibilityEvalFlag(fid, e.target.value)}
                  style={{ width: '100%', marginTop: 4 }}
                />
              </label>
            )
          })}
          {reputationKeys.map((key) => {
            const parts = key.split('::')
            const axisId = parts[0] ?? ''
            const factionId = parts.slice(1).join('::') ?? ''
            const cur = visibilityEvalState.reputation[key] ?? 0
            return (
              <label key={key} style={{ display: 'block', marginBottom: 8, fontSize: '0.88rem' }}>
                <div>
                  Réputation {axisId} × {factionId}
                </div>
                <input
                  type="number"
                  value={cur}
                  onChange={(e) => {
                    const raw = Number(e.target.value)
                    const fallback = visibilityEvalState.reputation[key] ?? 0
                    setVisibilityEvalReputation(axisId, factionId, Number.isFinite(raw) ? raw : fallback)
                  }}
                  style={{ width: '100%', marginTop: 4 }}
                />
              </label>
            )
          })}
        </section>

        <section style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Stats FR94</div>
          {usesEffort ? (
            <label style={{ display: 'block', marginBottom: 8, fontSize: '0.88rem' }}>
              <div>Pool Effort (PE)</div>
              <input
                type="number"
                value={previewGameSystemsState.effortPool}
                onChange={(e) => setPreviewEffortPool(Number(e.target.value))}
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
          ) : null}
          {skillAttributeIds.map((attributeId) => (
            <label key={attributeId} style={{ display: 'block', marginBottom: 8, fontSize: '0.88rem' }}>
              <div>Caractéristique {attributeId}</div>
              <input
                type="number"
                value={previewGameSystemsState.attributes[attributeId] ?? 0}
                onChange={(e) => setPreviewAttribute(attributeId, Number(e.target.value))}
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
          ))}
          {skillIds.map((skillId) => (
            <label key={skillId} style={{ display: 'block', marginBottom: 8, fontSize: '0.88rem' }}>
              <div>Compétence {skillId}</div>
              <input
                type="number"
                value={previewGameSystemsState.skills[skillId] ?? 0}
                onChange={(e) => setPreviewSkill(skillId, Number(e.target.value))}
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
          ))}
          {simulationLimits.length > 0 ? (
            <div role="status" style={{ fontSize: '0.82rem', color: theme.text.secondary, marginTop: 8 }}>
              {simulationLimits.join(' ')}
            </div>
          ) : null}
        </section>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontWeight: 600 }}>Historique effets</span>
            <button type="button" onClick={() => clearPreviewEffectHistory()} style={{ fontSize: '0.78rem' }}>
              Effacer
            </button>
          </div>
          {previewEffectHistory.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: theme.text.secondary }}>
              Les effets apparaissent ici quand vous choisissez une option.
            </div>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: '0.82rem' }}>
              {previewEffectHistory.map((line, i) => (
                <li key={`${i}-${line}`}>{line}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  )
}
