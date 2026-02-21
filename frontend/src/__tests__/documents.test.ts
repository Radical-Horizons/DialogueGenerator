/**
 * Tests API documents (getDocument, getLayout, putDocument, putLayout).
 * Story 16.4 Task 1.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import apiClient from '../api/client'
import * as documentsAPI from '../api/documents'

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
  },
}))

describe('documents API', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.put).mockReset()
  })

  describe('getDocument', () => {
    it('returns document, schemaVersion, revision', async () => {
      const payload = {
        document: { schemaVersion: '1.1.0', nodes: [{ id: 'START', line: 'Hi' }] },
        schemaVersion: '1.1.0',
        revision: 1,
      }
      vi.mocked(apiClient.get).mockResolvedValue({ data: payload })
      const result = await documentsAPI.getDocument('my-doc')
      expect(result).toEqual(payload)
      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/documents/my-doc')
    })
  })

  describe('getLayout', () => {
    it('returns layout and revision', async () => {
      const payload = { layout: { nodes: { START: { x: 10, y: 20 } } }, revision: 1 }
      vi.mocked(apiClient.get).mockResolvedValue({ data: payload })
      const result = await documentsAPI.getLayout('my-doc')
      expect(result).toEqual(payload)
      expect(apiClient.get).toHaveBeenCalledWith('/api/v1/documents/my-doc/layout')
    })
  })

  describe('putDocument', () => {
    it('sends document and revision', async () => {
      const body = { document: { schemaVersion: '1.1.0', nodes: [] }, revision: 1 }
      vi.mocked(apiClient.put).mockResolvedValue({ data: { revision: 2 } })
      const result = await documentsAPI.putDocument('my-doc', body)
      expect(result.revision).toBe(2)
      expect(apiClient.put).toHaveBeenCalledWith('/api/v1/documents/my-doc', body)
    })
  })

  describe('putLayout', () => {
    it('sends layout and revision', async () => {
      const body = { layout: { nodes: {} }, revision: 1 }
      vi.mocked(apiClient.put).mockResolvedValue({ data: { revision: 2 } })
      const result = await documentsAPI.putLayout('my-doc', body)
      expect(result.revision).toBe(2)
      expect(apiClient.put).toHaveBeenCalledWith('/api/v1/documents/my-doc/layout', body)
    })
  })
})
