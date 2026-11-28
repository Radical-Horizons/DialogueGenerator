/**
 * Fiche de scène en tête de la vue Graphe (board `Fiche`, story 20.4 lot A).
 *
 * Repliée en une ligne ; dépliée, elle se corrige sur place et s'enregistre seule avec
 * le dialogue. Sa distribution et ses fiches sont les seules envoyées aux générations.
 */
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { useGraphStore } from '../../store/graphStore'
import { useAuthStore } from '../../store/authStore'
import { useContextStore } from '../../store/contextStore'
import { useSceneCatalogStore } from '../../store/sceneCatalogStore'
import { useSceneSheet } from '../../hooks/useSceneSheet'
import {
  findSpeakerIssues,
  newLinkedEntries,
  sceneRefFor,
  speakerKey,
  type SceneLinkedEntry,
  type SceneSheet,
} from '../../utils/sceneSheet'
import { PLAYABLE_CHARACTERS, isForbiddenNpc } from '../../utils/sceneDramatis'
import { entityInitials } from '../../utils/entityInitials'
import { formatDialogueTitle } from '../../utils/formatDialogueTitle'
import { FuzzyPickerInput } from '../shared/FuzzyPickerInput'
import {
  redesignAccent,
  redesignControl,
  redesignFont,
  redesignHairline,
  redesignMonoLabelStyle,
  redesignRadius,
  redesignSpacing,
  redesignSurface,
  redesignText,
} from '../../theme/redesignTokens'

const CATEGORY_LABELS: Record<string, string> = {
  characters: 'personnage',
  locations: 'lieu',
  items: 'objet',
  species: 'espèce',
  communities: 'communauté',
  dialogues_examples: 'exemple de dialogue',
  narrative_structures: 'structure narrative',
  chapters: 'chapitre',
  scenes: 'scène',
}

const monoLabel: CSSProperties = {
  ...redesignMonoLabelStyle,
  fontSize: '10px',
  letterSpacing: '0.1em',
  color: redesignText.label,
  whiteSpace: 'nowrap',
}

const buttonStyle: CSSProperties = {
  minHeight: 28,
  padding: '0 10px',
  borderRadius: redesignRadius.control,
  border: `1px solid ${redesignControl.border}`,
  background: 'transparent',
  color: redesignText.secondary,
  fontFamily: 'inherit',
  fontSize: '12.5px',
  cursor: 'pointer',
  flex: 'none',
}

const fieldStyle: CSSProperties = {
  boxSizing: 'border-box',
  borderRadius: redesignRadius.control,
  border: `1px solid ${redesignControl.inputBorder}`,
  background: redesignSurface.panel,
  color: redesignText.body,
  fontFamily: 'inherit',
  fontSize: '13px',
}

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  minHeight: 28,
  boxSizing: 'border-box',
  padding: '0 9px',
  borderRadius: redesignRadius.chip,
  border: `1px solid ${redesignHairline.strong}`,
  fontSize: '13px',
  color: redesignText.body,
}

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: redesignSpacing.sm,
}

const ellipsis: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  minWidth: 0,
}

const CURLY_APOSTROPHE = /[\u2018\u2019]/g

/** Deux graphies souvent identiques à l'œil : dire ce qui les sépare. */
function spellingDifference(other: string, target: string): string | null {
  if (other.replace(CURLY_APOSTROPHE, "'") !== target.replace(CURLY_APOSTROPHE, "'")) return null
  return target.includes('\u2019')
    ? 'apostrophe droite au lieu de l’apostrophe typographique'
    : 'apostrophe typographique au lieu de l’apostrophe droite'
}

function Initials({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 20,
        height: 20,
        borderRadius: redesignRadius.chip,
        background: redesignSurface.nodeHeader,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: redesignFont.mono,
        fontSize: '10px',
      }}
    >
      {entityInitials(name)}
    </span>
  )
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        border: 'none',
        background: 'transparent',
        color: redesignText.label,
        cursor: 'pointer',
        padding: '0 2px',
        fontSize: '14px',
        lineHeight: 1,
      }}
    >
      ×
    </button>
  )
}

