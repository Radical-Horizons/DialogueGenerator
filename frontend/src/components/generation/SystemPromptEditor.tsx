/**
 * Brief de la scène — contenu de l'onglet « Brief » de la colonne de génération.
 *
 * Ce composant ne route plus d'onglets : la barre appartient à `GenerationPanel`,
 * qui détient déjà les bascules flags et templates. Le double propriétaire d'état
 * était la cause du bug « le lien templates n'ouvre pas le panneau templates ».
 *
 * Le profil d'auteur, les règles du jeu et le prompt système ont rejoint le tiroir
 * de réglages (`GenerationSettingsDrawer`) : ils décrivent le comportement du LLM,
 * pas ce qu'on lui demande d'écrire.
 */
import { memo, useCallback, useState, useEffect, useRef } from 'react'
import { FormField } from '../shared/FormField'
import { useAutoGrowTextarea } from '../../hooks/useAutoGrowTextarea'
import { useViewportFraction } from '../../hooks/useViewportFraction'
import { useToast } from '../shared'
import { theme } from '../../theme'
import { generationPanelChrome } from '../../theme/responsiveChrome'
import * as configAPI from '../../api/config'
import {
  deleteLocalSceneTemplate,
  listLocalSceneTemplates,
  upsertLocalSceneTemplate,
  type LocalNamedTemplate,
} from '../../utils/localNamedTemplates'
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext'
import { StyledSelect } from '../shared/StyledSelect'
import { redesignFont, redesignReadingColumn, redesignText } from '../../theme/redesignTokens'
import { useUiLayoutStore } from '../../store/uiLayoutStore'

export interface SystemPromptEditorProps {
  userInstructions: string
  onUserInstructionsChange: (instructions: string) => void
}

