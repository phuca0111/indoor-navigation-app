const { promoteDueArticles } = require('../application/content/cmsApplicationService');
const {
  recoverStaleUploads,
  reconcileAssets
} = require('../application/content/mediaApplicationService');

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await promoteDueArticles();
    await recoverStaleUploads(Number(process.env.STORAGE_RECOVERY_BATCH_SIZE) || 100);
    await reconcileAssets(Number(process.env.STORAGE_PURGE_BATCH_SIZE) || 100);
  } catch (error) {
    console.warn('[CMS scheduler]', error.message);
  } finally {
    running = false;
  }
}

function startCmsScheduler() {
  if (timer) return timer;
  timer = setInterval(
    tick,
    Math.max(10_000, Number(process.env.CMS_SCHEDULER_INTERVAL_MS) || 60_000)
  );
  timer.unref?.();
  setImmediate(tick);
  return timer;
}

function stopCmsScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startCmsScheduler, stopCmsScheduler, tick };
