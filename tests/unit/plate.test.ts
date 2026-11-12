import { afterEach, describe, expect, test, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import App from '../../src/App.vue'
import { useApp } from '../../src/app/useApp'
import { MAX_STATE_BYTES } from '../../src/state/transfer'
import { t } from '../../src/i18n'
import { fixtureCatalog } from '../fixtures/catalog'
import { fixtureNotes, fixtureSynopses } from '../fixtures/content'

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

type Fixture = ReturnType<typeof fixtureCatalog>

function setup(opts: { mutate?: (c: Fixture) => void; connectionsAvailable?: boolean; lang?: 'es' | 'en' } = {}) {
  const catalog = fixtureCatalog()
  opts.mutate?.(catalog)
  const app = useApp({
    initial: { catalog, connectionsAvailable: opts.connectionsAvailable ?? true },
    storage: fakeStorage(),
  })
  if (opts.lang) app.lang.value = opts.lang
  const wrapper = mount(App, { props: { app }, attachTo: document.body })
  return { app, wrapper }
}

const mounted: VueWrapper[] = []
afterEach(() => {
  mounted.splice(0).forEach((w) => w.unmount())
  vi.useRealTimers()
})
function run(opts: Parameters<typeof setup>[0] = {}) {
  const s = setup(opts)
  mounted.push(s.wrapper)
  return s
}

const buttonWith = (w: VueWrapper, text: string) => {
  const found = w.findAll('button').find((b) => b.text().includes(text))
  if (!found) throw new Error(`no button with "${text}"`)
  return found
}
const hasButton = (w: VueWrapper, text: string) => w.findAll('button').some((b) => b.text().includes(text))
const plateOf = (w: VueWrapper) => w.find('section.plate')
const pick = (w: VueWrapper, title: string) => w.find(`button[aria-label^="${title},"]`).trigger('click')

describe('the plate', () => {
  test("an unread book's plate contains no LEAK marker", async () => {
    const { wrapper } = run()
    await pick(wrapper, 'Camino de ceniza')
    expect(plateOf(wrapper).text()).toContain('Camino de ceniza')
    expect(wrapper.html()).not.toContain('LEAK-')
  })

  test('a plate never shows a count of hidden connections', async () => {
    const { wrapper } = run()
    await pick(wrapper, 'Camino de ceniza')
    const text = plateOf(wrapper).text()
    expect(text).not.toMatch(/\d+\s*(conexion|connection)/i)
    expect(text).toContain('Las conexiones aparecen a medida que lees.')
    expect(wrapper.text()).not.toMatch(/\d+\s*(conexion|connection)/i)
  })

  test('connection text appears only after asking', async () => {
    const { app, wrapper } = run()
    app.markBooks(['ash-road'], 'read')
    app.markBooks(['copper-orchard'], 'read')
    await pick(wrapper, 'Camino de ceniza')
    const plate = plateOf(wrapper)
    expect(plate.text()).toContain('Huerto de cobre')
    expect(plate.html()).not.toContain('LEAK-')
    expect(plate.text()).not.toContain('Enlaces externos')
    await buttonWith(wrapper, 'Leer').trigger('click')
    expect(plateOf(wrapper).text()).toContain('LEAK-c-0001 es')
    // Where the source links show, a quiet line says they lead out to pages with no spoiler gating.
    expect(plateOf(wrapper).text()).toContain('Enlaces externos: pueden destripar otros libros.')
    expect(plateOf(wrapper).text()).toContain('primary.example.test')
    const link = plateOf(wrapper).find('a')
    expect(link.attributes('href')).toBe('https://primary.example.test/a')
    expect(link.attributes('rel')).toBe('noopener noreferrer')
  })

  test('a source that is not http or https is never a link', async () => {
    const { app, wrapper } = run({
      mutate: (c) => {
        c.connections[0]!.sources = [{ url: 'javascript:alert(1)', kind: 'word-of-brandon' }]
      },
    })
    app.markBooks(['ash-road', 'copper-orchard'], 'read')
    await pick(wrapper, 'Camino de ceniza')
    expect(app.visibleConnections.value).toEqual([])
    expect(wrapper.html()).not.toContain('javascript:')
  })

  test('a connection with a malformed description never shows, and nothing throws', async () => {
    const { app, wrapper } = run({
      lang: 'es',
      mutate: (c) => {
        // @ts-expect-error a malformed field on purpose
        c.connections[0]!.description = { en: 'LEAK-c-0001 en', es: 7 }
      },
    })
    app.markBooks(['ash-road', 'copper-orchard'], 'read')
    // An invalid description is not showable at all: the row never exists.
    await pick(wrapper, 'Camino de ceniza')
    expect(plateOf(wrapper).text()).toContain('Las conexiones aparecen a medida que lees.')
  })

  test('marking an anthology asks first, naming its works', async () => {
    const { app, wrapper } = run()
    await pick(wrapper, 'Sal y farol')
    await buttonWith(wrapper, 'Marcar como leído').trigger('click')
    const dialog = wrapper.find('[role="alertdialog"]')
    expect(dialog.exists()).toBe(true)
    expect(dialog.text()).toContain('The Lantern Keeper')
    expect(app.state.value.marks['salt-and-lantern']).toBeUndefined()
    await buttonWith(wrapper, 'Cancelar').trigger('click')
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
    expect(app.state.value.marks['salt-and-lantern']).toBeUndefined()
    expect(app.state.value.marks['lantern-keeper']).toBeUndefined()
  })

  test('the anthology question puts the safe answer first and gives it the focus', async () => {
    const { app, wrapper } = run()
    await pick(wrapper, 'Sal y farol')
    await buttonWith(wrapper, 'Marcar como leído').trigger('click')
    await wrapper.vm.$nextTick()
    const dialog = wrapper.find('[role="alertdialog"]')
    const labels = dialog.findAll('button').map((b) => b.text())
    expect(labels[0]).toBe('Cancelar')
    expect(document.activeElement?.textContent?.trim()).toBe('Cancelar')
    // A held Enter lands on Cancel and marks nothing.
    expect(app.state.value.marks['salt-and-lantern']).toBeUndefined()
    expect(labels).toContain('Solo la antología')
    expect(labels).toContain('Marcar todas')
  })

  test('confirming an anthology marks it with its works, and only the anthology marks just that', async () => {
    const { app, wrapper } = run()
    await pick(wrapper, 'Sal y farol')
    await buttonWith(wrapper, 'Marcar como leído').trigger('click')
    await buttonWith(wrapper, 'Marcar todas').trigger('click')
    expect(app.state.value.marks['salt-and-lantern']?.status).toBe('read')
    expect(app.state.value.marks['lantern-keeper']?.status).toBe('read')

    app.undoLast()
    await wrapper.vm.$nextTick()
    await buttonWith(wrapper, 'Marcar como leído').trigger('click')
    await buttonWith(wrapper, 'Solo la antología').trigger('click')
    expect(app.state.value.marks['salt-and-lantern']?.status).toBe('read')
    expect(app.state.value.marks['lantern-keeper']?.status).toBe('none')
  })

  test('marking a plain book stamps it and offers the undo in the same place', async () => {
    const { app, wrapper } = run()
    await pick(wrapper, 'Camino de ceniza')
    await buttonWith(wrapper, 'Marcar como leído').trigger('click')
    expect(app.state.value.marks['ash-road']?.status).toBe('read')
    expect(plateOf(wrapper).text()).toContain('Marcado como leído.')
    await buttonWith(wrapper, 'Deshacer').trigger('click')
    expect(app.state.value.marks['ash-road']?.status).toBe('none')
    expect(hasButton(wrapper, 'Marcar como leído')).toBe(true)
  })

  test('the plate offers reading, skip and clear as quiet actions', async () => {
    const { app, wrapper } = run()
    app.markBooks(['glass-harbour'], 'reading')
    await pick(wrapper, 'Camino de ceniza')
    expect(hasButton(wrapper, 'No lo voy a leer')).toBe(true)
    await buttonWith(wrapper, 'Estoy leyéndolo').trigger('click')
    expect(app.state.value.marks['ash-road']?.status).toBe('reading')
    app.markBooks(['ash-road'], 'read')
    app.lastChange.value = null
    await wrapper.vm.$nextTick()
    expect(hasButton(wrapper, 'Quitar de leídos')).toBe(true)
  })

  test('the plate gives every book the same anatomy, with public facts only', async () => {
    const { wrapper } = run()
    await pick(wrapper, 'Camino de ceniza')
    const text = plateOf(wrapper).text()
    expect(text).toContain('Novela')
    expect(text).toContain('300 págs.')
    expect(text).toContain('Obra 1 de')
    // Each fact stands beside its name, and the edition is said as a fact, not as a sentence.
    expect(text).toContain('En España')
    expect(text).toContain('Publicada')
    expect(text).toContain('Serie')
  })

  test('a book added in the last 60 days shows the new marker; meta.updatedOn appears in the footer', async () => {
    const recent = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10)
    const { wrapper } = run({
      mutate: (c) => {
        c.books[0]!.addedOn = recent
      },
    })
    await pick(wrapper, 'Camino de ceniza')
    expect(plateOf(wrapper).text()).toContain('Nuevo')
    await pick(wrapper, 'Puerto de cristal')
    expect(plateOf(wrapper).text()).not.toContain('Nuevo')
    expect(wrapper.find('footer').text()).toMatch(/4\s+nov\.?\s+2026/)
  })

  test('the plate shows the Spanish title with the English one beneath, and English alone in English', async () => {
    const { wrapper, app } = run()
    await pick(wrapper, 'Camino de ceniza')
    expect(plateOf(wrapper).text()).toContain('Ash Road')
    app.lang.value = 'en'
    await wrapper.vm.$nextTick()
    expect(plateOf(wrapper).find('.plate-orig').exists()).toBe(false)
    expect(plateOf(wrapper).text()).toContain('Ash Road')
  })
})

