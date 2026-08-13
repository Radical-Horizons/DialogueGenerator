/**
 * Sélecteur compact modèle + raisonnement de la barre d'action.
 *
 * Ce que ces tests protègent : le couple visible pilote bien les mêmes sources que
 * l'ancien panneau (store LLM, callback d'effort), et l'affordance « raisonnement »
 * disparaît pour un modèle qui n'en a pas — sinon l'utilisateur règle un paramètre
 * que l'API refusera.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ModelEffortPicker } from './ModelEffortPicker'
import { useLLMStore } from '../../store/llmStore'
import { listLLMModels } from '../../api/config'

vi.mock('../../api/config')

const mockListLLMModels = vi.mocked(listLLMModels)

const MODELS = [
  { model_identifier: 'gpt-5.6-sol', display_name: 'GPT-5.6 Sol', client_type: 'openai', max_tokens: 32000 },
  { model_identifier: 'gpt-5.6-terra', display_name: 'GPT-5.6 Terra', client_type: 'openai', max_tokens: 32000 },
  { model_identifier: 'mistral-small', display_name: 'Mistral Small', client_type: 'mistral', max_tokens: 32000 },
]

function renderPicker(
  overrides: Partial<React.ComponentProps<typeof ModelEffortPicker>> = {}
) {
  const onReasoningEffortChange = vi.fn()
  render(
    <ModelEffortPicker
      reasoningEffort={null}
      onReasoningEffortChange={onReasoningEffortChange}
      height={46}
      {...overrides}
    />
  )
  return { onReasoningEffortChange }
}

/** Les modèles arrivent par un effet asynchrone : rien n'est cliquable avant. */
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByTestId('model-effort-pill'))
  await screen.findByTestId('model-option-gpt-5.6-terra')
}

describe('ModelEffortPicker', () => {
  beforeEach(() => {
    mockListLLMModels.mockResolvedValue({ models: MODELS, total: MODELS.length })
    useLLMStore.setState({ model: 'gpt-5.6-terra', provider: 'openai', availableModels: [] })
  })

  it('affiche le modèle courant et son niveau de raisonnement', async () => {
    renderPicker({ reasoningEffort: 'high' })

    const pill = screen.getByTestId('model-effort-pill')
    await waitFor(() => expect(pill).toHaveTextContent('GPT-5.6 Terra'))
    expect(screen.getByTestId('model-effort-pill-effort')).toHaveTextContent('élevé')
  })

  it("adopte la hauteur de rangée imposée par l'appelant", () => {
    // La pastille est encadrée par « Générer » et « × N » : en mode écriture la
    // rangée tombe à 38px et les trois doivent descendre ensemble.
    renderPicker({ height: 38 })

    expect(screen.getByTestId('model-effort-pill')).toHaveStyle({ height: '38px' })
  })

  it('liste les modèles avec leur description et coche le courant', async () => {
    const user = userEvent.setup()
    renderPicker()
    await openMenu(user)

    expect(screen.getByTestId('model-option-gpt-5.6-sol')).toHaveTextContent(
      'Le plus capable — tâches complexes'
    )
    expect(screen.getByTestId('model-option-gpt-5.6-terra')).toHaveAttribute(
      'aria-checked',
      'true'
    )
    expect(screen.getByTestId('model-option-gpt-5.6-sol')).toHaveAttribute(
      'aria-checked',
      'false'
    )
  })

  it('choisir un modèle écrit le modèle ET le provider dans le store', async () => {
    const user = userEvent.setup()
    renderPicker()
    await openMenu(user)

    await user.click(screen.getByTestId('model-option-mistral-small'))

    // Le provider suit le modèle : sans ça, un modèle Mistral part au client OpenAI.
    expect(useLLMStore.getState().model).toBe('mistral-small')
    expect(useLLMStore.getState().provider).toBe('mistral')
    expect(screen.queryByTestId('model-effort-menu')).toBeNull()
  })

  it("masque le raisonnement pour un modèle qui n'en accepte pas", async () => {
    const user = userEvent.setup()
    useLLMStore.setState({ model: 'mistral-small', provider: 'mistral' })
    renderPicker()

    expect(screen.queryByTestId('model-effort-pill-effort')).toBeNull()

    await openMenu(user)
    expect(screen.queryByTestId('model-effort-submenu-trigger')).toBeNull()
  })

  it('remonte le niveau choisi, et `null` pour « aucun »', async () => {
    const user = userEvent.setup()
    const { onReasoningEffortChange } = renderPicker({ reasoningEffort: 'high' })
    await openMenu(user)

    await user.click(screen.getByTestId('model-effort-submenu-trigger'))
    await user.click(await screen.findByTestId('effort-option-max'))
    expect(onReasoningEffortChange).toHaveBeenCalledWith('max')

    await openMenu(user)
    await user.click(screen.getByTestId('model-effort-submenu-trigger'))
    await user.click(await screen.findByTestId('effort-option-none'))
    // `none` n'est pas une valeur d'API : le contrat côté store est `null`.
    expect(onReasoningEffortChange).toHaveBeenCalledWith(null)
  })

  it('Échap referme le sous-niveau avant le menu', async () => {
    const user = userEvent.setup()
    renderPicker()
    await openMenu(user)
    await user.click(screen.getByTestId('model-effort-submenu-trigger'))
    await screen.findByTestId('model-effort-submenu-back')

    await user.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByTestId('model-effort-submenu-back')).toBeNull()
    )
    expect(screen.getByTestId('model-effort-menu')).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByTestId('model-effort-menu')).toBeNull())
    expect(screen.getByTestId('model-effort-pill')).toHaveFocus()
  })
})
