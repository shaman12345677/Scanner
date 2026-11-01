export default function LatencyChart({ samples, live }) {
  const width = 640
  const height = 220
  const padX = 12
  const padY = 18
  const values = samples.map((s) => (Number.isFinite(s) ? s : null))
  const finite = values.filter((v) => v != null)
  const max = Math.max(20, ...(finite.length ? finite : [20])) * 1.15
  const min = 0
  const innerW = width - padX * 2
  const innerH = height - padY * 2

  const points = values
    .map((value, index) => {
      if (value == null) return null
      const x = padX + (index / Math.max(1, values.length - 1)) * innerW
      const y = padY + innerH - ((value - min) / (max - min)) * innerH
      return `${x},${y}`
    })
    .filter(Boolean)
    .join(' ')

  const areaPoints = values
    .map((value, index) => {
      if (value == null) return null
      const x = padX + (index / Math.max(1, values.length - 1)) * innerW
      const y = padY + innerH - ((value - min) / (max - min)) * innerH
      return [x, y]
    })
    .filter(Boolean)

  let areaPath = ''
  if (areaPoints.length) {
    areaPath = `M ${areaPoints[0][0]} ${padY + innerH} L ${areaPoints.map(([x, y]) => `${x} ${y}`).join(' L ')} L ${areaPoints[areaPoints.length - 1][0]} ${padY + innerH} Z`
  }

  return (
    <div className="latency-chart">
      <div className="latency-chart-head">
        {live ? <span className="live-badge">LIVE</span> : <span className="muted">Graf odezvy</span>}
        <span className="muted">Starší → Teď</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="latency-svg" role="img" aria-label="Graf latency">
        <defs>
          <linearGradient id="latencyFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(52, 211, 153, 0.35)" />
            <stop offset="100%" stopColor="rgba(52, 211, 153, 0)" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((p) => (
          <line
            key={p}
            x1={padX}
            x2={width - padX}
            y1={padY + innerH * p}
            y2={padY + innerH * p}
            className="chart-grid"
          />
        ))}
        {areaPath && <path d={areaPath} fill="url(#latencyFill)" />}
        {points && (
          <polyline
            fill="none"
            stroke="#34d399"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
            points={points}
          />
        )}
        {!finite.length && (
          <text x={width / 2} y={height / 2} textAnchor="middle" className="chart-empty">
            Spusťte živý ping
          </text>
        )}
      </svg>
    </div>
  )
}
