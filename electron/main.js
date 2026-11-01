import { app, BrowserWindow, ipcMain, dialog, clipboard, shell, session, nativeImage } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { existsSync, constants as fsConstants } from 'fs'
import { networkInterfaces, hostname as osHostname } from 'os'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { reverse, promises as dnsPromises } from 'dns'
import { writeFile, appendFile, unlink, readFile } from 'fs/promises'
import net from 'net'
import dgram from 'dgram'
import https from 'https'
import { Buffer } from 'buffer'
import { createRequire } from 'module'
import {
  vendorFromMac,
  resolveVendor,
  guessDeviceType,
  displayName,
  buildIdentity,
  decorateServices,
} from './vendors.js'

// koffi jen pro macOS SSID — na Windows se nesmí načítat (chybí native binary při cross-buildu).
const require = createRequire(import.meta.url)
function loadKoffi() {
  if (process.platform !== 'darwin') return null
  try {
    return require('koffi')
  } catch (err) {
    console.warn('[ssid] koffi nedostupné:', err?.message || err)
    return null
  }
}
import {
  setupAutoUpdater,
  scheduleUpdateCheck,
  checkForUpdatesManual,
  openReleasesPage,
  getUpdateMeta,
} from './updater.js'

const execFileAsync = promisify(execFile)
const reverseAsync = promisify(reverse)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function resolveAppIcon() {
  const candidates = [
    process.resourcesPath ? path.join(process.resourcesPath, 'icon.ico') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'icon.png') : null,
    process.resourcesPath ? path.join(process.resourcesPath, 'icon.icns') : null,
    path.join(__dirname, '..', 'build', process.platform === 'win32' ? 'icon.ico' : 'icon.icns'),
    path.join(__dirname, '..', 'build', 'icon.png'),
    path.join(__dirname, '..', 'icon.icns'),
    path.join(__dirname, '..', 'icon.ico'),
    path.join(__dirname, '..', 'public', 'icon.png'),
    path.join(__dirname, '..', 'dist', 'icon.png'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue
    const image = nativeImage.createFromPath(candidate)
    if (!image.isEmpty()) return image
  }
  return null
}

const appIcon = resolveAppIcon()

// Electron/GUI apps often miss /usr/sbin and /sbin in PATH — use absolute paths.
const BIN = {
  arp: process.platform === 'win32' ? 'arp' : '/usr/sbin/arp',
  ping: process.platform === 'win32' ? 'ping' : '/sbin/ping',
  route: process.platform === 'win32' ? 'route' : '/sbin/route',
  networksetup: '/usr/sbin/networksetup',
  ipconfig: '/usr/sbin/ipconfig',
  dscacheutil: '/usr/bin/dscacheutil',
  dig: '/usr/bin/dig',
  scutil: '/usr/sbin/scutil',
  traceroute: process.platform === 'win32' ? 'tracert' : '/usr/sbin/traceroute',
}

let scanGeneration = 0
let tracerouteProc = null
let tracerouteGeneration = 0
let speedTestGeneration = 0

const COMMON_PORTS = [
  { port: 22, name: 'SSH', description: 'Vzdálený přístup' },
  { port: 53, name: 'DNS', description: 'Překlad doménových jmen' },
  { port: 80, name: 'HTTP', description: 'Webové rozhraní' },
  { port: 443, name: 'HTTPS', description: 'Zabezpečené webové rozhraní' },
  { port: 445, name: 'SMB', description: 'Sdílení souborů' },
  { port: 548, name: 'AFP', description: 'Apple Filing Protocol' },
  { port: 631, name: 'IPP', description: 'Tisková služba' },
  { port: 3389, name: 'RDP', description: 'Vzdálená plocha' },
  { port: 5000, name: 'HTTP-alt', description: 'Webová správa' },
  { port: 5001, name: 'HTTPS-alt', description: 'Zabezpečená webová správa' },
  { port: 554, name: 'RTSP', description: 'Video stream kamery' },
  { port: 5900, name: 'VNC', description: 'Vzdálená plocha' },
  { port: 7000, name: 'AirPlay', description: 'Apple AirPlay' },
  { port: 8008, name: 'Cast', description: 'Chromecast / Google Cast' },
  { port: 8009, name: 'Cast', description: 'Chromecast setup' },
  { port: 8080, name: 'HTTP-alt', description: 'Alternativní web' },
  { port: 8443, name: 'HTTPS-alt', description: 'Alternativní HTTPS' },
  { port: 9100, name: 'RAW', description: 'Tiskový port' },
]

const deviceWindows = new Map()

function rendererBaseUrl() {
  return process.env.VITE_DEV_SERVER_URL || null
}

function loadRenderer(win, search = '') {
  const devUrl = rendererBaseUrl()
  if (devUrl) {
    const url = new URL(devUrl)
    if (search) url.search = search.startsWith('?') ? search.slice(1) : search
    win.loadURL(url.toString())
    return
  }
  const file = path.join(__dirname, '..', 'dist', 'index.html')
  win.loadFile(file, search ? { search: search.replace(/^\?/, '') } : undefined)
}

function isDeviceWindow(win) {
  try {
    const url = win.webContents.getURL()
    return /[?&]view=device(?:&|$)/.test(url)
  } catch {
    return false
  }
}

function getMainWindow() {
  return BrowserWindow.getAllWindows().find((win) => !win.isDestroyed() && !isDeviceWindow(win)) || null
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1100,
    minHeight: 700,
    title: 'Scaner IP',
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    icon: appIcon || undefined,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 12 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  loadRenderer(win)
}

