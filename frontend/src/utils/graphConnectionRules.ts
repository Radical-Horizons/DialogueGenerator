/**
 * Règles de validité d'un lien du graphe, partagées par le canvas (React Flow), le store
 * (`connectNodes`) et le sélecteur de cible du formulaire.
 */

/** Un nœud ne se relie jamais à lui-même, quelle que soit la poignée de départ. */
export function isConnectionAllowed(
  sourceId: string | null | undefined,
  targetId: string | null | undefined
): boolean {
  return Boolean(sourceId) && Boolean(targetId) && sourceId !== targetId
}
