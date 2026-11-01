import appIcon from '../assets/app-icon.png'

const SECTIONS = [
  {
    items: [
      { id: 'overview', label: 'Přehled', icon: '◈' },
    ],
  },
  {
    title: 'Nástroje',
    items: [
      { id: 'ping', label: 'Živý ping', icon: '◎' },
      { id: 'trace', label: 'Traceroute', icon: '⇢' },
      { id: 'speed', label: 'Speed test', icon: '⚡' },
    ],
  },
  {
    items: [
      { id: 'history', label: 'Historie', icon: '◷' },
      { id: 'settings', label: 'Nastavení', icon: '⚙' },
    ],
  },
]

export default function Sidebar({ view, onChange }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <img className="brand-mark" src={appIcon} alt="" width={40} height={40} />
        <div>
          <h1>Scaner IP</h1>
          <p>Síťový přehled</p>
        </div>
      </div>
      <nav className="nav">
        {SECTIONS.map((section, index) => (
          <div key={section.title || `sec-${index}`} className="nav-section">
            {section.title && <div className="nav-section-title">{section.title}</div>}
            {section.items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`nav-btn${view === item.id ? ' active' : ''}`}
                onClick={() => onChange(item.id)}
              >
                <span className="nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-foot">© 2026 Tomáš Samek</div>
    </aside>
  )
}
