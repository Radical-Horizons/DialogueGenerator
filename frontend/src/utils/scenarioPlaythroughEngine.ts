/**
 * Moteur pur de navigation playthrough (Preview scénario mode Visual Novel).
 */
import type { Edge, Node } from 'reactflow'
import type { FlagDefinition } from '../types/flags'
import type { ChoiceEffect } from '../types/choiceEffects'
import type { VisibilityConditionsBlock, VisibilityEvalState } from '../types/visibilityConditions'
import type { PreviewGameSystemsState } from '../store/graphViewStore'
import { evaluateVisibilityConditions, formatConditionAtomSummary } from './visibilityConditions'
import { applyChoiceEffectsToEvalState } from './choiceEffects'
import { linesForAppliedChoiceEffects } from './previewEffectHistory'
import { evaluateChoiceEffortAccess } from './effortPreview'
import {
  evaluateSkillCheck,
  formatSkillCheckSummary,
  getChoiceSkillCheckPreview,
  type SkillCheckDefinition,
  type SkillCheckIssue,
} from './skillChecks'
import { parseAttributeSkillTest } from './attributeSkillTest'
import { TEST_RESULT_EDGE_CONFIG } from './graphEdgeBuilders'

export type PlaythroughChoiceStatus = 'untested' | 'tested' | 'masked' | 'effort_blocked'

export interface PlaythroughChoicePresentation {
  index: number
  text: string
  status: PlaythroughChoiceStatus
  disabledReason?: string
  skillCheckSummary?: string
  hasEffects: boolean
  selectable: boolean
}

export interface PlaythroughStep {
  kind: 'dialogue' | 'test' | 'end'
  nodeId: string
  speaker?: string
  line?: string
  choices: PlaythroughChoicePresentation[]
  continueTarget?: string
  testSummary?: string
  testIssue?: SkillCheckIssue
  autoAdvanceTarget?: string
}

export interface PlaythroughStateSnapshot {
  visibilityEvalState: VisibilityEvalState
  previewGameSystemsState: PreviewGameSystemsState
  previewEffectHistory: string[]
}

export interface PlaythroughHistoryEntry {
  nodeId: string
  snapshot: PlaythroughStateSnapshot
  choiceKey?: string
}

export interface PlaythroughCoverage {
  visitedNodeCount: number
  totalDialogueNodes: number
  untestedChoiceCount: number
  totalAccessibleChoiceCount: number
}

export interface PlaythroughGraphContext {
  nodes: Node[]
  edges: Edge[]
}

export interface PlaythroughRuntimeContext {
  evalState: VisibilityEvalState
  gameSystemsState: PreviewGameSystemsState
  visitedChoiceKeys: Record<string, true>
  forcedSkillCheckIssue: SkillCheckIssue | null
  catalogById?: Record<string, FlagDefinition>
}

/** Clé stable pour un choix visité dans la session. */
export function playthroughChoiceKey(nodeId: string, choiceIndex: number): string {
  return `${nodeId}::${choiceIndex}`
}

function nodeById(nodes: Node[], id: string): Node | undefined {
  return nodes.find((n) => n.id === id)
}

function dialogueData(node: Node): {
  speaker?: string
  line?: string
  choices?: unknown[]
  nextNode?: string
  visibilityConditions?: VisibilityConditionsBlock
} {
  return (node.data ?? {}) as {
    speaker?: string
    line?: string
    choices?: unknown[]
    nextNode?: string
    visibilityConditions?: VisibilityConditionsBlock
  }
}

function choiceBlockReason(
  block: VisibilityConditionsBlock | undefined,
  state: VisibilityEvalState,
): string | undefined {
  if (!block?.items?.length) return undefined
  const result = evaluateVisibilityConditions(block, state)
  if (result.satisfied) return undefined
  const first = block.items[0]
  if (first && 'kind' in first) {
    return formatConditionAtomSummary(first)
  }
  return 'Condition non satisfaite'
}

/**
 * Trouve le nœud de départ : id START, sinon racine sans arête entrante.
 */
export function findPlaythroughStartNode(nodes: Node[], edges: Edge[]): string | null {
  const explicit = nodes.find((n) => n.id === 'START')
  if (explicit) return explicit.id

  const targets = new Set(edges.map((e) => e.target))
  const roots = nodes.filter((n) => n.type !== 'endNode' && !targets.has(n.id))
  if (roots.length === 1) return roots[0].id
  const dialogueRoots = roots.filter((n) => n.type === 'dialogueNode')
  if (dialogueRoots.length === 1) return dialogueRoots[0].id
  if (roots.length > 0) return roots[0].id
  return nodes.find((n) => n.type === 'dialogueNode')?.id ?? null
}

