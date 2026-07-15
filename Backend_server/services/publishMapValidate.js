// ============================================
// FILE: publishMapValidate.js
// Phase 2c — Validate map_data trước / trong publish
// Phase 2d — Cấm Base64 background_image
// ============================================

const { assertNoBase64Background } = require('./objectStorage');

/**
 * @returns {{ ok: boolean, errors: Array<{ code: string, message: string, path?: string }> }}
 */
function validateMapData(map_data) {
  const errors = [];

  if (map_data === null || map_data === undefined) {
    return { ok: false, errors: [{ code: 'MAP_REQUIRED', message: 'Thiếu map_data.' }] };
  }
  if (typeof map_data !== 'object' || Array.isArray(map_data)) {
    return { ok: false, errors: [{ code: 'MAP_TYPE', message: 'map_data phải là object.' }] };
  }

  const bgCheck = assertNoBase64Background(map_data);
  if (!bgCheck.ok) {
    errors.push({
      code: bgCheck.code,
      message: bgCheck.message,
      path: bgCheck.path || 'background_image'
    });
  }

  const nodes = Array.isArray(map_data.nodes) ? map_data.nodes : null;
  const edges = Array.isArray(map_data.edges) ? map_data.edges : null;
  const rooms = Array.isArray(map_data.rooms) ? map_data.rooms : null;
  const qrAnchors = Array.isArray(map_data.qr_anchors) ? map_data.qr_anchors : null;

  if (map_data.nodes != null && !Array.isArray(map_data.nodes)) {
    errors.push({ code: 'NODES_TYPE', message: 'nodes phải là mảng.', path: 'nodes' });
  }
  if (map_data.edges != null && !Array.isArray(map_data.edges)) {
    errors.push({ code: 'EDGES_TYPE', message: 'edges phải là mảng.', path: 'edges' });
  }
  if (map_data.rooms != null && !Array.isArray(map_data.rooms)) {
    errors.push({ code: 'ROOMS_TYPE', message: 'rooms phải là mảng.', path: 'rooms' });
  }
  if (map_data.qr_anchors != null && !Array.isArray(map_data.qr_anchors)) {
    errors.push({ code: 'QR_TYPE', message: 'qr_anchors phải là mảng.', path: 'qr_anchors' });
  }

  const nodeIds = new Set();
  if (nodes) {
    nodes.forEach((n, i) => {
      if (!n || typeof n !== 'object') {
        errors.push({ code: 'NODE_INVALID', message: `Node[${i}] không hợp lệ.`, path: `nodes[${i}]` });
        return;
      }
      const id = n.id != null ? String(n.id) : '';
      if (!id) {
        errors.push({ code: 'NODE_ID', message: `Node[${i}] thiếu id.`, path: `nodes[${i}].id` });
        return;
      }
      if (nodeIds.has(id)) {
        errors.push({ code: 'NODE_DUP', message: `Node id trùng: ${id}`, path: `nodes[${i}].id` });
      }
      nodeIds.add(id);
      if (n.x != null && !Number.isFinite(Number(n.x))) {
        errors.push({ code: 'NODE_XY', message: `Node ${id}: x không hợp lệ.`, path: `nodes[${i}].x` });
      }
      if (n.y != null && !Number.isFinite(Number(n.y))) {
        errors.push({ code: 'NODE_XY', message: `Node ${id}: y không hợp lệ.`, path: `nodes[${i}].y` });
      }
    });
  }

  if (edges && nodeIds.size > 0) {
    edges.forEach((e, i) => {
      if (!e || typeof e !== 'object') {
        errors.push({ code: 'EDGE_INVALID', message: `Edge[${i}] không hợp lệ.`, path: `edges[${i}]` });
        return;
      }
      const from = e.from != null ? String(e.from) : e.source != null ? String(e.source) : '';
      const to = e.to != null ? String(e.to) : e.target != null ? String(e.target) : '';
      if (!from || !to) {
        errors.push({ code: 'EDGE_ENDS', message: `Edge[${i}] thiếu from/to.`, path: `edges[${i}]` });
        return;
      }
      if (!nodeIds.has(from) || !nodeIds.has(to)) {
        errors.push({
          code: 'EDGE_NODE_MISSING',
          message: `Edge[${i}] trỏ node không tồn tại (${from}→${to}).`,
          path: `edges[${i}]`
        });
      }
    });
  } else if (edges && edges.length > 0 && nodeIds.size === 0) {
    errors.push({
      code: 'EDGE_WITHOUT_NODES',
      message: 'Có edges nhưng không có nodes.',
      path: 'edges'
    });
  }

  if (rooms) {
    rooms.forEach((r, i) => {
      if (!r || typeof r !== 'object') {
        errors.push({ code: 'ROOM_INVALID', message: `Room[${i}] không hợp lệ.`, path: `rooms[${i}]` });
        return;
      }
      if (r.id == null || String(r.id).trim() === '') {
        errors.push({ code: 'ROOM_ID', message: `Room[${i}] thiếu id.`, path: `rooms[${i}].id` });
      }
    });
  }

  if (qrAnchors) {
    qrAnchors.forEach((a, i) => {
      if (!a || typeof a !== 'object') {
        errors.push({ code: 'QR_INVALID', message: `qr_anchors[${i}] không hợp lệ.`, path: `qr_anchors[${i}]` });
        return;
      }
      if (!Number.isFinite(Number(a.x)) || !Number.isFinite(Number(a.y))) {
        errors.push({
          code: 'QR_XY',
          message: `qr_anchors[${i}] thiếu tọa độ x/y hợp lệ.`,
          path: `qr_anchors[${i}]`
        });
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { validateMapData };
