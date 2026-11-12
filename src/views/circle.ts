import { WORLD_KEYS } from '../data/types'
import type { Book, BookId, WorldKey } from '../data/types'

// The ring's geometry, on a 1000 × 1000 viewBox. Everything here is worked out from public facts:
// no read state comes in, which is how a book never moves when it is read.

/** The dark disc under the seal. */
export const DISC_RADIUS = 100
/** Where a title's room ends, just inside the lane of series. */
export const OUTER_RADIUS = 408
/** The hairline of a series, or of a phase when the ring follows the reading order. */
export const LANE_RADIUS = 420
/** How far the world bands sit from the centre, and how thick they are. */
export const BAND_RADIUS = 442
export const BAND_WIDTH = 8
/** The inner edge of the world names. A second lane sits outside the first. */
export const LABEL_RADIUS = 455
/** On a ring too small for titles: where the ticks stand, and where the lines start. */
export const TICK_FOOT_RADIUS = 300
/** The centre of a ring of ticks is not a target: the seal is there. */
export const TAP_INNER_RADIUS = 240
/** A dot sits this far inside its title, and a line starts this much further in. */
export const DOT_INSET = 16
export const LINE_INSET = 6
/** A story told beside its series stands this far back from the row of its neighbours. */
export const ASIDE_STEP = 13
/** Below this many pixels of ring on screen, zoom included, titles give way to ticks. */
export const TITLES_FROM_PX = 540
const CENTRE = 500

/** `map` groups the books by world and series; `order` lays them out in the reading order. */
export type Arrangement = 'map' | 'order'

/** Angle in degrees, clockwise from the top, to a point. */
export function polar(angle: number, r: number): [number, number] {
  const radians = ((angle - 90) * Math.PI) / 180
  return [CENTRE + r * Math.cos(radians), CENTRE + r * Math.sin(radians)]
}

/** A point of the viewBox to its angle in degrees, clockwise from the top. */
export function angleAt(x: number, y: number): number {
  return ((Math.atan2(y - CENTRE, x - CENTRE) * 180) / Math.PI + 90 + 360) % 360
}

/** The group a book belongs to inside its world: its sub-series when it has one, else its series. */
export const groupOf = (b: Book): string | null => b.subseries ?? b.series ?? null

export interface WorldArc {
  world: WorldKey
  from: number
  to: number
}

export interface LaneArc {
  kind: 'series' | 'phase'
  /** The series as the catalogue names it, or the phase number as text. */
  name: string
  from: number
  to: number
}

export interface RingLayout {
  angles: Record<BookId, number>
  /** The angle one book takes. */
  step: number
  arcs: WorldArc[]
  lanes: LaneArc[]
}

/** How far an arc reaches past its first and last book, as a share of a step. */
const ARC_OVERHANG = 0.4

const UNPLACED = 1_000_000

/**
 * The books as the map lays them out: world by world, and series by series inside a world. `place` is the
 * book's seat on the map. A world or a series is never split, whatever the seats say, and a book without a
 * seat goes after the seated ones of its group, by publication.
 */
export function mapOrder(books: Book[]): Book[] {
  const seat = (b: Book): number => b.place ?? UNPLACED + (b.order.publication ?? b.year ?? UNPLACED)
  const worldRank = new Map<string, number>()
  const groupRank = new Map<string, number>()
  const groupKey = (b: Book): string => `${b.world}\u0000${groupOf(b) ?? ''}`
  for (const b of books) {
    // What has no single world closes the ring, wherever its works are seated.
    const world = b.world === 'otros' ? UNPLACED - 1 : (b.place ?? UNPLACED + WORLD_KEYS.indexOf(b.world))
    worldRank.set(b.world, Math.min(worldRank.get(b.world) ?? Infinity, world))
    groupRank.set(groupKey(b), Math.min(groupRank.get(groupKey(b)) ?? Infinity, seat(b)))
  }
  // Every tie is settled by a name, so the map is the same whatever order the books come in.
  const byName = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0)
  return [...books].sort(
    (a, b) =>
      worldRank.get(a.world)! - worldRank.get(b.world)! ||
      byName(a.world, b.world) ||
      groupRank.get(groupKey(a))! - groupRank.get(groupKey(b))! ||
      byName(groupKey(a), groupKey(b)) ||
      seat(a) - seat(b) ||
      byName(a.id, b.id),
  )
}

