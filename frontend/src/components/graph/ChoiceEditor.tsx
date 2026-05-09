/**
 * Composant pour éditer un choix de dialogue avec conditions et mécaniques RPG.
 */
import { memo, useMemo } from 'react'
import { useFormContext, Controller } from 'react-hook-form'
import { theme } from '../../theme'
import { useGraphStore } from '../../store/graphStore'
import type { DialogueNodeData } from '../../schemas/nodeEditorSchema'
import { ConnectionTargetSelect } from './ConnectionTargetSelect'
import { ConditionEditor } from './conditions/ConditionEditor'
import { EffectEditor } from './effects/EffectEditor'

export interface ChoiceEditorProps {
  dialogueNodeId: string
  choiceIndex: number
  onRemove?: () => void
  onGenerateForChoice?: (choiceIndex: number) => void
  onCreateEmptyNodeForChoice?: (choiceIndex: number) => void
}

export const ChoiceEditor = memo(function ChoiceEditor({
  dialogueNodeId,
  choiceIndex,
  onRemove,
  onGenerateForChoice,
  onCreateEmptyNodeForChoice,
}: ChoiceEditorProps) {
  const { register, formState: { errors }, control, watch } = useFormContext<DialogueNodeData>()
  const isGenerating = useGraphStore((state) => state.isGenerating)
  const choicesErrors = errors.choices?.[choiceIndex]
  const choices = watch('choices') || []
  const currentChoice = choices[choiceIndex]
  const isConnected = currentChoice?.targetNode && currentChoice.targetNode !== 'END'

  const testSourceNodeId = useMemo(
    () => `test-node-${dialogueNodeId}-choice-${choiceIndex}`,
    [dialogueNodeId, choiceIndex]
  )
  
  return (
    <div
      style={{
        padding: '1rem',
        backgroundColor: theme.background.panel,
        borderRadius: 6,
        border: `1px solid ${theme.border.primary}`,
        marginBottom: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h4 style={{ margin: 0, fontSize: '0.9rem', color: theme.text.primary }}>
          Choix #{choiceIndex + 1}
          {isConnected && (
            <span style={{ fontSize: '0.75rem', color: theme.text.secondary, marginLeft: '0.5rem', fontStyle: 'italic' }}>
              (connecté)
            </span>
          )}
        </h4>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {onGenerateForChoice && !isConnected && (
            <button
              type="button"
              onClick={() => onGenerateForChoice(choiceIndex)}
              disabled={isGenerating}
              style={{
                padding: '0.25rem 0.5rem',
                border: `1px solid ${theme.button.primary.background}`,
                borderRadius: 4,
                backgroundColor: theme.button.primary.background,
                color: theme.button.primary.color,
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                opacity: isGenerating ? 0.6 : 1,
                fontSize: '0.75rem',
              }}
              title="Générer la suite pour ce choix"
            >
              {isGenerating ? 'Génération...' : '✨ Générer'}
            </button>
          )}
          {onCreateEmptyNodeForChoice && !isConnected && (
            <button
              type="button"
              onClick={() => onCreateEmptyNodeForChoice(choiceIndex)}
              style={{
                padding: '0.25rem 0.5rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: 4,
                backgroundColor: theme.button.default.background,
                color: theme.button.default.color,
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
              title="Créer un nœud vide et le lier à ce choix"
            >
              ➕ Nouveau nœud
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              style={{
                padding: '0.25rem 0.5rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: 4,
                backgroundColor: '#E74C3C',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
            >
              🗑️ Supprimer
            </button>
          )}
        </div>
      </div>
      
      {/* Texte du choix */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontSize: '0.85rem',
            fontWeight: 'bold',
            color: theme.text.primary,
          }}
        >
          Texte du choix *
        </label>
        <textarea
          {...register(`choices.${choiceIndex}.text` as const, { required: true })}
          placeholder="Texte du choix..."
          rows={3}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: `1px solid ${choicesErrors?.text ? theme.state.error.border : theme.border.primary}`,
            borderRadius: 4,
            backgroundColor: theme.background.tertiary,
            color: theme.text.primary,
            fontSize: '0.9rem',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
        />
        {choicesErrors?.text && (
          <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: theme.state.error.color }}>
            {choicesErrors.text.message}
          </div>
        )}
      </div>
      
      {/* Nœud cible (affiché seulement si pas de test) */}
      {!currentChoice?.test && (
        <ConnectionTargetSelect
          variant="choice"
          dialogueNodeId={dialogueNodeId}
          choiceIndex={choiceIndex}
          label="Nœud cible"
          value={currentChoice?.targetNode}
          data-testid={`choice-target-select-${choiceIndex}`}
        />
      )}
      
      {/* Test d'attribut */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontSize: '0.85rem',
            fontWeight: 'bold',
            color: theme.text.secondary,
          }}
        >
          Test d'attribut
        </label>
        <input
          type="text"
          {...register(`choices.${choiceIndex}.test` as const)}
          placeholder="Format: Attribut+Compétence:DD (ex: Raison+Rhétorique:8)"
          style={{
            width: '100%',
            padding: '0.5rem',
            border: `1px solid ${theme.border.primary}`,
            borderRadius: 4,
            backgroundColor: theme.background.tertiary,
            color: theme.text.primary,
            fontSize: '0.85rem',
            fontFamily: 'monospace',
          }}
        />
        <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: theme.text.secondary, fontStyle: 'italic' }}>
          Format: Attribut+Compétence:DD (ex: Raison+Rhétorique:8)
        </div>
      </div>
      
      {/* TestTargets (affichés seulement si test présent) - Remplace le champ "Nœud cible" */}
      {currentChoice?.test && (
        <div style={{ marginBottom: '0.75rem', padding: '0.75rem', backgroundColor: theme.background.secondary, borderRadius: 6, border: `1px solid ${theme.border.primary}` }}>
          <h5 style={{ margin: '0 0 0.75rem 0', fontSize: '0.85rem', fontWeight: 'bold', color: theme.text.primary }}>
            Destinations du test
          </h5>
          
          <ConnectionTargetSelect
            variant="testHandle"
            testSourceNodeId={testSourceNodeId}
            handle="critical-failure"
            label="Échec critique →"
            value={currentChoice?.testCriticalFailureNode}
            data-testid={`choice-test-cf-${choiceIndex}`}
          />

          <ConnectionTargetSelect
            variant="testHandle"
            testSourceNodeId={testSourceNodeId}
            handle="failure"
            label="Échec →"
            value={currentChoice?.testFailureNode}
            data-testid={`choice-test-f-${choiceIndex}`}
          />

          <ConnectionTargetSelect
            variant="testHandle"
            testSourceNodeId={testSourceNodeId}
            handle="success"
            label="Réussite →"
            value={currentChoice?.testSuccessNode}
            data-testid={`choice-test-s-${choiceIndex}`}
          />

          <ConnectionTargetSelect
            variant="testHandle"
            testSourceNodeId={testSourceNodeId}
            handle="critical-success"
            label="Réussite critique →"
            value={currentChoice?.testCriticalSuccessNode}
            data-testid={`choice-test-cs-${choiceIndex}`}
          />
        </div>
      )}
      
      {/* Modificateurs d'influence et respect */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
        <div style={{ flex: 1 }}>
          <label
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.85rem',
              fontWeight: 'bold',
              color: theme.text.secondary,
            }}
          >
            Modificateur d'influence
          </label>
          <input
            type="number"
            {...register(`choices.${choiceIndex}.influenceDelta` as const, { valueAsNumber: true })}
            placeholder="ex: +1, -1"
            style={{
              width: '100%',
              padding: '0.5rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 4,
              backgroundColor: theme.background.tertiary,
              color: theme.text.primary,
              fontSize: '0.85rem',
              fontFamily: 'monospace',
            }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label
            style={{
              display: 'block',
              marginBottom: '0.5rem',
              fontSize: '0.85rem',
              fontWeight: 'bold',
              color: theme.text.secondary,
            }}
          >
            Modificateur de respect
          </label>
          <input
            type="number"
            {...register(`choices.${choiceIndex}.respectDelta` as const, { valueAsNumber: true })}
            placeholder="ex: +1, -1"
            style={{
              width: '100%',
              padding: '0.5rem',
              border: `1px solid ${theme.border.primary}`,
              borderRadius: 4,
              backgroundColor: theme.background.tertiary,
              color: theme.text.primary,
              fontSize: '0.85rem',
              fontFamily: 'monospace',
            }}
          />
        </div>
      </div>
      
      {/* Traits requis */}
      <div style={{ marginBottom: '0.75rem' }}>
        <label
          style={{
            display: 'block',
            marginBottom: '0.5rem',
            fontSize: '0.85rem',
            fontWeight: 'bold',
            color: theme.text.secondary,
          }}
        >
          Traits requis (format JSON)
        </label>
        <Controller
          name={`choices.${choiceIndex}.traitRequirements` as const}
          control={control}
          render={({ field }) => (
            <textarea
              {...field}
              value={field.value ? JSON.stringify(field.value, null, 2) : ''}
              onChange={(e) => {
                const value = e.target.value.trim()
                if (!value) {
                  field.onChange(undefined)
                  return
                }
                try {
                  const parsed = JSON.parse(value)
                  if (Array.isArray(parsed)) {
                    field.onChange(parsed)
                  } else {
                    field.onChange(undefined)
                  }
                } catch {
                  // Garder la valeur pour permettre la saisie progressive
                  field.onChange(undefined)
                }
              }}
              placeholder='[{"trait": "Autoritaire", "minValue": 5}]'
              rows={2}
              style={{
                width: '100%',
                padding: '0.5rem',
                border: `1px solid ${theme.border.primary}`,
                borderRadius: 4,
                backgroundColor: theme.background.tertiary,
                color: theme.text.primary,
                fontSize: '0.85rem',
                fontFamily: 'monospace',
                resize: 'vertical',
              }}
            />
          )}
        />
        <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: theme.text.secondary, fontStyle: 'italic' }}>
          Format JSON: {'[{"trait": "NomTrait", "minValue": 5}]'}
        </div>
      </div>

      <ConditionEditor variant="choice" choiceIndex={choiceIndex} />

      <EffectEditor choiceIndex={choiceIndex} />
    </div>
  )
})
