import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../../src/App.vue'
import { useApp } from '../../src/app/useApp'
import { BOOK_STATUSES, FORMATS, WORLD_KEYS, type Book, type Catalog, type WorldKey } from '../../src/data/types'
import { defaultFilters } from '../../src/filters/filters'
import {
  DISC_RADIUS,
  labelBox,
  layoutCircle,
  layoutRing,
  linePath,
  mapOrder,
  nearestBook,
  OUTER_RADIUS,
  placeLabels,
  polar,
  ringFit,
  settleTitles,
  splitArc,
  stepAngle,
  titleLines,
  turn,
} from '../../src/views/circle'
import { settle, zoomAbout } from '../../src/views/panZoom'
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

function works(n: number, world: (i: number) => WorldKey = () => 'sel'): Book[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `work-${i}`,
    titles: { en: `Invented Work Number ${i}`, es: null },
    esEdition: { status: 'none' as const },
    world: world(i),
    series: null,
    format: 'novel' as const,
    status: 'published' as const,
    order: { recommended: i + 1, publication: i + 1 },
    phase: 1,
  }))
}
const everyOtherWorld = (i: number): WorldKey => WORLD_KEYS[i % WORLD_KEYS.length]!

const mounted: VueWrapper[] = []
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

/** Below 1280 px, as App.vue asks the browser. */
function stubPhone(): void {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('max-width: 1279px'),
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function run(catalog: Catalog = fixtureCatalog()) {
  const app = useApp({ initial: { catalog, connectionsAvailable: true }, storage: fakeStorage() })
  app.lang.value = 'es'
  app.view.value = 'circle'
  const wrapper = mount(App, { props: { app }, attachTo: document.body })
  mounted.push(wrapper)
  return { app, wrapper }
}

const lines = (w: VueWrapper) => w.findAll('.linea')
const titleOf = (w: VueWrapper, start: string): DOMWrapper<Element> => w.find(`.t[aria-label^="${start}"]`)
const arcOf = (w: VueWrapper, world: string): DOMWrapper<Element> => w.find(`.arc[data-arc="${world}"]`)

describe('layoutCircle', () => {
  test('angles are strictly increasing and below 360', () => {
    const { angles } = layoutCircle(fixtureCatalog().books)
    const values = Object.values(angles)
    expect(values).toHaveLength(10)
    values.forEach((a, i) => {
      expect(a).toBeLessThan(360)
      expect(a).toBeGreaterThan(i === 0 ? 0 : values[i - 1]!)
    })
  })

  test('follows the formula from the design', () => {
    const books = fixtureCatalog().books
    const changes = 2 // sel, scadrial, nalthis
    const step = 360 / (books.length + changes * 0.22 + 0.6)
    expect(stepAngle(books)).toBeCloseTo(step, 9)
    const { angles } = layoutCircle(books)
    expect(angles['ash-road']).toBeCloseTo(step * 0.3, 9)
    expect(angles['glass-harbour']).toBeCloseTo(step * 1.3, 9)
    expect(angles['copper-orchard']).toBeCloseTo(step * (4.3 + 0.22), 9)
  })

  test('one arc per contiguous world run', () => {
    const books = works(6, (i) => (['sel', 'sel', 'roshar', 'sel', 'nalthis', 'nalthis'] as const)[i]!)
    const { arcs, angles } = layoutCircle(books)
    expect(arcs.map((a) => a.world)).toEqual(['sel', 'roshar', 'sel', 'nalthis'])
    arcs.forEach((a) => expect(a.from).toBeLessThan(a.to))
    // An arc covers its own books and leaves a gap before the next run.
    expect(arcs[0]!.to).toBeGreaterThan(angles['work-1']!)
    expect(arcs[1]!.from).toBeGreaterThan(arcs[0]!.to)
  })

  test('an empty or one-book list does not divide by zero', () => {
    expect(layoutCircle([])).toMatchObject({ angles: {}, arcs: [], lanes: [] })
    expect(layoutRing([], 'map')).toMatchObject({ angles: {}, arcs: [], lanes: [] })
    const one = layoutCircle(works(1))
    expect(Number.isFinite(one.angles['work-0'])).toBe(true)
    expect(one.arcs).toHaveLength(1)
    expect(Number.isFinite(one.arcs[0]!.from) && Number.isFinite(one.arcs[0]!.to)).toBe(true)
  })

  test('copes with 105 works, even with a world change at every one', () => {
    const { angles, arcs } = layoutCircle(works(105, everyOtherWorld))
    const values = Object.values(angles)
    expect(values).toHaveLength(105)
    expect(values.at(-1)).toBeLessThan(360)
    expect(arcs).toHaveLength(105)
    // The ring closes without the last arc running into the first.
    expect(arcs.at(-1)!.to).toBeLessThan(arcs[0]!.from + 360)
  })
})

describe('linePath', () => {
  const numbers = (d: string): number[] => d.match(/-?\d+(\.\d+)?/g)!.map(Number)

  test('runs from the first dot to the second', () => {
    const [x1, y1] = polar(30, 214)
    const [x2, y2] = polar(200, 214)
    const d = linePath(30, 200, 214)
    expect(d.startsWith(`M${x1.toFixed(1)} ${y1.toFixed(1)} C`)).toBe(true)
    expect(d.endsWith(` ${x2.toFixed(1)} ${y2.toFixed(1)}`)).toBe(true)
  })

  test('books across the ring are joined through the centre, and neighbours by a shallow curve', () => {
    const fromCentre = (d: string): number => {
      const [, , cx, cy] = numbers(d)
      return Math.hypot(cx! - 500, cy! - 500)
    }
    expect(fromCentre(linePath(0, 180, 200))).toBeLessThan(1)
    expect(fromCentre(linePath(0, 8, 200))).toBeGreaterThan(170)
    // The pull depends on how far apart the two are, not on which way round the ring is counted.
    expect(fromCentre(linePath(350, 10, 200))).toBeCloseTo(fromCentre(linePath(0, 20, 200)), 0)
  })

  test('the short way round never exceeds half a turn', () => {
    expect(turn(350, 10)).toBe(20)
    expect(turn(10, 350)).toBe(-20)
    expect(Math.abs(turn(0, 180))).toBe(180)
  })

  test('angle zero is at the top and the order runs clockwise', () => {
    const [topX, topY] = polar(0, 100)
    expect(topX).toBeCloseTo(500, 6)
    expect(topY).toBeCloseTo(400, 6)
    const [rightX, rightY] = polar(90, 100)
    expect(rightX).toBeCloseTo(600, 6)
    expect(rightY).toBeCloseTo(500, 6)
  })
})

describe('nearestBook', () => {
  test('picks the closest angle, across the top of the ring too', () => {
    const angles = { a: 10, b: 180, c: 350 }
    expect(nearestBook(angles, 20)).toBe('a')
    expect(nearestBook(angles, 170)).toBe('b')
    expect(nearestBook(angles, 359)).toBe('c')
    expect(nearestBook(angles, 1)).toBe('a')
    expect(nearestBook({}, 10)).toBeNull()
  })
})

describe('ringFit', () => {
  const fitFor = (n: number, world?: (i: number) => WorldKey) => ringFit(stepAngle(works(n, world)))

  test('on a ring of 1000 px, 32 works take 15 units and one line of 32 characters', () => {
    const fit = fitFor(32, (i) => WORLD_KEYS[Math.floor(i / 3) % 8]!)
    expect(fit).toEqual({ radius: 190, fontSize: 15, maxChars: 32, maxLines: 1 })
  })

  test('a small ring, whose one line would be short, breaks its titles in two', () => {
    expect(ringFit(stepAngle(works(12)), 560).maxLines).toBe(2)
  })

  test('zooming in leaves the letters their size on screen, and gives the titles more room', () => {
    const step = stepAngle(works(60))
    const whole = ringFit(step, 900)
    const zoomed = ringFit(step, 900 * 3)
    expect(zoomed.fontSize).toBeLessThan(whole.fontSize)
    expect((zoomed.fontSize * 2700) / 1000).toBeGreaterThanOrEqual(14)
    expect(zoomed.maxChars).toBeGreaterThan(whole.maxChars)
  })

  test('with the role-playing books on, titles stay on one line', () => {
    expect(fitFor(52, (i) => WORLD_KEYS[Math.floor(i / 3) % 8]!).maxLines).toBe(1)
  })

  test('labels grow on a small ring, so they stay near 14 px', () => {
    const fit = ringFit(stepAngle(works(32)), 600)
    expect(fit.fontSize).toBe(24)
    expect((fit.fontSize * 600) / 1000).toBeGreaterThanOrEqual(14)
    expect(ringFit(stepAngle(works(32)), 300).fontSize).toBe(24)
  })

  test.each([1000, 800, 600])('neighbouring labels never collide at any count, on a %i px ring', (px) => {
    for (const world of [undefined, everyOtherWorld]) {
      for (let n = 1; n <= 105; n++) {
        const step = stepAngle(works(n, world))
        const fit = ringFit(step, px)
        const gap = fit.radius * Math.sin((Math.min(step, 90) * Math.PI) / 180)
        expect(gap).toBeGreaterThanOrEqual(fit.fontSize * (fit.maxLines === 2 ? 2.04 : 1.08) - 1e-9)
      }
    }
  })

  test('at 105 works the labels shrink, but stay readable and inside the arcs', () => {
    const fit = fitFor(105, (i) => WORLD_KEYS[Math.floor(i / 3) % 8]!)
    expect(fit.maxLines).toBe(1)
    expect(fit.fontSize).toBeLessThan(20)
    expect(fit.fontSize).toBeGreaterThanOrEqual(14)
    expect(fit.radius + fit.maxChars * fit.fontSize * 0.448).toBeLessThanOrEqual(480)
  })
})

describe('titleLines', () => {
  test('a short title is left alone', () => {
    expect(titleLines('Ash Road', 27, 2)).toEqual(['Ash Road'])
  })

  test('a longer one breaks at the most even word', () => {
    expect(titleLines('Sombras para el silencio en los bosques del infierno', 27, 2)).toEqual([
      'Sombras para el silencio ',
      'en los bosques del infierno',
    ])
  })

  test.each([
    ['The Very Long and Winding Chronicle of the Amber Chartmakers', 27, 2],
    ['The Very Long and Winding Chronicle', 12, 1],
    ['Unbreakablelongword', 10, 2],
  ] as const)('nothing is cut: the lines are always the whole title (%s)', (title, chars, lines) => {
    const drawn = titleLines(title, chars, lines)
    expect(drawn.length).toBeLessThanOrEqual(lines)
    expect(drawn.join('')).toBe(title)
  })
})

describe('settleTitles', () => {
  // A ring whose titles take one line: 52 works.
  const step = stepAngle(works(52))
  const fit = ringFit(step, 800)
  const one = (text: string) => ({ text, reserve: 0, back: 0 })

  test('the ring in question sets its titles on one line', () => {
    expect(fit.maxLines).toBe(1)
  })

  test('a title that fits is left on one line, at full size, where the titles start', () => {
    expect(settleTitles([one('Ash Road')], fit, step)).toEqual([{ lines: ['Ash Road'], back: 0 }])
  })

  test('a title a little too long is not made smaller: it takes two lines of its own', () => {
    const [set] = settleTitles([one('A Title Just Past Its Room')], fit, step)
    expect(set!.lines).toEqual(['A Title Just ', 'Past Its Room'])
    expect(set!.back).toBeGreaterThan(0)
  })

  test('a title far too long takes two lines, further out, and loses nothing', () => {
    const long = 'The Very Long and Winding Chronicle of the Amber Chartmakers'
    const [set] = settleTitles([one(long)], fit, step)
    expect(set!.lines).toHaveLength(2)
    expect(set!.lines.join('')).toBe(long)
    // Two lines clear a one-line neighbour only from here out.
    expect(fit.radius + set!.back).toBeGreaterThanOrEqual((1.6 * fit.fontSize) / Math.sin((step * Math.PI) / 180) - 1e-9)
  })

  test('two neighbours never both take two lines', () => {
    const long = 'The Very Long and Winding Chronicle of the Amber Chartmakers'
    const set = settleTitles([one(long), one(long), one(long)], fit, step)
    expect(set.map((s) => s.lines.length)).toEqual([2, 1, 2])
  })

  test('where the whole ring already takes two lines, nothing is set apart', () => {
    const wide = stepAngle(works(12))
    const roomy = ringFit(wide, 560)
    expect(roomy.maxLines).toBe(2)
    const [set] = settleTitles([one('The Very Long and Winding Chronicle of the Amber Chartmakers')], roomy, wide)
    expect(set!.back).toBe(0)
  })
})

describe('a title too long for its one line', () => {
  const step = stepAngle(works(105))
  const fit = ringFit(step, 800)
  const one = (text: string) => ({ text, reserve: 0, back: 0 })

  test('keeps its last word, and the cut falls before it', () => {
    const [set] = settleTitles([one('The Stormlight Archive 6'), one('x')], fit, step)
    expect(set!.lines).toEqual(['The Stormlight Archive 6'])
    expect(set!.cut).toBe('The Stormlight Archive '.length)
  })

  test('a title that fits has no cut', () => {
    expect(settleTitles([one('Elantris')], fit, step)[0]!.cut).toBeUndefined()
  })

  test('a last word that is not a number is not kept: its neighbours may end in the same one', () => {
    expect(settleTitles([one('Alloy of Law (The Invented Adventure Game)'), one('x')], fit, step)[0]!.cut).toBeUndefined()
    expect(settleTitles([one('The Chronicle of the Chartmakersandmore'), one('x')], fit, step)[0]!.cut).toBeUndefined()
  })
})

describe('labelBox', () => {
  test('a title has the room from its radius to the bands, on either side, centred on its dot', () => {
    const fit = ringFit(stepAngle(works(32)))
    const right = labelBox(1, fit)
    const left = labelBox(-1, fit)
    expect(right.x).toBe(500 + fit.radius)
    expect(right.width).toBe(OUTER_RADIUS - fit.radius)
    expect(left.x + left.width).toBe(500 - fit.radius)
    expect(left.width).toBe(right.width)
    expect(right.y + right.height / 2).toBeCloseTo(500, 6)
    expect(right.height).toBeGreaterThan(fit.fontSize * fit.maxLines * 1.02)
    // A title set on two lines of its own has a box for two.
    expect(labelBox(1, fit, 0, 2).height).toBeGreaterThan(fit.fontSize * 2 * 1.02)
  })
})

describe('the map', () => {
  const inWorlds = (list: [string, WorldKey, string | null][]): Book[] =>
    list.map(([id, world, series], i) => ({ ...works(1)[0]!, id, world, series, order: { recommended: i + 1, publication: i + 1 } }))

  test('a world is never split, and neither is a series inside it', () => {
    const books = inWorlds([
      ['a', 'roshar', 'Storm'],
      ['b', 'sel', null],
      ['c', 'roshar', null],
      ['d', 'roshar', 'Storm'],
      ['e', 'sel', 'Elan'],
    ])
    const order = mapOrder(books).map((b) => `${b.world}:${b.series ?? '-'}`)
    const runsOf = (keys: string[]) => keys.filter((k, i) => i === 0 || keys[i - 1] !== k).length
    expect(runsOf(order.map((k) => k.split(':')[0]!))).toBe(2)
    expect(runsOf(order)).toBe(4)
  })

  test('a seat on the map decides the order, and a book without one follows the seated ones of its group', () => {
    const books = inWorlds([
      ['a', 'sel', null],
      ['b', 'roshar', null],
      ['c', 'roshar', null],
    ])
    books[1]!.place = 1
    books[0]!.place = 5
    expect(mapOrder(books).map((b) => b.id)).toEqual(['b', 'c', 'a'])
  })

  test('the ring closes on itself: worlds are a gap apart, the last from the first too', () => {
    const books = inWorlds([
      ['a', 'sel', null],
      ['b', 'sel', null],
      ['c', 'roshar', null],
      ['d', 'roshar', null],
    ])
    const { angles, step, arcs, lanes } = layoutRing(books, 'map')
    expect(arcs.map((a) => a.world)).toEqual(['sel', 'roshar'])
    expect(lanes).toEqual([])
    expect(angles['b']! - angles['a']!).toBeCloseTo(step, 9)
    expect(angles['c']! - angles['b']!).toBeCloseTo(step * 1.75, 9)
    // From the last book round to the first is the same gap.
    expect(angles['a']! + 360 - angles['d']!).toBeCloseTo(step * 1.75, 9)
  })

  test('a series of two or more has its own lane arc, and a book alone has none', () => {
    const books = inWorlds([
      ['a', 'sel', 'Elan'],
      ['b', 'sel', 'Elan'],
      ['c', 'sel', null],
      ['d', 'roshar', 'Storm'],
    ])
    const { lanes } = layoutRing(books, 'map')
    expect(lanes.map((l) => `${l.kind}:${l.name}`)).toEqual(['series:Elan'])
  })

  test('the map does not move a book when the reading order changes', () => {
    const books = fixtureCatalog().books
    const before = layoutRing(books, 'map').angles
    const shuffled = [...books].reverse()
    expect(layoutRing(shuffled, 'map').angles).toEqual(before)
  })

  test('with 105 works in every world the map still closes', () => {
    const { angles, arcs } = layoutRing(works(105, everyOtherWorld), 'map')
    const values = Object.values(angles)
    expect(values.every((a) => a > 0 && a < 360)).toBe(true)
    expect(arcs).toHaveLength(WORLD_KEYS.length)
  })
})

describe('placeLabels', () => {
  const options = { radius: 455, fontSize: 17, charWidth: 0.62, lanes: 2, overhang: true }

  test('a name is centred on its arc', () => {
    const [label] = placeLabels([{ key: 'a', text: 'Roshar', from: 40, to: 80 }], options)
    expect(label!.lane).toBe(0)
    expect(label!.d.startsWith('M')).toBe(true)
  })

  test('two names that would meet take different lanes, and a third that fits nowhere is left out', () => {
    const crowded = [
      { key: 'a', text: 'First of the Sun', from: 100, to: 103 },
      { key: 'b', text: 'Threnody', from: 104, to: 107 },
      { key: 'c', text: 'Taldain', from: 108, to: 111 },
    ]
    const placed = placeLabels(crowded, options)
    expect(placed.map((l) => `${l.key}${l.lane}`)).toEqual(['a0', 'b1'])
  })

  test('without overhang a name longer than its arc is left out', () => {
    const items = [{ key: 'a', text: 'First of the Sun', from: 100, to: 103 }]
    expect(placeLabels(items, { ...options, overhang: false })).toEqual([])
    expect(placeLabels([{ key: 'a', text: 'Sel', from: 100, to: 140 }], { ...options, overhang: false })).toHaveLength(1)
  })

  test('the last name does not run into the first across the top', () => {
    const items = [
      { key: 'first', text: 'Scadrial', from: 0, to: 6 },
      { key: 'last', text: 'Threnody', from: 354, to: 360 },
    ]
    expect(placeLabels(items, { ...options, lanes: 1 }).map((l) => l.key)).toEqual(['first'])
  })

  test('the name of the world in hand is placed first, so it is the last to go without', () => {
    const crowded = [
      { key: 'a', text: 'First of the Sun', from: 100, to: 103 },
      { key: 'b', text: 'Threnody', from: 104, to: 107 },
      { key: 'c', text: 'Taldain', from: 108, to: 111, priority: true },
    ]
    const placed = placeLabels(crowded, options)
    expect(placed.map((l) => l.key)).toContain('c')
    expect(placed[0]!.key).toBe('c')
  })

  test('on the lower half a name is turned to read left to right', () => {
    const top = placeLabels([{ key: 'a', text: 'Sel', from: 10, to: 50 }], options)[0]!
    const bottom = placeLabels([{ key: 'a', text: 'Sel', from: 160, to: 200 }], options)[0]!
    // Sweep flag 1 runs clockwise, 0 the other way.
    expect(/A[\d.]+ [\d.]+ 0 0 1 /.test(top.d)).toBe(true)
    expect(/A[\d.]+ [\d.]+ 0 0 0 /.test(bottom.d)).toBe(true)
  })

  test('a lane line opens for its name, and is whole without one', () => {
    expect(splitArc(423, 10, 60, 0)).toHaveLength(1)
    expect(splitArc(423, 10, 60, 12)).toHaveLength(2)
    expect(splitArc(423, 10, 20, 30)).toHaveLength(0)
  })
})

describe('pan and zoom', () => {
  test('the ring never leaves a gap at an edge', () => {
    expect(settle({ k: 0.4, x: 80, y: -5000 })).toEqual({ k: 1, x: 0, y: 0 })
    expect(settle({ k: 2, x: 300, y: -5000 })).toEqual({ k: 2, x: 0, y: -1000 })
    expect(settle({ k: 99, x: 0, y: 0 }).k).toBe(6)
  })

  test('zooming keeps the point under the pointer where it is', () => {
    const view = zoomAbout({ k: 1, x: 0, y: 0 }, 2, 700, 300)
    expect(view.k).toBe(2)
    // The point of the ring that was at (700, 300) is still drawn there.
    expect(700 * view.k + view.x).toBeCloseTo(700, 9)
    expect(300 * view.k + view.y).toBeCloseTo(300, 9)
  })
})

describe('the circle', () => {
  test('App shows the circle for view circle and the shelf for view shelf', async () => {
    const { app, wrapper } = run()
    expect(wrapper.find('svg.ring-svg').exists()).toBe(true)
    expect(wrapper.find('.shelf').exists()).toBe(false)
    app.view.value = 'shelf'
    await nextTick()
    expect(wrapper.find('svg.ring-svg').exists()).toBe(false)
    expect(wrapper.find('.shelf').exists()).toBe(true)
  })

  test('the seal sits at the centre, through its mask', () => {
    const { wrapper } = run()
    expect(wrapper.find('.ring .seal').attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('circle.disc').attributes('r')).toBe(String(DISC_RADIUS))
  })

  test('the ring is one tab stop, and it follows the selection', async () => {
    const { app, wrapper } = run()
    const stops = () => wrapper.findAll('svg.ring-svg [tabindex="0"]')
    expect(wrapper.findAll('.t[tabindex="-1"]')).toHaveLength(7)
    expect(stops()).toHaveLength(1)
    expect(stops()[0]!.attributes('aria-label')).toMatch(/^Camino de ceniza,/)
    app.selectBook('copper-orchard')
    await nextTick()
    expect(stops()).toHaveLength(1)
    expect(stops()[0]!.attributes('aria-label')).toMatch(/^Huerto de cobre,/)
  })

  test('with no selection on the ring, the first title is the stop', async () => {
    const { app, wrapper } = run()
    const stop = () => wrapper.findAll('svg.ring-svg [tabindex="0"]').map((el) => el.attributes('aria-label'))
    app.selectBook('copper-orchard')
    await nextTick()
    app.selectedId.value = null
    await nextTick()
    expect(stop()).toEqual([expect.stringMatching(/^Camino de ceniza,/)])
    app.selectBook('paper-wolves') // role-playing, off the ring by default
    await nextTick()
    expect(stop()).toEqual([expect.stringMatching(/^Camino de ceniza,/)])
  })

  test('arrow keys walk the ring and move nothing but the focus', async () => {
    const { app, wrapper } = run()
    const selected = app.selectedId.value
    const focused = () => document.activeElement?.getAttribute('aria-label') ?? ''
    const press = async (key: string) => {
      document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
      await nextTick()
    }
    ;(titleOf(wrapper, 'Camino de ceniza,').element as SVGGElement).focus()

    await press('ArrowRight')
    expect(focused()).toMatch(/^Puerto de cristal,/)
    await press('ArrowDown')
    expect(focused()).toMatch(/^Sal y farol,/)
    await press('ArrowLeft')
    expect(focused()).toMatch(/^Puerto de cristal,/)
    await press('ArrowUp')
    expect(focused()).toMatch(/^Camino de ceniza,/)
    await press('ArrowLeft')
    expect(focused()).toMatch(/^The Very Long/)
    await press('ArrowRight')
    expect(focused()).toMatch(/^Camino de ceniza,/)
    await press('ArrowRight')

    // Tab comes back where the arrows left it, and only Enter or Space select.
    const stops = wrapper.findAll('svg.ring-svg [tabindex="0"]')
    expect(stops.map((s) => s.attributes('aria-label'))).toEqual([expect.stringMatching(/^Puerto de cristal,/)])
    expect(app.selectedId.value).toBe(selected)
    expect(app.state.value.marks).toEqual({})

    await press('Enter')
    expect(app.selectedId.value).toBe('glass-harbour')
    expect(app.state.value.marks).toEqual({})
  })

  test('the bands are not tab stops, and are not announced as controls', () => {
    const { wrapper } = run()
    const arc = arcOf(wrapper, 'nalthis')
    expect(arc.attributes('tabindex')).toBeUndefined()
    expect(arc.attributes('role')).toBeUndefined()
    expect(arc.attributes('aria-pressed')).toBeUndefined()
    expect(arc.find('title').text()).toBe('Nalthis')
  })

  test('below 1280 px the bands do nothing of their own: a tap goes on to the nearest tick', async () => {
    stubPhone()
    const { app, wrapper } = run()
    await nextTick()
    const svg = wrapper.find('svg.ring-svg')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 }) as DOMRect
    const { angles } = layoutCircle(app.shownBooks.value)
    const [clientX, clientY] = polar(angles['orchard-dusk']!, 489)
    await arcOf(wrapper, 'scadrial').trigger('click', { clientX, clientY })
    expect(app.lifted.value).toBeNull()
    expect(wrapper.findAll('.arc.relief')).toHaveLength(0)
    expect(app.selectedId.value).toBe('orchard-dusk')
    expect(app.state.value.marks).toEqual({})
    expect(arcOf(wrapper, 'scadrial').find('title').exists()).toBe(false)
    expect(wrapper.find('svg.ring-svg').classes()).toContain('with-ticks')
  })

  test('changing the view fades the area in, and the first render does not', async () => {
    const { app, wrapper } = run()
    const area = wrapper.find('.area')
    expect(area.classes()).not.toContain('entering')
    app.view.value = 'shelf'
    await nextTick()
    expect(area.classes()).toContain('entering')
    await area.trigger('animationend')
    expect(area.classes()).not.toContain('entering')
  })

  test('on the phone the plate rises when it opens, not when it changes book', async () => {
    stubPhone()
    const { app, wrapper } = run()
    await nextTick()
    const slot = wrapper.find('.slot')
    app.selectedId.value = null
    await nextTick()
    expect(slot.classes()).not.toContain('rising')
    app.selectBook('ash-road')
    await nextTick()
    expect(slot.classes()).toContain('rising')
    await slot.trigger('animationend')
    expect(slot.classes()).not.toContain('rising')
    app.selectBook('glass-harbour')
    await nextTick()
    expect(slot.classes()).not.toContain('rising')
  })

  test('from 1280 px the plate does not rise', async () => {
    const { app, wrapper } = run()
    app.selectedId.value = null
    await nextTick()
    app.selectBook('ash-road')
    await nextTick()
    expect(wrapper.find('.slot').classes()).not.toContain('rising')
  })

  test('only visibleConnections draw lines', async () => {
    const { app, wrapper } = run()
    expect(lines(wrapper)).toHaveLength(0)

    app.markBooks(['glass-harbour', 'northern-gale'], 'read')
    await nextTick()
    // Its third requirement is unread: nothing is visible, so nothing is drawn.
    expect(app.visibleConnections.value).toHaveLength(0)
    expect(lines(wrapper)).toHaveLength(0)

    app.markBooks(['copper-orchard'], 'read')
    await nextTick()
    expect(app.visibleConnections.value.map((c) => c.id)).toEqual(['c-0002'])
    expect(lines(wrapper)).toHaveLength(1)

    // Turning filters on draws what they let through, and no more.
    app.filters.value = { ...defaultFilters(), connectionTypes: ['major', 'significant', 'minor'] }
    await nextTick()
    expect(app.visibleConnections.value.map((c) => c.id)).toEqual(['c-0002', 'c-0005'])
    expect(lines(wrapper)).toHaveLength(2)

    app.filters.value = { ...defaultFilters(), connectionTypes: [] }
    await nextTick()
    expect(lines(wrapper)).toHaveLength(0)
  })

  test('an appearance marker draws no line', async () => {
    const { app, wrapper } = run()
    app.filters.value = { ...defaultFilters(), connectionTypes: ['appearance'] }
    app.markBooks(['ash-road'], 'read')
    await nextTick()
    expect(app.visibleConnections.value.map((c) => c.to)).toEqual([null])
    expect(lines(wrapper)).toHaveLength(0)
  })

  test('a connection with an end off the ring draws no line', async () => {
    const { app, wrapper } = run()
    app.markBooks(['glass-harbour', 'northern-gale', 'copper-orchard'], 'read')
    await nextTick()
    expect(lines(wrapper)).toHaveLength(1)
    app.filters.value = { ...defaultFilters(), formats: ['novel'] } // glass-harbour is a novella
    await nextTick()
    expect(app.visibleConnections.value.map((c) => c.id)).toEqual(['c-0002'])
    expect(lines(wrapper)).toHaveLength(0)
  })

  test('a line carries nothing but its shape', async () => {
    const { app, wrapper } = run()
    app.markBooks(['ash-road', 'copper-orchard'], 'read')
    await nextTick()
    const line = lines(wrapper)[0]!
    expect(line.attributes('aria-hidden')).toBe('true')
    expect(line.element.tagName.toLowerCase()).toBe('path')
    expect(line.element.children).toHaveLength(0)
    expect(line.element.textContent).toBe('')
    expect(line.attributes('id')).toBeUndefined()
    const attributes = Object.keys(line.attributes()).filter((name) => !name.startsWith('data-v-'))
    expect(attributes.sort()).toEqual(['aria-hidden', 'class', 'd', 'pathLength'])
    expect(wrapper.find('svg.ring-svg').html()).not.toContain('LEAK-')
  })

  test('a book never moves when read', async () => {
    const { app, wrapper } = run()
    const places = () => wrapper.findAll('.t').map((t) => t.attributes('transform'))
    const before = places()
    app.markBooks(['ash-road', 'copper-orchard'], 'read')
    await nextTick()
    expect(places()).toEqual(before)
  })

  test('titles are keyboard focusable and Enter selects', async () => {
    const { app, wrapper } = run()
    const title = titleOf(wrapper, 'Puerto de cristal,')
    expect(title.attributes('role')).toBe('button')
    expect(title.attributes('tabindex')).toBe('-1')
    expect(title.attributes('aria-pressed')).toBe('false')

    await title.trigger('keydown', { key: 'Enter' })
    expect(app.selectedId.value).toBe('glass-harbour')
    expect(title.attributes('aria-pressed')).toBe('true')

    await titleOf(wrapper, 'Huerto de cobre,').trigger('keydown', { key: ' ' })
    expect(app.selectedId.value).toBe('copper-orchard')

    await titleOf(wrapper, 'Camino de ceniza,').trigger('keydown', { key: 'a' })
    expect(app.selectedId.value).toBe('copper-orchard')
    expect(app.state.value.marks).toEqual({})
  })

  test('tapping a title selects and does not mark', async () => {
    const { app, wrapper } = run()
    await titleOf(wrapper, 'Camino de ceniza,').trigger('click')
    expect(app.selectedId.value).toBe('ash-road')
    expect(app.state.value.marks['ash-road']).toBeUndefined()
  })

  test('long titles are truncated visually and keep the full title', () => {
    const { wrapper } = run()
    const full = 'The Very Long and Winding Chronicle of the Amber Chartmakers'
    const title = titleOf(wrapper, 'The Very Long')
    expect(title.attributes('aria-label')).toBe(`${full}, Nalthis, Sin leer`)
    // The whole title is in the DOM, so name and text agree. Only CSS shortens what is seen.
    expect(title.findAll('.t-text').map((line) => line.element.textContent).join('')).toBe(full)
    expect(title.html()).not.toContain('…')
    // The mouse can still read it whole.
    expect(title.find('.t-box').attributes('title')).toBe(full)
  })

  test('the new marker is seen, and stays out of the name it would contradict', () => {
    const { wrapper } = run((() => {
      const catalog = fixtureCatalog()
      catalog.books[0]!.addedOn = new Date().toISOString().slice(0, 10)
      return catalog
    })())
    const tag = titleOf(wrapper, 'Camino de ceniza,').find('.new-mark')
    expect(tag.exists()).toBe(true)
    expect(tag.attributes('aria-hidden')).toBe('true')
  })

  test('the states are told apart by more than colour', async () => {
    const { app, wrapper } = run()
    app.markBooks(['ash-road'], 'read')
    app.markBooks(['glass-harbour'], 'reading')
    app.markBooks(['salt-and-lantern'], 'skipped')
    app.unlockBook('northern-gale', true)
    await nextTick()
    expect(titleOf(wrapper, 'Camino de ceniza,').classes()).toContain('s-read')
    expect(titleOf(wrapper, 'Puerto de cristal,').classes()).toContain('s-reading')
    expect(titleOf(wrapper, 'Puerto de cristal,').find('.ribbon-mark').exists()).toBe(true)
    expect(titleOf(wrapper, 'Sal y farol,').classes()).toContain('s-skipped')
    expect(titleOf(wrapper, 'Vendaval del norte,').classes()).toContain('unlocked')
    const next = wrapper.findAll('.t.sig')
    expect(next).toHaveLength(1)
    expect(next[0]!.find('.next-ring').exists()).toBe(true)
    expect(next[0]!.attributes('aria-label')).toContain('The Lantern Keeper')
  })

  test('the selected title has a needle on the ring', async () => {
    const { app, wrapper } = run()
    app.selectBook('copper-orchard')
    await nextTick()
    expect(titleOf(wrapper, 'Huerto de cobre,').classes()).toContain('sel')
    expect(wrapper.findAll('.needle')).toHaveLength(1)
  })

  test('below 1280 px titles become ticks, and the plate names the selected one', async () => {
    stubPhone()
    const { wrapper } = run()
    await nextTick()
    expect(wrapper.findAll('.t foreignObject')).toHaveLength(0)
    expect(wrapper.findAll('.t .tick')).toHaveLength(8)

    const tick = titleOf(wrapper, 'Huerto de cobre,')
    expect(tick.attributes('aria-label')).toBe('Huerto de cobre, Scadrial, Sin leer')
    await tick.trigger('click')
    expect(wrapper.find('.plate-title').text()).toBe('Huerto de cobre')
    // The design does not repeat the title above the ring: the plate already says it.
    expect(wrapper.findAll('.area .t-text')).toHaveLength(0)
  })

  test('from 1280 px there are titles and no ticks', () => {
    const { wrapper } = run()
    expect(wrapper.findAll('.t foreignObject')).toHaveLength(8)
    expect(wrapper.findAll('.t .tick')).toHaveLength(0)
  })

  test('below 1280 px a tap anywhere on the ring picks the nearest tick', async () => {
    stubPhone()
    const { app, wrapper } = run()
    await nextTick()
    const svg = wrapper.find('svg.ring-svg')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 }) as DOMRect
    const { angles } = layoutCircle(app.shownBooks.value)
    const tapAt = async (angle: number, r: number) => {
      const [clientX, clientY] = polar(angle, r)
      await svg.trigger('click', { clientX, clientY })
    }

    await tapAt(angles['orchard-dusk']! + 1, 300)
    expect(app.selectedId.value).toBe('orchard-dusk')
    await tapAt(angles['northern-gale']! - 1, 490)
    expect(app.selectedId.value).toBe('northern-gale')

    // The seal in the middle is not the ring.
    await tapAt(angles['ash-road']!, 120)
    expect(app.selectedId.value).toBe('northern-gale')
    expect(app.state.value.marks).toEqual({})
  })

  test('from 1280 px a tap on the empty ring picks nothing', async () => {
    const { app, wrapper } = run()
    const svg = wrapper.find('svg.ring-svg')
    svg.element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 }) as DOMRect
    const before = app.selectedId.value
    await svg.trigger('click', { clientX: 500, clientY: 200 })
    expect(app.selectedId.value).toBe(before)
  })

  test('the page field colour is the current book\'s world', async () => {
    const { app, wrapper } = run()
    await nextTick()
    expect(document.body.dataset.world).toBe('sel')
    app.markBooks(['copper-orchard'], 'reading')
    await nextTick()
    expect(document.body.dataset.world).toBe('scadrial')
    expect(wrapper.find('.app').attributes('data-world')).toBe('scadrial')
  })

  test('selecting a world lifts its arc and drops the others to colourless relief', async () => {
    const { app, wrapper } = run()
    const band = (world: string) => arcOf(wrapper, world).find('.arc-band')
    expect(wrapper.findAll('.arc')).toHaveLength(3)
    expect(band('sel').attributes('style')).toContain('--arc-tone: var(--tone-sel)')
    expect(wrapper.findAll('.t.relief')).toHaveLength(0)

    await arcOf(wrapper, 'scadrial').trigger('click')
    expect(app.lifted.value).toBe('scadrial')
    expect(arcOf(wrapper, 'scadrial').classes()).toContain('lifted')
    expect(band('scadrial').attributes('style')).toContain('--arc-tone: var(--tone-scadrial)')
    for (const other of ['sel', 'nalthis']) {
      expect(arcOf(wrapper, other).classes()).toContain('relief')
      expect(band(other).attributes('style') ?? '').not.toContain('--arc-tone')
    }
    expect(titleOf(wrapper, 'Huerto de cobre,').classes()).not.toContain('relief')
    expect(titleOf(wrapper, 'Camino de ceniza,').classes()).toContain('relief')

    await arcOf(wrapper, 'scadrial').trigger('click')
    expect(app.lifted.value).toBeNull()
    expect(wrapper.findAll('.t.relief')).toHaveLength(0)
    expect(wrapper.findAll('.arc.relief')).toHaveLength(0)
  })

  test('the tone reaches the band through a custom property, never as an inline stroke', () => {
    const { wrapper } = run()
    expect(arcOf(wrapper, 'sel').find('.arc-band').attributes('style')).not.toMatch(/(^|[\s;])stroke:/)
  })

  test('the plate names the world in a real button: it lifts, and a second press lets go', async () => {
    const { app, wrapper } = run()
    const places = () => wrapper.findAll('.t').map((t) => t.attributes('transform'))
    const before = places()
    app.selectBook('copper-orchard')
    await nextTick()
    const selected = app.selectedId.value
    const world = wrapper.find('.plate button.plate-world')
    expect(world.text()).toBe('Scadrial')
    expect(world.attributes('aria-pressed')).toBe('false')

    await world.trigger('click')
    expect(app.lifted.value).toBe('scadrial')
    expect(world.attributes('aria-pressed')).toBe('true')
    expect(arcOf(wrapper, 'scadrial').classes()).toContain('lifted')
    expect(places()).toEqual(before)
    expect(app.selectedId.value).toBe(selected)
    expect(app.state.value.marks).toEqual({})

    await world.trigger('click')
    expect(app.lifted.value).toBeNull()
  })

  test('below 1280 px the plate is the touch route to lift a world', async () => {
    stubPhone()
    const { app, wrapper } = run()
    await nextTick()
    await titleOf(wrapper, 'Huerto de cobre,').trigger('click')
    await wrapper.find('.plate button.plate-world').trigger('click')
    expect(app.lifted.value).toBe('scadrial')
    expect(titleOf(wrapper, 'Camino de ceniza,').classes()).toContain('relief')
    expect(app.state.value.marks).toEqual({})
  })

  test('the filters panel lifts a world, offering only the worlds on show', async () => {
    const { app, wrapper } = run()
    await wrapper.find('button.m-filters').trigger('click')
    const chips = () => wrapper.findAll('.panel [data-group="world"] .chip')
    expect(chips().map((c) => c.text())).toEqual(['Sel', 'Scadrial', 'Nalthis'])
    expect(chips()[1]!.attributes('aria-pressed')).toBe('false')

    await chips()[1]!.trigger('click')
    expect(app.lifted.value).toBe('scadrial')
    expect(chips()[1]!.attributes('aria-pressed')).toBe('true')

    await chips()[1]!.trigger('click')
    expect(app.lifted.value).toBeNull()

    app.filters.value = { ...defaultFilters(), formats: ['novella'] }
    await nextTick()
    expect(chips().map((c) => c.text())).toEqual(['Sel', 'Scadrial'])
  })

  test('the footer offers to clear a lifted world, and says nothing otherwise', async () => {
    const { app, wrapper } = run()
    expect(wrapper.find('.foot-btn').exists()).toBe(false)
    app.toggleLift('nalthis')
    await nextTick()
    expect(wrapper.find('.foot-btn').text()).toBe('Nalthis: ver todos los mundos')
    await wrapper.find('.foot-btn').trigger('click')
    expect(app.lifted.value).toBeNull()
    expect(wrapper.find('.foot-btn').exists()).toBe(false)
  })

  test('a lifted world that the filters take away lifts nothing', async () => {
    const { app, wrapper } = run()
    await arcOf(wrapper, 'nalthis').trigger('click')
    app.filters.value = { ...defaultFilters(), formats: ['novella'] }
    await nextTick()
    expect(app.shownBooks.value.some((b) => b.world === 'nalthis')).toBe(false)
    expect(app.lifted.value).toBeNull()
    expect(wrapper.findAll('.arc.relief')).toHaveLength(0)
    expect(wrapper.findAll('.t.relief')).toHaveLength(0)
    expect(wrapper.find('.foot-btn').exists()).toBe(false)
  })

  test('a lifted world stays when the view changes, and the shelf drops to relief too', async () => {
    const { app, wrapper } = run()
    await arcOf(wrapper, 'scadrial').trigger('click')
    app.view.value = 'shelf'
    await nextTick()
    const spine = (start: string) => wrapper.find(`button.vol[aria-label^="${start}"]`)
    expect(spine('Camino de ceniza,').classes()).toContain('relief')
    expect(spine('Huerto de cobre,').classes()).not.toContain('relief')
    app.toggleLift('scadrial')
    await nextTick()
    expect(wrapper.findAll('button.vol.relief')).toHaveLength(0)
    app.toggleLift('nalthis')
    app.view.value = 'circle'
    await nextTick()
    expect(arcOf(wrapper, 'nalthis').classes()).toContain('lifted')
  })

  test('the pile on the phone drops to relief as well', async () => {
    stubPhone()
    const { app, wrapper } = run()
    app.view.value = 'shelf'
    await nextTick()
    app.toggleLift('scadrial')
    await nextTick()
    expect(wrapper.find('button.flat[aria-label^="Camino de ceniza,"]').classes()).toContain('relief')
    expect(wrapper.find('button.flat[aria-label^="Huerto de cobre,"]').classes()).not.toContain('relief')
  })

  test('with the catalogue at 105 works the ring draws without a broken number', () => {
    const catalog: Catalog = { books: works(105, everyOtherWorld), connections: [], synopses: [], notes: [], meta: { updatedOn: '2026-11-04' } }
    const app = useApp({ initial: { catalog, connectionsAvailable: true }, storage: fakeStorage() })
    app.lang.value = 'es'
    app.view.value = 'circle'
    app.filters.value = { ...defaultFilters(), statuses: [...BOOK_STATUSES], formats: [...FORMATS] }
    const wrapper = mount(App, { props: { app }, attachTo: document.body })
    mounted.push(wrapper)
    expect(wrapper.findAll('.t')).toHaveLength(105)
    // One line each. «Invented Work Number 7» does not fit at this size, and its number is the part that stays whole.
    expect(wrapper.findAll('.t .t-line')).toHaveLength(105)
    expect(wrapper.findAll('.t .t-tail').map((tail) => tail.text())).toContain('7')
    expect(wrapper.findAll('.t .t-tail').every((tail) => /^\d+$/.test(tail.text()))).toBe(true)
    const first = wrapper.find('.t')
    expect(first.findAll('.t-text').map((part) => part.element.textContent).join('')).toBe('Invented Work Number 0')
    expect(wrapper.find('svg.ring-svg').html()).not.toContain('NaN')
  })
})

