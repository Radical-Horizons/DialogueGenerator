/**
 * Modal de progression de génération LLM avec streaming SSE.
 * 
 * Affiche le texte généré en temps réel, la progression par étapes,
 * et permet l'interruption ou la réduction de la modal.
 */
import { useEffect, useMemo } from 'react'
import { theme } from '../../theme'

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
  let result = text.replace(/\\n/g, '\n')
  
  // Interpréter le markdown basique
  // *text* → italique (on utilise _ pour éviter les conflits avec les astérisques)
  result = result.replace(/\*([^*]+)\*/g, '_$1_')
  
  // **text** → gras
  result = result.replace(/\*\*([^*]+)\*\*/g, '**$1**')
  
  return result
}

export interface GenerationProgressModalProps {
  /** Contrôle l'affichage de la modal */
  isOpen: boolean
  /** Contenu streamé du LLM (caractère par caractère) */
  content: string
  /** Étape actuelle : Prompting | Generating | Validating | Complete */
  currentStep: 'Prompting' | 'Generating' | 'Validating' | 'Complete'
  /** La modal est-elle réduite (badge compact) */
  isMinimized?: boolean
  /** Message d'erreur si génération échouée */
  error?: string | null
  /** État d'interruption en cours (Task 4 - Story 0.8) */
  isInterrupting?: boolean
  /** Callback pour interrompre la génération */
  onInterrupt: () => void
  /** Callback pour réduire/agrandir la modal */
  onMinimize: () => void
  /** Callback pour fermer la modal (après complétion) */
  onClose: () => void
}

/**
 * Composant Modal de progression de génération.
 * 
 * Pattern : Suivre structure GenerationOptionsModal (overlay + header + content scrollable).
 * 
 * États :
 * - Modal pleine : affichage central avec streaming visible
 * - Badge réduit : coin écran (bottom-right) avec progression compacte
 * - État terminé : bouton "Fermer" + auto-fermeture après 3s
 */
