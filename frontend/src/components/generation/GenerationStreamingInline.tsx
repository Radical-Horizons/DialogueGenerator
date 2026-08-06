/**
 * Bloc de progression de génération LLM (streaming SSE), rendu **dans le flux** de l'écran.
 *
 * Issu de l'ancienne `GenerationProgressModal` : même logique de parsing du JSON partiel,
 * même barre d'étapes, mêmes actions (interrompre / fermer). Seul le chrome change —
 * plus de backdrop ni de conteneur `position: fixed` pour l'état déployé.
 */
import { useEffect, useMemo } from 'react'
import { theme } from '../../theme'
import { useNarrowInlineSize } from '../../hooks/useNarrowInlineSize'
import { modalTypography } from '../../theme/responsiveChrome'
import { remSize } from '../../theme/uiTypography'
import {
  redesignAccent,
  redesignFont,
  redesignHairline,
  redesignMonoLabelStyle,
  redesignRadius,
  redesignSpacing,
  redesignText,
} from '../../theme/redesignTokens'
import { ReasoningTraceViewer } from './ReasoningTraceViewer'
import type { ReasoningTrace } from '../../types/api'

/** Nom de l'animation du curseur de streaming (déclarée localement, pas de CSS global). */
const STREAMING_CURSOR_ANIMATION = 'generation-streaming-blink'

/**
 * Extrait une valeur de chaîne JSON partielle en gérant les échappements.
 *
 * Parse caractère par caractère pour gérer correctement \n, \", \\, etc.
 * Accepte les chaînes non fermées (texte partiel).
 *
 * @param content - Contenu JSON partiel
 * @param fieldName - Nom du champ à extraire (ex: "title", "line", "speaker")
 * @param contextAfter - Chaîne qui doit apparaître avant le champ (pour vérifier le contexte)
 * @returns Valeur extraite ou null si non trouvée
 */
function extractPartialStringValue(
  content: string,
  fieldName: string,
  contextAfter?: string
): string | null {
  // Chercher le champ dans le bon contexte
  let searchStart = 0
  if (contextAfter) {
    const contextIndex = content.indexOf(contextAfter)
    if (contextIndex === -1) return null
    searchStart = contextIndex + contextAfter.length
  }

  const fieldPattern = `"${fieldName}"\\s*:\\s*"`
  const fieldRegex = new RegExp(fieldPattern, 'g')
  fieldRegex.lastIndex = searchStart

  const match = fieldRegex.exec(content)
  if (!match) return null

  // Position après le guillemet d'ouverture
  let i = match.index + match[0].length
  let text = ''
  let escaped = false

  // Parser caractère par caractère jusqu'à la fin ou un guillemet non échappé
  while (i < content.length) {
    const char = content[i]

    if (escaped) {
      // Gérer les séquences d'échappement
      if (char === 'n') {
        text += '\n'
      } else if (char === '\\') {
        text += '\\'
      } else if (char === '"') {
        text += '"'
      } else if (char === 't') {
        text += '\t'
      } else if (char === 'r') {
        text += '\r'
      } else {
        // Autre séquence d'échappement (u pour unicode, etc.) - garder tel quel pour l'instant
        text += char
      }
      escaped = false
    } else if (char === '\\') {
      // Backslash trouvé - prochain caractère est échappé
      escaped = true
    } else if (char === '"') {
      // Guillemet fermant trouvé - chaîne complète
      break
    } else {
      // Caractère normal
      text += char
    }
    i++
  }

  // Si on arrive à la fin sans guillemet fermant, c'est du texte partiel (OK)
  // Si le texte se termine par un backslash isolé, l'enlever (échappement incomplet)
  if (text.endsWith('\\') && !text.endsWith('\\\\')) {
    text = text.slice(0, -1)
  }

  return text || null
}

/**
 * Parse le JSON partiel et formate l'affichage pour le streaming.
 *
 * Utilise un mini-parser qui vérifie le contexte et gère les échappements
 * pour extraire les valeurs même si le JSON n'est pas complet.
 */
