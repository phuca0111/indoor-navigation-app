/**
 * Poll USGS (hoặc EXTERNAL_QUAKE_FEED_URL) định kỳ → EARTHQUAKE gần tòa.
 */
const { pollExternalEarthquakes } = require('../application/emergency/externalEarthquakeApplicationService');

let timer = null;
let running = false;

function intervalMs() {
  const min = Number(process.env.USGS_POLL_INTERVAL_MIN);
  const minutes = Number.isFinite(min) && min >= 1 ? min : 3;
  return minutes * 60 * 1000;
}

async function tick() {
  if (running) return;
  running = true;
  try {
    const result = await pollExternalEarthquakes();
    if (!result.skipped && result.triggered > 0) {
      console.log(
        `[usgs] triggered=${result.triggered} events=${result.events_seen} actions=${result.actions}`
      );
    }
  } catch (err) {
    console.warn('[usgs] poll failed:', err.message);
  } finally {
    running = false;
  }
}

function startUsgsEarthquakeScheduler() {
  if (timer) return;
  const raw = String(process.env.USGS_QUAKE_ENABLED || 'true').toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off') {
    console.log('[usgs] scheduler disabled');
    return;
  }
  const ms = intervalMs();
  timer = setInterval(tick, ms);
  if (timer.unref) timer.unref();
  // Chạy lần đầu sau 20s (đợi DB ổn định)
  setTimeout(tick, 20_000).unref?.();
  console.log(`[usgs] scheduler every ${Math.round(ms / 60000)} min`);
}

function stopUsgsEarthquakeScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  startUsgsEarthquakeScheduler,
  stopUsgsEarthquakeScheduler,
  tick
};