describe('the map view', () => {
  function runMap(catalog: Catalog = fixtureCatalog()) {
    const made = run(catalog)
    made.app.view.value = 'map'
    return made
  }

  test('every world on show has one band, and its name is written on the rim', async () => {
    const { wrapper } = runMap()
    await nextTick()
    const bands = wrapper.findAll('.arc')
    expect(bands.map((b) => b.attributes('data-arc')).sort()).toEqual(['nalthis', 'scadrial', 'sel'])
    expect(wrapper.findAll('.world-name').map((n) => n.text()).sort()).toEqual(['Nalthis', 'Scadrial', 'Sel'])
    expect(wrapper.find('svg.ring-svg').attributes('aria-label')).toBe('Mapa de los mundos del Cosmere')
  })

  test('a series of two has its name in the lane, in the reader\'s language when there is one', async () => {
    const { wrapper } = runMap()
    await nextTick()
    expect(wrapper.findAll('.lane-series .lane-name').map((n) => n.text())).toEqual(['Orchard'])
  })

  test('the order ring names the phases instead, where a phase runs long enough', async () => {
    const { wrapper } = run()
    expect(wrapper.findAll('.lane-series')).toHaveLength(0)
    expect(wrapper.findAll('.lane-phase').length).toBeGreaterThan(0)
  })

  test('a title carries its own world, so it wears its own colour on any cover', async () => {
    const { wrapper } = runMap()
    await nextTick()
    expect(titleOf(wrapper, 'Huerto de cobre,').attributes('data-world')).toBe('scadrial')
    expect(titleOf(wrapper, 'Camino de ceniza,').attributes('data-world')).toBe('sel')
  })

  test('going from the map to the order keeps the ring: it is the same one, rearranged', async () => {
    const { app, wrapper } = runMap()
    await nextTick()
    const ring = wrapper.find('svg.ring-svg').element
    app.view.value = 'circle'
    await nextTick()
    expect(wrapper.find('svg.ring-svg').element).toBe(ring)
    expect(wrapper.find('.area').classes()).not.toContain('entering')
    app.view.value = 'shelf'
    await nextTick()
    app.view.value = 'map'
    await nextTick()
    expect(wrapper.find('.area').classes()).toContain('entering')
  })

  test('the pointer on a book dims what no drawn line joins to it, and nothing when it has no line', async () => {
    const { app, wrapper } = runMap()
    app.markBooks(['ash-road', 'copper-orchard'], 'read')
    await nextTick()
    expect(lines(wrapper)).toHaveLength(1)
    const dimmed = () => wrapper.findAll('.t.dim').length
    expect(dimmed()).toBe(0)

    await titleOf(wrapper, 'Camino de ceniza,').trigger('pointerenter', { pointerType: 'mouse' })
    // Everything but the two ends of the one line on the ring.
    expect(dimmed()).toBe(wrapper.findAll('.t').length - 2)
    expect(titleOf(wrapper, 'Huerto de cobre,').classes()).not.toContain('dim')
    await titleOf(wrapper, 'Camino de ceniza,').trigger('pointerleave')
    expect(dimmed()).toBe(0)

    // A book with no line on the ring dims nothing: a hidden connection leaves no trace here either.
    await titleOf(wrapper, 'Puerto de cristal,').trigger('pointerenter', { pointerType: 'mouse' })
    expect(dimmed()).toBe(0)
  })

  test('a finger is not a pointer at rest: touching a title dims nothing', async () => {
    const { app, wrapper } = runMap()
    app.markBooks(['ash-road', 'copper-orchard'], 'read')
    await nextTick()
    await titleOf(wrapper, 'Camino de ceniza,').trigger('pointerenter', { pointerType: 'touch' })
    expect(wrapper.findAll('.t.dim')).toHaveLength(0)
  })

  test('the pointer on a world dims the books of the others', async () => {
    const { wrapper } = runMap()
    await nextTick()
    await arcOf(wrapper, 'scadrial').trigger('pointerenter', { pointerType: 'mouse' })
    const lit = wrapper.findAll('.t').filter((t) => !t.classes().includes('dim'))
    expect(lit.every((t) => t.attributes('data-world') === 'scadrial')).toBe(true)
    expect(lit.length).toBeGreaterThan(0)
  })

  test('the zoom buttons move one transform, and the whole ring comes back with one press', async () => {
    const { wrapper } = runMap()
    await nextTick()
    const group = () => wrapper.find('svg.ring-svg > g')
    expect(group().attributes('transform')).toBeUndefined()
    expect(wrapper.find('.zoom-reset').exists()).toBe(false)
    await wrapper.find('button[aria-label="Acercar"]').trigger('click')
    expect(group().attributes('transform')).toMatch(/^translate\(-?[\d.]+ -?[\d.]+\) scale\(1\.6000\)$/)
    expect(wrapper.find('svg.ring-svg').classes()).toContain('zoomed')
    await wrapper.find('.zoom-reset').trigger('click')
    expect(group().attributes('transform')).toBeUndefined()
  })

  test('zooming moves no book: every title keeps its turn', async () => {
    const { wrapper } = runMap()
    await nextTick()
    const turns = () => wrapper.findAll('.t').map((t) => t.attributes('transform'))
    const before = turns()
    await wrapper.find('button[aria-label="Acercar"]').trigger('click')
    expect(turns()).toEqual(before)
  })

  test('a book never moves on the map when read', async () => {
    const { app, wrapper } = runMap()
    await nextTick()
    const turns = () => wrapper.findAll('.t').map((t) => t.attributes('transform'))
    const before = turns()
    app.markBooks(['ash-road', 'copper-orchard', 'glass-harbour', 'northern-gale'], 'read')
    await nextTick()
    expect(turns()).toEqual(before)
  })
})

