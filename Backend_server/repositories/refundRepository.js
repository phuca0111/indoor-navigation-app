const Refund = require('../models/Refund');

function findByIdempotencyKey(idempotencyKey, { session } = {}) {
  const query = Refund.findOne({ idempotency_key: idempotencyKey }).lean();
  return session ? query.session(session) : query;
}

function createIfAbsent(idempotencyKey, data, { session } = {}) {
  return Refund.findOneAndUpdate(
    { idempotency_key: idempotencyKey },
    { $setOnInsert: data },
    {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true,
      ...(session ? { session } : {})
    }
  ).lean();
}

function claimForProcessing(refundId, { session } = {}) {
  const now = new Date();
  return Refund.findOneAndUpdate(
    {
      _id: refundId,
      $or: [
        { status: { $in: ['REQUESTED', 'FAILED', 'GATEWAY_PENDING'] } },
        { status: 'PROCESSING', lease_expires_at: { $lte: now } }
      ]
    },
    {
      $set: {
        status: 'PROCESSING',
        processing_started_at: now,
        lease_expires_at: new Date(now.getTime() + 5 * 60 * 1000),
        last_error: ''
      },
      $inc: { attempts: 1 }
    },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

function updateProcessingResult(refundId, changes, { session } = {}) {
  return Refund.findByIdAndUpdate(
    refundId,
    {
      $set: {
        ...changes,
        lease_expires_at: null
      }
    },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

module.exports = {
  findByIdempotencyKey,
  createIfAbsent,
  claimForProcessing,
  updateProcessingResult
};
