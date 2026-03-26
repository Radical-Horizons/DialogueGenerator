import type { Edge, Node } from 'reactflow'
import type { ValidationErrorDetail } from '../types/graph'

export interface GraphValidationWarningSummary {
  visibleWarnings: ValidationErrorDetail[]
  visibleWarningCount: number
  countsByType: Record<string, number>
  disconnectedBranchCount: number
  coveredUnreachableCount: number
  remainingUnreachableCount: number
  cycleCount: number
  otherWarningCount: number
  actionableWarningCount: number
}

function filterVisibleWarnings(
  validationErrors: ValidationErrorDetail[],
  intentionalCycles: string[]
): ValidationErrorDetail[] {
  return validationErrors
    .filter((error) => error.severity === 'warning')
    .filter((warning) => {
      if (warning.type === 'cycle_detected' && warning.cycle_id) {
        return !intentionalCycles.includes(warning.cycle_id)
      }
      return true
    })
}

export function summarizeGraphValidationWarnings(
  nodes: Node[],
  edges: Edge[],
  validationErrors: ValidationErrorDetail[],
  intentionalCycles: string[]
): GraphValidationWarningSummary {
  const visibleWarnings = filterVisibleWarnings(validationErrors, intentionalCycles)
  const countsByType = visibleWarnings.reduce<Record<string, number>>((acc, warning) => {
    const type = warning.type || 'other'
    acc[type] = (acc[type] ?? 0) + 1
    return acc
  }, {})

  const nodeIds = new Set(nodes.map((node) => node.id))
  const orphanRoots = new Set(
    visibleWarnings
      .filter((warning) => warning.type === 'orphan_node' && warning.node_id)
      .map((warning) => warning.node_id as string)
      .filter((nodeId) => nodeIds.has(nodeId))
  )
  const unreachableNodes = new Set(
    visibleWarnings
      .filter((warning) => warning.type === 'unreachable_node' && warning.node_id)
      .map((warning) => warning.node_id as string)
      .filter((nodeId) => nodeIds.has(nodeId))
  )

  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      continue
    }
    const existing = adjacency.get(edge.source) ?? []
    existing.push(edge.target)
    adjacency.set(edge.source, existing)
  }

  const coveredUnreachable = new Set<string>()
  for (const orphanRoot of orphanRoots) {
    const queue = [orphanRoot]
    const visited = new Set<string>([orphanRoot])
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current) {
        continue
      }
      if (unreachableNodes.has(current)) {
        coveredUnreachable.add(current)
      }
      for (const next of adjacency.get(current) ?? []) {
        if (visited.has(next) || !unreachableNodes.has(next)) {
          continue
        }
        visited.add(next)
        queue.push(next)
      }
    }
  }

  const remainingUnreachableCount = Array.from(unreachableNodes).filter(
    (nodeId) => !coveredUnreachable.has(nodeId)
  ).length
  const cycleCount = countsByType.cycle_detected ?? 0
  const otherWarningCount = Object.entries(countsByType).reduce((sum, [type, count]) => {
    if (type === 'orphan_node' || type === 'unreachable_node' || type === 'cycle_detected') {
      return sum
    }
    return sum + count
  }, 0)

  return {
    visibleWarnings,
    visibleWarningCount: visibleWarnings.length,
    countsByType,
    disconnectedBranchCount: orphanRoots.size,
    coveredUnreachableCount: coveredUnreachable.size,
    remainingUnreachableCount,
    cycleCount,
    otherWarningCount,
    actionableWarningCount:
      orphanRoots.size + remainingUnreachableCount + cycleCount + otherWarningCount,
  }
}

export function formatGraphWarningBadgeLabel(
  summary: GraphValidationWarningSummary
): string {
  if (
    summary.disconnectedBranchCount > 0 &&
    summary.actionableWarningCount === summary.disconnectedBranchCount
  ) {
    return `${summary.disconnectedBranchCount} branche${
      summary.disconnectedBranchCount > 1 ? 's' : ''
    } déconnectée${summary.disconnectedBranchCount > 1 ? 's' : ''}`
  }

  return `${summary.actionableWarningCount} avertissement${
    summary.actionableWarningCount > 1 ? 's' : ''
  }`
}
