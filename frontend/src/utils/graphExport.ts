/**
 * Utilitaires pour exporter le graphe en PNG ou SVG.
 */

/**
 * Exporte le graphe visible en PNG.
 * Utilise html-to-image pour capturer le canvas ReactFlow.
 */
export async function exportGraphToPNG(
  _reactFlowInstance: unknown,
  filename: string = 'graph',
  quality: number = 1.0
): Promise<void> {
  try {
    // Import dynamique pour éviter de charger la lib si non utilisée
    const htmlToImage = await import('html-to-image')
    
    // Trouver l'élément ReactFlow dans le DOM
    const reactFlowElement = document.querySelector('.react-flow') as HTMLElement
    if (!reactFlowElement) {
      throw new Error('Élément ReactFlow introuvable dans le DOM')
    }
    
    // Options pour l'export
    const options = {
      quality,
      pixelRatio: 2, // Pour une meilleure qualité
      backgroundColor: getComputedStyle(reactFlowElement).backgroundColor || '#1a1a1a',
      filter: (node: HTMLElement) => {
        // Exclure les contrôles et la minimap
        return !node.classList.contains('react-flow__controls') &&
               !node.classList.contains('react-flow__minimap')
      },
    }
    
    // Générer l'image PNG
    const dataUrl = await htmlToImage.toPng(reactFlowElement, options)
    
    // Télécharger
    const link = document.createElement('a')
    link.download = `${filename}.png`
    link.href = dataUrl
    link.click()
  } catch (error) {
    console.error('Erreur lors de l\'export PNG:', error)
    throw error
  }
}

/**
 * Exporte le graphe visible en SVG.
 */
export async function exportGraphToSVG(
  _reactFlowInstance: unknown,
  filename: string = 'graph'
): Promise<void> {
  try {
    // Import dynamique
    const htmlToImage = await import('html-to-image')
    
    // Trouver l'élément ReactFlow
    const reactFlowElement = document.querySelector('.react-flow') as HTMLElement
    if (!reactFlowElement) {
      throw new Error('Élément ReactFlow introuvable dans le DOM')
    }
    
    // Options pour l'export SVG
    const options = {
      backgroundColor: getComputedStyle(reactFlowElement).backgroundColor || '#1a1a1a',
      filter: (node: HTMLElement) => {
        // Exclure les contrôles et la minimap
        return !node.classList.contains('react-flow__controls') &&
               !node.classList.contains('react-flow__minimap')
      },
    }
    
    // Générer l'image SVG
    const dataUrl = await htmlToImage.toSvg(reactFlowElement, options)
    
    // Télécharger
    const link = document.createElement('a')
    link.download = `${filename}.svg`
    link.href = dataUrl
    link.click()
  } catch (error) {
    console.error('Erreur lors de l\'export SVG:', error)
    throw error
  }
}

/**
 * Exporte tout le graphe (pas seulement la vue visible).
 * Ajuste le viewport pour inclure tous les nœuds avant l'export.
 */
export async function exportFullGraphToPNG(
  _reactFlowInstance: unknown,
  filename: string = 'graph-full',
  quality: number = 1.0
): Promise<void> {
  try {
    // Sauvegarder le viewport actuel
    const currentViewport = reactFlowInstance.getViewport()
    
    // Ajuster le viewport pour inclure tous les nœuds
    reactFlowInstance.fitView({ padding: 0.1, duration: 0 })
    
    // Attendre que le viewport soit ajusté
    await new Promise((resolve) => setTimeout(resolve, 200))
    
    // Exporter
    await exportGraphToPNG(reactFlowInstance, filename, quality)
    
    // Restaurer le viewport original
    reactFlowInstance.setViewport(currentViewport)
  } catch (error) {
    console.error('Erreur lors de l\'export du graphe complet:', error)
    throw error
  }
}
