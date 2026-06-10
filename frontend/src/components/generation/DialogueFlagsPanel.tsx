/**
 * Panneau « Variables et flags » du dialogue courant (Story 9.1 FR89).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import * as flagsAPI from '../../api/flags'
import { FLAG_SCOPE_FILTERS, FLAG_SEMANTIC_FILTERS } from '../../constants/flagCatalogSemantics'
import { useGraphStore } from '../../store/graphStore'
import { theme } from '../../theme'
import type { DialogueFlagBinding } from '../../types/dialogueFlags'
import type { FlagDefinition } from '../../types/flags'
import { computeDialogueFlagThresholdWarnings } from '../../utils/dialogueFlagThresholdWarnings'

function defaultInitialForFlag(def: FlagDefinition): boolean | number | string {
  const sem = def.semanticType
  if (sem === 'bool') {
    return Boolean(def.defaultValueParsed ?? false)
  }
  if (sem === 'compteur') {
    const v = def.defaultValueParsed
    if (typeof v === 'number') return v
    return 0
  }
  if (sem === 'enum') {
    const ev = def.enumValues
    if (ev && ev.length > 0) return ev[0]
    return String(def.defaultValueParsed ?? '')
  }
  return false
}

export function DialogueFlagsPanel() {
  const dialogueFlagBindings = useGraphStore((s) => s.dialogueFlagBindings)
  const upsertDialogueFlagBinding = useGraphStore((s) => s.upsertDialogueFlagBinding)
  const removeDialogueFlagBinding = useGraphStore((s) => s.removeDialogueFlagBinding)

  const [catalogById, setCatalogById] = useState<Record<string, FlagDefinition>>({})
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [semanticFilter, setSemanticFilter] = useState<string>('')
  const [scopeFilter, setScopeFilter] = useState<string>('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    let cancelled = false
    flagsAPI
      .listFlags()
      .then((res) => {
        if (cancelled) return
        const idx: Record<string, FlagDefinition> = {}
        res.flags.forEach((f) => {
          idx[f.id] = f
        })
        setCatalogById(idx)
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadErr(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filteredCatalog = useMemo(() => {
    let list = Object.values(catalogById)
    if (semanticFilter) {
      list = list.filter((f) => f.semanticType === semanticFilter)
    }
    if (scopeFilter) {
      list = list.filter((f) => (f.scope || '').toLowerCase() === scopeFilter.toLowerCase())
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(
        (f) =>
          f.id.toLowerCase().includes(q) ||
          f.label.toLowerCase().includes(q) ||
          (f.description || '').toLowerCase().includes(q) ||
          f.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    return list.sort((a, b) => a.label.localeCompare(b.label))
  }, [catalogById, semanticFilter, scopeFilter, query])

  const warnings = useMemo(
    () =>
      computeDialogueFlagThresholdWarnings(dialogueFlagBindings, Object.values(catalogById)),
    [dialogueFlagBindings, catalogById],
  )

  const addFlag = useCallback(
    (def: FlagDefinition) => {
      const sem = def.semanticType
      if (!sem || sem === 'unsupported') return
      upsertDialogueFlagBinding({
        flagId: def.id,
        type: sem as DialogueFlagBinding['type'],
        initialValue: defaultInitialForFlag(def),
      })
    },
    [upsertDialogueFlagBinding],
  )

  const bindingRows = useMemo(() => {
    return dialogueFlagBindings.map((b) => ({
      binding: b,
      def: catalogById[b.flagId],
    }))
  }, [dialogueFlagBindings, catalogById])

  return (
    <section style={{ marginBottom: '1rem' }} aria-label="Variables et flags du dialogue">
      <h3 style={{ color: theme.text.primary, fontSize: '1rem', marginBottom: '0.5rem' }}>
        Variables et flags
      </h3>
      <p style={{ color: theme.text.secondary, fontSize: '0.85rem', marginBottom: '0.75rem' }}>
        Catalogue filtrable — liaisons persistées avec le document dialogue.
      </p>
      {loadErr && (
        <div role="alert" style={{ color: theme.state.error.color, marginBottom: '0.5rem' }}>
          {loadErr}
        </div>
      )}
      {warnings.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginBottom: '0.75rem',
            padding: '0.5rem 0.75rem',
            borderRadius: 4,
            border: `1px solid ${theme.state.warning.border}`,
            backgroundColor: theme.state.warning.background,
            color: theme.text.primary,
            fontSize: '0.85rem',
          }}
        >
          {warnings.map((w) => (
            <div key={w}>{w}</div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <input
          type="search"
          placeholder="Recherche id, label, tags…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Recherche catalogue flags"
          style={{ flex: '1 1 160px', minWidth: 140, padding: '0.35rem 0.5rem' }}
        />
        <label style={{ color: theme.text.secondary, fontSize: '0.85rem' }}>
          Type{' '}
          <select
            value={semanticFilter}
            onChange={(e) => setSemanticFilter(e.target.value)}
            aria-label="Filtrer par type"
            style={{ marginLeft: '0.35rem' }}
          >
            <option value="">(tous)</option>
            {FLAG_SEMANTIC_FILTERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label style={{ color: theme.text.secondary, fontSize: '0.85rem' }}>
          Portée{' '}
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value)}
            aria-label="Filtrer par portée"
            style={{ marginLeft: '0.35rem' }}
          >
            <option value="">(toutes)</option>
            {FLAG_SCOPE_FILTERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div
        style={{
          maxHeight: 180,
          overflowY: 'auto',
          border: `1px solid ${theme.border.primary}`,
          borderRadius: 4,
          marginBottom: '0.75rem',
          fontSize: '0.85rem',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: theme.background.secondary }}>
              <th style={{ textAlign: 'left', padding: '0.35rem' }}>Flag</th>
              <th style={{ textAlign: 'left', padding: '0.35rem' }}>Type</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filteredCatalog.map((def) => (
              <tr key={def.id}>
                <td style={{ padding: '0.35rem' }}>
                  <strong>{def.label}</strong>
                  <div
                    style={{
                      color: theme.text.secondary,
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                    }}
                  >
                    {def.id}
                  </div>
                </td>
                <td style={{ padding: '0.35rem' }}>{def.semanticType ?? def.type}</td>
                <td style={{ padding: '0.35rem', textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => addFlag(def)}
                    disabled={!def.semanticType || def.semanticType === 'unsupported'}
                  >
                    Ajouter
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <h4 style={{ fontSize: '0.9rem', marginBottom: '0.35rem' }}>Liaisons du dialogue</h4>
        {bindingRows.length === 0 ? (
          <div style={{ color: theme.text.secondary, fontStyle: 'italic', fontSize: '0.85rem' }}>
            Aucune liaison. Ajoutez des flags depuis le catalogue ci-dessus.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {bindingRows.map(({ binding, def }) => (
              <li
                key={binding.flagId}
                style={{
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: 4,
                  padding: '0.5rem',
                  marginBottom: '0.35rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <span>
                    <strong>{def?.label ?? binding.flagId}</strong>{' '}
                    <span style={{ color: theme.text.secondary }}>({binding.type})</span>
                  </span>
                  <button type="button" onClick={() => removeDialogueFlagBinding(binding.flagId)}>
                    Retirer
                  </button>
                </div>
                {binding.type === 'bool' && (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      marginTop: '0.35rem',
                    }}
                  >
                    <span>Valeur initiale</span>
                    <input
                      type="checkbox"
                      checked={Boolean(binding.initialValue)}
                      onChange={(e) =>
                        upsertDialogueFlagBinding({
                          ...binding,
                          initialValue: e.target.checked,
                        })
                      }
                      aria-label={`Valeur initiale bool pour ${binding.flagId}`}
                    />
                  </label>
                )}
                {binding.type === 'compteur' && (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      marginTop: '0.35rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>Valeur initiale</span>
                    {def?.minValue != null && def?.maxValue != null && (
                      <span style={{ fontSize: '0.75rem', color: theme.text.secondary }}>
                        (bornes catalogue [{String(def.minValue)}, {String(def.maxValue)}])
                      </span>
                    )}
                    <input
                      type="number"
                      value={typeof binding.initialValue === 'number' ? binding.initialValue : 0}
                      min={def?.minValue != null ? Number(def.minValue) : undefined}
                      max={def?.maxValue != null ? Number(def.maxValue) : undefined}
                      onChange={(e) => {
                        const parsed = Number(e.target.value)
                        const fallback =
                          typeof binding.initialValue === 'number' && Number.isFinite(binding.initialValue)
                            ? binding.initialValue
                            : def?.minValue != null
                              ? Number(def.minValue)
                              : 0
                        const next = Number.isFinite(parsed) ? parsed : fallback
                        upsertDialogueFlagBinding({
                          ...binding,
                          initialValue: next,
                        })
                      }}
                      aria-label={`Valeur initiale compteur pour ${binding.flagId}`}
                    />
                  </label>
                )}
                {binding.type === 'enum' && def?.enumValues && def.enumValues.length > 0 && (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      marginTop: '0.35rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', color: theme.text.secondary }}>
                      Défaut catalogue :{' '}
                      <strong>{String(def.defaultValueParsed ?? def.defaultValue ?? '')}</strong>
                      {' · '}
                      Valeurs : {def.enumValues.join(' → ')}
                    </span>
                    <span>Valeur initiale</span>
                    <select
                      value={String(binding.initialValue)}
                      onChange={(e) =>
                        upsertDialogueFlagBinding({
                          ...binding,
                          initialValue: e.target.value,
                        })
                      }
                      aria-label={`Valeur enum pour ${binding.flagId}`}
                    >
                      {def.enumValues.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
