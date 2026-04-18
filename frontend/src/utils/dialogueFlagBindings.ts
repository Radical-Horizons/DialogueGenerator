/**
 * Parse / applique les liaisons ``dialogueFlags`` du document canonique.
 */
import type { DialogueFlagBinding, DialogueFlagSemanticType } from '../types/dialogueFlags'

function isSemanticType(v: string): v is DialogueFlagSemanticType {
  return v === 'bool' || v === 'compteur' || v === 'enum'
}

/** Extrait les liaisons depuis la clé racine ``dialogueFlags`` du document. */
export function parseBindingsFromDocument(
  doc: Record<string, unknown> | null
): DialogueFlagBinding[] {
  if (!doc) return []
  const raw = doc.dialogueFlags
  if (!Array.isArray(raw)) return []
  const out: DialogueFlagBinding[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const flagId = String(rec.flagId ?? rec.flag_id ?? '').trim()
    const tRaw = String(rec.type ?? '').toLowerCase()
    const iv =
      rec.initialValue !== undefined ? rec.initialValue : rec.initial_value
    if (!flagId || !isSemanticType(tRaw)) continue
    out.push({
      flagId,
      type: tRaw,
      initialValue: iv as boolean | number | string,
    })
  }
  return out
}

/** Écrit les liaisons sur le document (mutation). */
export function applyBindingsToDocument(
  doc: Record<string, unknown>,
  bindings: DialogueFlagBinding[]
): void {
  if (bindings.length === 0) {
    delete doc.dialogueFlags
    return
  }
  doc.dialogueFlags = bindings.map((b) => ({
    flagId: b.flagId,
    type: b.type,
    initialValue: b.initialValue,
  }))
}
