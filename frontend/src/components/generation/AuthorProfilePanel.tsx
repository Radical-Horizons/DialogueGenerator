/**
 * Profil d'auteur réutilisable — section du tiroir de réglages.
 *
 * Extrait de `SystemPromptEditor`. Le profil décrit la voix persistante du projet :
 * c'est un réglage du comportement du LLM, pas une entrée par scène.
 *
 * Ses modèles locaux (`localNamedTemplates`, clé auteur) restent ici : les templates
 * Epic 6 ne peuvent pas les absorber, `PresetConfiguration` n'a pas de champ
 * `authorProfile`.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { FormField } from '../shared/FormField'
import { useAuthorProfile } from '../../hooks/useAuthorProfile'
import { useToast } from '../shared'
import { theme } from '../../theme'
import { generationPanelChrome } from '../../theme/responsiveChrome'
import * as configAPI from '../../api/config'
import {
  deleteLocalAuthorTemplate,
  listLocalAuthorTemplates,
  upsertLocalAuthorTemplate,
  type LocalNamedTemplate,
} from '../../utils/localNamedTemplates'
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext'

export interface AuthorProfilePanelProps {
  authorProfile: string
  onAuthorProfileChange: (profile: string) => void
}

export function AuthorProfilePanel({
  authorProfile,
  onAuthorProfileChange,
}: AuthorProfilePanelProps) {
  const {
    authorProfile: authorProfileState,
    saveProfile,
    restore: restoreAuthorProfile,
    updateProfile,
  } = useAuthorProfile()
  const toast = useToast()
  const isNarrow = useGenerationPanelNarrow()
  const genChrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable

  const [authorTemplates, setAuthorTemplates] = useState<configAPI.AuthorProfileTemplate[]>([])
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [selectedAuthorTemplateId, setSelectedAuthorTemplateId] = useState<string | null>(null)
  const [showTemplatePreview, setShowTemplatePreview] = useState<string | null>(null)
  const [localAuthorTemplates, setLocalAuthorTemplates] = useState<LocalNamedTemplate[]>(() =>
    listLocalAuthorTemplates()
  )
  const [selectedLocalAuthorId, setSelectedLocalAuthorId] = useState('')
  const [authorSaveAsOpen, setAuthorSaveAsOpen] = useState(false)
  const [authorSaveAsName, setAuthorSaveAsName] = useState('')

  useEffect(() => {
    let cancelled = false
    setIsLoadingTemplates(true)
    configAPI
      .getAuthorProfileTemplates()
      .then((res) => {
        if (!cancelled) setAuthorTemplates(res.templates)
      })
      .catch((err) => console.error('Erreur lors du chargement des templates:', err))
      .finally(() => {
        if (!cancelled) setIsLoadingTemplates(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  /** Le hook local a pu charger depuis localStorage avant que le parent n'ait sa valeur. */
  useEffect(() => {
    if (authorProfileState && !authorProfile) {
      onAuthorProfileChange(authorProfileState)
      return
    }
    if (authorProfile !== authorProfileState) {
      updateProfile(authorProfile)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorProfile])

  const refreshLocalAuthorTemplates = useCallback(() => {
    setLocalAuthorTemplates(listLocalAuthorTemplates())
  }, [])

  const handleAuthorTemplateClick = useCallback(
    (template: configAPI.AuthorProfileTemplate) => {
      if (selectedAuthorTemplateId === template.id) {
        setShowTemplatePreview(template.id)
      } else {
        setSelectedAuthorTemplateId(template.id)
        saveProfile(template.profile)
        updateProfile(template.profile)
        onAuthorProfileChange(template.profile)
      }
    },
    [selectedAuthorTemplateId, saveProfile, updateProfile, onAuthorProfileChange]
  )

  const handleAuthorProfileChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      updateProfile(value)
      onAuthorProfileChange(value)
      if (selectedAuthorTemplateId) {
        setSelectedAuthorTemplateId(null)
      }
    },
    [updateProfile, onAuthorProfileChange, selectedAuthorTemplateId]
  )

  const handleSaveAuthorProfile = useCallback(() => {
    const currentProfile = authorProfile || ''
    try {
      saveProfile(currentProfile)
      onAuthorProfileChange(currentProfile)
      toast("Profil d'auteur sauvegardé avec succès", 'success')
    } catch (err) {
      console.error('Erreur lors de la sauvegarde:', err)
      toast("Erreur lors de la sauvegarde du profil d'auteur", 'error')
    }
  }, [authorProfile, saveProfile, onAuthorProfileChange, toast])

  const handleRestoreAuthorProfile = useCallback(() => {
    restoreAuthorProfile()
    // Le hook met à jour son state ; on le relit au tick suivant.
    setTimeout(() => {
      const saved = localStorage.getItem('dialogue_generator_saved_author_profile')
      onAuthorProfileChange(saved || '')
    }, 0)
  }, [restoreAuthorProfile, onAuthorProfileChange])

  const handleConfirmAuthorSaveAs = useCallback(() => {
    try {
      upsertLocalAuthorTemplate(authorSaveAsName, authorProfile)
      refreshLocalAuthorTemplates()
      setAuthorSaveAsOpen(false)
      setAuthorSaveAsName('')
      toast("Modèle d'auteur local enregistré", 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erreur lors de l'enregistrement", 'error')
    }
  }, [authorSaveAsName, authorProfile, refreshLocalAuthorTemplates, toast])

  return (
    <div style={{ padding: genChrome.tabInnerPadding, minWidth: 0 }}>
      {/* Templates de profil d'auteur */}
      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            color: theme.text.primary,
            fontSize: `${genChrome.labelFontRem}rem`,
            fontWeight: 500,
          }}
        >
          Templates de profil d'auteur:
        </label>
        {isLoadingTemplates ? (
          <div style={{ color: theme.text.secondary, fontSize: '0.85rem' }}>
            Chargement des templates...
          </div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: `${genChrome.controlGapRem}rem`,
              marginBottom: '0.5rem',
            }}
          >
            {authorTemplates.map((template) => (
              <button
                key={template.id}
                onClick={() => handleAuthorTemplateClick(template)}
                onDoubleClick={() => setShowTemplatePreview(template.id)}
                style={{
                  padding: genChrome.buttonPadding,
                  border: `1px solid ${selectedAuthorTemplateId === template.id ? theme.border.focus : theme.border.primary}`,
                  borderRadius: '4px',
                  backgroundColor: selectedAuthorTemplateId === template.id 
                    ? theme.button.primary.background 
                    : theme.button.default.background,
                  color: selectedAuthorTemplateId === template.id 
                    ? theme.button.primary.color 
                    : theme.button.default.color,
                  cursor: 'pointer',
                  fontSize: `${genChrome.buttonFontRem}rem`,
                }}
                title={`${template.description}\n\nDouble-clic pour voir le contenu complet`}
              >
                {template.name}
                {selectedAuthorTemplateId === template.id && ' ✓'}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            color: theme.text.primary,
            fontSize: '0.9rem',
            fontWeight: 500,
          }}
        >
          Mes modèles (ce navigateur)
        </label>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            alignItems: 'center',
            marginBottom: '0.35rem',
          }}
        >
          <select
            aria-label="Charger un modèle d'auteur local"
            value={selectedLocalAuthorId}
            onChange={(e) => {
              const id = e.target.value
              setSelectedLocalAuthorId(id)
              if (!id) return
              const t = localAuthorTemplates.find((x) => x.id === id)
              if (t) {
                updateProfile(t.body)
                onAuthorProfileChange(t.body)
                saveProfile(t.body)
                setSelectedAuthorTemplateId(null)
              }
            }}
            style={{
              padding: '0.45rem 0.6rem',
              borderRadius: 6,
              border: `1px solid ${theme.border.primary}`,
              backgroundColor: theme.input.background,
              color: theme.input.color,
              fontSize: '0.85rem',
              minWidth: 200,
            }}
          >
            <option value="">— Charger —</option>
            {localAuthorTemplates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              setAuthorSaveAsOpen(true)
              setAuthorSaveAsName('')
            }}
            style={{
              padding: '0.45rem 0.85rem',
              border: `1px solid ${theme.border.secondary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
              fontSize: '0.85rem',
              fontWeight: 600,
            }}
            title="Crée ou remplace un modèle nommé dans ce navigateur"
          >
            Enregistrer sous…
          </button>
          {selectedLocalAuthorId ? (
            <button
              type="button"
              onClick={() => {
                deleteLocalAuthorTemplate(selectedLocalAuthorId)
                refreshLocalAuthorTemplates()
                setSelectedLocalAuthorId('')
                toast('Modèle local supprimé', 'success')
              }}
              style={{
                padding: '0.45rem 0.85rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '6px',
                backgroundColor: theme.background.secondary,
                color: theme.state.error.color,
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              Supprimer
            </button>
          ) : null}
        </div>
        <div style={{ fontSize: '0.72rem', color: theme.text.secondary }}>
          Stockage local uniquement ; nom identique = remplacement du modèle.
        </div>
      </div>

      {/* Prévisualisation du template */}
      {showTemplatePreview && authorTemplates.find(t => t.id === showTemplatePreview) && (
        <div
          style={{
            marginBottom: '1rem',
            padding: '1rem',
            backgroundColor: theme.background.secondary,
            border: `1px solid ${theme.border.primary}`,
            borderRadius: '4px',
            maxHeight: '300px',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <strong style={{ color: theme.text.primary }}>
              {authorTemplates.find(t => t.id === showTemplatePreview)?.name}
            </strong>
            <button
              onClick={() => setShowTemplatePreview(null)}
              style={{
                padding: '0.25rem 0.5rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
            >
              Fermer
            </button>
          </div>
          <pre
            style={{
              margin: 0,
              color: theme.text.secondary,
              fontSize: '0.8rem',
              whiteSpace: 'pre-wrap',
              fontFamily: 'monospace',
            }}
          >
            {authorTemplates.find(t => t.id === showTemplatePreview)?.profile || '(Vide)'}
          </pre>
        </div>
      )}

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: `${genChrome.controlGapRem}rem`,
          marginBottom: '0.5rem',
        }}
      >
        <label
          htmlFor="author-profile-textarea"
          style={{
            color: theme.text.primary,
            fontSize: `${genChrome.labelFontRem}rem`,
            fontWeight: 500,
            flex: isNarrow ? '1 1 100%' : undefined,
          }}
        >
          Profil d'auteur (réutilisable):
        </label>
        <div style={{ display: 'flex', gap: `${genChrome.controlGapRem}rem`, flexWrap: 'wrap' }}>
          <button
            onClick={handleSaveAuthorProfile}
            style={{
              padding: genChrome.buttonPadding,
              border: `1px solid ${theme.border.secondary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
              fontSize: `${genChrome.buttonFontRem}rem`,
              fontWeight: 600,
            }}
            title="Sauvegarde le profil d'auteur actuel"
          >
            Sauvegarder
          </button>
          <button
            onClick={handleRestoreAuthorProfile}
            style={{
              padding: genChrome.buttonPadding,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '6px',
              backgroundColor: theme.button.default.background,
              color: theme.button.default.color,
              cursor: 'pointer',
              fontSize: `${genChrome.buttonFontRem}rem`,
              fontWeight: 400,
            }}
            title="Restaure la dernière version sauvegardée"
          >
            Restaurer
          </button>
        </div>
      </div>
      <FormField label="" htmlFor="author-profile-textarea">
        <textarea
          id="author-profile-textarea"
          value={authorProfile}
          onChange={handleAuthorProfileChange}
          rows={8}
          placeholder="Style d'auteur global (réutilisable entre toutes les scènes). Ex: Style littéraire, vocabulaire riche, etc."
          style={{
            width: '100%',
            padding: '0.65rem 0.75rem',
            boxSizing: 'border-box',
            backgroundColor: theme.input.background,
            border: `1px solid ${theme.input.border}`,
            color: theme.input.color,
            borderRadius: '6px',
            fontFamily: 'inherit',
            fontSize: `${genChrome.textareaFontRem}rem`,
            resize: 'vertical',
            lineHeight: 1.55,
          }}
        />
      </FormField>
      {authorSaveAsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="author-save-as-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10050,
          }}
          onClick={() => setAuthorSaveAsOpen(false)}
        >
          <div
            role="presentation"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: theme.background.panel,
              padding: '1.25rem',
              borderRadius: 8,
              border: `1px solid ${theme.border.primary}`,
              minWidth: 320,
              maxWidth: '90vw',
            }}
          >
            <h4 id="author-save-as-title" style={{ marginTop: 0, color: theme.text.primary }}>
              Enregistrer le profil sous…
            </h4>
            <input
              type="text"
              value={authorSaveAsName}
              onChange={(e) => setAuthorSaveAsName(e.target.value)}
              placeholder="Nom du modèle"
              style={{
                width: '100%',
                padding: '0.5rem',
                marginBottom: '1rem',
                boxSizing: 'border-box',
                borderRadius: 6,
                border: `1px solid ${theme.input.border}`,
                backgroundColor: theme.input.background,
                color: theme.input.color,
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setAuthorSaveAsOpen(false)}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: 6,
                  border: `1px solid ${theme.border.primary}`,
                  backgroundColor: theme.background.secondary,
                  cursor: 'pointer',
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleConfirmAuthorSaveAs}
                style={{
                  padding: '0.45rem 0.85rem',
                  borderRadius: 6,
                  border: `1px solid ${theme.button.primary.background}`,
                  backgroundColor: theme.button.primary.background,
                  color: theme.button.primary.color,
                  cursor: 'pointer',
                }}
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
