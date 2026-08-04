/**
 * MapLibre basemap: OpenFreeMap Liberty (vector) + OSM raster.
 * - liberty: nhãn OSM ưu tiên tiếng Việt; vùng Hoàng Sa/Trường Sa xóa chữ OSM
 *   và gắn nhãn Việt (GeoJSON) thay thế
 * - osm / hybrid: raster (không sửa được chữ trong PNG)
 */
(function (global) {
  const LIBERTY_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

  const OSM_RASTER_STYLE = {
    version: 8,
    name: 'OpenStreetMap Raster',
    sources: {
      'osm-raster': {
        type: 'raster',
        tiles: [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: 'osm-raster',
        type: 'raster',
        source: 'osm-raster',
      },
    ],
  };

  /** Hộp blank chữ OSM (tránh tên Trung / “xã khu…” trên đảo). */
  const HS_POLY = {
    type: 'Polygon',
    coordinates: [
      [
        [111.0, 15.4],
        [113.6, 15.4],
        [113.6, 17.6],
        [111.0, 17.6],
        [111.0, 15.4],
      ],
    ],
  };
  const TS_POLY = {
    type: 'Polygon',
    coordinates: [
      [
        [111.2, 6.5],
        [118.2, 6.5],
        [118.2, 12.6],
        [111.2, 12.6],
        [111.2, 6.5],
      ],
    ],
  };

  const VN_LABEL_EXPR = [
    'case',
    ['any', ['within', HS_POLY], ['within', TS_POLY]],
    '',
    [
      'coalesce',
      ['get', 'name:vi'],
      ['get', 'name_vi'],
      ['get', 'name:en'],
      ['get', 'name_en'],
      ['get', 'name:latin'],
      ['get', 'name_int'],
      '',
    ],
  ];

  const ICON_OPACITY_EXPR = [
    'case',
    ['any', ['within', HS_POLY], ['within', TS_POLY]],
    0,
    1,
  ];

  const VN_LABEL_SOURCE = 'vn-island-labels';
  const VN_LABEL_LAYER = 'vn-island-labels-text';
  const VN_ARCH_LAYER = 'vn-island-labels-arch';

  /**
   * Tên Việt thay thế nhãn OSM trên quần đảo (toạ độ xấp xỉ).
   * kind: 'arch' = nhãn quần đảo (cùng kiểu chữ map, to hơn một chút)
   * minzoom: hiện khi zoom đủ gần.
   */
  const VN_ISLAND_POINTS = [
    // Quần đảo / biển — kiểu chữ map (không hộp trắng)
    {
      name: 'Quần đảo Hoàng Sa',
      sub: 'Việt Nam',
      lng: 112.28,
      lat: 16.78,
      minzoom: 5,
      kind: 'arch',
    },
    {
      name: 'Quần đảo Trường Sa',
      sub: 'Việt Nam',
      lng: 114.75,
      lat: 9.95,
      minzoom: 5,
      kind: 'arch',
    },
    { name: 'Biển Đông', sub: '', lng: 113.55, lat: 14.15, minzoom: 4, kind: 'arch' },
    // —— Hoàng Sa ——
    { name: 'Đảo Phú Lâm', lng: 112.337, lat: 16.834, minzoom: 9 },
    { name: 'Đảo Cây', lng: 112.269, lat: 16.98, minzoom: 10 },
    { name: 'Đảo Linh Côn', lng: 112.728, lat: 16.668, minzoom: 10 },
    { name: 'Đảo Duy Mộng', lng: 111.835, lat: 16.514, minzoom: 10 },
    { name: 'Đảo Quang Hòa', lng: 111.71, lat: 16.452, minzoom: 10 },
    { name: 'Đảo Hoàng Sa', lng: 111.608, lat: 16.514, minzoom: 10 },
    { name: 'Đảo Hữu Nhật', lng: 111.582, lat: 16.506, minzoom: 11 },
    { name: 'Đảo Quang Ảnh', lng: 111.506, lat: 16.448, minzoom: 11 },
    { name: 'Đảo Tri Tôn', lng: 111.203, lat: 15.784, minzoom: 9 },
    { name: 'Nhóm An Vĩnh', lng: 112.35, lat: 16.9, minzoom: 8 },
    { name: 'Nhóm Lưỡi Liềm', lng: 111.7, lat: 16.5, minzoom: 8 },
    { name: 'Bãi Bình Sơn', lng: 112.5, lat: 17.1, minzoom: 10 },
    // —— Trường Sa ——
    { name: 'Đảo Trường Sa', lng: 111.92, lat: 8.646, minzoom: 9 },
    { name: 'Đảo Song Tử Tây', lng: 114.331, lat: 11.428, minzoom: 9 },
    { name: 'Đảo Song Tử Đông', lng: 114.354, lat: 11.453, minzoom: 10 },
    { name: 'Đảo Sinh Tồn', lng: 114.328, lat: 9.885, minzoom: 9 },
    { name: 'Đảo Nam Yết', lng: 114.367, lat: 10.183, minzoom: 10 },
    { name: 'Đảo Sơn Ca', lng: 114.572, lat: 10.229, minzoom: 10 },
    { name: 'Đảo An Bang', lng: 112.922, lat: 7.892, minzoom: 9 },
    { name: 'Đá Tây', lng: 114.28, lat: 11.43, minzoom: 11 },
  ];

  function islandLabelsGeoJSON(kind) {
    return {
      type: 'FeatureCollection',
      features: VN_ISLAND_POINTS.filter(function (p) {
        if (kind === 'arch') return p.kind === 'arch';
        return p.kind !== 'arch';
      }).map(function (p) {
        return {
          type: 'Feature',
          properties: {
            name: p.name,
            sub: p.sub || '',
            minzoom: p.minzoom,
            kind: p.kind || 'place',
          },
          geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        };
      }),
    };
  }

  function removeVnLabelLayers(map) {
    [VN_ARCH_LAYER, VN_LABEL_LAYER].forEach(function (id) {
      try {
        if (map.getLayer(id)) map.removeLayer(id);
      } catch (_) {
        /* ignore */
      }
    });
    try {
      if (map.getSource(VN_LABEL_SOURCE)) map.removeSource(VN_LABEL_SOURCE);
    } catch (_) {
      /* ignore */
    }
  }

  function ensureVietnamIslandLabels(map) {
    if (!map || !map.getStyle) return;
    removeVnLabelLayers(map);
    try {
      map.addSource(VN_LABEL_SOURCE, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: islandLabelsGeoJSON('arch')
            .features.concat(islandLabelsGeoJSON('place').features),
        },
      });

      // Quần đảo Hoàng Sa / Trường Sa / Biển Đông — cùng kiểu chữ map (halo trắng, không hộp)
      map.addLayer({
        id: VN_ARCH_LAYER,
        type: 'symbol',
        source: VN_LABEL_SOURCE,
        minzoom: 4,
        filter: [
          'all',
          ['==', ['get', 'kind'], 'arch'],
          ['>=', ['zoom'], ['get', 'minzoom']],
        ],
        layout: {
          'text-field': [
            'case',
            ['>', ['length', ['get', 'sub']], 0],
            ['concat', ['get', 'name'], '\n', ['get', 'sub']],
            ['get', 'name'],
          ],
          'text-font': ['Noto Sans Bold'],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            5,
            13,
            8,
            15,
            12,
            17,
          ],
          'text-anchor': 'center',
          'text-line-height': 1.15,
          'text-allow-overlap': true,
          'text-ignore-placement': false,
        },
        paint: {
          'text-color': '#0f172a',
          'text-halo-color': 'rgba(255,255,255,0.95)',
          'text-halo-width': 2,
        },
      });

      map.addLayer({
        id: VN_LABEL_LAYER,
        type: 'symbol',
        source: VN_LABEL_SOURCE,
        minzoom: 7,
        filter: [
          'all',
          ['!=', ['get', 'kind'], 'arch'],
          ['>=', ['zoom'], ['get', 'minzoom']],
        ],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            8,
            11,
            12,
            14,
            14,
            16,
          ],
          'text-anchor': 'center',
          'text-allow-overlap': false,
          'text-optional': true,
          'symbol-sort-key': ['get', 'minzoom'],
        },
        paint: {
          'text-color': '#0f172a',
          'text-halo-color': 'rgba(255,255,255,0.92)',
          'text-halo-width': 1.6,
        },
      });
    } catch (e) {
      console.warn('ensureVietnamIslandLabels', e);
      try {
        removeVnLabelLayers(map);
        map.addSource(VN_LABEL_SOURCE, {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: islandLabelsGeoJSON('arch')
              .features.concat(islandLabelsGeoJSON('place').features),
          },
        });
        map.addLayer({
          id: VN_ARCH_LAYER,
          type: 'symbol',
          source: VN_LABEL_SOURCE,
          filter: ['==', ['get', 'kind'], 'arch'],
          layout: {
            'text-field': [
              'case',
              ['>', ['length', ['get', 'sub']], 0],
              ['concat', ['get', 'name'], '\n', ['get', 'sub']],
              ['get', 'name'],
            ],
            'text-size': 14,
            'text-anchor': 'center',
            'text-allow-overlap': true,
          },
          paint: {
            'text-color': '#0f172a',
            'text-halo-color': '#ffffff',
            'text-halo-width': 2,
          },
        });
        map.addLayer({
          id: VN_LABEL_LAYER,
          type: 'symbol',
          source: VN_LABEL_SOURCE,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 13,
            'text-anchor': 'center',
          },
          paint: {
            'text-color': '#0f172a',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5,
          },
          filter: [
            'all',
            ['!=', ['get', 'kind'], 'arch'],
            ['>=', ['zoom'], ['get', 'minzoom']],
          ],
        });
      } catch (e2) {
        console.warn('ensureVietnamIslandLabels fallback', e2);
      }
    }
  }

  function preferVietnameseLabels(map) {
    const style = map.getStyle();
    if (!style || !style.layers) return;
    style.layers.forEach(function (layer) {
      if (layer.type !== 'symbol') return;
      if (layer.id === VN_LABEL_LAYER || layer.id === VN_ARCH_LAYER) return;
      if (layer.layout && layer.layout['text-field'] != null) {
        try {
          map.setLayoutProperty(layer.id, 'text-field', VN_LABEL_EXPR);
        } catch (_) {
          /* ignore */
        }
      }
      try {
        map.setPaintProperty(layer.id, 'icon-opacity', ICON_OPACITY_EXPR);
      } catch (_) {
        /* ignore */
      }
      try {
        map.setPaintProperty(layer.id, 'text-opacity', [
          'case',
          ['any', ['within', HS_POLY], ['within', TS_POLY]],
          0,
          1,
        ]);
      } catch (_) {
        /* ignore */
      }
    });
  }

  /** Gỡ phủ trắng cũ nếu còn trong cache style. */
  const BLANK_SOURCE = 'vn-island-blank';
  const BLANK_FILL = 'vn-island-blank-fill';
  const BLANK_OUTLINE = 'vn-island-blank-outline';

  function ensureIslandBlankCovers(map) {
    if (!map || !map.getStyle) return;
    try {
      if (map.getLayer(BLANK_OUTLINE)) map.removeLayer(BLANK_OUTLINE);
      if (map.getLayer(BLANK_FILL)) map.removeLayer(BLANK_FILL);
      if (map.getSource(BLANK_SOURCE)) map.removeSource(BLANK_SOURCE);
    } catch (e) {
      console.warn('ensureIslandBlankCovers clear', e);
    }
  }

  /**
   * Chỉ dùng Liberty — không hiện nút chọn nền.
   * @param {maplibregl.Map} map
   * @param {{ onStyleReady?: (mode: string) => void }} opts
   */
  function installBasemapSwitcher(map, opts) {
    opts = opts || {};

    function afterStyleReady() {
      preferVietnameseLabels(map);
      ensureVietnamIslandLabels(map);
      ensureIslandBlankCovers(map);
      if (typeof opts.onStyleReady === 'function') opts.onStyleReady('liberty');
    }

    function boot() {
      afterStyleReady();
    }
    if (typeof map.loaded === 'function' && map.loaded()) {
      boot();
    } else {
      map.once('load', boot);
    }

    return {
      getMode: function () {
        return 'liberty';
      },
      setMode: function () {
        /* chỉ còn Liberty */
      },
      preferVietnameseLabels: function () {
        preferVietnameseLabels(map);
      },
      ensureVietnamIslandLabels: function () {
        ensureVietnamIslandLabels(map);
      },
      ensureIslandBlankCovers: function () {
        ensureIslandBlankCovers(map);
      },
      LIBERTY_STYLE: LIBERTY_STYLE,
      OSM_RASTER_STYLE: OSM_RASTER_STYLE,
    };
  }

  global.IndoorNavBasemap = {
    LIBERTY_STYLE: LIBERTY_STYLE,
    OSM_RASTER_STYLE: OSM_RASTER_STYLE,
    preferVietnameseLabels: preferVietnameseLabels,
    ensureVietnamIslandLabels: ensureVietnamIslandLabels,
    ensureIslandBlankCovers: ensureIslandBlankCovers,
    installBasemapSwitcher: installBasemapSwitcher,
  };
})(typeof window !== 'undefined' ? window : this);
