import { useEffect, useState } from 'react'
import DeviceDossier from '../components/DeviceDossier.jsx'
import { applyDeviceMeta, deviceMetaKey } from '../lib/deviceMeta.js'
import { readJson, writeJson } from '../lib/storage.js'

export default function DeviceDetailWindow() {
  const [device, setDevice] = useState(null)
  const [probing, setProbing] = useState(false)
  const [waking, setWaking] = useState(false)
  const [toast, setToast] = useState('')
  const [deviceMeta, setDeviceMeta] = useState(() => readJson('deviceMeta', {}))

  useEffect(() => {
    document.title = device?.name || device?.ip || 'Zařízení'
  }, [device?.name, device?.ip])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      window.scaner?.closeWindow?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!window.scaner?.onDeviceDetailData) return undefined
    return window.scaner.onDeviceDetailData((payload) => {
      if (payload) setDevice(applyDeviceMeta(payload, readJson('deviceMeta', {})))
    })
  }, [])

  useEffect(() => {
    if (!window.scaner?.onDevicePatch) return undefined
    return window.scaner.onDevicePatch((patch) => {
      if (!patch?.ip) return
      setDevice((prev) => {
        if (!prev || prev.ip !== patch.ip) return prev
        return applyDeviceMeta({ ...prev, ...patch }, readJson('deviceMeta', {}))
      })
    })
  }, [])

  useEffect(() => {
    writeJson('deviceMeta', deviceMeta)
  }, [deviceMeta])

  const showToast = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 1400)
  }

  const decorated = device ? applyDeviceMeta(device, deviceMeta) : null

  const writeMetaEntry = (key, patch, prev) => {
    const nextEntry = {
      name: patch.name ?? prev[key]?.name ?? '',
      note: patch.note ?? prev[key]?.note ?? '',
      pinned: patch.pinned ?? prev[key]?.pinned ?? false,
    }
    const next = { ...prev, [key]: nextEntry }
    if (
      !String(nextEntry.name || '').trim()
      && !String(nextEntry.note || '').trim()
      && !nextEntry.pinned
    ) {
      delete next[key]
    }
    return next
  }

  const saveMeta = (target, patch) => {
    const key = deviceMetaKey(target)
    if (!key) return
    setDeviceMeta((prev) => writeMetaEntry(key, patch, prev))
    const updated = {
      ...target,
      customName: String(patch.name || '').trim(),
      note: String(patch.note || ''),
      name: String(patch.name || '').trim() || target.name,
    }
    setDevice(updated)
    window.scaner?.broadcastDevicePatch?.({
      ip: target.ip,
      mac: target.mac,
      customName: updated.customName,
      note: updated.note,
      name: updated.name,
    })
    showToast('Uloženo')
  }

  const togglePin = (target) => {
    const key = deviceMetaKey(target)
    if (!key) return
    const pinned = !target.pinned
    setDeviceMeta((prev) => writeMetaEntry(key, {
      name: prev[key]?.name ?? target.customName ?? '',
      note: prev[key]?.note ?? target.note ?? '',
      pinned,
    }, prev))
    setDevice((prev) => (prev ? { ...prev, pinned } : prev))
    window.scaner?.broadcastDevicePatch?.({
      ip: target.ip,
      mac: target.mac,
      pinned,
    })
    showToast(pinned ? 'Připnuto' : 'Odepnuto')
  }

  const wakeDevice = async (target) => {
    if (!target?.mac || !window.scaner?.wakeOnLan) return
    setWaking(true)
    try {
      const result = await window.scaner.wakeOnLan({ mac: target.mac, ip: target.ip })
      if (result?.error) showToast(result.error)
      else showToast('Wake-on-LAN odeslán')
    } catch (err) {
      showToast(err.message || 'WoL selhal')
    } finally {
      setWaking(false)
    }
  }

  const copyText = async (text) => {
    await window.scaner?.copyText?.(text)
    showToast(`Zkopírováno: ${text}`)
  }

  const openService = async (ip, service) => {
    if (/smb|cifs/i.test(service.name) || service.port === 445) {
      await window.scaner?.openUrl?.(`smb://${ip}`)
      return
    }
    const httpsLike = /https|tls|dsm \(tls\)/i.test(service.name)
      || [443, 8443, 5001].includes(service.port)
    const httpLike = /http|dsm/i.test(service.name)
      || [80, 8080, 8008, 5000].includes(service.port)
    if (!httpsLike && !httpLike) return
    const scheme = httpsLike ? 'https' : 'http'
    const portPart = ([80, 443].includes(service.port) ? '' : `:${service.port}`)
    await window.scaner?.openUrl?.(`${scheme}://${ip}${portPart}`)
  }

  const refreshServices = async () => {
    if (!decorated?.ip || !window.scaner?.probeServices) return
    setProbing(true)
    try {
      const services = await window.scaner.probeServices(decorated.ip)
      const patched = { ...decorated, services }
      setDevice(patched)
      await window.scaner.broadcastDevicePatch?.({ ip: decorated.ip, services })
      showToast('Služby obnoveny')
    } catch (err) {
      showToast(err.message || 'Obnova selhala')
    } finally {
      setProbing(false)
    }
  }

  if (!decorated) {
    return (
      <div className="device-window">
        <div className="title-drag" />
        <div className="empty">Načítám zařízení…</div>
      </div>
    )
  }

  return (
    <div className="device-window">
      <div className="title-drag" />
      {toast && <div className="toast">{toast}</div>}
      <DeviceDossier
        device={decorated}
        probing={probing}
        waking={waking}
        variant="window"
        onClose={() => window.scaner?.closeWindow?.()}
        onCopyIp={copyText}
        onPingDevice={(ip) => window.scaner?.focusMainTool?.({ tool: 'ping', ip })}
        onTraceDevice={(ip) => window.scaner?.focusMainTool?.({ tool: 'trace', ip })}
        onWakeDevice={wakeDevice}
        onTogglePin={togglePin}
        onOpenService={openService}
        onRefreshServices={refreshServices}
        onSaveMeta={saveMeta}
      />
    </div>
  )
}
