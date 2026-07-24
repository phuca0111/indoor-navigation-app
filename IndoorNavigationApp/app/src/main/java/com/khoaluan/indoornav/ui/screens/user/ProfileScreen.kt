package com.khoaluan.indoornav.ui.screens.user

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.Divider
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.khoaluan.indoornav.ui.i18n.tr
import com.khoaluan.indoornav.ui.theme.NavBlue
import com.khoaluan.indoornav.ui.viewmodel.UserHubViewModel
import com.khoaluan.indoornav.ui.viewmodel.UserListUiState

enum class UserHubDest {
    Profile,
    Favorites,
    History,
    Notifications,
    Settings,
    Contributions,
    Proposals,
    Following,
    Creator,
    Offline,
    ErrorCenter,
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    viewModel: UserHubViewModel,
    onBack: () -> Unit,
    onOpen: (UserHubDest) -> Unit,
    onLogout: () -> Unit,
) {
    val profile by viewModel.profile.collectAsState()
    val unread by viewModel.unreadCount.collectAsState()
    LaunchedEffect(Unit) {
        viewModel.loadProfile()
        viewModel.refreshUnreadOnly()
    }

    val name = when (val p = profile) {
        is UserListUiState.Success -> p.data.fullName?.takeIf { it.isNotBlank() }
            ?: viewModel.sessionName()
            ?: tr("Người dùng", "User")
        else -> viewModel.sessionName() ?: tr("Người dùng", "User")
    }
    val email = when (val p = profile) {
        is UserListUiState.Success -> p.data.email ?: viewModel.sessionEmail().orEmpty()
        else -> viewModel.sessionEmail().orEmpty()
    }
    val avatarUrl = (profile as? UserListUiState.Success)?.data?.avatar?.url
    val roleLabel = (profile as? UserListUiState.Success)?.data?.displayRoleLabel

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(tr("Hồ sơ", "Profile")) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = tr("Quay lại", "Back"))
                    }
                },
            )
        },
    ) { pad ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(pad)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 12.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (!avatarUrl.isNullOrBlank()) {
                    AsyncImage(
                        model = avatarUrl,
                        contentDescription = tr("Ảnh đại diện", "Avatar"),
                        modifier = Modifier
                            .size(64.dp)
                            .clip(CircleShape),
                        contentScale = ContentScale.Crop,
                    )
                } else {
                    Surface(
                        modifier = Modifier.size(64.dp),
                        shape = CircleShape,
                        color = NavBlue.copy(alpha = 0.15f),
                    ) {
                        Text(
                            text = name.take(1).uppercase(),
                            modifier = Modifier.padding(20.dp),
                            color = NavBlue,
                            fontWeight = FontWeight.Bold,
                            fontSize = 22.sp,
                        )
                    }
                }
                Column(modifier = Modifier.padding(start = 16.dp)) {
                    Text(name, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    Text(email, color = Color(0xFF5F6368), fontSize = 13.sp)
                    if (!roleLabel.isNullOrBlank()) {
                        Text(roleLabel, color = NavBlue, fontSize = 12.sp)
                    }
                }
            }

            Spacer(Modifier.height(8.dp))
            Text(
                tr(
                    "Tài khoản Google / Email đã liên kết khi đăng nhập. Quản lý thiết bị bên dưới.",
                    "Google / Email account linked at sign-in. Manage devices below.",
                ),
                color = Color(0xFF80868B),
                fontSize = 12.sp,
                modifier = Modifier.padding(vertical = 8.dp),
            )

            ProfileRow(
                tr("Đã lưu", "Saved"),
                tr("Địa điểm · Trong nhà · Bộ sưu tập", "Places · Indoor · Collections"),
            ) { onOpen(UserHubDest.Favorites) }
            ProfileRow(
                tr("Lịch sử", "History"),
                tr("Đã xem · Đã điều hướng", "Viewed · Navigated"),
            ) { onOpen(UserHubDest.History) }
            ProfileRow(
                tr("Thông báo", "Notifications"),
                if (unread > 0) {
                    tr("$unread chưa đọc", "$unread unread")
                } else {
                    tr("Đề xuất · Bản đồ · Lời mời · Cập nhật", "Proposals · Maps · Invites · Updates")
                },
            ) { onOpen(UserHubDest.Notifications) }
            ProfileRow(
                tr("Đóng góp", "Contributions"),
                tr("Đánh giá · Báo cáo", "Reviews · Reports"),
            ) { onOpen(UserHubDest.Contributions) }
            ProfileRow(
                tr("Đề xuất", "Proposals"),
                tr("Địa điểm · Trong nhà · Trạng thái", "Place · Indoor · Status"),
            ) { onOpen(UserHubDest.Proposals) }
            ProfileRow(
                tr("Đang theo dõi", "Following"),
                tr("Địa điểm · Người tạo · Tổ chức", "Place · Creator · Organization"),
            ) { onOpen(UserHubDest.Following) }
            ProfileRow(
                tr("Người tạo bản đồ", "Map creator"),
                tr("Không gian làm việc · Thống kê · Xuất bản", "Workspace · Stats · Publish"),
            ) { onOpen(UserHubDest.Creator) }
            ProfileRow(
                tr("Ngoại tuyến & Đồng bộ", "Offline & Sync"),
                tr("Tải bản đồ · Bộ nhớ đệm · Hàng đợi", "Download maps · Cache · Queue"),
            ) { onOpen(UserHubDest.Offline) }
            ProfileRow(
                tr("Trung tâm lỗi", "Error center"),
                tr(
                    "GPS · Mã QR · Đường đi · Chưa có bản đồ trong nhà",
                    "GPS · QR · Route · No indoor map",
                ),
            ) { onOpen(UserHubDest.ErrorCenter) }
            ProfileRow(
                tr("Cài đặt", "Settings"),
                tr("Giao diện · Ngôn ngữ · Riêng tư", "Appearance · Language · Privacy"),
            ) { onOpen(UserHubDest.Settings) }

            Divider(modifier = Modifier.padding(vertical = 12.dp))
            TextButton(onClick = onLogout) {
                Text(tr("Đăng xuất", "Sign out"), color = Color(0xFFD93025))
            }
        }
    }
}

@Composable
private fun ProfileRow(title: String, subtitle: String, onClick: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(vertical = 14.dp),
    ) {
        Text(title, fontWeight = FontWeight.SemiBold, fontSize = 16.sp)
        Text(subtitle, color = Color(0xFF5F6368), fontSize = 12.sp)
    }
    Divider(color = Color(0xFFEEEEEE))
}
