/**
 * Éditeur de règles anti-context-dropping (Story 4.10 — FR45).
 *
 * Permet de configurer : profil de tolérance, informations obligatoires,
 * surcharges par type de dialogue.
 */
import { useCallback, useEffect, useState } from 'react'
import * as graphAPI from '../../api/graph'
import { getErrorMessage } from '../../types/errors'
import type { ContextDroppingRules, DialogueTypeRuleOverride } from '../../types/graph'
import { theme } from '../../theme'

interface ContextDroppingRulesEditorProps {
  onClose: () => void
}

const DEFAULT_RULES: ContextDroppingRules = {
  rules_profile: 'strict',
  tolerance: null,
  mandatory_info: [],
  dialogue_type_overrides: {},
  schema_version: '1.0',
}

export function ContextDroppingRulesEditor({ onClose }: ContextDroppingRulesEditorProps) {
  const [rules, setRules] = useState<ContextDroppingRules>(DEFAULT_RULES)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  // ── Chargement initial ────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true)
    setError(null)
    graphAPI
      .getContextDroppingRules()
      .then((r) => setRules(r))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [])

  // ── Sauvegarde ────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await graphAPI.putContextDroppingRules(rules)
      setRules(updated)
      setSaved(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }, [rules])

  // ── Helpers édition ───────────────────────────────────────────────────────

  const setProfile = (p: 'strict' | 'light') =>
    setRules((r) => ({ ...r, rules_profile: p }))

  const setTolerance = (v: string) => {
    const parsed = parseFloat(v)
    setRules((r) => ({ ...r, tolerance: isNaN(parsed) ? null : Math.min(1, Math.max(0, parsed)) }))
  }

  const addMandatoryInfo = (label: string) => {
    const trimmed = label.trim()
    if (!trimmed) return
    setRules((r) => ({ ...r, mandatory_info: [...r.mandatory_info, trimmed] }))
  }

  const removeMandatoryInfo = (idx: number) =>
    setRules((r) => ({ ...r, mandatory_info: r.mandatory_info.filter((_, i) => i !== idx) }))

  const addTypeOverride = (dialogueType: string, override: DialogueTypeRuleOverride) => {
    const key = dialogueType.trim()
    if (!key) return
    setRules((r) => ({
      ...r,
      dialogue_type_overrides: { ...r.dialogue_type_overrides, [key]: override },
    }))
  }

  const removeTypeOverride = (dialogueType: string) =>
    setRules((r) => {
      const next = { ...r.dialogue_type_overrides }
      delete next[dialogueType]
      return { ...r, dialogue_type_overrides: next }
    })

  // ── Rendu ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        background: theme.background.panel,
        border: `1px solid ${theme.border.primary}`,
        borderRadius: 8,
        padding: 16,
        minWidth: 340,
      }}
    >
      <h3 style={{ marginTop: 0, marginBottom: 12, fontSize: 14, color: theme.text.primary }}>
        Règles anti-context-dropping
      </h3>

      {loading && (
        <p style={{ color: theme.text.secondary, fontSize: 12 }}>Chargement…</p>
      )}

      {error && (
        <p
          role="alert"
          style={{
            color: theme.state.error.color,
            background: theme.state.error.background,
            fontSize: 12,
            marginBottom: 8,
            padding: '4px 8px',
            borderRadius: 4,
          }}
        >
          Erreur : {error}
        </p>
      )}

      {saved && (
        <p
          style={{
            color: theme.state.success.color,
            background: theme.state.success.background,
            fontSize: 12,
            marginBottom: 8,
            padding: '4px 8px',
            borderRadius: 4,
          }}
        >
          Règles sauvegardées.
        </p>
      )}

      {/* ── Profil ─────────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 12 }}>
        <label
          htmlFor="cd-rules-profile"
          style={{ display: 'block', fontSize: 12, color: theme.text.secondary, marginBottom: 4 }}
        >
          Profil
        </label>
        <select
          id="cd-rules-profile"
          value={rules.rules_profile}
          onChange={(e) => setProfile(e.target.value as 'strict' | 'light')}
          aria-label="Profil"
          disabled={loading}
          style={{
            width: '100%',
            padding: '4px 8px',
            fontSize: 12,
            background: theme.input.background,
            color: theme.text.primary,
            border: `1px solid ${theme.input.border}`,
            borderRadius: 4,
          }}
        >
          <option value="strict">Strict (sensibilité maximale)</option>
          <option value="light">Léger (tolérance élevée)</option>
        </select>
      </div>

      {/* ── Tolérance ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 12 }}>
        <label
          htmlFor="cd-rules-tolerance"
          style={{ display: 'block', fontSize: 12, color: theme.text.secondary, marginBottom: 4 }}
        >
          Tolérance [0–1] (facultatif)
        </label>
        <input
          id="cd-rules-tolerance"
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={rules.tolerance ?? ''}
          onChange={(e) => setTolerance(e.target.value)}
          aria-label="Tolérance"
          placeholder="Par défaut du profil"
          disabled={loading}
          style={{
            width: '100%',
            padding: '4px 8px',
            fontSize: 12,
            boxSizing: 'border-box',
            background: theme.input.background,
            color: theme.text.primary,
            border: `1px solid ${theme.input.border}`,
            borderRadius: 4,
          }}
        />
      </div>

      {/* ── Informations obligatoires ──────────────────────────────────────── */}
      <MandatoryInfoSection
        items={rules.mandatory_info}
        onAdd={addMandatoryInfo}
        onRemove={removeMandatoryInfo}
        disabled={loading}
      />

      {/* ── Règles par type de dialogue ────────────────────────────────────── */}
      <DialogueTypeOverridesSection
        overrides={rules.dialogue_type_overrides}
        onAdd={addTypeOverride}
        onRemove={removeTypeOverride}
        disabled={loading}
      />

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
        <button
          onClick={onClose}
          disabled={saving}
          style={{ fontSize: 12, padding: '4px 12px', cursor: 'pointer' }}
        >
          Fermer
        </button>
        <button
          onClick={handleSave}
          disabled={loading || saving}
          style={{
            fontSize: 12,
            padding: '4px 12px',
            cursor: 'pointer',
            background: theme.button.primary.background,
            color: theme.button.primary.color,
            border: 'none',
            borderRadius: 4,
          }}
        >
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
      </div>
    </div>
  )
}

