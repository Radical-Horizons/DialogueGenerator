/**
 * Premier emplacement à écrire d'une scène sans réplique (board `Fiche`). Son geste crée
 * la réplique d'ouverture vide et l'ouvre dans l'éditeur de nœud : on n'écrit pas ici.
 */
import { useSceneSheet } from '../../hooks/useSceneSheet'
import { useSceneReadOnly } from '../../hooks/useSceneReadOnly'
import { useGraphStore } from '../../store/graphStore'
import { useGraphViewStore } from '../../store/graphViewStore'
import { useUiLayoutStore } from '../../store/uiLayoutStore'
import { isDialogueGraphNode } from '../../utils/sceneDramatis'
import {
  redesignAccent,
  redesignFont,
  redesignHairline,
  redesignNodeBorder,
  redesignRadius,
  redesignSpacing,
  redesignSurface,
  redesignText,
} from '../../theme/redesignTokens'
import { monoLabel, rowStyle } from './sceneStyles'

const OPENING_NODE_ID = 'START'

/** « d’Uresaïr », « de Vethraak », « du PJ » quand il n'est pas précisé. */
function ofPlayer(name: string | undefined): string {
  if (!name) return 'du PJ'
  return /^[aàâeéèêiîoôuûh]/i.test(name) ? `d’${name}` : `de ${name}`
}

export function SceneFirstSlot() {
  const documentId = useGraphStore((state) => state.documentId)
  const isLoading = useGraphStore((state) => state.isLoading)
  const empty = useGraphStore((state) => !state.nodes.some(isDialogueGraphNode))
  if (!documentId || isLoading || !empty) return null
  return <SceneFirstSlotCard />
}

function SceneFirstSlotCard() {
  const { sheet } = useSceneSheet()
  const readOnly = useSceneReadOnly()
  const npc = sheet.npcs[0]?.name ?? ''

  const write = () => {
    const store = useGraphStore.getState()
    store.ensureSceneStored()
    store.addNode({
      id: OPENING_NODE_ID,
      type: 'dialogueNode',
      position: { x: 0, y: 0 },
      data: { id: OPENING_NODE_ID, speaker: npc, line: '', choices: [] },
    })
    useUiLayoutStore.getState().setInspectorTab('node')
    // Avant la sélection : l'inspecteur lit la demande au changement de nœud.
    useGraphViewStore.getState().requestNodeEdit(OPENING_NODE_ID)
    store.setSelectedNode(OPENING_NODE_ID)
    useGraphViewStore.getState().focusNode(OPENING_NODE_ID)
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 5,
        overflowY: 'auto',
        padding: `${redesignSpacing.xl}px ${redesignSpacing.lg}px`,
        background: redesignSurface.canvas,
      }}
    >
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <section
          aria-label="Première réplique à écrire"
          style={{
            border: `1px dashed ${redesignNodeBorder.strong}`,
            borderRadius: redesignRadius.node,
            padding: '14px 20px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: redesignSpacing.sm,
          }}
        >
          <div style={{ ...rowStyle, ...monoLabel, whiteSpace: 'normal' }}>
            <span aria-hidden="true" style={{ width: 20, height: 1, background: redesignHairline.strong }} />
            Première réplique — à écrire
          </div>
          <div style={rowStyle}>
            <span style={{ ...monoLabel, color: redesignText.secondary }}>
              {npc || 'PNJ à préciser'}
            </span>
            <span style={monoLabel}>À écrire</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: '12px', color: redesignText.muted }}>Ouverture</span>
          </div>
          <p
            style={{
              margin: '0 0 5px',
              fontFamily: redesignFont.serif,
              fontSize: '19px',
              lineHeight: 1.6,
              color: redesignText.muted,
            }}
          >
            {npc ? `Ce que ${npc} dit en premier.` : 'Ce qui se dit en premier.'}
          </p>
          {readOnly ? (
            <span style={{ fontSize: '12.5px', color: redesignText.secondary }}>
              Lecture seule : la scène ne peut pas être écrite ici.
            </span>
          ) : (
            <button
              type="button"
              onClick={write}
              style={{
                alignSelf: 'flex-start',
                height: 36,
                padding: '0 14px',
                border: 'none',
                borderRadius: redesignRadius.control,
                background: redesignAccent.fill,
                color: '#ffffff',
                fontFamily: 'inherit',
                fontSize: '13.5px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Écrire la première réplique
            </button>
          )}
        </section>
        <p
          style={{
            margin: '20px 0 0',
            padding: '0 20px',
            fontSize: '13px',
            lineHeight: 1.55,
            color: redesignText.muted,
          }}
        >
          Les répliques s’afficheront ici, chacune suivie des réponses {ofPlayer(sheet.pc?.name)}.
        </p>
      </div>
    </div>
  )
}
