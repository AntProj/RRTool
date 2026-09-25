import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCore } from '../components/context'
import { CheckButton, DetailHead, MoveSheet, SearchBox, Sprite, StatBar, TwoPane, TypeBadge, statColor, useMoveSheet } from '../components/ui'
import { STAT_KEYS, STAT_LABELS, loadSpecies, titleCase } from '../data'
import { useStore } from '../store'
import type { Species } from '../types'

const TYPES = ['Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison', 'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark', 'Steel', 'Fairy']

export default function DexPage() {
  const core = useCore()
  const { id } = useParams()
  const sid = id != null ? Number(id) : null
  const entry = sid != null ? core.dexById.get(sid) : undefined
  return <TwoPane listKey="dex" list={<DexList selected={sid} />} detail={entry ? <DexDetail id={sid!} /> : null} detailKey={`dex:${sid}`} />
}

function useCaught(id: number) {
  const { progress, setProgress } = useStore()
  const on = !!progress.caught[id]
  const toggle = () => setProgress(p => {
    const caught = { ...p.caught }
    if (caught[id]) delete caught[id]; else caught[id] = true
    return { ...p, caught }
  })
  return { on, toggle }
}

function CaughtButton({ id }: { id: number }) {
  const { on, toggle } = useCaught(id)
  return <CheckButton on={on} title={on ? 'Caught' : 'Mark caught'} onToggle={toggle} />
}

function DexList({ selected }: { selected: number | null }) {
  const core = useCore()
  const { ui, setUi, progress } = useStore()
  const [type, setType] = useState<string | null>(null)
  const q = ui.dexQuery.trim().toLowerCase()
  const rows = useMemo(() => core.dexIndex.filter(d => (!q || d.key.toLowerCase().includes(q) || String(d.dexId) === q) && (!type || d.types.includes(type))), [core, q, type])
  const caughtCount = Object.keys(progress.caught).length

  return (
    <>
      <div className="pane-head" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SearchBox value={ui.dexQuery} onChange={v => setUi(u => ({ ...u, dexQuery: v }))} placeholder="Search the dex" />
          <span className="tiny faint num" style={{ whiteSpace: 'nowrap' }}>{caughtCount} caught</span>
        </div>
        <div className="chips" style={{ gap: 4 }}>
          {TYPES.map(t => (
            <button key={t} className="type" style={{ ['--t' as string]: `var(--t-${t.toLowerCase()})`, opacity: type && type !== t ? 0.4 : 1, cursor: 'pointer' }} onClick={() => setType(type === t ? null : t)}>{t}</button>
          ))}
        </div>
      </div>
      {rows.map(d => (
        <Link key={d.id} to={`/dex/${d.id}`} className={`row dex-row ${selected === d.id ? 'active' : ''}`}>
          <span className="no num">#{d.dexId}</span>
          <Sprite name={d.key} />
          <div className="grow">
            <div className="title">{d.key}</div>
            <div className="sub" style={{ display: 'flex', gap: 4 }}>{d.types.map(t => <TypeBadge key={t} type={t} sm />)}<span className="faint num" style={{ marginLeft: 4 }}>BST {d.bst}</span></div>
          </div>
          <CaughtButton id={d.id} />
        </Link>
      ))}
      {rows.length === 0 && <div className="empty">Nothing matches.</div>}
    </>
  )
}

