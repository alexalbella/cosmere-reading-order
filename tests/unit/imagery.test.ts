import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, test } from 'vitest'
import { buildSprite, spriteSources } from '../../scripts/lib/sprite'
import { BOOK_STATUSES, FORMATS, WORLD_KEYS, type Book } from '../../src/data/types'
import CoverThumb from '../../src/imagery/CoverThumb.vue'
import ProgressMark from '../../src/imagery/ProgressMark.vue'
import { fixtureCatalog } from '../fixtures/catalog'

const SVG_DIR = join('src', 'imagery', 'svg')
const SHEET = join('src', 'imagery', 'SpriteSheet.vue')
const book = (id: string, extra: Partial<Book> = {}): Book => ({ ...fixtureCatalog().books.find((b) => b.id === id)!, ...extra })

describe('the sprite', () => {
  test('the sprite has a symbol for every world, format and status the catalogue knows', () => {
    const ids = [...readFileSync(SHEET, 'utf8').matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1])
    for (const w of WORLD_KEYS) expect(ids).toContain(`emblem-${w}`)
    for (const f of FORMATS) expect(ids).toContain(`format-${f}`)
    for (const s of BOOK_STATUSES) expect(ids).toContain(`status-${s}`)
  })

  test('no source carries text, fonts, raster images, inline styles or a link to another origin', () => {
    const files = readdirSync(SVG_DIR).filter((f) => f.endsWith('.svg'))
    expect(files.length).toBeGreaterThanOrEqual(29)
    for (const f of files) {
      const svg = readFileSync(join(SVG_DIR, f), 'utf8')
      expect(svg, f).not.toMatch(/<text|font-family|<image|href=|@import|url\(|<script|style=/i)
    }
  })

  test('the generated sheet is up to date with its sources', () => {
    expect(buildSprite(spriteSources(SVG_DIR))).toBe(readFileSync(SHEET, 'utf8'))
  })

  test('the sprite is not in the first-load scripts: the page loads it after its first paint', () => {
    const app = readFileSync(join('src', 'App.vue'), 'utf8')
    expect(app).toMatch(/defineAsyncComponent\(\s*\(\)\s*=>\s*import\('\.\/imagery\/SpriteSheet\.vue'\)\s*\)/)
    expect(app).not.toMatch(/import SpriteSheet/)
  })
})

describe('the uniform-edition cover', () => {
  test('a cover shows the series number only for a work in a series', () => {
    const numbered = mount(CoverThumb, { props: { book: book('orchard-dusk', { seriesIndex: 2 }) } })
    expect(numbered.find('.cover-number').text()).toBe('2')
    expect(numbered.find('use.cover-emblem').attributes('href')).toBe('#emblem-scadrial')
    expect(numbered.find('use.cover-format').attributes('href')).toBe('#format-novella')
    const alone = mount(CoverThumb, { props: { book: book('glass-harbour') } })
    expect(alone.find('.cover-number').exists()).toBe(false)
  })

  test('the cover wears its own world, and says nothing to assistive tech', () => {
    const cover = mount(CoverThumb, { props: { book: book('northern-gale') } })
    expect(cover.attributes('data-world')).toBe('nalthis')
    expect(cover.attributes('aria-hidden')).toBe('true')
  })
})

describe('the writing progress mark', () => {
  test('a progress mark lights the stages up to the current one and clamps the percentage', () => {
    const src = 'https://source.example.test/p'
    const mark = (w: Record<string, unknown>) => mount(ProgressMark, { props: { writing: { source: src, asOf: '2026-11-01', ...w } as Book['writing'] } })
    const revising = mark({ stage: 'revising', percent: 140 })
    expect(revising.findAll('.stage.on')).toHaveLength(3)
    expect(revising.find('.progress-fill').attributes('width')).toBe('105')
    expect(mark({ stage: 'idea', percent: -5 }).find('.progress-fill').attributes('width')).toBe('0')
    expect(mark({ stage: 'drafting', percent: 40 }).find('.progress-fill').attributes('width')).toBe('42')
    expect(mark({ stage: 'done' }).find('.progress-fill').exists()).toBe(false)
    expect(mark({ stage: 'done' }).findAll('.stage.on')).toHaveLength(4)
  })

  test('a stage outside the list, or no writing at all, draws nothing', () => {
    expect(mount(ProgressMark, { props: { writing: { stage: 'outline' } as unknown as Book['writing'] } }).find('svg').exists()).toBe(false)
    expect(mount(ProgressMark, { props: { writing: undefined } }).find('svg').exists()).toBe(false)
  })
})

describe("the site's own seal", () => {
  // The symbol inherited from upstream, which this site no longer uses.
  const INHERITED_SHA256 = 'a2479b505f736856c6b4651db65d0e83fc8a3c69f52fe06d6a9d07f604ec8845'
  const seals = ['public/seal.svg', 'public/seal-small.svg']

  test('the seal is a single-colour shape usable as a mask: no text, no strokes that rely on colour, no opacity', () => {
    for (const file of seals) {
      const svg = readFileSync(file, 'utf8')
      expect(svg, file).toMatch(/viewBox="0 0 100 100"/)
      expect(svg, file).toMatch(/<path/)
      expect(svg, file).not.toMatch(/<text|stroke=|opacity|style=|<image|href=|<mask/i)
    }
  })

  test('the seal is not the inherited one', () => {
    for (const file of seals) expect(createHash('sha256').update(readFileSync(file)).digest('hex'), file).not.toBe(INHERITED_SHA256)
  })

  test('the icons exist at their sizes', () => {
    const size = (file: string) => {
      const png = readFileSync(file)
      expect(png.subarray(1, 4).toString('ascii'), file).toBe('PNG')
      return [png.readUInt32BE(16), png.readUInt32BE(20)]
    }
    expect(size('public/icons/icon-192.png')).toEqual([192, 192])
    expect(size('public/icons/icon-512.png')).toEqual([512, 512])
    expect(size('public/icons/icon-maskable-512.png')).toEqual([512, 512])
    expect(size('public/icons/apple-touch-icon.png')).toEqual([180, 180])
    expect(size('public/icons/favicon-32.png')).toEqual([32, 32])
  })

  test('the page names its small icon, drawn from the small cut', () => {
    expect(readFileSync('index.html', 'utf8')).toMatch(/<link rel="icon" type="image\/png" sizes="32x32" href="\/icons\/favicon-32.png"/)
  })
})
