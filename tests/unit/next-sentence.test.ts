import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import NextSentence from '../../src/components/NextSentence.vue'
import type { Book } from '../../src/data/types'
import { current, gaps, next } from '../../src/reading/next'
import type { Marks } from '../../src/spoilers/visible'
import { fixtureCatalog } from '../fixtures/catalog'
import { t } from '../../src/i18n'

const books: Book[] = fixtureCatalog().books.filter((b) => b.status === 'published').slice(0, 3)
const opts = { order: 'recommended' as const, includeRpg: false }

function sentence(marks: Marks, lang: 'es' | 'en', list: Book[] = books) {
  const cur = current(list, marks, opts)
  const w = mount(NextSentence, {
    props: {
      current: cur,
      next: next(list, marks, opts),
      gaps: gaps(list, marks, opts),
      volume: null,
      started: Object.keys(marks).length > 0,
      narrowed: false,
      hasWorks: list.length > 0,
      lang,
    },
  })
  return w.text()
}

const mark = (status: 'read' | 'reading') => ({ status, at: 1 })

describe.each(['es', 'en'] as const)('the closing sentence (%s)', (lang) => {
  const allRead = t('allRead', lang)
  const [a, b, c] = books.map((x) => x.id) as [string, string, string]

  test('says everything is read only when nothing is current, nothing skipped and nothing unread', () => {
    expect(sentence({ [a]: mark('read'), [b]: mark('read'), [c]: mark('read') }, lang)).toContain(allRead)
  })

  test('with the last book in progress it stops at the current book', () => {
    expect(sentence({ [a]: mark('read'), [b]: mark('read'), [c]: mark('reading') }, lang)).not.toContain(allRead)
    expect(sentence({ [c]: mark('reading') }, lang)).not.toContain(allRead)
  })

  test('an empty catalogue claims nothing, least of all that everything is read', () => {
    expect(sentence({}, lang, [])).not.toContain(allRead)
    expect(sentence({}, lang, [])).toBe('')
  })

  test('with only gaps left the gaps are the message', () => {
    const text = sentence({ [c]: mark('reading') }, lang)
    expect(text).not.toContain(allRead)
    expect(text).toContain(t('skipped', lang).trim())
  })
})
