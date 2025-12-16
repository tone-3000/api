import { useState, useEffect } from 'react'
import './App.css'
import t3kLogo from './assets/t3k.svg'

// API Domain from environment variable
const API_DOMAIN = import.meta.env.VITE_TONE3000_API_DOMAIN || 'https://www.tone3000.com'
const redirectUrl = import.meta.env.VITE_REDIRECT_URL || encodeURIComponent('http://localhost:3001')

const appId = import.meta.env.VITE_APP_ID || 'my-awesome-app'

// Enums
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

// Base interfaces
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
  expires_in: number;  // seconds until token expires
  token_type: 'bearer';
}

/**
 * Simple fetch wrapper that handles token refresh automatically
 */
export async function t3kFetch(url: string): Promise<Response> {
  let accessToken = localStorage.getItem('tone3000_access_token')
  const expiresAt = parseInt(localStorage.getItem('tone3000_expires_at') || '0')
  
  if (!accessToken) {
    throw new Error('No access token available')
  }

  // Check if token is expired or about to expire (within 30 seconds)
  if (Date.now() > expiresAt - 30000) {
    try {
      // Refresh the token
      const refreshToken = localStorage.getItem('tone3000_refresh_token')
      if (!refreshToken) {
        throw new Error('No refresh token available')
      }

      const refreshResponse = await fetch(`${API_DOMAIN}/api/v1/auth/session/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refresh_token: refreshToken,
          access_token: accessToken
        })
      })

      if (!refreshResponse.ok) {
        // Clear tokens
        localStorage.removeItem('tone3000_access_token')
        localStorage.removeItem('tone3000_refresh_token')
        localStorage.removeItem('tone3000_expires_at')
        // Redirect to login
        window.location.href = `${API_DOMAIN}/api/v1/auth?redirect_url=${redirectUrl}`
        throw new Error('Token refresh failed')
      }

      const tokens = await refreshResponse.json() as Session
      
      // Store new tokens and expiration
      localStorage.setItem('tone3000_access_token', tokens.access_token)
      localStorage.setItem('tone3000_refresh_token', tokens.refresh_token)
      localStorage.setItem('tone3000_expires_at', String(Date.now() + (tokens.expires_in * 1000)))

      // Update access token for this request
      accessToken = tokens.access_token
    } catch (refreshError) {
      throw new Error('Authentication failed and token refresh unsuccessful')
    }
  }

  // Make the request with current or refreshed token
  let response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  })

  // If unauthorized, try to refresh and retry once
  if (response.status === 401) {
    try {
      // Refresh the token
      const refreshToken = localStorage.getItem('tone3000_refresh_token')
      if (!refreshToken) {
        throw new Error('No refresh token available')
      }

      const refreshResponse = await fetch(`${API_DOMAIN}/api/v1/auth/session/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          refresh_token: refreshToken,
          access_token: accessToken
        })
      })

      if (!refreshResponse.ok) {
        // Clear tokens
        localStorage.removeItem('tone3000_access_token')
        localStorage.removeItem('tone3000_refresh_token')
        localStorage.removeItem('tone3000_expires_at')
        // Redirect to login
        window.location.href = `${API_DOMAIN}/api/v1/auth?redirect_url=${redirectUrl}`
        throw new Error('Token refresh failed')
      }

      const tokens = await refreshResponse.json() as Session
      
      // Store new tokens and expiration
      localStorage.setItem('tone3000_access_token', tokens.access_token)
      localStorage.setItem('tone3000_refresh_token', tokens.refresh_token)
      localStorage.setItem('tone3000_expires_at', String(Date.now() + (tokens.expires_in * 1000)))

      // Retry original request with new token
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        }
      })

    } catch (refreshError) {
      throw new Error('Authentication failed and token refresh unsuccessful')
    }
  }

  return response
}

type FlowType = 'none' | 'select' | 'full-auth'

