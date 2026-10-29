/**
 * Diagnostic d'une option générée (écran 2b, colonne droite).
 *
 * **Uniquement du calculable.** Chaque ligne se dérive du JSON Unity produit et
 * du contexte réellement envoyé — longueur, réponses, flags posés, fiches citées.
 * Les jugements qualitatifs de la maquette (« ton demandé : tenu », « mensonge
 * possible : oui ») demanderaient un second appel LLM : ils ne sont pas inventés ici.
 */

/** Fourchette de longueur visée pour un premier nœud, en mots (repère de la maquette). */
export const OPTION_LENGTH_TARGET = { min: 40, max: 90 } as const

export interface OptionChoiceSummary {
  index: number
  text: string
  /** Étiquette mono à droite du choix : test de compétence, flag posé, coût d'effort. */
  tag: string | null
  /** L'étiquette signale-t-elle une révélation de lore (accent) plutôt qu'un état neutre ? */
  emphasised: boolean
}

export interface OptionDiagnostics {
  speaker: string | null
  line: string | null
  /** Didascalie : texte entre astérisques en tête de réplique, s'il y en a un. */
  stageDirection: string | null
  wordCount: number
  withinLengthTarget: boolean
  choices: OptionChoiceSummary[]
  /** Flags posés par le nœud et ses choix (déduplication conservée). */
  flags: string[]
  /** Fiches GDD sélectionnées dont le nom apparaît dans le texte généré. */
  citedEntities: string[]
  /** Fiches envoyées au modèle mais absentes du texte généré. */
  uncitedCount: number
}

interface UnityChoiceLike {
  text?: string
  test?: string
  effortCost?: number
  consequences?: { flag?: string }
  choiceEffects?: Array<{ flag?: string; targetId?: string }>
}

interface UnityNodeLike {
  speaker?: string
  line?: string
  choices?: UnityChoiceLike[]
  consequences?: { flag?: string }
}

/**
 * Extrait le premier nœud d'un JSON Unity, quelle que soit sa forme.
 *
 * ⚠️ La génération renvoie un **tableau nu** de nœuds : `render_unity_nodes` fait
 * `json.dumps(nodes)` sans enveloppe (`services/json_renderer/unity_json_renderer.py`).
 * Les documents persistés, eux, portent `{schemaVersion, nodes: [...]}`. Les deux
 * formes circulent — d'où les trois cas ci-dessous.
 */
export function firstUnityNode(jsonContent: string): UnityNodeLike | null {
  try {
    const parsed = JSON.parse(jsonContent) as
      | UnityNodeLike[]
      | { node?: UnityNodeLike; nodes?: UnityNodeLike[] }
    if (Array.isArray(parsed)) return parsed[0] ?? null
    return parsed.node ?? parsed.nodes?.[0] ?? null
  } catch {
    return null
  }
}

/** Sépare une didascalie en tête (`*Elle pose…*`) du reste de la réplique. */
function splitStageDirection(line: string): { stage: string | null; spoken: string } {
  const match = line.match(/^\s*\*([^*]+)\*\s*/)
  if (!match) return { stage: null, spoken: line.trim() }
  return { stage: match[1].trim(), spoken: line.slice(match[0].length).trim() }
}

/**
 * Compte les mots en ignorant la ponctuation isolée : les guillemets français
 * sont détachés du mot (« mot ») et gonfleraient le total de deux unités par réplique.
 */
function countWords(text: string): number {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token)).length
}

/** Étiquette mono d'un choix — le fait le plus discriminant, un seul par ligne. */
function choiceTag(choice: UnityChoiceLike): { tag: string | null; emphasised: boolean } {
  const flag = choice.consequences?.flag ?? choice.choiceEffects?.[0]?.flag
  if (flag) return { tag: flag.toUpperCase(), emphasised: true }
  if (choice.test) return { tag: choice.test.toUpperCase(), emphasised: false }
  if (typeof choice.effortCost === 'number' && choice.effortCost > 0) {
    return { tag: `${choice.effortCost} PE`, emphasised: false }
  }
  return { tag: null, emphasised: false }
}

/**
 * Calcule le diagnostic d'une option.
 *
 * @param jsonContent JSON Unity renvoyé par la génération.
 * @param sentEntityNames Noms des fiches GDD envoyées au modèle (toutes catégories).
 */
export function computeOptionDiagnostics(
  jsonContent: string | null | undefined,
  sentEntityNames: string[] = []
): OptionDiagnostics {
  const empty: OptionDiagnostics = {
    speaker: null,
    line: null,
    stageDirection: null,
    wordCount: 0,
    withinLengthTarget: false,
    choices: [],
    flags: [],
    citedEntities: [],
    uncitedCount: sentEntityNames.length,
  }
  if (!jsonContent) return empty

  const node = firstUnityNode(jsonContent)
  if (!node) return empty

  const rawLine = node.line ?? ''
  const { stage, spoken } = splitStageDirection(rawLine)

  const choices: OptionChoiceSummary[] = (node.choices ?? []).map((choice, index) => {
    const { tag, emphasised } = choiceTag(choice)
    return { index, text: choice.text ?? '', tag, emphasised }
  })

  const flags = Array.from(
    new Set(
      [
        node.consequences?.flag,
        ...(node.choices ?? []).flatMap((c) => [
          c.consequences?.flag,
          ...(c.choiceEffects ?? []).map((e) => e.flag),
        ]),
      ].filter((f): f is string => Boolean(f))
    )
  )

  // Fiche « citée » = son nom apparaît dans le texte généré (réplique + choix).
  const haystack = [rawLine, ...choices.map((c) => c.text)].join(' ').toLowerCase()
  const citedEntities = sentEntityNames.filter(
    (name) => name.trim().length > 2 && haystack.includes(name.toLowerCase())
  )

  const wordCount = countWords(spoken)

  return {
    speaker: node.speaker ?? null,
    line: spoken || null,
    stageDirection: stage,
    wordCount,
    withinLengthTarget:
      wordCount >= OPTION_LENGTH_TARGET.min && wordCount <= OPTION_LENGTH_TARGET.max,
    choices,
    flags,
    citedEntities,
    uncitedCount: Math.max(0, sentEntityNames.length - citedEntities.length),
  }
}

/** Résumé d'une ligne pour une option repliée : « 3 réponses · 2 flags ». */
export function formatOptionMeta(diag: OptionDiagnostics): string {
  const parts: string[] = []
  parts.push(`${diag.choices.length} ${diag.choices.length === 1 ? 'réponse' : 'réponses'}`)
  if (diag.flags.length > 0) {
    parts.push(`${diag.flags.length} ${diag.flags.length === 1 ? 'flag' : 'flags'}`)
  }
  if (diag.wordCount > 0) parts.push(`${diag.wordCount} mots`)
  return parts.join(' · ')
}
