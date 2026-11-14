// The star atlas blind-tooled into the leather around the ring: the grid of a star chart whose pole lies off the
// cover, bottom left, and a few invented constellations far from the ring. Pure geometry in cover pixels; the
// same size and seed always draw the same atlas. Nothing here comes from the books or from any real sky.

export interface AtlasStar {
  x: number
  y: number
  r: number
}

function random(seed: number): () => number {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const n = (v: number) => (Math.round(v * 10) / 10).toString()

/** Parallels (whole circles round the pole) and meridians (rays from it), as SVG paths. */
export function atlasGrid(w: number, h: number): string[] {
  const pole = { x: -0.25 * w, y: 1.55 * h }
  const paths: string[] = []
  for (let r = 0.55 * h; r < 3.2 * h; r += 0.26 * h) {
    paths.push(`M${n(pole.x + r)} ${n(pole.y)} A${n(r)} ${n(r)} 0 0 0 ${n(pole.x - r)} ${n(pole.y)} A${n(r)} ${n(r)} 0 0 0 ${n(pole.x + r)} ${n(pole.y)}`)
  }
  for (let a = -100; a <= 10; a += 7.5) {
    const t = (a * Math.PI) / 180
    paths.push(`M${n(pole.x)} ${n(pole.y)} L${n(pole.x + Math.cos(t) * 4 * h)} ${n(pole.y + Math.sin(t) * 4 * h)}`)
  }
  return paths
}

const WANTED = 9
const EDGE = 60

/**
 * Up to nine constellations of four to seven stars. Each is an open chain taken in order of angle round its own
 * centre, so it never crosses itself, and every star keeps `keep + 20` from the cover's centre and 60 px from its edges.
 */
export function constellations(w: number, h: number, keep: number, seed: number): AtlasStar[][] {
  const next = random(seed)
  const cx = w / 2
  const cy = h / 2
  const fits = (p: { x: number; y: number }) =>
    p.x >= EDGE && p.y >= EDGE && p.x <= w - EDGE && p.y <= h - EDGE && Math.hypot(p.x - cx, p.y - cy) >= keep + 20
  const out: AtlasStar[][] = []
  for (let tries = 0; out.length < WANTED && tries < 400; tries++) {
    const centre = { x: next() * w, y: next() * h }
    const count = 4 + Math.floor(next() * 4)
    const angles = Array.from({ length: count }, () => next() * Math.PI * 2).sort((p, q) => p - q)
    const stars = angles.map((a) => {
      const d = 26 + next() * 44
      return { x: Math.round((centre.x + Math.cos(a) * d) * 10) / 10, y: Math.round((centre.y + Math.sin(a) * d) * 10) / 10, r: Math.round((1.6 + next() * 2.6) * 10) / 10 }
    })
    if (stars.every(fits)) out.push(stars)
  }
  return out
}
