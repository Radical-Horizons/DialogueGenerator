/**
 * « Appliquer un template… » : remplace distribution, lieu, brief et fiches liées de la
 * scène ouverte. Répliques, tons et profil restent.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { getTemplateApi, validateTemplateApi } from '../../api/templates'
import { useGraphStore } from '../../store/graphStore'
import { mentionCatalogs, useSceneCatalogStore } from '../../store/sceneCatalogStore'
import { effectiveSceneSheet } from '../../store/slices/sceneSlice'
import { useTemplateStore } from '../../store/templateStore'
import { redesignSpacing, redesignText } from '../../theme/redesignTokens'
import { getErrorMessage } from '../../types/errors'
import type { Template } from '../../types/template'
import { applyResolvedReferences } from '../../utils/presetUtils'
import { templateToPreset } from '../../utils/templateApply'
import {
  applyTemplateToScene,
  describeSceneTemplate,
  isSceneSheetFilled,
} from '../../utils/sceneTemplate'
import { useToast } from '../shared'
import { SceneDialog } from './SceneWindow'
import { buttonStyle, monoLabel } from './sceneStyles'

const noteStyle = { margin: 0, fontSize: '13px', lineHeight: 1.55, color: redesignText.secondary }

export function SceneTemplateApplyWindow({
  trigger,
  onClose,
}: {
  trigger: RefObject<HTMLElement>
  onClose: () => void
}) {
  const templates = useTemplateStore((state) => state.templates)
  const isLoading = useTemplateStore((state) => state.isLoading)
  const error = useTemplateStore((state) => state.error)
  const loadTemplates = useTemplateStore((state) => state.loadTemplates)
  const toast = useToast()
  const [applying, setApplying] = useState<string | null>(null)
  // Fenêtre fermée ou scène changée pendant la lecture : rien ne s'applique.
  const alive = useRef(true)

  useEffect(() => {
    alive.current = true
    void loadTemplates()
    return () => {
      alive.current = false
    }
  }, [loadTemplates])

  const apply = async (template: Template) => {
    setApplying(template.id)
    try {
      const fresh = await getTemplateApi(template.id)
      const validation = await validateTemplateApi(fresh.id)
      if (!alive.current) return
      // Alias remis au nom du GDD ; un nom absent reste, la fiche accepte un nom libre.
      const { configuration } = applyResolvedReferences(
        templateToPreset(fresh),
        validation.resolvedRefs ?? {},
      )
      const sheet = effectiveSceneSheet(useGraphStore.getState())
      if (
        isSceneSheetFilled(sheet) &&
        !window.confirm(
          `Appliquer le template « ${fresh.name} » ? Il remplace la distribution, le lieu, le brief et les fiches liées de la scène.`,
        )
      ) {
        return
      }
      const catalogs = mentionCatalogs(useSceneCatalogStore.getState())
      useGraphStore
        .getState()
        .updateScene((current) => applyTemplateToScene(current, configuration, catalogs))
      const missing = validation.obsoleteRefs ?? []
      if (missing.length > 0) {
        toast(`Absent du GDD, repris tel quel : ${missing.join(', ')}`, 'warning')
      } else {
        toast(`Template « ${fresh.name} » appliqué à la scène`, 'success')
      }
      onClose()
    } catch (err) {
      if (alive.current) toast(`Template non appliqué : ${getErrorMessage(err)}`, 'error')
    } finally {
      if (alive.current) setApplying(null)
    }
  }

  return (
    <SceneDialog title="Appliquer un template" trigger={trigger} onClose={onClose}>
      <p style={{ ...noteStyle, marginBottom: redesignSpacing.md }}>
        Remplace la distribution, le lieu, le brief et les fiches liées. Les répliques, les tons et
        le profil d’auteur restent.
      </p>
      {error ? (
        <p role="alert" style={noteStyle}>
          {error}
        </p>
      ) : null}
      {templates.length === 0 ? (
        <p style={noteStyle}>
          {isLoading
            ? 'Chargement des templates…'
            : 'Les templates enregistrés par l’équipe s’afficheront ici.'}
        </p>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: redesignSpacing.xs,
          }}
        >
          {templates.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                disabled={applying !== null}
                onClick={() => void apply(template)}
                style={{
                  ...buttonStyle,
                  width: '100%',
                  minHeight: 44,
                  padding: `${redesignSpacing.xs}px ${redesignSpacing.sm}px`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  gap: 3,
                  textAlign: 'left',
                }}
              >
                <span style={{ color: redesignText.strong, fontSize: '13px' }}>
                  {template.name}
                </span>
                <span style={{ ...monoLabel, whiteSpace: 'normal' }}>
                  {template.category} · {describeSceneTemplate(template.configuration)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </SceneDialog>
  )
}
