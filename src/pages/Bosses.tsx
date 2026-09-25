import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useCore } from '../components/context'
import {
  CheckButton, DetailHead, DexLink, Icon, MoveSheet, Portrait, Sprite, StatBar, TwoPane, TypeBadge, TypeBadges, statColor, useMoveSheet,
} from '../components/ui'
import {
  BASE, STAT_KEYS, STAT_LABELS, calcStat, capOptions, findMove, monLevel, natureText, resolveCap, statsAt, titleCase, trainerTitle,
} from '../data'
import { useStore } from '../store'
import type { Block, BossMon, OrderEntry } from '../types'

export default function BossesPage() {
  const core = useCore()
  const { idx } = useParams()
  const i = idx != null ? Number(idx) : null
  const entry = i != null && Number.isInteger(i) ? core.bosses.order[i] : undefined
  return (
    <TwoPane
      listKey="bosses"
      list={<BossList selected={entry ? i : null} />}
      detail={entry ? <BossDetail entry={entry} index={i!} /> : null}
      detailKey={`boss:${i}`}
    />
  )
}

function BossList({ selected }: { selected: number | null }) {
  const core = useCore()
  const { progress, setProgress } = useStore()
  const nav = useNavigate()
  const order = core.bosses.order
  const beatenCount = order.filter((_, i) => progress.beaten[i]).length
  const current = order.findIndex((_, i) => !progress.beaten[i])

  return (
    <>
      <div className="pane-head" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h1 style={{ flex: 1 }}>Bosses</h1>
          <span className="small muted num">{beatenCount} / {order.length} beaten</span>
          {current >= 0 && <button className="tag accent" onClick={() => nav(`/bosses/${current}`)}>Current</button>}
        </div>
        <div className="progress"><i style={{ width: `${(beatenCount / order.length) * 100}%` }} /></div>
      </div>
      {order.map((e, i) => {
        const block = core.blocksById.get(e.blockIds[0])
        const showDivider = i === 0 || order[i - 1].cap.raw !== e.cap.raw
        return (
          <div key={i}>
            {showDivider && <div className="divider">Cap {e.cap.raw.replace(/\.0$/, '')}</div>}
            <Link to={`/bosses/${i}`} className={`row ${selected === i ? 'active' : ''} ${progress.beaten[i] ? 'beaten' : ''}`}>
              <span className="faint tiny num" style={{ width: 22, textAlign: 'right' }}>{i + 1}</span>
              <Portrait path={block?.portrait ?? null} />
              <div className="grow">
                <div className="title">{titleCase(e.name)} {i === current && <span className="tag accent">Now</span>}</div>
                <div className="sub">{titleCase(e.location)}{e.optional ? ' · optional' : ''}{e.blockIds.length > 1 ? ` · ${e.blockIds.length} teams` : ''}</div>
              </div>
              <CheckButton on={!!progress.beaten[i]} title={progress.beaten[i] ? 'Beaten' : 'Mark beaten'} onToggle={() => toggleBeaten(setProgress, i)} />
            </Link>
          </div>
        )
      })}
    </>
  )
}

function toggleBeaten(setProgress: ReturnType<typeof useStore>['setProgress'], i: number) {
  setProgress(p => {
    const beaten = { ...p.beaten }
    if (beaten[i]) delete beaten[i]
    else beaten[i] = true
    return { ...p, beaten }
  })
}

