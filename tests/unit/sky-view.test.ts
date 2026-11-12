import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, test } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import App from '../../src/App.vue'
import { useApp } from '../../src/app/useApp'
import { fixtureCatalog } from '../fixtures/catalog'

function fakeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, v),
  }
}
const mounted: VueWrapper[] = []
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))
function run(readAll: boolean) {
  const catalog = fixtureCatalog()
  const app = useApp({ initial: { catalog, connectionsAvailable: true }, storage: fakeStorage() })
  app.view.value = 'map'
  if (readAll) app.markBooks(catalog.books.map((b) => b.id), 'read')
  const wrapper = mount(App, { props: { app }, attachTo: document.body })
  mounted.push(wrapper)
  return { app, wrapper }
}

describe('the sky and the planets', () => {
  test('the sky is the same with no connections and with every connection visible', async () => {
    const none = run(false)
    const all = run(true)
    await none.wrapper.vm.$nextTick()
    expect(none.app.visibleConnections.value).toHaveLength(0)
    expect(all.app.visibleConnections.value.length).toBeGreaterThan(0)
    expect(all.wrapper.find('.sky').html()).toBe(none.wrapper.find('.sky').html())
  })

  test('the sky takes no pointer events and is hidden from assistive tech', () => {
    const { wrapper } = run(false)
    expect(wrapper.find('.sky').attributes('aria-hidden')).toBe('true')
    expect(wrapper.findAll('.planet').every((p) => p.attributes('aria-hidden') === 'true')).toBe(true)
    const css = readFileSync('src/design/tokens.css', 'utf8')
    expect(css).toMatch(/\.sky \{ pointer-events: none; \}/)
    expect(css).toMatch(/\.planet \{ pointer-events: none; \}/)
  })

  test('every world arc has its planet, wearing its own emblem', () => {
    const { wrapper } = run(false)
    const arcs = wrapper.findAll('.arc')
    expect(arcs.length).toBeGreaterThan(0)
    for (const arc of arcs) expect(arc.find('.planet use').attributes('href')).toBe(`#emblem-${arc.attributes('data-world')}`)
  })

  test('the sky moves only under no-preference', () => {
    const css = readFileSync('src/design/tokens.css', 'utf8')
    const block = /@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/.exec(css)?.[0] ?? ''
    expect(block).toContain('animation: sky-drift')
    expect(block).toContain('animation: sky-twinkle')
    expect(block).toContain('animation: sky-comet')
    const rest = css.replace(block, '')
    expect(rest).not.toMatch(/animation: sky-/)
  })
})
