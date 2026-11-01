import { spawn, execFileSync } from 'child_process'
import { setTimeout as sleep } from 'timers/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const PORT = 5174
const URL = `http://127.0.0.1:${PORT}/` // Vite je nastavené na IPv4 host
const __dirname = path.dirname(fileURLToPath(import.meta.url))

try {
  execFileSync(process.execPath, [path.join(__dirname, 'patch-electron-plist.mjs')], { stdio: 'inherit' })
} catch (error) {
  console.warn('Patch Electron plist selhal:', error.message)
}

async function waitForVite(attempts = 80) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(URL, { redirect: 'manual' })
      if (res.status > 0) return
    } catch {
      // still starting
    }
    await sleep(250)
  }
  throw new Error(`Vite na ${URL} nenaběhl`)
}

const vite = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env },
})

try {
  await waitForVite()
} catch (error) {
  vite.kill()
  console.error(error.message)
  process.exit(1)
}

const electron = spawn('npm', ['run', 'electron'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    NODE_ENV: 'development',
    VITE_DEV_SERVER_URL: `http://127.0.0.1:${PORT}`,
  },
})

const shutdown = () => {
  electron.kill()
  vite.kill()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

electron.on('exit', () => {
  vite.kill()
  process.exit(0)
})
