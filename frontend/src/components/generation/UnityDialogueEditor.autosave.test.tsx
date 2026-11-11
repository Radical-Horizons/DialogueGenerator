import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as documentsAPI from '../../api/documents'
import { useAuthStore } from '../../store/authStore'
import { UnityDialogueEditor } from './UnityDialogueEditor'
import {
  AUTOSAVE_DEBOUNCE_MS,
  countInlineActions,
  pickContinuationNodeId,
  type UnityDialogueEditorAction,
} from './UnityDialogueEditorLogic'
import type { UnityDialogueNode } from '../../types/api'

vi.mock('../../api/documents', () => ({
  putDocument: vi.fn(),
  putDocumentKeepalive: vi.fn(),
  getDocument: vi.fn(),
}))

vi.mock('../../api/dialogues', () => ({
  exportUnityDialogue: vi.fn(),
}))

const nodes: UnityDialogueNode[] = [
  { id: 'START', speaker: 'NPC', line: 'Bonjour', nextNode: 'node-2' },
  { id: 'node-2', speaker: 'NPC', line: 'La carte est refusée.' },
]
const jsonContent = JSON.stringify(nodes)
const baseDocument = { schemaVersion: '1.2.0', nodes }

function setRole(role: 'writer' | 'guest') {
  useAuthStore.setState({
    user: { id: `${role}-1`, username: role, role, is_active: true },
  })
}

function renderExisting(props: Partial<Parameters<typeof UnityDialogueEditor>[0]> = {}) {
  return render(
    <UnityDialogueEditor
      json_content={jsonContent}
      title="La carte refusée"
      subtitle="La_carte_refusée.json"
      filename="La_carte_refusée"
      document={baseDocument}
      documentRevision={3}
      {...props}
    />,
  )
}

