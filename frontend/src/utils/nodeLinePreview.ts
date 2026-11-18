/** Longueur au-delà de laquelle l'aperçu d'une réplique est tronqué sur la carte de nœud. */
export const NODE_LINE_PREVIEW_MAX_CHARS = 100

/**
 * Aperçu d'une réplique pour la carte du graphe.
 *
 * Une réplique nue (« Bonjour. ») reçoit ses guillemets ; une réplique qui en porte déjà, ou
 * qui s'ouvre sur une didascalie en italique (`*Il se tourne.* « Oui. »`), est montrée telle
 * quelle — sinon la carte affichait `« *Il se tourne.* « Oui. » »`.
 */
export function formatNodeLinePreview(line: string): string {
  if (!line) return ''
  const preview =
    line.length > NODE_LINE_PREVIEW_MAX_CHARS
      ? `${line.substring(0, NODE_LINE_PREVIEW_MAX_CHARS)}...`
      : line
  const isAlreadyFormatted = line.includes('«') || line.trimStart().startsWith('*')
  return isAlreadyFormatted ? preview : `« ${preview} »`
}