describe('a store that cannot be read', () => {
  test('the footer says so calmly, in both languages', async () => {
    const catalog = fixtureCatalog()
    const app = useApp({
      initial: { catalog, connectionsAvailable: true },
      storage: Object.assign(fakeStorage(), {}),
    })
    expect(app.stateCorrupt.value).toBe(false)
    const storage = fakeStorage()
    storage.setItem('cosmere.state.v1', '{broken')
    const bad = useApp({ initial: { catalog: fixtureCatalog(), connectionsAvailable: true }, storage })
    const wrapper = mount(App, { props: { app: bad } })
    mounted.push(wrapper)
    expect(wrapper.find('footer [role="status"]').text()).toContain('No se ha podido leer lo que tenías guardado')
    bad.lang.value = 'en'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('footer [role="status"]').text()).toContain('could not be read')
  })
})

describe('connections, when there are none to show', () => {
  test('no connection data available shows the quiet sentence', async () => {
    const { wrapper } = run({ connectionsAvailable: false })
    await pick(wrapper, 'Camino de ceniza')
    expect(plateOf(wrapper).text()).toContain('Las conexiones aparecen a medida que lees.')
    expect(wrapper.find('footer').text()).not.toContain('Las conexiones aparecen a medida que lees.')
  })

  test('nothing visible yet: the plate says they appear as he reads, and the footer has nothing to say', async () => {
    const { wrapper } = run()
    await pick(wrapper, 'Camino de ceniza')
    expect(plateOf(wrapper).text()).toContain('Las conexiones aparecen a medida que lees.')
    const footer = wrapper.find('footer')
    expect(footer.find('.foot-count').exists()).toBe(false)
    expect(footer.text()).not.toMatch(/conexion/)
  })

  test('once some are visible the footer gives the global count, and only that', async () => {
    const { app, wrapper } = run()
    app.markBooks(['ash-road', 'copper-orchard'], 'read')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('footer').text()).toContain('1 conexión a la vista')
  })
})

