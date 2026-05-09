import { describe, expect, it } from 'vitest'

import { DEFAULT_EFFORT_POOL, evaluateChoiceEffortAccess } from './effortPreview'

describe('effortPreview', () => {
  it('autorise un choix coûtant 2 PE avec le pool preview par défaut', () => {
    const result = evaluateChoiceEffortAccess({ effortCost: 2 }, {})

    expect(DEFAULT_EFFORT_POOL).toBe(10)
    expect(result.accessible).toBe(true)
    expect(result.availablePool).toBe(10)
    expect(result.disabledReason).toBeUndefined()
  })

  it('grise un choix quand le coût dépasse le pool simulé', () => {
    const result = evaluateChoiceEffortAccess({ effortCost: 12 }, { availablePool: 10 })

    expect(result.accessible).toBe(false)
    expect(result.disabledReason).toBe('Effort insuffisant : 10 PE disponibles, coût 12 PE.')
  })

  it('recalcule immédiatement quand le pool preview change', () => {
    expect(evaluateChoiceEffortAccess({ effortCost: 2 }, { availablePool: 3 }).accessible).toBe(true)
    expect(evaluateChoiceEffortAccess({ effortCost: 2 }, { availablePool: 1 }).accessible).toBe(false)
  })
})
