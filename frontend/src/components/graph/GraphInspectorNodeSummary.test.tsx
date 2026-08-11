/**
 * Onglet NŒUD en vue lecture (écran 2e) — chaque rangée vient des données du nœud.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { Node } from 'reactflow'
import { GraphInspectorNodeSummary } from './GraphInspectorNodeSummary'

function makeNode(data: Record<string, unknown>): Node {
  return { id: 'START', type: 'dialogueNode', position: { x: 0, y: 0 }, data } as Node
}

const noop = () => {}

describe('GraphInspectorNodeSummary', () => {
  it('compte les réponses et signale celles qui portent une mécanique', () => {
    render(
      <GraphInspectorNodeSummary
        node={makeNode({
          choices: [
            { text: 'a' },
            { text: 'b', test: 'Volonté+Sang-froid:12' },
            { text: 'c', effortCost: 2 },
          ],
        })}
        errorCount={0}
        warningCount={0}
        onEdit={noop}
        onShowHealth={noop}
      />
    )
    expect(screen.getByText('3 — dont 2 avec test ou coût')).toBeInTheDocument()
  })

  it('distingue une fin de dialogue d’un enchaînement direct', () => {
    const { rerender } = render(
      <GraphInspectorNodeSummary
        node={makeNode({ choices: [] })}
        errorCount={0}
        warningCount={0}
        onEdit={noop}
        onShowHealth={noop}
      />
    )
    expect(screen.getByText(/le dialogue se termine ici/)).toBeInTheDocument()

    rerender(
      <GraphInspectorNodeSummary
        node={makeNode({ choices: [], nextNode: 'N2' })}
        errorCount={0}
        warningCount={0}
        onEdit={noop}
        onShowHealth={noop}
      />
    )
    expect(screen.getByText(/enchaîne directement/)).toBeInTheDocument()
  })

  it('collecte les flags du nœud et des choix', () => {
    render(
      <GraphInspectorNodeSummary
        node={makeNode({
          consequences: { flag: 'confiance_vessine' },
          choices: [{ text: 'a', consequences: { flag: 'reliquaire_revele' } }],
        })}
        errorCount={0}
        warningCount={0}
        onEdit={noop}
        onShowHealth={noop}
      />
    )
    expect(screen.getByText('confiance_vessine · reliquaire_revele')).toBeInTheDocument()
  })

  it('affiche la santé du nœud et ouvre l’onglet SANTÉ', () => {
    const onShowHealth = vi.fn()
    render(
      <GraphInspectorNodeSummary
        node={makeNode({ choices: [] })}
        errorCount={1}
        warningCount={2}
        onEdit={noop}
        onShowHealth={onShowHealth}
      />
    )
    expect(screen.getByText(/1 erreur/)).toBeInTheDocument()
    expect(screen.getByText(/2 avertissements/)).toBeInTheDocument()

    fireEvent.click(screen.getByText('voir'))
    expect(onShowHealth).toHaveBeenCalledTimes(1)
  })

  it('« éditer » rend la main au formulaire complet', () => {
    const onEdit = vi.fn()
    render(
      <GraphInspectorNodeSummary
        node={makeNode({ choices: [] })}
        errorCount={0}
        warningCount={0}
        onEdit={onEdit}
        onShowHealth={noop}
      />
    )
    fireEvent.click(screen.getAllByText('éditer')[0])
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('dit clairement qu’un nœud écrit à la main n’a pas de trace de génération', () => {
    render(
      <GraphInspectorNodeSummary
        node={makeNode({ choices: [] })}
        errorCount={0}
        warningCount={0}
        onEdit={noop}
        onShowHealth={noop}
      />
    )
    expect(screen.getByText(/pas de trace de génération/)).toBeInTheDocument()
  })

  it('affiche l’origine quand le nœud vient d’une génération', () => {
    render(
      <GraphInspectorNodeSummary
        node={makeNode({
          choices: [],
          regenerationHistory: [
            { timestamp: '2026-08-03T11:20:00.000Z', provider: 'gpt-5.6', cost: 0.04 },
          ],
        })}
        errorCount={0}
        warningCount={0}
        onEdit={noop}
        onShowHealth={noop}
      />
    )
    expect(screen.getByText(/gpt-5\.6/)).toBeInTheDocument()
    expect(screen.getByText(/0\.04 \$/)).toBeInTheDocument()
  })
})
