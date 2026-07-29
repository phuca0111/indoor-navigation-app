/**
 * Phase 3 — Incident Management application service.
 */
const Incident = require('../../models/Incident');
const ActivityLog = require('../../models/ActivityLog');
const { INCIDENT_STATUSES } = require('../../models/Incident');
const {
  assertIncidentManage,
  assertBuildingManage,
  resolveBuildingScope,
  normalizeOrgId,
  isValidObjectId
} = require('../../utils/emergencyScope');
const { httpError } = require('../../utils/navigationGraph');

const VALID_TRANSITIONS = Object.freeze({
  DRAFT: ['PENDING', 'ACTIVE', 'ARCHIVED'],
  PENDING: ['ACTIVE', 'DRAFT', 'ARCHIVED'],
  ACTIVE: ['CONTAINED', 'RESOLVED'],
  CONTAINED: ['RESOLVED', 'ACTIVE'],
  RESOLVED: ['ARCHIVED'],
  ARCHIVED: []
});

function canTransition(from, to) {
  return (VALID_TRANSITIONS[from] || []).includes(to);
}

function logIncidentActivity(userId, action, incident, details = {}, ip = '') {
  ActivityLog.create({
    user_id: userId,
    action,
    target_type: 'incident',
    target_id: String(incident._id),
    target: incident.title || `${incident.type} #${String(incident._id).slice(-6)}`,
    details,
    organization_id: incident.organization_id || null,
    ip_address: ip
  }).catch(() => {});
}

function serializeIncident(doc) {
  if (!doc) return null;
  const row = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(row._id),
    type: row.type,
    scope: row.scope,
    title: row.title,
    description: row.description,
    building_id: row.building_id ? String(row.building_id) : null,
    organization_id: row.organization_id ? String(row.organization_id) : null,
    status: row.status,
    created_by: row.created_by ? String(row.created_by) : null,
    activated_at: row.activated_at,
    contained_at: row.contained_at,
    resolved_at: row.resolved_at,
    archived_at: row.archived_at,
    timeline: row.timeline || [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    external_source: row.external_source || '',
    external_event_id: row.external_event_id || '',
    external_meta: row.external_meta || null
  };
}

async function listIncidents(input = {}) {
  const actor = input.actor;
  const user = await require('../../utils/emergencyScope').loadActorUser(actor);
  const filter = {};
  const status = String(input.query?.status || '').trim().toUpperCase();
  if (status && INCIDENT_STATUSES.includes(status)) filter.status = status;

  if (actor.role === 'SUPER_ADMIN') {
    if (input.query?.organization_id) filter.organization_id = input.query.organization_id;
    if (input.query?.building_id) filter.building_id = input.query.building_id;
  } else if (actor.role === 'ORG_ADMIN') {
    filter.organization_id = user.organization_id;
    if (input.query?.building_id) filter.building_id = input.query.building_id;
  } else if (actor.role === 'BUILDING_ADMIN') {
    const assigned = (user.assigned_buildings || []).map(String);
    filter.building_id = { $in: assigned };
  } else {
    throw httpError(403, 'Không có quyền xem sự cố.', 'PERMISSION_DENIED');
  }

  const rows = await Incident.find(filter).sort({ updatedAt: -1 }).limit(100).lean();
  return { status: 200, body: { incidents: rows.map(serializeIncident) } };
}

async function getIncident(input = {}) {
  const incident = await Incident.findById(input.params?.id).lean();
  if (!incident) throw httpError(404, 'Không tìm thấy sự cố.', 'INCIDENT_NOT_FOUND');
  await assertIncidentManage(input.actor, incident);
  return { status: 200, body: { incident: serializeIncident(incident) } };
}