function skillStateFromPreview(gs: PreviewGameSystemsState) {
  return { attributes: gs.attributes, skills: gs.skills }
}

function resolveTestNodeTarget(
  testNode: Node,
  issue: SkillCheckIssue,
  edges: Edge[],
): string | null {
  const data = testNode.data as Record<string, string | undefined>
  const nodeFieldMap: Record<SkillCheckIssue, string> = {
    succès_critique: 'criticalSuccessNode',
    succès: 'successNode',
    échec: 'failureNode',
    échec_critique: 'criticalFailureNode',
  }
  const key = nodeFieldMap[issue]
  if (data[key]) return data[key] as string

  const handleMap: Record<SkillCheckIssue, string> = {
    succès_critique: 'critical-success',
    succès: 'success',
    échec: 'failure',
    échec_critique: 'critical-failure',
  }
  const handleId = handleMap[issue]
  const edge = edges.find((e) => e.source === testNode.id && e.sourceHandle === handleId)
  if (edge?.target) return edge.target

  for (const config of TEST_RESULT_EDGE_CONFIG) {
    const fallbackEdge = edges.find(
      (e) => e.source === testNode.id && e.sourceHandle === config.handleId,
    )
    if (fallbackEdge?.target) return fallbackEdge.target
  }
  return null
}

function evaluateLegacyTestNode(
  testNode: Node,
  ctx: PlaythroughRuntimeContext,
): { issue: SkillCheckIssue; summary: string } | null {
  const rawTest = (testNode.data as { test?: string }).test
  if (!rawTest?.trim()) return null
  const parts = parseAttributeSkillTest(rawTest)
  const dc = Number(parts.dc)
  if (!parts.attribute || !parts.skill || !Number.isFinite(dc)) return null
  const check: SkillCheckDefinition = {
    attributeId: parts.attribute,
    skillId: parts.skill,
    dc,
  }
  const result = evaluateSkillCheck(check, skillStateFromPreview(ctx.gameSystemsState))
  const issue = ctx.forcedSkillCheckIssue ?? result.issue
  return {
    issue,
    summary: formatSkillCheckSummary(check, { ...result, issue }),
  }
}

function resolveChoiceTarget(
  choice: {
    targetNode?: string
    skillCheck?: SkillCheckDefinition
    test?: string
    testCriticalFailureNode?: string
    testFailureNode?: string
    testSuccessNode?: string
    testCriticalSuccessNode?: string
  },
  ctx: PlaythroughRuntimeContext,
  graph: PlaythroughGraphContext,
  sourceNodeId: string,
  choiceIndex: number,
): { nextNodeId: string | null; skillMessage?: string } {
  const skillPreview = getChoiceSkillCheckPreview(choice, skillStateFromPreview(ctx.gameSystemsState))
  if (choice.skillCheck && skillPreview) {
    const issue = ctx.forcedSkillCheckIssue ?? skillPreview.issue
    const targetFromBranch = choice.skillCheck.branches?.[issue] ?? skillPreview.targetNode
    if (targetFromBranch) {
      return {
        nextNodeId: targetFromBranch,
        skillMessage: formatSkillCheckSummary(choice.skillCheck, { ...skillPreview, issue }),
      }
    }
  }

  if (choice.test?.trim()) {
    const legacyId = `test-node-${sourceNodeId}-choice-${choiceIndex}`
    const testNode = nodeById(graph.nodes, legacyId)
    if (testNode) {
      const evalResult = evaluateLegacyTestNode(testNode, ctx)
      if (evalResult) {
        const target = resolveTestNodeTarget(testNode, evalResult.issue, graph.edges)
        return { nextNodeId: target, skillMessage: evalResult.summary }
      }
    }
    const parts = parseAttributeSkillTest(choice.test)
    const issueFieldMap: Record<SkillCheckIssue, keyof typeof choice> = {
      succès_critique: 'testCriticalSuccessNode',
      succès: 'testSuccessNode',
      échec: 'testFailureNode',
      échec_critique: 'testCriticalFailureNode',
    }
    const check: SkillCheckDefinition = {
      attributeId: parts.attribute,
      skillId: parts.skill,
      dc: Number(parts.dc),
    }
    const result = evaluateSkillCheck(check, skillStateFromPreview(ctx.gameSystemsState))
    const issue = ctx.forcedSkillCheckIssue ?? result.issue
    const field = issueFieldMap[issue]
    const target = choice[field] as string | undefined
    if (target) {
      return {
        nextNodeId: target,
        skillMessage: formatSkillCheckSummary(check, { ...result, issue }),
      }
    }
  }

  if (choice.targetNode) {
    return { nextNodeId: choice.targetNode }
  }

  return { nextNodeId: null }
}

