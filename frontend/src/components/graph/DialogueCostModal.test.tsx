import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DialogueCostModal } from './DialogueCostModal'

vi.mock('../usage/DialogueCostBreakdown', () => ({
  DialogueCostBreakdown: ({ dialogueId }: { dialogueId: string }) => (
    <span data-testid="breakdown-dialogue-id">{dialogueId}</span>
  ),
}))

describe('DialogueCostModal', () => {
  it("interroge les coûts sous l'identifiant d'usage, sans l'extension .json", () => {
    render(<DialogueCostModal filename="le_juge_mendiant.json" variant="inspector" />)
    expect(screen.getByTestId('breakdown-dialogue-id')).toHaveTextContent(/^le_juge_mendiant$/)
  })

  it('applique le même identifiant dans la variante flottante', () => {
    render(<DialogueCostModal filename="le_juge_mendiant.json" onClose={() => {}} />)
    expect(screen.getByTestId('breakdown-dialogue-id')).toHaveTextContent(/^le_juge_mendiant$/)
  })
})
