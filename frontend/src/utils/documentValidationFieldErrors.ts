/**
 * Mappe les erreurs de validation Unity (API) vers des champs éditables du formulaire.
 */
import type { Node } from 'reactflow'
import type { SchemaValidationIssue } from '../types/graph'
import type { APIError } from '../types/errors'
import { buildUnityNodeIndexToIdMap } from './unityNodeIndexMap'

export interface DocumentFieldError {
  nodeId: string
  /** Chemin relatif au nœud : speaker, line, choices.0.test, consequences.flag, … */
  field: string
  message: string
  code?: string
}

export interface ValidationReportRow {
  code?: string
  message: string
  path?: string
  node_id?: string
}

const PATH_IN_BRACKETS = /\[(nodes\.[^\]]+)\]/
const PATH_IN_PARENS = /\((nodes\.[^\s)]+)\)/
const CHAMP_FIELD = /champ '([^']+)'/
const LEGACY_TEST_VALUE = /'([^']+)'\s+does not match/

/** Message lisible pour un champ test (repli si l'API renvoie encore la regex jsonschema). */
export function humanizeTestFieldMessage(field: string, message: string): string {
  if (field !== 'test' && !field.endsWith('.test')) return message
  if (!message.includes('does not match')) return message

  const valueMatch = LEGACY_TEST_VALUE.exec(message)
  const value = valueMatch?.[1]?.trim() ?? ''
  const base =
    "Format attendu : Attribut+Compétence:DD (ex. Raison+Rhétorique:8). L'attribut et la compétence ne doivent contenir ni espace, ni « : », ni « + »."

  if (!value) return base

  const colonIdx = value.indexOf(':')
  const head = colonIdx >= 0 ? value.slice(0, colonIdx) : value
  const plusIdx = head.indexOf('+')
  const attribute = plusIdx >= 0 ? head.slice(0, plusIdx) : head
  const skill = plusIdx >= 0 ? head.slice(plusIdx + 1) : ''
  const spaced = [attribute, skill].find((part) => part.includes(' '))

  if (spaced) {
    return `${base} Valeur reçue : « ${value} » — « ${spaced} » contient un espace ; utilisez le nom exact de la compétence (sans espace), tel que dans le GDD.`
  }

  return `${base} Valeur reçue : « ${value} ».`
}

/** Extrait un champ formulaire depuis un message backend sans path structuré. */
export function inferFieldFromMessage(message: string): string | null {
  const champ = CHAMP_FIELD.exec(message)
  if (!champ?.[1]) return null
  const raw = champ[1]
  if (raw === 'choices') return 'choices'
  if (/^choices\.\d+\./.test(raw)) return raw
  if (['speaker', 'line', 'title', 'test', 'nextNode', 'id'].includes(raw)) return raw
  if (raw.startsWith('consequences')) return raw
  return null
}

/** Extrait le chemin JSON depuis un message d'erreur backend. */
export function extractJsonPathFromMessage(message: string): string | undefined {
  const bracket = PATH_IN_BRACKETS.exec(message)
  if (bracket?.[1]) return bracket[1]
  const paren = PATH_IN_PARENS.exec(message)
  if (paren?.[1]) return paren[1]
  return undefined
}

/** Résout l'id nœud depuis un chemin ``nodes.N…`` et la liste de nœuds Unity ou le graphe. */
export function resolveNodeIdFromUnityPath(
  path: string | undefined,
  unityNodes: Array<{ id?: string }>,
  graphNodes?: Node[],
): string | undefined {
  if (!path?.startsWith('nodes')) return undefined
  const indexMatch = /^nodes\.(\d+)/.exec(path)
  if (!indexMatch) return undefined
  const index = parseInt(indexMatch[1], 10)
  const unityNode = unityNodes[index]
  if (unityNode?.id && typeof unityNode.id === 'string') {
    return unityNode.id
  }
  if (graphNodes) {
    return buildUnityNodeIndexToIdMap(graphNodes).get(index)
  }
  return undefined
}

/**
 * Convertit un chemin JSON Unity en chemin de champ formulaire (relatif au nœud).
 * Ex. nodes.0.choices.1.test → choices.1.test
 */
export function unityPathToFormField(path: string): string | null {
  const stripped = path.replace(/^nodes\.\d+\.?/, '')
  if (!stripped) return null
  if (/^(speaker|line|title|id|test|nextNode)$/.test(stripped)) {
    return stripped
  }
  if (/^consequences(\.|$)/.test(stripped)) {
    return stripped.startsWith('consequences.') ? stripped : 'consequences'
  }
  if (stripped === 'choices') {
    return 'choices'
  }
  if (/^choices\.\d+(\.|$)/.test(stripped)) {
    return stripped
  }
  return stripped
}

/** Indique si l'erreur peut être affichée sous un champ éditable connu. */
export function isEditableFormField(field: string): boolean {
  if (['speaker', 'line', 'title', 'test', 'nextNode', 'id'].includes(field)) {
    return true
  }
  if (/^consequences(\.|$)/.test(field)) return true
  if (field === 'choices') return true
  if (/^choices\.\d+\.(text|test|condition|targetNode|choiceId)$/.test(field)) {
    return true
  }
  return false
}

