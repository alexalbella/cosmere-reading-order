// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { atlasGrid, constellations } from '../../src/views/atlas'

type P = { x: number; y: number }
/** Whether segments ab and cd cross (sharing an end is not crossing). */
function cross(a: P, b: P, c: P, d: P): boolean {
  const o = (p: P, q: P, r: P) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x))
  if ([a, b].some((p) => [c, d].some((q) => p.x === q.x && p.y === q.y))) return false
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}

describe('the engraved atlas', () => {
  const W = 1312
  const H = 864
  const keep = Math.min(W, H) * 0.5

  test('no constellation crosses itself and none comes near the ring or the edges', () => {
    for (const seed of [5, 11, 23]) {
      const groups = constellations(W, H, keep, seed)
      expect(groups.length).toBeGreaterThanOrEqual(5)
      for (const stars of groups) {
        expect(stars.length).toBeGreaterThanOrEqual(4)
        expect(stars.length).toBeLessThanOrEqual(7)
        for (const s of stars) {
          expect(Math.hypot(s.x - W / 2, s.y - H / 2)).toBeGreaterThanOrEqual(keep + 20)
          expect(s.x).toBeGreaterThanOrEqual(60)
          expect(s.y).toBeGreaterThanOrEqual(60)
          expect(s.x).toBeLessThanOrEqual(W - 60)
          expect(s.y).toBeLessThanOrEqual(H - 60)
        }
        for (let i = 0; i + 1 < stars.length; i++) {
          for (let j = i + 2; j + 1 < stars.length; j++) expect(cross(stars[i]!, stars[i + 1]!, stars[j]!, stars[j + 1]!), `seed ${seed}`).toBe(false)
        }
      }
    }
  })

  test('the same size and seed draw the same atlas', () => {
    expect(constellations(W, H, keep, 5)).toEqual(constellations(W, H, keep, 5))
    expect(constellations(W, H, keep, 5)).not.toEqual(constellations(W, H, keep, 6))
    expect(atlasGrid(W, H)).toEqual(atlasGrid(W, H))
  })

  test('the grid is a set of paths that cross the cover', () => {
    const grid = atlasGrid(W, H)
    expect(grid.length).toBeGreaterThan(10)
    for (const d of grid) expect(d).toMatch(/^M-?\d/)
  })
})
