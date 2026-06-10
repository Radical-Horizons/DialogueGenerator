/**
 * Éditeur pour les instructions de scène, le profil d'auteur et le system prompt.
 */
import React, { memo, useCallback, useState, useEffect, useRef } from 'react'
import { Tabs, type Tab } from '../shared/Tabs'
import { FormField } from '../shared/FormField'
import { useSystemPrompt } from '../../hooks/useSystemPrompt'
import { useAuthorProfile } from '../../hooks/useAuthorProfile'
import { useToast } from '../shared'
import { theme } from '../../theme'
import { generationPanelChrome } from '../../theme/responsiveChrome'
import * as configAPI from '../../api/config'
import {
  deleteLocalAuthorTemplate,
  deleteLocalSceneTemplate,
  listLocalAuthorTemplates,
  listLocalSceneTemplates,
  upsertLocalAuthorTemplate,
  upsertLocalSceneTemplate,
  type LocalNamedTemplate,
} from '../../utils/localNamedTemplates'
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext'
import { StyledSelect } from '../shared/StyledSelect'

export interface SystemPromptEditorProps {
  userInstructions: string
  authorProfile: string
  gameRules: string
  systemPromptOverride: string | null
  onUserInstructionsChange: (instructions: string) => void
  onAuthorProfileChange: (profile: string) => void
  onGameRulesChange: (rules: string) => void
  onSystemPromptChange: (prompt: string | null) => void
}

