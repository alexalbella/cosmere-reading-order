import type { ProblemCode } from '../../src/data/types'

/**
 * Changes to c-0001 of the fixture catalogue, each of which must keep it off the screen, with the
 * code the shape has to be reported under. Shared by the tests of the rules, the engine and the
 * validator, so all three answer for the same shapes.
 */
export type BrokenShape = [name: string, change: object, code: ProblemCode]

export const GHOST = 'no-such-book'

const URL_OK = 'https://primary.example.test/a'
const GOOD_SOURCE = { url: URL_OK, kind: 'word-of-brandon' }
const ZERO_WIDTH = '​'

/** An array of `length` slots with only the first few filled: the rest are holes, not undefined. */
function withHoles(length: number, ...present: string[]): string[] {
  const holed = new Array<string>(length)
  present.forEach((value, i) => {
    holed[i] = value
  })
  return holed
}

const official = (url: unknown) => ({ sources: [{ url, kind: 'official' }] })

const citing = (kind: string) => ({ sources: [{ url: URL_OK, kind, cites: 'chapter 3' }] })
const wikiCiting = (cites: unknown) => ({ sources: [{ url: URL_OK, kind: 'wiki', cites }] })

const SLASHLESS_WIKIS = {
  sources: [
    { url: 'https:one.example.test/a', kind: 'wiki' },
    { url: 'https:two.sample.test/a', kind: 'wiki' },
  ],
}

export const MISSING_FIELDS: BrokenShape[] = [
  ['empty requires', { requires: [] }, 'REQUIRES_MISSING_END'],
  ['requires without an end', { requires: ['ash-road'] }, 'REQUIRES_MISSING_END'],
  ['empty sources', { sources: [] }, 'NO_SOURCE'],
  ['empty verifiedBy', { verifiedBy: '' }, 'UNVERIFIED'],
  ['verifiedBy === author', { verifiedBy: 'agent-a' }, 'SELF_VERIFIED'],
  ['unknown from', { from: GHOST, requires: [GHOST, 'copper-orchard'] }, 'REF_UNKNOWN'],
]

