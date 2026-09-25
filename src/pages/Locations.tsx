import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCore } from '../components/context'
import { CheckButton, DetailHead, DexLink, SearchBox, Sprite, StatBar, TwoPane, TypeBadges } from '../components/ui'
import { dexIdOf, methodLabel, pct, slug, titleCase, type Core } from '../data'
import { useStore } from '../store'

const SECTIONS = [
  { key: 'statics', label: 'Statics & legendaries' },
  { key: 'raids', label: 'Raid dens' },
  { key: 'fossils', label: 'Fossils' },
  { key: 'egg', label: 'Egg vendor' },
  { key: 'gamecorner', label: 'Game Corner' },
  { key: 'trades', label: 'In-game trades' },
  { key: 'gifts', label: 'Gift Pokémon' },
  { key: 'mystery', label: 'Mystery Gift codes' },
  { key: 'unobtainable', label: 'Unobtainable' },
] as const

const METHOD_ORDER = ['grass-day', 'grass-night', 'grass', 'old-rod', 'good-rod', 'super-rod', 'surf']

export default function LocationsPage() {
  const core = useCore()
  const { slug: s, section } = useParams()
  const location = s ? core.locations.locationOrder.find(l => slug(l) === s) : undefined
  const detail = location ? <LocationDetail location={location} /> : section ? <SectionDetail section={section} /> : null
  return <TwoPane listKey="locations" list={<LocationList selected={s ?? (section ? `other/${section}` : null)} />} detail={detail} detailKey={`loc:${s ?? section}`} />
}

function sectionCount(core: Core, key: string): number {
  const l = core.locations
  switch (key) {
    case 'statics': return l.statics.length
    case 'raids': return l.raids.length
    case 'fossils': return l.fossils.reduce((n, f) => n + f.species.length, 0)
    case 'egg': return l.eggVendor.reduce((n, f) => n + f.species.length, 0)
    case 'gamecorner': return l.gameCorner.length
    case 'trades': return l.trades.length
    case 'gifts': return l.gifts.length
    case 'mystery': return l.mysteryGifts.length
    case 'unobtainable': return l.unobtainable.length
  }
  return 0
}

function LocationList({ selected }: { selected: string | null }) {
  const core = useCore()
  const { ui, setUi } = useStore()
  const q = ui.locQuery.trim().toLowerCase()
  const methodsByLoc = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const t of core.locations.encounters) {
      if (!m.has(t.location)) m.set(t.location, new Set())
      m.get(t.location)!.add(t.method.replace(/-(day|night)$/, ''))
    }
    return m
  }, [core])
  const speciesMatch = useMemo(() => {
    if (q.length < 2) return null
    const hits = new Set<string>()
    for (const t of core.locations.encounters) if (t.slots.some(sl => sl.species.toLowerCase().includes(q))) hits.add(t.location)
    return hits
  }, [core, q])
  const locs = core.locations.locationOrder.filter(l => !q || l.toLowerCase().includes(q) || speciesMatch?.has(l))
  const sections = SECTIONS.filter(sec => !q || sec.label.toLowerCase().includes(q))

  return (
    <>
      <div className="pane-head">
        <SearchBox value={ui.locQuery} onChange={v => setUi(u => ({ ...u, locQuery: v }))} placeholder="Search areas or a Pokémon" />
      </div>
      {locs.length > 0 && <div className="divider">Areas</div>}
      {locs.map(l => {
        const ms = [...(methodsByLoc.get(l) ?? [])]
        return (
          <Link key={l} to={`/locations/${slug(l)}`} className={`row ${selected === slug(l) ? 'active' : ''}`}>
            <div className="grow">
              <div className="title">{l}</div>
              <div className="sub">{ms.map(m => methodLabel(m).replace(' · day', '')).join(' · ')}</div>
            </div>
          </Link>
        )
      })}
      {sections.length > 0 && <div className="divider">More ways to get Pokémon</div>}
      {sections.map(sec => (
        <Link key={sec.key} to={`/locations/other/${sec.key}`} className={`row ${selected === `other/${sec.key}` ? 'active' : ''}`}>
          <div className="grow"><div className="title">{sec.label}</div></div>
          <span className="tag num">{sectionCount(core, sec.key)}</span>
        </Link>
      ))}
    </>
  )
}

function CaughtToggle({ name }: { name: string }) {
  const core = useCore()
  const { progress, setProgress } = useStore()
  const id = dexIdOf(core, name)
  if (id == null) return null
  const on = !!progress.caught[id]
  return <CheckButton on={on} title={on ? 'Caught' : 'Mark caught'} onToggle={() => setProgress(p => {
    const caught = { ...p.caught }
    if (caught[id]) delete caught[id]; else caught[id] = true
    return { ...p, caught }
  })} />
}

