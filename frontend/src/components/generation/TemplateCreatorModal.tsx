/**
 * Modal de création d'un template custom : 4 champs + aperçu lecture seule figé.
 */
import React, { useEffect, useRef, useState } from 'react'
import { getContextDroppingRules } from '../../api/graph'
import { theme } from '../../theme'
import { generationPanelChrome, modalTypography } from '../../theme/responsiveChrome'
import { redesignRadius } from '../../theme/redesignTokens'
import { useToast } from '../shared'
import { ContextDroppingRulesEditor } from '../graph/ContextDroppingRulesEditor'
import { useTemplateStore } from '../../store/templateStore'
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext'
import type { ContextDroppingRules } from '../../types/graph'
import type { TemplateConfiguration } from '../../types/template'
import { DEFAULT_CONTEXT_DROPPING_RULES } from '../../utils/contextDroppingOverlay'

export interface TemplateCreatorModalProps {
  /** Contrôle l'affichage du modal. */
  isOpen: boolean
  /** Snapshot figé à l'ouverture (instructions, IDs GDD, modèle). */
  snapshot: TemplateConfiguration | null
  /** Fermeture (Annuler ou overlay). */
  onClose: () => void
  /** Appelé après un POST 201, avant la fermeture (ex. reset des filtres). */
  onCreated?: () => void
}

function uniqueCount(values: string[] | undefined): number {
  return new Set(values ?? []).size
}