function BossDetail({ entry, index }: { entry: OrderEntry; index: number }) {
  const core = useCore()
  const { settings, progress, setProgress, ui, patchUi } = useStore()
  const nav = useNavigate()
  const sheet = useMoveSheet()
  const [showAll, setShowAll] = useState(false)

  const blocks = entry.blockIds.map(id => core.blocksById.get(id)).filter((b): b is Block => !!b)
  const autoBlock = (settings.starter && blocks.find(b => b.starter === settings.starter)) || blocks[0]
  const block = blocks.find(b => b.id === ui.bossVariant[index]) ?? autoBlock
  const allCaps = core.bosses.levelCaps.map(c => c.cap)
  const options = capOptions(entry, allCaps)
  const cap = resolveCap(entry, settings.cap, ui.capOverride[index])
  const autoCap = resolveCap(entry, settings.cap)
  const slot = Math.min(ui.bossSlot[index] ?? 0, Math.max(0, block.mons.length - 1))
  const { name, role } = trainerTitle(block, entry)
  const beaten = !!progress.beaten[index]
  const infoNotes = block.notes.filter(n => !/IF RIVAL HAS/i.test(n))

  return (
    <>
      <DetailHead title={titleCase(entry.name)} backTo="/bosses">
        <CheckButton on={beaten} title={beaten ? 'Beaten' : 'Mark beaten'} onToggle={() => toggleBeaten(setProgress, index)} />
      </DetailHead>
      <div className="detail-body">
        <div className="boss-head">
          <Portrait path={block.portrait} size="lg" />
          <div style={{ minWidth: 0 }}>
            <div className="role">{role || (entry.optional ? 'Optional' : 'Boss')}</div>
            <div className="name">{name}</div>
            <div className="loc">{titleCase(entry.location)}{entry.optional && <> · <span className="tag">optional</span></>}</div>
          </div>
        </div>

        <div className="chips" style={{ marginTop: 12, alignItems: 'center' }}>
          <span className="small muted">Fought at cap</span>
          {options.length <= 1 && <span className="chip on">{cap}</span>}
          {options.length > 1 && options.map(c => (
            <button key={c} className={`chip ${c === cap ? 'on' : ''}`}
              onClick={() => patchUi('capOverride', index, (c === autoCap ? undefined : c) as number)}>
              {c}{c === autoCap && c !== cap ? ' (yours)' : ''}
            </button>
          ))}
          {entry.cap.open && <span className="tiny faint">{entry.cap.raw}: scales with your cap</span>}
        </div>

        {block.battleEffects.map((e, i) => (
          <div key={i} className="banner warn"><Icon name="warn" />{titleCase(e)}</div>
        ))}
        {infoNotes.map((n, i) => (
          <div key={i} className="banner info"><Icon name="info" />{n.replace(/^\(!+\)\s*/, '')}</div>
        ))}

        {blocks.length > 1 && (
          <div className="seg" style={{ margin: '10px 0' }}>
            {blocks.map(b => (
              <button key={b.id} className={b.id === block.id ? 'on' : ''} onClick={() => { patchUi('bossVariant', index, b.id); patchUi('bossSlot', index, 0) }}>
                {b.variant ?? 'Team'}
              </button>
            ))}
          </div>
        )}
        {block.starter && !settings.starter && (
          <div className="tiny faint" style={{ marginBottom: 6 }}>Set your starter in Settings and the right rival team is picked for you.</div>
        )}

        <div className="strip">
          {block.mons.map((m, k) => {
            const lv = monLevel(m, cap)
            return (
              <button key={k} className={`slot ${k === slot ? 'on' : ''}`} onClick={() => patchUi('bossSlot', index, k)} title={m.species}>
                <Sprite name={m.species} />
                {lv != null && <span className="lv num">{lv}</span>}
              </button>
            )
          })}
        </div>

        <div className={`mon-grid ${showAll ? 'all' : ''}`}>
          {(showAll ? block.mons : [block.mons[slot]]).filter(Boolean).map((m, k) => (
            <MonCard key={`${block.id}-${showAll ? k : slot}`} mon={m} cap={cap} onMove={sheet.open} />
          ))}
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={() => setShowAll(v => !v)}>{showAll ? 'Show one at a time' : 'Show all six'}</button>

        <div className="btnrow">
          <button className={`btn ${beaten ? '' : 'ok'}`} onClick={() => toggleBeaten(setProgress, index)}>
            <Icon name="check" />{beaten ? 'Beaten (undo)' : 'Mark beaten'}
          </button>
          {index > 0 && <button className="btn" onClick={() => nav(`/bosses/${index - 1}`)}><Icon name="back" />Previous</button>}
          {index < core.bosses.order.length - 1 && <button className="btn" onClick={() => nav(`/bosses/${index + 1}`)}>Next<Icon name="next" /></button>}
        </div>
        <p className="tiny faint" style={{ marginTop: 16 }}>
          Sheet tab: {block.tab}. Stats at level assume 31 IVs and no EVs, except speed which uses the IV implied by the sheet.
        </p>
      </div>
      <MoveSheet move={sheet.move} onClose={sheet.close} />
    </>
  )
}

