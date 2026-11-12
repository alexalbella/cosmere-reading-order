import { BOOK_STATUSES, CONNECTION_TYPES, FORMATS, ORDER_KEYS } from '../data/types'
import type { OrderKey } from '../data/types'
import { isObject } from '../data/soundness'
import { defaultFilters, type Filters } from '../filters/filters'
import type { Lang } from '../i18n'
import { defaultStorage } from './store'

const KEY = 'cosmere.prefs.v1'

/** `map` is the ring by worlds, `circle` the ring in the reading order, `shelf` the list. */
export const VIEWS = ['map', 'circle', 'shelf'] as const
export type View = (typeof VIEWS)[number]

export interface Prefs {
  lang: Lang
  view: View
  order: OrderKey
  filters: Filters
}

function only<T extends string>(list: readonly T[], value: unknown, fallback: T[]): T[] {
  if (!Array.isArray(value)) return fallback
  return value.filter((x): x is T => list.includes(x as T))
}

function sanitizeFilters(value: unknown): Filters | undefined {
  if (!isObject(value)) return undefined
  const d = defaultFilters()
  return {
    statuses: only(BOOK_STATUSES, value.statuses, d.statuses),
    formats: only(FORMATS, value.formats, d.formats),
    series: Array.isArray(value.series) ? value.series.filter((s): s is string => typeof s === 'string') : [],
    phases: Array.isArray(value.phases) ? value.phases.filter((p): p is number => Number.isInteger(p)) : [],
    connectionTypes: only(CONNECTION_TYPES, value.connectionTypes, d.connectionTypes),
    theories: value.theories === true,
  }
}

/** Device preferences. Each field that is missing or foreign is left out, so the default applies. */
export function loadPrefs(storage: Storage | undefined = defaultStorage()): Partial<Prefs> {
  let parsed: unknown
  try {
    const raw = storage?.getItem(KEY)
    parsed = raw ? JSON.parse(raw) : undefined
  } catch {
    return {}
  }
  if (!isObject(parsed)) return {}
  const out: Partial<Prefs> = {}
  if (parsed.lang === 'es' || parsed.lang === 'en') out.lang = parsed.lang
  if (VIEWS.includes(parsed.view as View)) out.view = parsed.view as View
  if (ORDER_KEYS.includes(parsed.order as OrderKey)) out.order = parsed.order as OrderKey
  const filters = sanitizeFilters(parsed.filters)
  if (filters) out.filters = filters
  return out
}

export function savePrefs(prefs: Prefs, storage: Storage | undefined = defaultStorage()): void {
  try {
    storage?.setItem(KEY, JSON.stringify(prefs))
  } catch {
    // the page works without it
  }
}
