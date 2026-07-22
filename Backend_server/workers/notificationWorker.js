const {
  processPending
} = require('../application/notification/notificationDeliveryApplicationService');

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await processPending(Number(process.env.NOTIFICATION_WORKER_BATCH_SIZE) || 20);
  } catch (error) {
    console.warn('[Notification worker]', error.message);
  } finally {
    running = false;
  }
}

function startNotificationWorker() {
  if (process.env.NODE_ENV === 'test' || timer) return timer;
  const interval = Math.max(
    500,
    Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS) || 2000
  );
  timer = setInterval(tick, interval);
  timer.unref?.();
  setImmediate(tick);
  return timer;
}

function stopNotificationWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { tick, startNotificationWorker, stopNotificationWorker };
