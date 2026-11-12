import { defineConfig } from '@playwright/test'

import { E2E_DIST } from './e2e/e2e-dist'

const PORT = 4173

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './e2e/global-setup.ts',
  // Only offline.spec allows the service worker: page.route cannot see its fetches.
  use: { baseURL: `http://127.0.0.1:${PORT}`, serviceWorkers: 'block' },
  projects: [
    { name: 'pc', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'phone', use: { viewport: { width: 390, height: 844 }, hasTouch: true } },
  ],
  webServer: {
    command: `npx tsx scripts/build-data.ts && npx vite build --outDir ${E2E_DIST} --emptyOutDir && npx vite preview --outDir ${E2E_DIST} --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 240_000,
  },
})
