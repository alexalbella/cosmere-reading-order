// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { WORLD_KEYS } from '../../src/data/types'
import { WORLDS } from '../../src/design/worlds'
import { DISC_RADIUS, OUTER_RADIUS } from '../../src/views/circle'
import { NEBULA_STOPS, NIGHT_STOPS, SKY_RADIUS, type Stop } from '../../src/views/sky'

// Titles sit on the night sky now. Under a title, at any radius it reaches, the backdrop is the ground (the world's
// leather mixed with its tone), the night over it, and over its own world's sector that world's nebula, blended as
// screen. The values come from the same constants the sky draws with.
const css = readFileSync('src/design/tokens.css', 'utf8')

type RGB = [number, number, number]
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB
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
const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}

describe('the night sky behind the titles', () => {
  const share = Number(/\.sky-base\s*\{[^}]*color-mix\(in oklab, var\(--field\) (\d+)%, var\(--world-tone\)\)/.exec(css)?.[1] ?? NaN)

  test('the ground of the sky is the leather mixed with its tone, as the stylesheet says', () => {
    expect(share).toBeGreaterThanOrEqual(70)
    expect(share).toBeLessThanOrEqual(100)
    for (const w of WORLD_KEYS) expect(css).toMatch(new RegExp(`\\[data-world=${w}\\][^{]*\\{[^}]*--world-tone: var\\(--tone-${w}\\)`))
  })

  test.each(WORLD_KEYS)('every title ink passes 4.5:1 on the night, at every radius a title reaches, on %s', (field) => {
    const ground = mix(hex(WORLDS[field].field), hex(WORLDS[field].tone), 1 - share / 100)
    for (let r = DISC_RADIUS + 40; r <= OUTER_RADIUS; r += 8) {
      const night = at(NIGHT_STOPS, r / SKY_RADIUS, '#000000')
      const dark = over(ground, night.c, night.a)
      for (const title of WORLD_KEYS) {
        const w = WORLDS[title]
        const nebula = at(NEBULA_STOPS, r / SKY_RADIUS, w.tone)
        const backdrop = screen(dark, hex(w.tone), nebula.a)
        for (const ink of [w.ink, w.inkUnread].filter((x): x is string => !!x)) {
          expect(contrast(hex(ink), backdrop), `${title} at radius ${r} on ${field}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })
})