function formatStreamingContent(rawContent: string): {
  title?: string
  speaker?: string
  line?: string
  choices?: Array<{ text: string; test?: string }>
  rawJson: string
} {
  if (!rawContent || !rawContent.trim()) {
    return { rawJson: rawContent }
  }

  // Essayer d'abord de parser le JSON complet (plus rapide si disponible)
  try {
    let jsonStr = rawContent.trim()

    // Compter les accolades pour compléter si nécessaire
    const openBraces = (jsonStr.match(/{/g) || []).length
    const closeBraces = (jsonStr.match(/}/g) || []).length
    const openBrackets = (jsonStr.match(/\[/g) || []).length
    const closeBrackets = (jsonStr.match(/\]/g) || []).length

    // Compléter le JSON partiel si nécessaire (seulement si on a assez de contenu)
    if (openBraces > closeBraces && jsonStr.length > 50) {
      jsonStr += '}'.repeat(openBraces - closeBraces)
    }
    if (openBrackets > closeBrackets && jsonStr.length > 50) {
      jsonStr += ']'.repeat(openBrackets - closeBrackets)
    }

    const data = JSON.parse(jsonStr)

    return {
      title: data.title,
      speaker: data.node?.speaker,
      line: data.node?.line,
      choices: data.node?.choices,
      rawJson: rawContent,
    }
  } catch (e) {
    // Si le parsing échoue, utiliser le mini-parser pour extraire les valeurs partiellement

    // 1. Extraire title (à la racine)
    const title = extractPartialStringValue(rawContent, 'title')

    // 2. Vérifier qu'on a un node avant d'extraire speaker et line
    const nodeIndex = rawContent.indexOf('"node"')
    let speaker: string | null = null
    let line: string | null = null

    if (nodeIndex !== -1) {
      // Extraire speaker et line dans le contexte de node
      const nodeContext = rawContent.substring(nodeIndex)
      speaker = extractPartialStringValue(nodeContext, 'speaker')
      line = extractPartialStringValue(nodeContext, 'line')
    }

    // 3. Extraire les choix (chercher "text" dans le contexte de "choices")
    const choices: Array<{ text: string; test?: string }> = []
    if (nodeIndex !== -1) {
      const nodeContext = rawContent.substring(nodeIndex)
      const choicesIndex = nodeContext.indexOf('"choices"')
      if (choicesIndex !== -1) {
        const choicesContext = nodeContext.substring(choicesIndex)

        // Chercher toutes les occurrences de "text" dans le contexte des choix
        // (chaque choix a un champ "text")
        let searchIndex = 0
        for (;;) {
          const textValue = extractPartialStringValue(choicesContext.substring(searchIndex), 'text')
          if (!textValue) break
          const textFieldPos = choicesContext.indexOf(`"text"`, searchIndex)
          if (textFieldPos === -1) break
          const afterText = choicesContext.substring(textFieldPos)
          const testValue = extractPartialStringValue(afterText, 'test')
          choices.push({
            text: textValue,
            test: testValue || undefined,
          })
          searchIndex = textFieldPos + `"text"`.length + textValue.length + 10
          if (searchIndex >= choicesContext.length) break
        }
      }
    }

    // Si on a extrait au moins un champ, retourner le résultat formaté
    if (title || speaker || line || choices.length > 0) {
      return {
        title: title || undefined,
        speaker: speaker || undefined,
        line: line || undefined,
        choices: choices.length > 0 ? choices : undefined,
        rawJson: rawContent,
      }
    }

    // Si tout échoue, retourner le contenu brut
    return { rawJson: rawContent }
  }
}

/**
 * Interprète le markdown basique et les séquences d'échappement.
 */
function interpretMarkdown(text: string): string {
  if (!text) return ''

  // Remplacer \n par de vrais sauts de ligne
  return text.replace(/\\n/g, '\n')
}