function SpeciesRow({ name, sub, right }: { name: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  const core = useCore()
  return (
    <div className="enc">
      <Sprite name={name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="nm"><DexLink name={name}>{name}</DexLink></div>
        <div className="lv" style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <TypeBadges core={core} name={name} sm />{sub && <span>{sub}</span>}
        </div>
      </div>
      {right}
      <CaughtToggle name={name} />
    </div>
  )
}

function LocationDetail({ location }: { location: string }) {
  const core = useCore()
  const { ui, patchUi } = useStore()
  const key = slug(location)
  const tables = core.locations.encounters.filter(t => t.location === location)
  const methods = METHOD_ORDER.filter(m => tables.some(t => t.method === m))
  const method = methods.includes(ui.locMethod[key]) ? ui.locMethod[key] : methods[0]
  const table = tables.find(t => t.method === method)
  const raids = core.locations.raids.filter(r => slug(r.location) === key || key.startsWith(slug(r.location)))
  const rodNote = core.locations.rodNotes[method]
  const maxRate = Math.max(...(table?.slots.map(s => s.rate ?? 0) ?? [1]), 0.01)

  return (
    <>
      <DetailHead title={location} backTo="/locations" />
      <div className="detail-body">
        <div className="chips">
          {methods.map(m => <button key={m} className={`chip ${m === method ? 'on' : ''}`} onClick={() => patchUi('locMethod', key, m)}>{methodLabel(m)}</button>)}
        </div>
        {rodNote && <div className="tiny faint" style={{ marginTop: 6 }}>{methodLabel(method)}: {rodNote}</div>}
        <div className="card" style={{ marginTop: 12 }}>
          {table?.slots.map((s, i) => (
            <SpeciesRow key={i} name={s.species} sub={`Lv ${s.level}`} right={<>
              <StatBar value={s.rate ?? 0} max={maxRate} color="var(--t-water)" />
              <span className="rate num">{s.rate != null ? pct(s.rate) : ''}</span>
            </>} />
          ))}
          {!table && <div className="muted">No encounters recorded.</div>}
        </div>
        {raids.length > 0 && (
          <>
            <div className="section-title">Raid dens here</div>
            {raids.map((r, i) => <RaidCard key={i} raid={r} />)}
          </>
        )}
      </div>
    </>
  )
}

function RaidCard({ raid }: { raid: Core['locations']['raids'][number] }) {
  return (
    <div className="card">
      <h3>{raid.location} <span className="stars">{'★'.repeat(raid.stars)}</span></h3>
      {raid.mons.map((m, i) => (
        <SpeciesRow key={i} name={m.species} sub={<span className="drops">{m.drops.filter(d => (d.rate ?? 0) >= 0.25).map(d => `${d.item} ${pct(d.rate!)}`).join(' · ')}</span>} />
      ))}
    </div>
  )
}

function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null
  return <div className="card small muted" style={{ marginBottom: 10 }}>{notes.map((n, i) => <div key={i} style={{ padding: '2px 0' }}>{n}</div>)}</div>
}

function SectionDetail({ section }: { section: string }) {
  const core = useCore()
  const l = core.locations
  const sec = SECTIONS.find(s => s.key === section)
  const title = sec?.label ?? section
  let body: React.ReactNode = null

  switch (section) {
    case 'statics':
      body = <div className="card">{l.statics.map((s, i) => <SpeciesRow key={i} name={s.species} sub={<>{s.level ? <b>Lv {s.level}</b> : null} {s.text}</>} />)}</div>
      break
    case 'raids': {
      body = <>
        <Notes notes={l.raidNotes} />
        {l.raids.map((r, i) => <RaidCard key={i} raid={r} />)}
      </>
      break
    }
    case 'fossils':
      body = <>
        <Notes notes={l.fossilNotes} />
        {l.fossils.map((f, i) => <div key={i} className="card"><h3>{f.group}</h3>{f.species.map(n => <SpeciesRow key={n} name={n} />)}</div>)}
      </>
      break
    case 'egg':
      body = <>
        <Notes notes={l.eggVendorNotes} />
        {l.eggVendor.map((f, i) => <div key={i} className="card"><h3>{f.shard}</h3>{f.species.map(n => <SpeciesRow key={n} name={n} />)}</div>)}
      </>
      break
    case 'gamecorner':
      body = <>
        <Notes notes={l.gameCornerNotes} />
        <div className="card">{l.gameCorner.map(n => <SpeciesRow key={n} name={n} />)}</div>
      </>
      break
    case 'trades':
      body = <div className="card">{l.trades.map((t, i) => <SpeciesRow key={i} name={t.get} sub={<>{titleCase(t.location)} · give <b>{t.give}</b></>} />)}</div>
      break
    case 'gifts': {
      const groups = [...new Set(l.gifts.map(g => g.section))]
      body = groups.map(g => (
        <div key={g}>
          <div className="section-title">{g}</div>
          <div className="card">{l.gifts.filter(x => x.section === g).map((x, i) => <SpeciesRow key={i} name={x.species} sub={<><b>{x.location}</b> · {x.requirement}{x.info ? ` · ${x.info}` : ''}</>} />)}</div>
        </div>
      ))
      break
    }
    case 'mystery':
      body = <>
        <Notes notes={l.mysteryGiftNotes} />
        <div className="card">{l.mysteryGifts.map((g, i) => <SpeciesRow key={i} name={g.species} sub={<><code style={{ userSelect: 'all' }}>{g.code}</code>{g.info ? ` · ${g.info}` : ''}</>} />)}</div>
      </>
      break
    case 'unobtainable':
      body = <div className="card">{l.unobtainable.map(n => <SpeciesRow key={n} name={n} />)}</div>
      break
  }

  return (
    <>
      <DetailHead title={title} backTo="/locations" />
      <div className="detail-body">{body ?? <div className="muted">Unknown section.</div>}</div>
    </>
  )
}
