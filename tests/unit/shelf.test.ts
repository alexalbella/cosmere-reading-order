import { afterEach, describe, expect, test } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import App from '../../src/App.vue'
import { useApp } from '../../src/app/useApp'
import { groupBooks, pileWidthPercent, spineColumns, spineWidthPx } from '../../src/views/shelf'
import { BOOK_STATUSES, FORMATS } from '../../src/data/types'
import { defaultFilters } from '../../src/filters/filters'
import { fixtureCatalog } from '../fixtures/catalog'

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

const mounted: VueWrapper[] = []
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

function run(everything = false) {
  const app = useApp({ initial: { catalog: fixtureCatalog(), connectionsAvailable: true }, storage: fakeStorage() })
  app.lang.value = 'es'
  if (everything) {
    app.filters.value = { ...defaultFilters(), statuses: [...BOOK_STATUSES], formats: [...FORMATS] }
  }
  app.view.value = 'shelf'
  const wrapper = mount(App, { props: { app }, attachTo: document.body })
  mounted.push(wrapper)
  return { app, wrapper }
}

describe('spine and pile widths', () => {
  test('spineWidthPx follows the page count and is bounded', () => {
    expect(spineWidthPx(1000)).toBeCloseTo(84.5, 5)
    expect(spineWidthPx(30)).toBe(30)
    expect(spineWidthPx(undefined)).toBe(30)
    expect(spineWidthPx(5000)).toBe(92)
  })

  test('pileWidthPercent follows the page count and is bounded', () => {
    expect(pileWidthPercent(1000)).toBeCloseTo(91.45, 2)
    expect(pileWidthPercent(undefined)).toBe(52)
    expect(pileWidthPercent(100000)).toBe(100)
  })
})

describe('spineColumns', () => {
  test('a spine shows as many columns as its title asks for, or as its width holds', () => {
    // A short title on a thick book: room to spare, nothing to shorten.
    expect(spineColumns('A Short Title', 'novel', 1000)).toBe(4)
    // A long title on a thin book: the title decides, and the spine widens for it.
    expect(spineColumns('The Very Long and Winding Chronicle of the Amber Chartmakers', 'novel', 300)).toBe(3)
    // The thinnest spine still holds two, so a title that runs a little long wraps instead of being shortened.
    expect(spineColumns('Short', 'short', undefined)).toBe(2)
  })
})

describe('the shelf', () => {
  test('tapping a spine selects and does not mark', async () => {
    const { app, wrapper } = run()
    await wrapper.find('button.vol[aria-label^="Camino de ceniza,"]').trigger('click')
    expect(app.selectedId.value).toBe('ash-road')
    expect(app.state.value.marks['ash-road']).toBeUndefined()
  })

  test('spines are buttons named with the full title, the world and the state', () => {
    const { wrapper } = run()
    const spine = wrapper.find('button.vol[aria-label^="The Very Long"]')
    expect(spine.exists()).toBe(true)
    expect(spine.attributes('aria-label')).toBe(
      'The Very Long and Winding Chronicle of the Amber Chartmakers, Nalthis, Sin leer',
    )
    // The whole title is in the DOM, so name and text agree. Only CSS may shorten what is seen.
    expect(spine.text()).toBe('The Very Long and Winding Chronicle of the Amber Chartmakers')
  })

  test('the next book has class sig', () => {
    const { app, wrapper } = run()
    app.markBooks(['ash-road'], 'read')
    return wrapper.vm.$nextTick().then(() => {
      expect(wrapper.find('button.vol.sig').attributes('aria-label')).toContain('Puerto de cristal')
      expect(wrapper.findAll('button.vol.sig')).toHaveLength(1)
    })
  })

  test('the stamping book carries the stamp class', async () => {
    const { app, wrapper } = run()
    app.markBooks(['ash-road'], 'read')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('button.vol[aria-label^="Camino de ceniza,"] span').classes()).toContain('stamped')
  })

  test('grouped by phase, then role-playing, then still to come', () => {
    const { wrapper } = run(true)
    const headings = wrapper.findAll('.shelf h2').map((h) => h.text())
    expect(headings).toEqual(['Primera etapa', 'Libros de rol', 'Por venir'])
    const first = wrapper.findAll('.shelf section')[0]!
    expect(first.findAll('button.vol')).toHaveLength(8)
    expect(wrapper.findAll('.shelf section')[1]!.find('button.vol').attributes('aria-label')).toContain('Paper Wolves')
    expect(wrapper.findAll('.shelf section')[2]!.find('button.vol').attributes('aria-label')).toContain('Low Tide Atlas')
  })

  test('shows no connection data', () => {
    const { wrapper } = run()
    expect(wrapper.find('.shelf').html()).not.toContain('LEAK-')
  })
})

describe('groupBooks', () => {
  test('orders phases ascending and keeps the books order inside a group', () => {
    const books = fixtureCatalog().books
    books[1]!.phase = 2
    const groups = groupBooks(books)
    expect(groups.map((g) => g.key)).toEqual(['phase-1', 'phase-2', 'rpg', 'future'])
    expect(groups[0]!.books.map((b) => b.id)).toEqual([
      'ash-road',
      'salt-and-lantern',
      'lantern-keeper',
      'copper-orchard',
      'orchard-dusk',
      'northern-gale',
      'long-title-book',
    ])
  })
})
