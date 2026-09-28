import { app, BrowserWindow, ipcMain, net, protocol } from 'electron'
import { join, normalize, sep } from 'path'
import { pathToFileURL } from 'url'
import { tokenStore } from './tokenStore'
import { beginAuth, cancelAuth, openExternally, setAuthBounds } from './oauth'
import { IPC, type BeginAuthRequest, type T3KTokens, type ViewBounds } from '../shared/ipc'

// In production the renderer is served from app://bundle/ rather than file://,
// so it has a real origin: fetch() works for the preview engine's WASM and the
// AudioWorklet module, and relative asset URLs resolve normally.
const APP_SCHEME = 'app'
const APP_ORIGIN = `${APP_SCHEME}://bundle`

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

const rendererDir = join(__dirname, '../renderer')

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  'img-src * data: blob:',
  'media-src * data: blob:',
  'connect-src * data: blob:',
  "worker-src 'self' blob:",
].join('; ')

function serveRenderer(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const { pathname } = new URL(request.url)
    const file = normalize(join(rendererDir, decodeURIComponent(pathname === '/' ? '/index.html' : pathname)))
    if (!file.startsWith(rendererDir + sep)) return new Response('Not found', { status: 404 })
    const res = await net.fetch(pathToFileURL(file).toString())
    if (!file.endsWith('.html')) return res
    const headers = new Headers(res.headers)
    headers.set('Content-Security-Policy', CSP)
    return new Response(res.body, { status: res.status, headers })
  })
}

// Compare protocol + host: Node's URL reports `origin` as "null" for custom schemes.
function sameOrigin(a: URL, b: URL): boolean {
  return a.protocol === b.protocol && a.host === b.host
}

function isAppUrl(url: string): boolean {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  try {
    const u = new URL(url)
    return sameOrigin(u, new URL(APP_ORIGIN)) || (!!devUrl && sameOrigin(u, new URL(devUrl)))
  } catch {
    return false
  }
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    title: 'TONE3000 Examples',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  win.on('ready-to-show', () => win.show())
  win.webContents.setWindowOpenHandler(openExternally)
  // The app window only ever shows our own UI; everything else opens externally.
  win.webContents.on('will-navigate', (event, url) => {
    if (isAppUrl(url)) return
    event.preventDefault()
    openExternally({ url })
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  void win.loadURL(devUrl ?? `${APP_ORIGIN}/index.html`)
  return win
}

/** IPC is only honored from our own renderer, never from other frames. */
function fromApp(event: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent): BrowserWindow | null {
  const frameUrl = event.senderFrame?.url ?? ''
  if (!isAppUrl(frameUrl)) return null
  return BrowserWindow.fromWebContents(event.sender)
}

function registerIpc(): void {
  ipcMain.handle(IPC.beginAuth, (event, req: BeginAuthRequest, bounds: ViewBounds) => {
    const win = fromApp(event)
    if (win) beginAuth(win, req, bounds)
  })
  ipcMain.on(IPC.setAuthBounds, (event, bounds: ViewBounds) => {
    if (fromApp(event)) setAuthBounds(bounds)
  })
  ipcMain.handle(IPC.cancelAuth, (event) => {
    if (fromApp(event)) cancelAuth()
  })

  ipcMain.handle(IPC.tokensGet, (event) => (fromApp(event) ? tokenStore.get() : null))
  ipcMain.handle(IPC.tokensSet, (event, tokens: T3KTokens) => {
    if (fromApp(event)) tokenStore.set(tokens)
  })
  ipcMain.handle(IPC.tokensClear, (event) => {
    if (fromApp(event)) tokenStore.clear()
  })

  // Pre-signed download URLs (e.g. tone zips) are cross-origin, so an <a download>
  // in the renderer would navigate instead. Let Electron's download manager save it.
  ipcMain.handle(IPC.download, (event, url: string) => {
    const win = fromApp(event)
    if (!win || new URL(url).protocol !== 'https:') return
    win.webContents.downloadURL(url)
  })
}

app.whenReady().then(() => {
  serveRenderer()
  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
