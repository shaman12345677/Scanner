const PATHS = {
  Router: (
    <>
      <rect x="4" y="14" width="16" height="5" rx="1.5" fill="currentColor" stroke="none" opacity="0.95" />
      <circle cx="7.5" cy="16.5" r="1" fill="#0b1220" stroke="none" />
      <circle cx="11" cy="16.5" r="1" fill="#0b1220" stroke="none" />
      <path d="M12 14V8.5" strokeWidth="2" />
      <path d="M8.5 10.2a3.8 3.8 0 0 1 7 0" strokeWidth="2" />
      <path d="M6.8 8a6 6 0 0 1 10.4 0" strokeWidth="2" />
    </>
  ),
  Přepínač: (
    <>
      <rect x="3.5" y="7" width="17" height="10" rx="2" fill="currentColor" stroke="none" />
      <rect x="6" y="10" width="2.2" height="4" rx="0.5" fill="#0b1220" stroke="none" />
      <rect x="9.4" y="10" width="2.2" height="4" rx="0.5" fill="#0b1220" stroke="none" />
      <rect x="12.8" y="10" width="2.2" height="4" rx="0.5" fill="#0b1220" stroke="none" />
      <rect x="16.2" y="10" width="2.2" height="4" rx="0.5" fill="#0b1220" stroke="none" />
    </>
  ),
  'Přístupový bod': (
    <>
      <circle cx="12" cy="14.5" r="2.2" fill="currentColor" stroke="none" />
      <path d="M7.2 11.2a6.2 6.2 0 0 1 9.6 0" strokeWidth="2.2" />
      <path d="M4.8 8.4a9.4 9.4 0 0 1 14.4 0" strokeWidth="2.2" />
    </>
  ),
  Počítač: (
    <>
      <rect x="3.5" y="4.5" width="17" height="11" rx="2" fill="currentColor" stroke="none" />
      <rect x="5.2" y="6" width="13.6" height="7.2" rx="1" fill="#0b1220" stroke="none" />
      <path d="M9 18.2h6M12 15.5v2.7" strokeWidth="2" />
    </>
  ),
  Telefon: (
    <>
      <rect x="7.2" y="3.2" width="9.6" height="17.6" rx="2.2" fill="currentColor" stroke="none" />
      <rect x="8.6" y="5.4" width="6.8" height="11" rx="1" fill="#0b1220" stroke="none" />
      <circle cx="12" cy="18.4" r="0.8" fill="#0b1220" stroke="none" />
    </>
  ),
  Tablet: (
    <>
      <rect x="4.5" y="3.2" width="15" height="17.6" rx="2.2" fill="currentColor" stroke="none" />
      <rect x="6" y="5" width="12" height="12.2" rx="1" fill="#0b1220" stroke="none" />
      <circle cx="12" cy="18.5" r="0.8" fill="#0b1220" stroke="none" />
    </>
  ),
  'TV a média': (
    <>
      <rect x="3" y="5" width="18" height="11" rx="2" fill="currentColor" stroke="none" />
      <rect x="4.8" y="6.6" width="14.4" height="7.2" rx="1" fill="#0b1220" stroke="none" />
      <path d="M9 18.5h6M12 16v2.5" strokeWidth="2" />
    </>
  ),
  Reproduktor: (
    <>
      <path d="M4.5 10.5v3M8 7.8v8.4M12 5.5v13M16 7.8v8.4M19.5 10.5v3" strokeWidth="2.4" />
    </>
  ),
  'Herní konzole': (
    <>
      <rect x="3" y="8" width="18" height="8.5" rx="4" fill="currentColor" stroke="none" />
      <path d="M7.5 12.2h3M9 10.7v3" stroke="#0b1220" strokeWidth="1.8" />
      <circle cx="15" cy="11.1" r="0.9" fill="#0b1220" stroke="none" />
      <circle cx="17" cy="13.1" r="0.9" fill="#0b1220" stroke="none" />
    </>
  ),
  Tiskárna: (
    <>
      <path d="M8 4h8v3.5H8z" fill="currentColor" stroke="none" />
      <rect x="4" y="7.5" width="16" height="7.5" rx="1.8" fill="currentColor" stroke="none" />
      <path d="M8 15h8v4.5H8z" fill="currentColor" stroke="none" />
      <circle cx="16.4" cy="11" r="0.9" fill="#0b1220" stroke="none" />
    </>
  ),
  Kamera: (
    <>
      <circle cx="12" cy="12" r="7.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="3.2" fill="#0b1220" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  'Síťové úložiště': (
    <>
      <rect x="4" y="4" width="16" height="4.8" rx="1.4" fill="currentColor" stroke="none" />
      <rect x="4" y="9.6" width="16" height="4.8" rx="1.4" fill="currentColor" stroke="none" />
      <rect x="4" y="15.2" width="16" height="4.8" rx="1.4" fill="currentColor" stroke="none" />
      <circle cx="7" cy="6.4" r="0.8" fill="#0b1220" stroke="none" />
      <circle cx="7" cy="12" r="0.8" fill="#0b1220" stroke="none" />
      <circle cx="7" cy="17.6" r="0.8" fill="#0b1220" stroke="none" />
    </>
  ),
  IoT: (
    <>
      <rect x="8" y="8" width="8" height="8" rx="2" fill="currentColor" stroke="none" />
      <path d="M12 3.8v2.4M12 17.8v2.4M3.8 12h2.4M17.8 12h2.4" strokeWidth="2.2" />
      <path d="M6.2 6.2l1.7 1.7M16.1 16.1l1.7 1.7M17.8 6.2l-1.7 1.7M7.9 16.1l-1.7 1.7" strokeWidth="2.2" />
    </>
  ),
  Virtuální: (
    <>
      <path d="M12 3.8l7 3.8v8.4L12 20.2l-7-3.8V7.6z" fill="currentColor" stroke="none" opacity="0.95" />
      <path d="M12 12l7-3.8M12 12v8.2M12 12L5 8.2" stroke="#0b1220" strokeWidth="1.6" />
    </>
  ),
  Neznámé: (
    <>
      <circle cx="12" cy="12" r="8" fill="currentColor" stroke="none" opacity="0.9" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.7 2.2c-.8.45-1.4 1-1.4 2" stroke="#0b1220" strokeWidth="2" />
      <circle cx="12" cy="16.6" r="1" fill="#0b1220" stroke="none" />
    </>
  ),
}

