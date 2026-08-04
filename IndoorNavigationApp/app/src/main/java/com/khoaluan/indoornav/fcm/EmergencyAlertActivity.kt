package com.khoaluan.indoornav.fcm

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import com.khoaluan.indoornav.deeplink.extractEmergencyDeepLink
import com.khoaluan.indoornav.navigation.emergency.EmergencySession
import com.khoaluan.indoornav.ui.screens.emergency.EmergencyTakeoverOverlay
import com.khoaluan.indoornav.ui.theme.IndoorNavigationAppTheme

/**
 * Activity full-screen riêng cho cảnh báo khẩn cấp.
 * Mở trực tiếp từ FCM (startActivity / full-screen intent) — không chờ MainActivity / login.
 */
class EmergencyAlertActivity : ComponentActivity() {

    /** false khi bấm Chỉ đường — Main giữ còi; true khi Đóng / Back. */
    private var stopSirenOnDestroy: Boolean = true

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        EmergencyNotifier.prepareActivityForLockScreen(this)
        enableEdgeToEdge()

        val link = extractEmergencyDeepLink(intent)
        val type = (link?.incidentType
            ?: intent.getStringExtra(EXTRA_TYPE)
            ?: "FIRE").uppercase()
        val title = link?.title
            ?: intent.getStringExtra(EXTRA_TITLE)
        val body = link?.body
            ?: intent.getStringExtra(EXTRA_BODY)
        val buildingId = link?.buildingId
            ?: intent.getStringExtra(EXTRA_BUILDING)
        val incidentId = link?.incidentId
            ?: intent.getStringExtra(EXTRA_INCIDENT)

        setContent {
            IndoorNavigationAppTheme(darkTheme = true, dynamicColor = false) {
                Surface(modifier = Modifier.fillMaxSize()) {
                    val session = remember(type, title, body, buildingId, incidentId) {
                        EmergencySession(
                            active = true,
                            incidentType = type,
                            title = EmergencySession.defaultTitle(type, title),
                            body = body?.takeIf { it.isNotBlank() }
                                ?: EmergencySession.bodyForType(type),
                            buildingId = buildingId,
                            incidentId = incidentId,
                        )
                    }
                    EmergencyTakeoverOverlay(
                        session = session,
                        onStartEvacuation = {
                            // Không mở lại màn đỏ; Main hỏi tầng / vị trí — tắt còi ngay
                            stopSirenOnDestroy = false
                            EmergencySirenPlayer.stop()
                            EmergencyNotifier.stopTakeoverAudio(this@EmergencyAlertActivity)
                            EmergencyNotifier.setSuppressAlertUi(this@EmergencyAlertActivity, true)
                            startActivity(
                                EmergencyNotifier.buildLaunchIntent(
                                    context = this@EmergencyAlertActivity,
                                    type = type,
                                    title = title,
                                    body = body,
                                    buildingId = buildingId,
                                    incidentId = incidentId,
                                    autoEvacuate = true,
                                )
                            )
                            finish()
                        },
                        onDismiss = {
                            // Không finish() vào trống — mở Main + banner “mở lại sau”
                            stopSirenOnDestroy = true
                            EmergencyNotifier.setSuppressAlertUi(this@EmergencyAlertActivity, true)
                            EmergencySirenPlayer.stop()
                            EmergencyNotifier.cancel(this@EmergencyAlertActivity)
                            startActivity(
                                EmergencyNotifier.buildLaunchIntent(
                                    context = this@EmergencyAlertActivity,
                                    type = type,
                                    title = title,
                                    body = body,
                                    buildingId = buildingId,
                                    incidentId = incidentId,
                                    autoEvacuate = false,
                                    snoozeOverlay = true,
                                )
                            )
                            finish()
                        },
                    )
                }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // Đang sơ tán / suppress → không recreate màn đỏ
        if (EmergencyNotifier.isAlertUiSuppressed(this)) {
            setIntent(intent)
            finish()
            return
        }
        setIntent(intent)
        recreate()
    }

    override fun onDestroy() {
        if (isFinishing && stopSirenOnDestroy) {
            EmergencySirenPlayer.stop()
        }
        super.onDestroy()
    }

    companion object {
        const val EXTRA_TYPE = "emergency_type"
        const val EXTRA_TITLE = "emergency_title"
        const val EXTRA_BODY = "emergency_body"
        const val EXTRA_BUILDING = "emergency_building"
        const val EXTRA_INCIDENT = "emergency_incident"
        /** Bấm "Chỉ đường" trên AlertActivity → Main tự sơ tán, không hiện lại màn ALERT. */
        const val EXTRA_AUTO_EVACUATE = "emergency_auto_evacuate"
        /** Bấm "Đóng — mở lại sau" → Main + banner, không hiện màn đỏ / không thoát app. */
        const val EXTRA_SNOOZE_OVERLAY = "emergency_snooze_overlay"
    }
}
