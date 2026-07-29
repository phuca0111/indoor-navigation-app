/**
 * Phase 3 — Emergency scope / permission helpers.
 */
const User = require('../models/User');
const Building = require('../models/Building');
const mongoose = require('mongoose');
const { httpError } = require('./navigationGraph');

function isValidObjectId(id) {
  if (id == null || id === '') return false;
  const s = String(id).trim();
  return mongoose.Types.ObjectId.isValid(s) && String(new mongoose.Types.ObjectId(s)) === s;
}

async function loadActorUser(actor) {
  if (!actor?.userId) throw httpError(401, 'Chưa xác thực.', 'UNAUTHORIZED');
  const user = await User.findById(actor.userId)
    .select('role organization_id assigned_buildings is_active')
    .lean();
  if (!user || user.is_active === false) {
    throw httpError(401, 'Tài khoản không hợp lệ.', 'UNAUTHORIZED');
  }
  return user;
}

async function resolveBuildingScope(buildingId) {
  if (!buildingId) return null;
  if (!isValidObjectId(buildingId)) {
    throw httpError(400, 'Mã tòa nhà không hợp lệ. Hãy chọn tòa nhà từ danh sách.', 'INVALID_BUILDING_ID');
  }
  const building = await Building.findById(buildingId)
    .select('organization_id name is_active')
    .lean();
  if (!building) throw httpError(404, 'Không tìm thấy tòa nhà.', 'BUILDING_NOT_FOUND');
  return building;
}

function canManageIncidentScope(actor, user, incident) {
  if (!actor || !user) return false;
  if (actor.role === 'SUPER_ADMIN' || actor.role === 'PLATFORM_ADMIN') return true;

  if (actor.role === 'ORG_ADMIN') {
    if (!user.organization_id || !incident.organization_id) return false;
    return String(user.organization_id) === String(incident.organization_id);
  }

  if (actor.role === 'BUILDING_ADMIN') {
    if (!incident.building_id) return false;
    const assigned = (user.assigned_buildings || []).map(String);
    if (!assigned.includes(String(incident.building_id))) return false;
    if (user.organization_id && incident.organization_id &&
      String(user.organization_id) !== String(incident.organization_id)) {
      return false;
    }
    return true;
  }

  return false;
}

async function assertIncidentManage(actor, incident) {
  const user = await loadActorUser(actor);
  if (!canManageIncidentScope(actor, user, incident)) {
    throw httpError(403, 'Bạn không có quyền quản lý sự cố này.', 'INCIDENT_SCOPE_DENIED');
  }
  return user;
}

async function assertBuildingManage(actor, buildingId) {
  const user = await loadActorUser(actor);
  if (actor.role === 'SUPER_ADMIN') return user;

  const building = await resolveBuildingScope(buildingId);
  if (actor.role === 'ORG_ADMIN') {
    if (!user.organization_id || String(building.organization_id) !== String(user.organization_id)) {
      throw httpError(403, 'Tòa nhà không thuộc tổ chức của bạn.', 'BUILDING_SCOPE_DENIED');
    }
    return user;
  }

  if (actor.role === 'BUILDING_ADMIN') {
    const assigned = (user.assigned_buildings || []).map(String);
    if (!assigned.includes(String(buildingId))) {
      throw httpError(403, 'Bạn không được gán tòa nhà này.', 'BUILDING_SCOPE_DENIED');
    }
    return user;
  }

  throw httpError(403, 'Bạn không có quyền thao tác khẩn cấp trên tòa nhà này.', 'PERMISSION_DENIED');
}

function normalizeOrgId(actor, body = {}, building = null) {
  if (body.organization_id) return body.organization_id;
  if (building?.organization_id) return building.organization_id;
  if (actor.organization_id) return actor.organization_id;
  return null;
}

module.exports = {
  loadActorUser,
  resolveBuildingScope,
  canManageIncidentScope,
  assertIncidentManage,
  assertBuildingManage,
  normalizeOrgId,
  isValidObjectId
};
