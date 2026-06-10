/** Types liaisons dialogue ↔ catalogue flags (Story 9.1, FR89). */

export type DialogueFlagSemanticType = 'bool' | 'compteur' | 'enum'

export interface DialogueFlagBinding {
  flagId: string
  type: DialogueFlagSemanticType
  initialValue: boolean | number | string
}
