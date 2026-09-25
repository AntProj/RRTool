import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BASE, dexIdOf, spriteUrl, type Core } from '../data'
import type { Move } from '../types'
import { useCore } from './context'
import { useScrollRestore, useStore } from '../store'

const ICONS: Record<string, ReactNode> = {
  map: <path d="M9 3 3 5v16l6-2 6 2 6-2V3l-6 2-6-2zm0 2.2 6 2v11.6l-6-2V5.2z" />,
  sword: <path d="m14.5 3 6.5 0v6.5l-2-2-7.8 7.8 2.3 2.3-1.4 1.4-1.6-1.6L6.5 21.4 2.6 17.5l4-4-1.6-1.6L6.4 10.5l2.3 2.3L16.5 5l-2-2z" />,
  book: <path d="M5 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm0 2v14h12V5H5zm2 2h8v2H7V7zm0 4h8v2H7v-2zm0 4h5v2H7v-2z" />,
  gear: <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm8.9 5.2.1-1.2-.1-1.2 2.1-1.6-2-3.5-2.5 1a8.3 8.3 0 0 0-2-1.2L16 2h-4l-.5 2.5a8.3 8.3 0 0 0-2 1.2l-2.5-1-2 3.5 2.1 1.6-.1 1.2.1 1.2L3 13.8l2 3.5 2.5-1a8.3 8.3 0 0 0 2 1.2L10 20h4l.5-2.5a8.3 8.3 0 0 0 2-1.2l2.5 1 2-3.5-2.1-1.6z" />,
  back: <path d="m15 4 2 2-6 6 6 6-2 2-8-8z" />,
  check: <path d="m9.5 16.2-3.7-3.7 1.4-1.4 2.3 2.3 6.3-6.3 1.4 1.4z" />,
  search: <path d="M10 2a8 8 0 1 0 4.9 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z" />,
  warn: <path d="M12 2 1 21h22L12 2zm0 4.5L19.5 19h-15L12 6.5zM11 10h2v5h-2v-5zm0 6h2v2h-2v-2z" />,
  info: <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm-1 3h2v2h-2V7zm0 4h2v6h-2v-6z" />,
  next: <path d="m9 4-2 2 6 6-6 6 2 2 8-8z" />,
  close: <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19l5.6-5.6 5.6 5.6 1.4-1.4-5.6-5.6L19 6.4 17.6 5 12 10.6z" />,
}

export function Icon({ name }: { name: string }) {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">{ICONS[name]}</svg>
}

export function Sprite({ name, size = '', className = '' }: { name: string; size?: '' | 'md' | 'lg'; className?: string }) {
  const core = useCore()
  const url = spriteUrl(core, name)
  const [broken, setBroken] = useState(false)
  if (!url || broken) return <span className={`sprite ph ${size} ${className}`} title={name} />
  return <img className={`sprite px ${size} ${className}`} src={url} alt={name} loading="lazy" onError={() => setBroken(true)} />
}

export function Portrait({ path, size = '' }: { path: string | null; size?: '' | 'lg' }) {
  const [broken, setBroken] = useState(false)
  if (!path || broken) return <span className={`portrait ${size}`} />
  return <img className={`portrait px ${size}`} src={`${BASE}sprites/${path}`} alt="" onError={() => setBroken(true)} />
}

export function TypeBadge({ type, sm }: { type: string | null | undefined; sm?: boolean }) {
  if (!type) return null
  const t = type.toLowerCase()
  return <span className={`type ${sm ? 'sm' : ''}`} style={{ ['--t' as string]: `var(--t-${t}, var(--t-unknown))` }}>{type}</span>
}

export function TypeBadges({ core, name, sm }: { core: Core; name: string; sm?: boolean }) {
  const id = dexIdOf(core, name)
  const d = id != null ? core.dexById.get(id) : null
  if (!d) return null
  return <>{d.types.map(t => <TypeBadge key={t} type={t} sm={sm} />)}</>
}

