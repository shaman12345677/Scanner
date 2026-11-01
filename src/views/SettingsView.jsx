export default function SettingsView({ range, onChange, onReset, autoScan, onAutoScanChange }) {
  return (
    <>
      <div className="topbar">
        <div>
          <h2>Nastavení</h2>
          <p className="subtitle">Rozsah skenu a chování při startu.</p>
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
