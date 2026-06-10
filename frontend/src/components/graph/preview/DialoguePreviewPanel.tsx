/**
 * Panneau preview scénario — état initial + stats + historique (Story 9.4).
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

interface DialoguePreviewPanelProps {
  onClose: () => void
}

function clampCounter(
  v: number,
  meta: FlagDefinition | undefined,
): number {
  if (!meta || meta.semanticType !== 'compteur') return v
  const lo = typeof meta.minValue === 'number' ? meta.minValue : Number(meta.minValue ?? 0)
  const hi = typeof meta.maxValue === 'number' ? meta.maxValue : Number(meta.maxValue ?? 0)
  if (Number.isFinite(lo) && Number.isFinite(hi)) {
    return Math.min(hi, Math.max(lo, v))
  }
  return v
}

export function DialoguePreviewPanel({ onClose }: DialoguePreviewPanelProps) {
  const nodes = useGraphStore((s) => s.nodes)
  const dialogueFlagBindings = useGraphStore((s) => s.dialogueFlagBindings)
  const visibilityEvalState = useGraphViewStore((s) => s.visibilityEvalState)
  const previewEffectHistory = useGraphViewStore((s) => s.previewEffectHistory)
  const dialoguePreviewActive = useGraphViewStore((s) => s.dialoguePreviewActive)
  const previewGameSystemsState = useGraphViewStore((s) => s.previewGameSystemsState)
  const setPreviewCatalogById = useGraphViewStore((s) => s.setPreviewCatalogById)
  const setVisibilityEvalFlag = useGraphViewStore((s) => s.setVisibilityEvalFlag)
  const setVisibilityEvalReputation = useGraphViewStore((s) => s.setVisibilityEvalReputation)
  const clearPreviewEffectHistory = useGraphViewStore((s) => s.clearPreviewEffectHistory)
  const setPreviewAttribute = useGraphViewStore((s) => s.setPreviewAttribute)
  const setPreviewSkill = useGraphViewStore((s) => s.setPreviewSkill)
  const setPreviewEffortPool = useGraphViewStore((s) => s.setPreviewEffortPool)
  const setPreviewSimulationLimits = useGraphViewStore((s) => s.setPreviewSimulationLimits)

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
        console.warn('[DialoguePreviewPanel] listFlags failed', err)
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

  const {
    flagIds,
    reputationKeys,
    skillAttributeIds,
    skillIds,
    usesEffort,
  } = useMemo(() => collectKeysFromGraphNodes(nodes), [nodes])

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

  return (
    <aside
      data-testid="dialogue-preview-panel"
      aria-label="Preview scénario"
      style={{
        width: 'min(380px, 94vw)',
        borderLeft: `1px solid ${theme.border.primary}`,
        backgroundColor: theme.background.secondary,
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 12px',
          borderBottom: `1px solid ${theme.border.primary}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>Preview scénario</span>
        <button
          type="button"
          data-testid="dialogue-preview-close"
          onClick={onClose}
          style={{
            padding: '4px 10px',
            borderRadius: 6,
            border: `1px solid ${theme.border.primary}`,
            background: theme.button.default.background,
            cursor: 'pointer',
          }}
        >
          Fermer
        </button>
      </div>

      <div style={{ padding: '10px 12px', overflowY: 'auto', flex: 1 }}>
        {flagsCatalogError ? (
          <div
            role="alert"
            style={{
              marginBottom: 12,
              padding: '8px 10px',
              borderRadius: 6,
              fontSize: '0.82rem',
              backgroundColor: theme.state.warning?.background ?? 'rgba(241, 196, 15, 0.15)',
              border: `1px solid ${theme.border.primary}`,
              color: theme.text.primary,
            }}
          >
            {flagsCatalogError}
          </div>
        ) : null}
        <section style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Synthèse visibilité</div>
          <div style={{ fontSize: '0.88rem', color: theme.text.secondary }}>
            Nœuds accessibles / masqués (conditions) : {counts.nodesAccessible} /{' '}
            {counts.nodesMasked}
          </div>
          <div style={{ fontSize: '0.88rem', color: theme.text.secondary }}>
            Choix accessibles / masqués : {counts.choicesAccessible} / {counts.choicesMasked}
          </div>
        </section>

        <section style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>État initial simulé</div>
          {sortedFlagIds.length === 0 && reputationKeys.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: theme.text.secondary }}>
              Aucun flag ou réputation référencé dans ce dialogue.
            </div>
          ) : null}
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
              const checked = Boolean(raw)
              return (
                <label
                  key={fid}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginBottom: 8,
                    fontSize: '0.88rem',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setVisibilityEvalFlag(fid, e.target.checked)}
                  />
                  <span>{fid}</span>
                </label>
              )
            }
            if (binding?.type === 'compteur' || sem === 'compteur') {
              const n = typeof raw === 'number' ? raw : Number(raw ?? 0)
              return (
                <label
                  key={fid}
                  style={{ display: 'block', marginBottom: 8, fontSize: '0.88rem' }}
                >
                  <div>{fid} (compteur)</div>
                  <input
                    type="number"
                    value={Number.isNaN(n) ? 0 : n}
                    onChange={(e) => {
                      const nv = clampCounter(Number(e.target.value), meta)
                      setVisibilityEvalFlag(fid, nv)
                    }}
                    style={{ width: '100%', marginTop: 4 }}
                  />
                </label>
              )
            }
            if ((binding?.type === 'enum' || sem === 'enum') && meta?.enumValues?.length) {
              const s = raw === undefined ? '' : String(raw)
              return (
                <label
                  key={fid}
                  style={{ display: 'block', marginBottom: 8, fontSize: '0.88rem' }}
                >
                  <div>{fid}</div>
                  <select
                    value={s}
                    onChange={(e) => setVisibilityEvalFlag(fid, e.target.value)}
                    style={{ width: '100%', marginTop: 4 }}
                  >
                    {meta.enumValues.map((ev) => (
                      <option key={ev} value={ev}>
                        {ev}
                      </option>
                    ))}
                  </select>
                </label>
              )
            }
            return (
              <label
                key={fid}
                style={{ display: 'block', marginBottom: 8, fontSize: '0.88rem' }}
              >
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
              <label
                key={key}
                style={{ display: 'block', marginBottom: 8, fontSize: '0.88rem' }}
              >
                <div>
                  Réputation {axisId} × {factionId}
                </div>
                <input
                  type="number"
                  value={cur}
                  onChange={(e) => {
                    const raw = Number(e.target.value)
                    const fallback = visibilityEvalState.reputation[key] ?? 0
                    const next = Number.isFinite(raw) ? raw : fallback
                    setVisibilityEvalReputation(axisId, factionId, next)
                  }}
                  style={{ width: '100%', marginTop: 4 }}
                />
              </label>
            )
          })}
        </section>

        <section style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Stats systèmes simulées</div>
          {usesEffort ? (
            <label style={{ display: 'block', marginBottom: 8, fontSize: '0.88rem' }}>
              <div>Pool Effort disponible (PE)</div>
              <input
                type="number"
                value={previewGameSystemsState.effortPool}
                onChange={(e) => setPreviewEffortPool(Number(e.target.value))}
                style={{ width: '100%', marginTop: 4 }}
              />
            </label>
          ) : null}
          {skillAttributeIds.map((attributeId) => (
            <label
              key={attributeId}
              style={{ display: 'block', marginBottom: 8, fontSize: '0.88rem' }}
            >
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
          {!usesEffort && skillAttributeIds.length === 0 && skillIds.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: theme.text.secondary }}>
              Aucun test de caractéristique ou coût d'Effort détecté.
            </div>
          ) : null}
          {simulationLimits.length > 0 ? (
            <div
              role="status"
              style={{
                marginTop: 10,
                padding: '8px 10px',
                borderRadius: 6,
                fontSize: '0.82rem',
                backgroundColor: theme.state.warning?.background ?? 'rgba(241, 196, 15, 0.15)',
                border: `1px solid ${theme.border.primary}`,
                color: theme.text.primary,
              }}
            >
              {simulationLimits.join(' ')}
            </div>
          ) : null}
        </section>

        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontWeight: 600 }}>Historique des effets</span>
            <button
              type="button"
              onClick={() => clearPreviewEffectHistory()}
              style={{
                fontSize: '0.78rem',
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >
              Effacer
            </button>
          </div>
          {previewEffectHistory.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: theme.text.secondary }}>
              Sélectionnez un choix avec effets sur le graphe (mode preview).
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
