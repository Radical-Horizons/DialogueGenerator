/**
 * Éditeur structuré des exigences de traits pour un choix de dialogue.
 */
import { useEffect, useMemo, useState } from 'react'
import * as flagsAPI from '../../api/flags'
import { theme } from '../../theme'
import { mechanicalFormClass } from '../../theme/fieldTokens'
import type { FlagDefinition } from '../../types/flags'

export interface TraitRequirementValue {
  trait: string
  minValue: number
}

export interface TraitRequirementsEditorProps {
  value?: TraitRequirementValue[]
  onChange: (value: TraitRequirementValue[] | undefined) => void
  idPrefix: string
}

function optionLabel(flag: FlagDefinition): string {
  return flag.label?.trim() || flag.id
}

export function TraitRequirementsEditor({
  value,
  onChange,
  idPrefix,
}: TraitRequirementsEditorProps) {
  const [flags, setFlags] = useState<FlagDefinition[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    flagsAPI
      .listFlags()
      .then((response) => {
        if (cancelled) return
        setFlags(response.flags)
        setLoadError(null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setLoadError(error instanceof Error ? error.message : String(error))
      })

    return () => {
      cancelled = true
    }
  }, [])

  const options = useMemo(
    () =>
      flags
        .map(optionLabel)
        .filter((label, index, labels) => label.length > 0 && labels.indexOf(label) === index)
        .sort((a, b) => a.localeCompare(b)),
    [flags]
  )

  const rows = value ?? []
  const datalistId = `${idPrefix}-trait-options`

  const commitRows = (nextRows: TraitRequirementValue[]) => {
    onChange(nextRows.length > 0 ? nextRows : undefined)
  }

  const updateRow = (index: number, patch: Partial<TraitRequirementValue>) => {
    commitRows(
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    )
  }

  return (
    <div>
      <datalist id={datalistId}>
        {options.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>

      {rows.length === 0 && (
        <div style={{ marginBottom: '0.5rem', color: theme.text.secondary, fontSize: '0.8rem' }}>
          Aucun trait requis.
        </div>
      )}

      {rows.map((row, index) => (
        <div
          key={`${idPrefix}-${index}`}
          data-testid={`${idPrefix}-row-${index}`}
          className={mechanicalFormClass.traitRow}
        >
          <label
            htmlFor={`${idPrefix}-trait-${index}`}
            className={mechanicalFormClass.sublabel}
            style={{ gridColumn: 1, gridRow: 1, color: theme.text.secondary }}
          >
            Trait
          </label>
          <label
            htmlFor={`${idPrefix}-min-${index}`}
            className={mechanicalFormClass.sublabel}
            style={{ gridColumn: 2, gridRow: 1, color: theme.text.secondary }}
          >
            Minimum
          </label>
          <input
            id={`${idPrefix}-trait-${index}`}
            list={datalistId}
            className={mechanicalFormClass.input}
            value={row.trait}
            onChange={(event) => updateRow(index, { trait: event.target.value })}
            placeholder="Rechercher ou saisir un trait"
            style={{
              gridColumn: 1,
              gridRow: 2,
              border: `1px solid ${theme.border.primary}`,
              backgroundColor: theme.background.tertiary,
              color: theme.text.primary,
            }}
          />
          <input
            id={`${idPrefix}-min-${index}`}
            type="number"
            className={mechanicalFormClass.input}
            value={row.minValue}
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10)
              updateRow(index, { minValue: Number.isFinite(parsed) ? parsed : 0 })
            }}
            style={{
              gridColumn: 2,
              gridRow: 2,
              border: `1px solid ${theme.border.primary}`,
              backgroundColor: theme.background.tertiary,
              color: theme.text.primary,
            }}
          />
          <button
            type="button"
            className={mechanicalFormClass.btn}
            onClick={() => commitRows(rows.filter((_, rowIndex) => rowIndex !== index))}
            style={{
              gridColumn: 3,
              gridRow: 2,
              border: `1px solid ${theme.border.primary}`,
              backgroundColor: theme.background.secondary,
              color: theme.text.primary,
              cursor: 'pointer',
            }}
          >
            Retirer
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => commitRows([...rows, { trait: '', minValue: 0 }])}
        style={{
          padding: '0.4rem 0.65rem',
          border: `1px solid ${theme.border.primary}`,
          borderRadius: 4,
          backgroundColor: theme.button.default.background,
          color: theme.button.default.color,
          cursor: 'pointer',
          fontSize: '0.8rem',
        }}
      >
        Ajouter un trait requis
      </button>

      {loadError && (
        <div role="alert" style={{ marginTop: '0.5rem', color: theme.state.warning.color, fontSize: '0.75rem' }}>
          Catalogue indisponible, saisie libre active : {loadError}
        </div>
      )}
    </div>
  )
}