describe('the sentence', () => {
  test('names what he is reading, what comes next, and the gaps once', async () => {
    const { app, wrapper } = run()
    app.markBooks(['glass-harbour'], 'reading')
    await wrapper.vm.$nextTick()
    const sentence = wrapper.find('.sentence-col').text()
    expect(sentence).toContain('Estás leyendo')
    expect(sentence).toContain('Puerto de cristal')
    expect(sentence).toContain('Después toca')
    expect(sentence).toContain('Sal y farol')
    expect(sentence).toContain('Te saltaste')
    expect(sentence.split('Camino de ceniza')).toHaveLength(2)
  })

  test('a skipped work leaves the gaps', async () => {
    const { app, wrapper } = run()
    app.markBooks(['glass-harbour'], 'reading')
    app.markBooks(['ash-road'], 'skipped')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sentence-col').text()).not.toContain('Te saltaste')
  })

  test('next sentence names the volume to buy when next comes inside one', async () => {
    const { app, wrapper } = run()
    app.markBooks(['ash-road', 'glass-harbour', 'salt-and-lantern'], 'read')
    await wrapper.vm.$nextTick()
    const sentence = wrapper.find('.sentence-col').text()
    expect(sentence).toContain('The Lantern Keeper')
    expect(sentence).toContain('Viene dentro de Sal y farol. Ese es el que hay que comprar.')
  })

  test('tapping a title in the sentence selects that book and changes no mark', async () => {
    const { app, wrapper } = run()
    const before = JSON.stringify(app.state.value)
    await wrapper.find('.sentence-col .title-btn').trigger('click')
    expect(app.selectedId.value).toBe('ash-road')
    expect(JSON.stringify(app.state.value)).toBe(before)
  })

  test('everything read says so', async () => {
    const { app, wrapper } = run()
    app.markBooks(
      app.shownBooks.value.map((b) => b.id),
      'read',
    )
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.sentence-col').text()).toContain('Has leído todo lo publicado que cuenta.')
  })
})