export function SceneSheetBar() {
  const documentId = useGraphStore((state) => state.documentId)
  const isLoading = useGraphStore((state) => state.isLoading)
  if (!documentId || isLoading) return null
  // Remontée par dialogue : repli et saisies en cours ne suivent pas.
  return <SceneSheetPanel key={documentId} documentId={documentId} />
}

function SceneSheetPanel({ documentId }: { documentId: string }) {
  const [expanded, setExpanded] = useState(false)
  const { sheet, isDeduced } = useSceneSheet()
  const nodes = useGraphStore((state) => state.nodes)
  const documentTitle = useGraphStore((state) => state.document?.title)
  const canEditDocument = useGraphStore((state) => state.canEditDocument)
  const isGuest = useAuthStore((state) => state.user?.role === 'guest')
  const readOnly = isGuest || canEditDocument === false

  const gddDataRevision = useContextStore((state) => state.gddDataRevision)
  const loadCatalog = useSceneCatalogStore((state) => state.load)
  useEffect(() => {
    void loadCatalog(gddDataRevision ?? 0)
  }, [gddDataRevision, loadCatalog])

  const issues = useMemo(() => findSpeakerIssues(nodes ?? [], sheet), [nodes, sheet])
  const issueCount = issues.spellings.length + (issues.emptyNodeIds.length > 0 ? 1 : 0)

  const title =
    typeof documentTitle === 'string' && documentTitle.trim()
      ? documentTitle
      : formatDialogueTitle(documentId)
  const npcNames = sheet.npcs.map((npc) => npc.name).join(', ')
  const brief = sheet.brief.trim()

  return (
    <section
      data-testid="scene-sheet"
      aria-label="Fiche de scène"
      style={{
        flexShrink: 0,
        maxHeight: expanded ? '55%' : undefined,
        overflowY: expanded ? 'auto' : undefined,
        padding: expanded
          ? `${redesignSpacing.md}px ${redesignSpacing.lg}px`
          : `${redesignSpacing.xs}px ${redesignSpacing.lg}px`,
        borderBottom: `1px solid ${redesignHairline.standard}`,
        background: redesignSurface.base,
        color: redesignText.body,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          // Écran étroit : le résumé passe à la ligne plutôt que de sortir du cadre.
          flexWrap: 'wrap',
          columnGap: redesignSpacing.md,
          rowGap: redesignSpacing.xs,
          minWidth: 0,
        }}
      >
        <span style={monoLabel}>Fiche de scène</span>
        {isDeduced ? (
          <span style={{ ...monoLabel, color: redesignAccent.text }}>Déduite — vérifier</span>
        ) : null}
        {readOnly ? <span style={monoLabel}>Lecture seule</span> : null}
        {expanded ? (
          <span style={{ flex: 1 }} />
        ) : (
          <div
            data-testid="scene-sheet-summary"
            style={{
              flex: '1 1 260px',
              minWidth: 0,
              display: 'flex',
              alignItems: 'baseline',
              gap: redesignSpacing.md,
              fontSize: '12.5px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            <span
              style={{
                ...ellipsis,
                fontFamily: redesignFont.serif,
                fontSize: '15px',
                color: redesignText.strong,
                flex: '0 1 auto',
              }}
            >
              {title}
            </span>
            <span style={{ ...ellipsis, flex: '0 1 auto' }}>
              {npcNames || 'PNJ à préciser'}
              <span style={{ color: redesignText.muted }}> face à </span>
              {sheet.pc?.name || 'PJ à préciser'}
            </span>
            <span style={{ ...ellipsis, flex: '0 1 auto', color: redesignText.secondary }}>
              {sheet.place?.name || 'lieu à préciser'}
            </span>
            <span style={{ ...ellipsis, flex: '1 1 0', color: redesignText.muted }}>
              {brief || 'sans brief'}
            </span>
          </div>
        )}
        {!expanded && issueCount > 0 ? (
          <span style={{ ...monoLabel, color: redesignAccent.text }}>{issueCount} à vérifier</span>
        ) : null}
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          style={{ ...buttonStyle, border: 'none', padding: 0 }}
        >
          {expanded ? 'replier la fiche ▴' : 'déplier la fiche ▾'}
        </button>
      </div>

      {expanded ? (
        <SceneSheetFields
          sheet={sheet}
          title={title}
          readOnly={readOnly}
          spellings={issues.spellings}
          emptyNodeIds={issues.emptyNodeIds}
        />
      ) : null}
    </section>
  )
}

function SceneSheetFields({
  sheet,
  title,
  readOnly,
  spellings,
  emptyNodeIds,
}: {
  sheet: SceneSheet
  title: string
  readOnly: boolean
  spellings: ReturnType<typeof findSpeakerIssues>['spellings']
  emptyNodeIds: string[]
}) {
  const updateScene = useGraphStore((state) => state.updateScene)
  const rewriteSpeakers = useGraphStore((state) => state.rewriteSpeakers)
  const characters = useSceneCatalogStore((state) => state.characters)
  const places = useSceneCatalogStore((state) => state.places)

  const selections = useContextStore((state) => state.selections)
  const items = useContextStore((state) => state.items)
  const species = useContextStore((state) => state.species)
  const communities = useContextStore((state) => state.communities)
  const checked = useMemo(
    () =>
      newLinkedEntries(
        selections,
        { characters, locations: places, items, species, communities },
        sheet,
      ),
    [selections, characters, places, items, species, communities, sheet],
  )

  const [addingCharacter, setAddingCharacter] = useState(false)
  const [characterDraft, setCharacterDraft] = useState('')

  const npcKeys = new Set(sheet.npcs.map((npc) => speakerKey(npc.name)))
  const pcKey = speakerKey(sheet.pc?.name)

  const characterOptions = characters
    .filter(
      (item) =>
        !isForbiddenNpc(item.name) &&
        !npcKeys.has(speakerKey(item.name)) &&
        speakerKey(item.name) !== pcKey,
    )
    .map((item) => ({ id: item.name, label: item.name }))
  const placeOptions = places.map((item) => ({ id: item.name, label: item.name }))
  const playerOptions = PLAYABLE_CHARACTERS.filter((name) => !npcKeys.has(speakerKey(name)))
  const currentPlayer =
    playerOptions.find((name) => speakerKey(name) === pcKey) ?? sheet.pc?.name ?? ''

  const addNpc = (raw: string) => {
    const ref = sceneRefFor(raw.trim(), characters)
    const key = speakerKey(ref.name)
    if (!key || isForbiddenNpc(ref.name) || npcKeys.has(key) || key === pcKey) return
    updateScene((current) => ({ ...current, npcs: [...current.npcs, ref] }))
    setCharacterDraft('')
    setAddingCharacter(false)
  }

  const submitCharacter = (event: FormEvent) => {
    event.preventDefault()
    addNpc(characterDraft)
  }

  const setPlace = (value: string) => {
    const match = places.find((item) => speakerKey(item.name) === speakerKey(value))
    const pageId = match?.data?.notion_page_id
    // Nom du GDD quand il correspond ; une espace en bordure garde la saisie, pour
    // pouvoir taper un nom plus long.
    const name = match && value === value.trim() ? match.name : value
    updateScene((current) => ({
      ...current,
      place: value.trim()
        ? { name, entryId: typeof pageId === 'string' ? pageId : null }
        : null,
    }))
  }

  const removeLinked = (entry: SceneLinkedEntry) => {
    updateScene((current) => ({
      ...current,
      linkedEntries: current.linkedEntries.filter(
        (item) => !(item.category === entry.category && item.name === entry.name),
      ),
    }))
  }

  const replies = (count: number) => `${count} réplique${count > 1 ? 's' : ''}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: redesignSpacing.md }}>
      <h2
        style={{
          margin: `${redesignSpacing.sm}px 0 0`,
          fontFamily: redesignFont.serif,
          fontWeight: 400,
          fontSize: '33px',
          lineHeight: 1.12,
          color: redesignText.strong,
        }}
      >
        {title}
      </h2>

      <div role="group" aria-label="Distribution" style={rowStyle}>
        {sheet.npcs.map((npc) => (
          <span key={npc.name} style={{ ...chipStyle, paddingLeft: 4 }}>
            <Initials name={npc.name} />
            {npc.name}
            <span style={monoLabel}>PNJ</span>
            {!readOnly ? (
              <RemoveButton
                label={`Retirer le PNJ ${npc.name}`}
                onClick={() =>
                  updateScene((current) => ({
                    ...current,
                    npcs: current.npcs.filter((item) => item.name !== npc.name),
                  }))
                }
              />
            ) : null}
          </span>
        ))}
        {sheet.npcs.length === 0 ? (
          <span style={{ fontSize: '12.5px', color: redesignText.muted }}>PNJ à préciser</span>
        ) : null}
        <span style={{ fontSize: '12.5px', color: redesignText.muted }}>face à</span>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <span style={monoLabel}>PJ</span>
          <select
            aria-label="PJ"
            value={currentPlayer}
            disabled={readOnly}
            onChange={(event) => {
              const name = event.target.value
              updateScene((current) => ({
                ...current,
                pc: name ? sceneRefFor(name, characters) : null,
              }))
            }}
            style={{ ...fieldStyle, height: 28, borderRadius: redesignRadius.chip, padding: '0 9px' }}
          >
            <option value="">à préciser</option>
            {currentPlayer && !playerOptions.some((name) => name === currentPlayer) ? (
              <option value={currentPlayer}>{currentPlayer}</option>
            ) : null}
            {playerOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <span
          aria-hidden="true"
          style={{ width: 1, height: 16, margin: '0 5px', background: redesignHairline.strong }}
        />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: redesignSpacing.sm }}>
          <span style={monoLabel}>Lieu</span>
          <div style={{ width: 236 }}>
            <FuzzyPickerInput
              data-testid="scene-sheet-place"
              value={sheet.place?.name ?? ''}
              onChange={setPlace}
              options={placeOptions}
              disabled={readOnly}
              placeholder="Où se passe la scène ?"
            />
          </div>
        </label>
        {!readOnly && !addingCharacter ? (
          <button type="button" onClick={() => setAddingCharacter(true)} style={buttonStyle}>
            + Personnage
          </button>
        ) : null}
        {!readOnly && addingCharacter ? (
          <form onSubmit={submitCharacter} style={{ display: 'inline-flex', gap: redesignSpacing.xs }}>
            <div style={{ width: 220 }}>
              <FuzzyPickerInput
                data-testid="scene-sheet-add-character"
                value={characterDraft}
                onChange={setCharacterDraft}
                onSelect={addNpc}
                options={characterOptions}
                placeholder="Nom du PNJ"
              />
            </div>
            <button type="submit" style={buttonStyle}>
              Ajouter
            </button>
            <button
              type="button"
              onClick={() => {
                setCharacterDraft('')
                setAddingCharacter(false)
              }}
              style={buttonStyle}
            >
              Annuler
            </button>
          </form>
        ) : null}
      </div>

      <label style={{ display: 'flex', flexDirection: 'column', gap: redesignSpacing.xs, maxWidth: 640 }}>
        <span style={monoLabel}>Brief — ce qui doit se passer</span>
        <textarea
          aria-label="Brief de la scène"
          value={sheet.brief}
          readOnly={readOnly}
          rows={3}
          placeholder="Ce qui doit se passer dans la scène. Il précède chaque consigne envoyée au modèle."
          onChange={(event) => {
            const brief = event.target.value
            updateScene((current) => ({ ...current, brief }))
          }}
          style={{ ...fieldStyle, padding: '7px 9px', fontSize: '15px', lineHeight: 1.6, resize: 'vertical' }}
        />
      </label>

      {spellings.length > 0 || emptyNodeIds.length > 0 ? (
        <div
          role="group"
          aria-label="Locuteurs à vérifier"
          style={{ display: 'flex', flexDirection: 'column', gap: redesignSpacing.xs }}
        >
          <span style={monoLabel}>Locuteurs à vérifier</span>
          {spellings.map((issue) => (
            <div key={issue.target} style={{ ...rowStyle, fontSize: '12.5px' }}>
              <span>
                « {issue.others.join(' », « ')} » ({replies(issue.nodeIds.length)}) — autre graphie de «{' '}
                {issue.target} »
                {spellingDifference(issue.others[0], issue.target) ? (
                  <span style={{ color: redesignText.muted }}>
                    {' '}
                    : {spellingDifference(issue.others[0], issue.target)}
                  </span>
                ) : null}
              </span>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() => rewriteSpeakers(issue.nodeIds, issue.target)}
                  style={buttonStyle}
                >
                  Écrire « {issue.target} »
                </button>
              ) : null}
            </div>
          ))}
          {emptyNodeIds.length > 0 ? (
            <div style={{ ...rowStyle, fontSize: '12.5px' }}>
              <span>{replies(emptyNodeIds.length)} sans locuteur</span>
              {!readOnly && sheet.npcs[0] ? (
                <button
                  type="button"
                  onClick={() => rewriteSpeakers(emptyNodeIds, sheet.npcs[0].name)}
                  style={buttonStyle}
                >
                  Attribuer à {sheet.npcs[0].name}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        role="group"
        aria-label="Fiches liées"
        style={{ ...rowStyle, paddingTop: redesignSpacing.sm, borderTop: `1px solid ${redesignHairline.standard}` }}
      >
        <span style={monoLabel}>Fiches liées</span>
        {sheet.linkedEntries.map((entry) => (
          <span key={`${entry.category}:${entry.name}`} style={chipStyle}>
            {entry.name}
            <span style={monoLabel}>
              {CATEGORY_LABELS[entry.category] ?? entry.category}
              {entry.mode === 'excerpt' ? ' · extrait' : ''}
            </span>
            {!readOnly ? (
              <RemoveButton
                label={`Retirer la fiche ${entry.name}`}
                onClick={() => removeLinked(entry)}
              />
            ) : null}
          </span>
        ))}
        {sheet.linkedEntries.length === 0 ? (
          <span style={{ fontSize: '12.5px', color: redesignText.muted }}>
            Aucune fiche ajoutée. Celles du PNJ, du PJ et du lieu partent avec la scène ; le
            serveur peut joindre un figurant.
          </span>
        ) : null}
        {!readOnly ? (
          <button
            type="button"
            disabled={checked.length === 0}
            title={
              checked.length === 0
                ? 'Aucune fiche cochée dans la colonne Contexte GDD qui manque à la scène.'
                : undefined
            }
            onClick={() =>
              updateScene((current) => ({
                ...current,
                linkedEntries: [...current.linkedEntries, ...checked],
              }))
            }
            style={{
              ...buttonStyle,
              cursor: checked.length === 0 ? 'default' : 'pointer',
              opacity: checked.length === 0 ? 0.55 : 1,
            }}
          >
            Reprendre les fiches cochées{checked.length > 0 ? ` (${checked.length})` : ''}
          </button>
        ) : null}
      </div>
    </div>
  )
}
