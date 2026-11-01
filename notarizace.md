# Notarizace — Scaner IP

Agent skill (kanonické místo): `/Users/samekt/Documents/programovani/Podpis/skills/notarizace/SKILL.md`  
(symlink: `~/.cursor/skills/notarizace`)  
Původní poznámky: `/Users/samekt/Documents/programovani/Podpis/noterizace.txt`

## Rychlý build

```bash
npm run electron:build:mac
```

Výstup: `/tmp/ScanerIP-dist/`  
- `Scaner IP.app` (notarizovaná)  
- `Scaner IP-1.0.0-arm64.dmg`  
- `Scaner IP-1.0.0-arm64-mac.zip`

## Soubory v tomto projektu

| Soubor | Účel |
|--------|------|
| `.env.build` | API credentials (gitignored) |
| `build/AuthKey_248C9LR3S4.p8` | App Store Connect API klíč |
| `build/entitlements.mac.plist` | Hardened Runtime entitlements |
| `notarize.cjs` | afterSign → notarytool |
| `scripts/after-pack-clean.cjs` | strip xattr před podpisem |

## package.json (důležité)

- `afterSign`: `notarize.cjs`
- `mac.notarize`: `false` (notarizace jen přes afterSign)
- `directories.output`: `/tmp/ScanerIP-dist` (ne Documents — `com.apple.provenance`)
- build skript: `electron-builder --mac -p never`
- `appId`: `cz.samek.scanerip`
- Team ID: `5VL45NGMHA`

## Ověření

```bash
xcrun stapler validate "/tmp/ScanerIP-dist/mac-arm64/Scaner IP.app"
spctl --assess --verbose=4 --type execute "/tmp/ScanerIP-dist/mac-arm64/Scaner IP.app"
```

Očekávaný výsledek: `accepted` / `source=Notarized Developer ID`.

## Credentials

Stejné jako u ostatních Samek Electron app:

```
APPLE_API_KEY=build/AuthKey_248C9LR3S4.p8
APPLE_API_KEY_ID=248C9LR3S4
APPLE_API_ISSUER_ID=64ad6492-e2fe-4973-9b41-79217eaaa6c5
APPLE_TEAM_ID=5VL45NGMHA
```