function createDeviceWindow(device, parent = null) {
  const ip = device?.ip
  if (!ip) return null

  const existing = deviceWindows.get(ip)
  if (existing && !existing.isDestroyed()) {
    existing.focus()
    existing.webContents.send('device-detail-data', device)
    return existing
  }

  const win = new BrowserWindow({
    width: 820,
    height: 920,
    minWidth: 640,
    minHeight: 700,
    title: device.name || device.ip || 'Zařízení',
    backgroundColor: '#0f1115',
    autoHideMenuBar: true,
    icon: appIcon || undefined,
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 14, y: 12 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  deviceWindows.set(ip, win)
  win.on('closed', () => {
    if (deviceWindows.get(ip) === win) deviceWindows.delete(ip)
  })

  loadRenderer(win, 'view=device')
  win.webContents.once('did-finish-load', () => {
    if (!win.isDestroyed()) win.webContents.send('device-detail-data', device)
  })
  return win
}

async function execText(command, args, timeout = 5000) {
  try {
    const { stdout } = await execFileAsync(command, args, {
      timeout,
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
    })
    return stdout || ''
  } catch (error) {
    const stdout = typeof error.stdout === 'string' ? error.stdout : error.stdout?.toString?.()
    return stdout || ''
  }
}

function summaryValue(text, key) {
  const match = text.match(new RegExp(`^\\s*${key}\\s*:\\s*(.+)$`, 'm'))
  if (!match) return null
  const value = match[1].trim()
  if (!value || value === '<redacted>' || value === '<none>' || value === 'none') return null
  return value
}

function parseIpv4(ip) {
  if (typeof ip !== 'string') return null
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  const nums = parts.map(Number)
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null
  return nums
}

function ipToInt(parts) {
  return (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0
}

function intToIp(num) {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join('.')
}

function subnetHosts(ip, netmask) {
  const ipParts = parseIpv4(ip)
  const maskParts = parseIpv4(netmask)
  if (!ipParts || !maskParts) return []
  const ipInt = ipToInt(ipParts)
  const maskInt = ipToInt(maskParts)
  const network = (ipInt & maskInt) >>> 0
  const broadcast = (network | (~maskInt >>> 0)) >>> 0
  const hosts = []
  for (let i = network + 1; i < broadcast; i++) {
    hosts.push(intToIp(i))
    if (hosts.length >= 1024) break
  }
  return hosts
}

function isValidHost(value) {
  if (typeof value !== 'string') return false
  const host = value.trim()
  if (!host || host.length > 253) return false
  const ipv4 = /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/
  const hostname = /^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/
  return ipv4.test(host) || hostname.test(host)
}

function pingArgs(address, timeoutMs) {
  if (process.platform === 'win32') {
    return ['-n', '1', '-w', String(timeoutMs), address]
  }
  if (process.platform === 'darwin') {
    return ['-c', '1', '-W', String(timeoutMs), address]
  }
  return ['-c', '1', '-W', String(Math.max(1, Math.ceil(timeoutMs / 1000))), address]
}

function pingTimeMs(output) {
  const match = String(output || '').match(/(?:time|čas)[=<]\s*([0-9]+(?:[.,][0-9]+)?)\s*ms/i)
  if (!match) return null
  const value = Number(match[1].replace(',', '.'))
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null
}

async function pingHost(address, timeoutMs) {
  try {
    const { stdout } = await execFileAsync(BIN.ping, pingArgs(address, timeoutMs), {
      timeout: timeoutMs + 2000,
      windowsHide: true,
    })
    if (process.platform === 'win32') {
      return { success: stdout.includes('TTL='), output: stdout, timeMs: pingTimeMs(stdout) }
    }
    return { success: true, output: stdout, timeMs: pingTimeMs(stdout) }
  } catch (error) {
    const output = typeof error.stdout === 'string'
      ? error.stdout
      : (error.stdout?.toString?.() || error.message)
    return { success: false, output, timeMs: null }
  }
}

function normalizeMac(value) {
  const parts = value.toLowerCase().replace(/-/g, ':').split(':')
  if (parts.length !== 6) return null
  const mac = parts.map((part) => part.padStart(2, '0')).join(':')
  if (mac === '00:00:00:00:00:00' || mac === 'ff:ff:ff:ff:ff:ff') return null
  return mac
}

function parseArpTable(text) {
  const map = new Map()
  for (const line of String(text || '').split('\n')) {
    if (/incomplete|invalid/i.test(line)) continue
    const ipMatch = line.match(/\((\d{1,3}(?:\.\d{1,3}){3})\)|\b(\d{1,3}(?:\.\d{1,3}){3})\b/)
    const ip = ipMatch?.[1] || ipMatch?.[2]
    const macMatch = line.match(/\b([0-9a-f]{1,2}(?::[0-9a-f]{1,2}){5})\b/i)
      || line.match(/\b([0-9a-f]{2}(?:-[0-9a-f]{2}){5})\b/i)
    if (!ip || !macMatch) continue
    const mac = normalizeMac(macMatch[1])
    if (mac) map.set(ip, mac)
  }
  return map
}

/** macOS GUI apps without Local Network permission get an empty ARP table.
 *  launchd jobs are auto-allowed — use a one-shot agent as fallback. */
async function readArpTableViaLaunchd() {
  const label = `cz.samek.scanerip.arp.${process.pid}.${Date.now()}`
  const outFile = `/tmp/${label}.out`
  const plistFile = `/tmp/${label}.plist`
  const domain = `gui/${process.getuid?.() ?? 501}`
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-c</string>
    <string>/usr/sbin/arp -an &gt; ${outFile}</string>
  </array>
  <key>RunAtLoad</key><true/>
</dict></plist>`

  try {
    await writeFile(plistFile, plist, 'utf8')
    await execFileAsync('/bin/launchctl', ['bootstrap', domain, plistFile], { timeout: 5000 })
    for (let i = 0; i < 30; i++) {
      try {
        const text = await readFile(outFile, 'utf8')
        if (text.length > 0) return text
      } catch {
        // not ready
      }
      await new Promise((r) => setTimeout(r, 100))
    }
    try {
      return await readFile(outFile, 'utf8')
    } catch {
      return ''
    }
  } catch {
    return ''
  } finally {
    try {
      await execFileAsync('/bin/launchctl', ['bootout', `${domain}/${label}`], { timeout: 3000 })
    } catch {
      // ignore
    }
    try { await unlink(plistFile) } catch { /* ignore */ }
    try { await unlink(outFile) } catch { /* ignore */ }
  }
}

async function readArpTable() {
  const args = process.platform === 'win32' ? ['-a'] : ['-an']
  let text = await execText(BIN.arp, args, 4000)
  let map = parseArpTable(text)
  if (process.platform === 'darwin' && map.size <= 1) {
    const viaLaunchd = await readArpTableViaLaunchd()
    if (viaLaunchd) {
      const launched = parseArpTable(viaLaunchd)
      if (launched.size > map.size) map = launched
    }
  }
  return map
}

async function fillMissingMacs(resultsByIp, localIp, localMac) {
  await new Promise((r) => setTimeout(r, 300))
  const arp = await readArpTable()
  for (const [ip, row] of resultsByIp) {
    if (row.mac) continue
    if (localIp && ip === localIp && localMac) {
      row.mac = normalizeMac(localMac) || localMac
      continue
    }
    if (arp.has(ip)) row.mac = arp.get(ip)
  }
  return arp
}

function cleanHostname(value) {
  return String(value || '')
    .replace(/\.$/, '')
    .replace(/\.localdomain$/i, '')
    .trim() || null
}

async function localMachineHostname() {
  if (process.platform === 'darwin') {
    const local = cleanHostname(await execText(BIN.scutil, ['--get', 'LocalHostName'], 800))
    if (local) return local
    const computer = cleanHostname(await execText(BIN.scutil, ['--get', 'ComputerName'], 800))
    if (computer) return computer
  }
  return cleanHostname(osHostname())
}

async function lookupMdnsHostname(ip) {
  if (process.platform !== 'darwin' || !parseIpv4(ip)) return null
  const text = await execText(
    BIN.dig,
    ['+time=1', '+tries=1', '+short', '-x', ip, '@224.0.0.251', '-p', '5353'],
    1600,
  )
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith(';') && !/^(\d+\.){3}\d+$/.test(l))
  return cleanHostname(line)
}

async function lookupHostname(ip, { allowCacheUtil = false } = {}) {
  // Prefer mDNS (.local) — often the real device name on home LANs.
  const mdns = await lookupMdnsHostname(ip)
  if (mdns) return mdns

  try {
    const hostnames = await Promise.race([
      reverseAsync(ip),
      new Promise((_, reject) => setTimeout(() => reject(new Error('dns-timeout')), 350)),
    ])
    const dnsName = cleanHostname(hostnames?.[0])
    if (dnsName) return dnsName
  } catch {
    // fall through
  }

  if (allowCacheUtil && process.platform === 'darwin') {
    const text = await execText(BIN.dscacheutil, ['-q', 'host', '-a', 'ip_address', ip], 900)
    const name = cleanHostname(text.match(/^name:\s*(.+)$/m)?.[1])
    if (name) return name
  }
  return null
}

function runDnsSd(args, durationMs = 2000) {
  return new Promise((resolve) => {
    const child = spawn('/usr/bin/dns-sd', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let out = ''
    const onData = (chunk) => {
      out += chunk.toString()
    }
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM') } catch { /* ignore */ }
    }, durationMs)
    child.on('close', () => {
      clearTimeout(timer)
      resolve(out)
    })
    child.on('error', () => {
      clearTimeout(timer)
      resolve(out)
    })
  })
}

function cleanFriendlyBroadcastName(instance) {
  return String(instance || '')
    .replace(/^\[LG\]\s*/i, '')
    .replace(/^\[Samsung\]\s*/i, '')
    .replace(/^\[Sony\]\s*/i, '')
    .replace(/\\032/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || null
}

const BONJOUR_BROWSE = [
  { service: '_airplay._tcp', priority: 3 },
  { service: '_companion-link._tcp', priority: 2 },
  { service: '_raop._tcp', priority: 2 },
  { service: '_googlecast._tcp', priority: 2 },
  { service: '_smb._tcp', priority: 1 },
]

function friendlyFromBonjourInstance(instance, service) {
  let raw = String(instance || '')
  // RAOP: "AABBCCDDEEFF@Obývák" → "Obývák"
  if (/_raop\._tcp/i.test(service)) {
    raw = raw.replace(/^[0-9A-F]{6,}@/i, '')
  }
  return cleanFriendlyBroadcastName(raw)
}

function mergeBroadcastInfo(current, next) {
  if (!current) return next
  const curPri = current.priority || 0
  const nextPri = next.priority || 0
  if (nextPri > curPri) {
    return {
      ...next,
      model: next.model || current.model,
      manufacturer: next.manufacturer || current.manufacturer,
    }
  }
  return {
    ...current,
    friendlyName: current.friendlyName || next.friendlyName,
    serviceHost: current.serviceHost || next.serviceHost,
    model: current.model || next.model,
    manufacturer: current.manufacturer || next.manufacturer,
    priority: Math.max(curPri, nextPri),
  }
}

/** Bonjour / AirPlay / Cast / SMB — uživatelsky viditelné názvy. */
async function discoverBroadcastNames() {
  if (process.platform !== 'darwin') return { byIp: new Map(), byHost: new Map() }

  const byIp = new Map()
  const byHost = new Map()
  const jobs = []

  for (const { service, priority } of BONJOUR_BROWSE) {
    const browseOut = await runDnsSd(['-B', service, 'local.'], 2200)
    const instances = []
    const re = new RegExp(`\\bAdd\\s+\\d+\\s+\\d+\\s+\\S+\\s+${service.replace(/\./g, '\\.')}\\.\\s+(.+)$`, 'i')
    for (const line of browseOut.split('\n')) {
      const match = line.match(re)
      if (match?.[1]) instances.push(match[1].trim())
    }
    for (const instance of [...new Set(instances)].slice(0, 24)) {
      jobs.push({ instance, service, priority })
    }
  }

  for (let i = 0; i < jobs.length; i += 4) {
    const chunk = jobs.slice(i, i + 4)
    await Promise.all(chunk.map(async ({ instance, service, priority }) => {
      const lookup = await runDnsSd(['-L', instance, service, 'local.'], 1400)
      const hostMatch = lookup.match(/can be reached at\s+([^.\s:]+)\./i)
      const serviceHost = hostMatch?.[1] ? cleanHostname(`${hostMatch[1]}.local`) : null
      const model = lookup.match(/\bmodel=([^\s]+)/i)?.[1]?.replace(/\\/g, '') || null
      const manufacturer = lookup.match(/\bmanufacturer=([^\s]+)/i)?.[1]?.replace(/\\/g, ' ') || null
      const friendlyName = friendlyFromBonjourInstance(instance, service)
      if (!friendlyName && !serviceHost) return

      let ip = null
      if (serviceHost) {
        const shortHost = serviceHost.replace(/\.local$/i, '')
        const digOut = await execText(
          BIN.dig,
          ['+time=1', '+tries=1', '+short', `${shortHost}.local`, '@224.0.0.251', '-p', '5353'],
          1400,
        )
        ip = digOut
          .split('\n')
          .map((l) => l.trim())
          .find((l) => parseIpv4(l)) || null
      }

      const info = {
        friendlyName: friendlyName || null,
        serviceHost,
        model,
        manufacturer,
        instance,
        priority,
      }
      if (ip) byIp.set(ip, mergeBroadcastInfo(byIp.get(ip), info))
      if (serviceHost) {
        const keys = [
          serviceHost.toLowerCase(),
          serviceHost.replace(/\.local$/i, '').toLowerCase(),
        ]
        for (const key of keys) {
          byHost.set(key, mergeBroadcastInfo(byHost.get(key), info))
        }
      }
    }))
  }

  return { byIp, byHost }
}

function applyBroadcastNames(resultsByIp, directory) {
  if (!directory) return
  for (const row of resultsByIp.values()) {
    const hostKey = cleanHostname(row.hostname)?.toLowerCase()
    const info = directory.byIp.get(row.ip)
      || (hostKey ? directory.byHost.get(hostKey) : null)
      || (hostKey ? directory.byHost.get(hostKey.replace(/\.local$/i, '')) : null)
    if (!info) continue
    if (info.friendlyName) row.friendlyName = info.friendlyName
    if (info.model) row.broadcastModel = info.model
    if (info.manufacturer && /lg/i.test(info.manufacturer)) {
      row.broadcastVendor = 'LG Electronics'
    } else if (info.manufacturer && /samsung/i.test(info.manufacturer)) {
      row.broadcastVendor = 'Samsung'
    } else if (info.manufacturer && /google/i.test(info.manufacturer)) {
      // Cast / Google TV — jen když hostname neříká jinak (resolveVendor to přebije)
      if (!row.broadcastVendor) row.broadcastVendor = 'Google'
    }
    if (!row.hostname && info.serviceHost) row.hostname = info.serviceHost
  }
}

async function enrichHostnames(resultsByIp, context, { onProgress } = {}) {
  const localIp = context?.primary?.address
  if (localIp && resultsByIp.has(localIp)) {
    const row = resultsByIp.get(localIp)
    if (row && !row.hostname) {
      row.hostname = await localMachineHostname()
      onProgress?.(localIp)
    }
  }

  const gateway = context?.gateway
  const priority = []
  const rest = []
  for (const row of resultsByIp.values()) {
    if (!row.online || row.hostname) continue
    if (row.ip === gateway) priority.push(row)
    else rest.push(row)
  }

  const resolveRow = async (row) => {
    const preferCache = row.ip === gateway || row.ip === localIp
    row.hostname = await lookupHostname(row.ip, { allowCacheUtil: preferCache })
    onProgress?.(row.ip)
  }

  for (const row of priority) await resolveRow(row)

  for (let i = 0; i < rest.length; i += 6) {
    const chunk = rest.slice(i, i + 6)
    await Promise.all(chunk.map(resolveRow))
  }

  // Friendly names from AirPlay broadcasts (LG TV “kuchyn”, “Tomáš – Mac mini”…).
  try {
    onProgress?.('AirPlay')
    const directory = await discoverBroadcastNames()
    applyBroadcastNames(resultsByIp, directory)
    onProgress?.('AirPlay')
  } catch {
    // Bonjour enrichment is best-effort
  }
}

/** Devices that answer ARP but block ICMP still count as online. */
function mergeArpDiscoveries(resultsByIp, hosts, arp, context) {
  const hostSet = new Set(hosts)
  for (const [ip, mac] of arp.entries()) {
    if (!hostSet.has(ip)) continue
    const existing = resultsByIp.get(ip)
    if (existing) {
      if (!existing.mac) existing.mac = mac
      if (!existing.online) existing.online = true
      continue
    }
    resultsByIp.set(ip, {
      ip,
      online: true,
      hostname: null,
      mac,
      timeMs: null,
      services: [],
    })
  }

  const localIp = context.primary?.address
  if (localIp && hostSet.has(localIp)) {
    const prev = resultsByIp.get(localIp)
    const mac = normalizeMac(context.primary?.mac) || context.primary?.mac || prev?.mac || null
    resultsByIp.set(localIp, {
      ip: localIp,
      online: true,
      hostname: prev?.hostname || null,
      mac,
      timeMs: prev?.timeMs ?? 0,
      services: prev?.services || [],
    })
  }
  const gateway = context.gateway
  if (gateway && hostSet.has(gateway)) {
    const prev = resultsByIp.get(gateway)
    resultsByIp.set(gateway, {
      ip: gateway,
      online: true,
      hostname: prev?.hostname || null,
      mac: prev?.mac || arp.get(gateway) || null,
      timeMs: prev?.timeMs ?? null,
      services: prev?.services || [],
    })
  }
}

async function tcpAlive(ip) {
  const ports = [80, 443, 445, 22, 8080, 5000, 548, 139]
  const checks = await Promise.all(ports.map((port) => probePort(ip, port, 220)))
  return checks.some(Boolean)
}

function probePort(ip, port, timeoutMs = 350) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let done = false
    const finish = (open) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(open)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, ip)
  })
}

async function probeServices(ip) {
  const results = await Promise.all(
    COMMON_PORTS.map(async (item) => {
      const openPort = await probePort(ip, item.port)
      return openPort ? item : null
    })
  )
  return results.filter(Boolean)
}

function resolveSsidDylibPath() {
  const candidates = [
    process.resourcesPath
      ? path.join(process.resourcesPath, 'helpers', 'libscanerssid.dylib')
      : null,
    path.join(
      __dirname.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`),
      'helpers',
      'libscanerssid.dylib',
    ),
    path.join(__dirname, 'helpers', 'libscanerssid.dylib'),
  ].filter(Boolean)

  return candidates.find((candidate) => existsSync(candidate)) || null
}

