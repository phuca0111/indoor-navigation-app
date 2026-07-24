/**
 * End User Hub API — Android + Admin (FINAL LOCK: không còn Web My Maps /app)
 * /api/hub/*
 */
const UserFavorite = require('../models/UserFavorite');
const UserHistory = require('../models/UserHistory');
const Place = require('../models/Place');
const IndoorWorkspace = require('../models/IndoorWorkspace');
const Building = require('../models/Building');
const PlaceProposal = require('../models/PlaceProposal');
const identity = require('../repositories/identityRepository');
const { permissionsForRole } = require('../utils/permissions');
const { createReview } = require('./mapReviewController');

function displayRole(role) {
  if (role === 'REGISTERED_USER') return 'END_USER';
  return role || 'GUEST';
}

function displayRoleLabel(role) {
  const map = {
    END_USER: 'Người dùng',
    REGISTERED_USER: 'Người dùng',
    SUPER_ADMIN: 'Quản trị hệ thống',
    ORG_ADMIN: 'Quản trị tổ chức',
    BUILDING_ADMIN: 'Quản trị tòa nhà',
    FINANCE_ADMIN: 'Quản trị tài chính',
    MARKETING_MANAGER: 'Marketing'
  };
  return map[role] || map[displayRole(role)] || role;
}

function serializeWorkspace(w, extras = {}) {
  if (!w) return null;
  const doc = typeof w.toObject === 'function' ? w.toObject() : w;
  return {
    workspace_id: doc._id,
    _id: doc._id,
    name: doc.name,
    description: doc.description || '',
    kind: doc.kind,
    status: doc.status,
    place_id: doc.place_id,
    building_id: doc.building_id,
    owner_user_id: doc.owner_user_id || null,
    organization_id: doc.organization_id || null,
    is_current_published: !!doc.is_current_published,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    place: extras.place || null,
    building: extras.building || null
  };
}

