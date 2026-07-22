const mongoose = require('mongoose');
const PersonalPayment = require('../models/PersonalPayment');

function toDto(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

function normalizeId(id) {
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
  return new mongoose.Types.ObjectId(String(id));
}

function withSession(query, session) {
  return session ? query.session(session) : query;
}

async function cancelPendingForUser(userId, exceptId = null, { session } = {}) {
  const filter = {
    user_id: userId,
    status: { $in: ['PENDING', 'PROCESSING'] }
  };
  if (exceptId) filter._id = { $ne: exceptId };
  return PersonalPayment.updateMany(
    filter,
    { $set: { status: 'CANCELLED' } },
    session ? { session } : undefined
  );
}

async function findLatest(filter, sort, { session } = {}) {
  const query = PersonalPayment.findOne(filter).sort(sort).lean();
  return withSession(query, session);
}

async function findById(paymentId, { session } = {}) {
  const query = PersonalPayment.findById(paymentId).lean();
  return withSession(query, session);
}

async function createPayment(input, { session } = {}) {
  const [created] = await PersonalPayment.create(
    [input],
    session ? { session } : undefined
  );
  return toDto(created);
}

async function updatePayment(paymentId, changes, { session } = {}) {
  const normalized = { ...changes };
  if (normalized.status && normalized.status !== 'PROCESSING') {
    normalized.processing_lease_expires_at = null;
  }
  return PersonalPayment.findByIdAndUpdate(
    paymentId,
    { $set: normalized },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

async function claimPending(paymentId, token, { session } = {}) {
  const now = new Date();
  return PersonalPayment.findOneAndUpdate(
    {
      _id: paymentId,
      token,
      $or: [
        { status: 'PENDING' },
        {
          status: 'PROCESSING',
          processing_lease_expires_at: { $lte: now }
        }
      ]
    },
    {
      $set: {
        status: 'PROCESSING',
        processing_started_at: now,
        processing_lease_expires_at: new Date(now.getTime() + 5 * 60 * 1000)
      }
    },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

async function existsById(paymentId, { session } = {}) {
  if (!normalizeId(paymentId)) return false;
  const query = PersonalPayment.exists({ _id: paymentId });
  return Boolean(await withSession(query, session));
}

module.exports = {
  normalizeId,
  cancelPendingForUser,
  findLatest,
  findById,
  createPayment,
  updatePayment,
  claimPending,
  existsById
};