// ── Sous-composant : règles par type de dialogue ──────────────────────────────

interface DialogueTypeOverridesSectionProps {
  overrides: Record<string, DialogueTypeRuleOverride>
  onAdd: (dialogueType: string, override: DialogueTypeRuleOverride) => void
  onRemove: (dialogueType: string) => void
  disabled: boolean
}

function DialogueTypeOverridesSection({
  overrides,
  onAdd,
  onRemove,
  disabled,
}: DialogueTypeOverridesSectionProps) {
  const [draftType, setDraftType] = useState('')
  const [draftProfile, setDraftProfile] = useState<'strict' | 'light'>('strict')
  const [draftTolerance, setDraftTolerance] = useState('')

  const handleAdd = () => {
    if (!draftType.trim()) return
    const override: DialogueTypeRuleOverride = { rules_profile: draftProfile }
    const t = parseFloat(draftTolerance)
    if (!isNaN(t)) override.tolerance = Math.min(1, Math.max(0, t))
    onAdd(draftType, override)
    setDraftType('')
    setDraftTolerance('')
  }

  const entries = Object.entries(overrides)

  return (
    <div style={{ marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 12, color: theme.text.secondary, marginBottom: 4 }}>
        Règles par type de dialogue
      </span>

      {entries.length === 0 && (
        <p style={{ fontSize: 11, color: theme.text.tertiary, margin: '4px 0' }}>
          Aucune surcharge par type définie (règles globales appliquées).
        </p>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 6px 0' }}>
        {entries.map(([typeKey, override]) => (
          <li
            key={typeKey}
            style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}
          >
            <span style={{ flex: 1, fontSize: 12, color: theme.text.primary }}>
              <strong>{typeKey}</strong>
              {' — '}
              {override.rules_profile ?? '(profil global)'}
              {override.tolerance != null ? ` · tol. ${override.tolerance}` : ''}
            </span>
            <button
              onClick={() => onRemove(typeKey)}
              disabled={disabled}
              aria-label={`Supprimer règle pour ${typeKey}`}
              style={{ fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          value={draftType}
          onChange={(e) => setDraftType(e.target.value)}
          aria-label="Type de dialogue"
          placeholder="Type (ex. combat)"
          disabled={disabled}
          style={{
            flex: '1 1 100px',
            fontSize: 12,
            padding: '3px 8px',
            background: theme.input.background,
            color: theme.text.primary,
            border: `1px solid ${theme.input.border}`,
            borderRadius: 4,
          }}
        />
        <select
          value={draftProfile}
          onChange={(e) => setDraftProfile(e.target.value as 'strict' | 'light')}
          aria-label="Mode de détection pour ce type"
          disabled={disabled}
          style={{
            fontSize: 12,
            padding: '3px 6px',
            background: theme.input.background,
            color: theme.text.primary,
            border: `1px solid ${theme.input.border}`,
            borderRadius: 4,
          }}
        >
          <option value="strict">Strict</option>
          <option value="light">Léger</option>
        </select>
        <input
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={draftTolerance}
          onChange={(e) => setDraftTolerance(e.target.value)}
          aria-label="Tolérance pour ce type"
          placeholder="Tol."
          disabled={disabled}
          style={{
            width: 60,
            fontSize: 12,
            padding: '3px 6px',
            background: theme.input.background,
            color: theme.text.primary,
            border: `1px solid ${theme.input.border}`,
            borderRadius: 4,
          }}
        />
        <button
          onClick={handleAdd}
          disabled={disabled || !draftType.trim()}
          style={{ fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}
        >
          Ajouter
        </button>
      </div>
    </div>
  )
}

// ── Sous-composant : liste d'informations obligatoires ────────────────────────

interface MandatoryInfoSectionProps {
  items: string[]
  onAdd: (label: string) => void
  onRemove: (idx: number) => void
  disabled: boolean
}

function MandatoryInfoSection({ items, onAdd, onRemove, disabled }: MandatoryInfoSectionProps) {
  const [draft, setDraft] = useState('')

  const handleAdd = () => {
    if (!draft.trim()) return
    onAdd(draft)
    setDraft('')
  }

  return (
    <div style={{ marginBottom: 12 }}>
      <span style={{ display: 'block', fontSize: 12, color: theme.text.secondary, marginBottom: 4 }}>
        Informations obligatoires
      </span>

      {items.length === 0 && (
        <p style={{ fontSize: 11, color: theme.text.tertiary, margin: '4px 0' }}>
          Aucune information requise définie.
        </p>
      )}

      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 6px 0' }}>
        {items.map((item, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ flex: 1, fontSize: 12, color: theme.text.primary }}>{item}</span>
            <button
              onClick={() => onRemove(i)}
              disabled={disabled}
              aria-label={`Supprimer ${item}`}
              style={{ fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          aria-label="Nouvelle information obligatoire"
          placeholder="Ajouter une information…"
          disabled={disabled}
          style={{
            flex: 1,
            fontSize: 12,
            padding: '3px 8px',
            background: theme.input.background,
            color: theme.text.primary,
            border: `1px solid ${theme.input.border}`,
            borderRadius: 4,
          }}
        />
        <button
          onClick={handleAdd}
          disabled={disabled || !draft.trim()}
          style={{ fontSize: 11, padding: '3px 10px', cursor: 'pointer' }}
        >
          Ajouter
        </button>
      </div>
    </div>
  )
}
