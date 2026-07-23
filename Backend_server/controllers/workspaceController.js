/**
 * GĐ7 — Workspace lifecycle trên Building (+ gắn Place).
 */
const mongoose = require('mongoose');
const Building = require('../models/Building');
const Place = require('../models/Place');
const {
  WORKSPACE_STATUS,
  normalizeWorkspaceStatus,
  PUBLICATION_STATUS
} = require('../utils/placePlatform');

function assertObjectId(id, label = 'id') {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) {
    const err = new Error(`${label} không hợp lệ.`);
    err.status = 400;
    throw err;
  }
  return String(id);
}

function serializeWorkspace(b) {
  if (!b) return null;
  const doc = typeof b.toObject === 'function' ? b.toObject() : b;
  return {
    _id: doc._id,
    name: doc.name,
    place_id: doc.place_id || null,
    status: doc.status,
    workspace_status: doc.workspace_status || WORKSPACE_STATUS.DRAFT,
    visibility: doc.visibility,
    gps_location: doc.gps_location,
    total_floors: doc.total_floors,
    organization_id: doc.organization_id,
    owner_user_id: doc.owner_user_id,
    is_active: doc.is_active !== false,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

async function listWorkspaces(req, res) {
  try {
    const filter = { is_active: { $ne: false } };
    if (req.query.place_id) {
      filter.place_id = assertObjectId(req.query.place_id, 'place_id');
    }
    if (req.query.workspace_status) {
      filter.workspace_status = normalizeWorkspaceStatus(req.query.workspace_status);
    }
    // Public mặc định: chỉ PUBLISHED; ?all=1 cho admin đã auth (không bắt buộc)
    if (req.query.all !== '1') {
      filter.$or = [
        { workspace_status: WORKSPACE_STATUS.PUBLISHED },
        { status: 'PUBLISHED', workspace_status: { $in: [null, WORKSPACE_STATUS.DRAFT, WORKSPACE_STATUS.PUBLISHED] } }
      ];
    }
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const rows = await Building.find(filter).sort({ updatedAt: -1 }).limit(limit).lean();
    return res.status(200).json({
      total: rows.length,
      workspaces: rows.map(serializeWorkspace)
    });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function getWorkspace(req, res) {
  try {
    assertObjectId(req.params.id);
    const b = await Building.findById(req.params.id).lean();
    if (!b || b.is_active === false) {
      return res.status(404).json({ message: 'Không tìm thấy Workspace.' });
    }
    return res.status(200).json({ workspace: serializeWorkspace(b) });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function createWorkspace(req, res) {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Thiếu name.' });

    let place_id = req.body.place_id || null;
    let gps = req.body.gps_location || {};
    if (place_id) {
      place_id = assertObjectId(place_id, 'place_id');
      const place = await Place.findById(place_id).lean();
      if (!place) return res.status(404).json({ message: 'Place không tồn tại.' });
      if (!gps.lat && !gps.lng) {
        gps = { lat: place.latitude || 0, lng: place.longitude || 0 };
      }
    }

    const building = await Building.create({
      name,
      address: String(req.body.address || '').slice(0, 500),
      description: String(req.body.description || '').slice(0, 2000),
      gps_location: {
        lat: Number(gps.lat) || 0,
        lng: Number(gps.lng) || 0
      },
      place_id,
      status: 'DRAFT',
      workspace_status: WORKSPACE_STATUS.DRAFT,
      visibility: 'PRIVATE',
      total_floors: Math.max(1, parseInt(req.body.total_floors, 10) || 1),
      created_by: req.user?.userId || null,
      organization_id: req.user?.organization_id || null,
      owner_user_id: req.user?.organization_id ? null : (req.user?.userId || null)
    });

    return res.status(201).json({ workspace: serializeWorkspace(building) });
  } catch (error) {
    console.error('createWorkspace:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function setLifecycle(req, res, nextStatus, alsoBuildingStatus) {
  try {
    assertObjectId(req.params.id);
    const building = await Building.findById(req.params.id);
    if (!building || building.is_active === false) {
      return res.status(404).json({ message: 'Không tìm thấy Workspace.' });
    }
    building.workspace_status = nextStatus;
    if (alsoBuildingStatus) building.status = alsoBuildingStatus;
    // Tránh pre-save ghi đè IN_REVIEW/DEPRECATED/ARCHIVED
    await building.save();
    return res.status(200).json({ workspace: serializeWorkspace(building) });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function submitWorkspace(req, res) {
  return setLifecycle(req, res, WORKSPACE_STATUS.IN_REVIEW, 'DRAFT');
}

async function publishWorkspace(req, res) {
  try {
    assertObjectId(req.params.id);
    const building = await Building.findById(req.params.id);
    if (!building || building.is_active === false) {
      return res.status(404).json({ message: 'Không tìm thấy Workspace.' });
    }

    // Deprecate workspace PUBLISHED khác cùng Place (giữ audit)
    if (building.place_id) {
      await Building.updateMany(
        {
          place_id: building.place_id,
          _id: { $ne: building._id },
          workspace_status: WORKSPACE_STATUS.PUBLISHED,
          is_active: { $ne: false }
        },
        { $set: { workspace_status: WORKSPACE_STATUS.DEPRECATED } }
      );

      await Place.findByIdAndUpdate(building.place_id, {
        $set: {
          current_published_building_id: building._id,
          publication_status: PUBLICATION_STATUS.PUBLISHED,
          status: 'ACTIVE'
        }
      }).catch(() => {});
    }

    building.workspace_status = WORKSPACE_STATUS.PUBLISHED;
    building.status = 'PUBLISHED';
    if (req.body.visibility) {
      building.visibility = String(req.body.visibility).toUpperCase();
    } else if (building.visibility === 'PRIVATE') {
      building.visibility = 'COMMUNITY';
    }
    await building.save();
    return res.status(200).json({ workspace: serializeWorkspace(building) });
  } catch (error) {
    console.error('publishWorkspace:', error);
    return res.status(error.status || 500).json({ message: error.message });
  }
}

async function deprecateWorkspace(req, res) {
  return setLifecycle(req, res, WORKSPACE_STATUS.DEPRECATED, null);
}

async function archiveWorkspace(req, res) {
  try {
    assertObjectId(req.params.id);
    const building = await Building.findById(req.params.id);
    if (!building) return res.status(404).json({ message: 'Không tìm thấy Workspace.' });
    building.workspace_status = WORKSPACE_STATUS.ARCHIVED;
    building.status = 'DRAFT';
    building.is_active = false;
    await building.save();
    return res.status(200).json({ workspace: serializeWorkspace(building) });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
}

module.exports = {
  listWorkspaces,
  createWorkspace,
  getWorkspace,
  submitWorkspace,
  publishWorkspace,
  deprecateWorkspace,
  archiveWorkspace
};
