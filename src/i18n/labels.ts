import { isObject } from '../data/soundness'
import type { ApocryphalReason, Book, CanonValue, ConnectionType, Format, MarkStatus, RpgKind, WorldKey, WritingStage } from '../data/types'
import { WORLDS } from '../design/worlds'
import { SERIES_ES } from './names'
import { t, titleOf, type Lang, type StringKey } from './index'

const FORMAT_KEYS: Record<Format, StringKey> = {
  novel: 'formatNovel',
  novella: 'formatNovella',
  short: 'formatShort',
  comic: 'formatComic',
  illustrated: 'formatIllustrated',
  anthology: 'formatAnthology',
  rpg: 'formatRpg',
  essay: 'formatEssay',
}

const TYPE_KEYS: Record<ConnectionType, StringKey> = {
  major: 'typeMajor',
  significant: 'typeSignificant',
  minor: 'typeMinor',
  egg: 'typeEgg',
  appearance: 'typeAppearance',
}

const WRITING_KEYS: Record<WritingStage, StringKey> = { idea: 'writingIdea', drafting: 'writingDrafting', revising: 'writingRevising', done: 'writingDone' }
const APOCRYPHAL_KEYS: Record<ApocryphalReason, StringKey> = {
  'not-canon': 'apocryphalNotCanon',
  parody: 'apocryphalParody',
  superseded: 'apocryphalSuperseded',
  unfinished: 'apocryphalUnfinished',
}
const RPG_KEYS: Record<RpgKind, StringKey> = {
  core: 'rpgCore',
  'world-guide': 'rpgWorldGuide',
  adventure: 'rpgAdventure',
  supplement: 'rpgSupplement',
  screen: 'rpgScreen',
  starter: 'rpgStarter',
}
const CANON_KEYS: Record<CanonValue, StringKey> = { yes: 'canonYes', partly: 'canonPartly', no: 'canonNo', unknown: 'canonUnknown' }

/** A label from a list, or '' for a value the list lacks: the plate then has nothing to say. */
function fromList<K extends string>(keys: Record<K, StringKey>, value: unknown, lang: Lang): string {
  return typeof value === 'string' && Object.hasOwn(keys, value) ? t(keys[value as K], lang) : ''
}
export const apocryphalLabel = (reason: unknown, lang: Lang): string => fromList(APOCRYPHAL_KEYS, reason, lang)
export const rpgKindLabel = (kind: unknown, lang: Lang): string => fromList(RPG_KEYS, kind, lang)
export const canonLabel = (value: unknown, lang: Lang): string => fromList(CANON_KEYS, value, lang)

/** The writing stage, with the author's percentage when he gave one. */
export function writingText(writing: unknown, lang: Lang): string {
  if (!isObject(writing)) return ''
  const stage = fromList(WRITING_KEYS, writing.stage, lang)
  if (!stage) return ''
  const p = writing.percent
  return typeof p === 'number' && Number.isFinite(p) ? `${stage} · ${p}${lang === 'es' ? ' %' : '%'}` : stage
}

/** An expected date or window, said as an estimate when it is not official. '' for anything malformed. */
export function expectedText(expected: unknown, lang: Lang): string {
  if (!isObject(expected) || typeof expected.when !== 'string') return ''
  const window = /^(\d{4})-(H[12]|Q[1-4])$/.exec(expected.when)
  let when: string
  if (window) {
    const [, year, part] = window
    if (part === 'H1') when = t('expectedFirstHalf', lang, year!)
    else if (part === 'H2') when = t('expectedSecondHalf', lang, year!)
    else when = t('expectedQuarter', lang, part!.slice(1), year!)
  } else when = publicationText(expected.when, lang)
  if (!when) return ''
  const text = when.charAt(0).toUpperCase() + when.slice(1)
  return expected.official === true ? text : `${text} (${t('expectedEstimate', lang)})`
}

export const formatLabel = (f: Format, lang: Lang): string => t(FORMAT_KEYS[f], lang)
export const typeLabel = (c: ConnectionType, lang: Lang): string => t(TYPE_KEYS[c], lang)
export const worldName = (world: WorldKey, lang: Lang): string => WORLDS[world]?.[lang] ?? t('worldOther', lang)

/** A series in the reader's language. The catalogue names it in English, and a series with no Spanish name keeps that. */
export const seriesName = (series: string, lang: Lang): string => (lang === 'es' ? (SERIES_ES[series] ?? series) : series)

