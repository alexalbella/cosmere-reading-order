import { describe, expect, test } from 'vitest'
import { mount } from '@vue/test-utils'
import AppFooter from '../../src/components/AppFooter.vue'

const props = (lang: 'es' | 'en') => ({
  lang,
  updatedOn: '2026-11-04',
  visibleCount: 0,
  syncStatus: 'idle' as const,
  corrupt: false,
  lifted: null,
})

describe('the footer', () => {
  test('says the site is unofficial, in both languages, beside the credit', () => {
    const es = mount(AppFooter, { props: props('es') })
    expect(es.find('.unofficial').text()).toBe('No oficial')
    expect(es.find('.credit').exists()).toBe(true)
    const en = mount(AppFooter, { props: props('en') })
    expect(en.find('.unofficial').text()).toBe('Unofficial')
  })
})
