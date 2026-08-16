/**
 * Modal plein écran du marketplace de templates (Story 6.6).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { theme } from '../../theme'
import { generationPanelChrome, modalTypography } from '../../theme/responsiveChrome'
import {
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
  listMarketplaceTemplatesApi,
  rateMarketplaceTemplateApi,
  copyMarketplaceListingApi,
  unpublishMarketplaceListingApi,
} from '../../api/templates'
import type { MarketplaceListing } from '../../types/template'
import {
  filterMarketplaceListings,
  sortMarketplaceListings,
  type MarketplaceSortKey,
} from '../../utils/templateGroups'

export interface TemplateMarketplaceModalProps {
  isOpen: boolean
  onClose: () => void
  currentUserId: string | null
  currentUserRole: string | null
  isGuest: boolean
  onCopied: () => Promise<void> | void
}

function formatRating(listing: MarketplaceListing): string {
  if (listing.ratingAverage == null) {
    return '—'
  }
  return `${listing.ratingAverage.toFixed(1)} (${listing.ratingCount})`
}

export function TemplateMarketplaceModal({
  isOpen,
  onClose,
  currentUserId,
  currentUserRole,
  isGuest,
  onCopied,
}: TemplateMarketplaceModalProps) {
  const isNarrow = useGenerationPanelNarrow()
  const chrome = isNarrow ? generationPanelChrome.narrow : generationPanelChrome.comfortable
  const type = isNarrow ? modalTypography.narrow : modalTypography.comfortable
  const toast = useToast()
  const [listings, setListings] = useState<MarketplaceListing[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameFilter, setNameFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [contextFilter, setContextFilter] = useState('')
  const [sort, setSort] = useState<MarketplaceSortKey>('date')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const loadSeq = useRef(0)

  const loadListings = useCallback(async () => {
    const seq = ++loadSeq.current
    setIsLoading(true)
    setError(null)
    try {
      const next = await listMarketplaceTemplatesApi()
      if (seq !== loadSeq.current) {
        return
      }
      setListings(next)
    } catch {
      if (seq !== loadSeq.current) {
        return
      }
      setError('Impossible de charger le marketplace')
    } finally {
      if (seq === loadSeq.current) {
        setIsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    void loadListings()
  }, [isOpen, loadListings])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  const visibleListings = useMemo(
    () =>
      sortMarketplaceListings(
        filterMarketplaceListings(listings, {
          name: nameFilter,
          category: categoryFilter,
          context: contextFilter,
        }),
        sort,
      ),
    [listings, nameFilter, categoryFilter, contextFilter, sort],
  )

  const selected = visibleListings.find((item) => item.id === selectedId) ?? null
  const canRate = Boolean(
    selected && !isGuest && currentUserId && selected.authorId !== currentUserId,
  )
  const canUnpublish = Boolean(
    selected &&
      !isGuest &&
      (selected.authorId === currentUserId || currentUserRole === 'admin'),
  )

  const handleUse = async (listing: MarketplaceListing) => {
    setBusy(true)
    try {
      const copied = await copyMarketplaceListingApi(listing.id)
      await onCopied()
      await loadListings()
      toast(`« ${copied.name} » ajouté à Mes templates`, 'success')
      if (copied.warnings.length > 0) {
        toast(copied.warnings.join(' · '), 'warning')
      }
    } catch {
      toast('Échec de la copie marketplace', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleRate = async (listing: MarketplaceListing, stars: number) => {
    setBusy(true)
    try {
      const updated = await rateMarketplaceTemplateApi(listing.id, { stars })
      setListings((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      )
    } catch {
      toast('Impossible de noter cette fiche', 'error')
    } finally {
      setBusy(false)
    }
  }

  const handleUnpublish = async (listing: MarketplaceListing) => {
    setBusy(true)
    try {
      await unpublishMarketplaceListingApi(listing.id)
      setSelectedId(null)
      await loadListings()
      toast(`« ${listing.name} » retiré du marketplace`, 'success')
    } catch {
      toast('Impossible de retirer cette fiche', 'error')
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

  return (
    <div
      data-testid="template-marketplace-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Marketplace de templates"
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
          <h2
            style={{
              margin: 0,
              fontSize: `${type.titleFontRem}rem`,
              color: redesignText.strong,
            }}
          >
            Marketplace
          </h2>
          <button
            type="button"
            data-testid="marketplace-close-btn"
            onClick={onClose}
            style={buttonStyle}
          >
            Fermer
          </button>
        </div>

        <div
          data-testid="marketplace-filters"
          style={{
            padding: `${redesignSpacing.md}px ${redesignSpacing.lg}px`,
            display: 'grid',
            gridTemplateColumns: isNarrow ? '1fr' : '1fr 1fr 1fr auto',
            gap: `${chrome.controlGapRem}rem`,
          }}
        >
          <input
            data-testid="marketplace-filter-name"
            aria-label="Filtrer par nom"
            placeholder="Nom"
            value={nameFilter}
            onChange={(event) => setNameFilter(event.target.value)}
            style={fieldStyle}
          />
          <input
            data-testid="marketplace-filter-category"
            aria-label="Filtrer par catégorie"
            placeholder="Catégorie"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
            style={fieldStyle}
          />
          <input
            data-testid="marketplace-filter-context"
            aria-label="Filtrer par contexte"
            placeholder="Contexte"
            value={contextFilter}
            onChange={(event) => setContextFilter(event.target.value)}
            style={fieldStyle}
          />
          <select
            data-testid="marketplace-sort"
            aria-label="Trier le marketplace"
            value={sort}
            onChange={(event) => setSort(event.target.value as MarketplaceSortKey)}
            style={fieldStyle}
          >
            <option value="date">Date</option>
            <option value="usage">Popularité</option>
            <option value="rating">Note</option>
          </select>
        </div>

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: `${redesignSpacing.md}px ${redesignSpacing.lg}px`,
            display: 'grid',
            gridTemplateColumns: isNarrow || !selected ? '1fr' : '1fr 1fr',
            gap: `${chrome.controlGapRem}rem`,
          }}
        >
          <div data-testid="marketplace-list">
            {isLoading ? (
              <div data-testid="marketplace-loading">Chargement…</div>
            ) : error ? (
              <div data-testid="marketplace-error">{error}</div>
            ) : listings.length === 0 ? (
              <div data-testid="marketplace-empty">Aucune fiche publiée</div>
            ) : visibleListings.length === 0 ? (
              <div data-testid="marketplace-no-match">Aucun résultat</div>
            ) : (
              visibleListings.map((listing) => (
                <button
                  key={listing.id}
                  type="button"
                  data-testid="marketplace-item"
                  data-listing-id={listing.id}
                  onClick={() => setSelectedId(listing.id)}
                  style={{
                    ...buttonStyle,
                    width: '100%',
                    textAlign: 'left',
                    marginBottom: '0.5rem',
                    borderColor:
                      selectedId === listing.id ? theme.button.primary.background : theme.border.secondary,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {listing.icon} {listing.name}
                  </div>
                  {listing.description ? (
                    <div style={{ fontSize: `${chrome.labelFontRem}rem`, color: theme.text.secondary }}>
                      {listing.description}
                    </div>
                  ) : null}
                  <div style={{ fontSize: `${chrome.labelFontRem}rem`, color: theme.text.secondary }}>
                    {listing.authorUsername} · {listing.usageCount} usage
                    {listing.usageCount === 1 ? '' : 's'} · Note {formatRating(listing)}
                  </div>
                </button>
              ))
            )}
          </div>

          {selected ? (
            <div data-testid="marketplace-detail">
              <h3 style={{ marginTop: 0, color: theme.text.primary }}>{selected.name}</h3>
              <p style={{ color: theme.text.secondary }}>{selected.description}</p>
              <div data-testid="marketplace-detail-author">Auteur : {selected.authorUsername}</div>
              <div data-testid="marketplace-detail-usage">Usages : {selected.usageCount}</div>
              <div data-testid="marketplace-detail-rating">Note : {formatRating(selected)}</div>
              <pre
                data-testid="marketplace-detail-instructions"
                style={{
                  whiteSpace: 'pre-wrap',
                  fontSize: `${chrome.labelFontRem}rem`,
                  color: theme.text.secondary,
                }}
              >
                {selected.configuration.instructions}
              </pre>
              <div data-testid="marketplace-detail-context" style={{ color: theme.text.secondary }}>
                Contexte : {[
                  ...(selected.configuration.characters ?? []),
                  ...(selected.configuration.locations ?? []),
                  selected.configuration.region,
                ]
                  .filter(Boolean)
                  .join(', ') || '—'}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  data-testid="marketplace-use-btn"
                  disabled={busy}
                  onClick={() => void handleUse(selected)}
                  style={buttonStyle}
                >
                  Utiliser ce template
                </button>
                {canUnpublish ? (
                  <button
                    type="button"
                    data-testid="marketplace-unpublish-btn"
                    disabled={busy}
                    onClick={() => void handleUnpublish(selected)}
                    style={buttonStyle}
                  >
                    Retirer
                  </button>
                ) : null}
                {canRate
                  ? [1, 2, 3, 4, 5].map((stars) => (
                      <button
                        key={stars}
                        type="button"
                        data-testid={`marketplace-rate-${stars}`}
                        disabled={busy}
                        onClick={() => void handleRate(selected, stars)}
                        style={buttonStyle}
                      >
                        {stars}★
                      </button>
                    ))
                  : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
