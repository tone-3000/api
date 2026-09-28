package com.example.tone3000.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.LibraryMusic
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.GridView
import androidx.compose.material.icons.filled.GraphicEq
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Sell
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.example.tone3000.T3K
import com.example.tone3000.t3k.AuthManager
import com.example.tone3000.t3k.Format
import com.example.tone3000.t3k.T3KConfig
import com.example.tone3000.t3k.Gear
import com.example.tone3000.t3k.LibraryList
import com.example.tone3000.t3k.OAuthCanceledException
import com.example.tone3000.t3k.Page
import com.example.tone3000.t3k.PublicUser
import com.example.tone3000.t3k.SearchTonesParams
import com.example.tone3000.t3k.SelectOptions
import com.example.tone3000.t3k.TaxonomyItem
import com.example.tone3000.t3k.TaxonomySort
import com.example.tone3000.t3k.Tone
import com.example.tone3000.t3k.TonesSort
import com.example.tone3000.t3k.User
import com.example.tone3000.t3k.UsersSort
import com.example.tone3000.t3k.userMessage
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private enum class FullApiTab(val label: String) { LIBRARY("Library"), DISCOVER("Discover"), SEARCH("Search"), CATALOG("Catalog"), PROFILE("Profile") }

/**
 * Chord Inc — Full API. A custom tone UI built on the REST API, plus a
 * persistent "Browse TONE3000" Select entry point into the full catalog.
 */
@Composable
fun FullApiDemoScreen(onBack: () -> Unit, openTone: (Int) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var connected by remember { mutableStateOf(T3K.client.isConnected()) }
    var tab by remember { mutableStateOf(FullApiTab.LIBRARY) }
    var searchPreset by remember { mutableStateOf(SearchTonesParams()) }
    var searchKey by remember { mutableIntStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }
    val open: (Tone) -> Unit = { openTone(it.id) }

    fun search(params: SearchTonesParams) {
        searchPreset = params
        searchKey++
        tab = FullApiTab.SEARCH
    }

    DemoScaffold(
        "Chord Inc",
        onBack,
        actions = {
            if (connected) {
                IconButton(onClick = {
                    scope.launch {
                        try {
                            AuthManager.startSelectFlow(context, SelectOptions()).toneId?.let(openTone)
                        } catch (_: OAuthCanceledException) {
                        } catch (e: Exception) {
                            error = e.userMessage
                        }
                    }
                }) { Icon(Icons.Filled.GridView, contentDescription = "Browse TONE3000") }
                IconButton(onClick = { T3K.client.clearTokens(); connected = false }) {
                    Icon(Icons.AutoMirrored.Filled.Logout, contentDescription = "Disconnect")
                }
            }
        },
        bottomBar = {
            if (connected) {
                NavigationBar {
                    FullApiTab.entries.forEach { item ->
                        NavigationBarItem(
                            selected = tab == item,
                            onClick = { tab = item },
                            icon = {
                                Icon(
                                    when (item) {
                                        FullApiTab.LIBRARY -> Icons.Filled.LibraryMusic
                                        FullApiTab.DISCOVER -> Icons.Filled.AutoAwesome
                                        FullApiTab.SEARCH -> Icons.Filled.Search
                                        FullApiTab.CATALOG -> Icons.Filled.Sell
                                        FullApiTab.PROFILE -> Icons.Filled.AccountCircle
                                    },
                                    contentDescription = null,
                                )
                            },
                            label = { Text(item.label) },
                        )
                    }
                }
            }
        },
    ) { modifier ->
        Column(modifier) {
            error?.let { ErrorBanner(it) { error = null } }
            if (!connected) {
                ConnectPanel {
                    try {
                        AuthManager.startStandardFlow(context)
                        connected = true
                    } catch (_: OAuthCanceledException) {
                    } catch (e: Exception) {
                        error = e.userMessage
                    }
                }
            } else {
                when (tab) {
                    FullApiTab.LIBRARY -> LibraryTab(open)
                    FullApiTab.DISCOVER -> DiscoverTab(open)
                    FullApiTab.SEARCH -> key(searchKey) { SearchTab(searchPreset, open) }
                    FullApiTab.CATALOG -> CatalogTab(::search)
                    FullApiTab.PROFILE -> ProfileTab()
                }
            }
        }
    }
}