export const MALFORMED_FIELDS: BrokenShape[] = [
  // The id
  ['id missing', { id: undefined }, 'BAD_ID'],
  ['id not a string', { id: 1 }, 'BAD_ID'],
  ['id too short', { id: 'c-1' }, 'BAD_ID'],
  ['id too long', { id: 'c-00001' }, 'BAD_ID'],
  ['id in capitals', { id: 'C-0001' }, 'BAD_ID'],
  ['id in an array', { id: ['c-0001'] }, 'BAD_ID'],
  ['id that is text', { id: 'LEAK-PASTED description' }, 'BAD_ID'],

  // requires
  ['requires without the from end', { requires: ['copper-orchard'] }, 'REQUIRES_MISSING_END'],
  ['requires with an unknown book', { requires: ['ash-road', 'copper-orchard', GHOST] }, 'REF_UNKNOWN'],
  ['requires missing', { requires: undefined }, 'REQUIRES_MISSING_END'],
  ['requires null', { requires: null }, 'REQUIRES_MISSING_END'],
  ['requires a string holding both ends', { requires: 'ash-road copper-orchard' }, 'REQUIRES_MISSING_END'],
  ['requires array-like', { requires: { 0: 'ash-road', 1: 'copper-orchard', length: 2 } }, 'REQUIRES_MISSING_END'],
  ['requires with nested ends', { requires: [['ash-road'], ['copper-orchard']] }, 'REF_UNKNOWN'],
  ['requires with a null entry', { requires: ['ash-road', 'copper-orchard', null] }, 'REF_UNKNOWN'],
  ['requires sparse, ends undefined', { from: undefined, to: undefined, requires: new Array(2) }, 'REF_UNKNOWN'],
  ['requires sparse', { requires: new Array(2) }, 'REQUIRES_MISSING_END'],
  ['requires with a hole beside both ends', { requires: withHoles(3, 'ash-road', 'copper-orchard') }, 'REF_UNKNOWN'],

  // The ends, and what kind of connection they make
  ['to missing', { to: undefined }, 'REF_UNKNOWN'],
  ['to blank', { to: '' }, 'REF_UNKNOWN'],
  ['to not a string', { to: 42 }, 'REF_UNKNOWN'],
  ['from missing', { from: undefined }, 'REF_UNKNOWN'],
  ['from not a string', { from: 42 }, 'REF_UNKNOWN'],
  ['to the same as from', { to: 'ash-road', requires: ['ash-road'] }, 'SELF_LOOP'],
  ['to null when it is not an appearance', { to: null, requires: ['ash-road'] }, 'APPEARANCE_MISMATCH'],
  ['an appearance with a to', { type: 'appearance' }, 'APPEARANCE_MISMATCH'],
  ['an appearance with to missing', { type: 'appearance', to: undefined }, 'APPEARANCE_MISMATCH'],

  // Enums
  ['tier unknown', { tier: 'rumour' }, 'BAD_ENUM'],
  ['tier missing', { tier: undefined }, 'BAD_ENUM'],
  ['tier in an array', { tier: ['confirmed'] }, 'BAD_ENUM'],
  ['type unknown', { type: 'huge' }, 'BAD_ENUM'],
  ['type missing', { type: undefined }, 'BAD_ENUM'],

  // sources
  ['sources missing', { sources: undefined }, 'NO_SOURCE'],
  ['sources null', { sources: null }, 'NO_SOURCE'],
  ['sources a string', { sources: URL_OK }, 'NO_SOURCE'],
  ['sources array-like', { sources: { 0: GOOD_SOURCE, length: 1 } }, 'NO_SOURCE'],
  ['sources sparse', { sources: new Array(1) }, 'BAD_SOURCE_URL'],
  ['a hole beside a good source', { sources: Object.assign(new Array(2), { 0: GOOD_SOURCE }) }, 'BAD_SOURCE_URL'],
  ['a null source', { sources: [null] }, 'BAD_SOURCE_URL'],
  ['a bare string source', { sources: [URL_OK] }, 'BAD_SOURCE_URL'],
  ['a source that is an array', { sources: [Object.assign([], GOOD_SOURCE)] }, 'BAD_SOURCE_URL'],
  ['a source without url', { sources: [{ kind: 'official' }] }, 'BAD_SOURCE_URL'],
  ['a source with a blank url', official('  '), 'BAD_SOURCE_URL'],
  ['a source url of TODO', official('TODO'), 'BAD_SOURCE_URL'],
  ['a javascript: source url', official('javascript:alert(1)'), 'BAD_SOURCE_URL'],
  ['an ftp: source url', official('ftp://primary.example.test/a'), 'BAD_SOURCE_URL'],
  ['a source url with only a scheme', official('https://'), 'BAD_SOURCE_URL'],
  ['a source url with no host', official('https://?'), 'BAD_SOURCE_URL'],
  ['a source url with a space in the host', official('https://TO DO'), 'BAD_SOURCE_URL'],
  ['a source url with no slashes', official('https:a.example.test'), 'BAD_SOURCE_URL'],
  ['an http source url with no slashes', official('http:a.example.test'), 'BAD_SOURCE_URL'],
  ['a source url with one slash', official('https:/a.example.test'), 'BAD_SOURCE_URL'],
  ['a source url with three slashes', official('https:///a.example.test'), 'BAD_SOURCE_URL'],
  ['a source url with backslashes', official('https:\\\\a.example.test'), 'BAD_SOURCE_URL'],
  ['a source url with slashes then a backslash', official('https://\\a.example.test'), 'BAD_SOURCE_URL'],
  ['a source url with a line break before the host', official('https://\n/a.example.test'), 'BAD_SOURCE_URL'],
  ['a source url of https:TODO', official('https:TODO'), 'BAD_SOURCE_URL'],
  ['a source url behind a control character', official('\u0001https://a.example.test/x'), 'BAD_SOURCE_URL'],
  ['a source url in an array', official([URL_OK]), 'BAD_SOURCE_URL'],
  ['a source url that is a number', official(42), 'BAD_SOURCE_URL'],
  ['a source without kind', { sources: [{ url: URL_OK }] }, 'BAD_ENUM'],
  ['a source of unknown kind', { sources: [{ url: URL_OK, kind: 'rumour' }] }, 'BAD_ENUM'],
  ['a good source beside a bad one', { sources: [GOOD_SOURCE, null] }, 'BAD_SOURCE_URL'],

  // The source rule
  ['confirmed on one forum', { sources: [{ url: URL_OK, kind: 'forum' }] }, 'CONFIRMED_WEAK_SOURCE'],
  [
    'confirmed on two wikis of one host',
    {
      sources: [
        { url: 'https://wiki.example.test/a', kind: 'wiki' },
        { url: 'https://www.wiki.example.test/b', kind: 'wiki' },
      ],
    },
    'CONFIRMED_WEAK_SOURCE',
  ],
  [
    'confirmed on two forums of different hosts',
    {
      sources: [
        { url: 'https://one.example.test/a', kind: 'forum' },
        { url: 'https://two.example.test/a', kind: 'forum' },
      ],
    },
    'CONFIRMED_WEAK_SOURCE',
  ],
  ['confirmed on one wiki with a blank cites', wikiCiting('   '), 'CONFIRMED_WEAK_SOURCE'],
  ['confirmed on one wiki whose cites is only a control character', wikiCiting(''), 'CONFIRMED_WEAK_SOURCE'],
  ['confirmed on one wiki whose cites is a number', wikiCiting(42), 'CONFIRMED_WEAK_SOURCE'],
  ['confirmed on one wiki without cites', { sources: [{ url: URL_OK, kind: 'wiki' }] }, 'CONFIRMED_WEAK_SOURCE'],
  ['confirmed on a forum that cites a chapter', citing('forum'), 'CONFIRMED_WEAK_SOURCE'],
  ['confirmed on a video that cites a chapter', citing('video'), 'CONFIRMED_WEAK_SOURCE'],
  ['two wikis with no slashes are bad urls', SLASHLESS_WIKIS, 'BAD_SOURCE_URL'],
  ['two wikis with no slashes are not two hosts', SLASHLESS_WIKIS, 'CONFIRMED_WEAK_SOURCE'],
  ['an upstream source on a new connection', { sources: [{ url: URL_OK, kind: 'upstream' }] }, 'UPSTREAM_SOURCE_ON_NEW'],

  // Verification
  ['verifiedBy missing', { verifiedBy: undefined }, 'UNVERIFIED'],
  ['verifiedBy blank', { verifiedBy: '   ' }, 'UNVERIFIED'],
  ['verifiedBy not a string', { verifiedBy: 42 }, 'UNVERIFIED'],
  ['verifiedBy only a zero-width space', { verifiedBy: ZERO_WIDTH }, 'UNVERIFIED'],
  ['verifiedBy only a byte order mark', { verifiedBy: '﻿' }, 'UNVERIFIED'],
  ['verifiedBy only a Hangul filler', { verifiedBy: 'ㅤ' }, 'UNVERIFIED'],
  ['verifiedBy only a NUL', { verifiedBy: '\u0000' }, 'UNVERIFIED'],
  ['verifiedBy only a control character', { verifiedBy: '\u0001' }, 'UNVERIFIED'],
  ['verifiedBy only a delete', { verifiedBy: '\u007f' }, 'UNVERIFIED'],
  ['verifiedBy only a next line', { verifiedBy: '\u0085' }, 'UNVERIFIED'],
  ['verifiedBy only a private use character', { verifiedBy: '' }, 'UNVERIFIED'],
  ['verifiedBy only a lone surrogate', { verifiedBy: '\ud800' }, 'UNVERIFIED'],
  ['verifiedBy the author with a control character inside', { verifiedBy: 'agent\u0001-a' }, 'SELF_VERIFIED'],
  ['verifiedBy the author, decomposed behind a joiner', { author: 'agent-é', verifiedBy: 'agent-e‍́' }, 'SELF_VERIFIED'],
  ['author decomposed behind a joiner', { author: 'agent-e‍́', verifiedBy: 'agent-é' }, 'SELF_VERIFIED'],
  ['verifiedBy the author with spaces', { verifiedBy: ' agent-a ' }, 'SELF_VERIFIED'],
  ['verifiedBy the author in capitals', { verifiedBy: 'AGENT-A' }, 'SELF_VERIFIED'],
  ['verifiedBy the author and a zero-width space', { verifiedBy: `agent-a${ZERO_WIDTH}` }, 'SELF_VERIFIED'],
  ['verifiedBy the author with a soft hyphen', { verifiedBy: 'age­nt-a' }, 'SELF_VERIFIED'],
  ['verifiedBy the author in full-width letters', { verifiedBy: 'ａｇｅｎｔ-ａ' }, 'SELF_VERIFIED'],
  ['verifiedBy the author and a variation selector', { verifiedBy: 'agent-a️' }, 'SELF_VERIFIED'],
  ['verifiedBy the author and an interlinear anchor', { verifiedBy: 'agent-a￹' }, 'SELF_VERIFIED'],
  ['author with a zero-width space, verifiedBy without', { author: `agent-b${ZERO_WIDTH}` }, 'SELF_VERIFIED'],
  ['author missing', { author: undefined }, 'NO_AUTHOR'],
  ['author blank', { author: '' }, 'NO_AUTHOR'],
  ['author only a zero-width space', { author: ZERO_WIDTH }, 'NO_AUTHOR'],
  ['author only a control character', { author: '\u0001' }, 'NO_AUTHOR'],
  ['verifiedOn missing', { verifiedOn: undefined }, 'UNVERIFIED'],
  ['verifiedOn blank', { verifiedOn: ' ' }, 'UNVERIFIED'],
  ['verifiedOn only a control character', { verifiedOn: '\u0001' }, 'UNVERIFIED'],
  ['verifiedOn in an array', { verifiedOn: ['2026-11-04'] }, 'UNVERIFIED'],
  ['verifiedOn a number', { verifiedOn: 20261104 }, 'UNVERIFIED'],
  ['verifiedOn banana', { verifiedOn: 'banana' }, 'BAD_DATE'],
  ['verifiedOn day first', { verifiedOn: '04/11/2026' }, 'BAD_DATE'],
  ['verifiedOn with a time', { verifiedOn: '2026-11-04T10:00:00Z' }, 'BAD_DATE'],
  ['verifiedOn with no day', { verifiedOn: '2026-11' }, 'BAD_DATE'],
  ['verifiedOn after other text', { verifiedOn: 'checked 2026-11-04' }, 'BAD_DATE'],
  ['verifiedOn 9999-99-99', { verifiedOn: '9999-99-99' }, 'BAD_DATE'],
  ['verifiedOn 0000-00-00', { verifiedOn: '0000-00-00' }, 'BAD_DATE'],
  ['verifiedOn in year 0000', { verifiedOn: '0000-01-01' }, 'BAD_DATE'],
  ['verifiedOn month 13', { verifiedOn: '2026-13-01' }, 'BAD_DATE'],
  ['verifiedOn month 00', { verifiedOn: '2026-00-10' }, 'BAD_DATE'],
  ['verifiedOn day 00', { verifiedOn: '2026-11-00' }, 'BAD_DATE'],
  ['verifiedOn 31 November', { verifiedOn: '2026-11-31' }, 'BAD_DATE'],
  ['verifiedOn 29 February off a leap year', { verifiedOn: '2023-02-29' }, 'BAD_DATE'],

  // description
  ['description missing', { description: undefined }, 'MISSING_LANGUAGE'],
  ['description null', { description: null }, 'MISSING_LANGUAGE'],
  ['description a string', { description: 'text' }, 'MISSING_LANGUAGE'],
  ['description an array', { description: ['en', 'es'] }, 'MISSING_LANGUAGE'],
  ['description empty', { description: { en: '', es: '' } }, 'MISSING_LANGUAGE'],
  ['description without es', { description: { en: 'text' } }, 'MISSING_LANGUAGE'],
  ['description with en blank', { description: { en: '  ', es: 'text' } }, 'MISSING_LANGUAGE'],
  ['description with es only a zero-width space', { description: { en: 'text', es: ZERO_WIDTH } }, 'MISSING_LANGUAGE'],
  ['description with es only a control character', { description: { en: 'text', es: '\u0001' } }, 'MISSING_LANGUAGE'],
  ['description with en a number', { description: { en: 42, es: 'text' } }, 'MISSING_LANGUAGE'],
]

