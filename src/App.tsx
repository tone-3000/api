import { useState, useEffect } from 'react'
import './App.css'

// API Domain from environment variable
const API_DOMAIN = import.meta.env.VITE_TONE3000_API_DOMAIN || 'https://www.tone3000.com'
const redirectUrl = encodeURIComponent('http://localhost:3001')

// Enums
enum GearType {
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
  gear: GearType;
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
  pageSize: number;
  total: number;
  totalPages: number;
}

type TonesResponse = PaginatedResponse<Tone>;
type ModelsResponse = PaginatedResponse<Model>;

interface FetchOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  params?: any
}

/**
 * Simple fetch wrapper that handles token refresh automatically
 */
export async function tone3000Fetch(url: string, options: FetchOptions = {}): Promise<Response> {
  const { method = 'GET', params } = options
  
  let accessToken = localStorage.getItem('tone3000_access_token')
  
  if (!accessToken) {
    throw new Error('No access token available')
  }

  // First attempt with current token
  let response = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    ...(params && { body: JSON.stringify(params) })
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
        // Redirect to login
        window.location.href = `${API_DOMAIN}/api/v1/auth?redirectUrl=${redirectUrl}`
        throw new Error('Token refresh failed')
      }

      const tokens = await refreshResponse.json()
      
      // Store new tokens
      localStorage.setItem('tone3000_access_token', tokens.access_token)
      localStorage.setItem('tone3000_refresh_token', tokens.refresh_token)

      // Retry original request with new token
      response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        },
        ...(params && { body: JSON.stringify(params) })
      })

    } catch (refreshError) {
      throw new Error('Authentication failed and token refresh unsuccessful')
    }
  }

  return response
}

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [data, setData] = useState<TonesResponse | ModelsResponse | User | null>(null)
  const [toneId, setToneId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Check for token in URL on component mount
    const params = new URLSearchParams(window.location.search)
    const apiKey = params.get('api_key')

    const handleAuth = async () => {
      // handshake with tone3000 to get session access token and refresh token
      const response = await fetch(`${API_DOMAIN}/api/v1/auth/session`, {
        method: 'POST',
        body: JSON.stringify({ api_key: apiKey })
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      
      localStorage.setItem('tone3000_access_token', data.access_token)
      localStorage.setItem('tone3000_refresh_token', data.refresh_token)
      setIsLoggedIn(true)
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
      }
    }
  }, [])

  const handleLogin = () => {
    window.location.href = `${API_DOMAIN}/api/v1/auth?redirectUrl=${redirectUrl}`
  }

  const handleGetTonesCreated = async () => {
    try {
      const response = await tone3000Fetch(`${API_DOMAIN}/api/v1/tones/created?page=1&pageSize=10`)

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
      const response = await tone3000Fetch(`${API_DOMAIN}/api/v1/tones/favorited?page=1&pageSize=10`)

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
      const response = await tone3000Fetch(`${API_DOMAIN}/api/v1/user`)

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
      const response = await tone3000Fetch(`${API_DOMAIN}/api/v1/models?toneId=${toneId}&page=1&pageSize=10`)

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

  return (
    <div className="app-container">
      {isLoggedIn ? (
        <>
          <div className="button-group">Logged in</div>
          <div className="button-group">
            <button
              onClick={handleGetUser}
              className="button"
            >
              Get user
            </button>
            <button
              onClick={handleGetTonesCreated}
              className="button"
            >
              Get tones created
            </button>
            <button
              onClick={handleGetTonesFavorited}
              className="button"
            >
              Get tones favorited
            </button>
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
                className="button"
              >
                Get models
              </button>
            </div>
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
      ) : (
        <button
          onClick={handleLogin}
          className="button"
        >
          Log in with TONE3000
        </button>
      )}
    </div>
  )
}

export default App
