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
