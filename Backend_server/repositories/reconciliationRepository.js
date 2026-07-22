const ReconciliationRun = require('../models/ReconciliationRun');
const ReconciliationItem = require('../models/ReconciliationItem');
const ProviderTransaction = require('../models/ProviderTransaction');

function toDto(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

async function createRun(input, { session } = {}) {
  const [created] = await ReconciliationRun.create(
    [input],
    session ? { session } : undefined
  );
  return toDto(created);
}

async function updateRun(runId, changes, { session } = {}) {
  return ReconciliationRun.findByIdAndUpdate(
    runId,
    { $set: changes },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

async function findProviderTransactions({ provider, from, to, session }) {
  const query = ProviderTransaction.find({
    provider,
    occurred_at: { $gte: from, $lte: to }
  }).lean();
  return session ? query.session(session) : query;
}

async function insertItems(items, { session } = {}) {
  const created = await ReconciliationItem.insertMany(
    items,
    session ? { session } : undefined
  );
  return created.map(toDto);
}

async function listDiscrepancies(limit = 200) {
  return ReconciliationItem.find({ classification: { $ne: 'MATCHED' } })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 200, 1000))
    .lean();
}

async function listRuns(limit = 100) {
  return ReconciliationRun.find({})
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 100, 500))
    .lean();
}

async function findRunById(runId) {
  return ReconciliationRun.findById(runId).lean();
}

async function listItemsForRun(runId) {
  return ReconciliationItem.find({ run_id: runId })
    .sort({ classification: 1 })
    .lean();
}

module.exports = {
  createRun,
  updateRun,
  findProviderTransactions,
  insertItems,
  listDiscrepancies,
  listRuns,
  findRunById,
  listItemsForRun
};
