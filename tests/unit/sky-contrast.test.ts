// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { WORLD_KEYS } from '../../src/data/types'
import { WORLDS } from '../../src/design/worlds'
import { contrast, GROUND_SHARE, hex, nightBackdrops } from '../support/night'

// Titles sit on the night sky now. The model of what lies under a title is in `tests/support/night.ts`.
const css = readFileSync('src/design/tokens.css', 'utf8')

describe('the night sky behind the titles', () => {
  test('the ground of the sky is the leather mixed with its tone, as the stylesheet says', () => {
    expect(GROUND_SHARE).toBeGreaterThanOrEqual(70)
    expect(GROUND_SHARE).toBeLessThanOrEqual(100)
    for (const w of WORLD_KEYS) expect(css).toMatch(new RegExp(`\\[data-world=${w}\\][^{]*\\{[^}]*--world-tone: var\\(--tone-${w}\\)`))
  })

  test.each(WORLD_KEYS)('every title ink passes 4.5:1 on the night, at every radius a title reaches, on %s', (field) => {
    for (const b of nightBackdrops([field])) {
      const w = WORLDS[b.title]
      for (const ink of [w.ink, w.inkUnread].filter((x): x is string => !!x)) {
        expect(contrast(hex(ink), b.colour), `${b.title} at radius ${b.radius} on ${field}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
