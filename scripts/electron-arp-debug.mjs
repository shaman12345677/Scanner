import { app } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFileSync } from 'fs'
import { createConnection } from 'net'
import { networkInterfaces } from 'os'

const execFileAsync = promisify(execFile)

function probe(ip, port, timeoutMs = 300) {
  return new Promise((resolve) => {
    const socket = createConnection({ host: ip, port })
    const done = (ok) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done(true))
    socket.once('timeout', () => done(false))
    socket.once('error', () => done(false))
  })
}

app.whenReady().then(async () => {
  const info = {
    path: process.env.PATH,
    ifaces: networkInterfaces(),
  }

  try {
    const { stdout, stderr } = await execFileAsync('/usr/sbin/arp', ['-an'], { timeout: 4000 })
    info.arp = {
      stdoutLen: stdout.length,
      stderrLen: (stderr || '').length,
      stdoutHead: stdout.slice(0, 500),
      lineCount: stdout.split('\n').filter(Boolean).length,
    }
  } catch (error) {
    info.arp = { error: error.message, stdout: error.stdout?.toString?.() }
  }

  // TCP discovery test against known hosts
  const ips = []
  for (let i = 1; i < 255; i += 1) ips.push(`10.0.2.${i}`)
  const found = []
  for (let i = 0; i < ips.length; i += 40) {
    const chunk = ips.slice(i, i + 40)
    const hits = await Promise.all(chunk.map(async (ip) => {
      const ports = [80, 443, 445, 22, 8080, 5000, 53]
      for (const port of ports) {
        if (await probe(ip, port, 200)) return ip
      }
      return null
    }))
    found.push(...hits.filter(Boolean))
  }
  info.tcpFound = found

  // ping via /sbin/ping
  const pingOk = []
  for (const ip of ['10.0.2.1', '10.0.2.12', '10.0.2.24', '10.0.2.200']) {
    try {
      await execFileAsync('/sbin/ping', ['-c', '1', '-W', '400', ip], { timeout: 2000 })
      pingOk.push(ip)
    } catch {
      // fail
    }
  }
  info.pingOk = pingOk

  writeFileSync('/tmp/scaner-arp-debug.json', JSON.stringify(info, null, 2))
  console.log(JSON.stringify(info, null, 2))
  app.quit()
})
