/**
 * Éditeur « Conditions de visibilité » (Story 9.2) — nœud ou choix, hors NodeEditorPanel.
 */
import { memo, useEffect, useMemo, useState } from 'react'
import { useFieldArray, useFormContext, Controller } from 'react-hook-form'
import * as flagsAPI from '../../../api/flags'
import { theme } from '../../../theme'
import type { DialogueNodeData } from '../../../schemas/nodeEditorSchema'
import type { ConditionAtom } from '../../../types/visibilityConditions'
import type { FlagDefinition } from '../../../types/flags'
import {
  formatVisibilityConditionsSummary,
  evaluateVisibilityConditions,
} from '../../../utils/visibilityConditions'
import { useGraphViewStore } from '../../../store/graphViewStore'

type Variant = 'node' | 'choice'

export interface ConditionEditorProps {
  variant: Variant
  /** Index du choix si variant === 'choice' */
  choiceIndex?: number
}

function defaultAtom(kind: ConditionAtom['kind']): ConditionAtom {
  switch (kind) {
    case 'flag_bool':
      return { kind: 'flag_bool', flagId: '', equals: true }
    case 'flag_counter':
      return { kind: 'flag_counter', flagId: '', operator: '>=', value: 0 }
    case 'flag_enum':
      return { kind: 'flag_enum', flagId: '', operator: '=', value: '' }
    case 'reputation':
      return {
        kind: 'reputation',
        axisId: 'Prestige',
        factionId: '',
        operator: '>=',
        threshold: 0,
      }
    default:
      return { kind: 'flag_bool', flagId: '', equals: true }
  }
}

