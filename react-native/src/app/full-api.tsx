import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SuggestPicker, type Suggestion } from '@/components/SuggestPicker';
import { useLoad } from '@/components/useLoad';
import {
  Button,
  CenteredProgress,
  Chip,
  ChipSelect,
  colors,
  CreatorBadge,
  ErrorBanner,
  InfoBanner,
  Muted,
  Pager,
  SearchField,
  SectionHeader,
  ToneRow,
  styles as ui,
} from '@/components/ui';
import { flowErrorMessage, useAuthFlow } from '@/t3k/auth';
import { t3kClient, useConnected } from '@/t3k/client';
import { FORMAT_FILTER_VALUES, formatLabel, GEAR_FILTER_VALUES, gearLabel } from '@/t3k/labels';
import { selectToneParams, standardParams } from '@/t3k/tone3000-client';
import { DEMO_ARCHITECTURE } from '@/t3k/tones';
import {
  TaxonomySort,
  TonesSort,
  UsersSort,
  Format,
  type Gear,
  type PaginatedResponse,
  type PublicMake,
  type PublicTag,
  type PublicUser,
  type SearchTonesParams,
  type Tone,
} from '@/t3k/types';

const TABS = ['Library', 'Discover', 'Search', 'Catalog', 'Profile'] as const;
type Tab = (typeof TABS)[number];

type OpenTone = (tone: Tone) => void;

/**
 * Chord Inc — Full API. A custom tone UI built on the REST API, plus a
 * persistent "Browse" Select entry point into the full catalog.
 */
