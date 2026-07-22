const WebhookInbox = require('../models/WebhookInbox');
const ProviderTransaction = require('../models/ProviderTransaction');

function toDto(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

function createWebhookRepository(deps = {}) {
  const Inbox = deps.WebhookInbox || WebhookInbox;
  const Provider = deps.ProviderTransaction || ProviderTransaction;
  const session = deps.session || null;

  return {
    async createInbox(input) {
      const created = session
        ? await Inbox.create([input], { session })
        : await Inbox.create(input);
      return toDto(Array.isArray(created) ? created[0] : created);
    },

    async findInboxByProviderEvent(provider, eventKey) {
      let query = Inbox.findOne({ provider, event_key: eventKey });
      if (session && typeof query.session === 'function') query = query.session(session);
      if (typeof query.lean === 'function') query = query.lean();
      return toDto(await query);
    },

    async claimInbox(inboxId, owner, now = new Date()) {
      const legacyStaleBefore = new Date(now.getTime() - 5 * 60 * 1000);
      const query = Inbox.findOneAndUpdate(
        {
          _id: inboxId,
          $or: [
            { process_status: { $in: ['RECEIVED', 'FAILED'] } },
            {
              process_status: 'PROCESSING',
              lease_expires_at: { $lte: now }
            },
            {
              process_status: 'PROCESSING',
              lease_expires_at: null,
              processing_started_at: { $lte: legacyStaleBefore }
            }
          ]
        },
        {
          $set: {
            process_status: 'PROCESSING',
            processing_started_at: new Date(),
            lease_owner: owner,
            lease_expires_at: new Date(Date.now() + 5 * 60 * 1000),
            last_error: ''
          },
          $inc: { attempts: 1 }
        },
        { returnDocument: 'after', ...(session ? { session } : {}) }
      );
      return toDto(await (typeof query.lean === 'function' ? query.lean() : query));
    },

    async findInboxById(inboxId) {
      let query = Inbox.findById(inboxId);
      if (session && typeof query.session === 'function') query = query.session(session);
      if (typeof query.lean === 'function') query = query.lean();
      return toDto(await query);
    },

    async markInboxProcessed(inboxId) {
      return Inbox.updateOne(
        { _id: inboxId },
        {
          $set: {
            process_status: 'PROCESSED',
            processed_at: new Date(),
            last_error: '',
            lease_owner: null,
            lease_expires_at: null
          }
        },
        session ? { session } : undefined
      );
    },

    async markInboxFailed(inboxId, error) {
      return Inbox.updateOne(
        { _id: inboxId },
        {
          $set: {
            process_status: 'FAILED',
            last_error: String(error?.message || error).slice(0, 1000),
            lease_owner: null,
            lease_expires_at: null
          }
        },
        session ? { session } : undefined
      );
    },

    async createProviderTransaction(input) {
      const created = session
        ? await Provider.create([input], { session })
        : await Provider.create(input);
      return toDto(Array.isArray(created) ? created[0] : created);
    },

    async findProviderTransaction(provider, providerRef, businessFingerprint = '') {
      let query = Provider.findOne({
        provider,
        $or: [
          { provider_ref: providerRef },
          ...(businessFingerprint
            ? [{ business_fingerprint: businessFingerprint }]
            : [])
        ]
      });
      if (session && typeof query.session === 'function') query = query.session(session);
      if (typeof query.lean === 'function') query = query.lean();
      return toDto(await query);
    }
  };
}

module.exports = { createWebhookRepository };
