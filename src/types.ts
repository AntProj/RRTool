export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe'
export type Stats = Record<StatKey, number>

export interface MonLevel {
  abs?: number
  offset?: number
  raw?: string
}

export interface MonSpeed {
  stat: number | null
  raw?: string
  iv?: number
  level?: number
  mult?: number
  inferred?: boolean
}

export interface BossMon {
  species: string
  level: MonLevel
  nature: string
  ability: string[]
  item: string
  itemIcon: string | null
  moves: { name: string; type: string | null }[]
  base: Stats
  speed: MonSpeed
  extras: { label: string; value: string }[]
}

export interface Block {
  id: string
  tab: string
  row: number
  titleLines: string[]
  portrait: string | null
  mons: BossMon[]
  notes: string[]
  battleEffects: string[]
  starter: string | null
  inOrder?: boolean
  variantOf?: string
  variant: string | null
}

export interface OrderEntry {
  name: string
  location: string
  cap: { caps: number[]; open: boolean; raw: string }
  optional: boolean
  blockIds: string[]
}

export interface BossData {
  source: string
  importedAt: string
  levelCaps: { label: string; cap: number }[]
  order: OrderEntry[]
  tabs: string[]
  blocks: Block[]
}

export interface Slot {
  species: string
  rate: number | null
  level: string
}

export interface EncounterTable {
  location: string
  method: string
  slots: Slot[]
  note?: string
}

export interface LocationData {
  source: string
  importedAt: string
  locationOrder: string[]
  encounters: EncounterTable[]
  rodNotes: Record<string, string>
  statics: { species: string; level: string | null; text: string }[]
  raids: { location: string; stars: number; mons: { species: string; drops: { item: string; rate: number | null }[] }[] }[]
  raidNotes: string[]
  fossils: { group: string; species: string[] }[]
  fossilNotes: string[]
  eggVendor: { shard: string; species: string[] }[]
  eggVendorNotes: string[]
  gameCorner: string[]
  gameCornerNotes: string[]
  trades: { location: string; give: string; get: string }[]
  gifts: { location: string; section: string; species: string; requirement: string; info: string }[]
  mysteryGifts: { species: string; code: string; info: string }[]
  mysteryGiftNotes: string[]
  unobtainable: string[]
}

export interface NameEntry {
  sprite: string | null
  dex: number | null
}
export type NameMap = Record<string, NameEntry>

export interface DexIndexEntry {
  id: number
  key: string
  name: string
  dexId: number
  types: string[]
  bst: number
  stats: Stats
}

export interface Species extends DexIndexEntry {
  ancestor: number
  formOrder?: number
  abilities: { name: string; hidden: boolean }[]
  eggGroups: string[]
  heldItems: string[]
  evolutions: { method: string; target: number }[]
  learnset: { level: [number, number][]; tm: number[]; tutor: number[]; egg: number[] }
}

export interface Move {
  id: number
  name: string
  type: string
  split: 'Physical' | 'Special' | 'Status'
  power: number
  accuracy: number
  pp: number
  priority: number
  description: string
}

export interface Ability {
  id: number
  name: string
  description: string
  altNames?: string[]
}

/** One way to obtain a species, derived from the location sheet. */
export interface CatchSource {
  kind: 'wild' | 'static' | 'raid' | 'fossil' | 'egg' | 'gamecorner' | 'trade' | 'gift' | 'mystery'
  location: string
  detail: string
  locationSlug?: string
}
