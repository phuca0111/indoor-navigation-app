const crypto = require('crypto');
const mongoose = require('mongoose');
const ExpenseLedger = require('../models/ExpenseLedger');

function deterministicEntryId(idempotencyKey) {
  const hex = crypto
    .createHash('sha256')
    .update(`expense-ledger:${idempotencyKey}`)
    .digest('hex')
    .slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
}

function toDto(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

async function findByIdempotencyKey(idempotencyKey, { session } = {}) {
  const query = ExpenseLedger.findOne({ idempotency_key: idempotencyKey }).lean();
  return session ? query.session(session) : query;
}

async function findByIdentityOrIdempotency({
  entryId,
  idempotencyKey,
  session
}) {
  const query = ExpenseLedger.findOne({
    $or: [
      { _id: entryId },
      { idempotency_key: idempotencyKey }
    ]
  }).lean();
  return session ? query.session(session) : query;
}

async function createEntry(input, { session } = {}) {
  const [created] = await ExpenseLedger.create(
    [input],
    session ? { session } : undefined
  );
  return toDto(created);
}

async function listEntries({ entryType, expenseId, from, to, limit = 200 }) {
  const filter = {};
  if (entryType) filter.entry_type = String(entryType).toUpperCase();
  if (expenseId) filter.expense_id = expenseId;
  if (from || to) {
    filter.expense_date = {};
    if (from) filter.expense_date.$gte = from;
    if (to) filter.expense_date.$lte = to;
  }
  return ExpenseLedger.find(filter)
    .sort({ expense_date: -1, createdAt: -1 })
    .limit(Math.min(Number(limit) || 200, 1000))
    .lean();
}

async function sumEntries(from, to) {
  const match = {};
  if (from || to) {
    match.expense_date = {};
    if (from) match.expense_date.$gte = from;
    if (to) match.expense_date.$lte = to;
  }
  const rows = await ExpenseLedger.aggregate([
    { $match: match },
    { $group: { _id: null, amount: { $sum: '$amount' } } }
  ]);
  return Number(rows[0]?.amount) || 0;
}

module.exports = {
  deterministicEntryId,
  findByIdempotencyKey,
  findByIdentityOrIdempotency,
  createEntry,
  listEntries,
  sumEntries
};
