package com.example.tone3000.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.tone3000.Preset
import com.example.tone3000.PresetStore
import com.example.tone3000.T3K
import com.example.tone3000.audio.ToneWithModels
import com.example.tone3000.audio.fetchToneWithModels
import com.example.tone3000.t3k.AuthManager
import com.example.tone3000.t3k.AuthorizeOptions
import com.example.tone3000.t3k.CatalogOptions
import com.example.tone3000.t3k.Format
import com.example.tone3000.t3k.OAuthCanceledException
import com.example.tone3000.t3k.SelectOptions
import com.example.tone3000.t3k.userMessage
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DemoScaffold(
    title: String,
    onBack: (() -> Unit)?,
    actions: @Composable () -> Unit = {},
    bottomBar: @Composable () -> Unit = {},
    content: @Composable (Modifier) -> Unit,
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(title) },
                navigationIcon = {
                    if (onBack != null) {
                        IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") }
                    }
                },
                actions = { actions() },
            )
        },
        bottomBar = bottomBar,
    ) { padding -> content(Modifier.padding(padding).fillMaxSize()) }
}

// MARK: - Landing ------------------------------------------------------------------

private data class DemoInfo(val route: String, val tag: String, val name: String, val product: String, val description: String)

private val lowCodeDemos = listOf(
    DemoInfo("select", "Select Flow", "Acme Inc", "Guitar Amp Simulation App",
        "Users browse the TONE3000 catalog and pick a tone to load. TONE3000 hosts the browsing UI."),
    DemoInfo("load-tone", "Load Tone Flow", "Beacon Inc", "Rig Preset Management App",
        "Saved presets store tone IDs and sync them on demand. TONE3000 handles access checks and replacements."),
)

private val fullApiDemo = DemoInfo("full-api", "Full API Integration", "Chord Inc", "Tone Discovery & Management App",
    "A custom tone UI on the REST API: library, discover, search, makes & tags, creators, favorites and downloads.")

