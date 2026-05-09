export type SkillCheckIssue = 'succès_critique' | 'succès' | 'échec' | 'échec_critique'

export interface SkillCheckDefinition {
  attributeId: string
  attributeLabel?: string
  skillId: string
  skillLabel?: string
  dc: number
  modifier?: number
  branches?: Partial<Record<SkillCheckIssue, string>>
}

export interface SkillCheckPreviewState {
  attributes: Record<string, number>
  skills: Record<string, number>
}

export interface SkillCheckResult {
  visible: true
  score: number
  dc: number
  issue: SkillCheckIssue
  targetNode?: string
}

export interface ChoiceWithSkillCheck {
  text?: string
  skillCheck?: SkillCheckDefinition
}

function skillCheckIssueFromMargin(margin: number): SkillCheckIssue {
  if (margin >= 5) return 'succès_critique'
  if (margin >= 0) return 'succès'
  if (margin <= -5) return 'échec_critique'
  return 'échec'
}

export function evaluateSkillCheck(
  check: SkillCheckDefinition,
  state: SkillCheckPreviewState,
): SkillCheckResult {
  const score =
    (state.attributes[check.attributeId] ?? 0) +
    (state.skills[check.skillId] ?? 0) +
    (check.modifier ?? 0)
  const issue = skillCheckIssueFromMargin(score - check.dc)
  return {
    visible: true,
    score,
    dc: check.dc,
    issue,
    targetNode: check.branches?.[issue],
  }
}

export function formatSkillCheckSummary(
  check: SkillCheckDefinition,
  result: Pick<SkillCheckResult, 'score' | 'issue'>,
): string {
  const attribute = check.attributeLabel?.trim() || check.attributeId
  const skill = check.skillLabel?.trim() || check.skillId
  return `${attribute} + ${skill} vs DD ${check.dc} : score ${result.score}, ${result.issue}`
}

export function getChoiceSkillCheckPreview(
  choice: ChoiceWithSkillCheck,
  state: SkillCheckPreviewState,
): SkillCheckResult | null {
  if (!choice.skillCheck) return null
  return evaluateSkillCheck(choice.skillCheck, state)
}