describe('unlock', () => {
  test('unlock asks first and sits apart', async () => {
    const { app, wrapper } = run()
    await pick(wrapper, 'Camino de ceniza')
    // The plate has the mark button and no unlock button.
    expect(hasButton(wrapper, 'Marcar como leído')).toBe(true)
    expect(hasButton(wrapper, 'Desbloquear')).toBe(false)

    await buttonWith(wrapper, 'Sin spoilers').trigger('click')
    // The panel replaces the plate: unlock is there, the mark button is not on screen.
    expect(hasButton(wrapper, 'Marcar como leído')).toBe(false)
    await buttonWith(wrapper, 'Desbloquear Camino de ceniza').trigger('click')
    expect(app.state.value.unlocks['ash-road']).toBeUndefined()
    expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true)
    await buttonWith(wrapper, 'No, dejarlo como está').trigger('click')
    expect(app.state.value.unlocks['ash-road']).toBeUndefined()

    await buttonWith(wrapper, 'Desbloquear Camino de ceniza').trigger('click')
    await buttonWith(wrapper, 'Sí, desbloquear').trigger('click')
    expect(app.state.value.unlocks['ash-road']?.on).toBe(true)
    // Locked again from the same panel.
    await buttonWith(wrapper, 'Volver a bloquear').trigger('click')
    expect(app.state.value.unlocks['ash-road']?.on).toBe(false)
  })

  test('the unlock panel says what it reveals only in general words', async () => {
    const { wrapper } = run()
    await pick(wrapper, 'Camino de ceniza')
    await buttonWith(wrapper, 'Sin spoilers').trigger('click')
    expect(wrapper.find('.panel').text()).toContain('Una conexión solo se dibuja cuando has leído todos los libros que exige.')
    expect(wrapper.html()).not.toContain('LEAK-')
  })
})

