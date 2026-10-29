import { describe, it, expect, beforeEach } from 'vitest'
import { useGraphViewStore } from './graphViewStore'

describe('graphViewStore — demande d’édition directe d’un nœud', () => {
  beforeEach(() => {
    useGraphViewStore.getState().clearNodeEditRequest()
  })

  it('pose puis efface la demande', () => {
    expect(useGraphViewStore.getState().nodeEditRequest).toBeNull()

    useGraphViewStore.getState().requestNodeEdit('manual-1')
    expect(useGraphViewStore.getState().nodeEditRequest).toBe('manual-1')

    useGraphViewStore.getState().clearNodeEditRequest()
    expect(useGraphViewStore.getState().nodeEditRequest).toBeNull()
  })

  it('une nouvelle demande remplace la précédente', () => {
    useGraphViewStore.getState().requestNodeEdit('manual-1')
    useGraphViewStore.getState().requestNodeEdit('manual-2')

    expect(useGraphViewStore.getState().nodeEditRequest).toBe('manual-2')
  })
})
