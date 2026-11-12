import { describe, expect, test } from 'vitest'
import { cardBox, CLEAR_BOTTOM, CLEAR_TOP, roomFor, sideOf, type Box } from '../../src/views/room'

// Cover-relative boxes, measured from the app at 1440 × 900 and 1280 × 800 (the ring at rest, untransformed).
const AT_1440 = { cover: { w: 1312, h: 864 }, ring: { x: 259, y: 15, w: 795, h: 795 } }
const AT_1280 = { cover: { w: 1152, h: 764 }, ring: { x: 229, y: 15, w: 695, h: 695 } }
const CARD = { w: 372, h: 480 }
const R = (ring: Box) => (ring.w / 2) * 0.97

describe('roomFor', () => {
  for (const [name, at] of [['1440', AT_1440], ['1280', AT_1280]] as const) {
    test(`a card on the right leaves the ring clear of it and of the left edge, at ${name}`, () => {
      const card = { x: at.cover.w - CARD.w - 26, y: 100, w: CARD.w, h: CARD.h }
      const { dx, scale } = roomFor(at.ring, { side: 'right', box: card }, at.cover, false)
      const cx = at.ring.x + at.ring.w / 2 + dx
      expect(scale).toBeLessThanOrEqual(0.9)
      expect(cx + scale * R(at.ring)).toBeLessThanOrEqual(card.x - 28 + 0.01)
      expect(cx - scale * R(at.ring)).toBeGreaterThanOrEqual(20 - 0.01)
    })
    test(`a card on the left is the mirror, at ${name}`, () => {
      const card = { x: 26, y: 100, w: CARD.w, h: CARD.h }
      const { dx, scale } = roomFor(at.ring, { side: 'left', box: card }, at.cover, false)
      const cx = at.ring.x + at.ring.w / 2 + dx
      expect(cx - scale * R(at.ring)).toBeGreaterThanOrEqual(card.x + card.w + 28 - 0.01)
      expect(cx + scale * R(at.ring)).toBeLessThanOrEqual(at.cover.w - 20 + 0.01)
    })
  }
  test('nothing open leaves the ring where it is', () => {
    expect(roomFor(AT_1440.ring, null, AT_1440.cover, false)).toEqual({ dx: 0, scale: 1 })
  })
  test('a zoomed ring keeps its place and its size', () => {
    const card = { x: 914, y: 100, w: CARD.w, h: CARD.h }
    expect(roomFor(AT_1440.ring, { side: 'right', box: card }, AT_1440.cover, true)).toEqual({ dx: 0, scale: 1 })
  })
  test('a cover too narrow shrinks the ring below 0.9 rather than let the card cover it', () => {
    const cover = { w: 1000, h: 800 }
    const ring = { x: 152, y: 15, w: 695, h: 695 }
    const card = { x: cover.w - CARD.w - 26, y: 100, w: CARD.w, h: CARD.h }
    const { dx, scale } = roomFor(ring, { side: 'right', box: card }, cover, false)
    expect(scale).toBeLessThan(0.9)
    expect(ring.x + ring.w / 2 + dx + scale * R(ring)).toBeLessThanOrEqual(card.x - 28 + 0.01)
  })
})

describe('cardBox', () => {
  const cover = AT_1440.cover
  test('a card sits on its side, centred on its title', () => {
    expect(cardBox('right', 400, CARD, cover)).toEqual({ x: cover.w - CARD.w - 26, y: 160, w: CARD.w, h: CARD.h })
    expect(cardBox('left', 400, CARD, cover).x).toBe(26)
  })
  test('it leaves the corner medallions free, top and bottom, on either side', () => {
    for (const side of ['right', 'left'] as const) {
      expect(cardBox(side, 30, CARD, cover).y).toBe(CLEAR_TOP)
      expect(cardBox(side, 860, CARD, cover).y).toBe(cover.h - CARD.h - CLEAR_BOTTOM)
    }
  })
  test('a card taller than the room between them is cut to it', () => {
    const tall = cardBox('right', 400, { w: CARD.w, h: 2000 }, cover)
    expect(tall.y).toBe(CLEAR_TOP)
    expect(tall.h).toBe(cover.h - CLEAR_TOP - CLEAR_BOTTOM)
  })
})

describe('sideOf', () => {
  test('the right half of the ring is [0, 180), the left half the rest', () => {
    expect(sideOf(0)).toBe('right')
    expect(sideOf(179.9)).toBe('right')
    expect(sideOf(180)).toBe('left')
    expect(sideOf(359.9)).toBe('left')
    expect(sideOf(-10)).toBe('left')
    expect(sideOf(370)).toBe('right')
  })
})
