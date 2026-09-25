import { useRef, useState } from 'react'
import { useCore } from '../components/context'
import { useStore, type Starter } from '../store'

export default function SettingsPage() {
  const core = useCore()
  const { settings, setSettings, progress, resetProgress, resetPositions, exportState, importState } = useStore()
  const [msg, setMsg] = useState<string | null>(null)
  const [paste, setPaste] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const beaten = Object.keys(progress.beaten).length
  const caught = Object.keys(progress.caught).length

  const download = () => {
    const blob = new Blob([exportState()], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `rrtool-progress-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const doImport = (text: string) => setMsg(importState(text) ? 'Progress imported.' : "That didn't look like an RR Tool export.")

  return (
    <div className="pane" style={{ position: 'absolute', inset: 0 }}>
      <div className="pane-head"><h1>Settings</h1></div>
      <div className="detail-body">
        <div className="card">
          <div className="setting">
            <div><div className="bold">Theme</div></div>
            <div className="seg">
              <button className={settings.theme === 'dark' ? 'on' : ''} onClick={() => setSettings(s => ({ ...s, theme: 'dark' }))}>Dark</button>
              <button className={settings.theme === 'light' ? 'on' : ''} onClick={() => setSettings(s => ({ ...s, theme: 'light' }))}>Light</button>
            </div>
          </div>
          <div className="setting">
            <div><div className="bold">Your starter</div><div className="d">Picks the matching rival teams automatically.</div></div>
            <select className="sel" value={settings.starter ?? ''} onChange={e => setSettings(s => ({ ...s, starter: (e.target.value || null) as Starter | null }))}>
              <option value="">Not set</option>
              <option>Bulbasaur</option>
              <option>Charmander</option>
              <option>Squirtle</option>
            </select>
          </div>
          <div className="setting">
            <div><div className="bold">Current level cap</div><div className="d">Boss levels and speed stats are computed for this cap. Also in the top bar.</div></div>
            <select className="sel" value={settings.cap} onChange={e => setSettings(s => ({ ...s, cap: Number(e.target.value) }))}>
              {core.bosses.levelCaps.map(c => <option key={c.cap} value={c.cap}>{c.cap} · {c.label}</option>)}
            </select>
          </div>
        </div>

        <div className="section-title">Progress</div>
        <div className="card">
          <div className="small muted num">{beaten} bosses beaten · {caught} Pokémon caught</div>
          <div className="btnrow">
            <button className="btn" onClick={download}>Export progress</button>
            <button className="btn" onClick={() => file.current?.click()}>Import file</button>
            <input ref={file} type="file" accept="application/json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) f.text().then(doImport); e.target.value = '' }} />
          </div>
          <details style={{ marginTop: 10 }}>
            <summary className="small muted" style={{ cursor: 'pointer' }}>Paste an export instead</summary>
            <textarea className="ta" value={paste} onChange={e => setPaste(e.target.value)} placeholder='{"version":1,...}' />
            <button className="btn" style={{ marginTop: 6 }} onClick={() => doImport(paste)}>Import pasted text</button>
          </details>
          {msg && <div className="small" style={{ marginTop: 8, color: 'var(--ok)' }}>{msg}</div>}
        </div>

        <div className="section-title">Reset</div>
        <div className="card">
          <div className="setting">
            <div><div className="bold">Forget where I was</div><div className="d">Scroll positions, last opened pages, chosen teams and cap overrides. Progress stays.</div></div>
            <button className="btn" onClick={() => { resetPositions(); setMsg('Positions reset.') }}>Reset</button>
          </div>
          <div className="setting">
            <div><div className="bold">Reset progress</div><div className="d">Clears beaten bosses and caught Pokémon. Export first if you might want it back.</div></div>
            <button className="btn danger" onClick={() => { if (confirm('Clear all beaten bosses and caught Pokémon?')) { resetProgress(); setMsg('Progress reset.') } }}>Reset</button>
          </div>
        </div>

        <div className="section-title">About</div>
        <div className="card small muted">
          <div>Radical Red v4.1 Hardcore. Bosses and locations come from the community Google Sheets (imported {core.bosses.importedAt.slice(0, 10)}). Dex data from the JwowSquared Radical Red Pokédex. Sprites from darkbooker/RadicalRedSprites.</div>
          <div style={{ marginTop: 6 }}>Everything is stored in this browser only. Use export to move it to another device.</div>
        </div>
      </div>
    </div>
  )
}