/**
 * Échappe les caractères HTML dangereux avant un rendu via innerHTML.
 */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;'
      case '<':
        return '&lt;'
      case '>':
        return '&gt;'
      case '"':
        return '&quot;'
      case '\'':
        return '&#39;'
      default:
        return char
    }
  })
}

/**
 * Convertit la ligne streamée en HTML sûr (markdown basique uniquement).
 */
function renderStreamingLineHtml(text: string): string {
  const escaped = escapeHtml(interpretMarkdown(text))

  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>')
}

export interface GenerationStreamingInlineProps {
  /** Le bloc est-il monté dans le flux (génération en cours, terminée, en erreur ou interrompue) */
  isActive: boolean
  /** Contenu streamé du LLM (caractère par caractère) */
  content: string
  /** Étape actuelle : Prompting | Generating | Validating | Complete */
  currentStep: 'Prompting' | 'Generating' | 'Validating' | 'Complete'
  /** Affichage réduit (badge compact) */
  isMinimized?: boolean
  /** Message d'erreur si génération échouée */
  error?: string | null
  /** État d'interruption en cours (Task 4 - Story 0.8) */
  isInterrupting?: boolean
  /** Trace de raisonnement à afficher sous le contenu streamé (réutilise `ReasoningTraceViewer`) */
  reasoningTrace?: ReasoningTrace | null
  /** Callback pour interrompre la génération */
  onInterrupt: () => void
  /**
   * Écran 2a — seconde sortie : couper l'appel mais **garder** le texte déjà streamé
   * au lieu de le jeter. Sans ce callback, le bouton n'est pas rendu.
   */
  onKeepPartial?: () => void
  /** Callback pour réduire/agrandir le bloc */
  onMinimize: () => void
  /** Callback pour fermer le bloc (après complétion) */
  onClose: () => void
}

/**
 * Une interruption n'est pas un échec : le texte déjà streamé doit rester lisible,
 * contrairement à une vraie erreur de génération qui remplace le résultat.
 */
function isInterruptionNotice(message: string): boolean {
  return message.includes('Interruption') || message.includes('interrompue')
}

/**
 * Curseur de streaming : bloc accent clignotant, affiché tant que le texte arrive.
 */
function StreamingCursor() {
  return (
    <span
      aria-hidden
      data-testid="streaming-cursor"
      style={{
        display: 'inline-block',
        width: '1.5px',
        height: '18px',
        marginLeft: '2px',
        verticalAlign: 'text-bottom',
        backgroundColor: redesignAccent.base,
        animation: `${STREAMING_CURSOR_ANIMATION} 1s steps(1, end) infinite`,
      }}
    />
  )
}

/**
 * Texte partiel conservé lors d'une interruption (le travail déjà streamé n'est pas jeté).
 */
function StreamingPartialContent({ content }: { content: string }) {
  return (
    <pre
      data-testid="streaming-partial-content"
      style={{
        margin: 0,
        fontFamily: redesignFont.mono,
        fontSize: remSize('small'),
        color: theme.text.secondary,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        opacity: 0.7,
      }}
    >
      {content}
    </pre>
  )
}

/**
 * Bloc de progression de génération rendu dans le flux de l'écran.
 *
 * États :
 * - Déployé : filet accent + étapes + streaming visible, sans backdrop
 * - Réduit : badge compact (comportement conservé à l'identique de la modale)
 * - Terminé : bouton "Fermer" + auto-fermeture après 3s
 */
