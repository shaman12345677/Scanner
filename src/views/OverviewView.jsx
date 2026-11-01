import { useEffect, useMemo, useState } from 'react'
import DeviceIcon from '../components/DeviceIcon.jsx'

function formatDuration(ms) {
  if (!ms && ms !== 0) return null
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec} s`
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatTime(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return '—'
  }
}

function shortHost(value) {
  return String(value || '')
    .replace(/\.localdomain$/i, '')
    .replace(/\.local$/i, '')
    .trim()
}

export default function OverviewView({
  context,
  devices,
  selectedIp,
  onSelect,
  scanning,
  progress,
  elapsedMs,
  scannedAt,
  error,
  onScan,
  onStop,
  onExport,
  onCopyOnlineIps,
  onRefreshContext,
  onRefreshStatuses,
  onTogglePin,
  onApplyContext,
}) {
  const [query, setQuery] = useState('')
  const [onlineOnly, setOnlineOnly] = useState(true)
  const [typeFilter, setTypeFilter] = useState('all')
  const [sort, setSort] = useState({ key: 'rank', dir: 'asc' })
  const online = devices.filter((d) => d.online)
  const servicesCount = devices.reduce((sum, d) => sum + (d.services?.length || 0), 0)
  const pct = progress.total ? Math.min(100, Math.round((progress.scanned / progress.total) * 100)) : 0

  const typeOptions = useMemo(() => {
    const counts = new Map()
    for (const device of devices) {
      if (onlineOnly && !device.online) continue
      counts.set(device.type, (counts.get(device.type) || 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'cs'))
  }, [devices, onlineOnly])

  const toggleSort = (key) => {
    setSort((prev) => (
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'asc' }
    ))
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = devices.filter((device) => {
      if (onlineOnly && !device.online) return false
      if (typeFilter !== 'all' && device.type !== typeFilter) return false
      if (!q) return true
      const hay = [
        device.name,
        device.customName,
        device.note,
        device.type,
        device.ip,
        device.mac,
        device.vendor,
        device.hostname,
        ...(device.services || []).map((s) => s.name),
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })

    const rank = (d) => (d.isLocal ? 0 : d.isGateway ? 1 : 2)
    const dir = sort.dir === 'asc' ? 1 : -1
    rows.sort((a, b) => {
      const pin = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned))
      if (pin !== 0 && sort.key === 'rank') return pin
      if (sort.key === 'rank') {
        const byRank = rank(a) - rank(b)
        if (byRank !== 0) return byRank
        return a.ip.localeCompare(b.ip, undefined, { numeric: true })
      }
      if (pin !== 0) return pin
      if (sort.key === 'ip') return a.ip.localeCompare(b.ip, undefined, { numeric: true }) * dir
      if (sort.key === 'name') return String(a.name).localeCompare(String(b.name), 'cs') * dir
      if (sort.key === 'type') return String(a.type).localeCompare(String(b.type), 'cs') * dir
      if (sort.key === 'status') return (Number(b.online) - Number(a.online)) * dir
      if (sort.key === 'latency') {
        const av = a.timeMs == null ? Number.POSITIVE_INFINITY : a.timeMs
        const bv = b.timeMs == null ? Number.POSITIVE_INFINITY : b.timeMs
        return (av - bv) * dir
      }
      if (sort.key === 'services') return ((a.services?.length || 0) - (b.services?.length || 0)) * dir
      return 0
    })
    return rows
  }, [devices, onlineOnly, query, sort, typeFilter])

  const sortMark = (key) => (sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '')

  const openDevice = (device) => {
    if (!device) return
    onSelect(device.ip)
    if (window.scaner?.openDeviceDetail) {
      window.scaner.openDeviceDetail(device)
      return
    }
  }

  useEffect(() => {
    const onKey = (event) => {
      if (event.target.matches?.('input, textarea')) return
      if (!filtered.length) return
      if (event.key === 'Enter' && selectedIp) {
        const current = filtered.find((d) => d.ip === selectedIp)
        if (current) {
          event.preventDefault()
          openDevice(current)
        }
        return
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
      event.preventDefault()
      const idx = filtered.findIndex((d) => d.ip === selectedIp)
      if (event.key === 'ArrowDown') {
        const next = filtered[Math.min(filtered.length - 1, Math.max(0, idx + 1))]
        if (next) onSelect(next.ip)
      } else {
        const prev = filtered[Math.max(0, idx <= 0 ? 0 : idx - 1)]
        if (prev) onSelect(prev.ip)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [filtered, onSelect, selectedIp])

  return (
    <>
      <div className="topbar">
        <div>
          <h2>Síťový přehled</h2>
          <p className="subtitle">Živý přehled sítě a inventář zařízení na jednom místě.</p>
        </div>
        <div className="top-actions">
          <div className={`live-pill${scanning ? ' scanning' : ''}`}>
            <span className="live-dot" />
            {scanning
              ? `${progress.phase || 'Sken'} · ${formatDuration(elapsedMs) || '…'}`
              : `Připraveno · ${formatTime(scannedAt)}`}
          </div>
          <button type="button" className="btn" onClick={onRefreshContext} title="Obnovit údaje o síti">↻</button>
          <button
            type="button"
            className="btn"
            disabled={scanning || !devices.length}
            onClick={onRefreshStatuses}
            title="Rychlý ping známých zařízení"
          >
            Obnovit stav
          </button>
          {scanning ? (
            <button type="button" className="btn btn-danger" onClick={onStop}>Stop</button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={onScan}>Skenovat znovu</button>
          )}
        </div>
      </div>

      <div className="stats">
        <div className="stat-card">
          <div className="stat-icon devices" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.7" />
              <path d="M8 20h8M12 16v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <circle cx="7.5" cy="10" r="1" fill="currentColor" />
              <circle cx="12" cy="10" r="1" fill="currentColor" />
              <circle cx="16.5" cy="10" r="1" fill="currentColor" />
            </svg>
          </div>
          <div className="stat-body">
            <div className="stat-label">Viděno zařízení</div>
            <div className="stat-value">{devices.length}</div>
            <div className="stat-meta">v aktuálním skenu</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon online" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" fill="currentColor" />
              <path d="M6.5 6.5a8 8 0 0 1 11 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <path d="M4 4a11.5 11.5 0 0 1 16 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <path d="M6.5 17.5a8 8 0 0 0 11 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <path d="M4 20a11.5 11.5 0 0 0 16 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>
          <div className="stat-body">
            <div className="stat-label">Online teď</div>
            <div className="stat-value">{online.length}</div>
            <div className="stat-meta">odpovídá na ping</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon services" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              <circle cx="8" cy="7" r="1.6" fill="currentColor" />
              <circle cx="14" cy="12" r="1.6" fill="currentColor" />
              <circle cx="10" cy="17" r="1.6" fill="currentColor" />
            </svg>
          </div>
          <div className="stat-body">
            <div className="stat-label">Otevřené služby</div>
            <div className="stat-value">{servicesCount}</div>
            <div className="stat-meta">běžné porty</div>
          </div>
        </div>
      </div>

      <div className="netbar">
        <span className="netbar-network">
          {context?.connectionType === 'Wi-Fi' ? (
            <>
              <span className="netbar-label">Wi‑Fi</span>
              {' '}
              <strong title={context?.ssid || undefined}>
                {context?.ssid || (context?.ssidMissing ? 'název nedostupný' : '—')}
              </strong>
            </>
          ) : (
            <>
              <span className="netbar-label">{context?.connectionType || 'Síť'}</span>
              {context?.ssid ? <>{' '}<strong>{context.ssid}</strong></> : null}
            </>
          )}
        </span>
        <span className="sep">·</span>
        <span>Tento Mac <strong>{context?.primary?.address || '—'}</strong></span>
        <span className="sep">·</span>
        <span>Router <strong>{context?.gateway || '—'}</strong></span>
        <span className="sep">·</span>
        <span>
          Sken {formatTime(scannedAt)}
          {devices.length ? ` · ${online.length} z ${devices.length} online` : ''}
        </span>
      </div>

      {context?.connectionType === 'Wi-Fi' && context?.ssidMissing && (
        <div className="lan-warning ssid-hint">
          <div>
            <strong>Název Wi‑Fi sítě macOS skryje bez Polohových služeb</strong>
            <p>
              {context?.packaged
                ? <>Zapni Polohové služby jen pro <em>Scaner IP</em> (ScanerSSID nepotřebuješ) a klikni „Načíst název sítě“.</>
                : <>Ve vývoji povol Polohu pro <em>Electron</em> / <em>Scaner IP</em>, pak „Načíst název sítě“. Oddělený ScanerSSID už se nepoužívá.</>}
            </p>
          </div>
          <div className="top-actions">
            <button
              type="button"
              className="btn"
              onClick={() => window.scaner?.openLocationSettings?.()}
            >
              Polohové služby
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={async () => {
                const result = await window.scaner?.requestLocationForSsid?.()
                if (result?.context) onApplyContext?.(result.context)
                else onRefreshContext?.()
              }}
            >
              Načíst název sítě
            </button>
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {context?.lanBlocked && (
        <div className="lan-warning">
          <div>
            <strong>macOS blokuje přístup k místní síti</strong>
            <p>
              Proto sken vidí jen tento Mac a router. V Místní síť zapni <em>Scaner IP</em>
              (případně Electron). Pokud položka chybí, nech app chvíli běžet — měl by vyskočit
              systémový dialog — pak ji zapni, restartuj a skenuj znovu.
            </p>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.scaner?.openLocalNetworkSettings?.()}
          >
            Otevřít nastavení
          </button>
        </div>
      )}

      <div className="workspace">
        <section className="panel">
          <div className="panel-head">
            <h3>Zařízení</h3>
            <div className="top-actions">
              <input
                className="input search"
                placeholder="Hledat jméno, IP, MAC…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                type="button"
                className={`btn${onlineOnly ? ' btn-primary' : ''}`}
                onClick={() => setOnlineOnly((v) => !v)}
              >
                {onlineOnly ? 'Jen online' : 'Vše'}
              </button>
              <button
                type="button"
                className="btn"
                disabled={!online.length}
                onClick={onCopyOnlineIps}
                title="Zkopírovat IP všech online zařízení"
              >
                Kopírovat IP
              </button>
              <button type="button" className="btn" disabled={!online.length} onClick={onExport}>CSV</button>
            </div>
          </div>

          {typeOptions.length > 1 && (
            <div className="type-filters">
              <button
                type="button"
                className={`chip-btn${typeFilter === 'all' ? ' active' : ''}`}
                onClick={() => setTypeFilter('all')}
              >
                Všechny typy
              </button>
              {typeOptions.map(([type, count]) => (
                <button
                  key={type}
                  type="button"
                  className={`chip-btn${typeFilter === type ? ' active' : ''}`}
                  onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
                >
                  {type}
                  <span className="count">{count}</span>
                </button>
              ))}
            </div>
          )}

          {(scanning || progress.total > 0) && (
            <div className="progress-wrap">
              <div className="progress"><div style={{ width: `${pct}%` }} /></div>
              <span className="muted mono progress-meta">
                {progress.phase ? `${progress.phase} · ` : ''}
                {progress.scanned}/{progress.total}
                {progress.online != null ? ` · ${progress.online} online` : ''}
                {progress.currentIP ? ` · ${progress.currentIP}` : ''}
                {elapsedMs ? ` · ${formatDuration(elapsedMs)}` : ''}
              </span>
            </div>
          )}

          <div className="table-wrap">
            {filtered.length === 0 ? (
              <div className="empty">
                {scanning ? (
                  <>
                    <div>Skenuji síť…</div>
                    <p className="muted">Nejdřív ping, pak znovu zmeškané adresy a nakonec služby.</p>
                  </>
                ) : devices.length ? (
                  'Nic neodpovídá filtru.'
                ) : (
                  <>
                    <div>Zatím žádná data.</div>
                    <p className="muted">Spusť sken a zobrazí se online zařízení v síti.</p>
                    <button type="button" className="btn btn-primary" onClick={onScan}>Spustit sken</button>
                  </>
                )}
              </div>
            ) : (
              <table className="devices">
                <thead>
                  <tr>
                    <th className="pin-col" aria-label="Připnout" />
                    <th className="sortable" onClick={() => toggleSort('name')}>Identita{sortMark('name')}</th>
                    <th className="sortable" onClick={() => toggleSort('type')}>Typ{sortMark('type')}</th>
                    <th className="sortable" onClick={() => toggleSort('status')}>Stav{sortMark('status')}</th>
                    <th className="sortable" onClick={() => toggleSort('latency')}>Odezva{sortMark('latency')}</th>
                    <th className="sortable" onClick={() => toggleSort('ip')}>IP{sortMark('ip')}</th>
                    <th>MAC</th>
                    <th className="sortable" onClick={() => toggleSort('services')}>Služby{sortMark('services')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((device) => (
                    <tr
                      key={device.ip}
                      className={`${selectedIp === device.ip ? 'selected' : ''}${device.pinned ? ' pinned' : ''}`}
                      onClick={() => openDevice(device)}
                      onDoubleClick={() => openDevice(device)}
                    >
                      <td className="pin-col" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className={`pin-btn${device.pinned ? ' on' : ''}`}
                          title={device.pinned ? 'Odepnout' : 'Připnout'}
                          onClick={() => onTogglePin?.(device)}
                        >
                          {device.pinned ? '★' : '☆'}
                        </button>
                      </td>
                      <td>
                        <div className="identity">
                          <DeviceIcon type={device.type} vendor={device.vendor} />
                          <div>
                            <div className="name">
                              {device.name}
                              {device.isLocal && <span className="role-tag">Mac</span>}
                              {device.isGateway && <span className="role-tag gateway">Router</span>}
                            </div>
                            <div className="sub">
                              {[
                                device.vendor || null,
                                device.model && device.model !== device.vendor && device.model !== device.name
                                  ? device.model
                                  : null,
                                device.friendlyName && device.hostname && device.friendlyName !== shortHost(device.hostname)
                                  ? shortHost(device.hostname)
                                  : null,
                                device.note ? device.note.slice(0, 40) : null,
                              ].filter(Boolean).join(' · ') || device.ip}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>{device.type}</td>
                      <td>
                        <span className="status">
                          <span className={`status-dot${device.online ? ' on' : ''}`} />
                          {device.online ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="mono latency-cell">
                        {device.timeMs != null ? `${device.timeMs} ms` : '—'}
                      </td>
                      <td className="mono">{device.ip}</td>
                      <td className="mono">{device.mac || '—'}</td>
                      <td>
                        {device.services?.length ? (
                          <div className="service-chips compact">
                            {device.services.slice(0, 3).map((service) => (
                              <span key={`${device.ip}-${service.port}`} className="chip">
                                {service.name}
                              </span>
                            ))}
                            {device.services.length > 3 && (
                              <span className="chip more">+{device.services.length - 3}</span>
                            )}
                          </div>
                        ) : (device.online ? 'Žádné' : '—')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

      </div>
    </>
  )
}
