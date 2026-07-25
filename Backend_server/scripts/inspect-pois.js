// Kiểm tra nhanh raw POI fields từ API map public (chạy: node scripts/inspect-pois.js <buildingId> <floor>)
const http = require('http');
const [, , buildingId = '6a5f4cee16b2df8c3efa0da1', floor = '0'] = process.argv;
http.get(`http://localhost:5000/api/maps/${buildingId}/${floor}/public`, (res) => {
  let d = '';
  res.on('data', (c) => (d += c));
  res.on('end', () => {
    const j = JSON.parse(d);
    const pois = (j.map_data && j.map_data.pois) || [];
    console.log('total pois:', pois.length);
    for (const p of pois) {
      console.log(JSON.stringify({
        id: p.id, name: p.name, type: p.type,
        poi_type: p.poi_type, poiType: p.poiType, typeIndex: p.typeIndex,
      }));
    }
  });
});
