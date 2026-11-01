import {
  guessDeviceType,
  buildIdentity,
  displayName,
  decorateServices,
  resolveVendor,
} from '../../electron/vendors.js'

export function deviceMetaKey(device) {
  if (device?.mac) return `mac:${String(device.mac).toLowerCase()}`
  if (device?.ip) return `ip:${device.ip}`
  return null
}

export function reclassifyDevice(device) {
  const identityHost = device.friendlyName || device.hostname
  const vendor = resolveVendor(
    device.hostname,
    device.broadcastVendor || device.vendor,
    device.friendlyName,
  )
  const services = decorateServices(device.services || [], {
    vendor,
    hostname: identityHost,
  })
  const type = guessDeviceType({
    ip: device.ip,
    vendor,
    hostname: device.hostname,
    friendlyName: device.friendlyName,
    isGateway: device.isGateway,
    isLocal: device.isLocal,
    services,
  })
  const identity = buildIdentity({
    vendor,
    hostname: device.hostname,
    friendlyName: device.friendlyName,
    services,
    isGateway: device.isGateway,
    isLocal: device.isLocal,
    type,
    mac: device.mac,
  })
  const model = device.broadcastModel || identity.model
  const autoName = displayName({
    hostname: device.hostname,
    friendlyName: device.friendlyName,
    vendor,
    ip: device.ip,
    isGateway: device.isGateway,
    isLocal: device.isLocal,
    model,
  })
  return {
    ...device,
    vendor,
    services,
    type,
    name: autoName,
    model,
    system: identity.system,
    role: identity.role,
    confidence: identity.confidence,
    evidence: identity.evidence,
    tags: identity.tags,
  }
}

export function applyDeviceMeta(device, metaMap) {
  const classified = reclassifyDevice(device)
  const key = deviceMetaKey(classified)
  const meta = key ? metaMap?.[key] : null
  if (!meta) {
    return {
      ...classified,
      customName: '',
      note: '',
      pinned: false,
    }
  }
  const customName = String(meta.name || '').trim()
  return {
    ...classified,
    customName,
    note: String(meta.note || ''),
    pinned: Boolean(meta.pinned),
    name: customName || classified.name,
  }
}
