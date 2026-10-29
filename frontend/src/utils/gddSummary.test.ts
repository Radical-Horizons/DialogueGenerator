import { describe, it, expect } from 'vitest'
import {
  getGddEntitySummary,
  extractTextFromGddValue,
  isSerializedNotionRichTextBlock,
} from './gddSummary'

describe('gddSummary', () => {
  describe('isSerializedNotionRichTextBlock', () => {
    it('retourne true pour la chaîne repr Barvas (fiche Personnages_Full)', () => {
      const s = "{'id': 'Ifqh', 'type': 'rich_text', 'rich_text': []}"
      expect(isSerializedNotionRichTextBlock(s)).toBe(true)
    })

    it('retourne true pour variante avec guillemets doubles', () => {
      expect(isSerializedNotionRichTextBlock(`{"id": "x", "type": "rich_text", "rich_text": []}`)).toBe(true)
    })

    it('retourne false pour une vraie phrase', () => {
      expect(isSerializedNotionRichTextBlock('Barvas le Juge-Mendiant est une entité supérieure.')).toBe(false)
    })

    it('retourne false pour chaîne vide ou blanche', () => {
      expect(isSerializedNotionRichTextBlock('')).toBe(false)
      expect(isSerializedNotionRichTextBlock('   ')).toBe(false)
    })
  })

  describe('extractTextFromGddValue', () => {
    it('retourne undefined pour la chaîne repr rich_text vide (Barvas)', () => {
      const s = "{'id': 'Ifqh', 'type': 'rich_text', 'rich_text': []}"
      expect(extractTextFromGddValue(s)).toBeUndefined()
    })

    it('retourne la chaîne pour un texte normal', () => {
      expect(extractTextFromGddValue('Un résumé utile.')).toBe('Un résumé utile.')
    })

    it('retourne le texte pour un objet rich_text avec plain_text', () => {
      expect(
        extractTextFromGddValue({ rich_text: [{ plain_text: 'Hello' }, { plain_text: ' world' }] })
      ).toBe('Hello world')
    })

    it('retourne undefined pour objet rich_text vide', () => {
      expect(extractTextFromGddValue({ id: 'x', type: 'rich_text', rich_text: [] })).toBeUndefined()
    })
  })

  describe('getGddEntitySummary', () => {
    it('ignore Résumé quand c’est la chaîne repr rich_text et utilise Introduction["Résumé de la fiche"] (fiche Barvas)', () => {
      const data = {
        Nom: 'Barvas le Juge-Mendiant',
        Résumé: "{'id': 'Ifqh', 'type': 'rich_text', 'rich_text': []}",
        Introduction: {
          'Résumé de la fiche':
            "Barvas le Juge-Mendiant est une entité supérieure hybride née vers 1180 AG d'une prophétie.",
        },
      }
      const summary = getGddEntitySummary(data as Record<string, unknown>)
      expect(summary).not.toContain("'id'")
      expect(summary).not.toContain('rich_text')
      expect(summary).toContain('Barvas le Juge-Mendiant')
      expect(summary).toContain('entité supérieure')
    })

    it('retourne chaîne vide si tout est repr rich_text ou vide', () => {
      const data = {
        Résumé: "{'id': 'Ifqh', 'type': 'rich_text', 'rich_text': []}",
      }
      expect(getGddEntitySummary(data as Record<string, unknown>)).toBe('')
    })

    it('utilise Résumé quand c’est une vraie chaîne', () => {
      const data = { Nom: 'Alice', Résumé: 'Un héros du récit.' }
      expect(getGddEntitySummary(data as Record<string, unknown>)).toBe('Un héros du récit.')
    })

    it('lit le résumé depuis values (sync Notion)', () => {
      const data = {
        Nom: 'Bob',
        values: { 'Résumé de la fiche': 'Court texte depuis la table Notion.' },
      }
      expect(getGddEntitySummary(data as Record<string, unknown>)).toBe('Court texte depuis la table Notion.')
    })

    it('extrait le résumé depuis sections._general markdown', () => {
      const data = {
        Nom: 'Cara',
        sections: {
          _general:
            '**Résumé de la fiche**\nUn extrait narratif assez long pour dépasser la limite et être tronqué avec des points de suspension en fin de chaîne visible dans la liste.',
        },
      }
      const s = getGddEntitySummary(data as Record<string, unknown>)
      expect(s).toContain('Un extrait narratif')
      expect(s.endsWith('…')).toBe(true)
    })

    it('utilise la première ligne de _general si pas de bloc Résumé', () => {
      const data = {
        Nom: 'Dan',
        sections: { _general: '**Détient** : épée\n\nSuite.' },
      }
      expect(getGddEntitySummary(data as Record<string, unknown>)).toContain('épée')
    })
  })

  // Forme reellement servie par l'API pour les fiches synchronisees depuis Notion :
  // cles de `sections` slugifiees et resume sous `values['Résumé IA']`. Aucune des
  // deux n'etait trouvee - d'ou des listes GDD sans aucun sous-titre a l'ecran.
  describe('shards Notion (clés slugifiées)', () => {
    it('lit un résumé dans une section slugifiée', () => {
      const data = {
        Nom: 'Aïrossa',
        sections: {
          re_sume__de_la_fiche: 'Survivante du projet Ysellor, mémoire des Bassins Fendus.',
          signes_visibles_imme_diats: 'Peau hydrocalcaire mate.',
        },
      }
      expect(getGddEntitySummary(data as Record<string, unknown>)).toContain(
        'Survivante du projet Ysellor'
      )
    })

    it('retombe sur values[« Résumé IA »] quand aucune section ne convient', () => {
      const data = {
        Nom: 'Aïrossa',
        values: { 'Résumé IA': 'Ancienne servante devenue mémoire vivante.' },
      }
      expect(getGddEntitySummary(data as Record<string, unknown>)).toContain('Ancienne servante')
    })

    it('préfère un résumé rédigé au résumé généré', () => {
      const data = {
        Nom: 'Aïrossa',
        values: { 'Résumé': 'Rédigé à la main.', 'Résumé IA': 'Généré.' },
      }
      expect(getGddEntitySummary(data as Record<string, unknown>)).toBe('Rédigé à la main.')
    })

    it('retire les balises Notion résiduelles de l’aperçu', () => {
      const data = {
        Nom: 'Aïrossa',
        sections: {
          re_sume__de_la_fiche:
            'Reléguée par <mention-page url="https://app.notion.com/p/1a16"/> au rang de servante.',
        },
      }
      const summary = getGddEntitySummary(data as Record<string, unknown>)
      expect(summary).not.toContain('mention-page')
      expect(summary).not.toContain('notion.com')
      expect(summary).toContain('au rang de servante')
    })
  })
})
