/**
 * Modal d'édition d'un template custom : métadonnées, instructions, snapshot, timeline.
 */
import React, { useEffect, useRef, useState } from 'react'
import { getContextDroppingRules } from '../../api/graph'
import {
  listTemplateVersionsApi,
  restoreTemplateVersionApi,
} from '../../api/templates'
import type { ContextDroppingRules } from '../../types/graph'
import type { Template, TemplateConfiguration, TemplateVersionSummary } from '../../types/template'
import { theme } from '../../theme'
import { generationPanelChrome, modalTypography } from '../../theme/responsiveChrome'
import { redesignRadius } from '../../theme/redesignTokens'
import { useToast } from '../shared'
import { ContextDroppingRulesEditor } from '../graph/ContextDroppingRulesEditor'
import { useTemplateStore } from '../../store/templateStore'
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext'
import { TOUCH_TARGET_MIN_PX } from '../../constants'
import { DEFAULT_CONTEXT_DROPPING_RULES } from '../../utils/contextDroppingOverlay'

export interface TemplateEditorModalProps {
  isOpen: boolean
  template: Template | null
  /** Snapshot courant du panneau génération (remplace le contexte / LLM). */
  captureSnapshot: () => TemplateConfiguration | null
  onClose: () => void
  /** Appelé après un PUT 200, avant la fermeture (ex. reset des filtres). */
  onSaved?: () => void
}

function uniqueCount(values: string[] | undefined): number {
  return new Set(values ?? []).size
}

