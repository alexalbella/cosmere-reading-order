import type { Book, Connection } from '../data/types'
import { EN, ES } from './strings'
import type { StringKey } from './strings'

export type Lang = 'es' | 'en'
export type { StringKey }

/** `{0}`, `{1}` in the text are replaced by the extra arguments. */
export function t(key: StringKey, lang: Lang, ...args: (string | number)[]): string {
  const text: string = lang === 'es' ? ES[key] : EN[key]
  return args.length === 0 ? text : text.replace(/\{(\d)\}/g, (_, i: string) => String(args[Number(i)] ?? ''))
}

/** Spanish title when there is one, the English title otherwise. */
export function titleOf(book: Book, lang: Lang): string {
  // A blank Spanish title falls back to English, like an absent one.
  return lang === 'es' ? book.titles.es || book.titles.en : book.titles.en
}

/** The text of a connection in one language. Malformed input gives '', and Spanish never borrows English. */
export function descriptionOf(c: Connection, lang: Lang): string {
  const text = (c as { description?: Record<string, unknown> } | null | undefined)?.description?.[lang]
  return typeof text === 'string' ? text : ''
}
