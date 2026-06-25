import { describe, it, expect } from 'vitest'
import {
  extractJsonPathFromMessage,
  mapValidationRowsToFieldErrors,
  unityPathToFormField,
  extractValidationIssuesFromApiError,
} from './documentValidationFieldErrors'

describe('documentValidationFieldErrors', () => {
  it('parse path from bracket message', () => {
    expect(
      extractJsonPathFromMessage(
        "Erreur schéma Unity : [nodes.0.choices.0.test] does not match pattern",
      ),
    ).toBe('nodes.0.choices.0.test')
  })

  it('maps structured row to form field', () => {
    const nodes = [{ id: 'START' }]
    const errors = mapValidationRowsToFieldErrors(
      [
        {
          code: 'schema_pattern',
          message: "Erreur schéma Unity : champ 'test' — invalid",
          path: 'nodes.0.choices.0.test',
        },
      ],
      nodes,
    )
    expect(errors).toHaveLength(1)
    expect(errors[0].nodeId).toBe('START')
    expect(errors[0].field).toBe('choices.0.test')
  })

  it('unityPathToFormField strips node index', () => {
    expect(unityPathToFormField('nodes.0.consequences.flag')).toBe('consequences.flag')
  })

  it('maps legacy choices too long message without path', () => {
    const nodes = [{ id: 'START' }]
    const errors = mapValidationRowsToFieldErrors(
      [
        {
          message:
            "Erreur schéma Unity : champ 'choices' — [{'choiceId': 'choice_START_0'}] is too long",
        },
      ],
      nodes,
    )
    expect(errors).toHaveLength(1)
    expect(errors[0].field).toBe('choices')
    expect(errors[0].message).toContain('Trop de choix')
  })

  it('maps choices array errors to the choices section', () => {
    const nodes = [{ id: 'START' }]
    const errors = mapValidationRowsToFieldErrors(
      [
        {
          code: 'schema_max_items',
          message: 'Trop de choix : maximum 4 choix autorisés en mode cutscene.',
          path: 'nodes.0.choices',
        },
      ],
      nodes,
    )
    expect(errors).toHaveLength(1)
    expect(errors[0].nodeId).toBe('START')
    expect(errors[0].field).toBe('choices')
    expect(errors[0].message).toContain('maximum 4')
  })

  it('humanizes legacy test regex error for inline display', () => {
    const nodes = [{ id: 'START' }]
    const errors = mapValidationRowsToFieldErrors(
      [
        {
          message:
            "Erreur schéma Unity : champ 'test' — 'Raison+Déplacement silencieux:9' does not match '^[^\\\\s:+]+\\\\+[^\\\\s:+]+:\\\\d+$'",
          path: 'nodes.0.choices.0.test',
        },
      ],
      nodes,
    )
    expect(errors[0].field).toBe('choices.0.test')
    expect(errors[0].message).toContain('Attribut+Compétence:DD')
    expect(errors[0].message).toContain('Déplacement silencieux')
    expect(errors[0].message).not.toContain('does not match')
  })

  it('extracts structured_errors from API error envelope', () => {
    const err = {
      response: {
        data: {
          error: {
            message: 'Le dialogue Unity contient des erreurs de validation',
            details: {
              structured_errors: [
                {
                  code: 'schema_pattern',
                  message: 'Format test invalide',
                  path: 'nodes.0.choices.0.test',
                  node_id: 'START',
                },
              ],
            },
          },
        },
      },
    }
    const { fieldErrors } = extractValidationIssuesFromApiError(err, [{ id: 'START' }])
    expect(fieldErrors[0]?.field).toBe('choices.0.test')
    expect(fieldErrors[0]?.message).toContain('Format test')
  })
})