let ssidDylibFn = null
function readWifiSsidInProcess() {
  if (process.platform !== 'darwin') return null
  try {
    if (!ssidDylibFn) {
      const koffi = loadKoffi()
      const libPath = resolveSsidDylibPath()
      if (!koffi || !libPath) return null
      const lib = koffi.load(libPath)
      ssidDylibFn = lib.func('scaner_wifi_ssid', 'int', ['char *', 'int'])
    }
    const buf = Buffer.alloc(256)
    const ok = ssidDylibFn(buf, buf.length)
    if (ok !== 1) return null
    const value = buf.toString('utf8').replace(/\0.*$/, '').trim()
    return value || null
  } catch {
    return null
  }
}

async function readWifiSsid(ifaceName) {
  if (process.platform !== 'darwin' || !ifaceName) return null

  // 1) CoreWLAN v procesu Scaner IP — funguje po povolení Polohy pro hlavní appku.
  const inProcess = readWifiSsidInProcess()
  if (inProcess) return inProcess

  const summary = await execText(BIN.ipconfig, ['getsummary', ifaceName])
  const fromSummary = summaryValue(summary, 'SSID')
  if (fromSummary) return fromSummary

  const airport = await execText(BIN.networksetup, ['-getairportnetwork', ifaceName])
  const airportMatch = airport.match(/Current Wi-?Fi Network:\s*(.+)$/im)
  if (airportMatch?.[1]) {
    const name = airportMatch[1].trim()
    if (name && !/not associated|error obtaining/i.test(name)) return name
  }

  return null
}