function MonCard({ mon, cap, onMove }: { mon: BossMon; cap: number; onMove: (m: ReturnType<typeof findMove>) => void }) {
  const core = useCore()
  const level = monLevel(mon, cap)
  const stats = level != null ? statsAt(mon, level) : null
  const sheetSpeed = mon.speed

  let speedNote: string
  let speedVal: number | null
  if (level != null && sheetSpeed.iv != null) {
    speedVal = calcStat('spe', mon.base.spe, level, sheetSpeed.iv, mon.nature)
    speedNote = sheetSpeed.iv === 31 ? '' : `${sheetSpeed.iv} IV`
  } else {
    speedVal = sheetSpeed.stat
    speedNote = sheetSpeed.level ? `sheet value at Lv ${sheetSpeed.level}` : 'from sheet'
  }
  const levelText = level != null ? `Lv ${level}` : mon.level.raw ?? ''
  const offset = mon.level.offset != null ? ` (cap ${mon.level.offset >= 0 ? '+' : ''}${mon.level.offset})` : ''

  return (
    <div className="card">
      <div className="mon-head">
        <Sprite name={mon.species} size="md" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="nm"><DexLink name={mon.species}>{mon.species}</DexLink> <span className="lv">{levelText}</span><span className="tiny faint">{offset}</span></div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}><TypeBadges core={core} name={mon.species} /></div>
        </div>
      </div>
      <div className="kv">
        <span className="k">Nature</span><span className="v">{mon.nature} <span className="faint small">{natureText(mon.nature)}</span></span>
        <span className="k">Ability</span><span className="v">{mon.ability.join(' / ')}</span>
        <span className="k">Item</span>
        <span className="v">
          {mon.itemIcon && <img className="item" src={`${BASE}sprites/${mon.itemIcon}`} alt="" />}
          {mon.item || '—'}
        </span>
      </div>
      <div className="moves">
        {mon.moves.map((mv, i) => {
          const m = findMove(core, mv.name)
          return (
            <button key={i} className="move" onClick={() => m && onMove(m)} disabled={!m}>
              <TypeBadge type={m?.type ?? mv.type} sm />
              <span className="nm">{m && !/^hp\s/i.test(mv.name) ? m.name : mv.name}</span>
              {m && <span className="meta num">{m.split === 'Status' ? 'Status' : `${m.power || '—'} · ${m.accuracy || '—'}%`}</span>}
            </button>
          )
        })}
      </div>
      <div className="stats">
        <span /><span /><span className="hd" style={{ textAlign: 'right' }}>Base</span><span className="hd" style={{ textAlign: 'right' }}>{level != null ? `Lv ${level}` : ''}</span>
        {STAT_KEYS.map(k => (
          <div key={k} className={k} style={{ display: 'contents' }}>
            <span className="lbl">{STAT_LABELS[k]}</span>
            <StatBar value={mon.base[k] ?? 0} max={200} color={statColor(mon.base[k] ?? 0)} />
            <span className="base num">{mon.base[k] ?? '—'}</span>
            <span className={`at num ${k === 'spe' ? 'spe' : ''}`} style={k === 'spe' ? { color: 'var(--accent)' } : undefined}>{stats ? stats[k] : ''}</span>
          </div>
        ))}
      </div>
      <div className="speedline">
        <span>Speed{level != null ? ` at Lv ${level}` : ''}</span>
        <b className="num">{speedVal ?? '?'}</b>
        {speedNote && <span className="faint small">{speedNote}</span>}
        {mon.extras.map((x, i) => <span key={i} className="small"><span className="muted">{titleCase(x.label)}:</span> <b className="num" style={{ fontSize: 14 }}>{x.value}</b></span>)}
      </div>
    </div>
  )
}
