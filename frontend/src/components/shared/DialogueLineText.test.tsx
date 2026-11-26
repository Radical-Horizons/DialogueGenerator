import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DialogueLineText } from './DialogueLineText'

function passages(text: string) {
  const { container } = render(<DialogueLineText text={text} />)
  return Array.from(container.querySelectorAll<HTMLElement>('[data-segment]')).map((span) => ({
    kind: span.dataset.segment,
    text: span.textContent,
    fontStyle: span.style.fontStyle,
  }))
}

describe('DialogueLineText', () => {
  it('met la narration en italique et la parole en romain, sans astérisque', () => {
    expect(passages('*Il se lève.*\n\n« Oui. »')).toEqual([
      { kind: 'narration', text: 'Il se lève.', fontStyle: 'italic' },
      { kind: 'speech', text: '« Oui. »', fontStyle: '' },
    ])
  })

  it('montre tel quel un astérisque sans fermeture, en parole', () => {
    expect(passages('« Oui. » *Il pose')).toEqual([
      { kind: 'speech', text: '« Oui. » *Il pose', fontStyle: '' },
    ])
  })

  it('ne rend aucun passage pour des espaces seuls', () => {
    expect(passages('  ')).toEqual([])
  })
})
