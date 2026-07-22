require('dotenv').config();
const connectDB = require('../config/db');
const { startDomainEventWorker, stopDomainEventWorker } = require('./domainEventWorker');
const { registerEventHandlers } = require('../services/registerEventHandlers');
const { assertRequiredHandlersRegistered } = require('../shared/events/eventBus');

async function bootstrapDomainEventWorker() {
  await connectDB();
  registerEventHandlers();
  assertRequiredHandlersRegistered();
  return startDomainEventWorker();
}

function installSignalHandlers() {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      stopDomainEventWorker();
      process.exit(0);
    });
  }
}

if (require.main === module) {
  installSignalHandlers();
  bootstrapDomainEventWorker().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { bootstrapDomainEventWorker, installSignalHandlers };
