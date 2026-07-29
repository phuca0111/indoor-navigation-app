/**
 * Phase 3 — Hazard Zone application service.
 */
const HazardZone = require('../../models/HazardZone');
const Incident = require('../../models/Incident');
const ActivityLog = require('../../models/ActivityLog');
const { assertIncidentManage } = require('../../utils/emergencyScope');
const { httpError } = require('../../utils/navigationGraph');

function serializeZone(doc) {
  const row = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(row._id),
    incident_id: String(row.incident_id),
    hazard_type: row.hazard_type,
    name: row.name,
    building_id: row.building_id ? String(row.building_id) : null,
    floor_number: row.floor_number,
    polygon: row.polygon || [],
    active: Boolean(row.active),
    created_by: row.created_by ? String(row.created_by) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function logZoneActivity(userId, action, zone, details = {}, ip = '') {
  ActivityLog.create({
    user_id: userId,
    action,
    target_type: 'hazard_zone',
    target_id: String(zone._id),
    target: zone.name || zone.hazard_type,
    details,
    ip_address: ip
  }).catch(() => {});
}

async function listHazardZones(input = {}) {
  const incidentId = input.params?.incidentId || input.query?.incident_id;
  if (!incidentId) throw httpError(400, 'Thiếu incident_id.', 'INCIDENT_ID_REQUIRED');

  const incident = await Incident.findById(incidentId).lean();
  if (!incident) throw httpError(404, 'Không tìm thấy sự cố.', 'INCIDENT_NOT_FOUND');
  await assertIncidentManage(input.actor, incident);

  const filter = { incident_id: incidentId };
  if (input.query?.active === 'true') filter.active = true;

  const rows = await HazardZone.find(filter).sort({ createdAt: -1 }).lean();
  return { status: 200, body: { hazard_zones: rows.map(serializeZone) } };
}

async function createHazardZone(input = {}) {
  const incidentId = input.params?.incidentId;
  const incident = await Incident.findById(incidentId).lean();
  if (!incident) throw httpError(404, 'Không tìm thấy sự cố.', 'INCIDENT_NOT_FOUND');
  await assertIncidentManage(input.actor, incident);

  const body = input.body || {};
  const polygon = Array.isArray(body.polygon) ? body.polygon : [];
  if (polygon.length > 0 && polygon.length < 3) {
    throw httpError(400, 'Polygon cần ít nhất 3 điểm.', 'POLYGON_INVALID');
  }

  const zone = await HazardZone.create({
    incident_id: incidentId,
    hazard_type: String(body.hazard_type || 'OTHER').trim().toUpperCase(),
    name: String(body.name || 'Vùng nguy hiểm').slice(0, 120),
    building_id: body.building_id || incident.building_id || null,
    floor_number: body.floor_number != null ? Number(body.floor_number) : null,
    polygon,
    // Sự cố đang ACTIVE → zone có hiệu lực ngay (app mới thấy / tránh vùng)
    active: incident.status === 'ACTIVE' || body.active === true,
    created_by: input.actor.userId
  });

  logZoneActivity(input.actor.userId, 'HAZARD_ZONE_CREATE', zone, { active: zone.active }, input.ip || '');
  return { status: 201, body: { hazard_zone: serializeZone(zone) } };
}

async function updateHazardZone(input = {}) {
  const zone = await HazardZone.findById(input.params?.id);
  if (!zone) throw httpError(404, 'Không tìm thấy vùng nguy hiểm.', 'HAZARD_ZONE_NOT_FOUND');

  const incident = await Incident.findById(zone.incident_id).lean();
  await assertIncidentManage(input.actor, incident);

  const body = input.body || {};
  if (body.name != null) zone.name = String(body.name).slice(0, 120);
  if (body.hazard_type != null) zone.hazard_type = String(body.hazard_type).trim().toUpperCase();
  if (body.polygon != null) {
    if (body.polygon.length > 0 && body.polygon.length < 3) {
      throw httpError(400, 'Polygon cần ít nhất 3 điểm.', 'POLYGON_INVALID');
    }
    zone.polygon = body.polygon;
  }
  if (body.floor_number != null) zone.floor_number = Number(body.floor_number);
  if (body.building_id != null) zone.building_id = body.building_id;

  await zone.save();
  logZoneActivity(input.actor.userId, 'HAZARD_ZONE_UPDATE', zone, {}, input.ip || '');
  return { status: 200, body: { hazard_zone: serializeZone(zone) } };
}

async function activateHazardZones(input = {}) {
  const incidentId = input.params?.incidentId;
  const incident = await Incident.findById(incidentId).lean();
  if (!incident) throw httpError(404, 'Không tìm thấy sự cố.', 'INCIDENT_NOT_FOUND');
  await assertIncidentManage(input.actor, incident);

  if (incident.status !== 'ACTIVE') {
    throw httpError(409, 'Chỉ kích hoạt zone khi Incident ACTIVE.', 'INCIDENT_NOT_ACTIVE');
  }

  const zoneIds = Array.isArray(input.body?.zone_ids) ? input.body.zone_ids.map(String) : [];
  const filter = { incident_id: incidentId };
  if (zoneIds.length) filter._id = { $in: zoneIds };

  const result = await HazardZone.updateMany(filter, { $set: { active: true } });
  logZoneActivity(
    input.actor.userId,
    'HAZARD_ZONE_ACTIVATE',
    { _id: incidentId, hazard_type: incident.type, name: incident.title },
    { activated_count: result.modifiedCount, zone_ids: zoneIds },
    input.ip || ''
  );

  const rows = await HazardZone.find({ incident_id: incidentId, active: true }).lean();
  return {
    status: 200,
    body: { activated_count: result.modifiedCount, hazard_zones: rows.map(serializeZone) }
  };
}

async function deactivateHazardZones(input = {}) {
  const incidentId = input.params?.incidentId;
  const incident = await Incident.findById(incidentId).lean();
  if (!incident) throw httpError(404, 'Không tìm thấy sự cố.', 'INCIDENT_NOT_FOUND');
  await assertIncidentManage(input.actor, incident);

  const zoneIds = Array.isArray(input.body?.zone_ids) ? input.body.zone_ids.map(String) : [];
  const filter = { incident_id: incidentId, active: true };
  if (zoneIds.length) filter._id = { $in: zoneIds };

  const result = await HazardZone.updateMany(filter, { $set: { active: false } });
  logZoneActivity(
    input.actor.userId,
    'HAZARD_ZONE_DEACTIVATE',
    { _id: incidentId, hazard_type: incident.type, name: incident.title },
    { deactivated_count: result.modifiedCount, zone_ids: zoneIds },
    input.ip || ''
  );

  const rows = await HazardZone.find({ incident_id: incidentId }).sort({ createdAt: -1 }).lean();
  return {
    status: 200,
    body: { deactivated_count: result.modifiedCount, hazard_zones: rows.map(serializeZone) }
  };
}

async function deleteHazardZone(input = {}) {
  const zone = await HazardZone.findById(input.params?.id);
  if (!zone) throw httpError(404, 'Không tìm thấy vùng nguy hiểm.', 'HAZARD_ZONE_NOT_FOUND');

  const incident = await Incident.findById(zone.incident_id).lean();
  await assertIncidentManage(input.actor, incident);

  await zone.deleteOne();
  return { status: 200, body: { deleted: true, id: String(zone._id) } };
}

module.exports = {
  serializeZone,
  listHazardZones,
  createHazardZone,
  updateHazardZone,
  activateHazardZones,
  deactivateHazardZones,
  deleteHazardZone
};
