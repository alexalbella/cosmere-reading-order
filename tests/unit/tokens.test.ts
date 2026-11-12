// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { WORLD_KEYS } from '../../src/data/types'
import { WORLDS } from '../../src/design/worlds'

const css = readFileSync('src/design/tokens.css', 'utf8')

describe('world tokens', () => {
  test.each(WORLD_KEYS)('%s: tokens.css and worlds.ts carry the same colours', (key) => {
    const rule = new RegExp(`\\[data-world=${key}\\]\\s*\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
    const w = WORLDS[key]
    expect(rule).toContain(`--field: ${w.field}`)
    expect(rule).toContain(`--deep: ${w.deep}`)
    expect(rule).toContain(`--blind: ${w.blind}`)
    expect(rule).toContain(`--second: ${w.secondary}`)
    expect(css).toContain(`--tone-${key}: ${w.tone}`)
  })
})
