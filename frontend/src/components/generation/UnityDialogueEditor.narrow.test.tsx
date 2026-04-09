import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UnityDialogueEditor } from './UnityDialogueEditor'
import { DialogueEditionNarrowProvider } from '../unityDialogues/DialogueEditionNarrowContext'

const minimalJson = JSON.stringify([{ id: 'START', speaker: 'A', line: 'Hello' }])

describe('UnityDialogueEditor — responsive narrow', () => {
  it('expose le mode narrow sur la toolbar quand le provider est actif', () => {
    render(
      <DialogueEditionNarrowProvider value={true}>
        <UnityDialogueEditor json_content={minimalJson} title="Titre test" />
      </DialogueEditionNarrowProvider>
    )
    expect(screen.getByTestId('unity-dialogue-editor-toolbar')).toHaveAttribute(
      'data-dialogue-edition-narrow',
      'true'
    )
  })

  it('reste en mode confortable quand le provider vaut false', () => {
    render(
      <DialogueEditionNarrowProvider value={false}>
        <UnityDialogueEditor json_content={minimalJson} />
      </DialogueEditionNarrowProvider>
    )
    expect(screen.getByTestId('unity-dialogue-editor-toolbar')).toHaveAttribute(
      'data-dialogue-edition-narrow',
      'false'
    )
  })

  it('défaut non-narrow hors provider', () => {
    render(<UnityDialogueEditor json_content={minimalJson} />)
    expect(screen.getByTestId('unity-dialogue-editor-toolbar')).toHaveAttribute(
      'data-dialogue-edition-narrow',
      'false'
    )
  })
})
