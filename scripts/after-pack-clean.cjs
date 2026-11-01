const { execFileSync } = require('child_process')
const path = require('path')
const fs = require('fs')

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    let st
    try {
      st = fs.lstatSync(full)
    } catch {
      continue
    }
    if (st.isSymbolicLink()) continue
    if (st.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function strip(file) {
  try {
    execFileSync('xattr', ['-c', file], { stdio: 'ignore' })
  } catch { /* ignore */ }
  for (const attr of ['com.apple.provenance', 'com.apple.FinderInfo', 'com.apple.ResourceFork', 'com.apple.quarantine']) {
    try {
      execFileSync('xattr', ['-d', attr, file], { stdio: 'ignore' })
    } catch { /* ignore */ }
  }
}

function clean(dir) {
  if (!dir || !fs.existsSync(dir)) return
  try {
    execFileSync('xattr', ['-cr', dir], { stdio: 'ignore' })
  } catch { /* ignore */ }
  try {
    execFileSync('dot_clean', ['-m', dir], { stdio: 'ignore' })
  } catch { /* ignore */ }
  for (const file of walk(dir)) strip(file)
}

exports.default = async function afterPack(context) {
  const appOutDir = context.appOutDir
  console.log('afterPack clean xattrs:', appOutDir)
  clean(appOutDir)
  clean(path.join(appOutDir, `${context.packager.appInfo.productFilename}.app`))
}
