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
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext'

export interface SystemPromptEditorProps {
  userInstructions: string
  authorProfile: string
  systemPromptOverride: string | null
  onUserInstructionsChange: (instructions: string) => void
  onAuthorProfileChange: (profile: string) => void
  onSystemPromptChange: (prompt: string | null) => void
}

export const SystemPromptEditor = memo(function SystemPromptEditor({
  userInstructions,
  authorProfile,
  systemPromptOverride,
  onUserInstructionsChange,
  onAuthorProfileChange,
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
                <select
                  id="scene-template-select"
                  value={selectedSceneTemplateId || ''}
                  onChange={(e) => {
                    const templateId = e.target.value
                    if (templateId) {
                      const template = sceneTemplates.find(t => t.id === templateId)
                      if (template) {
                        setSelectedSceneTemplateId(template.id)
                        // Remplacer les instructions par le contenu du template
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
                </select>
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
