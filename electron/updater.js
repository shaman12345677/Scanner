import { app, dialog, shell } from 'electron'
import electronUpdater from 'electron-updater'
import electronLog from 'electron-log'

const { autoUpdater } = electronUpdater

const RELEASES_URL = 'https://github.com/shaman12345677/Scanner/releases'
const RELEASES_LATEST_URL = `${RELEASES_URL}/latest`

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true
autoUpdater.logger = electronLog
autoUpdater.logger.transports.file.level = 'info'
autoUpdater.logger.transports.console.level = 'info'

let configured = false
let manualCheck = false

function isPackaged() {
  return app.isPackaged
}

/** Kontrola nové verze (mac + win). */
function updateCheckSupported() {
  return isPackaged()
}

/** Automatické stažení a instalace (jen macOS s podpisem). */
function autoInstallSupported() {
  return isPackaged() && process.platform === 'darwin'
}

function openDownloadPage(version) {
  const url = version
    ? `https://github.com/shaman12345677/Scanner/releases/tag/v${version}`
    : RELEASES_LATEST_URL
  return shell.openExternal(url)
}

export function setupAutoUpdater() {
  if (configured) return
  configured = true

  if (!isPackaged()) {
    console.log('[updater] Přeskočeno — app není zabalená (dev).')
    return
  }

  autoUpdater.on('update-available', (info) => {
    const version = info?.version || '?'

    if (autoInstallSupported()) {
      dialog
        .showMessageBox({
          type: 'info',
          title: 'Dostupná aktualizace',
          message: `Je dostupná nová verze ${version}.`,
          detail: 'Chcete ji stáhnout a nainstalovat? Po stažení se aplikace restartuje.',
          buttons: ['Ano', 'Ne'],
          defaultId: 0,
          cancelId: 1,
        })
        .then((result) => {
          if (result.response === 0) autoUpdater.downloadUpdate()
        })
        .finally(() => {
          manualCheck = false
        })
      return
    }

    // Windows (a jiné): jen info + odkaz na Releases
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Dostupná aktualizace',
        message: `Je dostupná nová verze ${version}.`,
        detail:
          'Automatická instalace na Windows není k dispozici (chybí podpis).\n\nOtevři stránku se stažením a nainstaluj novou verzi ručně.',
        buttons: ['Otevřít stahování', 'Později'],
        defaultId: 0,
        cancelId: 1,
      })
      .then((result) => {
        if (result.response === 0) openDownloadPage(version)
      })
      .finally(() => {
        manualCheck = false
      })
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[updater] Žádná novější verze.')
    if (manualCheck) {
      manualCheck = false
      dialog.showMessageBox({
        type: 'info',
        title: 'Aktualizace',
        message: 'Máš nejnovější verzi.',
        detail: `Aktuální verze: ${app.getVersion()}`,
        buttons: ['OK'],
      })
    }
  })

  autoUpdater.on('update-downloaded', () => {
    if (!autoInstallSupported()) return
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Aktualizace připravena',
        message: 'Aktualizace byla stažena.',
        detail: 'Aplikace se teď restartuje a nainstaluje novou verzi.',
        buttons: ['OK'],
      })
      .then(() => {
        autoUpdater.quitAndInstall()
      })
  })

  autoUpdater.on('download-progress', (progress) => {
    console.log('[updater] Stahování:', Math.round(progress.percent), '%')
  })

  autoUpdater.on('error', (err) => {
    console.error('[updater] Chyba:', err)
    manualCheck = false
    dialog.showErrorBox(
      'Chyba aktualizace',
      `Nepodařilo se zkontrolovat aktualizace.\n\n${err.message || err}`,
    )
  })
}

/** Tichá kontrola po startu (packaged mac + win). */
export function scheduleUpdateCheck(delayMs = 5000) {
  if (!updateCheckSupported()) return
  setTimeout(() => {
    manualCheck = false
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] checkForUpdates:', err)
    })
  }, delayMs)
}

/** Ruční kontrola z Nastavení. */
export async function checkForUpdatesManual() {
  if (!isPackaged()) {
    return {
      ok: false,
      message: 'Kontrola aktualizací funguje jen v nainstalované (buildnuté) aplikaci.',
    }
  }

  manualCheck = true
  try {
    await autoUpdater.checkForUpdates()
    return { ok: true }
  } catch (err) {
    manualCheck = false
    const message = err?.message || String(err)
    return { ok: false, message }
  }
}

export function openReleasesPage() {
  return shell.openExternal(RELEASES_URL)
}

export function getUpdateMeta() {
  return {
    version: app.getVersion(),
    packaged: isPackaged(),
    platform: process.platform,
    updateCheckEnabled: updateCheckSupported(),
    autoInstallEnabled: autoInstallSupported(),
    autoUpdateEnabled: autoInstallSupported(),
    releasesUrl: RELEASES_URL,
  }
}
