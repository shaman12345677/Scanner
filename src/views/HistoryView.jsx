import { useMemo, useState } from 'react'
import { diffDeviceLists, summarizeDiff } from '../lib/scanDiff.js'

function deviceLabel(device) {
  return device?.name || device?.hostname || device?.ip || '—'
}

export default function HistoryView({ history, currentDevices = [], onClear, onReuse }) {
  const [selectedId, setSelectedId] = useState(null)

  const selected = useMemo(
    () => history.find((entry) => entry.id === selectedId) || null,
    [history, selectedId],
  )

  const selectedIndex = selected ? history.findIndex((e) => e.id === selected.id) : -1
  const previous = selectedIndex >= 0 ? history[selectedIndex + 1] : null

  const vsPrevious = useMemo(() => {
    if (!selected || !previous) return null
    return diffDeviceLists(previous.devices || [], selected.devices || [])
  }, [selected, previous])

  const vsCurrent = useMemo(() => {
    if (!selected || !currentDevices?.length) return null
    return diffDeviceLists(selected.devices || [], currentDevices)
  }, [selected, currentDevices])

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Historie</h2>
          <p className="subtitle">Poslední skeny — porovnej změny a načti starší stav.</p>
        </div>
        {history.length > 0 && (
          <button type="button" className="btn" onClick={onClear}>Smazat historii</button>
        )}
      </div>

      <div className={`workspace${selected ? ' with-detail' : ''}`}>
        <section className="panel">
          <div className="view-card" style={{ margin: 0 }}>
            {history.length === 0 ? (
              <div className="empty">Zatím žádná historie.</div>
            ) : (
              <div className="history-list">
                {history.map((entry, index) => {
                  const older = history[index + 1]
                  const diff = older
                    ? diffDeviceLists(older.devices || [], entry.devices || [])
                    : null
                  const summary = diff ? summarizeDiff(diff) : 'první záznam'
                  return (
                    <button
                      type="button"
                      key={entry.id}
                      className={`history-item${selectedId === entry.id ? ' selected' : ''}`}
                      onClick={() => setSelectedId(entry.id === selectedId ? null : entry.id)}
                    >
                      <div className="history-item-head">
                        <strong>{entry.label}</strong>
                        <span className="muted">{entry.timestamp}</span>
                      </div>
                      <div className="muted" style={{ marginTop: 4 }}>
                        {entry.online} online z {entry.total}
                        {entry.elapsedMs != null ? ` · ${Math.round(entry.elapsedMs / 1000)} s` : ''}
                        {' · '}
                        {summary}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {selected && (
          <aside className="dossier history-detail">
            <div className="dossier-head">
              <div>
                <h3>{selected.label}</h3>
                <div className="dossier-sub">{selected.timestamp}</div>
              </div>
              <div className="dossier-head-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onReuse(selected)}
                >
                  Načíst do přehledu
                </button>
                <button type="button" className="btn" onClick={() => setSelectedId(null)}>
                  Zavřít
                </button>
              </div>
            </div>

            <section className="dossier-card">
              <h4>Souhrn</h4>
              <div className="dossier-kv">
                <div><span>Online</span><strong>{selected.online} / {selected.total}</strong></div>
                <div>
                  <span>Délka skenu</span>
                  <strong>{selected.elapsedMs != null ? `${Math.round(selected.elapsedMs / 1000)} s` : '—'}</strong>
                </div>
              </div>
            </section>

            {vsPrevious && (
              <section className="dossier-card">
                <h4>Proti předchozímu skenu</h4>
                <p className="muted" style={{ marginTop: 0 }}>{summarizeDiff(vsPrevious)}</p>
                <DiffLists diff={vsPrevious} />
              </section>
            )}

            {vsCurrent && (
              <section className="dossier-card">
                <h4>Proti aktuálnímu přehledu</h4>
                <p className="muted" style={{ marginTop: 0 }}>
                  {summarizeDiff(vsCurrent)}
                  {' '}
                  <span className="muted">(co se změnilo od tohoto záznamu)</span>
                </p>
                <DiffLists
                  diff={vsCurrent}
                  addedLabel="Nově v přehledu"
                  removedLabel="Chybí v přehledu"
                />
              </section>
            )}

            <section className="dossier-card">
              <h4>Zařízení v záznamu</h4>
              <div className="history-device-list">
                {(selected.devices || []).slice(0, 40).map((device) => (
                  <div key={device.ip} className="history-device-row">
                    <strong>{deviceLabel(device)}</strong>
                    <span className="mono muted">{device.ip}</span>
                    <span className="muted">{device.vendor || device.type || ''}</span>
                  </div>
                ))}
                {(selected.devices || []).length > 40 && (
                  <div className="muted">…a dalších {(selected.devices || []).length - 40}</div>
                )}
              </div>
            </section>
          </aside>
        )}
      </div>
    </>
  )
}

function DiffLists({
  diff,
  addedLabel = 'Nová zařízení',
  removedLabel = 'Zmizelá zařízení',
}) {
  if (!diff.added.length && !diff.removed.length && !diff.changed.length) {
    return <p className="muted">Žádné rozdíly.</p>
  }

  return (
    <div className="history-diff">
      {diff.added.length > 0 && (
        <div>
          <div className="history-diff-label ok">{addedLabel}</div>
          {diff.added.slice(0, 12).map((d) => (
            <div key={`a-${d.ip}`} className="history-diff-row">
              <span>{deviceLabel(d)}</span>
              <span className="mono muted">{d.ip}</span>
            </div>
          ))}
        </div>
      )}
      {diff.removed.length > 0 && (
        <div>
          <div className="history-diff-label bad">{removedLabel}</div>
          {diff.removed.slice(0, 12).map((d) => (
            <div key={`r-${d.ip}`} className="history-diff-row">
              <span>{deviceLabel(d)}</span>
              <span className="mono muted">{d.ip}</span>
            </div>
          ))}
        </div>
      )}
      {diff.changed.length > 0 && (
        <div>
          <div className="history-diff-label warn">Změny</div>
          {diff.changed.slice(0, 12).map((row) => (
            <div key={`c-${row.ip}`} className="history-diff-row">
              <span>
                {deviceLabel(row.after)}
                {row.nameChanged ? ` ← ${deviceLabel(row.before)}` : ''}
                {row.macChanged ? ' · MAC' : ''}
                {row.onlineChanged ? (row.after.online ? ' · online' : ' · offline') : ''}
              </span>
              <span className="mono muted">{row.ip}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
