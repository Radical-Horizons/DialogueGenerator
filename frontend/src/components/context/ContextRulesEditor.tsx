/**
 * Éditeur de règles de sélection de contexte (Story 3.4).
 * Affiche la liste des règles avec contrôles toggle/↑↓/supprimer,
 * et un formulaire de création de nouvelle règle.
 */
import { memo, useEffect, useState } from 'react'
import { useContextRulesStore } from '../../store/contextRulesStore'
import type { ContextRule, EntityTypeStr } from '../../types/api'
import { theme } from '../../theme'
import { remSize } from '../../theme/uiTypography'
import { StyledSelect } from '../shared/StyledSelect'

const ENTITY_TYPE_OPTIONS: { value: EntityTypeStr; label: string }[] = [
  { value: 'character', label: 'Personnage' },
  { value: 'location', label: 'Lieu' },
  { value: 'item', label: 'Objet' },
  { value: 'species', label: 'Espèce' },
  { value: 'community', label: 'Communauté' },
]

const DIALOGUE_TYPE_OPTIONS = [
  { value: 'salutation', label: 'Salutation' },
  { value: 'confrontation', label: 'Confrontation' },
  { value: 'revelation', label: 'Révélation' },
]

// ---------------------------------------------------------------------------
// RuleItem — sous-composant mémoïsé pour une seule règle (refactor Task 4)
// ---------------------------------------------------------------------------

interface RuleItemProps {
  rule: ContextRule
  isFirst: boolean
  isLast: boolean
  onToggle: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}

const RuleItem = memo(function RuleItem({
  rule,
  isFirst,
  isLast,
  onToggle,
  onMoveUp,
  onMoveDown,
  onDelete,
}: RuleItemProps) {
  return (
    <div
      data-testid="rule-item"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        padding: '0.4rem 0.5rem',
        borderBottom: `1px solid ${theme.border.primary}`,
      }}
    >
      <span style={{ flex: 1, color: theme.text.primary, fontSize: remSize('accent') }}>{rule.name}</span>
      <span
        style={{
          fontSize: remSize('caption'),
          color: theme.text.secondary,
          minWidth: '1.5rem',
          textAlign: 'right',
        }}
        title="Priorité d'évaluation"
      >
        #{rule.priority}
      </span>
      <span
        data-testid="rule-badge"
        style={{
          fontSize: remSize('caption'),
          padding: '1px 5px',
          borderRadius: 3,
          backgroundColor: rule.enabled ? '#2d6a4f' : theme.background.tertiary,
          color: rule.enabled ? '#fff' : theme.text.secondary,
        }}
      >
        {rule.enabled ? 'Actif' : 'Inactif'}
      </span>
      <button
        aria-label={`Activer/Désactiver ${rule.name}`}
        title={rule.enabled ? 'Désactiver' : 'Activer'}
        onClick={onToggle}
        style={iconBtnStyle}
      >
        {rule.enabled ? '●' : '○'}
      </button>
      <button
        aria-label={`Monter ${rule.name}`}
        title="Monter"
        onClick={onMoveUp}
        disabled={isFirst}
        style={{ ...iconBtnStyle, opacity: isFirst ? 0.3 : 1 }}
      >
        ↑
      </button>
      <button
        aria-label={`Descendre ${rule.name}`}
        title="Descendre"
        onClick={onMoveDown}
        disabled={isLast}
        style={{ ...iconBtnStyle, opacity: isLast ? 0.3 : 1 }}
      >
        ↓
      </button>
      <button
        aria-label={`Supprimer ${rule.name}`}
        title="Supprimer"
        onClick={onDelete}
        style={{ ...iconBtnStyle, color: theme.state.error.color }}
      >
        ✕
      </button>
    </div>
  )
})

// ---------------------------------------------------------------------------
// useRuleForm — logique du formulaire de création (refactor Task 4)
// ---------------------------------------------------------------------------

interface FormCondition {
  entityType: EntityTypeStr
  entityName: string
}

interface RuleFormState {
  name: string
  conditionOperator: 'AND' | 'OR'
  conditions: FormCondition[]
  suggestedTypes: EntityTypeStr[]
}

function useRuleForm() {
  const [form, setForm] = useState<RuleFormState>({
    name: '',
    conditionOperator: 'OR',
    conditions: [{ entityType: 'location', entityName: '' }],
    suggestedTypes: [],
  })

  const isValid =
    form.name.trim().length > 0 &&
    form.suggestedTypes.length > 0 &&
    form.conditions.length > 0

  const reset = () =>
    setForm({
      name: '',
      conditionOperator: 'OR',
      conditions: [{ entityType: 'location', entityName: '' }],
      suggestedTypes: [],
    })

  const toggleSuggestedType = (type: EntityTypeStr) => {
    setForm(prev => ({
      ...prev,
      suggestedTypes: prev.suggestedTypes.includes(type)
        ? prev.suggestedTypes.filter(t => t !== type)
        : [...prev.suggestedTypes, type],
    }))
  }

  const addCondition = () => {
    setForm(prev => ({
      ...prev,
      conditions: [...prev.conditions, { entityType: 'character', entityName: '' }],
    }))
  }

  const removeCondition = (idx: number) => {
    setForm(prev => ({
      ...prev,
      conditions: prev.conditions.filter((_, i) => i !== idx),
    }))
  }

  const updateCondition = (idx: number, patch: Partial<FormCondition>) => {
    setForm(prev => ({
      ...prev,
      conditions: prev.conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }))
  }

  return { form, setForm, isValid, reset, toggleSuggestedType, addCondition, removeCondition, updateCondition }
}

