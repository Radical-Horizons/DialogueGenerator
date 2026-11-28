/**
 * Fiche de scène : la distribution et le contexte d'un dialogue (architecture A1).
 *
 * Fonctions pures : lecture de la fiche, déduction depuis le dialogue, graphies des
 * locuteurs et contexte envoyé à une génération. Rien ici ne lit le panneau de contexte.
 */
import type { ContextSelection } from '../types/api'
import { resolveGddCanonicalName, type GddCatalogEntry } from './gddEntityNames'
import {
  DEFAULT_PLAYER_CHARACTER,
  PLAYABLE_CHARACTERS,
  findParentDialogueNode,
  isDialogueGraphNode,
  isForbiddenNpc,
  readDialogueDramatis,
  speakerKey,
  type DramatisGraphNode,
} from './sceneDramatis'

export { speakerKey }

export interface SceneRef {
  /** `notion_page_id` de la fiche GDD ; `null` pour un nom libre. */
  entryId: string | null
  name: string
}

export type SceneLinkedMode = 'full' | 'excerpt'

export interface SceneLinkedEntry {
  /** Clé de base de `ContextSelection` (`characters`, `locations`, `chapters`…). */
  category: string
  name: string
  /** Absent pour les catégories sans mode. */
  mode?: SceneLinkedMode
  entryId: string | null
}

export interface SceneSheet {
  npcs: SceneRef[]
  pc: SceneRef | null
  place: SceneRef | null
  brief: string
  linkedEntries: SceneLinkedEntry[]
  /** Tons cochés ; lus par `sceneTones`. */
  tones?: string[]
  /** Profil d'auteur (voix d'écriture) ; lu par `sceneAuthorProfileId`. */
  authorProfileId?: string | null
  /** Champs sans interface ici (`contextBudget`) : conservés. */
  [key: string]: unknown
}

export const CATEGORIES_WITH_MODE = [
  'characters',
  'locations',
  'items',
  'species',
  'communities',
] as const

export const CATEGORIES_WITHOUT_MODE = [
  'dialogues_examples',
  'narrative_structures',
  'chapters',
  'scenes',
] as const

/**
 * Consigne qui suit le brief quand l'auteur n'en a pas écrit (lot, job). Le serveur ne
 * pose la sienne que si la consigne reçue est vide, ce que le brief empêche : même texte
 * que `DEFAULT_NODE_SCENE_INSTRUCTIONS` (services/dialogue_dramatic_progression.py).
 */
export const SCENE_DEFAULT_INSTRUCTION =
  'Écris le nœud : paroles du PNJ entre guillemets ; didascalies claires en *italique* narrateur (3e personne), hors guillemets.'

function asRef(value: unknown): SceneRef | null {
  if (!value || typeof value !== 'object') return null
  const ref = value as Record<string, unknown>
  if (typeof ref.name !== 'string') return null
  return {
    ...ref,
    name: ref.name,
    entryId: typeof ref.entryId === 'string' ? ref.entryId : null,
  }
}

/** Fiche reçue du serveur ; `null` si le document n'en porte pas. */
export function parseSceneSheet(raw: unknown): SceneSheet | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const sheet = raw as Record<string, unknown>
  return {
    ...sheet,
    npcs: Array.isArray(sheet.npcs)
      ? sheet.npcs.map(asRef).filter((ref): ref is SceneRef => ref !== null)
      : [],
    pc: asRef(sheet.pc),
    place: asRef(sheet.place),
    brief: typeof sheet.brief === 'string' ? sheet.brief : '',
    linkedEntries: Array.isArray(sheet.linkedEntries)
      ? sheet.linkedEntries.filter(isLinkedEntry)
      : [],
  }
}

function isLinkedEntry(value: unknown): value is SceneLinkedEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  return typeof entry.category === 'string' && typeof entry.name === 'string'
}

/** Fiche GDD d'un nom (accents, apostrophes puis alias) et son identifiant stable. */
export function sceneRefFor(name: string, catalog: GddCatalogEntry[]): SceneRef {
  const key = speakerKey(name)
  const entry =
    catalog.find((item) => speakerKey(item.name) === key) ??
    catalog.find((item) => item.name === resolveGddCanonicalName(name, catalog))
  if (!entry) return { entryId: null, name }
  const pageId = entry.data?.notion_page_id
  return { entryId: typeof pageId === 'string' ? pageId : null, name: entry.name }
}

