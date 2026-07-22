const { processPending } = require('../shared/events/eventBus');

let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    await processPending(Number(process.env.EVENT_WORKER_BATCH_SIZE) || 20);
  } catch (error) {
    console.warn('[DomainEvent worker]', error.message);
  } finally {
    running = false;
  }
}

function startDomainEventWorker() {
  if (process.env.NODE_ENV === 'test' || timer) return timer;
  const intervalMs = Math.max(
    500,
    Number(process.env.EVENT_WORKER_INTERVAL_MS) || 2000
  );
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
  setImmediate(tick);
  return timer;
}

function stopDomainEventWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { startDomainEventWorker, stopDomainEventWorker, tick };
