package com.khoaluan.indoornav.ui.search

/**
 * G4 — Search gợi ý chịu sai: bỏ dấu tiếng Việt + fuzzy nhẹ (Levenshtein).
 */
object SearchFuzzy {

    /** Chuẩn hóa: lower-case + bỏ dấu. */
    fun normalize(input: String): String {
        val lower = input.trim().lowercase()
        if (lower.isEmpty()) return ""
        val sb = StringBuilder(lower.length)
        for (ch in lower) {
            sb.append(stripDiacritic(ch))
        }
        return sb.toString()
    }

    /**
     * Điểm khớp càng cao càng tốt (để sort gợi ý).
     * 0 = không khớp.
     */
    fun matchScore(query: String, candidate: String): Int {
        val q = normalize(query)
        val c = normalize(candidate)
        if (q.isEmpty() || c.isEmpty()) return 0
        if (c == q) return 1000
        if (c.startsWith(q)) return 800 + (q.length.coerceAtMost(50))
        if (c.contains(q)) return 600 + (q.length.coerceAtMost(50))

        // Fuzzy: khoảng cách trên toàn chuỗi hoặc trên từng token
        val maxDist = when {
            q.length <= 3 -> 1
            q.length <= 6 -> 2
            else -> 2
        }
        val fullDist = levenshtein(q, c)
        if (fullDist <= maxDist) return 400 - fullDist * 40

        // Token: chỉ boost khi query khớp đầu token (gõ dở "phong" → "phòng khách"),
        // KHÔNG boost khi query dài hơn token ("phong khachh".startsWith("phong")) — gây lệch ranking.
        val tokens = c.split(' ', '-', '_').filter { it.isNotEmpty() }
        var best = Int.MAX_VALUE
        var prefixBoost = 0
        for (t in tokens) {
            val d = levenshtein(q, t)
            if (d < best) best = d
            if (t.startsWith(q) && q.length >= 2) {
                prefixBoost = maxOf(prefixBoost, 500 + q.length.coerceAtMost(40))
            } else if (q.length >= 3 && t.length >= 3) {
                val tokenDist = when {
                    q.length <= 3 -> 1
                    else -> 2
                }
                if (d <= tokenDist) {
                    prefixBoost = maxOf(prefixBoost, 350 - d * 40)
                }
            }
        }
        if (prefixBoost > 0) return prefixBoost
        if (best <= maxDist) return 300 - best * 40
        return 0
    }

    fun filterRanked(query: String, names: List<String>, limit: Int = 20): List<String> {
        if (query.isBlank()) return emptyList()
        return names
            .map { it to matchScore(query, it) }
            .filter { it.second > 0 }
            .sortedByDescending { it.second }
            .take(limit)
            .map { it.first }
    }

    fun <T> filterRankedBy(
        query: String,
        items: List<T>,
        nameOf: (T) -> String,
        limit: Int = 20,
    ): List<T> {
        if (query.isBlank()) return emptyList()
        return items
            .map { it to matchScore(query, nameOf(it)) }
            .filter { it.second > 0 }
            .sortedByDescending { it.second }
            .take(limit)
            .map { it.first }
    }

    private fun stripDiacritic(ch: Char): Char {
        return when (ch) {
            'à', 'á', 'ạ', 'ả', 'ã', 'â', 'ầ', 'ấ', 'ậ', 'ẩ', 'ẫ', 'ă', 'ằ', 'ắ', 'ặ', 'ẳ', 'ẵ' -> 'a'
            'è', 'é', 'ẹ', 'ẻ', 'ẽ', 'ê', 'ề', 'ế', 'ệ', 'ể', 'ễ' -> 'e'
            'ì', 'í', 'ị', 'ỉ', 'ĩ' -> 'i'
            'ò', 'ó', 'ọ', 'ỏ', 'õ', 'ô', 'ồ', 'ố', 'ộ', 'ổ', 'ỗ', 'ơ', 'ờ', 'ớ', 'ợ', 'ở', 'ỡ' -> 'o'
            'ù', 'ú', 'ụ', 'ủ', 'ũ', 'ư', 'ừ', 'ứ', 'ự', 'ử', 'ữ' -> 'u'
            'ỳ', 'ý', 'ỵ', 'ỷ', 'ỹ' -> 'y'
            'đ' -> 'd'
            else -> ch
        }
    }

    fun levenshtein(a: String, b: String): Int {
        if (a == b) return 0
        if (a.isEmpty()) return b.length
        if (b.isEmpty()) return a.length
        val m = a.length
        val n = b.length
        var prev = IntArray(n + 1) { it }
        var curr = IntArray(n + 1)
        for (i in 1..m) {
            curr[0] = i
            for (j in 1..n) {
                val cost = if (a[i - 1] == b[j - 1]) 0 else 1
                curr[j] = minOf(
                    curr[j - 1] + 1,
                    prev[j] + 1,
                    prev[j - 1] + cost,
                )
            }
            val tmp = prev
            prev = curr
            curr = tmp
        }
        return prev[n]
    }
}
