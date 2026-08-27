/**
 * Brief de la scène — contenu de l'onglet « Brief » de la colonne de génération.
 *
 * Ne porte plus que le brief. Les briefs enregistrés sont devenus des templates
 * (objet serveur unique, statut privé/partagé) ; le profil d'auteur, les règles du
 * jeu et le prompt système vivent dans le tiroir de réglages.
 */
import { memo, useRef } from 'react'
import { FormField } from '../shared/FormField'
import { useAutoGrowTextarea } from '../../hooks/useAutoGrowTextarea'
import { useViewportFraction } from '../../hooks/useViewportFraction'
import { theme } from '../../theme'
import { generationPanelChrome } from '../../theme/responsiveChrome'
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext'
import { redesignReadingColumn, redesignText } from '../../theme/redesignTokens'
import { useUiLayoutStore } from '../../store/uiLayoutStore'

export interface SystemPromptEditorProps {
  userInstructions: string
  onUserInstructionsChange: (instructions: string) => void
}

export const SystemPromptEditor = memo(function SystemPromptEditor({
  userInstructions,
  onUserInstructionsChange,
}: SystemPromptEditorProps) {
  const isNarrow = useGenerationPanelNarrow()
  const writingMode = useUiLayoutStore((s) => s.writingMode)
  const genChrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable

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
          {/* Les briefs enregistrés sont devenus des templates (objet serveur unique,
              statut privé/partagé). La sauvegarde explicite faisait doublon avec
              l'autosave continu du brouillon : l'onglet ne porte plus que le brief. */}
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