export const SystemPromptEditor = memo(function SystemPromptEditor({
  userInstructions,
  onUserInstructionsChange,
}: SystemPromptEditorProps) {
  const toast = useToast()
  const isNarrow = useGenerationPanelNarrow()
  const writingMode = useUiLayoutStore((s) => s.writingMode)
  const genChrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable

  const [sceneTemplates, setSceneTemplates] = useState<configAPI.SceneInstructionTemplate[]>([])
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [selectedSceneTemplateId, setSelectedSceneTemplateId] = useState<string | null>(null)
  const [showTemplatePreview, setShowTemplatePreview] = useState<string | null>(null)
  const [localSceneTemplates, setLocalSceneTemplates] = useState<LocalNamedTemplate[]>(() =>
    listLocalSceneTemplates()
  )
  const [selectedLocalSceneId, setSelectedLocalSceneId] = useState('')
  const [sceneSaveAsOpen, setSceneSaveAsOpen] = useState(false)
  const [sceneSaveAsName, setSceneSaveAsName] = useState('')

  useEffect(() => {
    let cancelled = false
    setIsLoadingTemplates(true)
    configAPI
      .getSceneInstructionTemplates()
      .then((res) => {
        if (!cancelled) setSceneTemplates(res.templates)
      })
      .catch((err) => console.error('Erreur lors du chargement des briefs:', err))
      .finally(() => {
        if (!cancelled) setIsLoadingTemplates(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const refreshLocalSceneTemplates = useCallback(() => {
    setLocalSceneTemplates(listLocalSceneTemplates())
  }, [])

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

  const handleConfirmSceneSaveAs = useCallback(() => {
    try {
      upsertLocalSceneTemplate(sceneSaveAsName, userInstructions)
      refreshLocalSceneTemplates()
      setSceneSaveAsOpen(false)
      setSceneSaveAsName('')
      toast('Brief de scène enregistré comme modèle local', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erreur lors de l'enregistrement", 'error')
    }
  }, [sceneSaveAsName, userInstructions, refreshLocalSceneTemplates, toast])

  /**
   * Le brief prend la hauteur de son texte plutôt qu'un nombre de lignes fixe.
   * Plafond en `vh` : au-delà, c'est la zone qui défile, pas l'écran entier.
   */
  const briefRef = useRef<HTMLTextAreaElement>(null)
  const briefMaxHeightPx = useViewportFraction(writingMode ? 0.58 : 0.46, {
    min: 200,
    max: writingMode ? 760 : 560,
  })
  useAutoGrowTextarea(briefRef, userInstructions, {
    minHeightPx: 200,
    maxHeightPx: briefMaxHeightPx,
  })

  const briefContent = (
        <div style={{ padding: genChrome.tabInnerPadding, minWidth: 0 }}>
          {/* 1c : le brief occupe la colonne ; les briefs enregistrés passent en repli.
              2c : en mode écriture, même ce repli disparaît — il ne reste que le texte. */}
          <details
            data-testid="brief-saved-briefs"
            style={{ marginBottom: '1rem' }}
          >
            <summary
              style={{
                cursor: 'pointer',
                fontFamily: redesignFont.mono,
                fontSize: '10px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: redesignText.label,
                marginBottom: '0.6rem',
              }}
            >
              Briefs enregistrés
            </summary>
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

            {/* Enveloppe sans `display` inline : un style inline l'emporterait sur la
                règle UA qui replie un `<details>`, et la rangée resterait visible
                repli fermé (piège déjà consigné dans ui_redesign_2026.md). */}
            <div>
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
                {/* L'étiquette « Brief du premier nœud » vit dans le bandeau de section
                    (écran 1c) : la répéter ici ferait doublon. */}
                <span aria-hidden />
                {/* 2c : la sauvegarde explicite du brief sort de l'écran d'écriture — le
                    brouillon est déjà sauvegardé en continu. */}
                <div
                  style={{
                    display: 'flex',
                    gap: `${genChrome.controlGapRem}rem`,
                    flexWrap: 'wrap',
                  }}
                >
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
            </div>
          </details>
          <FormField label="" htmlFor="user-instructions-textarea" style={{ marginBottom: 0 }}>
            <div
              style={{
                // La largeur de lecture est gérée par la colonne (marges flexibles
                // plafonnées) : un `maxWidth` ici bridait le brief à 660 px alors
                // que la colonne lui en offrait 920.
                maxWidth: writingMode ? redesignReadingColumn.writingMode : undefined,
              }}
            >
              <textarea
                ref={briefRef}
                className="dg-scroll-slim"
                id="user-instructions-textarea"
                value={userInstructions}
                onChange={(e) => onUserInstructionsChange(e.target.value)}
                placeholder="Ex: Bob doit annoncer à Alice qu'il part à l'aventure. Ton désiré: Héroïque. Inclure une condition sur la compétence 'Charisme' de Bob."
                style={{
                  width: '100%',
                  // 1c : surface d'écriture, pas un champ de formulaire — filet haut, pas de cadre.
                  padding: '15px 0 0',
                  boxSizing: 'border-box',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderTop: '1px solid rgba(255,255,255,0.09)',
                  color: redesignText.body,
                  borderRadius: 0,
                  fontFamily: 'inherit',
                  // 2c : le brief passe à 17px en mode écriture.
                  fontSize: isNarrow
                    ? `${genChrome.textareaFontRem}rem`
                    : writingMode
                      ? '17px'
                      : '15.5px',
                  // La hauteur suit le texte (`useAutoGrowTextarea`) : une poignée
                  // de redimensionnement se battrait avec elle à chaque frappe.
                  resize: 'none',
                  lineHeight: isNarrow ? 1.55 : 1.72,
                  outline: 'none',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: '0.6rem',
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
  )

  return (
    <div
      data-testid="system-prompt-editor-root"
      style={{
        marginBottom: '1.5rem',
        border: 'none',
        borderRadius: 0,
        backgroundColor: 'transparent',
      }}
    >
      <div data-testid="brief-active-panel">{briefContent}</div>
    </div>
  )
})
