import { describe, expect, it } from 'vitest'
import { E2E_DIST, e2eDataDir } from '../../e2e/e2e-dist'

describe('e2e output folder', () => {
  it('is not the deploy folder', () => {
    expect(E2E_DIST).not.toBe('dist')
    expect(e2eDataDir().replaceAll('\\', '/').endsWith('/dist/data')).toBe(false)
  })
  it('refuses to target dist, however it is spelled', () => {
    expect(() => e2eDataDir('dist')).toThrow()
    expect(() => e2eDataDir('./dist/')).toThrow()
    expect(() => e2eDataDir('.e2e-dist/../dist')).toThrow()
  })
})
