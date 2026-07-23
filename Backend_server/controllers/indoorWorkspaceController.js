// ============================================
// Indoor Workspace API — PHASE 3
// ============================================

const IndoorWorkspace = require('../models/IndoorWorkspace');
const Place = require('../models/Place');
const Building = require('../models/Building');
const ActivityLog = require('../models/ActivityLog');
const buildingApplication = require('../application/coreTenant/buildingApplicationService');

function logActivity(data) {
  ActivityLog.create(data).catch(() => {});
}

function serialize(doc, extras = {}) {
  if (!doc) return null;
  const w = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: w._id,
    name: w.name,
    description: w.description || '',
    kind: w.kind,
    status: w.status,
    place_id: w.place_id,
    building_id: w.building_id,
    organization_id: w.organization_id || null,
    owner_user_id: w.owner_user_id || null,
    created_by: w.created_by || null,
    is_current_published: !!w.is_current_published,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    place: extras.place || null,
    building: extras.building || null
  };
}

// GET /api/indoor-workspaces?place_id=&kind=
async function listWorkspaces(req, res) {
  try {
    const filter = {};
    if (req.query.place_id) filter.place_id = req.query.place_id;
    if (req.query.kind) filter.kind = String(req.query.kind).toUpperCase();
    if (req.query.status) filter.status = String(req.query.status).toUpperCase();

    // Non-super: chỉ workspace mình tạo / org / personal
    if (req.user.role !== 'SUPER_ADMIN') {
      if (req.user.role === 'REGISTERED_USER') {
        filter.owner_user_id = req.user.userId;
      } else {
        // ORG_ADMIN / BUILDING_ADMIN — lọc theo org nếu có
        const User = require('../models/User');
        const me = await User.findById(req.user.userId).select('organization_id').lean();
        if (me?.organization_id) filter.organization_id = me.organization_id;
        else filter.created_by = req.user.userId;
      }
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const rows = await IndoorWorkspace.find(filter).sort({ updatedAt: -1 }).limit(limit).lean();
    return res.status(200).json({
      total: rows.length,
      workspaces: rows.map((r) => serialize(r))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

// GET /api/indoor-workspaces/:id
async function getWorkspace(req, res) {
  try {
    const row = await IndoorWorkspace.findById(req.params.id).lean();
    if (!row) return res.status(404).json({ message: 'Không tìm thấy Workspace.' });

    const [place, building] = await Promise.all([
      Place.findById(row.place_id).select('name slug latitude longitude address category').lean(),
      Building.findById(row.building_id).select('name status visibility total_floors activation_radius place_id').lean()
    ]);

    return res.status(200).json({
      workspace: serialize(row, { place, building })
    });
  } catch (error) {
    return res.status(500).json({ message: 'Lỗi máy chủ: ' + error.message });
  }
}

/**
 * POST /api/indoor-workspaces
 * Body: { place_id, name?, kind?, description?, total_floors?, activation_radius?, organization_id? }
 * → tạo Building (GPS/address từ Place) + IndoorWorkspace; Editor mở bằng building_id.
 */
async function createWorkspace(req, res) {
  try {
    const placeId = req.body?.place_id;
    if (!placeId) {
      return res.status(400).json({ message: 'Thiếu place_id.', code: 'PLACE_REQUIRED' });
    }

    const place = await Place.findById(placeId);
    if (!place) return res.status(404).json({ message: 'Place không tồn tại.' });
    if (place.status === 'LOCKED' || place.status === 'MERGED') {
      return res.status(400).json({ message: 'Place không gắn được Workspace.', code: 'PLACE_NOT_ATTACHABLE' });
    }

    const kind = String(req.body?.kind || 'COMMUNITY').toUpperCase();
    const allowedKinds = IndoorWorkspace.WORKSPACE_KINDS || ['COMMUNITY', 'OFFICIAL', 'ORG', 'PERSONAL', 'EXPERIMENTAL'];
    if (!allowedKinds.includes(kind)) {
      return res.status(400).json({ message: 'kind không hợp lệ.', code: 'INVALID_KIND' });
    }

    // Demo plan gates (REGISTERED_USER)
    if (req.user.role === 'REGISTERED_USER') {
      const User = require('../models/User');
      const {
        assertCanUseWorkspaceKind,
        assertCanCreateWorkspace
      } = require('../services/personalPlanGates');
      const me = await User.findById(req.user.userId).select('plan plan_expires_at').lean();
      const userLike = { _id: req.user.userId, plan: me?.plan, plan_expires_at: me?.plan_expires_at };
      const kindGate = assertCanUseWorkspaceKind(userLike, kind);
      if (!kindGate.ok) {
        return res.status(403).json({ message: kindGate.message, code: kindGate.code });
      }
      const wsGate = await assertCanCreateWorkspace(userLike);
      if (!wsGate.ok) {
        return res.status(403).json({
          message: wsGate.message,
          code: wsGate.code,
          usage: wsGate.usage
        });
      }
    }

    const workspaceName = String(req.body?.name || `${place.name} ${kind}`).trim().slice(0, 200);
    const totalFloors = req.body?.total_floors || 1;
    const activationRadius = req.body?.activation_radius || place.radius || 50;

    // Tạo Building qua use-case hiện có (quota / scope / soft-require Place)
    const buildingResult = await buildingApplication.createBuilding({
      actor: req.user,
      body: {
        name: workspaceName,
        place_id: String(place._id),
        lat: place.latitude,
        lng: place.longitude,
        address: place.address || '',
        description: String(req.body?.description || '').slice(0, 2000),
        total_floors: totalFloors,
        activation_radius: activationRadius,
        organization_id: req.body?.organization_id,
        visibility: 'PRIVATE'
      },
      ip: req.ip || ''
    });

    const building = buildingResult.body.building;
    const buildingId = building._id || building.id;

    const workspace = await IndoorWorkspace.create({
      name: workspaceName,
      description: String(req.body?.description || '').slice(0, 2000),
      kind,
      status: 'DRAFT',
      place_id: place._id,
      building_id: buildingId,
      organization_id: building.organization_id || null,
      owner_user_id: building.owner_user_id || null,
      created_by: req.user.userId
    });

    await Building.updateOne(
      { _id: buildingId },
      { $set: { workspace_id: workspace._id, place_id: place._id } }
    );

    logActivity({
      user_id: req.user.userId,
      action: 'INDOOR_WORKSPACE_CREATE',
      target_type: 'indoor_workspace',
      target_id: String(workspace._id),
      target: workspace.name,
      details: {
        place_id: String(place._id),
        building_id: String(buildingId),
        kind
      },
      ip_address: req.ip || ''
    });

    return res.status(201).json({
      message: 'Đã tạo Indoor Workspace + Building kỹ thuật.',
      workspace: serialize(workspace.toObject(), {
        place: {
          _id: place._id,
          name: place.name,
          slug: place.slug
        },
        building
      }),
      building,
      editor_hint: 'Mở Editor với building_id (không đổi CAD).',
      next: {
        open_editor: true,
        building_id: String(buildingId)
      }
    });
  } catch (error) {
    console.error('createWorkspace:', error);
    const status = error.status || 500;
    return res.status(status).json({
      message: error.status ? error.message : ('Lỗi máy chủ: ' + error.message),
      code: error.code,
      ...(error.details || {})
    });
  }
}

module.exports = {
  listWorkspaces,
  getWorkspace,
  createWorkspace
};
