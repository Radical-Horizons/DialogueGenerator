/**
 * Journal IndexedDB par document pour le Graph Editor (ADR-006).
 * Structure : documentId → { snapshot, pending }.
 * - snapshot : dernier état reconnu par le serveur (après ack).
 * - pending : dernier état en attente d'ack (pour replay après reconnexion).
 */

const DB_NAME = 'DialogueGenerator_GraphJournal'
const STORE_NAME = 'documents'
const DB_VERSION = 1

export interface GraphSnapshot {
  nodes: unknown[]
  edges: unknown[]
  metadata: { title: string; node_count: number; edge_count: number; filename?: string }
  ackSeq: number
}

export interface GraphPending {
  nodes: unknown[]
  edges: unknown[]
  metadata: { title: string; node_count: number; edge_count: number; filename?: string }
  seq: number
}

export interface DocumentJournal {
  snapshot?: GraphSnapshot | null
  pending?: GraphPending | null
}

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB not available'))
  }
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error)
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'documentId' })
      }
    }
  })
}

function getStore(db: IDBDatabase, mode: IDBTransactionMode = 'readwrite'): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
}

/** Écrit ou met à jour le snapshot (état acké) pour un document. */
export async function writeSnapshot(
  documentId: string,
  snapshot: GraphSnapshot
): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const store = getStore(db)
    const getReq = store.get(documentId)
    getReq.onsuccess = () => {
      const row: DocumentJournal & { documentId: string } = getReq.result ?? { documentId }
      row.documentId = documentId
      row.snapshot = snapshot
      if (!row.pending) row.pending = null
      store.put(row)
      db.close()
      resolve()
    }
    getReq.onerror = () => {
      db.close()
      reject(getReq.error)
    }
  })
}

/** Met à jour le pending (dernier état en attente) pour un document. */
export async function setPending(
  documentId: string,
  pending: GraphPending
): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const store = getStore(db)
    const getReq = store.get(documentId)
    getReq.onsuccess = () => {
      const row: DocumentJournal & { documentId: string } = getReq.result ?? { documentId }
      row.documentId = documentId
      row.pending = pending
      if (!row.snapshot) row.snapshot = null
      store.put(row)
      db.close()
      resolve()
    }
    getReq.onerror = () => {
      db.close()
      reject(getReq.error)
    }
  })
}

/** Lit le journal d'un document (snapshot + pending). */
export async function readDocument(documentId: string): Promise<DocumentJournal> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const store = getStore(db, 'readonly')
    const req = store.get(documentId)
    req.onsuccess = () => {
      db.close()
      const row = req.result
      if (!row) {
        resolve({ snapshot: null, pending: null })
        return
      }
      resolve({
        snapshot: row.snapshot ?? null,
        pending: row.pending ?? null,
      })
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}

/** Supprime le pending pour les seq ackés (après ack, on met à jour le snapshot et on clear le pending). */
export async function clearPending(documentId: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const store = getStore(db)
    const getReq = store.get(documentId)
    getReq.onsuccess = () => {
      const row: DocumentJournal & { documentId: string } = getReq.result
      if (!row) {
        db.close()
        resolve()
        return
      }
      row.pending = null
      store.put(row)
      db.close()
      resolve()
    }
    getReq.onerror = () => {
      db.close()
      reject(getReq.error)
    }
  })
}

/** Supprime tout le journal d'un document (optionnel, pour tests ou reset). */
export async function deleteDocument(documentId: string): Promise<void> {
  const db = await openDb()
  return new Promise((resolve, reject) => {
    const store = getStore(db)
    const req = store.delete(documentId)
    req.onsuccess = () => {
      db.close()
      resolve()
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}
