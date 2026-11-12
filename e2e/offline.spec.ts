import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { t } from '../src/i18n'
import { E2E_DIST } from './e2e-dist'
import { everyFilter, pick, storedState } from './support'

// Service workers on, and no page.route: the catalogue comes from dist/data (see global-setup).
test.use({ serviceWorkers: 'allow' })

const en = (key: Parameters<typeof t>[0]) => t(key, 'en')
const dist = join(import.meta.dirname, '..', E2E_DIST)

/** Prefs only: a key already in storage is left alone, so a reload keeps what the page wrote. */
async function seed(page: Page): Promise<void> {
  await page.route('**/api/state', (route) => route.fulfill({ json: { marks: {}, unlocks: {} } }))
  const prefs = JSON.stringify({ lang: 'en', view: 'shelf', order: 'recommended', filters: everyFilter() })
  await page.addInitScript((p) => {
    if (localStorage.getItem('cosmere.prefs.v1') === null) localStorage.setItem('cosmere.prefs.v1', p)
  }, prefs)
}

/** One online load, then the worker controls the page. */
async function loadOnline(page: Page): Promise<void> {
  await seed(page)
  await page.goto('/')
  await expect(page.locator('.sentence')).toBeVisible()
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
}

test.describe('the worker waits for the books', () => {
  const registrations = (page: Page) => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)

  for (const outcome of ['arrive', 'fail'] as const) {
    test(`it registers only once they ${outcome}`, async ({ page }) => {
      await seed(page)
      let release = (): void => {}
      const gate = new Promise<void>((resolve) => (release = resolve))
      await page.route('**/data/books.json', async (route) => {
        await gate
        return outcome === 'arrive' ? route.continue() : route.abort()
      })
      await page.goto('/')
      await expect(page.locator('.app-message')).toBeVisible()
      // Long past the timer that stands in for a paint.
      await page.waitForTimeout(600)
      expect(await registrations(page)).toBe(0)

      release()
      await expect.poll(() => registrations(page)).toBe(1)
    })
  }
})

test('after one online load, reloading offline shows the list and the sentence', async ({ page, context }) => {
  await loadOnline(page)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.sentence')).toContainText(en('startWith'))
  await expect(page.locator('[aria-label^="Ash Road,"]')).toBeVisible()
})

test('marking offline persists across reload', async ({ page, context }) => {
  await loadOnline(page)
  await context.setOffline(true)
  await page.reload()
  await pick(page, 'Ash Road')
  await page.getByRole('button', { name: en('markRead'), exact: true }).click()
  await expect.poll(async () => (await storedState(page)).marks['ash-road']?.status).toBe('read')
  await page.reload()
  await expect(page.locator('.sentence')).toBeVisible()
  expect((await storedState(page)).marks['ash-road']?.status).toBe('read')
})

test('an expired session: a quiet notice, marks kept, and the link gets past the worker to Access', async ({ page, context }) => {
  await loadOnline(page)
  await pick(page, 'Ash Road')
  await page.getByRole('button', { name: en('markRead'), exact: true }).click()
  await expect.poll(async () => (await storedState(page)).marks['ash-road']?.status).toBe('read')

  // What Access does with an expired session: a redirect to its login page.
  await page.route('**/api/state', (route) =>
    route.fulfill({ status: 302, headers: { location: 'https://team.example.test/cdn-cgi/access/login' } }),
  )
  await page.reload()
  const link = page.getByRole('link', { name: en('syncSigninAction'), exact: true })
  await expect(link).toBeVisible()
  await expect(page.locator('footer')).toContainText(en('syncSignin'))
  expect((await storedState(page)).marks['ash-road']?.status).toBe('read')

  // A plain reload is answered by the worker, so Access would never see it.
  const plain = await page.reload()
  expect(plain?.fromServiceWorker()).toBe(true)

  await expect(link).toBeVisible()
  const navigation = page.waitForResponse((res) => res.request().isNavigationRequest())
  await link.click()
  expect((await navigation).fromServiceWorker()).toBe(false)

  // The marker leaves the address, so the worker answers reloads again, offline too.
  await expect(page.locator('.sentence')).toBeVisible()
  expect(new URL(page.url()).search).toBe('')
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('.sentence')).toBeVisible()
  expect((await storedState(page)).marks['ash-road']?.status).toBe('read')
})

test('the way back from Access reaches the network: its answer is what sets the cookie', async ({ page }) => {
  await loadOnline(page)
  const plain = await page.reload()
  expect(plain?.fromServiceWorker()).toBe(true)
  // What the worker keeps and serves carries the policy too.
  expect(plain?.headers()['content-security-policy']).toContain("default-src 'none'")

  const callback = '/cdn-cgi/access/authorized?token=x&redirect_url=%2F%3Fsignin%3D1'
  const direct = await page.goto(callback)
  expect(direct?.fromServiceWorker()).toBe(false)

  // The real one arrives as a redirect from the team's domain.
  await page.goto('/')
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  const origin = new URL(page.url()).origin
  await page.route('https://team.example.test/**', (route) =>
    route.fulfill({ status: 302, headers: { location: `${origin}${callback}` } }),
  )
  const redirected = await page.goto('https://team.example.test/cdn-cgi/access/login')
  expect(new URL(page.url()).pathname).toBe('/cdn-cgi/access/authorized')
  expect(redirected?.fromServiceWorker()).toBe(false)
})

test('the built index.html links the manifest with crossorigin="use-credentials"', () => {
  const html = readFileSync(join(dist, 'index.html'), 'utf8')
  expect(html).toMatch(/<link[^>]*rel="manifest"[^>]*crossorigin="use-credentials"/)
})

test('the generated worker precaches the data with a revision and leaves /api alone', () => {
  const sw = readFileSync(join(dist, 'sw.js'), 'utf8')
  for (const name of ['books.json', 'meta.json']) {
    expect(sw).toContain(`{url:"data/${name}",revision:"`)
  }
  // The navigation route, and only it, carries the /api/ denylist; nothing else routes /api.
  expect(sw).toContain(String.raw`NavigationRoute(e.createHandlerBoundToURL("index.html"),{denylist:[/^\/api\//,/^\/cdn-cgi\//,/[?&]signin=/]})`)
  expect(sw).not.toMatch(/registerRoute\([^)]*api/)
})