describe('settings', () => {
  test('role-playing books are off, and the setting turns them on', async () => {
    const { app, wrapper } = run()
    expect(app.shownBooks.value.some((b) => b.format === 'rpg')).toBe(false)
    await buttonWith(wrapper, 'Ajustes').trigger('click')
    await buttonWith(wrapper, 'Incluir los libros de rol').trigger('click')
    expect(app.shownBooks.value.some((b) => b.format === 'rpg')).toBe(true)
  })

  test('import says in words what it did', async () => {
    const { app, wrapper } = run()
    await buttonWith(wrapper, 'Ajustes').trigger('click')
    const text = JSON.stringify({ version: 1, marks: { 'ash-road': { status: 'read', at: 5 } }, unlocks: {} })
    const input = wrapper.find('input[type="file"]')
    const file = new File([text], 'lo-leido.json', { type: 'application/json' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await vi.waitFor(() => expect(wrapper.find('.panel').text()).toContain('Importado: 1 libro marcado.'))
    expect(app.state.value.marks['ash-road']?.status).toBe('read')

    const bad = new File(['{nope'], 'x.json')
    Object.defineProperty(input.element, 'files', { value: [bad], configurable: true })
    await input.trigger('change')
    await vi.waitFor(() => expect(wrapper.find('.panel').text()).toContain('Ese archivo no es una copia de lo leído.'))
  })

  describe('a file that unlocks', () => {
    const text = JSON.stringify({
      version: 1,
      marks: { 'ash-road': { status: 'read', at: 5 } },
      unlocks: { 'glass-harbour': { on: true, at: 5 } },
    })
    async function give(wrapper: VueWrapper): Promise<void> {
      await buttonWith(wrapper, 'Ajustes').trigger('click')
      const input = wrapper.find('input[type="file"]')
      const file = new File([text], 'lo-leido.json', { type: 'application/json' })
      Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
      await input.trigger('change')
      await vi.waitFor(() => expect(wrapper.find('[role="alertdialog"]').exists()).toBe(true))
    }

    test('asks first, naming the titles, with the safe answer first and focused, and writes nothing yet', async () => {
      const { app, wrapper } = run()
      await give(wrapper)
      const dialog = wrapper.find('[role="alertdialog"]')
      expect(dialog.text()).toContain('Puerto de cristal')
      expect(dialog.findAll('button')[0]!.text()).toBe('Cancelar')
      expect(document.activeElement?.textContent?.trim()).toBe('Cancelar')
      expect(app.state.value.marks['ash-road']).toBeUndefined()
      expect(app.isUnlocked('glass-harbour')).toBe(false)
    })

    test('cancel applies nothing and says so', async () => {
      const { app, wrapper } = run()
      await give(wrapper)
      await buttonWith(wrapper, 'Cancelar').trigger('click')
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false)
      expect(wrapper.find('.panel').text()).toContain('Importación cancelada.')
      expect(app.state.value.marks['ash-road']).toBeUndefined()
      expect(app.isUnlocked('glass-harbour')).toBe(false)
    })

    test('the alternate applies the marks only', async () => {
      const { app, wrapper } = run()
      await give(wrapper)
      await buttonWith(wrapper, 'Solo las marcas').trigger('click')
      expect(app.state.value.marks['ash-road']?.status).toBe('read')
      expect(app.isUnlocked('glass-harbour')).toBe(false)
      expect(wrapper.find('.panel').text()).toContain('Importado: 1 libro marcado.')
    })

    test('confirming applies everything and reports the unlocks', async () => {
      const { app, wrapper } = run()
      await give(wrapper)
      await buttonWith(wrapper, 'Importar todo').trigger('click')
      expect(app.state.value.marks['ash-road']?.status).toBe('read')
      expect(app.isUnlocked('glass-harbour')).toBe(true)
      expect(wrapper.find('.panel').text()).toContain('Desbloqueado a mano: 1 libro.')
    })
  })

  test('a file above the size limit is refused without being read', async () => {
    const { app, wrapper } = run()
    await buttonWith(wrapper, 'Ajustes').trigger('click')
    const input = wrapper.find('input[type="file"]')
    const big = new File(['{}'], 'x.json')
    Object.defineProperty(big, 'size', { value: MAX_STATE_BYTES + 1 })
    const read = vi.spyOn(big, 'text')
    Object.defineProperty(input.element, 'files', { value: [big], configurable: true })
    await input.trigger('change')
    await vi.waitFor(() => expect(wrapper.find('.panel').text()).toContain('Ese archivo no es una copia de lo leído.'))
    expect(read).not.toHaveBeenCalled()
    expect(Object.keys(app.state.value.marks)).toHaveLength(0)
  })

  test('the sync state is told in words', async () => {
    const { app, wrapper } = run()
    await buttonWith(wrapper, 'Ajustes').trigger('click')
    expect(wrapper.find('.panel').text()).toContain('Lo leído se guarda en este aparato.')
    app.syncStatus.value = 'offline'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.panel').text()).toContain('Sin conexión.')
    expect(wrapper.find('footer [role="status"]').text()).toContain('Sin conexión.')
  })
})

describe('filters', () => {
  test('a chip changes the filters and the books shown', async () => {
    const { app, wrapper } = run()
    await buttonWith(wrapper, 'Filtros').trigger('click')
    await buttonWith(wrapper, 'Novela corta').trigger('click')
    expect(app.filters.value.formats).not.toContain('novella')
    expect(app.shownBooks.value.some((b) => b.format === 'novella')).toBe(false)
    await buttonWith(wrapper, 'De publicación').trigger('click')
    expect(app.order.value).toBe('publication')
  })
})

describe('the shell', () => {
  test('a failed catalogue shows a calm sentence, not a blank page', async () => {
    const down = (async () => new Response('no', { status: 500 })) as typeof fetch
    const app = useApp({ fetchFn: down, storage: fakeStorage() })
    const wrapper = mount(App, { props: { app } })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.text()).toContain('No se ha podido cargar el catálogo.'))
  })

  test('books that cannot be applied get the same calm sentence and Try again', async () => {
    const fetchFn = (async (input: RequestInfo | URL) =>
      String(input).endsWith('books.json') ? Response.json([null]) : new Response('no', { status: 500 })) as typeof fetch
    const app = useApp({ fetchFn, storage: fakeStorage() })
    const wrapper = mount(App, { props: { app } })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.text()).toContain('No se ha podido cargar el catálogo.'))
    expect(wrapper.find('button.quiet').text()).toBe('Volver a intentarlo')
  })

  test('a note that arrives after a language change reads in the language chosen', async () => {
    let answer: ((r: Response) => void) | undefined
    const fixture = fixtureCatalog()
    const fetchFn = (async (input: RequestInfo | URL) =>
      String(input).endsWith('books.json')
        ? Response.json(fixture.books)
        : String(input).endsWith('connections.json')
          ? new Promise<Response>((resolve) => (answer = resolve))
          : new Response('no', { status: 404 })) as typeof fetch
    const storage = fakeStorage()
    storage.setItem('cosmere.state.v1', JSON.stringify({ marks: Object.fromEntries(fixture.books.map((b) => [b.id, { status: 'read', at: 1 }])), unlocks: {} }))
    const app = useApp({ fetchFn, storage })
    const wrapper = mount(App, { props: { app } })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(answer).toBeTruthy())
    app.lang.value = 'en'
    app.selectBook('ash-road')
    answer!(Response.json(fixture.connections))
    await vi.waitFor(() => expect(wrapper.find('.con-b').exists()).toBe(true))
    await wrapper.find('.con-b').trigger('click')
    const note = wrapper.find('.con-note').text()
    expect(note).toMatch(/LEAK-c-\d{4} en/)
    expect(note).not.toMatch(/LEAK-c-\d{4} es/)
  })

  test('connections that fail get a quiet notice, and connections on their way get none', async () => {
    let answer: ((r: Response) => void) | undefined
    const fetchFn = (async (input: RequestInfo | URL) =>
      String(input).endsWith('books.json')
        ? Response.json(fixtureCatalog().books)
        : String(input).endsWith('connections.json')
          ? new Promise<Response>((resolve) => (answer = resolve))
          : new Response('no', { status: 404 })) as typeof fetch
    const app = useApp({ fetchFn, storage: fakeStorage() })
    const wrapper = mount(App, { props: { app } })
    mounted.push(wrapper)
    await vi.waitFor(() => expect(wrapper.find('footer').exists()).toBe(true))
    expect(wrapper.find('footer [role="status"]').exists()).toBe(false)
    await vi.waitFor(() => expect(answer).toBeTruthy())
    expect(wrapper.find('footer [role="status"]').exists()).toBe(false)

    answer!(new Response('no', { status: 500 }))
    await vi.waitFor(() => expect(wrapper.find('footer [role="status"]').text()).toContain('No se han podido cargar las conexiones'))
  })

  test('the interface speaks English when asked', async () => {
    const { wrapper } = run({ lang: 'en' })
    expect(wrapper.text()).toContain('Start with')
    expect(wrapper.text()).toContain('Map')
    expect(wrapper.text()).toContain('Order')
  })

  test('nothing in the app renders html from data', () => {
    const { wrapper } = run()
    expect(wrapper.html()).not.toContain('<script')
  })
})