/** Each of these has exactly one thing wrong, so the rule named has to catch it alone. */
export const ONLY_ONE_PROBLEM: BrokenShape[] = [
  ['empty sources', { sources: [] }, 'NO_SOURCE'],
  ['a blank url', official('  '), 'BAD_SOURCE_URL'],
  ['a source with kind and no url', { sources: [{ kind: 'official' }] }, 'BAD_SOURCE_URL'],
  ['a url of TODO', official('TODO'), 'BAD_SOURCE_URL'],
  ['a javascript: url', official('javascript:alert(1)'), 'BAD_SOURCE_URL'],
  ['a url with no host', official('https://?'), 'BAD_SOURCE_URL'],
  ['a url with no slashes', official('https:a.example.test'), 'BAD_SOURCE_URL'],
  ['a url with three slashes', official('https:///a.example.test'), 'BAD_SOURCE_URL'],
  ['verifiedBy only a control character', { verifiedBy: '\u0001' }, 'UNVERIFIED'],
  ['verifiedBy the author with a control character inside', { verifiedBy: 'agent\u0001-a' }, 'SELF_VERIFIED'],
  ['verifiedBy the author, decomposed behind a joiner', { author: 'agent-é', verifiedBy: 'agent-e‍́' }, 'SELF_VERIFIED'],
  ['description with es only a control character', { description: { en: 'text', es: '\u0001' } }, 'MISSING_LANGUAGE'],
  ['author missing', { author: undefined }, 'NO_AUTHOR'],
  ['author blank', { author: ' ' }, 'NO_AUTHOR'],
  ['verifiedBy the author in capitals', { verifiedBy: 'AGENT-A' }, 'SELF_VERIFIED'],
  ['verifiedBy the author with spaces', { verifiedBy: ' agent-a ' }, 'SELF_VERIFIED'],
  ['verifiedBy the author and a zero-width space', { verifiedBy: `agent-a${ZERO_WIDTH}` }, 'SELF_VERIFIED'],
  ['verifiedOn blank', { verifiedOn: ' ' }, 'UNVERIFIED'],
  ['verifiedOn banana', { verifiedOn: 'banana' }, 'BAD_DATE'],
  ['verifiedOn 9999-99-99', { verifiedOn: '9999-99-99' }, 'BAD_DATE'],
  ['to the same as from', { to: 'ash-road', requires: ['ash-road'] }, 'SELF_LOOP'],
  ['to null when it is not an appearance', { to: null, requires: ['ash-road'] }, 'APPEARANCE_MISMATCH'],
  ['an appearance with a to', { type: 'appearance' }, 'APPEARANCE_MISMATCH'],
  ['tier unknown', { tier: 'rumour' }, 'BAD_ENUM'],
  ['type unknown', { type: 'huge' }, 'BAD_ENUM'],
  ['description empty', { description: { en: '', es: '' } }, 'MISSING_LANGUAGE'],
]