/** Link to the dex entry for a sheet species name, if resolvable. */
export function DexLink({ name, children, className }: { name: string; children: ReactNode; className?: string }) {
  const core = useCore()
  const id = dexIdOf(core, name)
  if (id == null) return <span className={className}>{children}</span>
  return <Link to={`/dex/${id}`} className={className}>{children}</Link>
}

export function CheckButton({ on, onToggle, title }: { on: boolean; onToggle: () => void; title: string }) {
  return (
    <button className={`check ${on ? 'on' : ''}`} onClick={e => { e.preventDefault(); e.stopPropagation(); onToggle() }} title={title} aria-pressed={on}>
      <Icon name="check" />
    </button>
  )
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="search">
      <Icon name="search" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type="search" autoCapitalize="off" autoCorrect="off" />
      {value && <button onClick={() => onChange('')} aria-label="Clear"><Icon name="close" /></button>}
    </label>
  )
}

/** Master/detail layout. On phones only one pane is visible, chosen by whether a detail exists. */
export function TwoPane({ listKey, list, detail, detailKey }: { listKey: string; list: ReactNode; detail: ReactNode | null; detailKey?: string }) {
  const listRef = useRef<HTMLDivElement>(null)
  const detailRef = useRef<HTMLDivElement>(null)
  useScrollRestore(listKey, listRef)
  useScrollRestore(detailKey ?? `${listKey}:detail`, detailRef)
  return (
    <div className={`twopane ${detail ? 'has-detail' : ''}`}>
      <div className="pane list" ref={listRef}>{list}</div>
      <div className="pane detail" ref={detailRef} key={detailKey}>
        {detail ?? <div className="empty">Pick something on the left.</div>}
      </div>
    </div>
  )
}

export function DetailHead({ title, backTo, children }: { title: ReactNode; backTo: string; children?: ReactNode }) {
  const nav = useNavigate()
  return (
    <div className="pane-head">
      <button className="back" onClick={() => nav(backTo)} aria-label="Back"><Icon name="back" /></button>
      <h1 style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</h1>
      {children}
    </div>
  )
}

export function StatBar({ value, max, color }: { value: number; max: number; color?: string }) {
  return <div className="bar"><i style={{ width: `${Math.min(100, (value / max) * 100)}%`, ['--c' as string]: color }} /></div>
}

export function statColor(v: number): string {
  if (v >= 120) return 'var(--t-grass)'
  if (v >= 90) return 'var(--t-electric)'
  if (v >= 60) return 'var(--t-fire)'
  return 'var(--accent)'
}

// ------------------------------------------------------------- move sheet

export function MoveSheet({ move, onClose }: { move: Move | null; onClose: () => void }) {
  useEffect(() => {
    if (!move) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move, onClose])
  if (!move) return null
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="sheet" onClick={e => e.stopPropagation()} role="dialog" aria-label={move.name}>
        <div className="grab" />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <h2>{move.name}</h2>
          <TypeBadge type={move.type} />
          <span className="tag">{move.split}</span>
        </div>
        <div className="mstats">
          <div><div className="l">Power</div><div className="v num">{move.power || '—'}</div></div>
          <div><div className="l">Accuracy</div><div className="v num">{move.accuracy || '—'}</div></div>
          <div><div className="l">PP</div><div className="v num">{move.pp}</div></div>
          <div><div className="l">Priority</div><div className="v num">{move.priority > 0 ? `+${move.priority}` : move.priority}</div></div>
        </div>
        <p className="muted" style={{ margin: 0 }}>{move.description || 'No description.'}</p>
      </div>
    </div>
  )
}

export function useMoveSheet() {
  const [move, setMove] = useState<Move | null>(null)
  return { move, open: setMove, close: () => setMove(null) }
}

export function useSettingsShortcut() {
  return useStore()
}
