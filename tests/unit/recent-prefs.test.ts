import { describe, expect, test } from 'vitest'
import { isRecentlyAdded } from '../../src/reading/recent'
import { loadPrefs, savePrefs } from '../../src/state/prefs'
import { defaultFilters } from '../../src/filters/filters'
import { fixtureCatalog } from '../fixtures/catalog'

const DAY = 24 * 60 * 60 * 1000
const book = (addedOn?: string) => ({ ...fixtureCatalog().books[0]!, addedOn })
const NOW = Date.UTC(2026, 10, 4)

function fakeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  }
}

describe('isRecentlyAdded', () => {
  test('an impossible calendar date is not new, as everywhere else', () => {
    expect(isRecentlyAdded(book('2026-11-31'), NOW)).toBe(false)
    expect(isRecentlyAdded(book('2026-02-31'), Date.UTC(2026, 2, 1))).toBe(false)
  })
  test('a book added within 60 days is new', () => {
    expect(isRecentlyAdded(book('2026-11-01'), NOW)).toBe(true)
    expect(isRecentlyAdded(book(new Date(NOW - 59 * DAY).toISOString().slice(0, 10)), NOW)).toBe(true)
  })
  test('older, undated, malformed or future dates are not new', () => {
    expect(isRecentlyAdded(book('2026-01-01'), NOW)).toBe(false)
    expect(isRecentlyAdded(book(undefined), NOW)).toBe(false)
    expect(isRecentlyAdded(book('soon'), NOW)).toBe(false)
    expect(isRecentlyAdded(book('2027-01-01'), NOW)).toBe(false)
  })
})

describe('prefs', () => {
  test('nothing stored gives no preferences', () => {
    expect(loadPrefs(fakeStorage())).toEqual({})
  })
  test('what was saved comes back', () => {
    const storage = fakeStorage()
    const filters = { ...defaultFilters(), series: ['Ash'], phases: [2] }
    savePrefs({ lang: 'en', view: 'circle', order: 'publication', filters }, storage)
    expect(loadPrefs(storage)).toEqual({ lang: 'en', view: 'circle', order: 'publication', filters })
  })
  test('they live under cosmere.prefs.v1', () => {
    const storage = fakeStorage()
    savePrefs({ lang: 'es', view: 'shelf', order: 'recommended', filters: defaultFilters() }, storage)
    expect(storage.getItem('cosmere.prefs.v1')).not.toBeNull()
  })
  test('corrupt or foreign values are dropped one by one', () => {
    const storage = fakeStorage()
    storage.setItem(
      'cosmere.prefs.v1',
      JSON.stringify({
        lang: 'fr',
        view: 'shelf',
        order: 3,
        filters: {
          statuses: ['published', 'rumour'],
          formats: 'all',
          series: [1, 'Ash'],
          phases: ['x', 2],
          theories: 'yes',
        },
      }),
    )
    const out = loadPrefs(storage)
    expect(out.lang).toBeUndefined()
    expect(out.view).toBe('shelf')
    expect(out.order).toBeUndefined()
    expect(out.filters?.statuses).toEqual(['published'])
    expect(out.filters?.formats).toEqual(defaultFilters().formats)
    expect(out.filters?.series).toEqual(['Ash'])
    expect(out.filters?.phases).toEqual([2])
    expect(out.filters?.theories).toBe(false)
  })
  test('text that is not JSON gives no preferences and does not throw', () => {
    const storage = fakeStorage()
    storage.setItem('cosmere.prefs.v1', '{oops')
    expect(loadPrefs(storage)).toEqual({})
  })
  test('blocked storage does not throw', () => {
    const blocked = {
      getItem() {
        throw new Error('denied')
      },
      setItem() {
        throw new Error('denied')
      },
    } as unknown as Storage
    expect(loadPrefs(blocked)).toEqual({})
    expect(() =>
      savePrefs({ lang: 'es', view: 'shelf', order: 'recommended', filters: defaultFilters() }, blocked),
    ).not.toThrow()
  })
})