@Composable
private fun ConnectPanel(connect: suspend () -> Unit) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxSize().padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
    ) {
        Icon(Icons.Filled.GraphicEq, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        Text("Chord Inc × TONE3000", style = MaterialTheme.typography.headlineSmall)
        Text(
            "Connect your TONE3000 account to browse a massive library of Neural Amp Modeler captures and IRs of real gear, created by a global community of musicians.",
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        T3KButton("Continue", busy = busy) {
            scope.launch {
                busy = true
                connect()
                busy = false
            }
        }
    }
}

// MARK: - Shared -------------------------------------------------------------------

/** Debounced loader: re-runs [load] 300 ms after [key] stops changing. */
@Composable
private fun <T> rememberDebouncedLoad(key: Any, delayMs: Long = 300, load: suspend () -> T): Triple<T?, String?, Boolean> {
    var result by remember { mutableStateOf<T?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }
    LaunchedEffect(key) {
        loading = true
        delay(delayMs)
        try {
            result = load()
            error = null
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            error = e.userMessage
        } finally {
            loading = false
        }
    }
    return Triple(result, error, loading)
}

private fun LazyListScope.toneResults(tones: List<Tone>?, error: String?, loading: Boolean, open: (Tone) -> Unit, empty: String = "No tones found.") {
    when {
        error != null -> item { ErrorBanner(error) }
        tones == null || (loading && tones.isEmpty()) -> item { CenteredProgress() }
        tones.isEmpty() -> item { Text(empty, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(16.dp)) }
        else -> items(tones, key = { it.id }) { ToneRow(it) { open(it) } }
    }
}

@Composable
private fun GearMenu(gear: Gear?, onSelect: (Gear?) -> Unit) {
    OptionMenu("Gear", gear, listOf<Pair<Gear?, String>>(null to "All") + Gear.entries.map { it to it.label }, onSelect)
}

@Composable
private fun SearchField(value: String, placeholder: String, onChange: (String) -> Unit) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        placeholder = { Text(placeholder) },
        singleLine = true,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
    )
}

// MARK: - Library ------------------------------------------------------------------

@Composable
private fun LibraryTab(open: (Tone) -> Unit) {
    var list by remember { mutableStateOf(LibraryList.FAVORITED) }
    var gear by remember { mutableStateOf<Gear?>(null) }
    var query by remember { mutableStateOf("") }
    var page by remember { mutableIntStateOf(1) }
    val (result, error, loading) = rememberDebouncedLoad(listOf(list, gear, query, page)) {
        T3K.client.listLibrary(list, gear, query, page)
    }

    LazyColumn {
        item {
            TabRow(selectedTabIndex = list.ordinal) {
                LibraryList.entries.forEach { entry ->
                    Tab(selected = list == entry, onClick = { list = entry; page = 1 }, text = { Text(entry.label) })
                }
            }
            SearchField(query, "Filter by title") { query = it; page = 1 }
            Row(Modifier.padding(horizontal = 16.dp)) { GearMenu(gear) { gear = it; page = 1 } }
        }
        toneResults(result?.data, error, loading, open, empty = "Nothing here yet.")
        item { result?.let { Pager(page, it.totalPages) { p -> page = p } } }
    }
}

// MARK: - Discover -----------------------------------------------------------------

@Composable
private fun DiscoverTab(open: (Tone) -> Unit) {
    var gear by remember { mutableStateOf<Gear?>(null) }
    val (trending, trendingError, trendingLoading) = rememberDebouncedLoad(listOf("trending", gear), delayMs = 0) {
        T3K.client.listTrendingTones(gear).data
    }
    val (latest, latestError, latestLoading) = rememberDebouncedLoad("latest", delayMs = 0) {
        T3K.client.listLatestTones().data
    }

    LazyColumn {
        item {
            SectionHeader("Trending")
            Row(Modifier.padding(horizontal = 16.dp)) { GearMenu(gear) { gear = it } }
        }
        toneResults(trending, trendingError, trendingLoading, open)
        item { SectionHeader("Latest") }
        toneResults(latest, latestError, latestLoading, open)
    }
}

// MARK: - Search -------------------------------------------------------------------

private const val SUGGESTION_COUNT = 8

private fun toneCount(n: Int) = "$n ${if (n == 1) "tone" else "tones"}"

private suspend fun suggestTags(query: String) =
    T3K.client.listTags(query, pageSize = SUGGESTION_COUNT).data.map { Suggestion(it.name, toneCount(it.tonesCount)) }

private suspend fun suggestMakes(query: String) =
    T3K.client.listMakes(query, pageSize = SUGGESTION_COUNT).data.map { Suggestion(it.name, toneCount(it.tonesCount)) }

private suspend fun suggestCreators(query: String) =
    T3K.client.listUsers(query, pageSize = SUGGESTION_COUNT).data.map { Suggestion(it.username, it.displayName ?: toneCount(it.tonesCount)) }

