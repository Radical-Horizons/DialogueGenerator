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

  it('17.7 slot headerSelector: rendu dans la toolbar quand fourni', () => {
    render(
      <DialogueEditionNarrowProvider value={true}>
        <UnityDialogueEditor
          json_content={minimalJson}
          title="Titre test"
          headerSelector={
            <div data-testid="custom-header-selector-marker">selector slot</div>
          }
        />
      </DialogueEditionNarrowProvider>
    )
    expect(screen.getByTestId('unity-dialogue-editor-header-selector')).toBeInTheDocument()
    expect(screen.getByTestId('custom-header-selector-marker')).toBeInTheDocument()
  })

  it('17.7 slot headerSelector: absent quand non fourni', () => {
    render(
      <DialogueEditionNarrowProvider value={true}>
        <UnityDialogueEditor json_content={minimalJson} title="Titre test" />
      </DialogueEditionNarrowProvider>
    )
    expect(screen.queryByTestId('unity-dialogue-editor-header-selector')).not.toBeInTheDocument()
  })

  it('17.7 AC #4 narrow: bord gauche header aligné avec bord gauche du contenu scrollable', () => {
    render(
      <DialogueEditionNarrowProvider value={true}>
        <UnityDialogueEditor json_content={minimalJson} title="Titre test" />
      </DialogueEditionNarrowProvider>
    )
    const toolbar = screen.getByTestId('unity-dialogue-editor-toolbar')
    const content = screen.getByTestId('unity-dialogue-editor-content')
    const deltaLeft = Math.abs(
      toolbar.getBoundingClientRect().left - content.getBoundingClientRect().left
    )
    expect(deltaLeft).toBeLessThanOrEqual(2)
  })

  it('17.7 AC #4 desktop (comfortable): bord gauche header aligné avec bord gauche du contenu', () => {
    render(
      <DialogueEditionNarrowProvider value={false}>
        <UnityDialogueEditor json_content={minimalJson} title="Titre test" />
      </DialogueEditionNarrowProvider>
    )
    const toolbar = screen.getByTestId('unity-dialogue-editor-toolbar')
    const content = screen.getByTestId('unity-dialogue-editor-content')
    const deltaLeft = Math.abs(
      toolbar.getBoundingClientRect().left - content.getBoundingClientRect().left
    )
    expect(deltaLeft).toBeLessThanOrEqual(2)
  })

  it('desktop: ne bascule pas les actions en grille même si la mesure actions est étroite', () => {
    render(
      <DialogueEditionNarrowProvider value={false}>
        <UnityDialogueEditor
          json_content={minimalJson}
          title="Lexique distance de sept enjambées et vérité qu’on n’écrit pas"
          extraActions={
            <>
              <button>Générer la suite</button>
              <button>Supprimer</button>
            </>
          }
          onCancel={() => {}}
        />
      </DialogueEditionNarrowProvider>
    )

    const toolbar = screen.getByTestId('unity-dialogue-editor-toolbar')
    const actions = toolbar.querySelector('.unity-dialogue-toolbar-actions')
    expect(actions).not.toBeNull()
    expect(actions!).toHaveAttribute('data-actions-narrow', 'false')
    expect((actions as HTMLElement).style.flexWrap).toBe('nowrap')
  })
})
