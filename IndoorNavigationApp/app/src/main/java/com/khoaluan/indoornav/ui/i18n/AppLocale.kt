package com.khoaluan.indoornav.ui.i18n

import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.staticCompositionLocalOf

/** Locale hiện tại của app (`vi` | `en`). Đồng bộ prefs + CompositionLocal. */
object AppLocaleHolder {
    @Volatile
    var tag: String = "vi"
        private set

    fun set(tag: String) {
        this.tag = if (tag.equals("en", ignoreCase = true)) "en" else "vi"
    }

    fun isEn(): Boolean = tag == "en"
}

val LocalAppLocale = compositionLocalOf { "vi" }

/**
 * Dịch UI theo locale Compose (tự recomposition khi đổi ngôn ngữ).
 */
@Composable
fun tr(vi: String, en: String): String {
    val locale = LocalAppLocale.current
    return if (locale == "en") en else vi
}

/** Dịch ngoài Compose (ViewModel / ErrorCenter) — đọc AppLocaleHolder. */
fun trStatic(vi: String, en: String): String =
    if (AppLocaleHolder.isEn()) en else vi