/** Entry screen: one card per integration pattern, matching the web example. */
@Composable
fun LandingScreen(open: (String) -> Unit) {
    val uriHandler = LocalUriHandler.current
    var connected by remember { mutableStateOf(T3K.client.isConnected()) }

    DemoScaffold("TONE3000 Examples", onBack = null) { modifier ->
        LazyColumn(modifier) {
            item {
                Text(
                    "Reference integrations showing how to build against the TONE3000 API.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 16.dp),
                )
                TextButton(onClick = { uriHandler.openUri("https://www.tone3000.com/api") }, modifier = Modifier.padding(horizontal = 4.dp)) {
                    Text("View API documentation")
                }
            }
            item { SectionHeader("Low-code (OAuth prompts)") }
            items(lowCodeDemos) { DemoCard(it) { open(it.route) } }
            item { SectionHeader("Full API") }
            item { DemoCard(fullApiDemo) { open(fullApiDemo.route) } }
            if (connected) {
                item {
                    TextButton(onClick = { T3K.client.clearTokens(); connected = false }, modifier = Modifier.padding(8.dp)) {
                        Text("Disconnect TONE3000", color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        }
    }
}

@Composable
private fun DemoCard(demo: DemoInfo, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 6.dp).clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(demo.tag.uppercase(), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
            Text(demo.name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(demo.product, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(demo.description, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}

// MARK: - Select flow ------------------------------------------------------------------

private enum class Scope(val label: String, val catalog: CatalogOptions) {
    AMP_CAB("Amp + Cab", CatalogOptions(gears = "amp-cab", format = Format.NAM)),
    AMP_PEDAL("Amps and pedals", CatalogOptions(gears = "amp_pedal", format = Format.NAM)),
    CAB_IR("Cabinet IRs", CatalogOptions(gears = "cab", format = Format.IR)),
    ALL_NAM("All NAM captures", CatalogOptions(format = Format.NAM)),
}

/**
 * Acme Inc — Select flow. TONE3000 hosts catalog browsing; the app gets a
 * `tone_id` back and loads its models into the preview player.
 */
@Composable
fun SelectDemoScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var catalogScope by remember { mutableStateOf(Scope.AMP_CAB) }
    var preview by remember { mutableStateOf(true) }
    var chinese by remember { mutableStateOf(false) }
    var selected by remember { mutableStateOf<ToneWithModels?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf<String?>(null) }

    fun select() = scope.launch {
        error = null
        info = null
        try {
            val outcome = AuthManager.startSelectFlow(
                context,
                SelectOptions(
                    catalog = catalogScope.catalog,
                    auth = AuthorizeOptions(locale = if (chinese) "zh-CN" else null),
                    preview = preview,
                ),
            )
            val toneId = outcome.toneId
            if (toneId == null || outcome.canceled) {
                info = "You closed TONE3000 without selecting a tone."
                return@launch
            }
            loading = true
            selected = fetchToneWithModels(toneId)
        } catch (e: OAuthCanceledException) {
            info = "You closed TONE3000 without selecting a tone."
        } catch (e: Exception) {
            error = e.userMessage
        } finally {
            loading = false
        }
    }

    DemoScaffold("Acme Inc", onBack) { modifier ->
        LazyColumn(modifier) {
            item {
                SectionHeader("Select flow options")
                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    OptionMenu("Catalog", catalogScope, Scope.entries.map { it to it.label }) { catalogScope = it }
                    ToggleRow("Preview players", preview) { preview = it }
                    ToggleRow("简体中文 (zh-CN)", chinese) { chinese = it }
                }
                T3KButton(if (selected == null) "Browse TONE3000" else "Choose another tone", busy = loading) { select() }
                error?.let { ErrorBanner(it) { error = null } }
                info?.let { InfoBanner(it) }
            }
            selected?.let { detail ->
                item { SectionHeader("Selected tone"); ToneRow(detail.tone) }
                item { SectionHeader("Models"); ModelList(detail.models, detail.tone) }
            }
        }
    }
}

@Composable
fun ToggleRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

// MARK: - Load Tone flow ---------------------------------------------------------------

/**
 * Beacon Inc — Load Tone flow. Presets store TONE3000 tone IDs: add one by
 * picking a tone in the Select flow, then load it later. When connected, the
 * app loads straight from the API; otherwise (or when a tone has gone private
 * or been deleted) `prompt=load_tone` lets TONE3000 check access and offer a
 * replacement, which the preset then points to.
 */
@Composable
fun LoadToneDemoScreen(onBack: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var presets by remember { mutableStateOf(PresetStore.load(context)) }
    var loaded by remember { mutableStateOf<ToneWithModels?>(null) }
    var replacedToneId by remember { mutableStateOf<Int?>(null) }
    var activePresetId by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var info by remember { mutableStateOf<String?>(null) }

    fun updatePresets(update: (List<Preset>) -> List<Preset>) {
        presets = update(presets)
        PresetStore.save(context, presets)
    }

    fun reset() {
        error = null
        info = null
        replacedToneId = null
    }

    /** Show a loaded tone and refresh the preset (or repoint it at a replacement). */
    fun apply(tone: ToneWithModels, preset: Preset) {
        loaded = tone
        replacedToneId = preset.toneId.takeIf { it != tone.tone.id }
        updatePresets { list -> list.map { if (it.id == preset.id) Preset.from(tone.tone, preset.id) else it } }
    }

    /** Pick a tone in TONE3000 and save it as a new preset. */
    fun add() = scope.launch {
        reset()
        try {
            val outcome = AuthManager.startSelectFlow(context, SelectOptions())
            val toneId = outcome.toneId
            if (toneId == null || outcome.canceled) {
                info = "You closed TONE3000 without choosing a tone."
                return@launch
            }
            loading = true
            val tone = fetchToneWithModels(toneId)
            val preset = Preset.from(tone.tone)
            updatePresets { it + preset }
            activePresetId = preset.id
            loaded = tone
        } catch (e: OAuthCanceledException) {
            info = "You closed TONE3000 without choosing a tone."
        } catch (e: Exception) {
            error = e.userMessage
        } finally {
            loading = false
        }
    }

    fun load(preset: Preset) = scope.launch {
        reset()
        activePresetId = preset.id

        // Already connected? Try the API directly and only fall back to the
        // Load Tone flow when TONE3000 needs to verify access.
        if (T3K.client.isConnected()) {
            loading = true
            try {
                apply(fetchToneWithModels(preset.toneId), preset)
                return@launch
            } catch (_: Exception) {
            } finally {
                loading = false
            }
        }

        try {
            val outcome = AuthManager.startLoadToneFlow(context, preset.toneId, CatalogOptions())
            val toneId = outcome.toneId
            if (toneId == null || outcome.canceled) {
                info = "You closed TONE3000 without loading a tone."
                return@launch
            }
            loading = true
            apply(fetchToneWithModels(toneId), preset)
        } catch (e: OAuthCanceledException) {
            info = "You closed TONE3000 without loading a tone."
        } catch (e: Exception) {
            error = e.userMessage
        } finally {
            loading = false
        }
    }

    fun remove(preset: Preset) {
        updatePresets { list -> list.filter { it.id != preset.id } }
        if (activePresetId == preset.id) {
            activePresetId = null
            loaded = null
        }
    }

    DemoScaffold("Beacon Inc", onBack) { modifier ->
        LazyColumn(modifier) {
            item {
                error?.let { ErrorBanner(it) { error = null } }
                info?.let { InfoBanner(it) }
                SectionHeader("Loaded tone")
            }
            item {
                val current = loaded
                when {
                    loading -> CenteredProgress()
                    current != null -> {
                        replacedToneId?.let {
                            InfoBanner("Tone #$it wasn't available, so TONE3000 offered a replacement. The preset now points to it.")
                        }
                        ToneRow(current.tone)
                        ModelList(current.models, current.tone)
                    }
                    else -> Text(
                        if (presets.isEmpty()) "No tone loaded yet." else "No tone loaded yet. Load one of your presets below.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                }
            }
            item { SectionHeader("My presets") }
            if (presets.isEmpty()) {
                item {
                    Text(
                        "Presets store a TONE3000 tone ID. Add one by picking a tone on TONE3000, then load it any time — TONE3000 checks access and offers a replacement if the tone becomes private or is deleted.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(horizontal = 16.dp),
                    )
                }
            }
            items(presets, key = { it.id }) { preset ->
                Row(
                    Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            preset.title,
                            style = MaterialTheme.typography.titleSmall,
                            color = if (activePresetId == preset.id) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                            maxLines = 1,
                        )
                        Text(preset.creator, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("TONE3000 Tone #${preset.toneId}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.outline)
                    }
                    TextButton(onClick = { remove(preset) }, enabled = !loading) { Text("Remove") }
                    Spacer(Modifier.width(4.dp))
                    Button(onClick = { load(preset) }, enabled = !loading) { Text("Load") }
                }
                HorizontalDivider(Modifier.padding(horizontal = 16.dp))
            }
            item {
                T3KButton("+ Add preset", busy = loading) { add() }
            }
        }
    }
}

// MARK: - Tone detail ------------------------------------------------------------------

/** Full tone detail: attribution, favorite, zip download, stats, and models. */
@Composable
fun ToneDetailScreen(toneId: Int, onBack: () -> Unit) {
    val scope = rememberCoroutineScope()
    val uriHandler = LocalUriHandler.current
    var detail by remember { mutableStateOf<ToneWithModels?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var favoriteBusy by remember { mutableStateOf(false) }
    var zipBusy by remember { mutableStateOf(false) }
    var zipNote by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(toneId) {
        try {
            detail = fetchToneWithModels(toneId)
        } catch (e: Exception) {
            error = e.userMessage
        }
    }

    DemoScaffold(detail?.tone?.title ?: "Tone", onBack) { modifier ->
        val current = detail
        if (current == null) {
            Column(modifier) { error?.let { ErrorBanner(it) } ?: CenteredProgress() }
            return@DemoScaffold
        }
        val tone = current.tone
        LazyColumn(modifier) {
            item {
                ToneRow(tone)
                tone.description?.takeIf { it.isNotBlank() }?.let {
                    Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(horizontal = 16.dp))
                }
                Row(Modifier.padding(horizontal = 8.dp, vertical = 8.dp)) {
                    TextButton(enabled = !favoriteBusy, onClick = {
                        scope.launch {
                            favoriteBusy = true
                            try {
                                if (tone.isFavorite) T3K.client.unfavoriteTone(tone.id) else T3K.client.favoriteTone(tone.id)
                                detail = current.copy(
                                    tone = tone.copy(
                                        isFavorite = !tone.isFavorite,
                                        favoritesCount = tone.favoritesCount + if (tone.isFavorite) -1 else 1,
                                    ),
                                )
                            } catch (e: Exception) {
                                error = e.userMessage
                            } finally {
                                favoriteBusy = false
                            }
                        }
                    }) { Text(if (tone.isFavorite) "★ Favorited" else "☆ Favorite") }
                    TextButton(enabled = !zipBusy, onClick = {
                        scope.launch {
                            zipBusy = true
                            zipNote = null
                            try {
                                uriHandler.openUri(T3K.client.getToneDownload(tone.id).url)
                            } catch (e: com.example.tone3000.t3k.T3KException) {
                                zipNote = if (e.isForbidden) "Zip downloads are limited to approved partners — download models individually below." else e.userMessage
                            } finally {
                                zipBusy = false
                            }
                        }
                    }) { Text(if (zipBusy) "Preparing zip…" else "Download all (.zip)") }
                    tone.url?.let { url -> TextButton(onClick = { uriHandler.openUri(url) }) { Text("TONE3000 ↗") } }
                }
                zipNote?.let { Text(it, style = MaterialTheme.typography.bodySmall, modifier = Modifier.padding(horizontal = 16.dp)) }
                error?.let { ErrorBanner(it) { error = null } }
            }
            item {
                SectionHeader("Stats")
                Column(Modifier.padding(horizontal = 16.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Text("↓ ${tone.downloadsCount} downloads · ★ ${tone.favoritesCount} favorites")
                    Text(
                        if (tone.format == Format.IR) "${tone.irsCount} IRs"
                        else "${tone.modelsCount} models",
                    )
                    tone.license?.let { Text("License: $it") }
                    if (tone.makes.isNotEmpty()) Text("Makes: ${tone.makes.joinToString { it.name }}")
                    if (tone.tags.isNotEmpty()) Text("Tags: ${tone.tags.joinToString(" ") { "#${it.name}" }}")
                }
            }
            item {
                SectionHeader("Models (${current.models.size})")
                ModelList(current.models, tone)
            }
        }
    }
}
