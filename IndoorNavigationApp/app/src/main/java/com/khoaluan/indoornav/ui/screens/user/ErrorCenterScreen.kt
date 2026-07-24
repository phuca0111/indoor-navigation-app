package com.khoaluan.indoornav.ui.screens.user

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.ui.error.ErrorCenter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** #29 Error Center — lịch sử lỗi UX (No Indoor · GPS · QR · Route · Network). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ErrorCenterScreen(onBack: () -> Unit) {
    val history by ErrorCenter.history.collectAsState()
    val fmt = rememberDateFmt()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Trung tâm lỗi") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = null)
                    }
                },
                actions = {
                    TextButton(onClick = { ErrorCenter.clearAll() }) {
                        Text("Xóa")
                    }
                },
            )
        },
    ) { pad ->
        if (history.isEmpty()) {
            Text(
                "Chưa ghi nhận lỗi. Các sự kiện chưa có bản đồ trong nhà / GPS yếu / mã QR / đường đi sẽ hiện ở đây.",
                modifier = Modifier
                    .padding(pad)
                    .padding(16.dp),
                color = Color(0xFF80868B),
                fontSize = 13.sp,
            )
        } else {
            LazyColumn(
                Modifier
                    .fillMaxSize()
                    .padding(pad)
                    .padding(horizontal = 16.dp),
            ) {
                items(history, key = { "${it.timestamp}-${it.kind}" }) { err ->
                    Column(Modifier.padding(vertical = 10.dp).fillMaxWidth()) {
                        Text(err.title, fontWeight = FontWeight.SemiBold)
                        Text(err.message, fontSize = 13.sp)
                        Text(
                            "${err.kind} · ${fmt.format(Date(err.timestamp))}",
                            color = Color(0xFF80868B),
                            fontSize = 11.sp,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun rememberDateFmt(): SimpleDateFormat =
    androidx.compose.runtime.remember {
        SimpleDateFormat("HH:mm:ss dd/MM", Locale.getDefault())
    }