interface SpeakerGroup {
  key: string
  /** Graphie → ids des répliques qui l'emploient. */
  spellings: Map<string, string[]>
  total: number
}

function speakerOf(node: DramatisGraphNode): string {
  return typeof node.data?.speaker === 'string' ? node.data.speaker : ''
}

/** Locuteurs des répliques, graphies d'un même nom réunies, les plus présents d'abord. */
function speakerGroups(nodes: DramatisGraphNode[]): SpeakerGroup[] {
  const groups = new Map<string, SpeakerGroup>()
  for (const node of nodes) {
    if (!isDialogueGraphNode(node)) continue
    const spelling = speakerOf(node)
    const key = speakerKey(spelling)
    if (!key || key === 'pnj') continue
    const group = groups.get(key) ?? { key, spellings: new Map(), total: 0 }
    group.spellings.set(spelling, [...(group.spellings.get(spelling) ?? []), node.id])
    group.total += 1
    groups.set(key, group)
  }
  // Tri stable : à égalité, le premier apparu reste devant.
  return [...groups.values()].sort((a, b) => b.total - a.total)
}

function mostFrequentSpelling(group: SpeakerGroup): string {
  let best = ''
  let count = 0
  for (const [spelling, ids] of group.spellings) {
    if (ids.length > count) {
      best = spelling
      count = ids.length
    }
  }
  return best.trim()
}

/** Plusieurs vues lisent la même déduction : une seule par état des nœuds. */
const deductions = new WeakMap<
  DramatisGraphNode[],
  { characters: GddCatalogEntry[]; sheet: SceneSheet }
>()

/** Fiche déduite du seul dialogue, sans lieu ni brief. */
export function deduceSceneSheet(
  nodes: DramatisGraphNode[],
  characters: GddCatalogEntry[],
): SceneSheet {
  const known = deductions.get(nodes)
  if (known && known.characters === characters) return known.sheet
  const sheet = deduceFromNodes(nodes, characters)
  deductions.set(nodes, { characters, sheet })
  return sheet
}

function deduceFromNodes(
  nodes: DramatisGraphNode[],
  characters: GddCatalogEntry[],
): SceneSheet {
  // Deux graphies (dont un alias) peuvent désigner la même fiche : un seul PNJ.
  const unique = new Map<string, SceneRef>()
  for (const group of speakerGroups(nodes)) {
    const ref = sceneRefFor(mostFrequentSpelling(group), characters)
    if (!isForbiddenNpc(ref.name) && !unique.has(speakerKey(ref.name))) {
      unique.set(speakerKey(ref.name), ref)
    }
  }
  const npcs = [...unique.values()]
  const { playerCharacterId } = readDialogueDramatis({
    nodes,
    parentNodeId: null,
    notPlayer: npcs.map((npc) => npc.name),
  })
  return {
    npcs,
    pc: playerCharacterId ? sceneRefFor(playerCharacterId, characters) : null,
    place: null,
    brief: '',
    linkedEntries: [],
  }
}

export interface SpeakerSpellingIssue {
  /** Graphie proposée. */
  target: string
  /** Autres graphies présentes dans le dialogue. */
  others: string[]
  /** Répliques à réécrire si l'auteur accepte. */
  nodeIds: string[]
}

export interface SpeakerIssues {
  spellings: SpeakerSpellingIssue[]
  emptyNodeIds: string[]
}

/** Graphies à rapprocher et répliques sans locuteur (vide ou « PNJ »). Ne réécrit rien. */
export function findSpeakerIssues(nodes: DramatisGraphNode[], sheet: SceneSheet): SpeakerIssues {
  const spellings: SpeakerSpellingIssue[] = []
  for (const group of speakerGroups(nodes)) {
    const target =
      sheet.npcs.find((npc) => speakerKey(npc.name) === group.key)?.name ??
      mostFrequentSpelling(group)
    const others = [...group.spellings].filter(([spelling]) => spelling !== target)
    if (others.length === 0) continue
    spellings.push({
      target,
      others: others.map(([spelling]) => spelling),
      nodeIds: others.flatMap(([, ids]) => ids),
    })
  }
  return {
    spellings,
    emptyNodeIds: nodes
      .filter((node) => {
        if (!isDialogueGraphNode(node)) return false
        const key = speakerKey(speakerOf(node))
        return !key || key === 'pnj'
      })
      .map((node) => node.id),
  }
}

