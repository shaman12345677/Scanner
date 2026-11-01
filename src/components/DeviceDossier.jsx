import { useEffect, useState } from 'react'
import DeviceIcon from './DeviceIcon.jsx'

function isWebService(service) {
  return /http|dsm/i.test(service.name)
    || [80, 443, 8080, 8443, 8008, 5000, 5001].includes(service.port)
}

function confidenceClass(value) {
  if (value >= 80) return 'high'
  if (value >= 50) return 'mid'
  return 'low'
}

function isSmbService(service) {
  return /smb|cifs/i.test(service.name) || service.port === 445
}

export default function DeviceDossier({
  device,
  probing,
  waking = false,
  variant = 'panel',
  onClose,
  onCopyIp,
  onPingDevice,
  onTraceDevice,
  onWakeDevice,
  onTogglePin,
  onOpenService,
  onRefreshServices,
  onSaveMeta,
}) {
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editNote, setEditNote] = useState('')

  useEffect(() => {
    setEditing(false)
    setEditName(device.customName || '')
    setEditNote(device.note || '')
  }, [device.ip, device.customName, device.note])

  const save = () => {
    onSaveMeta(device, { name: editName, note: editNote })
    setEditing(false)
  }

  const evidence = device.evidence?.length
    ? device.evidence
    : [
        device.vendor ? `MAC prefix je registrovaný na ${device.vendor}` : null,
        device.hostname ? `Hostname ${device.hostname} pomáhá upřesnit identitu` : null,
        device.services?.length ? `Nalezeno ${device.services.length} běžných otevřených služeb` : null,
        device.isLocal ? 'Adresa odpovídá tomuto Macu' : null,
        device.isGateway ? 'Adresa odpovídá výchozí bráně sítě' : null,
      ].filter(Boolean)

  const confidence = device.confidence ?? Math.min(90, 20 + evidence.length * 15)

  const tags = [
    device.type,
    device.model,
    device.system,
  ].filter(Boolean)

  return (
    <aside className={`dossier${variant === 'window' ? ' dossier-window' : ''}`}>
      <div className="dossier-head">
        <div className="dossier-title-row">
          <DeviceIcon type={device.type} vendor={device.vendor} size="lg" />
          <div className="dossier-title">
            <div className="dossier-name-row">
              <h3>{device.name}</h3>
              <span className="status">
                <span className={`status-dot${device.online ? ' on' : ''}`} />
                {device.online ? 'Online' : 'Offline'}
              </span>
            </div>
            <div className="dossier-sub">
              {[
                device.vendor || null,
                device.model && device.model !== device.vendor ? device.model : null,
                device.note ? device.note.slice(0, 48) : null,
              ].filter(Boolean).join(' · ') || device.ip}
            </div>
            <div className="dossier-tags">
              {tags.map((tag) => (
                <span key={tag} className="dossier-tag">{tag}</span>
              ))}
            </div>
          </div>
        </div>
        <div className="dossier-head-actions">
          {onTogglePin && (
            <button
              type="button"
              className={`btn${device.pinned ? ' btn-primary' : ''}`}
              onClick={() => onTogglePin(device)}
              title={device.pinned ? 'Odepnout' : 'Připnout nahoru'}
            >
              {device.pinned ? '★ Připnuto' : '☆ Připnout'}
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => (editing ? save() : setEditing(true))}
          >
            {editing ? 'Uložit' : 'Upravit…'}
          </button>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {variant === 'window' ? 'Zavřít' : 'Hotovo'}
          </button>
        </div>
      </div>

      {editing && (
        <section className="dossier-card">
          <h4>Úprava zařízení</h4>
          <label className="meta-field">
            Vlastní jméno
            <input
              className="input"
              value={editName}
              placeholder={device.hostname || device.model || device.name}
              onChange={(e) => setEditName(e.target.value)}
            />
          </label>
          <label className="meta-field">
            Poznámka
            <textarea
              className="input meta-note"
              rows={3}
              value={editNote}
              placeholder="např. Home NAS v pracovně…"
              onChange={(e) => setEditNote(e.target.value)}
            />
          </label>
        </section>
      )}

      <section className="dossier-card">
        <h4>Síťové údaje</h4>
        <div className="dossier-kv">
          <div><span>IP adresa</span><strong className="mono">{device.ip}</strong></div>
          <div><span>MAC adresa</span><strong className="mono">{device.mac || '—'}</strong></div>
          <div><span>Hostname</span><strong>{device.hostname || '—'}</strong></div>
          {device.friendlyName && device.friendlyName !== device.hostname && (
            <div><span>Vysílaný název</span><strong>{device.friendlyName}</strong></div>
          )}
          <div><span>Role</span><strong>{device.role || 'Zařízení v místní síti'}</strong></div>
          {device.timeMs != null && (
            <div><span>Odezva</span><strong>{device.timeMs} ms</strong></div>
          )}
          {device.note && !editing && (
            <div><span>Poznámka</span><strong>{device.note}</strong></div>
          )}
        </div>
      </section>

      <section className="dossier-card">
        <h4>Identita zařízení</h4>
        <div className="dossier-kv">
          <div><span>Výrobce</span><strong>{device.vendor || '—'}</strong></div>
          <div><span>Model</span><strong>{device.model || '—'}</strong></div>
          <div><span>Systém</span><strong>{device.system || '—'}</strong></div>
          <div className="confidence-row">
            <span>Důvěra identifikace</span>
            <div className="confidence-meter">
              <div
                className={`confidence-fill ${confidenceClass(confidence)}`}
                style={{ width: `${confidence}%` }}
              />
            </div>
            <strong>{confidence} %</strong>
          </div>
        </div>
      </section>

      <section className="dossier-card">
        <h4>Důkazy identifikace</h4>
        {evidence.length ? (
          <ul className="evidence-list">
            {evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">Zatím málo signálů — spusťte nový sken.</p>
        )}
      </section>

      <section className="dossier-card">
        <div className="detail-section-head">
          <h4>Detekované služby</h4>
          <button
            type="button"
            className="btn btn-tiny"
            disabled={!device.online || probing}
            onClick={onRefreshServices}
          >
            {probing ? '…' : 'Obnovit'}
          </button>
        </div>
        {device.services?.length ? (
          <div className="service-rows">
            {device.services.map((service) => (
              <div key={`${service.port}-${service.name}`} className="service-row">
                <div>
                  <strong className="mono">{service.port}</strong>
                  <div>
                    <span className="service-name">{service.name}</span>
                    {service.description && (
                      <span className="muted"> · {service.description}</span>
                    )}
                  </div>
                </div>
                <div className="service-row-actions">
                  <span className="open-pill">Otevřeno</span>
                  {(isWebService(service) || isSmbService(service)) && (
                    <button
                      type="button"
                      className="btn btn-tiny"
                      onClick={() => onOpenService(device.ip, service)}
                    >
                      Otevřít
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Žádné běžné služby nenalezeny.</p>
        )}
      </section>

      <div className="detail-actions">
        <button type="button" className="btn" onClick={() => onCopyIp(device.ip)}>Kopírovat IP</button>
        {device.mac && (
          <button type="button" className="btn" onClick={() => onCopyIp(device.mac)}>Kopírovat MAC</button>
        )}
        <button
          type="button"
          className="btn"
          disabled={!device.online}
          onClick={() => onPingDevice(device.ip)}
        >
          Ping
        </button>
        <button
          type="button"
          className="btn"
          disabled={!device.online}
          onClick={() => onTraceDevice(device.ip)}
        >
          Trasa
        </button>
        {device.mac && onWakeDevice && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={waking}
            onClick={() => onWakeDevice(device)}
            title="Odeslat Wake-on-LAN magic packet"
          >
            {waking ? 'Budím…' : 'Probudit (WoL)'}
          </button>
        )}
      </div>
    </aside>
  )
}