async function getNetworkContext() {
  const interfaces = networkInterfaces()
  const locals = []
  for (const [name, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs || []) {
      if (addr.family !== 'IPv4' && addr.family !== 4) continue
      if (addr.internal) continue
      locals.push({
        name,
        address: addr.address,
        netmask: addr.netmask,
        mac: addr.mac,
      })
    }
  }

  let gateway = null
  let routeIface = null
  const routeText = await execText(BIN.route, ['-n', 'get', 'default'])
  gateway = routeText.match(/gateway:\s*(\S+)/)?.[1] || null
  routeIface = routeText.match(/interface:\s*(\S+)/)?.[1] || null

  let primary = locals.find((item) => item.name === routeIface) || locals[0] || null
  let ssid = null
  let connectionType = 'Ethernet'
  let security = null
  let ssidMissing = false

  if (process.platform === 'darwin' && primary) {
    const hw = await execText(BIN.networksetup, ['-listallhardwareports'])
    const wifiMatch = [...hw.matchAll(/Hardware Port: (Wi-Fi|AirPort)\nDevice: ([\w\d]+)/g)]
    const wifiIfaces = new Set(wifiMatch.map((m) => m[2]))
    if (wifiIfaces.has(primary.name)) connectionType = 'Wi-Fi'

    const summary = await execText(BIN.ipconfig, ['getsummary', primary.name])
    if (summaryValue(summary, 'InterfaceType') === 'WiFi') connectionType = 'Wi-Fi'
    security = summaryValue(summary, 'Security')
    const router = summaryValue(summary, 'Router')
    if (router) gateway = router

    if (connectionType === 'Wi-Fi') {
      ssid = await readWifiSsid(primary.name)
      ssidMissing = !ssid
    }
  }

  const arp = await readArpTable()
  const lanBlocked = process.platform === 'darwin' && arp.size <= 1

  return {
    primary,
    locals,
    gateway,
    ssid,
    ssidMissing,
    connectionType,
    security,
    platform: process.platform,
    arpCount: arp.size,
    lanBlocked,
    packaged: app.isPackaged,
  }
}

/** Trigger macOS Local Network permission prompt. */
function requestLocalNetworkAccess(gateway) {
  if (process.platform !== 'darwin') return

  // Bonjour browse reliably surfaces the Local Network permission dialog.
  try {
    const browser = spawn('/usr/bin/dns-sd', ['-B', '_services._dns-sd._udp', 'local.'], {
      stdio: 'ignore',
    })
    setTimeout(() => {
      try { browser.kill('SIGTERM') } catch { /* ignore */ }
    }, 2500)
  } catch {
    // ignore
  }

  try {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })
    socket.on('error', () => {
      try { socket.close() } catch { /* ignore */ }
    })
    socket.bind(0, () => {
      try {
        socket.setBroadcast(true)
        socket.addMembership('224.0.0.251')
      } catch {
        // membership may fail before permission is granted
      }
      try {
        const msg = Buffer.from('scaner-ip-lan-probe')
        socket.send(msg, 0, msg.length, 5353, '224.0.0.251')
        if (gateway) socket.send(msg, 0, msg.length, 5353, gateway)
      } catch {
        // ignore
      }
      setTimeout(() => {
        try { socket.close() } catch { /* ignore */ }
      }, 1500)
    })
  } catch {
    // ignore
  }

  if (gateway) {
    const probe = net.connect({ host: gateway, port: 80, timeout: 800 }, () => probe.destroy())
    probe.on('error', () => probe.destroy())
    probe.on('timeout', () => probe.destroy())
  }
}

function enrichDevice(row, context) {
  const isGateway = Boolean(context.gateway && row.ip === context.gateway)
  const isLocal = Boolean(context.primary?.address && row.ip === context.primary.address)
  const macVendor = vendorFromMac(row.mac)
  const vendor = resolveVendor(
    row.hostname,
    row.broadcastVendor || macVendor,
    row.friendlyName,
  )
  const rawServices = row.services || []
  const identityHost = row.friendlyName || row.hostname
  const services = decorateServices(rawServices, { vendor, hostname: identityHost })
  const type = guessDeviceType({
    ip: row.ip,
    vendor,
    hostname: row.hostname,
    friendlyName: row.friendlyName,
    isGateway,
    isLocal,
    services,
  })
  const identity = buildIdentity({
    vendor,
    hostname: row.hostname,
    friendlyName: row.friendlyName,
    services,
    isGateway,
    isLocal,
    type,
    mac: row.mac,
  })
  const model = row.broadcastModel || identity.model
  const name = displayName({
    hostname: row.hostname,
    friendlyName: row.friendlyName,
    vendor,
    ip: row.ip,
    isGateway,
    isLocal,
    model,
  })
  return {
    ...row,
    vendor,
    type,
    name,
    isGateway,
    isLocal,
    services,
    model,
    system: identity.system,
    role: identity.role,
    confidence: identity.confidence,
    evidence: identity.evidence,
    tags: identity.tags,
  }
}

ipcMain.handle('get-network-context', async () => {
  const ctx = await getNetworkContext()
  requestLocalNetworkAccess(ctx.gateway || ctx.primary?.address)
  return ctx
})

/** Open System Settings directly at Privacy → Local Network (Místní síť). */
async function openLocalNetworkSettings() {
  if (process.platform !== 'darwin') {
    return { success: false }
  }
  try {
    await execFileAsync('/usr/bin/open', [
      'x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?privacy_localnetwork',
    ])
    return { success: true }
  } catch {
    return { success: false }
  }
}

ipcMain.handle('open-local-network-settings', async () => openLocalNetworkSettings())

async function openLocationSettings() {
  if (process.platform !== 'darwin') return { success: false }
  try {
    await execFileAsync('open', [
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Location',
    ])
    return { success: true }
  } catch {
    try {
      await execFileAsync('open', [
        'x-apple.systempreferences:com.apple.Localization-Settings.extension?Privacy_Location',
      ])
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  }
}

ipcMain.handle('open-location-settings', async () => openLocationSettings())

/**
 * Požádej o polohu pro Scaner IP a znovu načti SSID přes CoreWLAN v procesu appky.
 * Oddělený ScanerSSID helper už nepoužíváme (zbytečná položka v TCC).
 */
ipcMain.handle('request-location-for-ssid', async (event) => {
  if (process.platform !== 'darwin') return { success: false }
  let geoOk = false
  try {
    const win = BrowserWindow.fromWebContents(event.sender) || getMainWindow()
    if (win && !win.isDestroyed()) {
      geoOk = Boolean(await win.webContents.executeJavaScript(`
        new Promise((resolve) => {
          if (!navigator.geolocation) return resolve(false)
          navigator.geolocation.getCurrentPosition(
            () => resolve(true),
            () => resolve(false),
            { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
          )
        })
      `, true))
    }
  } catch {
    // dialog mohl být odmítnut
  }

  // Po TCC grantu krátce počkej a zkus CoreWLAN přímo v tomto procesu.
  for (let i = 0; i < 6; i += 1) {
    const ssid = readWifiSsidInProcess()
    if (ssid) {
      const ctx = await getNetworkContext()
      ctx.ssid = ssid
      ctx.ssidMissing = false
      return { success: true, context: ctx, geoOk }
    }
    await new Promise((r) => setTimeout(r, 350))
  }

  const ctx = await getNetworkContext()
  return { success: Boolean(ctx.ssid), context: ctx, geoOk }
})

ipcMain.handle('open-device-detail', async (event, device) => {
  const parent = BrowserWindow.fromWebContents(event.sender)
  createDeviceWindow(device, parent)
  return { success: true }
})

ipcMain.handle('focus-main-tool', async (_event, payload = {}) => {
  const main = getMainWindow()
  if (!main) return { success: false }
  if (main.isMinimized()) main.restore()
  main.show()
  main.focus()
  main.webContents.send('open-tool', {
    tool: payload.tool || 'ping',
    ip: payload.ip || '',
  })
  return { success: true }
})

ipcMain.handle('broadcast-device-patch', async (event, patch) => {
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win.webContents.id === event.sender.id) continue
    win.webContents.send('device-patch', patch)
  }
  // Keep open detail windows in sync too when patch comes from main.
  if (patch?.ip && deviceWindows.has(patch.ip)) {
    const detail = deviceWindows.get(patch.ip)
    if (detail && !detail.isDestroyed() && detail.webContents.id !== event.sender.id) {
      detail.webContents.send('device-patch', patch)
    }
  }
  return { success: true }
})

