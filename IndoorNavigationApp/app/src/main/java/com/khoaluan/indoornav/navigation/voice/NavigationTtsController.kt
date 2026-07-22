package com.khoaluan.indoornav.navigation.voice

import android.content.Context
import android.speech.tts.TextToSpeech
import java.util.Locale

/**
 * W5 — Đọc chỉ dẫn W1 bằng TextToSpeech (vi-VN nếu có).
 */
class NavigationTtsController(context: Context) : TextToSpeech.OnInitListener {

    private var tts: TextToSpeech? = TextToSpeech(context.applicationContext, this)
    private var ready = false
    private var enabled = true
    private var lastSpoken: String? = null

    override fun onInit(status: Int) {
        ready = status == TextToSpeech.SUCCESS
        if (ready) {
            val vi = Locale("vi", "VN")
            val r = tts?.setLanguage(vi)
            if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                tts?.language = Locale.getDefault()
            }
        }
    }

    fun setEnabled(on: Boolean) {
        enabled = on
        if (!on) tts?.stop()
    }

    fun isEnabled(): Boolean = enabled

    fun speakInstruction(text: String?) {
        if (!enabled || !ready || text.isNullOrBlank()) return
        if (text == lastSpoken) return
        lastSpoken = text
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "nav-${text.hashCode()}")
    }

    fun resetLastSpoken() {
        lastSpoken = null
    }

    fun shutdown() {
        tts?.stop()
        tts?.shutdown()
        tts = null
        ready = false
    }
}
