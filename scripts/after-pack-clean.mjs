import { execFileSync } from 'child_process'

/** Odstraní Finder xattr / resource fork, jinak codesign padá. */
export default async function afterPack(context) {
  const appOutDir = context.appOutDir
  try {
    execFileSync('xattr', ['-cr', appOutDir], { stdio: 'ignore' })
  } catch {
    // ignore
  }
}
