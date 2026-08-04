package com.khoaluan.indoornav.navigation.heading

/**
 * HDE nhẹ (Heading Drift Elimination): khi đi thẳng gần trục 0/90/180/270° trên map,
 * kéo Map Heading về cardinal gần nhất — không ép khi đang rẽ / lệch lớn.
 */
object DominantHeadingEstimator {

    /** Cardinal gần nhất: …, -90, 0, 90, 180, … rồi normalize. */
    fun nearestCardinalDeg(headingDeg: Float): Float {
        val n = MapHeadingMath.normalizeDegrees(headingDeg)
        val k = kotlin.math.round(n / 90f)
        return MapHeadingMath.normalizeDegrees(k * 90f)
    }

    /**
     * Mục tiêu HDE nếu [mapHeadingDeg] đủ gần cardinal và đang đi thẳng theo travel.
     * null = không áp (rẽ / lệch quá xa / chưa thẳng).
     */
    fun softTargetDeg(
        mapHeadingDeg: Float,
        travelHeadingDeg: Float?,
        maxAlignToCardinalDeg: Float = 22f,
        minPullDeg: Float = 6f,
        maxPullDeg: Float = 32f,
    ): Float? {
        val card = nearestCardinalDeg(mapHeadingDeg)
        val alignMap = kotlin.math.abs(MapHeadingMath.shortestDeltaDegrees(mapHeadingDeg, card))
        if (alignMap < minPullDeg || alignMap > maxPullDeg) return null
        if (alignMap > maxAlignToCardinalDeg) return null
        if (travelHeadingDeg != null) {
            val alignTravel = kotlin.math.abs(
                MapHeadingMath.shortestDeltaDegrees(travelHeadingDeg, card),
            )
            // Travel phải cùng cardinal — tránh kéo khi đi chéo / rẽ
            if (alignTravel > maxAlignToCardinalDeg) return null
        }
        return card
    }
}