ipcMain.handle('close-current-window', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) win.close()
  return { success: true }
})

ipcMain.handle('ping-host', async (_, address) => {
  const host = typeof address === 'string' ? address.trim() : ''
  if (!isValidHost(host)) {
    return { success: false, output: 'Neplatná adresa', timeMs: null }
  }
  return pingHost(host, 1000)
})

ipcMain.handle('probe-services', async (_, ip) => {
  if (!parseIpv4(ip)) return []
  return probeServices(ip)
})

async function debugLog(payload) {
  try {
    const line = `${new Date().toISOString()} ${JSON.stringify(payload)}\n`
    console.log('[scaner-debug]', line.trim())
    await appendFile('/tmp/scaner-debug.log', line)
  } catch {
    // ignore debug failures
  }
}

ipcMain.handle('scan-subnet', async (event, options = {}) => {
  const generation = ++scanGeneration
  const stopped = () => generation !== scanGeneration
  const startedAt = Date.now()

  try {
    const context = await getNetworkContext()
    if (!context.primary) {
      return { error: 'Nenalezena aktivní síťová karta' }
    }

    const startIp = options.startIp || null
    const endIp = options.endIp || null
    let hosts = []

    if (startIp && endIp) {
      const start = parseIpv4(startIp)
      const end = parseIpv4(endIp)
      if (!start || !end) throw new Error('Neplatný rozsah IP')
      if (start[0] !== end[0] || start[1] !== end[1] || start[2] !== end[2]) {
        throw new Error('Rozsah musí být ve stejné /24 podsíti')
      }
      if (start[3] > end[3]) throw new Error('Počáteční IP musí být menší než koncová')
      for (let i = start[3]; i <= end[3]; i++) {
        hosts.push(`${start[0]}.${start[1]}.${start[2]}.${i}`)
      }
    } else {
      hosts = subnetHosts(context.primary.address, context.primary.netmask)
    }

    if (hosts.length === 0) {
      return { error: 'V podsíti nejsou žádné hostitelské adresy' }
    }

    const seedArpProbe = await readArpTable()
    await debugLog({
      phase: 'start',
      path: process.env.PATH,
      binArp: BIN.arp,
      primary: context.primary,
      gateway: context.gateway,
      hosts: hosts.length,
      options,
      arpEntries: seedArpProbe.size,
      arpSample: [...seedArpProbe.entries()].slice(0, 8),
    })

    const resultsByIp = new Map()
    const missed = new Set()
    let completed = 0
    let totalWork = hosts.length

    const sortedDevices = () => [...resultsByIp.values()]
      .map((row) => enrichDevice(row, context))
      .sort((a, b) => {
        const rank = (d) => (d.isLocal ? 0 : d.isGateway ? 1 : 2)
        const byRank = rank(a) - rank(b)
        if (byRank !== 0) return byRank
        return a.ip.localeCompare(b.ip, undefined, { numeric: true })
      })

    const publish = (phase, currentIP) => {
      const devices = sortedDevices()
      event.sender.send('scan-update', {
        phase,
        currentIP,
        scanned: completed,
        total: totalWork,
        elapsedMs: Date.now() - startedAt,
        online: devices.length,
        seen: devices.length,
      })
      event.sender.send('scan-partial-results', devices)
    }

    const runPass = async (ips, timeoutMs, batchSize, phase) => {
      let pending = []
      const flush = async () => {
        if (!pending.length) return
        const batch = pending
        pending = []
        const rows = await Promise.all(batch)
        // Ping also populates ARP even when ICMP is blocked.
        await new Promise((r) => setTimeout(r, 40))
        const arp = await readArpTable()
        for (const row of rows) {
          completed += 1
          const mac = row.mac || arp.get(row.ip) || (
            context.primary?.address === row.ip
              ? (normalizeMac(context.primary.mac) || context.primary.mac)
              : null
          )
          if (row.online) {
            missed.delete(row.ip)
            resultsByIp.set(row.ip, { ...row, mac: mac || row.mac })
            continue
          }
          // ICMP failed, but ARP reply means the host is alive.
          if (mac) {
            missed.delete(row.ip)
            resultsByIp.set(row.ip, {
              ip: row.ip,
              online: true,
              hostname: null,
              mac,
              timeMs: null,
              services: [],
            })
            continue
          }
          missed.add(row.ip)
        }
        mergeArpDiscoveries(resultsByIp, hosts, arp, context)
        publish(phase, '')
      }

      for (const ip of ips) {
        if (stopped()) break
        event.sender.send('scan-update', {
          phase,
          currentIP: ip,
          scanned: completed,
          total: totalWork,
          elapsedMs: Date.now() - startedAt,
          online: resultsByIp.size,
          seen: resultsByIp.size,
        })
        pending.push((async () => {
          const ping = await pingHost(ip, timeoutMs)
          if (!ping.success) {
            return { ip, online: false, hostname: null, mac: null, timeMs: null, services: [] }
          }
          return {
            ip,
            online: true,
            hostname: null,
            mac: null,
            timeMs: ping.timeMs,
            services: [],
          }
        })())
        if (pending.length >= batchSize) await flush()
      }
      if (pending.length) await flush()
    }

    // Seed immediately from OS ARP cache (devices that block ICMP still appear).
    {
      mergeArpDiscoveries(resultsByIp, hosts, seedArpProbe, context)
      await debugLog({ phase: 'arp-seed', discovered: resultsByIp.size, ips: [...resultsByIp.keys()] })
      publish('ARP cache', '')
    }

    // ICMP sweep mainly to populate ARP for quiet hosts.
    await runPass(hosts, 350, 48, 'Rychlý sken')

    if (!stopped()) {
      const stillMissing = hosts.filter((ip) => !resultsByIp.has(ip))
      if (stillMissing.length) {
        totalWork = Math.max(totalWork, completed + stillMissing.length)
        publish('TCP sken', '')
        for (let i = 0; i < stillMissing.length; i += 32) {
          if (stopped()) break
          const chunk = stillMissing.slice(i, i + 32)
          const alive = await Promise.all(chunk.map(async (ip) => {
            completed += 1
            const ok = await tcpAlive(ip)
            return ok ? ip : null
          }))
          for (const ip of alive.filter(Boolean)) {
            resultsByIp.set(ip, {
              ip,
              online: true,
              hostname: null,
              mac: null,
              timeMs: null,
              services: [],
            })
          }
          const arp = await readArpTable()
          mergeArpDiscoveries(resultsByIp, hosts, arp, context)
          publish('TCP sken', '')
        }
      }
    }

    if (!stopped()) {
      await fillMissingMacs(resultsByIp, context.primary?.address, context.primary?.mac)
      const arp = await readArpTable()
      mergeArpDiscoveries(resultsByIp, hosts, arp, context)
      publish('ARP objev', '')
      await enrichHostnames(resultsByIp, context, {
        onProgress: (ip) => publish('Hostname', ip || ''),
      })
      publish('Hostname', '')
    }

    if (!stopped()) {
      const onlineIps = [...resultsByIp.keys()]
      const serviceBase = completed
      totalWork = serviceBase + onlineIps.length
      publish('Služby', '')
      for (let i = 0; i < onlineIps.length; i += 6) {
        if (stopped()) break
        const chunk = onlineIps.slice(i, i + 6)
        await Promise.all(chunk.map(async (ip) => {
          event.sender.send('scan-update', {
            phase: 'Služby',
            currentIP: ip,
            scanned: completed,
            total: totalWork,
            elapsedMs: Date.now() - startedAt,
            online: resultsByIp.size,
            seen: resultsByIp.size,
          })
          const services = await probeServices(ip)
          const prev = resultsByIp.get(ip)
          if (prev) resultsByIp.set(ip, { ...prev, services })
          completed += 1
        }))
        publish('Služby', '')
      }
      await fillMissingMacs(resultsByIp, context.primary?.address, context.primary?.mac)
      publish('Služby', '')
    }

    const devices = sortedDevices()
    const elapsedMs = Date.now() - startedAt
    await debugLog({
      phase: 'done',
      devices: devices.length,
      ips: devices.map((d) => d.ip),
      elapsedMs,
      stopped: stopped(),
    })
    event.sender.send('scan-update', {
      phase: '',
      currentIP: '',
      scanned: completed,
      total: totalWork,
      elapsedMs,
      online: devices.length,
      seen: devices.length,
    })

    return {
      devices,
      context,
      elapsedMs,
      scannedAt: new Date().toISOString(),
    }
  } catch (error) {
    await debugLog({ phase: 'error', error: error?.message, stack: error?.stack })
    event.sender.send('scan-update', { phase: '', currentIP: '', error: error.message })
    return { error: error.message }
  }
})