const TONES = {
  Router: 'tone-blue',
  Přepínač: 'tone-sky',
  'Přístupový bod': 'tone-cyan',
  Počítač: 'tone-indigo',
  Telefon: 'tone-violet',
  Tablet: 'tone-purple',
  'TV a média': 'tone-fuchsia',
  Reproduktor: 'tone-amber',
  'Herní konzole': 'tone-pink',
  Tiskárna: 'tone-teal',
  Kamera: 'tone-rose',
  'Síťové úložiště': 'tone-emerald',
  IoT: 'tone-lime',
  Virtuální: 'tone-slate',
  Neznámé: 'tone-gray',
}

const VENDOR_TONES = [
  [/apple/i, 'tone-slate'],
  [/synology/i, 'tone-emerald'],
  [/qnap/i, 'tone-sky'],
  [/ubiquiti|unifi/i, 'tone-blue'],
  [/tp-?link/i, 'tone-sky'],
  [/samsung/i, 'tone-blue'],
  [/google/i, 'tone-amber'],
  [/xiaomi|redmi/i, 'tone-orange'],
  [/sonos/i, 'tone-slate'],
  [/raspberry/i, 'tone-rose'],
  [/espressif|tuya|shelly/i, 'tone-lime'],
  [/asus/i, 'tone-indigo'],
  [/hp|hewlett|brother|epson|canon/i, 'tone-teal'],
  [/microsoft/i, 'tone-sky'],
  [/amazon/i, 'tone-amber'],
  [/grandstream/i, 'tone-cyan'],
  [/philips/i, 'tone-indigo'],
]

function toneFor(type, vendor) {
  if (vendor) {
    for (const [re, tone] of VENDOR_TONES) {
      if (re.test(vendor)) return tone
    }
  }
  return TONES[type] || TONES.Neznámé
}

export default function DeviceIcon({ type, vendor, size = 'md' }) {
  const icon = PATHS[type] || PATHS.Neznámé
  const tone = toneFor(type, vendor)
  const label = [type, vendor].filter(Boolean).join(' · ') || 'Neznámé'
  return (
    <div className={`device-icon ${tone} size-${size}`} title={label} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {icon}
      </svg>
    </div>
  )
}
