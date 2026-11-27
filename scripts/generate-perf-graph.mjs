/**
 * Génère le graphe de la preuve de performance (Story 20.2) : 500 répliques en arbre.
 *
 * Déterministe (graine fixe). Les répliques et les réponses sont tirées, avec remise, des
 * dialogues golden de la story 20.1 : la distribution des longueurs est donc la leur
 * (la Nef centrale fournit la réplique la plus longue, 2 437 caractères). Voknir, import
 * Notion hors modèle, est écarté.
 *
 * Usage : node scripts/generate-perf-graph.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const INPUTS = join(ROOT, 'tests', 'fixtures', 'unity_dialogues', 'inputs')
const OUTPUT = join(ROOT, 'e2e', 'fixtures', 'perf-graph-500.json')
const SOURCES = [
  'forgeron-itinerant.json',
  'nef-centrale.json',
  'offre-sous-les-braises.json',
  'rencontre-plis-ossements.json',
]
const NODE_COUNT = 500
const SEED = 20202
const OUTCOME_FIELDS = [
  'testCriticalFailureNode',
  'testFailureNode',
  'testSuccessNode',
  'testCriticalSuccessNode',
]
const CHOICE_PROPERTIES = ['text', 'test', 'traitRequirements', 'respectDelta', 'influenceDelta']

function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const random = mulberry32(SEED)
const pick = (list) => list[Math.floor(random() * list.length)]

const sourceNodes = SOURCES.flatMap((file) => {
  const parsed = JSON.parse(readFileSync(join(INPUTS, file), 'utf-8'))
  return Array.isArray(parsed) ? parsed : parsed.nodes
})
const lines = sourceNodes.filter((n) => typeof n.line === 'string' && n.line.trim() !== '')
const choiceCounts = sourceNodes.map((n) => (n.choices ?? []).length).filter((count) => count > 0)
const choices = sourceNodes
  .flatMap((n) => n.choices ?? [])
  .filter((c) => typeof c.text === 'string' && c.text.trim() !== '')

function copyChoice(nodeId, index) {
  const source = pick(choices)
  const choice = { choiceId: `${nodeId}-c${index}` }
  for (const key of CHOICE_PROPERTIES) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      choice[key] = source[key]
    }
  }
  return choice
}

const nodes = []
/** Réponses dont la suite n'est pas encore écrite. */
const openSlots = []

function createNode() {
  const id = nodes.length === 0 ? 'START' : `node-perf-${String(nodes.length).padStart(4, '0')}`
  const model = pick(lines)
  const node = { id, speaker: model.speaker || 'PNJ', line: model.line }
  if (model.title) node.title = model.title
  node.choices = Array.from({ length: pick(choiceCounts) }, (_, index) => copyChoice(id, index))
  nodes.push(node)
  openSlots.push(...node.choices)
  return node
}

createNode()
while (nodes.length < NODE_COUNT) {
  if (openSlots.length === 0) throw new Error('Arbre épuisé avant 500 répliques : changer la graine')
  const [choice] = openSlots.splice(Math.floor(random() * openSlots.length), 1)
  const fields = choice.test ? OUTCOME_FIELDS : ['targetNode']
  for (const field of fields) {
    if (nodes.length >= NODE_COUNT) break
    choice[field] = createNode().id
  }
}
for (const node of nodes) {
  for (const choice of node.choices) {
    if (!choice.test && !choice.targetNode) choice.targetNode = 'END'
  }
}

mkdirSync(dirname(OUTPUT), { recursive: true })
writeFileSync(OUTPUT, `${JSON.stringify({ schemaVersion: '1.1.0', nodes }, null, 1)}\n`, 'utf-8')

const quantile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)]
}
const lineLengths = nodes.map((n) => n.line.length)
const allChoices = nodes.flatMap((n) => n.choices)
console.log(
  JSON.stringify({
    nodes: nodes.length,
    choices: allChoices.length,
    testedChoices: allChoices.filter((c) => c.test).length,
    lineMedian: quantile(lineLengths, 0.5),
    lineP90: quantile(lineLengths, 0.9),
    lineMax: Math.max(...lineLengths),
    choicesPerNodeMedian: quantile(nodes.map((n) => n.choices.length), 0.5),
    choiceTextMedian: quantile(allChoices.map((c) => c.text.length), 0.5),
  })
)
