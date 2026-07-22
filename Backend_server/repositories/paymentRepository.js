const crypto = require('crypto');
const mongoose = require('mongoose');
const Payment = require('../models/Payment');

function toDto(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function deterministicPaymentId(namespace, idempotencyKey) {
  const hex = crypto
    .createHash('sha256')
    .update(`${namespace}:${idempotencyKey}`)
    .digest('hex')
    .slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
}

async function findById(paymentId, { session } = {}) {
  const query = Payment.findById(paymentId).lean();
  return withSession(query, session);
}

async function findByIdempotencyKey(idempotencyKey, { session } = {}) {
  const query = Payment.findOne({ idempotency_key: idempotencyKey }).lean();
  return withSession(query, session);
}

async function findByIdentityOrIdempotency({
  paymentId,
  idempotencyKey,
  session
}) {
  const query = Payment.findOne({
    $or: [
      { _id: paymentId },
      { idempotency_key: idempotencyKey }
    ]
  }).lean();
  return withSession(query, session);
}

async function createPayment(input, { session } = {}) {
  const [created] = await Payment.create([input], session ? { session } : undefined);
  return toDto(created);
}

async function updatePayment(paymentId, changes, { session } = {}) {
  return Payment.findByIdAndUpdate(
    paymentId,
    { $set: changes },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

async function listPayments({
  organizationId,
  status,
  method,
  invoiceId,
  limit = 100
}) {
  const filter = {};
  if (organizationId) filter.organization_id = organizationId;
  if (status) filter.status = String(status).toUpperCase();
  if (method) filter.method = String(method).toUpperCase();
  if (invoiceId) filter.invoice_id = invoiceId;

  return Payment.find(filter)
    .sort({ paid_at: -1, createdAt: -1 })
    .limit(Math.min(Number(limit) || 100, 500))
    .populate('organization_id', 'name slug plan')
    .populate('invoice_id', 'invoice_number status plan amount')
    .lean();
}

async function findProviderPayments({ provider, from, to }) {
  return Payment.find({
    provider,
    paid_at: { $gte: from, $lte: to },
    provider_ref: { $ne: '' }
  }).lean();
}

module.exports = {
  deterministicPaymentId,
  findById,
  findByIdempotencyKey,
  findByIdentityOrIdempotency,
  createPayment,
  updatePayment,
  listPayments,
  findProviderPayments
};
