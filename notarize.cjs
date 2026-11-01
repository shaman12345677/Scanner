const path = require('path')
const fs = require('fs')
const { notarize } = require('@electron/notarize')

try {
  require('dotenv').config({ path: path.join(__dirname, '.env.build') })
} catch {
  // dotenv je volitelný, pokud jsou proměnné už v prostředí
}

module.exports = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') return

  const keyRel = process.env.APPLE_API_KEY || 'build/AuthKey_248C9LR3S4.p8'
  const appleApiKey = path.isAbsolute(keyRel)
    ? keyRel
    : path.join(__dirname, keyRel)
  const appleApiKeyId = process.env.APPLE_API_KEY_ID
  const appleApiIssuer = process.env.APPLE_API_ISSUER_ID || process.env.APPLE_API_ISSUER

  if (!appleApiKeyId || !appleApiIssuer || !fs.existsSync(appleApiKey)) {
    console.warn(
      'Přeskakuji notarizaci — chybí APPLE_API_KEY / KEY_ID / ISSUER_ID nebo .p8 soubor.',
    )
    console.warn('Očekáván soubor:', appleApiKey)
    return
  }

  const appName = context.packager.appInfo.productFilename
  const appPath = path.join(appOutDir, `${appName}.app`)

  console.log('Notarizing Scaner IP…')
  console.log('App:', appPath)
  console.log('API Key ID:', appleApiKeyId)

  await notarize({
    tool: 'notarytool',
    appPath,
    appleApiKey,
    appleApiKeyId,
    appleApiIssuer,
  })

  console.log('Notarizace hotova.')
}
