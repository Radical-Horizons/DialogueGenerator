/**
 * Deep-link focus nœud (Story 8.8 / FR87) dans l’éditeur Unity bibliothèque.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { UnityDialogueEditor } from './UnityDialogueEditor'

const twoNodesJson = JSON.stringify([
  { id: 'START', speaker: 'A', line: 'Intro' },
  { id: 'NODE_B', speaker: 'B', line: 'Suite' },
])

describe('UnityDialogueEditor — focusNodeId', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('scroll et focus le nœud demandé', async () => {
    render(
      <UnityDialogueEditor json_content={twoNodesJson} focusNodeId="NODE_B" />
    )

    const card = await screen.findByTestId('unity-dialogue-node-NODE_B')
    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    })
    expect(card.contains(document.activeElement)).toBe(true)
  })
})
