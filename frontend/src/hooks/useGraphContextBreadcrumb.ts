/**
 * Segments fil d'Ariane graphe : contexte GDD › dialogue › nœud.
 */
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useContextStore } from '../store/contextStore'
import { useGraphStore } from '../store/graphStore'

export interface GraphContextBreadcrumbSegments {
  /** Premier personnage sélectionné (+N si plusieurs). */
  contextLabel: string | null
  /** Titre du dialogue ouvert. */
  dialogueLabel: string | null
  /** ID / titre du nœud sélectionné. */
  nodeLabel: string | null
}

/**
 * Construit les segments du fil d'Ariane pour l'éditeur de graphe.
 */
export function useGraphContextBreadcrumb(): GraphContextBreadcrumbSegments {
  const characters = useContextStore(
    useShallow((s) => [...s.selections.characters_full, ...s.selections.characters_excerpt])
  )
  const dialogueMetadata = useGraphStore((s) => s.dialogueMetadata)
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const selectedNode = useGraphStore(
    useShallow((s) => s.nodes.find((n) => n.id === s.selectedNodeId) ?? null)
  )

  const contextLabel = useMemo(() => {
    if (characters.length === 0) return null
    if (characters.length === 1) return characters[0]
    return `${characters[0]} (+${characters.length - 1})`
  }, [characters])

  const dialogueLabel = useMemo(() => {
    const title = dialogueMetadata.title?.trim()
    if (title && title !== 'Nouveau Dialogue') return title
    const filename = dialogueMetadata.filename?.replace(/\.json$/i, '')
    return filename || null
  }, [dialogueMetadata.filename, dialogueMetadata.title])

  const nodeLabel = useMemo(() => {
    if (!selectedNodeId) return null
    const title = typeof selectedNode?.data?.title === 'string' ? selectedNode.data.title.trim() : ''
    if (title) return title
    return selectedNodeId
  }, [selectedNode, selectedNodeId])

  return { contextLabel, dialogueLabel, nodeLabel }
}
