import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { e2eDataDir } from './e2e-dist'
import { fixtureCatalog } from '../tests/fixtures/catalog'

/**
 * `page.route` cannot intercept a service worker's fetches, so the offline spec reads the
 * fixture catalogue from the separate e2e build's data folder. Runs after the webServer has built and started.
 */
export default function globalSetup(): void {
  const catalog = fixtureCatalog()
  const dir = e2eDataDir()
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'books.json'), JSON.stringify(catalog.books))
  writeFileSync(join(dir, 'meta.json'), JSON.stringify(catalog.meta))
  writeFileSync(join(dir, 'connections.json'), JSON.stringify(catalog.connections))
}
