import type {
  Ability, Block, BossData, BossMon, CatchSource, DexIndexEntry, LocationData, Move, NameMap,
  OrderEntry, Species, StatKey, Stats,
} from './types'

export const BASE = import.meta.env.BASE_URL

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}data/${path}`)
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return r.json()
}

export interface Core {
  bosses: BossData
  locations: LocationData
  nameMap: NameMap
  dexIndex: DexIndexEntry[]
  moves: Record<string, Move>
  abilities: Record<string, Ability>
  // derived
  blocksById: Map<string, Block>
  dexById: Map<number, DexIndexEntry>
  movesByName: Map<string, Move>
  catchIndex: Map<number, CatchSource[]>
  bossUsage: Map<number, { entry: number; block: string; species: string }[]>
  locationSlugs: Map<string, string>
}

let corePromise: Promise<Core> | null = null
let speciesPromise: Promise<Map<number, Species>> | null = null

export function loadCore(): Promise<Core> {
  if (!corePromise) {
    corePromise = Promise.all([
      getJson<BossData>('bosses.json'),
      getJson<LocationData>('locations.json'),
      getJson<NameMap>('name-map.json'),
      getJson<DexIndexEntry[]>('dex/index.json'),
      getJson<Record<string, Move>>('dex/moves.json'),
      getJson<Record<string, Ability>>('dex/abilities.json'),
    ]).then(([bosses, locations, nameMap, dexIndex, moves, abilities]) =>
      buildCore(bosses, locations, nameMap, dexIndex, moves, abilities))
  }
  return corePromise
}

export function loadSpecies(): Promise<Map<number, Species>> {
  if (!speciesPromise) {
    speciesPromise = getJson<Species[]>('dex/species.json').then(list => new Map(list.map(s => [s.id, s])))
  }
  return speciesPromise
}

export const slug = (s: string) => s.toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

function buildCore(
  bosses: BossData, locations: LocationData, nameMap: NameMap, dexIndex: DexIndexEntry[],
  moves: Record<string, Move>, abilities: Record<string, Ability>,
): Core {
  const blocksById = new Map(bosses.blocks.map(b => [b.id, b]))
  const dexById = new Map(dexIndex.map(d => [d.id, d]))
  const movesByName = new Map<string, Move>()
  for (const m of Object.values(moves)) movesByName.set(normName(m.name), m)

  const dexOf = (name: string) => nameMap[name]?.dex ?? null
  const catchIndex = new Map<number, CatchSource[]>()
  const push = (name: string, src: CatchSource) => {
    const id = dexOf(name)
    if (id == null) return
    if (!catchIndex.has(id)) catchIndex.set(id, [])
    catchIndex.get(id)!.push(src)
  }
  const locationSlugs = new Map<string, string>()
  for (const loc of locations.locationOrder) locationSlugs.set(loc, slug(loc))
  for (const t of locations.encounters) {
    for (const s of t.slots) {
      push(s.species, {
        kind: 'wild', location: t.location, locationSlug: slug(t.location),
        detail: `${methodLabel(t.method)} · Lv ${s.level}${s.rate != null ? ` · ${pct(s.rate)}` : ''}`,
      })
    }
  }
  for (const s of locations.statics) push(s.species, { kind: 'static', location: s.text.split(/[,.]/)[0], detail: s.level ? `Lv ${s.level} · ${s.text}` : s.text })
  for (const r of locations.raids) for (const m of r.mons) push(m.species, { kind: 'raid', location: r.location, detail: `${'★'.repeat(r.stars)} raid den` })
  for (const f of locations.fossils) for (const n of f.species) push(n, { kind: 'fossil', location: 'Vermilion Fan Club', detail: f.group })
  for (const e of locations.eggVendor) for (const n of e.species) push(n, { kind: 'egg', location: 'Celadon Mansion', detail: `Egg for 1 ${e.shard}` })
  for (const n of locations.gameCorner) push(n, { kind: 'gamecorner', location: 'Celadon Game Corner', detail: '100,000$' })
  for (const t of locations.trades) push(t.get, { kind: 'trade', location: t.location, detail: `Trade a ${t.give}` })
  for (const g of locations.gifts) push(g.species, { kind: 'gift', location: g.location, detail: `${g.requirement}${g.info ? ` (${g.info})` : ''}` })
  for (const g of locations.mysteryGifts) push(g.species, { kind: 'mystery', location: 'Mystery Gift', detail: `Code ${g.code}${g.info ? ` · ${g.info}` : ''}` })

  const bossUsage = new Map<number, { entry: number; block: string; species: string }[]>()
  bosses.order.forEach((e, i) => {
    for (const bid of e.blockIds) {
      const b = blocksById.get(bid)
      if (!b) continue
      for (const m of b.mons) {
        const id = dexOf(m.species)
        if (id == null) continue
        if (!bossUsage.has(id)) bossUsage.set(id, [])
        bossUsage.get(id)!.push({ entry: i, block: bid, species: m.species })
      }
    }
  })

  return { bosses, locations, nameMap, dexIndex, moves, abilities, blocksById, dexById, movesByName, catchIndex, bossUsage, locationSlugs }
}

export const pct = (rate: number) => `${Math.round(rate * 1000) / 10}%`

export const METHOD_LABELS: Record<string, string> = {
  'grass-day': 'Grass · day', 'grass-night': 'Grass · night', grass: 'Grass',
  'old-rod': 'Old Rod', 'good-rod': 'Good Rod', 'super-rod': 'Super Rod', surf: 'Surf',
}
export const methodLabel = (m: string) => METHOD_LABELS[m] ?? m

const MOVE_ALIASES: Record<string, string> = {
  powuppunch: 'Power-Up Punch', eathquake: 'Earthquake', drainingkiss: 'Drain Kiss',
}
const tokenCache = new WeakMap<Core, { tokens: string[]; move: Move }[]>()
const tokenize = (s: string) => s.toLowerCase().split(/[\s-]+/).filter(Boolean)

/** Boss move names are often abbreviated ("Dragon Hamm.", "High J. Kick", "HP Ground"). */
export function findMove(core: Core, name: string): Move | null {
  const n = normName(name)
  const hit = core.movesByName.get(n)
  if (hit) return hit
  if (/^hp\s/i.test(name)) return core.movesByName.get('hiddenpower') ?? null
  const alias = MOVE_ALIASES[n]
  if (alias) return core.movesByName.get(normName(alias)) ?? null

  let list = tokenCache.get(core)
  if (!list) {
    list = Object.values(core.moves).map(m => ({ tokens: tokenize(m.name), move: m }))
    tokenCache.set(core, list)
  }
  const want = tokenize(name).map(t => t.replace(/\.$/, ''))
  const match = list.find(({ tokens }) =>
    tokens.length === want.length && tokens.every((t, i) => t.startsWith(want[i]) || (want[i].length >= 4 && want[i].startsWith(t))))
  if (match) return match.move
  // last resort: one or two typos in a longer name
  if (n.length > 5) {
    for (const [k, m] of core.movesByName) if (Math.abs(k.length - n.length) <= 2 && editDistance(k, n) <= 2) return m
  }
  return null
}

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

// ---------------------------------------------------------------- level caps

/** Which cap a boss is fought at, given the player's current cap and any manual override. */
export function resolveCap(entry: OrderEntry, currentCap: number, override?: number): number {
  if (override != null) return override
  const opts = entry.cap.caps
  if (opts.length === 0) return currentCap
  if (entry.cap.open) return Math.max(currentCap, opts[0])
  const le = opts.filter(c => c <= currentCap)
  return le.length ? Math.max(...le) : Math.min(...opts)
}

/** Options the user may pick for an entry's cap. */
export function capOptions(entry: OrderEntry, allCaps: number[]): number[] {
  if (entry.cap.open) return allCaps.filter(c => c >= entry.cap.caps[0])
  return entry.cap.caps
}

export function monLevel(mon: BossMon, cap: number): number | null {
  if (mon.level.abs != null) return mon.level.abs
  if (mon.level.offset != null) return cap + mon.level.offset
  return null
}

// --------------------------------------------------------------------- stats

const NATURES: Record<string, [StatKey | null, StatKey | null]> = {
  Hardy: [null, null], Lonely: ['atk', 'def'], Brave: ['atk', 'spe'], Adamant: ['atk', 'spa'], Naughty: ['atk', 'spd'],
  Bold: ['def', 'atk'], Docile: [null, null], Relaxed: ['def', 'spe'], Impish: ['def', 'spa'], Lax: ['def', 'spd'],
  Timid: ['spe', 'atk'], Hasty: ['spe', 'def'], Serious: [null, null], Jolly: ['spe', 'spa'], Naive: ['spe', 'spd'],
  Modest: ['spa', 'atk'], Mild: ['spa', 'def'], Quiet: ['spa', 'spe'], Bashful: [null, null], Rash: ['spa', 'spd'],
  Calm: ['spd', 'atk'], Gentle: ['spd', 'def'], Sassy: ['spd', 'spe'], Careful: ['spd', 'spa'], Quirky: [null, null],
}

export function natureMult(nature: string, stat: StatKey): number {
  const n = NATURES[nature]
  if (!n) return 1
  if (n[0] === stat) return 1.1
  if (n[1] === stat) return 0.9
  return 1
}

export function natureText(nature: string): string {
  const n = NATURES[nature]
  if (!n || !n[0]) return 'neutral'
  const L: Record<StatKey, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' }
  return `+${L[n[0]!]} −${L[n[1]!]}`
}

export function calcStat(stat: StatKey, base: number, level: number, iv: number, nature: string, species?: string): number {
  if (stat === 'hp') {
    if (species === 'Shedinja') return 1
    return Math.floor((2 * base + iv) * level / 100) + level + 10
  }
  return Math.floor((Math.floor((2 * base + iv) * level / 100) + 5) * natureMult(nature, stat))
}

/** Full stat line at a level: 31 IV / 0 EV, except speed which uses the sheet-derived IV. */
export function statsAt(mon: BossMon, level: number): Stats {
  const out = {} as Stats
  for (const k of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as StatKey[]) {
    const iv = k === 'spe' && mon.speed.iv != null ? mon.speed.iv : 31
    out[k] = calcStat(k, mon.base[k] ?? 0, level, iv, mon.nature, mon.species)
  }
  return out
}

export const STAT_LABELS: Record<StatKey, string> = { hp: 'HP', atk: 'Atk', def: 'Def', spa: 'SpA', spd: 'SpD', spe: 'Spe' }
export const STAT_KEYS: StatKey[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe']

// ------------------------------------------------------------------- display

export function trainerTitle(block: Block, entry?: OrderEntry): { name: string; role: string } {
  const lines = block.titleLines
  if (lines.length === 0) return { name: entry?.name ?? '?', role: '' }
  if (lines.includes('&')) {
    return { name: lines.slice(1).join(' ').replace(/\s+&\s+/g, ' & '), role: lines[0] }
  }
  const name = lines[lines.length - 1]
  const role = lines.slice(0, -1).join(' · ')
  return { name: titleCase(name), role: titleCase(role) }
}

export function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|[\s\-'’.(/])([a-z])/g, (_, p, c) => p + c.toUpperCase())
    .replace(/\bPkmn\b/g, 'PKMN').replace(/\bSs\b(?!\.)/g, 'S.S.').replace(/\bMt\b(?!\.)/g, 'Mt.').replace(/\bS\.s\./g, 'S.S.')
}

export function spriteUrl(core: Core, name: string): string | null {
  const k = core.nameMap[name]?.sprite
  return k ? `${BASE}sprites/mons/${k}.png` : null
}

export function dexIdOf(core: Core, name: string): number | null {
  return core.nameMap[name]?.dex ?? null
}
