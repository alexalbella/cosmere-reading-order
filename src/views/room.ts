// The ring makes room: on the PC, whatever opens beside the ring (a work's card, a drawer) pushes it to the other
// side and shrinks it a little, so no title is ever covered. Pure geometry, in pixels relative to the cover.

export interface Box {
  x: number
  y: number
  w: number
  h: number
}
export type Side = 'left' | 'right'

/** Room between the ring and what opens beside it, and between the ring and the cover's edge. */
const GAP = 28
const EDGE = 20
/** The ring never grows, and shrinks at least this much when it makes room. */
const MAX_SCALE = 0.9
/** The ring's visible radius, world names included, as a share of half its box. */
const VISIBLE = 0.97
/** A card keeps this far from its side of the cover. */
const CARD_MARGIN = 26
/** Above and below, a card leaves the corner medallions (and the corner tool's star) free to press. */
export const CLEAR_TOP = 112
export const CLEAR_BOTTOM = 100

/**
 * How far to slide the ring and how much to shrink it so that `open` covers none of it. Nothing open, or a zoomed
 * ring (whose lens the reader is steering), leaves it as it is.
 */
export function roomFor(ring: Box, open: { side: Side; box: Box } | null, cover: { w: number; h: number }, zoomed: boolean): { dx: number; scale: number } {
  if (!open || zoomed) return { dx: 0, scale: 1 }
  const radius = (ring.w / 2) * VISIBLE
  const centre = ring.x + ring.w / 2
  const from = open.side === 'right' ? EDGE : open.box.x + open.box.w + GAP
  const to = open.side === 'right' ? open.box.x - GAP : cover.w - EDGE
  const scale = Math.min(MAX_SCALE, (to - from) / (2 * radius))
  const target = open.side === 'right' ? to - scale * radius : from + scale * radius
  return { dx: target - centre, scale }
}

/**
 * Where a work's card goes: on its side, centred on its title, clear of the corner medallions above and below.
 * `foot` is how much of the cover's foot must stay free when it is more than the medallions need (the row of the
 * colour layers sits there).
 */
export function cardBox(side: Side, titleY: number, card: { w: number; h: number }, cover: { w: number; h: number }, foot = CLEAR_BOTTOM): Box {
  const below = Math.max(CLEAR_BOTTOM, foot)
  const h = Math.min(card.h, cover.h - CLEAR_TOP - below)
  const y = Math.max(CLEAR_TOP, Math.min(titleY - h / 2, cover.h - h - below))
  return { x: side === 'right' ? cover.w - card.w - CARD_MARGIN : CARD_MARGIN, y: Math.round(y), w: card.w, h }
}

/** The half of the ring a title sits on, from its angle in degrees clockwise from the top. */
export function sideOf(angle: number): Side {
  const a = ((angle % 360) + 360) % 360
  return a < 180 ? 'right' : 'left'
}
