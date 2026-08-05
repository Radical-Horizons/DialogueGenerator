/**
 * Diagnostic d'option (2b) — calcul depuis le JSON Unity réel.
 */
import { describe, it, expect } from 'vitest'
import {
  computeOptionDiagnostics,
  formatOptionMeta,
  OPTION_LENGTH_TARGET,
} from './generationOptionDiagnostics'

const NODE_JSON = JSON.stringify({
  node: {
    speaker: 'Vessine Dhalgo',
    line: "*Elle allume la lampe de greffe.* « Ne dis rien encore. Je préfère lire la cicatrice. »",
    consequences: { flag: 'confiance_vessine' },
    choices: [
      { text: "« Elle est vieille. »", consequences: { flag: 'mensonge_greffe' } },
      { text: 'Laisser faire.', test: 'Volonté+Sang-froid:12' },
      { text: '« Le Reliquaire de Mahn. »', effortCost: 2 },
    ],
  },
})

describe('computeOptionDiagnostics', () => {
  it('sépare la didascalie de la réplique parlée', () => {
    const d = computeOptionDiagnostics(NODE_JSON)
    expect(d.speaker).toBe('Vessine Dhalgo')
    expect(d.stageDirection).toBe('Elle allume la lampe de greffe.')
    expect(d.line).toBe('« Ne dis rien encore. Je préfère lire la cicatrice. »')
  })

  it('étiquette chaque choix par le fait le plus discriminant', () => {
    const d = computeOptionDiagnostics(NODE_JSON)
    expect(d.choices).toHaveLength(3)
    // Un flag l'emporte sur un test, et il est mis en avant.
    expect(d.choices[0].tag).toBe('MENSONGE_GREFFE')
    expect(d.choices[0].emphasised).toBe(true)
    expect(d.choices[1].tag).toBe('VOLONTÉ+SANG-FROID:12')
    expect(d.choices[1].emphasised).toBe(false)
    expect(d.choices[2].tag).toBe('2 PE')
  })

  it('collecte les flags du nœud et des choix sans doublon', () => {
    const d = computeOptionDiagnostics(NODE_JSON)
    expect(d.flags).toEqual(['confiance_vessine', 'mensonge_greffe'])
  })

  it('ne compte comme citées que les fiches réellement présentes dans le texte', () => {
    const d = computeOptionDiagnostics(NODE_JSON, [
      'Reliquaire de Mahn',
      'Le Cloître Perforé',
      'Orsenne Kaladh',
    ])
    expect(d.citedEntities).toEqual(['Reliquaire de Mahn'])
    expect(d.uncitedCount).toBe(2)
  })

  it('mesure la longueur sur la réplique parlée, hors didascalie', () => {
    const short = computeOptionDiagnostics(
      JSON.stringify({ node: { line: 'Trois mots seulement.', choices: [] } })
    )
    expect(short.wordCount).toBe(3)
    expect(short.withinLengthTarget).toBe(false)

    const inRange = computeOptionDiagnostics(
      JSON.stringify({ node: { line: 'mot '.repeat(OPTION_LENGTH_TARGET.min).trim(), choices: [] } })
    )
    expect(inRange.withinLengthTarget).toBe(true)
  })

  it('lit la forme réelle de la génération : un tableau nu de nœuds', () => {
    // `render_unity_nodes` renvoie `json.dumps(nodes)`, sans enveloppe.
    const arrayForm = JSON.stringify([
      { id: 'START', speaker: 'Grish', line: 'Salut voyageur', choices: [{ text: 'a' }] },
      { id: 'N2', speaker: 'Autre', line: 'Suite' },
    ])
    const d = computeOptionDiagnostics(arrayForm)
    expect(d.speaker).toBe('Grish')
    expect(d.line).toBe('Salut voyageur')
    expect(d.choices).toHaveLength(1)
  })

  it('accepte aussi la forme document persisté (nodes[]) et la forme node singulier', () => {
    const doc = JSON.stringify({ schemaVersion: '1.2.0', nodes: [{ speaker: 'A', line: 'Salut' }] })
    expect(computeOptionDiagnostics(doc).speaker).toBe('A')
    const single = JSON.stringify({ node: { speaker: 'B', line: 'Coucou' } })
    expect(computeOptionDiagnostics(single).speaker).toBe('B')
  })

  it('tableau vide → diagnostic vide plutôt qu’un crash', () => {
    expect(computeOptionDiagnostics('[]').speaker).toBeNull()
  })

  it('JSON illisible ou absent → diagnostic vide, pas de crash', () => {
    expect(computeOptionDiagnostics('{pas du json').choices).toEqual([])
    expect(computeOptionDiagnostics(null).speaker).toBeNull()
    expect(computeOptionDiagnostics(undefined, ['A', 'B']).uncitedCount).toBe(2)
  })
})

describe('formatOptionMeta', () => {
  it('résume une option repliée en une ligne', () => {
    expect(formatOptionMeta(computeOptionDiagnostics(NODE_JSON))).toBe('3 réponses · 2 flags · 9 mots')
  })

  it('omet les flags quand il n’y en a pas', () => {
    const d = computeOptionDiagnostics(
      JSON.stringify({ node: { line: 'Une phrase.', choices: [{ text: 'a' }] } })
    )
    expect(formatOptionMeta(d)).toBe('1 réponse · 2 mots')
  })
})
