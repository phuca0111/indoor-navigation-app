/**
 * P2.2 — Map Health: chấm điểm sức khỏe bản đồ theo từng tầng của một tòa nhà.
 * Chỉ đọc; không đụng draft/publish core.
 */
const Building = require('../../models/Building');
const Floor = require('../../models/Floor');
const Draft = require('../../models/Draft');
const { countMapElements } = require('../../utils/mapSnapshot');

const DEFAULT_STALE_DAYS = 180;
const SEVERITY_PENALTY = { WARN: 10, INFO: 3 };

function httpError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

function toTime(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

function daysBetween(fromMs, toMs) {
  return Math.floor((toMs - fromMs) / 86400000);
}

/**
 * Chấm điểm thuần (unit-testable) — không chạm DB.
 * @param {{building:object, floors:Array, drafts:Array, now?:Date|number, staleAfterDays?:number}} input
 */
function evaluateMapHealth(input = {}) {
  const building = input.building || {};
  const nowMs = toTime(input.now) ?? Date.now();
  const staleAfterDays = Number(input.staleAfterDays) > 0
    ? Number(input.staleAfterDays)
    : DEFAULT_STALE_DAYS;

  const floorByNumber = new Map(
    (Array.isArray(input.floors) ? input.floors : []).map((f) => [Number(f.floor_number), f])
  );
  const draftByNumber = new Map(
    (Array.isArray(input.drafts) ? input.drafts : []).map((d) => [Number(d.floor_number), d])
  );

  const totalFloors = Math.max(1, Number(building.total_floors) || 1);
  const floorReports = [];
  const counters = { OUTDATED: 0, MISSING_POI: 0, NO_MAP: 0 };

  for (let floorNumber = 0; floorNumber < totalFloors; floorNumber += 1) {
    const floor = floorByNumber.get(floorNumber) || null;
    const draft = draftByNumber.get(floorNumber) || null;
    const counts = countMapElements(floor?.map_data);
    const publishedAt = toTime(floor?.published_at);
    const draftUpdatedAt = toTime(draft?.updatedAt);
    const signals = [];

    if (!publishedAt) {
      signals.push({
        code: 'NO_MAP',
        severity: 'INFO',
        message: draft
          ? 'Tầng mới có bản nháp, chưa xuất bản lần nào.'
          : 'Tầng chưa có bản đồ xuất bản.'
      });
    }

    if (publishedAt && draftUpdatedAt && draftUpdatedAt > publishedAt) {
      signals.push({
        code: 'OUTDATED',
        severity: 'WARN',
        message: 'Bản nháp mới hơn bản đã xuất bản — cần publish lại.',
        draft_updated_at: draft.updatedAt,
        published_at: floor.published_at
      });
    } else if (publishedAt && daysBetween(publishedAt, nowMs) >= staleAfterDays) {
      signals.push({
        code: 'OUTDATED',
        severity: 'WARN',
        message: `Bản đồ đã xuất bản quá ${staleAfterDays} ngày, cần rà soát.`,
        published_at: floor.published_at,
        age_days: daysBetween(publishedAt, nowMs)
      });
    }

    if (publishedAt && counts.pois_count === 0) {
      signals.push({
        code: 'MISSING_POI',
        severity: 'WARN',
        message: 'Bản đồ đã xuất bản nhưng chưa có POI nào.'
      });
    }

    signals.forEach((signal) => {
      if (counters[signal.code] != null) counters[signal.code] += 1;
    });

    floorReports.push({
      floor_number: floorNumber,
      floor_name: floor?.floor_name || (floorNumber === 0 ? 'Tầng trệt' : `Tầng ${floorNumber}`),
      version: Number(floor?.version) || 0,
      published_at: floor?.published_at || null,
      draft_updated_at: draft?.updatedAt || null,
      rooms_count: counts.rooms_count,
      pois_count: counts.pois_count,
      nodes_count: counts.nodes_count,
      signals
    });
  }

  const allSignals = floorReports.flatMap((report) => report.signals);
  const penalty = allSignals.reduce(
    (sum, signal) => sum + (SEVERITY_PENALTY[signal.severity] || 0),
    0
  );
  const score = Math.max(0, 100 - penalty);
  let status = 'HEALTHY';
  // Mọi WARN (≥1, penalty ≥10 → score ≤90) phải ít nhất WARNING
  if (score < 60) status = 'CRITICAL';
  else if (score <= 90) status = 'WARNING';

  return {
    building_id: building._id ? String(building._id) : null,
    name: building.name || '',
    status,
    score,
    total_floors: totalFloors,
    stale_after_days: staleAfterDays,
    signal_counts: counters,
    floors: floorReports,
    checked_at: new Date(nowMs).toISOString()
  };
}

/** GET /api/buildings/:id/map-health */
async function getBuildingMapHealth(input = {}) {
  const buildingId = String(input.params?.id || '').trim();
  if (!buildingId) throw httpError(400, 'Thiếu building id.');

  const building = await Building.findById(buildingId)
    .select('name total_floors status visibility place_id is_active')
    .lean();
  if (!building) throw httpError(404, 'Không tìm thấy tòa nhà.', 'BUILDING_NOT_FOUND');

  const [floors, drafts] = await Promise.all([
    Floor.find({ building_id: building._id })
      .select('floor_number floor_name version published_at map_data.rooms map_data.pois map_data.nodes')
      .lean(),
    Draft.find({ building_id: building._id, deleted_at: null })
      .select('floor_number updatedAt version')
      .lean()
  ]);

  const staleAfterDays = Number(input.query?.stale_days) || DEFAULT_STALE_DAYS;
  const report = evaluateMapHealth({ building, floors, drafts, staleAfterDays });

  return {
    status: 200,
    body: {
      ...report,
      visibility: building.visibility || 'PRIVATE',
      place_id: building.place_id ? String(building.place_id) : null
    }
  };
}

module.exports = { getBuildingMapHealth, evaluateMapHealth, DEFAULT_STALE_DAYS };
