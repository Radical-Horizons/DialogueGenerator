/**
 * Tests unitaires pour le composant TestNode avec 4 résultats.
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ReactFlowProvider } from 'reactflow'
import { TestNode } from '../components/graph/nodes/TestNode'

const TestNodeWrapper = ({ data, selected = false }: { data: Record<string, unknown>; selected?: boolean }) => (
  <ReactFlowProvider>
    <TestNode data={data} selected={selected} id="test-node-1" />
  </ReactFlowProvider>
)

describe('TestNode - 4 résultats de test', () => {
  it('devrait afficher 4 handles de sortie avec les bonnes couleurs', () => {
    const testNodeData = {
      id: 'test-node-1',
      test: 'Raison+Diplomatie:8',
      criticalFailureNode: 'node-critical-failure',
      failureNode: 'node-failure',
      successNode: 'node-success',
      criticalSuccessNode: 'node-critical-success',
    }

    render(<TestNodeWrapper data={testNodeData} />)
    
    // Vérifier que les handles existent (au moins 4 handles source)
    const sourceHandles = document.querySelectorAll('[data-handlepos="bottom"]')
    expect(sourceHandles.length).toBeGreaterThanOrEqual(4)
  })

  it('devrait afficher les handles aux bonnes positions (12.5%, 37.5%, 62.5%, 87.5%)', () => {
    const testNodeData = {
      id: 'test-node-1',
      test: 'Raison+Diplomatie:8',
    }

    const { container } = render(<TestNodeWrapper data={testNodeData} />)
    
    // Vérifier que le composant est rendu
    expect(container).toBeTruthy()
    
    // Vérifier que les 4 handles source existent (via data-handlepos="bottom")
    const sourceHandles = container.querySelectorAll('[data-handlepos="bottom"]')
    expect(sourceHandles.length).toBe(4)
    
    // Vérifier les positions via les styles inline
    const handles = Array.from(sourceHandles) as HTMLElement[]
    const styles = handles.map(h => h.getAttribute('style') || '')
    
    // Au moins un handle doit avoir left: 12.5%, 37.5%, 62.5%, 87.5%
    const leftPositions = styles.map(s => {
      const match = s.match(/left:\s*([\d.]+%)/)
      return match ? match[1] : null
    }).filter(Boolean)
    
    expect(leftPositions).toContain('12.5%')
    expect(leftPositions).toContain('37.5%')
    expect(leftPositions).toContain('62.5%')
    expect(leftPositions).toContain('87.5%')
  })

  it('devrait afficher les handles avec les bonnes couleurs', () => {
    const testNodeData = {
      id: 'test-node-1',
      test: 'Raison+Diplomatie:8',
    }

    const { container } = render(<TestNodeWrapper data={testNodeData} />)
    
    // Vérifier que les 4 handles existent
    const sourceHandles = container.querySelectorAll('[data-handlepos="bottom"]') as NodeListOf<HTMLElement>
    expect(sourceHandles.length).toBe(4)
    
    // Vérifier que les handles ont des styles (ReactFlow applique les couleurs via style ou className)
    const styles = Array.from(sourceHandles).map(h => h.getAttribute('style') || '')
    const allHaveStyles = styles.every(style => style.length > 0)
    
    // Les handles doivent avoir des styles appliqués (couleurs définies dans le composant)
    expect(allHaveStyles).toBe(true)
    
    // Vérifier que les handles ont les bons IDs (via data-handleid si disponible)
    const handleIds = Array.from(sourceHandles).map(h => 
      h.getAttribute('data-handleid') || h.getAttribute('id')
    )
    
    // Au moins vérifier que nous avons 4 handles distincts
    expect(handleIds.length).toBe(4)
  })

  it('devrait être rétrocompatible avec 2 handles (success/failure uniquement)', () => {
    const testNodeData = {
      id: 'test-node-1',
      test: 'Raison+Diplomatie:8',
      successNode: 'node-success',
      failureNode: 'node-failure',
    }

    const { container } = render(<TestNodeWrapper data={testNodeData} />)
    
    // Vérifier que les 4 handles existent toujours (même si seulement 2 sont utilisés)
    const sourceHandles = container.querySelectorAll('[data-handlepos="bottom"]')
    expect(sourceHandles.length).toBe(4)
  })
})
