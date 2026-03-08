/**
 * Tests E2E pour la validation de cycles dans les graphes (Story 0.6)
 * 
 * Scénarios testés :
 * - AC#1 : Warning cycle affiché avec highlight orange des nœuds
 * - AC#2 : Plusieurs cycles listés, cliquables pour zoomer
 * - AC#3 : Marquage cycle intentionnel (checkbox)
 * - AC#4 : Graphe sans cycles ne montre pas de warning cycle
 */
import { test, expect, type Page } from '@playwright/test'
import { backendBaseUrl } from './testConfig'

test.describe('Graph Cycle Validation (Story 0.6)', () => {
  test.beforeEach(async ({ page }) => {
    // Naviguer vers l'application
    await page.goto('http://localhost:3000')
    
    // Attendre que l'application soit chargée
    await page.waitForSelector('h2:has-text("Génération de Dialogues")', { timeout: 10000 })
    
    // Naviguer vers l'éditeur de graphe (onglet "📊 Éditeur de Graphe")
    const graphTab = page.locator('button').filter({ hasText: /Éditeur de Graphe|📊/ })
    if (await graphTab.count() > 0) {
      await graphTab.click()
    }
    
    // Attendre que l'éditeur de graphe soit chargé
    await page.waitForSelector('.react-flow', { timeout: 5000 }).catch(() => {
      // Si le sélecteur n'existe pas, continuer quand même
    })
  })

  /**
   * Helper: Créer un graphe avec un cycle simple (A → B → C → A)
   */
  const createGraphWithCycle = () => {
    return {
      nodes: [
        { id: 'START', type: 'startNode', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'A', type: 'dialogueNode', position: { x: 100, y: 100 }, data: { label: 'Node A', line: 'Hello' } },
        { id: 'B', type: 'dialogueNode', position: { x: 200, y: 100 }, data: { label: 'Node B', line: 'World' } },
        { id: 'C', type: 'dialogueNode', position: { x: 300, y: 100 }, data: { label: 'Node C', line: 'Test' } },
      ],
      edges: [
        { id: 'e0', source: 'START', target: 'A' },
        { id: 'e1', source: 'A', target: 'B' },
        { id: 'e2', source: 'B', target: 'C' },
        { id: 'e3', source: 'C', target: 'A' }, // Cycle: A → B → C → A
      ],
    }
  }

  /**
   * Helper: Créer un graphe avec plusieurs cycles
   */
  const createGraphWithMultipleCycles = () => {
    return {
      nodes: [
        { id: 'START', type: 'startNode', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'A', type: 'dialogueNode', position: { x: 100, y: 100 }, data: { label: 'Node A', line: 'Hello' } },
        { id: 'B', type: 'dialogueNode', position: { x: 200, y: 100 }, data: { label: 'Node B', line: 'World' } },
        { id: 'C', type: 'dialogueNode', position: { x: 100, y: 200 }, data: { label: 'Node C', line: 'Test1' } },
        { id: 'D', type: 'dialogueNode', position: { x: 200, y: 200 }, data: { label: 'Node D', line: 'Test2' } },
      ],
      edges: [
        { id: 'e0', source: 'START', target: 'A' },
        { id: 'e1', source: 'A', target: 'B' },
        { id: 'e2', source: 'B', target: 'A' }, // Cycle 1: A → B → A
        { id: 'e3', source: 'C', target: 'D' },
        { id: 'e4', source: 'D', target: 'C' }, // Cycle 2: C → D → C
      ],
    }
  }

  /**
   * Helper: Créer un graphe sans cycles
   */
  const createGraphWithoutCycles = () => {
    return {
      nodes: [
        { id: 'START', type: 'startNode', position: { x: 0, y: 0 }, data: { label: 'Start' } },
        { id: 'A', type: 'dialogueNode', position: { x: 100, y: 100 }, data: { label: 'Node A', line: 'Hello' } },
        { id: 'B', type: 'dialogueNode', position: { x: 200, y: 100 }, data: { label: 'Node B', line: 'World' } },
        { id: 'C', type: 'dialogueNode', position: { x: 300, y: 100 }, data: { label: 'Node C', line: 'Test' } },
      ],
      edges: [
        { id: 'e0', source: 'START', target: 'A' },
        { id: 'e1', source: 'A', target: 'B' },
        { id: 'e2', source: 'B', target: 'C' },
        // Pas de cycle
      ],
    }
  }

  /**
   * Helper: Valider un graphe via l'API
   */
  const validateGraphAPI = async (page: Page, graph: any) => {
    const response = await page.evaluate(async (graphData) => {
      const res = await fetch(`${backendBaseUrl}/api/v1/unity-dialogues/graph/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: graphData.nodes,
          edges: graphData.edges,
        }),
      })
      return res.json()
    }, graph)
    return response
  }

  test('AC#1: API retourne cycle avec chemin complet et cycle_nodes', async ({ page }) => {
    // Créer un graphe avec cycle
    const graph = createGraphWithCycle()
    
    // Valider via l'API
    const result = await validateGraphAPI(page, graph)
    
    // Vérifier que la validation a détecté un cycle
    expect(result.warnings).toBeDefined()
    const cycleWarnings = result.warnings.filter((w: any) => w.type === 'cycle_detected')
    expect(cycleWarnings.length).toBeGreaterThan(0)
    
    const cycleWarning = cycleWarnings[0]
    // Vérifier que le chemin complet est présent
    expect(cycleWarning.cycle_path).toBeDefined()
    expect(cycleWarning.cycle_path).toContain('A')
    expect(cycleWarning.cycle_path).toContain('B')
    expect(cycleWarning.cycle_path).toContain('C')
    expect(cycleWarning.cycle_path).toContain('→')
    
    // Vérifier que cycle_nodes est présent
    expect(cycleWarning.cycle_nodes).toBeDefined()
    expect(Array.isArray(cycleWarning.cycle_nodes)).toBe(true)
    expect(cycleWarning.cycle_nodes.length).toBeGreaterThanOrEqual(3)
    expect(cycleWarning.cycle_nodes).toContain('A')
    expect(cycleWarning.cycle_nodes).toContain('B')
    expect(cycleWarning.cycle_nodes).toContain('C')
    
    // Vérifier que cycle_id est présent
    expect(cycleWarning.cycle_id).toBeDefined()
    expect(cycleWarning.cycle_id).toMatch(/^cycle_/)
  })

  test('AC#2: API retourne plusieurs cycles distincts avec leurs chemins', async ({ page }) => {
    // Créer un graphe avec plusieurs cycles
    const graph = createGraphWithMultipleCycles()
    
    // Valider via l'API
    const result = await validateGraphAPI(page, graph)
    
    // Vérifier que plusieurs cycles sont détectés
    const cycleWarnings = result.warnings.filter((w: any) => w.type === 'cycle_detected')
    expect(cycleWarnings.length).toBeGreaterThanOrEqual(2)
    
    // Vérifier que chaque cycle a un ID unique
    const cycleIds = cycleWarnings.map((w: any) => w.cycle_id)
    const uniqueCycleIds = new Set(cycleIds)
    expect(uniqueCycleIds.size).toBeGreaterThanOrEqual(2)
    
    // Vérifier que chaque cycle a un chemin
    cycleWarnings.forEach((warning: any) => {
      expect(warning.cycle_path).toBeDefined()
      expect(warning.cycle_nodes).toBeDefined()
      expect(Array.isArray(warning.cycle_nodes)).toBe(true)
      expect(warning.cycle_nodes.length).toBeGreaterThan(0)
    })
  })

  test('AC#4: API ne retourne pas de warning cycle pour graphe sans cycles', async ({ page }) => {
    // Créer un graphe sans cycles
    const graph = createGraphWithoutCycles()
    
    // Valider via l'API
    const result = await validateGraphAPI(page, graph)
    
    // Vérifier qu'aucun warning de cycle n'est présent
    const cycleWarnings = result.warnings.filter((w: any) => w.type === 'cycle_detected')
    expect(cycleWarnings.length).toBe(0)
  })

  test('AC#1: Cycle ID est stable pour le même ensemble de nœuds', async ({ page }) => {
    // Créer un graphe avec cycle
    const graph = createGraphWithCycle()
    
    // Valider deux fois
    const result1 = await validateGraphAPI(page, graph)
    const result2 = await validateGraphAPI(page, graph)
    
    // Vérifier que les cycle_id sont identiques
    const cycle1 = result1.warnings.find((w: any) => w.type === 'cycle_detected')
    const cycle2 = result2.warnings.find((w: any) => w.type === 'cycle_detected')
    
    expect(cycle1).toBeDefined()
    expect(cycle2).toBeDefined()
    expect(cycle1.cycle_id).toBe(cycle2.cycle_id)
  })

  test('AC#3: Cycle ID utilise SHA256 (16 caractères)', async ({ page }) => {
    // Créer un graphe avec cycle
    const graph = createGraphWithCycle()
    
    // Valider via l'API
    const result = await validateGraphAPI(page, graph)
    
    const cycleWarning = result.warnings.find((w: any) => w.type === 'cycle_detected')
    expect(cycleWarning).toBeDefined()
    expect(cycleWarning.cycle_id).toMatch(/^cycle_[a-f0-9]{16}$/)
  })

  // Note: Les tests suivants nécessitent une intégration complète avec l'UI
  // Pour l'instant, on teste l'API. Les tests UI complets nécessiteraient
  // de charger un dialogue Unity existant ou de créer manuellement les nœuds.
  
  test.skip('AC#1 (UI): Warning cycle affiché dans le panneau d\'erreurs', async ({ page }) => {
    // TODO: Implémenter quand on aura un moyen de charger un graphe dans l'UI
    // Ce test nécessite:
    // 1. Créer ou charger un dialogue Unity avec cycle
    // 2. Lancer la validation depuis l'UI
    // 3. Vérifier que le warning s'affiche dans le panneau d'erreurs
  })

  test.skip('AC#1 (UI): Nœuds du cycle surlignés orange', async ({ page }) => {
    // TODO: Implémenter quand on aura un moyen de charger un graphe dans l'UI
    // Ce test nécessite:
    // 1. Créer ou charger un dialogue Unity avec cycle
    // 2. Lancer la validation depuis l'UI
    // 3. Vérifier que les nœuds A, B, C ont un border orange
  })

  test.skip('AC#2 (UI): Clic sur cycle zoome vers les nœuds', async ({ page }) => {
    // TODO: Implémenter quand on aura un moyen de charger un graphe dans l'UI
    // Ce test nécessite:
    // 1. Créer ou charger un dialogue Unity avec cycle
    // 2. Lancer la validation depuis l'UI
    // 3. Cliquer sur le warning de cycle
    // 4. Vérifier que le zoom s'effectue vers les nœuds du cycle
  })

  test.skip('AC#3 (UI): Checkbox marquer cycle intentionnel fonctionne', async ({ page }) => {
    // TODO: Implémenter quand on aura un moyen de charger un graphe dans l'UI
    // Ce test nécessite:
    // 1. Créer ou charger un dialogue Unity avec cycle
    // 2. Lancer la validation depuis l'UI
    // 3. Cocher la checkbox "Marquer comme intentionnel"
    // 4. Vérifier que le warning disparaît
    // 5. Décocher la checkbox
    // 6. Vérifier que le warning réapparaît
  })
})
