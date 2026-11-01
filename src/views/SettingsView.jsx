import { useEffect, useState } from 'react'

export default function SettingsView({ range, onChange, onReset, autoScan, onAutoScanChange }) {
  const [meta, setMeta] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    let alive = true
    window.scaner?.getUpdateMeta?.().then((info) => {
      if (alive) setMeta(info)
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  async function onCheckUpdates() {
    setBusy(true)
    setNote('')
    try {
      const result = await window.scaner.checkForUpdates()
      if (result?.message) setNote(result.message)
      else if (result?.upToDate) setNote(`Máš nejnovější verzi (${result.version}).`)
      else if (result?.version) setNote(`Dostupná verze ${result.version}.`)
    } catch (err) {
      setNote(err?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Nastavení</h2>
          <p className="subtitle">Rozsah skenu, chování při startu a aktualizace.</p>
        </div>
      </div>
      <div className="view-card settings-grid">
        <label className="check-row">
          <input
            type="checkbox"
            checked={autoScan}
            onChange={(e) => onAutoScanChange(e.target.checked)}
          />
          <span>Po startu automaticky skenovat, pokud ještě nejsou data</span>
        </label>
        <label>
          Počáteční IP
          <input
            className="input"
            value={range.startIp}
            placeholder="prázdné = celá podsíť"
            onChange={(e) => onChange({ ...range, startIp: e.target.value })}
          />
        </label>
        <label>
          Koncová IP
          <input
            className="input"
            value={range.endIp}
            placeholder="prázdné = celá podsíť"
            onChange={(e) => onChange({ ...range, endIp: e.target.value })}
          />
        </label>
        <div className="form-row">
          <button type="button" className="btn" onClick={onReset}>Použít celou podsíť</button>
        </div>

        <div className="settings-hint">
          <strong>Aktualizace</strong>
          <p>Verze: {meta?.version || '—'}</p>
          <p>
            {meta?.autoUpdateEnabled
              ? 'Po startu se kontrolují GitHub Releases.'
              : meta?.packaged
                ? 'Autoaktualizace na této platformě není aktivní.'
                : 'V režimu vývoje se aktualizace nekontrolují — až v notarizovaném buildu.'}
          </p>
          <div className="form-row" style={{ marginTop: 8, gap: 8 }}>
            <button type="button" className="btn" disabled={busy} onClick={onCheckUpdates}>
              {busy ? 'Kontroluji…' : 'Zkontrolovat aktualizace'}
            </button>
            <button type="button" className="btn secondary" onClick={() => window.scaner.openReleasesPage()}>
              GitHub Releases
            </button>
          </div>
          {note ? <p style={{ marginTop: 8 }}>{note}</p> : null}
        </div>

        <div className="settings-hint">
          <strong>Zkratky a tipy</strong>
          <p><kbd>⌘</kbd>/<kbd>Ctrl</kbd>+<kbd>R</kbd> — nový sken</p>
          <p><kbd>Esc</kbd> — zavřít detail zařízení</p>
          <p><kbd>↑</kbd>/<kbd>↓</kbd> — posun v seznamu zařízení</p>
          <p>Klik na hlavičku sloupce v přehledu — řazení</p>
          <p>☆ v přehledu — připnout zařízení nahoru</p>
          <p>Obnovit stav — rychlý ping bez plného skenu</p>
          <p>Probudit (WoL) — magic packet na MAC (pokud to zařízení umí)</p>
        </div>
      </div>
    </>
  )
}