/** The room between two neighbours, as a share of a step: between worlds, and between series of one world. */
const WORLD_GAP = 0.75
const GROUP_GAP = 0.3

function gapBetween(a: Book, b: Book): number {
  if (a.world !== b.world) return WORLD_GAP
  return groupOf(a) !== groupOf(b) ? GROUP_GAP : 0
}

/** Runs of neighbours that share a key, as arcs. A null key belongs to no run. */
function runs<K>(books: Book[], angles: Record<BookId, number>, step: number, keyOf: (b: Book) => K | null) {
  const out: { key: K; from: number; to: number; count: number }[] = []
  let previous: K | null = null
  for (const book of books) {
    const key = keyOf(book)
    const angle = angles[book.id]!
    if (key !== null && key === previous) {
      const run = out.at(-1)!
      run.to = angle + step * ARC_OVERHANG
      run.count += 1
    } else if (key !== null) {
      out.push({ key, from: angle - step * ARC_OVERHANG, to: angle + step * ARC_OVERHANG, count: 1 })
    }
    previous = key
  }
  return out
}

/** The map: the ring closes on itself, so the gap between the last world and the first is a gap like any other. */
function layoutMap(books: Book[]): RingLayout {
  const list = mapOrder(books)
  const n = list.length
  if (n === 0) return { angles: {}, step: 360, arcs: [], lanes: [] }
  const gaps = list.map((b, i) => (n > 1 ? gapBetween(b, list[(i + 1) % n]!) : 0))
  const step = 360 / (n + gaps.reduce((sum, g) => sum + g, 0))
  const angles: Record<BookId, number> = {}
  // The top of the ring is the middle of the gap that closes it.
  let angle = step * (gaps[n - 1]! / 2 + 0.5)
  list.forEach((book, i) => {
    angles[book.id] = angle
    angle += step * (1 + gaps[i]!)
  })
  return {
    angles,
    step,
    arcs: runs(list, angles, step, (b) => b.world).map((r) => ({ world: r.key, from: r.from, to: r.to })),
    lanes: runs(list, angles, step, groupOf)
      .filter((r) => r.count > 1)
      .map((r) => ({ kind: 'series', name: r.key, from: r.from, to: r.to })),
  }
}

const worldChanges = (books: Book[]): number =>
  books.filter((b, i) => i > 0 && books[i - 1]!.world !== b.world).length

/** The angle one book takes on the ring of the reading order. A change of world adds 0.22 of it. */
export function stepAngle(books: Book[]): number {
  return 360 / (books.length + worldChanges(books) * 0.22 + 0.6)
}

/** Books go clockwise in the given order, so what comes next is the next one clockwise. */
export function layoutCircle(books: Book[]): RingLayout {
  const step = stepAngle(books)
  const angles: Record<BookId, number> = {}
  let angle = step * 0.3
  books.forEach((book, i) => {
    const previous = books[i - 1]
    if (previous && previous.world !== book.world) angle += step * 0.22
    angles[book.id] = angle
    angle += step
  })
  return {
    angles,
    step,
    arcs: runs(books, angles, step, (b) => b.world).map((r) => ({ world: r.key, from: r.from, to: r.to })),
    lanes: runs(books, angles, step, (b) => b.phase)
      .filter((r) => r.count > 1)
      .map((r) => ({ kind: 'phase', name: String(r.key), from: r.from, to: r.to })),
  }
}

/** The ring in one arrangement. `books` come in the reading order; the map seats them itself. */
export function layoutRing(books: Book[], arrangement: Arrangement): RingLayout {
  return arrangement === 'map' ? layoutMap(books) : layoutCircle(books)
}

