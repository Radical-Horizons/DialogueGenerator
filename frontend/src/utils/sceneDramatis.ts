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
  const key = normalizeCharacterName(name)
  return FORBIDDEN_NPC_NAMES.some((f) => normalizeCharacterName(f) === key)
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

function isDialogueGraphNode(node: DramatisGraphNode): boolean {
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

function sameCharacter(a: string, b: string): boolean {
  return normalizeCharacterName(a) === normalizeCharacterName(b)
}

/**
 * PJ et PNJ d'une génération dans le graphe, lus dans le dialogue ouvert.
 *
 * Le panneau de contexte est global : il garde la scène de la page « Générer »
 * (ex. L'Éthérée & Uresaïr) quand on ouvre un autre dialogue. Le dialogue, lui,
 * dit qui parle : le PNJ est le locuteur du nœud parent (à défaut le plus fréquent),
 * le PJ est le personnage jouable que ses répliques nomment le plus. `fallback`
 * (scène du panneau) ne sert que pour ce que le dialogue ne permet pas de trancher.
 */
export function resolveDialogueDramatis(options: {
  nodes: DramatisGraphNode[]
  parentNodeId: string | null | undefined
  fallback: SceneDramatis
}): SceneDramatis {
  const { nodes, parentNodeId, fallback } = options
  const dialogueNodes = nodes.filter(isDialogueGraphNode)
  const parent = findParentDialogueNode(nodes, parentNodeId)

  let npc = validDialogueSpeaker(parent?.data?.speaker)
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
  if (!npc) return fallback

  const corpus = normalizeCharacterName(
    dialogueNodes
      .flatMap((node) => [
        typeof node.data?.line === 'string' ? node.data.line : '',
        ...choicesOf(node).map((c) => (typeof c?.text === 'string' ? c.text : '')),
      ])
      .join('\n')
      .replace(/[’`]/g, "'"),
  )
  let player: string | null = null
  let bestMentions = 0
  for (const candidate of PLAYABLE_CHARACTERS) {
    if (sameCharacter(candidate, npc)) continue
    const mentions = countMentions(corpus, mentionKey(candidate))
    if (mentions > bestMentions) {
      bestMentions = mentions
      player = candidate
    }
  }
  if (!player) {
    const fromPanel = fallback.playerCharacterId
    if (fromPanel && isPlayableCharacter(fromPanel) && !sameCharacter(fromPanel, npc)) {
      player = fromPanel
    } else {
      player =
        [DEFAULT_PLAYER_CHARACTER, ...PLAYABLE_CHARACTERS].find((p) => !sameCharacter(p, npc as string)) ??
        DEFAULT_PLAYER_CHARACTER
    }
  }
  return { playerCharacterId: player, npcSpeakerId: npc }
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/**
 * PJ/PNJ à envoyer pour une génération du graphe : la scène du panneau (et les valeurs
 * explicites éventuelles) sert de repli, le dialogue ouvert a le dernier mot.
 */
export function resolveGraphGenerationDramatis(options: {
  nodes: DramatisGraphNode[]
  parentNodeId: string | null | undefined
  contextSelections?: Record<string, unknown> | null
  sceneSelection?: { characterA: string | null; characterB: string | null } | null
  playerCharacterId?: string | null
  npcSpeakerId?: string | null
}): SceneDramatis {
  const selections = options.contextSelections ?? {}
  const rawProtagonists = selections.scene_protagonists
  const sceneProtagonists =
    rawProtagonists && typeof rawProtagonists === 'object' && !Array.isArray(rawProtagonists)
      ? (rawProtagonists as { personnage_a?: string; personnage_b?: string })
      : null
  const fallback = resolveSceneDramatis({
    playerCharacterId:
      options.playerCharacterId ??
      options.sceneSelection?.characterA ??
      sceneProtagonists?.personnage_a,
    npcSpeakerId:
      options.npcSpeakerId ?? options.sceneSelection?.characterB ?? sceneProtagonists?.personnage_b,
    sceneProtagonists,
    contextCharacters: [
      ...stringList(selections.characters_full),
      ...stringList(selections.characters_excerpt),
    ],
  })
  return resolveDialogueDramatis({
    nodes: options.nodes,
    parentNodeId: options.parentNodeId,
    fallback,
  })
}

export function resolveDramatisFromSelections(options: {
  sceneSelection?: { characterA: string | null; characterB: string | null } | null
  sceneProtagonists?: { personnage_a?: string; personnage_b?: string } | null
  contextCharacters?: string[]
}): SceneDramatis {
  return resolveSceneDramatis({
    playerCharacterId:
      options.sceneSelection?.characterA ?? options.sceneProtagonists?.personnage_a,
    npcSpeakerId:
      options.sceneSelection?.characterB ?? options.sceneProtagonists?.personnage_b,
    sceneProtagonists: options.sceneProtagonists,
    contextCharacters: options.contextCharacters,
  })
}
