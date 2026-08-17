/**
 * Modal plein écran A/B testing de templates (Story 6.7).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { theme } from '../../theme'
import { generationPanelChrome, modalTypography } from '../../theme/responsiveChrome'
import {
  redesignAccent,
  redesignControl,
  redesignRadius,
  redesignSpacing,
  redesignSurface,
  redesignText,
} from '../../theme/redesignTokens'
import { TOUCH_TARGET_MIN_PX } from '../../constants'
import { useGenerationPanelNarrow } from './GenerationPanelNarrowContext'
import { useToast } from '../shared'
import {
  getAbTestApi,
  listAbTestsApi,
  listMarketplaceTemplatesApi,
  patchAbTestFeedbackApi,
  rerunAbTestApi,
  startAbTestApi,
} from '../../api/templates'
import type {
  ABTestHistoryItem,
  ABTestResult,
  ABTestWinnerMode,
  MarketplaceListing,
  PrebuiltTemplate,
  Template,
} from '../../types/template'
import {
  costBarPercents,
  marketplaceAbTestId,
  prebuiltAbTestId,
  scoreBarPercent,
  scoreHistorySeries,
  winnerLabel,
} from '../../utils/abTestCharts'
import { useGraphStore } from '../../store/graphStore'
import { useUiLayoutStore } from '../../store/uiLayoutStore'

export interface TemplateABTestingModalProps {
  isOpen: boolean
  onClose: () => void
  templates: Template[]
  prebuiltTemplates: PrebuiltTemplate[]
  initialBId?: string
}

interface TemplateOption {
  id: string
  name: string
}

function Bar({ percent, label }: { percent: number; label: string }) {
  return (
    <div data-testid="ab-test-score-bar" style={{ marginBottom: '0.4rem' }}>
      <div style={{ fontSize: '0.8rem', color: redesignText.secondary, marginBottom: 4 }}>
        {label}
      </div>
      <div
        style={{
          height: 8,
          backgroundColor: theme.background.secondary,
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            backgroundColor: redesignAccent.base,
          }}
        />
      </div>
    </div>
  )
}

export function TemplateABTestingModal({
  isOpen,
  onClose,
  templates,
  prebuiltTemplates,
  initialBId = '',
}: TemplateABTestingModalProps) {
  const isNarrow = useGenerationPanelNarrow()
  const chrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable
  const type = isNarrow ? modalTypography.narrow : modalTypography.comfortable
  const toast = useToast()
  const [templateAId, setTemplateAId] = useState('')
  const [templateBId, setTemplateBId] = useState('')
  const [generations, setGenerations] = useState(3)
  const [maxDepth, setMaxDepth] = useState(2)
  const [winnerMode, setWinnerMode] = useState<ABTestWinnerMode>('score')
  const [listings, setListings] = useState<MarketplaceListing[]>([])
  const [history, setHistory] = useState<ABTestHistoryItem[]>([])
  const [result, setResult] = useState<ABTestResult | null>(null)
  const [parentResult, setParentResult] = useState<ABTestResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [evolutionId, setEvolutionId] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const loadSeq = useRef(0)

  const options: TemplateOption[] = useMemo(
    () => [
      ...templates.map((item) => ({ id: item.id, name: item.name })),
      ...prebuiltTemplates.map((item) => ({
        id: prebuiltAbTestId(item.id),
        name: `${item.name} (pré-built)`,
      })),
      ...listings.map((item) => ({
        id: marketplaceAbTestId(item.id),
        name: `${item.name} (marketplace)`,
      })),
    ],
    [templates, prebuiltTemplates, listings],
  )

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  const loadHistory = useCallback(async () => {
    const seq = ++loadSeq.current
    try {
      const next = await listAbTestsApi()
      if (seq !== loadSeq.current) {
        return
      }
      setHistory(next)
    } catch {
      if (seq !== loadSeq.current) {
        return
      }
      setError('Impossible de charger l’historique A/B')
    }
  }, [])

  const loadTest = useCallback(async (testId: string) => {
    const next = await getAbTestApi(testId)
    setResult(next)
    if (next.parentTestId) {
      try {
        setParentResult(await getAbTestApi(next.parentTestId))
      } catch {
        setParentResult(null)
      }
    } else {
      setParentResult(null)
    }
    return next
  }, [])

  useEffect(() => {
    if (!isOpen) {
      stopPoll()
      return
    }
    setError(null)
    if (initialBId) {
      setTemplateBId(initialBId)
    }
    void loadHistory()
    void listMarketplaceTemplatesApi()
      .then((next) => setListings(next))
      .catch(() => setListings([]))
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      stopPoll()
    }
  }, [isOpen, onClose, loadHistory, initialBId])

  const startPolling = (testId: string) => {
    stopPoll()
    pollRef.current = setInterval(() => {
      void (async () => {
        try {
          const next = await loadTest(testId)
          if (next.status === 'completed' || next.status === 'failed') {
            stopPoll()
            await loadHistory()
          }
        } catch {
          stopPoll()
        }
      })()
    }, 1000)
  }

  const handleLaunch = async () => {
    setBusy(true)
    setError(null)
    try {
      const created = await startAbTestApi({
        templateAId,
        templateBId,
        generationsPerTemplate: generations,
        maxDepth,
        winnerMode,
      })
      await loadTest(created.testId)
      startPolling(created.testId)
    } catch (caught) {
      const message =
        caught && typeof caught === 'object' && 'response' in caught
          ? String(
              (caught as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
                'Impossible de lancer le test A/B',
            )
          : 'Impossible de lancer le test A/B'
      setError(message)
      toast(message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleThumb = async (generationId: string, thumb: 'up' | 'down' | 'none') => {
    if (!result) {
      return
    }
    try {
      const updated = await patchAbTestFeedbackApi(result.testId, { generationId, thumb })
      setResult(updated)
    } catch {
      toast('Impossible d’enregistrer le pouce', 'error')
    }
  }

  const handleOpenGraph = async (generation: ABTestResult['generations'][number]) => {
    if (!generation.document) {
      toast('Aucun arbre à ouvrir pour cette génération', 'error')
      return
    }
    try {
      await useGraphStore
        .getState()
        .loadDialogueFromRawJson(
          JSON.stringify(generation.document),
          `ab-${result?.testId ?? 'test'}-${generation.id}`,
        )
      useUiLayoutStore.getState().setCenterPanelTab('graph')
      onClose()
    } catch {
      toast('Impossible d’ouvrir l’arbre dans le graphe', 'error')
    }
  }

  const handleRerun = async () => {
    if (!result) {
      return
    }
    setBusy(true)
    try {
      const created = await rerunAbTestApi(result.testId)
      await loadTest(created.testId)
      startPolling(created.testId)
    } catch {
      toast('Impossible de relancer le test', 'error')
    } finally {
      setBusy(false)
    }
  }

  if (!isOpen) {
    return null
  }

  const fieldStyle: CSSProperties = {
    width: '100%',
    minHeight: TOUCH_TARGET_MIN_PX,
    padding: chrome.buttonPadding,
    border: `1px solid ${theme.border.secondary}`,
    borderRadius: `${redesignRadius.control}px`,
    backgroundColor: theme.input.background,
    color: theme.text.primary,
    fontSize: `${chrome.buttonFontRem}rem`,
  }
  const buttonStyle: CSSProperties = {
    minHeight: TOUCH_TARGET_MIN_PX,
    padding: chrome.buttonPadding,
    backgroundColor: theme.button.default.background,
    border: `1px solid ${theme.border.secondary}`,
    borderRadius: `${redesignRadius.control}px`,
    color: theme.button.default.color,
    cursor: 'pointer',
    fontSize: `${chrome.buttonFontRem}rem`,
  }
  const canLaunch = Boolean(
    templateAId &&
      templateBId &&
      templateAId !== templateBId &&
      !busy &&
      generations >= 1 &&
      generations <= 5 &&
      maxDepth >= 1 &&
      maxDepth <= 4,
  )
  const costs = costBarPercents(result?.totals.templateA, result?.totals.templateB)
  const evolution = evolutionId ? scoreHistorySeries(history, evolutionId) : []

  return (
    <div
      data-testid="template-ab-test-modal"
      role="dialog"
      aria-modal="true"
      aria-label="A/B tester templates"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '5vh',
        paddingBottom: '5vh',
        overflowY: 'auto',
        boxSizing: 'border-box',
        zIndex: 2000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: redesignSurface.panel,
          border: `1px solid ${redesignControl.border}`,
          borderRadius: redesignRadius.frame,
          width: '90%',
          maxWidth: '1200px',
          maxHeight: 'min(90vh, calc(100vh - 10vh))',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            padding: `${redesignSpacing.md}px ${redesignSpacing.lg}px`,
            borderBottom: `1px solid ${theme.border.secondary}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
            <h2 style={{ margin: 0, fontSize: `${type.titleFontRem}rem`, color: theme.text.primary }}>
            A/B tester
          </h2>
          <button type="button" onClick={onClose} style={buttonStyle}>
            Fermer
          </button>
        </div>

        <div
          style={{
            padding: `${redesignSpacing.md}px ${redesignSpacing.lg}px`,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: isNarrow ? 'column' : 'row',
            gap: `${redesignSpacing.lg}px`,
          }}
        >
          <div style={{ flex: '1 1 320px', minWidth: 0 }}>
            <label htmlFor="ab-test-template-a" style={{ display: 'block', marginBottom: 4 }}>
              Template A
            </label>
            <select
              id="ab-test-template-a"
              data-testid="ab-test-template-a"
              value={templateAId}
              onChange={(event) => setTemplateAId(event.target.value)}
              style={fieldStyle}
            >
              <option value="">Choisir…</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <label
              htmlFor="ab-test-template-b"
              style={{ display: 'block', marginTop: 12, marginBottom: 4 }}
            >
              Template B
            </label>
            <select
              id="ab-test-template-b"
              data-testid="ab-test-template-b"
              value={templateBId}
              onChange={(event) => setTemplateBId(event.target.value)}
              style={fieldStyle}
            >
              <option value="">Choisir…</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <label htmlFor="ab-test-n" style={{ display: 'block', marginTop: 12, marginBottom: 4 }}>
              Générations par template
            </label>
            <input
              id="ab-test-n"
              data-testid="ab-test-n"
              type="number"
              min={1}
              max={5}
              value={generations}
              onChange={(event) => setGenerations(Number(event.target.value))}
              style={fieldStyle}
            />
            <label
              htmlFor="ab-test-max-depth"
              style={{ display: 'block', marginTop: 12, marginBottom: 4 }}
            >
              Profondeur
            </label>
            <input
              id="ab-test-max-depth"
              data-testid="ab-test-max-depth"
              type="number"
              min={1}
              max={4}
              value={maxDepth}
              onChange={(event) => setMaxDepth(Number(event.target.value))}
              style={fieldStyle}
            />
            <label
              htmlFor="ab-test-winner-mode"
              style={{ display: 'block', marginTop: 12, marginBottom: 4 }}
            >
              Critère gagnant
            </label>
            <select
              id="ab-test-winner-mode"
              data-testid="ab-test-winner-mode"
              value={winnerMode}
              onChange={(event) => setWinnerMode(event.target.value as ABTestWinnerMode)}
              style={fieldStyle}
            >
              <option value="score">Score juge</option>
              <option value="score_thumbs">Pouces puis score</option>
              <option value="score_cost">Coût puis score</option>
            </select>
            <button
              type="button"
              data-testid="ab-test-launch-btn"
              disabled={!canLaunch}
              onClick={() => void handleLaunch()}
              style={{ ...buttonStyle, marginTop: 16, width: '100%', fontWeight: 600 }}
            >
              Lancer
            </button>
            {error ? (
              <p data-testid="ab-test-error" style={{ color: theme.text.primary }}>
                {error}
              </p>
            ) : null}

            <h3 style={{ marginTop: 24, fontSize: `${type.titleFontRem}rem` }}>Historique</h3>
            {history.length === 0 ? (
              <p data-testid="ab-test-history-empty">Aucun test A/B</p>
            ) : (
              <ul data-testid="ab-test-history" style={{ listStyle: 'none', padding: 0 }}>
                {history.map((item) => (
                  <li key={item.testId} style={{ marginBottom: 8 }}>
                    <button
                      type="button"
                      data-testid={`ab-test-history-item-${item.testId}`}
                      onClick={() => {
                        void (async () => {
                          const next = await loadTest(item.testId)
                          if (next.status === 'queued' || next.status === 'running') {
                            startPolling(item.testId)
                          }
                        })()
                      }}
                      style={{ ...buttonStyle, width: '100%', textAlign: 'left' }}
                    >
                      {item.templateAName} vs {item.templateBName} — {item.status}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <label htmlFor="ab-test-evolution" style={{ display: 'block', marginTop: 12 }}>
              Évolution d’un template
            </label>
            <select
              id="ab-test-evolution"
              data-testid="ab-test-evolution"
              value={evolutionId}
              onChange={(event) => setEvolutionId(event.target.value)}
              style={fieldStyle}
            >
              <option value="">Choisir…</option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            {evolution.map((point) => (
              <Bar
                key={point.testId}
                percent={scoreBarPercent(point.mean)}
                label={`${point.createdAt.slice(0, 10)} — ${point.mean.toFixed(1)}`}
              />
            ))}
          </div>

          <div style={{ flex: '2 1 480px', minWidth: 0 }}>
            {!result ? (
              <p>Lancez un test ou ouvrez un run dans l’historique.</p>
            ) : (
              <>
                <p data-testid="ab-test-status">
                  Statut : {result.status}
                  {result.status === 'running'
                    ? ` (${result.current}/${result.total})`
                    : ''}
                </p>
                <p data-testid="ab-test-winner">
                  Gagnant : {winnerLabel(result)}
                </p>
                <p style={{ fontSize: '0.85rem', color: redesignText.secondary }}>
                  {result.scoreVarianceNote}
                </p>
                <Bar
                  percent={scoreBarPercent(result.totals.templateA?.meanOverall ?? null)}
                  label={`${result.templateAName} — score ${result.totals.templateA?.meanOverall ?? '—'}`}
                />
                <Bar
                  percent={scoreBarPercent(result.totals.templateB?.meanOverall ?? null)}
                  label={`${result.templateBName} — score ${result.totals.templateB?.meanOverall ?? '—'}`}
                />
                <Bar
                  percent={costs.a}
                  label={`${result.templateAName} — coût ${result.totals.templateA?.totalCostEur ?? 0} €`}
                />
                <Bar
                  percent={costs.b}
                  label={`${result.templateBName} — coût ${result.totals.templateB?.totalCostEur ?? 0} €`}
                />
                {parentResult ? (
                  <div data-testid="ab-test-overlay" style={{ marginTop: 16 }}>
                    <h3>Comparaison vs run parent</h3>
                    <p>
                      Avant : {winnerLabel(parentResult)} (
                      {parentResult.totals.templateA?.meanOverall ?? '—'} /{' '}
                      {parentResult.totals.templateB?.meanOverall ?? '—'})
                    </p>
                    <p>
                      Après : {winnerLabel(result)} (
                      {result.totals.templateA?.meanOverall ?? '—'} /{' '}
                      {result.totals.templateB?.meanOverall ?? '—'})
                    </p>
                  </div>
                ) : null}
                <button
                  type="button"
                  data-testid="ab-test-rerun-btn"
                  disabled={busy || result.status !== 'completed'}
                  onClick={() => void handleRerun()}
                  style={{ ...buttonStyle, marginTop: 12 }}
                >
                  Relancer
                </button>
                <ul style={{ listStyle: 'none', padding: 0, marginTop: 16 }}>
                  {result.generations.map((generation) => (
                    <li
                      key={generation.id}
                      data-testid={`ab-test-generation-${generation.id}`}
                      style={{
                        borderTop: `1px solid ${theme.border.secondary}`,
                        padding: '0.75rem 0',
                      }}
                    >
                      <div>
                        {generation.templateName} #{generation.index + 1} — score{' '}
                        {generation.overallScore ?? 'erreur'}
                        {generation.durationMs ? ` · ${generation.durationMs} ms` : ''}
                        {generation.error ? ` (${generation.error})` : ''}
                      </div>
                      {generation.document ? (
                        <button
                          type="button"
                          data-testid={`ab-test-open-graph-${generation.id}`}
                          onClick={() => void handleOpenGraph(generation)}
                          style={{ ...buttonStyle, marginTop: 8 }}
                        >
                          Ouvrir dans le graphe
                        </button>
                      ) : null}
                      {generation.criteria.length > 0 ? (
                        <ul data-testid={`ab-test-criteria-${generation.id}`}>
                          {generation.criteria.map((criterion) => (
                            <li key={criterion.criterionId}>
                              {criterion.label}: {criterion.score}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <button
                        type="button"
                        data-testid={`ab-test-thumb-up-${generation.id}`}
                        onClick={() =>
                          void handleThumb(
                            generation.id,
                            generation.thumb === 'up' ? 'none' : 'up',
                          )
                        }
                        style={buttonStyle}
                      >
                        👍
                      </button>{' '}
                      <button
                        type="button"
                        data-testid={`ab-test-thumb-down-${generation.id}`}
                        onClick={() =>
                          void handleThumb(
                            generation.id,
                            generation.thumb === 'down' ? 'none' : 'down',
                          )
                        }
                        style={buttonStyle}
                      >
                        👎
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
