import { BAND_RADIUS, DISC_RADIUS, polar, type WorldArc } from './circle'

// The night sky inside the ring and the worlds as planets on their bands. Everything here reads only the layout
// of the ring, never what has been read and never a connection, so the sky is the same for every reader.

/** The sky fills the ring up to here, in viewBox units around (500, 500). */
export const SKY_RADIUS = 470
/** A planet's disc, in viewBox units. */
export const PLANET_RADIUS = 17

export interface Stop {
  offset: number
  color?: string
  opacity: number
}
/** The night over the ground, from the centre (clear) to the rim (darkest). */
export const NIGHT_STOPS: Stop[] = [
  { offset: 0, color: '#0b1020', opacity: 0 },
  { offset: 0.55, color: '#080c18', opacity: 0.55 },
  { offset: 1, color: '#05070e', opacity: 0.82 },
]
/** A world's nebula, in its own tone, from nothing near the centre to its strongest at the rim. */
export const NEBULA_STOPS: Stop[] = [
  { offset: 0.22, opacity: 0 },
  { offset: 0.7, opacity: 0.07 },
  { offset: 1, opacity: 0.2 },
]

export interface Star {
  x: number
  y: number
  r: number
  /** Opacity at rest. */
  o: number
  /** Far, middle or near: the near ones are the largest, and move most with the pointer. */
  layer: 0 | 1 | 2
  twinkle: boolean
}

/** A small deterministic generator: the same seed always draws the same sky. */
function random(seed: number): () => number {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

/** `count` stars spread over the sky, clear of the seal at the centre. A quarter of them twinkle. */
export function starField(seed: number, count: number): Star[] {
  const next = random(seed)
  const inner = DISC_RADIUS + 10
  return Array.from({ length: count }, () => {
    const a = next() * Math.PI * 2
    const d = inner + Math.sqrt(next()) * (SKY_RADIUS - inner)
    const r = 0.6 + next() * next() * 2.2
    return {
      x: Math.round((500 + Math.cos(a) * d) * 10) / 10,
      y: Math.round((500 + Math.sin(a) * d) * 10) / 10,
      r: Math.round(r * 100) / 100,
      o: Math.round((0.35 + next() * 0.6) * 100) / 100,
      layer: r < 1 ? 0 : r < 1.6 ? 1 : 2,
      twinkle: next() < 0.25,
    }
  })
}

/** The wedge of sky behind a world's arc, from the centre to radius `r`, widened by `pad` degrees each side. */
export function nebulaWedge(arc: WorldArc, r: number, pad: number): string {
  const from = arc.from - pad
  const to = arc.to + pad
  const [x0, y0] = polar(from, r)
  const [x1, y1] = polar(to, r)
  const large = to - from > 180 ? 1 : 0
  return `M500 500 L${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`
}

/** How far in from the start of its arc a planet sits, in degrees. */
const PLANET_OFFSET = 4.5

/**
 * Where a world's planet sits on its band: a step in from the start of its arc, or from the end when its name
 * is written there, or in the middle of an arc too short for either.
 */
export function planetPoint(arc: WorldArc, name: { from: number; to: number } | null): { x: number; y: number } {
  const half = (PLANET_RADIUS / BAND_RADIUS) * (180 / Math.PI)
  const clear = (a: number) => !name || a + half < name.from || a - half > name.to
  const span = arc.to - arc.from
  const start = arc.from + PLANET_OFFSET
  const end = arc.to - PLANET_OFFSET
  const angle = span < 2 * PLANET_OFFSET + 2 * half ? arc.from + span / 2 : clear(start) ? start : clear(end) ? end : arc.from + span / 2
  const [x, y] = polar(angle, BAND_RADIUS - 4)
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }
}
