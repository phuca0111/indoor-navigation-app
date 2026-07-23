/**
 * My Maps Hub API — Phase 1
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

// GET /api/hub/workspaces — My Maps list
async function listMyWorkspaces(req, res) {
  try {
    const filter = {};
    if (req.user.role === 'SUPER_ADMIN' && req.query.all === '1') {
      // optional
    } else if (req.user.role === 'REGISTERED_USER') {
      filter.owner_user_id = req.user.userId;
    } else if (req.user.role === 'ORG_ADMIN' || req.user.role === 'BUILDING_ADMIN') {
      filter.$or = [
        { owner_user_id: req.user.userId },
        { created_by: req.user.userId }
      ];
    } else {
      filter.owner_user_id = req.user.userId;
    }

    const rows = await IndoorWorkspace.find(filter).sort({ updatedAt: -1 }).limit(50).lean();
    const placeIds = [...new Set(rows.map((r) => String(r.place_id)).filter(Boolean))];
    const buildingIds = [...new Set(rows.map((r) => String(r.building_id)).filter(Boolean))];
    const [places, buildings] = await Promise.all([
      placeIds.length
        ? Place.find({ _id: { $in: placeIds } }).select('name slug address').lean()
        : [],
      buildingIds.length
        ? Building.find({ _id: { $in: buildingIds } }).select('name status visibility total_floors').lean()
        : []
    ]);
    const pMap = {};
    places.forEach((p) => { pMap[String(p._id)] = p; });
    const bMap = {};
    buildings.forEach((b) => { bMap[String(b._id)] = b; });

    return res.status(200).json({
      total: rows.length,
      workspaces: rows.map((r) => serializeWorkspace(r, {
        place: pMap[String(r.place_id)] || null,
        building: bMap[String(r.building_id)] || null
      }))
    });
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

// POST /api/hub/workspaces/:id/submit-community — Submit Publish → Community Queue
async function submitWorkspaceCommunity(req, res) {
  try {
    const ws = await IndoorWorkspace.findById(req.params.id).lean();
    if (!ws) return res.status(404).json({ message: 'Không tìm thấy Workspace.' });

    const uid = String(req.user.userId);
    const isOwner =
      String(ws.owner_user_id || '') === uid ||
      String(ws.created_by || '') === uid;
    if (req.user.role !== 'SUPER_ADMIN' && !isOwner) {
      return res.status(403).json({ message: 'Bạn không sở hữu Workspace này.' });
    }
    if (!ws.building_id) {
      return res.status(400).json({ message: 'Workspace chưa có Building Draft.' });
    }

    req.body = {
      building_id: String(ws.building_id),
      place_id: ws.place_id ? String(ws.place_id) : undefined,
      requested_visibility: 'COMMUNITY',
      note: String(req.body?.note || 'Submit Publish Community từ My Maps').slice(0, 1000)
    };
    return createReview(req, res);
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

module.exports = {
  hubMe,
  listFavorites,
  addFavorite,
  removeFavorite,
  checkFavorite,
  listHistory,
  addHistory,
  listMyWorkspaces,
  listMyProposals,
  submitWorkspaceCommunity,
  displayRole,
  displayRoleLabel
};
