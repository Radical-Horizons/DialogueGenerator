/**
 * Rôles PJ/PNJ Alteir — miroir de services/scene_dramatis.py
 */
export const PLAYABLE_CHARACTERS = [
  'Uresaïr',
  "L'Éthérée",
  'Vethraak',
  'Eonundé Alinen-Egan',
] as const

export type PlayableCharacter = (typeof PLAYABLE_CHARACTERS)[number]

export const DEFAULT_PLAYER_CHARACTER: PlayableCharacter = "L'Éthérée"

const FORBIDDEN_NPC_NAMES = ["L'Éthérée"]

function normalizeCharacterName(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function isPlayableCharacter(name: string | null | undefined): boolean {
  if (!name?.trim()) return false
  const key = normalizeCharacterName(name)
  return PLAYABLE_CHARACTERS.some((p) => normalizeCharacterName(p) === key)
}

export function isForbiddenNpc(name: string | null | undefined): boolean {
  if (!name?.trim()) return false
  const key = speakerKey(name)
  return FORBIDDEN_NPC_NAMES.some((f) => speakerKey(f) === key)
}

export function isValidNpc(name: string | null | undefined, playerId: string): boolean {
  if (!name?.trim()) return false
  if (isForbiddenNpc(name)) return false
  if (normalizeCharacterName(name) === normalizeCharacterName(playerId)) return false
  return true
}

export function filterPlayableCharacterOptions(allCharacters: string[]): string[] {
  return allCharacters.filter((name) => isPlayableCharacter(name))
}

export function filterNpcCharacterOptions(allCharacters: string[], playerId: string | null): string[] {
  if (!playerId) {
    return allCharacters.filter((name) => !isForbiddenNpc(name))
  }
  return allCharacters.filter((name) => isValidNpc(name, playerId))
}

export function randomPlayableCharacter(exclude?: string | null): PlayableCharacter {
  const pool = PLAYABLE_CHARACTERS.filter(
    (name) => !exclude || normalizeCharacterName(name) !== normalizeCharacterName(exclude),
  )
  if (pool.length === 0) return DEFAULT_PLAYER_CHARACTER
  return pool[Math.floor(Math.random() * pool.length)]
}

export function randomNpcCharacter(allCharacters: string[], playerId: string): string | null {
  const pool = filterNpcCharacterOptions(allCharacters, playerId)
  if (pool.length === 0) return null
  return pool[Math.floor(Math.random() * pool.length)]
}

export interface SceneDramatis {
  playerCharacterId: string
  npcSpeakerId: string
}

export function resolveSceneDramatis(options: {
  playerCharacterId?: string | null
  npcSpeakerId?: string | null
  sceneProtagonists?: { personnage_a?: string; personnage_b?: string } | null
  contextCharacters?: string[]
}): SceneDramatis {
  const player =
    options.playerCharacterId ||
    options.sceneProtagonists?.personnage_a ||
    null
  const npc =
    options.npcSpeakerId ||
    options.sceneProtagonists?.personnage_b ||
    null

  const resolvedPlayer = player && isPlayableCharacter(player) ? player : DEFAULT_PLAYER_CHARACTER

  if (npc && isValidNpc(npc, resolvedPlayer)) {
    return { playerCharacterId: resolvedPlayer, npcSpeakerId: npc }
  }

  const playableNpc = PLAYABLE_CHARACTERS.find(
    (name) =>
      normalizeCharacterName(name) !== normalizeCharacterName(resolvedPlayer) &&
      isValidNpc(name, resolvedPlayer),
  )
  if (playableNpc) {
    return { playerCharacterId: resolvedPlayer, npcSpeakerId: playableNpc }
  }

  const fromContext = (options.contextCharacters ?? []).find((name) =>
    isValidNpc(name, resolvedPlayer),
  )
  if (fromContext) {
    return { playerCharacterId: resolvedPlayer, npcSpeakerId: fromContext }
  }

  return { playerCharacterId: resolvedPlayer, npcSpeakerId: 'PNJ' }
}

export function sceneHasLocation(selection: {
  sceneRegion?: string | null
  subLocation?: string | null
  locationsFull?: string[]
  locationsExcerpt?: string[]
}): boolean {
  if (selection.sceneRegion || selection.subLocation) return true
  if ((selection.locationsFull?.length ?? 0) > 0) return true
  if ((selection.locationsExcerpt?.length ?? 0) > 0) return true
  return false
}

/** Nœud du graphe tel que le lit la résolution PJ/PNJ (sous-ensemble de `reactflow.Node`). */
export interface DramatisGraphNode {
  id: string
  type?: string
  data?: Record<string, unknown> | null
}

export function isDialogueGraphNode(node: DramatisGraphNode): boolean {
  if (node.type === 'dialogueNode') return true
  if (node.type) return false
  return typeof node.data?.line === 'string'
}

function choicesOf(node: DramatisGraphNode): Array<Record<string, unknown>> {
  const raw = node.data?.choices
  return Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : []
}

/**
 * Nœud de dialogue d'où part une génération : le nœud lui-même, ou celui qui porte
 * le choix d'une barre de test (`test-node-<id>-choice-<i>` ou `test:<choiceId>`).
 */
export function findParentDialogueNode(
  nodes: DramatisGraphNode[],
  parentNodeId: string | null | undefined,
): DramatisGraphNode | undefined {
  if (!parentNodeId) return undefined
  if (parentNodeId.startsWith('test:')) {
    const choiceId = parentNodeId.slice('test:'.length)
    return nodes.find(
      (n) =>
        isDialogueGraphNode(n) &&
        choicesOf(n).some((c, i) => (c?.choiceId ?? `__idx_${i}`) === choiceId),
    )
  }
  if (parentNodeId.startsWith('test-node-')) {
    const rest = parentNodeId.slice('test-node-'.length)
    const cut = rest.lastIndexOf('-choice-')
    if (cut <= 0) return undefined
    const dialogueId = rest.slice(0, cut)
    return nodes.find((n) => n.id === dialogueId)
  }
  return nodes.find((n) => n.id === parentNodeId)
}

function validDialogueSpeaker(speaker: unknown): string | null {
  if (typeof speaker !== 'string') return null
  const name = speaker.trim()
  if (!name || name === 'PNJ' || isForbiddenNpc(name)) return null
  return name
}

/** Mot le plus long du nom, sans accents : « L'Éthérée » → « etheree ». */
function mentionKey(name: string): string {
  const words = normalizeCharacterName(name).split(/[^a-z0-9]+/).filter(Boolean)
  return words.reduce((longest, w) => (w.length > longest.length ? w : longest), '')
}

function countMentions(haystack: string, key: string): number {
  if (!key) return 0
  const pattern = new RegExp(`(^|[^a-z0-9])${key}(?=[^a-z0-9]|$)`, 'g')
  return haystack.match(pattern)?.length ?? 0
}

/** Clé de comparaison d'un locuteur : casse, accents, apostrophes et espaces neutralisés. */
export function speakerKey(name: unknown): string {
  if (typeof name !== 'string') return ''
  return normalizeCharacterName(name.replace(/[‘’ʼ`]/g, "'").replace(/\s+/g, ' '))
}

/** PJ et PNJ que le dialogue permet de lire ; `null` quand il ne le dit pas. */
export interface DialogueDramatis {
  playerCharacterId: string | null
  npcSpeakerId: string | null
}

/**
 * PJ et PNJ lus dans le seul dialogue, sans repli.
 *
 * Le PNJ est le locuteur du nœud parent (à défaut le plus fréquent), le PJ est le
 * personnage jouable que les répliques et réponses nomment le plus.
 */
export function readDialogueDramatis(options: {
  nodes: DramatisGraphNode[]
  parentNodeId: string | null | undefined
  /** PNJ déjà connu (fiche de scène) : il remplace la lecture des locuteurs. */
  npcSpeakerId?: string | null
  /** Autres personnages que le PJ ne peut pas être. */
  notPlayer?: string[]
}): DialogueDramatis {
  const { nodes, parentNodeId } = options
  const dialogueNodes = nodes.filter(isDialogueGraphNode)

  let npc: string | null = options.npcSpeakerId?.trim() || null
  if (!npc) npc = validDialogueSpeaker(findParentDialogueNode(nodes, parentNodeId)?.data?.speaker)
  if (!npc) {
    const counts = new Map<string, number>()
    for (const node of dialogueNodes) {
      const speaker = validDialogueSpeaker(node.data?.speaker)
      if (speaker) counts.set(speaker, (counts.get(speaker) ?? 0) + 1)
    }
    let best = 0
    for (const [speaker, count] of counts) {
      if (count > best) {
        best = count
        npc = speaker
      }
    }
  }

  const corpus = normalizeCharacterName(
    dialogueNodes
      .flatMap((node) => [
        typeof node.data?.line === 'string' ? node.data.line : '',
        ...choicesOf(node).map((c) => (typeof c?.text === 'string' ? c.text : '')),
      ])
      .join('\n')
      .replace(/[’`]/g, "'"),
  )
  const excluded = new Set([npc, ...(options.notPlayer ?? [])].map(speakerKey))
  let player: string | null = null
  let bestMentions = 0
  for (const candidate of PLAYABLE_CHARACTERS) {
    if (excluded.has(speakerKey(candidate))) continue
    const mentions = countMentions(corpus, mentionKey(candidate))
    if (mentions > bestMentions) {
      bestMentions = mentions
      player = candidate
    }
  }
  return { playerCharacterId: player, npcSpeakerId: npc }
}
