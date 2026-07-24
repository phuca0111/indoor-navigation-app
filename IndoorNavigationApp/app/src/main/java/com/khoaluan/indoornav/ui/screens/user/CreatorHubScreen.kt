package com.khoaluan.indoornav.ui.screens.user

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.BuildConfig
import com.khoaluan.indoornav.ui.i18n.workspaceStatusVi
import com.khoaluan.indoornav.ui.viewmodel.UserHubViewModel
import com.khoaluan.indoornav.ui.viewmodel.UserListUiState

/**
 * #22–#24 Creator — Workspace list (read) · Publish qua Web Editor · Dashboard stats.
 * App End User không port UI Publish; mở /editor trên trình duyệt.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CreatorHubScreen(
    viewModel: UserHubViewModel,
    onBack: () -> Unit,
) {
    val workspaces by viewModel.workspaces.collectAsState()
    val stats by viewModel.creatorStats.collectAsState()
    val context = LocalContext.current
    val editorUrl = rememberEditorUrl()

    LaunchedEffect(Unit) {
        viewModel.loadWorkspaces()
        viewModel.loadCreatorStats()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Người tạo bản đồ") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = null)
                    }
                },
            )
        },
    ) { pad ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(pad)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
        ) {
            Text("Bảng thống kê", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            when (val s = stats) {
                is UserListUiState.Loading -> Text("Đang tải thống kê…")
                is UserListUiState.Error -> Text(s.message, color = Color(0xFFD93025), fontSize = 13.sp)
                is UserListUiState.Success -> {
                    val st = s.data.stats
                    val funnel = s.data.funnel
                    Text("Lượt xem: ${st?.views ?: 0}", fontSize = 14.sp)
                    Text("Lượt dùng: ${st?.usage ?: 0}", fontSize = 14.sp)
                    Text(
                        "Người theo dõi: ${st?.followers ?: 0} · Đã lưu: ${st?.favorites ?: 0}",
                        fontSize = 14.sp,
                    )
                    Text(
                        "Đánh giá: ${st?.ratingAvg ?: "—"} (${st?.ratingCount ?: 0})",
                        fontSize = 14.sp,
                    )
                    Text(
                        "Lượt tải: ${st?.downloads?.toString() ?: "— (chưa đếm)"}",
                        fontSize = 14.sp,
                        color = Color(0xFF80868B),
                    )
                    Spacer(Modifier.height(4.dp))
                    Text(
                        "Không gian ${funnel?.workspaces ?: 0} · Trong nhà ${funnel?.indoorBuildings ?: 0} · Đã xuất bản ${funnel?.published ?: 0}",
                        color = Color(0xFF5F6368),
                        fontSize = 12.sp,
                    )
                }
                else -> Unit
            }

            Spacer(Modifier.height(16.dp))
            Button(
                onClick = {
                    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(editorUrl)))
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Mở trình soạn thảo web (Nháp · Xuất bản · Hàng đợi)") }

            Text(
                "Gửi duyệt / Kiểm tra / Hàng đợi chạy trên trình soạn thảo — ứng dụng theo dõi không gian làm việc và thống kê.",
                color = Color(0xFF80868B),
                fontSize = 12.sp,
                modifier = Modifier.padding(vertical = 8.dp),
            )

            Text("Không gian làm việc / Nháp", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            when (val s = workspaces) {
                is UserListUiState.Loading -> Text("Đang tải…")
                is UserListUiState.Error -> Text(s.message, color = Color(0xFFD93025))
                is UserListUiState.Success -> {
                    if (s.data.isEmpty()) Text("Chưa có không gian làm việc.", color = Color(0xFF80868B))
                    else s.data.forEach { w ->
                        Column(Modifier.padding(vertical = 10.dp).fillMaxWidth()) {
                            Text(w.name ?: "Không gian làm việc", fontWeight = FontWeight.SemiBold)
                            val st = workspaceStatusVi(w.workspaceStatus ?: w.status)
                            Text("$st · ${w.floors()} tầng", color = Color(0xFF1A73E8), fontSize = 13.sp)
                            Text(w.updatedAt.orEmpty(), color = Color(0xFF80868B), fontSize = 11.sp)
                        }
                    }
                }
                else -> Unit
            }
        }
    }
}

@Composable
private fun rememberEditorUrl(): String {
    val base = BuildConfig.BASE_URL.trimEnd('/').removeSuffix("/api")
    return "$base/editor"
}
