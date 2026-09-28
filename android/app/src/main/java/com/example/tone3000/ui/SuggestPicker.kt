package com.example.tone3000.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Icon
import androidx.compose.material3.InputChip
import androidx.compose.material3.InputChipDefaults
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

data class Suggestion(
    val name: String,
    /** Secondary text, e.g. a tone count or display name. */
    val hint: String? = null,
)

private const val SUGGEST_DEBOUNCE_MS = 250L

/**
 * Pick exact names (tags, makes, creators) for a search filter. Typing looks
 * up matches through the API, so the filter only ever holds names that exist.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SuggestPicker(
    label: String,
    placeholder: String,
    values: List<String>,
    onChange: (List<String>) -> Unit,
    suggest: suspend (String) -> List<Suggestion>,
) {
    var query by remember { mutableStateOf("") }
    var suggestions by remember { mutableStateOf<List<Suggestion>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    val trimmed = query.trim()

    LaunchedEffect(trimmed) {
        if (trimmed.isEmpty()) {
            suggestions = emptyList()
            loading = false
            return@LaunchedEffect
        }
        loading = true
        delay(SUGGEST_DEBOUNCE_MS)
        suggestions = try {
            suggest(trimmed)
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            emptyList()
        }
        loading = false
    }

    val options = suggestions.filter { it.name !in values }

    Column(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (values.isNotEmpty()) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                values.forEach { value ->
                    InputChip(
                        selected = true,
                        onClick = { onChange(values - value) },
                        label = { Text(value) },
                        trailingIcon = {
                            Icon(Icons.Default.Close, contentDescription = "Remove $value", Modifier.size(InputChipDefaults.IconSize))
                        },
                    )
                }
            }
        }
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text(placeholder) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        if (trimmed.isNotEmpty()) {
            Surface(shape = MaterialTheme.shapes.small, tonalElevation = 2.dp, modifier = Modifier.fillMaxWidth()) {
                Column {
                    if (options.isEmpty()) {
                        if (loading) {
                            LinearProgressIndicator(Modifier.fillMaxWidth().padding(12.dp))
                        } else {
                            Text("No matches.", Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    options.forEach { suggestion ->
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable {
                                    onChange(values + suggestion.name)
                                    query = ""
                                }
                                .padding(horizontal = 12.dp, vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text(suggestion.name, Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                            suggestion.hint?.let {
                                Text(it, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}