describe('plates for works not published, apocryphal and role-playing', () => {
  const SRC = 'https://source.example.test/p'
  function runAll(mutate?: (c: Fixture) => void) {
    const s = run({ mutate })
    s.app.filters.value = { ...s.app.filters.value, statuses: ['published', 'announced', 'planned', 'apocryphal'], formats: [...s.app.filters.value.formats, 'rpg'] }
    return s
  }
  const book = (c: Fixture, id: string) => c.books.find((b) => b.id === id)! as unknown as Record<string, unknown>

  test('an announced work shows every planned row, with «Por anunciar» where empty', async () => {
    const { wrapper } = runAll()
    await wrapper.vm.$nextTick()
    await pick(wrapper, 'Low Tide Atlas')
    const text = plateOf(wrapper).text()
    for (const label of ['Formato', 'Escritura', 'Prevista', 'Anuncio']) expect(text).toContain(label)
    expect(text.match(/Por anunciar/g)?.length).toBe(3)
  })

  test('an announced work with its facts shows them, and links its announcement', async () => {
    const { wrapper } = runAll((c) => {
      Object.assign(book(c, 'low-tide-atlas'), {
        writing: { stage: 'drafting', percent: 40, source: SRC, asOf: '2026-11-01' },
        expected: { when: '2027-H2', official: false, source: SRC },
        announcedIn: SRC,
      })
    })
    await wrapper.vm.$nextTick()
    await pick(wrapper, 'Low Tide Atlas')
    const plate = plateOf(wrapper)
    expect(plate.text()).toContain('Escribiéndose · 40 %')
    expect(plate.text()).toContain('Segunda mitad de 2027 (estimación)')
    expect(plate.text()).not.toContain('Por anunciar')
    expect(plate.find(`a[href="${SRC}"]`).text()).toBe('Ver el anuncio')
  })

  test('an apocryphal work shows its reason and where it appeared', async () => {
    const { wrapper } = runAll((c) => {
      Object.assign(book(c, 'glass-harbour'), { status: 'apocryphal', apocryphal: { reason: 'parody', source: SRC }, publisher: 'Lantern Press', publication: '2015-04' })
    })
    await wrapper.vm.$nextTick()
    await pick(wrapper, 'Puerto de cristal')
    const text = plateOf(wrapper).text()
    expect(text).toContain('Apócrifa')
    expect(text).toContain('Parodia')
    expect(text).toContain('abril de 2015 · Lantern Press')
    expect(text).not.toContain('Por anunciar')
  })

  test('a role-playing book shows publisher, line, kind, campaign and canon', async () => {
    const { wrapper } = runAll((c) => {
      Object.assign(book(c, 'paper-wolves'), {
        publisher: 'Lantern Press',
        line: 'Chartmaker RPG',
        rpgKind: 'core',
        crowdfunding: SRC,
        canon: { value: 'partly', source: SRC },
      })
    })
    await wrapper.vm.$nextTick()
    await pick(wrapper, 'Paper Wolves')
    const plate = plateOf(wrapper)
    for (const value of ['Lantern Press', 'Chartmaker RPG', 'Libro básico', 'En parte']) expect(plate.text()).toContain(value)
    expect(plate.find(`a[href="${SRC}"]`).text()).toBe('Ver la campaña')
  })

  test('a published plate is unchanged: no row says «Por anunciar»', async () => {
    const { wrapper } = runAll()
    await wrapper.vm.$nextTick()
    await pick(wrapper, 'Camino de ceniza')
    expect(plateOf(wrapper).text()).not.toContain('Por anunciar')
  })

  test('in English the empty rows say «To be announced»', async () => {
    const { wrapper, app } = runAll()
    app.lang.value = 'en'
    await wrapper.vm.$nextTick()
    await pick(wrapper, 'Low Tide Atlas')
    expect(plateOf(wrapper).text().match(/To be announced/g)?.length).toBe(3)
  })
})

