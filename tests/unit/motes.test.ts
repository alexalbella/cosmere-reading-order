import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { MAX_MOTES, motes } from '../../src/app/motes'

// Motes drift off a title when its book is marked read. They are decoration: at most 22, each removed when its
// animation ends, and none at all when the reader asked for less motion or the browser cannot animate.

type Finish = { onfinish: (() => void) | null; oncancel: (() => void) | null }
let started: Finish[]
const proto = HTMLElement.prototype as unknown as { animate?: unknown }

function allowMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), media: query }))
}

beforeEach(() => {
  started = []
  proto.animate = vi.fn(() => {
    const animation: Finish = { onfinish: null, oncancel: null }
    started.push(animation)
    return animation
  })
  allowMotion(false)
})
afterEach(() => {
  delete proto.animate
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('motes', () => {
  test('at most 22, in the colour given, from the point given, hidden from assistive tech', () => {
    expect(MAX_MOTES).toBe(22)
    const made = motes({ x: 120, y: 80 }, '#58b06e')
    expect(made).toBe(22)
    const pieces = [...document.body.querySelectorAll<HTMLElement>('.mote')]
    expect(pieces).toHaveLength(22)
    for (const piece of pieces) {
      expect(piece.style.getPropertyValue('--c')).toBe('#58b06e')
      expect(piece.style.left).toBe('120px')
      expect(piece.style.top).toBe('80px')
      expect(piece.getAttribute('aria-hidden')).toBe('true')
    }
    expect(started).toHaveLength(22)
  })

  test('each leaves when its animation ends, and nothing is left behind', () => {
    motes({ x: 0, y: 0 }, '#fff')
    for (const animation of started) animation.onfinish?.()
    expect(document.body.querySelectorAll('.mote')).toHaveLength(0)
  })

  test('a cancelled animation takes its mote with it too', () => {
    motes({ x: 0, y: 0 }, '#fff')
    for (const animation of started) animation.oncancel?.()
    expect(document.body.querySelectorAll('.mote')).toHaveLength(0)
  })

  test('none when the reader asked for less motion', () => {
    allowMotion(true)
    expect(motes({ x: 0, y: 0 }, '#fff')).toBe(0)
    expect(document.body.querySelectorAll('.mote')).toHaveLength(0)
  })

  test('none where the page cannot ask, or the browser cannot animate', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(motes({ x: 0, y: 0 }, '#fff')).toBe(0)
    allowMotion(false)
    delete proto.animate
    expect(motes({ x: 0, y: 0 }, '#fff')).toBe(0)
    expect(document.body.querySelectorAll('.mote')).toHaveLength(0)
  })

  test('they go where they are told, and nowhere else', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    motes({ x: 0, y: 0 }, '#fff', { host })
    expect(host.querySelectorAll('.mote')).toHaveLength(22)
    expect(document.body.querySelectorAll(':scope > .mote')).toHaveLength(0)
  })

  test('the same throws of the dice give the same flight', () => {
    const fixed = (): number => 0.5
    motes({ x: 0, y: 0 }, '#fff', { random: fixed })
    const calls = (proto.animate as ReturnType<typeof vi.fn>).mock.calls
    expect(calls).toHaveLength(22)
    expect(new Set(calls.map((c) => JSON.stringify(c))).size).toBe(1)
  })
})
