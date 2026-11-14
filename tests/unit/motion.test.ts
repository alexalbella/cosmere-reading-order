import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../../src/App.vue'
import { resetFirstRing } from '../../src/app/firstRing'
import { useApp } from '../../src/app/useApp'
import { WORLDS } from '../../src/design/worlds'
import { fixtureCatalog } from '../fixtures/catalog'

// The motion of the visual pass: the ring's entrance, the halo and the planet's pulse, the motes of a stamp, the
// card that unfolds, the drawers, and the ink of a text just asked for. All of it exists only when motion is
// welcome, and none of it knows anything a hidden entry holds.

const tokens = readFileSync('src/design/tokens.css', 'utf8')
const ring = readFileSync('src/views/CircleView.vue', 'utf8')
const block = (css: string): string => /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/.exec(css)?.[0] ?? ''

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
function run(view: 'map' | 'circle' | 'shelf' = 'map') {
  const app = useApp({ initial: { catalog: fixtureCatalog(), connectionsAvailable: true }, storage: fakeStorage() })
  app.lang.value = 'es'
  app.view.value = view
  const wrapper = mount(App, { props: { app }, attachTo: document.body })
  mounted.push(wrapper)
  return { app, wrapper }
}

const proto = HTMLElement.prototype as unknown as { animate?: unknown }
/** A browser where motion is welcome (or not) and elements can animate. */
function browser(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), media: query, addEventListener: () => {}, removeEventListener: () => {} }))
  proto.animate = vi.fn(() => ({ onfinish: null, oncancel: null }))
}

beforeEach(() => resetFirstRing())
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  delete proto.animate
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('motion exists only when it is welcome', () => {
  test('the card, the drawers, the ink and the motes are declared under no-preference, and nowhere else', () => {
    const inside = block(tokens)
    const outside = tokens.replace(inside, '')
    for (const rule of ['.slot[data-side=right] > .plate', '.slot[data-side=left] > .plate', '.slot[data-side] > .panel', '.syn-text, .note-text']) expect(inside).toContain(rule)
    for (const name of ['unfold', 'drawer', 'ink']) {
      expect(inside).toMatch(new RegExp(`animation: ${name} `))
      expect(outside).not.toMatch(new RegExp(`animation: ${name} `))
    }
    // The reader who asked for less motion never sees a mote, even if one were made.
    expect(tokens).toMatch(/prefers-reduced-motion: reduce\) \{[\s\S]*?\.mote \{ display: none; \}/)
  })

  test('the entrance, the halo and the pulse of the ring are declared under no-preference, and nowhere else', () => {
    const inside = block(ring.slice(ring.indexOf('<style')))
    const outside = ring.slice(ring.indexOf('<style')).replace(inside, '')
    for (const name of ['ring-draw', 'ring-seat', 'planet-pulse']) {
      expect(inside).toMatch(new RegExp(`animation: ${name} `))
      expect(outside).not.toMatch(new RegExp(`animation: ${name} `))
    }
    expect(inside).toMatch(/\.t \.t-box \{[^}]*transition:[^}]*text-shadow/)
    expect(outside).not.toMatch(/transition:[^;}]*text-shadow/)
  })

  test('nothing new is left held when it ends: every new animation fills backwards only', () => {
    // A finished animation that keeps filling is still running for the page, and the tests that wait for the
    // page to be still would wait for ever.
    const rules = [...block(tokens).matchAll(/animation: (?:unfold|drawer|ink)[^;]*;/g), ...block(ring.slice(ring.indexOf('<style'))).matchAll(/animation: (?:ring-draw|ring-seat|planet-pulse)[^;]*;/g)].map((m) => m[0])
    expect(rules.length).toBeGreaterThanOrEqual(6)
    for (const rule of rules) {
      expect(rule).toMatch(/backwards/)
      expect(rule).not.toMatch(/\bboth\b|forwards|infinite/)
    }
  })

  test('no animation is aimed at anything but what is already on show', () => {
    // Every animated selector of the pass names something drawn from the public catalogue or from a text the reader
    // has just opened. Hidden lines, synopses and notes are not in the page, so nothing can be aimed at them.
    const selectors = [...(block(tokens) + block(ring.slice(ring.indexOf('<style')))).matchAll(/([^{}]+)\{[^{}]*animation:/g)].map((m) => m[1]!.trim())
    const allowed = /sky|ring-window|zoom|sentence-col|stamped|line-new|entering|ring-entrance|rising|fuse|plate|panel|syn-text|note-text|glint|entered|resettled|t-ghost|arc-band|disc-line|planet|\.ink/
    for (const selector of selectors) expect(selector, selector).toMatch(allowed)
    for (const word of ['locked', 'hidden', 'gated', 'requires']) for (const selector of selectors) expect(selector).not.toContain(word)
  })
})

describe('the card and the drawers', () => {
  test('the slot says which drawer is open, for it to open from its corner', async () => {
    const { wrapper } = run()
    expect(wrapper.get('.slot').attributes('data-panel')).toBeUndefined()
    await wrapper.get('.m-filters').trigger('click')
    expect(wrapper.get('.slot').attributes('data-panel')).toBe('filters')
    await wrapper.get('.m-settings').trigger('click')
    expect(wrapper.get('.slot').attributes('data-panel')).toBe('settings')
    await wrapper.get('.m-settings').trigger('click')
    expect(wrapper.get('.slot').attributes('data-panel')).toBeUndefined()
  })

  test('every drawer has a corner to open from', () => {
    for (const name of ['filters', 'settings', 'spoilers', 'how']) expect(block(tokens)).toMatch(new RegExp(`\\.slot\\[data-panel=${name}\\] > \\.panel[^{]*\\{[^}]*--corner:`))
  })
})

