const { withMongoUnitOfWork } = require('../../shared/persistence/mongoUnitOfWork');

function transactionsEnabled() {
  const configured = process.env.MAP_LIFECYCLE_TRANSACTIONS_ENABLED;
  if (configured != null) return String(configured).toLowerCase() === 'true';
  return process.env.NODE_ENV === 'production';
}

async function runMapLifecycleCommand(work, options = {}) {
  if (options.session) return work(options.session);
  if (!transactionsEnabled()) return work(null);
  return withMongoUnitOfWork(work, options);
}

module.exports = { runMapLifecycleCommand, transactionsEnabled };