describe('the stamp', () => {
  test('stampedId presses the title, and its new lines draw from its own dot', async () => {
    vi.useFakeTimers()
    const { app, wrapper } = run()
    app.markBooks(['ash-road'], 'read')
    await nextTick()
    expect(titleOf(wrapper, 'Camino de ceniza,').find('.ink').classes()).toContain('stamped')

    // copper-orchard is the far end of the stored connection, and it is the one stamped.
    app.markBooks(['copper-orchard'], 'read')
    await nextTick()
    expect(titleOf(wrapper, 'Camino de ceniza,').find('.ink').classes()).not.toContain('stamped')
    expect(titleOf(wrapper, 'Huerto de cobre,').find('.ink').classes()).toContain('stamped')

    const { angles } = layoutCircle(app.shownBooks.value)
    const fit = ringFit(stepAngle(app.shownBooks.value))
    const line = lines(wrapper)[0]!
    expect(line.classes()).toContain('line-new')
    expect(line.attributes('pathLength')).toBe('1')
    expect(line.attributes('d')).toBe(linePath(angles['copper-orchard']!, angles['ash-road']!, fit.radius - 22))

    // When the stamp is over, the finished state stays: the line drawn, no animation class.
    vi.advanceTimersByTime(1400)
    await nextTick()
    expect(wrapper.find('.stamped').exists()).toBe(false)
    expect(lines(wrapper)).toHaveLength(1)
    expect(lines(wrapper)[0]!.classes()).not.toContain('line-new')
  })

  test('a line that was already there does not draw again', async () => {
    const { app, wrapper } = run()
    app.markBooks(['ash-road', 'copper-orchard'], 'read')
    await nextTick()
    app.markBooks(['northern-gale'], 'read')
    await nextTick()
    expect(lines(wrapper).every((l) => !l.classes().includes('line-new'))).toBe(true)
  })

  test('with a selection, its lines stand out and the rest fall back', async () => {
    const { app, wrapper } = run()
    app.markBooks(['ash-road', 'copper-orchard', 'glass-harbour', 'northern-gale'], 'read')
    app.selectBook('ash-road')
    await nextTick()
    expect(wrapper.findAll('.linea.active')).toHaveLength(1)
    expect(wrapper.findAll('.linea.behind')).toHaveLength(1)
  })

  test('the animation exists only under no-preference: the base state is the finished one', () => {
    const css = readFileSync('src/design/tokens.css', 'utf8')
    const block = /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/.exec(css)?.[0] ?? ''
    expect(block).toContain('.stamped')
    expect(block).toContain('.line-new { stroke-dasharray: 1; animation: draw 760ms var(--ease) 260ms backwards; }')
    const rest = css.replace(block, '')
    expect(rest).not.toMatch(/\.line-new/)
    expect(rest).not.toMatch(/\.stamped/)
    expect(rest).toMatch(/prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ animation: none !important/)
  })
})