export const SystemPromptEditor = memo(function SystemPromptEditor({
  userInstructions,
  authorProfile,
  gameRules,
  systemPromptOverride,
  onUserInstructionsChange,
  onAuthorProfileChange,
  onGameRulesChange,
  onSystemPromptChange,
}: SystemPromptEditorProps) {
  const {
    systemPrompt,
    isLoading: isLoadingSystemPrompt,
    savePrompt,
    restore: restoreSystemPrompt,
    updatePrompt,
  } = useSystemPrompt()

  const {
    authorProfile: authorProfileState,
    saveProfile,
    restore: restoreAuthorProfile,
    updateProfile,
  } = useAuthorProfile()

  const toast = useToast()

  // Synchroniser le state du hook avec le prop (si le prop change depuis l'extérieur)
  // Mais ne pas écraser au chargement initial si le state local a déjà une valeur depuis localStorage
  const hasInitialized = useRef(false)
  useEffect(() => {
    // Au premier rendu, si le state local a une valeur mais le prop est vide, 
    // synchroniser le prop avec le state local (le hook local a chargé depuis localStorage)
    if (!hasInitialized.current) {
      hasInitialized.current = true
      if (authorProfileState && !authorProfile) {
        onAuthorProfileChange(authorProfileState)
        return
      }
    }
    // Après l'initialisation, synchroniser le state local avec le prop
    if (authorProfile !== authorProfileState) {
      updateProfile(authorProfile)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorProfile]) // Seulement quand le prop change (onAuthorProfileChange et updateProfile sont stables)

  const [sceneTemplates, setSceneTemplates] = useState<configAPI.SceneInstructionTemplate[]>([])
  const [authorTemplates, setAuthorTemplates] = useState<configAPI.AuthorProfileTemplate[]>([])
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [selectedSceneTemplateId, setSelectedSceneTemplateId] = useState<string | null>(null)
  const [selectedAuthorTemplateId, setSelectedAuthorTemplateId] = useState<string | null>(null)
  const [showTemplatePreview, setShowTemplatePreview] = useState<string | null>(null)

  const [localAuthorTemplates, setLocalAuthorTemplates] = useState<LocalNamedTemplate[]>(() =>
    listLocalAuthorTemplates()
  )
  const [localSceneTemplates, setLocalSceneTemplates] = useState<LocalNamedTemplate[]>(() =>
    listLocalSceneTemplates()
  )
  const [selectedLocalAuthorId, setSelectedLocalAuthorId] = useState('')
  const [selectedLocalSceneId, setSelectedLocalSceneId] = useState('')
  const [authorSaveAsOpen, setAuthorSaveAsOpen] = useState(false)
  const [authorSaveAsName, setAuthorSaveAsName] = useState('')
  const [sceneSaveAsOpen, setSceneSaveAsOpen] = useState(false)
  const [sceneSaveAsName, setSceneSaveAsName] = useState('')

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    setIsLoadingTemplates(true)
    try {
      const [sceneResponse, authorResponse] = await Promise.all([
        configAPI.getSceneInstructionTemplates(),
        configAPI.getAuthorProfileTemplates(),
      ])
      setSceneTemplates(sceneResponse.templates)
      setAuthorTemplates(authorResponse.templates)
    } catch (err) {
      console.error('Erreur lors du chargement des templates:', err)
    } finally {
      setIsLoadingTemplates(false)
    }
  }

  const handleAuthorTemplateClick = useCallback((template: configAPI.AuthorProfileTemplate) => {
    if (selectedAuthorTemplateId === template.id) {
      setShowTemplatePreview(template.id)
    } else {
      setSelectedAuthorTemplateId(template.id)
      // Sauvegarder explicitement dans localStorage et mettre à jour les deux hooks
      saveProfile(template.profile)
      updateProfile(template.profile)
      onAuthorProfileChange(template.profile)
    }
  }, [selectedAuthorTemplateId, saveProfile, updateProfile, onAuthorProfileChange])

  const handleSystemPromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value
      updatePrompt(value)
      onSystemPromptChange(value || null)
    },
    [updatePrompt, onSystemPromptChange]
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

  const handleSaveSystemPrompt = useCallback(() => {
    const currentPrompt = systemPromptOverride || systemPrompt || ''
    try {
      savePrompt(currentPrompt)
      onSystemPromptChange(currentPrompt || null)
      toast('Prompt système sauvegardé avec succès', 'success')
    } catch (err) {
      console.error('Erreur lors de la sauvegarde:', err)
      toast('Erreur lors de la sauvegarde du prompt système', 'error')
    }
  }, [systemPromptOverride, systemPrompt, savePrompt, onSystemPromptChange, toast])

  const handleRestoreSystemPrompt = useCallback(async () => {
    const restoredPrompt = await restoreSystemPrompt()
    // Utiliser la valeur restaurée directement
    if (restoredPrompt) {
      onSystemPromptChange(restoredPrompt)
    } else {
      onSystemPromptChange(null)
    }
  }, [restoreSystemPrompt, onSystemPromptChange])

  const handleSaveAuthorProfile = useCallback(() => {
    const currentProfile = authorProfile || ''
    try {
      saveProfile(currentProfile)
      onAuthorProfileChange(currentProfile)
      toast('Profil d\'auteur sauvegardé avec succès', 'success')
    } catch (err) {
      console.error('Erreur lors de la sauvegarde:', err)
      toast('Erreur lors de la sauvegarde du profil d\'auteur', 'error')
    }
  }, [authorProfile, saveProfile, onAuthorProfileChange, toast])

  const handleRestoreAuthorProfile = useCallback(() => {
    restoreAuthorProfile()
    // Le hook met à jour son state, on doit le lire après restauration
    setTimeout(() => {
      const saved = localStorage.getItem('dialogue_generator_saved_author_profile')
      onAuthorProfileChange(saved || '')
    }, 0)
  }, [restoreAuthorProfile, onAuthorProfileChange])

  const handleSaveSceneInstructions = useCallback(() => {
    try {
      localStorage.setItem('dialogue_generator_saved_scene_instructions', userInstructions)
      toast('Brief de scène sauvegardé avec succès', 'success')
    } catch (err) {
      console.error('Erreur lors de la sauvegarde:', err)
      toast('Erreur lors de la sauvegarde du brief de scène', 'error')
    }
  }, [userInstructions, toast])

  const handleRestoreSceneInstructions = useCallback(() => {
    try {
      const saved = localStorage.getItem('dialogue_generator_saved_scene_instructions')
      if (saved) {
        onUserInstructionsChange(saved)
      }
    } catch (err) {
      console.warn('Impossible de restaurer le brief de scène:', err)
    }
  }, [onUserInstructionsChange])

  const refreshLocalAuthorTemplates = useCallback(() => {
    setLocalAuthorTemplates(listLocalAuthorTemplates())
  }, [])

  const refreshLocalSceneTemplates = useCallback(() => {
    setLocalSceneTemplates(listLocalSceneTemplates())
  }, [])

  const handleConfirmAuthorSaveAs = useCallback(() => {
    try {
      upsertLocalAuthorTemplate(authorSaveAsName, authorProfile)
      refreshLocalAuthorTemplates()
      setAuthorSaveAsOpen(false)
      setAuthorSaveAsName('')
      toast('Modèle d\'auteur local enregistré', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement', 'error')
    }
  }, [authorSaveAsName, authorProfile, refreshLocalAuthorTemplates, toast])

  const handleConfirmSceneSaveAs = useCallback(() => {
    try {
      upsertLocalSceneTemplate(sceneSaveAsName, userInstructions)
      refreshLocalSceneTemplates()
      setSceneSaveAsOpen(false)
      setSceneSaveAsName('')
      toast('Brief de scène enregistré comme modèle local', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Erreur lors de l\'enregistrement', 'error')
    }
  }, [sceneSaveAsName, userInstructions, refreshLocalSceneTemplates, toast])

  const isNarrow = useGenerationPanelNarrow()
  const genChrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable

  const tabs: Tab[] = [
    {
      id: 'user-instructions',
      label: 'Instructions de Scène',
      content: (
        <div style={{ padding: genChrome.tabInnerPadding, minWidth: 0 }}>
          {/* Templates de scène */}
          <div style={{ marginBottom: '1rem' }}>
            {isLoadingTemplates ? (
              <div style={{ color: theme.text.secondary, fontSize: '0.85rem' }}>
                Chargement des templates...
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexWrap: isNarrow ? 'wrap' : 'nowrap',
                  gap: `${genChrome.controlGapRem}rem`,
                  alignItems: 'center',
                }}
              >
                <label
                  htmlFor="scene-template-select"
                  style={{
                    color: theme.text.primary,
                    fontSize: `${genChrome.labelFontRem}rem`,
                    fontWeight: 500,
                    whiteSpace: isNarrow ? 'normal' : 'nowrap',
                  }}
                >
                  Templates de scène:
                </label>
                <StyledSelect
                  id="scene-template-select"
                  value={selectedSceneTemplateId || ''}
                  onChange={(e) => {
                    const templateId = e.target.value
                    if (templateId) {
                      const template = sceneTemplates.find(t => t.id === templateId)
                      if (template) {
                        setSelectedSceneTemplateId(template.id)
                        onUserInstructionsChange(template.instructions)
                      }
                    } else {
                      setSelectedSceneTemplateId(null)
                    }
                  }}
                  style={{
                    width: isNarrow ? '100%' : '220px',
                    minWidth: 0,
                    flex: isNarrow ? '1 1 100%' : undefined,
                    padding: genChrome.selectTriggerPadding,
                    boxSizing: 'border-box',
                    border: `1px solid ${theme.input.border}`,
                    borderRadius: '4px',
                    backgroundColor: theme.input.background,
                    color: theme.input.color,
                    fontSize: `${genChrome.selectTextFontRem}rem`,
                    cursor: 'pointer',
                  }}
                  title={selectedSceneTemplateId
                    ? sceneTemplates.find(t => t.id === selectedSceneTemplateId)?.description
                    : 'Sélectionner un template de scène'}
                >
                  <option value="">-- Sélectionner un template --</option>
                  {sceneTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </StyledSelect>
                {selectedSceneTemplateId && (
                  <button
                    onClick={() => setShowTemplatePreview(selectedSceneTemplateId)}
                    style={{
                      padding: genChrome.buttonPadding,
                      border: `1px solid ${theme.border.primary}`,
                      borderRadius: '4px',
                      backgroundColor: theme.button.default.background,
                      color: theme.button.default.color,
                      cursor: 'pointer',
                      fontSize: `${genChrome.buttonFontRem}rem`,
                      whiteSpace: 'nowrap',
                    }}
                    title="Voir le contenu complet du template"
                  >
                    Aperçu
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Prévisualisation du template */}
          {showTemplatePreview && sceneTemplates.find(t => t.id === showTemplatePreview) && (
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
                  {sceneTemplates.find(t => t.id === showTemplatePreview)?.name}
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
                {sceneTemplates.find(t => t.id === showTemplatePreview)?.instructions}
              </pre>
            </div>
          )}

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
              Mes briefs (ce navigateur)
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
                aria-label="Charger un brief de scène local"
                value={selectedLocalSceneId}
                onChange={(e) => {
                  const id = e.target.value
                  setSelectedLocalSceneId(id)
                  if (!id) return
                  const t = localSceneTemplates.find((x) => x.id === id)
                  if (t) {
                    onUserInstructionsChange(t.body)
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
                {localSceneTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  setSceneSaveAsOpen(true)
                  setSceneSaveAsName('')
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
              >
                Enregistrer sous…
              </button>
              {selectedLocalSceneId ? (
                <button
                  type="button"
                  onClick={() => {
                    deleteLocalSceneTemplate(selectedLocalSceneId)
                    refreshLocalSceneTemplates()
                    setSelectedLocalSceneId('')
                    toast('Brief local supprimé', 'success')
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
              Stockage local ; même nom = remplacement.
            </div>
          </div>

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
              htmlFor="user-instructions-textarea"
              style={{
                color: theme.text.primary,
                fontSize: `${genChrome.labelFontRem}rem`,
                fontWeight: 500,
                flex: isNarrow ? '1 1 100%' : undefined,
              }}
            >
              Brief de scène:
            </label>
            <div style={{ display: 'flex', gap: `${genChrome.controlGapRem}rem`, flexWrap: 'wrap' }}>
              <button
                onClick={handleSaveSceneInstructions}
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
                title="Sauvegarde le brief de scène actuel"
              >
                Sauvegarder
              </button>
              <button
                onClick={handleRestoreSceneInstructions}
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
          <FormField label="" htmlFor="user-instructions-textarea" style={{ marginBottom: 0 }}>
            <div>
              <textarea
                id="user-instructions-textarea"
                value={userInstructions}
                onChange={(e) => onUserInstructionsChange(e.target.value)}
                rows={8}
                placeholder="Ex: Bob doit annoncer à Alice qu'il part à l'aventure. Ton désiré: Héroïque. Inclure une condition sur la compétence 'Charisme' de Bob."
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: '0.25rem',
                  fontSize: `${isNarrow ? 0.7 : 0.75}rem`,
                  color: theme.text.secondary,
                }}
              >
                {userInstructions.length} caractères
                {userInstructions.length > 0 && (
                  <span style={{ marginLeft: '0.5rem' }}>
                    (~{Math.ceil(userInstructions.length / 4)} tokens)
                  </span>
                )}
              </div>
            </div>
          </FormField>
          {sceneSaveAsOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="scene-save-as-title"
              style={{
                position: 'fixed',
                inset: 0,
                backgroundColor: 'rgba(0,0,0,0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10050,
              }}
              onClick={() => setSceneSaveAsOpen(false)}
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
                <h4 id="scene-save-as-title" style={{ marginTop: 0, color: theme.text.primary }}>
                  Enregistrer le brief sous…
                </h4>
                <input
                  type="text"
                  value={sceneSaveAsName}
                  onChange={(e) => setSceneSaveAsName(e.target.value)}
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
                    onClick={() => setSceneSaveAsOpen(false)}
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
                    onClick={handleConfirmSceneSaveAs}
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
      ),
    },
    {
      id: 'author-profile',
      label: 'Auteur (global)',
      content: (
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
      ),
    },
    {
      id: 'game-rules',
      label: 'Règles du jeu',
      content: (
        <div style={{ padding: '1rem' }}>
          <details>
            <summary style={{ cursor: 'pointer', color: theme.text.primary, fontWeight: 600 }}>
              Règles systémiques appliquées au dialogue
            </summary>
            <div style={{ marginTop: '0.75rem' }}>
              <textarea
                id="game-rules-textarea"
                value={gameRules}
                onChange={(e) => onGameRulesChange(e.target.value)}
                rows={8}
                placeholder="Ex: Influence/Respect uniquement quand la relation PNJ le justifie. Axes de réputation: Admiration, Prestige, Crainte. Inclure des options liées aux traits requis et aux gains systémiques quand pertinent."
                style={{
                  width: '100%',
                  padding: '0.65rem 0.75rem',
                  boxSizing: 'border-box',
                  backgroundColor: theme.input.background,
                  border: `1px solid ${theme.input.border}`,
                  color: theme.input.color,
                  borderRadius: '6px',
                  fontFamily: 'inherit',
                  fontSize: '0.9rem',
                  resize: 'vertical',
                  lineHeight: 1.55,
                }}
              />
            </div>
          </details>
        </div>
      ),
    },
    {
      id: 'system-prompt',
      label: 'Système LLM (avancé)',
      content: (
        <div style={{ padding: genChrome.tabInnerPadding, minWidth: 0 }}>
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              backgroundColor: theme.background.secondary,
              border: `1px solid ${theme.border.primary}`,
              borderRadius: '4px',
              fontSize: '0.85rem',
              color: theme.text.secondary,
            }}
          >
            <strong style={{ color: theme.text.primary }}>⚠️ Zone avancée</strong>
            <br />
            Modifiez uniquement si vous savez ce que vous faites. Ce prompt définit l'identité technique du LLM et les règles de format de sortie.
          </div>

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
              htmlFor="system-prompt-textarea"
              style={{
                color: theme.text.primary,
                fontSize: `${genChrome.labelFontRem}rem`,
                fontWeight: 500,
                flex: isNarrow ? '1 1 100%' : undefined,
              }}
            >
              Prompt Système Principal:
            </label>
            <div style={{ display: 'flex', gap: `${genChrome.controlGapRem}rem`, flexWrap: 'wrap' }}>
              <button
                onClick={handleSaveSystemPrompt}
                disabled={isLoadingSystemPrompt}
                style={{
                  padding: genChrome.buttonPadding,
                  border: `1px solid ${theme.border.secondary}`,
                  borderRadius: '6px',
                  backgroundColor: theme.button.default.background,
                  color: theme.button.default.color,
                  cursor: isLoadingSystemPrompt ? 'not-allowed' : 'pointer',
                  opacity: isLoadingSystemPrompt ? 0.6 : 1,
                  fontSize: `${genChrome.buttonFontRem}rem`,
                  fontWeight: 600,
                }}
                title="Sauvegarde le prompt système actuel"
              >
                Sauvegarder
              </button>
              <button
                onClick={handleRestoreSystemPrompt}
                disabled={isLoadingSystemPrompt}
                style={{
                  padding: genChrome.buttonPadding,
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '6px',
                  backgroundColor: theme.button.default.background,
                  color: theme.button.default.color,
                  cursor: isLoadingSystemPrompt ? 'not-allowed' : 'pointer',
                  opacity: isLoadingSystemPrompt ? 0.6 : 1,
                  fontSize: `${genChrome.buttonFontRem}rem`,
                  fontWeight: 400,
                }}
                title="Restaure la dernière version sauvegardée (ou le défaut si rien n'est sauvegardé)"
              >
                Restaurer
              </button>
            </div>
          </div>
          <FormField label="" htmlFor="system-prompt-textarea">
            <textarea
              id="system-prompt-textarea"
              value={systemPromptOverride || systemPrompt || ''}
              onChange={handleSystemPromptChange}
              rows={12}
              placeholder="Modifiez le prompt système principal envoyé au LLM. Ce prompt guide le comportement général de l'IA et le format de sortie."
              style={{
                width: '100%',
                padding: '0.65rem 0.75rem',
                boxSizing: 'border-box',
                backgroundColor: theme.input.background,
                border: `1px solid ${theme.input.border}`,
                color: theme.input.color,
                borderRadius: '6px',
                fontFamily: 'monospace',
                fontSize: isNarrow ? '0.78rem' : '0.85rem',
                resize: 'vertical',
                lineHeight: 1.55,
              }}
            />
          </FormField>
        </div>
      ),
    },
  ]

  const [activeTabId, setActiveTabId] = useState(tabs[0].id)

  return (
    <div
      style={{
        marginBottom: '1rem',
        border: `1px solid ${theme.border.primary}`,
        borderRadius: '8px',
        backgroundColor: theme.background.tertiary,
      }}
    >
      <Tabs
        variant="segmented"
        tabs={tabs}
        activeTabId={activeTabId}
        onTabChange={setActiveTabId}
        style={{ flex: 'none' }}
      />
    </div>
  )
})
