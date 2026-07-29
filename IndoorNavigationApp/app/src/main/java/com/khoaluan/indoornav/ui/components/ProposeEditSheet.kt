package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.khoaluan.indoornav.ui.i18n.tr

private val GmapsBlue = Color(0xFF1A73E8)
private val GmapsInk = Color(0xFF202124)
private val GmapsMuted = Color(0xFF5F6368)
private val GmapsChipBg = Color(0xFFE8F0FE)
private val GmapsBorder = Color(0xFFDADCE0)
private val GmapsFieldBg = Color(0xFFF1F3F4)

/**
 * Bottom sheet đề xuất chỉnh sửa — kiểu Google Maps (scroll + nút Gửi cố định trên IME).
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ProposeEditSheet(
    placeName: String,
    onDismiss: () -> Unit,
    onSubmit: (type: String, title: String, description: String?) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val proposeTypes = listOf(
        "FIX_INFO" to tr("Sửa thông tin", "Fix info"),
        "FIX_LOCATION" to tr("Sửa vị trí", "Fix location"),
        "ADD_POI" to tr("Thêm điểm", "Add place"),
        "OTHER" to tr("Khác", "Other"),
    )
    var proposeType by remember { mutableStateOf("FIX_INFO") }
    var proposeTitle by remember { mutableStateOf("") }
    var proposeDetail by remember { mutableStateOf("") }
    val canSubmit = proposeTitle.trim().length >= 2
    val fieldColors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = GmapsBlue,
        unfocusedBorderColor = GmapsBorder,
        focusedContainerColor = Color.White,
        unfocusedContainerColor = GmapsFieldBg,
        cursorColor = GmapsBlue,
        focusedLabelColor = GmapsBlue,
        unfocusedLabelColor = GmapsMuted,
    )

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color.White,
        contentColor = GmapsInk,
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp),
        dragHandle = {
            Box(
                modifier = Modifier
                    .padding(top = 10.dp, bottom = 4.dp)
                    .width(36.dp)
                    .height(4.dp)
                    .clip(RoundedCornerShape(2.dp))
                    .background(Color(0xFFDADCE0)),
            )
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .navigationBarsPadding()
                .imePadding(),
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 20.dp, end = 8.dp, top = 4.dp, bottom = 8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = tr("Đề xuất chỉnh sửa", "Suggest an edit"),
                        fontWeight = FontWeight.Bold,
                        fontSize = 20.sp,
                        color = GmapsInk,
                    )
                    Text(
                        text = placeName,
                        fontSize = 13.sp,
                        color = GmapsMuted,
                        maxLines = 1,
                        modifier = Modifier.padding(top = 2.dp),
                    )
                }
                IconButton(onClick = onDismiss) {
                    Icon(
                        imageVector = Icons.Rounded.Close,
                        contentDescription = tr("Đóng", "Close"),
                        tint = GmapsMuted,
                    )
                }
            }

            HorizontalDivider(color = Color(0xFFE8EAED))

            Column(
                modifier = Modifier
                    .weight(1f, fill = false)
                    .heightIn(max = 420.dp)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 14.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Text(
                    text = tr("Loại đề xuất", "Suggestion type"),
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp,
                    color = GmapsInk,
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    proposeTypes.forEach { (code, label) ->
                        val selected = proposeType == code
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(20.dp))
                                .background(if (selected) GmapsChipBg else Color.White)
                                .border(
                                    width = 1.dp,
                                    color = if (selected) GmapsBlue else GmapsBorder,
                                    shape = RoundedCornerShape(20.dp),
                                )
                                .clickable { proposeType = code }
                                .padding(horizontal = 14.dp, vertical = 9.dp),
                        ) {
                            Text(
                                text = label,
                                fontSize = 13.sp,
                                fontWeight = if (selected) FontWeight.SemiBold else FontWeight.Medium,
                                color = if (selected) GmapsBlue else GmapsInk,
                            )
                        }
                    }
                }

                OutlinedTextField(
                    value = proposeTitle,
                    onValueChange = { proposeTitle = it.take(200) },
                    label = { Text(tr("Tiêu đề", "Title")) },
                    placeholder = {
                        Text(tr("Vd: Sửa cổng vào", "E.g. Fix main entrance"))
                    },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    colors = fieldColors,
                )

                OutlinedTextField(
                    value = proposeDetail,
                    onValueChange = { proposeDetail = it.take(2000) },
                    label = { Text(tr("Mô tả (tuỳ chọn)", "Details (optional)")) },
                    placeholder = {
                        Text(tr("Mô tả chi tiết hơn…", "Add more details…"))
                    },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 5,
                    shape = RoundedCornerShape(12.dp),
                    colors = fieldColors,
                )
            }

            HorizontalDivider(color = Color(0xFFE8EAED))

            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                TextButton(
                    onClick = onDismiss,
                    modifier = Modifier.weight(1f),
                ) {
                    Text(
                        tr("Hủy", "Cancel"),
                        color = GmapsMuted,
                        fontWeight = FontWeight.Medium,
                    )
                }
                Button(
                    onClick = {
                        onSubmit(
                            proposeType,
                            proposeTitle.trim(),
                            proposeDetail.trim().ifBlank { null },
                        )
                    },
                    enabled = canSubmit,
                    modifier = Modifier
                        .weight(1.2f)
                        .height(48.dp),
                    shape = RoundedCornerShape(24.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = GmapsBlue,
                        contentColor = Color.White,
                        disabledContainerColor = Color(0xFFE8EAED),
                        disabledContentColor = Color(0xFF9AA0A6),
                    ),
                    elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp),
                ) {
                    Text(
                        tr("Gửi", "Submit"),
                        fontWeight = FontWeight.SemiBold,
                        fontSize = 15.sp,
                    )
                }
            }
        }
    }
}
