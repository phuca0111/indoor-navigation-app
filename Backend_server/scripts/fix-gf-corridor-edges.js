/**
 * GF (nha admin): nối hành lang cầu thang → trục giữa → Phòng khách.
 * Thiếu cạnh khiến A* vòng phải lên khu cửa ra rồi mới vào phòng.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const BUILDING_ID = '69e8e1c39d09fb85ed1195df';
const FLOOR = 0;

function idOf(n) {
  return String(n.id ?? n.node_id ?? n.nodeId);
}

function hasEdge(edges, a, b) {
  const A = String(a);
  const B = String(b);
  return edges.some((e) => {
    const s = String(e.source ?? e.from ?? e.sourceId);
    const t = String(e.target ?? e.to ?? e.targetId);
    return (s === A && t === B) || (s === B && t === A);
  });
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function ensureEdges(mapData, pairs) {
  if (!mapData || !Array.isArray(mapData.nodes) || !Array.isArray(mapData.edges)) {
    return { added: [], mapData };
  }
  const byId = Object.fromEntries(mapData.nodes.map((n) => [idOf(n), n]));
  const edges = mapData.edges.slice();
  const added = [];
  for (const [a, b] of pairs) {
    if (!byId[a] || !byId[b]) continue;
    if (hasEdge(edges, a, b)) continue;
    edges.push({
      source: String(a),
      target: String(b),
      distance: Math.round(dist(byId[a], byId[b])),
    });
    added.push(`${a}-${b}`);
  }
  return { added, mapData: { ...mapData, edges } };
}

function shortestPx(mapData, startId, goalId) {
  const byId = Object.fromEntries(mapData.nodes.map((n) => [idOf(n), n]));
  const adj = {};
  for (const n of mapData.nodes) adj[idOf(n)] = [];
  for (const e of mapData.edges) {
    const a = String(e.source ?? e.from ?? e.sourceId);
    const b = String(e.target ?? e.to ?? e.targetId);
    adj[a].push(b);
    adj[b].push(a);
  }
  // Dijkstra by pixel
  const distMap = { [startId]: 0 };
  const prev = {};
  const pq = [[0, startId]];
  while (pq.length) {
    pq.sort((x, y) => x[0] - y[0]);
    const [d, u] = pq.shift();
    if (d !== distMap[u]) continue;
    if (u === goalId) break;
    for (const v of adj[u] || []) {
      const w = dist(byId[u], byId[v]);
      const nd = d + w;
      if (nd < (distMap[v] ?? Infinity)) {
        distMap[v] = nd;
        prev[v] = u;
        pq.push([nd, v]);
      }
    }
  }
  if (distMap[goalId] == null) return null;
  const path = [goalId];
  let cur = goalId;
  while (prev[cur] != null) {
    cur = prev[cur];
    path.push(cur);
  }
  path.reverse();
  return { len: distMap[goalId], path };
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.db.collection('mapdatas');
  const bid = new mongoose.Types.ObjectId(BUILDING_ID);
  const f = await col.findOne({ building_id: bid, floor_number: FLOOR });
  if (!f) throw new Error('floor not found');

  // 18 (hành lang cầu thang) → 29 (trục giữa y=-640) → đã nối 26 → Phòng khách
  // 10 ↔ 29: nối ngang hàng -640 (tránh stub deg=1)
  const pairs = [
    ['18', '29'],
    ['10', '29'],
  ];

  const pub = ensureEdges(f.map_data, pairs);
  const draft = f.draft_map_data
    ? ensureEdges(f.draft_map_data, pairs)
    : { added: [], mapData: f.draft_map_data };

  const before = shortestPx(f.map_data, '22', '9');
  const after = shortestPx(pub.mapData, '22', '9');
  console.log('before stairsL→khach', before);
  console.log('after  stairsL→khach', after);
  console.log('added published', pub.added, 'draft', draft.added);

  const update = {
    map_data: pub.mapData,
    version: (f.version || 0) + 1,
    published_at: new Date(),
  };
  if (draft.mapData) update.draft_map_data = draft.mapData;

  await col.updateOne({ _id: f._id }, { $set: update });
  console.log('updated floor0 version', update.version);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
