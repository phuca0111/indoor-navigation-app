package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.ui.theme.NavBlue

/**
 * Module #10 Floor Manager UI — danh sách tầng · current · gần đây.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun FloorSelectorSheet(
    currentFloor: Int,
    totalFloors: Int = 1,
    lastVisitedFloor: Int? = null,
    onFloorSelected: (Int) -> Unit,
    onDismiss: () -> Unit,
) {
    val safeTotal = totalFloors.coerceAtLeast(1)
    val floors = (0 until safeTotal).toList()

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
            Text(
                text = "Chọn tầng",
                fontSize = 17.sp,
                fontWeight = FontWeight.Bold,
                color = Color(0xFF212121),
                modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
            )
            if (lastVisitedFloor != null && lastVisitedFloor in floors && lastVisitedFloor != currentFloor) {
                Text(
                    text = "Lần trước: tầng $lastVisitedFloor",
                    fontSize = 12.sp,
                    color = Color(0xFF5F6368),
                    modifier = Modifier.padding(start = 24.dp, end = 24.dp, bottom = 4.dp),
                )
            }

            HorizontalDivider(color = Color(0xFFEEEEEE))

            LazyColumn(
                modifier = Modifier.fillMaxWidth(),
                contentPadding = PaddingValues(vertical = 8.dp),
            ) {
                items(floors) { floor ->
                    val isCurrent = floor == currentFloor
                    val isLast = floor == lastVisitedFloor && !isCurrent
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable {
                                onFloorSelected(floor)
                                onDismiss()
                            }
                            .background(
                                if (isCurrent) NavBlue.copy(alpha = 0.08f) else Color.Transparent,
                            )
                            .padding(horizontal = 24.dp, vertical = 14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Column {
                            Text(
                                text = if (floor == 0) "Tầng trệt (GF)" else "Tầng $floor",
                                fontSize = 15.sp,
                                fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Medium,
                                color = if (isCurrent) NavBlue else Color(0xFF212121),
                            )
                            if (isLast) {
                                Text(
                                    text = "Gần đây",
                                    fontSize = 11.sp,
                                    color = Color(0xFF5F6368),
                                )
                            }
                        }
                        if (isCurrent) {
                            Icon(
                                imageVector = Icons.Filled.Check,
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
