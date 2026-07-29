/**
 * Đánh dấu is_stairs=true cho node gần mỗi POI STAIRS nhất (trong maxDistPx).
 * Usage: node scripts/mark-stairs-nodes.js [buildingId] [maxDistPx]
 */
require('dotenv').config();
const mongoose = require('mongoose');

const buildingId = process.argv[2] || '69e8e1c39d09fb85ed1195df';
const maxDistPx = Number(process.argv[3] ?? 120);

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const col = mongoose.connection.db.collection('mapdatas');
  const oid = new mongoose.Types.ObjectId(buildingId);
  const floors = await col.find({ building_id: oid }).toArray();

  for (const fl of floors) {
    const nodes = fl.map_data?.nodes || [];
    const stairsPois = (fl.map_data?.pois || []).filter(
      (p) => String(p.poi_type || '').toUpperCase() === 'STAIRS',
    );
    let changed = false;
    for (const p of stairsPois) {
      let bestIdx = -1;
      let bestD = Infinity;
      nodes.forEach((n, i) => {
        const d = Math.hypot(+n.x - +p.x, +n.y - +p.y);
        if (d < bestD) {
          bestD = d;
          bestIdx = i;
        }
      });
      if (bestIdx >= 0 && bestD <= maxDistPx) {
        if (!nodes[bestIdx].is_stairs) {
          nodes[bestIdx].is_stairs = true;
          changed = true;
        }
        console.log(
          `floor=${fl.floor_number} poi=${p.id} (${p.x},${p.y}) -> node=${nodes[bestIdx].id} dist=${bestD.toFixed(1)} is_stairs=${nodes[bestIdx].is_stairs}`,
        );
      } else {
        console.log(
          `floor=${fl.floor_number} poi=${p.id} (${p.x},${p.y}) -> NO node within ${maxDistPx}px (bestDist=${bestD.toFixed(1)})`,
        );
      }
    }
    if (changed) {
      await col.updateOne(
        { _id: fl._id },
        {
          $set: {
            'map_data.nodes': nodes,
            version: (Number(fl.version) || 0) + 1,
          },
        },
      );
      console.log(`floor=${fl.floor_number} saved version=${(Number(fl.version) || 0) + 1}`);
    }
  }
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
