package com.example.tone3000.ui

import android.content.Intent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Download
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import com.example.tone3000.T3K
import com.example.tone3000.audio.PreviewChain
import com.example.tone3000.audio.previewChain
import com.example.tone3000.t3k.Model
import com.example.tone3000.t3k.Tone
import com.example.tone3000.t3k.userMessage
import java.io.File
import kotlinx.coroutines.launch

/** Models for a tone, each with a preview player and a download action. */
@Composable
fun ModelList(models: List<Model>, tone: Tone) {
    var error by remember { mutableStateOf<String?>(null) }
    Column {
        error?.let { ErrorBanner(it) { error = null } }
        if (models.isEmpty()) {
            Text(
                "No models available.",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(16.dp),
            )
        }
        models.forEachIndexed { index, model ->
            ModelRow(model, tone) { error = it }
            if (index < models.lastIndex) HorizontalDivider(Modifier.padding(horizontal = 16.dp))
        }
    }
}

@Composable
private fun ModelRow(model: Model, tone: Tone, onError: (String) -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var downloading by remember { mutableStateOf(false) }
    var file by remember { mutableStateOf<File?>(null) }

    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        val resolve = previewChain(model, tone)
        if (resolve != null) {
            PreviewButton("model-${model.id}", resolve, onError)
        } else {
            Text("Preview\nunavailable", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Spacer(Modifier.width(12.dp))
        Text(
            model.name,
            style = MaterialTheme.typography.bodyMedium,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )

        val downloaded = file
        if (downloaded != null) {
            IconButton(onClick = { share(context, downloaded) }) {
                Icon(Icons.Filled.Share, contentDescription = "Share model file")
            }
        } else {
            IconButton(
                enabled = !downloading,
                onClick = {
                    scope.launch {
                        downloading = true
                        try {
                            file = T3K.client.downloadModelFile(model.modelUrl, model.name)
                        } catch (e: Exception) {
                            onError(e.userMessage)
                        } finally {
                            downloading = false
                        }
                    }
                },
            ) {
                if (downloading) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                else Icon(Icons.Filled.Download, contentDescription = "Download model")
            }
        }
    }
}

private fun share(context: android.content.Context, file: File) {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.files", file)
    val send = Intent(Intent.ACTION_SEND).apply {
        type = "application/octet-stream"
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(send, file.name))
}

/**
 * Play/pause control for one preview: spinner while loading, progress ring
 * while playing. All buttons share one player, so starting one stops the
 * other.
 */
@Composable
fun PreviewButton(id: String, resolve: suspend () -> PreviewChain, onError: (String) -> Unit) {
    val state by T3K.player.state.collectAsState()
    val scope = rememberCoroutineScope()
    val active = state.activePlayerId == id
    val playing = active && state.isPlaying
    val loading = state.loadingPlayerId == id

    IconButton(
        onClick = {
            scope.launch {
                try {
                    T3K.player.togglePlay(id, resolve)
                } catch (e: Exception) {
                    onError(e.userMessage)
                }
            }
        },
        modifier = Modifier.size(40.dp),
    ) {
        Box(contentAlignment = Alignment.Center) {
            if (loading) {
                CircularProgressIndicator(Modifier.size(36.dp), strokeWidth = 2.dp)
            } else {
                CircularProgressIndicator(
                    progress = { if (active) state.progress else 0f },
                    modifier = Modifier.size(36.dp),
                    strokeWidth = 2.dp,
                    trackColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.2f),
                )
            }
            Icon(
                if (playing) Icons.Filled.Pause else Icons.Filled.PlayArrow,
                contentDescription = if (playing) "Pause preview" else "Play preview",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(20.dp),
            )
        }
    }
}
