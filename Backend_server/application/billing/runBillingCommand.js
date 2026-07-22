const { withMongoUnitOfWork } = require('../../shared/persistence/mongoUnitOfWork');

function transactionsEnabled() {
  const configured = process.env.BILLING_TRANSACTIONS_ENABLED;
  if (configured != null && configured !== '') {
    return String(configured).toLowerCase() === 'true';
  }
  return process.env.NODE_ENV === 'production';
}

async function runBillingCommand(work, options = {}) {
  if (options.session) return work(options.session);
  if (!transactionsEnabled()) return work(null);
  return withMongoUnitOfWork(work, options);
}

module.exports = {
  transactionsEnabled,
  runBillingCommand
};