function rowToFieldError(
  row: ValidationReportRow,
  unityNodes: Array<{ id?: string }>,
  graphNodes?: Node[],
): DocumentFieldError | null {
  const path = row.path?.trim() || extractJsonPathFromMessage(row.message)
  let field = path ? unityPathToFormField(path) : null
  if (!field) {
    field = inferFieldFromMessage(row.message)
  }
  if (!field || !isEditableFormField(field)) return null
  const nodeId =
    row.node_id?.trim() ||
    resolveNodeIdFromUnityPath(path, unityNodes, graphNodes) ||
    (unityNodes.length === 1 && typeof unityNodes[0]?.id === 'string'
      ? unityNodes[0].id
      : undefined)
  if (!nodeId) return null
  const message = humanizeTestFieldMessage(
    field,
    field === 'choices' && row.message.includes('is too long')
      ? 'Trop de choix sur ce nœud. Supprimez-en ou fusionnez-les (max. 8, ou 4 en mode cutscene).'
      : row.message,
  )
  return {
    nodeId,
    field,
    message,
    code: row.code,
  }
}

/** Fusionne les lignes en erreurs par (nodeId, field) — garde le premier message. */
export function dedupeFieldErrors(errors: DocumentFieldError[]): DocumentFieldError[] {
  const seen = new Map<string, DocumentFieldError>()
  for (const err of errors) {
    const key = `${err.nodeId}::${err.field}`
    if (!seen.has(key)) {
      seen.set(key, err)
    }
  }
  return [...seen.values()]
}

/** Construit les erreurs champ depuis issues structurées ou validationReport. */
export function mapValidationRowsToFieldErrors(
  rows: ValidationReportRow[],
  unityNodes: Array<{ id?: string }>,
  graphNodes?: Node[],
): DocumentFieldError[] {
  const mapped = rows
    .map((row) => rowToFieldError(row, unityNodes, graphNodes))
    .filter((e): e is DocumentFieldError => e !== null)
  return dedupeFieldErrors(mapped)
}

function rowsFromApiError(error: unknown): ValidationReportRow[] {
  if (!error || typeof error !== 'object' || !('response' in error)) {
    return []
  }
  const axiosError = error as APIError
  const rawData = axiosError.response?.data as Record<string, unknown> | undefined
  const report = rawData?.validationReport
  if (Array.isArray(report)) {
    return report.filter(
      (r): r is ValidationReportRow =>
        typeof r === 'object' && r !== null && typeof (r as ValidationReportRow).message === 'string',
    )
  }
  const details = rawData?.error?.details as Record<string, unknown> | undefined
  if (!details) return []

  const structured = details.structured_errors
  if (Array.isArray(structured) && structured.length > 0) {
    return structured.map((s) => {
      const item = s as SchemaValidationIssue
      return {
        code: item.code,
        message: item.message,
        path: item.path,
        node_id: item.node_id,
      }
    })
  }

  const validationErrors = details.validation_errors
  if (Array.isArray(validationErrors)) {
    return validationErrors
      .filter((m): m is string => typeof m === 'string' && m.length > 0)
      .map((message) => ({ message, path: extractJsonPathFromMessage(message) }))
  }
  return []
}

export interface ExtractedValidationIssues {
  fieldErrors: DocumentFieldError[]
  /** Erreurs sans champ éditable mappable (affichage global autorisé). */
  unmappedMessages: string[]
}

/** Extrait erreurs inline + messages non mappables depuis une erreur API axios. */
export function extractValidationIssuesFromApiError(
  error: unknown,
  unityNodes: Array<{ id?: string }>,
  graphNodes?: Node[],
): ExtractedValidationIssues {
  const rows = rowsFromApiError(error)
  const fieldErrors = mapValidationRowsToFieldErrors(rows, unityNodes, graphNodes)
  const mappedRowKeys = new Set(
    fieldErrors.map((e) => `${e.nodeId}::${e.message}`),
  )
  const unmappedMessages = rows
    .filter((row) => {
      const fe = rowToFieldError(row, unityNodes, graphNodes)
      return fe === null
    })
    .map((row) => row.message)
    .filter((m, i, arr) => arr.indexOf(m) === i)

  if (rows.length === 0 && error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as APIError
    const msg = axiosError.response?.data?.error?.message
    if (typeof msg === 'string' && fieldErrors.length === 0) {
      unmappedMessages.push(msg)
    }
  }

  void mappedRowKeys
  return { fieldErrors, unmappedMessages }
}

/** Message court pour toast quand des erreurs sont inline. */
export function inlineValidationToastMessage(count: number): string {
  return count === 1
    ? 'Corrigez le champ signalé dans le formulaire ci-dessous.'
    : `Corrigez les ${count} champs signalés dans le formulaire ci-dessous.`
}