describe('the ring', () => {
  test('titles keep their nodes when the arrangement changes', async () => {
    const { app, wrapper } = run('map')
    const before = new Map(wrapper.findAll('.ring-svg .t').map((t) => [t.attributes('aria-label')!, t.element]))
    expect(before.size).toBeGreaterThan(3)
    app.view.value = 'circle'
    await nextTick()
    const after = wrapper.findAll('.ring-svg .t')
    expect(after).toHaveLength(before.size)
    for (const t of after) expect(t.element).toBe(before.get(t.attributes('aria-label')!))
    app.view.value = 'map'
    await nextTick()
    for (const t of wrapper.findAll('.ring-svg .t')) expect(t.element).toBe(before.get(t.attributes('aria-label')!))
  })

  test('the first ring of the visit makes its entrance, and no ring after it', async () => {
    browser(false)
    const first = run('map')
    expect(first.wrapper.get('.ring-svg').classes()).toContain('ring-entrance')
    // Each title knows its turn, for the titles to take their seats one after another.
    const turns = first.wrapper.findAll('.ring-svg .t').map((t) => (t.element as HTMLElement).style.getPropertyValue('--seat'))
    expect(turns).toEqual(turns.map((_, i) => String(i)))
    first.app.view.value = 'shelf'
    await nextTick()
    first.app.view.value = 'map'
    await nextTick()
    expect(first.wrapper.get('.ring-svg').classes()).not.toContain('ring-entrance')
    expect(run('circle').wrapper.get('.ring-svg').classes()).not.toContain('ring-entrance')
  })

  test('with less motion asked for, no ring makes an entrance', () => {
    browser(true)
    expect(run('map').wrapper.get('.ring-svg').classes()).not.toContain('ring-entrance')
  })

  test('the bands and the lines of the disc can draw themselves: their length is one', () => {
    const { wrapper } = run('map')
    for (const path of wrapper.findAll('.arc-band, .disc-line')) expect(path.attributes('pathLength')).toBe('1')
  })

  test('choosing a title makes the planet of its world pulse once, and only that one', async () => {
    vi.useFakeTimers()
    browser(false)
    const { app, wrapper } = run('map')
    const book = app.shownBooks.value[0]!
    expect(wrapper.findAll('.planet.pulse')).toHaveLength(0)
    app.selectBook(book.id)
    await nextTick()
    const pulsing = wrapper.findAll('.planet.pulse')
    expect(pulsing).toHaveLength(1)
    expect(pulsing[0]!.attributes('data-planet')).toBe(book.world)
    vi.advanceTimersByTime(1200)
    await nextTick()
    expect(wrapper.findAll('.planet.pulse')).toHaveLength(0)
  })

  test('the pulse ends with its animation, without waiting for the timer', async () => {
    browser(false)
    const { app, wrapper } = run('map')
    app.selectBook(app.shownBooks.value[0]!.id)
    await nextTick()
    await wrapper.get('.planet.pulse').trigger('animationend')
    expect(wrapper.findAll('.planet.pulse')).toHaveLength(0)
  })

  test('the entrance has a class of its own: the area wears «entering» while a view fades in', () => {
    const style = ring.slice(ring.indexOf('<style'))
    expect(style).not.toMatch(/\.entering\b/)
    expect(style).toMatch(/\.ring-entrance \.arc-band/)
  })
})

describe('with less motion asked for', () => {
  test('choosing a title pulses no planet', async () => {
    browser(true)
    const { app, wrapper } = run('map')
    app.selectBook(app.shownBooks.value[0]!.id)
    await nextTick()
    expect(wrapper.findAll('.planet.pulse')).toHaveLength(0)
  })
})

describe('the motes of a stamp', () => {
  test('marking a work read sends motes from its title, in the tone of its world', async () => {
    browser(false)
    const { app, wrapper } = run('map')
    const book = app.shownBooks.value.find((b) => b.status === 'published')!
    app.markBooks([book.id], 'read')
    await nextTick()
    await nextTick()
    const pieces = [...document.body.querySelectorAll<HTMLElement>('.mote')]
    expect(pieces.length).toBeGreaterThan(0)
    expect(pieces.length).toBeLessThanOrEqual(22)
    for (const piece of pieces) expect(piece.style.getPropertyValue('--c')).toBe(WORLDS[book.world].tone)
    // Outside the app's own tree, so no snapshot of the app ever holds one.
    expect(wrapper.element.querySelectorAll('.mote')).toHaveLength(0)
  })

  test('no motes for a mark that is not «read», nor on the shelf, where there is no title on a ring', async () => {
    browser(false)
    const ringRun = run('map')
    const book = ringRun.app.shownBooks.value.find((b) => b.status === 'published')!
    ringRun.app.markBooks([book.id], 'reading')
    await nextTick()
    await nextTick()
    expect(document.body.querySelectorAll('.mote')).toHaveLength(0)
    const shelf = run('shelf')
    shelf.app.markBooks([book.id], 'read')
    await nextTick()
    await nextTick()
    expect(document.body.querySelectorAll('.mote')).toHaveLength(0)
  })

  test('with less motion asked for, a stamp sends none', async () => {
    browser(true)
    const { app } = run('map')
    const book = app.shownBooks.value.find((b) => b.status === 'published')!
    app.markBooks([book.id], 'read')
    await nextTick()
    await nextTick()
    expect(document.body.querySelectorAll('.mote')).toHaveLength(0)
  })
})
