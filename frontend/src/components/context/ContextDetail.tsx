/**
 * Composant pour afficher les détails d'un élément de contexte GDD.
 * Nom, résumé et sections GDD en expand/collapse (AC FR11 #3).
 */
import { useState, useMemo, useLayoutEffect } from 'react'
import type {
  CharacterResponse,
  LocationResponse,
  ItemResponse,
  SpeciesResponse,
  CommunityResponse,
} from '../../types/api'
import { theme } from '../../theme'
import { getGddEntitySummary, extractTextFromGddValue, isSerializedNotionRichTextBlock } from '../../utils/gddSummary'
import { GDD_INLINE_PROPERTY_KEYS } from './constants'
import { GddEntityHistoryViewer } from './GddEntityHistoryViewer'
import { splitSectionsGeneralText, type GeneralSectionChunk } from '../../utils/splitSectionsGeneral'

type ContextItem = CharacterResponse | LocationResponse | ItemResponse | SpeciesResponse | CommunityResponse

interface ContextDetailProps {
  item: ContextItem | null
  /** Stem catégorie GDD (ex. personnages) pour l’historique local (Story 3.9). */
  historyCategoryStem?: string | null
}

const RESERVED_ROOT_KEYS = new Set([
  'Nom',
  'name',
  'values',
  'notion_page_id',
  'sections',
  'section_titles',
])

function computeDefaultExpandedKeys(
  generalChunks: GeneralSectionChunk[],
  expandableSectionKeys: string[]
): Set<string> {
  const s = new Set<string>()
  if (generalChunks.length === 1) {
    s.add(`gdd:general:${generalChunks[0].slug}`)
  } else if (generalChunks.length > 1) {
    const pre = generalChunks.find((c) => c.slug === 'preamble')
    if (pre) s.add(`gdd:general:${pre.slug}`)
    else s.add(`gdd:general:${generalChunks[0].slug}`)
  }
  if (generalChunks.length === 0 && expandableSectionKeys.length > 0) {
    if (expandableSectionKeys.length === 1) {
      s.add(expandableSectionKeys[0])
    } else if (expandableSectionKeys.includes('preamble')) {
      s.add('preamble')
    } else {
      s.add(expandableSectionKeys[0])
    }
  }
  return s
}

function renderValue(value: unknown, depth: number): React.ReactNode {
  if (value === null || value === undefined) return null
  if (depth > 3) return <span style={{ color: theme.text.tertiary }}>...</span>

  if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
    const obj = value as Record<string, unknown>
    if (typeof obj['rich_text'] === 'object' && Array.isArray(obj['rich_text'])) {
      const notionText = extractTextFromGddValue(obj)
      return (
        <span style={{ color: theme.text.secondary }}>
          {notionText ?? '—'}
        </span>
      )
    }
    return (
      <div style={{ marginLeft: '0.5rem' }}>
        {Object.entries(obj).map(([k, v]) => (
          <div key={k} style={{ marginBottom: '0.5rem' }}>
            <strong style={{ color: theme.text.primary }}>{k}:</strong>{' '}
            {renderValue(v, depth + 1)}
          </div>
        ))}
      </div>
    )
  }
  if (Array.isArray(value)) {
    const asRichText = value.every(
      (v) => typeof v === 'object' && v !== null && 'plain_text' in v
    )
    if (asRichText && value.length > 0) {
      const text = (value as { plain_text?: string }[])
        .map((item) => item.plain_text ?? '')
        .join('')
        .trim()
      return <span style={{ color: theme.text.secondary }}>{text || '—'}</span>
    }
    return (
      <ul style={{ marginLeft: '1rem', marginTop: '0.25rem', color: theme.text.secondary }}>
        {value.map((v, i) => (
          <li key={i}>{typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}</li>
        ))}
      </ul>
    )
  }
  if (typeof value === 'string' && isSerializedNotionRichTextBlock(value)) {
    return <span style={{ color: theme.text.tertiary }}>—</span>
  }
  return <span style={{ color: theme.text.secondary }}>{String(value)}</span>
}

