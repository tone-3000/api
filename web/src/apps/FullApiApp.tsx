// src/apps/FullApiApp.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { PUBLISHABLE_KEY_FULL, REDIRECT_URI } from '../config';
import { startStandardFlow, startSelectFlowPopup, buildSearchTonesQuery, ApiError } from '../tone3000-client';
import {
  FORMAT_FILTER_VALUES, FORMAT_LABELS, GEAR_FILTER_VALUES, GEAR_LABELS,
} from '../labels';
import { t3kClient } from '../client';
import { fetchToneWithModels, DEMO_ARCHITECTURE, type ToneWithModels } from '../tones';
import { usePopupCallback } from '../usePopupCallback';
import { ToneCard } from '../components/ToneCard';
import { ToneDetail } from '../components/ToneDetail';
import { CreatorBadge } from '../components/CreatorBadge';
import { Pagination } from '../components/Pagination';
import { Spinner } from '../components/Spinner';
import { ErrorBanner } from '../components/ErrorBanner';
import { SuggestPicker, type Suggestion } from '../components/SuggestPicker';
import {
  TonesSort, UsersSort, TaxonomySort,
  type User, type Tone, type PublicUser, type PublicMake, type PublicTag,
  type PaginatedResponse, type Gear, Format,
} from '../types';
import t3kLogo from '../assets/t3k.svg';

type Section = 'library' | 'discover' | 'browse' | 'taxonomy' | 'creators' | 'profile';

const SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: 'library', label: 'Your Tones', icon: '🎵' },
  { id: 'discover', label: 'Discover', icon: '✨' },
  { id: 'browse', label: 'Search', icon: '🔍' },
  { id: 'taxonomy', label: 'Makes & Tags', icon: '🏷️' },
  { id: 'creators', label: 'Creators', icon: '🎸' },
  { id: 'profile', label: 'Profile', icon: '👤' },
];

/** Filters one section can hand to Search (e.g. clicking a make or creator). */
interface SearchPreset {
  tags?: string;
  makes?: string;
  creators?: string;
}

const SUGGESTION_COUNT = 8;
const toneCount = (n: number) => `${n} ${n === 1 ? 'tone' : 'tones'}`;

const suggestTags = async (query: string): Promise<Suggestion[]> =>
  (await t3kClient.listTags({ query, pageSize: SUGGESTION_COUNT, sort: TaxonomySort.Tones }))
    .data.map((t) => ({ name: t.name, hint: toneCount(t.tones_count) }));

const suggestMakes = async (query: string): Promise<Suggestion[]> =>
  (await t3kClient.listMakes({ query, pageSize: SUGGESTION_COUNT, sort: TaxonomySort.Tones }))
    .data.map((m) => ({ name: m.name, hint: toneCount(m.tones_count) }));

const suggestCreators = async (query: string): Promise<Suggestion[]> =>
  (await t3kClient.listUsers({ query, pageSize: SUGGESTION_COUNT, sort: UsersSort.Tones }))
    .data.map((u) => ({ name: u.username, hint: u.display_name ?? toneCount(u.tones_count) }));

const friendlyError = (err: unknown, fallback: string) =>
  err instanceof ApiError && err.isRateLimit ? 'Too many requests — wait a moment and try again.' : fallback;

/**
 * Search Tones is heavily rate-limited, so free-text filters can't fire a
 * request per keystroke. Inputs stay controlled by their raw state (typing
 * feels instant); only the debounced copy feeds the request.
 */
const SEARCH_DEBOUNCE_MS = 400;

function useDebounced<T>(value: T, delay = SEARCH_DEBOUNCE_MS): [T, () => void] {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  // Submitting shouldn't wait out the timer, or search the previous keystroke.
  const flush = useCallback(() => setDebounced(value), [value]);
  return [debounced, flush];
}