describe('synopsis and notes on the plate', () => {
  const withContent = (c: Fixture) => {
    c.synopses = fixtureSynopses()
    c.notes = fixtureNotes()
  }
  const synopsisOf = (w: VueWrapper) => plateOf(w).find('.syn')

  test('a visible synopsis is folded and its text is absent until asked', async () => {
    const { wrapper } = run({ mutate: withContent })
    await pick(wrapper, 'Huerto de cobre')
    const toggle = synopsisOf(wrapper).find('button')
    expect(toggle.text()).toContain('Sinopsis')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(wrapper.html()).not.toContain('LEAK-syn-copper-orchard')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')
    expect(synopsisOf(wrapper).text()).toContain('LEAK-syn-copper-orchard es')
    expect(wrapper.html()).not.toContain('LEAK-syn-copper-orchard en')
  })

  test('a gated synopsis says the same line on every work and names no other work', async () => {
    const { wrapper } = run({
      mutate: (c) => {
        withContent(c)
        // A third work of the Orchard series, after the opener: its synopsis waits on the opener too.
        c.books.find((b) => b.id === 'glass-harbour')!.series = 'Orchard'
        c.synopses = c.synopses.filter((s) => s.book !== 'glass-harbour')
        c.synopses.push({ ...fixtureSynopses()[1]!, book: 'glass-harbour', requires: ['copper-orchard'] })
      },
    })
    await pick(wrapper, 'Ocaso del huerto')
    const gated = synopsisOf(wrapper).text()
    expect(gated).toBe(t('synopsisGated', 'es'))
    expect(gated).not.toContain('Huerto de cobre')
    expect(synopsisOf(wrapper).find('button').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('LEAK-syn-orchard-dusk')
    await pick(wrapper, 'Puerto de cristal')
    expect(synopsisOf(wrapper).text()).toBe(gated)
  })

  test('a missing synopsis says so', async () => {
    const { wrapper } = run({ mutate: withContent })
    await pick(wrapper, 'Vendaval del norte')
    expect(synopsisOf(wrapper).text()).toBe(t('synopsisMissing', 'es'))
  })

  test('no notes section without a visible note', async () => {
    const { wrapper } = run({ mutate: withContent })
    await pick(wrapper, 'Camino de ceniza')
    expect(plateOf(wrapper).find('.plate-notes').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('LEAK-n-')
  })

  test("a note's text appears only after asking", async () => {
    const { wrapper, app } = run({ mutate: withContent })
    app.markBooks(['ash-road'], 'read')
    await pick(wrapper, 'Camino de ceniza')
    const notes = plateOf(wrapper).find('.plate-notes')
    expect(notes.text()).toContain('Palabra de Brandon')
    expect(wrapper.html()).not.toContain('LEAK-n-0001')
    const toggle = notes.find('button')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    await toggle.trigger('click')
    expect(notes.text()).toContain('LEAK-n-0001 es')
    expect(notes.find('a[href="https://primary.example.test/wob"]').exists()).toBe(true)
    expect(notes.text()).toContain(t('conExternal', 'es'))
  })

  test('a wob shows its quote and, in Spanish, the translation beneath; in English the quote alone', async () => {
    const { wrapper, app } = run({ mutate: withContent })
    app.markBooks(['ash-road'], 'read')
    await pick(wrapper, 'Camino de ceniza')
    await plateOf(wrapper).find('.plate-notes button').trigger('click')
    const quote = plateOf(wrapper).find('.note-quote')
    expect(quote.find('[lang="en"]').text()).toContain('LEAK-n-0001 quote en')
    expect(quote.text()).toContain('LEAK-n-0001 quote es')
    app.lang.value = 'en'
    await wrapper.vm.$nextTick()
    expect(plateOf(wrapper).find('.note-quote').text()).toContain('LEAK-n-0001 quote en')
    expect(plateOf(wrapper).find('.note-quote').text()).not.toContain('LEAK-n-0001 quote es')
  })

  test('a note with a source that is not http is unsound, and no trace of it shows', async () => {
    const { wrapper, app } = run({
      mutate: (c) => {
        withContent(c)
        c.notes[0]!.sources.push({ url: 'javascript:alert(1)', kind: 'official' })
      },
    })
    app.markBooks(['ash-road'], 'read')
    await pick(wrapper, 'Camino de ceniza')
    expect(plateOf(wrapper).find('.plate-notes').exists()).toBe(false)
  })
})
