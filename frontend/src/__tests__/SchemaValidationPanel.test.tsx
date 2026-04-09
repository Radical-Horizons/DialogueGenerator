/**
 * Tests SchemaValidationPanel (FR48 / Story 4.13).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SchemaValidationPanel } from '../components/graph/SchemaValidationPanel'

const DEFAULT_PROPS = {
  isOpen: true,
  isLoading: false,
  isValid: true,
  errors: [],
  errorCount: 0,
  onClose: vi.fn(),
}

describe('SchemaValidationPanel (FR48)', () => {
  it('renders green badge when schema is valid', () => {
    render(<SchemaValidationPanel {...DEFAULT_PROPS} isValid={true} errors={[]} errorCount={0} />)

    const badge = screen.getByTestId('schema-status-badge')
    expect(badge.getAttribute('data-valid')).toBe('true')
    // Both the badge and the subtitle mention "conforme" — at least one must be present
    expect(screen.getAllByText(/conforme/i).length).toBeGreaterThan(0)
  })

  it('renders red badge and error list when schema is invalid', () => {
    const errors = ['[nodes.0.choices.0] choiceId is required']
    render(
      <SchemaValidationPanel
        {...DEFAULT_PROPS}
        isValid={false}
        errors={errors}
        errorCount={1}
      />
    )

    const badge = screen.getByTestId('schema-status-badge')
    expect(badge.getAttribute('data-valid')).toBe('false')
    expect(screen.getByText(/1.*(erreur|error)/i)).toBeTruthy()
    expect(screen.getByText(/choiceId/)).toBeTruthy()
  })

  it('renders loading indicator and no badge when isLoading is true', () => {
    render(<SchemaValidationPanel {...DEFAULT_PROPS} isLoading={true} />)

    expect(screen.getByTestId('schema-loading-indicator')).toBeTruthy()
    expect(screen.queryByTestId('schema-status-badge')).toBeNull()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(<SchemaValidationPanel {...DEFAULT_PROPS} onClose={onClose} />)

    fireEvent.click(screen.getByTestId('schema-close-btn'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <SchemaValidationPanel {...DEFAULT_PROPS} isOpen={false} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders plural form when errorCount is greater than 1', () => {
    const errors = ['[nodes.0.choices.0] choiceId is required', '[nodes.1.choices.0] choiceId is required']
    render(
      <SchemaValidationPanel
        {...DEFAULT_PROPS}
        isValid={false}
        errors={errors}
        errorCount={2}
      />
    )
    const badge = screen.getByTestId('schema-status-badge')
    expect(badge.textContent).toMatch(/2.*erreurs/i)
  })

  it('calls onErrorClick with error string when error item is clicked', () => {
    const onErrorClick = vi.fn()
    const errors = ['[nodes.0.choices.0] choiceId is required']
    render(
      <SchemaValidationPanel
        {...DEFAULT_PROPS}
        isValid={false}
        errors={errors}
        errorCount={1}
        onErrorClick={onErrorClick}
      />
    )
    fireEvent.click(screen.getByTestId('schema-error-item'))
    expect(onErrorClick).toHaveBeenCalledWith(errors[0])
  })
})
