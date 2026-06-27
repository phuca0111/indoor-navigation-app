package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.ui.theme.NavBlue

/**
 * BottomSheet chọn tầng — hiện khi user nhấn chip "Tầng X ▼" trên TopAppBar.
 *
 * UX fix: Floor selector "Tầng 1 ▼" không có UI chọn tầng.
 *
 * @param currentFloor    Tầng hiện đang xem
 * @param totalFloors     Tổng số tầng (mặc định 5)
 * @param onFloorSelected Callback trả về tầng được chọn
 * @param onDismiss       Callback đóng sheet
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FloorSelectorSheet(
    currentFloor: Int,
    totalFloors: Int = 5,
    onFloorSelected: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val floors = (0..totalFloors).toList()

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
        containerColor = Color.White,
        dragHandle = {
            Box(
                modifier = Modifier.padding(top = 12.dp, bottom = 8.dp),
                contentAlignment = Alignment.Center,
            ) {
                Box(
                    modifier = Modifier
                        .width(36.dp)
                        .height(4.dp)
                        .background(Color(0xFFE0E0E0), RoundedCornerShape(2.dp)),
                )
            }
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 32.dp),
        ) {
            // Tiêu đề sheet
            Text(
                text = "Chọn tầng",
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF212121),
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
            )

            HorizontalDivider(color = Color(0xFFEEEEEE))

            // Danh sách tầng
            LazyColumn(
                modifier = Modifier.fillMaxWidth(),
                contentPadding = PaddingValues(vertical = 8.dp),
            ) {
                items(floors) { floor ->
                    val isSelected = floor == currentFloor

                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                onFloorSelected(floor)
                                onDismiss()
                            }
                            .background(
                                if (isSelected) NavBlue.copy(alpha = 0.08f) else Color.Transparent,
                            )
                            .padding(horizontal = 24.dp, vertical = 16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Text(
                            text = if (floor == 0) "Tầng trệt GF" else "Tầng $floor",
                            fontSize = 15.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                            color = if (isSelected) NavBlue else Color(0xFF212121),
                        )

                        if (isSelected) {
                            Icon(
                                imageVector = Icons.Default.Check,
                                contentDescription = "Đang chọn",
                                tint = NavBlue,
                                modifier = Modifier.size(20.dp),
                            )
                        }
                    }

                    if (floor != floors.last()) {
                        HorizontalDivider(
                            modifier = Modifier.padding(horizontal = 24.dp),
                            color = Color(0xFFF5F5F5),
                        )
                    }
                }
            }
        }
    }
}