ipcMain.handle('stop-scan', () => {
  scanGeneration += 1
  return { success: true }
})

ipcMain.handle('export-csv', async (event, { filename, content }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = await dialog.showSaveDialog(win, {
    title: 'Uložit výsledky',
    defaultPath: filename || 'scaner-ip.csv',
    filters: [
      { name: 'CSV', extensions: ['csv'] },
      { name: 'Všechny soubory', extensions: ['*'] },
    ],
  })
  if (result.canceled || !result.filePath) return { canceled: true }
  await writeFile(result.filePath, content, 'utf8')
  return { canceled: false, filePath: result.filePath }
})

ipcMain.handle('copy-text', (_, text) => {
  clipboard.writeText(String(text || ''))
  return { success: true }
})

ipcMain.handle('open-url', async (_, url) => {
  const value = typeof url === 'string' ? url.trim() : ''
  if (!/^(https?|smb):\/\//i.test(value)) {
    return { success: false, error: 'Povoleny jsou jen http/https/smb odkazy' }
  }
  await shell.openExternal(value)
  return { success: true }
})

function macToBytes(mac) {
  const parts = String(mac || '').trim().split(/[:\-]/).filter(Boolean)
  if (parts.length !== 6) return null
  const bytes = parts.map((part) => Number.parseInt(part, 16))
  if (bytes.some((b) => Number.isNaN(b) || b < 0 || b > 255)) return null
  return bytes
}

function subnetBroadcast(ip, netmask) {
  const ipParts = parseIpv4(ip)
  const maskParts = parseIpv4(netmask)
  if (!ipParts || !maskParts) return null
  return intToIp(ipToInt(ipParts) | (~ipToInt(maskParts) >>> 0))
}

function sendMagicPacket(macBytes, targets) {
  const packet = Buffer.alloc(6 + 16 * 6)
  packet.fill(0xff, 0, 6)
  for (let i = 0; i < 16; i += 1) {
    for (let j = 0; j < 6; j += 1) packet[6 + i * 6 + j] = macBytes[j]
  }

  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    socket.once('error', (err) => {
      try { socket.close() } catch { /* ignore */ }
      reject(err)
    })
    socket.bind(() => {
      try {
        socket.setBroadcast(true)
      } catch {
        // některé prostředí broadcast nepovolí — zkusíme i tak
      }
      let pending = targets.length
      let lastError = null
      if (!pending) {
        try { socket.close() } catch { /* ignore */ }
        resolve({ sent: 0 })
        return
      }
      for (const host of targets) {
        socket.send(packet, 0, packet.length, 9, host, (err) => {
          if (err) lastError = err
          pending -= 1
          if (pending <= 0) {
            try { socket.close() } catch { /* ignore */ }
            if (lastError) reject(lastError)
            else resolve({ sent: targets.length })
          }
        })
      }
    })
  })
}

ipcMain.handle('wake-on-lan', async (_, payload = {}) => {
  const macBytes = macToBytes(payload.mac)
  if (!macBytes) return { success: false, error: 'Neplatná MAC adresa' }

  const targets = new Set(['255.255.255.255'])
  try {
    const ctx = await getNetworkContext()
    if (ctx?.primary?.address && ctx?.primary?.netmask) {
      const bcast = subnetBroadcast(ctx.primary.address, ctx.primary.netmask)
      if (bcast) targets.add(bcast)
    }
    if (payload.ip && parseIpv4(payload.ip)) targets.add(payload.ip)
  } catch {
    // stačí globální broadcast
  }

  await sendMagicPacket(macBytes, [...targets])
  return { success: true, targets: [...targets] }
})

ipcMain.handle('get-update-meta', () => getUpdateMeta())
ipcMain.handle('check-for-updates', () => checkForUpdatesManual())
ipcMain.handle('open-releases-page', () => openReleasesPage())

ipcMain.handle('refresh-device-status', async (_, ips = []) => {
  const list = (Array.isArray(ips) ? ips : [])
    .map((ip) => String(ip || '').trim())
    .filter((ip) => parseIpv4(ip))
    .slice(0, 256)

  const results = []
  for (let i = 0; i < list.length; i += 24) {
    const chunk = list.slice(i, i + 24)
    const part = await Promise.all(chunk.map(async (ip) => {
      const ping = await pingHost(ip, 800)
      return {
        ip,
        online: Boolean(ping.success),
        timeMs: ping.success ? ping.timeMs : null,
      }
    }))
    results.push(...part)
  }
  return { devices: results }
})

function stopTraceroute() {
  tracerouteGeneration += 1
  if (tracerouteProc) {
    try { tracerouteProc.kill('SIGTERM') } catch { /* ignore */ }
    tracerouteProc = null
  }
}

ipcMain.handle('stop-traceroute', () => {
  stopTraceroute()
  return { success: true }
})

ipcMain.handle('traceroute-host', async (event, address) => {
  const host = typeof address === 'string' ? address.trim() : ''
  if (!isValidHost(host)) {
    return { success: false, error: 'Neplatná adresa' }
  }

  stopTraceroute()
  const generation = tracerouteGeneration
  const command = BIN.traceroute
  const args = process.platform === 'win32'
    ? ['-d', '-h', '20', '-w', '1000', host]
    : ['-n', '-w', '1', '-q', '1', '-m', '20', host]

  return await new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true })
    tracerouteProc = child
    let buffer = ''
    let settled = false

    const finish = (payload) => {
      if (settled) return
      settled = true
      if (tracerouteProc === child) tracerouteProc = null
      resolve(payload)
    }

    const emitLines = (chunk) => {
      buffer += chunk
      const parts = buffer.split(/\r?\n/)
      buffer = parts.pop() || ''
      for (const line of parts) {
        const text = line.trimEnd()
        if (!text) continue
        event.sender.send('traceroute-line', { line: text, done: false })
      }
    }

    child.stdout.on('data', (data) => emitLines(data.toString()))
    child.stderr.on('data', (data) => emitLines(data.toString()))
    child.on('error', (error) => {
      event.sender.send('traceroute-line', { line: error.message, done: true, error: true })
      finish({ success: false, error: error.message })
    })
    child.on('close', (code) => {
      if (buffer.trim()) {
        event.sender.send('traceroute-line', { line: buffer.trim(), done: false })
        buffer = ''
      }
      const cancelled = generation !== tracerouteGeneration
      event.sender.send('traceroute-line', { line: '', done: true, cancelled, code })
      finish({ success: !cancelled && code === 0, cancelled, code })
    })
  })
})

function mbps(bytes, ms) {
  if (!ms || ms <= 0) return 0
  return Math.round(((bytes * 8) / (ms / 1000) / 1_000_000) * 10) / 10
}

const SPEED_HOST = 'speed.cloudflare.com'
const SPEED_DOWN_CHUNK = 25_000_000
const SPEED_UP_CHUNK = 12_000_000
const SPEED_PARALLEL = 4
const SPEED_DURATION_MS = 8_000
const SPEED_WINDOW_MS = 2_000
const SPEED_PING_SAMPLES = 6

/** Cloudflare PoP kódy → čitelné město (výběr běžných EU/US). */
const CF_COLO_CITIES = {
  PRG: 'Praha',
  VIE: 'Vídeň',
  FRA: 'Frankfurt',
  AMS: 'Amsterdam',
  WAW: 'Varšava',
  BUD: 'Budapešť',
  LHR: 'Londýn',
  CDG: 'Paříž',
  MXP: 'Milán',
  ARN: 'Stockholm',
  CPH: 'Kodaň',
  ZRH: 'Curych',
  MAD: 'Madrid',
  LIS: 'Lisabon',
  DUB: 'Dublin',
  EWR: 'Newark',
  IAD: 'Ashburn',
  ORD: 'Chicago',
  LAX: 'Los Angeles',
  SJC: 'San Jose',
  SEA: 'Seattle',
  ATL: 'Atlanta',
  DFW: 'Dallas',
  MIA: 'Miami',
  NRT: 'Tokio',
  SIN: 'Singapur',
  SYD: 'Sydney',
}

