package com.khoaluan.indoornav.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Module #8 — overlay khi Outdoor → Indoor (loading + preload).
 */
@Composable
fun IndoorTransitionOverlay(
    title: String = "Đang vào bản đồ trong nhà",
    message: String,
    error: String? = null,
    onCancel: () -> Unit,
    onRetry: (() -> Unit)? = null,
) {
    val pulse = rememberInfiniteTransition(label = "indoor_transition")
    val scale by pulse.animateFloat(
        initialValue = 0.92f,
        targetValue = 1.08f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulse",
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xF0151A23)),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
            modifier = Modifier.padding(32.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(88.dp)
                    .scale(if (error == null) scale else 1f)
                    .background(Color(0xFF1A73E8).copy(alpha = 0.2f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                if (error == null) {
                    CircularProgressIndicator(
                        color = Color(0xFF4285F4),
                        strokeWidth = 3.dp,
                        modifier = Modifier.size(40.dp),
                    )
                }
            }
            Spacer(modifier = Modifier.height(20.dp))
            Text(
                text = if (error != null) "Không vào được bản đồ trong nhà" else title,
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = error ?: message,
                color = Color(0xFFB0B8C4),
                fontSize = 14.sp,
                textAlign = TextAlign.Center,
            )
            Spacer(modifier = Modifier.height(20.dp))
            if (error != null && onRetry != null) {
                TextButton(onClick = onRetry) {
                    Text("Thử lại", color = Color(0xFF8AB4F8))
                }
            }
            TextButton(onClick = onCancel) {
                Text("← Quay lại ngoài trời", color = Color(0xFFB0B8C4))
            }
        }
    }
}
