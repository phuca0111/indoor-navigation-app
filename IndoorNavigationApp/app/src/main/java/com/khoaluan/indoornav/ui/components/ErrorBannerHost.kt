package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Snackbar
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.khoaluan.indoornav.ui.error.ErrorCenter
import com.khoaluan.indoornav.ui.theme.MapsDest

@Composable
fun ErrorBannerHost(
    modifier: Modifier = Modifier,
    onAction: ((String?) -> Unit)? = null,
) {
    val host = remember { SnackbarHostState() }
    val latest by ErrorCenter.latest.collectAsState()
    LaunchedEffect(latest) {
        val err = latest ?: return@LaunchedEffect
        val result = host.showSnackbar(
            message = "${err.title}: ${err.message}",
            actionLabel = err.actionLabel,
            withDismissAction = true,
        )
        if (result == androidx.compose.material3.SnackbarResult.ActionPerformed) {
            onAction?.invoke(err.actionLabel)
        }
        ErrorCenter.clearLatest()
    }
    SnackbarHost(hostState = host, modifier = modifier) { data ->
        Snackbar(
            modifier = Modifier
                .padding(12.dp)
                .fillMaxWidth(),
            containerColor = MapsDest.copy(alpha = 0.95f),
            contentColor = MaterialTheme.colorScheme.onError,
            action = {
                data.visuals.actionLabel?.let { label ->
                    TextButton(onClick = { data.performAction() }) {
                        Text(label, color = MaterialTheme.colorScheme.onError)
                    }
                }
            },
        ) {
            Text(data.visuals.message)
        }
    }
}
