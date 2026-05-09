export const COMMUNITY_AGGREGATE_SIMULATION_LIMIT =
  'Agrégat communautaire simulé localement : témoins, propagation et poids PNJ restent responsabilité runtime.'

export interface PreviewGameSystemsStateLike {
  reputation_values?: Record<string, number>
}

export function collectPreviewSimulationLimits(
  gameSystemsState: PreviewGameSystemsStateLike,
): string[] {
  const reputationValues = gameSystemsState.reputation_values ?? {}
  const hasCommunityAggregate = Object.keys(reputationValues).some(
    (key) => key.includes('::community::') || key.endsWith('::community_calculated'),
  )
  return hasCommunityAggregate ? [COMMUNITY_AGGREGATE_SIMULATION_LIMIT] : []
}
