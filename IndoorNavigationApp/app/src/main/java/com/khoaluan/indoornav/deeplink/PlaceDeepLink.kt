package com.khoaluan.indoornav.deeplink

import android.content.Intent
import android.net.Uri

/**
 * #27 Deep Link — `indoornav://` / `indoorhub://place/{id}/floor/{n}` + https path.
 */
data class PlaceDeepLink(
    val placeSlugOrId: String,
    val floor: Int? = null,
)

fun extractPlaceDeepLink(intent: Intent?): PlaceDeepLink? {
    val data: Uri = intent?.data ?: return null
    val scheme = data.scheme?.lowercase()

    if (scheme == "indoornav" || scheme == "indoorhub") {
        // indoorhub://place/123/floor/2  OR  indoornav://place/123/floor/2
        val segs = data.pathSegments.orEmpty()
        when {
            data.host.equals("place", ignoreCase = true) && segs.isNotEmpty() -> {
                val slug = Uri.decode(segs[0])
                val floor = if (segs.size >= 3 && segs[1].equals("floor", true)) {
                    segs[2].toIntOrNull()
                } else null
                return PlaceDeepLink(slug, floor)
            }
            segs.size >= 2 && segs[0].equals("place", true) -> {
                val slug = Uri.decode(segs[1])
                val floor = if (segs.size >= 4 && segs[2].equals("floor", true)) {
                    segs[3].toIntOrNull()
                } else null
                return PlaceDeepLink(slug, floor)
            }
            segs.isNotEmpty() -> return PlaceDeepLink(Uri.decode(segs[0]), null)
            !data.host.isNullOrBlank() && !data.host.equals("place", true) ->
                return PlaceDeepLink(Uri.decode(data.host!!), null)
        }
    }

    val path = data.path.orEmpty()
    val withFloor = Regex(
        """/(?:outdoor|app)/place/([^/?#]+)(?:/floor/(\d+))?""",
        RegexOption.IGNORE_CASE,
    ).find(path)
    if (withFloor != null) {
        return PlaceDeepLink(
            Uri.decode(withFloor.groupValues[1]),
            withFloor.groupValues.getOrNull(2)?.toIntOrNull(),
        )
    }
    val q = data.getQueryParameter("place")?.takeIf { it.isNotBlank() }
        ?: data.getQueryParameter("slug")?.takeIf { it.isNotBlank() }
        ?: return null
    val floor = data.getQueryParameter("floor")?.toIntOrNull()
    return PlaceDeepLink(Uri.decode(q), floor)
}
