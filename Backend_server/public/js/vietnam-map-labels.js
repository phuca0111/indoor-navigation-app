/**
 * Basemap hybrid + nhãn chủ quyền Việt Nam.
 * - Đất liền: OSM có nhãn
 * - Zoom gần đảo: No Labels
 * - Zoom cả nước (cỡ ảnh user): phủ nền màu biển che chữ Trung + nhãn Việt lớn
 */
(function (global) {
  const LABELS = [
    { lat: 16.78, lng: 112.28, title: 'Quần đảo Hoàng Sa', subtitle: 'Việt Nam', strong: true },
    { lat: 9.95, lng: 114.75, title: 'Quần đảo Trường Sa', subtitle: 'Việt Nam', strong: true },
    { lat: 14.15, lng: 113.55, title: 'Biển Đông', subtitle: '', strong: false },
  ];

  /** Miếng phủ nhỏ (chỉ Leaflet/OSM raster) — không phủ cả biển */
  const COVERS = [
    { lat: 16.85, lng: 112.35, w: 160, h: 48 },
    { lat: 10.15, lng: 114.65, w: 170, h: 52 },
  ];

  const SEA_BOXES = [
    { south: 15.4, west: 111.0, north: 17.6, east: 113.6 },
    { south: 6.5, west: 111.2, north: 12.6, east: 118.2 },
  ];
  /** Chỉ khi zoom sát đảo mới đổi cả nền (tránh đất liền trắng) */
  const SEA_CLOSE_ZOOM = 9;

  function labelHtml(item) {
    const sub = item.subtitle
      ? '<span class="vn-sea-sub">' + item.subtitle + '</span>'
      : '';
    const cls = item.strong ? 'vn-sea-label vn-sea-label--strong' : 'vn-sea-label';
    return (
      '<div class="' + cls + '">' +
        '<span class="vn-sea-title">' + item.title + '</span>' +
        sub +
      '</div>'
    );
  }

  function coverHtml(item) {
    return (
      '<div class="vn-sea-cover" style="width:' +
      item.w +
      'px;height:' +
      item.h +
      'px"></div>'
    );
  }

  function boundsHitSea(b) {
    if (!b) return false;
    return SEA_BOXES.some(function (box) {
      return !(
        b.getSouth() > box.north ||
        b.getNorth() < box.south ||
        b.getWest() > box.east ||
        b.getEast() < box.west
      );
    });
  }

  function shouldUseNoLabels(map) {
    return map.getZoom() >= SEA_CLOSE_ZOOM && boundsHitSea(map.getBounds());
  }

  function addVietnamSovereigntyLabels(map) {
    if (!map || typeof L === 'undefined') return null;
    const layer = L.layerGroup();

    COVERS.forEach(function (item) {
      const icon = L.divIcon({
        className: 'vn-sea-label-wrap',
        html: coverHtml(item),
        iconSize: null,
        iconAnchor: [0, 0],
      });
      L.marker([item.lat, item.lng], {
        icon: icon,
        interactive: false,
        keyboard: false,
        zIndexOffset: 350,
      }).addTo(layer);
    });

    LABELS.forEach(function (item) {
      const icon = L.divIcon({
        className: 'vn-sea-label-wrap',
        html: labelHtml(item),
        iconSize: null,
        iconAnchor: [0, 0],
      });
      L.marker([item.lat, item.lng], {
        icon: icon,
        interactive: false,
        keyboard: false,
        zIndexOffset: 450,
      }).addTo(layer);
    });

    layer.addTo(map);
    return layer;
  }

  function installVietnamBasemap(map) {
    if (!map || typeof L === 'undefined') return null;

    const labeled = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
    const nolabels = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png',
      {
        maxZoom: 20,
        subdomains: 'abcd',
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      },
    );

    let usingNoLabels = shouldUseNoLabels(map);
    (usingNoLabels ? nolabels : labeled).addTo(map);

    function syncBasemap() {
      const wantNo = shouldUseNoLabels(map);
      if (wantNo === usingNoLabels) return;
      usingNoLabels = wantNo;
      if (wantNo) {
        map.removeLayer(labeled);
        if (!map.hasLayer(nolabels)) nolabels.addTo(map);
      } else {
        map.removeLayer(nolabels);
        if (!map.hasLayer(labeled)) labeled.addTo(map);
      }
    }

    map.on('moveend zoomend', syncBasemap);
    addVietnamSovereigntyLabels(map);
    return { labeled: labeled, nolabels: nolabels, sync: syncBasemap };
  }

  global.addVietnamSovereigntyLabels = addVietnamSovereigntyLabels;
  global.installVietnamBasemap = installVietnamBasemap;
})(typeof window !== 'undefined' ? window : this);
