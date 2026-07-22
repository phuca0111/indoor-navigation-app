/**
 * C4 — Ingest + aggregate telemetry
 */
const mongoose = require('mongoose');
const TelemetryEvent = require('../models/TelemetryEvent');
const Building = require('../models/Building');

const EVENT_TYPES = TelemetryEvent.EVENT_TYPES || [
  'session_start',
  'nav_complete',
  'map_view'
];

async function ingestTelemetryEvents(rawEvents, opts = {}) {
  const list = Array.isArray(rawEvents) ? rawEvents : [];
  if (!list.length) {
    throw Object.assign(new Error('Thiếu events.'), { status: 400, code: 'EVENTS_REQUIRED' });
  }
  if (list.length > 50) {
    throw Object.assign(new Error('Tối đa 50 events / request.'), {
      status: 400,
      code: 'EVENTS_TOO_MANY'
    });
  }

  const docs = [];
  for (const ev of list) {
    const eventType = String(ev.event_type || ev.type || '').toLowerCase();
    if (!EVENT_TYPES.includes(eventType)) {
      throw Object.assign(new Error(`event_type không hợp lệ: ${eventType}`), {
        status: 400,
        code: 'EVENT_TYPE_INVALID'
      });
    }
    let buildingId = ev.building_id || null;
    let organizationId = opts.organization_id || ev.organization_id || null;
    if (buildingId && !mongoose.Types.ObjectId.isValid(buildingId)) {
      throw Object.assign(new Error('building_id không hợp lệ.'), {
        status: 400,
        code: 'BUILDING_INVALID'
      });
    }
    if (buildingId && !organizationId) {
      const b = await Building.findById(buildingId)
        .select('organization_id owner_user_id')
        .lean();
      if (!b) {
        throw Object.assign(new Error('Không tìm thấy building.'), {
          status: 404,
          code: 'BUILDING_NOT_FOUND'
        });
      }
      if (b.organization_id) organizationId = b.organization_id;
      if (!b.organization_id && String(b.owner_user_id || '') !== String(opts.user_id || '')) {
        throw Object.assign(new Error('Building không thuộc phạm vi user.'), {
          status: 403,
          code: 'TELEMETRY_SCOPE_DENIED'
        });
      }
    } else if (buildingId) {
      const allowed = await Building.exists({
        _id: buildingId,
        $or: [
          { organization_id: organizationId },
          { organization_id: null, owner_user_id: opts.user_id || null }
        ]
      });
      if (!allowed) {
        throw Object.assign(new Error('Building không thuộc phạm vi organization/user.'), {
          status: 403,
          code: 'TELEMETRY_SCOPE_DENIED'
        });
      }
    }
    const occurredAt = ev.occurred_at ? new Date(ev.occurred_at) : new Date();
    docs.push({
      event_id: ev.event_id ? String(ev.event_id) : null,
      event_type: eventType,
      organization_id: organizationId || null,
      building_id: buildingId || null,
      session_id: String(ev.session_id || '').trim(),
      user_id: opts.user_id || null,
      occurred_at: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
      meta: ev.meta && typeof ev.meta === 'object' ? ev.meta : {}
    });
  }

  const withIds = docs.filter((doc) => doc.event_id);
  const withoutIds = docs.filter((doc) => !doc.event_id);
  let inserted = 0;
  if (withIds.length) {
    const result = await TelemetryEvent.bulkWrite(
      withIds.map((doc) => ({
        updateOne: {
          filter: { event_id: doc.event_id },
          update: { $setOnInsert: doc },
          upsert: true
        }
      })),
      { ordered: false }
    );
    inserted += Number(result.upsertedCount || 0);
  }
  if (withoutIds.length) {
    const result = await TelemetryEvent.insertMany(withoutIds, { ordered: false });
    inserted += result.length;
  }
  return { inserted, duplicated: docs.length - inserted };
}

async function telemetryByDay({ eventType, start, end, orgId, buildingIds, buildingId }) {
  const match = {
    event_type: eventType,
    occurred_at: { $gte: start, $lte: end }
  };
  if (buildingId) match.building_id = buildingId;
  else if (buildingIds?.length) match.building_id = { $in: buildingIds };
  else if (orgId) match.organization_id = orgId;

  return TelemetryEvent.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$occurred_at',
            timezone: process.env.REPORT_TIMEZONE || 'Asia/Ho_Chi_Minh'
          }
        },
        count: { $sum: 1 }
      }
    }
  ]);
}

async function countTelemetry({ eventType, start, end, orgId, buildingIds }) {
  const match = {
    event_type: eventType,
    occurred_at: { $gte: start, $lte: end }
  };
  if (buildingIds?.length) match.building_id = { $in: buildingIds };
  else if (orgId) match.organization_id = orgId;
  return TelemetryEvent.countDocuments(match);
}

async function navCompleteByBuilding({ start, end, buildingIds }) {
  const match = {
    event_type: 'nav_complete',
    occurred_at: { $gte: start, $lte: end }
  };
  if (buildingIds?.length) match.building_id = { $in: buildingIds };
  return TelemetryEvent.aggregate([
    { $match: match },
    { $group: { _id: '$building_id', navigation_requests: { $sum: 1 } } }
  ]);
}

module.exports = {
  EVENT_TYPES,
  ingestTelemetryEvents,
  telemetryByDay,
  countTelemetry,
  navCompleteByBuilding
};
