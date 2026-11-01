import { useEffect, useMemo, useRef, useState } from 'react'
import LatencyChart from '../components/LatencyChart.jsx'
import { readJson, writeJson } from '../lib/storage.js'

const emptyStats = { sent: 0, received: 0, last: null, min: null, avg: null, max: null, failed: false }
const emptySpeed = {
  phase: '',
  downloadMbps: null,
  uploadMbps: null,
  pingMs: null,
  jitterMs: null,
  liveMbps: null,
  progress: 0,
  error: '',
  connection: null,
}
const SPEED_HISTORY_KEY = 'speedTestHistory'
const SPEED_HISTORY_MAX = 10

function formatSpeedTime(iso) {
  try {
    return new Date(iso).toLocaleString('cs-CZ', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

/** Parse macOS/Linux `traceroute -n` or Windows tracert hop lines. */
function parseTraceHop(line) {
  const text = String(line || '').trim()
  if (!text || /^traceroute to|^tracing route/i.test(text)) return null

  // " 1  10.0.2.1  1.234 ms" or " 1  * * *"
  const unix = text.match(
    /^\s*(\d+)\s+(\*|(\d{1,3}(?:\.\d{1,3}){3}))(?:\s+(\d+(?:[.,]\d+)?)\s*ms)?/i,
  )
  if (unix) {
    const hop = Number(unix[1])
    const star = unix[2] === '*'
    const ip = star ? null : unix[3]
    const ms = unix[4] ? Number(String(unix[4]).replace(',', '.')) : null
    return { hop, ip, ms: Number.isFinite(ms) ? ms : null, timeout: star, raw: text }
  }

  // Windows: "  1    <1 ms    <1 ms    <1 ms  10.0.2.1"
  const win = text.match(
    /^\s*(\d+)\s+(?:\*|<\d+\s*ms|\d+\s*ms)(?:\s+(?:\*|<\d+\s*ms|\d+\s*ms)){0,2}\s+(\d{1,3}(?:\.\d{1,3}){3}|Request timed out\.|\*)/i,
  )
  if (win) {
    const hop = Number(win[1])
    const token = win[2]
    const timeout = /timed out|\*/i.test(token)
    const ip = timeout ? null : token
    return { hop, ip, ms: null, timeout, raw: text }
  }

  return null
}

export default function PingView({
  mode = 'ping',
  initialAddress = '',
  devices = [],
}) {
  const tool = mode === 'trace' || mode === 'speed' ? mode : 'ping'
  const [address, setAddress] = useState(initialAddress)
  const [active, setActive] = useState(false)
  const [stats, setStats] = useState(emptyStats)
  const [samples, setSamples] = useState([])
  const [traceLines, setTraceLines] = useState([])
  const [tracing, setTracing] = useState(false)
  const [speed, setSpeed] = useState(emptySpeed)
  const [speedRunning, setSpeedRunning] = useState(false)
  const [speedHistory, setSpeedHistory] = useState(() => readJson(SPEED_HISTORY_KEY, []))
  const timer = useRef(null)
  const inflight = useRef(false)
  const bag = useRef({ sent: 0, received: 0, times: [] })
  const logRef = useRef(null)

  const addressLabel = useMemo(() => {
    const ip = address.trim()
    const match = devices.find((d) => d.ip === ip)
    return match ? `${ip} — ${match.name}` : ip
  }, [address, devices])

  const deviceByIp = useMemo(() => {
    const map = new Map()
    for (const device of devices) map.set(device.ip, device)
    return map
  }, [devices])

  const traceHops = useMemo(() => {
    const byHop = new Map()
    for (const line of traceLines) {
      const parsed = parseTraceHop(line)
      if (!parsed) continue
      byHop.set(parsed.hop, parsed)
    }
    return [...byHop.values()].sort((a, b) => a.hop - b.hop)
  }, [traceLines])

  useEffect(() => {
    if (initialAddress) setAddress(initialAddress)
  }, [initialAddress])

  const stopLivePing = () => {
    if (timer.current) {
      clearInterval(timer.current)
      timer.current = null
    }
    setActive(false)
  }

  useEffect(() => () => {
    stopLivePing()
    window.scaner?.stopTraceroute?.()
    window.scaner?.stopSpeedTest?.()
  }, [])

  useEffect(() => {
    if (!window.scaner?.onTracerouteLine) return undefined
    const off = window.scaner.onTracerouteLine((data) => {
      if (data.line) setTraceLines((prev) => [...prev, data.line])
      if (data.done) setTracing(false)
    })
    return off
  }, [])

  useEffect(() => {
    if (!window.scaner?.onSpeedTestUpdate) return undefined
    const off = window.scaner.onSpeedTestUpdate((data) => {
      setSpeed((prev) => ({
        phase: data.phase || '',
        downloadMbps: data.downloadMbps ?? null,
        uploadMbps: data.uploadMbps ?? null,
        pingMs: data.pingMs ?? null,
        jitterMs: data.jitterMs ?? null,
        liveMbps: data.liveMbps ?? null,
        progress: data.progress ?? 0,
        error: data.error || '',
        connection: data.connection ?? prev.connection ?? null,
      }))
      if (data.phase === 'done') {
        setSpeedRunning(false)
        if (data.success !== false) {
          const conn = data.connection || null
          const entry = {
            id: Date.now(),
            at: new Date().toISOString(),
            downloadMbps: data.downloadMbps ?? null,
            uploadMbps: data.uploadMbps ?? null,
            pingMs: data.pingMs ?? null,
            jitterMs: data.jitterMs ?? null,
            provider: conn?.provider || null,
            serverName: conn?.serverName || null,
            serverIp: conn?.serverIp || null,
            clientIp: conn?.clientIp || null,
          }
          setSpeedHistory((prev) => {
            const next = [entry, ...(Array.isArray(prev) ? prev : [])].slice(0, SPEED_HISTORY_MAX)
            writeJson(SPEED_HISTORY_KEY, next)
            return next
          })
        }
      }
      if (data.phase === 'error') setSpeedRunning(false)
    })
    return off
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [traceLines])

  const record = (result) => {
    const s = bag.current
    s.sent += 1
    if (result.success) {
      s.received += 1
      if (Number.isFinite(result.timeMs)) s.times.push(result.timeMs)
    }
    const times = s.times
    const avg = times.length
      ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10
      : null
    setStats({
      sent: s.sent,
      received: s.received,
      last: Number.isFinite(result.timeMs) ? result.timeMs : null,
      min: times.length ? Math.min(...times) : null,
      avg,
      max: times.length ? Math.max(...times) : null,
      failed: !result.success,
    })
    setSamples((prev) => {
      const next = [...prev, result.success && Number.isFinite(result.timeMs) ? result.timeMs : null]
      return next.slice(-48)
    })
  }

  const pingOnce = async (accumulate = false) => {
    const target = address.trim()
    if (!target || !window.scaner || inflight.current) return
    if (!accumulate) {
      bag.current = { sent: 0, received: 0, times: [] }
      setSamples([])
    }
    inflight.current = true
    try {
      const result = await window.scaner.pingHost(target)
      record(result)
    } finally {
      inflight.current = false
    }
  }

  const toggle = () => {
    if (active) {
      stopLivePing()
      return
    }
    if (!address.trim()) return
    bag.current = { sent: 0, received: 0, times: [] }
    setStats(emptyStats)
    setSamples([])
    pingOnce(true)
    timer.current = setInterval(() => pingOnce(true), 1000)
    setActive(true)
  }

  const onlineTargets = useMemo(
    () => devices.filter((d) => d.online).sort((a, b) => a.name.localeCompare(b.name, 'cs')),
    [devices],
  )

  const runTrace = async () => {
    const target = address.trim()
    if (!target || !window.scaner || tracing) return
    setTraceLines([])
    setTracing(true)
    try {
      await window.scaner.tracerouteHost(target)
    } catch (err) {
      setTraceLines((prev) => [...prev, err.message || 'Traceroute selhal'])
      setTracing(false)
    }
  }

  const stopTrace = async () => {
    await window.scaner?.stopTraceroute?.()
    setTracing(false)
  }

  const runSpeed = async () => {
    if (!window.scaner || speedRunning) return
    setSpeed(emptySpeed)
    setSpeedRunning(true)
    try {
      await window.scaner.speedTest()
    } catch (err) {
      setSpeed((prev) => ({ ...prev, phase: 'error', error: err.message }))
      setSpeedRunning(false)
    }
  }

  const stopSpeed = async () => {
    await window.scaner?.stopSpeedTest?.()
    setSpeedRunning(false)
  }

  const loss = stats.sent
    ? Math.round(((stats.sent - stats.received) / stats.sent) * 1000) / 10
    : 0

  const ring = Math.round((speed.progress || 0) * 100)
  const activeLive = speed.phase === 'upload'
    ? speed.uploadMbps
    : speed.phase === 'download'
      ? speed.downloadMbps
      : speed.liveMbps
  const ringAccent = speed.phase === 'upload'
    ? '#f59e0b'
    : speed.phase === 'ping'
      ? '#a78bfa'
      : '#4c8dff'
  const ringStyle = {
    background: `conic-gradient(from 210deg, ${ringAccent} 0%, #34d399 ${ring}%, rgba(255,255,255,0.08) ${ring}%)`,
  }

  const phaseLabel = {
    ping: 'Měřím ping…',
    download: 'Měřím download…',
    upload: 'Měřím upload…',
    done: 'Hotovo',
    error: 'Chyba',
  }[speed.phase] || 'Připraveno'

  const ringCaption = speed.phase === 'upload'
    ? 'Mbps upload'
    : speed.phase === 'ping'
      ? 'ms ping'
      : 'Mbps download'

  return (
    <>
      <div className="topbar">
        <div>
          <h2>{tool === 'ping' ? 'Živý ping' : tool === 'trace' ? 'Traceroute' : 'Speed test'}</h2>
          {tool !== 'speed' && (
            <p className="subtitle">
              {tool === 'ping' && 'Sledujte odezvu zařízení nebo internetového hostitele v reálném čase.'}
              {tool === 'trace' && 'Každý hop na cestě k cíli — LAN adresy se pářují se skenem.'}
            </p>
          )}
        </div>
      </div>

      {tool !== 'speed' && (
        <div className="view-card tools-card">
          <div className="form-row tools-target">
            <input
              className="input grow"
              list="scaner-device-targets"
              value={address}
              disabled={active || tracing}
              placeholder="IP, hostname nebo vyber ze skenu…"
              onChange={(e) => setAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                if (tool === 'ping' && !active) toggle()
                if (tool === 'trace' && !tracing) runTrace()
              }}
            />
            <datalist id="scaner-device-targets">
              {onlineTargets.map((d) => (
                <option key={d.ip} value={d.ip}>
                  {d.name}{d.vendor ? ` · ${d.vendor}` : ''}
                </option>
              ))}
            </datalist>
            {onlineTargets.length > 0 && (
              <select
                className="input tools-pick"
                disabled={active || tracing}
                value={onlineTargets.some((d) => d.ip === address.trim()) ? address.trim() : ''}
                onChange={(e) => {
                  if (e.target.value) setAddress(e.target.value)
                }}
              >
                <option value="">Ze skenu…</option>
                {onlineTargets.map((d) => (
                  <option key={d.ip} value={d.ip}>
                    {d.name} ({d.ip})
                  </option>
                ))}
              </select>
            )}
            {tool === 'ping' ? (
              <button
                type="button"
                className={`btn${active ? ' btn-danger' : ' btn-primary'}`}
                disabled={!address.trim()}
                onClick={toggle}
              >
                {active ? 'Stop' : 'Start'}
              </button>
            ) : tracing ? (
              <button type="button" className="btn btn-danger" onClick={stopTrace}>Stop</button>
            ) : (
              <button type="button" className="btn btn-primary" disabled={!address.trim()} onClick={runTrace}>
                Spustit trasu
              </button>
            )}
          </div>
          {addressLabel && (
            <div className="muted target-hint">{addressLabel}</div>
          )}

          {tool === 'ping' && (
            <>
              <div className="metric-grid">
                <div className="metric-card">
                  <div className="metric-label">Aktuální</div>
                  <div className={`metric-value ${stats.failed ? 'bad' : 'good'}`}>
                    {stats.last != null ? `${stats.last}` : '—'}
                    <span>ms</span>
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Průměr</div>
                  <div className="metric-value accent">
                    {stats.avg != null ? `${stats.avg}` : '—'}
                    <span>ms</span>
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Min / Max</div>
                  <div className="metric-value purple">
                    {stats.min != null ? `${stats.min} / ${stats.max}` : '—'}
                    <span>ms</span>
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-label">Ztráta</div>
                  <div className={`metric-value ${loss > 0 ? 'warn' : 'good'}`}>
                    {stats.sent ? `${loss}` : '—'}
                    <span>%</span>
                  </div>
                </div>
              </div>
              <LatencyChart samples={samples} live={active} />
            </>
          )}

          {tool === 'trace' && (
            <div className="trace-panel">
              {traceHops.length > 0 ? (
                <table className="trace-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Hostitel</th>
                      <th>IP</th>
                      <th>Odezva</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traceHops.map((hop) => {
                      const known = hop.ip ? deviceByIp.get(hop.ip) : null
                      return (
                        <tr key={hop.hop}>
                          <td className="mono">{hop.hop}</td>
                          <td>
                            {hop.timeout
                              ? <span className="muted">timeout</span>
                              : (known?.name || hop.ip || '—')}
                            {known?.vendor ? (
                              <div className="muted" style={{ fontSize: '0.8rem' }}>{known.vendor}</div>
                            ) : null}
                          </td>
                          <td className="mono">{hop.timeout ? '*' : (hop.ip || '—')}</td>
                          <td className="mono">
                            {hop.ms != null ? `${hop.ms} ms` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="muted" style={{ padding: '8px 0' }}>
                  {tracing ? 'Sleduji trasu…' : 'Výstup traceroute se zobrazí tady.'}
                </div>
              )}
              <div className="trace-log" ref={logRef}>
                {traceLines.map((line, index) => (
                  <div key={`${index}-${line}`} className="mono">{line}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tool === 'speed' && (
        <div className="view-card speed-layout">
          <div className="speed-dashboard">
            <div className="speed-gauge-wrap">
              <div className="speed-ring" style={ringStyle}>
                <div className="speed-ring-inner">
                  <div className="speed-main">
                    {speed.phase === 'ping'
                      ? (speed.pingMs != null ? `${Math.round(speed.pingMs)}` : '—')
                      : (activeLive != null ? activeLive.toFixed(1) : (speed.downloadMbps != null ? speed.downloadMbps.toFixed(1) : '—'))}
                    <span>{ringCaption}</span>
                  </div>
                  <div className="speed-progress-label">{phaseLabel}</div>
                </div>
              </div>
              <div className="speed-meta">
                {speed.error && <div className="error">{speed.error}</div>}
                <div className="form-row">
                  {speedRunning ? (
                    <button type="button" className="btn btn-danger" onClick={stopSpeed}>Stop</button>
                  ) : (
                    <button type="button" className="btn btn-primary" onClick={runSpeed}>
                      {speed.phase === 'done' ? 'Spustit znovu' : 'Spustit speed test'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="speed-metrics">
              <div className={`speed-metric${speed.phase === 'download' ? ' active' : ''}`}>
                <div className="speed-metric-label">Download</div>
                <div className="speed-metric-value down">
                  {speed.downloadMbps != null ? speed.downloadMbps.toFixed(1) : '—'}
                  <span>Mbps</span>
                </div>
              </div>
              <div className={`speed-metric${speed.phase === 'upload' ? ' active' : ''}`}>
                <div className="speed-metric-label">Upload</div>
                <div className="speed-metric-value up">
                  {speed.uploadMbps != null ? speed.uploadMbps.toFixed(1) : '—'}
                  <span>Mbps</span>
                </div>
              </div>
              <div className={`speed-metric${speed.phase === 'ping' ? ' active' : ''}`}>
                <div className="speed-metric-label">Ping</div>
                <div className="speed-metric-value ping">
                  {speed.pingMs != null ? Math.round(speed.pingMs) : '—'}
                  <span>ms</span>
                </div>
              </div>
              <div className="speed-metric">
                <div className="speed-metric-label">Jitter</div>
                <div className="speed-metric-value jitter">
                  {speed.jitterMs != null ? speed.jitterMs.toFixed(1) : '—'}
                  <span>ms</span>
                </div>
              </div>
            </div>
          </div>

          <div className="speed-endpoints">
            <div className="speed-endpoint">
              <div className="speed-endpoint-title">Vy</div>
              <div className="speed-endpoint-rows">
                <div>
                  <span>Poskytovatel</span>
                  <strong>{speed.connection?.provider || '—'}</strong>
                </div>
                <div>
                  <span>ASN</span>
                  <strong className="mono">
                    {speed.connection?.asn ? `AS${speed.connection.asn}` : '—'}
                  </strong>
                </div>
                <div>
                  <span>Veřejná IP</span>
                  <strong className="mono">{speed.connection?.clientIp || '—'}</strong>
                </div>
                <div>
                  <span>Lokalita</span>
                  <strong>
                    {[speed.connection?.clientCity, speed.connection?.clientCountry]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </strong>
                </div>
              </div>
            </div>
            <div className="speed-endpoint server">
              <div className="speed-endpoint-title">Server</div>
              <div className="speed-endpoint-rows">
                <div>
                  <span>Název</span>
                  <strong>{speed.connection?.serverName || 'Cloudflare'}</strong>
                </div>
                <div>
                  <span>Hostitel</span>
                  <strong className="mono">{speed.connection?.serverHost || 'speed.cloudflare.com'}</strong>
                </div>
                <div>
                  <span>IP adresa</span>
                  <strong className="mono">{speed.connection?.serverIp || '—'}</strong>
                </div>
                <div>
                  <span>PoP / colo</span>
                  <strong className="mono">{speed.connection?.serverColo || '—'}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="speed-history">
            <div className="speed-history-head">
              <h3>Poslední měření</h3>
              {speedHistory.length > 0 && (
                <button
                  type="button"
                  className="btn btn-tiny"
                  onClick={() => {
                    setSpeedHistory([])
                    writeJson(SPEED_HISTORY_KEY, [])
                  }}
                >
                  Vymazat
                </button>
              )}
            </div>
            {speedHistory.length === 0 ? (
              <p className="muted">Zatím žádné uložené výsledky.</p>
            ) : (
              <table className="speed-history-table">
                <thead>
                  <tr>
                    <th>Čas</th>
                    <th>Down</th>
                    <th>Up</th>
                    <th>Ping</th>
                    <th>ISP</th>
                    <th>Server</th>
                  </tr>
                </thead>
                <tbody>
                  {speedHistory.map((row) => (
                    <tr key={row.id}>
                      <td>{formatSpeedTime(row.at)}</td>
                      <td className="mono">{row.downloadMbps != null ? `${row.downloadMbps.toFixed(1)}` : '—'}</td>
                      <td className="mono">{row.uploadMbps != null ? `${row.uploadMbps.toFixed(1)}` : '—'}</td>
                      <td className="mono">{row.pingMs != null ? `${Math.round(row.pingMs)}` : '—'}</td>
                      <td>{row.provider || '—'}</td>
                      <td>
                        <div>{row.serverName || '—'}</div>
                        {row.serverIp ? <div className="mono muted">{row.serverIp}</div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </>
  )
}