function DexDetail({ id }: { id: number }) {
  const core = useCore()
  const { ui, patchUi } = useStore()
  const [all, setAll] = useState<Map<number, Species> | null>(null)
  const sheet = useMoveSheet()
  useEffect(() => { loadSpecies().then(setAll) }, [])
  const sp = all?.get(id)
  const idx = core.dexById.get(id)!
  const tab = (ui.dexTab[id] ?? 'level') as 'level' | 'tm' | 'tutor' | 'egg'

  const family = useMemo(() => {
    if (!all || !sp) return []
    return [...all.values()].filter(s => s.ancestor === sp.ancestor).sort((a, b) => a.id - b.id)
  }, [all, sp])
  const edges = useMemo(() => family.flatMap(s => s.evolutions.map(e => ({ from: s, method: e.method, to: all?.get(e.target) }))).filter(e => e.to), [family, all])
  const sources = core.catchIndex.get(id) ?? []
  const usage = core.bossUsage.get(id) ?? []
  const usedBy = [...new Map(usage.map(u => [u.entry, u])).values()]

  return (
    <>
      <DetailHead title={idx.key} backTo="/dex"><CaughtButton id={id} /></DetailHead>
      <div className="detail-body">
        <div className="mon-head">
          <Sprite name={idx.key} size="lg" />
          <div style={{ flex: 1 }}>
            <div className="faint small num">#{idx.dexId}{sp?.formOrder ? ` · form ${sp.formOrder}` : ''}</div>
            <div className="nm">{idx.key}</div>
            <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>{idx.types.map(t => <TypeBadge key={t} type={t} />)}</div>
            {sp && <div className="small muted" style={{ marginTop: 6 }}>Egg groups: {sp.eggGroups.join(', ') || '—'}{sp.heldItems.length ? ` · Holds: ${sp.heldItems.join(', ')}` : ''}</div>}
          </div>
        </div>

        {!sp && <div className="loading" style={{ height: 80 }}><span className="spin" />Loading details…</div>}

        {sp && (
          <>
            <div className="section-title">Abilities</div>
            {sp.abilities.map((a, i) => {
              const ab = Object.values(core.abilities).find(x => x.name === a.name || x.altNames?.includes(a.name))
              return <div key={i} className="abil"><b>{a.name}</b>{a.hidden && <span className="tag" style={{ marginLeft: 6 }}>hidden</span>}{ab?.description && <div className="d">{ab.description}</div>}</div>
            })}

            <div className="section-title">Base stats <span className="faint num">· BST {idx.bst}</span></div>
            <div className="stats" style={{ gridTemplateColumns: '34px 1fr 40px' }}>
              {STAT_KEYS.map(k => (
                <div key={k} style={{ display: 'contents' }}>
                  <span className="lbl">{STAT_LABELS[k]}</span>
                  <StatBar value={idx.stats[k]} max={200} color={statColor(idx.stats[k])} />
                  <span className="at num">{idx.stats[k]}</span>
                </div>
              ))}
            </div>

            {edges.length > 0 && (
              <>
                <div className="section-title">Evolution</div>
                <div className="card">
                  {edges.map((e, i) => (
                    <div key={i} className="evo">
                      <Link to={`/dex/${e.from.id}`} className={e.from.id === id ? 'cur' : ''}><Sprite name={e.from.key} />{e.from.key}</Link>
                      <span className="arrow">→ {e.method}</span>
                      <Link to={`/dex/${e.to!.id}`} className={e.to!.id === id ? 'cur' : ''}><Sprite name={e.to!.key} />{e.to!.key}</Link>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="section-title">Where to get it</div>
            {sources.length === 0 && <div className="muted small">Not listed in the location sheet. Check its pre-evolution.</div>}
            <div className="srcs">
              {sources.map((s, i) => (
                <div key={i} className="src">
                  <span className="k">{s.kind}</span>
                  <span>{s.locationSlug ? <Link to={`/locations/${s.locationSlug}`} className="bold">{s.location}</Link> : <b>{s.location}</b>} <span className="d">{s.detail}</span></span>
                </div>
              ))}
            </div>

            {usedBy.length > 0 && (
              <>
                <div className="section-title">Used by bosses</div>
                <div className="srcs">
                  {usedBy.map(u => {
                    const e = core.bosses.order[u.entry]
                    return <Link key={u.entry} to={`/bosses/${u.entry}`} className="src"><span className="k">#{u.entry + 1}</span><span><b>{titleCase(e.name)}</b> <span className="d">{titleCase(e.location)} · cap {e.cap.raw.replace(/\.0$/, '')}{u.species !== idx.key ? ` · as ${u.species}` : ''}</span></span></Link>
                  })}
                </div>
              </>
            )}

            <div className="section-title">Moves</div>
            <div className="seg" style={{ marginBottom: 8 }}>
              {(['level', 'tm', 'tutor', 'egg'] as const).map(t => (
                <button key={t} className={tab === t ? 'on' : ''} onClick={() => patchUi('dexTab', id, t)}>{{ level: 'Level up', tm: 'TM', tutor: 'Tutor', egg: 'Egg' }[t]}</button>
              ))}
            </div>
            <div className="learn">
              {tab === 'level' && sp.learnset.level.map(([lv, mid], i) => <MoveRow key={i} lv={lv} mid={mid} onOpen={sheet.open} />)}
              {tab !== 'level' && sp.learnset[tab].map(mid => <MoveRow key={mid} mid={mid} onOpen={sheet.open} />)}
              {tab !== 'level' && sp.learnset[tab].length === 0 && <div className="muted small">None.</div>}
            </div>
          </>
        )}
      </div>
      <MoveSheet move={sheet.move} onClose={sheet.close} />
    </>
  )
}

function MoveRow({ lv, mid, onOpen }: { lv?: number; mid: number; onOpen: (m: import('../types').Move) => void }) {
  const core = useCore()
  const m = core.moves[String(mid)]
  if (!m) return null
  return (
    <button className="move" onClick={() => onOpen(m)}>
      {lv != null && <span className="lv num">{lv === 0 ? 'Evo' : lv}</span>}
      <TypeBadge type={m.type} sm />
      <span className="nm">{m.name}</span>
      <span className="meta num">{m.split === 'Status' ? 'Status' : `${m.power || '—'} · ${m.accuracy || '—'}%`}</span>
    </button>
  )
}
