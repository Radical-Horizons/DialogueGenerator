import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ToastContainer, toastManager } from '../components/shared/Toast'

describe('Toast', () => {
  beforeEach(() => {
    toastManager.clear()
  })

  it('coalesces duplicate visible toasts and increments their count', () => {
    render(<ToastContainer />)

    let firstToastId = ''
    let secondToastId = ''
    act(() => {
      firstToastId = toastManager.show('Sauvegarde automatique échouée', 'error')
      secondToastId = toastManager.show('Sauvegarde automatique échouée', 'error')
    })

    expect(secondToastId).toBe(firstToastId)
    expect(toastManager.getToasts()).toHaveLength(1)
    expect(screen.getByText('Erreur (x2)')).toBeInTheDocument()
    expect(screen.getAllByText('Sauvegarde automatique échouée')).toHaveLength(1)
  })
})
