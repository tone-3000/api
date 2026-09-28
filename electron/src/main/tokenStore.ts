import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, readFileSync, writeFileSync, rmSync } from 'fs'
import type { T3KTokens } from '../shared/ipc'

// Tokens are encrypted with the OS keychain (macOS Keychain, Windows DPAPI,
// libsecret on Linux). Without one we fall back to plaintext in userData so the
// demo still runs; a production app might refuse to persist instead.
const encPath = (): string => join(app.getPath('userData'), 't3k-tokens.enc')
const plainPath = (): string => join(app.getPath('userData'), 't3k-tokens.json')

function canEncrypt(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export const tokenStore = {
  get(): T3KTokens | null {
    try {
      if (canEncrypt() && existsSync(encPath())) {
        return JSON.parse(safeStorage.decryptString(readFileSync(encPath())))
      }
      if (existsSync(plainPath())) {
        return JSON.parse(readFileSync(plainPath(), 'utf8'))
      }
    } catch {
      /* unreadable or from another machine: treat as signed out */
    }
    return null
  },

  set(tokens: T3KTokens): void {
    if (canEncrypt()) {
      writeFileSync(encPath(), safeStorage.encryptString(JSON.stringify(tokens)))
      if (existsSync(plainPath())) rmSync(plainPath())
    } else {
      console.warn('[tokenStore] OS encryption unavailable; storing tokens in plaintext.')
      writeFileSync(plainPath(), JSON.stringify(tokens), 'utf8')
    }
  },

  clear(): void {
    for (const p of [encPath(), plainPath()]) {
      if (existsSync(p)) rmSync(p)
    }
  },
}