async function lookupAsnName(asn) {
  const id = String(asn || '').replace(/^AS/i, '').trim()
  if (!/^\d+$/.test(id)) return null
  try {
    const rows = await dnsPromises.resolveTxt(`AS${id}.asn.cymru.com`)
    const text = rows.flat().join(' ')
    // "5610 | CZ | ripencc | 1996-04-25 | O2-CZECH-REPUBLIC - O2 Czech Republic, a.s., CZ"
    const parts = text.split('|').map((p) => p.trim())
    const org = parts[4] || parts[parts.length - 1] || null
    if (!org) return null
    // Prefer readable name after " - " when present
    const dash = org.indexOf(' - ')
    return dash >= 0 ? org.slice(dash + 3).trim() : org
  } catch {
    return null
  }
}

const speedAgent = new https.Agent({
  keepAlive: true,
  maxSockets: SPEED_PARALLEL + 2,
  maxFreeSockets: SPEED_PARALLEL + 2,
})

function speedRequestOptions(extra = {}) {
  const { headers: extraHeaders, ...rest } = extra
  return {
    hostname: SPEED_HOST,
    servername: SPEED_HOST,
    agent: speedAgent,
    timeout: 60_000,
    rejectUnauthorized: true,
    headers: {
      'User-Agent': 'ScanerIP/1.0',
      ...(extraHeaders || {}),
    },
    ...rest,
  }
}

/** Klient (ISP, IP) + server (Cloudflare PoP, remote IP) — vzor Speedtest.net. */
function fetchSpeedConnectionInfo() {
  return new Promise((resolve, reject) => {
    const req = https.request(
      speedRequestOptions({
        method: 'GET',
        path: '/__down?bytes=1000',
      }),
      (res) => {
        const headers = res.headers || {}
        const serverIp = res.socket?.remoteAddress || null
        const clientIp = headers['cf-meta-ip'] || null
        const asn = headers.asn || headers['cf-meta-asn'] || null
        const colo = headers.colo || headers['cf-meta-colo'] || null
        const city = headers.city || headers['cf-meta-city'] || null
        const country = headers.country || headers['cf-meta-country'] || null
        res.resume()
        res.on('end', () => {
          resolve({
            clientIp: clientIp ? String(clientIp) : null,
            asn: asn ? String(asn).replace(/^AS/i, '') : null,
            clientCity: city ? String(city) : null,
            clientCountry: country ? String(country) : null,
            serverHost: SPEED_HOST,
            serverIp: serverIp ? String(serverIp).replace(/^::ffff:/, '') : null,
            serverColo: colo ? String(colo) : null,
            serverName: colo
              ? `Cloudflare ${CF_COLO_CITIES[colo] || colo}`
              : 'Cloudflare',
            provider: null,
          })
        })
        res.on('error', reject)
      },
    )
    req.on('timeout', () => req.destroy(new Error('Meta timeout')))
    req.on('error', reject)
    req.end()
  })
}

async function enrichSpeedConnectionInfo(base) {
  const info = { ...(base || {}) }
  if (info.asn) {
    const name = await lookupAsnName(info.asn)
    info.provider = name || `AS${info.asn}`
  } else {
    info.provider = null
  }
  return info
}

/** Klouzavé okno bytů → aktuální Mbps (bez slow-start zkreslení). */
function createSpeedWindow(windowMs = SPEED_WINDOW_MS) {
  const samples = []
  let totalBytes = 0

  return {
    add(delta, now = Date.now()) {
      totalBytes += delta
      samples.push({ t: now, bytes: delta })
      const cutoff = now - windowMs
      while (samples.length > 1 && samples[0].t < cutoff) samples.shift()
      const first = samples[0]
      const elapsed = Math.max(1, now - first.t)
      const windowBytes = samples.reduce((sum, s) => sum + s.bytes, 0)
      // Dokud okno není naplněné, ber celkový průměr od startu okna.
      return {
        liveMbps: mbps(windowBytes, elapsed),
        totalBytes,
      }
    },
    /** Finální Mbps = medián živých vzorků z druhé poloviny měření. */
    finalize(liveHistory) {
      const usable = (liveHistory || []).filter((v) => Number.isFinite(v) && v > 0)
      if (usable.length >= 3) {
        const slice = usable.slice(Math.floor(usable.length / 2))
        const sorted = [...slice].sort((a, b) => a - b)
        return sorted[Math.floor(sorted.length / 2)]
      }
      if (usable.length) return usable[usable.length - 1]
      return 0
    },
  }
}

