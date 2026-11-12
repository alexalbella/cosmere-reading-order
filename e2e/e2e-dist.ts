import { join, resolve } from 'node:path'

const root = join(import.meta.dirname, '..')

/** The build e2e serves. Never `dist/`, which is what a deploy publishes. */
export const E2E_DIST = '.e2e-dist'

/** Where the e2e fixtures go. Refuses the deploy folder, whatever it is told. */
export function e2eDataDir(outDir: string = E2E_DIST): string {
  const out = resolve(root, outDir)
  if (out === resolve(root, 'dist')) throw new Error('e2e must never write into dist/')
  return join(out, 'data')
}