export function createPlaythroughSnapshot(
  evalState: VisibilityEvalState,
  gameSystemsState: PreviewGameSystemsState,
  effectHistory: string[],
): PlaythroughStateSnapshot {
  return {
    visibilityEvalState: {
      flags: { ...evalState.flags },
      reputation: { ...evalState.reputation },
    },
    previewGameSystemsState: {
      attributes: { ...gameSystemsState.attributes },
      skills: { ...gameSystemsState.skills },
      effortPool: gameSystemsState.effortPool,
      reputationValues: { ...gameSystemsState.reputationValues },
      factionTitles: { ...gameSystemsState.factionTitles },
      simulationLimits: [...gameSystemsState.simulationLimits],
    },
    previewEffectHistory: [...effectHistory],
  }
}

export function getChoicePresentation(
  nodeId: string,
  choiceIndex: number,
  choice: {
    text?: string
    visibilityConditions?: VisibilityConditionsBlock
    effortCost?: number
    choiceEffects?: ChoiceEffect[]
    skillCheck?: SkillCheckDefinition
  },
  ctx: PlaythroughRuntimeContext,
): PlaythroughChoicePresentation {
  const text = choice.text?.trim() || `Choix ${choiceIndex + 1}`
  const key = playthroughChoiceKey(nodeId, choiceIndex)
  const tested = Boolean(ctx.visitedChoiceKeys[key])
  const maskReason = choiceBlockReason(choice.visibilityConditions, ctx.evalState)
  const effortAccess = evaluateChoiceEffortAccess(choice, {
    availablePool: ctx.gameSystemsState.effortPool,
  })
  const skillPreview = getChoiceSkillCheckPreview(choice, skillStateFromPreview(ctx.gameSystemsState))
  const skillCheckSummary =
    choice.skillCheck && skillPreview
      ? formatSkillCheckSummary(choice.skillCheck, skillPreview)
      : undefined

  if (maskReason) {
    return {
      index: choiceIndex,
      text,
      status: 'masked',
      disabledReason: maskReason,
      skillCheckSummary,
      hasEffects: Boolean(choice.choiceEffects?.length),
      selectable: false,
    }
  }
  if (!effortAccess.accessible) {
    return {
      index: choiceIndex,
      text,
      status: 'effort_blocked',
      disabledReason: effortAccess.disabledReason,
      skillCheckSummary,
      hasEffects: Boolean(choice.choiceEffects?.length),
      selectable: false,
    }
  }
  return {
    index: choiceIndex,
    text,
    status: tested ? 'tested' : 'untested',
    skillCheckSummary,
    hasEffects: Boolean(choice.choiceEffects?.length),
    selectable: true,
  }
}

/**
 * Résout l'écran courant pour le nœud donné.
 */
export function resolvePlaythroughStep(
  nodeId: string,
  graph: PlaythroughGraphContext,
  ctx: PlaythroughRuntimeContext,
): PlaythroughStep | null {
  const node = nodeById(graph.nodes, nodeId)
  if (!node) return null

  if (node.type === 'endNode') {
    return { kind: 'end', nodeId, line: 'Fin du dialogue.', choices: [] }
  }

  if (node.type === 'testNode') {
    const evalResult = evaluateLegacyTestNode(node, ctx)
    const issue = evalResult?.issue ?? 'succès'
    const autoTarget = resolveTestNodeTarget(node, issue, graph.edges)
    return {
      kind: 'test',
      nodeId,
      line: (node.data as { line?: string }).line,
      testSummary: evalResult?.summary,
      testIssue: issue,
      autoAdvanceTarget: autoTarget ?? undefined,
      choices: [],
    }
  }

  const data = dialogueData(node)
  const nodeBlockReason = choiceBlockReason(data.visibilityConditions, ctx.evalState)
  const choicesRaw = (data.choices ?? []) as Array<{
    text?: string
    visibilityConditions?: VisibilityConditionsBlock
    effortCost?: number
    choiceEffects?: ChoiceEffect[]
    skillCheck?: SkillCheckDefinition
    targetNode?: string
    test?: string
  }>

  const choices = choicesRaw.map((ch, idx) => getChoicePresentation(nodeId, idx, ch, ctx))
  const hasChoices = choices.length > 0

  return {
    kind: 'dialogue',
    nodeId,
    speaker: data.speaker,
    line: nodeBlockReason ? `[Masqué] ${nodeBlockReason}` : data.line,
    choices: hasChoices ? choices : [],
    continueTarget: !hasChoices ? data.nextNode : undefined,
  }
}

export interface PlaythroughChoiceResult {
  nextNodeId: string | null
  effectLines: string[]
  skillMessage?: string
  effortCost: number
  choiceKey: string
  nextEvalState: VisibilityEvalState
  nextGameSystemsState: PreviewGameSystemsState
}

