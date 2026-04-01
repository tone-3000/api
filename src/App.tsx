import { useState, useEffect } from 'react'
import './App.css'
import t3kLogo from './assets/t3k.svg'
import { startOAuthFlow, handleOAuthCallback, T3KClient } from './tone3000-client'

// Environment variables
const API_DOMAIN = import.meta.env.VITE_TONE3000_API_DOMAIN || 'https://www.tone3000.com'
const redirectUrl = import.meta.env.VITE_REDIRECT_URL || encodeURIComponent('http://localhost:3001')
const appId = import.meta.env.VITE_APP_ID || 'my-awesome-app'
const PUBLISHABLE_KEY = import.meta.env.VITE_PUBLISHABLE_KEY || 't3k_pub_your_key_here'
const OAUTH_REDIRECT_URI = import.meta.env.VITE_OAUTH_REDIRECT_URI || 'http://localhost:3001'

// ─── Types ────────────────────────────────────────────────────────────────────

enum Gear {
  Amp = 'amp',
  FullRig = 'full-rig',
  Pedal = 'pedal',
  Outboard = 'outboard',
  Ir = 'ir'
}

enum Platform {
  Nam = 'nam',
  Ir = 'ir',
  AidaX = 'aida-x',
  AaSnapshot = 'aa-snapshot',
  Proteus = 'proteus'
}

enum License {
  T3k = 't3k',
  CcBy = 'cc-by',
  CcBySa = 'cc-by-sa',
  CcByNc = 'cc-by-nc',
  CcByNcSa = 'cc-by-nc-sa',
  CcByNd = 'cc-by-nd',
  CcByNcNd = 'cc-by-nc-nd',
  Cco = 'cco'
}

enum Size {
  Standard = 'standard',
  Lite = 'lite',
  Feather = 'feather',
  Nano = 'nano',
  Custom = 'custom'
}

interface EmbeddedUser {
  id: string;
  username: string;
  avatar_url: string | null;
  url: string;
}

interface User extends EmbeddedUser {
  bio: string | null;
  links: string[] | null;
  created_at: string;
  updated_at: string;
}

interface Make {
  id: number;
  name: string;
}

interface Tag {
  id: number;
  name: string;
}

interface Tone {
  id: number;
  user_id: string;
  user: EmbeddedUser;
  created_at: string;
  updated_at: string;
  title: string;
  description: string | null;
  gear: Gear;
  images: string[] | null;
  is_public: boolean | null;
  links: string[] | null;
  platform: Platform;
  license: License;
  sizes: Size[];
  makes: Make[];
  tags: Tag[];
  models_count: number;
  downloads_count: number;
  favorites_count: number;
  url: string;
}

interface Model {
  id: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  model_url: string;
  name: string;
  size: Size;
  tone_id: number;
}

interface PaginatedResponse<T> {
  data: T[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

type TonesResponse = PaginatedResponse<Tone>;
type ModelsResponse = PaginatedResponse<Model>;
type SelectResponse = Tone & { models: Model[] }

interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'bearer';
}

// ─── Legacy auth helper (for old flows) ──────────────────────────────────────

export async function t3kFetch(url: string): Promise<Response> {
  let accessToken = localStorage.getItem('tone3000_access_token')
  const expiresAt = parseInt(localStorage.getItem('tone3000_expires_at') || '0')

  if (!accessToken) {
    throw new Error('No access token available')
  }

  if (Date.now() > expiresAt - 30000) {
    try {
      const refreshToken = localStorage.getItem('tone3000_refresh_token')
      if (!refreshToken) throw new Error('No refresh token available')

      const refreshResponse = await fetch(`${API_DOMAIN}/api/v1/auth/session/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken, access_token: accessToken })
      })

      if (!refreshResponse.ok) {
        localStorage.removeItem('tone3000_access_token')
        localStorage.removeItem('tone3000_refresh_token')
        localStorage.removeItem('tone3000_expires_at')
        window.location.href = `${API_DOMAIN}/api/v1/auth?redirect_url=${redirectUrl}`
        throw new Error('Token refresh failed')
      }

      const tokens = await refreshResponse.json() as Session
      localStorage.setItem('tone3000_access_token', tokens.access_token)
      localStorage.setItem('tone3000_refresh_token', tokens.refresh_token)
      localStorage.setItem('tone3000_expires_at', String(Date.now() + (tokens.expires_in * 1000)))
      accessToken = tokens.access_token
    } catch {
      throw new Error('Authentication failed and token refresh unsuccessful')
    }
  }

  let response = await fetch(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
  })

  if (response.status === 401) {
    try {
      const refreshToken = localStorage.getItem('tone3000_refresh_token')
      if (!refreshToken) throw new Error('No refresh token available')

      const refreshResponse = await fetch(`${API_DOMAIN}/api/v1/auth/session/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken, access_token: accessToken })
      })

