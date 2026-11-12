import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'

// Writes public/textures/leather-grain-{a,b}.png: two seamless tiles of leather pebbling, black with alpha, so they
// can only ever darken what is under them. Worked out here from fixed seeds, with no image as a source.
// Run: npx tsx scripts/make-grain.ts, then record their provenance again with `impeccable embed-prompt`.
//
// Two small tiles of coprime sizes, laid over each other: together they repeat only every 3233 px, and each stays
// too small to compete with the page's text as its largest paint, which a single big tile did.
const TILES = [
  { name: 'leather-grain-a.png', size: 53, seed: 0x1a7be11 },
  { name: 'leather-grain-b.png', size: 61, seed: 0x2c4d9f3 },
]
/** Pebbles average this many pixels across, and the jitter spreads them from about 2 to 6. */
const SPACING = 4
/** How dark, at most, the crease between two pebbles gets, per tile. A pebble's crown is left almost clear. */
const CREASE = 0.26
/** How fast the shading falls from a pebble's crown to its crease: higher keeps the crown flat. */
const DOME = 3
/** How much one pebble differs from its neighbours. */
const MOTTLE = 0.04
/** PNG palette depth: alpha is stored in this many steps. */
const LEVELS = 16

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pebbles(TILE: number, seed: number): Float64Array {
  const random = mulberry32(seed)
  const cells = Math.round(TILE / SPACING)
  const size = TILE / cells
  // Jittered past the cell and weighted, so the pebbles lose the grid and differ in size.
  const seeds = Array.from({ length: cells * cells }, (_, i) => ({
    x: ((i % cells) - 0.25 + random() * 1.5) * size,
    y: (Math.floor(i / cells) - 0.25 + random() * 1.5) * size,
    weight: 0.65 + random() * 0.9,
    mottle: random(),
  }))
  const alpha = new Float64Array(TILE * TILE)
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const column = Math.floor(x / size)
      const row = Math.floor(y / size)
      let nearest = Infinity
      let second = Infinity
      let mottle = 0
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const s = seeds[((row + dy + cells) % cells) * cells + ((column + dx + cells) % cells)]!
          // Distances wrap at the tile's edge, which is what makes it seamless.
          const wx = Math.abs(((s.x + TILE) % TILE) - x)
          const wy = Math.abs(((s.y + TILE) % TILE) - y)
          const d = Math.hypot(Math.min(wx, TILE - wx), Math.min(wy, TILE - wy)) / s.weight
          if (d < nearest) {
            second = nearest
            nearest = d
            mottle = s.mottle
          } else if (d < second) {
            second = d
          }
        }
      }
      alpha[y * TILE + x] = CREASE * (nearest / second) ** DOME + MOTTLE * mottle
    }
  }
  return alpha
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(4)
  head.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const tail = Buffer.alloc(4)
  tail.writeUInt32BE(crc32(body))
  return Buffer.concat([head, body, tail])
}

/** A palette PNG of 4 bits a pixel: every entry black, and only its alpha differs. */
function encode(alpha: Float64Array, TILE: number): Buffer {
  const top = alpha.reduce((a, b) => Math.max(a, b), 0)
  const header = Buffer.alloc(13)
  header.writeUInt32BE(TILE, 0)
  header.writeUInt32BE(TILE, 4)
  header.set([4, 3, 0, 0, 0], 8)
  const transparency = Buffer.from(Array.from({ length: LEVELS }, (_, i) => Math.round((top * 255 * i) / (LEVELS - 1))))
  const rows = Buffer.alloc((Math.ceil(TILE / 2) + 1) * TILE)
  for (let y = 0; y < TILE; y++) {
    const start = y * (Math.ceil(TILE / 2) + 1)
    for (let x = 0; x < TILE; x++) {
      const level = Math.round((alpha[y * TILE + x]! / top) * (LEVELS - 1))
      const at = start + 1 + (x >> 1)
      rows[at] = rows[at]! | (x % 2 === 0 ? level << 4 : level)
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('PLTE', Buffer.alloc(LEVELS * 3)),
    chunk('tRNS', transparency),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const dir = join('public', 'textures')
mkdirSync(dir, { recursive: true })
for (const { name, size, seed } of TILES) {
  const file = encode(pebbles(size, seed), size)
  writeFileSync(join(dir, name), file)
  console.log(`${name}: ${size} x ${size}, ${file.length} bytes`)
}
