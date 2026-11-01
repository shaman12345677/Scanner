/** Compare two device lists by IP. */
export function diffDeviceLists(previous = [], next = []) {
  const prevMap = new Map(previous.map((d) => [d.ip, d]))
  const nextMap = new Map(next.map((d) => [d.ip, d]))

  const added = []
  const removed = []
  const changed = []

  for (const [ip, device] of nextMap) {
    const before = prevMap.get(ip)
    if (!before) {
      added.push(device)
      continue
    }
    const nameChanged = (before.name || '') !== (device.name || '')
    const macChanged = (before.mac || '') !== (device.mac || '')
    const onlineChanged = Boolean(before.online) !== Boolean(device.online)
    if (nameChanged || macChanged || onlineChanged) {
      changed.push({ ip, before, after: device, nameChanged, macChanged, onlineChanged })
    }
  }

  for (const [ip, device] of prevMap) {
    if (!nextMap.has(ip)) removed.push(device)
  }

  return { added, removed, changed }
}

export function summarizeDiff(diff) {
  const parts = []
  if (diff.added.length) parts.push(`+${diff.added.length} nová`)
  if (diff.removed.length) parts.push(`−${diff.removed.length} pryč`)
  if (diff.changed.length) parts.push(`${diff.changed.length} změna`)
  return parts.join(' · ') || 'bez změn'
}
