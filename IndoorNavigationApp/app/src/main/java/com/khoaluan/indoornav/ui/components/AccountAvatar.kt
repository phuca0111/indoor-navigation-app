package com.khoaluan.indoornav.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Person
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage

/**
 * Avatar tài khoản kiểu Google Maps — ảnh Google hoặc chữ cái / icon Person.
 */
@Composable
fun AccountAvatar(
    photoUrl: String?,
    displayName: String? = null,
    email: String? = null,
    size: Dp = 32.dp,
    loggedIn: Boolean = !photoUrl.isNullOrBlank() || !displayName.isNullOrBlank() || !email.isNullOrBlank(),
    contentDescription: String? = null,
    onClick: () -> Unit,
) {
    val initial = (displayName ?: email ?: "?")
        .trim()
        .firstOrNull { it.isLetterOrDigit() }
        ?.uppercaseChar()
        ?.toString()
        ?: "?"

    Box(
        modifier = Modifier
            .size(size)
            .clip(CircleShape)
            .clickable(onClick = onClick)
            .then(
                if (!photoUrl.isNullOrBlank()) Modifier
                else Modifier
                    .background(if (loggedIn) Color(0xFF1A73E8) else Color(0xFFE8EAED))
                    .border(1.dp, Color(0xFFDADCE0), CircleShape),
            ),
        contentAlignment = Alignment.Center,
    ) {
        when {
            !photoUrl.isNullOrBlank() -> {
                AsyncImage(
                    model = photoUrl,
                    contentDescription = contentDescription,
                    modifier = Modifier
                        .size(size)
                        .clip(CircleShape)
                        .border(1.dp, Color(0xFFDADCE0), CircleShape),
                    contentScale = ContentScale.Crop,
                )
            }
            loggedIn -> {
                Text(
                    text = initial,
                    color = Color.White,
                    fontSize = (size.value * 0.42f).sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
            else -> {
                Icon(
                    imageVector = Icons.Rounded.Person,
                    contentDescription = contentDescription,
                    tint = Color(0xFF5F6368),
                    modifier = Modifier.size(size * 0.62f),
                )
            }
        }
    }
}
