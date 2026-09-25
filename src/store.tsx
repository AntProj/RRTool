import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

export type Starter = 'Bulbasaur' | 'Charmander' | 'Squirtle'

export interface Settings {
  theme: 'dark' | 'light'
  starter: Starter | null
  cap: number
}
export interface Progress {
  beaten: Record<number, true>
  caught: Record<number, true>
}
export interface Ui {
  lastPath: string
  tabPath: Record<string, string>
  scroll: Record<string, number>
  bossSlot: Record<number, number>
  bossVariant: Record<number, string>
  capOverride: Record<number, number>
  locMethod: Record<string, string>
  dexTab: Record<number, string>
  dexQuery: string
  locQuery: string
}

const DEFAULTS = {
  settings: { theme: 'dark', starter: null, cap: 16 } as Settings,
  progress: { beaten: {}, caught: {} } as Progress,
  ui: {
    lastPath: '/bosses', tabPath: {}, scroll: {}, bossSlot: {}, bossVariant: {}, capOverride: {},
    locMethod: {}, dexTab: {}, dexQuery: '', locQuery: '',
  } as Ui,
}
type Keys = keyof typeof DEFAULTS
const KEY = (k: string) => `rrtool:v1:${k}`

function read<T>(k: Keys): T {
  try {
    const raw = localStorage.getItem(KEY(k))
    if (!raw) return DEFAULTS[k] as T
    return { ...DEFAULTS[k], ...JSON.parse(raw) } as T
  } catch {
    return DEFAULTS[k] as T
  }
}

function usePersisted<T>(k: Keys): [T, (updater: (prev: T) => T) => void] {
  const [value, setValue] = useState<T>(() => read<T>(k))
  const timer = useRef<number | null>(null)
  const latest = useRef(value)
  latest.current = value
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      try { localStorage.setItem(KEY(k), JSON.stringify(latest.current)) } catch { /* private mode */ }
    }, 150)
  }, [value, k])
  const update = useCallback((fn: (prev: T) => T) => setValue(prev => fn(prev)), [])
  return [value, update]
}

interface Store {
  settings: Settings
  setSettings: (fn: (s: Settings) => Settings) => void
  progress: Progress
  setProgress: (fn: (p: Progress) => Progress) => void
  ui: Ui
  setUi: (fn: (u: Ui) => Ui) => void
  patchUi: <K extends keyof Ui>(key: K, sub: string | number, value: Ui[K] extends Record<string, infer V> ? V : never) => void
  resetProgress: () => void
  resetPositions: () => void
  exportState: () => string
  importState: (json: string) => boolean
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = usePersisted<Settings>('settings')
  const [progress, setProgress] = usePersisted<Progress>('progress')
  const [ui, setUi] = usePersisted<Ui>('ui')

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
    const meta = document.querySelector('meta[name=theme-color]')
    if (meta) meta.setAttribute('content', settings.theme === 'dark' ? '#14161a' : '#f4f4f2')
  }, [settings.theme])

  const patchUi = useCallback(<K extends keyof Ui>(key: K, sub: string | number, value: unknown) => {
    setUi(u => ({ ...u, [key]: { ...(u[key] as Record<string, unknown>), [sub]: value } }))
  }, [setUi])

  const value = useMemo<Store>(() => ({
    settings, setSettings, progress, setProgress, ui, setUi,
    patchUi: patchUi as Store['patchUi'],
    resetProgress: () => setProgress(() => ({ ...DEFAULTS.progress, beaten: {}, caught: {} })),
    resetPositions: () => setUi(() => ({ ...DEFAULTS.ui, scroll: {}, tabPath: {}, bossSlot: {}, bossVariant: {}, capOverride: {}, locMethod: {}, dexTab: {} })),
    exportState: () => JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), settings, progress }, null, 1),
    importState: (json: string) => {
      try {
        const d = JSON.parse(json)
        if (!d || typeof d !== 'object' || !d.progress) return false
        setProgress(() => ({ ...DEFAULTS.progress, ...d.progress }))
        if (d.settings) setSettings(s => ({ ...s, ...d.settings }))
        return true
      } catch {
        return false
      }
    },
  }), [settings, setSettings, progress, setProgress, ui, setUi, patchUi])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider missing')
  return s
}

/** Remember and restore the scroll position of a scrolling element. */
export function useScrollRestore(key: string, ref: React.RefObject<HTMLElement | null>) {
  const { ui, patchUi } = useStore()
  const saved = useRef(ui.scroll[key] ?? 0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.scrollTop = saved.current
    let t: number | null = null
    const onScroll = () => {
      if (t) return
      t = window.setTimeout(() => { t = null; patchUi('scroll', key, el.scrollTop) }, 200)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); if (t) window.clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
}
