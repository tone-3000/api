import { BrowserWindow, WebContentsView, net, shell } from 'electron'
import { randomBytes, createHash } from 'node:crypto'
import { IPC, type AuthResult, type BeginAuthRequest, type T3KTokens, type ViewBounds } from '../shared/ipc'

/**
 * Embedded OAuth for desktop.
 *
 * TONE3000 loads in a WebContentsView layered over the app window at bounds
 * the renderer measures. The view has no preload, so TONE3000 pages can never
 * reach the app's IPC bridge. Main owns the PKCE verifier and watches the
 * view's navigations; when TONE3000 redirects to `redirectUri` main cancels
 * the navigation, exchanges the code and reports the result to the renderer.
 * Nothing needs to be listening at `redirectUri`.
 *
 * The view uses a persistent partition, so the TONE3000 session survives
 * restarts and later flows skip the sign-in step.
 */

const PARTITION = 'persist:tone3000'

interface ActiveFlow {
  view: WebContentsView
  win: BrowserWindow
  req: BeginAuthRequest
  codeVerifier: string
  state: string
  detach: () => void
}

let active: ActiveFlow | null = null

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/** http(s) links that try to open a new window go to the system browser. */
export function openExternally({ url }: { url: string }): { action: 'deny' } {
  try {
    const { protocol } = new URL(url)
    if (protocol === 'http:' || protocol === 'https:') void shell.openExternal(url)
  } catch {
    /* malformed URL */
  }
  return { action: 'deny' }
}

function buildAuthorizeUrl(req: BeginAuthRequest, codeChallenge: string, state: string): string {
  const url = new URL(`${req.apiBase}/api/v1/oauth/authorize`)
  const p = url.searchParams
  p.set('client_id', req.publishableKey)
  p.set('redirect_uri', req.redirectUri)
  p.set('response_type', 'code')
  p.set('code_challenge', codeChallenge)
  p.set('code_challenge_method', 'S256')
  p.set('state', state)
  for (const [k, v] of Object.entries(req.params)) p.set(k, v)
  return url.toString()
}

async function exchangeCode(req: BeginAuthRequest, code: string, codeVerifier: string): Promise<T3KTokens> {
  const res = await net.fetch(`${req.apiBase}/api/v1/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      redirect_uri: req.redirectUri,
      client_id: req.publishableKey,
    }).toString(),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? 'token_exchange_failed')
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string; expires_in: number }
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + data.expires_in * 1000,
  }
}

function isRedirect(url: string, redirectUri: string): boolean {
  try {
    const a = new URL(url)
    const b = new URL(redirectUri)
    return a.origin === b.origin && a.pathname === b.pathname
  } catch {
    return false
  }
}

function teardown(flow: ActiveFlow): void {
  flow.detach()
  if (!flow.win.isDestroyed()) {
    flow.win.contentView.removeChildView(flow.view)
    // Removing a child view doesn't hand keyboard focus back to the app.
    flow.win.webContents.focus()
  }
  // Closing synchronously inside a navigation event can crash; defer it.
  setImmediate(() => flow.view.webContents.close())
}

interface Callback {
  code?: string
  state?: string
  error?: string
  toneId?: string
  canceled?: boolean
}

/** Settle the active flow exactly once. */
async function finish(cb: Callback): Promise<void> {
  const flow = active
  if (!flow) return
  active = null

  let result: AuthResult
  if (cb.canceled && !cb.code) {
    result = { status: 'canceled' }
  } else if (cb.error) {
    result = { status: 'error', error: cb.error }
  } else if (!cb.code || cb.state !== flow.state) {
    result = { status: 'error', error: 'state_mismatch' }
  } else {
    try {
      const tokens = await exchangeCode(flow.req, cb.code, flow.codeVerifier)
      result = { status: 'connected', tokens, toneId: cb.toneId, canceled: cb.canceled || undefined }
    } catch (err) {
      result = { status: 'error', error: err instanceof Error ? err.message : 'token_exchange_failed' }
    }
  }

  teardown(flow)
  if (!flow.win.isDestroyed()) flow.win.webContents.send(IPC.authResult, result)
}

export function beginAuth(win: BrowserWindow, req: BeginAuthRequest, bounds: ViewBounds): void {
  if (active) {
    const previous = active
    active = null
    teardown(previous)
  }

  const codeVerifier = base64url(randomBytes(32))
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest())
  const state = base64url(randomBytes(16))

  const view = new WebContentsView({
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  view.setBackgroundColor('#ffffff')
  win.contentView.addChildView(view)
  view.setBounds(roundBounds(bounds))

  const wc = view.webContents
  wc.setWindowOpenHandler(openExternally)

  // Server redirects fire will-redirect; client-side redirects fire will-navigate.
  const onNavigate = (event: Electron.Event, url: string): void => {
    if (!isRedirect(url, req.redirectUri)) return
    event.preventDefault()
    const q = new URL(url).searchParams
    void finish({
      code: q.get('code') ?? undefined,
      state: q.get('state') ?? undefined,
      error: q.get('error') ?? undefined,
      toneId: q.get('tone_id') ?? undefined,
      canceled: q.get('canceled') === 'true',
    })
  }

  // Authorize can reject the request outright (bad key, unregistered
  // redirect_uri) with an error page instead of a redirect.
  const onDidNavigate = (_e: Electron.Event, url: string, status: number): void => {
    if (status >= 400 && !isRedirect(url, req.redirectUri)) void finish({ error: `authorize_failed_${status}` })
  }

  // -3 is ERR_ABORTED, which our own preventDefault above produces.
  const onFailLoad = (_e: Electron.Event, code: number, _d: string, url: string, isMainFrame: boolean): void => {
    if (!isMainFrame || code === -3 || isRedirect(url, req.redirectUri)) return
    void finish({ error: 'load_failed' })
  }

  const onInput = (_e: Electron.Event, input: Electron.Input): void => {
    if (input.type === 'keyDown' && input.key === 'Escape') void finish({ canceled: true })
  }

  // A newly added view doesn't reliably take keyboard focus, and in-flow
  // navigations (sign-in → catalog) can drop it. Re-assert after each load.
  const onLoaded = (): void => {
    if (active?.view === view) wc.focus()
  }

  wc.on('will-redirect', onNavigate)
  wc.on('will-navigate', onNavigate)
  wc.on('did-navigate', onDidNavigate)
  wc.on('did-fail-load', onFailLoad)
  wc.on('before-input-event', onInput)
  wc.on('did-finish-load', onLoaded)

  active = {
    view,
    win,
    req,
    codeVerifier,
    state,
    detach: () => {
      wc.off('will-redirect', onNavigate)
      wc.off('will-navigate', onNavigate)
      wc.off('did-navigate', onDidNavigate)
      wc.off('did-fail-load', onFailLoad)
      wc.off('before-input-event', onInput)
      wc.off('did-finish-load', onLoaded)
    },
  }

  void wc.loadURL(buildAuthorizeUrl(req, codeChallenge, state))
  wc.focus()
}

export function setAuthBounds(bounds: ViewBounds): void {
  active?.view.setBounds(roundBounds(bounds))
}

export function cancelAuth(): void {
  void finish({ canceled: true })
}

function roundBounds(b: ViewBounds): Electron.Rectangle {
  return {
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.max(0, Math.round(b.width)),
    height: Math.max(0, Math.round(b.height)),
  }
}
