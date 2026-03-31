/**
 * Fusion pure formulaire d'édition → données nœud pour le store (ADR-006).
 * Les champs de connexion (edges) ne doivent pas être écrasés par un form stale.
 */
import type { Choice, DialogueNodeData, EndNodeData, TestNodeData } from '../schemas/nodeEditorSchema'

/** Priorité au store non vide, sinon valeur form (évite écrasement post-génération). */
export function pickTestConnectionField(storeVal: unknown, formVal: unknown): string {
  if (typeof storeVal === 'string' && storeVal.trim() !== '') return storeVal
  if (typeof formVal === 'string') return formVal
  return ''
}

/**
 * Fusionne les données dialogue du store avec le form pour un push store.
 */
export function mergeDialogueNodeFormIntoStoreData(
  nodeData: Record<string, unknown>,
  formValues: DialogueNodeData
): Record<string, unknown> {
  const storeChoices = (nodeData.choices || []) as Choice[]
  const formChoices = formValues.choices || []
  const storeChoicesById = new Map(
    storeChoices
      .filter((choice): choice is Choice & { choiceId: string } => typeof choice.choiceId === 'string')
      .map((choice) => [choice.choiceId, choice] as const)
  )
  const mergedChoices: Choice[] = formChoices.map((fc, i) => {
    // choiceId en map ; si absent (form/store désalignés), repli index pour ne pas perdre targetNode.
    const storeChoice =
      typeof fc.choiceId === 'string' && fc.choiceId.trim() !== ''
        ? (storeChoicesById.get(fc.choiceId) ?? storeChoices[i])
        : storeChoices[i]
    const targetNode =
      storeChoice?.targetNode !== undefined && storeChoice.targetNode !== ''
        ? storeChoice.targetNode
        : fc.targetNode
    return {
      ...fc,
      choiceId: storeChoice?.choiceId ?? fc.choiceId,
      targetNode,
      testCriticalFailureNode: storeChoice?.testCriticalFailureNode ?? fc.testCriticalFailureNode,
      testFailureNode: storeChoice?.testFailureNode ?? fc.testFailureNode,
      testSuccessNode: storeChoice?.testSuccessNode ?? fc.testSuccessNode,
      testCriticalSuccessNode: storeChoice?.testCriticalSuccessNode ?? fc.testCriticalSuccessNode,
    }
  })
  // Le formulaire peut avoir moins de lignes que le store (RHF désaligné) : ne pas tronquer les choix en queue.
  if (storeChoices.length > mergedChoices.length) {
    for (let j = mergedChoices.length; j < storeChoices.length; j++) {
      mergedChoices.push(storeChoices[j])
    }
  }
  const storeNext = (nodeData as { nextNode?: string }).nextNode
  const resolvedNext =
    storeNext !== undefined ? (storeNext ?? '') : (formValues.nextNode ?? '')

  return { ...nodeData, ...formValues, choices: mergedChoices, nextNode: resolvedNext }
}

/**
 * Fusionne les données TestNode du store avec le form pour un push store.
 */
export function mergeTestNodeFormIntoStoreData(
  nodeData: Record<string, unknown>,
  formValues: TestNodeData
): Record<string, unknown> {
  return {
    ...nodeData,
    ...formValues,
    criticalFailureNode: pickTestConnectionField(nodeData.criticalFailureNode, formValues.criticalFailureNode),
    failureNode: pickTestConnectionField(nodeData.failureNode, formValues.failureNode),
    successNode: pickTestConnectionField(nodeData.successNode, formValues.successNode),
    criticalSuccessNode: pickTestConnectionField(nodeData.criticalSuccessNode, formValues.criticalSuccessNode),
  }
}

/**
 * Fusion pour nœud de fin (pas de champs de connexion spécifiques).
 */
export function mergeEndNodeFormIntoStoreData(
  nodeData: Record<string, unknown>,
  formValues: EndNodeData
): Record<string, unknown> {
  return { ...nodeData, ...formValues }
}

export type NodeEditorFormValues = DialogueNodeData | TestNodeData | EndNodeData

/**
 * Dispatche la fusion selon le type React Flow du nœud.
 */
export function mergeNodeFormIntoStoreData(
  nodeType: string,
  nodeData: Record<string, unknown>,
  formValues: NodeEditorFormValues
): Record<string, unknown> {
  if (nodeType === 'dialogueNode') {
    return mergeDialogueNodeFormIntoStoreData(nodeData, formValues as DialogueNodeData)
  }
  if (nodeType === 'testNode') {
    return mergeTestNodeFormIntoStoreData(nodeData, formValues as TestNodeData)
  }
  return mergeEndNodeFormIntoStoreData(nodeData, formValues as EndNodeData)
}

/** Empreinte stable des connexions pour détecter un changement store sans changement de sélection. */
export function connectionFingerprintFromNodeData(
  nodeType: string,
  nodeData: Record<string, unknown>
): string {
  if (nodeType === 'testNode') {
    const d = nodeData
    return JSON.stringify({
      cf: d.criticalFailureNode ?? '',
      f: d.failureNode ?? '',
      s: d.successNode ?? '',
      cs: d.criticalSuccessNode ?? '',
    })
  }
  if (nodeType === 'dialogueNode') {
    const choices = (nodeData.choices || []) as Choice[]
    const slice = choices.map((c) => ({
      t: c.targetNode ?? '',
      tcf: c.testCriticalFailureNode ?? '',
      tf: c.testFailureNode ?? '',
      ts: c.testSuccessNode ?? '',
      tcs: c.testCriticalSuccessNode ?? '',
    }))
    const next = (nodeData as { nextNode?: string }).nextNode ?? ''
    return JSON.stringify({ next, choices: slice })
  }
  return ''
}

/**
 * Applique les champs de connexion du store sur les valeurs form (dialogue).
 */
export function applyStoreConnectionFieldsToDialogueFormChoices(
  storeChoices: Choice[],
  formChoices: Choice[]
): Choice[] {
  const storeChoicesById = new Map(
    storeChoices
      .filter((choice): choice is Choice & { choiceId: string } => typeof choice.choiceId === 'string')
      .map((choice) => [choice.choiceId, choice] as const)
  )
  return formChoices.map((fc, i) => {
    const sc =
      typeof fc.choiceId === 'string' && fc.choiceId.trim() !== ''
        ? storeChoicesById.get(fc.choiceId)
        : storeChoices[i]
    if (!sc) return fc
    return {
      ...fc,
      choiceId: sc.choiceId ?? fc.choiceId,
      targetNode: sc.targetNode,
      testCriticalFailureNode: sc.testCriticalFailureNode ?? fc.testCriticalFailureNode,
      testFailureNode: sc.testFailureNode ?? fc.testFailureNode,
      testSuccessNode: sc.testSuccessNode ?? fc.testSuccessNode,
      testCriticalSuccessNode: sc.testCriticalSuccessNode ?? fc.testCriticalSuccessNode,
    }
  })
}
