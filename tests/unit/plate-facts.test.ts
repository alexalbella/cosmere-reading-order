// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { copyPlateFacts } from '../../scripts/lib/plate-facts'
import type { Book } from '../../src/data/types'
import { fixtureCatalog } from '../fixtures/catalog'

const SRC = 'https://source.example.test/p'
const book = (id: string): Book => structuredClone(fixtureCatalog().books.find((b) => b.id === id)!)

describe('copyPlateFacts', () => {
  test('copies the plate facts a work has, and nothing else', () => {
    const b = book('low-tide-atlas')
    const before = { status: b.status, order: b.order, world: b.world }
    copyPlateFacts(b, {
      writing: { stage: 'drafting', percent: 40, source: SRC, asOf: '2026-11-01' },
      expected: { when: '2027-H2', official: false, source: SRC },
      announcedIn: SRC,
    })
    expect(b.writing).toEqual({ stage: 'drafting', percent: 40, source: SRC, asOf: '2026-11-01' })
    expect(b.expected?.when).toBe('2027-H2')
    expect(b.announcedIn).toBe(SRC)
    expect({ status: b.status, order: b.order, world: b.world }).toEqual(before)
  })
  test('a fact given as null takes the field away; one not given leaves it', () => {
    const b = book('paper-wolves')
    copyPlateFacts(b, { publisher: 'Lantern Press', rpgKind: 'core' })
    copyPlateFacts(b, { publisher: null })
    expect(b.publisher).toBeUndefined()
    expect(b.rpgKind).toBe('core')
  })
  test('never touches a status or an order, whatever the facts carry', () => {
    const b = book('ash-road')
    copyPlateFacts(b, { status: 'announced', order: {} } as unknown as Parameters<typeof copyPlateFacts>[1])
    expect(b.status).toBe('published')
    expect(b.order).toEqual({ recommended: 1, publication: 1 })
  })
})