function median(values) {
  if (!values?.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function meanJitter(values) {
  if (!values || values.length < 2) return null
  let sum = 0
  for (let i = 1; i < values.length; i += 1) {
    sum += Math.abs(values[i] - values[i - 1])
  }
  return Math.round((sum / (values.length - 1)) * 10) / 10
}

/** Download one Cloudflare payload; timing starts at first response byte (bez TLS/DNS). */
function cfDownload(bytes, { onChunk, shouldAbort } = {}) {
  return new Promise((resolve, reject) => {
    let received = 0
    let firstByteAt = 0
    let done = false
    const finish = (aborted) => {
      if (done) return
      done = true
      resolve({
        bytes: received,
        ms: firstByteAt ? Date.now() - firstByteAt : 0,
        aborted,
      })
    }
    const req = https.request(
      speedRequestOptions({
        method: 'GET',
        path: `/__down?bytes=${bytes}`,
      }),
      (res) => {
        if ((res.statusCode || 0) >= 400) {
          res.resume()
          reject(new Error(`Download HTTP ${res.statusCode}`))
          return
        }
        res.on('data', (chunk) => {
          if (done) return
          if (shouldAbort?.()) {
            req.destroy()
            res.destroy()
            finish(true)
            return
          }
          if (!firstByteAt) firstByteAt = Date.now()
          received += chunk.length
          onChunk?.(chunk.length, received, Date.now() - firstByteAt)
        })
        res.on('end', () => finish(false))
        res.on('error', (err) => {
          if (shouldAbort?.()) finish(true)
          else reject(err)
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error('Download timeout')))
    req.on('error', (err) => {
      if (shouldAbort?.()) finish(true)
      else if (!done) reject(err)
    })
    req.end()
  })
}

/**
 * Upload s chunkovaným zápisem + drain — měří reálné odesílání, ne jen naplnění Node bufferu.
 * Čas běží od prvního zápisu (po navázání socketu).
 */
function cfUpload(bytes, { onChunk, shouldAbort } = {}) {
  return new Promise((resolve, reject) => {
    const chunkSize = 256 * 1024
    const chunk = Buffer.alloc(chunkSize, 1)
    let sent = 0
    let startedAt = 0
    let finished = false

    const finish = (aborted = false) => {
      if (finished) return
      finished = true
      resolve({
        bytes: sent,
        ms: startedAt ? Date.now() - startedAt : 0,
        aborted,
      })
    }

    const req = https.request(
      speedRequestOptions({
        method: 'POST',
        path: '/__up',
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': bytes,
        },
      }),
      (res) => {
        res.resume()
        res.on('end', () => finish(false))
        res.on('error', reject)
      },
    )
    req.on('timeout', () => req.destroy(new Error('Upload timeout')))
    req.on('error', (err) => {
      if (shouldAbort?.()) finish(true)
      else if (!finished) reject(err)
    })

    const writeMore = () => {
      if (finished) return
      if (shouldAbort?.()) {
        req.destroy()
        finish(true)
        return
      }
      while (sent < bytes) {
        if (!startedAt) startedAt = Date.now()
        const size = Math.min(chunkSize, bytes - sent)
        const ok = req.write(size === chunkSize ? chunk : chunk.subarray(0, size))
        sent += size
        onChunk?.(size, sent, Date.now() - startedAt)
        if (!ok) {
          req.once('drain', writeMore)
          return
        }
        if (shouldAbort?.()) {
          req.destroy()
          finish(true)
          return
        }
      }
      req.end()
    }
    writeMore()
  })
}

async function measureHttpPing(shouldAbort, onSample) {
  // Warm-up TLS/session, pak více krátkých requestů — medián + jitter.
  await cfDownload(1_000, { shouldAbort })
  const samples = []
  for (let i = 0; i < SPEED_PING_SAMPLES; i += 1) {
    if (shouldAbort()) break
    const started = Date.now()
    await cfDownload(1_000, { shouldAbort })
    const ms = Date.now() - started
    samples.push(ms)
    onSample?.(ms, samples.length, SPEED_PING_SAMPLES)
  }
  if (!samples.length) return { pingMs: null, jitterMs: null, samples }
  return {
    pingMs: median(samples),
    jitterMs: meanJitter(samples),
    samples,
  }
}

async function measureThroughput({
  direction,
  parallel,
  chunkBytes,
  durationMs,
  onProgress,
  shouldAbort,
}) {
  let wallStart = 0
  let stop = false
  let totalBytes = 0
  const window = createSpeedWindow()
  const liveHistory = []
  let lastEmit = 0

  const note = (delta) => {
    const now = Date.now()
    if (!wallStart) wallStart = now
    const snap = window.add(delta, now)
    totalBytes = snap.totalBytes
    const elapsed = now - wallStart
    if (elapsed >= durationMs) stop = true
    // vzorkuj živé Mbps ~8×/s do historie + UI
    if (now - lastEmit >= 120 || stop) {
      lastEmit = now
      liveHistory.push(snap.liveMbps)
      onProgress?.({
        bytes: totalBytes,
        ms: elapsed,
        liveMbps: snap.liveMbps,
        overallMbps: mbps(totalBytes, elapsed),
      })
    }
  }

  const runStream = async () => {
    while (!stop && !shouldAbort()) {
      const transfer =
        direction === 'download'
          ? await cfDownload(chunkBytes, {
              shouldAbort: () => stop || shouldAbort(),
              onChunk: (delta) => note(delta),
            })
          : await cfUpload(chunkBytes, {
              shouldAbort: () => stop || shouldAbort(),
              onChunk: (delta) => note(delta),
            })
      if (transfer.aborted || shouldAbort()) break
      if (!wallStart) wallStart = Date.now()
      if (Date.now() - wallStart >= durationMs) {
        stop = true
        break
      }
    }
  }

  await Promise.all(Array.from({ length: parallel }, () => runStream()))
  const elapsed = wallStart ? Date.now() - wallStart : 0
  const finalMbps = window.finalize(liveHistory)
  return {
    bytes: totalBytes,
    ms: elapsed,
    mbps: finalMbps || (liveHistory[liveHistory.length - 1] ?? 0),
    liveHistory,
  }
}

ipcMain.handle('stop-speed-test', () => {
  speedTestGeneration += 1
  return { success: true }
})

ipcMain.handle('speed-test', async (event) => {
  const generation = ++speedTestGeneration
  const cancelled = () => generation !== speedTestGeneration
  let connection = null
  const emit = (payload) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('speed-test-update', {
        connection,
        ...payload,
      })
    }
  }

  try {
    emit({
      phase: 'ping',
      downloadMbps: null,
      uploadMbps: null,
      pingMs: null,
      jitterMs: null,
      liveMbps: null,
      progress: 0.02,
    })

    try {
      const raw = await fetchSpeedConnectionInfo()
      connection = await enrichSpeedConnectionInfo(raw)
      emit({
        phase: 'ping',
        downloadMbps: null,
        uploadMbps: null,
        pingMs: null,
        jitterMs: null,
        liveMbps: null,
        progress: 0.05,
      })
    } catch {
      connection = {
        serverHost: SPEED_HOST,
        serverName: 'Cloudflare',
        provider: null,
      }
    }
    if (cancelled()) return { cancelled: true }

    const pingResult = await measureHttpPing(cancelled, (ms, index, total) => {
      emit({
        phase: 'ping',
        downloadMbps: null,
        uploadMbps: null,
        pingMs: ms,
        jitterMs: null,
        liveMbps: null,
        progress: 0.05 + (index / total) * 0.1,
      })
    })
    if (cancelled()) return { cancelled: true }
    const { pingMs, jitterMs } = pingResult
    emit({
      phase: 'download',
      downloadMbps: null,
      uploadMbps: null,
      pingMs,
      jitterMs,
      liveMbps: null,
      progress: 0.16,
    })

    // Warm-up: jedna krátká streama, ať se nepočítá cold-start do výsledku.
    await cfDownload(2_000_000, { shouldAbort: cancelled })
    if (cancelled()) return { cancelled: true }

    const down = await measureThroughput({
      direction: 'download',
      parallel: SPEED_PARALLEL,
      chunkBytes: SPEED_DOWN_CHUNK,
      durationMs: SPEED_DURATION_MS,
      shouldAbort: cancelled,
      onProgress: ({ liveMbps, ms }) => {
        emit({
          phase: 'download',
          downloadMbps: liveMbps,
          uploadMbps: null,
          pingMs,
          jitterMs,
          liveMbps,
          progress: 0.18 + Math.min(0.38, (ms / SPEED_DURATION_MS) * 0.38),
        })
      },
    })
    if (cancelled()) return { cancelled: true }
    const downloadMbps = down.mbps
    emit({
      phase: 'upload',
      downloadMbps,
      uploadMbps: null,
      pingMs,
      jitterMs,
      liveMbps: null,
      progress: 0.58,
    })

    await cfUpload(1_000_000, { shouldAbort: cancelled })
    if (cancelled()) return { cancelled: true }

    const up = await measureThroughput({
      direction: 'upload',
      parallel: SPEED_PARALLEL,
      chunkBytes: SPEED_UP_CHUNK,
      durationMs: SPEED_DURATION_MS,
      shouldAbort: cancelled,
      onProgress: ({ liveMbps, ms }) => {
        emit({
          phase: 'upload',
          downloadMbps,
          uploadMbps: liveMbps,
          pingMs,
          jitterMs,
          liveMbps,
          progress: 0.6 + Math.min(0.35, (ms / SPEED_DURATION_MS) * 0.35),
        })
      },
    })
    if (cancelled()) return { cancelled: true }

    const result = {
      phase: 'done',
      downloadMbps,
      uploadMbps: up.mbps,
      pingMs,
      jitterMs,
      liveMbps: null,
      progress: 1,
      success: true,
      connection,
      parallel: SPEED_PARALLEL,
      durationMs: SPEED_DURATION_MS,
    }
    emit(result)
    return result
  } catch (error) {
    const payload = {
      phase: 'error',
      error: error.message,
      progress: 1,
      success: false,
      connection,
    }
    emit(payload)
    return payload
  }
})

// Ensure common system paths exist even when launched from Finder/IDE.
if (process.platform !== 'win32') {
  const extras = ['/usr/sbin', '/sbin', '/usr/bin', '/bin']
  const parts = String(process.env.PATH || '').split(':').filter(Boolean)
  process.env.PATH = [...new Set([...extras, ...parts])].join(':')
}

app.whenReady().then(async () => {
  try { app.setName('Scaner IP') } catch { /* ignore */ }
  if (process.platform === 'darwin' && appIcon && app.dock) {
    try { app.dock.setIcon(appIcon) } catch { /* ignore */ }
  }

  // Geolocation → macOS Polohové služby → odemkne SSID přes CoreWLAN/helper.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'geolocation') callback(true)
    else callback(false)
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => (
    permission === 'geolocation'
  ))

  createWindow()
  setupAutoUpdater()
  scheduleUpdateCheck(5000)
  // Ask for Local Network as soon as UI is up.
  setTimeout(async () => {
    try {
      const ctx = await getNetworkContext()
      requestLocalNetworkAccess(ctx.gateway || ctx.primary?.address)
      if (ctx.lanBlocked) {
        const win = BrowserWindow.getAllWindows()[0]
        const result = await dialog.showMessageBox(win || null, {
          type: 'warning',
          buttons: ['Otevřít nastavení', 'OK'],
          defaultId: 0,
          cancelId: 1,
          title: 'Přístup k místní síti',
          message: 'macOS zatím nepovolil Scaner IP v místní síti',
          detail: 'V Nastavení → Soukromí a zabezpečení → Místní síť zapni „Scaner IP“ (nebo Electron). Pokud položka chybí, nech app chvíli běžet po startu — měl by vyskočit systémový dialog. Pak aplikaci restartuj.',
        })
        if (result.response === 0) {
          await openLocalNetworkSettings()
        }
      }
    } catch {
      // ignore
    }
  }, 1200)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
