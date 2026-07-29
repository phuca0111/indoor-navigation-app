package com.khoaluan.indoornav.navigation.voice

import android.content.Context
import android.content.Intent
import android.speech.tts.TextToSpeech
import android.speech.tts.Voice
import android.util.Log
import java.util.Locale
import kotlin.math.roundToInt

/**
 * W5 — Đọc chỉ dẫn tiếng Việt kiểu Google Maps:
 * - Nói **một lần** khi vào đoạn mới (vd. “Rẽ trái sau 30 m”)
 * - Nhắc **một lần** khi sắp tới điểm rẽ (vd. “Rẽ trái sau 5 m” / “Rẽ trái”)
 * - Không spam mỗi mét khi UI cập nhật instruction
 *
 * Ưu tiên engine Google TTS + voice `vi-VN`.
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

    /** Khóa đoạn hiện tại (loại rẽ / bước), không gồm số mét. */
    private var segmentKey: String? = null
    private var segmentInitialDistM: Float = 0f
    private var lastDistM: Float = Float.MAX_VALUE
    private val spokenPhases = mutableSetOf<Phase>()

    private enum class Phase { START, APPROACH, IMMINENT }

    enum class Scale {
        /** Trong nhà — đoạn ngắn. */
        INDOOR,
        /** Ngoài trời / đi bộ đường dài. */
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

    /**
     * Đọc một câu tùy ý (đến nơi, lỗi…) — không theo pha turn-by-turn.
     */
    fun speakInstruction(text: String?) {
        if (!enabled || !ready || text.isNullOrBlank()) return
        val cleaned = clean(text)
        if (cleaned.isEmpty() || cleaned == lastSpoken) return
        speakNow(cleaned)
    }

    /**
     * Turn-by-turn kiểu Google: chỉ nói đầu đoạn + khi gần điểm rẽ.
     *
     * @param instruction text UI (có thể đổi từng mét)
     * @param distanceM khoảng cách tới manoeuvre tiếp theo
     * @param segmentId khóa ổn định (stepIndex / loại rẽ); nếu null sẽ suy từ instruction
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
        val key = (segmentId?.takeIf { it.isNotBlank() } ?: action).ifBlank { "nav" }
        val dist = distanceM.coerceAtLeast(0f)

        // Đoạn mới: đổi khóa, hoặc khoảng cách nhảy lên (sang manoeuvre kế)
        val newSegment = key != segmentKey || dist > lastDistM + 5f
        if (newSegment) {
            segmentKey = key
            segmentInitialDistM = dist
            lastDistM = dist
            spokenPhases.clear()
            val startText = instruction?.let { clean(it) }?.takeIf { it.isNotBlank() }
                ?: phraseFor(action, dist)
            speakPhase(Phase.START, startText)
            return
        }
        lastDistM = dist

        val init = segmentInitialDistM
        val (approachAt, imminentAt) = thresholds(scale, init)

        if (dist <= imminentAt && Phase.IMMINENT !in spokenPhases) {
            val text = when {
                action.contains("đến", ignoreCase = true) -> "Sắp đến nơi"
                action.isNotBlank() -> action
                else -> clean(instruction ?: "Rẽ")
            }
            speakPhase(Phase.IMMINENT, text)
            return
        }

        if (approachAt > imminentAt &&
            dist <= approachAt &&
            dist > imminentAt &&
            Phase.APPROACH !in spokenPhases
        ) {
            speakPhase(Phase.APPROACH, phraseFor(action, dist))
        }
    }

    fun resetLastSpoken() {
        lastSpoken = null
        segmentKey = null
        spokenPhases.clear()
        segmentInitialDistM = 0f
        lastDistM = Float.MAX_VALUE
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
                    else -> -1f // đoạn quá ngắn: chỉ START + IMMINENT
                }
                approach to 2.2f
            }
        }
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

    /** “Rẽ trái sau 30 m” → “Rẽ trái” */
    private fun extractAction(instruction: String?): String {
        if (instruction.isNullOrBlank()) return ""
        val t = clean(instruction)
        val cut = Regex("""\s+sau\s+\d+.*""", RegexOption.IGNORE_CASE)
            .replace(t, "")
            .trim()
        val cut2 = Regex("""\s+\d+\s*m.*""", RegexOption.IGNORE_CASE)
            .replace(cut, "")
            .trim()
        return cut2.ifBlank { t }
    }

    private fun phraseFor(action: String, distanceM: Float): String {
        val d = distanceM.roundToInt().coerceAtLeast(1)
        val a = action.ifBlank { "Đi thẳng" }
        return when {
            a.contains("đến", ignoreCase = true) -> a
            a.contains("thẳng", ignoreCase = true) -> "Đi thẳng $d m"
            else -> "$a sau $d m"
        }
    }

    companion object {
        private const val TAG = "NavTTS"
        const val GOOGLE_TTS_ENGINE = "com.google.android.tts"
    }
}