function formatHistoryDate(isoString: string): string {
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) {
    return isoString
  }
  return date.toLocaleDateString('fr-FR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const TemplateEditorModal: React.FC<TemplateEditorModalProps> = ({
  isOpen,
  template,
  captureSnapshot,
  onClose,
  onSaved,
}) => {
  const isNarrow = useGenerationPanelNarrow()
  const chrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable
  const type = isNarrow ? modalTypography.narrow : modalTypography.comfortable
  const toast = useToast()
  const updateTemplate = useTemplateStore((state) => state.updateTemplate)
  const savingRef = useRef(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Général')
  const [icon, setIcon] = useState('📋')
  const [instructions, setInstructions] = useState('')
  const [configuration, setConfiguration] = useState<TemplateConfiguration | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [rulesLoading, setRulesLoading] = useState(false)
  const [versions, setVersions] = useState<TemplateVersionSummary[]>([])

  useEffect(() => {
    if (isOpen && template) {
      setName(template.name)
      setDescription(template.description)
      setCategory(template.category || 'Général')
      setIcon(template.icon || '📋')
      setInstructions(template.configuration.instructions || '')
      setConfiguration(template.configuration)
      setIsSaving(false)
      savingRef.current = false
      setRulesLoading(false)
      void listTemplateVersionsApi(template.id)
        .then((next) => setVersions(next))
        .catch(() => setVersions([]))
    }
  }, [isOpen, template])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !savingRef.current) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen || !template || !configuration) {
    return null
  }

  const preview = { ...configuration, instructions }

  const handleReplaceSnapshot = () => {
    const snapshot = captureSnapshot()
    if (!snapshot) {
      toast('Aucune configuration actuelle à capturer', 'error')
      return
    }
    setConfiguration({
      ...snapshot,
      contextDroppingRules: configuration.contextDroppingRules,
    })
    setInstructions(snapshot.instructions || '')
    toast('Configuration actuelle appliquée au template', 'info')
  }

  const handleCustomizeRules = async () => {
    if (rulesLoading) {
      return
    }
    setRulesLoading(true)
    try {
      const fetched = await getContextDroppingRules()
      setConfiguration((current) =>
        current ? { ...current, contextDroppingRules: fetched } : current,
      )
    } catch {
      setConfiguration((current) =>
        current
          ? { ...current, contextDroppingRules: DEFAULT_CONTEXT_DROPPING_RULES }
          : current,
      )
    } finally {
      setRulesLoading(false)
    }
  }

  const handleRulesChange = (next: ContextDroppingRules) => {
    setConfiguration((current) =>
      current ? { ...current, contextDroppingRules: next } : current,
    )
  }

  const handleSubmit = async () => {
    if (!name.trim() || savingRef.current || rulesLoading) {
      return
    }
    savingRef.current = true
    setIsSaving(true)
    try {
      const nextConfiguration: TemplateConfiguration = { ...configuration, instructions }
      if (nextConfiguration.contextDroppingRules == null) {
        delete nextConfiguration.contextDroppingRules
      }
      const { warnings } = await updateTemplate(template.id, {
        name: name.trim(),
        description: description.trim(),
        category: category.trim() || 'Général',
        icon: icon || '📋',
        configuration: nextConfiguration,
      })
      if (warnings.length > 0) {
        toast(warnings.join(' · '), 'warning')
      } else {
        toast('Template mis à jour', 'success')
      }
      onSaved?.()
      onClose()
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Échec de la mise à jour du template'
      toast(message, 'error')
    } finally {
      savingRef.current = false
      setIsSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: chrome.selectTriggerPadding,
    backgroundColor: theme.background.secondary,
    border: `1px solid ${theme.border.primary}`,
    borderRadius: `${redesignRadius.control}px`,
    color: theme.text.primary,
    fontSize: `${chrome.buttonFontRem}rem`,
    boxSizing: 'border-box',
  }

  return (
    <div
      data-testid="template-editor-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Éditer le template"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: isNarrow ? '0.6rem' : '1rem',
      }}
      onClick={() => {
        if (!isSaving) {
          onClose()
        }
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          backgroundColor: theme.background.panel,
          padding: chrome.cardPadding,
          borderRadius: `${redesignRadius.node}px`,
          width: isNarrow ? '100%' : 'min(32rem, 92vw)',
          maxWidth: '500px',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: `1px solid ${theme.border.primary}`,
        }}
      >
        <h3
          style={{
            marginTop: 0,
            color: theme.text.primary,
            fontSize: `${type.titleFontRem}rem`,
          }}
        >
          Éditer le template
        </h3>

        <div style={{ marginBottom: `${chrome.controlGapRem}rem` }}>
          <label
            htmlFor="template-edit-name"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              color: theme.text.secondary,
              fontSize: `${chrome.labelFontRem}rem`,
            }}
          >
            Nom
          </label>
          <input
            id="template-edit-name"
            data-testid="template-edit-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: `${chrome.controlGapRem}rem` }}>
          <label
            htmlFor="template-edit-description"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              color: theme.text.secondary,
              fontSize: `${chrome.labelFontRem}rem`,
            }}
          >
            Description
          </label>
          <textarea
            id="template-edit-description"
            data-testid="template-edit-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            rows={2}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div style={{ marginBottom: `${chrome.controlGapRem}rem` }}>
          <label
            htmlFor="template-edit-category"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              color: theme.text.secondary,
              fontSize: `${chrome.labelFontRem}rem`,
            }}
          >
            Catégorie
          </label>
          <input
            id="template-edit-category"
            data-testid="template-edit-category"
            type="text"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            maxLength={120}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: `${chrome.controlGapRem}rem` }}>
          <label
            htmlFor="template-edit-icon"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              color: theme.text.secondary,
              fontSize: `${chrome.labelFontRem}rem`,
            }}
          >
            Icône (emoji)
          </label>
          <input
            id="template-edit-icon"
            data-testid="template-edit-icon"
            type="text"
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
            maxLength={16}
            style={{
              ...inputStyle,
              width: '4rem',
              textAlign: 'center',
              fontSize: '1.5rem',
            }}
          />
        </div>

        <div style={{ marginBottom: `${chrome.controlGapRem}rem` }}>
          <label
            htmlFor="template-edit-instructions"
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              color: theme.text.secondary,
              fontSize: `${chrome.labelFontRem}rem`,
            }}
          >
            Instructions
          </label>
          <textarea
            id="template-edit-instructions"
            data-testid="template-edit-instructions"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={4}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div
          data-testid="template-edit-preview"
          style={{
            padding: chrome.cardPadding,
            backgroundColor: theme.background.secondary,
            borderRadius: `${redesignRadius.control}px`,
            marginBottom: `${chrome.controlGapRem}rem`,
          }}
        >
          <div
            style={{
              fontSize: `${type.smallFontRem}rem`,
              color: theme.text.secondary,
              marginBottom: '0.5rem',
            }}
          >
            Contexte et modèle (lecture seule)
          </div>
          <div
            style={{
              fontSize: `${type.bodyFontRem}rem`,
              color: theme.text.primary,
            }}
          >
            <div>
              Personnages :{' '}
              {preview.characters.length > 0 ? preview.characters.join(', ') : '—'}
            </div>
            <div>
              Lieux : {preview.locations.length > 0 ? preview.locations.join(', ') : '—'}
            </div>
            <div>Région : {preview.region || '—'}</div>
            <div>Modèle : {preview.llmModel || '—'}</div>
            {preview.llmProvider && <div>Fournisseur : {preview.llmProvider}</div>}
            {preview.contextSelections && (
              <div>
                Objets :{' '}
                {uniqueCount([
                  ...(preview.contextSelections.items_full || []),
                  ...(preview.contextSelections.items_excerpt || []),
                ])}
              </div>
            )}
          </div>
          <button
            type="button"
            data-testid="template-editor-replace-snapshot-btn"
            onClick={handleReplaceSnapshot}
            disabled={isSaving}
            style={{
              marginTop: `${chrome.controlGapRem}rem`,
              minHeight: TOUCH_TARGET_MIN_PX,
              padding: chrome.buttonPadding,
              backgroundColor: theme.button.default.background,
              border: `1px solid ${theme.border.secondary}`,
              borderRadius: `${redesignRadius.control}px`,
              color: theme.button.default.color,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontSize: `${chrome.buttonFontRem}rem`,
              width: '100%',
            }}
          >
            Remplacer par la config actuelle
          </button>
        </div>

        {configuration.contextDroppingRules ? (
          <div
            data-testid="template-edit-context-dropping-rules"
            style={{ marginBottom: `${chrome.controlGapRem}rem` }}
          >
            <div
              style={{
                fontSize: `${type.smallFontRem}rem`,
                color: theme.text.secondary,
                marginBottom: '0.5rem',
              }}
            >
              Règles anti-context-dropping (copie locale, pas le fichier global)
            </div>
            <ContextDroppingRulesEditor
              persist={false}
              value={configuration.contextDroppingRules}
              onChange={handleRulesChange}
            />
          </div>
        ) : (
          <div
            data-testid="template-editor-rules-inherit"
            style={{
              marginBottom: `${chrome.controlGapRem}rem`,
              padding: chrome.cardPadding,
              backgroundColor: theme.background.secondary,
              borderRadius: `${redesignRadius.control}px`,
            }}
          >
            <div
              style={{
                fontSize: `${type.bodyFontRem}rem`,
                color: theme.text.secondary,
                marginBottom: `${chrome.controlGapRem}rem`,
              }}
            >
              Hérite des règles anti-drop globales (4.10). Personnaliser enregistre une copie dans ce
              template.
            </div>
            <button
              type="button"
              data-testid="template-editor-customize-rules-btn"
              onClick={() => {
                void handleCustomizeRules()
              }}
              disabled={isSaving || rulesLoading}
              style={{
                minHeight: TOUCH_TARGET_MIN_PX,
                padding: chrome.buttonPadding,
                backgroundColor: theme.button.default.background,
                border: `1px solid ${theme.border.secondary}`,
                borderRadius: `${redesignRadius.control}px`,
                color: theme.button.default.color,
                cursor: isSaving ? 'not-allowed' : 'pointer',
                fontSize: `${chrome.buttonFontRem}rem`,
                width: '100%',
              }}
            >
              Personnaliser
            </button>
          </div>
        )}

        <div
          data-testid="template-editor-history"
          style={{
            marginBottom: `${chrome.controlGapRem}rem`,
            fontSize: `${chrome.labelFontRem}rem`,
            color: theme.text.secondary,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: theme.text.primary }}>
            Historique
          </div>
          {(template.history ?? []).length === 0 ? (
            <div>Aucune entrée</div>
          ) : (
            (template.history ?? []).map((entry, index) => (
              <div key={`${entry.action}-${entry.at}-${index}`} data-testid="template-history-entry">
                {entry.action === 'created'
                  ? 'Créé'
                  : entry.action === 'restored'
                    ? 'Restauré'
                    : 'Modifié'}{' '}
                le {formatHistoryDate(entry.at)}
              </div>
            ))
          )}
          {versions.length > 0 ? (
            <div data-testid="template-versions" style={{ marginTop: '0.75rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.35rem', color: theme.text.primary }}>
                Versions
              </div>
              {versions.map((version) => (
                <div
                  key={version.id}
                  data-testid={`template-version-${version.id}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    marginBottom: '0.35rem',
                  }}
                >
                  <span>
                    {version.name} — {formatHistoryDate(version.at)}
                  </span>
                  <button
                    type="button"
                    data-testid={`template-version-restore-${version.id}`}
                    disabled={isSaving}
                    onClick={() => {
                      if (!template || isSaving) return
                      setIsSaving(true)
                      void restoreTemplateVersionApi(template.id, version.id)
                        .then(() => {
                          toast('Version restaurée', 'success')
                          onSaved?.()
                          onClose()
                        })
                        .catch(() => toast('Restauration impossible', 'error'))
                        .finally(() => setIsSaving(false))
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: theme.button.primary.background,
                      cursor: 'pointer',
                    }}
                  >
                    Restaurer
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: `${chrome.controlGapRem}rem`,
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            style={{
              padding: chrome.buttonPadding,
              backgroundColor: theme.background.secondary,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: `${redesignRadius.control}px`,
              color: theme.text.primary,
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1,
              fontSize: `${chrome.buttonFontRem}rem`,
              flex: isNarrow ? '1 1 auto' : undefined,
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            data-testid="template-editor-save-btn"
            onClick={() => {
              void handleSubmit()
            }}
            disabled={!name.trim() || isSaving || rulesLoading}
            style={{
              padding: chrome.buttonPadding,
              backgroundColor: theme.button.primary.background,
              border: 'none',
              borderRadius: `${redesignRadius.control}px`,
              color: 'white',
              cursor: !name.trim() || isSaving || rulesLoading ? 'not-allowed' : 'pointer',
              opacity: !name.trim() || isSaving || rulesLoading ? 0.6 : 1,
              fontSize: `${chrome.buttonFontRem}rem`,
              flex: isNarrow ? '1 1 auto' : undefined,
            }}
          >
            {isSaving ? 'Sauvegarde…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  )
}
