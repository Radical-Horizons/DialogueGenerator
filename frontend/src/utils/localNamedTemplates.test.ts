/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  deleteLocalAuthorTemplate,
  listLocalAuthorTemplates,
  upsertLocalAuthorTemplate,
} from './localNamedTemplates'

describe('localNamedTemplates', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('upsertLocalAuthorTemplate crée puis remplace par nom insensible à la casse', () => {
    const a = upsertLocalAuthorTemplate('Style A', 'contenu un')
    expect(a.name).toBe('Style A')
    expect(listLocalAuthorTemplates()).toHaveLength(1)

    const b = upsertLocalAuthorTemplate('style a', 'contenu deux')
    expect(b.body).toBe('contenu deux')
    expect(listLocalAuthorTemplates()).toHaveLength(1)
  })

  it('deleteLocalAuthorTemplate supprime par id', () => {
    const t = upsertLocalAuthorTemplate('X', 'y')
    deleteLocalAuthorTemplate(t.id)
    expect(listLocalAuthorTemplates()).toHaveLength(0)
  })

  it('rejette un nom vide', () => {
    expect(() => upsertLocalAuthorTemplate('  ', 'z')).toThrow()
  })
})