async function createIncident(input = {}) {
  const actor = input.actor;
  const body = input.body || {};
  const type = String(body.type || 'FIRE').trim().toUpperCase();
  if (!type) throw httpError(400, 'Thiếu loại sự cố.', 'INCIDENT_TYPE_REQUIRED');

  let building = null;
  if (body.building_id) {
    await assertBuildingManage(actor, body.building_id);
    building = await resolveBuildingScope(body.building_id);
  } else if (actor.role === 'BUILDING_ADMIN') {
    throw httpError(400, 'Quản trị tòa nhà cần chọn một tòa nhà khi tạo sự cố.', 'BUILDING_REQUIRED');
  }

  const organizationId = normalizeOrgId(actor, body, building);
  const incident = await Incident.create({
    type,
    scope: body.scope || (body.building_id ? 'BUILDING' : 'ORG'),
    title: String(body.title || `Sự cố ${type}`).slice(0, 200),
    description: String(body.description || '').slice(0, 2000),
    building_id: body.building_id || null,
    organization_id: organizationId,
    status: 'DRAFT',
    created_by: actor.userId,
    timeline: [{ status: 'DRAFT', at: new Date(), by: actor.userId, note: 'Tạo bản nháp' }]
  });

  logIncidentActivity(actor.userId, 'INCIDENT_CREATE', incident, { type }, input.ip || '');
  return { status: 201, body: { incident: serializeIncident(incident) } };
}

async function updateIncidentStatus(input = {}) {
  const nextStatus = String(input.body?.status || '').trim().toUpperCase();
  if (!INCIDENT_STATUSES.includes(nextStatus)) {
    throw httpError(400, 'Trạng thái không hợp lệ.', 'INCIDENT_STATUS_INVALID');
  }

  const incident = await Incident.findById(input.params?.id);
  if (!incident) throw httpError(404, 'Không tìm thấy sự cố.', 'INCIDENT_NOT_FOUND');
  await assertIncidentManage(input.actor, incident);

  if (!canTransition(incident.status, nextStatus)) {
    throw httpError(409, `Không thể chuyển ${incident.status} → ${nextStatus}.`, 'INCIDENT_TRANSITION_INVALID');
  }

  const now = new Date();
  incident.status = nextStatus;
  incident.timeline.push({
    status: nextStatus,
    at: now,
    by: input.actor.userId,
    note: String(input.body?.note || '').slice(0, 500)
  });

  if (nextStatus === 'ACTIVE') incident.activated_at = incident.activated_at || now;
  if (nextStatus === 'CONTAINED') incident.contained_at = now;
  if (nextStatus === 'RESOLVED') incident.resolved_at = now;
  if (nextStatus === 'ARCHIVED') incident.archived_at = now;

  await incident.save();
  logIncidentActivity(
    input.actor.userId,
    'INCIDENT_STATUS_CHANGE',
    incident,
    { from: incident.timeline[incident.timeline.length - 2]?.status, to: nextStatus },
    input.ip || ''
  );

  let broadcast = null;
  // Kích hoạt → tự phát cảnh báo push/in-app (không cần bấm thêm nút).
  if (nextStatus === 'ACTIVE') {
    try {
      const { createBroadcast } = require('./broadcastApplicationService');
      const result = await createBroadcast({
        params: { incidentId: String(incident._id) },
        body: {
          title: incident.title || `Cảnh báo khẩn cấp: ${incident.type}`,
          body: incident.description || 'Có sự cố khẩn cấp. Mở ứng dụng để xem hướng dẫn sơ tán.'
        },
        actor: input.actor,
        ip: input.ip || ''
      });
      broadcast = result.body?.broadcast || null;
    } catch (err) {
      console.warn('[incident] auto-broadcast failed:', err.message);
      broadcast = { error: err.message, status: 'FAILED' };
    }
  }

  // Spec D — Stop Emergency khi kết thúc / khoanh vùng xong.
  if (nextStatus === 'CONTAINED' || nextStatus === 'RESOLVED') {
    sendStopEmergencyForIncident(incident).catch((err) => {
      console.warn('[incident] stop-emergency failed:', err.message);
    });
  }

  return {
    status: 200,
    body: {
      incident: serializeIncident(incident),
      broadcast
    }
  };
}

