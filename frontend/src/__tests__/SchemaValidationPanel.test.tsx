/**
 * Tests SchemaValidationPanel (FR48 / Story 4.13, FR51).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SchemaValidationPanel } from '../components/graph/SchemaValidationPanel'
import * as unityDialoguesApi from '../api/unityDialogues'

vi.mock('../api/unityDialogues', () => ({
  getUnitySchemaReference: vi.fn(),
}))

const DEFAULT_PROPS = {
  isOpen: true,
  isLoading: false,
  isValid: true,
  errors: [],
  errorCount: 0,
  warnings: [],
  structuredErrors: [],
  onClose: vi.fn(),
}

describe('SchemaValidationPanel (FR48 / FR51)', () => {
  beforeEach(() => {
    vi.mocked(unityDialoguesApi.getUnitySchemaReference).mockResolvedValue({
      available: true,
      version: '1.2.0',
      source_path: 'docs/resources/dialogue-format.schema.json',
      required_root_fields: ['schemaVersion', 'nodes'],
      sections: [
        {
          name: 'nodes',
          description: 'Nœuds dialogue',
          required_fields: ['id'],
        },
      ],
    })
  })

  it('renders green badge when schema is valid', () => {
    render(<SchemaValidationPanel {...DEFAULT_PROPS} isValid={true} errors={[]} errorCount={0} />)

    const badge = screen.getByTestId('schema-status-badge')
    expect(badge.getAttribute('data-valid')).toBe('true')
    expect(screen.getByTestId('schema-valid-label')).toHaveTextContent(/100 % conforme/i)
  })

  it('renders error summary and list when schema is invalid', () => {
    const structuredErrors = [
      { code: 'missing_choice_id', message: "Erreur schéma Unity : champ requis 'choiceId' manquant", path: 'nodes.0.choices.0' },
      { code: 'validation_error', message: "Erreur schéma Unity : champ 'line' manquant", path: 'nodes.1.line' },
    ]
    render(
      <SchemaValidationPanel
        {...DEFAULT_PROPS}
        isValid={false}
        errors={structuredErrors.map((e) => e.message)}
        errorCount={2}
        structuredErrors={structuredErrors}
      />
    )

    expect(screen.getByTestId('schema-error-summary')).toHaveTextContent(/2 erreurs de schéma détectées/i)
    expect(screen.getAllByTestId('schema-error-item')).toHaveLength(2)
  })

  it('renders warnings section when valid with warnings only', () => {
    render(
      <SchemaValidationPanel
        {...DEFAULT_PROPS}
        isValid={true}
        warnings={[{ code: 'gdd_flag_threshold_exceeded', message: 'Liaisons conversationnelles : 11 (repère GDD ≤ 10).' }]}
      />
    )

    expect(screen.getByTestId('schema-status-badge').getAttribute('data-valid')).toBe('true')
    expect(screen.getByTestId('schema-warning-section')).toBeTruthy()
    expect(screen.queryByTestId('schema-valid-label')).toBeNull()
  })

  it('opens schema reference panel and closes it', async () => {
    render(<SchemaValidationPanel {...DEFAULT_PROPS} />)

    fireEvent.click(screen.getByTestId('schema-reference-link'))
    await waitFor(() => {
      expect(screen.getByTestId('unity-schema-reference-panel')).toBeTruthy()
    })
    expect(screen.getByTestId('schema-reference-content')).toBeTruthy()
    expect(screen.getByText(/Version :/)).toBeTruthy()
    expect(screen.getByText('1.2.0')).toBeTruthy()

    fireEvent.click(screen.getByTestId('schema-reference-close-btn'))
    await waitFor(() => {
      expect(screen.queryByTestId('unity-schema-reference-panel')).toBeNull()
    })
    expect(screen.getByTestId('schema-validation-panel')).toBeTruthy()
  })

  it('calls onIssueClick when error item is clicked', () => {
    const onIssueClick = vi.fn()
    const issue = {
      code: 'missing_choice_id',
      message: "Erreur schéma Unity : champ requis 'choiceId' manquant",
      path: 'nodes.0.choices.0',
      node_id: 'node-abc',
    }
    render(
      <SchemaValidationPanel
        {...DEFAULT_PROPS}
        isValid={false}
        errors={[issue.message]}
        errorCount={1}
        structuredErrors={[issue]}
        onIssueClick={onIssueClick}
      />
    )
    fireEvent.click(screen.getByTestId('schema-error-item'))
    expect(onIssueClick).toHaveBeenCalledWith(issue)
  })

  it('renders loading indicator when isLoading is true', () => {
    render(<SchemaValidationPanel {...DEFAULT_PROPS} isLoading={true} />)
    expect(screen.getByTestId('schema-loading-indicator')).toBeTruthy()
    expect(screen.queryByTestId('schema-status-badge')).toBeNull()
  })

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <SchemaValidationPanel {...DEFAULT_PROPS} isOpen={false} />
    )
    expect(container.firstChild).toBeNull()
  })
})
