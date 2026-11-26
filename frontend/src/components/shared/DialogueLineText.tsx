/**
 * Affichage d'une réplique ou d'un choix : narration en italique grisé, parole à la ligne.
 * Toute vue en lecture d'un texte de dialogue passe par ici ; les champs d'édition gardent
 * le texte brut avec ses astérisques.
 */
import { memo } from 'react'
import { redesignText } from '../../theme/redesignTokens'
import { parseDialogueLine, visibleDialogueBlocks } from '../../utils/dialogueLineBlocks'

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
      {visibleDialogueBlocks(parseDialogueLine(text)).map((block) => (
        <span
          key={block.start}
          data-segment={block.kind}
          style={{
            display: 'block',
            whiteSpace: 'pre-wrap',
            ...(block.kind === 'narration'
              ? { fontStyle: 'italic', color: narrationColor }
              : null),
          }}
        >
          {block.text}
        </span>
      ))}
    </>
  )
})
