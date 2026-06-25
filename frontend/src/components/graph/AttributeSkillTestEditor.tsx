/**
 * Éditeur en trois champs pour un test d'attribut Unity (Attribut+Compétence:DD).
 */
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import { theme } from '../../theme'
import { mechanicalFormClass } from '../../theme/fieldTokens'
import { FuzzyPickerInput } from '../shared/FuzzyPickerInput'
import { InlineFieldError, fieldErrorBorder } from '../shared/InlineFieldError'
import { useSkillCheckCatalog } from '../../hooks/useSkillCheckCatalog'
import {
  formatAttributeSkillTest,
  localAttributeSkillTestFieldError,
  parseAttributeSkillTest,
  resolveCatalogToken,
  type AttributeSkillTestField,
} from '../../utils/attributeSkillTest'

export interface AttributeSkillTestEditorProps {
  value: string | undefined
  onChange: (test: string | undefined) => void
  /** Message d'erreur API mappé sur choices.N.test ou test */
  apiErrorMessage?: string
  onClearApiError?: () => void
  /** Clé stable pour focus après validation save (nodeId::field). */
  validationFieldKey?: string
  /** Focus automatique sur le premier sous-champ en erreur. */
  autoFocus?: boolean
  disabled?: boolean
}

const dcInputStyle = (hasError: boolean): CSSProperties => ({
  border: `1px solid ${fieldErrorBorder(hasError, theme.border.primary)}`,
  backgroundColor: theme.background.tertiary,
  color: theme.text.primary,
})

const sublabelStyle: CSSProperties = {
  color: theme.text.secondary,
}

