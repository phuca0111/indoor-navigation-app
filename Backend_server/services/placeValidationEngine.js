/**
 * GĐ4 — Place Validation Engine (rule-based).
 * Bọc placeDuplicateDetection + risk LOW|MEDIUM|HIGH + Moderation Router hint.
 */
const {
  findDuplicatePlaces,
  compositeScore,
  DEFAULT_THRESHOLD
} = require('./placeDuplicateDetection');
const {
  VALIDATION_RISK,
  MODERATION_ROUTE
} = require('../utils/placePlatform');

const RULES_VERSION = '1.0';

/**
 * @param {number} duplicateScore 0..1
 * @returns {'LOW'|'MEDIUM'|'HIGH'}
 */
function riskFromScore(duplicateScore, threshold = DEFAULT_THRESHOLD) {
  const s = Number(duplicateScore) || 0;
  if (s >= threshold) return VALIDATION_RISK.HIGH;
  if (s >= threshold - 0.1) return VALIDATION_RISK.MEDIUM;
  return VALIDATION_RISK.LOW;
}

/**
 * @param {'LOW'|'MEDIUM'|'HIGH'} risk
 * @param {{ hasOrgBoundary?: boolean }} ctx
 */
function routeFromRisk(risk, ctx = {}) {
  if (risk === VALIDATION_RISK.HIGH) return MODERATION_ROUTE.MAP_MOD;
  if (risk === VALIDATION_RISK.MEDIUM) {
    return ctx.hasOrgBoundary ? MODERATION_ROUTE.ORG_MOD : MODERATION_ROUTE.MAP_MOD;
  }
  return MODERATION_ROUTE.AUTO;
}

/**
 * Validate proposal / place payload.
 * @param {object} payload { name|proposed_name, latitude, longitude, category?, aliases?, boundary? }
 */
async function validatePlaceProposal(payload, options = {}) {
  const name = payload.proposed_name || payload.name || '';
  const latitude = Number(payload.latitude) || 0;
  const longitude = Number(payload.longitude) || 0;
  const category = payload.category || '';

  const dup = await findDuplicatePlaces(
    { name, aliases: payload.aliases || [], latitude, longitude, category },
    {
      excludeId: options.excludeId,
      threshold: options.threshold,
      limit: options.limit || 10,
      withAiExplain: true
    }
  );

  const topScore = dup.top ? Number(dup.top.similarity) || 0 : 0;
  const risk = riskFromScore(topScore, dup.threshold);
  const routeHint = routeFromRisk(risk, { hasOrgBoundary: !!options.hasOrgBoundary });

  // Boundary overlap đơn giản: nếu có boundary polygon trên candidate — flag (heuristic)
  let boundaryOverlap = false;
  if (payload.boundary && dup.candidates?.length) {
    boundaryOverlap = dup.candidates.some((c) => c.gps_meters != null && c.gps_meters < 80);
  }

  return {
    rulesVersion: RULES_VERSION,
    duplicateScore: topScore,
    risk,
    routeHint,
    suspectedDuplicate: !!dup.suspected,
    threshold: dup.threshold,
    candidates: (dup.candidates || []).map((c) => ({
      placeId: c.place?._id,
      name: c.place?.name,
      distanceM: c.gps_meters,
      nameScore: c.name_score,
      gpsScore: c.gps_score,
      similarity: c.similarity
    })),
    signals: {
      gpsDistance: true,
      nameSimilarity: true,
      categoryMatching: true,
      boundaryOverlap
    },
    ai_triage: dup.ai_triage || null,
    message:
      risk === VALIDATION_RISK.HIGH
        ? 'Có vẻ địa điểm đã tồn tại — cần moderator.'
        : risk === VALIDATION_RISK.MEDIUM
          ? 'Gần trùng — nên review.'
          : 'Rủi ro trùng thấp.'
  };
}

/**
 * Pure score giữa 2 object (unit-test friendly).
 */
function scorePair(a, b) {
  return compositeScore(a, b);
}

module.exports = {
  RULES_VERSION,
  riskFromScore,
  routeFromRisk,
  validatePlaceProposal,
  scorePair,
  DEFAULT_THRESHOLD
};