async function sendStopEmergencyForIncident(incident) {
  const UserDevice = require('../../models/UserDevice');
  const EmergencyLocation = require('../../models/EmergencyLocation');
  const { sendEmergencyStopPush } = require('../../services/fcmPushAdapter');

  const userIds = new Set();
  const locUsers = await EmergencyLocation.distinct('user_id', { incident_id: incident._id });
  locUsers.forEach((id) => userIds.add(String(id)));

  if (incident.building_id) {
    const presenceUsers = await UserDevice.distinct('user_id', {
      is_active: true,
      $or: [
        { last_building_id: incident.building_id },
        { last_indoor_building_id: incident.building_id }
      ]
    });
    presenceUsers.forEach((id) => userIds.add(String(id)));
  }

  if (!userIds.size) return { sent: 0 };

  const devices = await UserDevice.find({
    user_id: { $in: [...userIds] },
    is_active: true,
    fcm_token: { $exists: true, $nin: [null, ''] }
  })
    .select('fcm_token')
    .lean();

  let sent = 0;
  for (const d of devices) {
    try {
      await sendEmergencyStopPush({
        token: d.fcm_token,
        incidentId: String(incident._id),
        buildingId: incident.building_id ? String(incident.building_id) : ''
      });
      sent += 1;
    } catch (err) {
      console.warn('[incident] stop push error:', err.message);
    }
  }
  return { sent };
}

/**
 * App end-user: sự cố đang ACTIVE của một tòa nhà (không cần quyền quản trị).
 * Trả kèm hazard zone đang hiệu lực để client tránh vùng nguy hiểm.
 */
async function getActiveIncidentForBuilding(input = {}) {
  const buildingId = input.params?.buildingId;
  if (!isValidObjectId(buildingId)) {
    throw httpError(400, 'Mã tòa nhà không hợp lệ.', 'INVALID_BUILDING_ID');
  }

  const incident = await Incident.findOne({
    building_id: buildingId,
    status: 'ACTIVE'
  })
    .sort({ activated_at: -1, updatedAt: -1 })
    .lean();

  if (!incident) {
    return { status: 200, body: { active: false, incident: null, hazard_zones: [] } };
  }

  const HazardZone = require('../../models/HazardZone');
  const zones = await HazardZone.find({
    incident_id: incident._id,
    active: true
  })
    .select('_id hazard_type name floor_number polygon')
    .lean();

  return {
    status: 200,
    body: {
      active: true,
      incident: {
        id: String(incident._id),
        type: incident.type,
        title: incident.title,
        description: incident.description,
        building_id: incident.building_id ? String(incident.building_id) : null,
        activated_at: incident.activated_at
      },
      hazard_zones: zones.map((z) => ({
        id: String(z._id),
        hazard_type: z.hazard_type,
        name: z.name,
        floor_number: z.floor_number,
        polygon: z.polygon || []
      }))
    }
  };
}

async function updateIncident(input = {}) {
  const incident = await Incident.findById(input.params?.id);
  if (!incident) throw httpError(404, 'Không tìm thấy sự cố.', 'INCIDENT_NOT_FOUND');
  await assertIncidentManage(input.actor, incident);
  if (incident.status !== 'DRAFT' && incident.status !== 'PENDING') {
    throw httpError(409, 'Chỉ sửa sự cố ở trạng thái DRAFT/PENDING.', 'INCIDENT_NOT_EDITABLE');
  }

  const body = input.body || {};
  if (body.title != null) incident.title = String(body.title).slice(0, 200);
  if (body.description != null) incident.description = String(body.description).slice(0, 2000);
  if (body.type != null) incident.type = String(body.type).trim().toUpperCase();
  await incident.save();

  logIncidentActivity(input.actor.userId, 'INCIDENT_UPDATE', incident, {}, input.ip || '');
  return { status: 200, body: { incident: serializeIncident(incident) } };
}

module.exports = {
  VALID_TRANSITIONS,
  canTransition,
  serializeIncident,
  listIncidents,
  getIncident,
  createIncident,
  updateIncident,
  updateIncidentStatus,
  getActiveIncidentForBuilding
};
