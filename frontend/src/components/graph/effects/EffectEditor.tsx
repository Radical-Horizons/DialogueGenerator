/**
 * Liste ordonnée d'effets catalogue sur un choix (Story 9.3).
 */
import { memo, useEffect, useMemo, useState } from 'react'
import { useFieldArray, useFormContext } from 'react-hook-form'
import * as flagsAPI from '../../../api/flags'
import { theme } from '../../../theme'
import type { DialogueNodeData } from '../../../schemas/nodeEditorSchema'
import type { ChoiceEffect } from '../../../types/choiceEffects'
import type { FlagDefinition } from '../../../types/flags'
import {
  applyChoiceEffectsToEvalState,
  formatChoiceEffectsSummary,
} from '../../../utils/choiceEffects'
import { useGraphViewStore } from '../../../store/graphViewStore'

export interface EffectEditorProps {
  choiceIndex: number
}

function defaultEffect(kind: ChoiceEffect['kind']): ChoiceEffect {
  switch (kind) {
    case 'set_bool':
      return { kind: 'set_bool', flagId: '', value: true }
    case 'adjust_counter':
      return { kind: 'adjust_counter', flagId: '', operator: '=', value: 0 }
    case 'set_enum':
      return { kind: 'set_enum', flagId: '', value: '' }
    case 'reputation_delta':
      return { kind: 'reputation_delta', axisId: 'Prestige', factionId: '', delta: 0 }
    default:
      return { kind: 'set_bool', flagId: '', value: true }
  }
}

