/**
 * Aide sur le périmètre des bases à synchroniser : tooltip au survol, dépliage au tactile.
 */
import type { CSSProperties } from 'react'
import { useState } from 'react'
import { theme } from '../../theme'
import { Tooltip } from '../shared/Tooltip'

/** Explication du filtre de bases : identique en tooltip (survol) et en dépliage (tactile / clavier). */
function DatabasePerimeterHelpText() {
  const em: CSSProperties = { color: theme.text.primary }
  return (
    <span style={{ display: 'block', fontSize: '0.82rem', lineHeight: 1.45 }}>
      Cochez les bases Notion à inclure. <strong style={em}>Aucune case</strong> ou{' '}
      <strong style={em}>toutes les cases</strong> cochées = pas de filtre (toutes les bases + toutes
      les fiches page). Si vous restreignez les bases, chaque sync ne traite{' '}
      <strong style={em}>que</strong> ces bases — les fiches (sources page) sont alors ignorées sur ce
      run (évite de parcourir tout le hub). Retirez le filtre pour tout resynchroniser.
      <br />
      <strong style={em}>Cocher essentiels</strong> : coche toutes les bases sauf celles marquées
      « secondaire » et <strong style={em}>enregistre</strong> immédiatement le périmètre sur le
      serveur.
      <br />
      <strong style={em}>Sync complète (bouton global) avec filtre :</strong> les fichiers (ou
      dossiers shards) des bases <em>non</em> cochées sont <strong>retirés</strong> du dossier GDD
      local après promotion du miroir (les fiches page déjà sur disque ne sont pas effacées). Utilisez
      le bouton <strong>Sync cette base</strong> sur une ligne pour une sync complète{' '}
      <em>uniquement</em> sur cette base sans toucher aux autres.
      <br />
      <strong style={em}>Sync normale ou complète :</strong> les cases cochées s’appliquent à ce run
      uniquement (filtre éphémère). Le périmètre <strong>sauvegardé</strong> (Cocher essentiels,
      Appliquer le périmètre ou Sauver sans sync) détermine quelles bases sont retirées du disque lors
      d’une sync complète globale.
    </span>
  )
}

export function DatabasePerimeterHelp() {
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <Tooltip content={<DatabasePerimeterHelpText />} position="bottom" maxWidth="520px">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label="Aide sur le périmètre des bases à synchroniser"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
            minHeight: '28px',
            padding: '0.1rem 0.5rem',
            borderRadius: '999px',
            border: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.secondary,
            color: theme.text.secondary,
            fontSize: '0.78rem',
            cursor: 'help',
          }}
        >
          <span aria-hidden>ⓘ</span> Aide
        </button>
      </Tooltip>
      {expanded ? (
        <div
          style={{
            flexBasis: '100%',
            padding: '0.6rem 0.7rem',
            borderRadius: '6px',
            border: `1px solid ${theme.border.primary}`,
            backgroundColor: theme.background.secondary,
            color: theme.text.secondary,
          }}
        >
          <DatabasePerimeterHelpText />
        </div>
      ) : null}
    </>
  )
}
