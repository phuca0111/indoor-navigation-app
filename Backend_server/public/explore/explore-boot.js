/**
 * Explore map boot — chỉ MapLibre (OpenFreeMap Liberty).
 */
(function () {
  window.__EXPLORE_MAP_ENGINE = 'maplibre';

  function loadCss(href) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () {
        reject(new Error('Không tải được ' + src));
      };
      document.body.appendChild(s);
    });
  }

  function paintHeader() {
    const brand = document.querySelector('.ex-brand p');
    if (brand) {
      brand.innerHTML =
        'Outdoor Map<br>Tìm địa điểm → xem Indoor (nếu có)';
    }
  }

  async function boot() {
    paintHeader();
    try {
      loadCss('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css');
      await loadScript('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js');
      await loadScript('/js/maplibre-basemap.js?v=20260801op1');
      await loadScript('/explore/explore-maplibre.js?v=20260801op1');
    } catch (e) {
      const status = document.getElementById('exStatus');
      if (status) status.textContent = e.message || 'Lỗi tải map engine';
      console.error(e);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
