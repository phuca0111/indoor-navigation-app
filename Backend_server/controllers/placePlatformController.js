/**
 * Place Platform HTTP facade — /api/place-platform/*
 */
const placePlatform = require('../application/placePlatform/placePlatformApplicationService');

function userIdOf(req) {
  return req.user?.userId || req.user?.id || req.user?._id || null;
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
    return res.status(200).json({ report });
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

async function markHelpful(req, res) {
  try {
    const review = await placePlatform.markReviewHelpful(req.params.id);
    return res.status(200).json({ review });
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
  upsertReview,
  myReviews,
  markHelpful,
  createClaim,
  listEvents,
  createEvent,
  myProposals
};
