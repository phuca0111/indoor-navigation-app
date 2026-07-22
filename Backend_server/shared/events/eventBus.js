const crypto = require('crypto');
const mongoose = require('mongoose');
const DomainEvent = require('../../models/DomainEvent');
const EventDelivery = require('../../models/EventDelivery');
const { REQUIRED_EVENT_HANDLERS } = require('./handlerManifest');

const handlers = new Map();
const MAX_ATTEMPTS = Math.max(1, Number(process.env.EVENT_MAX_ATTEMPTS) || 8);
const STALE_LOCK_MS = Math.max(30_000, Number(process.env.EVENT_STALE_LOCK_MS) || 5 * 60_000);
const PAYLOAD_REQUIREMENTS = Object.freeze({
  PaymentSucceeded: ['invoice_id', 'amount'],
  RefundCompleted: ['amount', 'provider'],
  MapPublished: ['building_id', 'floor_id', 'version'],
  PublishRequested: ['publish_job_id'],
  MapPostCommit: ['building_id', 'floor_number', 'version'],
  SubscriptionExpired: ['subscription_id']
});

function validatePayload(type, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw Object.assign(new TypeError('Domain event payload phải là object.'), {
      code: 'EVENT_PAYLOAD_INVALID'
    });
  }
  const missing = (PAYLOAD_REQUIREMENTS[type] || []).filter(
    (field) => payload[field] === undefined || payload[field] === null
  );
  if (missing.length) {
    throw Object.assign(
      new TypeError(`Payload ${type} thiếu: ${missing.join(', ')}.`),
      { code: 'EVENT_PAYLOAD_INVALID', fields: missing }
    );
  }
  return payload;
}

function redactPayload(value, depth = 0) {
  if (depth > 8) return '[TRUNCATED]';
  if (Array.isArray(value)) return value.map((item) => redactPayload(item, depth + 1));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    /password|secret|token|otp|authorization|cookie|cvv/i.test(key)
      ? '[REDACTED]'
      : redactPayload(item, depth + 1)
  ]));
}

function subscribe(type, handlerName, handler) {
  if (!type || !handlerName || typeof handler !== 'function') {
    throw new TypeError('subscribe cần type, handlerName và handler function.');
  }
  const rows = handlers.get(type) || [];
  const withoutOld = rows.filter((row) => row.name !== handlerName);
  withoutOld.push({ name: handlerName, run: handler });
  handlers.set(type, withoutOld);
}

function missingRequiredHandlers(type) {
  const required = REQUIRED_EVENT_HANDLERS[type] || [];
  if (!required.length) return [];
  const registered = new Set((handlers.get(type) || []).map((handler) => handler.name));
  return required.filter((handlerName) => !registered.has(handlerName));
}

function assertRequiredHandlersRegistered() {
  const missing = Object.keys(REQUIRED_EVENT_HANDLERS)
    .flatMap((type) => missingRequiredHandlers(type).map((handler) => ({
      type,
      handler
    })));
  if (missing.length) {
    throw Object.assign(
      new Error(
        `Domain event handlers chưa đăng ký: ${missing
          .map((item) => `${item.type}/${item.handler}`)
          .join(', ')}`
      ),
      { code: 'EVENT_HANDLER_REGISTRATION_INCOMPLETE', missing }
    );
  }
  return true;
}