/** Load a paginated resource whenever `load` changes identity. */
function usePaged<T>(load: () => Promise<PaginatedResponse<T>>, onError: (msg: string) => void, errorMsg: string) {
  const [data, setData] = useState<T[]>([]);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load()
      .then((res) => { if (!cancelled) { setData(res.data); setTotalPages(res.total_pages); } })
      .catch((err) => { if (!cancelled) onError(friendlyError(err, errorMsg)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load, onError, errorMsg]);
  return { data, totalPages, loading };
}

function ToneGrid({ tones, loading, onSelect, empty = 'No tones found.' }: {
  tones: Tone[]; loading: boolean; onSelect: (t: Tone) => void; empty?: string;
}) {
  if (loading) return <Spinner />;
  return (
    <div className="tone-grid">
      {tones.map((tone) => <ToneCard key={tone.id} tone={tone} onClick={() => onSelect(tone)} compact />)}
      {tones.length === 0 && <div className="empty-grid"><p>{empty}</p></div>}
    </div>
  );
}

function GearSelect({ value, onChange }: { value: Gear | ''; onChange: (g: Gear | '') => void }) {
  return (
    <select className="select-filter" value={value} onChange={(e) => onChange(e.target.value as Gear | '')}>
      <option value="">All Gear</option>
      {GEAR_FILTER_VALUES.map((g) => <option key={g} value={g}>{GEAR_LABELS[g]}</option>)}
    </select>
  );
}

// ─── Your Tones: favorited / created / downloaded ────────────────────────────

type LibraryTab = 'favorited' | 'created' | 'downloaded';

function LibrarySection({ onSelect, onError }: { onSelect: (t: Tone) => void; onError: (m: string) => void }) {
  const [tab, setTab] = useState<LibraryTab>('favorited');
  const [gear, setGear] = useState<Gear | ''>('');
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounced(query);
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    const params = { page, pageSize: 12, gear: gear || undefined, query: debouncedQuery || undefined };
    if (tab === 'created') return t3kClient.listCreatedTones(params);
    if (tab === 'downloaded') return t3kClient.listDownloadedTones(params);
    return t3kClient.listFavoritedTones(params);
  }, [tab, gear, debouncedQuery, page]);
  const { data, totalPages, loading } = usePaged(load, onError, 'Failed to load your tones.');

  return (
    <div className="browse-section">
      <div className="tabs">
        {(['favorited', 'created', 'downloaded'] as const).map((t) => (
          <button key={t} className={`tab ${tab === t ? 'tab--active' : ''}`} onClick={() => { setTab(t); setPage(1); }}>
            {t === 'favorited' ? 'Favorites' : t === 'created' ? 'Created' : 'Downloaded'}
          </button>
        ))}
      </div>
      <div className="search-bar">
        <input
          className="search-input"
          placeholder="Filter by title…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }}
        />
        <GearSelect value={gear} onChange={(g) => { setGear(g); setPage(1); }} />
      </div>
      <ToneGrid tones={data} loading={loading} onSelect={onSelect} empty="Nothing here yet." />
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

// ─── Discover: trending + latest ─────────────────────────────────────────────

function DiscoverSection({ onSelect, onError }: { onSelect: (t: Tone) => void; onError: (m: string) => void }) {
  const [gear, setGear] = useState<Gear | ''>('');
  const [trending, setTrending] = useState<Tone[]>([]);
  const [latest, setLatest] = useState<Tone[]>([]);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [loadingLatest, setLoadingLatest] = useState(false);

  useEffect(() => {
    setLoadingTrending(true);
    t3kClient.listTrendingTones({ gear: gear || undefined })
      .then((res) => setTrending(res.data))
      .catch((err) => onError(friendlyError(err, 'Failed to load trending tones.')))
      .finally(() => setLoadingTrending(false));
  }, [gear, onError]);

  useEffect(() => {
    setLoadingLatest(true);
    t3kClient.listLatestTones()
      .then((res) => setLatest(res.data))
      .catch((err) => onError(friendlyError(err, 'Failed to load latest tones.')))
      .finally(() => setLoadingLatest(false));
  }, [onError]);

  return (
    <div className="browse-section">
      <div className="section-header">
        <h2 className="section-title">Trending</h2>
        <GearSelect value={gear} onChange={setGear} />
      </div>
      <ToneGrid tones={trending} loading={loadingTrending} onSelect={onSelect} />
      <div className="section-header section-header--spaced">
        <h2 className="section-title">Latest</h2>
      </div>
      <ToneGrid tones={latest} loading={loadingLatest} onSelect={onSelect} />
    </div>
  );
}

// ─── Search ──────────────────────────────────────────────────────────────────

function SearchSection({ preset, onSelect, onError }: {
  preset: SearchPreset; onSelect: (t: Tone) => void; onError: (m: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [gearFilter, setGearFilter] = useState<Gear | ''>('');
  const [formatFilter, setFormatFilter] = useState<Format>(Format.Nam);
  const [sort, setSort] = useState<TonesSort>(TonesSort.Trending);
  const [calibrated, setCalibrated] = useState(false);
  const [verified, setVerified] = useState(false);
  // Exact names picked from API suggestions. The client handles how each one
  // is delimited on the wire.
  const [tags, setTags] = useState<string[]>(preset.tags ? [preset.tags] : []);
  const [makes, setMakes] = useState<string[]>(preset.makes ? [preset.makes] : []);
  const [creators, setCreators] = useState<string[]>(preset.creators ? [preset.creators] : []);
  const [page, setPage] = useState(1);

  const [debouncedQuery, flushQuery] = useDebounced(query);
  const searchPending = query !== debouncedQuery;

  const params = {
    query: debouncedQuery || undefined,
    gears: gearFilter ? [gearFilter] : undefined,
    format: formatFilter,
    tags,
    makes,
    creators,
    calibrated,
    verified,
    sort,
    page,
    pageSize: 12,
    architecture: DEMO_ARCHITECTURE,
  };
  const requestUrl = `/api/v1/tones/search?${buildSearchTonesQuery(params)}`;

  // The request URL is a stable key for "the params changed".
  const load = useCallback(() => t3kClient.searchTones(params), [requestUrl]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data, totalPages, loading } = usePaged(load, onError, 'Search failed. Please try again.');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    flushQuery();
  };

  const pick = (set: (v: string[]) => void) => (v: string[]) => { set(v); setPage(1); };

  const clearFilters = () => {
    setQuery(''); setGearFilter(''); setFormatFilter(Format.Nam); setTags([]);
    setMakes([]); setCreators([]); setCalibrated(false); setVerified(false);
    setSort(TonesSort.Trending); setPage(1);
  };

  return (
    <div className="browse-section">
      <div className="info-banner">
        <span className="info-banner-icon">ℹ️</span>
        <p>
          Search is heavily rate-limited by default. For production catalog browsing,
          prefer the Select flow (the “Browse TONE3000” button above).
        </p>
      </div>

      <form className="search-bar" onSubmit={handleSearch}>
        <input className="search-input" placeholder="Search tones…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <GearSelect value={gearFilter} onChange={(g) => { setGearFilter(g); setPage(1); }} />
        <select className="select-filter" value={formatFilter} onChange={(e) => { setFormatFilter(e.target.value as Format); setPage(1); }}>
          {FORMAT_FILTER_VALUES.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
        </select>
        <select className="select-filter" value={sort} onChange={(e) => { setSort(e.target.value as TonesSort); setPage(1); }}>
          <option value={TonesSort.Trending}>Trending</option>
          <option value={TonesSort.Newest}>Newest</option>
          <option value={TonesSort.Oldest}>Oldest</option>
          <option value={TonesSort.DownloadsAllTime}>Most Downloaded</option>
          <option value={TonesSort.BestMatch}>Best Match</option>
        </select>
        <button type="submit" className="btn btn-primary">Search</button>
      </form>

      <div className="filter-panel">
        <div className="filter-grid">
          <SuggestPicker label="Tags" placeholder="Type a tag…" values={tags} onChange={pick(setTags)} suggest={suggestTags} />
          <SuggestPicker label="Makes &amp; Models" placeholder="Type a make or model…" values={makes} onChange={pick(setMakes)} suggest={suggestMakes} />
          <SuggestPicker label="Creators" placeholder="Type a username…" values={creators} onChange={pick(setCreators)} suggest={suggestCreators} />
        </div>
        <div className="filter-toggles">
          <label className="flow-option">
            <input type="checkbox" checked={calibrated} onChange={(e) => { setCalibrated(e.target.checked); setPage(1); }} />
            Calibrated only
          </label>
          <label className="flow-option">
            <input type="checkbox" checked={verified} onChange={(e) => { setVerified(e.target.checked); setPage(1); }} />
            Verified creators only
          </label>
        </div>
        <p className="filter-hint">
          Start typing to find tags, makes and creators. Values within one field are OR'd —
          a tone matches if it has any of them. Different fields are AND'd.
        </p>
        <div className="filter-actions">
          <button type="button" className="btn btn-ghost btn-small" onClick={clearFilters}>Clear filters</button>
          {searchPending && <span className="filter-pending">typing…</span>}
          <code className="filter-request-url" title={requestUrl}>{requestUrl}</code>
        </div>
      </div>

      <ToneGrid tones={data} loading={loading} onSelect={onSelect} />
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

// ─── Makes & Tags ────────────────────────────────────────────────────────────

function TaxonomyList<T extends PublicMake | PublicTag>({ title, fetch, onPick, onError }: {
  title: string;
  fetch: (p: { query?: string; sort: TaxonomySort; pageSize: number; page: number }) => Promise<PaginatedResponse<T>>;
  onPick: (name: string) => void;
  onError: (m: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounced(query);
  const [sort, setSort] = useState<TaxonomySort>(TaxonomySort.Tones);
  const [page, setPage] = useState(1);
  const load = useCallback(
    () => fetch({ query: debouncedQuery || undefined, sort, pageSize: 25, page }),
    [fetch, debouncedQuery, sort, page],
  );
  const { data, totalPages, loading } = usePaged(load, onError, `Failed to load ${title.toLowerCase()}.`);

  return (
    <div className="taxonomy-column">
      <h2 className="section-title">{title}</h2>
      <div className="search-bar">
        <input className="search-input" placeholder={`Search ${title.toLowerCase()}…`} value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
        <select className="select-filter" value={sort} onChange={(e) => { setSort(e.target.value as TaxonomySort); setPage(1); }}>
          <option value={TaxonomySort.Tones}>Most tones</option>
          <option value={TaxonomySort.Name}>A–Z</option>
        </select>
      </div>
      {loading ? <Spinner /> : (
        <div className="taxonomy-chips">
          {data.map((item) => (
            <button key={item.id} className="taxonomy-chip" onClick={() => onPick(item.name)} title="Search tones with this">
              {item.name} <span className="taxonomy-count">{item.tones_count}</span>
            </button>
          ))}
          {data.length === 0 && <p className="empty-list">No matches.</p>}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

const fetchMakes = (p: Parameters<typeof t3kClient.listMakes>[0]) => t3kClient.listMakes(p);
const fetchTags = (p: Parameters<typeof t3kClient.listTags>[0]) => t3kClient.listTags(p);

// ─── Creators ────────────────────────────────────────────────────────────────

function CreatorsSection({ onPick, onError }: { onPick: (username: string) => void; onError: (m: string) => void }) {
  const [query, setQuery] = useState('');
  const [debouncedQuery] = useDebounced(query);
  const [sort, setSort] = useState<UsersSort>(UsersSort.Tones);
  const [page, setPage] = useState(1);
  const load = useCallback(
    () => t3kClient.listUsers({ page, pageSize: 10, sort, query: debouncedQuery || undefined }),
    [page, sort, debouncedQuery],
  );
  const { data, totalPages, loading } = usePaged<PublicUser>(load, onError, 'Failed to load creators.');

  return (
    <div className="artists-section">
      <div className="search-bar">
        <input className="search-input" placeholder="Search usernames…" value={query}
          onChange={(e) => { setQuery(e.target.value); setPage(1); }} />
        <select className="select-filter" value={sort} onChange={(e) => { setSort(e.target.value as UsersSort); setPage(1); }}>
          <option value={UsersSort.Tones}>Most tones</option>
          <option value={UsersSort.Downloads}>Most downloads</option>
          <option value={UsersSort.Favorites}>Most favorites</option>
          <option value={UsersSort.Models}>Most models</option>
        </select>
      </div>
      {loading ? <Spinner /> : (
        <div className="artist-grid">
          {data.map((artist) => (
            <button key={artist.id} className="artist-card" onClick={() => onPick(artist.username)}>
              <CreatorBadge user={artist} size="large" />
              {artist.bio && <p className="artist-bio">{artist.bio}</p>}
              <div className="artist-stats">
                <span>{artist.tones_count} tones</span>
                <span>{artist.downloads_count} downloads</span>
              </div>
            </button>
          ))}
        </div>
      )}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  );
}

// ─── Profile ─────────────────────────────────────────────────────────────────

function ProfileSection({ user }: { user: User | null }) {
  if (!user) return <Spinner />;
  return (
    <div className="profile-section">
      <div className="profile-card">
        <CreatorBadge user={user} size="large" />
        {user.bio && <p className="profile-bio">{user.bio}</p>}
        {user.links?.map((link) => (
          <a key={link} href={link} target="_blank" rel="noopener noreferrer" className="profile-link">{link}</a>
        ))}
        <div className="profile-meta">
          <span>@{user.username} · Joined {new Date(user.created_at).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export function FullApiApp() {
  const [connected, setConnected] = useState(t3kClient.isConnected());
  const [section, setSection] = useState<Section>('library');
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [searchPreset, setSearchPreset] = useState<SearchPreset>({});
  const [searchKey, setSearchKey] = useState(0);
  const [selectedTone, setSelectedTone] = useState<ToneWithModels | null>(null);
  const [toneDetailLoading, setToneDetailLoading] = useState(false);
  const selectPopup = useRef<Window | null>(null);

  const onError = useCallback((msg: string) => setError(msg), []);

  useEffect(() => {
    if (!connected) return;
    t3kClient.getUser().then(setUser).catch(() => setError('Failed to load profile.'));
  }, [connected]);

  const openTone = useCallback(async (toneId: number | string) => {
    setToneDetailLoading(true);
    setSelectedTone(null);
    try {
      setSelectedTone(await fetchToneWithModels(toneId));
    } catch (err) {
      setError(friendlyError(err, 'Failed to load tone details.'));
    } finally {
      setToneDetailLoading(false);
    }
  }, []);

  // "Browse TONE3000" — the Select flow as the persistent path to the full catalog.
  usePopupCallback(PUBLISHABLE_KEY_FULL, (result) => {
    if (!result.ok) {
      if (result.error !== 'canceled') setError('Authentication failed. Please try again.');
      return;
    }
    t3kClient.setTokens(result.tokens);
    if (result.toneId) void openTone(result.toneId);
  });

  const browseTone3000 = () => {
    startSelectFlowPopup(PUBLISHABLE_KEY_FULL, REDIRECT_URI, {
      menubar: true, preview: true, architecture: DEMO_ARCHITECTURE,
    }).then((popup) => { selectPopup.current = popup; });
  };

  const handleConnect = () => {
    sessionStorage.setItem('t3k_pending_demo', 'full-api');
    void startStandardFlow(PUBLISHABLE_KEY_FULL, REDIRECT_URI);
  };

  const handleDisconnect = () => {
    t3kClient.clearTokens();
    setConnected(false);
    setUser(null);
    setSelectedTone(null);
  };

  const switchSection = (s: Section) => {
    setSection(s);
    setSelectedTone(null);
    setError(null);
  };

  const searchWith = (preset: SearchPreset) => {
    setSearchPreset(preset);
    setSearchKey((k) => k + 1); // remount Search with the new filters
    switchSection('browse');
  };

  if (!connected) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="app-brand">
            <div className="app-logo-block">
              <span className="app-logo-icon">🗄️</span>
              <span className="app-name">Chord Inc</span>
            </div>
            <span className="app-tagline">Tone Discovery & Management</span>
          </div>
        </header>
        <main className="app-main">
          <div className="connect-state">
            <img src={t3kLogo} alt="TONE3000" className="connect-state-logo" />
            <h2 className="connect-state-title">Chord Inc × TONE3000</h2>
            <p className="connect-state-desc">
              Chord Inc has partnered with TONE3000 to give you access to a massive library of
              Neural Amp Modeler (NAM) captures and IRs of real analog gear, created by a global
              community of musicians.
            </p>
            <button className="btn btn-primary btn-t3k btn-large" onClick={handleConnect}>
              Continue
            </button>
          </div>
        </main>
        <footer className="app-footer">
          <a href="/" className="back-link">← All Demos</a>
        </footer>
      </div>
    );
  }

  const showTone = (t: Tone) => void openTone(t.id);

  return (
    <div className="app-shell app-shell--full">
      <header className="app-header">
        <div className="app-brand">
          <div className="app-logo-block">
            <span className="app-logo-icon">🗄️</span>
            <span className="app-name">Chord Inc</span>
          </div>
        </div>
        <div className="header-actions">
          {user && <CreatorBadge user={user} />}
          <button className="btn btn-primary btn-small btn-t3k" onClick={browseTone3000}>
            <img src={t3kLogo} alt="" className="btn-logo" />
            Browse TONE3000
          </button>
          <button className="btn btn-ghost btn-small" onClick={handleDisconnect}>Disconnect</button>
        </div>
      </header>

      <div className="full-app-layout">
        <nav className="sidebar">
          {SECTIONS.map((item) => (
            <button
              key={item.id}
              className={`sidebar-item ${section === item.id ? 'sidebar-item--active' : ''}`}
              onClick={() => switchSection(item.id)}
            >
              <span className="sidebar-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <main className="full-app-main">
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          {toneDetailLoading && (
            <div className="tone-detail-page-loading"><Spinner /><p>Loading tone…</p></div>
          )}

          {selectedTone && !toneDetailLoading && (
            <ToneDetail tone={selectedTone} onBack={() => setSelectedTone(null)} onChange={setSelectedTone} />
          )}

          {/* Sections stay mounted under the detail view so filters survive "Back". */}
          <div hidden={Boolean(selectedTone || toneDetailLoading)}>
            {section === 'library' && <LibrarySection onSelect={showTone} onError={onError} />}
            {section === 'discover' && <DiscoverSection onSelect={showTone} onError={onError} />}
            {section === 'browse' && (
              <SearchSection key={searchKey} preset={searchPreset} onSelect={showTone} onError={onError} />
            )}
            {section === 'taxonomy' && (
              <div className="taxonomy-section">
                <TaxonomyList title="Makes" fetch={fetchMakes} onPick={(name) => searchWith({ makes: name })} onError={onError} />
                <TaxonomyList title="Tags" fetch={fetchTags} onPick={(name) => searchWith({ tags: name })} onError={onError} />
              </div>
            )}
            {section === 'creators' && <CreatorsSection onPick={(u) => searchWith({ creators: u })} onError={onError} />}
            {section === 'profile' && <ProfileSection user={user} />}
          </div>
        </main>
      </div>

      <footer className="app-footer">
        <a href="/" className="back-link">← All Demos</a>
      </footer>
    </div>
  );
}