// GET /api/hub/me
async function hubMe(req, res) {
  try {
    const user = await identity.getUserProfile(req.user.userId);
    if (!user) return res.status(404).json({ message: 'Không tìm thấy người dùng.' });
    const role = user.role;
    const { buildPlanSnapshot } = require('../services/personalPlanGates');
    let planInfo = null;
    if (role === 'REGISTERED_USER') {
      planInfo = await buildPlanSnapshot({
        _id: user._id,
        plan: user.plan,
        plan_expires_at: user.plan_expires_at
      });
    }
    return res.status(200).json({
      user: {
        id: user._id,
        email: user.email,
        full_name: user.full_name || '',
        phone: user.phone || '',
        role,
        display_role: displayRole(role),
        display_role_label: displayRoleLabel(role),
        plan: user.plan || null,
        organization_id: user.organization_id || null,
        permissions: permissionsForRole(role),
        ...(planInfo || {})
      }
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// GET /api/hub/favorites
async function listFavorites(req, res) {
  try {
    const rows = await UserFavorite.find({ user_id: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    const placeIds = rows.map((r) => r.place_id).filter(Boolean);
    const places = placeIds.length
      ? await Place.find({ _id: { $in: placeIds } })
        .select('name slug address category latitude longitude publication_status verification_status')
        .lean()
      : [];
    const placeMap = {};
    places.forEach((p) => { placeMap[String(p._id)] = p; });
    return res.status(200).json({
      total: rows.length,
      favorites: rows.map((r) => ({
        _id: r._id,
        place_id: r.place_id,
        place: placeMap[String(r.place_id)] || null,
        createdAt: r.createdAt
      }))
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// POST /api/hub/favorites { place_id }
async function addFavorite(req, res) {
  try {
    const placeId = req.body?.place_id;
    if (!placeId) return res.status(400).json({ message: 'Thiếu place_id.' });
    const place = await Place.findById(placeId).select('_id name').lean();
    if (!place) return res.status(404).json({ message: 'Không tìm thấy Place.' });
    const fav = await UserFavorite.findOneAndUpdate(
      { user_id: req.user.userId, place_id: placeId },
      { $setOnInsert: { user_id: req.user.userId, place_id: placeId } },
      { upsert: true, returnDocument: 'after' }
    );
    return res.status(200).json({ message: 'Đã lưu yêu thích.', favorite: fav });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// DELETE /api/hub/favorites/:placeId
async function removeFavorite(req, res) {
  try {
    await UserFavorite.deleteOne({
      user_id: req.user.userId,
      place_id: req.params.placeId
    });
    return res.status(200).json({ message: 'Đã bỏ yêu thích.' });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// GET /api/hub/history
async function listHistory(req, res) {
  try {
    const rows = await UserHistory.find({ user_id: req.user.userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    return res.status(200).json({ total: rows.length, history: rows });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// DELETE /api/hub/history — xóa toàn bộ lịch sử user (optional ?type=)
async function clearHistory(req, res) {
  try {
    const filter = { user_id: req.user.userId };
    const type = String(req.query?.type || '').trim().toUpperCase();
    if (type && UserHistory.HISTORY_TYPES.includes(type)) {
      filter.type = type;
    }
    const result = await UserHistory.deleteMany(filter);
    return res.status(200).json({
      message: 'Đã xóa lịch sử.',
      deleted: result.deletedCount || 0,
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// POST /api/hub/history
async function addHistory(req, res) {
  try {
    const type = String(req.body?.type || 'OTHER').toUpperCase();
    const row = await UserHistory.create({
      user_id: req.user.userId,
      type: UserHistory.HISTORY_TYPES.includes(type) ? type : 'OTHER',
      place_id: req.body?.place_id || null,
      building_id: req.body?.building_id || null,
      workspace_id: req.body?.workspace_id || null,
      label: String(req.body?.label || '').slice(0, 300),
      meta: req.body?.meta && typeof req.body.meta === 'object' ? req.body.meta : {}
    });
    return res.status(201).json({ history: row });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// GET /api/hub/workspaces — My Maps list (Building = Workspace GitHub GĐ7 + IndoorWorkspace legacy)
async function listMyWorkspaces(req, res) {
  try {
    const uid = req.user.userId;
    const buildingFilter = {
      is_active: { $ne: false },
      $or: [{ owner_user_id: uid }, { created_by: uid }]
    };
    if (req.user.role === 'SUPER_ADMIN' && req.query.all === '1') {
      delete buildingFilter.$or;
    }

    const buildings = await Building.find(buildingFilter)
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    const placeIds = [...new Set(buildings.map((b) => String(b.place_id || '')).filter(Boolean))];
    const places = placeIds.length
      ? await Place.find({ _id: { $in: placeIds } }).select('name slug address').lean()
      : [];
    const pMap = {};
    places.forEach((p) => { pMap[String(p._id)] = p; });

    // Legacy IndoorWorkspace (nếu còn) — gắn kèm nếu chưa có trong list Building
    const legacyWs = await IndoorWorkspace.find({
      $or: [{ owner_user_id: uid }, { created_by: uid }]
    })
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();
    const buildingIdSet = new Set(buildings.map((b) => String(b._id)));
    const legacyExtra = [];
    for (const w of legacyWs) {
      const bid = w.building_id ? String(w.building_id) : '';
      if (bid && buildingIdSet.has(bid)) continue;
      legacyExtra.push(serializeWorkspace(w, {
        place: w.place_id ? pMap[String(w.place_id)] || null : null,
        building: null
      }));
    }

    const fromBuildings = buildings.map((b) => ({
      workspace_id: b._id,
      _id: b._id,
      name: b.name,
      description: b.description || '',
      kind: 'COMMUNITY',
      status: b.workspace_status || b.status || 'DRAFT',
      workspace_status: b.workspace_status || 'DRAFT',
      place_id: b.place_id || null,
      building_id: b._id,
      organization_id: b.organization_id || null,
      owner_user_id: b.owner_user_id || null,
      created_by: b.created_by || null,
      place: b.place_id ? pMap[String(b.place_id)] || null : null,
      building: {
        _id: b._id,
        name: b.name,
        status: b.status,
        visibility: b.visibility,
        total_floors: b.total_floors,
        workspace_status: b.workspace_status
      },
      source: 'building'
    }));

    const workspaces = fromBuildings.concat(legacyExtra);
    return res.status(200).json({
      total: workspaces.length,
      workspaces
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// POST /api/hub/workspaces/:id/submit-community — id = IndoorWorkspace._id hoặc Building._id
async function submitWorkspaceCommunity(req, res) {
  try {
    const id = req.params.id;
    const uid = String(req.user.userId);
    let buildingId = null;
    let placeId = null;

    const ws = await IndoorWorkspace.findById(id).lean();
    if (ws) {
      const isOwner =
        String(ws.owner_user_id || '') === uid ||
        String(ws.created_by || '') === uid;
      if (req.user.role !== 'SUPER_ADMIN' && !isOwner) {
        return res.status(403).json({ message: 'Bạn không sở hữu Workspace này.' });
      }
      if (!ws.building_id) {
        return res.status(400).json({ message: 'Workspace chưa có Building Draft.' });
      }
      buildingId = String(ws.building_id);
      placeId = ws.place_id ? String(ws.place_id) : null;
    } else {
      const building = await Building.findById(id).lean();
      if (!building || building.is_active === false) {
        return res.status(404).json({ message: 'Không tìm thấy Workspace.' });
      }
      const isOwner =
        String(building.owner_user_id || '') === uid ||
        String(building.created_by || '') === uid;
      if (req.user.role !== 'SUPER_ADMIN' && !isOwner) {
        return res.status(403).json({ message: 'Bạn không sở hữu Workspace này.' });
      }
      buildingId = String(building._id);
      placeId = building.place_id ? String(building.place_id) : null;
    }

    req.body = {
      building_id: buildingId,
      place_id: placeId || undefined,
      requested_visibility: 'COMMUNITY',
      note: String(req.body?.note || 'Submit Publish Community từ My Maps').slice(0, 1000)
    };
    return createReview(req, res);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// GET /api/hub/proposals — own proposals (schema GitHub: created_by + proposed_name)
async function listMyProposals(req, res) {
  try {
    const filter = { created_by: req.user.userId };
    const status = String(req.query.status || '').trim().toUpperCase();
    if (['DRAFT', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'PENDING', 'DUPLICATE'].includes(status)) {
      // PENDING (UI cũ) ≈ SUBMITTED/IN_REVIEW
      if (status === 'PENDING') {
        filter.status = { $in: ['SUBMITTED', 'IN_REVIEW', 'DRAFT'] };
      } else {
        filter.status = status;
      }
    }
    const rows = await PlaceProposal.find(filter).sort({ createdAt: -1 }).limit(50).lean();
    return res.status(200).json({
      total: rows.length,
      proposals: rows.map((p) => ({
        ...p,
        name: p.proposed_name || p.name || '',
        submitted_by: p.created_by || p.submitted_by
      }))
    });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// GET /api/hub/favorites/check?place_id=
async function checkFavorite(req, res) {
  try {
    const placeId = req.query.place_id;
    if (!placeId) return res.status(400).json({ message: 'Thiếu place_id.' });
    const fav = await UserFavorite.findOne({
      user_id: req.user.userId,
      place_id: placeId
    }).select('_id').lean();
    return res.status(200).json({ favorited: !!fav });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
}

// —— Community Platform surface ——

async function communityDashboard(req, res) {
  try {
    const userId = req.user.userId;
    const placePlatform = require('../application/placePlatform/placePlatformApplicationService');
    const community = require('../application/community/communityApplicationService');
    const [proposals, reviews, reports, following, profile] = await Promise.all([
      placePlatform.listProposalsByUser(userId),
      placePlatform.listReviewsByUser(userId),
      placePlatform.listReportsByUser(userId),
      community.listFollowing(userId),
      community.getProfile(userId)
    ]);
    return res.status(200).json({
      profile,
      proposals,
      reviews,
      reports,
      following
    });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message });
  }
}

async function communityProfile(req, res) {
  try {
    const community = require('../application/community/communityApplicationService');
    const profile = await community.getProfile(req.user.userId);
    return res.status(200).json({ profile });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message });
  }
}

async function followPlace(req, res) {
  try {
    const community = require('../application/community/communityApplicationService');
    const doc = await community.followPlace(req.user.userId, req.body.place_id);
    return res.status(200).json({ following: doc });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message, code: e.code });
  }
}

async function unfollowPlace(req, res) {
  try {
    const community = require('../application/community/communityApplicationService');
    await community.unfollowPlace(req.user.userId, req.params.placeId);
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message, code: e.code });
  }
}

async function listFollowing(req, res) {
  try {
    const community = require('../application/community/communityApplicationService');
    const data = await community.listFollowing(req.user.userId, { limit: req.query.limit });
    return res.status(200).json(data);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message });
  }
}

const endUser = require('../application/endUser/endUserApplicationService');

async function hubDashboard(req, res) {
  try {
    const data = await endUser.getDashboard(req.user.userId, {
      lat: req.query.lat,
      lng: req.query.lng
    });
    return res.status(200).json(data);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message, code: e.code });
  }
}

async function hubExplore(req, res) {
  try {
    const data = await endUser.getExplore(req.user.userId, {
      q: req.query.q,
      category: req.query.category,
      lat: req.query.lat,
      lng: req.query.lng,
      limit: req.query.limit
    });
    return res.status(200).json(data);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message, code: e.code });
  }
}

async function hubActivities(req, res) {
  try {
    const data = await endUser.getActivities(req.user.userId, {
      type: req.query.type,
      limit: req.query.limit
    });
    return res.status(200).json(data);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message, code: e.code });
  }
}

async function hubSubscription(req, res) {
  try {
    const data = await endUser.getSubscription(req.user.userId);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message, code: e.code });
  }
}

async function hubUpgradeMock(req, res) {
  try {
    const data = await endUser.upgradeMock(
      req.user.userId,
      req.body.target_plan || req.body.plan
    );
    return res.status(200).json(data);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message, code: e.code });
  }
}

async function hubGetSettings(req, res) {
  try {
    const data = await endUser.getSettings(req.user.userId);
    return res.status(200).json(data);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message, code: e.code });
  }
}

async function hubPutSettings(req, res) {
  try {
    const data = await endUser.updateSettings(req.user.userId, req.body || {});
    return res.status(200).json(data);
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message, code: e.code });
  }
}

async function hubCreateWorkspace(req, res) {
  try {
    const workspace = await endUser.createWorkspaceForUser(req.user.userId, req.body || {});
    return res.status(201).json({ workspace });
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message, code: e.code });
  }
}

module.exports = {
  hubMe,
  listFavorites,
  addFavorite,
  removeFavorite,
  checkFavorite,
  listHistory,
  clearHistory,
  addHistory,
  listMyWorkspaces,
  listMyProposals,
  submitWorkspaceCommunity,
  communityDashboard,
  communityProfile,
  followPlace,
  unfollowPlace,
  listFollowing,
  hubDashboard,
  hubExplore,
  hubActivities,
  hubSubscription,
  hubUpgradeMock,
  hubGetSettings,
  hubPutSettings,
  hubCreateWorkspace,
  displayRole,
  displayRoleLabel
};
