import { contextBridge, ipcRenderer } from 'electron'
import { IPC, type AuthResult, type T3KBridge } from '../shared/ipc'

// Only the app window gets this preload. The embedded TONE3000 view has none,
// so pages loaded there can't see window.t3k.
const bridge: T3KBridge = {
  auth: {
    begin: (req, bounds) => ipcRenderer.invoke(IPC.beginAuth, req, bounds),
    setBounds: (bounds) => ipcRenderer.send(IPC.setAuthBounds, bounds),
    cancel: () => ipcRenderer.invoke(IPC.cancelAuth),
    onResult: (callback) => {
      const listener = (_e: unknown, result: AuthResult): void => callback(result)
      ipcRenderer.on(IPC.authResult, listener)
      return () => ipcRenderer.removeListener(IPC.authResult, listener)
    },
  },
  tokens: {
    get: () => ipcRenderer.invoke(IPC.tokensGet),
    set: (tokens) => ipcRenderer.invoke(IPC.tokensSet, tokens),
    clear: () => ipcRenderer.invoke(IPC.tokensClear),
  },
  download: (url) => ipcRenderer.invoke(IPC.download, url),
}

contextBridge.exposeInMainWorld('t3k', bridge)
