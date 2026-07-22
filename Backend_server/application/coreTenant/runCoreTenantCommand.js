const { withMongoUnitOfWork } = require('../../shared/persistence/mongoUnitOfWork');

function transactionsEnabled() {
  const configured = process.env.CORE_TENANT_TRANSACTIONS_ENABLED;
  if (configured != null) return String(configured).toLowerCase() === 'true';
  return process.env.NODE_ENV === 'production';
}

async function runCoreTenantCommand(work, options = {}) {
  if (options.session) return work(options.session);
  if (!transactionsEnabled()) return work(null);
  return withMongoUnitOfWork(work, options);
}

module.exports = { runCoreTenantCommand, transactionsEnabled };
