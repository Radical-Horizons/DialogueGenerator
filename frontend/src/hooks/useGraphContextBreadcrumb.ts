/**
 * Segments fil d'Ariane graphe : PNJ de la scène › dialogue › nœud.
 */
import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useGraphStore } from '../store/graphStore'
import { useSceneSheet } from './useSceneSheet'

export interface GraphContextBreadcrumbSegments {
  /** Premier PNJ de la fiche de scène (+N si plusieurs). */
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
  const { sheet } = useSceneSheet()
  const dialogueMetadata = useGraphStore((s) => s.dialogueMetadata)
  const selectedNodeId = useGraphStore((s) => s.selectedNodeId)
  const selectedNode = useGraphStore(
    useShallow((s) => s.nodes.find((n) => n.id === s.selectedNodeId) ?? null)
  )

  const contextLabel = useMemo(() => {
    const [first, ...others] = sheet.npcs
    if (!first) return null
    return others.length > 0 ? `${first.name} (+${others.length})` : first.name
  }, [sheet])

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
