import { app, dialog, shell } from 'electron'
import electronUpdater from 'electron-updater'
import electronLog from 'electron-log'

const { autoUpdater } = electronUpdater

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

function updatesSupported() {
  return isPackaged() && process.platform !== 'win32'
}

export function setupAutoUpdater() {
  if (configured) return
  configured = true

  if (!isPackaged()) {
    console.log('[updater] Přeskočeno — app není zabalená (dev).')
    return
  }

  if (process.platform === 'win32') {
    console.log('[updater] Windows: auto-update vypnuto (chybí podpis).')
    return
  }

  autoUpdater.on('update-available', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Dostupná aktualizace',
        message: `Je dostupná nová verze ${info.version}.`,
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
      `Nepodařilo se zkontrolovat nebo stáhnout aktualizaci.\n\n${err.message || err}`,
    )
  })
}

/** Tichá kontrola po startu (jen macOS packaged). */
export function scheduleUpdateCheck(delayMs = 5000) {
  if (!updatesSupported()) return
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
  if (process.platform === 'win32') {
    return {
      ok: false,
      message: 'Autoaktualizace je na Windows vypnutá. Stáhni release z GitHubu.',
      downloadUrl: 'https://github.com/shaman12345677/Scanner/releases',
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
  return shell.openExternal('https://github.com/shaman12345677/Scanner/releases')
}

export function getUpdateMeta() {
  return {
    version: app.getVersion(),
    packaged: isPackaged(),
    platform: process.platform,
    autoUpdateEnabled: updatesSupported(),
    releasesUrl: 'https://github.com/shaman12345677/Scanner/releases',
  }
}
