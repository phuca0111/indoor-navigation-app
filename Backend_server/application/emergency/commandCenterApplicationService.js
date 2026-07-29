/**
 * Phase 3 — Command Center aggregate read API.
 */
const Incident = require('../../models/Incident');
const HazardZone = require('../../models/HazardZone');
const EmergencyBroadcast = require('../../models/EmergencyBroadcast');
const EmergencyLocation = require('../../models/EmergencyLocation');
const ActivityLog = require('../../models/ActivityLog');
const { assertIncidentManage } = require('../../utils/emergencyScope');
const { getPolicyByType } = require('./emergencyPolicyApplicationService');
const { serializeIncident } = require('./incidentApplicationService');
const { serializeZone } = require('./hazardZoneApplicationService');
const { serializeLocation } = require('./emergencyLocationApplicationService');
const { httpError } = require('../../utils/navigationGraph');

async function getCommandCenterSnapshot(input = {}) {
  const incidentId = input.params?.incidentId;
  const incident = await Incident.findById(incidentId).lean();
  if (!incident) throw httpError(404, 'Không tìm thấy sự cố.', 'INCIDENT_NOT_FOUND');
  await assertIncidentManage(input.actor, incident);

  const [hazardZones, broadcasts, locationCount, trappedCount, latestBroadcast, timeline, policy] = await Promise.all([
    HazardZone.find({ incident_id: incidentId }).sort({ createdAt: -1 }).lean(),
    EmergencyBroadcast.find({ incident_id: incidentId }).sort({ createdAt: -1 }).limit(5).lean(),
    EmergencyLocation.countDocuments({ incident_id: incidentId }),
    EmergencyLocation.countDocuments({ incident_id: incidentId, possibly_trapped: true }),
    EmergencyBroadcast.findOne({ incident_id: incidentId }).sort({ createdAt: -1 }).lean(),
    ActivityLog.find({
      $or: [
        { target_type: 'incident', target_id: String(incidentId) },
        { 'details.broadcast_id': { $exists: true } }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
    getPolicyByType(incident.type)
  ]);

  const activeZones = hazardZones.filter((z) => z.active);
  const recentLocations = await EmergencyLocation.find({ incident_id: incidentId })
    .sort({ possibly_trapped: -1, reported_at: -1 })
    .limit(30)
    .lean();

  return {
    status: 200,
    body: {
      incident: serializeIncident(incident),
      policy: { hazard_type: incident.type, rules: policy },
      hazard_zones: {
        total: hazardZones.length,
        active: activeZones.length,
        zones: hazardZones.map(serializeZone)
      },
      broadcast: {
        latest: latestBroadcast
          ? {
            id: String(latestBroadcast._id),
            status: latestBroadcast.status,
            recipient_count: latestBroadcast.recipient_count,
            push_sent_count: latestBroadcast.push_sent_count,
            proximity_wake_count: latestBroadcast.proximity_wake_count || 0,
            sent_at: latestBroadcast.sent_at
          }
          : null,
        history: broadcasts.map((b) => ({
          id: String(b._id),
          status: b.status,
          recipient_count: b.recipient_count,
          proximity_wake_count: b.proximity_wake_count || 0,
          sent_at: b.sent_at
        }))
      },
      locations: {
        count: locationCount,
        possibly_trapped_count: trappedCount,
        last_reported_at: locationCount
          ? (await EmergencyLocation.findOne({ incident_id: incidentId }).sort({ reported_at: -1 }).select('reported_at').lean())?.reported_at
          : null,
        recent: recentLocations.map(serializeLocation)
      },
      timeline: timeline.map((row) => ({
        action: row.action,
        at: row.createdAt,
        user_id: row.user_id ? String(row.user_id) : null,
        target: row.target,
        details: row.details || {}
      }))
    }
  };
}

async function listRecentLocations(input = {}) {
  const incidentId = input.params?.incidentId;
  const incident = await Incident.findById(incidentId).lean();
  if (!incident) throw httpError(404, 'Không tìm thấy sự cố.', 'INCIDENT_NOT_FOUND');
  await assertIncidentManage(input.actor, incident);

  const rows = await EmergencyLocation.find({ incident_id: incidentId })
    .sort({ reported_at: -1 })
    .limit(100)
    .lean();

  return { status: 200, body: { locations: rows.map(serializeLocation) } };
}

module.exports = {
  getCommandCenterSnapshot,
  listRecentLocations
};