function buildDetailModel(data: Record<string, unknown> | undefined): {
  inlineProperties: [string, unknown][]
  expandableSections: [string, unknown][]
  generalChunks: GeneralSectionChunk[]
  hasNotionValues: boolean
  sectionTitles: Record<string, string>
} {
  if (!data || typeof data !== 'object') {
    return {
      inlineProperties: [],
      expandableSections: [],
      generalChunks: [],
      hasNotionValues: false,
      sectionTitles: {},
    }
  }

  const rawValues = data['values']
  const notionPairs: [string, string][] =
    rawValues && typeof rawValues === 'object' && !Array.isArray(rawValues)
      ? Object.entries(rawValues as Record<string, unknown>)
          .filter(([, val]) => val != null && String(val).trim() !== '')
          .map(([k, val]) => [k, String(val)] as [string, string])
          .sort(([a], [b]) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
      : []
  const valueKeySet = new Set(notionPairs.map(([k]) => k))
  const hasNotionValues = notionPairs.length > 0

  const rawTitles = data['section_titles']
  const sectionTitles: Record<string, string> =
    rawTitles && typeof rawTitles === 'object' && !Array.isArray(rawTitles)
      ? Object.fromEntries(
          Object.entries(rawTitles as Record<string, unknown>)
            .filter(([, v]) => typeof v === 'string' && String(v).trim() !== '')
            .map(([k, v]) => [k, String(v).trim()])
        )
      : {}

  const rawSections = data['sections'] as Record<string, unknown> | undefined
  const sectionEntries: [string, unknown][] =
    rawSections && typeof rawSections === 'object' && !Array.isArray(rawSections)
      ? Object.entries(rawSections)
      : Object.entries(data).filter(([k]) => !RESERVED_ROOT_KEYS.has(k))

  const sectionInline = sectionEntries.filter(
    ([k]) => GDD_INLINE_PROPERTY_KEYS.has(k) && !valueKeySet.has(k)
  )

  const inlineMap = new Map<string, unknown>()
  for (const [k, v] of sectionInline) {
    inlineMap.set(k, v)
  }
  for (const [k, v] of notionPairs) {
    inlineMap.set(k, v)
  }
  const inlineProperties = [...inlineMap.entries()].sort(([a], [b]) =>
    a.localeCompare(b, 'fr', { sensitivity: 'base' })
  )

  const generalRaw = rawSections && typeof rawSections === 'object' && !Array.isArray(rawSections)
    ? rawSections['_general']
    : undefined
  const generalStr =
    typeof generalRaw === 'string' ? generalRaw : generalRaw != null ? String(generalRaw) : ''
  const generalChunks = splitSectionsGeneralText(generalStr)

  const expandableSections = sectionEntries.filter(
    ([k]) => k !== '_general' && !GDD_INLINE_PROPERTY_KEYS.has(k)
  )

  return {
    inlineProperties,
    expandableSections,
    generalChunks,
    hasNotionValues,
    sectionTitles,
  }
}

export function ContextDetail({ item, historyCategoryStem }: ContextDetailProps) {
  const data = (item?.data as Record<string, unknown> | undefined) ?? undefined
  const summary = getGddEntitySummary(data)

  const model = useMemo(() => buildDetailModel(data), [data])

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set())

  useLayoutEffect(() => {
    if (!item) {
      setExpandedKeys(new Set())
      return
    }
    const m = buildDetailModel(data)
    setExpandedKeys(
      computeDefaultExpandedKeys(
        m.generalChunks,
        m.expandableSections.map(([k]) => k)
      )
    )
  }, [item, data])

  const toggleSection = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const proprietesLabel = model.hasNotionValues ? 'Propriétés (table Notion)' : 'Propriétés'

  const hasExpandableContent =
    model.expandableSections.length > 0 || model.generalChunks.length > 0

  if (!item) {
    return (
      <div style={{ padding: '1rem', color: theme.text.secondary, textAlign: 'center' }}>
        Sélectionnez un élément pour voir ses détails
      </div>
    )
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        maxHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: theme.background.panel,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex: '1 1 0%',
          minHeight: 0,
          height: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: '1rem',
          boxSizing: 'border-box',
          scrollbarGutter: 'stable',
        }}
      >
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem', color: theme.text.primary }}>{item.name}</h3>
        {summary && (
          <div style={{ marginBottom: '1rem', fontSize: '0.9rem', color: theme.text.secondary, lineHeight: 1.4 }}>
            {summary}
          </div>
        )}

        {model.inlineProperties.length > 0 && (
          <div style={{ borderTop: `1px solid ${theme.border.primary}`, paddingTop: '1rem', marginBottom: '0.5rem' }}>
            <div
              style={{
                marginBottom: '0.5rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => toggleSection('Propriétés')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    toggleSection('Propriétés')
                  }
                }}
                style={{
                  width: '100%',
                  padding: '0.5rem 0.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  border: 'none',
                  background: theme.background.tertiary,
                  color: theme.text.primary,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                }}
                aria-expanded={expandedKeys.has('Propriétés')}
                aria-controls="context-detail-proprietes"
              >
                <span style={{ transform: expandedKeys.has('Propriétés') ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }} aria-hidden>
                  ▶
                </span>
                {proprietesLabel}
              </button>
              {expandedKeys.has('Propriétés') && (
                <div
                  id="context-detail-proprietes"
                  data-testid="context-detail-proprietes-body"
                  role="region"
                  aria-label={proprietesLabel}
                  style={{
                    padding: '0.75rem',
                    backgroundColor: theme.background.panel,
                    fontSize: '0.85rem',
                    borderTop: `1px solid ${theme.border.primary}`,
                  }}
                >
                  {model.inlineProperties.map(([key, value]) => (
                    <div key={key} style={{ marginBottom: '0.35rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <strong style={{ color: theme.text.primary, flexShrink: 0 }}>{key}:</strong>
                      <span style={{ color: theme.text.secondary }}>{renderValue(value, 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ borderTop: `1px solid ${theme.border.primary}`, paddingTop: '1rem' }}>
          <h4 style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: '0.9rem', color: theme.text.primary }}>
            Sections GDD
          </h4>
          {model.inlineProperties.length === 0 && !hasExpandableContent && (
            <div style={{ color: theme.text.secondary, fontSize: '0.9rem' }}>Aucune section</div>
          )}
          {model.inlineProperties.length > 0 && !hasExpandableContent && (
            <div style={{ color: theme.text.secondary, fontSize: '0.9rem' }}>Aucune section dépliable</div>
          )}

          {model.generalChunks.map((chunk, index) => {
            const expandKey = `gdd:general:${chunk.slug}`
            const isExpanded = expandedKeys.has(expandKey)
            const regionId = `context-detail-general-${index}`
            return (
              <div
                key={expandKey}
                style={{
                  marginBottom: '0.5rem',
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleSection(expandKey)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleSection(expandKey)
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    border: 'none',
                    background: theme.background.tertiary,
                    color: theme.text.primary,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                  }}
                  aria-expanded={isExpanded}
                  aria-controls={regionId}
                >
                  <span style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }} aria-hidden>
                    ▶
                  </span>
                  {chunk.title}
                </button>
                {isExpanded && (
                  <div
                    id={regionId}
                    role="region"
                    aria-label={chunk.title}
                    style={{
                      padding: '0.75rem',
                      backgroundColor: theme.background.panel,
                      fontSize: '0.85rem',
                      whiteSpace: 'pre-wrap',
                      color: theme.text.secondary,
                    }}
                  >
                    {chunk.body}
                  </div>
                )}
              </div>
            )
          })}

          {model.expandableSections.map(([sectionKey, value], index) => {
            const isExpanded = expandedKeys.has(sectionKey)
            const isNestedObj = typeof value === 'object' && value !== null && !Array.isArray(value)
            const regionId = `context-detail-section-${index}`
            const sectionLabel = model.sectionTitles[sectionKey] ?? sectionKey
            return (
              <div
                key={sectionKey}
                style={{
                  marginBottom: '0.5rem',
                  border: `1px solid ${theme.border.primary}`,
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => toggleSection(sectionKey)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleSection(sectionKey)
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem 0.75rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    border: 'none',
                    background: theme.background.tertiary,
                    color: theme.text.primary,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontWeight: 600,
                    fontSize: '0.9rem',
                  }}
                  aria-expanded={isExpanded}
                  aria-controls={regionId}
                >
                  <span style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }} aria-hidden>
                    ▶
                  </span>
                  {sectionLabel}
                </button>
                {isExpanded && (
                  <div
                    id={regionId}
                    role="region"
                    aria-label={sectionLabel}
                    style={{ padding: '0.75rem', backgroundColor: theme.background.panel, fontSize: '0.85rem' }}
                  >
                    {isNestedObj
                      ? Object.entries(value as Record<string, unknown>).map(([k, v]) => (
                          <div key={k} style={{ marginBottom: '0.5rem' }}>
                            <strong style={{ color: theme.text.primary }}>{k}:</strong>{' '}
                            {renderValue(v, 0)}
                          </div>
                        ))
                      : renderValue(value, 0)}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {historyCategoryStem && (
          <GddEntityHistoryViewer
            categoryStem={historyCategoryStem}
            entityName={String((data?.Nom as string) || item?.name || '').trim() || item?.name || ''}
          />
        )}
      </div>
    </div>
  )
}