async function publish(input, opts = {}) {
  if (!input?.type || !input?.aggregate_type || !input?.aggregate_id) {
    throw new TypeError('Domain event thiếu type/aggregate_type/aggregate_id.');
  }
  const eventKey =
    String(input.event_key || `${input.type}:${input.aggregate_type}:${input.aggregate_id}`);
  const eventId = String(
    input.event_id ||
      crypto.createHash('sha256').update(eventKey).digest('hex').slice(0, 32)
  );
  const payload = redactPayload(validatePayload(input.type, input.payload || {}));
  const correlationId = String(input.correlation_id || opts.correlation_id || eventId);
  try {
    const docs = await DomainEvent.create(
      [
        {
          event_id: eventId,
          event_key: eventKey,
          type: input.type,
          schema_version: Math.max(1, Number(input.schema_version) || 1),
          correlation_id: correlationId,
          causation_id: input.causation_id || opts.causation_id || null,
          occurred_at: input.occurred_at || new Date(),
          aggregate_type: input.aggregate_type,
          aggregate_id: String(input.aggregate_id),
          organization_id: input.organization_id || null,
          actor_user_id: input.actor_user_id || null,
          payload,
          status: 'PENDING',
          available_at: input.available_at || new Date()
        }
      ],
      opts.session ? { session: opts.session } : undefined
    );
    return { event: docs[0], duplicated: false };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const existed = await DomainEvent.findOne({
      $or: [{ event_id: eventId }, { event_key: eventKey }]
    });
    return { event: existed, duplicated: true };
  }
}

async function claimNextEvent(owner = `event-worker:${process.pid}`) {
  const now = new Date();
  const leaseExpiresAt = new Date(Date.now() + STALE_LOCK_MS);
  return DomainEvent.findOneAndUpdate(
    {
      available_at: { $lte: now },
      $or: [
        { status: { $in: ['PENDING', 'RETRY'] } },
        { status: 'PROCESSING', lease_expires_at: { $lte: now } }
      ]
    },
    {
      $set: {
        status: 'PROCESSING',
        locked_at: now,
        lease_owner: owner,
        lease_expires_at: leaseExpiresAt
      },
      $inc: { attempts: 1 }
    },
    { sort: { available_at: 1, createdAt: 1 }, returnDocument: 'after' }
  );
}

async function deliverToHandler(event, handler, owner = `event-worker:${process.pid}`) {
  const now = new Date();
  await EventDelivery.updateOne(
    { event_id: event.event_id, handler: handler.name },
    { $setOnInsert: { status: 'PENDING', attempts: 0, available_at: now } },
    { upsert: true }
  );
  if (
    event.status === 'RETRY' &&
    event.available_at &&
    new Date(event.available_at).getTime() <= Date.now()
  ) {
    await EventDelivery.updateOne(
      {
        event_id: event.event_id,
        handler: handler.name,
        status: { $in: ['RETRY', 'FAILED'] }
      },
      { $set: { available_at: now } }
    );
  }
  const delivery = await EventDelivery.findOneAndUpdate(
    {
      event_id: event.event_id,
      handler: handler.name,
      status: { $in: ['PENDING', 'RETRY', 'FAILED', 'PROCESSING'] },
      available_at: { $lte: now },
      $or: [
        { lease_expires_at: null },
        { lease_expires_at: { $lte: now } },
        { lease_owner: owner }
      ]
    },
    {
      $set: {
        status: 'PROCESSING',
        lease_owner: owner,
        lease_expires_at: new Date(Date.now() + STALE_LOCK_MS),
        last_error: '',
        last_error_class: ''
      },
      $inc: { attempts: 1 }
    },
    { returnDocument: 'after' }
  );
  if (!delivery) {
    const current = await EventDelivery.findOne({
      event_id: event.event_id,
      handler: handler.name
    }).lean();
    if (current?.status === 'DELIVERED') return { duplicated: true };
    return { duplicated: false, deferred: true };
  }

  try {
    await handler.run(event);
    delivery.status = 'DELIVERED';
    delivery.delivered_at = new Date();
    delivery.lease_owner = null;
    delivery.lease_expires_at = null;
    delivery.last_error = '';
    await delivery.save();
    return { duplicated: false };
  } catch (error) {
    const dead = Number(delivery.attempts || 0) >= MAX_ATTEMPTS;
    delivery.status = dead ? 'DEAD' : 'RETRY';
    delivery.available_at = new Date(
      Date.now() + Math.min(60_000, 1000 * 2 ** Number(delivery.attempts || 1))
    );
    delivery.lease_owner = null;
    delivery.lease_expires_at = null;
    delivery.dead_lettered_at = dead ? new Date() : null;
    delivery.last_error = String(error.message || error).slice(0, 1000);
    delivery.last_error_class = String(error.name || 'Error').slice(0, 120);
    await delivery.save();
    return { failed: true, dead, error };
  }
}