export function GenerationProgressModal({
  isOpen,
  content,
  currentStep,
  isMinimized = false,
  error = null,
  isInterrupting = false,  // Task 4 - Story 0.8
  onInterrupt,
  onMinimize,
  onClose,
}: GenerationProgressModalProps) {
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

  // Mapping des étapes pour la barre de progression
  const steps = ['Prompting', 'Generating', 'Validating', 'Complete']
  const currentStepIndex = steps.indexOf(currentStep)
  const progressPercentage = ((currentStepIndex + 1) / steps.length) * 100

  if (!isOpen) return null

  // Badge réduit (coin écran)
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
        onClick={onMinimize} // Clic sur le badge agrandit la modal
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: error ? theme.state.error.color : theme.border.focus,
              animation: error ? 'none' : 'pulse 1.5s ease-in-out infinite',
            }}
          />
          <span style={{ color: theme.text.primary, fontSize: '0.9rem' }}>
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

  // Modal pleine
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => {
        // Empêcher la fermeture par clic overlay pendant génération
        if (currentStep !== 'Complete') {
          e.stopPropagation()
        }
      }}
    >
      <div
        style={{
          backgroundColor: theme.background.panel,
          borderRadius: '8px',
          width: '90%',
          maxWidth: '800px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.5rem',
            borderBottom: `1px solid ${theme.border.primary}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <h2 style={{ margin: 0, color: theme.text.primary }}>
            {isInterrupting 
              ? 'Interruption en cours...' 
              : currentStep === 'Complete' 
                ? 'Génération terminée' 
                : 'Génération en cours...'}
          </h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {currentStep !== 'Complete' && (
              <button
                onClick={onMinimize}
                aria-label="Réduire"
                style={{
                  background: 'none',
                  border: 'none',
                  color: theme.text.secondary,
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.25rem 0.5rem',
                }}
                title="Réduire"
              >
                –
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {currentStep !== 'Complete' && !error && (
          <div
            style={{
              padding: '1rem 1.5rem',
              borderBottom: `1px solid ${theme.border.primary}`,
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              {steps.map((step, index) => (
                <span
                  key={step}
                  style={{
                    fontSize: '0.85rem',
                    color: index <= currentStepIndex ? theme.text.primary : theme.text.secondary,
                    fontWeight: index === currentStepIndex ? 'bold' : 'normal',
                  }}
                >
                  {step}
                </span>
              ))}
            </div>
            <div
              style={{
                width: '100%',
                height: '8px',
                backgroundColor: theme.input.background,
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${progressPercentage}%`,
                  height: '100%',
                  backgroundColor: theme.border.focus,
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* Content - Streaming Text + Reasoning Trace */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '1.5rem',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}
        >
          {error ? (
            <div
              style={{
                padding: '1rem',
                backgroundColor: error.includes('Interruption terminée') 
                  ? (theme.state.warning?.background || theme.input.background)
                  : theme.state.error.background,
                color: error.includes('Interruption terminée')
                  ? (theme.state.warning?.color || theme.text.primary)
                  : theme.state.error.color,
                borderRadius: '4px',
                textAlign: 'center',
              }}
            >
              {error}
            </div>
          ) : isInterrupting ? (
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
          ) : (
            <>
              {/* Streaming Content - Formaté si JSON valide, sinon brut */}
              {formattedContent ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.5rem',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    fontSize: '0.95rem',
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
                          fontSize: '1.1rem',
                          fontWeight: 'bold',
                          color: theme.text.primary,
                          borderBottom: `2px solid ${theme.border.primary}`,
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
                        padding: '1rem',
                        backgroundColor: theme.background.secondary,
                        borderRadius: '6px',
                        borderLeft: `4px solid ${theme.border.focus}`,
                      }}
                    >
                      {formattedContent.speaker && (
                        <div
                          style={{
                            fontWeight: 'bold',
                            color: theme.border.focus,
                            marginBottom: '0.5rem',
                            fontSize: '0.9rem',
                          }}
                        >
                          {formattedContent.speaker}
                        </div>
                      )}
                      {formattedContent.line && (
                        <div
                          style={{
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            color: theme.text.primary,
                          }}
                          dangerouslySetInnerHTML={{
                            __html: interpretMarkdown(formattedContent.line)
                              .replace(/\n/g, '<br/>')
                              .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                              .replace(/_([^_]+)_/g, '<em>$1</em>'),
                          }}
                        />
                      )}
                    </div>
                  )}

                  {/* Choix */}
                  {formattedContent.choices && formattedContent.choices.length > 0 && (
                    <div>
                      <div
                        style={{
                          fontSize: '0.85rem',
                          fontWeight: 'bold',
                          color: theme.text.secondary,
                          marginBottom: '0.75rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}
                      >
                        Choix du joueur :
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem',
                        }}
                      >
                        {formattedContent.choices.map((choice, index) => (
                          <div
                            key={index}
                            style={{
                              padding: '0.75rem 1rem',
                              backgroundColor: theme.background.panel,
                              border: `1px solid ${theme.border.primary}`,
                              borderRadius: '6px',
                              borderLeft: `4px solid ${theme.border.focus}`,
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
                                  fontSize: '0.8rem',
                                  color: theme.text.tertiary,
                                  fontStyle: 'italic',
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
                <pre
                  style={{
                    margin: 0,
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                    color: theme.text.secondary,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    opacity: 0.7,
                  }}
                >
                  {content || 'Préparation...'}
                </pre>
              )}
            </>
          )}
        </div>

        {/* Footer - Actions */}
        <div
          style={{
            padding: '1rem 1.5rem',
            borderTop: `1px solid ${theme.border.primary}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            flexShrink: 0,
          }}
        >
          {currentStep === 'Complete' ? (
            <button
              onClick={onClose}
              style={{
                padding: '0.5rem 1rem',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: theme.button.primary.background,
                color: theme.button.primary.color,
                cursor: 'pointer',
              }}
            >
              Fermer
            </button>
          ) : (
            <button
              onClick={onInterrupt}
              style={{
                padding: '0.5rem 1rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                cursor: 'pointer',
              }}
            >
              Interrompre
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