// ---------------------------------------------------------------------------
// ContextRulesEditor — composant principal
// ---------------------------------------------------------------------------

/** Retourne une copie du tableau avec les éléments aux indices i et j échangés. */
function swapItems<T>(arr: T[], i: number, j: number): T[] {
  const next = [...arr]
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}

export function ContextRulesEditor() {
  const {
    rules,
    selectedDialogueType,
    source,
    isLoading,
    error,
    loadRulesByDialogueType,
    createRule,
    toggleRule,
    reorderRules,
    deleteRule,
  } =
    useContextRulesStore()

  const [showForm, setShowForm] = useState(false)
  const { form, setForm, isValid, reset, toggleSuggestedType, addCondition, removeCondition, updateCondition } = useRuleForm()

  useEffect(() => {
    void loadRulesByDialogueType(selectedDialogueType)
  }, [loadRulesByDialogueType, selectedDialogueType])

  const handleMoveUp = (idx: number) => {
    if (idx === 0) return
    void reorderRules(swapItems(rules, idx - 1, idx).map(r => r.id))
  }

  const handleMoveDown = (idx: number) => {
    if (idx === rules.length - 1) return
    void reorderRules(swapItems(rules, idx, idx + 1).map(r => r.id))
  }

  const handleSubmit = async () => {
    if (!isValid) return
    await createRule({
      name: form.name.trim(),
      dialogueType: selectedDialogueType,
      conditionOperator: form.conditionOperator,
      conditions: form.conditions.map(c => ({
        entityType: c.entityType,
        ...(c.entityName.trim() ? { entityName: c.entityName.trim() } : {}),
      })),
      suggestedTypes: form.suggestedTypes,
    })
    reset()
    setShowForm(false)
  }

  return (
    <div
      data-testid="context-rules-editor"
      style={{
        backgroundColor: theme.background.secondary,
        borderTop: `1px solid ${theme.border.primary}`,
        fontSize: remSize('accent'),
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.4rem 0.5rem',
          borderBottom: `1px solid ${theme.border.primary}`,
        }}
      >
        <span style={{ fontWeight: 600, color: theme.text.primary }}>⚙ Règles de sélection</span>
        <StyledSelect
          aria-label="Type de dialogue"
          value={selectedDialogueType}
          onChange={(e) => void loadRulesByDialogueType(e.target.value)}
          style={{ ...inputStyle, width: 'auto', padding: '2px 6px', marginRight: '0.35rem' }}
          wrapperStyle={{ width: 'auto' }}
        >
          {DIALOGUE_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </StyledSelect>
        <button
          aria-label="Ajouter règle"
          onClick={() => setShowForm(v => !v)}
          style={{
            border: `1px solid ${theme.border.primary}`,
            borderRadius: 3,
            padding: '2px 8px',
            cursor: 'pointer',
            backgroundColor: theme.background.tertiary,
            color: theme.text.primary,
            fontSize: remSize('small'),
          }}
        >
          + Ajouter règle
        </button>
      </div>

      {source === 'fallback_global' && (
        <div
          style={{
            padding: '0.35rem 0.5rem',
            fontSize: remSize('small'),
            color: theme.text.secondary,
            borderBottom: `1px solid ${theme.border.primary}`,
          }}
        >
          Règles globales utilisées - configurer des règles spécifiques ?
        </div>
      )}

      <details
        style={{
          padding: '0.35rem 0.5rem',
          borderBottom: `1px solid ${theme.border.primary}`,
          color: theme.text.secondary,
          fontSize: '0.78rem',
        }}
      >
        <summary style={{ cursor: 'pointer', color: theme.text.primary }}>
          Comment les règles sont appliquées
        </summary>
        <p style={{ margin: '0.35rem 0 0' }}>
          Les règles actives du type de dialogue courant sont évaluées par priorité. Une règle déclenche des
          suggestions quand ses conditions correspondent aux éléments déjà sélectionnés ; `OU` exige au moins
          une condition, `ET` les exige toutes. Les suggestions restent à valider par l'utilisateur.
        </p>
      </details>

      {error && (
        <div style={{ padding: '0.3rem 0.5rem', color: theme.state.error.color, fontSize: remSize('small') }}>
          {error}
        </div>
      )}

      {/* Liste des règles */}
      {isLoading ? (
        <div style={{ padding: '0.4rem 0.5rem', color: theme.text.secondary, fontSize: remSize('small') }}>
          Chargement…
        </div>
      ) : rules.length === 0 && !showForm ? (
        <div style={{ padding: '0.4rem 0.5rem', color: theme.text.secondary, fontStyle: 'italic', fontSize: remSize('small') }}>
          Aucune règle définie. Cliquez "+ Ajouter règle" pour en créer une.
        </div>
      ) : (
        rules.map((rule, idx) => (
          <RuleItem
            key={rule.id}
            rule={rule}
            isFirst={idx === 0}
            isLast={idx === rules.length - 1}
            onToggle={() => void toggleRule(rule.id)}
            onMoveUp={() => handleMoveUp(idx)}
            onMoveDown={() => handleMoveDown(idx)}
            onDelete={() => void deleteRule(rule.id)}
          />
        ))
      )}

      {/* Formulaire de création */}
      {showForm && (
        <div
          data-testid="rule-form"
          style={{ padding: '0.5rem', borderTop: `1px solid ${theme.border.primary}` }}
        >
          <div style={{ marginBottom: '0.4rem' }}>
            <label htmlFor="rule-name" style={{ display: 'block', marginBottom: '0.2rem', color: theme.text.secondary }}>
              Nom de la règle
            </label>
            <input
              id="rule-name"
              type="text"
              aria-label="Nom de la règle"
              value={form.name}
              onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Ex: Lieu → Région"
              style={inputStyle}
            />
          </div>

          {/* Conditions déclencheuses */}
          <div style={{ marginBottom: '0.4rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
              <span style={{ color: theme.text.secondary }}>Conditions déclencheuses</span>
              {form.conditions.length > 1 && (
                <StyledSelect
                  aria-label="Opérateur de conditions"
                  value={form.conditionOperator}
                  onChange={e => setForm(prev => ({ ...prev, conditionOperator: e.target.value as 'AND' | 'OR' }))}
                  style={{ ...inputStyle, width: 'auto', padding: '1px 4px', fontSize: remSize('caption') }}
                  wrapperStyle={{ width: 'auto' }}
                >
                  <option value="OR">AU MOINS UNE (OU)</option>
                  <option value="AND">TOUTES (ET)</option>
                </StyledSelect>
              )}
            </div>
            {form.conditions.map((cond, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.3rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                <StyledSelect
                  aria-label={`Type déclencheur ${i + 1}`}
                  value={cond.entityType}
                  onChange={e => updateCondition(i, { entityType: e.target.value as EntityTypeStr })}
                  style={{ ...inputStyle, flex: '0 0 auto', width: '6rem' }}
                  wrapperStyle={{ flex: '0 0 auto', width: '6rem' }}
                >
                  {ENTITY_TYPE_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </StyledSelect>
                <input
                  type="text"
                  aria-label={`Nom entité ${i + 1} (optionnel)`}
                  value={cond.entityName}
                  onChange={e => updateCondition(i, { entityName: e.target.value })}
                  placeholder="Nom spécifique (optionnel)"
                  style={{ ...inputStyle, flex: 1 }}
                />
                {form.conditions.length > 1 && (
                  <button
                    aria-label={`Supprimer condition ${i + 1}`}
                    onClick={() => removeCondition(i)}
                    style={{ ...iconBtnStyle, color: theme.state.error.color, fontSize: remSize('small') }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={addCondition}
              style={{ ...actionBtnStyle, backgroundColor: theme.background.tertiary, color: theme.text.secondary, fontSize: remSize('caption'), padding: '2px 6px', marginTop: '0.2rem' }}
            >
              + Condition
            </button>
          </div>

          <div style={{ marginBottom: '0.5rem' }}>
            <span style={{ display: 'block', marginBottom: '0.2rem', color: theme.text.secondary }}>
              Types suggérés
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
              {ENTITY_TYPE_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer', color: theme.text.primary }}
                >
                  <input
                    type="checkbox"
                    aria-label={opt.label}
                    checked={form.suggestedTypes.includes(opt.value)}
                    onChange={() => toggleSuggestedType(opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button
              aria-label="Sauvegarder"
              onClick={() => void handleSubmit()}
              disabled={!isValid}
              style={{
                ...actionBtnStyle,
                backgroundColor: isValid ? '#2d6a4f' : theme.background.tertiary,
                color: isValid ? '#fff' : theme.text.secondary,
              }}
            >
              Sauvegarder
            </button>
            <button
              onClick={() => { reset(); setShowForm(false) }}
              style={{ ...actionBtnStyle, backgroundColor: theme.background.tertiary, color: theme.text.secondary }}
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'pointer',
  padding: '0 3px',
  fontSize: remSize('body'),
  color: theme.text.secondary,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '3px 6px',
  backgroundColor: theme.background.primary,
  border: `1px solid ${theme.border.primary}`,
  borderRadius: 3,
  color: theme.text.primary,
  fontSize: remSize('body'),
  boxSizing: 'border-box',
}

const actionBtnStyle: React.CSSProperties = {
  border: 'none',
  borderRadius: 3,
  padding: '3px 10px',
  cursor: 'pointer',
  fontSize: remSize('body'),
  fontWeight: 600,
}
