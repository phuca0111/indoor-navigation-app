package com.tptp.bank.util

import android.net.Uri

data class QrPaymentData(val invoiceId: String, val token: String)

fun parsePaymentQr(raw: String): QrPaymentData? {
    val trimmed = raw.trim()
    return try {
        if (trimmed.startsWith("tptpbank://")) {
            val uri = Uri.parse(trimmed)
            val invoiceId = uri.getQueryParameter("invoiceId") ?: return null
            val token = uri.getQueryParameter("token") ?: return null
            return QrPaymentData(invoiceId, token)
        }
        if (trimmed.contains("invoiceId=") && trimmed.contains("token=")) {
            val uri = Uri.parse(if (trimmed.startsWith("http")) trimmed else "http://local?$trimmed")
            val invoiceId = uri.getQueryParameter("invoiceId") ?: return null
            val token = uri.getQueryParameter("token") ?: return null
            return QrPaymentData(invoiceId, token)
        }
        null
    } catch (_: Exception) {
        null
    }
}

fun formatVnd(amount: Double): String =
    String.format("%,.0f VND", amount).replace(',', '.')

fun formatVnd(amount: Long): String = formatVnd(amount.toDouble())
