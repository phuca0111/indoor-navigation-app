const crypto = require('crypto');
const mongoose = require('mongoose');
const OrganizationBillingEvent = require('../models/OrganizationBillingEvent');

function toDto(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

function withSession(query, session) {
  return session ? query.session(session) : query;
}

function deterministicEventId(organizationId, idempotencyKey) {
  const hex = crypto
    .createHash('sha256')
    .update(`billing-event:${organizationId}:${idempotencyKey}`)
    .digest('hex')
    .slice(0, 24);
  return new mongoose.Types.ObjectId(hex);
}

async function findById(eventId, { session } = {}) {
  const query = OrganizationBillingEvent.findById(eventId).lean();
  return withSession(query, session);
}

async function findByOrganizationIdempotency(
  organizationId,
  idempotencyKey,
  { session } = {}
) {
  const query = OrganizationBillingEvent.findOne({
    organization_id: organizationId,
    idempotency_key: idempotencyKey
  }).lean();
  return withSession(query, session);
}

async function findByIdentityOrIdempotency({
  eventId,
  organizationId,
  idempotencyKey,
  session
}) {
  const query = OrganizationBillingEvent.findOne({
    $or: [
      { _id: eventId },
      { organization_id: organizationId, idempotency_key: idempotencyKey }
    ]
  }).lean();
  return withSession(query, session);
}

async function createEvent(input, { session } = {}) {
  const [created] = await OrganizationBillingEvent.create(
    [input],
    session ? { session } : undefined
  );
  return toDto(created);
}

async function claimForProcessing(eventId, staleBefore, { session } = {}) {
  return OrganizationBillingEvent.findOneAndUpdate(
    {
      _id: eventId,
      $or: [
        { processing_status: { $in: [null, 'PENDING', 'FAILED'] } },
        {
          processing_status: 'PROCESSING',
          processing_started_at: { $lt: staleBefore }
        }
      ]
    },
    {
      $set: {
        processing_status: 'PROCESSING',
        processing_started_at: new Date(),
        processing_error: ''
      },
      $inc: { processing_attempts: 1 }
    },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

async function markApplied(eventId, { session } = {}) {
  return OrganizationBillingEvent.findByIdAndUpdate(
    eventId,
    {
      $set: {
        processing_status: 'APPLIED',
        processed_at: new Date(),
        processing_error: ''
      }
    },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

async function markFailed(eventId, error, { session } = {}) {
  return OrganizationBillingEvent.findByIdAndUpdate(
    eventId,
    {
      $set: {
        processing_status: 'FAILED',
        processing_error: String(error?.message || error).slice(0, 500)
      }
    },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

async function recordRefundIfAbsent(filter, input, { session } = {}) {
  return OrganizationBillingEvent.findOneAndUpdate(
    filter,
    { $setOnInsert: input },
    {
      upsert: true,
      returnDocument: 'after',
      setDefaultsOnInsert: true,
      ...(session ? { session } : {})
    }
  ).lean();
}

async function listRecentForOrganization(organizationId, limit = 20) {
  return OrganizationBillingEvent.find({ organization_id: organizationId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 20, 100))
    .lean();
}

module.exports = {
  deterministicEventId,
  findById,
  findByOrganizationIdempotency,
  findByIdentityOrIdempotency,
  createEvent,
  claimForProcessing,
  markApplied,
  markFailed,
  recordRefundIfAbsent,
  listRecentForOrganization
};
