// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { BAND_RADIUS, DISC_RADIUS, polar } from '../../src/views/circle'
import { nebulaWedge, PLANET_RADIUS, planetPoint, SKY_RADIUS, starField } from '../../src/views/sky'

const dist = (p: { x: number; y: number }) => Math.hypot(p.x - 500, p.y - 500)
const angleOf = (p: { x: number; y: number }) => ((Math.atan2(p.y - 500, p.x - 500) * 180) / Math.PI + 90 + 360) % 360

describe('starField', () => {
  test('the star field is the same for the same seed, inside the sky and outside the seal', () => {
    const a = starField(7, 340)
    expect(a).toEqual(starField(7, 340))
    expect(a).not.toEqual(starField(8, 340))
    expect(a).toHaveLength(340)
    for (const s of a) {
      expect(dist(s)).toBeLessThanOrEqual(SKY_RADIUS)
      expect(dist(s)).toBeGreaterThan(DISC_RADIUS + 4)
      expect([0, 1, 2]).toContain(s.layer)
    }
    const twinkling = a.filter((s) => s.twinkle).length
    expect(twinkling).toBeGreaterThan(40)
    expect(twinkling).toBeLessThan(130)
  })
})

describe('nebulaWedge', () => {
  test('a wedge spans exactly its arc, padded, from the centre', () => {
    const d = nebulaWedge({ world: 'sel', from: 30, to: 90 }, SKY_RADIUS, 1)
    const [x0, y0] = polar(29, SKY_RADIUS)
    const [x1, y1] = polar(91, SKY_RADIUS)
    expect(d).toBe(`M500 500 L${x0.toFixed(1)} ${y0.toFixed(1)} A${SKY_RADIUS} ${SKY_RADIUS} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)} Z`)
  })
  test('across the top of the ring too, and with the long way flagged past half a turn', () => {
    expect(nebulaWedge({ world: 'sel', from: -10, to: 20 }, SKY_RADIUS, 0)).toContain(' 0 0 1 ')
    expect(nebulaWedge({ world: 'sel', from: 0, to: 250 }, SKY_RADIUS, 0)).toContain(' 0 1 1 ')
  })
})

describe('planetPoint', () => {
  const onBand = (p: { x: number; y: number }) => expect(Math.abs(dist(p) - (BAND_RADIUS - 4))).toBeLessThan(0.5)
  test('a planet sits on its band, near the start of its arc', () => {
    const p = planetPoint({ world: 'sel', from: 40, to: 120 }, null)
    onBand(p)
    expect(angleOf(p)).toBeGreaterThan(40)
    expect(angleOf(p)).toBeLessThan(50)
  })
  test("it never sits on its world's name: the name at the start sends it to the end", () => {
    const p = planetPoint({ world: 'sel', from: 40, to: 120 }, { from: 38, to: 52 })
    onBand(p)
    expect(angleOf(p)).toBeGreaterThan(108)
    const halfAngle = (PLANET_RADIUS / BAND_RADIUS) * (180 / Math.PI)
    expect(angleOf(p) - halfAngle).toBeGreaterThan(52)
  })
  test('on a short arc it sits in the middle', () => {
    const p = planetPoint({ world: 'nalthis', from: 200, to: 208 }, null)
    onBand(p)
    expect(angleOf(p)).toBeCloseTo(204, 0)
  })
})
