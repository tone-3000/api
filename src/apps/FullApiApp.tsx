// src/apps/FullApiApp.tsx
import { useState, useEffect, useCallback } from 'react';
import { PUBLISHABLE_KEY, REDIRECT_URI } from '../config';
import { startStandardFlow } from '../tone3000-client';
import { t3kClient } from '../App';
import { ToneCard } from '../components/ToneCard';
import { ModelList } from '../components/ModelList';
import { Pagination } from '../components/Pagination';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';
import type {
  User, Tone, Model, PublicUser,
  TonesSort, Gear,
} from '../types';
import { TonesSort as TonesSortEnum } from '../types';
import t3kLogo from '../assets/t3k.svg';

type Section = 'profile' | 'my-tones' | 'favorites' | 'browse' | 'artists';

export function FullApiApp() {
  const [connected, setConnected] = useState(t3kClient.isConnected());
  const [section, setSection] = useState<Section>('browse');
  const [error, setError] = useState<string | null>(null);

  // Profile state
  const [user, setUser] = useState<User | null>(null);

  // Tone grid state (shared by My Tones, Favorites, Browse)
  const [tones, setTones] = useState<Tone[]>([]);
  const [tonesPage, setTonesPage] = useState(1);
  const [tonesTotalPages, setTonesTotalPages] = useState(1);
  const [tonesLoading, setTonesLoading] = useState(false);

  // Search/filter state (Browse section)
  const [query, setQuery] = useState('');
  const [gearFilter, setGearFilter] = useState<Gear | ''>('');
  const [sort, setSort] = useState<TonesSort>(TonesSortEnum.Trending);

  // Tone detail state
  const [selectedTone, setSelectedTone] = useState<(Tone & { models: Model[] }) | null>(null);
  const [toneDetailLoading, setToneDetailLoading] = useState(false);

  // Artists state
  const [artists, setArtists] = useState<PublicUser[]>([]);
  const [artistsPage, setArtistsPage] = useState(1);
  const [artistsTotalPages, setArtistsTotalPages] = useState(1);
  const [artistsLoading, setArtistsLoading] = useState(false);

  const handleConnect = () => {
    sessionStorage.setItem('t3k_pending_demo', 'full-api');
    startStandardFlow(PUBLISHABLE_KEY, REDIRECT_URI);
  };

  const handleDisconnect = () => {
    t3kClient.clearTokens();
    setConnected(false);
    setUser(null);
    setTones([]);
    setSelectedTone(null);
  };

  // Load data whenever section or page changes
  const loadSectionData = useCallback(async () => {
    setError(null);

    if (section === 'profile') {
      try {
        const u = await t3kClient.getUser();
        setUser(u);
      } catch {
        setError('Failed to load profile.');
      }
      return;
    }

    if (section === 'my-tones') {
      setTonesLoading(true);
      try {
        const res = await t3kClient.listCreatedTones(tonesPage);
        setTones(res.data);
        setTonesTotalPages(res.total_pages);
      } catch {
        setError('Failed to load your tones.');
      } finally {
        setTonesLoading(false);
      }
      return;
    }

    if (section === 'favorites') {
      setTonesLoading(true);
      try {
        const res = await t3kClient.listFavoritedTones(tonesPage);
        setTones(res.data);
        setTonesTotalPages(res.total_pages);
      } catch {
        setError('Failed to load favorites.');
      } finally {
        setTonesLoading(false);
      }
      return;
    }

    if (section === 'browse') {
      setTonesLoading(true);
      try {
        const res = await t3kClient.searchTones({
          query: query || undefined,
          gears: gearFilter ? [gearFilter as Gear] : undefined,
          sort,
          page: tonesPage,
          pageSize: 12,
        });
        setTones(res.data);
        setTonesTotalPages(res.total_pages);
      } catch {
        setError('Search failed. Please try again.');
      } finally {
        setTonesLoading(false);
      }
      return;
    }

    if (section === 'artists') {
      setArtistsLoading(true);
      try {
        const res = await t3kClient.listUsers({ page: artistsPage, pageSize: 10 });
        setArtists(res.data);
        setArtistsTotalPages(res.total_pages);
      } catch {
        setError('Failed to load artists.');
      } finally {
        setArtistsLoading(false);
      }
    }
  }, [section, tonesPage, artistsPage, query, gearFilter, sort]);

  useEffect(() => {
    if (connected) loadSectionData();
  }, [connected, loadSectionData]);

  const handleSelectTone = async (tone: Tone) => {
    setToneDetailLoading(true);
    setSelectedTone(null);
    try {
      const [full, modelsRes] = await Promise.all([
        t3kClient.getTone(tone.id),
        t3kClient.listModels(tone.id),
      ]);
      setSelectedTone({ ...full, models: modelsRes.data });
    } catch {
      setError('Failed to load tone details.');
    } finally {
      setToneDetailLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setTonesPage(1);
    loadSectionData();
  };

  const switchSection = (s: Section) => {
    setSection(s);
    setTonesPage(1);
    setSelectedTone(null);
    setTones([]);
  };

  if (!connected) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="app-brand">
            <div className="app-logo-block">
              <span className="app-logo-icon">🗄️</span>
              <span className="app-name">Tone Vault</span>
            </div>
            <span className="app-tagline">Tone Discovery & Management</span>
          </div>
        </header>
        <main className="app-main">
          <div className="connect-state">
            <div className="connect-state-icon">🔐</div>
            <h2 className="connect-state-title">Connect to TONE3000</h2>
            <p className="connect-state-desc">
              Browse the TONE3000 tone library, access your created tones,
              manage favorites, and download model files — all within Tone Vault.
            </p>
            <button className="btn btn-primary btn-t3k btn-large" onClick={handleConnect}>
              <img src={t3kLogo} alt="" className="btn-logo" />
              Browse Tones from TONE3000
            </button>
          </div>
        </main>
        <footer className="app-footer">
          <a href="/" className="back-link">← All Demos</a>
        </footer>
      </div>
    );
  }

  return (
    <div className="app-shell app-shell--full">
      <header className="app-header">
        <div className="app-brand">
          <div className="app-logo-block">
            <span className="app-logo-icon">🗄️</span>
            <span className="app-name">Tone Vault</span>
          </div>
        </div>
        <div className="header-actions">
          <button className="btn btn-ghost" onClick={handleDisconnect}>Disconnect</button>
        </div>
      </header>

      <div className="full-app-layout">
        {/* Sidebar */}
        <nav className="sidebar">
          {[
            { id: 'profile', label: 'My Profile', icon: '👤' },
            { id: 'my-tones', label: 'My Tones', icon: '🎵' },
            { id: 'favorites', label: 'Favorites', icon: '⭐' },
            { id: 'browse', label: 'Browse Tones', icon: '🔍' },
            { id: 'artists', label: 'Browse Creators', icon: '🎸' },
          ].map((item) => (
            <button
              key={item.id}
              className={`sidebar-item ${section === item.id ? 'sidebar-item--active' : ''}`}
              onClick={() => { switchSection(item.id as Section); }}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Main content */}
        <main className="full-app-main">
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          {/* Tone detail view — replaces section content when a tone is selected */}
          {toneDetailLoading && (
            <div className="tone-detail-page">
              <div className="tone-detail-page-loading">
                <Spinner />
                <p>Loading tone…</p>
              </div>
            </div>
          )}

          {selectedTone && !toneDetailLoading && (
            <div className="tone-detail-page">
              <button className="btn btn-ghost btn-small tone-detail-back" onClick={() => setSelectedTone(null)}>
                ← Back
              </button>

              {selectedTone.images?.[0] && (
                <img src={selectedTone.images[0]} alt={selectedTone.title} className="tone-detail-hero" />
              )}

              <div className="tone-detail-header">
                <div>
                  <h2 className="tone-detail-title">{selectedTone.title}</h2>
                  <p className="tone-detail-creator">by @{selectedTone.user.username}</p>
                </div>
                <div className="tone-detail-badges">
                  <span className="badge badge--platform">{selectedTone.platform}</span>
                  <span className="badge badge--gear">{selectedTone.gear}</span>
                  {!selectedTone.is_public && <span className="badge badge--private">Private</span>}
                </div>
              </div>

              {selectedTone.description && (
                <p className="tone-detail-desc">{selectedTone.description}</p>
              )}

              <div className="tone-detail-meta-row">
                <span className="tone-detail-stat">↓ {selectedTone.downloads_count} downloads</span>
                <span className="tone-detail-stat">★ {selectedTone.favorites_count} favorites</span>
                <span className="tone-detail-stat">{selectedTone.models_count} models</span>
                <span className="tone-detail-stat">License: {selectedTone.license}</span>
              </div>

              {selectedTone.makes.length > 0 && (
                <div className="tone-detail-tags">
                  {selectedTone.makes.map(m => (
                    <span key={m.name} className="badge">{m.name}</span>
                  ))}
                </div>
              )}

              {selectedTone.tags.length > 0 && (
                <div className="tone-detail-tags">
                  {selectedTone.tags.map(t => (
                    <span key={t.name} className="badge">{t.name}</span>
                  ))}
                </div>
              )}

              <div className="model-section">
                <h3 className="model-section-title">Models ({selectedTone.models.length})</h3>
                <ModelList
                  models={selectedTone.models}
                  onDownload={model => t3kClient.downloadModel(model.model_url, model.name)}
                />
              </div>
            </div>
          )}

          {/* Section content — hidden while tone detail is shown */}
          {!selectedTone && !toneDetailLoading && (
            <>
              {/* Profile section */}
              {section === 'profile' && (
                <div className="profile-section">
                  {!user ? <Spinner /> : (
                    <div className="profile-card">
                      {user.avatar_url && <img src={user.avatar_url} alt={user.username} className="profile-avatar" />}
                      <h2 className="profile-username">@{user.username}</h2>
                      {user.bio && <p className="profile-bio">{user.bio}</p>}
                      {user.links?.map(link => (
                        <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="profile-link">{link}</a>
                      ))}
                      <div className="profile-meta">
                        <span>Joined {new Date(user.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Browse section (My Tones / Favorites / Browse Tones) */}
              {(section === 'my-tones' || section === 'favorites' || section === 'browse') && (
                <div className="browse-section">
                  {section === 'browse' && (
                    <form className="search-bar" onSubmit={handleSearch}>
                      <input
                        type="text"
                        className="search-input"
                        placeholder="Search tones…"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                      />
                      <select
                        className="select-filter"
                        value={gearFilter}
                        onChange={e => { setGearFilter(e.target.value as Gear | ''); setTonesPage(1); }}
                      >
                        <option value="">All Gear</option>
                        <option value="amp">Amp</option>
                        <option value="pedal">Pedal</option>
                        <option value="full-rig">Full Rig</option>
                        <option value="outboard">Outboard</option>
                        <option value="ir">IR</option>
                      </select>
                      <select
                        className="select-filter"
                        value={sort}
                        onChange={e => { setSort(e.target.value as TonesSort); setTonesPage(1); }}
                      >
                        <option value="trending">Trending</option>
                        <option value="newest">Newest</option>
                        <option value="downloads-all-time">Most Downloaded</option>
                        <option value="best-match">Best Match</option>
                      </select>
                      <button type="submit" className="btn btn-primary">Search</button>
                    </form>
                  )}

                  {tonesLoading ? <Spinner /> : (
                    <>
                      <div className="tone-grid">
                        {tones.map(tone => (
                          <ToneCard
                            key={tone.id}
                            tone={tone}
                            onClick={() => handleSelectTone(tone)}
                            compact
                          />
                        ))}
                        {tones.length === 0 && (
                          <div className="empty-grid">
                            <p>No tones found.</p>
                          </div>
                        )}
                      </div>
                      <Pagination
                        page={tonesPage}
                        totalPages={tonesTotalPages}
                        onPageChange={setTonesPage}
                      />
                    </>
                  )}
                </div>
              )}

              {/* Artists section */}
              {section === 'artists' && (
                <div className="artists-section">
                  {artistsLoading ? <Spinner /> : (
                    <>
                      <div className="artist-grid">
                        {artists.map(artist => (
                          <div key={artist.id} className="artist-card">
                            {artist.avatar_url && (
                              <img src={artist.avatar_url} alt={artist.username} className="artist-avatar" />
                            )}
                            <h3 className="artist-name">@{artist.username}</h3>
                            {artist.bio && <p className="artist-bio">{artist.bio}</p>}
                            <div className="artist-stats">
                              <span>{artist.tones_count} tones</span>
                              <span>{artist.downloads_count} downloads</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Pagination
                        page={artistsPage}
                        totalPages={artistsTotalPages}
                        onPageChange={setArtistsPage}
                      />
                    </>
                  )}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <footer className="app-footer">
        <a href="/" className="back-link">← All Demos</a>
      </footer>
    </div>
  );
}