function App() {
  const [flowType, setFlowType] = useState<FlowType>('none')
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [data, setData] = useState<TonesResponse | ModelsResponse | User | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [toneId, setToneId] = useState<number | null>(null)
  const [modelUrl, setModelUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [requireOtp, setRequireOtp] = useState(false)
  const [selectData, setSelectData] = useState<SelectResponse | null>(null)

  useEffect(() => {
    // Check for token in URL on component mount
    const params = new URLSearchParams(window.location.search)
    const apiKey = params.get('api_key')
    const toneUrl = params.get('tone_url')

    const handleAuth = async () => {
      // handshake with tone3000 to get session access token and refresh token
      const response = await fetch(`${API_DOMAIN}/api/v1/auth/session`, {
        method: 'POST',
        body: JSON.stringify({ api_key: apiKey })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json() as Session
      
      localStorage.setItem('tone3000_access_token', data.access_token)
      localStorage.setItem('tone3000_refresh_token', data.refresh_token)
      localStorage.setItem('tone3000_expires_at', String(Date.now() + (data.expires_in * 1000)))
      setIsLoggedIn(true)
      setFlowType('full-auth')
      // Clean up the URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    if (apiKey) {
      localStorage.setItem('tone3000_api_key', apiKey)
      handleAuth()
    } else {
      // Check if we're already logged in
      const storedToken = localStorage.getItem('tone3000_access_token')
      if (storedToken) {
        setIsLoggedIn(true)
        setFlowType('full-auth')
      }
    }

    const handleSelect = async (toneUrl: string) => {
      const response = await fetch(toneUrl)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const data = await response.json() as SelectResponse
      setSelectData(data)
      setFlowType('select')
    }

    if (toneUrl) {
      handleSelect(toneUrl)
    }
  }, [])

  const handleLogin = () => {
    const otpParam = requireOtp ? '&otp_only=true' : ''
    window.location.href = `${API_DOMAIN}/api/v1/auth?redirect_url=${redirectUrl}${otpParam}`
  }

  const handleSelectTone = async () => {
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

  const handleBackToStart = () => {
    setFlowType('none')
    setSelectData(null)
    setData(null)
    setError(null)
  }

  const handleGetTonesCreated = async () => {
    try {
      const response = await t3kFetch(`${API_DOMAIN}/api/v1/tones/created?page=1&page_size=10`)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json() as TonesResponse
      setData(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tones')
      setData(null)
    }
  }

  const handleGetTonesFavorited = async () => {
    try {
      const response = await t3kFetch(`${API_DOMAIN}/api/v1/tones/favorited?page=1&page_size=10`)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json() as TonesResponse
      setData(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tones')
      setData(null)
    }
  }

  const handleGetUser = async () => {
    try {
      const response = await t3kFetch(`${API_DOMAIN}/api/v1/user`)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      setData(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch user')
      setData(null)
    }
  }

  const handleGetModels = async (toneId: number) => {
    try {
      const response = await t3kFetch(`${API_DOMAIN}/api/v1/models?tone_id=${toneId}&page=1&page_size=10`)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json() as ModelsResponse
      setData(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch models')
      setData(null)
    }
  }

  const handleSearch = async (query: string) => {
    try {
      const response = await t3kFetch(`${API_DOMAIN}/api/v1/tones/search?query=${encodeURIComponent(query)}`)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json() as TonesResponse
      setData(data)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search')
      setData(null)
    }
  }

  const downloadModel = async (url: string) => {
    try {
      const response = await t3kFetch(url)

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      // download the model
      const blob = await response.blob()
      const _url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = _url
      a.download = url.split('/').pop()!;
      a.click()
      window.URL.revokeObjectURL(_url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download model')
      setData(null)
    }
  }

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
        {flowType === 'none' ? (
          <div className="flow-selection">
            <div className="flow-option">
              <h2 className="flow-title">Select Flow</h2>
              <p className="flow-description">
                Low-code OAuth-like integration. Users authenticate and browse tones through TONE3000's interface,
                then your app receives the complete tone data with downloadable models.
              </p>
              <ul className="flow-features">
                <li>No authentication UI to build</li>
                <li>No browsing UI needed</li>
                <li>Quick integration</li>
                <li>Perfect for plugins & native apps</li>
              </ul>
              <button
                onClick={handleSelectTone}
                className="button"
              >
                Use Select Flow
              </button>
            </div>

            <div className="separator">
              <p>Or</p>
            </div>

            <div className="flow-option">
              <h2 className="flow-title">Full API Access</h2>
              <p className="flow-description">
                Complete programmatic control over the user experience. Authenticate users and use API
                endpoints to query profiles, search tones, and access model data.
              </p>
              <ul className="flow-features">
                <li>Full control over UX</li>
                <li>Custom browsing interface</li>
                <li>Access to all API endpoints</li>
                <li>Search, filter, and manage tones</li>
              </ul>
              <button
                onClick={() => setFlowType('full-auth')}
                className="button"
              >
                Use Full API Access
              </button>
            </div>
          </div>
        ) : flowType === 'select' ? (
          <div className="flow-content">
            <div className="flow-header">
              <h2 className="flow-active-title">Select Flow</h2>
              <button onClick={handleBackToStart} className="button button-secondary button-small">
                ← Back to Start
              </button>
            </div>
            {selectData ? (
              <>
                <div className="success-message">
                  ✓ Tone selected successfully!
                </div>
                <pre className="data-display">
                  {JSON.stringify(selectData, null, 2)}
                </pre>
                <button onClick={handleSelectTone} className="button">
                  Select Another Tone
                </button>
              </>
            ) : (
              <div className="flow-instructions">
                <p>Click the button below to open TONE3000's tone selector.</p>
                <p>You'll be able to browse and select a tone, then return here with the tone data.</p>
                <button onClick={handleSelectTone} className="button">
                  Select a Tone
                </button>
              </div>
            )}
          </div>
        ) : flowType === 'full-auth' ? (
          <div className="flow-content">
            {!isLoggedIn ? (
              <>
                <div className="flow-header">
                  <h2 className="flow-active-title">Full API Access</h2>
                  <button onClick={handleBackToStart} className="button button-secondary button-small">
                    ← Back to Start
                  </button>
                </div>
                <div className="login-container">
                  <p className="flow-instructions-text">First, authenticate with TONE3000 to access the full API.</p>
                  <button
                    onClick={handleLogin}
                    className="button"
                  >
                    Log in with TONE3000
                  </button>
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
              </>
            ) : (
              <>
                <div className="flow-header">
                  <h2 className="flow-active-title">Full API Access</h2>
                  <button onClick={handleBackToStart} className="button button-secondary button-small">
                    ← Back to Start
                  </button>
                </div>
                <div className="button-group">
                  <button
                    onClick={handleGetUser}
                    className="button"
                  >
                    Get user
                  </button>
                  <button
                    onClick={handleGetTonesCreated}
                    className="button button-secondary"
                  >
                    Get tones created
                  </button>
                  <button
                    onClick={handleGetTonesFavorited}
                    className="button button-secondary"
                  >
                    Get tones favorited
                  </button>
                  <div className="input-group">
                    <input 
                      type="text" 
                      value={searchQuery || ''} 
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="input"
                      placeholder="Search Query"
                    />
                    <button
                      onClick={() => handleSearch(searchQuery!)}
                      className="button button-secondary"
                    >
                      Search
                    </button>
                  </div>
                  <div className="input-group">
                    <input 
                      type="number" 
                      value={toneId?.toString() || ''} 
                      onChange={(e) => setToneId(Number(e.target.value))}
                      className="input"
                      placeholder="Tone ID"
                    />
                    <button 
                      onClick={() => handleGetModels(toneId!)}
                      className="button button-secondary"
                    >
                      Get models
                    </button>
                  </div>
                  <div className="input-group">
                    <input 
                      type="text" 
                      value={modelUrl || ''} 
                      onChange={(e) => setModelUrl(e.target.value)}
                      className="input"
                      placeholder="Model URL"
                    />
                    <button
                      onClick={() => downloadModel(modelUrl!)}
                      className="button button-secondary"
                    >
                      Download
                    </button>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="button button-secondary"
                  >
                    Logout
                  </button>
                </div>
                {error && (
                  <div className="error-message">
                    Error: {error}
                  </div>
                )}
                {data && (
                  <pre className="data-display">
                    {JSON.stringify(data, null, 2)}
                  </pre>
                )}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default App
