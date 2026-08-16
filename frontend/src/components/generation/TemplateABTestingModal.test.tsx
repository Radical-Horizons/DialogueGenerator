/**
 * Tests du modal A/B templates (lancer, historique, pouce, relance).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TemplateABTestingModal } from './TemplateABTestingModal'
import type { ABTestResult, Template } from '../../types/template'

const mockList = vi.fn()
const mockStart = vi.fn()
const mockGet = vi.fn()
const mockFeedback = vi.fn()
const mockRerun = vi.fn()
const mockToast = vi.fn()

vi.mock('../../api/templates', () => ({
  listAbTestsApi: (...args: unknown[]) => mockList(...args),
  startAbTestApi: (...args: unknown[]) => mockStart(...args),
  getAbTestApi: (...args: unknown[]) => mockGet(...args),
  patchAbTestFeedbackApi: (...args: unknown[]) => mockFeedback(...args),
  rerunAbTestApi: (...args: unknown[]) => mockRerun(...args),
}))

vi.mock('../shared', () => ({
  useToast: () => mockToast,
}))

function template(id: string, name: string): Template {
  return {
    id,
    name,
    description: '',
    category: 'Général',
    icon: '📋',
    metadata: { created: '2026-08-16T10:00:00Z', modified: '2026-08-16T10:00:00Z' },
    configuration: {
      characters: ['char-alpha'],
      locations: ['loc-alpha'],
      region: 'loc-alpha',
      sceneType: 'Generic',
      instructions: 'Brief',
    },
  }
}

function completedResult(overrides: Partial<ABTestResult> = {}): ABTestResult {
  return {
    testId: 'test-1',
    status: 'completed',
    current: 2,
    total: 2,
    createdAt: '2026-08-16T10:00:00Z',
    templateAId: 'tpl-a',
    templateBId: 'tpl-b',
    templateAName: 'Alpha',
    templateBName: 'Beta',
    generationsPerTemplate: 1,
    maxDepth: 1,
    parentTestId: null,
    winnerTemplateId: 'tpl-a',
    scoreVarianceNote: 'Variance ±1',
    generations: [
      {
        id: 'gen-1',
        templateId: 'tpl-a',
        templateName: 'Alpha',
        index: 0,
        overallScore: 8,
        criteria: [
          { criterionId: 'narrative_coherence', label: 'Cohérence narrative', score: 8 },
          { criterionId: 'characterization', label: 'Caractérisation', score: 8 },
          { criterionId: 'agency', label: 'Agentivité', score: 8 },
          { criterionId: 'style', label: 'Style', score: 8 },
        ],
        costEur: 0.1,
        durationMs: 10,
        thumb: null,
        error: null,
      },
    ],
    totals: {
      templateA: {
        meanOverall: 8,
        scoredCount: 1,
        totalCostEur: 0.1,
        totalDurationMs: 10,
        thumbsUp: 0,
        thumbsDown: 0,
      },
      templateB: {
        meanOverall: 5,
        scoredCount: 1,
        totalCostEur: 0.2,
        totalDurationMs: 12,
        thumbsUp: 0,
        thumbsDown: 0,
      },
    },
    error: null,
    ...overrides,
  }
}

describe('TemplateABTestingModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue([])
    mockStart.mockResolvedValue({ testId: 'test-1', status: 'queued', current: 0, total: 2 })
    mockGet.mockResolvedValue(completedResult())
    mockFeedback.mockResolvedValue(
      completedResult({
        generations: [
          {
            ...completedResult().generations[0],
            thumb: 'up',
          },
        ],
      }),
    )
    mockRerun.mockResolvedValue({ testId: 'test-2', status: 'queued', current: 0, total: 2 })
  })

  it('affiche l’empty state historique', async () => {
    render(
      <TemplateABTestingModal
        isOpen
        onClose={vi.fn()}
        templates={[template('tpl-a', 'Alpha'), template('tpl-b', 'Beta')]}
        prebuiltTemplates={[]}
      />,
    )
    expect(await screen.findByTestId('ab-test-history-empty')).toHaveTextContent('Aucun test A/B')
  })

  it('lance un test et affiche le gagnant + barres', async () => {
    render(
      <TemplateABTestingModal
        isOpen
        onClose={vi.fn()}
        templates={[template('tpl-a', 'Alpha'), template('tpl-b', 'Beta')]}
        prebuiltTemplates={[]}
      />,
    )
    fireEvent.change(screen.getByTestId('ab-test-template-a'), { target: { value: 'tpl-a' } })
    fireEvent.change(screen.getByTestId('ab-test-template-b'), { target: { value: 'tpl-b' } })
    fireEvent.change(screen.getByTestId('ab-test-n'), { target: { value: '1' } })
    fireEvent.click(screen.getByTestId('ab-test-launch-btn'))
    await waitFor(() => {
      expect(mockStart).toHaveBeenCalledWith({
        templateAId: 'tpl-a',
        templateBId: 'tpl-b',
        generationsPerTemplate: 1,
        maxDepth: 2,
      })
    })
    expect(await screen.findByTestId('ab-test-winner')).toHaveTextContent('Alpha')
    expect(screen.getAllByTestId('ab-test-score-bar').length).toBeGreaterThan(0)
    expect(screen.getByTestId('ab-test-criteria-gen-1')).toHaveTextContent('Cohérence narrative')
  })

  it('enregistre un pouce sans changer le gagnant affiché', async () => {
    mockList.mockResolvedValue([
      {
        testId: 'test-1',
        status: 'completed',
        createdAt: '2026-08-16T10:00:00Z',
        templateAId: 'tpl-a',
        templateBId: 'tpl-b',
        templateAName: 'Alpha',
        templateBName: 'Beta',
        winnerTemplateId: 'tpl-a',
        parentTestId: null,
        meanScoreA: 8,
        meanScoreB: 5,
      },
    ])
    render(
      <TemplateABTestingModal
        isOpen
        onClose={vi.fn()}
        templates={[template('tpl-a', 'Alpha'), template('tpl-b', 'Beta')]}
        prebuiltTemplates={[]}
      />,
    )
    fireEvent.click(await screen.findByTestId('ab-test-history-item-test-1'))
    await screen.findByTestId('ab-test-thumb-up-gen-1')
    fireEvent.click(screen.getByTestId('ab-test-thumb-up-gen-1'))
    await waitFor(() => {
      expect(mockFeedback).toHaveBeenCalledWith('test-1', { generationId: 'gen-1', thumb: 'up' })
    })
    expect(screen.getByTestId('ab-test-winner')).toHaveTextContent('Alpha')
  })

  it('relance depuis un run terminé', async () => {
    mockGet
      .mockResolvedValueOnce(completedResult())
      .mockResolvedValueOnce(
        completedResult({ testId: 'test-2', parentTestId: 'test-1' }),
      )
      .mockResolvedValueOnce(completedResult())
    mockList.mockResolvedValue([
      {
        testId: 'test-1',
        status: 'completed',
        createdAt: '2026-08-16T10:00:00Z',
        templateAId: 'tpl-a',
        templateBId: 'tpl-b',
        templateAName: 'Alpha',
        templateBName: 'Beta',
        winnerTemplateId: 'tpl-a',
        parentTestId: null,
        meanScoreA: 8,
        meanScoreB: 5,
      },
    ])
    render(
      <TemplateABTestingModal
        isOpen
        onClose={vi.fn()}
        templates={[template('tpl-a', 'Alpha'), template('tpl-b', 'Beta')]}
        prebuiltTemplates={[]}
      />,
    )
    fireEvent.click(await screen.findByTestId('ab-test-history-item-test-1'))
    await screen.findByTestId('ab-test-rerun-btn')
    fireEvent.click(screen.getByTestId('ab-test-rerun-btn'))
    await waitFor(() => {
      expect(mockRerun).toHaveBeenCalledWith('test-1')
    })
    expect(await screen.findByTestId('ab-test-overlay')).toBeInTheDocument()
  })

  it('affiche l’évolution des scores d’un template', async () => {
    mockList.mockResolvedValue([
      {
        testId: 'test-old',
        status: 'completed',
        createdAt: '2026-08-16T00:00:00Z',
        templateAId: 'tpl-a',
        templateBId: 'tpl-b',
        templateAName: 'Alpha',
        templateBName: 'Beta',
        winnerTemplateId: 'tpl-a',
        parentTestId: null,
        meanScoreA: 7,
        meanScoreB: 4,
      },
      {
        testId: 'test-new',
        status: 'completed',
        createdAt: '2026-08-17T00:00:00Z',
        templateAId: 'tpl-a',
        templateBId: 'tpl-b',
        templateAName: 'Alpha',
        templateBName: 'Beta',
        winnerTemplateId: 'tpl-a',
        parentTestId: null,
        meanScoreA: 9,
        meanScoreB: 4,
      },
    ])
    render(
      <TemplateABTestingModal
        isOpen
        onClose={vi.fn()}
        templates={[template('tpl-a', 'Alpha'), template('tpl-b', 'Beta')]}
        prebuiltTemplates={[]}
      />,
    )
    fireEvent.change(await screen.findByTestId('ab-test-evolution'), {
      target: { value: 'tpl-a' },
    })
    const bars = screen.getAllByTestId('ab-test-score-bar')
    expect(bars[0]).toHaveTextContent('7.0')
    expect(bars[1]).toHaveTextContent('9.0')
  })
})
