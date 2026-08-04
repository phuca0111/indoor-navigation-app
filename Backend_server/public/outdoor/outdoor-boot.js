/**
 * Outdoor map boot — chỉ MapLibre (OpenFreeMap Liberty).
 */
(function () {
  window.__OUTDOOR_MAP_ENGINE = 'maplibre';

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
    const sub = document.querySelector('aside .sub');
    if (sub) {
      sub.innerHTML =
        'Search · <a href="/get-app" style="color:inherit">Android App</a>';
    }
  }

  async function boot() {
    paintHeader();
    try {
      loadCss('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css');
      await loadScript('https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js');
      await loadScript('/js/maplibre-basemap.js?v=20260801op1');
      await loadScript('/outdoor/app-maplibre.js?v=20260801op1');
    } catch (e) {
      const status = document.getElementById('statusLine');
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
