// ============================================
// Map Governance P1 — Duplicate Detection (rule-based)
// Tín hiệu: tên/alias (fuzzy) + GPS (Haversine) + category
// ============================================

const Place = require('../models/Place');

const DEFAULT_THRESHOLD = 0.95;
const GPS_FULL_SCORE_METERS = 30;
const GPS_ZERO_SCORE_METERS = 500;

function stripDiacritics(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function normalizeName(str) {
  return stripDiacritics(str)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(str) {
  const n = normalizeName(str);
  if (!n) return new Set();
  return new Set(n.split(' ').filter(Boolean));
}

/** Jaccard similarity trên token */
function nameSimilarity(a, b) {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (!sa.size && !sb.size) return 1;
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  sa.forEach((t) => { if (sb.has(t)) inter += 1; });
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}

/** Best name score giữa name + aliases hai phía */
function bestNameScore(candidate, target) {
  const cNames = [candidate.name, ...(candidate.aliases || [])].filter(Boolean);
  const tNames = [target.name, ...(target.aliases || [])].filter(Boolean);
  let best = 0;
  for (const c of cNames) {
    for (const t of tNames) {
      best = Math.max(best, nameSimilarity(c, t));
    }
  }
  return best;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function gpsSimilarity(lat1, lng1, lat2, lng2) {
  const aOk = Number.isFinite(lat1) && Number.isFinite(lng1) && !(lat1 === 0 && lng1 === 0);
  const bOk = Number.isFinite(lat2) && Number.isFinite(lng2) && !(lat2 === 0 && lng2 === 0);
  if (!aOk || !bOk) return { score: 0, meters: null, skipped: true };
  const meters = haversineMeters(lat1, lng1, lat2, lng2);
  if (meters <= GPS_FULL_SCORE_METERS) return { score: 1, meters, skipped: false };
  if (meters >= GPS_ZERO_SCORE_METERS) return { score: 0, meters, skipped: false };
  const score = 1 - (meters - GPS_FULL_SCORE_METERS) / (GPS_ZERO_SCORE_METERS - GPS_FULL_SCORE_METERS);
  return { score, meters, skipped: false };
}

function categoryBoost(a, b) {
  const ca = normalizeName(a || '');
  const cb = normalizeName(b || '');
  if (!ca || !cb) return 0;
  return ca === cb ? 0.03 : 0;
}

/**
 * Composite score 0..1 (cap 1).
 * name 55% + gps 45% + category boost nhỏ.
 */
function compositeScore(candidate, target) {
  const name = bestNameScore(candidate, target);
  const gps = gpsSimilarity(
    Number(candidate.latitude),
    Number(candidate.longitude),
    Number(target.latitude),
    Number(target.longitude)
  );
  let score;
  if (gps.skipped) {
    score = name;
  } else {
    score = name * 0.55 + gps.score * 0.45;
  }
  score = Math.min(1, score + categoryBoost(candidate.category, target.category));
  return {
    score,
    name_score: name,
    gps_score: gps.score,
    gps_meters: gps.meters,
    gps_skipped: !!gps.skipped
  };
}

/**
 * P3 — “AI triage” rule-based: giải thích điểm + khuyến nghị hành động.
 * Không gọi LLM; output dạng agent để Super Admin / queue tự động dùng.
 */
function buildAiAssessment(detail, threshold = DEFAULT_THRESHOLD) {
  const provider = String(process.env.MGC_AI_PROVIDER || 'rule').toLowerCase();
  const namePct = Math.round((detail.name_score || 0) * 100);
  const gpsPct = Math.round((detail.gps_score || 0) * 100);
  const totalPct = Math.round((detail.score || 0) * 100);
  const factors = [
    { signal: 'name', weight: detail.gps_skipped ? 1 : 0.55, score: detail.name_score, label: `Tên giống ${namePct}%` },
    {
      signal: 'gps',
      weight: detail.gps_skipped ? 0 : 0.45,
      score: detail.gps_score,
      label: detail.gps_skipped
        ? 'GPS thiếu / bỏ qua'
        : `GPS ${gpsPct}%` + (detail.gps_meters != null ? ` (~${Math.round(detail.gps_meters)}m)` : '')
    }
  ];
  let recommendation = 'KEEP_SEPARATE';
  let confidence = 'low';
  let summary = 'Khả năng trùng thấp.';
  if (detail.score >= threshold) {
    recommendation = 'LIKELY_DUPLICATE';
    confidence = detail.score >= 0.98 ? 'very_high' : 'high';
    summary = `Có thể trùng (${totalPct}%). Không cần Super xem từng cái nếu queue tự gắn.`;
  } else if (detail.score >= threshold - 0.1) {
    recommendation = 'REVIEW';
    confidence = 'medium';
    summary = `Gần ngưỡng trùng (${totalPct}%). Nên review thủ công.`;
  }
  return {
    model: provider === 'llm' ? 'rule-based-v1-llm-unavailable' : 'rule-based-v1',
    provider: provider === 'llm' ? 'llm-fallback-rule' : 'rule-based',
    total_percent: totalPct,
    name_percent: namePct,
    gps_percent: gpsPct,
    factors,
    recommendation,
    confidence,
    summary,
    note: provider === 'llm'
      ? 'MGC_AI_PROVIDER=llm chưa có API key/LLM — fallback rule-based.'
      : undefined
  };
}

/**
 * Tìm Place nghi trùng với payload.
 * @param {object} payload { name, aliases?, latitude, longitude, category? }
 * @param {object} options { excludeId?, threshold?, limit?, statusFilter? }
 */
async function findDuplicatePlaces(payload, options = {}) {
  const threshold = Number(options.threshold);
  const th = Number.isFinite(threshold) ? threshold : DEFAULT_THRESHOLD;
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 20, 1), 50);
  const excludeId = options.excludeId ? String(options.excludeId) : null;

  const filter = { status: { $nin: ['LOCKED', 'MERGED'] } };
  if (excludeId) filter._id = { $ne: excludeId };

  // Prefilter: bounding box ~1km nếu có GPS, cộng thêm text-ish bằng regex đơn giản
  const lat = Number(payload.latitude) || 0;
  const lng = Number(payload.longitude) || 0;
  const hasGps = !(lat === 0 && lng === 0);
  if (hasGps) {
    // ~0.01 deg ≈ 1.1km
    filter.latitude = { $gte: lat - 0.02, $lte: lat + 0.02 };
    filter.longitude = { $gte: lng - 0.02, $lte: lng + 0.02 };
  }

  let candidates = await Place.find(filter).limit(200).lean();

  // Nếu có GPS prefilter quá hẹp / không ra kết quả, nới bằng quét tên
  if (!candidates.length || !hasGps) {
    const norm = normalizeName(payload.name);
    const token = norm.split(' ')[0];
    const nameFilter = { status: { $nin: ['LOCKED', 'MERGED'] } };
    if (excludeId) nameFilter._id = { $ne: excludeId };
    if (token && token.length >= 2) {
      nameFilter.$or = [
        { name: new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
        { aliases: new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }
      ];
    }
    candidates = await Place.find(nameFilter).limit(200).lean();
  }

  const target = {
    name: payload.name,
    aliases: payload.aliases || [],
    latitude: lat,
    longitude: lng,
    category: payload.category || ''
  };

  const withAi = options.withAiExplain === true;
  const scored = candidates
    .map((c) => {
      const detail = compositeScore(c, target);
      const row = {
        place: {
          _id: c._id,
          name: c.name,
          aliases: c.aliases || [],
          latitude: c.latitude,
          longitude: c.longitude,
          category: c.category || '',
          verified: !!c.verified,
          status: c.status
        },
        similarity: Math.round(detail.score * 1000) / 1000,
        name_score: Math.round(detail.name_score * 1000) / 1000,
        gps_score: Math.round(detail.gps_score * 1000) / 1000,
        gps_meters: detail.gps_meters == null ? null : Math.round(detail.gps_meters),
        message: detail.score >= th
          ? 'Có vẻ địa điểm đã tồn tại'
          : (detail.score >= th - 0.1 ? 'Có thể trùng (gần ngưỡng)' : null)
      };
      if (withAi) row.ai = buildAiAssessment(detail, th);
      return row;
    })
    .filter((r) => r.similarity >= Math.max(0.5, th - 0.25))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  const hits = scored.filter((r) => r.similarity >= th);
  const out = {
    threshold: th,
    suspected: hits.length > 0,
    count: hits.length,
    candidates: scored,
    top: hits[0] || scored[0] || null
  };
  if (withAi && out.top?.ai) {
    out.ai_triage = {
      suspected: out.suspected,
      top_recommendation: out.top.ai.recommendation,
      top_confidence: out.top.ai.confidence,
      top_summary: out.top.ai.summary,
      auto_queue: out.suspected && out.top.ai.confidence !== 'low'
    };
  }
  return out;
}

/**
 * Quét cặp Place nghi trùng trong DB (cho tab Bản đồ trùng).
 * O(n^2) có giới hạn — phù hợp dataset nhỏ/trung bình luận văn.
 */
async function scanDuplicatePairs(options = {}) {
  const threshold = Number.isFinite(Number(options.threshold))
    ? Number(options.threshold)
    : DEFAULT_THRESHOLD;
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 50, 1), 100);
  const places = await Place.find({ status: { $nin: ['LOCKED', 'MERGED'] } })
    .select('name aliases latitude longitude category verified status')
    .limit(500)
    .lean();

  const pairs = [];
  for (let i = 0; i < places.length; i += 1) {
    for (let j = i + 1; j < places.length; j += 1) {
      const detail = compositeScore(places[i], places[j]);
      if (detail.score < threshold) continue;
      pairs.push({
        similarity: Math.round(detail.score * 1000) / 1000,
        name_score: Math.round(detail.name_score * 1000) / 1000,
        gps_score: Math.round(detail.gps_score * 1000) / 1000,
        gps_meters: detail.gps_meters == null ? null : Math.round(detail.gps_meters),
        place_a: {
          _id: places[i]._id,
          name: places[i].name,
          verified: !!places[i].verified,
          status: places[i].status
        },
        place_b: {
          _id: places[j]._id,
          name: places[j].name,
          verified: !!places[j].verified,
          status: places[j].status
        },
        message: 'Có vẻ địa điểm đã tồn tại (cặp trùng)'
      });
    }
  }
  pairs.sort((a, b) => b.similarity - a.similarity);
  return { threshold, total_places_scanned: places.length, count: pairs.length, pairs: pairs.slice(0, limit) };
}

module.exports = {
  DEFAULT_THRESHOLD,
  normalizeName,
  nameSimilarity,
  bestNameScore,
  haversineMeters,
  gpsSimilarity,
  compositeScore,
  findDuplicatePlaces,
  scanDuplicatePairs,
  buildAiAssessment
};
