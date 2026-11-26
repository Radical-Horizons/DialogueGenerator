import { parseDialogueLine } from './dialogueLineBlocks'

/** Longueur au-delà de laquelle l'aperçu d'une réplique est tronqué sur la carte de nœud. */
export const NODE_LINE_PREVIEW_MAX_CHARS = 100

/**
 * Aperçu d'une réplique pour la carte du graphe.
 *
 * Une réplique nue (« Bonjour. ») reçoit ses guillemets ; une réplique qui en porte déjà, ou
 * qui s'ouvre sur une didascalie en italique (`*Il se tourne.* « Oui. »`), est montrée telle
 * quelle — sinon la carte affichait `« *Il se tourne.* « Oui. » »`.
 *
 * Une didascalie que la troncature a coupée est refermée : sans sa fermeture, la carte
 * montrerait l'astérisque. Un `*` jamais fermé dans la réplique entière reste du texte.
 *
 * L'aperçu n'est pas la réplique (préfixe `« `, `*` ajouté) : les positions des blocs
 * calculés sur lui ne sont pas des positions dans la réplique.
 */
export function formatNodeLinePreview(line: string): string {
  if (!line) return ''
  const preview =
    line.length > NODE_LINE_PREVIEW_MAX_CHARS
      ? `${line.substring(0, NODE_LINE_PREVIEW_MAX_CHARS)}...`
      : line
  const isAlreadyFormatted = line.includes('«') || line.trimStart().startsWith('*')
  const framed = isAlreadyFormatted ? preview : `« ${preview} »`
  return cutsNarration(line) ? `${framed}*` : framed
}

function cutsNarration(line: string): boolean {
  return parseDialogueLine(line).some(
    (block) =>
      block.kind === 'narration' &&
      block.start < NODE_LINE_PREVIEW_MAX_CHARS &&
      block.end > NODE_LINE_PREVIEW_MAX_CHARS
  )
}