/** The shortest way round from one angle to another, in degrees, from -180 to 180. */
export function turn(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

/**
 * A line between two dots. Neighbours are joined by a shallow curve and books across the ring by one that
 * reaches for the centre, so lines fan out instead of all crossing at one point. It starts at `a`. Its far end
 * may sit at a radius of its own, for a dot that stands back from the row.
 */
export function linePath(a: number, b: number, r: number, rb = r): string {
  const [x1, y1] = polar(a, r)
  const [x2, y2] = polar(b, rb)
  const pull = (Math.abs(turn(a, b)) / 180) ** 0.7
  const toward = (v: number) => (v + (CENTRE - v) * pull).toFixed(1)
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} C${toward(x1)} ${toward(y1)} ${toward(x2)} ${toward(y2)} ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

/** An arc clockwise from one angle to another. With `reverse` it runs the other way, for text on the lower half. */
export function arcPath(r: number, from: number, to: number, reverse = false): string {
  const [x1, y1] = polar(from, r)
  const [x2, y2] = polar(to, r)
  const large = to - from > 180 ? 1 : 0
  return reverse
    ? `M${x2.toFixed(1)} ${y2.toFixed(1)} A${r} ${r} 0 ${large} 0 ${x1.toFixed(1)} ${y1.toFixed(1)}`
    : `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

/** The book closest to an angle, across the top of the ring too. */
export function nearestBook(angles: Record<BookId, number>, angle: number): BookId | null {
  let best: BookId | null = null
  let distance = Infinity
  for (const [id, a] of Object.entries(angles)) {
    const d = Math.abs(turn(a, angle))
    if (d < distance) {
      distance = d
      best = id
    }
  }
  return best
}

export interface RingFit {
  /** Where titles start. Their dot sits just inside it. */
  radius: number
  /** Size of a title, in user units. */
  fontSize: number
  maxChars: number
  maxLines: 1 | 2
}

const BASE_RADIUS = 190
const MAX_RADIUS = 292
/** Two lines are worth it only while the titles keep most of their room: further out, one long line reads better. */
const TWO_LINE_RADIUS = 250
/** A line that holds this many characters holds most titles whole. */
const ONE_LINE_CHARS = 24
/** A title is this many pixels on screen, whatever the ring's size and zoom, within what the ring can hold. */
const TARGET_PX = 15
const MIN_FONT = 8
const MAX_FONT = 24
const LINE_HEIGHT = 1.02
/** Room a title needs between its neighbours, in font sizes. */
const ONE_LINE = 1.08
const TWO_LINES = 2 * LINE_HEIGHT
/** Average width of an Alegreya character, in font sizes. */
const CHAR_WIDTH = 0.448
/** The same for a title set in the medium weight, with a little to spare: what a long title is measured by. */
const WIDE_CHAR_WIDTH = 0.5

/** A size in user units that reads as `px` pixels on a ring of `ringPx`. */
export const unitsFor = (px: number, ringPx: number): number => (px * 1000) / Math.max(ringPx, 300)

/**
 * How the titles fit a ring with this step. Neighbouring labels are closest at their inner end, so
 * that is what decides. One line while it holds most titles; two lines on a ring where it does not,
 * moving the titles out if need be; and when the ring has no more room to give, a smaller font.
 * The plate always reads in full.
 * `ringPx` is the ring's size on screen with the zoom in it: zooming in leaves the letters their size
 * and gives the titles more room.
 */
export function ringFit(step: number, ringPx = 1000): RingFit {
  const spread = Math.sin((Math.min(step, 90) * Math.PI) / 180)
  const wanted = Math.max(MIN_FONT, Math.min(MAX_FONT, unitsFor(TARGET_PX, ringPx)))

  // One line reads calmest, and is kept while it holds most titles whole: the few that are longer take two lines
  // of their own (`settleTitles`). Only a ring whose one line is short breaks every title in two.
  const radiusForOne = Math.max(BASE_RADIUS, Math.min(MAX_RADIUS, (wanted * ONE_LINE) / spread))
  const holdsMost = (OUTER_RADIUS - radiusForOne) / (wanted * CHAR_WIDTH) >= ONE_LINE_CHARS
  const radiusForTwo = (wanted * TWO_LINES) / spread
  const maxLines = !holdsMost && radiusForTwo <= TWO_LINE_RADIUS ? 2 : 1
  const needed = maxLines === 2 ? radiusForTwo : (wanted * ONE_LINE) / spread
  const radius = Math.max(BASE_RADIUS, Math.min(MAX_RADIUS, needed))
  const fontSize = needed > MAX_RADIUS ? (MAX_RADIUS * spread) / ONE_LINE : wanted
  const maxChars = Math.floor((OUTER_RADIUS - radius) / (fontSize * CHAR_WIDTH))
  return { radius, fontSize, maxChars, maxLines }
}

/**
 * A title as lines on the ring, breaking at the most even word when it is too long for one. Nothing
 * is cut: the lines joined are the whole title, so the text and the accessible name agree, and CSS
 * shortens what does not fit. The space stays at the end of the first line, where it collapses.
 */
export function titleLines(title: string, maxChars: number, maxLines: 1 | 2): string[] {
  const words = title.split(' ')
  if (title.length <= maxChars || maxLines === 1 || words.length < 2) return [title]
  let best = [title]
  let cost = Infinity
  for (let i = 1; i < words.length; i++) {
    const first = words.slice(0, i).join(' ')
    const second = words.slice(i).join(' ')
    const longest = Math.max(first.length, second.length)
    if (longest < cost) {
      cost = longest
      best = [`${first} `, second]
    }
  }
  return best
}

/** The box a title is laid out in, on the horizontal axis before its group rotates, centred on its dot. `back` moves its start outward. */
export function labelBox(side: 1 | -1, fit: RingFit, back = 0, lines: number = fit.maxLines): { x: number; y: number; width: number; height: number } {
  const width = OUTER_RADIUS - fit.radius - back
  // A little over the lines, so that the box never clips an accent or a descender.
  const height = fit.fontSize * (lines * LINE_HEIGHT + 0.6)
  return { x: side > 0 ? CENTRE + fit.radius + back : CENTRE - fit.radius - back - width, y: CENTRE - height / 2, width, height }
}

export interface TitleSetting {
  lines: string[]
  /** On a one-line title too long for its room that ends in a number: where the number starts. It stays, and the cut falls before it. */
  cut?: number
  /** How far out the text starts, past where the titles of the ring start. */
  back: number
}

/** Room a two-line title needs from a one-line neighbour, in font sizes: its own line and a half of the other's. */
const STRADDLE = 1.6

/**
 * Sets every title of the ring, clockwise, all at the ring's one size. On a ring whose titles take one line, a
 * title too long for its room takes two lines and starts further out, where two lines clear its one-line
 * neighbours. Two neighbours never both do it: the second is shortened by CSS, as before. `reserve` is the
 * characters kept for a marker after the title, and `back` how far back the book already stands.
 */
export function settleTitles(titles: { text: string; reserve: number; back: number }[], fit: RingFit, step: number): TitleSetting[] {
  const spread = Math.sin((Math.min(step, 90) * Math.PI) / 180)
  const advance = fit.fontSize * CHAR_WIDTH
  let previousTook = false
  return titles.map(({ text, reserve, back }) => {
    const room = OUTER_RADIUS - fit.radius - back
    const kept = reserve * advance
    let lines = titleLines(text, Math.floor(room / advance) - reserve, fit.maxLines)
    let out = back
    let took = false
    const fits = (l: string[], width: number): boolean =>
      Math.max(...l.map((x) => x.trimEnd().length)) * fit.fontSize * WIDE_CHAR_WIDTH <= width - kept
    if (fit.maxLines === 1 && !previousTook && !fits(lines, room)) {
      const start = Math.max(fit.radius + back, (STRADDLE * fit.fontSize) / spread)
      const room2 = OUTER_RADIUS - start
      const two = titleLines(text, Math.floor(room2 / advance) - reserve, 2)
      // Worth it only when two lines there hold more than one line here.
      if (two.length === 2 && room2 * 2 > room * 1.25) {
        lines = two
        out = start - fit.radius
        took = true
      }
    }
    previousTook = took
    // Still too long on its one line. A number at its end is what tells it from its neighbours («… 3», «… 4»), so
    // the number is kept and the cut falls before it. Any other last word is one its neighbours may share.
    const overflows = lines.length === 1 && !fits(lines, OUTER_RADIUS - fit.radius - out)
    const whole = lines[0]!.trimEnd()
    const lastSpace = whole.lastIndexOf(' ')
    const numbered = lastSpace > 0 && /^\d{1,3}$/.test(whole.slice(lastSpace + 1))
    return overflows && numbered ? { lines, back: out, cut: lastSpace + 1 } : { lines, back: out }
  })
}

/** A book's hit wedge, drawn on the horizontal axis before its group rotates. A few books never make it wide. */
export function wedgePoints(side: 1 | -1, step: number, inner: number, outer: number): string {
  const slope = Math.tan((Math.min(step, 60) * Math.PI) / 360)
  const corner = (r: number, sign: 1 | -1) => `${(CENTRE + side * r).toFixed(1)},${(CENTRE + sign * slope * r).toFixed(1)}`
  return [corner(inner, -1), corner(outer, -1), corner(outer, 1), corner(inner, 1)].join(' ')
}

export interface ArcLabel {
  key: string
  text: string
  from: number
  to: number
  /** Placed before the rest, so it is the last to lose its room: the world of the book in hand. */
  priority?: boolean
}

export interface PlacedLabel extends ArcLabel {
  /** 0 is the lane next to the arc, 1 the one outside it. */
  lane: number
  /** The path the text runs along, already turned so that it reads left to right. */
  d: string
}

/** Cap height of the faces on the ring, in font sizes. */
const CAP_HEIGHT = 0.66

export interface LabelOptions {
  /** Inner edge of the first lane. */
  radius: number
  fontSize: number
  /** Average advance of a character in font sizes, tracking included. */
  charWidth: number
  /** How many lanes there are. With one, a name that meets its neighbour is left out. */
  lanes: number
  /** A name may run past the ends of its own arc. Without it, a name longer than its arc is left out. */
  overhang: boolean
  /** Room between lanes, in user units. */
  laneGap?: number
}

/**
 * Names written along their arcs, like the names of lands on a map. Each is centred on its arc. A name longer
 * than its arc runs over into the gap, and when it would meet its neighbour it moves to the outer lane.
 * What fits nowhere is left out: the plate and the filters still name it.
 */
export function placeLabels(items: ArcLabel[], o: LabelOptions): PlacedLabel[] {
  const placed: PlacedLabel[] = []
  const taken: [number, number][][] = Array.from({ length: o.lanes }, () => [])
  const laneHeight = o.fontSize * CAP_HEIGHT + (o.laneGap ?? o.fontSize * 0.7)
  // Across the top of the ring too: a name near 360 meets one near 0.
  const meets = (lane: number, start: number, end: number): boolean =>
    taken[lane]!.some(([s, e]) => [-360, 0, 360].some((turned) => start < e + turned && end > s + turned))
  // The names of the books in hand first; then the names that fit their own arc, which meet nobody; then the
  // longest arcs, so what is left over is the smallest world and not the largest.
  const span = (i: ArcLabel): number => i.to - i.from
  const ownRoom = (i: ArcLabel): boolean => labelSpan(i.text, o.fontSize, o.charWidth, o.radius) <= span(i)
  const inOrder = [...items].sort(
    (a, b) =>
      Number(b.priority === true) - Number(a.priority === true) ||
      Number(ownRoom(b)) - Number(ownRoom(a)) ||
      span(b) - span(a) ||
      a.from + a.to - (b.from + b.to),
  )
  for (const item of inOrder) {
    const mid = (item.from + item.to) / 2
    for (let lane = 0; lane < o.lanes; lane++) {
      const inner = o.radius + lane * laneHeight
      // A flipped name hangs toward the centre, so its path sits a cap height further out.
      const flip = mid > 90 && mid < 270
      const r = flip ? inner + o.fontSize * CAP_HEIGHT : inner
      const need = labelSpan(item.text, o.fontSize, o.charWidth, r)
      if (!o.overhang && need > item.to - item.from) break
      const start = mid - need / 2
      const end = mid + need / 2
      const pad = labelSpan(' ', o.fontSize, 0.9, r)
      if (meets(lane, start - pad, end + pad)) continue
      taken[lane]!.push([start, end])
      // The path is longer than the text, which is anchored at its middle: a wide glyph never runs out of path.
      placed.push({ ...item, lane, d: arcPath(r, start - need * 0.2, end + need * 0.2, flip) })
      break
    }
  }
  return placed
}

/** The width a name takes on an arc of this radius, in degrees. */
export function labelSpan(text: string, fontSize: number, charWidth: number, r: number): number {
  return ((text.length * fontSize * charWidth) / r) * (180 / Math.PI)
}

/** An arc with a gap in its middle for a name of this width in degrees. Two paths, or one when there is no name. */
export function splitArc(r: number, from: number, to: number, gap: number): string[] {
  const mid = (from + to) / 2
  if (gap <= 0 || gap >= to - from) return gap <= 0 ? [arcPath(r, from, to)] : []
  return [arcPath(r, from, mid - gap / 2), arcPath(r, mid + gap / 2, to)]
}