function lineFields() {
  return screen.getAllByPlaceholderText('Texte du dialogue...')
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('UnityDialogueEditor — sauvegarde automatique', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(documentsAPI.putDocument).mockReset().mockResolvedValue({ revision: 4 })
    vi.mocked(documentsAPI.putDocumentKeepalive).mockReset().mockResolvedValue({ revision: 4 })
    setRole('writer')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('enregistre seul après une pause de saisie, sans bouton ni Ctrl+S', async () => {
    renderExisting()
    expect(screen.queryByRole('button', { name: /sauvegarder/i })).not.toBeInTheDocument()

    fireEvent.change(lineFields()[0], { target: { value: 'Bonjour, ceci est un test' } })
    expect(screen.getByTestId('unity-dialogue-editor-save-status')).toHaveTextContent('ENREGISTREMENT…')

    await advance(AUTOSAVE_DEBOUNCE_MS - 50)
    expect(documentsAPI.putDocument).not.toHaveBeenCalled()

    await advance(100)
    expect(documentsAPI.putDocument).toHaveBeenCalledTimes(1)
    const [docId, body] = vi.mocked(documentsAPI.putDocument).mock.calls[0]
    expect(docId).toBe('La_carte_refusée')
    expect(body.revision).toBe(3)
    expect(body.validationMode).toBe('export')
    expect((body.document.nodes as UnityDialogueNode[])[0].line).toBe('Bonjour, ceci est un test')
    expect(screen.getByTestId('unity-dialogue-editor-save-status')).toHaveTextContent(/^ENREGISTRÉ · \d\d:\d\d$/)
  })

  it('n’intercepte plus Ctrl+S', async () => {
    renderExisting()
    fireEvent.keyDown(window, { key: 's', ctrlKey: true })
    await advance(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(documentsAPI.putDocument).not.toHaveBeenCalled()
  })

  it('regroupe une frappe continue en une seule sauvegarde, avec la révision suivante ensuite', async () => {
    renderExisting()
    fireEvent.change(lineFields()[0], { target: { value: 'B' } })
    await advance(300)
    fireEvent.change(lineFields()[0], { target: { value: 'Bo' } })
    await advance(AUTOSAVE_DEBOUNCE_MS + 10)
    expect(documentsAPI.putDocument).toHaveBeenCalledTimes(1)

    fireEvent.change(lineFields()[0], { target: { value: 'Bon' } })
    await advance(AUTOSAVE_DEBOUNCE_MS + 10)
    expect(documentsAPI.putDocument).toHaveBeenCalledTimes(2)
    expect(vi.mocked(documentsAPI.putDocument).mock.calls[1][1].revision).toBe(4)
  })

  it('enregistre au démontage (changement de dialogue ou de section) sans attendre la pause', async () => {
    const { unmount } = renderExisting()
    fireEvent.change(lineFields()[1], { target: { value: 'ceci est un test' } })
    unmount()
    await advance(0)
    expect(documentsAPI.putDocument).toHaveBeenCalledTimes(1)
    const body = vi.mocked(documentsAPI.putDocument).mock.calls[0][1]
    expect((body.document.nodes as UnityDialogueNode[])[1].line).toBe('ceci est un test')
  })

  it('envoie une requête keepalive quand la page se décharge (Ctrl+F5)', async () => {
    renderExisting()
    fireEvent.change(lineFields()[1], { target: { value: 'ceci est un test' } })
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    await advance(0)
    expect(documentsAPI.putDocumentKeepalive).toHaveBeenCalledTimes(1)
    const body = vi.mocked(documentsAPI.putDocumentKeepalive).mock.calls[0][1]
    expect((body.document.nodes as UnityDialogueNode[])[1].line).toBe('ceci est un test')
    await advance(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(documentsAPI.putDocument).not.toHaveBeenCalled()
  })

  it('n’écrit rien sans modification', async () => {
    const { unmount } = renderExisting()
    act(() => {
      window.dispatchEvent(new Event('pagehide'))
    })
    unmount()
    await advance(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(documentsAPI.putDocument).not.toHaveBeenCalled()
    expect(documentsAPI.putDocumentKeepalive).not.toHaveBeenCalled()
  })

  it('un résultat de génération pas encore gardé (sans filename) ne s’écrit pas tout seul', async () => {
    render(<UnityDialogueEditor json_content={jsonContent} title="Résultat" />)
    fireEvent.change(lineFields()[0], { target: { value: 'modifié' } })
    await advance(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(documentsAPI.putDocument).not.toHaveBeenCalled()
    expect(screen.queryByTestId('unity-dialogue-editor-save-status')).not.toBeInTheDocument()
  })

  it('affiche l’erreur d’enregistrement et ne relance pas en boucle', async () => {
    vi.mocked(documentsAPI.putDocument).mockRejectedValue(new Error('Serveur indisponible'))
    renderExisting()
    fireEvent.change(lineFields()[0], { target: { value: 'x' } })
    await advance(AUTOSAVE_DEBOUNCE_MS + 10)
    expect(screen.getByTestId('unity-dialogue-editor-save-status')).toHaveAttribute('data-status', 'error')
    await advance(AUTOSAVE_DEBOUNCE_MS * 5)
    expect(documentsAPI.putDocument).toHaveBeenCalledTimes(1)
  })
})

describe('UnityDialogueEditor — lecture seule', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(documentsAPI.putDocument).mockReset().mockResolvedValue({ revision: 4 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('en invité : champs non éditables, bandeau avec lien Connexion, rien d’écrit', async () => {
    setRole('guest')
    const { unmount } = renderExisting({ canEdit: false })

    for (const field of lineFields()) expect(field).toBeDisabled()
    expect(screen.queryByRole('button', { name: '+ Ajouter un choix' })).not.toBeInTheDocument()
    const notice = screen.getByTestId('unity-dialogue-editor-readonly')
    expect(notice).toHaveTextContent(/mode invité/i)
    expect(within(notice).getByRole('link', { name: 'Connexion' })).toHaveAttribute('href', '/login')
    expect(screen.getByTestId('unity-dialogue-editor-title').tagName).not.toBe('BUTTON')
    expect(screen.queryByTestId('unity-dialogue-editor-save-status')).not.toBeInTheDocument()

    unmount()
    await advance(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(documentsAPI.putDocument).not.toHaveBeenCalled()
  })

  it('compte sans droit d’écriture : le bandeau dit pourquoi, sans lien Connexion', () => {
    setRole('writer')
    renderExisting({ canEdit: false })
    const notice = screen.getByTestId('unity-dialogue-editor-readonly')
    expect(notice).toHaveTextContent(/pas le droit de modifier/i)
    expect(within(notice).queryByRole('link')).not.toBeInTheDocument()
  })

  it('les options avancées restent consultables', () => {
    setRole('guest')
    renderExisting({ canEdit: false })
    const toggle = screen.getAllByRole('button', { name: /Options avancées/ })[0]
    expect(toggle).toBeEnabled()
  })
})

describe('UnityDialogueEditor — renommer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(documentsAPI.putDocument).mockReset().mockResolvedValue({ revision: 4 })
    setRole('writer')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('clic sur le titre, Entrée : enregistre document.title sans toucher au fichier', async () => {
    const onRenamed = vi.fn()
    renderExisting({ onRenamed })
    fireEvent.click(screen.getByTestId('unity-dialogue-editor-title'))
    const input = screen.getByLabelText('Titre du dialogue')
    fireEvent.change(input, { target: { value: 'La carte acceptée' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await advance(0)

    expect(documentsAPI.putDocument).toHaveBeenCalledTimes(1)
    const [docId, body] = vi.mocked(documentsAPI.putDocument).mock.calls[0]
    expect(docId).toBe('La_carte_refusée')
    expect(body.document.title).toBe('La carte acceptée')
    expect(onRenamed).toHaveBeenCalledWith('La carte acceptée')
    expect(screen.getByTestId('unity-dialogue-editor-title')).toHaveTextContent('La carte acceptée')
  })

  it('perte de focus enregistre aussi', async () => {
    renderExisting()
    fireEvent.click(screen.getByTestId('unity-dialogue-editor-title'))
    const input = screen.getByLabelText('Titre du dialogue')
    fireEvent.change(input, { target: { value: 'Autre titre' } })
    fireEvent.blur(input)
    await advance(0)
    expect(vi.mocked(documentsAPI.putDocument).mock.calls[0][1].document.title).toBe('Autre titre')
  })

  it('Échap annule', async () => {
    renderExisting()
    fireEvent.click(screen.getByTestId('unity-dialogue-editor-title'))
    const input = screen.getByLabelText('Titre du dialogue')
    fireEvent.change(input, { target: { value: 'Abandonné' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    await advance(AUTOSAVE_DEBOUNCE_MS * 2)
    expect(documentsAPI.putDocument).not.toHaveBeenCalled()
    expect(screen.getByTestId('unity-dialogue-editor-title')).toHaveTextContent('La carte refusée')
  })
})

describe('UnityDialogueEditor — barre d’actions', () => {
  beforeEach(() => {
    setRole('writer')
  })

  it('countInlineActions : garde ce qui tient, la place du bouton Autres comprise', () => {
    expect(countInlineActions([100, 80, 90], 0, 6, 70, true)).toBe(3)
    expect(countInlineActions([100, 80, 90], 400, 6, 70, false)).toBe(3)
    expect(countInlineActions([100, 80, 90], 400, 6, 70, true)).toBe(3)
    expect(countInlineActions([100, 80, 90], 260, 6, 70, true)).toBe(1)
    expect(countInlineActions([100, 80, 90], 60, 6, 70, true)).toBe(0)
  })

  it('Supprimer reste accessible dans « Autres », pas dans la barre', () => {
    const onDelete = vi.fn()
    const actions: UnityDialogueEditorAction[] = [
      { id: 'metadata', label: 'Métadonnées dialogue', onClick: vi.fn() },
      { id: 'delete', label: 'Supprimer', onClick: onDelete, overflowOnly: true, danger: true },
    ]
    renderExisting({ actions })
    expect(screen.getByRole('button', { name: 'Métadonnées dialogue' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByTestId('unity-dialogue-editor-more'))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('les actions qui ne tiennent pas passent dans « Autres »', () => {
    const widths = new Map([
      ['Générer la suite', 130],
      ['Métadonnées dialogue', 170],
      ['Partager', 80],
      ['Autres ▾', 70],
    ])
    const offsetWidth = vi
      .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return widths.get(this.textContent ?? '') ?? 0
      })
    const clientWidth = vi
      .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('unity-dialogue-toolbar-actions') ? 320 : 0
      })
    try {
      renderExisting({
        onGenerateContinuation: vi.fn(),
        actions: [
          { id: 'metadata', label: 'Métadonnées dialogue', onClick: vi.fn() },
          { id: 'share', label: 'Partager', onClick: vi.fn() },
          { id: 'delete', label: 'Supprimer', onClick: vi.fn(), overflowOnly: true },
        ],
      })
      expect(screen.getByRole('button', { name: 'Générer la suite' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Métadonnées dialogue' })).not.toBeInTheDocument()
      fireEvent.click(screen.getByTestId('unity-dialogue-editor-more'))
      const menu = screen.getByRole('menu')
      expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
        'Métadonnées dialogue',
        'Partager',
        'Supprimer',
      ])
    } finally {
      offsetWidth.mockRestore()
      clientWidth.mockRestore()
    }
  })
})

describe('UnityDialogueEditor — générer la suite', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(documentsAPI.putDocument).mockReset().mockResolvedValue({ revision: 4 })
    setRole('writer')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pickContinuationNodeId : le nœud qui termine la conversation', () => {
    expect(pickContinuationNodeId(nodes, null)).toBe('node-2')
    const branching: UnityDialogueNode[] = [
      { id: 'START', line: 'a', choices: [
        { text: 'x', targetNode: 'fin-a' },
        { text: 'y', targetNode: 'fin-b' },
      ] },
      { id: 'fin-a', line: 'b', nextNode: 'END' },
      { id: 'fin-b', line: 'c' },
      { id: 'END' },
    ]
    expect(pickContinuationNodeId(branching, null)).toBe('fin-b')
    expect(pickContinuationNodeId(branching, 'fin-a')).toBe('fin-a')
    expect(pickContinuationNodeId(branching, 'START')).toBe('fin-b')
  })

  it('enregistre d’abord, puis transmet le dernier nœud', async () => {
    const onGenerateContinuation = vi.fn()
    renderExisting({ onGenerateContinuation })
    fireEvent.change(lineFields()[1], { target: { value: 'ceci est un test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Générer la suite' }))
    await advance(0)
    expect(documentsAPI.putDocument).toHaveBeenCalledTimes(1)
    expect(onGenerateContinuation).toHaveBeenCalledWith('node-2')
    expect(vi.mocked(documentsAPI.putDocument).mock.invocationCallOrder[0]).toBeLessThan(
      onGenerateContinuation.mock.invocationCallOrder[0],
    )
  })

  it('reste sur place si l’enregistrement échoue', async () => {
    vi.mocked(documentsAPI.putDocument).mockRejectedValue(new Error('refus'))
    const onGenerateContinuation = vi.fn()
    renderExisting({ onGenerateContinuation })
    fireEvent.change(lineFields()[1], { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Générer la suite' }))
    await advance(0)
    expect(onGenerateContinuation).not.toHaveBeenCalled()
  })

  it('absent en lecture seule', () => {
    renderExisting({ canEdit: false, onGenerateContinuation: vi.fn() })
    expect(screen.queryByRole('button', { name: 'Générer la suite' })).not.toBeInTheDocument()
  })
})
