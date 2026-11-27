/**
 * Géométrie et projection du prototype de cartes de texte (Story 20.2) : hauteur au palier
 * « écrire » (le plus haut, donc celui de la disposition), disposition gauche → droite et
 * liens d'issue de test partant des ports de la carte. Rien ne touche au document.
 */
import type { Edge, Node } from 'reactflow'
import { calculateDagreLayout, type DagreSpacingMode } from './dagreLayout'
import { parseDialogueLine, visibleDialogueBlocks } from './dialogueLineBlocks'

export const TEXT_CARD_WIDTH = 360
export const TEXT_CARD_MAX_LINES = 12
export const TEXT_CARD_LINE_PX = 22.72
const HEADER_PX = 31
const LINE_BLOCK_PADDING_PX = 25
const CHARS_PER_LINE = 42
const CHOICE_PADDING_PX = 20
const CHOICE_LINE_PX = 20.25
const CHOICE_CHARS_PER_LINE = 44
const CHIP_ROW_PX = 29
const CHIP_ROW_CHARS = 34
const OUTCOMES_PX = 7 + 4 * 18 + 3 * 3
const NEXT_FOOTER_PX = 28
/** `nodesep` (vertical en `LR`) puis `ranksep` (horizontal). */
const TEXT_CARD_SPACING = { x: 48, y: 160 }

export interface TextCardChoice {
  choiceId?: string
  text?: string
  targetNode?: string
  test?: unknown
  traitRequirements?: Array<{ trait?: string; minValue?: number }>
  respectDelta?: number | null
  influenceDelta?: number | null
  [key: string]: unknown
}

const signed = (value: number) => (value > 0 ? `+${value}` : String(value))

/** Puces mécaniques d'une réponse (board `Carte`, zone 5). */
export function textCardChips(choice: TextCardChoice): string[] {
  const chips = (choice.traitRequirements ?? []).map(
    (requirement) => `${requirement.trait ?? ''} ≥ ${requirement.minValue ?? 0}`
  )
  if (typeof choice.test === 'string' && choice.test) chips.push(`Test ${choice.test}`)
  if (choice.respectDelta) chips.push(`Respect ${signed(choice.respectDelta)}`)
  if (choice.influenceDelta) chips.push(`Influence ${signed(choice.influenceDelta)}`)
  return chips
}

function wrappedLines(text: string, charsPerLine: number): number {
  return text
    .split('\n')
    .reduce((total, part) => total + Math.max(1, Math.ceil(part.length / charsPerLine)), 0)
}

export function estimateTextCardHeight(node: Node, showTestBars: boolean): number {
  const data = (node.data ?? {}) as { line?: string; choices?: TextCardChoice[] }
  const textLines = visibleDialogueBlocks(parseDialogueLine(data.line ?? '')).reduce(
    (total, block) => total + wrappedLines(block.text, CHARS_PER_LINE),
    0
  )
  const lineHeight = Math.min(TEXT_CARD_MAX_LINES, Math.max(1, textLines)) * TEXT_CARD_LINE_PX
  const choices = data.choices ?? []
  const choicesHeight = choices.reduce((total, choice) => {
    const chips = textCardChips(choice)
    const chipRows = chips.length === 0 ? 0 : Math.ceil(chips.join('     ').length / CHIP_ROW_CHARS)
    return (
      total +
      CHOICE_PADDING_PX +
      wrappedLines(choice.text ?? '', CHOICE_CHARS_PER_LINE) * CHOICE_LINE_PX +
      chipRows * CHIP_ROW_PX +
      (choice.test && !showTestBars ? OUTCOMES_PX : 0)
    )
  }, 0)
  return Math.ceil(
    HEADER_PX +
      LINE_BLOCK_PADDING_PX +
      lineHeight +
      (choices.length > 0 ? choicesHeight : NEXT_FOOTER_PX)
  )
}

const isTestBarId = (id: string) => id.startsWith('test-node-')

const withoutLabel = (edge: Edge): Edge =>
  edge.label == null ? edge : { ...edge, label: undefined }

/**
 * Liens tels que le canvas du prototype les dessine : sans étiquette (les réponses sont
 * écrites en entier sur la carte) et, sans nœuds de test, chaque issue partant du port
 * `test:<choiceId>:<issue>` de la réplique. L'identifiant du lien reste celui du store.
 */
export function toTextCardEdges(edges: Edge[], showTestBars: boolean): Edge[] {
  if (showTestBars) return edges.map(withoutLabel)
  const barOrigins = new Map<string, { source: string; choiceId: string }>()
  for (const edge of edges) {
    if (!isTestBarId(edge.target) || !edge.sourceHandle?.startsWith('choice:')) continue
    barOrigins.set(edge.target, {
      source: edge.source,
      choiceId: edge.sourceHandle.slice('choice:'.length),
    })
  }
  const projected: Edge[] = []
  for (const edge of edges) {
    if (isTestBarId(edge.target)) continue
    if (!isTestBarId(edge.source)) {
      projected.push(withoutLabel(edge))
      continue
    }
    const origin = barOrigins.get(edge.source)
    if (!origin) continue
    projected.push({
      ...edge,
      source: origin.source,
      sourceHandle: `test:${origin.choiceId}:${edge.sourceHandle}`,
      label: undefined,
      // Le lien n'existe pas sous cette forme dans le store : le supprimer n'aurait pas de sens.
      deletable: false,
    })
  }
  return projected
}

/** Disposition gauche → droite des cartes, aux hauteurs du palier « écrire ». */
export function calculateTextCardLayout(
  nodes: Node[],
  edges: Edge[],
  options: { spacingMode: DagreSpacingMode; showTestBars: boolean }
): Node[] {
  const { spacingMode, showTestBars } = options
  const laidOutNodes = showTestBars ? nodes : nodes.filter((node) => node.type !== 'testNode')
  const laidOut = calculateDagreLayout(laidOutNodes, toTextCardEdges(edges, showTestBars), {
    direction: 'LR',
    spacingMode,
    nodeSpacing: TEXT_CARD_SPACING,
    redistributeSiblings: false,
    nodeSize: (node) => {
      if (node.type === 'testNode') return { width: 200, height: 44 }
      if (node.type === 'endNode') return { width: 200, height: 80 }
      return { width: TEXT_CARD_WIDTH, height: estimateTextCardHeight(node, showTestBars) }
    },
  })
  const positions = new Map(laidOut.map((node) => [node.id, node.position]))
  return nodes.map((node) => ({ ...node, position: positions.get(node.id) ?? node.position }))
}
