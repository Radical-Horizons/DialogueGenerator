/**
 * Contrat schéma : graphToDocument (save graphe) vs export backend.
 */
import { describe, it, expect } from 'vitest'
import { graphToDocument } from './documentToGraph'
import { postGenerationReactFlowGraph } from '../testFixtures/rawPostGeneration'

describe('generationSchemaContract — graphToDocument (save path)', () => {
  it('conserve test et choiceId stable après post-génération (targetNode direct omis si test)', () => {
    const { nodes, edges } = postGenerationReactFlowGraph()
    const doc = graphToDocument(nodes, edges)
    const start = doc.nodes.find((n) => n.id === 'START') as Record<string, unknown>
    const choices = start.choices as Record<string, unknown>[]
    expect(choices).toHaveLength(1)
    expect(choices[0].choiceId).toBe('choice_START_0')
    expect(choices[0].targetNode).toBeUndefined()
    expect(choices[0].test).toBe('Volonté+Adaptabilité:12')
  })

  it('ne normalise pas les flags côté frontend (PUT backend guérit)', () => {
    const { nodes, edges } = postGenerationReactFlowGraph()
    const doc = graphToDocument(nodes, edges)
    const start = doc.nodes.find((n) => n.id === 'START') as Record<string, unknown>
    const cons = start.consequences as { flag?: string }
    expect(cons.flag).toBe('FLAG_rencontre_valkazer_init')
  })
})