async function processEvent(event, owner = `event-worker:${process.pid}`) {
  const subscribers = handlers.get(event.type) || [];
  const results = missingRequiredHandlers(event.type).map((handlerName) => {
    const error = Object.assign(
      new Error(`Thiếu handler bắt buộc ${handlerName} cho event ${event.type}.`),
      {
        code: 'EVENT_HANDLER_MISSING',
        event_type: event.type,
        handler: handlerName
      }
    );
    return { failed: true, dead: false, error };
  });
  for (const handler of subscribers) {
    results.push(await deliverToHandler(event, handler, owner));
  }
  const failed = results.filter((result) => result.failed || result.deferred);
  if (!failed.length) {
    event.status = 'COMPLETED';
    event.processed_at = new Date();
    event.locked_at = null;
    event.lease_owner = null;
    event.lease_expires_at = null;
    event.last_error = '';
    await event.save();
  } else {
    const attempts = Number(event.attempts || 0);
    const allDead = failed.every((result) => result.dead);
    event.status = allDead || attempts >= MAX_ATTEMPTS ? 'DEAD' : 'RETRY';
    event.available_at = new Date(Date.now() + Math.min(60_000, 1000 * 2 ** attempts));
    event.locked_at = null;
    event.lease_owner = null;
    event.lease_expires_at = null;
    event.dead_lettered_at = event.status === 'DEAD' ? new Date() : null;
    const error = failed.find((result) => result.error)?.error;
    event.last_error = String(error?.message || 'Handler đang chờ retry').slice(0, 1000);
    event.last_error_class = String(error?.name || 'DeliveryError').slice(0, 120);
    await event.save();
  }
  return event;
}

async function processPending(limit = 20, owner = `event-worker:${process.pid}`) {
  let processed = 0;
  while (processed < Math.min(Number(limit) || 20, 100)) {
    const event = await claimNextEvent(owner);
    if (!event) break;
    await processEvent(event, owner);
    processed += 1;
  }
  return { processed };
}

async function replayDeadEvent(eventId, actor = {}) {
  const event = await DomainEvent.findOneAndUpdate(
    { event_id: eventId, status: 'DEAD' },
    {
      $set: {
        status: 'PENDING',
        available_at: new Date(),
        dead_lettered_at: null,
        last_error: '',
        last_error_class: '',
        lease_owner: null,
        lease_expires_at: null
      },
      $inc: { replay_count: 1 },
      $push: {
        replay_history: {
          actor_id: actor.actor_id || null,
          reason: String(actor.reason || '').slice(0, 500),
          at: new Date()
        }
      }
    },
    { returnDocument: 'after' }
  );
  if (!event) return null;
  await EventDelivery.updateMany(
    { event_id: eventId, status: 'DEAD' },
    {
      $set: {
        status: 'RETRY',
        available_at: new Date(),
        dead_lettered_at: null,
        lease_owner: null,
        lease_expires_at: null
      },
      $inc: { replay_count: 1 }
    }
  );
  return event;
}

async function withOutboxTransaction(work, options = {}) {
  const session = options.session || await mongoose.startSession();
  const ownsSession = !options.session;
  try {
    let result;
    if (options.session) return work(session);
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    if (ownsSession) await session.endSession();
  }
}

function resetSubscribersForTests() {
  handlers.clear();
}

module.exports = {
  publish,
  subscribe,
  processPending,
  processEvent,
  validatePayload,
  redactPayload,
  replayDeadEvent,
  withOutboxTransaction,
  missingRequiredHandlers,
  assertRequiredHandlersRegistered,
  resetSubscribersForTests
};