export const EffectEditor = memo(function EffectEditor({ choiceIndex }: EffectEditorProps) {
  const { control, watch } = useFormContext<DialogueNodeData>()
  const base = `choices.${choiceIndex}.choiceEffects` as const

  const { fields, append, remove, move, update } = useFieldArray({
    control,
    name: base,
  })

  const watchEffects = watch(base) as ChoiceEffect[] | undefined
  const summary = useMemo(() => formatChoiceEffectsSummary(watchEffects), [watchEffects])

  const [catalogById, setCatalogById] = useState<Record<string, FlagDefinition>>({})
  useEffect(() => {
    let c = false
    flagsAPI
      .listFlags()
      .then((res) => {
        if (c) return
        const idx: Record<string, FlagDefinition> = {}
        res.flags.forEach((f) => {
          idx[f.id] = f
        })
        setCatalogById(idx)
      })
      .catch((err: unknown) => {
        console.warn('[EffectEditor] listFlags failed', err)
      })
    return () => {
      c = true
    }
  }, [])

  const visibilityEvalState = useGraphViewStore((s) => s.visibilityEvalState)
  const applySimulation = useGraphViewStore((s) => s.applyChoiceEffectsSimulation)

  const simHint = useMemo(() => {
    if (!watchEffects?.length) return null
    const next = applyChoiceEffectsToEvalState(visibilityEvalState, watchEffects, catalogById)
    const dirty =
      JSON.stringify(next.flags) !== JSON.stringify(visibilityEvalState.flags) ||
      JSON.stringify(next.reputation) !== JSON.stringify(visibilityEvalState.reputation)
    return dirty ? 'Les effets modifieraient l’état simulé actuel.' : null
  }, [watchEffects, visibilityEvalState, catalogById])

  return (
    <div
      style={{
        marginTop: '0.75rem',
        padding: '0.75rem',
        backgroundColor: theme.background.secondary,
        borderRadius: 6,
        border: `1px solid ${theme.border.primary}`,
      }}
      data-testid={`effect-editor-${choiceIndex}`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h5 style={{ margin: 0, fontSize: '0.85rem', color: theme.text.primary }}>Effets déclenchés</h5>
        <select
          aria-label="Ajouter un effet"
          defaultValue=""
          onChange={(e) => {
            const k = e.target.value as ChoiceEffect['kind'] | ''
            e.target.value = ''
            if (!k) return
            append(defaultEffect(k))
          }}
          style={{
            fontSize: '0.75rem',
            padding: '0.25rem 0.35rem',
            borderRadius: 4,
            border: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.tertiary,
            color: theme.text.primary,
          }}
        >
          <option value="">+ Ajouter…</option>
          <option value="set_bool">Bool catalogue</option>
          <option value="adjust_counter">Compteur (= / += / -=)</option>
          <option value="set_enum">Enum (valeur cible)</option>
          <option value="reputation_delta">Réputation (delta)</option>
        </select>
      </div>
      {summary ? (
        <div
          style={{ marginTop: 6, fontSize: '0.72rem', color: theme.text.secondary }}
          title={summary}
        >
          Aperçu : {summary}
        </div>
      ) : null}

      <ul style={{ listStyle: 'none', padding: 0, margin: '0.5rem 0 0' }}>
        {fields.map((field, idx) => {
          const eff = watchEffects?.[idx]
          const kind = eff?.kind
          return (
            <li
              key={field.id}
              style={{
                marginBottom: 8,
                padding: 8,
                borderRadius: 4,
                border: `1px solid ${theme.border.primary}`,
                backgroundColor: theme.background.tertiary,
              }}
            >
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: theme.text.secondary }}>{kind}</span>
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => move(idx, idx - 1)}
                  style={{ fontSize: '0.65rem' }}
                >
                  Haut
                </button>
                <button
                  type="button"
                  disabled={idx >= fields.length - 1}
                  onClick={() => move(idx, idx + 1)}
                  style={{ fontSize: '0.65rem' }}
                >
                  Bas
                </button>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  style={{ fontSize: '0.65rem', color: '#c0392b' }}
                >
                  Retirer
                </button>
              </div>
              {kind === 'set_bool' && eff.kind === 'set_bool' && (
                <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select
                    value={eff.flagId}
                    onChange={(e) =>
                      update(idx, { ...eff, flagId: e.target.value })
                    }
                    style={{ flex: '1 1 140px', minWidth: 120 }}
                  >
                    <option value="">— flag —</option>
                    {Object.values(catalogById)
                      .filter((f) => f.semanticType === 'bool')
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.id}
                        </option>
                      ))}
                  </select>
                  <label style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="checkbox"
                      checked={eff.value}
                      onChange={(e) => update(idx, { ...eff, value: e.target.checked })}
                    />
                    valeur
                  </label>
                </div>
              )}
              {kind === 'adjust_counter' && eff.kind === 'adjust_counter' && (
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <select
                    value={eff.flagId}
                    onChange={(e) => update(idx, { ...eff, flagId: e.target.value })}
                    style={{ flex: '1 1 140px', minWidth: 120 }}
                  >
                    <option value="">— compteur —</option>
                    {Object.values(catalogById)
                      .filter((f) => f.semanticType === 'compteur')
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.id}
                        </option>
                      ))}
                  </select>
                  <select
                    value={eff.operator}
                    onChange={(e) =>
                      update(idx, {
                        ...eff,
                        operator: e.target.value as ChoiceEffect & { kind: 'adjust_counter' }['operator'],
                      })
                    }
                  >
                    <option value="=">{'='}</option>
                    <option value="+=">{'+='}</option>
                    <option value="-=">{'-='}</option>
                  </select>
                  <input
                    type="number"
                    value={eff.value}
                    onChange={(e) =>
                      update(idx, { ...eff, value: parseFloat(e.target.value) || 0 })
                    }
                    style={{ width: 72 }}
                  />
                </div>
              )}
              {kind === 'set_enum' && eff.kind === 'set_enum' && (
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <select
                    value={eff.flagId}
                    onChange={(e) => {
                      const fid = e.target.value
                      const meta = catalogById[fid]
                      const first = meta?.enumValues?.[0] ?? ''
                      update(idx, { kind: 'set_enum', flagId: fid, value: first })
                    }}
                    style={{ flex: '1 1 140px', minWidth: 120 }}
                  >
                    <option value="">— enum —</option>
                    {Object.values(catalogById)
                      .filter((f) => f.semanticType === 'enum')
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.id}
                        </option>
                      ))}
                  </select>
                  <select
                    value={eff.value}
                    onChange={(e) => update(idx, { ...eff, value: e.target.value })}
                  >
                    {catalogById[eff.flagId]?.enumValues?.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {kind === 'reputation_delta' && eff.kind === 'reputation_delta' && (
                <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <input
                    placeholder="axe"
                    value={eff.axisId}
                    onChange={(e) => update(idx, { ...eff, axisId: e.target.value })}
                    style={{ flex: '1 1 80px' }}
                  />
                  <input
                    placeholder="faction"
                    value={eff.factionId}
                    onChange={(e) => update(idx, { ...eff, factionId: e.target.value })}
                    style={{ flex: '1 1 80px' }}
                  />
                  <input
                    type="number"
                    value={eff.delta}
                    onChange={(e) =>
                      update(idx, { ...eff, delta: parseFloat(e.target.value) || 0 })
                    }
                    style={{ width: 72 }}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {fields.length > 0 ? (
        <>
          <button
            type="button"
            onClick={() => {
              if (watchEffects?.length) applySimulation(watchEffects, catalogById)
            }}
            style={{
              marginTop: 6,
              fontSize: '0.72rem',
              padding: '0.35rem 0.5rem',
              borderRadius: 4,
              border: `1px solid ${theme.border.primary}`,
              backgroundColor: theme.button.default.background,
              cursor: 'pointer',
            }}
          >
            Appliquer à la simulation (état flags / réputation)
          </button>
          {simHint ? (
            <div style={{ marginTop: 4, fontSize: '0.65rem', color: theme.text.secondary }}>
              {simHint}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
})