export function GenerationStreamingInline({
  isActive,
  content,
  currentStep,
  isMinimized = false,
  error = null,
  isInterrupting = false,  // Task 4 - Story 0.8
  reasoningTrace = null,
  onInterrupt,
  onKeepPartial,
  onMinimize,
  onClose,
}: GenerationStreamingInlineProps) {
  const { ref: panelRef } = useNarrowInlineSize(520)

  // Écran 2a : ÉCHAP interrompt — le raccourci est écrit sur le bouton, pas dans une aide.
  const canInterrupt = isActive && !isMinimized && currentStep !== 'Complete' && !error && !isInterrupting
  useEffect(() => {
    if (!canInterrupt) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onInterrupt()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [canInterrupt, onInterrupt])
  // Auto-fermeture 3 secondes après complétion (si pas réduit)
  useEffect(() => {
    if (currentStep === 'Complete' && !isMinimized && !error) {
      const timer = setTimeout(() => {
        onClose()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [currentStep, isMinimized, error, onClose])

  // Parser et formater le contenu streaming (AVANT tout return conditionnel pour respecter les règles des hooks)
  const formattedContent = useMemo(() => {
    if (!content || content.trim().length === 0) {
      return null
    }

    // Tenter de parser le JSON partiel
    const parsed = formatStreamingContent(content)

    // Si on a réussi à extraire des champs structurés, afficher formaté
    if (parsed.title || parsed.speaker || parsed.line || parsed.choices) {
      return parsed
    }

    // Sinon, retourner null pour afficher le contenu brut (fallback)
    return null
  }, [content])

  // Mapping des étapes pour la barre de progression — libellés mono FR (écran 2a)
  const stepLabels: Record<string, string> = {
    Prompting: 'PROMPT',
    Generating: 'ÉCRITURE',
    Validating: 'VALIDATION',
    Complete: 'TERMINÉ',
  }
  // Le curseur ne clignote que tant que du texte peut encore arriver.
  const isStreamingText = currentStep !== 'Complete' && !error && !isInterrupting

  if (!isActive) return null

  // Badge réduit (comportement inchangé depuis la modale : coin écran, clic pour ré-agrandir)
  if (isMinimized) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: '1rem',
          right: '1rem',
          backgroundColor: theme.background.panel,
          borderRadius: '8px',
          padding: '1rem',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          zIndex: 1000,
          minWidth: '200px',
          border: `1px solid ${theme.border.primary}`,
        }}
        onClick={onMinimize} // Clic sur le badge agrandit le bloc
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: error ? theme.state.error.color : redesignAccent.base,
              animation: error ? 'none' : 'pulse 1.5s ease-in-out infinite',
            }}
          />
          <span style={{ color: theme.text.primary, fontSize: `${modalTypography.comfortable.bodyFontRem}rem` }}>
            {error ? 'Erreur' : currentStep}
          </span>
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
        `}</style>
      </div>
    )
  }

  // Bloc déployé, dans le flux (pas d'overlay, pas de position fixed)
  return (
    <section
      ref={panelRef}
      data-testid="generation-streaming-inline"
      aria-live="polite"
      style={{
        // Écran 2a : le texte qui arrive **est** le contenu de la colonne — ni cadre,
        // ni fond, ni titre. L'état « génération en cours » est porté par le compteur
        // du header et la colonne TRACE, pas par le chrome d'une carte.
        marginBottom: `${redesignSpacing.lg}px`,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      <style>{`
        @keyframes ${STREAMING_CURSOR_ANIMATION} {
          50% { opacity: 0; }
        }
      `}</style>

      {/* 2a : ni titre ni barre d'étapes — l'étape courante se lit dans la colonne
          TRACE et le compteur du header. Une seule ligne mono suffit ici : elle nomme
          ce qui se passe et porte l'affordance « réduire », qui n'a pas d'autre accès. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: `${redesignSpacing.sm}px`,
          marginBottom: `${redesignSpacing.md}px`,
          flexShrink: 0,
        }}
      >
        <span
          data-testid="streaming-step-label"
          style={{
            ...redesignMonoLabelStyle,
            fontSize: '10px',
            letterSpacing: '0.12em',
            color: currentStep === 'Complete' ? redesignText.label : '#8fb0ff',
          }}
        >
          {isInterrupting
            ? 'INTERRUPTION…'
            : currentStep === 'Complete'
              ? 'TERMINÉ'
              : `${stepLabels[currentStep] ?? currentStep}…`}
        </span>
        {currentStep !== 'Complete' && (
          <button
            type="button"
            onClick={onMinimize}
            aria-label="Réduire"
            title="Réduire"
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              fontSize: '11.5px',
              color: redesignText.secondary,
            }}
          >
            réduire
          </button>
        )}
      </div>

      {/* Content - Streaming Text + Reasoning Trace */}
      <div
        style={{
          overflow: 'auto',
          maxHeight: '52vh',
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {error ? (
          <>
            <div
              style={{
                padding: '1rem',
                backgroundColor: isInterruptionNotice(error)
                  ? (theme.state.warning?.background || theme.input.background)
                  : theme.state.error.background,
                color: isInterruptionNotice(error)
                  ? (theme.state.warning?.color || theme.text.primary)
                  : theme.state.error.color,
                borderRadius: '4px',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
            {/* Interruption : le texte déjà écrit est conservé. Vraie erreur : elle remplace le résultat. */}
            {isInterruptionNotice(error) && content ? <StreamingPartialContent content={content} /> : null}
          </>
        ) : isInterrupting ? (
          <>
            <div
              style={{
                padding: '1rem',
                backgroundColor: theme.state.warning?.background || theme.input.background,
                color: theme.state.warning?.color || theme.text.primary,
                borderRadius: '4px',
                textAlign: 'center',
              }}
            >
              Interruption en cours...
            </div>
            {content ? <StreamingPartialContent content={content} /> : null}
          </>
        ) : (
          <>
            {/* Streaming Content - Formaté si JSON valide, sinon brut */}
            {formattedContent ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1.5rem',
                  fontFamily: redesignFont.sans,
                  fontSize: remSize('section'),
                  lineHeight: '1.6',
                  color: theme.text.primary,
                }}
              >
                {/* Titre */}
                {formattedContent.title && (
                  <div>
                    <h3
                      style={{
                        margin: 0,
                        fontSize: remSize('title'),
                        fontFamily: redesignFont.serif,
                        fontWeight: 'bold',
                        color: theme.text.primary,
                        borderBottom: `1px solid ${redesignHairline.strong}`,
                        paddingBottom: '0.5rem',
                      }}
                    >
                      {formattedContent.title}
                    </h3>
                  </div>
                )}

                {/* Dialogue (Speaker + Line) */}
                {(formattedContent.speaker || formattedContent.line) && (
                  <div
                    style={{
                      paddingLeft: `${redesignSpacing.md}px`,
                      borderLeft: `1px solid ${redesignHairline.strong}`,
                    }}
                  >
                    {formattedContent.speaker && (
                      <div
                        style={{
                          ...redesignMonoLabelStyle,
                          color: redesignAccent.base,
                          marginBottom: '0.5rem',
                          fontSize: remSize('small'),
                        }}
                      >
                        {formattedContent.speaker}
                      </div>
                    )}
                    {formattedContent.line && (
                      <div>
                        <div
                          data-testid="streaming-line"
                          style={{
                            display: 'inline',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            fontFamily: redesignFont.serif,
                            color: theme.text.primary,
                          }}
                          dangerouslySetInnerHTML={{
                            __html: renderStreamingLineHtml(formattedContent.line),
                          }}
                        />
                        {isStreamingText && <StreamingCursor />}
                      </div>
                    )}
                  </div>
                )}

                {/* Choix */}
                {formattedContent.choices && formattedContent.choices.length > 0 && (
                  <div>
                    <div
                      style={{
                        ...redesignMonoLabelStyle,
                        fontSize: remSize('small'),
                        color: theme.text.tertiary,
                        marginBottom: '0.75rem',
                      }}
                    >
                      Choix du joueur :
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                      }}
                    >
                      {formattedContent.choices.map((choice, index) => (
                        <div
                          key={index}
                          style={{
                            padding: `${redesignSpacing.sm}px 0`,
                            borderBottom: `1px solid ${redesignHairline.standard}`,
                          }}
                        >
                          <div
                            style={{
                              color: theme.text.primary,
                              marginBottom: choice.test ? '0.5rem' : 0,
                            }}
                          >
                            {choice.text}
                          </div>
                          {choice.test && (
                            <div
                              style={{
                                ...redesignMonoLabelStyle,
                                fontSize: remSize('small'),
                                color: theme.text.tertiary,
                                marginTop: '0.5rem',
                              }}
                            >
                              Test: {choice.test}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              // Fallback : afficher le contenu brut (JSON partiel ou autre)
              <div>
                <pre
                  style={{
                    margin: 0,
                    display: 'inline',
                    fontFamily: redesignFont.mono,
                    fontSize: remSize('small'),
                    color: theme.text.secondary,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    opacity: 0.7,
                  }}
                >
                  {/* « Préparation… » n'a de sens qu'avant le premier octet. Une fois
                      le run terminé, le contenu a été repris par le résultat : afficher
                      ce libellé sous une étiquette « TERMINÉ » ne décrivait plus rien. */}
                  {content || (currentStep === 'Complete' ? '' : 'Préparation...')}
                </pre>
                {isStreamingText && <StreamingCursor />}
              </div>
            )}

            {/* Trace de raisonnement (composant réutilisé tel quel) */}
            <ReasoningTraceViewer
              reasoningTrace={reasoningTrace}
              isGenerating={currentStep !== 'Complete'}
            />
          </>
        )}
      </div>

      {/* Footer - Actions + compteur mono (écran 2a : ce qui est déjà dépensé, pas une estimation) */}
      <div
        style={{
          paddingTop: `${redesignSpacing.md}px`,
          marginTop: `${redesignSpacing.md}px`,
          borderTop: `1px solid ${redesignHairline.strong}`,
          display: 'flex',
          flexDirection: 'column',
          gap: `${redesignSpacing.sm}px`,
          flexShrink: 0,
        }}
      >
        {currentStep === 'Complete' ? (
          <button
            type="button"
            onClick={onClose}
            style={{
              alignSelf: 'flex-end',
              padding: '0.5rem 1rem',
              border: 'none',
              borderRadius: `${redesignRadius.control}px`,
              backgroundColor: redesignAccent.base,
              color: '#ffffff',
              cursor: 'pointer',
            }}
          >
            Fermer
          </button>
        ) : (
          // 2a : deux sorties — couper net, ou garder ce qui est déjà écrit.
          <div style={{ display: 'flex', gap: 9 }}>
            <button
              type="button"
              data-testid="streaming-interrupt"
              onClick={onInterrupt}
              style={{
                flex: 1,
                minWidth: 0,
                height: 42,
                border: '1px solid #2e2e36',
                borderRadius: `${redesignRadius.control}px`,
                backgroundColor: '#1a1a1f',
                color: theme.text.primary,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                fontSize: '13.5px',
                fontWeight: 500,
              }}
            >
              Interrompre
              <span
                style={{
                  fontFamily: redesignFont.mono,
                  fontSize: '10.5px',
                  color: '#7c7c86',
                }}
              >
                ÉCHAP
              </span>
            </button>
            {onKeepPartial && content.length > 0 && (
              <button
                type="button"
                data-testid="streaming-keep-partial"
                onClick={onKeepPartial}
                title="Couper la génération mais conserver le texte déjà écrit"
                style={{
                  height: 42,
                  padding: '0 16px',
                  border: '1px solid #2e2e36',
                  borderRadius: `${redesignRadius.control}px`,
                  backgroundColor: 'transparent',
                  color: theme.text.secondary,
                  cursor: 'pointer',
                  fontSize: '13.5px',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                Garder ce qui est écrit
              </button>
            )}
          </div>
        )}
        {content.length > 0 && currentStep !== 'Complete' && (
          <div
            data-testid="streaming-token-counter"
            style={{
              textAlign: 'center',
              fontFamily: redesignFont.mono,
              fontSize: '10.5px',
              letterSpacing: '0.06em',
              color: '#63636c',
            }}
          >
            ≈ {Math.max(1, Math.round(content.length / 4)).toLocaleString('fr-FR')} TOKENS REÇUS
          </div>
        )}
      </div>
    </section>
  )
}
