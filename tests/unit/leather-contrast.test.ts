// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { WORLD_KEYS } from '../../src/data/types'
import { WORLDS } from '../../src/design/worlds'

// The text on the leather outside the ring (the sentence, the footer, the quiet lines) must pass 4.5:1 on the
// lightest point of the drawn leather: the field mixed with the leather of the world in hand, lightened by the
// highest mottling and grain the textures can reach, blended as soft-light. No credit is taken for the vignette.
const css = readFileSync('src/design/tokens.css', 'utf8')
const mottle = readFileSync('public/textures/mottle.svg', 'utf8')
const grain = readFileSync('public/textures/grain-pebble.svg', 'utf8')

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
/** W3C soft-light of a grey `b` over the backdrop. */
const softLight = (base: RGB, b: number): RGB =>
  base.map((s) => {
    if (b <= 0.5) return s - (1 - 2 * b) * s * (1 - s)
    const d = s <= 0.25 ? ((16 * s - 12) * s + 4) * s : Math.sqrt(s)
    return s + (2 * b - 1) * (d - s)
  }) as RGB
const luminance = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
const contrast = (a: RGB, b: RGB) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x! + 0.05) / (y! + 0.05)
}
/**
 * The brightest grey a texture can reach: its transfer is a table, and a table's output never passes its highest
 * entry, whatever the noise does. Every channel must carry a table, or the bound would not hold.
 */
const peak = (svg: string) => {
  const tables = [...svg.matchAll(/<feFunc([RGB]) type="table" tableValues="([\d. ]+)"/g)]
  if (tables.length !== 3 || /<feFunc[RGB] type="(?!table)/.test(svg)) return NaN
  return Math.max(...tables.flatMap((m) => m[2]!.trim().split(/\s+/).map(Number)))
}

describe('the drawn leather behind the text', () => {
  const share = Number(/\.cover:not\(\.interior\)\s*\{[^}]*background-color: color-mix\(in oklab, var\(--field\) (\d+)%, var\(--tint, var\(--field\)\)\)/.exec(css)?.[1] ?? NaN)

  test('the leather is the field mixed with the leather of the world in hand, as the stylesheet says', () => {
    expect(share).toBeGreaterThanOrEqual(50)
    expect(share).toBeLessThan(100)
    for (const w of WORLD_KEYS) expect(css).toMatch(new RegExp(`\\.app\\[data-tint=${w}\\]\\s*\\{\\s*--tint: ${WORLDS[w].field};`))
    expect(peak(mottle)).toBeLessThan(1)
    expect(peak(grain)).toBeLessThan(1)
  })

  test('both textures are laid as soft-light, the blend this test models', () => {
    const rule = /\.cover:not\(\.interior\)\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(rule).toMatch(/background-image: radial-gradient\([^;]*\), url\(\/textures\/grain-pebble\.svg\), url\(\/textures\/mottle\.svg\);/)
    expect(rule).toContain('background-blend-mode: normal, soft-light, soft-light;')
  })

  test.each(WORLD_KEYS)('the sentence, the footer and the quiet text pass 4.5:1 on the lightest leather of %s, whatever world tints it', (field) => {
    const f = WORLDS[field]
    for (const tint of WORLD_KEYS) {
      const leather = softLight(softLight(mix(hex(f.field), hex(WORLDS[tint].field), 1 - share / 100), peak(mottle)), peak(grain))
      for (const [name, ink] of [['bone', '#efe6d2'], ['gold', '#e2c070'], ['blind', f.blind], ['second', f.secondary]] as const) {
        expect(contrast(hex(ink), leather), `${name} on ${field} tinted ${tint}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
