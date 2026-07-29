package com.khoaluan.indoornav.fcm

import android.content.Context
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.util.TypedValue
import android.view.Gravity
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Overlay SYSTEM_ALERT_WINDOW bằng View thuần (không Compose) —
 * ổn định hơn khi hiện từ FCM Service.
 */
object EmergencyOverlayController {

    private const val TAG = "EmergencyOverlay"
    private var host: FrameLayout? = null

    fun canDrawOverlays(context: Context): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Settings.canDrawOverlays(context)
        } else {
            true
        }

    fun dismiss() {
        val view = host ?: return
        host = null
        runCatching {
            val wm = view.context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            wm.removeViewImmediate(view)
        }.onFailure { Log.w(TAG, "dismiss: ${it.message}") }
    }

    fun show(
        context: Context,
        type: String,
        title: String,
        body: String,
        buildingId: String?,
        incidentId: String?,
    ): Boolean {
        if (!canDrawOverlays(context)) {
            Log.w(TAG, "Thiếu quyền Appear on top — không hiện overlay.")
            return false
        }
        dismiss()

        val appCtx = context.applicationContext
        val wm = appCtx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
        val density = appCtx.resources.displayMetrics.density
        fun dp(v: Int) = (v * density).toInt()

        val root = FrameLayout(appCtx).apply {
            setBackgroundColor(Color.parseColor("#CC1C0505"))
            isClickable = true
            isFocusable = true
        }

        val column = LinearLayout(appCtx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            setPadding(dp(24), dp(48), dp(24), dp(36))
            setBackgroundColor(Color.parseColor("#FF450A0A"))
        }

        val badge = TextView(appCtx).apply {
            text = "⚠ CẢNH BÁO NGUY HIỂM"
            setTextColor(Color.parseColor("#FFFFE4E6"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
            gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD)
            letterSpacing = 0.12f
        }
        val headline = TextView(appCtx).apply {
            text = title.ifBlank { type }.uppercase()
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 32f)
            gravity = Gravity.CENTER
            setTypeface(typeface, Typeface.BOLD)
            setPadding(0, dp(10), 0, dp(14))
        }
        val detail = TextView(appCtx).apply {
            text = body
            setTextColor(Color.parseColor("#FFFFE4E6"))
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 16f)
            gravity = Gravity.CENTER
        }

        val startBtn = Button(appCtx).apply {
            text = "BẮT ĐẦU SƠ TÁN"
            setBackgroundColor(Color.parseColor("#FFFBBF24"))
            setTextColor(Color.parseColor("#FF1C1917"))
            setTypeface(typeface, Typeface.BOLD)
            setOnClickListener {
                appCtx.startActivity(
                    EmergencyNotifier.buildLaunchIntent(
                        context = appCtx,
                        type = type,
                        title = title,
                        body = body,
                        buildingId = buildingId,
                        incidentId = incidentId,
                    )
                )
                dismiss()
                EmergencyNotifier.cancel(appCtx)
            }
        }
        val dismissBtn = Button(appCtx).apply {
            text = "Đóng"
            setBackgroundColor(Color.TRANSPARENT)
            setTextColor(Color.parseColor("#FFFDA4AF"))
            setOnClickListener {
                dismiss()
                EmergencyNotifier.cancel(appCtx)
            }
        }

        column.addView(badge)
        column.addView(headline)
        column.addView(detail)
        column.addView(startBtn, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            dp(54),
        ).apply { topMargin = dp(28) })
        column.addView(dismissBtn, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT,
        ).apply { topMargin = dp(8) })

        val scroll = ScrollView(appCtx).apply {
            addView(
                column,
                FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.WRAP_CONTENT,
                    Gravity.BOTTOM,
                ),
            )
        }
        root.addView(
            scroll,
            FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ),
        )

        val typeFlag = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION")
            WindowManager.LayoutParams.TYPE_PHONE
        }
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            typeFlag,
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON,
            PixelFormat.TRANSLUCENT,
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            this.title = "indoornav-emergency"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
            }
        }

        return try {
            wm.addView(root, params)
            host = root
            Log.i(TAG, "Overlay View đã hiện.")
            true
        } catch (e: Exception) {
            Log.e(TAG, "Không add overlay: ${e.message}", e)
            false
        }
    }
}
