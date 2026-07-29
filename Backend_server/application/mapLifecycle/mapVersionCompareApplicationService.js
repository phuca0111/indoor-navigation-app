/**
 * P2.2 — So sánh 2 phiên bản bản đồ đã publish (delta counts).
 * Chỉ đọc snapshot có sẵn trong MapVersion; không rollback, không đụng publish core.
 */
const versions = require('../../repositories/mapVersionRepository');

const ELEMENT_KEYS = ['rooms', 'pois', 'nodes', 'edges', 'walls', 'qr_anchors'];
const SAMPLE_LIMIT = 20;

function httpError(status, message, code) {
  return Object.assign(new Error(message), { status, code });
}

/** map_snapshot đầy đủ; fallback graph_snapshot cho bản cũ chỉ có nodes/edges. */
function snapshotOf(versionDoc) {
  if (!versionDoc) return null;
  return versionDoc.map_snapshot || versionDoc.graph_snapshot || {};
}

function elementKey(kind, item, index) {
  if (item == null || typeof item !== 'object') return `${kind}#${index}`;
  if (kind === 'edges') {
    return `${item.source ?? ''}->${item.target ?? ''}` === '->'
      ? `${kind}#${index}`
      : `${item.source ?? ''}->${item.target ?? ''}`;
  }
  if (kind === 'qr_anchors') return String(item.qr_id ?? `${kind}#${index}`);
  return String(item.id ?? item.name ?? `${kind}#${index}`);
}

function indexElements(kind, list) {
  const map = new Map();
  (Array.isArray(list) ? list : []).forEach((item, index) => {
    map.set(elementKey(kind, item, index), item);
  });
  return map;
}

/** Delta thuần giữa 2 snapshot (unit-testable). */
function diffSnapshots(fromSnapshot, toSnapshot) {
  const from = fromSnapshot && typeof fromSnapshot === 'object' ? fromSnapshot : {};
  const to = toSnapshot && typeof toSnapshot === 'object' ? toSnapshot : {};
  const summary = {};
  let totalChanges = 0;

  ELEMENT_KEYS.forEach((kind) => {
    const fromIndex = indexElements(kind, from[kind]);
    const toIndex = indexElements(kind, to[kind]);
    const added = [];
    const removed = [];

    toIndex.forEach((_, key) => {
      if (!fromIndex.has(key)) added.push(key);
    });
    fromIndex.forEach((_, key) => {
      if (!toIndex.has(key)) removed.push(key);
    });

    totalChanges += added.length + removed.length;
    summary[kind] = {
      from: fromIndex.size,
      to: toIndex.size,
      delta: toIndex.size - fromIndex.size,
      added: added.length,
      removed: removed.length,
      unchanged: toIndex.size - added.length,
      added_sample: added.slice(0, SAMPLE_LIMIT),
      removed_sample: removed.slice(0, SAMPLE_LIMIT)
    };
  });

  return { summary, total_changes: totalChanges, identical: totalChanges === 0 };
}

function versionMeta(doc) {
  return {
    version: doc.version,
    published_at: doc.published_at || null,
    published_by: doc.published_by || null,
    rooms_count: doc.rooms_count || 0,
    nodes_count: doc.nodes_count || 0,
    edges_count: doc.edges_count || 0,
    has_full_snapshot: Boolean(doc.map_snapshot && Array.isArray(doc.map_snapshot.rooms))
  };
}

/** GET /api/map-versions/:buildingId/:floor/compare?from=&to= */
async function compareVersions({ buildingId, floorNumber, from, to } = {}) {
  const fromVersion = Number.parseInt(from, 10);
  const toVersion = Number.parseInt(to, 10);
  if (!Number.isFinite(fromVersion) || !Number.isFinite(toVersion)) {
    throw httpError(400, 'Cần tham số from và to là số phiên bản.', 'INVALID_VERSION_RANGE');
  }

  const [fromDoc, toDoc] = await Promise.all([
    versions.findSnapshot(buildingId, floorNumber, fromVersion),
    versions.findSnapshot(buildingId, floorNumber, toVersion)
  ]);
  if (!fromDoc) throw httpError(404, `Không tìm thấy phiên bản v${fromVersion}.`, 'VERSION_NOT_FOUND');
  if (!toDoc) throw httpError(404, `Không tìm thấy phiên bản v${toVersion}.`, 'VERSION_NOT_FOUND');

  const diff = diffSnapshots(snapshotOf(fromDoc), snapshotOf(toDoc));

  return {
    building_id: String(buildingId),
    floor_number: Number(floorNumber),
    from: versionMeta(fromDoc),
    to: versionMeta(toDoc),
    partial_snapshot: !(
      Boolean(fromDoc.map_snapshot && Array.isArray(fromDoc.map_snapshot.rooms)) &&
      Boolean(toDoc.map_snapshot && Array.isArray(toDoc.map_snapshot.rooms))
    ),
    ...diff
  };
}

module.exports = { compareVersions, diffSnapshots, snapshotOf, ELEMENT_KEYS };
