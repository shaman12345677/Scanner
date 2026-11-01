import { existsSync, readdirSync } from 'fs'
import { execFileSync } from 'child_process'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const electronBinary = require('electron')
const appRoot = path.resolve(path.dirname(electronBinary), '..')
const mainPlist = path.join(appRoot, 'Info.plist')

if (!existsSync(mainPlist)) {
  console.warn('Electron Info.plist nenalezen:', mainPlist)
  process.exit(0)
}

const desc =
  'Scaner IP potřebuje přístup k místní síti, aby našel zařízení, MAC adresy a otevřené služby.'
const locationDesc =
  'Scaner IP potřebuje přístup k poloze jen proto, aby na macOS mohl zobrazit název Wi‑Fi sítě, ke které jsi připojený.'
const bonjourJson = '["_http._tcp.","_ssh._tcp.","_services._dns-sd._udp."]'

function setString(plist, key, value) {
  try {
    execFileSync('plutil', ['-replace', key, '-string', value, plist], { stdio: 'pipe' })
  } catch {
    execFileSync('plutil', ['-insert', key, '-string', value, plist], { stdio: 'pipe' })
  }
}

function setBonjour(plist) {
  try {
    execFileSync('plutil', ['-remove', 'NSBonjourServices', plist], { stdio: 'pipe' })
  } catch {
    // ignore
  }
  execFileSync('plutil', ['-insert', 'NSBonjourServices', '-json', bonjourJson, plist], {
    stdio: 'pipe',
  })
}

function patchPlist(plist, { rename = false } = {}) {
  if (!existsSync(plist)) return
  setString(plist, 'NSLocalNetworkUsageDescription', desc)
  setString(plist, 'NSLocationWhenInUseUsageDescription', locationDesc)
  setString(plist, 'NSLocationUsageDescription', locationDesc)
  setBonjour(plist)
  if (rename) {
    setString(plist, 'CFBundleName', 'Scaner IP')
    setString(plist, 'CFBundleDisplayName', 'Scaner IP')
  }
}

patchPlist(mainPlist, { rename: true })

// Without the usage description on helpers, macOS can silently deny LAN and
// never list the app under Privacy → Local Network.
const frameworks = path.join(appRoot, 'Frameworks')
if (existsSync(frameworks)) {
  for (const entry of readdirSync(frameworks)) {
    if (!entry.includes('Helper')) continue
    const helperPlist = path.join(frameworks, entry, 'Contents', 'Info.plist')
    patchPlist(helperPlist)
  }
}

console.log('Patched Electron Info.plist (+ helpers):', mainPlist)
