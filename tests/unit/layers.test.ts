import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../../src/App.vue'
import { useApp } from '../../src/app/useApp'
import LayerPicker from '../../src/components/LayerPicker.vue'
import { BOOK_STATUSES, FORMATS, MARK_STATUSES, type Book } from '../../src/data/types'
import { t } from '../../src/i18n'
import { FORMAT_INKS, isLayer, LAYERS, layerInk, layerLegend, READ_INKS, readValue, STATUS_INKS } from '../../src/views/layers'
import { fixtureCatalog } from '../fixtures/catalog'
import { nightBackdrops, worstOnNight } from '../support/night'

const css = readFileSync('src/design/tokens.css', 'utf8')
const ringCss = readFileSync('src/views/CircleView.vue', 'utf8')
const book = (extra: Partial<Book> = {}): Book => ({ ...fixtureCatalog().books[0]!, ...extra })

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

describe('the inks of the layers', () => {
  test('there are four layers, and the world comes first', () => {
    expect(LAYERS).toEqual(['world', 'status', 'format', 'read'])
    expect(isLayer('status')).toBe(true)
    for (const foreign of ['worlds', '', null, 3, undefined]) expect(isLayer(foreign)).toBe(false)
  })

  test('every status, format and mark has an ink', () => {
    for (const s of BOOK_STATUSES) expect(layerInk(book({ status: s }), 'status', 'none')).toBe(STATUS_INKS[s])
    for (const f of FORMATS) expect(layerInk(book({ format: f }), 'format', 'none')).toBe(FORMAT_INKS[f])
    for (const m of MARK_STATUSES) expect(layerInk(book(), 'read', m)).toBe(READ_INKS[readValue(m)])
    for (const ink of [...Object.values(STATUS_INKS), ...Object.values(FORMAT_INKS), ...Object.values(READ_INKS)]) expect(ink).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('a work with no mark is unread, and a dismissed one has its own ink', () => {
    expect(readValue('none')).toBe('unread')
    expect(readValue('skipped')).toBe('skipped')
    expect(new Set(Object.values(READ_INKS)).size).toBe(4)
  })

  test('inside one layer no two values share an ink', () => {
    for (const inks of [STATUS_INKS, FORMAT_INKS, READ_INKS]) expect(new Set(Object.values(inks)).size).toBe(Object.keys(inks).length)
  })

  const backdrops = nightBackdrops()
  const all = [
    ...Object.entries(STATUS_INKS).map(([k, v]) => [`status ${k}`, v] as const),
    ...Object.entries(FORMAT_INKS).map(([k, v]) => [`format ${k}`, v] as const),
    ...Object.entries(READ_INKS).map(([k, v]) => [`read ${k}`, v] as const),
  ]
  test.each(all)('%s passes 4.5:1 on the night, on every leather, in every sector, at every radius', (_name, ink) => {
    const worst = worstOnNight(ink, backdrops)
    expect(worst.ratio, worst.where).toBeGreaterThanOrEqual(4.5)
  })

  test('the world layer leaves the inks as they are', () => {
    for (const s of BOOK_STATUSES) for (const m of MARK_STATUSES) expect(layerInk(book({ status: s }), 'world', m)).toBeNull()
    expect(layerLegend('world')).toEqual([])
  })

  test('a value outside its list has no ink, and the world shows', () => {
    expect(layerInk(book({ status: 'lost' as Book['status'] }), 'status', 'none')).toBeNull()
    expect(layerInk(book({ format: 'opera' as Book['format'] }), 'format', 'none')).toBeNull()
  })
})

describe('the legend', () => {
  test('it names every value of the layer, in order, with its ink', () => {
    expect(layerLegend('status').map((e) => e.value)).toEqual([...BOOK_STATUSES])
    expect(layerLegend('format').map((e) => e.value)).toEqual([...FORMATS])
    expect(layerLegend('read').map((e) => e.value)).toEqual(['read', 'reading', 'unread', 'skipped'])
    for (const layer of ['status', 'format', 'read'] as const) for (const e of layerLegend(layer)) expect(e.ink).toMatch(/^#[0-9a-f]{6}$/)
  })

  test('the legend carries no number, in either language', () => {
    for (const layer of ['status', 'format', 'read'] as const) {
      for (const lang of ['es', 'en'] as const) {
        const w = mount(LayerPicker, { props: { layer, lang } })
        expect(w.find('.legend').text()).not.toMatch(/\d/)
        expect(w.findAll('.legend li')).toHaveLength(layerLegend(layer).length)
        for (const e of layerLegend(layer)) expect(w.find('.legend').text()).toContain(t(e.label, lang))
      }
    }
  })
})

describe('the legend on the ring', () => {
  test('told which values are on show, it names only those', () => {
    const w = mount(LayerPicker, { props: { layer: 'format', lang: 'en', onShow: new Set(['novel', 'short']) } })
    expect(w.findAll('.legend li').map((li) => li.text())).toEqual([t('formatNovel', 'en'), t('formatShort', 'en')])
  })

  test('on the page it names the values the works on show have, and no other', async () => {
    const app = useApp({ initial: { catalog: fixtureCatalog(), connectionsAvailable: true }, storage: fakeStorage() })
    app.view.value = 'map'
    app.layer.value = 'status'
    const w = mount(App, { props: { app } })
    await nextTick()
    const statuses = new Set(app.shownBooks.value.map((b) => b.status))
    expect(w.findAll('.legend li')).toHaveLength(statuses.size)
    expect(w.find('.legend').text()).not.toMatch(/\d/)
    app.layer.value = 'read'
    await nextTick()
    expect(w.findAll('.legend li').map((li) => li.text())).toEqual([t('stateUnread', app.lang.value)])
  })
})

describe('the picker', () => {
  test('four buttons in a named group, the layer in use pressed', () => {
    const w = mount(LayerPicker, { props: { layer: 'format', lang: 'en' } })
    const group = w.get('[role=group]')
    expect(group.attributes('aria-label')).toBe(t('layerGroup', 'en'))
    const buttons = group.findAll('button')
    expect(buttons.map((b) => b.text())).toEqual([t('filterWorld', 'en'), t('layerStatus', 'en'), t('filterFormat', 'en'), t('layerRead', 'en')])
    expect(buttons.map((b) => b.attributes('aria-pressed'))).toEqual(['false', 'false', 'true', 'false'])
    for (const b of buttons) expect(b.attributes('type')).toBe('button')
  })

  test('pressing a button asks for its layer', async () => {
    const w = mount(LayerPicker, { props: { layer: 'world', lang: 'es' } })
    await w.findAll('button')[3]!.trigger('click')
    expect(w.emitted('update:layer')).toEqual([['read']])
  })

  test('with the world layer there is no legend', () => {
    expect(mount(LayerPicker, { props: { layer: 'world', lang: 'es' } }).find('.legend').exists()).toBe(false)
  })

  test('the legend says its colours to nobody twice: the swatches are decoration', () => {
    const w = mount(LayerPicker, { props: { layer: 'status', lang: 'es' } })
    for (const swatch of w.findAll('.legend .swatch')) expect(swatch.attributes('aria-hidden')).toBe('true')
  })
})

describe('the layer on the ring', () => {
  const setup = (storage: Storage = fakeStorage()) => {
    const app = useApp({ initial: { catalog: fixtureCatalog(), connectionsAvailable: true }, storage })
    app.view.value = 'map'
    return { app, storage }
  }
  const inkOf = (el: Element) => (el as HTMLElement).style.getPropertyValue('--layer-ink')

  test('with the world layer no title carries a layer ink, and the ring says so', () => {
    const { app } = setup()
    const w = mount(App, { props: { app } })
    expect(w.get('.app').attributes('data-layer')).toBe('world')
    for (const title of w.findAll('.ring-svg .t')) expect(inkOf(title.element)).toBe('')
  })

  test('choosing a layer paints every title with the ink of its value', async () => {
    const { app } = setup()
    const w = mount(App, { props: { app } })
    app.layer.value = 'status'
    await w.vm.$nextTick()
    expect(w.get('.app').attributes('data-layer')).toBe('status')
    const titles = w.findAll('.ring-svg .t')
    expect(titles.length).toBeGreaterThan(0)
    const shown = app.shownBooks.value
    expect(new Set(titles.map((x) => inkOf(x.element)))).toEqual(new Set(shown.map((b) => STATUS_INKS[b.status])))
  })

  test('the read layer follows the marks', async () => {
    const { app } = setup()
    const w = mount(App, { props: { app } })
    app.layer.value = 'read'
    const first = app.shownBooks.value.find((b) => b.status === 'published')!
    app.markBooks([first.id], 'read')
    await w.vm.$nextTick()
    const title = w.findAll('.ring-svg .t').find((x) => x.attributes('aria-label')!.startsWith(first.titles.es ?? first.titles.en))!
    expect(inkOf(title.element)).toBe(READ_INKS.read)
  })

  test('the picker is on the ring views and not on the shelf', async () => {
    const { app } = setup()
    const w = mount(App, { props: { app } })
    expect(w.find('.layers').exists()).toBe(true)
    await w.findAll('.layers button')[2]!.trigger('click')
    expect(app.layer.value).toBe('format')
    app.view.value = 'shelf'
    await w.vm.$nextTick()
    expect(w.find('.layers').exists()).toBe(false)
  })

  test('the layer is remembered across reloads', async () => {
    const { app, storage } = setup()
    app.layer.value = 'format'
    await nextTick()
    expect(setup(storage).app.layer.value).toBe('format')
  })

  test('a layer ink only colours a title while a layer other than the world is on', () => {
    const uses = [...(css + ringCss).matchAll(/([^{}]+)\{[^{}]*var\(--layer-ink/g)]
    expect(uses.length).toBeGreaterThan(0)
    for (const use of uses) expect(use[1]).toMatch(/\.app\[data-layer\]:not\(\[data-layer=world\]\)/)
  })

  test('the picker never floats: it has a row of its own on the PC and its own room on the phone', () => {
    expect(css).not.toMatch(/(?:\.layer-picker|\.layers|\.legend)[^{}]*\{[^}]*position: (?:absolute|fixed|sticky)/)
    const wide = css.slice(css.lastIndexOf('@media (min-width: 1280px) {'))
    expect(wide).toMatch(/\.cover:not\(\.interior\) \{[^}]*grid-template-areas: 'area' 'layers' 'foot'/)
    expect(wide).toMatch(/\.layer-picker \{[^}]*grid-area: layers/)
  })

  test('on the PC the picker comes after the plate, so the plate is the stop after the ring', () => {
    const app = useApp({ initial: { catalog: fixtureCatalog(), connectionsAvailable: true }, storage: fakeStorage() })
    app.view.value = 'map'
    const w = mount(App, { props: { app } })
    const order = [...w.get('.cover').element.children].map((el) => (el.getAttribute('class') ?? '').split(' ')[0])
    expect(order.indexOf('layer-picker')).toBeGreaterThan(order.indexOf('slot'))
    expect(order.indexOf('layer-picker')).toBeLessThan(order.indexOf('foot-area'))
  })
})