      if (!refreshResponse.ok) {
        localStorage.removeItem('tone3000_access_token')
        localStorage.removeItem('tone3000_refresh_token')
        localStorage.removeItem('tone3000_expires_at')
        window.location.href = `${API_DOMAIN}/api/v1/auth?redirect_url=${redirectUrl}`
        throw new Error('Token refresh failed')
      }

      const tokens = await refreshResponse.json() as Session
      localStorage.setItem('tone3000_access_token', tokens.access_token)
      localStorage.setItem('tone3000_refresh_token', tokens.refresh_token)
      localStorage.setItem('tone3000_expires_at', String(Date.now() + (tokens.expires_in * 1000)))

      response = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${tokens.access_token}`, 'Content-Type': 'application/json' }
      })
    } catch {
      throw new Error('Authentication failed and token refresh unsuccessful')
    }
  }

  return response
}

// ─── OAuth PKCE client (for new flows) ───────────────────────────────────────

type FlowType = 'none' | 'select' | 'full-auth' | 'oauth-select' | 'oauth-standard'

// Instantiated once — sessionStorage tokens survive page refresh within the tab
const t3kClient = new T3KClient(PUBLISHABLE_KEY, () => {
  // Called when refresh fails — restart auth. Auto-grant skips login if the
  // user still has an active Tone3000 session.
  startOAuthFlow(PUBLISHABLE_KEY, OAUTH_REDIRECT_URI)
})

function App() {
  const [flowType, setFlowType] = useState<FlowType>('none')

  // ── Legacy state ──
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [data, setData] = useState<TonesResponse | ModelsResponse | User | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [toneId, setToneId] = useState<number | null>(null)
  const [modelUrl, setModelUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [requireOtp, setRequireOtp] = useState(false)
  const [selectData, setSelectData] = useState<SelectResponse | null>(null)

  // ── New OAuth state ──
  const [oauthConnected, setOauthConnected] = useState(!!t3kClient.getTokens())
  const [oauthTone, setOauthTone] = useState<Tone | null>(null)
  const [oauthToneId, setOauthToneId] = useState<string>('')
  const [oauthModel, setOauthModel] = useState<Model | null>(null)
  const [oauthModelId, setOauthModelId] = useState<string>('')
  const [oauthModelsToneId, setOauthModelsToneId] = useState<string>('')
  const [oauthModels, setOauthModels] = useState<any[] | null>(null)
  const [oauthError, setOauthError] = useState<string | null>(null)

  // ── Handle both legacy callback (api_key) and new OAuth callback (code) ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const apiKey = params.get('api_key')
    const toneUrl = params.get('tone_url')
    const oauthCode = params.get('code')

    // New OAuth PKCE callback
    if (oauthCode) {
      // Guard against React StrictMode double-invocation: if the verifier is
      // already gone it means the first invocation already handled this callback.
      if (!sessionStorage.getItem('t3k_code_verifier')) return

      const pendingFlow = sessionStorage.getItem('t3k_pending_flow') as FlowType | null

      handleOAuthCallback(PUBLISHABLE_KEY, OAUTH_REDIRECT_URI)
        .then(async ({ tokens, toneId }) => {
          t3kClient.setTokens(tokens)
          setOauthConnected(true)
          setOauthError(null)
          window.history.replaceState({}, '', '/')

          if (pendingFlow) {
            sessionStorage.removeItem('t3k_pending_flow')
            setFlowType(pendingFlow)
          } else {
            setFlowType('oauth-standard')
          }

          // Select flow: fetch the chosen tone immediately
          if (toneId) {
            try {
              const tone = await t3kClient.getTone(toneId)
              setOauthTone(tone)
            } catch {
              setOauthError('Connected, but failed to load the selected tone.')
            }
          }
        })
        .catch((err) => {
          console.error('OAuth callback failed:', err)
          setOauthError('Connection failed. Please try again.')
          window.history.replaceState({}, '', '/')
          setFlowType(pendingFlow ?? 'none')
          sessionStorage.removeItem('t3k_pending_flow')
        })
      return
    }

    // Legacy: api_key in URL → exchange for session tokens
    if (apiKey) {
      localStorage.setItem('tone3000_api_key', apiKey)
      fetch(`${API_DOMAIN}/api/v1/auth/session`, {
        method: 'POST',
        body: JSON.stringify({ api_key: apiKey })
      })
        .then(r => r.json())
        .then((tokens: Session) => {
          localStorage.setItem('tone3000_access_token', tokens.access_token)
          localStorage.setItem('tone3000_refresh_token', tokens.refresh_token)
          localStorage.setItem('tone3000_expires_at', String(Date.now() + (tokens.expires_in * 1000)))
          setIsLoggedIn(true)
          setFlowType('full-auth')
          window.history.replaceState({}, document.title, window.location.pathname)
        })
        .catch(() => setError('Authentication failed'))
      return
    }

    // Legacy: tone_url in URL → select flow result
    if (toneUrl) {
      fetch(toneUrl)
        .then(r => r.json())
        .then((d: SelectResponse) => { setSelectData(d); setFlowType('select') })
        .catch(() => setError('Failed to load tone data'))
      return
    }

    // Restore persisted legacy session
    if (localStorage.getItem('tone3000_access_token')) {
      setIsLoggedIn(true)
    }
  }, [])

  const handleBackToStart = () => {
    setFlowType('none')
    setSelectData(null)
    setOauthTone(null)
    setOauthToneId('')
    setData(null)
    setError(null)
    setOauthError(null)
  }

  // ── Legacy handlers ──────────────────────────────────────────────────────────

  const handleLogin = () => {
    const otpParam = requireOtp ? '&otp_only=true' : ''
    window.location.href = `${API_DOMAIN}/api/v1/auth?redirect_url=${redirectUrl}${otpParam}`
  }

  const handleSelectTone = () => {
    window.location.href = `${API_DOMAIN}/api/v1/select?redirect_url=${redirectUrl}&app_id=${appId}`
  }

  const handleLogout = () => {
    localStorage.removeItem('tone3000_access_token')
    localStorage.removeItem('tone3000_refresh_token')
    localStorage.removeItem('tone3000_expires_at')
    setIsLoggedIn(false)
    setData(null)
    setError(null)
    setSelectData(null)
    setFlowType('none')
  }

  const handleGetTonesCreated = async () => {
    try {
      const response = await t3kFetch(`${API_DOMAIN}/api/v1/tones/created?page=1&page_size=10`)
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      setData(await response.json() as TonesResponse)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tones')
      setData(null)
    }
  }

  const handleGetTonesFavorited = async () => {
    try {
      const response = await t3kFetch(`${API_DOMAIN}/api/v1/tones/favorited?page=1&page_size=10`)
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      setData(await response.json() as TonesResponse)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tones')
      setData(null)
    }
  }

  const handleGetUser = async () => {
    try {
      const response = await t3kFetch(`${API_DOMAIN}/api/v1/user`)
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      setData(await response.json())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch user')
      setData(null)
    }
  }

  const handleGetModels = async (id: number) => {
    try {
      const response = await t3kFetch(`${API_DOMAIN}/api/v1/models?tone_id=${id}&page=1&page_size=10`)
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      setData(await response.json() as ModelsResponse)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models')
      setData(null)
    }
  }

  const handleSearch = async (query: string) => {
    try {
      const response = await t3kFetch(`${API_DOMAIN}/api/v1/tones/search?query=${encodeURIComponent(query)}`)
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      setData(await response.json() as TonesResponse)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search')
      setData(null)
    }
  }

  const downloadModel = async (url: string) => {
    try {
      const response = await t3kFetch(url)
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const blob = await response.blob()
      const _url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = _url
      a.download = url.split('/').pop()!
      a.click()
      window.URL.revokeObjectURL(_url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download model')
      setData(null)
    }
  }

  // ── New OAuth handlers ───────────────────────────────────────────────────────

  const handleOAuthConnect = async (flow: 'oauth-standard' | 'oauth-select') => {
    sessionStorage.setItem('t3k_pending_flow', flow)
    await startOAuthFlow(
      PUBLISHABLE_KEY,
      OAUTH_REDIRECT_URI,
      flow === 'oauth-select' ? { toneSelect: true } : undefined
    )
  }

  const handleOAuthDisconnect = () => {
    t3kClient.clearTokens()
    setOauthConnected(false)
    setOauthTone(null)
    setOauthToneId('')
    setOauthError(null)
  }

  const handleFetchTone = async () => {
    if (!oauthToneId) return
    try {
      setOauthError(null)
      const tone = await t3kClient.getTone(oauthToneId)
      setOauthTone(tone)
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : 'Failed to fetch tone')
    }
  }

  const handleFetchModel = async () => {
    if (!oauthModelId) return
    try {
      setOauthError(null)
      const model = await t3kClient.getModel(oauthModelId)
      setOauthModel(model)
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : 'Failed to fetch model')
    }
  }

  const handleListModels = async () => {
    if (!oauthModelsToneId) return
    try {
      setOauthError(null)
      const result = await t3kClient.listModels(oauthModelsToneId)
      setOauthModels(result.data ?? result)
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : 'Failed to list models')
    }
  }

  const downloadModelOAuth = async (url: string) => {
    try {
      // Model download URLs are proxied through the API with Bearer auth
      const response = await t3kClient.fetch(url.replace(API_DOMAIN, ''))
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      const blob = await response.blob()
      const _url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = _url
      a.download = url.split('/').pop()!
      a.click()
      window.URL.revokeObjectURL(_url)
    } catch (err) {
      setOauthError(err instanceof Error ? err.message : 'Failed to download model')
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="app-container">
      <div className="app-header">
        <h1 className="app-title">YOUR AWESOME APP</h1>
        <a className="t3k-api-logo-container" href="https://www.tone3000.com/api" target="_blank" rel="noopener noreferrer">
          <span>Powered by</span>
          <img src={t3kLogo} alt="T3k API Logo" className="t3k-api-logo" style={{ width: '200px', height: 'auto' }} />
        </a>
      </div>

      <div className="app-content">

        {/* ── Flow selection ── */}
        {flowType === 'none' && (
          <div className="flow-selection">

            {/* New: OAuth PKCE Select Flow */}
            <div className="flow-option">
              <div className="flow-badge">New</div>
              <h2 className="flow-title">OAuth Select Flow</h2>
              <p className="flow-description">
                Modern PKCE OAuth integration. Users authenticate and browse tones on TONE3000,
                then your app receives the selected tone alongside a long-lived access token.
                Tokens refresh automatically — no re-authentication needed.
              </p>
              <ul className="flow-features">
                <li>PKCE security (no client secret in browser)</li>
                <li>Automatic token refresh</li>
                <li>Selected tone returned in callback</li>
                <li>Works cross-session with server-side token storage</li>
              </ul>
              {oauthError && <div className="error-message">{oauthError}</div>}
              <button onClick={() => handleOAuthConnect('oauth-select')} className="button">
                Browse Tones on TONE3000
              </button>
            </div>

            <div className="separator"><p>Or</p></div>

            {/* New: OAuth PKCE Standard Flow */}
            <div className="flow-option">
              <div className="flow-badge">New</div>
              <h2 className="flow-title">OAuth Standard Flow</h2>
              <p className="flow-description">
                Modern PKCE OAuth integration. Users connect their TONE3000 account once,
                then your app fetches specific tones programmatically by ID — no browsing on
                TONE3000 needed.
              </p>
              <ul className="flow-features">
                <li>PKCE security (no client secret in browser)</li>
                <li>Automatic token refresh</li>
                <li>Fetch any tone by ID</li>
                <li>Full control over your tone discovery UX</li>
              </ul>
              {oauthError && <div className="error-message">{oauthError}</div>}
              <button onClick={() => handleOAuthConnect('oauth-standard')} className="button">
                Connect TONE3000 Account
              </button>
            </div>

            <div className="separator"><p>Or use legacy flows</p></div>

            {/* Legacy: Select Flow */}
            <div className="flow-option flow-option-legacy">
              <div className="flow-badge flow-badge-legacy">Legacy</div>
              <h2 className="flow-title">Select Flow</h2>
              <p className="flow-description">
                Low-code integration. Users authenticate and browse tones through TONE3000's
                interface, then your app receives the complete tone data with downloadable models.
              </p>
              <ul className="flow-features">
                <li>No authentication UI to build</li>
                <li>No browsing UI needed</li>
                <li>Quick integration</li>
                <li>Perfect for plugins & native apps</li>
              </ul>
              <button onClick={() => { setFlowType('select'); handleSelectTone() }} className="button button-secondary">
                Use Select Flow
              </button>
            </div>

            <div className="separator"><p>Or</p></div>

            {/* Legacy: Full API Access */}
            <div className="flow-option flow-option-legacy">
              <div className="flow-badge flow-badge-legacy">Legacy</div>
              <h2 className="flow-title">Full API Access</h2>
              <p className="flow-description">
                Complete programmatic control over the user experience. Authenticate users and
                use API endpoints to query profiles, search tones, and access model data.
              </p>
              <ul className="flow-features">
                <li>Full control over UX</li>
                <li>Custom browsing interface</li>
                <li>Access to all API endpoints</li>
                <li>Search, filter, and manage tones</li>
              </ul>
              <button onClick={() => setFlowType('full-auth')} className="button button-secondary">
                Use Full API Access
              </button>
            </div>

          </div>
        )}

        {/* ── New: OAuth Select Flow ── */}
        {flowType === 'oauth-select' && (
          <div className="flow-content">
            <div className="flow-header">
              <h2 className="flow-active-title">OAuth Select Flow</h2>
              <button onClick={handleBackToStart} className="button button-secondary button-small">← Back</button>
            </div>

            {oauthError && (
              <div className="error-message">
                <p>{oauthError}</p>
                <button onClick={() => { setOauthError(null); handleOAuthConnect('oauth-select') }} className="button">
                  Try Again
                </button>
              </div>
            )}

            {oauthConnected ? (
              <>
                <div className="success-message">✓ Connected to TONE3000</div>
                {oauthTone ? (
                  <>
                    <div className="success-message">✓ Tone selected: {oauthTone.title}</div>
                    <pre className="data-display">{JSON.stringify(oauthTone, null, 2)}</pre>
                    {(oauthTone as any).models?.map((m: Model) => (
                      <button key={m.id} onClick={() => downloadModelOAuth(m.model_url)} className="button button-secondary">
                        Download {m.name}
                      </button>
                    ))}
                  </>
                ) : (
                  <p className="flow-instructions-text">Select a tone to load it here.</p>
                )}
                <div className="button-group">
                  <button onClick={() => handleOAuthConnect('oauth-select')} className="button">
                    Browse Tones Again
                  </button>
                  <button onClick={handleOAuthDisconnect} className="button button-secondary">
                    Disconnect
                  </button>
                </div>
              </>
            ) : (
              <div className="flow-instructions">
                <p>Click the button to browse and select a tone on TONE3000.</p>
                <p>You'll authenticate once, pick a tone, then land back here with it loaded.</p>
                <button onClick={() => handleOAuthConnect('oauth-select')} className="button">
                  Browse Tones on TONE3000
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── New: OAuth Standard Flow ── */}
        {flowType === 'oauth-standard' && (
          <div className="flow-content">
            <div className="flow-header">
              <h2 className="flow-active-title">OAuth Standard Flow</h2>
              <button onClick={handleBackToStart} className="button button-secondary button-small">← Back</button>
            </div>

            {oauthError && (
              <div className="error-message">
                <p>{oauthError}</p>
                <button onClick={() => { setOauthError(null); handleOAuthConnect('oauth-standard') }} className="button">
                  Try Again
                </button>
              </div>
            )}

            {oauthConnected ? (
              <>
                <div className="success-message">✓ Connected to TONE3000</div>
                <div className="input-group">
                  <input
                    type="text"
                    value={oauthToneId}
                    onChange={(e) => setOauthToneId(e.target.value)}
                    className="input"
                    placeholder="Tone ID"
                  />
                  <button onClick={handleFetchTone} className="button button-secondary">
                    Fetch Tone
                  </button>
                </div>
                {oauthTone && (
                  <>
                    <pre className="data-display">{JSON.stringify(oauthTone, null, 2)}</pre>
                    {(oauthTone as any).models?.map((m: Model) => (
                      <button key={m.id} onClick={() => downloadModelOAuth(m.model_url)} className="button button-secondary">
                        Download {m.name}
                      </button>
                    ))}
                  </>
                )}
                <div className="input-group">
                  <input
                    type="text"
                    value={oauthModelId}
                    onChange={(e) => setOauthModelId(e.target.value)}
                    className="input"
                    placeholder="Model ID"
                  />
                  <button onClick={handleFetchModel} className="button button-secondary">
                    Fetch Model
                  </button>
                </div>
                {oauthModel && (
                  <>
                    <pre className="data-display">{JSON.stringify(oauthModel, null, 2)}</pre>
                    <button onClick={() => downloadModelOAuth((oauthModel as any).model_url)} className="button button-secondary">
                      Download {(oauthModel as any).name}
                    </button>
                  </>
                )}
                <div className="input-group">
                  <input
                    type="text"
                    value={oauthModelsToneId}
                    onChange={(e) => setOauthModelsToneId(e.target.value)}
                    className="input"
                    placeholder="Tone ID"
                  />
                  <button onClick={handleListModels} className="button button-secondary">
                    List Models
                  </button>
                </div>
                {oauthModels && (
                  <>
                    <pre className="data-display">{JSON.stringify(oauthModels, null, 2)}</pre>
                    {oauthModels.map((m: any) => (
                      <button key={m.id} onClick={() => downloadModelOAuth(m.model_url)} className="button button-secondary">
                        Download {m.name}
                      </button>
                    ))}
                  </>
                )}
                <button onClick={handleOAuthDisconnect} className="button button-secondary">
                  Disconnect
                </button>
              </>
            ) : (
              <div className="flow-instructions">
                <p>Connect your TONE3000 account to fetch tones by ID.</p>
                <p>After connecting, you won't need to authenticate again for this session.</p>
                <button onClick={() => handleOAuthConnect('oauth-standard')} className="button">
                  Connect TONE3000 Account
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Legacy: Select Flow ── */}
        {flowType === 'select' && (
          <div className="flow-content">
            <div className="flow-header">
              <h2 className="flow-active-title">Select Flow <span className="flow-badge flow-badge-legacy">Legacy</span></h2>
              <button onClick={handleBackToStart} className="button button-secondary button-small">← Back</button>
            </div>
            {selectData ? (
              <>
                <div className="success-message">✓ Tone selected successfully!</div>
                <pre className="data-display">{JSON.stringify(selectData, null, 2)}</pre>
                <button onClick={handleSelectTone} className="button">Select Another Tone</button>
              </>
            ) : (
              <div className="flow-instructions">
                <p>Click the button below to open TONE3000's tone selector.</p>
                <p>You'll be able to browse and select a tone, then return here with the tone data.</p>
                <button onClick={handleSelectTone} className="button">Select a Tone</button>
              </div>
            )}
          </div>
        )}

        {/* ── Legacy: Full API Access ── */}
        {flowType === 'full-auth' && (
          <div className="flow-content">
            <div className="flow-header">
              <h2 className="flow-active-title">Full API Access <span className="flow-badge flow-badge-legacy">Legacy</span></h2>
              <button onClick={handleBackToStart} className="button button-secondary button-small">← Back</button>
            </div>
            {!isLoggedIn ? (
              <div className="login-container">
                <p className="flow-instructions-text">First, authenticate with TONE3000 to access the full API.</p>
                <button onClick={handleLogin} className="button">Log in with TONE3000</button>
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={requireOtp}
                      onChange={(e) => setRequireOtp(e.target.checked)}
                      className="checkbox"
                    />
                    Require OTP login
                  </label>
                </div>
              </div>
            ) : (
              <>
                <div className="button-group">
                  <button onClick={handleGetUser} className="button">Get user</button>
                  <button onClick={handleGetTonesCreated} className="button button-secondary">Get tones created</button>
                  <button onClick={handleGetTonesFavorited} className="button button-secondary">Get tones favorited</button>
                  <div className="input-group">
                    <input
                      type="text"
                      value={searchQuery || ''}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="input"
                      placeholder="Search Query"
                    />
                    <button onClick={() => handleSearch(searchQuery!)} className="button button-secondary">Search</button>
                  </div>
                  <div className="input-group">
                    <input
                      type="number"
                      value={toneId?.toString() || ''}
                      onChange={(e) => setToneId(Number(e.target.value))}
                      className="input"
                      placeholder="Tone ID"
                    />
                    <button onClick={() => handleGetModels(toneId!)} className="button button-secondary">Get models</button>
                  </div>
                  <div className="input-group">
                    <input
                      type="text"
                      value={modelUrl || ''}
                      onChange={(e) => setModelUrl(e.target.value)}
                      className="input"
                      placeholder="Model URL"
                    />
                    <button onClick={() => downloadModel(modelUrl!)} className="button button-secondary">Download</button>
                  </div>
                  <button onClick={handleLogout} className="button button-secondary">Logout</button>
                </div>
                {error && <div className="error-message">Error: {error}</div>}
                {data && <pre className="data-display">{JSON.stringify(data, null, 2)}</pre>}
              </>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

export default App