export const TemplateCreatorModal: React.FC<TemplateCreatorModalProps> = ({
  isOpen,
  snapshot,
  onClose,
  onCreated,
}) => {
  const isNarrow = useGenerationPanelNarrow()
  const chrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable
  const type = isNarrow ? modalTypography.narrow : modalTypography.comfortable
  const toast = useToast()
  const createTemplate = useTemplateStore((state) => state.createTemplate)
  const creatingRef = useRef(false)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('Général')
  const [icon, setIcon] = useState('📋')
  const [isCreating, setIsCreating] = useState(false)
  const [rules, setRules] = useState<ContextDroppingRules>(DEFAULT_CONTEXT_DROPPING_RULES)
  const [rulesReady, setRulesReady] = useState(false)
  const rulesDirtyRef = useRef(false)

  useEffect(() => {
    if (isOpen) {
      setName('')
      setDescription('')
      setCategory('Général')
      setIcon('📋')
      setIsCreating(false)
      creatingRef.current = false
      rulesDirtyRef.current = false
      const snapshotRules = snapshot?.contextDroppingRules
      if (snapshotRules) {
        setRules(snapshotRules)
        setRulesReady(true)
        return
      }
      setRules(DEFAULT_CONTEXT_DROPPING_RULES)
      setRulesReady(false)
      let cancelled = false
      getContextDroppingRules()
        .then((fetched) => {
          if (!cancelled && !rulesDirtyRef.current) {
            setRules(fetched)
          }
          if (!cancelled) {
            setRulesReady(true)
          }
        })
        .catch(() => {
          if (!cancelled && !rulesDirtyRef.current) {
            setRules(DEFAULT_CONTEXT_DROPPING_RULES)
          }
          if (!cancelled) {
            setRulesReady(true)
          }
        })
      return () => {
        cancelled = true
      }
    }
    // Relancer uniquement à l'ouverture : un nouveau snapshot objet ne doit pas vider le formulaire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !creatingRef.current) {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  const handleSubmit = async () => {
    if (!name.trim() || !snapshot || creatingRef.current || !rulesReady) {
      return
    }
    creatingRef.current = true
    setIsCreating(true)
    try {
      const { warnings } = await createTemplate({
        name: name.trim(),
        description: description.trim(),
        category: category.trim() || 'Général',
        icon: icon || '📋',
        configuration: { ...snapshot, contextDroppingRules: rules },
      })
      if (warnings.length > 0) {
        toast(warnings.join(' · '), 'warning')
      } else {
        toast('Template créé avec succès', 'success')
      }
      onCreated?.()
      onClose()
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Échec de la création du template'
      toast(message, 'error')
    } finally {
      creatingRef.current = false
      setIsCreating(false)
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
      data-testid="template-creator-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Sauvegarder comme template"
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
        if (!isCreating) {
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
          Sauvegarder comme template
        </h3>

        <div style={{ marginBottom: `${chrome.controlGapRem}rem` }}>
          <label
            htmlFor="template-name"
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
            id="template-name"
            data-testid="template-form-name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex: Confrontation première rencontre"
            maxLength={120}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: `${chrome.controlGapRem}rem` }}>
          <label
            htmlFor="template-description"
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
            id="template-description"
            data-testid="template-form-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={2000}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div style={{ marginBottom: `${chrome.controlGapRem}rem` }}>
          <label
            htmlFor="template-category"
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
            id="template-category"
            data-testid="template-form-category"
            type="text"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            placeholder="Ex: Confrontation"
            maxLength={120}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: `${chrome.controlGapRem}rem` }}>
          <label
            htmlFor="template-icon"
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
            id="template-icon"
            data-testid="template-form-icon"
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

        {snapshot && (
          <div
            data-testid="template-form-preview"
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
              Aperçu configuration (lecture seule)
            </div>
            <div
              style={{
                fontSize: `${type.bodyFontRem}rem`,
                color: theme.text.primary,
              }}
            >
              <div>Instructions : {snapshot.instructions || '—'}</div>
              <div>
                Personnages :{' '}
                {snapshot.characters.length > 0 ? snapshot.characters.join(', ') : '—'}
              </div>
              <div>
                Lieux : {snapshot.locations.length > 0 ? snapshot.locations.join(', ') : '—'}
              </div>
              <div>Région : {snapshot.region || '—'}</div>
              {snapshot.subLocation && <div>Sous-lieu : {snapshot.subLocation}</div>}
              <div>Scène : {snapshot.sceneType}</div>
              <div>Modèle : {snapshot.llmModel || '—'}</div>
              {snapshot.llmProvider && <div>Fournisseur : {snapshot.llmProvider}</div>}
              {snapshot.contextSelections && (
                <>
                  <div>
                    Objets :{' '}
                    {uniqueCount([
                      ...(snapshot.contextSelections.items_full || []),
                      ...(snapshot.contextSelections.items_excerpt || []),
                    ])}
                  </div>
                  <div>
                    Espèces :{' '}
                    {uniqueCount([
                      ...(snapshot.contextSelections.species_full || []),
                      ...(snapshot.contextSelections.species_excerpt || []),
                    ])}
                  </div>
                  <div>
                    Communautés :{' '}
                    {uniqueCount([
                      ...(snapshot.contextSelections.communities_full || []),
                      ...(snapshot.contextSelections.communities_excerpt || []),
                    ])}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        <div
          data-testid="template-form-context-dropping-rules"
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
            value={rules}
            onChange={(next) => {
              rulesDirtyRef.current = true
              setRules(next)
            }}
          />
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
            disabled={isCreating}
            style={{
              padding: chrome.buttonPadding,
              backgroundColor: theme.background.secondary,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: `${redesignRadius.control}px`,
              color: theme.text.primary,
              cursor: isCreating ? 'not-allowed' : 'pointer',
              opacity: isCreating ? 0.6 : 1,
              fontSize: `${chrome.buttonFontRem}rem`,
              flex: isNarrow ? '1 1 auto' : undefined,
            }}
          >
            Annuler
          </button>
          <button
            type="button"
            data-testid="template-modal-create-btn"
            onClick={() => {
              void handleSubmit()
            }}
            disabled={!name.trim() || !snapshot || isCreating || !rulesReady}
            style={{
              padding: chrome.buttonPadding,
              backgroundColor: theme.button.primary.background,
              border: 'none',
              borderRadius: `${redesignRadius.control}px`,
              color: 'white',
              cursor: !name.trim() || !snapshot || isCreating || !rulesReady ? 'not-allowed' : 'pointer',
              opacity: !name.trim() || !snapshot || isCreating || !rulesReady ? 0.6 : 1,
              fontSize: `${chrome.buttonFontRem}rem`,
              flex: isNarrow ? '1 1 auto' : undefined,
            }}
          >
            {isCreating ? 'Sauvegarde…' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  )
}
