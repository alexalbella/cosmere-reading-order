import { expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../../src/App.vue'
import { useApp } from '../../src/app/useApp'
import { fixtureCatalog } from '../fixtures/catalog'

test('app mounts and shows the name', () => {
  const app = useApp({ initial: { catalog: fixtureCatalog(), connectionsAvailable: true }, storage: {} as Storage })
  const w = mount(App, { props: { app } })
  expect(w.text()).toContain('Cosmere')
})

test('lifting a world tints the cover with it, and letting go returns to the world in hand', async () => {
  const app = useApp({ initial: { catalog: fixtureCatalog(), connectionsAvailable: true }, storage: {} as Storage })
  const w = mount(App, { props: { app } })
  const shell = w.get('.app')
  const inHand = shell.attributes('data-world')
  expect(shell.attributes('data-tint')).toBe(inHand)
  const other = app.shownBooks.value.find((b) => b.world !== inHand)!.world
  app.toggleLift(other)
  await w.vm.$nextTick()
  expect(shell.attributes('data-tint')).toBe(other)
  expect(shell.attributes('data-world')).toBe(inHand)
  app.toggleLift(other)
  await w.vm.$nextTick()
  expect(shell.attributes('data-tint')).toBe(inHand)
})

test('the atlas is on the cover of the ring views only, hidden from assistive tech', async () => {
  const app = useApp({ initial: { catalog: fixtureCatalog(), connectionsAvailable: true }, storage: {} as Storage })
  app.view.value = 'map'
  const w = mount(App, { props: { app } })
  const atlas = w.get('.cover > .atlas')
  expect(atlas.attributes('aria-hidden')).toBe('true')
  expect(atlas.attributes('focusable')).toBe('false')
  expect(atlas.findAll('a, button, [tabindex], title, text')).toHaveLength(0)
  app.view.value = 'shelf'
  await w.vm.$nextTick()
  expect(w.find('.atlas').exists()).toBe(false)
})