export default function FullApiDemo() {
  const router = useRouter();
  const startFlow = useAuthFlow();
  const connected = useConnected();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('Library');
  const [searchPreset, setSearchPreset] = useState<SearchTonesParams>({});
  const [searchKey, setSearchKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const open: OpenTone = (tone) => router.push(`/tone/${tone.id}`);

  const search = (params: SearchTonesParams) => {
    setSearchPreset(params);
    setSearchKey((k) => k + 1);
    setTab('Search');
  };

  const browse = async () => {
    const result = await startFlow(selectToneParams({ architecture: DEMO_ARCHITECTURE, preview: true, menubar: true }), 'Browse TONE3000');
    if (result.status === 'error') setError(flowErrorMessage(result.error));
    else if (result.status === 'connected' && result.toneId) router.push(`/tone/${result.toneId}`);
  };

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          headerRight: connected
            ? () => (
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <Pressable onPress={browse} hitSlop={8}>
                    <Text style={{ color: colors.primary }}>Browse</Text>
                  </Pressable>
                  <Pressable onPress={() => t3kClient.clearTokens()} hitSlop={8}>
                    <Text style={{ color: colors.danger }}>Disconnect</Text>
                  </Pressable>
                </View>
              )
            : undefined,
        }}
      />
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {!connected ? (
        <ConnectPanel onError={setError} />
      ) : (
        <>
          <View style={{ flex: 1 }}>
            {tab === 'Library' && <LibraryTab open={open} />}
            {tab === 'Discover' && <DiscoverTab open={open} />}
            {tab === 'Search' && <SearchTab key={searchKey} initial={searchPreset} open={open} />}
            {tab === 'Catalog' && <CatalogTab onSearch={search} />}
            {tab === 'Profile' && <ProfileTab />}
          </View>
          <View style={[styles.tabBar, { paddingBottom: insets.bottom }]}>
            {TABS.map((t) => (
              <Pressable key={t} onPress={() => setTab(t)} style={styles.tab}>
                <Text style={[styles.tabText, tab === t && { color: colors.primary, fontWeight: '600' }]}>{t}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

function ConnectPanel({ onError }: { onError: (message: string) => void }) {
  const startFlow = useAuthFlow();
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    const result = await startFlow(standardParams({ menubar: true }), 'Connect TONE3000');
    setBusy(false);
    if (result.status === 'error') onError(flowErrorMessage(result.error));
  };
  return (
    <View style={styles.connect}>
      <Text style={styles.connectTitle}>Chord Inc × TONE3000</Text>
      <Muted>
        Connect your TONE3000 account to browse a massive library of Neural Amp Modeler captures and IRs of real gear,
        created by a global community of musicians.
      </Muted>
      <Button title="Continue" busy={busy} onPress={connect} style={{ alignSelf: 'stretch' }} />
    </View>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────

const gearOptions = [[undefined, 'All'], ...GEAR_FILTER_VALUES.map((g) => [g as Gear, gearLabel(g)] as const)] as const;

function ToneResults({
  tones,
  error,
  loading,
  open,
  empty = 'No tones found.',
}: {
  tones: Tone[] | undefined;
  error: string | null;
  loading: boolean;
  open: OpenTone;
  empty?: string;
}) {
  if (error) return <ErrorBanner message={error} />;
  if (!tones || (loading && tones.length === 0)) return <CenteredProgress />;
  if (tones.length === 0) {
    return (
      <View style={{ padding: 16 }}>
        <Muted>{empty}</Muted>
      </View>
    );
  }
  return (
    <View style={loading && { opacity: 0.5 }}>
      {tones.map((tone) => (
        <ToneRow key={tone.id} tone={tone} onPress={() => open(tone)} />
      ))}
    </View>
  );
}

// ─── Library ──────────────────────────────────────────────────────────────────

const LIBRARY_LISTS = [
  ['favorited', 'Favorited'],
  ['created', 'Created'],
  ['downloaded', 'Downloaded'],
] as const;
type LibraryList = (typeof LIBRARY_LISTS)[number][0];

function LibraryTab({ open }: { open: OpenTone }) {
  const [list, setList] = useState<LibraryList>('favorited');
  const [gear, setGear] = useState<Gear | undefined>();
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading } = useLoad(JSON.stringify([list, gear, query, page]), () => {
    const params = { gear, query: query || undefined, page, pageSize: 20 };
    if (list === 'created') return t3kClient.listCreatedTones(params);
    if (list === 'downloaded') return t3kClient.listDownloadedTones(params);
    return t3kClient.listFavoritedTones(params);
  });

  return (
    <ScrollView contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled">
      <ChipSelect value={list} options={LIBRARY_LISTS} onChange={(l) => { setList(l); setPage(1); }} />
      <SearchField value={query} placeholder="Filter by title" onChange={(q) => { setQuery(q); setPage(1); }} />
      <ChipSelect label="Gear" value={gear} options={gearOptions} onChange={(g) => { setGear(g); setPage(1); }} />
      <ToneResults tones={data?.data} error={error} loading={loading} open={open} empty="Nothing here yet." />
      {data && <Pager page={page} totalPages={data.total_pages} onChange={setPage} />}
    </ScrollView>
  );
}

// ─── Discover ─────────────────────────────────────────────────────────────────

function DiscoverTab({ open }: { open: OpenTone }) {
  const [gear, setGear] = useState<Gear | undefined>();
  const trending = useLoad(`trending-${gear}`, () => t3kClient.listTrendingTones({ gear }), 0);
  const latest = useLoad('latest', () => t3kClient.listLatestTones(), 0);
  return (
    <ScrollView contentContainerStyle={ui.screen}>
      <SectionHeader>Trending</SectionHeader>
      <ChipSelect value={gear} options={gearOptions} onChange={setGear} />
      <ToneResults tones={trending.data?.data} error={trending.error} loading={trending.loading} open={open} />
      <SectionHeader>Latest</SectionHeader>
      <ToneResults tones={latest.data?.data} error={latest.error} loading={latest.loading} open={open} />
    </ScrollView>
  );
}

// ─── Search ───────────────────────────────────────────────────────────────────

const sortOptions = [
  [TonesSort.BestMatch, 'Best match'],
  [TonesSort.Trending, 'Trending'],
  [TonesSort.Newest, 'Newest'],
  [TonesSort.Oldest, 'Oldest'],
  [TonesSort.DownloadsAllTime, 'Most downloaded'],
] as const;

const formatOptions = FORMAT_FILTER_VALUES.map((f) => [f as Format, formatLabel(f)] as const);

const SUGGESTION_COUNT = 8;
const toneCount = (n: number) => `${n} ${n === 1 ? 'tone' : 'tones'}`;

const suggestTags = async (query: string): Promise<Suggestion[]> =>
  (await t3kClient.listTags({ query, pageSize: SUGGESTION_COUNT, sort: TaxonomySort.Tones })).data.map((t) => ({
    name: t.name,
    hint: toneCount(t.tones_count),
  }));

const suggestMakes = async (query: string): Promise<Suggestion[]> =>
  (await t3kClient.listMakes({ query, pageSize: SUGGESTION_COUNT, sort: TaxonomySort.Tones })).data.map((m) => ({
    name: m.name,
    hint: toneCount(m.tones_count),
  }));

const suggestCreators = async (query: string): Promise<Suggestion[]> =>
  (await t3kClient.listUsers({ query, pageSize: SUGGESTION_COUNT, sort: UsersSort.Tones })).data.map((u) => ({
    name: u.username,
    hint: u.display_name ?? toneCount(u.tones_count),
  }));

function SearchTab({ initial, open }: { initial: SearchTonesParams; open: OpenTone }) {
  const [params, setParams] = useState<SearchTonesParams>({ page: 1, format: Format.Nam, ...initial, architecture: DEMO_ARCHITECTURE });
  const update = (patch: Partial<SearchTonesParams>) => setParams((p) => ({ ...p, ...patch, page: 1 }));
  // Search is heavily rate-limited: wait for typing to settle.
  const { data, error, loading } = useLoad(JSON.stringify(params), () => t3kClient.searchTones(params), 400);

  return (
    <ScrollView contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled">
      <InfoBanner message="Search is heavily rate-limited. For catalog browsing in production, prefer the Select flow (Browse)." />
      <SearchField value={params.query ?? ''} placeholder="Search tones" onChange={(query) => update({ query })} />
      <ChipSelect label="Sort" value={params.sort ?? TonesSort.BestMatch} options={sortOptions} onChange={(sort) => update({ sort })} />
      <ChipSelect label="Gear" value={params.gears?.[0]} options={gearOptions} onChange={(g) => update({ gears: g ? [g] : undefined })} />
      <ChipSelect label="Format" value={params.format} options={formatOptions} onChange={(format) => update({ format })} />
      <View style={[ui.chips, { flexDirection: 'row' }]}>
        <Chip text="Calibrated" selected={!!params.calibrated} onPress={() => update({ calibrated: !params.calibrated })} />
        <Chip text="Verified creators" selected={!!params.verified} onPress={() => update({ verified: !params.verified })} />
      </View>
      <SuggestPicker label="Tags" placeholder="Type a tag" values={params.tags ?? []} onChange={(tags) => update({ tags })} suggest={suggestTags} />
      <SuggestPicker label="Makes & models" placeholder="Type a make or model" values={params.makes ?? []} onChange={(makes) => update({ makes })} suggest={suggestMakes} />
      <SuggestPicker label="Creators" placeholder="Type a username" values={params.creators ?? []} onChange={(creators) => update({ creators })} suggest={suggestCreators} />
      <View style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
        <Muted small>Values within a field are OR&apos;d, fields are AND&apos;d.</Muted>
      </View>
      <ToneResults tones={data?.data} error={error} loading={loading} open={open} />
      {data && <Pager page={params.page ?? 1} totalPages={data.total_pages} onChange={(page) => setParams((p) => ({ ...p, page }))} />}
    </ScrollView>
  );
}

// ─── Catalog: makes, tags, creators ───────────────────────────────────────────

const CATALOG_KINDS = [
  ['makes', 'Makes'],
  ['tags', 'Tags'],
  ['creators', 'Creators'],
] as const;
type CatalogKind = (typeof CATALOG_KINDS)[number][0];

const taxonomySortOptions = [
  [TaxonomySort.Tones, 'Most tones'],
  [TaxonomySort.Name, 'Name'],
] as const;

const usersSortOptions = [
  [UsersSort.Tones, 'Tones'],
  [UsersSort.Downloads, 'Downloads'],
  [UsersSort.Favorites, 'Favorites'],
  [UsersSort.Models, 'Models'],
] as const;

function CatalogTab({ onSearch }: { onSearch: (params: SearchTonesParams) => void }) {
  const [kind, setKind] = useState<CatalogKind>('makes');
  const [query, setQuery] = useState('');
  const [taxonomySort, setTaxonomySort] = useState(TaxonomySort.Tones);
  const [usersSort, setUsersSort] = useState(UsersSort.Tones);
  const [page, setPage] = useState(1);
  const { data, error, loading } = useLoad<PaginatedResponse<PublicMake | PublicTag | PublicUser>>(
    JSON.stringify([kind, query, taxonomySort, usersSort, page]),
    () => {
      const q = query || undefined;
      if (kind === 'creators') return t3kClient.listUsers({ query: q, sort: usersSort, page });
      if (kind === 'tags') return t3kClient.listTags({ query: q, sort: taxonomySort, page });
      return t3kClient.listMakes({ query: q, sort: taxonomySort, page });
    },
  );

  return (
    <ScrollView contentContainerStyle={ui.screen} keyboardShouldPersistTaps="handled">
      <ChipSelect value={kind} options={CATALOG_KINDS} onChange={(k) => { setKind(k); setPage(1); }} />
      <SearchField value={query} placeholder={`Search ${kind}`} onChange={(q) => { setQuery(q); setPage(1); }} />
      {kind === 'creators' ? (
        <ChipSelect label="Sort" value={usersSort} options={usersSortOptions} onChange={(s) => { setUsersSort(s); setPage(1); }} />
      ) : (
        <ChipSelect label="Sort" value={taxonomySort} options={taxonomySortOptions} onChange={(s) => { setTaxonomySort(s); setPage(1); }} />
      )}
      <View style={{ paddingHorizontal: 16, paddingVertical: 4 }}>
        <Muted small>Tap an entry to search tones with it.</Muted>
      </View>
      {error ? (
        <ErrorBanner message={error} />
      ) : loading && !data ? (
        <CenteredProgress />
      ) : (
        data?.data.map((entry) =>
          'username' in entry ? (
            <Pressable key={entry.id} style={[ui.row, { flexDirection: 'column', alignItems: 'flex-start' }]} onPress={() => onSearch({ creators: [entry.username] })}>
              <CreatorBadge user={entry} large />
              {entry.bio ? <Muted small>{entry.bio}</Muted> : null}
              <Muted small>
                {entry.tones_count} tones · {entry.downloads_count} downloads
              </Muted>
            </Pressable>
          ) : (
            <Pressable
              key={entry.id}
              style={ui.row}
              onPress={() => onSearch(kind === 'makes' ? { makes: [entry.name] } : { tags: [entry.name] })}
            >
              <Text style={{ flex: 1, color: colors.text }}>{entry.name}</Text>
              <Muted>{entry.tones_count}</Muted>
            </Pressable>
          ),
        )
      )}
      {data && <Pager page={page} totalPages={data.total_pages} onChange={setPage} />}
    </ScrollView>
  );
}

// ─── Profile ──────────────────────────────────────────────────────────────────

function ProfileTab() {
  const { data: user, error } = useLoad('profile', () => t3kClient.getUser(), 0);
  if (error) return <ErrorBanner message={error} />;
  if (!user) return <CenteredProgress />;
  return (
    <ScrollView contentContainerStyle={[ui.screen, { padding: 16, gap: 8 }]}>
      <CreatorBadge user={user} large />
      {user.bio ? <Muted>{user.bio}</Muted> : null}
      <Text style={{ color: colors.text }}>@{user.username}</Text>
      <Muted small>Joined {user.created_at.slice(0, 10)}</Muted>
      {user.links?.map((link) => (
        <Text key={link} style={{ color: colors.primary }} onPress={() => Linking.openURL(link)}>
          {link}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  connect: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  connectTitle: { fontSize: 22, fontWeight: '700', color: colors.text },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: '#fff',
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  tabText: { fontSize: 12, color: colors.muted },
});
