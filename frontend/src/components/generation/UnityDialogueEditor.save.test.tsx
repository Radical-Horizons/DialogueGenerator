import { createRef } from 'react'
import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as documentsAPI from '../../api/documents'
import {
  UnityDialogueEditor,
  type UnityDialogueEditorHandle,
} from './UnityDialogueEditor'

vi.mock('../../api/documents', () => ({
  putDocument: vi.fn(),
}))

const jsonContent = JSON.stringify([
  { id: 'START', speaker: 'NPC', line: 'Hello' },
])

describe('UnityDialogueEditor save completion', () => {
  beforeEach(() => {
    vi.mocked(documentsAPI.putDocument).mockReset()
  })

  it('attend le callback post-save et lui transmet la révision canonique', async () => {
    vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 2 })
    let releaseCallback!: () => void
    const onSave = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseCallback = resolve
        }),
    )
    const ref = createRef<UnityDialogueEditorHandle>()
    render(
      <UnityDialogueEditor
        ref={ref}
        json_content={jsonContent}
        filename="awaited"
        document={{ schemaVersion: '1.2.0', nodes: [] }}
        documentRevision={1}
        onSave={onSave}
      />,
    )

    let savePromise!: Promise<void>
    act(() => {
      savePromise = ref.current!.handleSave()
    })
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('awaited.json', 2)
    })
    let settled = false
    void savePromise.finally(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)

    await act(async () => {
      releaseCallback()
      await savePromise
    })
    expect(settled).toBe(true)
  })

  it('propage un échec du callback post-save', async () => {
    vi.mocked(documentsAPI.putDocument).mockResolvedValue({ revision: 4 })
    const onSave = vi.fn().mockRejectedValue(new Error('reload failed'))
    const ref = createRef<UnityDialogueEditorHandle>()
    render(
      <UnityDialogueEditor
        ref={ref}
        json_content={jsonContent}
        filename="propagated"
        document={{ schemaVersion: '1.2.0', nodes: [] }}
        documentRevision={3}
        onSave={onSave}
      />,
    )

    let caughtError: unknown
    await act(async () => {
      try {
        await ref.current!.handleSave()
      } catch (error) {
        caughtError = error
      }
    })
    expect(caughtError).toEqual(new Error('reload failed'))
  })
})