@Composable
private fun SearchTab(initial: SearchTonesParams, open: (Tone) -> Unit) {
    var params by remember {
        mutableStateOf(initial.copy(format = initial.format ?: Format.NAM, architecture = T3KConfig.demoArchitecture))
    }
    // Search is heavily rate-limited: wait for typing to settle.
    val (result, error, loading) = rememberDebouncedLoad(params, delayMs = 400) { T3K.client.searchTones(params) }

    LazyColumn {
        item {
            InfoBanner("Search is heavily rate-limited. For catalog browsing in production, prefer the Select flow (Browse TONE3000).")
            SearchField(params.query, "Search tones") { params = params.copy(query = it, page = 1) }
            Row(
                Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OptionMenu("Sort", params.sort, TonesSort.entries.map { it to it.label }) { params = params.copy(sort = it, page = 1) }
                GearMenu(params.gears.firstOrNull()) { params = params.copy(gears = listOfNotNull(it), page = 1) }
                OptionMenu("Format", params.format, listOf(Format.NAM, Format.IR).map<Format, Pair<Format?, String>> { it to it.label }) {
                    params = params.copy(format = it, page = 1)
                }
            }
            Row(Modifier.padding(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(params.calibrated, { params = params.copy(calibrated = !params.calibrated, page = 1) }, label = { Text("Calibrated") })
                FilterChip(params.verified, { params = params.copy(verified = !params.verified, page = 1) }, label = { Text("Verified creators") })
            }
            SuggestPicker("Tags", "Type a tag", params.tags, { params = params.copy(tags = it, page = 1) }, ::suggestTags)
            SuggestPicker("Makes & models", "Type a make or model", params.makes, { params = params.copy(makes = it, page = 1) }, ::suggestMakes)
            SuggestPicker("Creators", "Type a username", params.creators, { params = params.copy(creators = it, page = 1) }, ::suggestCreators)
            Text(
                "Values within a field are OR'd, fields are AND'd.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }
        toneResults(result?.data, error, loading, open)
        item { result?.let { Pager(params.page, it.totalPages) { p -> params = params.copy(page = p) } } }
    }
}

// MARK: - Catalog: makes, tags, creators -----------------------------------------------

private enum class CatalogKind(val label: String) { MAKES("Makes"), TAGS("Tags"), CREATORS("Creators") }

@Composable
private fun CatalogTab(onSearch: (SearchTonesParams) -> Unit) {
    var kind by remember { mutableStateOf(CatalogKind.MAKES) }
    var query by remember { mutableStateOf("") }
    var taxonomySort by remember { mutableStateOf(TaxonomySort.TONES) }
    var usersSort by remember { mutableStateOf(UsersSort.TONES) }
    var page by remember { mutableIntStateOf(1) }
    val (result, error, loading) = rememberDebouncedLoad<Page<*>>(listOf(kind, query, taxonomySort, usersSort, page)) {
        when (kind) {
            CatalogKind.MAKES -> T3K.client.listMakes(query, taxonomySort, page)
            CatalogKind.TAGS -> T3K.client.listTags(query, taxonomySort, page)
            CatalogKind.CREATORS -> T3K.client.listUsers(query, usersSort, page)
        }
    }

    LazyColumn {
        item {
            TabRow(selectedTabIndex = kind.ordinal) {
                CatalogKind.entries.forEach { entry ->
                    Tab(selected = kind == entry, onClick = { kind = entry; page = 1 }, text = { Text(entry.label) })
                }
            }
            SearchField(query, "Search ${kind.label.lowercase()}") { query = it; page = 1 }
            Row(Modifier.padding(horizontal = 16.dp)) {
                if (kind == CatalogKind.CREATORS) {
                    OptionMenu("Sort", usersSort, UsersSort.entries.map { it to it.label }) { usersSort = it; page = 1 }
                } else {
                    OptionMenu("Sort", taxonomySort, TaxonomySort.entries.map { it to it.label }) { taxonomySort = it; page = 1 }
                }
            }
            Text(
                "Tap an entry to search tones with it.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
            )
        }
        when {
            error != null -> item { ErrorBanner(error) }
            loading && result == null -> item { CenteredProgress() }
            else -> items(result?.data.orEmpty()) { entry ->
                when (entry) {
                    is PublicUser -> Column(
                        Modifier.fillMaxWidth().clickable { onSearch(SearchTonesParams(creators = listOf(entry.username))) }
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp),
                    ) {
                        CreatorBadge(entry, large = true)
                        entry.bio?.takeIf { it.isNotBlank() }?.let {
                            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2)
                        }
                        Text("${entry.tonesCount} tones · ${entry.downloadsCount} downloads", style = MaterialTheme.typography.labelSmall)
                    }
                    is TaxonomyItem -> Row(
                        Modifier.fillMaxWidth().clickable {
                            onSearch(if (kind == CatalogKind.MAKES) SearchTonesParams(makes = listOf(entry.name)) else SearchTonesParams(tags = listOf(entry.name)))
                        }.padding(horizontal = 16.dp, vertical = 12.dp),
                    ) {
                        Text(entry.name, modifier = Modifier.weight(1f))
                        Text("${entry.tonesCount}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
        item { result?.let { Pager(page, it.totalPages) { p -> page = p } } }
    }
}

// MARK: - Profile ------------------------------------------------------------------

@Composable
private fun ProfileTab() {
    val (user, error, _) = rememberDebouncedLoad<User>("profile", delayMs = 0) { T3K.client.getUser() }
    LazyColumn {
        item {
            when {
                error != null -> ErrorBanner(error)
                user == null -> CenteredProgress()
                else -> Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    CreatorBadge(user, large = true)
                    user.bio?.takeIf { it.isNotBlank() }?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    Text("@${user.username}")
                    user.createdAt?.let { Text("Joined ${it.take(10)}", style = MaterialTheme.typography.bodySmall) }
                    user.links.orEmpty().forEach { Text(it, color = MaterialTheme.colorScheme.primary) }
                }
            }
        }
    }
}