/** Tons proposés par la fiche ; l'auteur peut en ajouter d'autres. */
export const SCENE_TONES = [
  'tension',
  'intime',
  'humour',
  'révélation',
  'menace',
  'solennel',
  'dramatique',
] as const

export function sceneTones(sheet: SceneSheet): string[] {
  return Array.isArray(sheet.tones)
    ? sheet.tones.filter((tone): tone is string => typeof tone === 'string' && tone.trim() !== '')
    : []
}

export function sceneAuthorProfileId(sheet: SceneSheet): string | null {
  return typeof sheet.authorProfileId === 'string' && sheet.authorProfileId
    ? sheet.authorProfileId
    : null
}

export function toggleSceneTone(sheet: SceneSheet, tone: string): SceneSheet {
  const tones = sceneTones(sheet)
  return {
    ...sheet,
    tones: tones.includes(tone) ? tones.filter((item) => item !== tone) : [...tones, tone],
  }
}

/** Ton saisi librement : sans `#` (le prompt le pose) ni doublon à la casse près. */
export function addSceneTone(sheet: SceneSheet, raw: string): SceneSheet {
  const typed = raw.replace(/^[#\s]+/, '').replace(/\s+/g, ' ').trim()
  if (!typed) return sheet
  const lower = typed.toLocaleLowerCase('fr')
  const tones = sceneTones(sheet)
  if (tones.some((tone) => tone.toLocaleLowerCase('fr') === lower)) return sheet
  const known = SCENE_TONES.find((tone) => tone === lower)
  return { ...sheet, tones: [...tones, known ?? typed] }
}

/** Catégories qu'une mention `@` peut citer. */
export type MentionCategory = (typeof CATEGORIES_WITH_MODE)[number]

export interface BriefSegment {
  /** Texte tel qu'écrit, `@` compris pour une mention. */
  text: string
  /** Position dans le brief (UTF-16). */
  start: number
  /** Nom de la fiche citée ; `null` pour du texte. */
  mention: string | null
}

const WORD_CHAR = /[\p{L}\p{N}_]/u

/** Même longueur que l'entrée : seules la casse et la forme de l'apostrophe sont ignorées. */
function foldForMention(text: string): string {
  return text.replace(/[‘’ʼ]/g, "'").toLowerCase()
}

/** Nom connu le plus long écrit juste après le `@` placé en `at`. */
function mentionAt(text: string, at: number, names: string[]): string | null {
  if (at > 0 && WORD_CHAR.test(text[at - 1])) return null
  let best: string | null = null
  for (const name of names) {
    if (!name || (best && name.length <= best.length)) continue
    const end = at + 1 + name.length
    if (end > text.length) continue
    if (foldForMention(text.slice(at + 1, end)) !== foldForMention(name)) continue
    if (end < text.length && WORD_CHAR.test(text[end])) continue
    best = name
  }
  return best
}

/** Brief découpé en texte et mentions ; un `@` sans fiche reste du texte. */
export function splitBriefMentions(brief: string, names: string[]): BriefSegment[] {
  const segments: BriefSegment[] = []
  let textStart = 0
  let at = brief.indexOf('@')
  while (at >= 0) {
    const name = mentionAt(brief, at, names)
    if (name) {
      if (at > textStart) {
        segments.push({ text: brief.slice(textStart, at), start: textStart, mention: null })
      }
      textStart = at + 1 + name.length
      segments.push({ text: brief.slice(at, textStart), start: at, mention: name })
    }
    at = brief.indexOf('@', name ? textStart : at + 1)
  }
  if (textStart < brief.length) {
    segments.push({ text: brief.slice(textStart), start: textStart, mention: null })
  }
  return segments
}

/** Le modèle reçoit le nom cité, sans son `@`. */
export function stripBriefMentions(brief: string, names: string[]): string {
  return splitBriefMentions(brief, names)
    .map((segment) => (segment.mention ? segment.text.slice(1) : segment.text))
    .join('')
}

/** Mention en cours de saisie devant le curseur : position du `@` et texte cherché. */
export function findMentionQuery(
  text: string,
  caret: number,
  names: string[],
): { start: number; query: string } | null {
  const before = text.slice(0, caret)
  const start = before.lastIndexOf('@')
  if (start < 0 || (start > 0 && WORD_CHAR.test(before[start - 1]))) return null
  const query = before.slice(start + 1)
  if (!query || query.length > 40 || query.includes('\n') || /^\s/.test(query)) return null
  const written = mentionAt(text, start, names)
  if (written) {
    const end = start + 1 + written.length
    // Curseur dans une mention déjà écrite : choisir doublerait la fin du nom.
    if (caret < end) return null
    // Au-delà : le nom est écrit, sauf si la saisie en commence un plus long.
    if (caret > end) {
      const typed = speakerKey(query) + (/\s$/.test(query) ? ' ' : '')
      const longer = names.some(
        (name) => name.length > written.length && speakerKey(name).startsWith(typed),
      )
      if (!longer) return null
    }
  }
  return { start, query }
}

/** Noms que la fiche porte déjà : ses mentions restent reconnues sans catalogue. */
export function sheetEntryNames(sheet: SceneSheet): string[] {
  return [
    ...sheet.npcs.map((npc) => npc.name),
    sheet.pc?.name,
    sheet.place?.name,
    ...sheet.linkedEntries.map((entry) => entry.name),
  ].filter((name): name is string => typeof name === 'string' && name.trim() !== '')
}

export interface SceneGeneration {
  contextSelections: ContextSelection
  npcSpeakerId: string | undefined
  playerCharacterId: string
  brief: string
  narrativeTags: string[] | undefined
  authorProfileId: string | null
}

function emptySelection(): ContextSelection {
  return {
    characters_full: [],
    characters_excerpt: [],
    locations_full: [],
    locations_excerpt: [],
    items_full: [],
    items_excerpt: [],
    species_full: [],
    species_excerpt: [],
    communities_full: [],
    communities_excerpt: [],
    dialogues_examples: [],
    narrative_structures: [],
    chapters: [],
    scenes: [],
  }
}

type SelectionListKey = Exclude<
  keyof ContextSelection,
  'scene_protagonists' | 'scene_location' | 'generation_settings'
>

function selectionKeyOf(entry: SceneLinkedEntry): SelectionListKey | null {
  if ((CATEGORIES_WITH_MODE as readonly string[]).includes(entry.category)) {
    const mode = entry.mode === 'excerpt' ? 'excerpt' : 'full'
    return `${entry.category}_${mode}` as SelectionListKey
  }
  if ((CATEGORIES_WITHOUT_MODE as readonly string[]).includes(entry.category)) {
    return entry.category as SelectionListKey
  }
  return null
}

function addUnique(list: string[], name: string): void {
  if (!list.includes(name)) list.push(name)
}

function without(list: string[], name: string): string[] {
  return list.filter((item) => item !== name)
}

/**
 * Contexte, PNJ, PJ et brief d'une génération du dialogue ouvert.
 *
 * PNJ = locuteur du nœud parent s'il est un PNJ de la fiche, sinon le premier ; les
 * autres PNJ partent en fiches. PNJ ou PJ absent de la fiche : lu dans le dialogue.
 */
export function buildSceneGeneration(options: {
  sheet: SceneSheet
  nodes: DramatisGraphNode[]
  parentNodeId: string | null | undefined
  /** Catalogue GDD : un locuteur écrit sous un alias désigne le PNJ de la fiche. */
  characters: GddCatalogEntry[]
  /** Autres noms du GDD citables dans le brief. */
  mentionNames?: string[]
}): SceneGeneration {
  const { sheet, nodes, parentNodeId, characters, mentionNames = [] } = options
  const npcNames = sheet.npcs.map((npc) => npc.name.trim()).filter(Boolean)
  const parent = findParentDialogueNode(nodes, parentNodeId)
  const speaker = parent ? speakerOf(parent).trim() : ''
  const parentKeys = speaker
    ? [speakerKey(speaker), speakerKey(sceneRefFor(speaker, characters).name)]
    : []
  const sheetNpc =
    npcNames.find((name) => parentKeys.includes(speakerKey(name))) ?? npcNames[0]
  const sheetPc = sheet.pc?.name.trim() || undefined

  const fromDialogue = readDialogueDramatis({
    nodes,
    parentNodeId,
    npcSpeakerId: sheetNpc,
    // Un PNJ de la fiche, même jouable, n'est jamais pris pour le PJ.
    notPlayer: npcNames,
  })
  const npc = sheetNpc ?? fromDialogue.npcSpeakerId ?? undefined
  const takenKeys = new Set([npc, ...npcNames].map(speakerKey))
  const pc =
    sheetPc ??
    fromDialogue.playerCharacterId ??
    [DEFAULT_PLAYER_CHARACTER, ...PLAYABLE_CHARACTERS].find(
      (name) => !takenKeys.has(speakerKey(name)),
    ) ??
    DEFAULT_PLAYER_CHARACTER

  const selections = emptySelection()
  for (const entry of sheet.linkedEntries) {
    if (!entry || typeof entry.name !== 'string' || !entry.name) continue
    const key = selectionKeyOf(entry)
    if (key) addUnique(selections[key], entry.name)
  }
  for (const other of npcNames) {
    if (speakerKey(other) === speakerKey(npc)) continue
    if (!selections.characters_excerpt.includes(other)) addUnique(selections.characters_full, other)
  }
  if (npc) {
    selections.characters_excerpt = without(selections.characters_excerpt, npc)
    addUnique(selections.characters_full, npc)
  }
  selections.characters_full = without(selections.characters_full, pc)
  addUnique(selections.characters_excerpt, pc)

  const place = sheet.place?.name.trim()
  if (place) {
    selections.scene_location = { lieu: place }
    if (sheet.place?.entryId && !selections.locations_excerpt.includes(place)) {
      addUnique(selections.locations_full, place)
    }
  }
  selections.scene_protagonists = { personnage_a: pc, ...(npc ? { personnage_b: npc } : {}) }

  const tones = sceneTones(sheet)
  return {
    contextSelections: selections,
    npcSpeakerId: npc,
    playerCharacterId: pc,
    brief: stripBriefMentions(sheet.brief, [
      ...sheetEntryNames(sheet),
      ...characters.map((entry) => entry.name),
      ...mentionNames,
    ]).trim(),
    narrativeTags: tones.length > 0 ? tones : undefined,
    authorProfileId: sceneAuthorProfileId(sheet),
  }
}

/** Le brief précède la consigne envoyée ; la consigne mémorisée sur le nœud reste intacte. */
export function composeSceneInstructions(brief: string, instructions: string): string {
  const trimmed = brief.trim()
  if (!trimmed) return instructions
  return `Brief de la scène : ${trimmed}\n\n${instructions.trim() || SCENE_DEFAULT_INSTRUCTION}`
}

function linkedKey(category: string, name: string): string {
  return `${category}:${speakerKey(name)}`
}

/** Fiche citée par une mention : ajoutée en mode complet, sauf PNJ, PJ, lieu et doublon. */
export function addMentionedEntry(
  sheet: SceneSheet,
  category: MentionCategory,
  name: string,
  entryId: string | null,
): SceneSheet {
  const held = [
    ...sheet.npcs.map((npc) => linkedKey('characters', npc.name)),
    ...(sheet.pc ? [linkedKey('characters', sheet.pc.name)] : []),
    ...(sheet.place ? [linkedKey('locations', sheet.place.name)] : []),
    ...sheet.linkedEntries.map((entry) => linkedKey(entry.category, entry.name)),
  ]
  if (held.includes(linkedKey(category, name))) return sheet
  return {
    ...sheet,
    linkedEntries: [...sheet.linkedEntries, { category, name, mode: 'full', entryId }],
  }
}

/**
 * Fiches cochées de la colonne qui manquent à la fiche de scène. Le PNJ, le PJ et le
 * lieu de la fiche n'y sont pas recopiés.
 */
export function newLinkedEntries(
  selections: ContextSelection,
  catalogs: Partial<Record<string, GddCatalogEntry[]>>,
  sheet: SceneSheet,
): SceneLinkedEntry[] {
  const seen = new Set<string>(
    sheet.linkedEntries.map((entry) => linkedKey(entry.category, String(entry.name ?? ''))),
  )
  for (const ref of [...sheet.npcs, ...(sheet.pc ? [sheet.pc] : [])]) {
    seen.add(linkedKey('characters', ref.name))
  }
  if (sheet.place) seen.add(linkedKey('locations', sheet.place.name))

  const added: SceneLinkedEntry[] = []
  const take = (category: string, names: string[] | undefined, mode?: SceneLinkedMode) => {
    for (const name of names ?? []) {
      const key = linkedKey(category, name)
      if (seen.has(key)) continue
      seen.add(key)
      const { entryId } = sceneRefFor(name, catalogs[category] ?? [])
      added.push({ category, name, ...(mode ? { mode } : {}), entryId })
    }
  }
  for (const category of CATEGORIES_WITH_MODE) {
    take(category, selections[`${category}_full`], 'full')
    take(category, selections[`${category}_excerpt`], 'excerpt')
  }
  for (const category of CATEGORIES_WITHOUT_MODE) {
    take(category, selections[category])
  }
  return added
}