/** The star system a world belongs to, when the catalogue knows it. */
export const systemName = (world: WorldKey, lang: Lang): string => WORLDS[world]?.system?.[lang] ?? ''

const locale = (lang: Lang): string => (lang === 'es' ? 'es-ES' : 'en-GB')

/** A count with the thousands set apart as the language does. */
export const numberText = (n: number, lang: Lang): string => new Intl.NumberFormat(locale(lang)).format(n)

/** The day a book came out, as precise as the catalogue has it: a day, a month or a year. Anything else gives ''. */
export function publicationText(publication: string | undefined, lang: Lang): string {
  const parts = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(publication ?? '')
  if (!parts) return ''
  const [, year, month, day] = parts
  if (!month) return year!
  const date = new Date(`${year}-${month}-${day ?? '01'}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale(lang), { day: day ? 'numeric' : undefined, month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
}

/** The series, the part of it when it has parts, and the book's number there. '' for a book on its own. */
export function seriesText(book: Book, lang: Lang): string {
  if (!book.series) return ''
  const series = seriesName(book.series, lang)
  const part = book.subseries ? seriesName(book.subseries, lang) : ''
  // A part is often named after its series: then the part alone says both.
  const name = part ? (part.toLowerCase().includes(series.toLowerCase()) ? part : `${series}, ${part}`) : series
  return book.seriesIndex ? `${name} · ${t('factNumber', lang, book.seriesIndex)}` : name
}

/** The Spanish edition as a fact beside its label: who published it and when, or how it stands. */
export function editionFact(book: Book, volume: Book | null, lang: Lang): string {
  if (volume) return t('comesInside', lang, volumeName(book, volume, lang))
  const e = book.esEdition
  switch (e?.status) {
    case 'published': {
      const parts = [e.publisher, e.year, e.pages ? `${numberText(e.pages, lang)} ${t('pages', lang)}` : undefined].filter(Boolean)
      return parts.length ? parts.join(' · ') : t('esFactPublished', lang)
    }
    case 'announced':
      return t('esFactAnnounced', lang)
    case 'none':
      return t('esFactNone', lang)
    default:
      return t('esFactUnknown', lang)
  }
}

const PHASE_KEYS: Record<number, StringKey> = { 1: 'shelfPhase1', 2: 'shelfPhase2', 3: 'shelfPhase3' }

/** A phase has one name wherever it appears: the plate, the shelf and the filters. */
export function phaseName(phase: number, lang: Lang): string {
  const key = PHASE_KEYS[phase]
  return key ? t(key, lang) : t('phaseN', lang, phase)
}

/** What a book's state is called. Colour never carries it alone. */
export function stateLabel(book: Book, mark: MarkStatus, unlocked: boolean, lang: Lang): string {
  if (book.status === 'announced') return t('stateAnnounced', lang)
  if (book.status === 'planned') return t('statePlanned', lang)
  if (book.status === 'apocryphal') return t('stateApocryphal', lang)
  if (mark === 'read') return t('stateRead', lang)
  if (unlocked) return t('stateUnlocked', lang)
  if (mark === 'reading') return t('stateReading', lang)
  if (mark === 'skipped') return t('stateSkipped', lang)
  return t('stateUnread', lang)
}

/** A book's accessible name, in every view: the full title, the world and the state. */
export function bookName(book: Book, mark: MarkStatus, unlocked: boolean, lang: Lang): string {
  return `${titleOf(book, lang)}, ${worldName(book.world, lang)}, ${stateLabel(book, mark, unlocked, lang)}`
}

/** The Spanish volume's name when the book says it, else the volume's own title. */
export function volumeName(book: Book, volume: Book, lang: Lang): string {
  const es = book.esEdition?.in
  if (lang === 'es' && typeof es === 'string' && es.trim() !== '') return es
  return titleOf(volume, lang)
}

/** The edition sentence. A work that comes inside a volume names the volume to buy. */
export function editionLine(book: Book, volume: Book | null, lang: Lang): string {
  if (volume) return t('comesInside', lang, volumeName(book, volume, lang))
  switch (book.esEdition?.status) {
    case 'published':
      return t('esPublished', lang)
    case 'announced':
      return t('esAnnounced', lang)
    case 'none':
      return t('esNone', lang)
    default:
      return t('esUnknown', lang)
  }
}
