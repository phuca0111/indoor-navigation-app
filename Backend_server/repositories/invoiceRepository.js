const Invoice = require('../models/Invoice');

function toDto(value) {
  if (!value) return null;
  return typeof value.toObject === 'function' ? value.toObject() : value;
}

function withSession(query, session) {
  return session ? query.session(session) : query;
}

async function findById(invoiceId, { session } = {}) {
  const query = Invoice.findById(invoiceId).lean();
  return withSession(query, session);
}

async function findByBillingEvent(billingEventId, { session } = {}) {
  if (!billingEventId) return null;
  const query = Invoice.findOne({ billing_event_id: billingEventId }).lean();
  return withSession(query, session);
}

async function findByOrganizationIdempotency(
  organizationId,
  idempotencyKey,
  { session } = {}
) {
  const query = Invoice.findOne({
    organization_id: organizationId,
    idempotency_key: idempotencyKey
  }).lean();
  return withSession(query, session);
}

async function findByTransactionReference(reference, { session } = {}) {
  if (!reference) return null;
  const query = Invoice.findOne({
    $or: [
      { invoice_number: reference },
      { idempotency_key: reference },
      { external_ref: reference }
    ]
  }).lean();
  return withSession(query, session);
}

async function createInvoice(input, { session } = {}) {
  const [created] = await Invoice.create([input], session ? { session } : undefined);
  return toDto(created);
}

async function updateInvoice(invoiceId, changes, { session } = {}) {
  return Invoice.findByIdAndUpdate(
    invoiceId,
    { $set: changes },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

async function claimPayment(invoiceId, claimKey, staleBefore, { session } = {}) {
  return Invoice.findOneAndUpdate(
    {
      _id: invoiceId,
      status: 'OPEN',
      $or: [
        { 'metadata.payment_claim_key': { $exists: false } },
        { 'metadata.payment_claim_key': '' },
        {
          'metadata.payment_claim_key': claimKey,
          'metadata.payment_claimed_at': { $lt: staleBefore }
        }
      ]
    },
    {
      $set: {
        'metadata.payment_claim_key': claimKey,
        'metadata.payment_claimed_at': new Date()
      }
    },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

async function releasePaymentClaim(invoiceId, claimKey, { session } = {}) {
  return Invoice.updateOne(
    {
      _id: invoiceId,
      status: 'OPEN',
      'metadata.payment_claim_key': claimKey
    },
    {
      $unset: {
        'metadata.payment_claim_key': '',
        'metadata.payment_claimed_at': ''
      }
    },
    session ? { session } : undefined
  );
}

async function claimPaymentNotification(invoiceId, staleBefore, { session } = {}) {
  return Invoice.findOneAndUpdate(
    {
      _id: invoiceId,
      'metadata.payment_email_notified_at': { $exists: false },
      $or: [
        { 'metadata.payment_email_claimed_at': { $exists: false } },
        { 'metadata.payment_email_claimed_at': { $lt: staleBefore } }
      ]
    },
    { $set: { 'metadata.payment_email_claimed_at': new Date() } },
    { returnDocument: 'after', ...(session ? { session } : {}) }
  ).lean();
}

async function completePaymentNotification(invoiceId, sent, { session } = {}) {
  const update = {
    $unset: { 'metadata.payment_email_claimed_at': '' }
  };
  if (sent) update.$set = { 'metadata.payment_email_notified_at': new Date() };
  return Invoice.updateOne(
    { _id: invoiceId },
    update,
    session ? { session } : undefined
  );
}

async function existsLaterPaidInvoice({
  organizationId,
  excludedInvoiceId,
  paidAfter,
  session
}) {
  const query = Invoice.exists({
    organization_id: organizationId,
    status: 'PAID',
    _id: { $ne: excludedInvoiceId },
    paid_at: { $gt: paidAfter }
  });
  return withSession(query, session);
}

async function listInvoices({ status, organizationId, limit = 100 } = {}) {
  const filter = {};
  if (status) filter.status = String(status).toUpperCase();
  if (organizationId) filter.organization_id = organizationId;
  return Invoice.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 100, 500))
    .populate('organization_id', 'name slug plan')
    .lean();
}

async function listRecentForOrganization(organizationId, limit = 20) {
  return Invoice.find({ organization_id: organizationId })
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 20, 100))
    .lean();
}

async function listPersonalForUser(userId, limit = 30) {
  const uid = String(userId || '');
  if (!uid) return [];
  return Invoice.find({
    status: { $in: ['PAID', 'OPEN', 'VOID'] },
    $or: [
      { 'metadata.user_id': uid },
      { 'metadata.user_id': userId },
      { created_by: userId, organization_id: null }
    ]
  })
    .sort({ paid_at: -1, createdAt: -1 })
    .limit(Math.min(Number(limit) || 30, 100))
    .select('invoice_number status plan amount currency paid_at createdAt note metadata')
    .lean();
}

module.exports = {
  findById,
  findByBillingEvent,
  findByOrganizationIdempotency,
  findByTransactionReference,
  createInvoice,
  updateInvoice,
  claimPayment,
  releasePaymentClaim,
  claimPaymentNotification,
  completePaymentNotification,
  existsLaterPaidInvoice,
  listInvoices,
  listRecentForOrganization,
  listPersonalForUser
};
