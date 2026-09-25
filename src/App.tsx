import { useEffect, useRef, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { loadCore, type Core } from './data'
import { useStore } from './store'
import { CoreContext } from './components/context'
import { Icon } from './components/ui'
import BossesPage from './pages/Bosses'
import LocationsPage from './pages/Locations'
import DexPage from './pages/Dex'
import SettingsPage from './pages/Settings'

const TABS = [
  { key: 'locations', label: 'Locations', icon: 'map' },
  { key: 'bosses', label: 'Bosses', icon: 'sword' },
  { key: 'dex', label: 'Dex', icon: 'book' },
  { key: 'settings', label: 'Settings', icon: 'gear' },
] as const

export default function App() {
  const [core, setCore] = useState<Core | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const { settings, setSettings, ui, setUi } = useStore()
  const loc = useLocation()
  const nav = useNavigate()
  const booted = useRef(false)

  useEffect(() => { loadCore().then(setCore, e => setErr(String(e))) }, [])

  // restore where the user left off on first load
  useEffect(() => {
    if (booted.current) return
    booted.current = true
    if ((loc.pathname === '/' || loc.pathname === '') && ui.lastPath && ui.lastPath !== '/') {
      nav(ui.lastPath, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // remember current path globally and per tab
  useEffect(() => {
    const path = loc.pathname
    if (path === '/' || path === '') return
    const tab = path.split('/')[1]
    setUi(u => (u.lastPath === path && u.tabPath[tab] === path) ? u : { ...u, lastPath: path, tabPath: { ...u.tabPath, [tab]: path } })
  }, [loc.pathname, setUi])

  const caps = core?.bosses.levelCaps ?? []

  return (
    <div className="app">
      <header className="hdr">
        <div className="brand"><span className="dot" />RR Tool<span className="sub">v4.1 Hardcore</span></div>
        <div className="spacer" />
        {core && (
          <label className="capctl" title="Your current level cap. Boss levels and speed stats follow it.">
            <span className="muted">Cap</span>
            <select value={settings.cap} onChange={e => setSettings(s => ({ ...s, cap: Number(e.target.value) }))}>
              {caps.map(c => <option key={c.cap} value={c.cap}>{c.cap} · {c.label.replace(/^Pre-/, '')}</option>)}
            </select>
          </label>
        )}
      </header>

      <nav className="rail">
        {TABS.map(t => (
          <NavLink key={t.key} to={ui.tabPath[t.key] ?? `/${t.key}`} className={({ isActive }) => isActive || loc.pathname.startsWith(`/${t.key}`) ? 'active' : ''}>
            <Icon name={t.icon} />{t.label}
          </NavLink>
        ))}
        <div className="ver">{core ? `Sheets imported ${core.bosses.importedAt.slice(0, 10)}` : ''}</div>
      </nav>

      <main className="main">
        {err && <div className="empty">Couldn't load data.<span className="small">{err}</span></div>}
        {!err && !core && <div className="loading"><span className="spin" />Loading data…</div>}
        {core && (
          <CoreContext.Provider value={core}>
            <Routes>
              <Route path="/" element={<Navigate to="/bosses" replace />} />
              <Route path="/bosses" element={<BossesPage />} />
              <Route path="/bosses/:idx" element={<BossesPage />} />
              <Route path="/locations" element={<LocationsPage />} />
              <Route path="/locations/other/:section" element={<LocationsPage />} />
              <Route path="/locations/:slug" element={<LocationsPage />} />
              <Route path="/dex" element={<DexPage />} />
              <Route path="/dex/:id" element={<DexPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/bosses" replace />} />
            </Routes>
          </CoreContext.Provider>
        )}
      </main>

      <nav className="tabs">
        {TABS.map(t => (
          <NavLink key={t.key} to={ui.tabPath[t.key] ?? `/${t.key}`} className={() => loc.pathname.startsWith(`/${t.key}`) ? 'active' : ''}>
            <Icon name={t.icon} />{t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
