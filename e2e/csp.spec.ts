import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { t } from '../src/i18n'
import { CATALOG_IDS, marksOf, pick, withFixture } from './support'

const en = (key: Parameters<typeof t>[0], ...args: (string | number)[]) => t(key, 'en', ...args)
const HEADERS = readFileSync(join(import.meta.dirname, '..', 'public', '_headers'), 'utf8')
const POLICY = /Content-Security-Policy: (.*)/.exec(HEADERS)![1]!.trim()

interface Watched {
  violations: string[]
}

/** Only the directive and what was blocked: nothing of the page's text. */
async function watch(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const seen = window as unknown as Watched
    seen.violations = []
    document.addEventListener('securitypolicyviolation', (e) => seen.violations.push(`${e.effectiveDirective} ${e.blockedURI}`))
  })
}

const violations = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as Watched).violations)
const control = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

test('the pages are served with the policy of public/_headers', async ({ page }) => {
  await withFixture(page)
  const res = await page.goto('/')
  const headers = res!.headers()
  expect(headers['content-security-policy']).toBe(POLICY)
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['referrer-policy']).toBe('no-referrer')
})

test('the listener would see a violation: inline style is refused and reported', async ({ page }) => {
  await watch(page)
  await withFixture(page)
  await page.goto('/')
  await expect(page.locator('.app')).toBeVisible()
  await page.evaluate(() => {
    const style = document.createElement('style')
    style.textContent = 'body { outline: 1px solid red }'
    document.head.append(style)
  })
  await expect.poll(() => violations(page)).toContainEqual(expect.stringContaining('style-src'))
})

for (const view of ['map', 'circle', 'shelf'] as const) {
  test(`nothing on the page breaks the policy, ${view}`, async ({ page }) => {
    await watch(page)
    await withFixture(page, { marks: marksOf(CATALOG_IDS.filter((id) => id !== 'copper-orchard' && id !== 'salt-and-lantern' && id !== 'lantern-keeper')) }, { view, lang: 'en' })
    await page.goto('/')
    await expect(page.locator('.app')).toBeVisible()

    // Connection notes.
    await pick(page, 'Ash Road')
    const more = page.locator('.plate-more')
    if ((await more.isVisible()) && (await more.getAttribute('aria-expanded')) === 'false') await more.click()
    await page.locator('.con-b').first().click()
    await expect(page.locator('.con-note')).toBeVisible()

    // The dialog on marking an anthology.
    await pick(page, 'Salt and Lantern')
    await control(page, en('markRead')).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await control(page, en('cancel')).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)

    // Filters.
    await control(page, en('filters')).click()
    await expect(page.locator('.panel')).toBeVisible()
    await control(page, en('filters')).click()

    // Spoilers, and the dialog on unlocking.
    await pick(page, 'Copper Orchard')
    await control(page, en('spoilers')).click()
    await control(page, en('unlockButton', 'Copper Orchard')).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await control(page, en('unlockYes')).click()
    await control(page, en('lockAgain')).click()
    await control(page, en('spoilers')).click()

    // Settings, with the export it offers, in the state that shows its link too.
    await page.route('**/api/state', (route) => route.fulfill({ status: 401, body: '' }))
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await control(page, en('settings')).click()
    await expect(page.locator('.panel').getByRole('link', { name: en('syncSigninAction'), exact: true })).toBeVisible()
    const download = page.waitForEvent('download')
    await control(page, en('export')).click()
    await download

    // The other language redraws what is on the page.
    await page.getByRole('button', { name: t('language_es', 'es'), exact: true }).click()
    await expect(page.locator('html')).toHaveAttribute('lang', 'es')

    expect(await violations(page)).toEqual([])
  })
}