export const ConditionEditor = memo(function ConditionEditor({
  variant,
  choiceIndex = 0,
}: ConditionEditorProps) {
  const { control, watch, setValue, getValues } = useFormContext<DialogueNodeData>()
  const fieldName =
    variant === 'node'
      ? 'visibilityConditions.items'
      : (`choices.${choiceIndex}.visibilityConditions.items` as const)

  const { fields, append, remove } = useFieldArray({
    control,
    name: fieldName as 'visibilityConditions.items',
  })

  const combinatorPath =
    variant === 'node'
      ? 'visibilityConditions.combinator'
      : (`choices.${choiceIndex}.visibilityConditions.combinator` as const)

  const blockPath =
    variant === 'node'
      ? 'visibilityConditions'
      : (`choices.${choiceIndex}.visibilityConditions` as const)

  const watchBlock = watch(blockPath as 'visibilityConditions')
  const summary = useMemo(
    () => formatVisibilityConditionsSummary(watchBlock),
    [watchBlock],
  )

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
      .catch(() => {})
    return () => {
      c = true
    }
  }, [])

  const visibilityEvalState = useGraphViewStore((s) => s.visibilityEvalState)
  const setVisibilityEvalFlag = useGraphViewStore((s) => s.setVisibilityEvalFlag)
  const setVisibilityEvalReputation = useGraphViewStore((s) => s.setVisibilityEvalReputation)
  const clearVisibilityEvalState = useGraphViewStore((s) => s.clearVisibilityEvalState)

  const simPreview = useMemo(() => {
    const hasKeys =
      Object.keys(visibilityEvalState.flags).length > 0 ||
      Object.keys(visibilityEvalState.reputation).length > 0
    if (!hasKeys || !watchBlock?.items?.length) return null
    const { satisfied } = evaluateVisibilityConditions(watchBlock, visibilityEvalState)
    return satisfied ? 'ok' : 'fail'
  }, [visibilityEvalState, watchBlock])

  const flagIdsUsed = useMemo(() => {
    const ids = new Set<string>()
    const items = watchBlock?.items || []
    for (const it of items as ConditionAtom[]) {
      if (!it) continue
      if ('flagId' in it && it.flagId) ids.add(it.flagId)
    }
    return [...ids]
  }, [watchBlock])

  const reputationKeys = useMemo(() => {
    const keys: { axisId: string; factionId: string }[] = []
    const items = watchBlock?.items || []
    for (const it of items as ConditionAtom[]) {
      if (it?.kind === 'reputation') {
        keys.push({ axisId: it.axisId, factionId: it.factionId })
      }
    }
    return keys
  }, [watchBlock])

  return (
    <div
      style={{
        padding: '0.75rem',
        backgroundColor: theme.background.secondary,
        borderRadius: 6,
        border: `1px solid ${theme.border.primary}`,
        marginBottom: '0.75rem',
      }}
      data-testid={variant === 'node' ? 'condition-editor-node' : `condition-editor-choice-${choiceIndex}`}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h4 style={{ margin: 0, fontSize: '0.85rem', color: theme.text.primary }}>
          Conditions {variant === 'choice' ? `(choix #${choiceIndex + 1})` : '(nœud)'}
        </h4>
        <button
          type="button"
          onClick={() => {
            const cur = getValues(blockPath as 'visibilityConditions')
            if (!cur?.items?.length) {
              setValue(blockPath as 'visibilityConditions', {
                combinator: 'AND',
                items: [defaultAtom('flag_bool')],
              })
            } else {
              append(defaultAtom('flag_bool'))
            }
          }}
          style={{
            padding: '0.25rem 0.5rem',
            fontSize: '0.75rem',
            cursor: 'pointer',
            borderRadius: 4,
            border: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.button.default.background,
            color: theme.button.default.color,
          }}
        >
          + Condition
        </button>
      </div>
      <p style={{ margin: '0.35rem 0', fontSize: '0.72rem', color: theme.text.secondary }}>
        Distinct du panneau « Variables et flags » dialogue : portée sur la visibilité de ce nœud ou choix.
      </p>

      {!watchBlock?.items?.length ? (
        <div style={{ fontSize: '0.8rem', color: theme.text.secondary, marginTop: 8 }}>
          Aucune condition structurée. Ajoutez-en pour contraindre l’affichage en jeu.
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 8 }}>
            <label style={{ fontSize: '0.75rem', color: theme.text.secondary }}>Combiner avec</label>
            <Controller
              name={combinatorPath as 'visibilityConditions.combinator'}
              control={control}
              render={({ field }) => (
                <select
                  {...field}
                  style={{
                    marginLeft: 8,
                    padding: '0.25rem',
                    backgroundColor: theme.background.tertiary,
                    color: theme.text.primary,
                    borderRadius: 4,
                  }}
                >
                  <option value="AND">ET (AND)</option>
                  <option value="OR">OU (OR)</option>
                </select>
              )}
            />
          </div>

          {fields.map((field, index) => (
            <ConditionRow
              key={field.id}
              index={index}
              fieldName={fieldName}
              catalogById={catalogById}
              onRemove={() => {
                remove(index)
                const b = getValues(blockPath as 'visibilityConditions')
                if (b?.items?.length === 0) {
                  setValue(blockPath as 'visibilityConditions', undefined)
                }
              }}
            />
          ))}

          {summary ? (
            <div
              style={{
                marginTop: 8,
                fontSize: '0.75rem',
                color: theme.text.secondary,
                fontStyle: 'italic',
              }}
              title={summary}
            >
              Résumé : {summary.length > 120 ? `${summary.slice(0, 117)}…` : summary}
            </div>
          ) : null}
        </>
      )}

      {/* Simulation minimale (Story 9.2 AC7) */}
      <div style={{ marginTop: 12, paddingTop: 8, borderTop: `1px dashed ${theme.border.primary}` }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: theme.text.primary, marginBottom: 6 }}>
          Simulation (aperçu)
        </div>
        {simPreview === 'fail' && (
          <div role="status" style={{ fontSize: '0.72rem', color: theme.state.warning.color, marginBottom: 6 }}>
            Conditions non satisfaites avec l’état ci-dessous (grisé sur le graphe si valeurs renseignées).
          </div>
        )}
        {flagIdsUsed.map((fid) => (
          <div key={fid} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <label style={{ fontSize: '0.72rem', width: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {fid}
            </label>
            <input
              aria-label={`Simulation flag ${fid}`}
              placeholder="true / false / nombre / enum"
              style={{
                flex: 1,
                padding: '0.2rem 0.35rem',
                fontSize: '0.75rem',
                backgroundColor: theme.background.tertiary,
                color: theme.text.primary,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: 4,
              }}
              onChange={(e) => {
                const raw = e.target.value.trim()
                if (raw === 'true') setVisibilityEvalFlag(fid, true)
                else if (raw === 'false') setVisibilityEvalFlag(fid, false)
                else if (raw !== '' && !Number.isNaN(Number(raw))) setVisibilityEvalFlag(fid, Number(raw))
                else if (raw !== '') setVisibilityEvalFlag(fid, raw)
              }}
            />
          </div>
        ))}
        {reputationKeys.map((rk, i) => (
          <div key={`${rk.axisId}-${rk.factionId}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: '0.72rem' }}>
              Réputation {rk.axisId}/{rk.factionId}
            </span>
            <input
              aria-label={`Simulation réputation ${rk.axisId}`}
              type="number"
              style={{
                width: 80,
                padding: '0.2rem',
                fontSize: '0.75rem',
                backgroundColor: theme.background.tertiary,
                color: theme.text.primary,
                border: `1px solid ${theme.border.primary}`,
                borderRadius: 4,
              }}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (!Number.isNaN(v)) setVisibilityEvalReputation(rk.axisId, rk.factionId, v)
              }}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => clearVisibilityEvalState()}
          style={{
            marginTop: 6,
            fontSize: '0.7rem',
            padding: '0.2rem 0.45rem',
            cursor: 'pointer',
            borderRadius: 4,
            border: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.panel,
            color: theme.text.secondary,
          }}
        >
          Réinitialiser simulation
        </button>
      </div>
    </div>
  )
})

const OPS = ['=', '!=', '>=', '<=', '>', '<'] as const

const ConditionRow = memo(function ConditionRow({
  index,
  fieldName,
  catalogById,
  onRemove,
}: {
  index: number
  fieldName: string
  catalogById: Record<string, FlagDefinition>
  onRemove: () => void
}) {
  const { watch, setValue } = useFormContext<DialogueNodeData>()
  const base = `${fieldName}.${index}` as const
  const atom = watch(base as never) as ConditionAtom | undefined
  const kind = atom?.kind ?? 'flag_bool'

  return (
    <div
      style={{
        padding: '0.5rem',
        marginBottom: 8,
        backgroundColor: theme.background.panel,
        borderRadius: 4,
        border: `1px solid ${theme.border.secondary}`,
      }}
    >
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        <select
          value={kind}
          onChange={(e) => {
            const k = e.target.value as ConditionAtom['kind']
            setValue(base as never, defaultAtom(k) as never)
          }}
          style={{ fontSize: '0.75rem', padding: '0.2rem', flex: '0 0 auto' }}
        >
          <option value="flag_bool">Flag bool</option>
          <option value="flag_counter">Flag compteur</option>
          <option value="flag_enum">Flag enum</option>
          <option value="reputation">Réputation</option>
        </select>
        <button type="button" onClick={onRemove} style={{ marginLeft: 'auto', fontSize: '0.7rem' }}>
          Retirer
        </button>
      </div>

      {kind === 'flag_bool' && (
        <>
          <input
            placeholder="flagId (catalogue)"
            value={(atom as { flagId?: string })?.flagId ?? ''}
            onChange={(e) =>
              setValue(`${base}.flagId` as never, e.target.value as never)
            }
            style={{ width: '100%', marginBottom: 4, fontSize: '0.75rem', padding: 4 }}
            list={`flag-datalist-${index}`}
          />
          <datalist id={`flag-datalist-${index}`}>
            {Object.keys(catalogById).map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
          <label style={{ fontSize: '0.72rem' }}>
            <input
              type="checkbox"
              checked={Boolean((atom as { equals?: boolean })?.equals)}
              onChange={(e) => setValue(`${base}.equals` as never, e.target.checked as never)}
            />{' '}
            doit être true
          </label>
        </>
      )}

      {kind === 'flag_counter' && (
        <>
          <input
            placeholder="flagId"
            value={(atom as { flagId?: string })?.flagId ?? ''}
            onChange={(e) => setValue(`${base}.flagId` as never, e.target.value as never)}
            style={{ width: '100%', marginBottom: 4, fontSize: '0.75rem', padding: 4 }}
            list={`flag-datalist-c-${index}`}
          />
          <datalist id={`flag-datalist-c-${index}`}>
            {Object.keys(catalogById).map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <select
              value={(atom as { operator?: string })?.operator ?? '>='}
              onChange={(e) => setValue(`${base}.operator` as never, e.target.value as never)}
            >
              {OPS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={(atom as { value?: number })?.value ?? 0}
              onChange={(e) => setValue(`${base}.value` as never, Number(e.target.value) as never)}
              style={{ width: 80, fontSize: '0.75rem' }}
            />
          </div>
        </>
      )}

      {kind === 'flag_enum' && (
        <>
          <input
            placeholder="flagId"
            value={(atom as { flagId?: string })?.flagId ?? ''}
            onChange={(e) => setValue(`${base}.flagId` as never, e.target.value as never)}
            style={{ width: '100%', marginBottom: 4, fontSize: '0.75rem', padding: 4 }}
            list={`flag-datalist-e-${index}`}
          />
          <datalist id={`flag-datalist-e-${index}`}>
            {Object.keys(catalogById).map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
          <div style={{ display: 'flex', gap: 4 }}>
            <select
              value={(atom as { operator?: string })?.operator ?? '='}
              onChange={(e) => setValue(`${base}.operator` as never, e.target.value as never)}
            >
              <option value="=">=</option>
              <option value={'!='}>≠</option>
            </select>
            <EnumValueSelect
              flagId={(atom as { flagId?: string })?.flagId ?? ''}
              catalogById={catalogById}
              value={(atom as { value?: string })?.value ?? ''}
              onChange={(v) => setValue(`${base}.value` as never, v as never)}
            />
          </div>
        </>
      )}

      {kind === 'reputation' && (
        <div style={{ display: 'grid', gap: 4, fontSize: '0.75rem' }}>
          <input
            placeholder="axisId (ex. Prestige)"
            value={(atom as { axisId?: string })?.axisId ?? ''}
            onChange={(e) => setValue(`${base}.axisId` as never, e.target.value as never)}
          />
          <input
            placeholder="factionId"
            value={(atom as { factionId?: string })?.factionId ?? ''}
            onChange={(e) => setValue(`${base}.factionId` as never, e.target.value as never)}
          />
          <div style={{ display: 'flex', gap: 4 }}>
            <select
              value={(atom as { operator?: string })?.operator ?? '>='}
              onChange={(e) => setValue(`${base}.operator` as never, e.target.value as never)}
            >
              {OPS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={(atom as { threshold?: number })?.threshold ?? 0}
              onChange={(e) => setValue(`${base}.threshold` as never, Number(e.target.value) as never)}
            />
          </div>
        </div>
      )}
    </div>
  )
})

const EnumValueSelect = memo(function EnumValueSelect({
  flagId,
  catalogById,
  value,
  onChange,
}: {
  flagId: string
  catalogById: Record<string, FlagDefinition>
  value: string
  onChange: (v: string) => void
}) {
  const def = flagId ? catalogById[flagId] : undefined
  const options = def?.semanticType === 'enum' ? def.enumValues ?? [] : []
  if (options.length > 0) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ flex: 1, fontSize: '0.75rem' }}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    )
  }
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="valeur enum"
      style={{ flex: 1, fontSize: '0.75rem' }}
    />
  )
})
