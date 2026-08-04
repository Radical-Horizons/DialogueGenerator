import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { BatchValidationModal } from './BatchValidationModal'
import type { BatchValidateReport } from '../../api/batchValidation'

const report: BatchValidateReport = {
  items: [
    {
      document_id: 'scene',
      status: 'invalid',
      validated_at: '2026-08-04T10:00:00Z',
      issues: [
        {
          type: 'orphan_node',
          message: 'Nœud orphelin',
          severity: 'error',
          source: 'graph',
          node_id: 'N2',
        },
      ],
    },
  ],
  cancelled: false,
  started_at: 't',
  finished_at: 't',
  valid_count: 0,
  invalid_count: 1,
  skipped_count: 0,
}

describe('BatchValidationModal', () => {
  it('affiche le rapport et ouvre un dialogue au clic', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(
      <BatchValidationModal
        open
        isValidating={false}
        progress={null}
        report={report}
        onCancel={() => {}}
        onClose={() => {}}
        onOpenDialogue={onOpen}
      />
    )
    expect(screen.getByTestId('batch-validation-modal')).toBeInTheDocument()
    expect(screen.getByText(/Nœud orphelin/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /scene — invalid/i }))
    expect(onOpen).toHaveBeenCalledWith('scene', 'N2')
  })

  it('expose les boutons d’export CSV/JSON', () => {
    render(
      <BatchValidationModal
        open
        isValidating={false}
        progress={null}
        report={report}
        onCancel={() => {}}
        onClose={() => {}}
        onOpenDialogue={() => {}}
      />
    )
    expect(screen.getByTestId('batch-validation-export-json')).toBeInTheDocument()
    expect(screen.getByTestId('batch-validation-export-csv')).toBeInTheDocument()
  })
})