/**
 * Applique un choix : effets, effort, résolution cible.
 */
export function applyPlaythroughChoice(
  nodeId: string,
  choiceIndex: number,
  graph: PlaythroughGraphContext,
  evalState: VisibilityEvalState,
  gameSystemsState: PreviewGameSystemsState,
  catalogById: Record<string, FlagDefinition> | undefined,
  forcedSkillCheckIssue: SkillCheckIssue | null,
): PlaythroughChoiceResult | { error: string } {
  const node = nodeById(graph.nodes, nodeId)
  if (!node || node.type !== 'dialogueNode') {
    return { error: 'Nœud dialogue introuvable.' }
  }
  const data = dialogueData(node)
  const choices = (data.choices ?? []) as Array<{
    text?: string
    visibilityConditions?: VisibilityConditionsBlock
    effortCost?: number
    choiceEffects?: ChoiceEffect[]
    skillCheck?: SkillCheckDefinition
    targetNode?: string
    test?: string
    testCriticalFailureNode?: string
    testFailureNode?: string
    testSuccessNode?: string
    testCriticalSuccessNode?: string
  }>
  const choice = choices[choiceIndex]
  if (!choice) return { error: 'Choix invalide.' }

  const ctx: PlaythroughRuntimeContext = {
    evalState,
    gameSystemsState,
    visitedChoiceKeys: {},
    forcedSkillCheckIssue,
    catalogById,
  }
  const presentation = getChoicePresentation(nodeId, choiceIndex, choice, ctx)
  if (!presentation.selectable) {
    return { error: presentation.disabledReason ?? 'Choix inaccessible.' }
  }

  const prevEval = evalState
  const effects = choice.choiceEffects ?? []
  const nextEval = applyChoiceEffectsToEvalState(prevEval, effects, catalogById)
  const effectLines = linesForAppliedChoiceEffects(prevEval, effects, catalogById)

  const effortAccess = evaluateChoiceEffortAccess(choice, {
    availablePool: gameSystemsState.effortPool,
  })
  const cost = effortAccess.cost
  const nextGs: PreviewGameSystemsState = {
    ...gameSystemsState,
    effortPool: Math.max(0, gameSystemsState.effortPool - cost),
  }

  const runtimeCtx: PlaythroughRuntimeContext = {
    evalState: nextEval,
    gameSystemsState: nextGs,
    visitedChoiceKeys: {},
    forcedSkillCheckIssue,
    catalogById,
  }
  const { nextNodeId, skillMessage } = resolveChoiceTarget(
    choice,
    runtimeCtx,
    graph,
    nodeId,
    choiceIndex,
  )

  if (skillMessage) {
    effectLines.push(skillMessage)
  }

  return {
    nextNodeId,
    effectLines,
    skillMessage,
    effortCost: cost,
    choiceKey: playthroughChoiceKey(nodeId, choiceIndex),
    nextEvalState: nextEval,
    nextGameSystemsState: nextGs,
  }
}

/**
 * Calcule les métriques de couverture pour la session.
 */
export function computePlaythroughCoverage(
  graph: PlaythroughGraphContext,
  evalState: VisibilityEvalState,
  visitedNodeIds: Record<string, true>,
  visitedChoiceKeys: Record<string, true>,
): PlaythroughCoverage {
  let totalDialogueNodes = 0
  let untestedChoiceCount = 0
  let totalAccessibleChoiceCount = 0

  const ctxBase: PlaythroughRuntimeContext = {
    evalState,
    gameSystemsState: {
      attributes: {},
      skills: {},
      effortPool: 0,
      reputationValues: {},
      factionTitles: {},
      simulationLimits: [],
    },
    visitedChoiceKeys,
    forcedSkillCheckIssue: null,
  }

  for (const n of graph.nodes) {
    if (n.type === 'dialogueNode') {
      totalDialogueNodes += 1
      const choices = (dialogueData(n).choices ?? []) as unknown[]
      choices.forEach((ch, idx) => {
        const pres = getChoicePresentation(
          n.id,
          idx,
          ch as Parameters<typeof getChoicePresentation>[2],
          ctxBase,
        )
        if (pres.status !== 'masked' && pres.status !== 'effort_blocked') {
          totalAccessibleChoiceCount += 1
          const key = playthroughChoiceKey(n.id, idx)
          if (!visitedChoiceKeys[key]) untestedChoiceCount += 1
        }
      })
    }
  }

  return {
    visitedNodeCount: Object.keys(visitedNodeIds).length,
    totalDialogueNodes,
    untestedChoiceCount,
    totalAccessibleChoiceCount,
  }
}
