/**
 * Place Platform HTTP facade — /api/place-platform/*
 */
const placePlatform = require('../application/placePlatform/placePlatformApplicationService');
const activityLogRepository = require('../repositories/activityLogRepository');

function userIdOf(req) {
  return req.user?.userId || req.user?.id || req.user?._id || null;
}

function logActivity(data) {
  activityLogRepository.recordActivity(data).catch((err) => {
    console.warn('[ActivityLog]', data?.action, err?.message || err);
  });
}

async function getBySlug(req, res) {
  try {
    const place = await placePlatform.getBySlugOrId(req.params.slugOrId, {
      publicOnly: req.query.admin !== '1'
    });
    return res.status(200).json({ place });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code });
  }
}

async function recordView(req, res) {
  try {
    const data = await placePlatform.recordView(req.params.slugOrId);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code });
  }
}

async function createReport(req, res) {
  try {
    const report = await placePlatform.createReport({
      placeId: req.body.place_id,
      reasonCode: req.body.reason_code,
      detail: req.body.detail || req.body.reason,
      userId: userIdOf(req)
    });
    return res.status(201).json({ report });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code });
  }
}

async function myReports(req, res) {
  try {
    const data = await placePlatform.listReportsByUser(userIdOf(req), { limit: req.query.limit });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function closeReport(req, res) {
  try {
    const report = await placePlatform.closeReport(req.params.id, {
      resolverId: userIdOf(req),
      note: req.body.note,
      status: req.body.status
    });
    logActivity({
      user_id: userIdOf(req),
      action: 'MAP_MODERATION_RESOLVE',
      target_type: 'place_report',
      target_id: String(report._id),
      target: String(report.place_id || ''),
      details: { status: report.status, note: report.resolver_note || '' },
      ip_address: req.ip || ''
    });
    return res.status(200).json({ report });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code });
  }
}

async function adminListPlaceReports(req, res) {
  try {
    const data = await placePlatform.adminListPlaceReports({
      status: req.query.status,
      reasonCode: req.query.reason_code,
      placeId: req.query.place_id,
      limit: req.query.limit
    });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code });
  }
}

async function upsertReview(req, res) {
  try {
    const review = await placePlatform.upsertReview({
      placeId: req.body.place_id,
      userId: userIdOf(req),
      rating: req.body.rating,
      comment: req.body.comment
    });
    return res.status(200).json({ review });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code });
  }
}

async function myReviews(req, res) {
  try {
    const data = await placePlatform.listReviewsByUser(userIdOf(req), { limit: req.query.limit });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function listPlaceReviews(req, res) {
  try {
    const data = await placePlatform.listReviewsByPlace(req.params.placeId, {
      limit: req.query.limit
    });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message,
      code: error.code
    });
  }
}

async function markHelpful(req, res) {
  try {
    const review = await placePlatform.markReviewHelpful(req.params.id);
    return res.status(200).json({ review });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code });
  }
}

async function adminListReviews(req, res) {
  try {
    const includeInactive = String(req.query.include_inactive || '') === '1'
      || String(req.query.include_inactive || '').toLowerCase() === 'true';
    const data = await placePlatform.adminListReviews({
      placeId: req.query.place_id || '',
      q: req.query.q || '',
      includeInactive,
      limit: req.query.limit,
      skip: req.query.skip
    });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code });
  }
}

async function adminDeactivateReview(req, res) {
  try {
    const review = await placePlatform.adminDeactivateReview(req.params.id);
    logActivity({
      user_id: userIdOf(req),
      action: 'PLACE_REVIEW_DEACTIVATE',
      target_type: 'place_review',
      target_id: String(review._id),
      target: 'Ẩn đánh giá địa điểm',
      details: {
        place_id: String(review.place_id || ''),
        user_id: String(review.user_id || ''),
        rating: review.rating
      },
      ip_address: req.ip
    });
    return res.status(200).json({ review });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code });
  }
}

async function adminActivateReview(req, res) {
  try {
    const review = await placePlatform.adminActivateReview(req.params.id);
    logActivity({
      user_id: userIdOf(req),
      action: 'PLACE_REVIEW_ACTIVATE',
      target_type: 'place_review',
      target_id: String(review._id),
      target: 'Hiện lại đánh giá địa điểm',
      details: {
        place_id: String(review.place_id || ''),
        user_id: String(review.user_id || ''),
        rating: review.rating
      },
      ip_address: req.ip
    });
    return res.status(200).json({ review });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code });
  }
}

async function adminListFavorites(req, res) {
  try {
    const data = await placePlatform.adminListFavorites({
      placeId: req.query.place_id || '',
      limit: req.query.limit,
      skip: req.query.skip
    });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code });
  }
}

async function adminRemoveFavorite(req, res) {
  try {
    const favorite = await placePlatform.adminRemoveFavorite(req.params.id);
    logActivity({
      user_id: userIdOf(req),
      action: 'PLACE_FAVORITE_REMOVE',
      target_type: 'user_favorite',
      target_id: String(favorite._id),
      target: 'Xóa yêu thích địa điểm',
      details: {
        place_id: String(favorite.place_id || ''),
        user_id: String(favorite.user_id || '')
      },
      ip_address: req.ip
    });
    return res.status(200).json({ message: 'Đã xóa yêu thích.', favorite });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code });
  }
}

async function createClaim(req, res) {
  try {
    const claim = await placePlatform.createClaim({
      placeId: req.body.place_id,
      organizationId: req.body.organization_id,
      category: req.body.claim_category || req.body.category,
      note: req.body.note,
      userId: userIdOf(req)
    });
    return res.status(201).json({ claim });
  } catch (error) {
    return res.status(error.status || 500).json({
      message: error.message,
      code: error.code,
      claim: error.claim
    });
  }
}

async function listEvents(req, res) {
  try {
    const data = await placePlatform.listActiveEvents(req.params.placeId);
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code });
  }
}

async function createEvent(req, res) {
  try {
    const event = await placePlatform.createEventStub(req.body || {}, userIdOf(req));
    return res.status(201).json({ event });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message, code: error.code });
  }
}

async function myProposals(req, res) {
  try {
    const data = await placePlatform.listProposalsByUser(userIdOf(req), { limit: req.query.limit });
    return res.status(200).json(data);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

module.exports = {
  getBySlug,
  recordView,
  createReport,
  myReports,
  closeReport,
  adminListPlaceReports,
  upsertReview,
  myReviews,
  listPlaceReviews,
  markHelpful,
  adminListReviews,
  adminDeactivateReview,
  adminActivateReview,
  adminListFavorites,
  adminRemoveFavorite,
  createClaim,
  listEvents,
  createEvent,
  myProposals
};
