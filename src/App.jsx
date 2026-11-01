import { useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar.jsx'
import OverviewView from './views/OverviewView.jsx'
import PingView from './views/PingView.jsx'
import HistoryView from './views/HistoryView.jsx'
import SettingsView from './views/SettingsView.jsx'
import DeviceDetailWindow from './views/DeviceDetailWindow.jsx'
import { readJson, writeJson } from './lib/storage.js'
import { applyDeviceMeta, deviceMetaKey } from './lib/deviceMeta.js'

const emptyRange = { startIp: '', endIp: '' }
const isDeviceWindow = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('view') === 'device'

export default function App() {
  if (isDeviceWindow) {
    return <DeviceDetailWindow />
  }

  return <MainApp />
}

function MainApp() {
  const [view, setView] = useState('overview')
  const [context, setContext] = useState(null)
  const [devices, setDevices] = useState(() => readJson('lastDevices', []))
  const [selectedIp, setSelectedIp] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [progress, setProgress] = useState({ scanned: 0, total: 0, phase: '', currentIP: '', online: 0 })
  const [elapsedMs, setElapsedMs] = useState(0)
  const [scannedAt, setScannedAt] = useState(() => readJson('lastScannedAt', null))
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')
  const [history, setHistory] = useState(() => readJson('scanHistory', []))
  const [range, setRange] = useState(() => readJson('scanRange', emptyRange))
  const [autoScan, setAutoScan] = useState(() => readJson('autoScan', true))
  const [deviceMeta, setDeviceMeta] = useState(() => readJson('deviceMeta', {}))
  const [pingSeed, setPingSeed] = useState('')
  const scanningRef = useRef(false)
  const autoStarted = useRef(false)
  const rangeRef = useRef(range)
  const toastTimer = useRef(null)

  useEffect(() => {
    rangeRef.current = range
  }, [range])

  useEffect(() => {
    if (!window.scaner) {
      setError('Scaner IP běží jen v Electron okně.')
      return undefined
    }

    let alive = true
    window.scaner.getNetworkContext().then((ctx) => {
      if (alive) setContext(ctx)
    }).catch((err) => {
      if (alive) setError(err.message)
    })

    const offUpdate = window.scaner.onScanUpdate((data) => {
      if (data.phase !== undefined || data.scanned !== undefined || data.currentIP !== undefined) {
        setProgress({
          scanned: data.scanned ?? 0,
          total: data.total ?? 0,
          phase: data.phase || '',
          currentIP: data.currentIP || '',
          online: data.online ?? 0,
        })
      }
      if (data.elapsedMs !== undefined) setElapsedMs(data.elapsedMs)
      if (data.error) setError(data.error)
    })

    const offPartial = window.scaner.onScanPartial((partial) => {
      setDevices(partial)
    })

    return () => {
      alive = false
      offUpdate()
      offPartial()
    }
  }, [])

  useEffect(() => {
    writeJson('scanHistory', history)
  }, [history])

  useEffect(() => {
    writeJson('scanRange', range)
  }, [range])

  useEffect(() => {
    writeJson('lastDevices', devices)
  }, [devices])

  useEffect(() => {
    writeJson('lastScannedAt', scannedAt)
  }, [scannedAt])

  useEffect(() => {
    writeJson('autoScan', autoScan)
  }, [autoScan])

  useEffect(() => {
    writeJson('deviceMeta', deviceMeta)
  }, [deviceMeta])

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
  }, [])

  useEffect(() => {
    if (!window.scaner?.onOpenTool) return undefined
    return window.scaner.onOpenTool((payload) => {
      const tool = payload?.tool === 'trace' ? 'trace' : 'ping'
      if (payload?.ip) setPingSeed(payload.ip)
      setView(tool)
    })
  }, [])

  useEffect(() => {
    if (!window.scaner?.onDevicePatch) return undefined
    return window.scaner.onDevicePatch((patch) => {
      if (!patch?.ip) return
      if (
        patch.customName !== undefined
        || patch.note !== undefined
        || patch.pinned !== undefined
      ) {
        setDeviceMeta((prev) => {
          const key = deviceMetaKey(patch)
          if (!key) return prev
          const next = {
            ...prev,
            [key]: {
              name: patch.customName ?? prev[key]?.name ?? '',
              note: patch.note ?? prev[key]?.note ?? '',
              pinned: patch.pinned ?? prev[key]?.pinned ?? false,
            },
          }
          const entry = next[key]
          if (
            !String(entry.name || '').trim()
            && !String(entry.note || '').trim()
            && !entry.pinned
          ) {
            delete next[key]
          }
          return next
        })
      }
      setDevices((prev) => prev.map((device) => (
        device.ip === patch.ip ? { ...device, ...patch } : device
      )))
    })
  }, [])

  const decoratedDevices = useMemo(
    () => devices.map((device) => applyDeviceMeta(device, deviceMeta)),
    [devices, deviceMeta],
  )

  const runScan = async () => {
    if (!window.scaner || scanningRef.current) return
    scanningRef.current = true
    setScanning(true)
    setError('')
    setSelectedIp(null)
    setDevices([])
    setProgress({ scanned: 0, total: 0, phase: 'Start', currentIP: '', online: 0 })
    setElapsedMs(0)

    try {
      const options = {}
      const currentRange = rangeRef.current
      if (currentRange.startIp.trim() && currentRange.endIp.trim()) {
        options.startIp = currentRange.startIp.trim()
        options.endIp = currentRange.endIp.trim()
      }
      const result = await window.scaner.scanSubnet(options)
      if (result?.error) {
        setError(result.error)
        return
      }
      const list = result.devices || []
      setDevices(list)
      if (result.context) setContext(result.context)
      setScannedAt(result.scannedAt || new Date().toISOString())
      setElapsedMs(result.elapsedMs || 0)
      const label = result.context?.primary?.address
        ? `${result.context.primary.address} / ${result.context.gateway || 'síť'}`
        : 'Sken sítě'
      setHistory((prev) => [
        {
          id: Date.now(),
          label,
          timestamp: new Date().toLocaleString('cs-CZ'),
          online: list.filter((d) => d.online).length,
          total: list.length,
          elapsedMs: result.elapsedMs || 0,
          devices: list,
          context: result.context,
          scannedAt: result.scannedAt,
        },
        ...prev,
      ].slice(0, 20))
    } catch (err) {
      setError(err.message)
    } finally {
      scanningRef.current = false
      setScanning(false)
      setProgress((prev) => ({ ...prev, phase: '' }))
    }
  }

  const runScanRef = useRef(runScan)
  runScanRef.current = runScan

  useEffect(() => {
    const onKey = (event) => {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 'r') {
        event.preventDefault()
        if (!scanningRef.current) runScanRef.current()
      }
      if (event.key === 'Escape') {
        setSelectedIp(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!window.scaner || !autoScan || autoStarted.current) return
    if (devices.length > 0) {
      autoStarted.current = true
      return
    }
    autoStarted.current = true
    const timer = setTimeout(() => {
      runScan()
    }, 400)
    return () => clearTimeout(timer)
  }, [autoScan, devices.length])

  const stopScan = async () => {
    await window.scaner?.stopScan()
  }

  const refreshContext = async (nextContext) => {
    try {
      const ctx = nextContext && nextContext.primary
        ? nextContext
        : await window.scaner.getNetworkContext()
      setContext(ctx)
      if (ctx?.ssid) showToast(`Wi‑Fi: ${ctx.ssid}`)
    } catch (err) {
      setError(err.message)
    }
  }

  const exportCsv = async () => {
    const rows = [
      ['Jmeno', 'Typ', 'Stav', 'IP', 'MAC', 'Vyrobce', 'Hostname', 'Poznamka', 'Sluzby'],
      ...decoratedDevices.filter((d) => d.online).map((d) => [
        d.name,
        d.type,
        d.online ? 'online' : 'offline',
        d.ip,
        d.mac || '',
        d.vendor || '',
        d.hostname || '',
        d.note || '',
        (d.services || []).map((s) => s.name).join(', '),
      ]),
    ]
    const escape = (value) => {
      const text = value == null ? '' : String(value)
      if (/[";\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
      return text
    }
    const content = `\uFEFF${rows.map((row) => row.map(escape).join(';')).join('\n')}\n`
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    await window.scaner.exportCsv({ filename: `scaner-ip-${stamp}.csv`, content })
  }

  const showToast = (message) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 1600)
  }

  const copyIp = async (ip) => {
    await window.scaner.copyText(ip)
    showToast(`Zkopírováno: ${ip}`)
  }

  const copyOnlineIps = async () => {
    const ips = decoratedDevices.filter((d) => d.online).map((d) => d.ip)
    if (!ips.length) return
    await window.scaner.copyText(ips.join('\n'))
    showToast(`Zkopírováno ${ips.length} IP`)
  }

  const openTool = (ip, tool = 'ping') => {
    setPingSeed(ip)
    setView(tool === 'trace' || tool === 'speed' ? tool : 'ping')
  }

  const saveDeviceMeta = (device, patch) => {
    const key = deviceMetaKey(device)
    if (!key) return
    setDeviceMeta((prev) => {
      const next = {
        ...prev,
        [key]: {
          name: patch.name ?? prev[key]?.name ?? '',
          note: patch.note ?? prev[key]?.note ?? '',
          pinned: patch.pinned ?? prev[key]?.pinned ?? false,
        },
      }
      const entry = next[key]
      if (
        !String(entry.name || '').trim()
        && !String(entry.note || '').trim()
        && !entry.pinned
      ) {
        delete next[key]
      }
      return next
    })
    showToast(patch.pinned === undefined ? 'Uloženo' : (patch.pinned ? 'Připnuto' : 'Odepnuto'))
  }

  const togglePin = (device) => {
    saveDeviceMeta(device, {
      name: device.customName || '',
      note: device.note || '',
      pinned: !device.pinned,
    })
  }

  const refreshStatuses = async () => {
    if (!window.scaner?.refreshDeviceStatus || scanningRef.current) return
    const ips = decoratedDevices.map((d) => d.ip)
    if (!ips.length) return
    try {
      const result = await window.scaner.refreshDeviceStatus(ips)
      const map = new Map((result.devices || []).map((row) => [row.ip, row]))
      setDevices((prev) => prev.map((device) => {
        const row = map.get(device.ip)
        if (!row) return device
        return {
          ...device,
          online: row.online,
          timeMs: row.online ? row.timeMs : null,
        }
      }))
      showToast('Stav zařízení obnoven')
    } catch (err) {
      setError(err.message)
    }
  }

  const openService = async (ip, service) => {
    if (/smb|cifs/i.test(service.name) || service.port === 445) {
      await window.scaner.openUrl(`smb://${ip}`)
      return
    }
    const httpsLike = /https|tls|dsm \(tls\)/i.test(service.name)
      || [443, 8443, 5001].includes(service.port)
    const httpLike = /http|dsm/i.test(service.name)
      || [80, 8080, 8008, 5000].includes(service.port)
    if (!httpsLike && !httpLike) return
    const scheme = httpsLike ? 'https' : 'http'
    const portPart = ([80, 443].includes(service.port) ? '' : `:${service.port}`)
    await window.scaner.openUrl(`${scheme}://${ip}${portPart}`)
  }

  const refreshServices = async (ip) => {
    if (!window.scaner || !ip) return
    try {
      const services = await window.scaner.probeServices(ip)
      setDevices((prev) => prev.map((d) => {
        if (d.ip !== ip) return d
        return {
          ...d,
          services,
          // identity fields refresh on next full scan; keep ports usable now
        }
      }))
      showToast('Služby obnoveny')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="app-shell">
      <div className="title-drag" style={{ gridColumn: '1 / -1' }} />
      <Sidebar view={view} onChange={setView} />
      <main className="main">
        {toast && <div className="toast">{toast}</div>}
        {view === 'overview' && (
          <OverviewView
            context={context}
            devices={decoratedDevices}
            selectedIp={selectedIp}
            onSelect={setSelectedIp}
            scanning={scanning}
            progress={progress}
            elapsedMs={elapsedMs}
            scannedAt={scannedAt}
            error={error}
            onScan={runScan}
            onStop={stopScan}
            onExport={exportCsv}
            onCopyOnlineIps={copyOnlineIps}
            onRefreshContext={refreshContext}
            onApplyContext={refreshContext}
            onRefreshStatuses={refreshStatuses}
            onTogglePin={togglePin}
          />
        )}
        {(view === 'ping' || view === 'trace' || view === 'speed') && (
          <PingView
            key={view}
            mode={view === 'trace' ? 'trace' : view === 'speed' ? 'speed' : 'ping'}
            initialAddress={pingSeed || context?.gateway || ''}
            devices={decoratedDevices}
          />
        )}
        {view === 'history' && (
          <HistoryView
            history={history}
            currentDevices={decoratedDevices}
            onClear={() => setHistory([])}
            onReuse={(entry) => {
              setDevices(entry.devices || [])
              if (entry.context) setContext(entry.context)
              setScannedAt(entry.scannedAt || null)
              setElapsedMs(entry.elapsedMs || 0)
              setView('overview')
              showToast('Načten sken z historie')
            }}
          />
        )}
        {view === 'settings' && (
          <SettingsView
            range={range}
            onChange={setRange}
            onReset={() => setRange(emptyRange)}
            autoScan={autoScan}
            onAutoScanChange={setAutoScan}
          />
        )}
      </main>
    </div>
  )
}