/** Changes that look odd and must stay sound, so a rule cannot pass by hiding everything. */
export const STILL_SOUND: [name: string, change: object][] = [
  ['a url with an uppercase scheme', official('HTTPS://a.example.test/x')],
  ['a plain http url', official('http://a.example.test/x')],
  ['a url with spaces the URL parser strips', official(' https://a.example.test/x')],
  ['a url with double slashes in its path', official('https://a.example.test//x//y')],
  ['a verifier that differs by an accent', { verifiedBy: 'agent-á' }],
  ['a leap day', { verifiedOn: '2024-02-29' }],
  ['the last day of a year', { verifiedOn: '2026-12-31' }],
  ['another verifier', { verifiedBy: 'agent-z' }],
  ['a verifier that only starts like the author', { verifiedBy: 'agent-ab' }],
  ['a description that is not English letters', { description: { en: '日本語', es: 'ñ' } }],
  [
    'an upstream source by upstream',
    { author: 'upstream', sources: [{ url: URL_OK, kind: 'upstream' }] },
  ],
  [
    'two wikis on different hosts',
    {
      sources: [
        { url: 'https://one.example.test/a', kind: 'wiki' },
        { url: 'https://two.sample.test/a', kind: 'wiki' },
      ],
    },
  ],
  ['one wiki that cites a chapter', citing('wiki')],
  ['a theory on one forum', { tier: 'theory', sources: [{ url: URL_OK, kind: 'forum' }] }],
]
