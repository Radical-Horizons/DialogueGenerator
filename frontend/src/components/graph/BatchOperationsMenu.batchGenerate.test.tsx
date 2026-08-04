/**
 * Tests menu batch — CTA génération FR88.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BatchOperationsMenu } from './BatchOperationsMenu'

describe('BatchOperationsMenu generate CTA', () => {
  it('shows generate button and calls handler when ≥2 selected', () => {
    const onGenerate = vi.fn()
    render(
      <BatchOperationsMenu
        selectedNodeIds={['a', 'b']}
        canEditGraph
        onBatchDeleteClick={vi.fn()}
        onBatchTagApply={vi.fn()}
        onBatchValidateClick={vi.fn()}
        onBatchGenerateClick={onGenerate}
      />
    )
    const btn = screen.getByTestId('batch-generate-from-selection')
    fireEvent.click(btn)
    expect(onGenerate).toHaveBeenCalled()
  })

  it('hides generate button when callback absent', () => {
    render(
      <BatchOperationsMenu
        selectedNodeIds={['a', 'b']}
        canEditGraph
        onBatchDeleteClick={vi.fn()}
        onBatchTagApply={vi.fn()}
        onBatchValidateClick={vi.fn()}
      />
    )
    expect(screen.queryByTestId('batch-generate-from-selection')).toBeNull()
  })
})
