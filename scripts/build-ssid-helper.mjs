import { execFileSync } from 'child_process'
import { existsSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const helpers = path.join(root, 'electron', 'helpers')
const source = path.join(helpers, 'ssid-lib.swift')
const dylib = path.join(helpers, 'libscanerssid.dylib')

if (!existsSync(source)) {
  console.warn('SSID lib source chybí:', source)
  process.exit(0)
}

mkdirSync(helpers, { recursive: true })

execFileSync('swiftc', [
  '-emit-library',
  '-o', dylib,
  source,
  '-framework', 'CoreWLAN',
  '-module-name', 'ScanerSSID',
], { stdio: 'inherit' })

console.log('SSID dylib ready:', dylib)
