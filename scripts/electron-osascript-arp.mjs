import { app } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFileSync } from 'fs'

const execFileAsync = promisify(execFile)

app.whenReady().then(async () => {
  const out = {}
  try {
    const { stdout } = await execFileAsync('/usr/sbin/arp', ['-an'], { timeout: 4000 })
    out.direct = { len: stdout.length, lines: stdout.split('\n').filter(Boolean).length }
  } catch (e) {
    out.direct = { error: e.message }
  }

  try {
    const { stdout } = await execFileAsync('/usr/bin/osascript', [
      '-e',
      'do shell script "/usr/sbin/arp -an"',
    ], { timeout: 8000 })
    out.osascript = { len: stdout.length, lines: stdout.split('\n').filter(Boolean).length, head: stdout.slice(0, 200) }
  } catch (e) {
    out.osascript = { error: e.message, stdout: e.stdout?.toString?.()?.slice?.(0, 200) }
  }

  try {
    const { stdout } = await execFileAsync('/bin/zsh', ['-lc', '/usr/sbin/arp -an | wc -l'], { timeout: 4000 })
    out.zsh = stdout.trim()
  } catch (e) {
    out.zsh = e.message
  }

  writeFileSync('/tmp/scaner-arp-bypass.json', JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 2))
  app.quit()
})
