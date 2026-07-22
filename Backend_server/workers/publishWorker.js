require('dotenv').config();

const connectDB = require('../config/db');
const { startWorker, stopWorker } = require('../services/publishQueueBull');

async function main() {
  await connectDB();
  const {
    assertMapLifecycleProductionReady
  } = require('../config/mapLifecycleProductionGuard');
  await assertMapLifecycleProductionReady();
  await startWorker();
  console.log('[publishWorker] BullMQ worker đã sẵn sàng.');
}

async function shutdown() {
  await stopWorker();
  process.exit(0);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[publishWorker] startup failed:', error);
    process.exit(1);
  });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

module.exports = { main, shutdown };
