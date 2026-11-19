/**
 * Affichage d'une réplique ou d'un choix : narration en italique grisé, parole à la ligne.
 * Toute vue en lecture d'un texte de dialogue passe par ici ; les champs d'édition gardent
 * le texte brut avec ses astérisques.
 */
import { memo } from 'react'
import { redesignText } from '../../theme/redesignTokens'
import { splitDialogueLine } from '../../utils/dialogueLineSegments'

export const DIALOGUE_NARRATION_COLOR = redesignText.secondary

export const DialogueLineText = memo(function DialogueLineText({
  text,
  narrationColor = DIALOGUE_NARRATION_COLOR,
}: {
  text: string
  /** Gris de la narration ; à ajuster sur un fond clair ou accentué. */
  narrationColor?: string
}) {
  return (
    <>
      {splitDialogueLine(text).map((segment, index) => (
        <span
          key={index}
          data-segment={segment.kind}
          style={{
            display: 'block',
            whiteSpace: 'pre-wrap',
            ...(segment.kind === 'narration'
              ? { fontStyle: 'italic', color: narrationColor }
              : null),
          }}
        >
          {segment.text}
        </span>
      ))}
    </>
  )
})
