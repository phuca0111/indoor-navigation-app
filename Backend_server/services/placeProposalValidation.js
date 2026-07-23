// ============================================
// Place Proposal Validation Engine (rule-based, chưa LLM)
// ============================================

const {
  findDuplicatePlaces,
  DEFAULT_THRESHOLD
} = require('./placeDuplicateDetection');

/**
 * @returns {{
 *   ok: boolean,
 *   errors: string[],
 *   duplicate_score: number,
 *   risk_score: number,
 *   recommendation: string,
 *   duplicate_place_id: string|null,
 *   details: object
 * }}
 */
async function validatePlaceProposal(payload, options = {}) {
  const errors = [];
  const name = String(payload.name || '').trim();
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  const category = String(payload.category || '').trim();
  const address = String(payload.address || '').trim();

  if (!name || name.length < 2) errors.push('Tên Place phải có ít nhất 2 ký tự.');
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    errors.push('GPS (latitude/longitude) không hợp lệ.');
  } else if (latitude === 0 && longitude === 0) {
    errors.push('GPS (0,0) không được chấp nhận.');
  } else if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    errors.push('GPS ngoài phạm vi hợp lệ.');
  }

  let risk = 0;
  if (!category) risk += 0.15;
  if (!address) risk += 0.1;
  if (!payload.image_url) risk += 0.05;
  if (name.length < 5) risk += 0.1;

  const threshold = Number(options.threshold) || DEFAULT_THRESHOLD;
  let dup = {
    suspected: false,
    threshold,
    top: null,
    matches: []
  };
  let duplicateScore = 0;
  let duplicatePlaceId = null;
  let ai = null;

  if (!errors.length) {
    dup = await findDuplicatePlaces(
      {
        name,
        aliases: payload.aliases || [],
        latitude,
        longitude,
        category
      },
      { threshold, limit: 10, withAiExplain: true }
    );
    if (dup.top) {
      duplicateScore = Number(dup.top.similarity) || 0;
      duplicatePlaceId = dup.top.place?._id || null;
      ai = dup.top.ai || dup.ai_triage || null;
    }
    if (duplicateScore >= 0.85) risk += 0.25;
    if (duplicateScore >= threshold) risk += 0.35;
  }

  risk = Math.min(1, Math.round(risk * 1000) / 1000);

  let recommendation = 'REVIEW';
  if (errors.length) recommendation = 'REJECT_INVALID';
  else if (duplicateScore >= threshold) recommendation = 'MARK_DUPLICATE';
  else if (duplicateScore >= threshold - 0.1 || risk >= 0.45) recommendation = 'REVIEW';
  else recommendation = 'LIKELY_OK';

  return {
    ok: errors.length === 0,
    errors,
    duplicate_score: duplicateScore,
    risk_score: risk,
    recommendation,
    duplicate_place_id: duplicatePlaceId ? String(duplicatePlaceId) : null,
    details: {
      threshold,
      duplicate: dup,
      ai,
      checks: {
        name_ok: name.length >= 2,
        gps_ok: errors.every((e) => !e.includes('GPS')),
        category_present: !!category,
        address_present: !!address
      }
    }
  };
}

module.exports = {
  validatePlaceProposal,
  DEFAULT_THRESHOLD
};