export const AttributeSkillTestEditor = memo(function AttributeSkillTestEditor({
  value,
  onChange,
  apiErrorMessage,
  onClearApiError,
  validationFieldKey,
  autoFocus = false,
  disabled = false,
}: AttributeSkillTestEditorProps) {
  const baseId = useId()
  const { attributes: attributeOptions, skills: skillOptions } = useSkillCheckCatalog()
  const attributeRef = useRef<HTMLInputElement>(null)
  const skillRef = useRef<HTMLInputElement>(null)
  const dcRef = useRef<HTMLInputElement>(null)
  const parsed = useMemo(() => parseAttributeSkillTest(value), [value])
  const [parts, setParts] = useState(parsed)

  useEffect(() => {
    setParts(parsed)
  }, [parsed])

  const fieldErrors = useMemo(
    () => ({
      attribute: localAttributeSkillTestFieldError('attribute', parts.attribute),
      skill: localAttributeSkillTestFieldError('skill', parts.skill),
      dc: localAttributeSkillTestFieldError('dc', parts.dc),
    }),
    [parts],
  )

  const apiFieldHint = useMemo((): Partial<Record<AttributeSkillTestField, string>> => {
    if (!apiErrorMessage) return {}
    const lower = apiErrorMessage.toLowerCase()
    if (lower.includes('espace')) {
      if (parts.skill.includes(' ')) {
        return { skill: 'Choisissez un identifiant sans espace (liste ci-dessous).' }
      }
      if (parts.attribute.includes(' ')) {
        return { attribute: 'Choisissez une caractéristique sans espace.' }
      }
      return { skill: 'Choisissez un identifiant sans espace (liste ci-dessous).' }
    }
    if (lower.includes('dd') || lower.includes('nombre')) {
      return { dc: 'Le DD doit être un nombre entier.' }
    }
    return { attribute: 'Vérifiez caractéristique, compétence et DD.' }
  }, [apiErrorMessage, parts.attribute, parts.skill])

  const showError = (field: AttributeSkillTestField): string | undefined =>
    fieldErrors[field] ?? apiFieldHint[field]

  const hasFieldError = (field: AttributeSkillTestField): boolean => Boolean(showError(field))

  const commitParts = useCallback(
    (next: typeof parts) => {
      setParts(next)
      onChange(formatAttributeSkillTest(next))
      onClearApiError?.()
    },
    [onChange, onClearApiError],
  )

  const updatePart = useCallback(
    (field: AttributeSkillTestField, nextValue: string) => {
      commitParts({ ...parts, [field]: nextValue })
    },
    [parts, commitParts],
  )

  const normalizePart = useCallback(
    (field: 'attribute' | 'skill') => {
      const options = field === 'attribute' ? attributeOptions : skillOptions
      const current = field === 'attribute' ? parts.attribute : parts.skill
      const resolved = resolveCatalogToken(current, options)
      if (resolved === current) {
        return
      }
      commitParts({ ...parts, [field]: resolved })
    },
    [attributeOptions, skillOptions, parts, commitParts],
  )

  useEffect(() => {
    if (!autoFocus) return
    if (fieldErrors.attribute || apiFieldHint.attribute) {
      attributeRef.current?.focus()
      attributeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      return
    }
    if (fieldErrors.skill || apiFieldHint.skill || apiErrorMessage) {
      skillRef.current?.focus()
      skillRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
      return
    }
    if (fieldErrors.dc || apiFieldHint.dc) {
      dcRef.current?.focus()
      dcRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [
    autoFocus,
    apiErrorMessage,
    fieldErrors.attribute,
    fieldErrors.skill,
    fieldErrors.dc,
    apiFieldHint.attribute,
    apiFieldHint.skill,
    apiFieldHint.dc,
  ])

  const dataValidationField = validationFieldKey
    ? { 'data-validation-field': validationFieldKey }
    : {}

  return (
    <div {...dataValidationField}>
      <div className={mechanicalFormClass.testGrid}>
        <label
          htmlFor={`${baseId}-attribute`}
          className={mechanicalFormClass.sublabel}
          style={{ ...sublabelStyle, gridColumn: 1, gridRow: 1 }}
        >
          Caractéristique
        </label>
        <label
          htmlFor={`${baseId}-skill`}
          className={mechanicalFormClass.sublabel}
          style={{ ...sublabelStyle, gridColumn: 2, gridRow: 1 }}
        >
          Compétence
        </label>
        <label
          htmlFor={`${baseId}-dc`}
          className={mechanicalFormClass.sublabel}
          style={{ ...sublabelStyle, gridColumn: 3, gridRow: 1 }}
        >
          DD
        </label>

        <div style={{ gridColumn: 1, gridRow: 2 }} onBlur={() => normalizePart('attribute')}>
          <FuzzyPickerInput
            inputRef={attributeRef}
            id={`${baseId}-attribute`}
            value={parts.attribute}
            options={attributeOptions}
            disabled={disabled}
            placeholder="Intelligence"
            hasError={hasFieldError('attribute')}
            onChange={(next) => updatePart('attribute', next)}
          />
        </div>
        <div style={{ gridColumn: 2, gridRow: 2 }} onBlur={() => normalizePart('skill')}>
          <FuzzyPickerInput
            inputRef={skillRef}
            id={`${baseId}-skill`}
            value={parts.skill}
            options={skillOptions}
            disabled={disabled}
            placeholder="Rhétorique"
            hasError={hasFieldError('skill')}
            onChange={(next) => updatePart('skill', next)}
          />
        </div>
        <input
          ref={dcRef}
          id={`${baseId}-dc`}
          className={mechanicalFormClass.input}
          type="text"
          inputMode="numeric"
          value={parts.dc}
          disabled={disabled}
          placeholder="8"
          aria-invalid={hasFieldError('dc')}
          onChange={(e) => updatePart('dc', e.target.value.replace(/[^\d]/g, ''))}
          style={{ ...dcInputStyle(hasFieldError('dc')), gridColumn: 3, gridRow: 2 }}
        />

        <div style={{ gridColumn: 1, gridRow: 3 }}>
          <InlineFieldError message={showError('attribute')} />
        </div>
        <div style={{ gridColumn: 2, gridRow: 3 }}>
          <InlineFieldError message={showError('skill')} />
        </div>
        <div style={{ gridColumn: 3, gridRow: 3 }}>
          <InlineFieldError message={showError('dc')} />
        </div>
      </div>
    </div>
  )
})
