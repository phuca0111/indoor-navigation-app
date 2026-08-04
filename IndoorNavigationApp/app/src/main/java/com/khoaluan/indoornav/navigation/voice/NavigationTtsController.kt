package com.khoaluan.indoornav.navigation.voice

import android.content.Context
import android.content.Intent
import android.speech.tts.TextToSpeech
import android.speech.tts.Voice
import android.util.Log
import java.util.Locale
import kotlin.math.roundToInt

/**
 * W5 — Đọc chỉ dẫn tiếng Việt kiểu Google Maps (hành vi e86ee98):
 * - Nói **một lần** khi vào đoạn mới (đổi loại manoeuvre)
 * - Nhắc **một lần** khi sắp tới điểm rẽ (APPROACH / IMMINENT)
 * - Không spam mỗi mét / mỗi lần UI cập nhật
 *
 * Khác bản lỗi gần đây: **không** reset đoạn chỉ vì distance nhảy lên
 * (PDR/lag trên đường thẳng từng làm nói lại liên tục).
 */
class NavigationTtsController(
    context: Context,
    private val onVietnameseUnavailable: (() -> Unit)? = null,
) : TextToSpeech.OnInitListener {

    private val appContext = context.applicationContext
    private var tts: TextToSpeech? = null
    private var ready = false
    private var enabled = true
    private var lastSpoken: String? = null
    private var usingVietnamese = false
    private var promptedInstall = false
    /** Khóa không đổi segment trong vài giây đầu sau lần nói — tránh loạn lúc Bắt đầu. */
    private var segmentLockUntilMs: Long = 0L
    private var arriveAnnounced = false

    /** Khóa đoạn hiện tại (loại rẽ / bước), không gồm số mét. */
    private var segmentKey: String? = null
    private var segmentInitialDistM: Float = 0f
    private var lastDistM: Float = Float.MAX_VALUE
    private val spokenPhases = mutableSetOf<Phase>()

    private enum class Phase { START, APPROACH, IMMINENT }

    enum class Scale {
        INDOOR,
        OUTDOOR,
    }

    init {
        tts = tryCreate(GOOGLE_TTS_ENGINE) ?: tryCreate(null)
    }

    private fun tryCreate(enginePackage: String?): TextToSpeech {
        return if (enginePackage.isNullOrBlank()) {
            TextToSpeech(appContext, this)
        } else {
            try {
                TextToSpeech(appContext, this, enginePackage)
            } catch (e: Exception) {
                Log.w(TAG, "Không mở được engine $enginePackage: ${e.message}")
                TextToSpeech(appContext, this)
            }
        }
    }

    override fun onInit(status: Int) {
        ready = status == TextToSpeech.SUCCESS
        if (!ready) {
            Log.w(TAG, "TTS init failed status=$status")
            return
        }
        Log.i(TAG, "TTS engine=${tts?.defaultEngine}")
        usingVietnamese = applyVietnameseVoice()
        if (!usingVietnamese && !promptedInstall) {
            promptedInstall = true
            onVietnameseUnavailable?.invoke()
        }
    }

    private fun applyVietnameseVoice(): Boolean {
        val engine = tts ?: return false
        val candidates = listOf(
            Locale.forLanguageTag("vi-VN"),
            Locale("vi", "VN"),
            Locale("vi"),
        )
        var languageOk = false
        for (loc in candidates) {
            val avail = engine.isLanguageAvailable(loc)
            if (avail >= TextToSpeech.LANG_AVAILABLE) {
                val r = engine.setLanguage(loc)
                if (r >= TextToSpeech.LANG_AVAILABLE) {
                    languageOk = true
                    break
                }
            }
        }
        val voiceOk = pickVietnameseVoice(engine)
        val ok = languageOk || voiceOk
        if (ok) {
            engine.setSpeechRate(0.95f)
            engine.setPitch(1.0f)
        }
        return ok
    }

    private fun pickVietnameseVoice(engine: TextToSpeech): Boolean {
        return try {
            @Suppress("DEPRECATION")
            val voices = engine.voices ?: emptySet()
            val viVoices = voices.filter { voice ->
                voice.locale?.language?.lowercase(Locale.ROOT) == "vi"
            }.sortedWith(
                compareByDescending<Voice> { it.quality }
                    .thenBy { if (it.isNetworkConnectionRequired) 1 else 0 },
            )
            val best = viVoices.firstOrNull()
            if (best != null) {
                engine.voice = best
                engine.language = best.locale
                true
            } else {
                false
            }
        } catch (_: Exception) {
            false
        }
    }

    fun setEnabled(on: Boolean) {
        enabled = on
        if (!on) tts?.stop()
    }

    fun isEnabled(): Boolean = enabled

    fun isUsingVietnamese(): Boolean = usingVietnamese

    fun openInstallVietnameseData(context: Context) {
        try {
            context.startActivity(
                Intent(TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                },
            )
        } catch (e: Exception) {
            Log.w(TAG, "ACTION_INSTALL_TTS_DATA: ${e.message}")
            try {
                context.startActivity(
                    Intent("com.android.settings.TTS_SETTINGS").apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    },
                )
            } catch (_: Exception) {
                try {
                    context.startActivity(
                        Intent(
                            Intent.ACTION_VIEW,
                            android.net.Uri.parse("market://details?id=$GOOGLE_TTS_ENGINE"),
                        ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) },
                    )
                } catch (_: Exception) {
                }
            }
        }
    }

    fun refreshVietnameseVoice(): Boolean {
        if (!ready) return false
        usingVietnamese = applyVietnameseVoice()
        return usingVietnamese
    }

    fun speakInstruction(text: String?) {
        if (!enabled || !ready || text.isNullOrBlank()) return
        val cleaned = clean(text)
        if (cleaned.isEmpty() || cleaned == lastSpoken) return
        speakNow(cleaned)
    }

    /**
     * @param segmentId khóa ổn định: TURN_LEFT / TURN_RIGHT / ARRIVE / STRAIGHT
     *        (không lấy từ text có số mét — tránh spam).
     */
    fun speakTurnByTurn(
        instruction: String?,
        distanceM: Float,
        segmentId: String? = null,
        scale: Scale = Scale.INDOOR,
    ) {
        if (!enabled || !ready) return
        if (instruction.isNullOrBlank() && distanceM <= 0f) return

        val action = extractAction(instruction)
        val key = normalizeKey(segmentId?.takeIf { it.isNotBlank() } ?: action)
        if (key.isBlank()) return
        val dist = distanceM.coerceAtLeast(0f)
        val now = System.currentTimeMillis()

        // Đã báo sắp đến / đến nơi trong phiên này → im lặng (tránh nói liên tục gần đích)
        if (arriveAnnounced) return

        // Chỉ đoạn mới khi ĐỔI loại manoeuvre — không vì dist nhảy (lag PDR).
        val newSegment = key != segmentKey
        if (newSegment) {
            // Đang trong lock sau câu đầu / vừa nói → bỏ qua nhấp type lúc Start
            if (segmentKey != null && now < segmentLockUntilMs) {
                return
            }
            segmentKey = key
            segmentInitialDistM = dist
            lastDistM = dist
            spokenPhases.clear()

            // Đường thẳng / sắp đến: nói 1 lần trong cả phiên (không lặp khi gần đích)
            if (isStraightOrArrive(key, action)) {
                if (arriveAnnounced ||
                    action.contains("đến", ignoreCase = true) ||
                    key.contains("ARRIVE")
                ) {
                    if (arriveAnnounced &&
                        (action.contains("đến", ignoreCase = true) || key.contains("ARRIVE"))
                    ) {
                        spokenPhases += Phase.START
                        spokenPhases += Phase.APPROACH
                        spokenPhases += Phase.IMMINENT
                        return
                    }
                }
                val startText = when {
                    // Chỉ “Sắp đến nơi” khi câu UI thật sự nói đến nơi — không vì segmentId=ARRIVE
                    action.contains("sắp đến", ignoreCase = true) ||
                        action.contains("đã đến", ignoreCase = true) ||
                        (instruction?.contains("Sắp đến nơi", ignoreCase = true) == true) ||
                        (instruction?.contains("Đã đến nơi", ignoreCase = true) == true) -> {
                        arriveAnnounced = true
                        "Sắp đến nơi"
                    }
                    key.contains("ARRIVE") &&
                        (instruction?.contains("thẳng", ignoreCase = true) == true) -> {
                        val m = Regex("""(\d+)\s*m""", RegexOption.IGNORE_CASE)
                            .find(instruction ?: "")
                            ?.groupValues?.getOrNull(1)
                        if (m != null) "Đi thẳng $m m" else "Đi thẳng"
                    }
                    // Giữ đủ câu “Đi thẳng Xm rồi rẽ …”
                    (instruction?.contains("rồi rẽ", ignoreCase = true) == true) ->
                        clean(instruction)
                    else -> {
                        val m = Regex("""(\d+)\s*m""", RegexOption.IGNORE_CASE)
                            .find(instruction ?: "")
                            ?.groupValues?.getOrNull(1)
                        if (m != null) "Đi thẳng $m m" else "Đi thẳng"
                    }
                }
                speakPhase(Phase.START, startText)
                spokenPhases += Phase.APPROACH
                spokenPhases += Phase.IMMINENT
                segmentLockUntilMs = now + SEGMENT_LOCK_MS
                return
            }

            // Ngã rẽ gần (<7m): một câu “Rẽ trái/phải”, đủ pha
            if (scale == Scale.INDOOR && dist < 7f) {
                val turnText = action.ifBlank { "Rẽ" }
                speakPhase(Phase.START, turnText)
                spokenPhases += Phase.APPROACH
                spokenPhases += Phase.IMMINENT
                segmentLockUntilMs = now + SEGMENT_LOCK_MS
                return
            }

            val startText = phraseFor(action, dist)
            speakPhase(Phase.START, startText)
            segmentLockUntilMs = now + SEGMENT_LOCK_MS
            return
        }

        // Cùng đoạn: chỉ giảm dần dist (bỏ qua nhiễu tăng đột ngột)
        if (dist <= lastDistM + 1.5f) {
            lastDistM = dist
        } else {
            // Dist tăng do nhiễu — bỏ qua, không nói lại
            return
        }

        val init = segmentInitialDistM
        val (approachAt, imminentAt) = thresholds(scale, init)

        if (dist <= imminentAt && Phase.IMMINENT !in spokenPhases) {
            val text = when {
                action.contains("đến", ignoreCase = true) -> "Sắp đến nơi"
                action.isNotBlank() -> action
                else -> clean(instruction ?: "Rẽ")
            }
            if (clean(text) == lastSpoken) {
                spokenPhases += Phase.IMMINENT
                return
            }
            speakPhase(Phase.IMMINENT, text)
            return
        }

        if (approachAt > imminentAt &&
            dist <= approachAt &&
            dist > imminentAt &&
            Phase.APPROACH !in spokenPhases
        ) {
            val phrase = phraseFor(action, dist)
            if (clean(phrase) == lastSpoken) {
                spokenPhases += Phase.APPROACH
                return
            }
            speakPhase(Phase.APPROACH, phrase)
        }
    }

    fun resetLastSpoken() {
        lastSpoken = null
        segmentKey = null
        spokenPhases.clear()
        segmentInitialDistM = 0f
        lastDistM = Float.MAX_VALUE
        segmentLockUntilMs = 0L
        arriveAnnounced = false
        tts?.stop()
    }

    fun shutdown() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        ready = false
    }

    private fun thresholds(scale: Scale, initialDist: Float): Pair<Float, Float> {
        return when (scale) {
            Scale.OUTDOOR -> {
                val approach = when {
                    initialDist >= 120f -> 50f
                    initialDist >= 60f -> 25f
                    initialDist >= 30f -> 15f
                    else -> -1f
                }
                approach to 8f
            }
            Scale.INDOOR -> {
                val approach = when {
                    initialDist >= 25f -> 8f
                    initialDist >= 12f -> 5f
                    initialDist >= 7f -> 3.5f
                    else -> -1f
                }
                // Chỉ nhắc rẽ sát ngã (~1.2 m) — một lần IMMINENT
                approach to 1.2f
            }
        }
    }

    private fun normalizeKey(raw: String): String =
        raw.replace(Regex("""\s+"""), " ").trim().uppercase(Locale.ROOT)

    private fun isStraightOrArrive(key: String, action: String): Boolean {
        val k = key.uppercase(Locale.ROOT)
        return k.contains("STRAIGHT") || k.contains("ARRIVE") ||
            action.contains("thẳng", ignoreCase = true) ||
            action.contains("đến", ignoreCase = true)
    }

    private fun speakPhase(phase: Phase, text: String) {
        val cleaned = clean(text)
        if (cleaned.isEmpty()) return
        spokenPhases += phase
        if (cleaned == lastSpoken) return
        speakNow(cleaned)
    }

    private fun speakNow(spoken: String) {
        lastSpoken = spoken
        if (!usingVietnamese) {
            usingVietnamese = applyVietnameseVoice()
        } else {
            tts?.language = Locale.forLanguageTag("vi-VN")
        }
        if (!usingVietnamese) {
            Log.w(TAG, "Đang đọc không có voice VI: $spoken")
        }
        val params = android.os.Bundle().apply {
            putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, "nav-${spoken.hashCode()}")
        }
        tts?.speak(spoken, TextToSpeech.QUEUE_FLUSH, params, "nav-${spoken.hashCode()}")
    }

    private fun clean(text: String): String =
        text.replace("·", ",")
            .replace("…", ".")
            .replace("—", ",")
            .trim()

    private fun extractAction(instruction: String?): String {
        if (instruction.isNullOrBlank()) return ""
        val t = clean(instruction)
        val cut = Regex("""\s+sau\s+\d+.*""", RegexOption.IGNORE_CASE)
            .replace(t, "")
            .trim()
        val cut2 = Regex("""\s+\d+\s*m.*""", RegexOption.IGNORE_CASE)
            .replace(cut, "")
            .trim()
        val cut3 = Regex("""\s*[,·]\s*còn.*""", RegexOption.IGNORE_CASE)
            .replace(cut2, "")
            .trim()
        return cut3.ifBlank { t }
    }

    private fun phraseFor(action: String, distanceM: Float): String {
        val d = distanceM.roundToInt().coerceAtLeast(1)
        val a = action.ifBlank { "Đi thẳng" }
        return when {
            a.contains("đến", ignoreCase = true) -> a
            a.contains("thẳng", ignoreCase = true) -> "Đi thẳng"
            else -> if (distanceM < 7f) a else "$a sau $d m"
        }
    }

    companion object {
        private const val TAG = "NavTTS"
        const val GOOGLE_TTS_ENGINE = "com.google.android.tts"
        private const val SEGMENT_LOCK_MS = 3500L
    }
}
