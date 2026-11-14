import { readFileSync } from 'node:fs'
import { WORLD_KEYS, type WorldKey } from '../../src/data/types'
import { WORLDS } from '../../src/design/worlds'
import { DISC_RADIUS, OUTER_RADIUS } from '../../src/views/circle'
import { NEBULA_STOPS, NIGHT_STOPS, SKY_RADIUS, type Stop } from '../../src/views/sky'

// What lies under a title on the ring. At any radius a title reaches, the backdrop is the ground (the world's
// leather mixed with its tone), the night over it, and over its own world's sector that world's nebula, blended as
// screen. The values come from the same constants the sky draws with, and the share from the stylesheet.
const css = readFileSync('src/design/tokens.css', 'utf8')

export type RGB = [number, number, number]
export const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const unlin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
function toOklab([r, g, b]: RGB): RGB {
  const [R, G, B] = [lin(r), lin(g), lin(b)]
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
function fromOklab([L, A, Bb]: RGB): RGB {
  const l = (L + 0.3963377774 * A + 0.2158037573 * Bb) ** 3
  const m = (L - 0.1055613458 * A - 0.0638541728 * Bb) ** 3
  const s = (L - 0.0894841775 * A - 1.291485548 * Bb) ** 3
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  return rgb.map((c) => Math.min(1, Math.max(0, unlin(c)))) as RGB
}
const mix = (a: RGB, b: RGB, shareOfB: number): RGB => {
  const [x, y] = [toOklab(a), toOklab(b)]
  return fromOklab(x.map((v, i) => v * (1 - shareOfB) + y[i]! * shareOfB) as RGB)
}
const screen = (base: RGB, top: RGB, alpha: number): RGB => base.map((c, i) => c + (1 - (1 - c) * (1 - top[i]!) - c) * alpha) as RGB
const over = (base: RGB, top: RGB, alpha: number): RGB => base.map((c, i) => c * (1 - alpha) + top[i]! * alpha) as RGB
/** A gradient's colour and opacity at `t` (0 at the centre, 1 at the rim). */
function at(stops: Stop[], t: number, color: string): { c: RGB; a: number } {
  const i = stops.findIndex((s) => s.offset >= t)
  if (i <= 0) return { c: hex(stops[0]!.color ?? color), a: i === 0 ? stops[0]!.opacity : stops.at(-1)!.opacity }
  const [p, q] = [stops[i - 1]!, stops[i]!]
  const k = (t - p.offset) / (q.offset - p.offset)
  return { c: over(hex(p.color ?? color), hex(q.color ?? color), k), a: p.opacity + (q.opacity - p.opacity) * k }
}
const luminance = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
export const contrast = (a: RGB, b: RGB): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

/** How much of the sky's ground is the leather; the rest is the world's tone. Read from the stylesheet. */
export const GROUND_SHARE = Number(/\.sky-base\s*\{[^}]*color-mix\(in oklab, var\(--field\) (\d+)%, var\(--world-tone\)\)/.exec(css)?.[1] ?? NaN)

export interface Backdrop {
  /** The world whose leather is in hand. */
  field: WorldKey
  /** The world whose sector the title sits in. */
  title: WorldKey
  radius: number
  colour: RGB
}

/** Every backdrop a title can have: each leather, each sector, each radius a title reaches. */
export function nightBackdrops(fields: readonly WorldKey[] = WORLD_KEYS): Backdrop[] {
  const out: Backdrop[] = []
  for (const field of fields) {
    const ground = mix(hex(WORLDS[field].field), hex(WORLDS[field].tone), 1 - GROUND_SHARE / 100)
    for (let radius = DISC_RADIUS + 40; radius <= OUTER_RADIUS; radius += 8) {
      const night = at(NIGHT_STOPS, radius / SKY_RADIUS, '#000000')
      const dark = over(ground, night.c, night.a)
      for (const title of WORLD_KEYS) {
        const tone = WORLDS[title].tone
        out.push({ field, title, radius, colour: screen(dark, hex(tone), at(NEBULA_STOPS, radius / SKY_RADIUS, tone).a) })
      }
    }
  }
  return out
}

/** The lowest contrast an ink has against any backdrop a title can have, and where. */
export function worstOnNight(ink: string, backdrops: readonly Backdrop[] = nightBackdrops()): { ratio: number; where: string } {
  let worst = { ratio: Infinity, where: '' }
  for (const b of backdrops) {
    const ratio = contrast(hex(ink), b.colour)
    if (ratio < worst.ratio) worst = { ratio, where: `${b.title} at radius ${b.radius} on ${b.field}` }
  }
  return worst
}
