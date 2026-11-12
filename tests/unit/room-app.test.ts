import { afterEach, describe, expect, test } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import App from '../../src/App.vue'
import { useApp } from '../../src/app/useApp'
import { t } from '../../src/i18n'
import { fixtureCatalog } from '../fixtures/catalog'

// The ring makes room, on the PC (jsdom has no matchMedia, so App.vue takes the PC layout).
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

function run(mutate?: (c: ReturnType<typeof fixtureCatalog>) => void) {
  const catalog = fixtureCatalog()
  mutate?.(catalog)
  const app = useApp({ initial: { catalog, connectionsAvailable: true }, storage: fakeStorage() })
  app.lang.value = 'es'
  app.view.value = 'circle'
  app.markBooks(['ash-road'], 'read')
  app.markBooks(['glass-harbour'], 'reading')
  const wrapper = mount(App, { props: { app }, attachTo: document.body })
  mounted.push(wrapper)
  return { app, wrapper }
}
const plate = (w: VueWrapper) => w.find('.slot .plate')
const title = (w: VueWrapper, start: string) => w.find(`.t[aria-label^="${start}"]`)

describe('the ring makes room', () => {
  test('at rest on the PC no plate shows, and the sentence offers the mark and the card', async () => {
    const { wrapper, app } = run()
    await wrapper.vm.$nextTick()
    expect(app.selectedId.value).toBe('glass-harbour')
    expect(plate(wrapper).exists()).toBe(false)
    const actions = wrapper.find('.rest-actions')
    expect(actions.text()).toContain(t('markRead', 'es'))
    expect(actions.text()).toContain(t('seeCard', 'es'))
  })

  test('touching a title opens its card, even the one already selected', async () => {
    const { wrapper } = run()
    await title(wrapper, 'Puerto de cristal').trigger('click')
    expect(plate(wrapper).find('.plate-title').text()).toBe('Puerto de cristal')
    expect(wrapper.find('.cover').classes()).toContain('room-open')
  })

  test('Escape and the close button close the card, keep the selection and give the focus back to the title', async () => {
    const { wrapper, app } = run()
    await title(wrapper, 'Vendaval del norte').trigger('click')
    expect(plate(wrapper).exists()).toBe(true)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.vm.$nextTick()
    expect(plate(wrapper).exists()).toBe(false)
    expect(app.selectedId.value).toBe('northern-gale')
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^Vendaval del norte/)
    await title(wrapper, 'Vendaval del norte').trigger('click')
    await plate(wrapper).find('.plate-close').trigger('click')
    expect(plate(wrapper).exists()).toBe(false)
    expect(app.selectedId.value).toBe('northern-gale')
  })

  test('a panel opens as a drawer and closes the card', async () => {
    const { wrapper } = run()
    await title(wrapper, 'Vendaval del norte').trigger('click')
    await wrapper.find('.m-filters').trigger('click')
    expect(wrapper.find('.slot .panel').exists()).toBe(true)
    await wrapper.find('.m-filters').trigger('click')
    expect(plate(wrapper).exists()).toBe(false)
  })

  test("the sentence's mark marks the current book and opens its card with the undo", async () => {
    const { wrapper, app } = run()
    await wrapper.find('.rest-actions .btn-gold').trigger('click')
    expect(app.markOf('glass-harbour')).toBe('read')
    expect(plate(wrapper).find('.plate-title').text()).toBe('Puerto de cristal')
    expect(plate(wrapper).text()).toContain(t('undo', 'es'))
  })

  test('an anthology in progress opens its card instead, where the question lives', async () => {
    const { wrapper, app } = run()
    app.markBooks(['glass-harbour'], 'read')
    app.markBooks(['salt-and-lantern'], 'reading')
    await wrapper.vm.$nextTick()
    await wrapper.find('.rest-actions .btn-gold').trigger('click')
    expect(app.markOf('salt-and-lantern')).toBe('reading')
    expect(plate(wrapper).find('.plate-title').text()).toBe('Sal y farol')
  })

  test('in the shelf view the plate shows as before, with no rest actions', async () => {
    const { wrapper, app } = run()
    app.view.value = 'shelf'
    await wrapper.vm.$nextTick()
    expect(plate(wrapper).exists()).toBe(true)
    expect(wrapper.find('.rest-actions').exists()).toBe(false)
  })
})
