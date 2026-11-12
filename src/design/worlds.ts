import type { WorldKey } from '../data/types'

export interface World {
  es: string
  en: string
  /** Leather field of the cover and the spines (`--campo`). */
  field: string
  /** The same leather, darker: plate, spine strip, medallions, the ring's centre disc (`--hondo`). */
  deep: string
  /** The blind stamp, tinted from the field: titles not yet read (`--seco`). */
  blind: string
  /** Secondary text on the field (`--sec`). */
  secondary: string
  /** Upstream's colour of the world, for bands and lines. */
  tone: string
  /** A title of this world on any leather, read (`--ink-world`) and not yet read (`--ink-unread`). */
  ink?: string
  inkUnread?: string
  /** The star system the world is in. */
  system?: { es: string; en: string }
}

// The eight leathers of the approved convergence (converge/tokens.md) keep their values. The worlds added on
// 2026-11-11 and every title ink are derived from one hue each, and checked against every leather.
export const WORLDS: Record<WorldKey, World> = {
  sel: { es: 'Sel', en: 'Sel', field: '#013f2a', deep: '#032115', blind: '#aac5b7', secondary: '#c7dcd1', tone: '#58b06e', ink: '#b1eabc', inkUnread: '#96c39e', system: { es: 'Sistema de Sel', en: 'Selish system' } },
  scadrial: { es: 'Scadrial', en: 'Scadrial', field: '#282e35', deep: '#14171b', blind: '#aec0d4', secondary: '#cad7e7', tone: '#9973bf', ink: '#e4cefe', inkUnread: '#c1abda', system: { es: 'Sistema de Scadrial', en: 'Scadrian system' } },
  nalthis: { es: 'Nalthis', en: 'Nalthis', field: '#5f0818', deep: '#33050b', blind: '#d4b5b5', secondary: '#e7cfcf', tone: '#de4343', ink: '#fdcbc6', inkUnread: '#dfa59f', system: { es: 'Sistema nalthiano', en: 'Nalthian system' } },
  taldain: { es: 'Taldain', en: 'Taldain', field: '#453507', deep: '#251c05', blind: '#c7bda5', secondary: '#ddd5c3', tone: '#9e9957', ink: '#e1dd9b', inkUnread: '#bcb984', system: { es: 'Sistema de Taldain', en: 'Taldain system' } },
  threnody: { es: 'Treno', en: 'Threnody', field: '#2b1657', deep: '#150a2e', blind: '#bebad3', secondary: '#d6d3e6', tone: '#7a55d6', ink: '#d9d2ff', inkUnread: '#b6aedf', system: { es: 'Sistema de Treno', en: 'Threnodite system' } },
  sol: { es: 'Primero del Sol', en: 'First of the Sun', field: '#003e4c', deep: '#032128', blind: '#a6c4cd', secondary: '#c4dae1', tone: '#3f8a9e', ink: '#97e7ff', inkUnread: '#81c1d4', system: { es: 'Sistema Drominad', en: 'Drominad system' } },
  roshar: { es: 'Roshar', en: 'Roshar', field: '#0b1f54', deep: '#040f2c', blind: '#b3bed5', secondary: '#cdd6e8', tone: '#2aa1d4', ink: '#aee1fd', inkUnread: '#88bedb', system: { es: 'Sistema roshariano', en: 'Rosharan system' } },
  yolen: { es: 'Yolen', en: 'Yolen', field: '#232f3c', deep: '#121920', blind: '#b8bec5', secondary: '#d1d6dc', tone: '#7e9bba', ink: '#c9dbef', inkUnread: '#a9b8c7', system: { es: 'Sistema de Yolen', en: 'Yolish system' } },
  lumar: { es: 'Lumar', en: 'Lumar', field: '#00372a', deep: '#001e16', blind: '#abc4bb', secondary: '#c6dcd4', tone: '#00b28f', ink: '#9eecd3', inkUnread: '#87c5b1' },
  komashi: { es: 'Komashi', en: 'Komashi', field: '#461e36', deep: '#260f1d', blind: '#cdb6c2', secondary: '#e3d0da', tone: '#d472ac', ink: '#fdc6e4', inkUnread: '#d7a4c0', system: { es: 'Sistema UTol', en: 'UTol system' } },
  canticle: { es: 'Cántico', en: 'Canticle', field: '#492109', deep: '#291105', blind: '#cfb8ad', secondary: '#e5d1c8', tone: '#dc7a44', ink: '#fecdb4', inkUnread: '#dca98f' },
  ashyn: { es: 'Ashyn', en: 'Ashyn', field: '#412525', deep: '#231313', blind: '#c9b9b9', secondary: '#e0d2d2', tone: '#c78383', ink: '#f9cccb', inkUnread: '#d0acab', system: { es: 'Sistema roshariano', en: 'Rosharan system' } },
  aether: { es: 'Mundo de Aether', en: 'Aether homeworld', field: '#3a253b', deep: '#201320', blind: '#c5b9c5', secondary: '#dcd2dc', tone: '#b783ba', ink: '#eeccef', inkUnread: '#c6acc7' },
  mythos: { es: 'Mythos', en: 'Mythos', field: '#362e00', deep: '#1e1800', blind: '#c3bea9', secondary: '#dad6c4', tone: '#b09803', ink: '#e8da99', inkUnread: '#c1b783' },
  otros: { es: 'Varios o por saber', en: 'Several or unknown', field: '#272f35', deep: '#14191c', blind: '#babec2', secondary: '#d3d6d9', tone: '#889baa', ink: '#cfdbe4', inkUnread: '#adb7bf' },
}
