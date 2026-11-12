import { describe, expect, test } from 'vitest'
import type { Connection } from '../../src/data/types'
import { descriptionOf, t, titleOf } from '../../src/i18n'
import { EN, ES } from '../../src/i18n/strings'
import { fixtureCatalog } from '../fixtures/catalog'

const book = (id: string) => fixtureCatalog().books.find((b) => b.id === id)!

describe('titleOf', () => {
  test('Spanish falls back to the English title when titles.es is null', () => {
    expect(titleOf(book('lantern-keeper'), 'es')).toBe('The Lantern Keeper')
  })
  test('Spanish uses titles.es when present', () => {
    expect(titleOf(book('ash-road'), 'es')).toBe('Camino de ceniza')
  })
  test('English always uses titles.en', () => {
    expect(titleOf(book('ash-road'), 'en')).toBe('Ash Road')
    expect(titleOf(book('lantern-keeper'), 'en')).toBe('The Lantern Keeper')
  })
})

describe('descriptionOf', () => {
  const connection = fixtureCatalog().connections[0]!
  test('returns the text of the language asked', () => {
    expect(descriptionOf(connection, 'en')).toBe('LEAK-c-0001 en')
    expect(descriptionOf(connection, 'es')).toBe('LEAK-c-0001 es')
  })
  test('does not fall back to English in Spanish', () => {
    const noEs = { ...connection, description: { en: 'only english' } } as unknown as Connection
    expect(descriptionOf(noEs, 'es')).toBe('')
  })
  test.each([[{ description: undefined }], [{ description: null }], [{ description: 'text' }], [{ description: { en: 7, es: 7 } }]])(
    'returns an empty string for a malformed connection %j',
    (change) => {
      expect(descriptionOf({ ...connection, ...change } as unknown as Connection, 'en')).toBe('')
    },
  )
  test.each([[null], [undefined], [42]])('does not throw on %j', (value) => {
    expect(descriptionOf(value as unknown as Connection, 'es')).toBe('')
  })
})

describe('strings', () => {
  test('every string key exists in both languages', () => {
    expect(Object.keys(EN).sort()).toEqual(Object.keys(ES).sort())
  })
  test('no string is empty', () => {
    for (const dict of [ES, EN]) for (const value of Object.values(dict)) expect(value.trim()).not.toBe('')
  })
  test('t reads the dictionary of the language asked', () => {
    expect(t('reading', 'es')).toBe('Estás leyendo')
    expect(t('reading', 'en')).toBe('You are reading')
  })
})
