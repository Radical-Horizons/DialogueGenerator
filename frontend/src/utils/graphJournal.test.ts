/**
 * Tests pour graphJournal (ADR-006) — IndexedDB non disponible (Vitest/Node).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  readDocument,
  setPending,
  writeSnapshot,
  clearPending,
  deleteDocument,
} from './graphJournal'

describe('graphJournal', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', undefined)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('readDocument rejects when IndexedDB is not available', async () => {
    await expect(readDocument('doc1')).rejects.toThrow('IndexedDB not available')
  })

  it('setPending rejects when IndexedDB is not available', async () => {
    await expect(
      setPending('doc1', {
        nodes: [],
        edges: [],
        metadata: { title: 'T', node_count: 0, edge_count: 0 },
        seq: 1,
      })
    ).rejects.toThrow('IndexedDB not available')
  })

  it('writeSnapshot rejects when IndexedDB is not available', async () => {
    await expect(
      writeSnapshot('doc1', {
        nodes: [],
        edges: [],
        metadata: { title: 'T', node_count: 0, edge_count: 0 },
        ackSeq: 1,
      })
    ).rejects.toThrow('IndexedDB not available')
  })

  it('clearPending rejects when IndexedDB is not available', async () => {
    await expect(clearPending('doc1')).rejects.toThrow('IndexedDB not available')
  })

  it('deleteDocument rejects when IndexedDB is not available', async () => {
    await expect(deleteDocument('doc1')).rejects.toThrow('IndexedDB not available')
  })
})
